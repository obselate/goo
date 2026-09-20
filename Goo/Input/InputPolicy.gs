package Goo

import System

// Platform policy for editing shortcuts and wheel scrolling.
internal class InputPolicy {
  shared {
    // Test knob; defaults to the running OS.
    internal var Mac bool = OperatingSystem.IsMacOS()

    // Logical pixels per SDL wheel unit. SDL prescales macOS precise
    // trackpad deltas by 0.1, so 10 restores 1:1; verify on macOS pass.
    internal func WheelUnit() float32 -> Mac ? 10.0F : 48.0F
  }
}
