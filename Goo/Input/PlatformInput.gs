package Goo

import System
import System.Diagnostics

/// Captures FocusId, effective UTF-16 Text, SelectionStart, SelectionEnd, CompositionStart,
/// CompositionEnd, IsPassword, IsMultiline, IsReadOnly, and logical CaretArea for one editor.
/// Password text is available only to the trusted host, which must apply platform privacy rules.
public data struct FocusedEditorSnapshot(FocusId int64, Text string, SelectionStart int32,
  SelectionEnd int32, CompositionStart int32, CompositionEnd int32, IsPassword bool,
  IsMultiline bool, IsReadOnly bool, CaretArea ElementRect) { }

/// Routes platform events and semantic editing through the window's existing input system.
/// Call on the window owner thread. Use Window.Post to dispatch from another thread.
public class PlatformInput {
  private let owner Window
  private let input InputCoordinator
  private let resolver Resolver
  private var published FocusedEditorSnapshot?
  private var editorChanged Action[FocusedEditorSnapshot?]?

  internal init(owner Window, input InputCoordinator, resolver Resolver) {
    this.owner = owner
    this.input = input
    this.resolver = resolver
  }

  /// Gets a current immutable snapshot, or nil when no text editor has focus.
  public prop Editor FocusedEditorSnapshot? {
    get {
      requireThread()
      return input.EditorSnapshot()
    }
  }

  /// Reports settled focus, text, selection, composition, and caret-area changes.
  public event EditorChanged Action[FocusedEditorSnapshot?]{
    add{
      requireThread()
      editorChanged = Delegate.Combine(editorChanged, value) as Action[FocusedEditorSnapshot?]?
    }
    remove{
      requireThread()
      editorChanged = Delegate.Remove(editorChanged, value) as Action[FocusedEditorSnapshot?]?
    }
  }

  /// Moves a platform pointer in window logical coordinates.
  public func PointerMove(pointerId int64, device PointerDevice, x float32, y float32,
    modifiers KeyModifiers, pressure float32) {
      requireThread()
      input.QueuePointerMove(pointerId, device, x, y, modifiers, pressure)
      drain()
    }

  /// Presses a platform pointer in window logical coordinates.
  public func PointerPress(pointerId int64, device PointerDevice, x float32, y float32,
    button PointerButton, modifiers KeyModifiers, pressure float32) {
      requireThread()
      input.QueuePointerPress(pointerId, device, x, y, button, modifiers, pressure)
      drain()
    }

  /// Releases a platform pointer in window logical coordinates.
  public func PointerRelease(pointerId int64, device PointerDevice, x float32, y float32,
    button PointerButton, modifiers KeyModifiers, pressure float32) {
      requireThread()
      input.QueuePointerRelease(pointerId, device, x, y, button, modifiers, pressure)
      drain()
    }

  /// Cancels one pointer, releasing capture without generating a click.
  public func PointerCancel(pointerId int64, device PointerDevice) {
    requireThread()
    input.QueuePointerCancel(pointerId, device)
    drain()
  }

  /// Dispatches wheel deltas at a window logical position.
  public func PointerWheel(x float32, y float32, deltaX float32, deltaY float32,
    modifiers KeyModifiers) {
      requireThread()
      input.QueuePointerWheel(x, y, deltaX, deltaY, modifiers)
      drain()
    }

  /// Dispatches a physical key press through the existing keyboard routing.
  public func KeyPress(key Key, modifiers KeyModifiers) {
    requireThread()
    input.QueueKeyPress(key, modifiers)
    drain()
  }

  /// Releases a physical key and stops its repeat state.
  public func KeyRelease(key Key) {
    requireThread()
    input.QueueKeyRelease(key)
    drain()
  }

  /// Clears editor focus, composition, pressed keys, and pointer capture.
  public func FocusLost() {
    requireThread()
    input.FocusLost(owner.Tree, resolver)
    drain()
  }

  /// Removes editor focus and cancels transient composition.
  public func ClearFocus() {
    requireThread()
    input.ClearEditorFocus(resolver)
    finish()
  }

  /// Moves focus in the retained focus order, independent of editor indentation.
  public func MoveFocus(forward bool) bool {
    requireThread()
    let result = input.MoveEditorFocus(owner.Tree, resolver, forward)
    finish()
    return result
  }

  /// Replaces the current selection or preedit with committed text.
  public func CommitText(value string) bool {
    requireThread()
    if value == nil { throw ArgumentNullException("value") }
    let result = input.CommitEditorText(owner.Tree, value)
    finish()
    return result
  }

  /// Updates preedit and its selected UTF-16 segment without committing the value.
  public func SetComposition(value string, selectionStart int32, selectionLength int32) bool {
    requireThread()
    if value == nil { throw ArgumentNullException("value") }
    let result = input.SetEditorComposition(owner.Tree, value, selectionStart, selectionLength)
    finish()
    return result
  }

  /// Marks an existing effective UTF-16 range as composing text.
  public func SetCompositionRange(start int32, end int32) bool {
    requireThread()
    let result = input.SetEditorCompositionRange(owner.Tree, start, end)
    finish()
    return result
  }

  /// Commits the existing preedit without changing its text.
  public func FinishComposition() bool {
    requireThread()
    let result = input.FinishEditorComposition(owner.Tree)
    finish()
    return result
  }

  /// Discards preedit and restores the committed value and selection.
  public func CancelComposition() bool {
    requireThread()
    let result = input.CancelEditorComposition(owner.Tree)
    finish()
    return result
  }

  /// Selects effective UTF-16 offsets. Goo expands ranges to whole grapheme clusters.
  /// Selection direction and composing ranges remain independent.
  public func SetSelection(start int32, end int32) bool {
    requireThread()
    let result = input.SetEditorSelection(owner.Tree, start, end)
    finish()
    return result
  }

  /// Deletes UTF-16 lengths outside the union of selection and composition, retaining both.
  /// Deletion expands to whole grapheme clusters without committing preedit.
  public func DeleteSurroundingText(beforeLength int32, afterLength int32) bool {
    requireThread()
    let result = input.DeleteEditorSurroundingText(owner.Tree, beforeLength, afterLength)
    finish()
    return result
  }

  /// Executes shared semantic navigation, editing, clipboard, or submit behavior.
  public func Execute(command TextCommand) bool {
    requireThread()
    let result = input.ExecuteEditorCommand(owner.Tree, resolver, command)
    finish()
    return result
  }

  internal func Refresh() {
    let current = input.EditorSnapshot()
    if published == nil && current == nil { return }
    if let prior = published, let next = current {
      if prior.Equals(next) { return }
    }
    published = current
    editorChanged?.Invoke(current)
  }

  private func requireThread() -> owner.RequireElementHandleThread("Window.PlatformInput")

  private func drain() {
    input.Drain(owner.Tree, resolver, float64(Stopwatch.GetTimestamp()) / float64(Stopwatch.Frequency),
      owner.PlatformKeyPressedCallbacks)
    finish()
  }

  private func finish() {
    resolver.Flush()
    owner.InvalidatePlatformInput()
    Refresh()
  }
}
