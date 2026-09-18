package Goo

import Facebook.Yoga
import System
import System.Runtime.CompilerServices

internal partial class VulkanSceneCompiler {
  private func CompilerTransform(node Node) PrimitiveTransform {
    if !node.HasVisualTransform {
      return PrimitiveTransform{ A: 1.0F, D: 1.0F }
    }
    let matrix = TransformGeometry.Matrix(node)
    return PrimitiveTransform{
      A: matrix.A,
      B: matrix.C,
      C: matrix.B,
      D: matrix.D,
      TX: matrix.TX,
      TY: matrix.TY,
    }
  }

  private func ComposeCompilerTransform(
    outer PrimitiveTransform,
    inner PrimitiveTransform) PrimitiveTransform -> PrimitiveTransform{
      A: outer.A * inner.A + outer.C * inner.B,
      B: outer.B * inner.A + outer.D * inner.B,
      C: outer.A * inner.C + outer.C * inner.D,
      D: outer.B * inner.C + outer.D * inner.D,
      TX: outer.A * inner.TX + outer.C * inner.TY + outer.TX,
      TY: outer.B * inner.TX + outer.D * inner.TY + outer.TY,
    }

  private func ResolveCompilerFrameTransform(index int32) PrimitiveTransform {
    var result = PrimitiveTransform{ A: 1.0F, D: 1.0F }
    var current = index
    var steps int32 = 0
    while current >= 0 {
      if current >= frame.TransformCount || steps >= frame.TransformCount {
        throw InvalidOperationException("Vulkan scene transform chain is invalid")
      }
      let value = frame.Transforms[current]
      let record = PrimitiveTransform{
        A: value.A,
        B: value.B,
        C: value.C,
        D: value.D,
        TX: value.TX,
        TY: value.TY,
      }
      result = ComposeCompilerTransform(record, result)
      current = value.ParentIndex
      steps = steps + 1
    }
    return result
  }

  private func TransformCompilerBounds(
    bounds ConservativeBounds,
    transform PrimitiveTransform) ConservativeBounds{
      if bounds.IsEmpty {
        return bounds
      }
      let x0 = transform.A * bounds.X + transform.C * bounds.Y + transform.TX
      let y0 = transform.B * bounds.X + transform.D * bounds.Y + transform.TY
      let x1 = transform.A * bounds.Right + transform.C * bounds.Y + transform.TX
      let y1 = transform.B * bounds.Right + transform.D * bounds.Y + transform.TY
      let x2 = transform.A * bounds.X + transform.C * bounds.Bottom + transform.TX
      let y2 = transform.B * bounds.X + transform.D * bounds.Bottom + transform.TY
      let x3 = transform.A * bounds.Right + transform.C * bounds.Bottom + transform.TX
      let y3 = transform.B * bounds.Right + transform.D * bounds.Bottom + transform.TY
      let left = MathF.Min(MathF.Min(x0, x1), MathF.Min(x2, x3))
      let top = MathF.Min(MathF.Min(y0, y1), MathF.Min(y2, y3))
      let right = MathF.Max(MathF.Max(x0, x1), MathF.Max(x2, x3))
      let bottom = MathF.Max(MathF.Max(y0, y1), MathF.Max(y2, y3))
      return ConservativeBounds{
        X: left,
        Y: top,
        Width: right - left,
        Height: bottom - top,
      }
    }

  private func IntersectBounds(
    first ConservativeBounds,
    second ConservativeBounds) ConservativeBounds{
      if first.IsEmpty || second.IsEmpty {
        return ConservativeBounds{}
      }
      let left = first.X > second.X ? first.X : second.X
      let top = first.Y > second.Y ? first.Y : second.Y
      let right = first.Right < second.Right ? first.Right : second.Right
      let bottom = first.Bottom < second.Bottom ? first.Bottom : second.Bottom
      if right <= left || bottom <= top {
        return ConservativeBounds{}
      }
      return ConservativeBounds{
        X: left,
        Y: top,
        Width: right - left,
        Height: bottom - top,
      }
    }

  private func StrictPlainTextViewportCullEligible(
    node Node,
    owner VulkanSceneOwnerId,
    bounds ConservativeBounds,
    parentTransformIndex int32,
    parentAxisAligned bool,
    parentIsolated bool) bool -> parentTransformIndex == -1 && parentAxisAligned && !parentIsolated
    && StrictPlainTextContentEligible(node, owner, bounds)

  private func StrictPlainTextContentEligible(
    node Node,
    owner VulkanSceneOwnerId,
    bounds ConservativeBounds) bool{
      if node.Kind != NodeKind.Text || node.Children.Count != 0 {
        return false
      }
      if owner.CachedTextCullVersion == node.ScenePaintVersion
        && owner.CachedTextCullBounds.X == bounds.X
        && owner.CachedTextCullBounds.Y == bounds.Y
        && owner.CachedTextCullBounds.Width == bounds.Width
        && owner.CachedTextCullBounds.Height == bounds.Height{
          return owner.CachedTextCullEligible
        }
      let fontSize = TextLayouts.fontSize(node)
      let lineHeight = TextLayouts.resolvedLineHeight(node)
      let contentHeight = BoxGeometry.ContentHeight(node)
      let eligible = node.TextWrap == TextWrap.NoWrap
        && node.TextTrimming == TextTrimming.Ellipsis
        && node.Width.Unit == LengthUnit.Px
        && node.Height.Unit == LengthUnit.Px
        && node.FontSize.Unit == LengthUnit.Px
        && finiteVulkanSceneValue(fontSize) && fontSize > 0.0F
        && finiteVulkanSceneValue(lineHeight) && lineHeight > 0.0F
        && finiteVulkanSceneValue(contentHeight) && contentHeight >= lineHeight
        && !node.HasTextShadowState
        && !node.HasTextStrokeState
        && node.TextDecoration == TextDecoration.None
        && PassiveTextPresentations.Read(node) == nil
        && node.BackgroundColor.A <= 0.0F
        && node.BackgroundGradient == nil
        && !node.HasBackgroundImageState
        && !node.HasOutlineState
        && boxShadowCount(node.BoxShadows) == 0
        && !node.HasClipPath
        && ((node.OverflowX == Overflow.Visible
            && node.OverflowY == Overflow.Visible)
            || (node.OverflowX == Overflow.Hidden
                && node.OverflowY == Overflow.Hidden
                && !HasRadius(node, bounds)))
        && !node.HasTransformState
        && !node.HasVisualTransform
        && node.ScrollX == 0.0F
        && node.ScrollY == 0.0F
        && node.BlendMode == BlendMode.Normal
        && !HasBorderWidth(node, bounds)
        && node.BorderTopColor.A <= 0.0F
        && node.BorderRightColor.A <= 0.0F
        && node.BorderBottomColor.A <= 0.0F
        && node.BorderLeftColor.A <= 0.0F
      owner.CachedTextCullVersion = node.ScenePaintVersion
      owner.CachedTextCullBounds = bounds
      owner.CachedTextCullEligible = eligible
      return eligible
    }

  private func PreflightRectOverflowClip(
    node Node,
    bounds ConservativeBounds,
    axisAligned bool,
    parentClipDepth int32) VulkanRectOverflowClipPreflight{
      let clipsX = node.OverflowX != Overflow.Visible
      let clipsY = node.OverflowY != Overflow.Visible
      let bothAxes = clipsX && clipsY
      let depthExceeded = parentClipDepth >= MaxRectClipDepth
      return VulkanRectOverflowClipPreflight{
        ClipsX: clipsX,
        ClipsY: clipsY,
        BothAxes: bothAxes,
        HasRadius: bothAxes && HasRadius(node, bounds),
        DepthExceeded: depthExceeded,
        RectangularEmittable: bothAxes && axisAligned && !depthExceeded,
      }
    }

  private func TextEditorContentBounds(node Node) ConservativeBounds -> ConservativeBounds {
    X: BoxGeometry.ContentLeft(node),
    Y: BoxGeometry.ContentTop(node),
    Width: BoxGeometry.ContentWidth(node),
    Height: BoxGeometry.ContentHeight(node),
  }

  private func ExactTextClipCullEligible(
    node Node,
    bounds ConservativeBounds,
    exactCullContextSafe bool,
    parentAxisAligned bool,
    preflight VulkanRectOverflowClipPreflight) bool-> !(node.Kind != NodeKind.Text || node.Children.Count != 0
        || !exactCullContextSafe
        || !finiteVulkanSceneValue(bounds.X) || !finiteVulkanSceneValue(bounds.Y)
        || !finiteVulkanSceneValue(bounds.Width) || !finiteVulkanSceneValue(bounds.Height)
        || bounds.IsEmpty
        || node.OverflowX != Overflow.Hidden
        || node.OverflowY != Overflow.Hidden
        || !preflight.BothAxes || preflight.HasRadius
        || !preflight.RectangularEmittable
        || !parentAxisAligned
        || node.Width.Unit != LengthUnit.Px
        || node.Height.Unit != LengthUnit.Px
        || node.FontSize.Unit != LengthUnit.Px
        || !finiteVulkanSceneValue(node.FontSize.Px) || node.FontSize.Px <= 0.0F
        || node.TextWrap != TextWrap.NoWrap
        || node.TextTrimming != TextTrimming.Ellipsis
        || node.HasTextShadowState
        || node.HasTextStrokeState
        || node.TextDecoration != TextDecoration.None
        || PassiveTextPresentations.Read(node) != nil
        || node.BackgroundColor.A > 0.0F
        || node.BackgroundGradient != nil
        || node.HasBackgroundImageState
        || node.HasOutlineState
        || boxShadowCount(node.BoxShadows) != 0
        || node.HasClipPath
        || node.HasTransformState
        || node.HasVisualTransform
        || node.BlendMode != BlendMode.Normal
        || styleMaskHas(node.AppliedMask, StyleField.ShaderEffect)
        || HasBorderWidth(node, bounds)
        || node.BorderTopColor.A > 0.0F
        || node.BorderRightColor.A > 0.0F
        || node.BorderBottomColor.A > 0.0F
        || node.BorderLeftColor.A > 0.0F)

  private func ExactCullContextForChildren(
    contextSafe bool,
    node Node,
    isolates bool,
    axisAligned bool,
    preflight VulkanRectOverflowClipPreflight) bool{
      if !contextSafe || isolates || !axisAligned
        || node.HasTransformState || node.HasVisualTransform || node.HasClipPath
        || node.BlendMode != BlendMode.Normal{
          return false
        }
      if preflight.ClipsX != preflight.ClipsY {
        return false
      }
      return !(preflight.BothAxes
        && (!preflight.RectangularEmittable || preflight.HasRadius))
    }

  private func StrictTextViewportCulled(
    node Node,
    owner VulkanSceneOwnerId,
    bounds ConservativeBounds,
    activeClipBounds ConservativeBounds,
    parentTransformIndex int32,
    parentAxisAligned bool,
    parentIsolated bool) bool{
      if !IntersectBounds(bounds, activeClipBounds).IsEmpty {
        return false
      }
      if !StrictPlainTextViewportCullEligible(node, owner, bounds, parentTransformIndex,
        parentAxisAligned, parentIsolated) {
          return false
        }
      guard let scene = textScene else { return false }
      var paintBounds ConservativeBounds
      let hasPaintBounds = scene.TryGetCachedTextPaintBounds(
        node, owner, bounds, out paintBounds)
      return if !hasPaintBounds { false } else { IntersectBounds(paintBounds, activeClipBounds).IsEmpty }
    }

  private func EmittedPathClipBounds(
    value VulkanScenePathClipResult) ConservativeBounds{
      if !value.Emitted || value.ChainIndex < 0
        || value.ChainIndex >= frame.ClipChainCount{
          return ConservativeBounds{}
        }
      let chain = frame.ClipChains[value.ChainIndex]
      if chain.MaskIndex < 0 || chain.MaskIndex >= frame.ClipMaskCount {
        return ConservativeBounds{}
      }
      let mask = frame.ClipMasks[chain.MaskIndex]
      let transform = ResolveCompilerFrameTransform(mask.TransformIndex)
      let outerBounds = TransformCompilerBounds(mask.Bounds, transform)
      let pathBounds = TransformCompilerBounds(mask.PathBounds, transform)
      let clipped = IntersectBounds(outerBounds, pathBounds)
      return clipped.IsEmpty ? outerBounds : clipped.Inflate(1.0F)
    }

  private func LayerSubtreeBounds(
    node Node,
    parentTransform PrimitiveTransform,
    activeClipBounds ConservativeBounds) ConservativeBounds{
      if node.Retired || node.Display == Display.None || node.Visibility == Visibility.Hidden
        || EffectiveOpacity(1.0F, node.Opacity) <= 0.0F {
          return ConservativeBounds{}
        }
      let transform = ComposeCompilerTransform(parentTransform, CompilerTransform(node))
      var result = TransformCompilerBounds(
        ExpandedChunkBounds(node, NodeBounds(node), ShadowContextSupported(node)), transform)
      result = IntersectBounds(result, activeClipBounds)
      let children = Stacking.Children(node)
      var index int32 = 0
      while index < children.Count {
        let child = LayerSubtreeBounds(children[index], transform, activeClipBounds)
        if result.IsEmpty {
          result = child
        } else if !child.IsEmpty {
          result = unionVulkanSceneBounds(result, child)
        }
        index = index + 1
      }
      return result
    }

  private func MakeLayerRecord(
    ownerId uint64,
    bounds ConservativeBounds,
    opacity float32,
    blendMode BlendMode,
    effect ShaderEffect?) LayerRecord{
      var layerBounds = bounds
      if layerBounds.IsEmpty {
        layerBounds = ConservativeBounds{ Width: 1.0F, Height: 1.0F }
      }
      var captureBounds = layerBounds
      var effectProgramId uint64
      var effectVersion uint64
      var effectIndex int32 = -1
      var flags uint32
      if let shader = effect {
        var snapshot ShaderEffectSnapshot
        shader.CopySnapshot(out snapshot)
        effectProgramId = snapshot.ProgramId
        effectVersion = snapshot.Version
        effectIndex = frame.AddShaderEffect(snapshot)
        if snapshot.SamplesBackdrop {
          flags = uint32(LayerRecordFlags.SamplesBackdrop)
          if snapshot.BackdropOutset > 0.0F {
            captureBounds = layerBounds.Inflate(snapshot.BackdropOutset)
          }
        }
      }
      let originX = MathF.Floor(captureBounds.X)
      let originY = MathF.Floor(captureBounds.Y)
      let right = MathF.Ceiling(captureBounds.Right)
      let bottom = MathF.Ceiling(captureBounds.Bottom)
      let extentWidth = uint32(MathF.Max(1.0F, right - originX))
      let extentHeight = uint32(MathF.Max(1.0F, bottom - originY))
      return LayerRecord{
        Bounds: layerBounds,
        Opacity: opacity,
        BlendMode: uint32(int32(blendMode)),
        OffscreenTargetId: ResourceId{
          Kind: SceneResourceKind.OffscreenTarget,
          LogicalId: ownerId,
          Version: frameVersion,
        },
        EffectProgramId: effectProgramId,
        EffectVersion: effectVersion,
        EffectIndex: effectIndex,
        Flags: flags,
        TransformIndex: -1,
        OriginX: originX,
        OriginY: originY,
        ExtentWidth: extentWidth,
        ExtentHeight: extentHeight,
      }
    }

}
