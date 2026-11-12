package Goo

import System
import System.Threading

internal sealed class WindowCallbackContext : SynchronizationContext {
  internal let Window Window
  internal let Owner Cell?

  internal init(window Window, owner Cell?) {
    Window = window
    Owner = owner
  }

  public override func CreateCopy() SynchronizationContext -> this
  public override func Post(callback SendOrPostCallback, state object?) {
    Window.Post(() -> {
      using let context = CallbackScope(this)
      try { callback(state) }
      finally { Owner?.RebuildAfterCallback() }
    })
  }
}

internal struct CallbackScope : IDisposable {
  private let previous SynchronizationContext?
  private let installed bool

  internal init(context WindowCallbackContext?) {
    previous = SynchronizationContext.Current
    installed = context != nil && (previous == nil || previous is WindowCallbackContext)
    if installed { SynchronizationContext.SetSynchronizationContext(context) }
  }

  public func Dispose() {
    if installed { SynchronizationContext.SetSynchronizationContext(previous) }
  }
}

public partial class Window {
  private var callbackContext WindowCallbackContext?

  internal func CallbackContext() WindowCallbackContext {
    callbackContext ??= WindowCallbackContext(this, nil)
    return callbackContext!!
  }
}
