package Goo

import System

internal class WindowDiagnostics {
  shared {
    internal func AttachIfEnabled(window Window) {
      if Environment.GetEnvironmentVariable("GOO_DEVTOOLS") == "1" {
        window.AttachDiagnostics(Environment.GetEnvironmentVariable("GOO_DEVTOOLS_INPUT") == "1")
      }
    }
  }
}
