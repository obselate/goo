#include <assert.h>
#include <stdbool.h>
#include <stddef.h>

typedef struct SDL_Cursor { int unused; } SDL_Cursor;
typedef struct SDL_WaylandCursorState { int unused; } SDL_WaylandCursorState;
typedef struct SDL_Window { void *internal; } SDL_Window;
typedef struct SDL_Mouse { SDL_Window *focus; SDL_Cursor *cur_cursor; } SDL_Mouse;
typedef struct Wayland_PointerObject {
    void *wl_pointer;
    void *wl_tool;
    bool is_pointer;
} Wayland_PointerObject;
typedef struct SDL_WaylandPenTool {
    void *wltool;
    void *focus;
    unsigned proximity_serial;
    SDL_WaylandCursorState cursor_state;
    struct SDL_WaylandPenTool *next;
} SDL_WaylandPenTool;
typedef struct SDL_WaylandSeat {
    struct {
        void *wl_pointer;
        void *focus;
        unsigned enter_serial;
        SDL_WaylandCursorState cursor_state;
    } pointer;
    struct { struct { SDL_WaylandPenTool *first; } tool_list; } tablet;
    struct SDL_WaylandSeat *next;
} SDL_WaylandSeat;
typedef struct SDL_VideoData { struct { SDL_WaylandSeat *first; } seat_list; } SDL_VideoData;
typedef struct SDL_VideoDevice { SDL_VideoData *internal; } SDL_VideoDevice;

#define wl_list_for_each(pos, head, link) for ((pos) = (head)->first; (pos) != NULL; (pos) = (pos)->next)

static SDL_VideoData video_data;
static SDL_VideoDevice video_device = { &video_data };
static SDL_Mouse mouse;
static int pointer_calls;
static int tablet_calls;

static SDL_VideoDevice *SDL_GetVideoDevice(void) { return &video_device; }
static SDL_Mouse *SDL_GetMouse(void) { return &mouse; }
static void Wayland_CursorStateSetCursor(SDL_WaylandCursorState *state,
    Wayland_PointerObject *object, void *focus, unsigned serial, SDL_Cursor *cursor)
{
    (void)state;
    (void)focus;
    (void)serial;
    (void)cursor;
    if (object->is_pointer) {
        assert(object->wl_pointer != NULL);
        ++pointer_calls;
    } else {
        assert(object->wl_tool != NULL);
        ++tablet_calls;
    }
}

__WAYLAND_SHOW_CURSOR__

int main(void)
{
    SDL_WaylandSeat seat = { 0 };
    video_data.seat_list.first = &seat;
    assert(Wayland_ShowCursor(NULL));
    assert(pointer_calls == 0 && tablet_calls == 0);

    seat.pointer.wl_pointer = &seat;
    assert(Wayland_ShowCursor(NULL));
    assert(pointer_calls == 1 && tablet_calls == 0);

    seat.pointer.wl_pointer = NULL;
    SDL_WaylandPenTool tool = { 0 };
    tool.wltool = &tool;
    seat.tablet.tool_list.first = &tool;
    assert(Wayland_ShowCursor(NULL));
    assert(pointer_calls == 1 && tablet_calls == 1);
    return 0;
}
