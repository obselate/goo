#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <unistd.h>
#include <wayland-client.h>
#include <xkbcommon/xkbcommon.h>

static const struct wl_message keyboard_requests[] = {
    {"keymap", "uhu", NULL},
    {"key", "uuu", NULL},
    {"modifiers", "uuuu", NULL},
    {"destroy", "", NULL},
};
static const struct wl_interface keyboard_type = {
    "zwp_virtual_keyboard_v1", 1, 4, keyboard_requests, 0, NULL,
};
static const struct wl_interface *manager_types[] = {&wl_seat_interface, &keyboard_type};
static const struct wl_message manager_requests[] = {{"create_virtual_keyboard", "on", manager_types}};
static const struct wl_interface manager_type = {
    "zwp_virtual_keyboard_manager_v1", 1, 1, manager_requests, 0, NULL,
};
static struct wl_seat *seat;
static struct wl_proxy *manager;

static void global(void *data, struct wl_registry *registry, uint32_t name, const char *type, uint32_t version)
{
    (void)data;
    (void)version;
    if (!seat && strcmp(type, wl_seat_interface.name) == 0) {
        seat = wl_registry_bind(registry, name, &wl_seat_interface, 1);
    } else if (strcmp(type, manager_type.name) == 0) {
        manager = wl_registry_bind(registry, name, &manager_type, 1);
    }
}

static void remove_global(void *data, struct wl_registry *registry, uint32_t name)
{
    (void)data;
    (void)registry;
    (void)name;
}

int main(void)
{
    struct wl_display *display = wl_display_connect(NULL);
    if (!display) { return 1; }
    struct wl_registry *registry = wl_display_get_registry(display);
    const struct wl_registry_listener listener = {global, remove_global};
    wl_registry_add_listener(registry, &listener, NULL);
    if (wl_display_roundtrip(display) < 0 || !seat || !manager) { return 2; }
    struct wl_proxy *keyboard = wl_proxy_marshal_flags(manager, 0, &keyboard_type, 1, 0, seat, NULL);
    struct xkb_context *context = xkb_context_new(XKB_CONTEXT_NO_FLAGS);
    const struct xkb_rule_names names = {.layout = "us,de"};
    struct xkb_keymap *keymap = xkb_keymap_new_from_names(context, &names, XKB_KEYMAP_COMPILE_NO_FLAGS);
    if (!keymap) { return 3; }
    char *text = xkb_keymap_get_as_string(keymap, XKB_KEYMAP_FORMAT_TEXT_V1);
    uint32_t size = strlen(text) + 1;
    int fd = memfd_create("goo-test-keymap", MFD_CLOEXEC);
    if (fd < 0 || write(fd, text, size) != size || lseek(fd, 0, SEEK_SET) < 0) { return 4; }
    wl_proxy_marshal_flags(keyboard, 0, NULL, 1, 0, 1u, fd, size);
    close(fd);
    free(text);
    xkb_keymap_unref(keymap);
    xkb_context_unref(context);
    if (wl_display_roundtrip(display) < 0) { return 5; }
    puts("ready");
    fflush(stdout);
    int group;
    while ((group = getchar()) == '0' || group == '1') {
        wl_proxy_marshal_flags(keyboard, 2, NULL, 1, 0, 0u, 0u, 0u, (uint32_t)(group - '0'));
        if (wl_display_roundtrip(display) < 0) { return 6; }
    }
    wl_proxy_marshal_flags(keyboard, 3, NULL, 1, WL_MARSHAL_FLAG_DESTROY);
    wl_proxy_destroy(manager);
    wl_seat_destroy(seat);
    wl_registry_destroy(registry);
    wl_display_disconnect(display);
    return 0;
}
