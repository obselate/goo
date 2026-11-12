package Goo

/// Provides owner-thread focus state, selection, and text commands for one window.
public sealed class WindowFocus {
  private let owner Window
  private let input InputCoordinator
  private let resolver Resolver

  internal init(owner Window, input InputCoordinator, resolver Resolver) {
    this.owner = owner
    this.input = input
    this.resolver = resolver
  }

  /// Reports whether the focused element accepts text editing.
  public prop EditsText bool {
    get {
      owner.PlatformInput.requireThread()
      return TargetEditsText(input.FocusedNode())
    }
  }

  /// Gets a current immutable editor snapshot, or nil when no text editor has focus.
  public prop Editor FocusedEditorSnapshot? {
    get {
      owner.PlatformInput.requireThread()
      return input.EditorSnapshot()
    }
  }

  /// Gets the effective selection and endpoint affinities, or nil without a text selection.
  public prop Selection TextSelection? {
    get {
      owner.PlatformInput.requireThread()
      return input.EditorSelection()
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

  shared {
    internal func TargetEditsText(target Node?) bool {
      guard let node = target else { return false }
      return canReceiveInput(node) && (node.Kind == NodeKind.Entry
        || node.Kind == NodeKind.Editor && !node.EditorReadOnly
        || node.Kind != NodeKind.Editor && TextInputCallbacks.TextInput(node) != nil)
    }
  }
}
