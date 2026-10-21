#include <assert.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define SDL_MAX_SINT64 INT64_MAX
#define SDL_GETEVENT 0
#define SDL_EVENT_FIRST 0
#define SDL_EVENT_LAST 65535
#define SDL_min(a, b) ((a) < (b) ? (a) : (b))
typedef int64_t Sint64;
typedef uint64_t Uint64;
typedef struct { int unused; } SDL_Window;
typedef struct { int unused; } SDL_Event;
typedef struct SDL_VideoDevice SDL_VideoDevice;
struct SDL_VideoDevice {
    void *wakeup_window;
    int (*WaitEventTimeout)(SDL_VideoDevice *, Sint64);
};
static SDL_VideoDevice *device;
static int initial_status;
static bool inject_event;
static bool queued_event;
static bool wake_sent;
static int waits;
static Uint64 ticks;

static void SDL_SetAtomicPointer(void **address, void *value)
{
    *address = value;
}

static Sint64 SDL_events_get_polling_interval(void)
{
    return SDL_MAX_SINT64;
}

static void SDL_PumpEventsInternal(bool sentinel)
{
    (void)sentinel;
}

static Uint64 SDL_GetTicksNS(void)
{
    return ticks;
}

static int SDL_PeepEvents(SDL_Event *event, int count, int action, int first, int last)
{
    (void)event;
    (void)count;
    (void)action;
    (void)first;
    (void)last;
    if (queued_event) {
        queued_event = false;
        return 1;
    }
    if (inject_event) {
        inject_event = false;
        queued_event = true;
        wake_sent = device->wakeup_window != NULL;
        device->wakeup_window = NULL;
    }
    return initial_status;
}

static int wait_event(SDL_VideoDevice *self, Sint64 timeout)
{
    (void)self;
    (void)timeout;
    ++waits;
    return wake_sent ? 1 : 0;
}

__WAIT_FUNCTION__

int main(void)
{
    SDL_Window window = {0};
    SDL_Event event = {0};
    SDL_VideoDevice video = {NULL, wait_event};
    device = &video;
    inject_event = true;
    assert(SDL_WaitEventTimeout_Device(device, &window, &event, 0, 250) == 1);
    assert(wake_sent && waits == 1 && !queued_event);
    assert(device->wakeup_window == NULL);
    initial_status = -1;
    assert(SDL_WaitEventTimeout_Device(device, &window, &event, 0, 250) == 0);
    assert(device->wakeup_window == NULL);
    initial_status = 1;
    assert(SDL_WaitEventTimeout_Device(device, &window, &event, 0, 250) == 1);
    assert(device->wakeup_window == NULL);
    initial_status = 0;
    ticks = 250;
    assert(SDL_WaitEventTimeout_Device(device, &window, &event, 0, 250) == 0);
    assert(device->wakeup_window == NULL);
    assert(waits == 1);
    return 0;
}
