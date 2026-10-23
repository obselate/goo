#include "../Goo.TextNative/goo-image.c"
#include <stddef.h>
#include <stdint.h>
#include <limits.h>

int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size)
{
    if (size > 16 * 1024 * 1024)
        return 0;
    int width = 0;
    int height = 0;
    int channels;
    if (!stbi_info_from_memory(data, (int)size, &width, &height, &channels)
        || width <= 0 || height <= 0 || width > 8192 || height > 8192
        || (uint64_t)width * height * 4 > INT_MAX
        || (uint64_t)width * height * 4 > 64 * 1024 * 1024)
        return 0;
    unsigned char *pixels = goo_image_decode_rgba(data, (int)size, &width, &height);
    goo_image_free(pixels);
    return 0;
}
