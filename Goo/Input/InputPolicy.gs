package Goo

import System
import System.Runtime.InteropServices

@DllImport("user32.dll", EntryPoint: "SystemParametersInfoW")
private func systemWheelSetting(action uint32, parameter uint32, out value uint32, flags uint32) int32;

// Platform policy for editing shortcuts and wheel scrolling.
internal class InputPolicy {
  shared {
    // Test knob; defaults to the running OS.
    internal var Mac bool = OperatingSystem.IsMacOS()

    internal func WheelUnit(vertical bool, viewport float32) float32 {
      if Mac { return 10.0F }
      var count uint32 = 3
      if OperatingSystem.IsWindows() {
        let setting = if vertical { uint32(0x0068) } else { uint32(0x006C) }
        if systemWheelSetting(setting, 0, out count, 0) == 0 { count = 3 }
      }
      if count == UInt32.MaxValue { return viewport }
      let distance = float32(count) * (if vertical { 32.0F } else { 16.0F })
      return MathF.Min(distance, viewport)
    }
  }
}
