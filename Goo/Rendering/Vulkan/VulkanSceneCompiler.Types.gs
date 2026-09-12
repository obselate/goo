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

internal class VulkanSceneOwnerId {
  internal var Value uint64
  internal var RetainedTextValid bool
  internal var RetainedTextContent string?
  internal var RetainedTextPaintVersion uint64
  internal var RetainedTextBounds ConservativeBounds
  internal var RetainedTextColor uint32
  internal var RetainedTextOpacity float32
  internal var RetainedTextAtlasGeneration uint64
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
  internal var CachedTextPaintNodeBounds ConservativeBounds
  internal var CachedTextCullVersion uint64
  internal var CachedTextCullBounds ConservativeBounds
  internal var CachedTextCullEligible bool
  internal var RetainedLeafValid bool
  internal var RetainedLeafNodeKind NodeKind
  internal var RetainedLeafKind SceneDrawKind
  internal var RetainedLeafPaintVersion uint64
  internal var RetainedLeafBounds ConservativeBounds
  internal var RetainedLeafSolid SolidBoxRecord
  internal var RetainedLeafRounded RoundedBoxRecord
  internal var RetainedLeafBorder PerEdgeBorderRecord
  internal var RetainedBoxIsLeaf bool

  internal init(value uint64) {
    Value = value
  }

  internal func ClearRetainedLeaf() {
    RetainedLeafValid = false
  }

  internal func ClearRetainedText() {
    RetainedTextValid = false
    RetainedTextContent = nil
  }
}
