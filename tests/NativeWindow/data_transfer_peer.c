#define _GNU_SOURCE
#include <SDL3/SDL.h>
#include <assert.h>
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <unistd.h>
#include <wayland-client.h>

extern Uint32 SDLCALL Goo_GetDataTransferCapabilities(SDL_Window *);
extern int SDLCALL Goo_StartDataDrag(SDL_Window *, const char **, Uint32, Uint32, void *,
    void (SDLCALL *)(void *, const char *, int), void (SDLCALL *)(void *, int, Uint32, Uint8), void *);
extern Uint8 SDLCALL Goo_SetDataDropCallback(SDL_Window *, void *, void *, const char **, Uint32);
extern int SDLCALL Goo_ReceiveDataDrop(SDL_Window *, Uint64, const char *);
extern void SDLCALL Goo_FinishDataDrop(SDL_Window *, Uint64, Uint32);

static const char *types[] = { "text/plain;charset=utf-8", "image/png", "application/x-goo-transfer-check", "application/x-goo-empty" };
static const unsigned char png[] = {
    137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0,31,21,196,137,
    0,0,0,11,73,68,65,84,120,156,99,96,0,2,0,0,5,0,1,165,246,69,64,0,0,0,0,73,69,78,68,174,66,96,130
};
static const char text[] = "native MIME transfer";
static unsigned char binary[1048576];
static SDL_Window *window;
static struct wl_shm *shm;
static Uint32 effect = 1;
static Uint64 drop_token;
static bool source_mode;
static bool hover;
static struct { int fd; size_t offset, length; const unsigned char *data; } streams[4];

static const unsigned char *bytes(int index, size_t *length)
{
    *length = index == 0 ? sizeof(text) - 1 : index == 1 ? sizeof(png) : index == 2 ? sizeof(binary) : 0;
    return index == 0 ? (const unsigned char *)text : index == 1 ? png : binary;
}

static void registry_global(void *data, struct wl_registry *registry, uint32_t id, const char *interface, uint32_t version)
{
    if (!strcmp(interface, "wl_shm")) shm = wl_registry_bind(registry, id, &wl_shm_interface, 1);
}
static void registry_remove(void *data, struct wl_registry *registry, uint32_t id) { }

static void present(void)
{
    struct wl_display *display = SDL_GetPointerProperty(SDL_GetGlobalProperties(), SDL_PROP_GLOBAL_VIDEO_WAYLAND_WL_DISPLAY_POINTER, NULL);
    struct wl_registry *registry = wl_display_get_registry(display);
    const struct wl_registry_listener listener = { registry_global, registry_remove };
    wl_registry_add_listener(registry, &listener, NULL);
    assert(wl_display_roundtrip(display) >= 0 && shm);
    int width, height;
    assert(SDL_GetWindowSizeInPixels(window, &width, &height));
    int fd = memfd_create("goo-transfer-peer", MFD_CLOEXEC);
    size_t size = (size_t)width * height * 4;
    assert(fd >= 0 && ftruncate(fd, (off_t)size) == 0);
    unsigned char *pixels = mmap(NULL, size, PROT_WRITE, MAP_SHARED, fd, 0);
    assert(pixels != MAP_FAILED);
    memset(pixels, 180, size);
    struct wl_shm_pool *pool = wl_shm_create_pool(shm, fd, (int)size);
    struct wl_buffer *buffer = wl_shm_pool_create_buffer(pool, 0, width, height, width * 4, WL_SHM_FORMAT_XRGB8888);
    struct wl_surface *surface = SDL_GetPointerProperty(SDL_GetWindowProperties(window), SDL_PROP_WINDOW_WAYLAND_SURFACE_POINTER, NULL);
    wl_surface_attach(surface, buffer, 0, 0);
    wl_surface_damage_buffer(surface, 0, 0, width, height);
    wl_surface_commit(surface);
    assert(wl_display_roundtrip(display) >= 0);
    wl_shm_pool_destroy(pool);
    wl_buffer_destroy(buffer);
    wl_registry_destroy(registry);
    wl_shm_destroy(shm);
    munmap(pixels, size);
    close(fd);
}

static void SDLCALL sent(void *data, const char *type, int fd)
{
    for (int i = 0; i < 4; ++i) {
        if (strcmp(type, types[i])) continue;
        assert(streams[i].fd < 0);
        streams[i].fd = fd;
        streams[i].data = bytes(i, &streams[i].length);
        streams[i].offset = 0;
        return;
    }
    close(fd);
}

static void SDLCALL finished(void *data, int status, Uint32 selected, Uint8 removal)
{
    printf("source-end %d %u %u\n", status, selected, removal);
}

static Uint32 SDLCALL dropped(void *data, int kind, float x, float y, const char **offered,
    Uint32 count, Uint32 allowed, Uint64 token, void *source)
{
    if (kind == 2 || kind == 4 || !(allowed & effect)) { hover = false; return 0; }
    hover = true;
    printf("preview %d\n", kind);
    if (kind == 3) {
        assert(count == 4);
        drop_token = token;
        for (int i = 0; i < 4; ++i) {
            assert(!strcmp(offered[i], types[i]));
            streams[i].fd = Goo_ReceiveDataDrop(window, token, types[i]);
            assert(streams[i].fd >= 0);
            streams[i].data = bytes(i, &streams[i].length);
            streams[i].offset = 0;
        }
    }
    return effect;
}

int main(int argc, char **argv)
{
    assert(getenv("GOO_HEADLESS_WAYLAND") && !strcmp(getenv("GOO_HEADLESS_WAYLAND"), "1"));
    assert(argc == 3);
    setvbuf(stdin, NULL, _IONBF, 0);
    setvbuf(stdout, NULL, _IONBF, 0);
    source_mode = !strcmp(argv[1], "source");
    effect = (Uint32)atoi(argv[2]);
    assert(effect == 1 || effect == 2);
    for (size_t i = 0; i < sizeof(binary); ++i) binary[i] = (unsigned char)i;
    for (int i = 0; i < 4; ++i) streams[i].fd = -1;
    assert(SDL_Init(SDL_INIT_VIDEO));
    window = SDL_CreateWindow("Goo transfer peer", 240, 320, SDL_WINDOW_BORDERLESS);
    assert(window && Goo_GetDataTransferCapabilities(window) == 31);
    if (!source_mode) assert(Goo_SetDataDropCallback(window, dropped, NULL, types, 4));
    present();
    puts("ready");
    bool running = true;
    while (running) {
        SDL_Event event;
        while (SDL_PollEvent(&event)) {
            if (event.type == SDL_EVENT_MOUSE_BUTTON_DOWN) puts("pressed");
        }
        struct pollfd input = { STDIN_FILENO, POLLIN, 0 };
        if (poll(&input, 1, 0) > 0) {
            char command[64];
            unsigned serial;
            if (!fgets(command, sizeof(command), stdin) || !strcmp(command, "quit\n")) running = false;
            else if (!strcmp(command, "start\n")) printf("start %d\n", Goo_StartDataDrag(window, types, 4, 3, NULL, sent, finished, NULL));
            else if (sscanf(command, "hover %u", &serial) == 1) {
                if (hover) {
                    struct wl_display *display = SDL_GetPointerProperty(SDL_GetGlobalProperties(), SDL_PROP_GLOBAL_VIDEO_WAYLAND_WL_DISPLAY_POINTER, NULL);
                    assert(wl_display_roundtrip(display) >= 0);
                }
                printf("hover %u %d\n", serial, source_mode ? SDL_GetMouseFocus() == window : hover);
            }
            else assert(false);
        }
        bool complete = drop_token != 0;
        for (int i = 0; i < 4; ++i) {
            if (streams[i].fd < 0) continue;
            if (source_mode) {
                ssize_t n = write(streams[i].fd, streams[i].data + streams[i].offset, streams[i].length - streams[i].offset);
                if (n >= 0) streams[i].offset += (size_t)n;
                else assert(errno == EAGAIN || errno == EINTR);
                if (streams[i].offset == streams[i].length) { close(streams[i].fd); streams[i].fd = -1; }
            } else {
                unsigned char block[65536];
                ssize_t n = read(streams[i].fd, block, sizeof(block));
                if (n > 0) {
                    assert(streams[i].offset + (size_t)n <= streams[i].length);
                    assert(!memcmp(block, streams[i].data + streams[i].offset, (size_t)n));
                    streams[i].offset += (size_t)n;
                } else if (n == 0) {
                    assert(streams[i].offset == streams[i].length);
                    close(streams[i].fd); streams[i].fd = -1;
                } else assert(errno == EAGAIN || errno == EINTR);
                if (streams[i].fd >= 0) complete = false;
            }
        }
        if (complete) { Goo_FinishDataDrop(window, drop_token, effect); drop_token = 0; puts("drop-complete"); }
        SDL_Delay(1);
    }
    for (int i = 0; i < 4; ++i) if (streams[i].fd >= 0) close(streams[i].fd);
    SDL_DestroyWindow(window);
    SDL_Quit();
    return 0;
}
