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

void goo_image_free(unsigned char *pixels)
{
  stbi_image_free(pixels);
}
