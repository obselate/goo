package Goo

import System
import System.Collections.Generic

internal class WindowFamily {
  internal var Owner Window?
  internal var Modal bool
  internal var Children List[Window]?
  internal var BlockingChild Window?
  internal var PreviousFocus WeakReference?
  internal var Registered bool
  internal var Closing bool
  internal var CloseError Exception?
  internal var Dialog NativeFileDialog?
}

/// Configures native ownership and modality for secondary desktop windows.
public partial class Window {
  private var family WindowFamily?

  /// Gets or sets the native owner before Open. The owner must be an open desktop window on the same UI thread.
  /// Ownership cannot change while open. Self-ownership and ancestor cycles are rejected.
  public prop Owner Window? {
    get -> family?.Owner
    set(value) {
      requireUiThread("Window.Owner")
      if IsOpen || host != nil { throw InvalidOperationException("Window ownership must be configured before Open") }
      var ancestor = value
      while let current = ancestor {
        if Object.ReferenceEquals(current, this) { throw ArgumentException("Window ownership must not contain a cycle", "value") }
        ancestor = current.Owner
      }
      if family == nil && value == nil { return }
      family ??= WindowFamily()
      family!!.Owner = value
    }
  }

  /// Gets or sets whether this window is modal to Owner. Configure before Open; a modal window requires an owner.
  /// One direct modal child may be open per owner. Nested dialogs use the active modal child as their owner.
  public prop Modal bool{
    get -> family?.Modal == true
    set(value) {
      requireUiThread("Window.Modal")
      if IsOpen || host != nil { throw InvalidOperationException("Window modality must be configured before Open") }
      if family == nil && !value { return }
      family ??= WindowFamily()
      family!!.Modal = value
    }
  }

  /// Gets whether a modal child or native chooser blocks this window's native, platform, focus, and accessibility input.
  public prop IsInputBlocked bool{ get -> family?.BlockingChild?.IsOpen == true || family?.Dialog != nil }

  private func validateOwnership() {
    if Modal && Owner == nil { throw InvalidOperationException("A modal window requires an Owner") }
    if let parent = Owner {
      parent.requireUiThread("Owned Window.Open")
      if !parent.IsOpen || parent.host?.IsClosing == true || parent.family?.Closing == true {
        throw InvalidOperationException("The owner must be open and not closing")
      }
      if parent.embeddedHost != nil { throw NotSupportedException("Embedded viewports cannot own native Goo windows") }
      if parent.IsInputBlocked { throw InvalidOperationException("Use the active modal window as the owner of a nested window") }
    }
    if let state = family { state.Closing = false }
  }

  private func configureOwnership(native SdlHost) {
    guard let parent = Owner else { return }
    guard let parentHost = parent.host as SdlHost ? else { throw NotSupportedException("The owner does not have a native desktop host") }
    native.SetOwner(parentHost, Modal)
  }

  private func registerOwnership() {
    guard let own = family, let parent = own.Owner else { return }
    parent.family ??= WindowFamily()
    let parentFamily = parent.family!!
    parentFamily.Children ??= List[Window]()
    parentFamily.Children!!.Add(this)
    own.Registered = true
    if own.Modal {
      if let focused = parent.input.FocusedNode() { parentFamily.PreviousFocus = WeakReference(focused) }
      parentFamily.BlockingChild = this
      parent.input.FocusLost(parent.node, parent.resolver)
      parent.RefreshPlatformInput()
      parent.accessibility?.MarkDirty()
      parent.requestRender()
    }
  }

  private func closeOwnedWindows() bool {
    guard let state = family, let children = state.Children else { return true }
    state.Closing = true
    // Child teardown may also close siblings through application callbacks.
    let pending = children.ToArray()
    var complete = true
    for child in pending {
      state.CloseError = captureCleanupError(state.CloseError, () -> child.Close())
      if child.IsOpen { complete = false }
    }
    if !complete { host?.Wake() }
    return complete
  }

  private func unregisterOwnership() {
    guard let own = family, let parent = own.Owner, let parentFamily = parent.family else { return }
    if !own.Registered { return }
    own.Registered = false
    parentFamily.Children?.Remove(this)
    if parentFamily.BlockingChild == this {
      parentFamily.BlockingChild = nil
      parent.accessibility?.MarkDirty()
      let previous = parentFamily.PreviousFocus
      parentFamily.PreviousFocus = nil
      if parent.IsOpen && parent.host?.IsClosing != true && !parentFamily.Closing {
        parent.RequestActivation()
        if let focused = previous?.Target as Node? {
          if !focused.Retired { parent.FocusElement(focused) }
        }
        parent.requestRender()
      }
    }
  }
}
