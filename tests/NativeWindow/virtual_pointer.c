#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <wayland-client.h>

static const struct wl_message pointer_requests[] = {
    {"motion", "uff", NULL},
    {"motion_absolute", "uuuuu", NULL},
    {"button", "uuu", NULL},
    {"axis", "uuf", NULL},
    {"frame", "", NULL},
};
static const struct wl_interface pointer_interface = {
    "zwlr_virtual_pointer_v1", 1, 5, pointer_requests, 0, NULL,
};
static const struct wl_interface *create_types[] = {&wl_seat_interface, &pointer_interface};
static const struct wl_message manager_requests[] = {{"create_virtual_pointer", "?on", create_types}};
static const struct wl_interface manager_interface = {
    "zwlr_virtual_pointer_manager_v1", 1, 1, manager_requests, 0, NULL,
};

static void global(void *data, struct wl_registry *registry, uint32_t name, const char *interface, uint32_t version)
{
    (void)version;
    if (!strcmp(interface, manager_interface.name)) {
        *(struct wl_proxy **)data = wl_registry_bind(registry, name, &manager_interface, 1);
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
    const char *headless = getenv("GOO_HEADLESS_WAYLAND");
    if (!headless || strcmp(headless, "1") != 0) return 1;
    struct wl_display *display = wl_display_connect(NULL);
    if (!display) return 1;
    struct wl_registry *registry = wl_display_get_registry(display);
    struct wl_proxy *manager = NULL;
    const struct wl_registry_listener listener = {global, remove_global};
    wl_registry_add_listener(registry, &listener, &manager);
    if (wl_display_roundtrip(display) < 0 || !manager) return 1;
    struct wl_proxy *pointer = wl_proxy_marshal_flags(manager, 0, &pointer_interface, 1, 0, NULL, NULL);
    if (!pointer || wl_display_roundtrip(display) < 0) return 1;
    puts("ready");
    fflush(stdout);
    unsigned x, y, width, height;
    while (scanf("%u %u %u %u", &x, &y, &width, &height) == 4) {
        wl_proxy_marshal_flags(pointer, 1, NULL, 1, 0, 0u, x, y, width, height);
        wl_proxy_marshal_flags(pointer, 4, NULL, 1, 0);
        wl_proxy_marshal_flags(pointer, 2, NULL, 1, 0, 0u, 272u, 1u);
        wl_proxy_marshal_flags(pointer, 4, NULL, 1, 0);
        wl_proxy_marshal_flags(pointer, 2, NULL, 1, 0, 0u, 272u, 0u);
        wl_proxy_marshal_flags(pointer, 4, NULL, 1, 0);
        if (wl_display_roundtrip(display) < 0) return 1;
    }
    wl_proxy_destroy(pointer);
    wl_proxy_destroy(manager);
    wl_registry_destroy(registry);
    wl_display_disconnect(display);
    return 0;
}
