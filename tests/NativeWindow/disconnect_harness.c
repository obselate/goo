#include <assert.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>

typedef struct { bool display_disconnected; } SDL_VideoData;
typedef struct { SDL_VideoData *internal; } SDL_VideoDevice;
typedef struct { unsigned type; unsigned timestamp; } SDL_Event;

#define SDL_LOG_CATEGORY_VIDEO 1
#define SDL_EVENT_TERMINATING 0x101
#define SDL_zero(value) memset(&(value), 0, sizeof(value))

static bool reconnect;
static int attempts;
static int events;
static int quits;
static int errors;
static unsigned event_type;

bool Wayland_VideoReconnect(SDL_VideoDevice *device) {
    (void)device;
    ++attempts;
    return reconnect;
}

void SDL_LogError(int category, const char *message) {
    (void)category;
    (void)message;
    ++errors;
}

void SDL_SendQuit(void) { ++quits; }

bool SDL_PushEvent(SDL_Event *event) {
    ++events;
    event_type = event->type;
    return true;
}

__DISCONNECT_HANDLER__

int main(void) {
    SDL_VideoData data = { false };
    SDL_VideoDevice device = { &data };
    reconnect = true;
    assert(Wayland_HandleDisplayDisconnected(&device));
    assert(attempts == 1 && events == 0 && quits == 0 && errors == 0);
    reconnect = false;
    assert(!Wayland_HandleDisplayDisconnected(&device));
    assert(data.display_disconnected && attempts == 2 && events == 1);
    assert(event_type == SDL_EVENT_TERMINATING && quits == 0 && errors == 1);
    assert(!Wayland_HandleDisplayDisconnected(&device));
    assert(attempts == 2 && events == 1 && quits == 0 && errors == 1);
    puts("PASS Wayland recovery failure queues one terminal event");
    return 0;
}
