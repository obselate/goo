#define _GNU_SOURCE
#include <SDL3/SDL.h>
#include <assert.h>
#include <dlfcn.h>
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/wait.h>
#include <unistd.h>
#include <wayland-client.h>

extern bool SDLCALL Goo_SetForeignParent(SDL_Window *, const char *, Uint8);
static struct wl_shm *shm;
static const char *handle_key = "Goo.ForeignParent.Handle.1";

static void registry_global(void *data, struct wl_registry *registry, uint32_t id,
                            const char *interface, uint32_t version)
{
    (void)data;
    (void)version;
    if (strcmp(interface, "wl_shm") == 0) {
        shm = wl_registry_bind(registry, id, &wl_shm_interface, 1);
    }
}

static void registry_remove(void *data, struct wl_registry *registry, uint32_t id)
{
    (void)data;
    (void)registry;
    (void)id;
}

static struct wl_display *display(void)
{
    return SDL_GetPointerProperty(SDL_GetGlobalProperties(), SDL_PROP_GLOBAL_VIDEO_WAYLAND_WL_DISPLAY_POINTER, NULL);
}

static void sync_display(void)
{
    assert(wl_display_roundtrip(display()) >= 0);
    SDL_PumpEvents();
}

static void present(SDL_Window *window)
{
    struct wl_registry *registry = wl_display_get_registry(display());
    static const struct wl_registry_listener listener = { registry_global, registry_remove };
    wl_registry_add_listener(registry, &listener, NULL);
    sync_display();
    assert(shm);
    char path[] = "/tmp/goo-foreign-parent-buffer-XXXXXX";
    int fd = mkstemp(path);
    assert(fd >= 0);
    unlink(path);
    int width, height;
    assert(SDL_GetWindowSizeInPixels(window, &width, &height));
    size_t size = (size_t)width * height * 4;
    assert(ftruncate(fd, (off_t)size) == 0);
    uint32_t *pixels = mmap(NULL, size, PROT_WRITE, MAP_SHARED, fd, 0);
    assert(pixels != MAP_FAILED);
    for (size_t i = 0; i < size / 4; ++i) {
        pixels[i] = 0xff334455;
    }
    struct wl_shm_pool *pool = wl_shm_create_pool(shm, fd, (int)size);
    struct wl_buffer *buffer = wl_shm_pool_create_buffer(pool, 0, width, height, width * 4, WL_SHM_FORMAT_XRGB8888);
    struct wl_surface *surface = SDL_GetPointerProperty(SDL_GetWindowProperties(window), SDL_PROP_WINDOW_WAYLAND_SURFACE_POINTER, NULL);
    wl_surface_attach(surface, buffer, 0, 0);
    wl_surface_damage_buffer(surface, 0, 0, width, height);
    wl_surface_commit(surface);
    sync_display();
    wl_shm_pool_destroy(pool);
    close(fd);
    munmap(pixels, size);
    wl_registry_destroy(registry);
    wl_shm_destroy(shm);
    shm = NULL;
    wl_buffer_destroy(buffer);
}

static void exported_parent(int output, int stop)
{
    assert(SDL_Init(SDL_INIT_VIDEO));
    SDL_Window *window = SDL_CreateWindow("Foreign parent E2E parent", 320, 200, SDL_WINDOW_BORDERLESS);
    assert(window);
    present(window);
    sync_display();
    const char *handle = SDL_GetStringProperty(SDL_GetWindowProperties(window), SDL_PROP_WINDOW_WAYLAND_XDG_TOPLEVEL_EXPORT_HANDLE_STRING, NULL);
    assert(handle);
    assert(dprintf(output, "%s\n", handle) > 0);
    close(output);
    assert(fcntl(stop, F_SETFL, O_NONBLOCK) == 0);
    char value;
    while (read(stop, &value, 1) < 0) {
        assert(errno == EAGAIN || errno == EINTR);
        SDL_PumpEvents();
        SDL_Delay(10);
    }
    SDL_DestroyWindow(window);
    SDL_Quit();
    close(stop);
    _exit(0);
}

int main(void)
{
    int handles[2], stop[2];
    assert(pipe(handles) == 0 && pipe(stop) == 0);
    pid_t parent = fork();
    assert(parent >= 0);
    if (!parent) {
        close(handles[0]);
        close(stop[1]);
        exported_parent(handles[1], stop[0]);
    }
    close(handles[1]);
    close(stop[0]);
    FILE *input = fdopen(handles[0], "r");
    assert(input);
    char handle[4097];
    assert(fgets(handle, sizeof(handle), input));
    handle[strcspn(handle, "\n")] = 0;
    fclose(input);
    assert(SDL_Init(SDL_INIT_VIDEO));
    SDL_Window *window = SDL_CreateWindow("Foreign parent E2E child", 240, 160, SDL_WINDOW_HIDDEN | SDL_WINDOW_BORDERLESS);
    assert(window);
    SDL_PropertiesID props = SDL_GetWindowProperties(window);
    assert(Goo_SetForeignParent(window, handle, 1));
    assert(SDL_GetWindowFlags(window) & SDL_WINDOW_HIDDEN);
    assert(SDL_ShowWindow(window));
    const char *expected_libdecor = getenv("SDL_VIDEO_WAYLAND_PREFER_LIBDECOR");
    if (expected_libdecor) {
        struct wl_proxy *xdg_surface = SDL_GetPointerProperty(props, SDL_PROP_WINDOW_WAYLAND_XDG_SURFACE_POINTER, NULL);
        Dl_info listener_owner;
        assert(xdg_surface && dladdr(wl_proxy_get_listener(xdg_surface), &listener_owner));
        bool using_libdecor = strstr(listener_owner.dli_fname, "libdecor") != NULL;
        assert(using_libdecor == (strcmp(expected_libdecor, "1") == 0));
    }
    present(window);
    assert(SDL_GetStringProperty(props, handle_key, NULL));
    assert(SDL_HideWindow(window));
    assert(SDL_GetStringProperty(props, handle_key, NULL));
    assert(SDL_ShowWindow(window));
    present(window);
    assert(SDL_GetStringProperty(props, handle_key, NULL));
    assert(Goo_SetForeignParent(window, handle, 0));
    assert(!SDL_GetBooleanProperty(props, "Goo.ForeignParent.Modal.1", true));
    assert(!Goo_SetForeignParent(window, "bad\nhandle", 1));
    assert(Goo_SetForeignParent(window, NULL, 0));
    assert(!SDL_GetStringProperty(props, handle_key, NULL));
    assert(Goo_SetForeignParent(window, "invalid-foreign-parent-e2e-handle", 1));
    sync_display();
    assert(!SDL_GetStringProperty(props, handle_key, NULL));
    assert(Goo_SetForeignParent(window, handle, 1));
    sync_display();
    assert(SDL_GetStringProperty(props, handle_key, NULL));
    assert(write(stop[1], "x", 1) == 1);
    close(stop[1]);
    int status;
    assert(waitpid(parent, &status, 0) == parent && WIFEXITED(status) && WEXITSTATUS(status) == 0);
    sync_display();
    assert(!SDL_GetStringProperty(props, handle_key, NULL));
    SDL_DestroyWindow(window);
    SDL_Quit();
    puts("Foreign parent Wayland E2E passed");
    return 0;
}
