package Goo

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

    private func ReadMacPreferences(theme SystemTheme) PlatformPreferences {
      let workspace = PreferenceObject(objc_getClass("NSWorkspace"), sel_registerName("sharedWorkspace"))
      if workspace == nint(0) { return PlatformPreferences{Theme: theme} }
      return PlatformPreferences{
        Theme: theme,
        ReducedMotion: PreferenceBool(workspace, sel_registerName("accessibilityDisplayShouldReduceMotion")) != uint8(0),
        HighContrast: PreferenceBool(workspace, sel_registerName("accessibilityDisplayShouldIncreaseContrast")) != uint8(0),
      }
    }
  }
}
