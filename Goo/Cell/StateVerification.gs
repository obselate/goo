package Goo

import System.Diagnostics

internal class StateVerification {
  shared {
    internal var Override bool?

    internal prop Enabled bool {
      get -> Override ?? (Debugger.IsAttached || DevTools.HasSessions)
      set -> Override = value
    }
  }
}
