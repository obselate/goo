package Goo

import System
import System.Runtime.InteropServices

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate PortalPreferenceSignal(connection nint, sender nint, path nint, contract nint,
  signal nint, parameters nint, data nint);

internal unsafe partial class SdlHost {
  private var preferenceContext nint
  private var preferenceBus nint
  private var preferenceSubscription uint32
  private var preferenceSignal PortalPreferenceSignal?
  private var preferencePortalUnavailable bool

  private func ReadLinuxPreferences(theme SystemTheme) PlatformPreferences {
    var sounds bool?
    try {
      if !preferencePortalUnavailable {
        if preferenceContext == nint(0) {
          preferenceContext = g_main_context_new()
          g_main_context_push_thread_default(preferenceContext)
          try {
            preferenceBus = g_bus_get_sync(2, nint(0), nint(0))
            if preferenceBus != nint(0) {
              g_dbus_connection_set_exit_on_close(preferenceBus, 0)
              let callback PortalPreferenceSignal = (connection, sender, path, contract, signal, parameters, data) -> {
                nextPreferencesTicks = 0
              }
              preferenceSignal = callback
              preferenceSubscription = g_dbus_connection_signal_subscribe(preferenceBus,
                "org.freedesktop.portal.Desktop", "org.freedesktop.portal.Settings", "SettingChanged",
                "/org/freedesktop/portal/desktop", "org.gnome.desktop.sound", 0, callback, nint(0), nint(0))
            }
          } finally { g_main_context_pop_thread_default(preferenceContext) }
        }
        if preferenceBus != nint(0) { sounds = ReadPortalEventSounds() }
      }
    } catch (_ DllNotFoundException) { preferencePortalUnavailable = true }
    catch (_ EntryPointNotFoundException) { preferencePortalUnavailable = true }
    return PlatformPreferences{Theme: theme, EventSoundsEnabled: sounds}
  }

  private func ReadPortalEventSounds() bool? {
    let parameters = g_variant_new("(ss)", "org.gnome.desktop.sound", "event-sounds")
    let reply = g_dbus_connection_call_sync(preferenceBus, "org.freedesktop.portal.Desktop",
      "/org/freedesktop/portal/desktop", "org.freedesktop.portal.Settings", "Read", parameters,
      "(v)", 1, 100, nint(0), nint(0))
    if reply == nint(0) { return nil }
    var value = g_variant_get_child_value(reply, nuint(0))
    try {
      while g_variant_is_of_type(value, "v") != 0 {
        let child = g_variant_get_variant(value)
        g_variant_unref(value)
        value = child
      }
      if g_variant_is_of_type(value, "b") != 0 { return g_variant_get_boolean(value) != 0 }
      return nil
    } finally {
      g_variant_unref(value)
      g_variant_unref(reply)
    }
  }

  private func PollPreferenceSignals() {
    if preferenceContext == nint(0) { return }
    while g_main_context_iteration(preferenceContext, 0) != 0 { }
  }

  private func ReleasePreferencePortal() {
    if preferenceBus != nint(0) {
      g_dbus_connection_signal_unsubscribe(preferenceBus, preferenceSubscription)
      g_object_unref(preferenceBus)
      preferenceBus = nint(0)
    }
    if preferenceContext != nint(0) {
      g_main_context_unref(preferenceContext)
      preferenceContext = nint(0)
    }
    preferenceSignal = nil
  }

  shared {
    @DllImport("libgio-2.0.so.0")
    private func g_bus_get_sync(kind int32, cancellable nint, error nint) nint;
    @DllImport("libgio-2.0.so.0")
    private func g_dbus_connection_set_exit_on_close(connection nint, enabled int32);
    @DllImport("libgio-2.0.so.0")
    private func g_dbus_connection_call_sync(connection nint, bus string, path string, contract string,
      method string, parameters nint, replyType string, flags int32, timeout int32, cancellable nint, error nint) nint;
    @DllImport("libgio-2.0.so.0")
    private func g_dbus_connection_signal_subscribe(connection nint, sender string, contract string, member string,
      path string, argument string, flags int32, callback PortalPreferenceSignal, data nint, destroy nint) uint32;
    @DllImport("libgio-2.0.so.0")
    private func g_dbus_connection_signal_unsubscribe(connection nint, subscription uint32);
    @DllImport("libgobject-2.0.so.0")
    private func g_object_unref(value nint);
    @DllImport("libglib-2.0.so.0")
    private func g_main_context_new() nint;
    @DllImport("libglib-2.0.so.0")
    private func g_main_context_push_thread_default(context nint);
    @DllImport("libglib-2.0.so.0")
    private func g_main_context_pop_thread_default(context nint);
    @DllImport("libglib-2.0.so.0")
    private func g_main_context_iteration(context nint, mayBlock int32) int32;
    @DllImport("libglib-2.0.so.0")
    private func g_main_context_unref(context nint);
    @DllImport("libglib-2.0.so.0")
    private func g_variant_new(format string, namespaceName string, key string) nint;
    @DllImport("libglib-2.0.so.0")
    private func g_variant_get_child_value(value nint, index nuint) nint;
    @DllImport("libglib-2.0.so.0")
    private func g_variant_get_variant(value nint) nint;
    @DllImport("libglib-2.0.so.0")
    private func g_variant_is_of_type(value nint, signature string) int32;
    @DllImport("libglib-2.0.so.0")
    private func g_variant_get_boolean(value nint) int32;
    @DllImport("libglib-2.0.so.0")
    private func g_variant_unref(value nint);
  }
}
