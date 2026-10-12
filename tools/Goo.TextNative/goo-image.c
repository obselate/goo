#ifndef _GNU_SOURCE
#define _GNU_SOURCE
#endif
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

unsigned char *goo_image_decode_rgba(const unsigned char *data, int length, int *width, int *height)
{
  int channels;
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
