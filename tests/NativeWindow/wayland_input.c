#include <gio/gio.h>
#include <gio/gunixfdlist.h>
#include <libei.h>
#include <poll.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

int main(void)
{
    setvbuf(stdin, NULL, _IONBF, 0);
    if (!getenv("GOO_HEADLESS_WAYLAND") || strcmp(getenv("GOO_HEADLESS_WAYLAND"), "1") != 0) return 2;
    GError *error = NULL;
    GDBusConnection *bus = g_bus_get_sync(G_BUS_TYPE_SESSION, NULL, &error);
    if (!bus) { fprintf(stderr, "%s\n", error->message); return 3; }
    GUnixFDList *fds = NULL;
    GVariant *reply = g_dbus_connection_call_with_unix_fd_list_sync(bus, "org.kde.KWin", "/org/kde/KWin/EIS/RemoteDesktop",
        "org.kde.KWin.EIS.RemoteDesktop", "connectToEIS", g_variant_new("(i)", 3), G_VARIANT_TYPE("(hi)"),
        G_DBUS_CALL_FLAGS_NONE, 10000, NULL, &fds, NULL, &error);
    if (!reply) { fprintf(stderr, "%s\n", error->message); return 4; }
    int index, cookie;
    g_variant_get(reply, "(hi)", &index, &cookie);
    int fd = g_unix_fd_list_get(fds, index, &error);
    g_variant_unref(reply);
    g_object_unref(fds);
    if (fd < 0) return 5;
    struct ei *context = ei_new_sender(NULL);
    ei_configure_name(context, "Goo isolated transfer checks");
    if (ei_setup_backend_fd(context, fd) != 0) return 6;
    struct ei_device *pointer = NULL, *buttons = NULL, *keyboard = NULL;
    bool ready = false;
    char command[256];
    for (;;) {
        ei_dispatch(context);
        struct ei_event *event;
        while ((event = ei_get_event(context))) {
            enum ei_event_type type = ei_event_get_type(event);
            struct ei_device *device = ei_event_get_device(event);
            if (type == EI_EVENT_DISCONNECT) return 7;
            if (type == EI_EVENT_SEAT_ADDED) {
                ei_seat_bind_capabilities(ei_event_get_seat(event), EI_DEVICE_CAP_POINTER_ABSOLUTE,
                    EI_DEVICE_CAP_BUTTON, EI_DEVICE_CAP_KEYBOARD, NULL);
            } else if (type == EI_EVENT_DEVICE_RESUMED) {
                ei_device_start_emulating(device, 1);
                if (ei_device_has_capability(device, EI_DEVICE_CAP_POINTER_ABSOLUTE)) {
                    pointer = device;
                    for (size_t i = 0; ei_device_get_region(device, i); ++i) {
                        struct ei_region *region = ei_device_get_region(device, i);
                        printf("region %u %u %u %u\n", ei_region_get_x(region), ei_region_get_y(region),
                               ei_region_get_width(region), ei_region_get_height(region));
                    }
                    fflush(stdout);
                }
                if (ei_device_has_capability(device, EI_DEVICE_CAP_KEYBOARD)) keyboard = device;
                if (ei_device_has_capability(device, EI_DEVICE_CAP_BUTTON)) buttons = device;
            } else if (type == EI_EVENT_DEVICE_REMOVED || type == EI_EVENT_DEVICE_PAUSED) {
                if (device == pointer) pointer = NULL;
                if (device == buttons) buttons = NULL;
                if (device == keyboard) keyboard = NULL;
            } else if (type == EI_EVENT_PONG) {
                struct ei_ping *ping = ei_event_pong_get_ping(event);
                printf("sync %u\n", (unsigned)(uintptr_t)ei_ping_get_user_data(ping));
                fflush(stdout);
                ei_ping_unref(ping);
            }
            ei_event_unref(event);
        }
        if (!ready && pointer && buttons && keyboard) { ready = true; puts("ready"); fflush(stdout); }
        struct pollfd pollers[2] = {{ei_get_fd(context), POLLIN, 0}, {STDIN_FILENO, POLLIN, 0}};
        if (poll(pollers, 2, 10000) < 0) return 8;
        if (pollers[1].revents & (POLLIN | POLLHUP)) {
            if (!fgets(command, sizeof(command), stdin)) break;
            double x, y;
            unsigned key, down;
            struct ei_device *target = NULL;
            if (pointer && sscanf(command, "point %lf %lf", &x, &y) == 2) {
                ei_device_pointer_motion_absolute(pointer, x, y); target = pointer;
            } else if (buttons && sscanf(command, "button %u", &down) == 1) {
                ei_device_button_button(buttons, 272, down != 0); target = buttons;
            } else if (keyboard && sscanf(command, "key %u %u", &key, &down) == 2) {
                ei_device_keyboard_key(keyboard, key, down != 0); target = keyboard;
            } else if (sscanf(command, "sync %u", &key) == 1) {
                struct ei_ping *ping = ei_new_ping(context);
                ei_ping_set_user_data(ping, (void *)(uintptr_t)key);
                ei_ping(ping);
            } else if (strcmp(command, "quit\n") == 0) break;
            else return 9;
            if (target) ei_device_frame(target, ei_now(context));
        }
    }
    ei_unref(context);
    g_object_unref(bus);
    return 0;
}
