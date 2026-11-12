package Goo

import System
import System.Collections.Generic

internal enum NodeKind { Container; Button; Text; Entry; Editor; Shape; Image;
}

internal data struct Rect {
  internal var X float32
  internal var Y float32
  internal var W float32
  internal var H float32

  internal func Contains(x float32, y float32) bool -> x >= X && y >= Y && x < X + W && y < Y + H
}

internal class Node {
  private var transitionMs float32
  private var transitionDelayMs float32
  private var transitionSelection StyleMask
  private var nodeState int32
  private var lifecycleState uint16
  private var scenePaintVersion uint64
  private var mountGeneration uint64 = 1uL
  private var rect Rect
  private var scrollX float32
  private var scrollY float32
  private var parent Node?
  private var focused bool
  private var editingState NodeEditingState?
  private var shapeState NodeShapeState?
  private var pointerState NodePointerState?
  private var portalState NodePortalState?
  private var hitContained bool

  internal prop HitContained bool{
    get -> hitContained
    set {
      hitContained = value
      if !value {
        var ancestor = Parent
        while let node = ancestor {
          if !node.hitContained { break }
          node.hitContained = false
          ancestor = node.Parent
        }
      }
    }
  }

  private func EnsureEditingState() NodeEditingState {
    if let state = editingState { return state }
    let state = NodeEditingState()
    editingState = state
    return state
  }

  private func EnsureShapeState() NodeShapeState {
    if let state = shapeState { return state }
    let state = NodeShapeState()
    shapeState = state
    return state
  }

  private func EnsurePointerState() NodePointerState {
    if let state = pointerState { return state }
    let state = NodePointerState()
    pointerState = state
    return state
  }

  private func EnsurePortalState() NodePortalState {
    if let state = portalState { return state }
    let state = NodePortalState()
    portalState = state
    return state
  }

  internal prop ScenePaintVersion uint64{ get -> scenePaintVersion }
  internal prop MountGeneration uint64{ get -> mountGeneration }

  internal func TryBeginRebind() bool {
    if !Retired { throw InvalidOperationException("Node storage must be retired before rebinding") }
    if mountGeneration == uint64.MaxValue { return false }
    MarkSceneDirty()
    mountGeneration++
    lifecycleState = lifecycleState & ~uint16(4)
    return true
  }

  internal prop NeedsYogaBinding bool{
    get -> (lifecycleState & uint16(4096)) != uint16(0)
    set -> lifecycleState = value ? lifecycleState | uint16(4096) : lifecycleState & ~uint16(4096)
  }

  internal func ResetForReuse() {
    if !Retired { throw InvalidOperationException("Node storage must be retired before reset") }
    editingState = nil
    shapeState = nil
    pointerState = nil
    portalState = nil
    nodeState = 0
    AutoFocus = false
    HasFocusScopes = false
    FocusScopeBoundary = false
    TabStop = true
    HasElementHandle = false
    HasAccessibilityDeclaration = false
    HasAccessibilityNodeState = false
    HasSparseInputState = false
    HasDirectImageSourceState = false
    Password = false
    PortalAnchorClipped = false
    NeedsYogaBinding = true
    HasCustomLayout = false
    HitContained = false
    Key = nil
    Parent = nil
    Context = nil
    CallbackOwner = nil
    Content = ""
    Rect = Rect{}
    BaseStyle = nil
    HoverStyle = nil
    FocusStyle = nil
    ActiveStyle = nil
    DisabledStyle = nil
    transitionMs = 0.0F
    transitionDelayMs = 0.0F
    transitionSelection = allTransitionSelection()
    Hovered = false
    Focused = false
    FocusVisible = false
    Pressed = false
    KeyboardPressed = false
    PointerPressCount = 0
    LocalMask = StyleMask{}
    AppliedMask = StyleMask{}
    Transitions = nil
    PaintBindings = nil
    PaintBindingResolver = nil
    TextLayout = nil
    TextLayoutCache = nil
    StyleQueuedPass = 0
    StyleResolvedPass = 0
    StylePendingSelf = false
    StylePendingInitial = false
    StylePendingInheritedMask = StyleMask{}
    Fiber = nil
    ScrollX = 0.0F
    ScrollY = 0.0F
    PlacedScrollX = 0.0F
    PlacedScrollY = 0.0F
    ScrollTargetX = 0.0F
    ScrollTargetY = 0.0F
    ContentW = 0.0F
    ContentH = 0.0F
    TextScaleFactor = 1.0F
    DecodedImage = nil
    ImageIntrinsicWidth = 0.0F
    ImageIntrinsicHeight = 0.0F
    ImageFit = ImageFit.Contain
    BackgroundImageFit = ImageFit.Cover
    ClipPathFillRule = FillRule.NonZero
    PortalPlacementHidden = false
    DragsWindow = false
    HitTestSelf = true
    VulkanOwner = nil
    VulkanOwnerToken = nil
    if let yoga = Yoga {
      yoga.SetContext(nil)
      yoga.SetDirtiedFunc(nil)
      yoga.MarkDirtyAndPropagate()
    }
    ApplyAllDefaults(this)
    BumpScenePaintVersion()
  }

  internal var VulkanOwnerToken object?
  internal var VulkanOwner VulkanSceneOwnerId?
  internal var PaintBindings List[PaintBinding]?
  internal var PaintBindingResolver Resolver?

  internal func BumpScenePaintVersion() {
    scenePaintVersion = scenePaintVersion == uint64.MaxValue
    ? 1uL : scenePaintVersion + 1uL
    MarkSceneDirty()
  }

  internal prop SceneSubtreeDirty bool {
    get -> (lifecycleState & uint16(16384)) != uint16(0)
    set -> lifecycleState = value ? lifecycleState | uint16(16384) : lifecycleState & ~uint16(16384)
  }

  internal prop SceneContentDirty bool {
    get -> (lifecycleState & uint16(8192)) != uint16(0)
    set -> lifecycleState = value ? lifecycleState | uint16(8192) : lifecycleState & ~uint16(8192)
  }

  internal prop SceneResourcesDirty bool {
    get -> (lifecycleState & uint16(32768)) != uint16(0)
    set -> lifecycleState = value ? lifecycleState | uint16(32768) : lifecycleState & ~uint16(32768)
  }

  internal func MarkSceneResourcesDirty() {
    SceneResourcesDirty = true
    MarkSceneDirty()
  }

  internal func MarkSceneDirty(content bool = true) {
    var current Node? = this
    var markContent = content
    while let node = current {
      node.SceneSubtreeDirty = true
      if markContent { node.SceneContentDirty = true }
      let parent = node.Parent
      markContent = true
      if let owner = parent {
        if !owner.SceneContentDirty
          && (owner.Kind == NodeKind.Editor || owner.OverflowX == Overflow.Scroll || owner.OverflowY == Overflow.Scroll) {
          markContent = !ScrollbarParts.Children(owner).Contains(node)
        }
      }
      current = parent
    }
  }

  internal func MarkSceneChromeDirty() {
    MarkSceneDirty(false)
  }

  internal prop Kind NodeKind{ get; set; }
  internal var IsPortal bool
  internal prop PortalAnchor ElementHandle?{
    get -> portalState?.PortalAnchor
    set {
      if portalState == nil && value == nil { return }
      EnsurePortalState().PortalAnchor = value
    }
  }
  internal prop PortalPlacement PortalPlacement{
    get -> portalState?.PortalPlacement ?? PortalPlacement.BottomStart
    set -> EnsurePortalState().PortalPlacement = value
  }
  internal prop PortalBounds PortalPlacementBounds?{
    get -> portalState?.PortalBounds
    set {
      if portalState == nil && value == nil { return }
      EnsurePortalState().PortalBounds = value
    }
  }
  internal prop PortalAnchorBounds Rect{
    get -> portalState?.PortalAnchorBounds ?? Rect{}
    set -> EnsurePortalState().PortalAnchorBounds = value
  }
  internal prop PortalAnchorResolved bool{
    get -> portalState?.PortalAnchorResolved ?? false
    set -> EnsurePortalState().PortalAnchorResolved = value
  }
  internal var PortalPlacementHidden bool
  internal prop PortalAnchorClipped bool {
    get -> (lifecycleState & uint16(2048)) != uint16(0)
    set -> lifecycleState = value ? lifecycleState | uint16(2048) : lifecycleState & ~uint16(2048)
  }
  internal prop HasCustomLayout bool{ get; set; }
  internal prop Key string? { get; set; }
  internal prop Parent Node? {
    get -> parent
    set {
      if parent == value { return }
      parent?.MarkSceneDirty()
      parent = value
      MarkSceneDirty()
    }
  }
  internal var Context ContextFrame?
  internal prop Children IList[Node]{ get; init; }
  internal prop Content string{ get; set; }
  internal prop Rect Rect {
    get -> rect
    set {
      if BitConverter.SingleToInt32Bits(rect.X) == BitConverter.SingleToInt32Bits(value.X)
        && BitConverter.SingleToInt32Bits(rect.Y) == BitConverter.SingleToInt32Bits(value.Y)
        && BitConverter.SingleToInt32Bits(rect.W) == BitConverter.SingleToInt32Bits(value.W)
        && BitConverter.SingleToInt32Bits(rect.H) == BitConverter.SingleToInt32Bits(value.H) { return }
      rect = value
      BumpScenePaintVersion()
    }
  }
  internal prop Yoga Facebook.Yoga.Node? { get; set; }
  internal prop YogaStyleMask StyleMask{ get; set; }
  internal prop Width Length{ get; set; }
  internal prop Height Length{ get; set; }
  internal prop MinWidth Length{ get; set; }
  internal prop MinHeight Length{ get; set; }
  internal prop MaxWidth Length{ get; set; }
  internal prop MaxHeight Length{ get; set; }
  internal prop AspectRatio float64{ get; set; }
  internal prop Padding Length{ get; set; }
  internal prop PaddingLeft Length{ get; set; }
  internal prop PaddingTop Length{ get; set; }
  internal prop PaddingRight Length{ get; set; }
  internal prop PaddingBottom Length{ get; set; }
  internal prop Margin Length{ get; set; }
  internal prop MarginLeft Length{ get; set; }
  internal prop MarginTop Length{ get; set; }
  internal prop MarginRight Length{ get; set; }
  internal prop MarginBottom Length{ get; set; }
  internal prop Gap Length{ get; set; }
  internal prop RowGap Length{ get; set; }
  internal prop ColumnGap Length{ get; set; }
  internal prop FlexDirection FlexDirection{ get; set; }
  internal prop FlexWrap FlexWrap{ get; set; }
  internal prop JustifyContent JustifyContent{ get; set; }
  internal prop AlignItems AlignItems{ get; set; }
  internal prop AlignSelf AlignSelf{ get; set; }
  internal prop AlignContent AlignContent{ get; set; }
  internal prop FlexGrow float64{ get; set; }
  internal prop FlexShrink float64{ get; set; }
  internal prop FlexBasis Length{ get; set; }
  internal prop Position PositionType{ get; set; }
  internal prop Left Length{ get; set; }
  internal prop Top Length{ get; set; }
  internal prop Right Length{ get; set; }
  internal prop Bottom Length{ get; set; }
  internal prop Display Display{
    get -> (nodeState & int32(1)) != 0 ? Display.None : Display.Flex
    set {
      nodeState = value == Display.None
      ? nodeState | int32(1) : nodeState & ~int32(1)
    }
  }
  internal prop Direction Direction{
    get -> Direction((nodeState >> 10) & int32(3))
    set {
      nodeState = (nodeState & ~int32(3072)) | ((int32(value) & int32(3)) << 10)
    }
  }
  internal prop OverflowX Overflow{ get; set; }
  internal prop OverflowY Overflow{ get; set; }
  internal prop BackgroundColor Color{ get; set; }
  internal prop BackgroundGradient Gradient? { get; set; }
  internal prop BorderRadius Length{ get; set; }
  internal prop BorderTopLeftRadius Length{ get; set; }
  internal prop BorderTopRightRadius Length{ get; set; }
  internal prop BorderBottomLeftRadius Length{ get; set; }
  internal prop BorderBottomRightRadius Length{ get; set; }
  internal prop BorderLeftWidth Length{ get; set; }
  internal prop BorderTopWidth Length{ get; set; }
  internal prop BorderRightWidth Length{ get; set; }
  internal prop BorderBottomWidth Length{ get; set; }
  internal prop BorderLeftColor Color{ get; set; }
  internal prop BorderTopColor Color{ get; set; }
  internal prop BorderRightColor Color{ get; set; }
  internal prop BorderBottomColor Color{ get; set; }
  internal prop OutlineWidth Length{
    get -> Outlining.GetWidth(this)
    set -> Outlining.SetWidth(this, value)
  }
  internal prop OutlineColor Color{
    get -> Outlining.GetColor(this)
    set -> Outlining.SetColor(this, value)
  }
  internal prop OutlineOffset Length{
    get -> Outlining.GetOffset(this)
    set -> Outlining.SetOffset(this, value)
  }
  internal prop Opacity float64{ get; set; }
  internal prop BackdropBlur float32{ get; set; }
  internal prop BoxShadows BoxShadowStack? { get; set; }
  internal prop TextShadows BoxShadowStack? {
    get -> TextShadowing.Get(this)
    set -> TextShadowing.Set(this, value)
  }
  internal prop FontSize Length{ get; set; }
  internal prop Color Color{ get; set; }
  internal prop FontWeight float64{ get; set; }
  internal prop FontStyle FontStyle{ get; set; }
  internal prop LetterSpacing Length{ get; set; }
  internal prop LineHeight float64{ get; set; }
  internal prop TextAlign TextAlign{ get; set; }
  internal prop TextDecoration TextDecoration{
    get -> TextDecoration((nodeState >> 2) & int32(3))
    set {
      nodeState = (nodeState & ~int32(12)) | ((int32(value) & int32(3)) << 2)
    }
  }
  internal prop TextTransform TextTransform{
    get -> TextTransform((nodeState >> 6) & int32(3))
    set {
      nodeState = (nodeState & ~int32(192)) | ((int32(value) & int32(3)) << 6)
    }
  }
  internal prop HasTransformState bool{
    get -> (nodeState & int32(16)) != 0
    set {
      nodeState = value ? nodeState | int32(16) : nodeState & ~int32(16)
    }
  }
  internal prop HasVisualTransform bool{
    get -> (nodeState & int32(32)) != 0
    set {
      nodeState = value ? nodeState | int32(32) : nodeState & ~int32(32)
      if value { if let parent = Parent { parent.HitContained = false } }
    }
  }
  internal prop HasTextShadowState bool{
    get -> (nodeState & int32(256)) != 0
    set {
      nodeState = value ? nodeState | int32(256) : nodeState & ~int32(256)
    }
  }
  internal prop HasTextStrokeState bool{
    get -> (nodeState & int32(512)) != 0
    set {
      nodeState = value ? nodeState | int32(512) : nodeState & ~int32(512)
    }
  }
  internal prop TextStrokeWidth Length{
    get -> TextStroking.GetWidth(this)
    set -> TextStroking.SetWidth(this, value)
  }
  internal prop TextStrokeColor Color{
    get -> TextStroking.GetColor(this)
    set -> TextStroking.SetColor(this, value)
  }
  internal prop FontFamily string{ get; set; }
  internal prop Language string{ get; set; }
  internal var TextScaleFactor float32 = 1.0F
  internal prop TextMaxLines int32{ get; set; }
  internal prop TextLayout TextLayout? { get; set; }
  internal prop TextLayoutCache List[TextLayout]? { get; set; }
  internal prop EntryShape EntryShapeState?{
    get -> editingState?.EntryShape
    set {
      if editingState == nil && value == nil { return }
      EnsureEditingState().EntryShape = value
    }
  }
  internal prop EntryHistory EntryUndoHistory?{
    get -> editingState?.EntryHistory
    set {
      if editingState == nil && value == nil { return }
      EnsureEditingState().EntryHistory = value
    }
  }
  internal prop EditorBinding TextEditorBinding?{
    get -> editingState?.EditorBinding
    set {
      if editingState == nil && value == nil { return }
      EnsureEditingState().EditorBinding = value
    }
  }
  internal prop EditorController TextEditorController? {
    get -> EditorBinding?.Controller
  }
  internal prop EditorState TextEditorRenderState? { get -> EditorBinding?.RenderState
  }
  internal prop EditorReadOnly bool{
    get -> editingState?.EditorReadOnly ?? false
    set -> EnsureEditingState().EditorReadOnly = value
  }
  internal prop InputOptions TextInputOptions?{
    get -> editingState?.InputOptions
    set {
      if editingState == nil && value == nil { return }
      EnsureEditingState().InputOptions = value
    }
  }
  internal prop EditorCaretColor Color{
    get -> editingState?.EditorCaretColor ?? Color{}
    set -> EnsureEditingState().EditorCaretColor = value
  }
  internal prop EditorCurrentLineColor Color{
    get -> editingState?.EditorCurrentLineColor ?? Color{}
    set -> EnsureEditingState().EditorCurrentLineColor = value
  }
  internal prop EditorShowLineNumbers bool{
    get -> editingState?.EditorShowLineNumbers ?? false
    set -> EnsureEditingState().EditorShowLineNumbers = value
  }
  internal prop EditorLineNumberColor Color{
    get -> editingState?.EditorLineNumberColor ?? Color{}
    set -> EnsureEditingState().EditorLineNumberColor = value
  }
  internal prop EditorOverscanLines int32{
    get -> editingState?.EditorOverscanLines ?? 0
    set -> EnsureEditingState().EditorOverscanLines = value
  }
  internal prop EditorOnChange Action[TextDocumentChange]?{
    get -> editingState?.EditorOnChange
    set {
      if editingState == nil && value == nil { return }
      EnsureEditingState().EditorOnChange = value
    }
  }
  internal prop EditorOnSubmit Action?{
    get -> editingState?.EditorOnSubmit
    set {
      if editingState == nil && value == nil { return }
      EnsureEditingState().EditorOnSubmit = value
    }
  }
  internal prop EditorSlotRange TextRange{
    get -> editingState?.EditorSlotRange ?? TextRange{}
    set -> EnsureEditingState().EditorSlotRange = value
  }
  internal prop EditorSlotKey string{
    get -> editingState?.EditorSlotKey ?? ""
    set -> EnsureEditingState().EditorSlotKey = value
  }
  internal prop EditorSlotBlock bool{
    get -> editingState?.EditorSlotBlock ?? false
    set -> EnsureEditingState().EditorSlotBlock = value
  }

  internal prop BaseStyle StyleEntries? { get; set; }
  internal prop HoverStyle StyleEntries? { get; set; }
  internal prop FocusStyle StyleEntries? { get; set; }
  internal prop ActiveStyle StyleEntries? { get; set; }
  internal prop DisabledStyle StyleEntries? { get; set; }
  internal prop TransitionMs float64{
    get -> float64(transitionMs)
    set -> transitionMs = float32(value)
  }
  internal prop TransitionEasing Easing{
    get -> Easing((nodeState >> 26) & int32(3))
    set {
      let ordinal = int32(value)
      if ordinal < 0 || ordinal > 3 {
        throw ArgumentOutOfRangeException("TransitionEasing")
      }
      nodeState = (nodeState & ~(int32(3) << 26)) | (ordinal << 26)
    }
  }
  internal prop TransitionDelayMs float64{
    get -> float64(transitionDelayMs)
    set -> transitionDelayMs = float32(value)
  }
  internal prop TransitionSelection StyleMask{
    get -> transitionSelection
    set -> transitionSelection = value
  }
  internal prop Focusable bool{
    get -> (nodeState & (int32(1) << 14)) != 0
    set {
      nodeState = value ? nodeState | (int32(1) << 14) : nodeState & ~(int32(1) << 14)
    }
  }
  internal prop AutoFocus bool{
    get -> (lifecycleState & uint16(2)) != uint16(0)
    set {
      lifecycleState = value ? lifecycleState | uint16(2) : lifecycleState & ~uint16(2)
    }
  }
  internal prop HasFocusScopes bool{
    get -> (lifecycleState & uint16(512)) != uint16(0)
    set -> lifecycleState = value ? lifecycleState | uint16(512) : lifecycleState & ~uint16(512)
  }
  internal prop FocusScopeBoundary bool{
    get -> (lifecycleState & uint16(1024)) != uint16(0)
    set -> lifecycleState = value ? lifecycleState | uint16(1024) : lifecycleState & ~uint16(1024)
  }
  internal prop TabStop bool{
    get -> (lifecycleState & uint16(256)) == uint16(0)
    set -> lifecycleState = value ? lifecycleState & ~uint16(256) : lifecycleState | uint16(256)
  }
  internal prop Disabled bool{
    get -> (nodeState & (int32(1) << 15)) != 0
    set {
      nodeState = value ? nodeState | (int32(1) << 15) : nodeState & ~(int32(1) << 15)
    }
  }
  internal prop Cursor Cursor{
    get -> Cursor((nodeState >> 16) & int32(31))
    set {
      nodeState = (nodeState & ~(int32(31) << 16))
      | ((int32(value) & int32(31)) << 16)
    }
  }
  internal prop TextWrap TextWrap{
    get -> (nodeState & (int32(1) << 21)) != 0 ? TextWrap.NoWrap : TextWrap.Wrap
    set {
      nodeState = value == TextWrap.NoWrap ? nodeState | (int32(1) << 21) : nodeState & ~(int32(1) << 21)
    }
  }
  internal prop TextTrimming TextTrimming{
    get -> (nodeState & (int32(1) << 22)) != 0 ? TextTrimming.Ellipsis : TextTrimming.None
    set {
      nodeState = value == TextTrimming.Ellipsis ? nodeState | (int32(1) << 22) : nodeState & ~(int32(1) << 22)
    }
  }
  internal prop HasOutlineState bool{
    get -> (nodeState & (int32(1) << 23)) != 0
    set {
      nodeState = value ? nodeState | (int32(1) << 23) : nodeState & ~(int32(1) << 23)
    }
  }
  internal prop Visibility Visibility{
    get -> (nodeState & int32(2)) != 0 ? Visibility.Hidden : Visibility.Visible
    set {
      nodeState = value == Visibility.Hidden
      ? nodeState | int32(2) : nodeState & ~int32(2)
    }
  }
  internal prop PaintInputState int32{ get -> nodeState & int32(3) }
  internal prop PaintInputHidden bool{ get -> (nodeState & int32(3)) != 0 || PortalPlacementHidden || PortalAnchorClipped }
  internal prop StackingChildren bool{
    get -> (nodeState & (int32(1) << 24)) != 0
    set {
      nodeState = value ? nodeState | (int32(1) << 24) : nodeState & ~(int32(1) << 24)
    }
  }
  internal prop HasZIndex bool{
    get -> (nodeState & (int32(1) << 25)) != 0
    set {
      nodeState = value ? nodeState | (int32(1) << 25) : nodeState & ~(int32(1) << 25)
    }
  }
  internal prop HasBackgroundImageState bool{
    get -> (nodeState & (int32(1) << 28)) != 0
    set {
      nodeState = value ? nodeState | (int32(1) << 28) : nodeState & ~(int32(1) << 28)
    }
  }
  internal prop BackgroundImageFit ImageFit{
    get -> ImageFit((nodeState >> 29) & int32(3))
    set {
      nodeState = (nodeState & ~(int32(3) << 29)) | ((int32(value) & int32(3)) << 29)
    }
  }
  internal prop HasClipPath bool{
    get -> (nodeState & (int32(1) << 31)) != 0
    set {
      nodeState = value ? nodeState | (int32(1) << 31) : nodeState & ~(int32(1) << 31)
    }
  }
  internal prop ClipPathFillRule FillRule{ get; set; }
  internal prop ZIndex int32{
    get -> Stacking.GetZIndex(this)
    set -> Stacking.SetZIndex(this, value)
  }
  internal prop BorderStyle BorderStyle{ get; set; }
  internal prop BlendMode BlendMode{ get; set; }
  internal prop ShaderEffect ShaderEffect? { get -> ShaderEffectStyles.Get(this) }
  internal prop Hovered bool{ get; set; }
  internal prop Pressed bool{ get; set; }
  internal prop PointerPressCount int32{ get; set; }
  internal prop KeyboardPressed bool{ get; set; }
  internal prop Focused bool {
    get -> focused
    set {
      if focused == value { return }
      focused = value
      BumpScenePaintVersion()
    }
  }
  internal prop FocusVisible bool{ get; set; }
  internal prop LocalMask StyleMask{ get; set; }
  internal prop AppliedMask StyleMask{ get; set; }
  internal prop Transitions List[Transition]? { get; set; }
  internal prop StyleQueuedPass int64{ get; set; }
  internal prop StyleResolvedPass int64{ get; set; }
  internal prop StylePendingSelf bool{ get; set; }
  internal prop StylePendingInitial bool{ get; set; }
  internal prop StylePendingInheritedMask StyleMask{ get; set; }
  internal prop Retired bool{
    get -> (lifecycleState & uint16(4)) != uint16(0)
    set {
      if Retired == value { return }
      MarkSceneDirty()
      lifecycleState = value ? lifecycleState | uint16(4) : lifecycleState & ~uint16(4)
    }
  }
  internal prop HasElementHandle bool{
    get -> (lifecycleState & uint16(8)) != uint16(0)
    set {
      lifecycleState = value ? lifecycleState | uint16(8) : lifecycleState & ~uint16(8)
    }
  }
  internal prop HasAccessibilityDeclaration bool{
    get -> (lifecycleState & uint16(16)) != uint16(0)
    set {
      lifecycleState = value ? lifecycleState | uint16(16) : lifecycleState & ~uint16(16)
    }
  }
  internal prop HasAccessibilityNodeState bool{
    get -> (lifecycleState & uint16(32)) != uint16(0)
    set {
      lifecycleState = value ? lifecycleState | uint16(32) : lifecycleState & ~uint16(32)
    }
  }
  internal prop HasSparseInputState bool{
    get -> (lifecycleState & uint16(1)) != uint16(0)
    set {
      lifecycleState = value ? lifecycleState | uint16(1) : lifecycleState & ~uint16(1)
    }
  }
  internal prop HasDirectImageSourceState bool{
    get -> (lifecycleState & uint16(64)) != uint16(0)
    set {
      lifecycleState = value ? lifecycleState | uint16(64) : lifecycleState & ~uint16(64)
    }
  }
  internal prop Password bool{
    get -> (lifecycleState & uint16(128)) != uint16(0)
    set {
      lifecycleState = value ? lifecycleState | uint16(128) : lifecycleState & ~uint16(128)
    }
  }

  internal prop OnClick Action?{
    get -> pointerState?.OnClick
    set {
      if pointerState == nil && value == nil { return }
      EnsurePointerState().OnClick = value
    }
  }
  internal prop OnPointerDown ((PointerEvent) -> void)?{
    get -> pointerState?.OnPointerDown
    set {
      if pointerState == nil && value == nil { return }
      EnsurePointerState().OnPointerDown = value
    }
  }
  internal prop OnPointerMove ((PointerEvent) -> void)?{
    get -> pointerState?.OnPointerMove
    set {
      if pointerState == nil && value == nil { return }
      EnsurePointerState().OnPointerMove = value
    }
  }
  internal prop OnPointerUp ((PointerEvent) -> void)?{
    get -> pointerState?.OnPointerUp
    set {
      if pointerState == nil && value == nil { return }
      EnsurePointerState().OnPointerUp = value
    }
  }
  internal prop OnPointerCancel ((PointerEvent) -> void)?{
    get -> pointerState?.OnPointerCancel
    set {
      if pointerState == nil && value == nil { return }
      EnsurePointerState().OnPointerCancel = value
    }
  }
  internal prop OnPointerDrag ((PointerDragEvent) -> void)? {
    get -> pointerState?.OnPointerDrag
    set {
      if pointerState == nil && value == nil { return }
      EnsurePointerState().OnPointerDrag = value
    }
  }
  internal prop PointerDragThreshold float64 {
    get -> pointerState?.PointerDragThreshold ?? 0.0
    set {
      if pointerState == nil && value == 0.0 { return }
      EnsurePointerState().PointerDragThreshold = value
    }
  }
  internal prop OnWheel ((WheelEvent) -> void)?{
    get -> pointerState?.OnWheel
    set {
      if pointerState == nil && value == nil { return }
      EnsurePointerState().OnWheel = value
    }
  }
  internal prop Fiber Cell? { get; set; }
  internal prop CallbackOwner Cell? { get; set; }
  internal prop ScrollX float32{
    get -> scrollX
    set {
      if scrollX == value { return }
      scrollX = value
      MarkSceneChromeDirty()
    }
  }
  internal prop ScrollY float32{
    get -> scrollY
    set {
      if scrollY == value { return }
      scrollY = value
      MarkSceneChromeDirty()
    }
  }
  internal prop PlacedScrollX float32{ get; set; }
  internal prop PlacedScrollY float32{ get; set; }
  internal prop ScrollTargetX float32{ get; set; }
  internal prop ScrollTargetY float32{ get; set; }
  internal prop ContentW float32{ get; set; }
  internal prop ContentH float32{ get; set; }
  internal prop ScrollBarAlpha float32{
    get -> if let state = ScrollActivityStates.TryGet(this) {
      MathF.Max(state.Horizontal.Alpha, state.Vertical.Alpha)
    } else { 0.0F }
  }
  internal prop ScrollbarVisibilityX ScrollbarVisibility{
    get -> ScrollbarStyles.GetVisibilityX(this)
    set(v) -> ScrollbarStyles.SetVisibilityX(this, v)
  }
  internal prop ScrollbarVisibilityY ScrollbarVisibility{
    get -> ScrollbarStyles.GetVisibilityY(this)
    set(v) -> ScrollbarStyles.SetVisibilityY(this, v)
  }
  internal prop ScrollbarX Scrollbar?{
    get -> ScrollbarStyles.GetX(this)
    set(v) -> ScrollbarStyles.SetX(this, v)
  }
  internal prop ScrollbarY Scrollbar?{
    get -> ScrollbarStyles.GetY(this)
    set(v) -> ScrollbarStyles.SetY(this, v)
  }
  internal prop DragsWindow bool{ get; set }
  internal prop HitTestSelf bool{ get; set; }
  internal prop ShapePath VectorPath{
    get -> shapeState?.ShapePath ?? VectorPath.Empty
    set -> EnsureShapeState().ShapePath = value
  }
  internal prop ShapeFit ShapeFit{
    get -> shapeState?.ShapeFit ?? ShapeFit.Contain
    set -> EnsureShapeState().ShapeFit = value
  }
  internal prop ShapeFillRule FillRule{
    get -> shapeState?.ShapeFillRule ?? FillRule.NonZero
    set -> EnsureShapeState().ShapeFillRule = value
  }
  internal prop ShapeUseCurrentColor bool{
    get -> shapeState?.ShapeUseCurrentColor ?? false
    set -> EnsureShapeState().ShapeUseCurrentColor = value
  }
  internal prop ShapeStrokeCap StrokeCap{
    get -> shapeState?.ShapeStrokeCap ?? StrokeCap.Butt
    set -> EnsureShapeState().ShapeStrokeCap = value
  }
  internal prop ShapeStrokeJoin StrokeJoin{
    get -> shapeState?.ShapeStrokeJoin ?? StrokeJoin.Miter
    set -> EnsureShapeState().ShapeStrokeJoin = value
  }
  internal prop ShapeVectorEffect VectorEffect{
    get -> shapeState?.ShapeVectorEffect ?? VectorEffect.None
    set {
      EnsureShapeState().ShapeVectorEffect = value
      if value == VectorEffect.NonScalingStroke { HitContained = false }
    }
  }
  internal prop MiterLimit float64{
    get -> shapeState?.MiterLimit ?? 4.0
    set -> EnsureShapeState().MiterLimit = value
  }
  internal prop StrokeStart float64{
    get -> shapeState?.StrokeStart ?? 0.0
    set -> EnsureShapeState().StrokeStart = value
  }
  internal prop StrokeEnd float64{
    get -> shapeState?.StrokeEnd ?? 1.0
    set -> EnsureShapeState().StrokeEnd = value
  }
  internal prop ShapeCornerRadius float64{
    get -> shapeState?.ShapeCornerRadius ?? 0.0
    set -> EnsureShapeState().ShapeCornerRadius = value
  }
  internal prop Dashes DashPattern?{
    get -> shapeState?.Dashes
    set {
      if shapeState == nil && value == nil { return }
      EnsureShapeState().Dashes = value
    }
  }
  internal prop ShapeStrokeInset bool{
    get -> shapeState?.ShapeStrokeInset ?? true
    set -> EnsureShapeState().ShapeStrokeInset = value
  }
  internal prop ImageFit ImageFit{ get; set; }
  internal prop ImageSource ImageSourceProvider? { get -> ImageLayouts.Source(this) }
  internal prop ImageLease ImageSourceLease? { get -> ImageLayouts.Lease(this) }
  internal prop ImageSourceCompletion ImageSourceCompletion? {
    get -> ImageLayouts.SourceCompletion(this)
  }
  internal prop DecodedImage DecodedImage? { get; set; }
  internal prop ImageIntrinsicWidth float32{ get; set; }
  internal prop ImageIntrinsicHeight float32{ get; set; }
  internal prop Buffer string{
    get -> editingState?.Buffer ?? ""
    set {
      if Buffer == value { return }
      EnsureEditingState().Buffer = value
      BumpScenePaintVersion()
    }
  }
  internal prop Caret int32{
    get -> editingState?.Caret ?? 0
    set {
      if Caret == value { return }
      EnsureEditingState().Caret = value
      BumpScenePaintVersion()
    }
  }
  internal prop Anchor int32{
    get -> editingState?.Anchor ?? 0
    set {
      if Anchor == value { return }
      EnsureEditingState().Anchor = value
      BumpScenePaintVersion()
    }
  }
  internal prop CaretAffinity TextAffinity{
    get -> TextAffinity((nodeState >> 12) & int32(1))
    set {
      if CaretAffinity == value { return }
      nodeState = (nodeState & ~int32(4096)) | ((int32(value) & int32(1)) << 12)
      BumpScenePaintVersion()
    }
  }
  internal prop AnchorAffinity TextAffinity{
    get -> TextAffinity((nodeState >> 13) & int32(1))
    set {
      if AnchorAffinity == value { return }
      nodeState = (nodeState & ~int32(8192)) | ((int32(value) & int32(1)) << 13)
      BumpScenePaintVersion()
    }
  }
  internal prop EditScrollX float32{
    get -> editingState?.EditScrollX ?? 0.0F
    set {
      if EditScrollX == value { return }
      EnsureEditingState().EditScrollX = value
      BumpScenePaintVersion()
    }
  }
  internal prop BlinkT float64{
    get -> editingState?.BlinkT ?? 0.0
    set {
      let previous = BlinkT
      EnsureEditingState().BlinkT = value
      if (previous - Math.Floor(previous) < 0.5) != (value - Math.Floor(value) < 0.5) {
        BumpScenePaintVersion()
      }
    }
  }
  internal prop PreFocus string{
    get -> editingState?.PreFocus ?? ""
    set -> EnsureEditingState().PreFocus = value
  }
  internal prop Placeholder string{
    get -> editingState?.Placeholder ?? ""
    set -> EnsureEditingState().Placeholder = value
  }
  internal prop PlaceholderColor Color?{
    get -> editingState?.PlaceholderColor
    set {
      if editingState == nil && value == nil { return }
      EnsureEditingState().PlaceholderColor = value
    }
  }
  internal prop SelectionColor Color{
    get -> editingState?.SelectionColor ?? Color{}
    set -> EnsureEditingState().SelectionColor = value
  }
  internal prop OnChange Action[string]?{
    get -> editingState?.OnChange
    set {
      if editingState == nil && value == nil { return }
      EnsureEditingState().OnChange = value
    }
  }
  internal prop OnSubmit Action[string]?{
    get -> editingState?.OnSubmit
    set {
      if editingState == nil && value == nil { return }
      EnsureEditingState().OnSubmit = value
    }
  }
  internal init() {
    Children = List[Node]()
    Content = ""
    FontFamily = ""
    Language = ""
    ImageFit = ImageFit.Contain
    BackgroundImageFit = ImageFit.Cover
    ClipPathFillRule = FillRule.NonZero
    HitTestSelf = true
    transitionSelection = allTransitionSelection()
    ApplyAllDefaults(this)
    BumpScenePaintVersion()
  }
}

internal func canReceiveInput(n Node) bool {
  var current = n
  while true {
    if current.Disabled || current.PaintInputState != 0 || current.PortalPlacementHidden
      || current.PortalAnchorClipped && !n.Focused {
    return false
  }
  if let parent = current.Parent {
      current = parent
    } else {
      return !current.HasFocusScopes || FocusScopes.Allows(current, n)
  }
  }
}
