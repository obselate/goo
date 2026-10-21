#define _GNU_SOURCE
#include <assert.h>
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <stdbool.h>
#include <stdint.h>
#include <time.h>
#include <unistd.h>

typedef int64_t Sint64;
typedef uint64_t Uint64;
typedef struct { int unused; } SDL_Window;
typedef struct { Uint64 sdl_press_time_ns, next_repeat_ns; } Repeat;
typedef struct { struct { Repeat repeat; } keyboard; } SDL_WaylandSeat;
typedef struct { int display_fd; int wakeup_pipe[2]; int seat_list; void *display; } SDL_VideoData;
typedef struct { SDL_VideoData *internal; } SDL_VideoDevice;
#define SDL_NS_PER_MS 1000000LL
#define SDL_MS_TO_NS(x) ((x) * SDL_NS_PER_MS)
#define SDL_NS_TO_MS(x) ((x) / SDL_NS_PER_MS)
#define SDL_NS_TO_SECONDS(x) ((x) / 1000000000LL)
#define SDL_SECONDS_TO_NS(x) ((x) * 1000000000LL)
#define wl_list_for_each(seat, list, link) for (seat = NULL; seat; seat = NULL)
static bool prepared;
static bool blocked_flush;
static int reads;
static int cancels;

static Uint64 SDL_GetTicksNS(void)
{
    struct timespec now;
    clock_gettime(CLOCK_MONOTONIC, &now);
    return (Uint64)now.tv_sec * 1000000000ULL + now.tv_nsec;
}

static bool keyboard_repeat_is_set(Repeat *repeat) { return false; }
static int WAYLAND_wl_display_get_fd(void *display) { return *(int *)display; }
static int WAYLAND_wl_display_prepare_read(void *display)
{
    assert(!prepared);
    prepared = true;
    return 0;
}
static int WAYLAND_wl_display_flush(void *display)
{
    if (blocked_flush) {
        errno = EAGAIN;
        return -1;
    }
    return 0;
}
static void WAYLAND_wl_display_cancel_read(void *display)
{
    assert(prepared);
    prepared = false;
    ++cancels;
}
static int WAYLAND_wl_display_read_events(void *display)
{
    assert(prepared);
    prepared = false;
    ++reads;
    return 0;
}

__WAYLAND_SENDWAKEUPEVENT__
__WAYLAND_WAITFORWAKEUP__
__WAYLAND_WAITEVENTTIMEOUT__

int main(void)
{
    SDL_VideoData data = {0};
    SDL_VideoDevice device = {&data};
    int display_pipe[2];
    char value = 1;
    assert(pipe2(display_pipe, O_CLOEXEC | O_NONBLOCK) == 0);
    assert(pipe2(data.wakeup_pipe, O_CLOEXEC | O_NONBLOCK) == 0);
    data.display_fd = display_pipe[0];
    data.display = &data.display_fd;
    for (int i = 0; i < 100; ++i) {
        Wayland_SendWakeupEvent(&device, NULL);
    }
    assert(Wayland_WaitEventTimeout(&device, SDL_MS_TO_NS(250)) == 1);
    assert(cancels == 1 && reads == 0 && !prepared);
    assert(read(data.wakeup_pipe[0], &value, 1) == -1 && errno == EAGAIN);
    assert(Wayland_WaitEventTimeout(&device, SDL_MS_TO_NS(1)) == 0);
    assert(cancels == 2 && reads == 0 && !prepared);
    assert(write(display_pipe[1], &value, 1) == 1);
    assert(Wayland_WaitEventTimeout(&device, SDL_MS_TO_NS(250)) == 1);
    assert(cancels == 2 && reads == 1 && !prepared);
    Wayland_SendWakeupEvent(&device, NULL);
    assert(Wayland_WaitEventTimeout(&device, SDL_MS_TO_NS(250)) == 1);
    assert(cancels == 3 && reads == 1 && !prepared);
    assert(read(display_pipe[0], &value, 1) == 1);
    blocked_flush = true;
    Wayland_SendWakeupEvent(&device, NULL);
    assert(Wayland_WaitEventTimeout(&device, SDL_MS_TO_NS(250)) == 1);
    assert(cancels == 4 && reads == 1 && !prepared);
    close(display_pipe[0]);
    close(display_pipe[1]);
    close(data.wakeup_pipe[0]);
    close(data.wakeup_pipe[1]);
    return 0;
}
