/* Minimal native call doubles; tests compile the actual pinned SDL handlers. */
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>
#include <stdio.h>
typedef uint64_t Uint64;
typedef uint32_t Uint32;
typedef struct { int x, y; } SDL_Point;
typedef struct { unsigned id, flags; bool hit_test; } SDL_Window;
typedef struct { unsigned double_click_time; int double_click_radius; } SDL_Mouse;
struct xdg_surface { int unused; };
typedef struct {
    SDL_Window *sdlwindow;
    int hit_test_result, shell_surface_type, shell_surface_status;
    bool resizing, pending_config_ack;
    struct { struct { unsigned serial; struct { void *xdg_toplevel; } toplevel; } xdg; } shell_surface;
} SDL_WindowData;
typedef struct {
    struct {
        bool locked_pointer;
        SDL_WindowData *focus;
        unsigned titlebar_click_window;
        Uint64 titlebar_click_timestamp;
        SDL_Point last_motion, titlebar_click_position;
    } pointer;
    void *wl_seat;
} SDL_WaylandSeat;
enum { SDL_HITTEST_NORMAL, SDL_HITTEST_DRAGGABLE, SDL_HITTEST_RESIZE_TOPLEFT,
    SDL_HITTEST_RESIZE_TOP, SDL_HITTEST_RESIZE_TOPRIGHT, SDL_HITTEST_RESIZE_RIGHT,
    SDL_HITTEST_RESIZE_BOTTOMRIGHT, SDL_HITTEST_RESIZE_BOTTOM,
    SDL_HITTEST_RESIZE_BOTTOMLEFT, SDL_HITTEST_RESIZE_LEFT };
enum { XDG_TOPLEVEL_RESIZE_EDGE_TOP_LEFT, XDG_TOPLEVEL_RESIZE_EDGE_TOP,
    XDG_TOPLEVEL_RESIZE_EDGE_TOP_RIGHT, XDG_TOPLEVEL_RESIZE_EDGE_RIGHT,
    XDG_TOPLEVEL_RESIZE_EDGE_BOTTOM_RIGHT, XDG_TOPLEVEL_RESIZE_EDGE_BOTTOM,
    XDG_TOPLEVEL_RESIZE_EDGE_BOTTOM_LEFT, XDG_TOPLEVEL_RESIZE_EDGE_LEFT };
enum { SDL_WINDOW_RESIZABLE = 1, SDL_WINDOW_MAXIMIZED = 2, SDL_WINDOW_FULLSCREEN = 4,
    WAYLAND_SHELL_SURFACE_TYPE_XDG_TOPLEVEL = 10,
    WAYLAND_SHELL_SURFACE_STATUS_WAITING_FOR_CONFIGURE = 11,
    WAYLAND_SHELL_SURFACE_STATUS_WAITING_FOR_FRAME = 12, SDL_EVENT_WINDOW_EXPOSED = 13 };
#define SDL_MS_TO_NS(ms) ((Uint64)(ms) * 1000000)
#define SDL_abs abs
static SDL_Mouse mouse = { 500, 8 };
static int moves, resizes, maximizes, restores, exposes, geometries, acks;
static SDL_Mouse *SDL_GetMouse(void) { return &mouse; }
static void SDL_MaximizeWindow(SDL_Window *w) { ++maximizes; w->flags |= SDL_WINDOW_MAXIMIZED; }
static void SDL_RestoreWindow(SDL_Window *w) { ++restores; w->flags &= ~SDL_WINDOW_MAXIMIZED; }
static void xdg_toplevel_move(void *w, void *s, unsigned serial) { (void)w; (void)s; (void)serial; ++moves; }
static void xdg_toplevel_resize(void *w, void *s, unsigned serial, unsigned edge) { (void)w; (void)s; (void)serial; (void)edge; ++resizes; }
static void ConfigureWindowGeometry(SDL_Window *w) { (void)w; ++geometries; }
static void xdg_surface_ack_configure(struct xdg_surface *s, unsigned serial) { (void)s; (void)serial; ++acks; }
static void SDL_SendWindowEvent(SDL_Window *w, int event, int x, int y) { (void)w; (void)x; (void)y; assert(event == SDL_EVENT_WINDOW_EXPOSED); ++exposes; }

/* PATCHED_HANDLERS */

int main(void)
{
    SDL_Window window = { .id = 1, .flags = SDL_WINDOW_RESIZABLE, .hit_test = true };
    SDL_WindowData data = { .sdlwindow = &window, .hit_test_result = SDL_HITTEST_DRAGGABLE,
        .shell_surface_type = WAYLAND_SHELL_SURFACE_TYPE_XDG_TOPLEVEL };
    data.shell_surface.xdg.toplevel.xdg_toplevel = &window;
    SDL_WaylandSeat seat = { .pointer.focus = &data, .pointer.last_motion = { 100, 20 } };
    assert(Wayland_ProcessHitTest(&seat, 1, SDL_MS_TO_NS(1000), true));
    assert(moves == 1 && maximizes == 0);
    assert(Wayland_ProcessHitTest(&seat, 2, SDL_MS_TO_NS(1050), false));
    assert(moves == 1); /* release cannot start a new move */
    assert(Wayland_ProcessHitTest(&seat, 3, SDL_MS_TO_NS(1100), true));
    assert(maximizes == 1 && moves == 1);
    Wayland_ProcessHitTest(&seat, 4, SDL_MS_TO_NS(1150), true);
    assert(restores == 0); /* third click starts a fresh pair */
    Wayland_ProcessHitTest(&seat, 5, SDL_MS_TO_NS(1250), true);
    assert(restores == 1);
    Wayland_ProcessHitTest(&seat, 6, SDL_MS_TO_NS(2000), true);
    Wayland_ProcessHitTest(&seat, 7, SDL_MS_TO_NS(2600), true);
    assert(maximizes == 1); /* slow clicks */
    seat.pointer.last_motion.x += 20;
    Wayland_ProcessHitTest(&seat, 8, SDL_MS_TO_NS(2700), true);
    assert(maximizes == 1); /* distant clicks */
    data.hit_test_result = SDL_HITTEST_NORMAL;
    assert(!Wayland_ProcessHitTest(&seat, 9, SDL_MS_TO_NS(2750), true));
    data.hit_test_result = SDL_HITTEST_DRAGGABLE;
    Wayland_ProcessHitTest(&seat, 10, SDL_MS_TO_NS(2800), true);
    assert(maximizes == 1); /* client content interrupts the pair */
    window.id = 2;
    Wayland_ProcessHitTest(&seat, 11, SDL_MS_TO_NS(2850), true);
    assert(maximizes == 1); /* pairs cannot cross windows */
    window.flags = 0;
    Wayland_ProcessHitTest(&seat, 12, SDL_MS_TO_NS(2900), true);
    assert(maximizes == 1); /* fixed-size windows */
    window.flags = SDL_WINDOW_RESIZABLE | SDL_WINDOW_FULLSCREEN;
    Wayland_ProcessHitTest(&seat, 13, SDL_MS_TO_NS(3000), true);
    Wayland_ProcessHitTest(&seat, 14, SDL_MS_TO_NS(3100), true);
    assert(maximizes == 1 && restores == 1);
    for (int edge = SDL_HITTEST_RESIZE_TOPLEFT; edge <= SDL_HITTEST_RESIZE_LEFT; ++edge) {
        data.hit_test_result = edge;
        Wayland_ProcessHitTest(&seat, 15, SDL_MS_TO_NS(3200), true);
        Wayland_ProcessHitTest(&seat, 16, SDL_MS_TO_NS(3250), false);
    }
    assert(resizes == 8);
    seat.pointer.locked_pointer = true;
    assert(!Wayland_ProcessHitTest(&seat, 17, SDL_MS_TO_NS(3300), true));
    assert(resizes == 8);

    struct xdg_surface surface = {0};
    data.resizing = true;
    handle_xdg_surface_configure(&data, &surface, 100);
    assert(exposes == 1 && data.pending_config_ack && acks == 0);
    handle_xdg_surface_configure(&data, &surface, 101);
    assert(exposes == 1 && data.shell_surface.xdg.serial == 101); /* coalesce until frame */
    data.pending_config_ack = false; /* frame callback consumed the previous configure */
    handle_xdg_surface_configure(&data, &surface, 102);
    assert(exposes == 2); /* each resize frame wakes an idle app */
    data.resizing = false;
    handle_xdg_surface_configure(&data, &surface, 103);
    assert(!data.pending_config_ack && acks == 1 && geometries == 1);
    puts("SDL Wayland titlebar and resize regression checks passed");
}
