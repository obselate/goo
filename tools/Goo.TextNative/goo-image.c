#ifndef _GNU_SOURCE
#define _GNU_SOURCE
#endif
#include <limits.h>
#include <stdlib.h>
#include <string.h>

#ifdef __GLIBC__
#include <sys/mman.h>

#define GOO_MAP_THRESHOLD ((size_t)128 * 1024)

typedef struct
{
  size_t size;
  size_t reserved;
} goo_block;

static void *goo_alloc(size_t size)
{
  size_t total = size + sizeof(goo_block);
  goo_block *block;
  if (total < size)
    return NULL;
  if (total < GOO_MAP_THRESHOLD)
    block = malloc(total);
  else
  {
    block = mmap(NULL, total, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    if (block == MAP_FAILED)
      return NULL;
  }
  if (!block)
    return NULL;
  block->size = total;
  return block + 1;
}

static void goo_free(void *memory)
{
  goo_block *block;
  if (!memory)
    return;
  block = (goo_block *)memory - 1;
  if (block->size < GOO_MAP_THRESHOLD)
    free(block);
  else
    munmap(block, block->size);
}

static void *goo_realloc(void *memory, size_t size)
{
  goo_block *block;
  size_t total = size + sizeof(goo_block);
  size_t previous;
  void *moved;
  if (!memory)
    return goo_alloc(size);
  if (total < size)
    return NULL;
  block = (goo_block *)memory - 1;
  previous = block->size;
  if (previous < GOO_MAP_THRESHOLD && total < GOO_MAP_THRESHOLD)
    block = realloc(block, total);
  else if (previous >= GOO_MAP_THRESHOLD && total >= GOO_MAP_THRESHOLD)
  {
    block = mremap(block, previous, total, MREMAP_MAYMOVE);
    if (block == MAP_FAILED)
      return NULL;
  }
  else
  {
    moved = goo_alloc(size);
    if (!moved)
      return NULL;
    memcpy(moved, memory, (previous < total ? previous : total) - sizeof(goo_block));
    goo_free(memory);
    return moved;
  }
  if (!block)
    return NULL;
  block->size = total;
  return block + 1;
}
#else
#define goo_alloc malloc
#define goo_realloc realloc
#define goo_free free
#endif

#define STBI_MALLOC(size) goo_alloc(size)
#define STBI_REALLOC(memory, size) goo_realloc(memory, size)
#define STBI_FREE(memory) goo_free(memory)
#define STB_IMAGE_IMPLEMENTATION
#define STB_IMAGE_STATIC
#define STBI_ONLY_JPEG
#define STBI_ONLY_PNG
#define STBI_ONLY_GIF
#define STBI_ONLY_BMP
#define STBI_NO_STDIO
#define STBI_NO_LINEAR
#define STBI_NO_THREAD_LOCALS
#include "stb_image.h"

#undef HAVE_CONFIG_H
#define WEBP_EXTERN extern
#include "src/webp/decode.h"
#include "src/utils/utils.h"

static int goo_is_webp(const unsigned char *data, int length)
{
  return length >= 12 && !memcmp(data, "RIFF", 4) && !memcmp(data + 8, "WEBP", 4);
}

int goo_image_get_info(const unsigned char *data, int length, int *width, int *height)
{
  int channels;
  if (goo_is_webp(data, length))
    return WebPGetInfo(data, length, width, height);
  return stbi_info_from_memory(data, length, width, height, &channels);
}

static unsigned char *goo_decode_webp(const unsigned char *data, int length, int *width, int *height)
{
  WebPBitstreamFeatures features;
  uint32_t riff_size = GetLE32(data + 4);
  if (riff_size < 4 || riff_size > (uint32_t)length - 8 ||
      WebPGetFeatures(data, riff_size + 8, &features) != VP8_STATUS_OK ||
      (uint64_t)features.width * features.height * 4 > INT_MAX)
    return NULL;

  const int stride = features.width * 4;
  const size_t size = (size_t)stride * features.height;
  size_t offset = 0;
  size_t frame_size = riff_size + 8;
  int partial_frame = 0;
  if (features.has_animation)
  {
    const unsigned char *chunk = data + 12;
    size_t remaining = riff_size - 4;
    int found_animation = 0;
    while (remaining >= 8)
    {
      uint32_t chunk_size = GetLE32(chunk + 4);
      if (chunk_size > remaining - 8 || (chunk_size & 1) > remaining - 8 - chunk_size)
        return NULL;
      if (!memcmp(chunk, "ANIM", 4))
      {
        if (found_animation || chunk_size != 6)
          return NULL;
        found_animation = 1;
      }
      if (!memcmp(chunk, "ANMF", 4))
        break;
      size_t span = 8 + chunk_size + (chunk_size & 1);
      chunk += span;
      remaining -= span;
    }
    if (!found_animation || remaining < 24 || GetLE32(chunk + 4) < 16)
      return NULL;
    const int x = 2 * GetLE24(chunk + 8);
    const int y = 2 * GetLE24(chunk + 11);
    const int frame_width = 1 + GetLE24(chunk + 14);
    const int frame_height = 1 + GetLE24(chunk + 17);
    data = chunk + 24;
    frame_size = GetLE32(chunk + 4) - 16;
    int decoded_width, decoded_height;
    if (frame_width > features.width - x || frame_height > features.height - y ||
        frame_size < 8 ||
        (memcmp(data, "VP8 ", 4) && memcmp(data, "VP8L", 4) && memcmp(data, "ALPH", 4)) ||
        !WebPGetInfo(data, frame_size, &decoded_width, &decoded_height) ||
        decoded_width != frame_width || decoded_height != frame_height)
      return NULL;
    offset = (size_t)y * stride + x * 4;
    partial_frame = frame_width != features.width || frame_height != features.height;
  }

  unsigned char *pixels = goo_alloc(size);
  if (!pixels)
    return NULL;
  if (partial_frame)
    memset(pixels, 0, size);
  if (!WebPDecodeRGBAInto(data, frame_size, pixels + offset, size - offset, stride))
  {
    goo_free(pixels);
    return NULL;
  }
  *width = features.width;
  *height = features.height;
  return pixels;
}

unsigned char *goo_image_decode_rgba(const unsigned char *data, int length, int *width, int *height)
{
  int channels;
  if (goo_is_webp(data, length))
    return goo_decode_webp(data, length, width, height);
  return stbi_load_from_memory(data, length, width, height, &channels, 4);
}

void *goo_image_realloc(void *memory, size_t size)
{
  return goo_realloc(memory, size);
}

void goo_image_free(void *memory)
{
  goo_free(memory);
}
