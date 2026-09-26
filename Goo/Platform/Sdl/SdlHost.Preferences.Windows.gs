package Goo

import System.Runtime.InteropServices

@StructLayout(LayoutKind.Sequential)
internal struct WindowsHighContrast {
  internal var Size uint32
  internal var Flags uint32
  internal var Scheme nint
}

internal unsafe partial class SdlHost {
  shared {
    @DllImport("user32.dll", EntryPoint: "SystemParametersInfoW")
    private func ReadAnimationPreference(action uint32, parameter uint32, out value int32, flags uint32) int32;
    @DllImport("user32.dll", EntryPoint: "SystemParametersInfoW")
    private func ReadContrastPreference(action uint32, parameter uint32, ref value WindowsHighContrast, flags uint32) int32;

    private func ReadWindowsPreferences(theme SystemTheme) PlatformPreferences {
      var animation int32
      var motion bool?
      if ReadAnimationPreference(0x1042u, 0u, out animation, 0u) != 0 { motion = animation == 0 }
      let size = uint32(Marshal.SizeOf[WindowsHighContrast]())
      var native = WindowsHighContrast{Size: size}
      var contrast bool?
      if ReadContrastPreference(0x0042u, size, ref native, 0u) != 0 { contrast = (native.Flags & 1u) != 0u }
      return PlatformPreferences{Theme: theme, ReducedMotion: motion, HighContrast: contrast}
    }
  }
}
