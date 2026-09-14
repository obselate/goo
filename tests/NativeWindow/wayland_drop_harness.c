#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#define SDL_USE_LIBDBUS 1
#define FILE_PORTAL_MIME "application/vnd.portal.filetransfer"
#define FILE_MIME "text/uri-list"
#define SDL_LogTrace(...) ((void)0)
#define WL_DATA_DEVICE_MANAGER_DND_ACTION_NONE 0
#define WL_DATA_DEVICE_MANAGER_DND_ACTION_COPY 1
#define WL_DATA_OFFER_SET_ACTIONS_SINCE_VERSION 3

typedef int32_t wl_fixed_t;
struct wl_data_device { int unused; };
struct wl_surface { int unused; };
struct wl_data_offer { const char **mimes; struct wl_data_offer *offer; };
typedef struct { int unused; } SDL_Window;
typedef struct { SDL_Window *sdlwindow; } SDL_WindowData;
typedef struct {
    bool has_mime_file, has_mime_text;
    uint32_t drag_serial;
    struct wl_data_offer *drag_offer;
    const char *mime_type;
    SDL_Window *dnd_window;
} SDL_WaylandDataDevice;
static const char *accepted;
static uint32_t selected_action;
static int positions;
static SDL_Window window;
static SDL_WindowData window_data = {&window};
static double wl_fixed_to_double(wl_fixed_t value) { return value / 256.0; }
static void *wl_data_offer_get_user_data(struct wl_data_offer *offer) { return offer; }
static bool Wayland_data_offer_has_mime(struct wl_data_offer *offer, const char *mime) {
    for (const char **candidate = offer->mimes; *candidate; candidate++) if (!strcmp(*candidate, mime)) return true;
    return false;
}
static void wl_data_offer_accept(struct wl_data_offer *offer, uint32_t serial, const char *mime) { accepted = mime; }
static void *SDL_GetVideoDevice(void) { return NULL; }
static const char **Wayland_GetTextMimeTypes(void *video, size_t *count) {
    static const char *mimes[] = {"text/plain;charset=utf-8", "text/plain", "TEXT", "UTF8_STRING", "STRING"};
    *count = sizeof(mimes) / sizeof(*mimes);
    return mimes;
}
static uint32_t wl_data_offer_get_version(struct wl_data_offer *offer) { return 3; }
static void wl_data_offer_set_actions(struct wl_data_offer *offer, uint32_t actions, uint32_t preferred) {
    assert(actions == preferred);
    selected_action = actions;
}
static SDL_WindowData *Wayland_GetWindowDataForOwnedSurface(struct wl_surface *surface) { return &window_data; }
static void SDL_SendDropPosition(SDL_Window *target, float x, float y) {
    assert(target == &window && x == 12.5f && y == 17.25f);
    positions++;
}
/* DROP_HANDLER */
int main(void) {
    struct wl_surface surface;
    const char *files[] = {"text/uri-list", "text/plain;charset=utf-8", "text/plain", NULL};
    const char *portal[] = {FILE_PORTAL_MIME, "text/plain", NULL};
    const char *plain[] = {"text/plain;charset=utf-8", NULL};
    const char *unsupported[] = {"application/octet-stream", NULL};
    const char **cases[] = {files, portal, plain, unsupported};
    const char *expected[] = {FILE_MIME, FILE_PORTAL_MIME, plain[0], NULL};
    for (size_t i = 0; i < 4; i++) {
        struct wl_data_offer offer = {cases[i], NULL};
        offer.offer = &offer;
        SDL_WaylandDataDevice device = {0};
        data_device_handle_enter(&device, NULL, 41, &surface, 3200, 4416, &offer);
        assert((!expected[i] && !accepted) || (accepted && expected[i] && !strcmp(accepted, expected[i])));
        assert(device.has_mime_file == (i < 2));
        assert(device.has_mime_text == (i == 2));
        assert(selected_action == (i == 3 ? 0u : 1u));
        assert(device.dnd_window == &window && device.drag_serial == 41);
    }
    assert(positions == 4);
    puts("Wayland native drop: URI/portal priority, plain text, rejection, position and copy negotiation passed");
}
