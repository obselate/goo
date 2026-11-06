package Goo

internal enum VulkanSceneUnsupportedKind {
  None = 0;
  Text = 1;
  Image = 2;
  Shape = 4;
  Entry = 8;
  Editor = 16;
  Gradient = 32;
  BorderStyle = 64;
  Clip = 128;
  GroupOpacity = 256;
}

internal enum VulkanSceneUnsupportedBlobKind {
  None = 0;
  Container = 1;
  Button = 2;
  Text = 3;
  TextEntry = 4;
  TextEditor = 5;
  Shape = 6;
  Image = 7;
}

internal enum VulkanSceneUnsupportedField {
  None = 0;
  BackgroundGradient = 1;
  BackgroundImage = 2;
  BackgroundImageSource = 3;
  BackgroundImageFit = 4;
  ClipPath = 5;
  ClipPathFit = 6;
  BorderStyle = 7;
  BlendMode = 8;
  Opacity = 9;
  BoxShadows = 10;
  TextShadows = 14;
  TextStrokeWidth = 15;
  TextStrokeColor = 16;
  TextDecoration = 17;
  ShapePath = 18;
  ShapeFit = 19;
  ShapeFillRule = 20;
  ShapeStrokeWidth = 21;
  ShapeStrokeColor = 22;
  ShapeStrokeCap = 23;
  ShapeStrokeJoin = 24;
  ShapeMiterLimit = 25;
  ShapeCornerRadius = 26;
  ShapeDashes = 27;
  OverflowX = 28;
  OverflowY = 29;
  Content = 30;
  ImageSource = 32;
  ImageFit = 33;
  TextStyleRanges = 34;
  EntryValue = 35;
  EntryPlaceholder = 36;
  EntrySelectionColor = 37;
  EditorDocument = 38;
  EditorController = 39;
  EditorLayers = 40;
  EditorReadOnly = 41;
  EditorPlaceholder = 42;
  EditorSelectionColor = 43;
  EditorCaretColor = 44;
  EditorCurrentLineColor = 45;
  EditorOverscanLines = 46;
  BorderRadius = 47;
  ClipDepth = 48;
  EditorComposition = 50;
}

internal enum VulkanSceneUnsupportedPrimitive {
  None = 0;
  Text = 1;
  Image = 2;
  Shape = 3;
  TextEntry = 4;
  TextEditor = 5;
  Gradient = 6;
  LinearGradient = 7;
  RadialGradient = 8;
  RoundedGradient = 9;
  Border = 10;
  RectClip = 11;
  GroupOpacity = 12;
  BackgroundImage = 13;
  ClipPath = 14;
  Blend = 15;
  BoxShadow = 16;
  TextShadow = 18;
  TextStroke = 19;
  ShapePath = 20;
  ShapeStroke = 21;
  RectClipMixedAxis = 22;
  RectClipRounded = 23;
  RectClipNonAxisAligned = 24;
  RectClipDepth = 25;
}

internal data struct VulkanSceneUnsupportedDetail {
  internal var OwnerId uint64
  internal var NodeKind NodeKind
  internal var Blob VulkanSceneUnsupportedBlobKind
  internal var Field VulkanSceneUnsupportedField
  internal var Primitive VulkanSceneUnsupportedPrimitive
}

internal data struct VulkanSceneTransformState {
  internal var Index int32
  internal var AxisAligned bool
}
internal data struct VulkanRectOverflowClipPreflight {
  internal var ClipsX bool
  internal var ClipsY bool
  internal var BothAxes bool
  internal var HasRadius bool
  internal var DepthExceeded bool
  internal var RectangularEmittable bool
}

internal data struct VulkanRetentionCounters {
  internal var Hit uint64
  internal var Rebuild uint64
  internal var Fallback uint64
  internal var Invalidation uint64
  internal var Total uint64
}

internal data struct VulkanSceneCompileResult {
  internal var FrameVersion uint64
  internal var RootOwnerId uint64
  internal var ChunkCount int32
  internal var DrawCount int32
  internal var VisibleNodeCount int32
  internal var EmittedNodeCount int32
  internal var UnsupportedNodeCount int32
  internal var UnsupportedPrimitiveCount int32
  internal var SkippedNodeCount int32
  internal var ScrollNodeCount int32
  internal var ClipCount int32
  internal var PathClipCount int32
  internal var ClipMaskCount int32
  internal var ClipChainCount int32
  internal var PathResourceDeferred bool
  internal var TransformCount int32
  internal var UnsupportedMask uint32
  internal var UnsupportedDetails []VulkanSceneUnsupportedDetail
  internal var UnsupportedDetailCount int32
  internal var UnsupportedDetailDropped int32
  internal var BackgroundDrawn bool
  internal var RetainedLeaf VulkanRetentionCounters
  internal var RetainedBorder VulkanRetentionCounters
  internal var RetainedParentBox VulkanRetentionCounters
  internal var RetainedText VulkanRetentionCounters
  internal var ExactTextClipCandidateCount int32
  internal var ExactTextClipCullCount int32
  internal var CachedTextPaintCullCount int32
  internal var TextLayoutRequestCount int32

  internal prop HasUnsupported bool{
    get {
      return UnsupportedMask != 0u || UnsupportedNodeCount != 0
        || UnsupportedPrimitiveCount != 0 || UnsupportedDetailCount != 0
        || UnsupportedDetailDropped != 0
    }
  }
}

internal class VulkanSceneTextState {
  internal var RetainedTextValid bool
  internal var RetainedTextContent string?
  internal var RetainedTextPaintVersion uint64
  internal var RetainedTextBounds ConservativeBounds
  internal var RetainedTextColor uint32
  internal var RetainedTextOpacity float32
  internal var RetainedTextAtlasGeneration uint64
  internal var RetainedTextPixelScale float32
  internal var RetainedTextFontRegistryGeneration uint64
  internal var RetainedTextParentTranslateX float32
  internal var RetainedTextParentTranslateY float32
  internal var RetainedTextClipDepth int32
  internal var RetainedTextClipBounds ConservativeBounds
  internal var RetainedTextSnapshot VulkanRetainedTextSnapshot?
  internal var CachedTextPaintLayout TextLayout?
  internal var CachedTextPaintBounds ConservativeBounds
  internal var CachedTextPaintContentX float32
  internal var CachedTextPaintContentY float32
  internal var CachedTextPaintContentWidth float32
  internal var CachedTextPaintLineHeight float32
  internal var CachedTextPaintAlign TextAlign
  internal var CachedTextPaintContent string?
  internal var CachedTextPaintVersion uint64
  internal var CachedTextPaintScale float32
  internal var CachedTextPaintNodeBounds ConservativeBounds
  internal var CachedTextCullVersion uint64
  internal var CachedTextCullBounds ConservativeBounds
  internal var CachedTextCullEligible bool
}

internal class VulkanSceneBoxState {
  internal var RetainedLeafValid bool
  internal var RetainedLeafNodeKind NodeKind
  internal var RetainedLeafKind SceneDrawKind
  internal var RetainedLeafPaintVersion uint64
  internal var RetainedLeafBounds ConservativeBounds
  internal var RetainedLeafSolid SolidBoxRecord
  internal var RetainedLeafRounded RoundedBoxRecord
  internal var RetainedLeafBorder PerEdgeBorderRecord
  internal var RetainedBoxIsLeaf bool
}

internal class VulkanSceneOwnerId {
  internal var Value uint64
  internal let Generation uint64
  internal var RangeSlot int32 = -1
  private var textState VulkanSceneTextState?
  private var boxState VulkanSceneBoxState?

  private func EnsureTextState() VulkanSceneTextState {
    if let state = textState { return state }
    let state = VulkanSceneTextState()
    textState = state
    return state
  }

  private func EnsureBoxState() VulkanSceneBoxState {
    if let state = boxState { return state }
    let state = VulkanSceneBoxState()
    boxState = state
    return state
  }
  internal prop RetainedTextValid bool{
    get -> textState?.RetainedTextValid ?? false
    set -> EnsureTextState().RetainedTextValid = value
  }
  internal prop RetainedTextContent string?{
    get -> textState?.RetainedTextContent
    set {
      if textState == nil && value == nil { return }
      EnsureTextState().RetainedTextContent = value
    }
  }
  internal prop RetainedTextPaintVersion uint64{
    get -> textState?.RetainedTextPaintVersion ?? 0uL
    set -> EnsureTextState().RetainedTextPaintVersion = value
  }
  internal prop RetainedTextBounds ConservativeBounds{
    get -> textState?.RetainedTextBounds ?? default(ConservativeBounds)
    set -> EnsureTextState().RetainedTextBounds = value
  }
  internal prop RetainedTextColor uint32{
    get -> textState?.RetainedTextColor ?? 0u
    set -> EnsureTextState().RetainedTextColor = value
  }
  internal prop RetainedTextOpacity float32{
    get -> textState?.RetainedTextOpacity ?? 0.0F
    set -> EnsureTextState().RetainedTextOpacity = value
  }
  internal prop RetainedTextAtlasGeneration uint64{
    get -> textState?.RetainedTextAtlasGeneration ?? 0uL
    set -> EnsureTextState().RetainedTextAtlasGeneration = value
  }
  internal prop RetainedTextPixelScale float32{
    get -> textState?.RetainedTextPixelScale ?? 0.0F
    set -> EnsureTextState().RetainedTextPixelScale = value
  }
  internal prop RetainedTextFontRegistryGeneration uint64{
    get -> textState?.RetainedTextFontRegistryGeneration ?? 0uL
    set -> EnsureTextState().RetainedTextFontRegistryGeneration = value
  }
  internal prop RetainedTextParentTranslateX float32{
    get -> textState?.RetainedTextParentTranslateX ?? 0.0F
    set -> EnsureTextState().RetainedTextParentTranslateX = value
  }
  internal prop RetainedTextParentTranslateY float32{
    get -> textState?.RetainedTextParentTranslateY ?? 0.0F
    set -> EnsureTextState().RetainedTextParentTranslateY = value
  }
  internal prop RetainedTextClipDepth int32{
    get -> textState?.RetainedTextClipDepth ?? 0
    set -> EnsureTextState().RetainedTextClipDepth = value
  }
  internal prop RetainedTextClipBounds ConservativeBounds{
    get -> textState?.RetainedTextClipBounds ?? default(ConservativeBounds)
    set -> EnsureTextState().RetainedTextClipBounds = value
  }
  internal prop RetainedTextSnapshot VulkanRetainedTextSnapshot?{
    get -> textState?.RetainedTextSnapshot
    set {
      if textState == nil && value == nil { return }
      EnsureTextState().RetainedTextSnapshot = value
    }
  }
  internal prop CachedTextPaintLayout TextLayout?{
    get -> textState?.CachedTextPaintLayout
    set {
      if textState == nil && value == nil { return }
      EnsureTextState().CachedTextPaintLayout = value
    }
  }
  internal prop CachedTextPaintBounds ConservativeBounds{
    get -> textState?.CachedTextPaintBounds ?? default(ConservativeBounds)
    set -> EnsureTextState().CachedTextPaintBounds = value
  }
  internal prop CachedTextPaintContentX float32{
    get -> textState?.CachedTextPaintContentX ?? 0.0F
    set -> EnsureTextState().CachedTextPaintContentX = value
  }
  internal prop CachedTextPaintContentY float32{
    get -> textState?.CachedTextPaintContentY ?? 0.0F
    set -> EnsureTextState().CachedTextPaintContentY = value
  }
  internal prop CachedTextPaintContentWidth float32{
    get -> textState?.CachedTextPaintContentWidth ?? 0.0F
    set -> EnsureTextState().CachedTextPaintContentWidth = value
  }
  internal prop CachedTextPaintLineHeight float32{
    get -> textState?.CachedTextPaintLineHeight ?? 0.0F
    set -> EnsureTextState().CachedTextPaintLineHeight = value
  }
  internal prop CachedTextPaintAlign TextAlign{
    get -> textState?.CachedTextPaintAlign ?? default(TextAlign)
    set -> EnsureTextState().CachedTextPaintAlign = value
  }
  internal prop CachedTextPaintContent string?{
    get -> textState?.CachedTextPaintContent
    set {
      if textState == nil && value == nil { return }
      EnsureTextState().CachedTextPaintContent = value
    }
  }
  internal prop CachedTextPaintVersion uint64{
    get -> textState?.CachedTextPaintVersion ?? 0uL
    set -> EnsureTextState().CachedTextPaintVersion = value
  }
  internal prop CachedTextPaintScale float32{
    get -> textState?.CachedTextPaintScale ?? 0.0F
    set -> EnsureTextState().CachedTextPaintScale = value
  }
  internal prop CachedTextPaintNodeBounds ConservativeBounds{
    get -> textState?.CachedTextPaintNodeBounds ?? default(ConservativeBounds)
    set -> EnsureTextState().CachedTextPaintNodeBounds = value
  }
  internal prop CachedTextCullVersion uint64{
    get -> textState?.CachedTextCullVersion ?? 0uL
    set -> EnsureTextState().CachedTextCullVersion = value
  }
  internal prop CachedTextCullBounds ConservativeBounds{
    get -> textState?.CachedTextCullBounds ?? default(ConservativeBounds)
    set -> EnsureTextState().CachedTextCullBounds = value
  }
  internal prop CachedTextCullEligible bool{
    get -> textState?.CachedTextCullEligible ?? false
    set -> EnsureTextState().CachedTextCullEligible = value
  }
  internal prop RetainedLeafValid bool{
    get -> boxState?.RetainedLeafValid ?? false
    set -> EnsureBoxState().RetainedLeafValid = value
  }
  internal prop RetainedLeafNodeKind NodeKind{
    get -> boxState?.RetainedLeafNodeKind ?? default(NodeKind)
    set -> EnsureBoxState().RetainedLeafNodeKind = value
  }
  internal prop RetainedLeafKind SceneDrawKind{
    get -> boxState?.RetainedLeafKind ?? default(SceneDrawKind)
    set -> EnsureBoxState().RetainedLeafKind = value
  }
  internal prop RetainedLeafPaintVersion uint64{
    get -> boxState?.RetainedLeafPaintVersion ?? 0uL
    set -> EnsureBoxState().RetainedLeafPaintVersion = value
  }
  internal prop RetainedLeafBounds ConservativeBounds{
    get -> boxState?.RetainedLeafBounds ?? default(ConservativeBounds)
    set -> EnsureBoxState().RetainedLeafBounds = value
  }
  internal prop RetainedLeafSolid SolidBoxRecord{
    get -> boxState?.RetainedLeafSolid ?? default(SolidBoxRecord)
    set -> EnsureBoxState().RetainedLeafSolid = value
  }
  internal prop RetainedLeafRounded RoundedBoxRecord{
    get -> boxState?.RetainedLeafRounded ?? default(RoundedBoxRecord)
    set -> EnsureBoxState().RetainedLeafRounded = value
  }
  internal prop RetainedLeafBorder PerEdgeBorderRecord{
    get -> boxState?.RetainedLeafBorder ?? default(PerEdgeBorderRecord)
    set -> EnsureBoxState().RetainedLeafBorder = value
  }
  internal prop RetainedBoxIsLeaf bool{
    get -> boxState?.RetainedBoxIsLeaf ?? false
    set -> EnsureBoxState().RetainedBoxIsLeaf = value
  }

  internal init(value uint64, generation uint64) {
    Value = value
    Generation = generation
  }

  internal func ClearRetainedLeaf() {
    if let state = boxState { state.RetainedLeafValid = false }
  }

  internal func ClearRetainedText() {
    if let state = textState {
      state.RetainedTextValid = false
      state.RetainedTextContent = nil
    }
  }

  internal func ClearCachedState() {
    textState = nil
    boxState = nil
  }
}
