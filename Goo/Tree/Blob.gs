package Goo

import System

/// Controls the built-in scrollbar presentation without changing scroll behavior.
public enum ScrollbarVisibility { Auto; Always; Hidden }

/// Defines the common surface for Goo-owned declarative elements.
public open class Blob : Style {
  private var authoredKey string?
  private var transitionMs float32
  private var transitionDelayMs float32
  private var transitionSelection StyleMask
  private var blobState int32

  internal init() {
    transitionSelection = allTransitionSelection()
  }

  internal open func coreBlob();

  /// Gets the stable key within the sibling list.
  public prop Key string? { get -> authoredKey; init -> authoredKey = value }
  internal func SetVirtualKey(value string) { authoredKey = value }
  /// Controls whether Goo auto-hides, always shows, or suppresses built-in scrollbars.
  public prop ScrollbarVisibility ScrollbarVisibility{ get; init; }
  /// Gets the consumer-owned handle attached while this element is mounted.
  public prop Handle ElementHandle? {
    get {
      return HasElementHandle ? ElementHandles.BlobHandle(this) : nil
    }
    init{
      ElementHandles.SetBlobHandle(this, value)
      blobState = value != nil ? blobState | int32(64) : blobState & ^int32(64)
      updateSparseInputState()
    }
  }
  internal prop HasElementHandle bool{ get -> (blobState & int32(64)) != 0 }

  internal func AttachRetainedHandle(handle ElementHandle?) {
    ElementHandles.SetBlobHandle(this, handle)
    blobState = handle != nil ? blobState | int32(64) : blobState & ^int32(64)
    updateSparseInputState()
  }
  /// Gets the platform-neutral accessibility declaration for this element.
  public prop Accessibility Accessibility? {
    get -> AccessibilityMetadata.BlobValue(this)
    init{
      AccessibilityMetadata.SetBlobValue(this, value)
      blobState = value != nil ? blobState | int32(128) : blobState & ^int32(128)
    }
  }
  internal prop HasAccessibility bool{ get -> (blobState & int32(128)) != 0 }
  internal prop HasPassiveTextRanges bool{
    get -> (blobState & int32(256)) != 0
    set -> blobState = value ? blobState | int32(256) : blobState & ^int32(256)
  }
  internal prop ControlledEntryValue bool{
    get -> (blobState & int32(2048)) != 0
    set -> blobState = value ? blobState | int32(2048) : blobState & ^int32(2048)
  }
  /// Gets the action that runs when the element is clicked.
  public prop OnClick Action? { get; init; }
  /// Gets the callback that receives each pointer button press.
  public prop OnPointerDown((PointerEvent) -> void)? { get; init; }
  /// Gets the callback that receives each pointer movement.
  public prop OnPointerMove((PointerEvent) -> void)? { get; init; }
  /// Gets the callback that receives each pointer button release.
  public prop OnPointerUp((PointerEvent) -> void)? { get; init; }
  /// Gets the callback that receives pointer cancellation.
  public prop OnPointerCancel((PointerEvent) -> void)? { get; init; }
  /// Gets the non-bubbling lifecycle callback after this element enters the mouse hover route.
  public prop OnPointerEnter((PointerEvent) -> void)? {
    get -> InputCallbacks.BlobPointerEnter(this)
    init{
      InputCallbacks.SetBlobPointerEnter(this, value)
      updateSparseInputState()
    }
  }
  /// Gets the non-bubbling lifecycle callback after this element leaves the mouse hover route.
  public prop OnPointerLeave((PointerEvent) -> void)? {
    get -> InputCallbacks.BlobPointerLeave(this)
    init{
      InputCallbacks.SetBlobPointerLeave(this, value)
      updateSparseInputState()
    }
  }
  /// Gets the callback that receives pointer wheel movement.
  public prop OnWheel((WheelEvent) -> void)? { get; init; }
  /// Gets key-down callbacks routed from this focused element or a focused descendant.
  public prop OnKeyDown((KeyEvent) -> void)? {
    get -> InputCallbacks.BlobKeyDown(this)
    init{
      InputCallbacks.SetBlobKeyDown(this, value)
      updateSparseInputState()
    }
  }
  /// Gets key-up callbacks routed from this focused element or a focused descendant.
  public prop OnKeyUp((KeyEvent) -> void)? {
    get -> InputCallbacks.BlobKeyUp(this)
    init{
      InputCallbacks.SetBlobKeyUp(this, value)
      updateSparseInputState()
    }
  }
  /// Gets the non-cancelable callback routed after this element or a descendant gains focus.
  public prop OnFocus((FocusEvent) -> void)? {
    get -> InputCallbacks.BlobFocus(this)
    init{
      InputCallbacks.SetBlobFocus(this, value)
      updateSparseInputState()
    }
  }
  /// Gets the non-cancelable callback routed after this element or a descendant loses focus.
  public prop OnBlur((FocusEvent) -> void)? {
    get -> InputCallbacks.BlobBlur(this)
    init{
      InputCallbacks.SetBlobBlur(this, value)
      updateSparseInputState()
    }
  }
  /// Gets the callback that receives committed UTF-16 text while this element has focus.
  public prop OnTextInput Action[string]? {
    get -> TextInputCallbacks.BlobTextInput(this)
    init{
      TextInputCallbacks.SetBlobTextInput(this, value)
      updateSparseInputState()
    }
  }
  /// Gets the callback that receives transient IME composition updates while this element has focus.
  public prop OnTextComposition((TextCompositionEvent) -> void)? {
    get -> TextInputCallbacks.BlobTextComposition(this)
    init{
      TextInputCallbacks.SetBlobTextComposition(this, value)
      updateSparseInputState()
    }
  }
  /// Gets the callback that receives native IME composition cancellation while this element has focus.
  public prop OnTextCompositionCancel Action? {
    get -> TextInputCallbacks.BlobTextCompositionCancel(this)
    init{
      TextInputCallbacks.SetBlobTextCompositionCancel(this, value)
      updateSparseInputState()
    }
  }
  /// Gets the callback that receives native IME candidate updates while this element has focus.
  public prop OnTextCandidates((TextCandidateEvent) -> void)? {
    get -> TextInputCallbacks.BlobTextCandidates(this)
    init{
      TextInputCallbacks.SetBlobTextCandidates(this, value)
      updateSparseInputState()
    }
  }
  /// Gets the optional in-app drag source descriptor.
  public prop DragSource DragSource? {
    get -> DragDropMetadata.BlobSource(this)
    init{
      DragDropMetadata.SetBlobSource(this, value)
      updateSparseInputState()
    }
  }
  /// Gets the optional in-app drop target descriptor.
  public prop DropTarget DropTarget? {
    get -> DragDropMetadata.BlobTarget(this)
    init{
      DragDropMetadata.SetBlobTarget(this, value)
      updateSparseInputState()
    }
  }
  /// Gets explicit key bindings. Primitives have no built-in keyboard bindings.
  public prop KeyBindings ([]KeyBinding)? {
    get -> InputCallbacks.BlobBindings(this)
    init {
      InputCallbacks.SetBlobBindings(this, value)
      updateSparseInputState()
    }
  }
  internal prop HasSparseInputState bool{ get -> (blobState & int32(32)) != 0 }
  /// Gets the style that applies while the pointer hovers this element.
  public prop Hover Style? { get; init; }
  /// Gets the style that applies while this element is active.
  public prop Active Style? { get; init; }
  /// Gets the style that applies while this element has focus.
  public prop Focus Style? { get; init; }
  /// Gets the style that applies while this element is disabled.
  public prop DisabledStyle Style? { get; init; }
  /// Gets the transition duration in milliseconds.
  public prop TransitionMs float64{
    get -> float64(transitionMs)
    init{
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
    init{
      let ordinal = int32(value)
      if ordinal < 0 || ordinal > 3 {
        throw ArgumentOutOfRangeException("TransitionEasing")
      }
      blobState = (blobState & ^int32(3)) | ordinal
    }
  }
  /// Gets the delay before a transition starts, in milliseconds.
  public prop TransitionDelayMs float64{
    get -> float64(transitionDelayMs)
    init{
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
    init -> transitionSelection = makeTransitionSelection(value)
  }
  internal prop TransitionSelection StyleMask{ get -> transitionSelection }
  /// Gets the opt-in transition for computed layout position changes.
  public prop LayoutTransition LayoutTransition? {
    get -> LayoutTransitionBlobs.Get(this)
    init{
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
    init{
      blobState = value ? blobState | int32(4) : blobState & ^int32(4)
    }
  }
  /// Controls whether a focusable element participates in sequential Tab navigation. Defaults to true.
  /// False preserves pointer, programmatic, and accessibility focus for composite widgets.
  public prop TabStop bool{
    get -> (blobState & int32(512)) == 0
    init -> blobState = value ? blobState & ^int32(512) : blobState | int32(512)
  }
  /// Reports whether this element and its descendants reject input.
  public prop Disabled bool{
    get -> (blobState & int32(8)) != 0
    init{
      blobState = value ? blobState | int32(8) : blobState & ^int32(8)
    }
  }
  /// Requests keyboard focus after mounting while nothing else holds focus.
  public prop AutoFocus bool{
    get -> (blobState & int32(16)) != 0
    init{
      blobState = value ? blobState | int32(16) : blobState & ^int32(16)
    }
  }

  private func updateSparseInputState() {
    blobState = InputMetadata.HasState(this) ? blobState | int32(32) : blobState & ^int32(32)
  }
}
