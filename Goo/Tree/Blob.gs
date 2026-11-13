package Goo

import System
import System.Collections.Generic


/// Defines the common surface for Goo-owned declarative elements.
public open class Blob : Style {
  private var authoredKey string?
  private var transitionMs float32
  private var transitionDelayMs float32
  private var transitionSelection StyleMask
  private var blobState int32
  internal let CallbackOwner Cell?
  private var declarationOnClick Action?
  private var declarationOnPointerDown ((PointerEvent) -> void)?
  private var declarationOnPointerMove ((PointerEvent) -> void)?
  private var declarationOnPointerUp ((PointerEvent) -> void)?
  private var declarationOnPointerCancel ((PointerEvent) -> void)?
  private var declarationOnPointerDrag ((PointerDragEvent) -> void)?
  private var declarationPointerDragThreshold float64
  private var declarationPointerDragAxis LayoutAxis?
  private var declarationOnWheel ((WheelEvent) -> void)?
  private var declarationHoverStyle Style?
  private var declarationActiveStyle Style?
  private var declarationFocusStyle Style?
  private var declarationDisabledStyle Style?

  internal init() {
    CallbackOwner = ContextEnvironment.CallbackOwner
    transitionSelection = allTransitionSelection()
  }

  internal open func coreBlob();

  internal prop IsFrozen bool { get -> (blobState & int32(4096)) != 0 }

  internal func Freeze(descendants bool = false, depth int32 = 0) {
    if IsFrozen { return }
    Reconciler.CheckTreeDepth(depth)
    blobState = blobState | int32(4096)
    let owner = GetType()
    FreezeStyle(owner, depth)
    HoverStyle?.FreezeStyle(owner, depth)
    ActiveStyle?.FreezeStyle(owner, depth)
    FocusStyle?.FreezeStyle(owner, depth)
    DisabledStyle?.FreezeStyle(owner, depth)
    Accessibility?.Freeze(owner)
    if this is Portal portal { portal.FocusScope?.Freeze(owner) }
    if this is TextEntry entry { entry.InputOptions?.Freeze(owner) }
    if this is TextEditor editor { editor.InputOptions?.Freeze(owner) }
    if this is Shape shape { shape.Stroke?.Freeze(owner) }
    let children IList[Blob]? = switch this {
      case value is Container: value.FreezeChildren()
      case value is Button: value.FreezeChildren()
      case value is Row: value.FreezeChildren()
      case value is Column: value.FreezeChildren()
      case value is Portal: value.FreezeChildren()
      case _: nil
    }
    if descendants {
      if let children = children {
        for child in children { child.Freeze(true, depth + 1) }
      }
    }
    if this is Image image {
      image.Placeholder?.Freeze(true, depth + 1)
      image.Fallback?.Freeze(true, depth + 1)
    }
  }

  /// Gets the stable key within the sibling list.
  public prop Key string? {
    get -> authoredKey
    set {
      CheckMutable()
      authoredKey = value
    }
  }
  /// Gets the consumer-owned handle attached while this element is mounted.
  public prop Handle ElementHandle? {
    get {
      return HasElementHandle ? ElementHandles.BlobHandle(this) : nil
    }
    set {
      CheckMutable()
      ElementHandles.SetBlobHandle(this, value)
      blobState = value != nil ? blobState | int32(64) : blobState & ~int32(64)
      updateSparseInputState()
    }
  }
  internal prop HasElementHandle bool{ get -> (blobState & int32(64)) != 0 }
  /// Gets the descendant that also resolves FocusStyle while this owner has visible focus.
  /// The target need not be focusable. Native focus and accessibility relationships do not change.
  public prop FocusTarget ElementHandle? {
    get -> InputCallbacks.BlobFocusTarget(this)
    set {
      CheckMutable()
      InputCallbacks.SetBlobFocusTarget(this, value)
      updateSparseInputState()
    }
  }

  internal func AttachRetainedHandle(handle ElementHandle?) {
    ElementHandles.SetBlobHandle(this, handle)
    blobState = handle != nil ? blobState | int32(64) : blobState & ~int32(64)
    updateSparseInputState()
  }
  /// Gets the platform-neutral accessibility declaration for this element.
  public prop Accessibility Accessibility? {
    get -> AccessibilityMetadata.BlobValue(this)
    set {
      CheckMutable()
      AccessibilityMetadata.SetBlobValue(this, value)
      blobState = value != nil ? blobState | int32(128) : blobState & ~int32(128)
    }
  }
  /// Gets or sets the name without replacing other accessibility fields.
  /// An empty name is the default and leaves an absent declaration unset. A later Accessibility declaration replaces all fields.
  public prop AccessibilityName string {
    get -> Accessibility?.Name ?? ""
    set {
      CheckMutable()
      if let declaration = Accessibility {
        Accessibility = Goo.Accessibility{...declaration, Name: value}
      } else if value != "" {
        Accessibility = Goo.Accessibility{Name: value}
      }
    }
  }
  /// Gets or sets the role without replacing other accessibility fields.
  /// Auto is the default and leaves an absent declaration unset. A later Accessibility declaration replaces all fields.
  public prop AccessibilityRole Goo.AccessibilityRole {
    get -> Accessibility?.Role ?? Goo.AccessibilityRole.Auto
    set {
      CheckMutable()
      if let declaration = Accessibility {
        Accessibility = Goo.Accessibility{...declaration, Role: value}
      } else if value != Goo.AccessibilityRole.Auto {
        Accessibility = Goo.Accessibility{Role: value}
      }
    }
  }
  internal prop HasAccessibility bool{ get -> (blobState & int32(128)) != 0 }
  internal prop HasPassiveTextRanges bool{
    get -> (blobState & int32(256)) != 0
    set -> blobState = value ? blobState | int32(256) : blobState & ~int32(256)
  }
  internal prop ControlledEntryValue bool{
    get -> (blobState & int32(2048)) != 0
    set -> blobState = value ? blobState | int32(2048) : blobState & ~int32(2048)
  }
  /// Gets the action that runs when the element is clicked.
  public prop OnClick Action? {
    get -> declarationOnClick
    set {
      CheckMutable()
      declarationOnClick = value
    }
  }
  /// Gets the callback that receives each pointer button press.
  public prop OnPointerDown((PointerEvent) -> void)? {
    get -> declarationOnPointerDown
    set {
      CheckMutable()
      declarationOnPointerDown = value
    }
  }
  /// Gets the callback that receives each pointer movement.
  public prop OnPointerMove((PointerEvent) -> void)? {
    get -> declarationOnPointerMove
    set {
      CheckMutable()
      declarationOnPointerMove = value
    }
  }
  /// Gets the callback that receives each pointer button release.
  public prop OnPointerUp((PointerEvent) -> void)? {
    get -> declarationOnPointerUp
    set {
      CheckMutable()
      declarationOnPointerUp = value
    }
  }
  /// Gets the callback that receives pointer cancellation.
  public prop OnPointerCancel((PointerEvent) -> void)? {
    get -> declarationOnPointerCancel
    set {
      CheckMutable()
      declarationOnPointerCancel = value
    }
  }
  /// Gets the callback for a captured primary-pointer drag. Hover does not invoke it.
  /// Touch drags wait for movement in PointerDragAxis. An enclosing scroller claims movement along its scroll axis first.
  /// After a drag starts, the press does not produce OnClick.
  public prop OnPointerDrag((PointerDragEvent) -> void)? {
    get -> declarationOnPointerDrag
    set {
      CheckMutable()
      declarationOnPointerDrag = value
    }
  }
  /// Gets the Euclidean press-to-start distance in layout units, measured on PointerDragAxis.
  /// Zero starts on press for mouse and pen, or on the first nonzero touch movement.
  public prop PointerDragThreshold float64 {
    get -> declarationPointerDragThreshold
    set {
      CheckMutable()
      declarationPointerDragThreshold = value
    }
  }
  /// Gets the axis measured by the threshold. Nil measures both axes. Off-axis movement alone does not start a drag.
  public prop PointerDragAxis LayoutAxis? {
    get -> declarationPointerDragAxis
    set {
      CheckMutable()
      declarationPointerDragAxis = value
    }
  }
  /// Gets the non-bubbling lifecycle callback after this element enters the mouse hover route.
  public prop OnPointerEnter((PointerEvent) -> void)? {
    get -> InputCallbacks.BlobPointerEnter(this)
    set {
      CheckMutable()
      InputCallbacks.SetBlobPointerEnter(this, value)
      updateSparseInputState()
    }
  }
  /// Gets the non-bubbling lifecycle callback after this element leaves the mouse hover route.
  public prop OnPointerLeave((PointerEvent) -> void)? {
    get -> InputCallbacks.BlobPointerLeave(this)
    set {
      CheckMutable()
      InputCallbacks.SetBlobPointerLeave(this, value)
      updateSparseInputState()
    }
  }
  /// Gets the callback that receives pointer wheel movement.
  public prop OnWheel((WheelEvent) -> void)? {
    get -> declarationOnWheel
    set {
      CheckMutable()
      declarationOnWheel = value
    }
  }
  /// Gets key-down callbacks routed from this focused element or a focused descendant.
  public prop OnKeyDown((KeyEvent) -> void)? {
    get -> InputCallbacks.BlobKeyDown(this)
    set {
      CheckMutable()
      InputCallbacks.SetBlobKeyDown(this, value)
      updateSparseInputState()
    }
  }
  /// Gets key-up callbacks routed from this focused element or a focused descendant.
  public prop OnKeyUp((KeyEvent) -> void)? {
    get -> InputCallbacks.BlobKeyUp(this)
    set {
      CheckMutable()
      InputCallbacks.SetBlobKeyUp(this, value)
      updateSparseInputState()
    }
  }
  /// Gets the non-cancelable callback routed after this element or a descendant gains focus.
  public prop OnFocus((FocusEvent) -> void)? {
    get -> InputCallbacks.BlobFocus(this)
    set {
      CheckMutable()
      InputCallbacks.SetBlobFocus(this, value)
      updateSparseInputState()
    }
  }
  /// Gets the non-cancelable callback routed after this element or a descendant loses focus.
  public prop OnBlur((FocusEvent) -> void)? {
    get -> InputCallbacks.BlobBlur(this)
    set {
      CheckMutable()
      InputCallbacks.SetBlobBlur(this, value)
      updateSparseInputState()
    }
  }
  /// Gets the callback that receives committed UTF-16 text while this element has focus.
  public prop OnTextInput Action[string]? {
    get -> TextInputCallbacks.BlobTextInput(this)
    set {
      CheckMutable()
      TextInputCallbacks.SetBlobTextInput(this, value)
      updateSparseInputState()
    }
  }
  /// Gets the callback that receives transient IME composition updates while this element has focus.
  public prop OnTextComposition((TextCompositionEvent) -> void)? {
    get -> TextInputCallbacks.BlobTextComposition(this)
    set {
      CheckMutable()
      TextInputCallbacks.SetBlobTextComposition(this, value)
      updateSparseInputState()
    }
  }
  /// Gets the callback that receives native IME composition cancellation while this element has focus.
  public prop OnTextCompositionCancel Action? {
    get -> TextInputCallbacks.BlobTextCompositionCancel(this)
    set {
      CheckMutable()
      TextInputCallbacks.SetBlobTextCompositionCancel(this, value)
      updateSparseInputState()
    }
  }
  /// Gets the callback that receives native IME candidate updates while this element has focus.
  public prop OnTextCandidates((TextCandidateEvent) -> void)? {
    get -> TextInputCallbacks.BlobTextCandidates(this)
    set {
      CheckMutable()
      TextInputCallbacks.SetBlobTextCandidates(this, value)
      updateSparseInputState()
    }
  }
  /// Gets the optional in-app drag source descriptor.
  public prop DragSource DragSource? {
    get -> DragDropMetadata.BlobSource(this)
    set {
      CheckMutable()
      DragDropMetadata.SetBlobSource(this, value)
      updateSparseInputState()
    }
  }
  /// Gets the optional in-app drop target descriptor.
  public prop DropTarget DropTarget? {
    get -> DragDropMetadata.BlobTarget(this)
    set {
      CheckMutable()
      DragDropMetadata.SetBlobTarget(this, value)
      updateSparseInputState()
    }
  }

  /// Gets reusable touch recognizers in same-owner arbitration order.
  /// Keep declaration instances stable across rebuilds to preserve active sessions.
  public prop Gestures IReadOnlyList[GestureRecognizer]? {
    get -> GestureMetadata.Get(this)
    set {
      CheckMutable()
      GestureMetadata.Set(this, value)
      updateSparseInputState()
    }
  }

  /// Gets explicit key bindings. Focused-element bindings override built-in text editing keys.
  public prop KeyBindings ([]KeyBinding)? {
    get -> InputCallbacks.BlobBindings(this)
    set {
      CheckMutable()
      InputCallbacks.SetBlobBindings(this, value)
      updateSparseInputState()
    }
  }
  internal prop HasSparseInputState bool{ get -> (blobState & int32(32)) != 0 }
  /// Gets the style that applies while the pointer hovers this element.
  public prop HoverStyle Style? {
    get -> declarationHoverStyle
    set {
      CheckMutable()
      declarationHoverStyle = value
    }
  }
  /// Gets the style that applies while this element is active.
  public prop ActiveStyle Style? {
    get -> declarationActiveStyle
    set {
      CheckMutable()
      declarationActiveStyle = value
    }
  }
  /// Gets the style that applies while this element has focus.
  public prop FocusStyle Style? {
    get -> declarationFocusStyle
    set {
      CheckMutable()
      declarationFocusStyle = value
    }
  }
  /// Gets the style that applies while this element is disabled.
  public prop DisabledStyle Style? {
    get -> declarationDisabledStyle
    set {
      CheckMutable()
      declarationDisabledStyle = value
    }
  }
  /// Gets the transition duration in milliseconds.
  public prop TransitionMs float64{
    get -> float64(transitionMs)
    set {
      CheckMutable()
      if !motionFinite(value) {
        throw ArgumentOutOfRangeException("TransitionMs")
      }
      let packed = float32(value < 0.0 ? 0.0 : value)
      transitionMs = Single.IsInfinity(packed) ? Single.MaxValue : packed
    }
  }
  /// Gets the easing curve applied to transition progress.
  public prop TransitionEasing Easing{
    get -> Easing(blobState & int32(3))
    set {
      CheckMutable()
      let ordinal = int32(value)
      if ordinal < 0 || ordinal > 3 {
        throw ArgumentOutOfRangeException("TransitionEasing")
      }
      blobState = (blobState & ~int32(3)) | ordinal
    }
  }
  /// Gets the delay before a transition starts, in milliseconds.
  public prop TransitionDelayMs float64{
    get -> float64(transitionDelayMs)
    set {
      CheckMutable()
      if !motionFinite(value) {
        throw ArgumentOutOfRangeException("TransitionDelayMs")
      }
      let packed = float32(value < 0.0 ? 0.0 : value)
      transitionDelayMs = Single.IsInfinity(packed) ? Single.MaxValue : packed
    }
  }
  /// Gets a defensive copy of the style properties selected for transitions.
  /// All interpolable properties are selected when this property is omitted.
  public prop TransitionProperties []TransitionProperty{
    get -> transitionSelectionProperties(transitionSelection)
    set {
      CheckMutable()
      transitionSelection = makeTransitionSelection(value)
    }
  }
  internal prop TransitionSelection StyleMask{ get -> transitionSelection }
  /// Gets the opt-in transition for computed layout position changes.
  public prop LayoutTransition LayoutTransition? {
    get -> LayoutTransitionBlobs.Get(this)
    set {
      CheckMutable()
      if let next = value {
        if !validLayoutTransition(next) {
          throw ArgumentOutOfRangeException("LayoutTransition")
        }
      }
      LayoutTransitionBlobs.Set(this, value)
    }
  }
  /// Reports whether this element can receive keyboard focus.
  public prop Focusable bool{
    get -> (blobState & int32(4)) != 0
    set {
      CheckMutable()
      blobState = value ? blobState | int32(4) : blobState & ~int32(4)
    }
  }
  /// Controls whether a focusable element participates in sequential Tab navigation. Defaults to true.
  /// False preserves pointer, programmatic, and accessibility focus for composite widgets.
  public prop TabStop bool{
    get -> (blobState & int32(512)) == 0
    set {
      CheckMutable()
      blobState = value ? blobState & ~int32(512) : blobState | int32(512)
    }
  }
  /// Reports whether this element and its descendants reject input.
  public prop Disabled bool{
    get -> (blobState & int32(8)) != 0
    set {
      CheckMutable()
      blobState = value ? blobState | int32(8) : blobState & ~int32(8)
    }
  }
  /// Requests keyboard focus after mounting while nothing else holds focus.
  public prop AutoFocus bool{
    get -> (blobState & int32(16)) != 0
    set {
      CheckMutable()
      blobState = value ? blobState | int32(16) : blobState & ~int32(16)
    }
  }

  internal func updateSparseInputState() {
    blobState = InputMetadata.HasState(this) ? blobState | int32(32) : blobState & ~int32(32)
  }

  shared {
    /// Builds content from the element's allotted size in layout units. See Sized.
    /// @param build Builds content without changing State.
    /// @returns A retained element with no intrinsic size.
    public func Sized(build (LayoutSize) -> Blob) Blob -> SizedBlob(build)

    /// Builds one child per item. Children without a key get the item's key. Explicit keys stay unchanged.
    /// @typeparam T The item type.
    /// @param items The items in child order.
    /// @param itemKey Selects a stable, unique sibling key from an item.
    /// @param itemBuilder Builds the child for an item.
    /// @returns Children to spread into a container. Duplicate sibling keys are rejected during reconciliation.
    public func Each[T any](items IReadOnlyList[T], itemKey(T) -> string, itemBuilder(T) -> Blob)[]Blob ->
      eachCore[T](items, itemKey, itemBuilder)
  }
}
