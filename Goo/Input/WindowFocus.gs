package Goo

import System

/// Provides owner-thread focus state, selection, and text commands for one window.
/// Getter reads in Build and retained builders subscribe to changes.
public class WindowFocus {
  private let owner Window
  private let input InputCoordinator
  private let resolver Resolver
  private var published FocusedEditorSnapshot?
  private var publishedSelection TextSelection?
  private var editorChanged Action[FocusedEditorSnapshot?]?

  internal init(owner Window, input InputCoordinator, resolver Resolver) {
    this.owner = owner
    this.input = input
    this.resolver = resolver
  }

  /// Reports whether the focused element accepts text editing.
  public prop EditsText bool {
    get {
      owner.PlatformInput.requireThread()
      return owner.TrackWindowValue(&owner.trackedEditsText, TargetEditsText(input.FocusedNode()))
    }
  }

  /// Gets a current immutable editor snapshot, or nil when no text editor has focus.
  public prop Editor FocusedEditorSnapshot? {
    get {
      owner.PlatformInput.requireThread()
      return owner.TrackWindowValue(&owner.trackedEditor, input.EditorSnapshot())
    }
  }

  /// Gets the effective selection and endpoint affinities, or nil without a text selection.
  public prop Selection TextSelection? {
    get {
      owner.PlatformInput.requireThread()
      return owner.TrackWindowValue(&owner.trackedSelection, input.EditorSelection())
    }
  }

  /// Reports settled focus, text, selection, composition, and caret-area changes.
  public event EditorChanged Action[FocusedEditorSnapshot?]{
    add{
      owner.PlatformInput.requireThread()
      editorChanged = Delegate.Combine(editorChanged, value) as Action[FocusedEditorSnapshot?]?
    }
    remove{
      owner.PlatformInput.requireThread()
      editorChanged = Delegate.Remove(editorChanged, value) as Action[FocusedEditorSnapshot?]?
    }
  }

  /// Selects effective UTF-16 offsets, expanding ranges to whole grapheme clusters.
  /// Selection direction and composing ranges remain independent.
  public func SetSelection(start int32, end int32) bool {
    owner.PlatformInput.requireInput()
    try { return input.SetEditorSelection(owner.Tree, start, end) }
    finally { owner.PlatformInput.finish() }
  }

  /// Selects effective UTF-16 positions while preserving endpoint affinities.
  /// Grapheme normalization and composition use the same rules as the offset-only overload.
  public func SetSelection(selection TextSelection) bool {
    owner.PlatformInput.requireInput()
    try { return input.SetEditorSelection(owner.Tree, selection) }
    finally { owner.PlatformInput.finish() }
  }

  /// Executes shared navigation, editing, clipboard, submit, or entry CancelEdit behavior.
  /// Paste without Text reads the clipboard. Supplied paste text retains interception and undo grouping.
  public func Execute(command TextCommand) bool {
    owner.PlatformInput.requireInput()
    try { return input.ExecuteEditorCommand(owner.Tree, resolver, command) }
    finally { owner.PlatformInput.finish() }
  }

  /// Moves focus in retained tree order, independent of editor indentation.
  public func Move(forward bool) bool {
    owner.PlatformInput.requireInput()
    try { return input.MoveEditorFocus(owner.Tree, resolver, forward) }
    finally { owner.PlatformInput.finish() }
  }

  /// Clears focus and cancels transient composition.
  public func Clear() {
    owner.PlatformInput.requireThread()
    try { input.ClearEditorFocus(resolver) }
    finally { owner.PlatformInput.finish() }
  }

  internal func Refresh() {
    if input.IsDispatching { return }
    let current = input.EditorSnapshot()
    let selection = input.EditorSelection()
    owner.SyncWindowFocus(current, selection)
    var selectionChanged = (publishedSelection == nil) != (selection == nil)
    if let prior = publishedSelection, let next = selection {
      selectionChanged = prior.Anchor.Offset != next.Anchor.Offset || prior.Active.Offset != next.Active.Offset
        || prior.Anchor.Affinity != next.Anchor.Affinity || prior.Active.Affinity != next.Active.Affinity
    }
    if published == nil && current == nil { return }
    if let prior = published, let next = current {
      if prior.Equals(next) && !selectionChanged && prior.InputOptions == next.InputOptions { return }
    }
    published = current
    publishedSelection = selection
    editorChanged?.Invoke(current)
  }

  shared {
    internal func TargetEditsText(target Node?) bool {
      guard let node = target else { return false }
      return canReceiveInput(node) && ((node.Kind == NodeKind.Entry || node.Kind == NodeKind.Editor) && !node.EditorReadOnly
        || node.Kind != NodeKind.Entry && node.Kind != NodeKind.Editor && TextInputCallbacks.TextInput(node) != nil)
    }
  }
}
