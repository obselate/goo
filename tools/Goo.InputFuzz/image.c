#include <stddef.h>
#include <stdint.h>
#include <limits.h>

unsigned char *goo_image_decode_rgba(const unsigned char *, int, int *, int *);
void goo_image_free(void *);

int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size)
{
    if (size > INT_MAX)
        return 0;
    int width = 0;
    int height = 0;
    unsigned char *pixels = goo_image_decode_rgba(data, (int)size, &width, &height);
    goo_image_free(pixels);
    return 0;
}
