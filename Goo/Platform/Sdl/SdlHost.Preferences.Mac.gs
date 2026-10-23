package Goo

import System
import System.Runtime.InteropServices

internal unsafe partial class SdlHost {
  shared {
    @DllImport("/usr/lib/libobjc.A.dylib")
    private func objc_getClass(name string) nint;
    @DllImport("/usr/lib/libobjc.A.dylib")
    private func sel_registerName(name string) nint;
    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend")
    private func PreferenceObject(receiver nint, selector nint) nint;
    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend")
    private func PreferenceBool(receiver nint, selector nint) uint8;
    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend")
    private func PreferenceObjectArgument(receiver nint, selector nint, argument nint) nint;
    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend")
    private func PreferenceComponent(receiver nint, selector nint) float64;
    @DllImport("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation")
    private func CFStringCreateWithCString(allocator nint, value string, encoding uint32) nint;
    @DllImport("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation")
    private func CFPreferencesGetAppBooleanValue(key nint, application nint, out valid uint8) uint8;
    @DllImport("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation")
    private func CFPreferencesAppSynchronize(application nint) uint8;
    private let soundPreferenceKey nint = if OperatingSystem.IsMacOS() {
      CFStringCreateWithCString(nint(0), "com.apple.sound.uiaudio.enabled", 0x08000100u)
    } else { nint(0) }
    private let globalPreferences nint = if OperatingSystem.IsMacOS() {
      CFStringCreateWithCString(nint(0), ".GlobalPreferences", 0x08000100u)
    } else { nint(0) }

    private func ReadMacPreferences(theme SystemTheme) PlatformPreferences {
      let workspace = PreferenceObject(objc_getClass("NSWorkspace"), sel_registerName("sharedWorkspace"))
      let sounds = ReadMacEventSounds()
      let accent = ReadMacAccentColor()
      if workspace == nint(0) { return PlatformPreferences{Theme: theme, EventSoundsEnabled: sounds, AccentColor: accent} }
      return PlatformPreferences{
        Theme: theme,
        ReducedMotion: PreferenceBool(workspace, sel_registerName("accessibilityDisplayShouldReduceMotion")) != uint8(0),
        HighContrast: PreferenceBool(workspace, sel_registerName("accessibilityDisplayShouldIncreaseContrast")) != uint8(0),
        EventSoundsEnabled: sounds,
        AccentColor: accent,
      }
    }

    private func ReadMacAccentColor() Color? {
      let color = PreferenceObject(objc_getClass("NSColor"), sel_registerName("controlAccentColor"))
      let space = PreferenceObject(objc_getClass("NSColorSpace"), sel_registerName("sRGBColorSpace"))
      if color == nint(0) || space == nint(0) { return nil }
      let rgb = PreferenceObjectArgument(color, sel_registerName("colorUsingColorSpace:"), space)
      if rgb == nint(0) { return nil }
      return Color.FromNormalized(float32(PreferenceComponent(rgb, sel_registerName("redComponent"))),
        float32(PreferenceComponent(rgb, sel_registerName("greenComponent"))),
        float32(PreferenceComponent(rgb, sel_registerName("blueComponent"))),
        float32(PreferenceComponent(rgb, sel_registerName("alphaComponent"))))
    }

    private func ReadMacEventSounds() bool? {
      CFPreferencesAppSynchronize(globalPreferences)
      var valid uint8
      let enabled = CFPreferencesGetAppBooleanValue(soundPreferenceKey, globalPreferences, out valid)
      if valid != uint8(0) { return enabled != uint8(0) }
      return nil
    }
  }
}
