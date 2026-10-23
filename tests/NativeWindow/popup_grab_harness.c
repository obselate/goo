#include <SDL3/SDL.h>
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include <wayland-client.h>

#define SDL_WINDOW_IS_POPUP(window) ((window)->parent != NULL)
struct SDL_Window {
    SDL_WindowID id;
    SDL_Window *parent;
    SDL_WindowFlags flags;
    SDL_PropertiesID properties;
    int w, h;
};
typedef struct SDL_WaylandSeat {
    struct wl_list link;
    struct wl_seat *wl_seat;
    Uint32 last_implicit_grab_serial;
} SDL_WaylandSeat;
typedef struct SDL_VideoData {
    struct wl_list seat_list;
} SDL_VideoData;
typedef struct SDL_VideoDevice {
    SDL_VideoData *internal;
} SDL_VideoDevice;
static SDL_VideoData display;
static SDL_VideoDevice device = { &display };
static SDL_VideoDevice *SDL_GetVideoDevice(void) { return &device; }
static const char *test_video_driver(void) { return "wayland"; }
static SDL_PropertiesID test_window_properties(SDL_Window *window) { return window->properties; }
#define SDL_GetCurrentVideoDriver test_video_driver
#define SDL_GetWindowProperties test_window_properties
struct xdg_popup { int version; };
static unsigned int xdg_popup_get_version(struct xdg_popup *popup) { return (unsigned int)popup->version; }
#define XDG_POPUP_REPOSITION_SINCE_VERSION 3
static struct wl_seat *grabbed_seat;
static Uint32 grabbed_serial;
static void xdg_popup_grab(struct xdg_popup *popup, struct wl_seat *seat, Uint32 serial)
{
    assert(popup);
    grabbed_seat = seat;
    grabbed_serial = serial;
}

PATCHED_HANDLERS

int main(void)
{
    wl_list_init(&display.seat_list);
    SDL_WaylandSeat first = { .wl_seat = (struct wl_seat *)1, .last_implicit_grab_serial = 17 };
    SDL_WaylandSeat second = { .wl_seat = (struct wl_seat *)2, .last_implicit_grab_serial = 23 };
    wl_list_insert(&display.seat_list, &first.link);
    wl_list_insert(&display.seat_list, &second.link);
    SDL_Window parent = { .id = 1, .w = 320, .h = 240, .properties = SDL_CreateProperties() };
    SDL_Window popup = { .id = 2, .parent = &parent, .w = 80, .h = 60, .flags = SDL_WINDOW_POPUP_MENU, .properties = SDL_CreateProperties() };
    SDL_Window child = { .id = 3, .parent = &popup, .w = 40, .h = 30, .flags = SDL_WINDOW_POPUP_MENU, .properties = SDL_CreateProperties() };
    struct xdg_popup native_popup = {0};
    assert(!Goo_ConfigurePopup(&parent, &popup, 0, 0, 0, 10, 10, 0));
    Goo_RecordPopupInput(&parent, &first, 100);
    Goo_RecordPopupInput(&parent, &second, 200);
    assert(Goo_ConfigurePopup(&parent, &popup, 100, 0, 0, 10, 10, 0));
    Goo_GrabPopup(&popup, &native_popup);
    assert(grabbed_seat == first.wl_seat && grabbed_serial == 17);
    assert(SDL_GetBooleanProperty(popup.properties, "Goo.Popup.Grabbed", false));
    assert(Goo_ConfigurePopup(&popup, &child, 0, 0, 0, 10, 10, 6));
    Goo_GrabPopup(&child, &native_popup);
    assert(grabbed_seat == first.wl_seat && grabbed_serial == 17);
    SDL_ClearProperty(popup.properties, "Goo.Popup.Grabbed");
    SDL_ClearProperty(child.properties, "Goo.Popup.Grabbed");
    assert(!Goo_ConfigurePopup(&popup, &child, 0, 0, 0, 10, 10, 6));
    assert(!Goo_ConfigurePopup(&parent, &popup, 999, 0, 0, 10, 10, 0));
    wl_list_remove(&first.link);
    assert(!Goo_ConfigurePopup(&parent, &popup, 100, 0, 0, 10, 10, 0));
    popup.flags = SDL_WINDOW_TOOLTIP;
    assert(Goo_ConfigurePopup(&parent, &popup, 0, 0, 0, 10, 10, 0));
    assert(!Goo_ConfigurePopup(&parent, &popup, 0, -1, 0, 10, 10, 0));
    assert(!Goo_ConfigurePopup(&parent, &popup, 0, 319, 0, 10, 10, 0));
    native_popup.version = 2;
    SDL_SetPointerProperty(popup.properties, SDL_PROP_WINDOW_WAYLAND_XDG_POPUP_POINTER, &native_popup);
    assert(!Goo_ConfigurePopup(&parent, &popup, 0, 0, 0, 10, 10, 0));
    native_popup.version = 3;
    assert(Goo_ConfigurePopup(&parent, &popup, 0, 0, 0, 10, 10, 0));
    SDL_DestroyProperties(child.properties);
    SDL_DestroyProperties(popup.properties);
    SDL_DestroyProperties(parent.properties);
    puts("PASS actual patched popup handlers preserve event seat/serial, nested grab, missing input and removed-seat results");
    return 0;
}
