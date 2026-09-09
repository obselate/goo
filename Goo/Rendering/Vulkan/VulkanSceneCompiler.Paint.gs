package Goo

import System
import Facebook.Yoga

internal partial class VulkanSceneCompiler {
  private func ValidateViewport(width float32, height float32) {
    if !finiteVulkanSceneValue(width) || !finiteVulkanSceneValue(height) || width < 0.0F || height < 0.0F {
      throw ArgumentOutOfRangeException("viewport")
    }
  }

  private func NodeBounds(node Node) ConservativeBounds {
    let rect = node.Rect
    let x = finiteVulkanSceneValue(rect.X) ? rect.X : 0.0F
    let y = finiteVulkanSceneValue(rect.Y) ? rect.Y : 0.0F
    let width = finiteVulkanSceneValue(rect.W) && rect.W > 0.0F ? rect.W : 0.0F
    let height = finiteVulkanSceneValue(rect.H) && rect.H > 0.0F ? rect.H : 0.0F
    return ConservativeBounds{ X: x, Y: y, Width: width, Height: height }
  }

  private func EffectiveOpacity(parent float32, value float64) float32 {
    if !finiteVulkanSceneValue(parent) || Double.IsNaN(value) || Double.IsInfinity(value) {
      return 0.0F
    }
    let local = float32(value)
    if !finiteVulkanSceneValue(local) {
      return 0.0F
    }
    if local <= 0.0F || parent <= 0.0F {
      return 0.0F
    }
    let boundedLocal = local >= 1.0F ? 1.0F : local
    let product = parent * boundedLocal
    if product >= 1.0F { return 1.0F }
    return product <= 0.0F ? 0.0F : product
  }

  private func BlendModeSupported(value BlendMode) bool {
    let ordinal = int32(value)
    return ordinal >= int32(BlendMode.Normal)
      && ordinal <= int32(BlendMode.Luminosity)
  }

  private func AddNodeTransform(node Node, parentIndex int32) VulkanSceneTransformState {
    if !node.HasVisualTransform {
      return VulkanSceneTransformState{ Index: parentIndex, AxisAligned: true }
    }
    let matrix = TransformGeometry.Matrix(node)
    let record = TransformRecord{
      A: matrix.A,
      B: matrix.C,
      C: matrix.B,
      D: matrix.D,
      TX: matrix.TX,
      TY: matrix.TY,
      ParentIndex: parentIndex,
    }
    let index = frame.AddTransform(record)
    return VulkanSceneTransformState{
      Index: index,
      AxisAligned: matrix.B == 0.0F && matrix.C == 0.0F,
    }
  }

  private func RecordUnsupportedFields(node Node, bounds ConservativeBounds) {
    if node.HasBackgroundImageState {
      let path = BackgroundImageLayouts.Path(node)
      let source = BackgroundImageLayouts.Source(node)
      if path != "" && source == nil {
        RecordUnsupportedDetail(node, VulkanSceneUnsupportedField.BackgroundImage,
          VulkanSceneUnsupportedPrimitive.BackgroundImage)
      } else if source != nil && imageScene == nil {
        RecordUnsupportedDetail(node, VulkanSceneUnsupportedField.BackgroundImageSource,
          VulkanSceneUnsupportedPrimitive.BackgroundImage)
      }
      if ((path != "" && source == nil)
          || (source != nil && imageScene == nil))
        && node.BackgroundImageFit != ImageFit.Cover{
          RecordUnsupportedDetail(node, VulkanSceneUnsupportedField.BackgroundImageFit,
            VulkanSceneUnsupportedPrimitive.BackgroundImage)
        }
    }
    if node.BlendMode != BlendMode.Normal
      && (!blendModeSupported || !BlendModeSupported(node.BlendMode)) {
        RecordUnsupportedDetail(node, VulkanSceneUnsupportedField.BlendMode,
          VulkanSceneUnsupportedPrimitive.Blend)
      }
    if node.HasTextStrokeState {
      let width = node.TextStrokeWidth
      if width.HasMagnitude
        && (width.Unit != LengthUnit.Px
            || width.Px > VulkanTextScene.MaximumStrokeWidth)
        && !transparent(node.TextStrokeColor) {
          RecordUnsupportedDetail(node, VulkanSceneUnsupportedField.TextStrokeWidth,
            VulkanSceneUnsupportedPrimitive.TextStroke)
        }
    }
    if node.Kind != NodeKind.Text
      && node.Kind != NodeKind.Entry
      && node.Kind != NodeKind.Editor
      && node.TextDecoration != TextDecoration.None{
        RecordUnsupportedDetail(node, VulkanSceneUnsupportedField.TextDecoration,
          VulkanSceneUnsupportedPrimitive.Text)
      }
    if node.Kind == NodeKind.Text && PassiveTextPresentations.Read(node) != nil {
      RecordUnsupportedRichTextFields(node)
    }
    if node.BorderStyle != BorderStyle.Solid
      && node.BorderStyle != BorderStyle.Dashed
      && node.BorderStyle != BorderStyle.Dotted
      && HasBorderWidth(node, bounds) {
        RecordUnsupportedDetail(node, VulkanSceneUnsupportedField.BorderStyle,
          VulkanSceneUnsupportedPrimitive.Border)
      }
    switch node.Kind {
      case NodeKind.Image {
        let source = node.ImageSource
        if node.ImagePath != "" && source == nil {
          RecordUnsupportedDetail(node, VulkanSceneUnsupportedField.ImagePath,
            VulkanSceneUnsupportedPrimitive.Image)
        } else if source != nil && imageScene == nil {
          RecordUnsupportedDetail(node, VulkanSceneUnsupportedField.ImageSource,
            VulkanSceneUnsupportedPrimitive.Image)
        }
        if ((node.ImagePath != "" && source == nil)
            || (source != nil && imageScene == nil))
          && node.ImageFit != ImageFit.Contain{
            RecordUnsupportedDetail(node, VulkanSceneUnsupportedField.ImageFit,
              VulkanSceneUnsupportedPrimitive.Image)
          }
      }
      case NodeKind.Shape {
      }
      case NodeKind.Entry {
      }
      case NodeKind.Editor {
        if let _ = node.EditorState {
          RecordUnsupportedEditorTextFields(node)
        }
      }
      case _ { }
    }
  }

  private func RecordUnsupportedRichTextFields(node Node) {
    let layout = TextLayouts.For(node, TextLayouts.ContentWidth(node))
    guard let rich = layout.Rich else { return }
    var stroke = node.TextStrokeWidth.Px > VulkanTextScene.MaximumStrokeWidth
      && !transparent(node.TextStrokeColor)
    for line in rich.Lines {
      for run in line.Runs {
        let style = run.Style
        if !stroke && style.StrokeWidth > VulkanTextScene.MaximumStrokeWidth
          && !transparent(style.StrokeColor) {
            RecordUnsupportedDetail(node, VulkanSceneUnsupportedField.TextStrokeWidth,
              VulkanSceneUnsupportedPrimitive.TextStroke)
            stroke = true
          }
      }
    }
  }

  private func RecordUnsupportedEditorTextFields(node Node) {
    let layout = TextEditorLayouts.For(node, TextLayouts.ContentWidth(node),
      TextLayouts.ContentHeight(node))
    var stroke = node.TextStrokeWidth.Px > VulkanTextScene.MaximumStrokeWidth
      && !transparent(node.TextStrokeColor)
    for lineIndex in 0 ... layout.Lines.Count {
      let line = layout.Lines[lineIndex]
      for runIndex in 0 ... line.Runs.Count {
        let run = line.Runs[runIndex]
        let style = run.Style
        if !stroke && style.StrokeWidth > VulkanTextScene.MaximumStrokeWidth
          && !transparent(style.StrokeColor) {
            RecordUnsupportedDetail(node, VulkanSceneUnsupportedField.TextStrokeWidth,
              VulkanSceneUnsupportedPrimitive.TextStroke)
            stroke = true
          }
      }
    }
  }

  private func HasVisibleTextShadow(shadows BoxShadowStack?) bool {
    var index int32 = 0
    let count = textShadowCount(shadows)
    while index < count {
      let shadow = textShadowAt(shadows, index)
      if shadow.Color.A > 0.0F {
        return true
      }
      index = index + 1
    }
    return false
  }

  private func RecordColorEffectsSkipped(node Node) {
    var shadow = false
    var stroke = false
    if node.HasTextShadowState && HasVisibleTextShadow(node.TextShadows) {
      RecordUnsupportedDetail(node, VulkanSceneUnsupportedField.TextShadows,
        VulkanSceneUnsupportedPrimitive.TextShadow)
      shadow = true
    }
    if node.HasTextStrokeState && node.TextStrokeWidth.Unit == LengthUnit.Px
      && node.TextStrokeWidth.Px > 0.0F && !transparent(node.TextStrokeColor) {
        RecordUnsupportedDetail(node, VulkanSceneUnsupportedField.TextStrokeWidth,
          VulkanSceneUnsupportedPrimitive.TextStroke)
        stroke = true
      }
    if node.Kind == NodeKind.Text {
      let layout = TextLayouts.For(node, TextLayouts.ContentWidth(node))
      if let rich = layout.Rich {
        for line in rich.Lines {
          for run in line.Runs {
            let style = run.Style
            if !shadow && HasVisibleTextShadow(style.Shadows) {
              RecordUnsupportedDetail(node, VulkanSceneUnsupportedField.TextShadows,
                VulkanSceneUnsupportedPrimitive.TextShadow)
              shadow = true
            }
            if !stroke && style.StrokeWidth > 0.0F && !transparent(style.StrokeColor) {
              RecordUnsupportedDetail(node, VulkanSceneUnsupportedField.TextStrokeWidth,
                VulkanSceneUnsupportedPrimitive.TextStroke)
              stroke = true
            }
          }
        }
      }
    } else if node.Kind == NodeKind.Editor {
      let layout = TextEditorLayouts.For(node, TextLayouts.ContentWidth(node),
        TextLayouts.ContentHeight(node))
      for lineIndex in 0 ... layout.Lines.Count {
        let line = layout.Lines[lineIndex]
        for runIndex in 0 ... line.Runs.Count {
          let run = line.Runs[runIndex]
          let style = run.Style
          if !shadow && HasVisibleTextShadow(style.Shadows) {
            RecordUnsupportedDetail(node, VulkanSceneUnsupportedField.TextShadows,
              VulkanSceneUnsupportedPrimitive.TextShadow)
            shadow = true
          }
          if !stroke && style.StrokeWidth > 0.0F && !transparent(style.StrokeColor) {
            RecordUnsupportedDetail(node, VulkanSceneUnsupportedField.TextStrokeWidth,
              VulkanSceneUnsupportedPrimitive.TextStroke)
            stroke = true
          }
        }
      }
    }
  }

  private func TextEntrySupported(node Node) bool -> textScene != nil

  private func TextEditorSupported(node Node) bool {
    guard let _ = node.EditorState else { return false }
    return textScene != nil
  }

  private func HasBorderWidth(node Node, bounds ConservativeBounds) bool -> ResolveLength(node.BorderTopWidth, MinDimension(bounds)) > 0.0F
    || ResolveLength(node.BorderRightWidth, MinDimension(bounds)) > 0.0F
    || ResolveLength(node.BorderBottomWidth, MinDimension(bounds)) > 0.0F
    || ResolveLength(node.BorderLeftWidth, MinDimension(bounds)) > 0.0F

  private func PaintNodeBackground(node Node, bounds ConservativeBounds,
    opacity float32, transformIndex int32) {
      PaintBoxShadows(node, bounds, opacity, transformIndex, false)
      if let gradient = node.BackgroundGradient {
        PaintGradient(node, gradient, bounds, opacity, transformIndex)
      } else {
        PaintSolid(node.BackgroundColor, node, bounds, opacity, transformIndex)
      }
      if let scene = imageScene {
        scene.Emit(
          frame,
          bounds,
          BackgroundImageLayouts.CurrentToken(node),
          node.BackgroundImageFit,
          opacity,
          transformIndex)
      }
      if node.Kind != NodeKind.Image {
        PaintBoxShadows(node, bounds, opacity, transformIndex, true)
      }
    }

  private func PaintNode(
    node Node,
    bounds ConservativeBounds,
    opacity float32,
    transformIndex int32,
    axisAligned bool,
    clipDepth int32,
    shapePaintClip bool,
    shapePaintParentChainId int32,
    contentPathClipChainId int32,
    out textComplete bool) {
      textComplete = node.Kind != NodeKind.Text
      if node.Kind == NodeKind.Shape {
        PaintShapeBoxShadows(node, bounds, opacity, transformIndex, false)
        PaintShape(node, bounds, opacity, transformIndex, shapePaintClip,
          shapePaintParentChainId)
        PaintShapeBoxShadows(node, bounds, opacity, transformIndex, true)
        return
      }
      if node.Kind == NodeKind.Image {
        if let scene = imageScene {
          frame.SetActiveClipChain(contentPathClipChainId)
          scene.Emit(
            frame,
            bounds,
            ImageLayouts.CurrentToken(node),
            node.ImageFit,
            opacity,
            transformIndex)
          frame.SetActiveClipChain(shapePaintParentChainId)
        }
      }
      frame.SetActiveClipChain(contentPathClipChainId)
      if node.Kind == NodeKind.Text {
        if let renderer = textScene {
          var complete bool
          let emitted = renderer.Emit(frame, node, opacity, transformIndex, out complete)
          textComplete = emitted && complete
          if renderer.ConsumeColorEffectSkipped() {
            RecordColorEffectsSkipped(node)
          }
          if renderer.ConsumeColorGlyphFallback() {
            RecordUnsupportedDetail(node, VulkanSceneUnsupportedField.Content,
              VulkanSceneUnsupportedPrimitive.Text)
          }
          let publicationPending = renderer.ConsumePublicationPending()
          if !emitted && !publicationPending {
            MarkUnsupported(node, VulkanSceneUnsupportedKind.Text,
              VulkanSceneUnsupportedField.Content,
              VulkanSceneUnsupportedPrimitive.Text)
            unsupportedNodeCount = unsupportedNodeCount + 1
          }
        }
      }
      if node.Kind == NodeKind.Entry {
        if let renderer = textScene {
          if TextEntrySupported(node)
            && TextClipSupported(node, axisAligned, clipDepth) {
              let emitted = renderer.Emit(frame, node, opacity, transformIndex)
              if renderer.ConsumeColorEffectSkipped() {
                RecordColorEffectsSkipped(node)
              }
              if renderer.ConsumeColorGlyphFallback() {
                RecordUnsupportedDetail(node, VulkanSceneUnsupportedField.Content,
                  VulkanSceneUnsupportedPrimitive.TextEntry)
              }
              let publicationPending = renderer.ConsumePublicationPending()
              if !emitted && !publicationPending {
                MarkUnsupported(node, VulkanSceneUnsupportedKind.Entry,
                  VulkanSceneUnsupportedField.Content,
                  VulkanSceneUnsupportedPrimitive.TextEntry)
                unsupportedNodeCount = unsupportedNodeCount + 1
              }
            }
        }
      }
      frame.SetActiveClipChain(shapePaintParentChainId)
    }

  private func PaintEditorContent(node Node, opacity float32, transformIndex int32) {
    guard let renderer = textScene else { return }
    let emitted = renderer.Emit(frame, node, opacity, transformIndex)
    if renderer.ConsumeColorEffectSkipped() {
      RecordColorEffectsSkipped(node)
    }
    if renderer.ConsumeColorGlyphFallback() {
      RecordUnsupportedDetail(node, VulkanSceneUnsupportedField.Content,
        VulkanSceneUnsupportedPrimitive.TextEditor)
    }
    let publicationPending = renderer.ConsumePublicationPending()
    if !emitted && !publicationPending {
      MarkUnsupported(node, VulkanSceneUnsupportedKind.Editor,
        VulkanSceneUnsupportedField.Content,
        VulkanSceneUnsupportedPrimitive.TextEditor)
      unsupportedNodeCount = unsupportedNodeCount + 1
    }
  }

  private func PaintShape(
    node Node,
    bounds ConservativeBounds,
    opacity float32,
    transformIndex int32,
    shapePaintClip bool,
    shapePaintParentChainId int32) {
      let hasBackgroundImage = node.HasBackgroundImageState
        && (BackgroundImageLayouts.Path(node) != ""
            || BackgroundImageLayouts.Source(node) != nil)
      let fillVisible = node.BackgroundColor.A > 0.0F
        || node.BackgroundGradient != nil
        || hasBackgroundImage
      let strokeWidth = node.BorderLeftWidth.Px
      let strokeVisible = strokeWidth > 0.0F && node.BorderLeftColor.A > 0.0F
      if bounds.IsEmpty || opacity <= 0.0F || (!fillVisible && !strokeVisible)
        || node.ShapePath.CommandCount == 0 {
          return
        }
      guard let renderer = pathScene else { return }
      let strokeInset = if node.ShapeStrokeInset { strokeWidth } else { 0.0F }
      let halfStroke = strokeInset * 0.5F
      let paddingLeft = resolveEdgePadding(node, YGEdge.Left, bounds.Width)
      let paddingTop = resolveEdgePadding(node, YGEdge.Top, bounds.Width)
      let paddingRight = resolveEdgePadding(node, YGEdge.Right, bounds.Width)
      let paddingBottom = resolveEdgePadding(node, YGEdge.Bottom, bounds.Width)
      let contentLeft = bounds.X + paddingLeft + halfStroke
      let contentTop = bounds.Y + paddingTop + halfStroke
      let contentWidth = bounds.Width - paddingLeft - paddingRight - strokeInset
      let contentHeight = bounds.Height - paddingTop - paddingBottom - strokeInset
      if contentWidth <= 0.0F || contentHeight <= 0.0F {
        return
      }
      let mapping = PathGeometry.Map(node.ShapePath, node.ShapeFit,
        contentLeft, contentTop, contentWidth, contentHeight)
      if !mapping.Valid {
        return
      }
      let shapePath = PathRoundedCache.Shared.Resolve(node.ShapePath, mapping,
        node.ShapeCornerRadius)
      if shapePath.CommandCount == 0 {
        return
      }
      if shapePaintClip {
        if let gradient = node.BackgroundGradient {
          PaintGradient(node, gradient, bounds, opacity, transformIndex)
        } else {
          PaintSolid(node.BackgroundColor, node, bounds, opacity, transformIndex)
        }
        if let scene = imageScene {
          scene.Emit(
            frame,
            bounds,
            BackgroundImageLayouts.CurrentToken(node),
            node.BackgroundImageFit,
            opacity,
            transformIndex)
        }
        frame.SetActiveClipChain(shapePaintParentChainId)
      } else if fillVisible && node.BackgroundGradient == nil && !hasBackgroundImage {
        let path = renderer.Emit(shapePath, node.ShapeFillRule)
        if path.Renderable {
          frame.AddAnalyticPathBand(AnalyticPathBandRecord{
            Bounds: bounds,
            PathId: path.PathId,
            AtlasId: path.AtlasId,
            AtlasWordOffset: path.BaseWord,
            AtlasWordCount: path.WordCount,
            FillColor: node.BackgroundColor.ToPackedRgba(),
            FillRule: path.FillRule,
            Opacity: opacity,
            ScaleX: mapping.ScaleX,
            ScaleY: mapping.ScaleY,
            TranslateX: mapping.TranslateX,
            TranslateY: mapping.TranslateY,
            TransformIndex: transformIndex,
          })
        }
      }
      if strokeVisible {
        let outline = strokeCache.Resolve(shapePath, mapping, strokeWidth,
          node.ShapeStrokeCap, node.ShapeStrokeJoin, float32(node.MiterLimit), node.Dashes)
        if outline.CommandCount != 0 {
          let path = renderer.Emit(outline, FillRule.NonZero)
          if path.Renderable {
            frame.AddAnalyticPathBand(AnalyticPathBandRecord{
              Bounds: bounds.Inflate(resolveShapeStrokeExtent(strokeWidth, node.ShapeStrokeJoin,
                float32(node.MiterLimit))),
              PathId: path.PathId,
              AtlasId: path.AtlasId,
              AtlasWordOffset: path.BaseWord,
              AtlasWordCount: path.WordCount,
              FillColor: node.BorderLeftColor.ToPackedRgba(),
              FillRule: path.FillRule,
              Opacity: opacity,
              ScaleX: mapping.ScaleX,
              ScaleY: mapping.ScaleY,
              TranslateX: mapping.TranslateX,
              TranslateY: mapping.TranslateY,
              TransformIndex: transformIndex,
            })
          }
        }
      }
    }

  private func TextClipSupported(node Node, axisAligned bool, clipDepth int32) bool {
    var supported = true
    var marked = false
    if !axisAligned {
      MarkTextClipUnsupported(node, VulkanSceneUnsupportedPrimitive.RectClipNonAxisAligned)
      marked = true
      supported = false
    }
    if clipDepth >= MaxRectClipDepth {
      if marked {
        RecordUnsupportedDetail(node, VulkanSceneUnsupportedField.Content,
          VulkanSceneUnsupportedPrimitive.RectClipDepth)
      } else {
        MarkTextClipUnsupported(node, VulkanSceneUnsupportedPrimitive.RectClipDepth)
      }
      supported = false
    }
    return supported
  }

  private func MarkTextClipUnsupported(
    node Node,
    primitive VulkanSceneUnsupportedPrimitive) {
      if node.Kind == NodeKind.Entry {
        MarkUnsupported(node, VulkanSceneUnsupportedKind.Entry,
          VulkanSceneUnsupportedField.Content, primitive)
        unsupportedNodeCount = unsupportedNodeCount + 1
      } else if node.Kind == NodeKind.Editor {
        MarkUnsupported(node, VulkanSceneUnsupportedKind.Editor,
          VulkanSceneUnsupportedField.Content, primitive)
        unsupportedNodeCount = unsupportedNodeCount + 1
      }
    }

  private func PaintBoxShadows(
    node Node,
    bounds ConservativeBounds,
    opacity float32,
    transformIndex int32,
    insetOnly bool) {
      let count = boxShadowCount(node.BoxShadows)
      if count == 0 {
        return
      }
      let supportedOwner = ShadowContextSupported(node)
      var index = count - 1
      while index >= 0 {
        let shadow = boxShadowAt(node.BoxShadows, index)
        if shadow.Inset != insetOnly {
          index = index - 1
          continue
        }
        let validGeometry = finiteVulkanSceneValue(shadow.OffsetX.Value)
          && finiteVulkanSceneValue(shadow.OffsetY.Value)
          && finiteVulkanSceneValue(shadow.Blur.Value)
          && finiteVulkanSceneValue(shadow.Spread.Value)
          && shadow.Blur.Value >= 0.0F
        let shadowBounds = insetOnly ? PaddingEdgeBounds(node, bounds) : bounds
        if !supportedOwner || !validGeometry {
          RecordUnsupportedDetail(node, VulkanSceneUnsupportedField.BoxShadows,
            VulkanSceneUnsupportedPrimitive.BoxShadow)
        } else if shadow.Color.A > 0.0F && !shadowBounds.IsEmpty {
          frame.AddShadow(ShadowRecord{
            Bounds: shadowBounds,
            RadiusTopLeft: insetOnly
            ? PaddingEdgeRadius(node, node.BorderTopLeftRadius, node.BorderRadius,
              bounds, shadowBounds, true, true) : Radius(node.BorderTopLeftRadius, node.BorderRadius, bounds),
            RadiusTopRight: insetOnly
            ? PaddingEdgeRadius(node, node.BorderTopRightRadius, node.BorderRadius,
              bounds, shadowBounds, false, true) : Radius(node.BorderTopRightRadius, node.BorderRadius, bounds),
            RadiusBottomRight: insetOnly
            ? PaddingEdgeRadius(node, node.BorderBottomRightRadius, node.BorderRadius,
              bounds, shadowBounds, false, false) : Radius(node.BorderBottomRightRadius, node.BorderRadius, bounds),
            RadiusBottomLeft: insetOnly
            ? PaddingEdgeRadius(node, node.BorderBottomLeftRadius, node.BorderRadius,
              bounds, shadowBounds, true, false) : Radius(node.BorderBottomLeftRadius, node.BorderRadius, bounds),
            OffsetX: shadow.OffsetX.Px,
            OffsetY: shadow.OffsetY.Px,
            Spread: shadow.Spread.Px,
            Blur: shadow.Blur.Px,
            Color: EffectiveColor(shadow.Color, opacity),
            MaskId: ResourceId{},
            MaskIndex: -1,
            Inset: insetOnly,
            TransformIndex: transformIndex,
          })
        }
        index = index - 1
      }
    }

  private func PaintShapeBoxShadows(
    node Node,
    bounds ConservativeBounds,
    opacity float32,
    transformIndex int32,
    insetOnly bool) {
      let count = boxShadowCount(node.BoxShadows)
      if count == 0 || bounds.IsEmpty || opacity <= 0.0F
        || node.ShapePath.CommandCount == 0 {
          return
        }
      guard let renderer = pathScene else {
        return
      }
      let strokeWidth = node.BorderLeftWidth.Px
      let strokeInset = if node.ShapeStrokeInset { strokeWidth } else { 0.0F }
      let halfStroke = strokeInset * 0.5F
      let paddingLeft = resolveEdgePadding(node, YGEdge.Left, bounds.Width)
      let paddingTop = resolveEdgePadding(node, YGEdge.Top, bounds.Width)
      let paddingRight = resolveEdgePadding(node, YGEdge.Right, bounds.Width)
      let paddingBottom = resolveEdgePadding(node, YGEdge.Bottom, bounds.Width)
      let contentLeft = bounds.X + paddingLeft + halfStroke
      let contentTop = bounds.Y + paddingTop + halfStroke
      let contentWidth = bounds.Width - paddingLeft - paddingRight - strokeInset
      let contentHeight = bounds.Height - paddingTop - paddingBottom - strokeInset
      if contentWidth <= 0.0F || contentHeight <= 0.0F {
        return
      }
      let mapping = PathGeometry.Map(node.ShapePath, node.ShapeFit,
        contentLeft, contentTop, contentWidth, contentHeight)
      if !mapping.Valid || mapping.ScaleX == 0.0F || mapping.ScaleY == 0.0F {
        return
      }
      let shapePath = PathRoundedCache.Shared.Resolve(node.ShapePath, mapping,
        node.ShapeCornerRadius)
      if shapePath.CommandCount == 0 {
        return
      }
      let fillVisible = (node.BackgroundColor.A > 0.0F
          || node.BackgroundGradient != nil
          || node.HasBackgroundImageState)
        && PathGeometry.For(shapePath).HasFillContour
      let strokeVisible = strokeWidth > 0.0F && node.BorderLeftColor.A > 0.0F
      var fillPath VulkanPathRenderable{}
      if fillVisible {
        fillPath = renderer.Emit(shapePath, node.ShapeFillRule)
      }
      var strokePath VulkanPathRenderable{}
      if strokeVisible {
        let outline = strokeCache.Resolve(shapePath, mapping, strokeWidth,
          node.ShapeStrokeCap, node.ShapeStrokeJoin, float32(node.MiterLimit), node.Dashes)
        if outline.CommandCount != 0 {
          strokePath = renderer.Emit(outline, FillRule.NonZero)
        }
      }
      var index = count - 1
      while index >= 0 {
        let shadow = boxShadowAt(node.BoxShadows, index)
        if shadow.Inset != insetOnly {
          index = index - 1
          continue
        }
        let validGeometry = finiteVulkanSceneValue(shadow.OffsetX.Value)
          && finiteVulkanSceneValue(shadow.OffsetY.Value)
          && finiteVulkanSceneValue(shadow.Blur.Value)
          && finiteVulkanSceneValue(shadow.Spread.Value)
          && shadow.Blur.Value >= 0.0F
        if !validGeometry {
          RecordUnsupportedDetail(node, VulkanSceneUnsupportedField.BoxShadows,
            VulkanSceneUnsupportedPrimitive.BoxShadow)
          index = index - 1
          continue
        }
        let maskBounds = ShapeShadowMaskBounds(bounds, shadow)
        if shadow.Color.A > 0.0F && !maskBounds.IsEmpty {
          if fillVisible && fillPath.Renderable {
            let maskIndex = AddShapeShadowMask(node, shapePath, mapping,
              fillPath, node.ShapeFillRule, maskBounds, transformIndex, index, false,
              insetOnly, shadow)
            AddShapeShadow(node, bounds, opacity, transformIndex, shadow,
              maskIndex, insetOnly)
          }
          if strokeVisible && strokePath.Renderable {
            let maskIndex = AddShapeShadowMask(node, shapePath, mapping,
              strokePath, FillRule.NonZero, maskBounds, transformIndex, index, true,
              insetOnly, shadow)
            AddShapeShadow(node, bounds, opacity, transformIndex, shadow,
              maskIndex, insetOnly)
          }
        }
        index = index - 1
      }
    }

  private func ShapeShadowMaskBounds(
    bounds ConservativeBounds,
    shadow BoxShadow) ConservativeBounds{
      let blur = shadow.Blur.Px
      let spread = MathF.Abs(shadow.Spread.Px)
      let blurExtent = blur > 0.0F ? blur * 2.0F + 2.0F : 1.0F
      let extent = blurExtent + spread
      return bounds.Inflate(extent)
    }

  private func AddShapeShadowMask(
    node Node,
    shapePath VectorPath,
    mapping PathMapping,
    path VulkanPathRenderable,
    fillRule FillRule,
    maskBounds ConservativeBounds,
    transformIndex int32,
    shadowIndex int32,
    stroke bool,
    inset bool,
    shadow BoxShadow) int32{
      let stableId = ShapeShadowMaskId(node, shadowIndex, stroke, inset)
      var contentKey = ClipContentKey(node, shapePath, node.ShapeFit,
        uint32(fillRule), maskBounds, transformIndex)
      contentKey = MixPathHash(contentKey, uint64(shadowIndex + 1))
      contentKey = MixPathHash(contentKey, stroke ? 3uL : 5uL)
      contentKey = MixPathHash(contentKey, inset ? 7uL : 11uL)
      contentKey = HashPathFloat(contentKey, shadow.OffsetX.Px)
      contentKey = HashPathFloat(contentKey, shadow.OffsetY.Px)
      contentKey = HashPathFloat(contentKey, shadow.Spread.Px)
      contentKey = HashPathFloat(contentKey, shadow.Blur.Px)
      let mask = frame.AddClipMask(ClipMaskRecord{
        StableId: stableId,
        PathId: path.PathId,
        AtlasId: path.AtlasId,
        AtlasWordOffset: path.BaseWord,
        AtlasWordCount: path.WordCount,
        Bounds: maskBounds,
        PathBounds: maskBounds,
        Fit: ShapeFit.Fill,
        FillRule: path.FillRule,
        ScaleX: mapping.ScaleX,
        ScaleY: mapping.ScaleY,
        TranslateX: mapping.TranslateX,
        TranslateY: mapping.TranslateY,
        TransformIndex: transformIndex,
        ContentKey: contentKey,
      })
      clipMaskCount = frame.ClipMaskCount
      return mask
    }

  private func AddShapeShadow(
    node Node,
    bounds ConservativeBounds,
    opacity float32,
    transformIndex int32,
    shadow BoxShadow,
    maskIndex int32,
    inset bool) {
      if maskIndex < 0 {
        return
      }
      frame.AddShadow(ShadowRecord{
        Bounds: bounds,
        RadiusTopLeft: 0.0F,
        RadiusTopRight: 0.0F,
        RadiusBottomRight: 0.0F,
        RadiusBottomLeft: 0.0F,
        OffsetX: shadow.OffsetX.Px,
        OffsetY: shadow.OffsetY.Px,
        Spread: shadow.Spread.Px,
        Blur: shadow.Blur.Px,
        Color: EffectiveColor(shadow.Color, opacity),
        MaskId: ResourceId{},
        MaskIndex: maskIndex,
        Inset: inset,
        TransformIndex: transformIndex,
      })
    }

  private func ShapeShadowMaskId(
    node Node,
    shadowIndex int32,
    stroke bool,
    inset bool) uint64{
      var result = OwnerId(node) | (1uL << 61)
      result = MixPathHash(result, uint64(shadowIndex + 1))
      result = MixPathHash(result, stroke ? 3uL : 5uL)
      result = MixPathHash(result, inset ? 7uL : 11uL)
      return result == 0uL ? 1uL : result
    }

  private func PaddingEdgeBounds(node Node, bounds ConservativeBounds) ConservativeBounds {
    let basis = MinDimension(bounds)
    let left = ResolveLength(node.BorderLeftWidth, basis)
    let top = ResolveLength(node.BorderTopWidth, basis)
    let right = ResolveLength(node.BorderRightWidth, basis)
    let bottom = ResolveLength(node.BorderBottomWidth, basis)
    let width = bounds.Width - left - right
    let height = bounds.Height - top - bottom
    if width <= 0.0F || height <= 0.0F {
      return ConservativeBounds{}
    }
    return ConservativeBounds{
      X: bounds.X + left,
      Y: bounds.Y + top,
      Width: width,
      Height: height,
    }
  }

  private func PaddingEdgeRadius(
    node Node,
    value Length,
    fallback Length,
    bounds ConservativeBounds,
    insetBounds ConservativeBounds,
    left bool,
    top bool) float32{
      let radius = Radius(value, fallback, bounds)
      let basis = MinDimension(bounds)
      let xInset = if left {
        ResolveLength(node.BorderLeftWidth, basis)
      } else {
        ResolveLength(node.BorderRightWidth, basis)
      }
      let yInset = if top {
        ResolveLength(node.BorderTopWidth, basis)
      } else {
        ResolveLength(node.BorderBottomWidth, basis)
      }
      let inset = xInset > yInset ? xInset : yInset
      let result = radius - inset
      let limit = MinDimension(insetBounds) * 0.5F
      if result <= 0.0F { return 0.0F }
      return result > limit ? limit : result
    }

  private func PaintOutline(
    node Node,
    bounds ConservativeBounds,
    opacity float32,
    transformIndex int32) {
      let outlineBounds = OutlineBounds(node, bounds)
      if outlineBounds.IsEmpty || opacity <= 0.0F {
        return
      }
      let width = node.OutlineWidth.Px
      let offset = node.OutlineOffset.Px
      let amount = offset + width
      let color = EffectiveColor(node.OutlineColor, opacity)
      frame.AddPerEdgeBorder(PerEdgeBorderRecord{
        Bounds: outlineBounds,
        TopWidth: width,
        RightWidth: width,
        BottomWidth: width,
        LeftWidth: width,
        RadiusTopLeft: OutlineRadius(node.BorderTopLeftRadius, node.BorderRadius,
          bounds, amount),
        RadiusTopRight: OutlineRadius(node.BorderTopRightRadius, node.BorderRadius,
          bounds, amount),
        RadiusBottomRight: OutlineRadius(node.BorderBottomRightRadius, node.BorderRadius,
          bounds, amount),
        RadiusBottomLeft: OutlineRadius(node.BorderBottomLeftRadius, node.BorderRadius,
          bounds, amount),
        TopColor: color,
        RightColor: color,
        BottomColor: color,
        LeftColor: color,
        Style: uint32(int32(BorderStyle.Solid)),
        TransformIndex: transformIndex,
      })
    }

  private func OutlineBounds(node Node, bounds ConservativeBounds) ConservativeBounds {
    if node.Kind == NodeKind.Shape || !node.HasOutlineState
      || bounds.IsEmpty || node.OutlineColor.A <= 0.0F {
        return ConservativeBounds{}
      }
    let width = node.OutlineWidth.Px
    let offset = node.OutlineOffset.Px
    if !finiteVulkanSceneValue(width) || !finiteVulkanSceneValue(offset) || width <= 0.0F {
      return ConservativeBounds{}
    }
    let amount = offset + width
    if !finiteVulkanSceneValue(amount) {
      return ConservativeBounds{}
    }
    let result = bounds.Inflate(amount)
    if !finiteVulkanSceneValue(result.X) || !finiteVulkanSceneValue(result.Y)
      || !finiteVulkanSceneValue(result.Width) || !finiteVulkanSceneValue(result.Height)
      || result.IsEmpty{
        return ConservativeBounds{}
      }
    return result
  }

  private func OutlineRadius(
    value Length,
    fallback Length,
    bounds ConservativeBounds,
    amount float32) float32{
      let radius = Radius(value, fallback, bounds) + amount
      return radius > 0.0F && finiteVulkanSceneValue(radius) ? radius : 0.0F
    }

  private func ExpandedChunkBounds(
    node Node,
    bounds ConservativeBounds,
    eligible bool) ConservativeBounds{
      let count = boxShadowCount(node.BoxShadows)
      if bounds.IsEmpty {
        return bounds
      }
      var result = if node.Kind != NodeKind.Shape && HasRadius(node, bounds)
        && (node.BackgroundColor.A > 0.0F || node.BackgroundGradient != nil
            || HasBorderWidth(node, bounds)) {
              bounds.Inflate(1.0F)
            } else {
              bounds
            }
      let outlineBounds = OutlineBounds(node, bounds)
      if !outlineBounds.IsEmpty {
        result = unionVulkanSceneBounds(result, outlineBounds)
      }
      if eligible {
        var index int32 = 0
        while index < count {
          let shadow = boxShadowAt(node.BoxShadows, index)
          if !shadow.Inset && shadow.Color.A > 0.0F
            && finiteVulkanSceneValue(shadow.OffsetX.Value)
            && finiteVulkanSceneValue(shadow.OffsetY.Value)
            && finiteVulkanSceneValue(shadow.Blur.Value)
            && finiteVulkanSceneValue(shadow.Spread.Value)
            && shadow.Blur.Value >= 0.0F {
              let spread = shadow.Spread.Px > 0.0F ? shadow.Spread.Px : 0.0F
              let blur = shadow.Blur.Px
              let blurExtent = blur > 0.0F ? blur * 2.0F + 2.0F : 0.0F
              let extent = blurExtent + spread
              let candidate = ConservativeBounds{
                X: bounds.X + shadow.OffsetX.Px - extent,
                Y: bounds.Y + shadow.OffsetY.Px - extent,
                Width: bounds.Width + extent + extent,
                Height: bounds.Height + extent + extent,
              }
              result = unionVulkanSceneBounds(result, candidate)
            }
          index = index + 1
        }
      }
      if node.Kind == NodeKind.Text || node.Kind == NodeKind.Entry
        || node.Kind == NodeKind.Editor{
          let pad = TextEffectChunkPad(node)
          if pad > 0.0F { result = result.Inflate(pad) }
        }
      if node.Kind == NodeKind.Shape {
        let width = ResolveLength(node.BorderLeftWidth, MinDimension(bounds))
        if width > 0.0F && node.BorderLeftColor.A > 0.0F {
          result = result.Inflate(resolveShapeStrokeExtent(width, node.ShapeStrokeJoin,
            float32(node.MiterLimit)))
        }
      }
      return result
    }

  private func TextEffectChunkPad(node Node) float32 {
    var result = textPaintPad(node.TextStrokeWidth.Px, node.TextShadows)
    if node.Kind == NodeKind.Entry { return result }
    if node.Kind == NodeKind.Text && PassiveTextPresentations.Read(node) == nil {
      return result
    }
    if node.Kind == NodeKind.Editor {
      let layout = TextEditorLayouts.For(node, TextLayouts.ContentWidth(node),
        TextLayouts.ContentHeight(node))
      for lineIndex in 0 ... layout.Lines.Count {
        let line = layout.Lines[lineIndex]
        if let baseStyle = line.Paragraph.BaseStyle {
          let pad = textPaintPad(baseStyle.StrokeWidth, baseStyle.Shadows)
          if pad > result { result = pad }
        }
        for runIndex in 0 ... line.Runs.Count {
          let run = line.Runs[runIndex]
          let pad = textPaintPad(run.Style.StrokeWidth, run.Style.Shadows)
          if pad > result { result = pad }
        }
      }
      return result
    }
    let layout = TextLayouts.For(node, TextLayouts.ContentWidth(node))
    if let rich = layout.Rich {
      for line in rich.Lines {
        if line.PaintPad > result { result = line.PaintPad }
      }
    }
    return result
  }

  private func ShadowContextSupported(node Node) bool -> node.Kind == NodeKind.Container || node.Kind == NodeKind.Button
    || node.Kind == NodeKind.Text || node.Kind == NodeKind.Entry
    || node.Kind == NodeKind.Editor || node.Kind == NodeKind.Shape
    || node.Kind == NodeKind.Image

  private func HasScrollBars(node Node) bool {
    if scrollbarAlpha(node) <= 0.0F { return false }
    var geometry ScrollThumbGeometry
    return verticalScrollThumb(node, out geometry)
      || horizontalScrollThumb(node, out geometry)
  }

  private func PaintScrollBars(node Node, opacity float32, transformIndex int32) {
    let alpha = scrollbarAlpha(node)
    if alpha <= 0.0F || opacity <= 0.0F { return }
    var geometry ScrollThumbGeometry
    if verticalScrollThumb(node, out geometry) {
      PaintScrollThumb(geometry, opacity * alpha, transformIndex)
    }
    if horizontalScrollThumb(node, out geometry) {
      PaintScrollThumb(geometry, opacity * alpha, transformIndex)
    }
  }

  private func PaintScrollThumb(geometry ScrollThumbGeometry, opacity float32,
    transformIndex int32) {
      let bounds = geometry.Bounds
      frame.AddRoundedBox(RoundedBoxRecord{
        Bounds: ConservativeBounds{
          X: bounds.X,
          Y: bounds.Y,
          Width: bounds.W,
          Height: bounds.H,
        },
        RadiusTopLeft: 2.0F,
        RadiusTopRight: 2.0F,
        RadiusBottomRight: 2.0F,
        RadiusBottomLeft: 2.0F,
        Color: Color.White.ToPackedRgba(),
        Opacity: opacity * 0.35F,
        TransformIndex: transformIndex,
      })
    }

  private func PaintSolid(
    color Color,
    node Node,
    bounds ConservativeBounds,
    opacity float32,
    transformIndex int32) {
      if color.A <= 0.0F || opacity <= 0.0F || bounds.IsEmpty {
        return
      }
      if HasRadius(node, bounds) {
        let opaqueBorderWidth = OpaqueRoundedBorderCompensationWidth(node, bounds, opacity)
        frame.AddRoundedBox(RoundedBoxRecord{
          Bounds: bounds,
          RadiusTopLeft: Radius(node.BorderTopLeftRadius, node.BorderRadius, bounds),
          RadiusTopRight: Radius(node.BorderTopRightRadius, node.BorderRadius, bounds),
          RadiusBottomRight: Radius(node.BorderBottomRightRadius, node.BorderRadius, bounds),
          RadiusBottomLeft: Radius(node.BorderBottomLeftRadius, node.BorderRadius, bounds),
          OpaqueBorderWidth: opaqueBorderWidth,
          OpaqueBorderHeight: opaqueBorderWidth,
          Color: color.ToPackedRgba(),
          Opacity: opacity,
          TransformIndex: transformIndex,
        })
      } else {
        frame.AddSolidBox(SolidBoxRecord{
          Bounds: bounds,
          Color: color.ToPackedRgba(),
          Opacity: opacity,
          TransformIndex: transformIndex,
        })
      }
    }

  private func OpaqueRoundedBorderCompensationWidth(
    node Node,
    bounds ConservativeBounds,
    opacity float32) float32{
      if (node.Kind != NodeKind.Container && node.Kind != NodeKind.Button)
        || bounds.IsEmpty
        || opacity != 1.0F
        || node.Opacity != 1.0
        || node.BackgroundColor.A != 1.0F
        || node.BackgroundGradient != nil
        || node.HasBackgroundImageState
        || boxShadowCount(node.BoxShadows) != 0
        || node.BorderStyle != BorderStyle.Solid{
          return 0.0F
        }
      let basis = MinDimension(bounds)
      let top = ResolveLength(node.BorderTopWidth, basis)
      let right = ResolveLength(node.BorderRightWidth, basis)
      let bottom = ResolveLength(node.BorderBottomWidth, basis)
      let left = ResolveLength(node.BorderLeftWidth, basis)
      if top <= 0.0F || right != top || bottom != top || left != top {
        return 0.0F
      }
      let radiusTopLeft = Radius(node.BorderTopLeftRadius, node.BorderRadius, bounds)
      let radiusTopRight = Radius(node.BorderTopRightRadius, node.BorderRadius, bounds)
      let radiusBottomRight = Radius(node.BorderBottomRightRadius, node.BorderRadius, bounds)
      let radiusBottomLeft = Radius(node.BorderBottomLeftRadius, node.BorderRadius, bounds)
      if radiusTopLeft < top || radiusTopRight != radiusTopLeft
        || radiusBottomRight != radiusTopLeft || radiusBottomLeft != radiusTopLeft{
          return 0.0F
        }
      let color = node.BorderTopColor.ToPackedRgba()
      if node.BorderTopColor.A != 1.0F
        || node.BorderRightColor.A != 1.0F
        || node.BorderBottomColor.A != 1.0F
        || node.BorderLeftColor.A != 1.0F
        || node.BorderRightColor.ToPackedRgba() != color
        || node.BorderBottomColor.ToPackedRgba() != color
        || node.BorderLeftColor.ToPackedRgba() != color{
          return 0.0F
        }
      return top
    }

  private func PaintBorder(
    node Node,
    bounds ConservativeBounds,
    opacity float32,
    transformIndex int32) {
      let top = ResolveLength(node.BorderTopWidth, MinDimension(bounds))
      let right = ResolveLength(node.BorderRightWidth, MinDimension(bounds))
      let bottom = ResolveLength(node.BorderBottomWidth, MinDimension(bounds))
      let left = ResolveLength(node.BorderLeftWidth, MinDimension(bounds))
      if top <= 0.0F && right <= 0.0F && bottom <= 0.0F && left <= 0.0F {
        return
      }
      if node.BorderStyle != BorderStyle.Solid
        && node.BorderStyle != BorderStyle.Dashed
        && node.BorderStyle != BorderStyle.Dotted{
          MarkUnsupported(VulkanSceneUnsupportedKind.BorderStyle)
          return
        }
      frame.AddPerEdgeBorder(PerEdgeBorderRecord{
        Bounds: bounds,
        TopWidth: top,
        RightWidth: right,
        BottomWidth: bottom,
        LeftWidth: left,
        RadiusTopLeft: Radius(node.BorderTopLeftRadius, node.BorderRadius, bounds),
        RadiusTopRight: Radius(node.BorderTopRightRadius, node.BorderRadius, bounds),
        RadiusBottomRight: Radius(node.BorderBottomRightRadius, node.BorderRadius, bounds),
        RadiusBottomLeft: Radius(node.BorderBottomLeftRadius, node.BorderRadius, bounds),
        TopColor: EffectiveColor(node.BorderTopColor, opacity),
        RightColor: EffectiveColor(node.BorderRightColor, opacity),
        BottomColor: EffectiveColor(node.BorderBottomColor, opacity),
        LeftColor: EffectiveColor(node.BorderLeftColor, opacity),
        Style: uint32(int32(node.BorderStyle)),
        TransformIndex: transformIndex,
      })
    }

  private func PaintGradient(
    node Node,
    gradient Gradient,
    bounds ConservativeBounds,
    opacity float32,
    transformIndex int32) {
      if bounds.IsEmpty {
        return
      }
      let stops = gradient.Stops
      let primitive = switch gradient {
        case linear is CompiledVectorLinearGradient: VulkanSceneUnsupportedPrimitive.LinearGradient
        case radial is CompiledVectorRadialGradient: VulkanSceneUnsupportedPrimitive.RadialGradient
        case linear is LinearGradient: VulkanSceneUnsupportedPrimitive.LinearGradient
        case radial is RadialGradient: VulkanSceneUnsupportedPrimitive.RadialGradient
        case _: VulkanSceneUnsupportedPrimitive.Gradient
      }
      if primitive == VulkanSceneUnsupportedPrimitive.Gradient {
        MarkUnsupported(node, VulkanSceneUnsupportedKind.Gradient,
          VulkanSceneUnsupportedField.BackgroundGradient, primitive)
        return
      }
      if stops.Count < 2 {
        MarkUnsupported(node, VulkanSceneUnsupportedKind.Gradient,
          VulkanSceneUnsupportedField.BackgroundGradient, primitive)
        return
      }
      let start = frame.GradientStopCount
      var index int32 = 0
      while index < stops.Count {
        let stop = stops[index]
        frame.AddGradientStop(GradientStopRecord{
          Offset: float32(stop.Offset),
          Color: stop.Color.ToPackedRgba(),
        })
        index = index + 1
      }
      switch gradient {
        case compiled is CompiledVectorLinearGradient {
          frame.AddLinearGradient(LinearGradientRecord{
            Bounds: bounds,
            RadiusTopLeft: Radius(node.BorderTopLeftRadius, node.BorderRadius, bounds),
            RadiusTopRight: Radius(node.BorderTopRightRadius, node.BorderRadius, bounds),
            RadiusBottomRight: Radius(node.BorderBottomRightRadius, node.BorderRadius, bounds),
            RadiusBottomLeft: Radius(node.BorderBottomLeftRadius, node.BorderRadius, bounds),
            StartX: bounds.X + bounds.Width * float32(compiled.X0),
            StartY: bounds.Y + bounds.Height * float32(compiled.Y0),
            EndX: bounds.X + bounds.Width * float32(compiled.X1),
            EndY: bounds.Y + bounds.Height * float32(compiled.Y1),
            StopStart: start,
            StopCount: stops.Count,
            Opacity: opacity,
            TransformIndex: transformIndex,
          })
          return
        }
        case compiled is CompiledVectorRadialGradient {
          frame.AddRadialGradient(RadialGradientRecord{
            Bounds: bounds,
            RadiusTopLeft: Radius(node.BorderTopLeftRadius, node.BorderRadius, bounds),
            RadiusTopRight: Radius(node.BorderTopRightRadius, node.BorderRadius, bounds),
            RadiusBottomRight: Radius(node.BorderBottomRightRadius, node.BorderRadius, bounds),
            RadiusBottomLeft: Radius(node.BorderBottomLeftRadius, node.BorderRadius, bounds),
            CenterX: bounds.X + bounds.Width * float32(compiled.CenterX),
            CenterY: bounds.Y + bounds.Height * float32(compiled.CenterY),
            RadiusX: bounds.Width * float32(compiled.RadiusX),
            RadiusY: bounds.Height * float32(compiled.RadiusY),
            StopStart: start,
            StopCount: stops.Count,
            Opacity: opacity,
            TransformIndex: transformIndex,
          })
          return
        }
        case linear is LinearGradient {
          let radians = float32(linear.Angle) * MathF.PI / 180.0F
          let dx = MathF.Sin(radians)
          let dy = -MathF.Cos(radians)
          let half = 0.5F * (MathF.Abs(dx) * bounds.Width + MathF.Abs(dy) * bounds.Height)
          let centerX = bounds.X + bounds.Width * 0.5F
          let centerY = bounds.Y + bounds.Height * 0.5F
          frame.AddLinearGradient(LinearGradientRecord{
            Bounds: bounds,
            RadiusTopLeft: Radius(node.BorderTopLeftRadius, node.BorderRadius, bounds),
            RadiusTopRight: Radius(node.BorderTopRightRadius, node.BorderRadius, bounds),
            RadiusBottomRight: Radius(node.BorderBottomRightRadius, node.BorderRadius, bounds),
            RadiusBottomLeft: Radius(node.BorderBottomLeftRadius, node.BorderRadius, bounds),
            StartX: centerX - dx * half,
            StartY: centerY - dy * half,
            EndX: centerX + dx * half,
            EndY: centerY + dy * half,
            StopStart: start,
            StopCount: stops.Count,
            Opacity: opacity,
            TransformIndex: transformIndex,
          })
          return
        }
        case radial is RadialGradient {
          frame.AddRadialGradient(RadialGradientRecord{
            Bounds: bounds,
            RadiusTopLeft: Radius(node.BorderTopLeftRadius, node.BorderRadius, bounds),
            RadiusTopRight: Radius(node.BorderTopRightRadius, node.BorderRadius, bounds),
            RadiusBottomRight: Radius(node.BorderBottomRightRadius, node.BorderRadius, bounds),
            RadiusBottomLeft: Radius(node.BorderBottomLeftRadius, node.BorderRadius, bounds),
            CenterX: bounds.X + bounds.Width * float32(radial.CenterX),
            CenterY: bounds.Y + bounds.Height * float32(radial.CenterY),
            RadiusX: bounds.Width * float32(radial.Radius),
            RadiusY: bounds.Height * float32(radial.Radius),
            StopStart: start,
            StopCount: stops.Count,
            Opacity: opacity,
            TransformIndex: transformIndex,
          })
          return
        }
        case _ {
          MarkUnsupported(node, VulkanSceneUnsupportedKind.Gradient,
            VulkanSceneUnsupportedField.BackgroundGradient,
            VulkanSceneUnsupportedPrimitive.Gradient)
          return
        }
      }
    }

  private func HasRadius(node Node, bounds ConservativeBounds) bool -> Radius(node.BorderTopLeftRadius, node.BorderRadius, bounds) > 0.0F
    || Radius(node.BorderTopRightRadius, node.BorderRadius, bounds) > 0.0F
    || Radius(node.BorderBottomRightRadius, node.BorderRadius, bounds) > 0.0F
    || Radius(node.BorderBottomLeftRadius, node.BorderRadius, bounds) > 0.0F

  private func Radius(value Length, fallback Length, bounds ConservativeBounds) float32 {
    let source = value.HasMagnitude ? value : fallback
    let radius = ResolveLength(source, MinDimension(bounds))
    let limit = MinDimension(bounds) * 0.5F
    return radius > limit ? limit : radius
  }

  private func ResolveLength(value Length, basis float32) float32 {
    if !value.HasMagnitude || !finiteVulkanSceneValue(value.Value) {
      return 0.0F
    }
    let resolved = value.Unit == LengthUnit.Percent
    ? basis * value.Value / 100.0F : value.Value
    if !finiteVulkanSceneValue(resolved) || resolved <= 0.0F {
      return 0.0F
    }
    return resolved
  }

  private func MinDimension(bounds ConservativeBounds) float32 -> bounds.Width < bounds.Height ? bounds.Width : bounds.Height

  private func EffectiveColor(color Color, opacity float32) uint32 {
    let alpha = color.A * opacity
    return Color.FromNormalized(color.R, color.G, color.B, alpha).ToPackedRgba()
  }

}
