package Goo

import System
import System.IO
import Microsoft.Win32
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
    private const AccentKey string = "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Accent"

    private func ReadWindowsPreferences(theme SystemTheme) PlatformPreferences {
      var animation int32
      var motion bool?
      if ReadAnimationPreference(0x1042u, 0u, out animation, 0u) != 0 { motion = animation == 0 }
      let size = uint32(Marshal.SizeOf[WindowsHighContrast]())
      var native = WindowsHighContrast{Size: size}
      var contrast bool?
      if ReadContrastPreference(0x0042u, size, ref native, 0u) != 0 { contrast = (native.Flags & 1u) != 0u }
      let palette = ReadWindowsAccentPalette()
      return PlatformPreferences{
        Theme: theme, ReducedMotion: motion, HighContrast: contrast,
        EventSoundsEnabled: ReadWindowsEventSounds(),
        AccentColor: palette[3], AccentLight3: palette[0], AccentLight2: palette[1], AccentLight1: palette[2],
        AccentDark1: palette[4], AccentDark2: palette[5], AccentDark3: palette[6],
      }
    }

    private func ReadWindowsAccentPalette() []Color? {
      let palette = [7]Color?
      try {
        if Registry.GetValue(AccentKey, "AccentPalette", nil) is []uint8 bytes && bytes.Length >= 28 {
          for index in 0 ... 7 {
            palette[index] = Color.Rgb(int32(bytes[index * 4]), int32(bytes[index * 4 + 1]), int32(bytes[index * 4 + 2]))
          }
        }
      } catch (_ System.Security.SecurityException) { }
      catch (_ UnauthorizedAccessException) { }
      catch (_ IOException) { }
      return palette
    }

    private func ReadWindowsEventSounds() bool? {
      try {
        let scheme = Registry.GetValue("HKEY_CURRENT_USER\\AppEvents\\Schemes", "", nil)
        if scheme is string name { return !String.Equals(name, ".None", StringComparison.OrdinalIgnoreCase) }
      } catch (_ System.Security.SecurityException) { }
      catch (_ UnauthorizedAccessException) { }
      catch (_ IOException) { }
      return nil
    }
  }
}
