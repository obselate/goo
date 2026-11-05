package GooAndroidSmokeDesktop

import GooAndroidSmoke
import Goo
import System

func Main() {
  let window = SmokeApplication.CreateWindow()
  if Environment.GetEnvironmentVariable("GOO_ACCESSIBILITY_ROLES") == "1" {
    window.Root = SmokeApplication.CreateAccessibilityRoot()
    window.AccessibilityAdapter = NativeAccessibilityAdapter()
  }
  window.Run()
}
