package Goo

import System
import System.Collections.Generic

internal enum NodeKind { Container; Button; Text; Entry; Editor; Shape; Image; Lava }

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
  private var lifecycleState uint8
  private var scenePaintVersion uint64

  internal prop ScenePaintVersion uint64{ get -> scenePaintVersion }
  internal var VulkanOwnerToken object?
  internal var VulkanOwner VulkanSceneOwnerId?

  internal func BumpScenePaintVersion() {
    scenePaintVersion = scenePaintVersion == uint64.MaxValue
    ? 1uL : scenePaintVersion + 1uL
  }

  internal prop Kind NodeKind{ get; set; }
  internal prop Key string? { get; set; }
  internal prop Parent Node? { get; set; }
  internal prop Children IList[Node]{ get; init; }
  internal prop Content string{ get; set; }
  internal prop Rect Rect{ get; set; }
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
      ? nodeState | int32(1) : nodeState & ^int32(1)
    }
  }
  internal prop Direction Direction{
    get -> Direction((nodeState >> 10) & int32(3))
    set {
      nodeState = (nodeState & ^int32(3072)) | ((int32(value) & int32(3)) << 10)
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
      nodeState = (nodeState & ^int32(12)) | ((int32(value) & int32(3)) << 2)
    }
  }
  internal prop TextTransform TextTransform{
    get -> TextTransform((nodeState >> 6) & int32(3))
    set {
      nodeState = (nodeState & ^int32(192)) | ((int32(value) & int32(3)) << 6)
    }
  }
  internal prop HasTransformState bool{
    get -> (nodeState & int32(16)) != 0
    set {
      nodeState = value ? nodeState | int32(16) : nodeState & ^int32(16)
    }
  }
  internal prop HasVisualTransform bool{
    get -> (nodeState & int32(32)) != 0
    set {
      nodeState = value ? nodeState | int32(32) : nodeState & ^int32(32)
    }
  }
  internal prop HasTextShadowState bool{
    get -> (nodeState & int32(256)) != 0
    set {
      nodeState = value ? nodeState | int32(256) : nodeState & ^int32(256)
    }
  }
  internal prop HasTextStrokeState bool{
    get -> (nodeState & int32(512)) != 0
    set {
      nodeState = value ? nodeState | int32(512) : nodeState & ^int32(512)
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
  internal prop TextMaxLines int32{ get; set; }
  internal prop TextLayout TextLayout? { get; set; }
  internal prop TextLayoutCache List[TextLayout]? { get; set; }
  internal prop EntryShape EntryShapeState? { get; set; }
  internal prop EditorController TextEditorController? { get; set; }
  internal prop EditorState TextEditorRenderState? { get; set; }
  internal prop EditorReadOnly bool{ get; set; }
  internal prop EditorCaretColor Color{ get; set; }
  internal prop EditorCurrentLineColor Color{ get; set; }
  internal prop EditorOverscanLines int32{ get; set; }
  internal prop EditorOnChange Action[TextDocumentChange]? { get; set; }
  internal prop EditorOnSubmit Action? { get; set; }
  internal prop EditorSlotRange TextRange{ get; set; }
  internal prop EditorSlotKey string{ get; set; }
  internal prop EditorSlotBlock bool{ get; set; }

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
      nodeState = (nodeState & ^(int32(3) << 26)) | (ordinal << 26)
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
      nodeState = value ? nodeState | (int32(1) << 14) : nodeState & ^(int32(1) << 14)
    }
  }
  internal prop AutoFocus bool{
    get -> (lifecycleState & uint8(2)) != uint8(0)
    set {
      lifecycleState = value ? lifecycleState | uint8(2) : lifecycleState & ^uint8(2)
    }
  }
  internal prop Disabled bool{
    get -> (nodeState & (int32(1) << 15)) != 0
    set {
      nodeState = value ? nodeState | (int32(1) << 15) : nodeState & ^(int32(1) << 15)
    }
  }
  internal prop Cursor Cursor{
    get -> Cursor((nodeState >> 16) & int32(31))
    set {
      nodeState = (nodeState & ^(int32(31) << 16))
      | ((int32(value) & int32(31)) << 16)
    }
  }
  internal prop TextWrap TextWrap{
    get -> (nodeState & (int32(1) << 21)) != 0 ? TextWrap.NoWrap : TextWrap.Wrap
    set {
      nodeState = value == TextWrap.NoWrap ? nodeState | (int32(1) << 21) : nodeState & ^(int32(1) << 21)
    }
  }
  internal prop TextTrimming TextTrimming{
    get -> (nodeState & (int32(1) << 22)) != 0 ? TextTrimming.Ellipsis : TextTrimming.None
    set {
      nodeState = value == TextTrimming.Ellipsis ? nodeState | (int32(1) << 22) : nodeState & ^(int32(1) << 22)
    }
  }
  internal prop HasOutlineState bool{
    get -> (nodeState & (int32(1) << 23)) != 0
    set {
      nodeState = value ? nodeState | (int32(1) << 23) : nodeState & ^(int32(1) << 23)
    }
  }
  internal prop Visibility Visibility{
    get -> (nodeState & int32(2)) != 0 ? Visibility.Hidden : Visibility.Visible
    set {
      nodeState = value == Visibility.Hidden
      ? nodeState | int32(2) : nodeState & ^int32(2)
    }
  }
  internal prop PaintInputState int32{ get -> nodeState & int32(3) }
  internal prop PaintInputHidden bool{ get -> (nodeState & int32(3)) != 0 }
  internal prop StackingChildren bool{
    get -> (nodeState & (int32(1) << 24)) != 0
    set {
      nodeState = value ? nodeState | (int32(1) << 24) : nodeState & ^(int32(1) << 24)
    }
  }
  internal prop HasZIndex bool{
    get -> (nodeState & (int32(1) << 25)) != 0
    set {
      nodeState = value ? nodeState | (int32(1) << 25) : nodeState & ^(int32(1) << 25)
    }
  }
  internal prop HasBackgroundImageState bool{
    get -> (nodeState & (int32(1) << 28)) != 0
    set {
      nodeState = value ? nodeState | (int32(1) << 28) : nodeState & ^(int32(1) << 28)
    }
  }
  internal prop BackgroundImageFit ImageFit{
    get -> ImageFit((nodeState >> 29) & int32(3))
    set {
      nodeState = (nodeState & ^(int32(3) << 29)) | ((int32(value) & int32(3)) << 29)
    }
  }
  internal prop HasClipPath bool{
    get -> (nodeState & (int32(1) << 31)) != 0
    set {
      nodeState = value ? nodeState | (int32(1) << 31) : nodeState & ^(int32(1) << 31)
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
  internal prop Focused bool{ get; set; }
  internal prop LocalMask StyleMask{ get; set; }
  internal prop AppliedMask StyleMask{ get; set; }
  internal prop Transitions List[Transition]? { get; set; }
  internal prop StyleQueuedPass int64{ get; set; }
  internal prop StyleResolvedPass int64{ get; set; }
  internal prop StylePendingSelf bool{ get; set; }
  internal prop StylePendingInitial bool{ get; set; }
  internal prop StylePendingInheritedMask StyleMask{ get; set; }
  internal prop Retired bool{
    get -> (lifecycleState & uint8(4)) != uint8(0)
    set {
      lifecycleState = value ? lifecycleState | uint8(4) : lifecycleState & ^uint8(4)
    }
  }
  internal prop HasElementHandle bool{
    get -> (lifecycleState & uint8(8)) != uint8(0)
    set {
      lifecycleState = value ? lifecycleState | uint8(8) : lifecycleState & ^uint8(8)
    }
  }
  internal prop HasAccessibilityDeclaration bool{
    get -> (lifecycleState & uint8(16)) != uint8(0)
    set {
      lifecycleState = value ? lifecycleState | uint8(16) : lifecycleState & ^uint8(16)
    }
  }
  internal prop HasAccessibilityNodeState bool{
    get -> (lifecycleState & uint8(32)) != uint8(0)
    set {
      lifecycleState = value ? lifecycleState | uint8(32) : lifecycleState & ^uint8(32)
    }
  }
  internal prop HasSparseInputState bool{
    get -> (lifecycleState & uint8(1)) != uint8(0)
    set {
      lifecycleState = value ? lifecycleState | uint8(1) : lifecycleState & ^uint8(1)
    }
  }
  internal prop HasDirectImageSourceState bool{
    get -> (lifecycleState & uint8(64)) != uint8(0)
    set {
      lifecycleState = value ? lifecycleState | uint8(64) : lifecycleState & ^uint8(64)
    }
  }
  internal prop Password bool{
    get -> (lifecycleState & uint8(128)) != uint8(0)
    set {
      lifecycleState = value ? lifecycleState | uint8(128) : lifecycleState & ^uint8(128)
    }
  }

  internal prop OnClick Action? { get; set; }
  internal prop OnPointerDown((PointerEvent) -> void)? { get; set; }
  internal prop OnPointerMove((PointerEvent) -> void)? { get; set; }
  internal prop OnPointerUp((PointerEvent) -> void)? { get; set; }
  internal prop OnPointerCancel((PointerEvent) -> void)? { get; set; }
  internal prop OnWheel((WheelEvent) -> void)? { get; set; }
  internal prop Fiber Cell? { get; set; }
  internal prop ScrollX float32{ get; set; }
  internal prop ScrollY float32{ get; set; }
  internal prop ScrollTargetX float32{ get; set; }
  internal prop ScrollTargetY float32{ get; set; }
  internal prop ContentW float32{ get; set; }
  internal prop ContentH float32{ get; set; }
  internal prop ScrollBarAlpha float32{ get; set; }
  internal prop ScrollIdle float32{ get; set; }
  internal prop ScrollbarVisibility ScrollbarVisibility{
    get -> ScrollbarVisibilities.Get(this)
    set(v) -> ScrollbarVisibilities.Set(this, v)
  }
  internal prop UserScrolled bool{ get; set; }
  internal prop PinToBottom bool{ get; set; }
  internal prop DragsWindow bool{ get; set }
  internal prop HitTestSelf bool{ get; set; }
  internal prop ShapePath VectorPath{ get; set; }
  internal prop ShapeFit ShapeFit{ get; set; }
  internal prop ShapeFillRule FillRule{ get; set; }
  internal prop ShapeStrokeCap StrokeCap{ get; set; }
  internal prop ShapeStrokeJoin StrokeJoin{ get; set; }
  internal prop MiterLimit float64{ get; set; }
  internal prop ShapeCornerRadius float64{ get; set; }
  internal prop Dashes DashPattern? { get; set; }
  internal prop ShapeStrokeInset bool{ get; set; }
  internal prop ImageFit ImageFit{ get; set; }
  internal prop ImageSource ImageSourceProvider? { get -> ImageLayouts.Source(this) }
  internal prop ImageLease ImageSourceLease? { get -> ImageLayouts.Lease(this) }
  internal prop ImageSourceCompletion ImageSourceCompletion? {
    get -> ImageLayouts.SourceCompletion(this)
  }
  internal prop DecodedImage DecodedImage? { get; set; }
  internal prop ImageIntrinsicWidth float32{ get; set; }
  internal prop ImageIntrinsicHeight float32{ get; set; }
  internal prop LavaFlow float64{ get; set; }
  internal prop LavaForm float64{ get; set; }
  internal prop LavaBlend float64{ get; set; }
  internal prop LavaLight float64{ get; set; }
  internal prop LavaHue float64{ get; set; }
  internal prop LavaRainbow bool{ get; set; }
  internal prop LavaRotation Point{ get; set; }
  internal prop LavaSeed uint32{ get; set; }
  internal prop Buffer string{ get; set; }
  internal prop Caret int32{ get; set; }
  internal prop Anchor int32{ get; set; }
  internal prop CaretAffinity TextAffinity{
    get -> TextAffinity((nodeState >> 12) & int32(1))
    set {
      nodeState = (nodeState & ^int32(4096)) | ((int32(value) & int32(1)) << 12)
    }
  }
  internal prop AnchorAffinity TextAffinity{
    get -> TextAffinity((nodeState >> 13) & int32(1))
    set {
      nodeState = (nodeState & ^int32(8192)) | ((int32(value) & int32(1)) << 13)
    }
  }
  internal prop EditScrollX float32{ get; set; }
  internal prop BlinkT float64{ get; set; }
  internal prop PreFocus string{ get; set; }
  internal prop Placeholder string{ get; set; }
  internal prop SelectionColor Color{ get; set; }
  internal prop OnChange Action[string]? { get; set; }
  internal prop OnSubmit Action[string]? { get; set; }
  internal init() {
    Children = List[Node]()
    Content = ""
    FontFamily = ""
    Buffer = ""
    PreFocus = ""
    Placeholder = ""
    EditorSlotKey = ""
    ShapePath = VectorPath.Empty
    ShapeFit = ShapeFit.Contain
    ImageFit = ImageFit.Contain
    BackgroundImageFit = ImageFit.Cover
    ShapeFillRule = FillRule.NonZero
    ClipPathFillRule = FillRule.NonZero
    ShapeStrokeCap = StrokeCap.Butt
    ShapeStrokeJoin = StrokeJoin.Miter
    ShapeStrokeInset = true
    MiterLimit = 4.0
    HitTestSelf = true
    transitionSelection = allTransitionSelection()
    ApplyAllDefaults(this)
    BumpScenePaintVersion()
  }
}

internal func canReceiveInput(n Node) bool {
  if n.PaintInputHidden || n.Disabled {
    return false
  }
  if let parent = n.Parent {
    return canReceiveInput(parent)
  }
  return true
}
