package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices

internal unsafe sealed partial class VulkanTextScene {
  private func IsExactSegmentHit(
    segment VulkanRetainedTextSegment,
    frame SceneFrame,
    shape ShapedText,
    fontSize float32,
    lineX float32,
    baseline float32,
    color uint32,
    effectMode uint32,
    effectRadiusPixels float32,
    effectOffsetX float32,
    effectOffsetY float32,
    parentTransform TransformRecord) bool{
      if segment.Version == 0uL
        || segment.RecordCount <= 0
        || !Object.ReferenceEquals(segment.Shape, shape)
        || segment.AtlasGeneration != ResourceGeneration
        || segment.ClipChainId != frame.ActiveClipChainId
        || segment.Color != color
        || segment.EffectMode != effectMode{
          return false
        }
      return SameTextFloat(segment.FontSize, fontSize)
        && SameTextFloat(segment.LineX, lineX)
        && SameTextFloat(segment.Baseline, baseline)
        && SameTextFloat(segment.EffectRadiusPixels, effectRadiusPixels)
        && SameTextFloat(segment.EffectOffsetX, effectOffsetX)
        && SameTextFloat(segment.EffectOffsetY, effectOffsetY)
        && SameTextFloat(segment.ParentTransform.A, parentTransform.A)
        && SameTextFloat(segment.ParentTransform.B, parentTransform.B)
        && SameTextFloat(segment.ParentTransform.C, parentTransform.C)
        && SameTextFloat(segment.ParentTransform.D, parentTransform.D)
        && SameTextFloat(segment.ParentTransform.TX, parentTransform.TX)
        && SameTextFloat(segment.ParentTransform.TY, parentTransform.TY)
    }

  private func GetNodeSegmentCache(node Node) VulkanTextNodeSegmentCache {
    if nodeSegments.TryGetValue(node, out var existing) {
      return existing
    }
    let created = VulkanTextNodeSegmentCache()
    nodeSegments.Add(node, created)
    return created
  }

  private func BeginSegment(frame SceneFrame) VulkanRetainedTextSegment {
    guard let cache = activeNodeSegments else {
      throw InvalidOperationException("Vulkan text segment cache is not active")
    }
    if frame.ActiveClipChainId < 0 {
      throw InvalidOperationException("Vulkan text clip chain is invalid")
    }
    let index = cache.Cursor
    cache.EnsureCapacity(index + 1)
    var segment = cache.Segments[index]
    if segment == nil {
      if nextSegmentId == 0uL {
        throw InvalidOperationException("Vulkan text segment identity overflow")
      }
      let created = VulkanRetainedTextSegment(4)
      created.Id = nextSegmentId
      nextSegmentId = nextSegmentId + 1uL
      cache.Segments[index] = created
      segment = created
    }
    cache.Cursor = cache.Cursor + 1
    return segment
  }
  private func CommitSegment(segment VulkanRetainedTextSegment) {
    if segment.Id == 0uL {
      throw InvalidOperationException("cached text segment has no identity")
    }
    let workspace = buildWorkspace
    if segment.Version != 0uL && SameSegmentContent(segment, workspace) {
      return
    }
    if segment.Version == uint64.MaxValue {
      throw InvalidOperationException("cached text segment version overflow")
    }
    var capacity = workspace.RecordCount
    if workspace.GlyphResourceCount > capacity {
      capacity = workspace.GlyphResourceCount
    }
    segment.EnsureRecordCapacity(capacity)
    segment.EnsureRunCapacity(workspace.RunCount)
    Array.Copy(workspace.Records, segment.Records, workspace.RecordCount)
    Array.Copy(workspace.GlyphResources, segment.GlyphResources,
      workspace.GlyphResourceCount)
    Array.Copy(workspace.GlyphAtlasTexelOffsets, segment.GlyphAtlasTexelOffsets,
      workspace.GlyphResourceCount)
    Array.Copy(workspace.GlyphAtlasTexelCounts, segment.GlyphAtlasTexelCounts,
      workspace.GlyphResourceCount)
    Array.Copy(workspace.GlyphEffectAtlasTexelOffsets,
      segment.GlyphEffectAtlasTexelOffsets, workspace.GlyphResourceCount)
    Array.Copy(workspace.GlyphEffectAtlasTexelCounts,
      segment.GlyphEffectAtlasTexelCounts, workspace.GlyphResourceCount)
    Array.Copy(workspace.Runs, segment.Runs, workspace.RunCount)
    segment.Bounds = workspace.Bounds
    segment.GlyphCount = workspace.GlyphCount
    segment.ClipChainId = workspace.ClipChainId
    segment.RecordCount = workspace.RecordCount
    segment.RunCount = workspace.RunCount
    segment.GlyphResourceCount = workspace.GlyphResourceCount
    segment.AtlasGeneration = workspace.AtlasGeneration
    segment.Version = segment.Version + 1uL
  }

  private func SameSegmentContent(
    segment VulkanRetainedTextSegment,
    workspace VulkanTextSegmentBuildWorkspace) bool{
      if segment.RecordCount != workspace.RecordCount
        || segment.GlyphResourceCount != workspace.GlyphResourceCount
        || segment.RunCount != workspace.RunCount
        || segment.GlyphCount != workspace.GlyphCount{
          return false
        }
      if !SameTextFloat(segment.Bounds.X, workspace.Bounds.X)
        || !SameTextFloat(segment.Bounds.Y, workspace.Bounds.Y)
        || !SameTextFloat(segment.Bounds.Width, workspace.Bounds.Width)
        || !SameTextFloat(segment.Bounds.Height, workspace.Bounds.Height) {
          return false
        }
      if segment.ClipChainId != workspace.ClipChainId
        || segment.AtlasGeneration != workspace.AtlasGeneration{
          return false
        }
      var index int32 = 0
      while index < workspace.RecordCount {
        if !SameTextRecord(segment.Records[index], workspace.Records[index]) {
          return false
        }
        index = index + 1
      }
      index = 0
      while index < workspace.GlyphResourceCount {
        if !SameIdentity(segment.GlyphResources[index], workspace.GlyphResources[index])
          || segment.GlyphAtlasTexelOffsets[index]
        != workspace.GlyphAtlasTexelOffsets[index]
          || segment.GlyphAtlasTexelCounts[index]
        != workspace.GlyphAtlasTexelCounts[index]
          || segment.GlyphEffectAtlasTexelOffsets[index]
        != workspace.GlyphEffectAtlasTexelOffsets[index]
          || segment.GlyphEffectAtlasTexelCounts[index]
        != workspace.GlyphEffectAtlasTexelCounts[index]{
          return false
        }
        index = index + 1
      }
      index = 0
      while index < workspace.RunCount {
        let left = segment.Runs[index]
        let right = workspace.Runs[index]
        if left.FirstInstance != right.FirstInstance
          || left.InstanceCount != right.InstanceCount
          || !SameIdentity(left.AtlasId, right.AtlasId)
          || left.PipelineKind != right.PipelineKind
          || left.ByteRangeEnd != right.ByteRangeEnd{
            return false
          }
        index = index + 1
      }
      return true
    }

  private func SameTextRecord(
    left HbGpuTextInstanceRecord,
    right HbGpuTextInstanceRecord) bool -> SameTextFloat(left.transform_m00, right.transform_m00)
    && SameTextFloat(left.transform_m01, right.transform_m01)
    && SameTextFloat(left.transform_m02, right.transform_m02)
    && SameTextFloat(left.transform_m03, right.transform_m03)
    && SameTextFloat(left.transform_m10, right.transform_m10)
    && SameTextFloat(left.transform_m11, right.transform_m11)
    && SameTextFloat(left.transform_m12, right.transform_m12)
    && SameTextFloat(left.transform_m13, right.transform_m13)
    && SameTextFloat(left.transform_m20, right.transform_m20)
    && SameTextFloat(left.transform_m21, right.transform_m21)
    && SameTextFloat(left.transform_m22, right.transform_m22)
    && SameTextFloat(left.transform_m23, right.transform_m23)
    && SameTextFloat(left.transform_m30, right.transform_m30)
    && SameTextFloat(left.transform_m31, right.transform_m31)
    && SameTextFloat(left.transform_m32, right.transform_m32)
    && SameTextFloat(left.transform_m33, right.transform_m33)
    && SameTextFloat(left.glyphBounds_x, right.glyphBounds_x)
    && SameTextFloat(left.glyphBounds_y, right.glyphBounds_y)
    && SameTextFloat(left.glyphBounds_z, right.glyphBounds_z)
    && SameTextFloat(left.glyphBounds_w, right.glyphBounds_w)
    && left.glyphInput_x == right.glyphInput_x
    && left.glyphInput_y == right.glyphInput_y
    && left.glyphInput_z == right.glyphInput_z
    && left.glyphInput_w == right.glyphInput_w
    && SameTextFloat(left.foreground_x, right.foreground_x)
    && SameTextFloat(left.foreground_y, right.foreground_y)
    && SameTextFloat(left.foreground_z, right.foreground_z)
    && SameTextFloat(left.foreground_w, right.foreground_w)

  private func SameTextFloat(left float32, right float32) bool -> BitConverter.SingleToInt32Bits(left)
  == BitConverter.SingleToInt32Bits(right)

  private func AddSegmentRun(
    workspace VulkanTextSegmentBuildWorkspace,
    firstInstance int32,
    atlasId ResourceId,
    pipelineKind uint32,
    byteRangeEnd uint64) {
      if workspace.RunCount > 0 {
        let lastIndex = workspace.RunCount - 1
        var last = workspace.Runs[lastIndex]
        if last.AtlasId.Kind == atlasId.Kind
          && last.AtlasId.LogicalId == atlasId.LogicalId
          && last.AtlasId.Version == atlasId.Version
          && last.PipelineKind == pipelineKind{
            if last.InstanceCount == Int32.MaxValue {
              throw InvalidOperationException("Vulkan text segment run overflow")
            }
            last.InstanceCount = last.InstanceCount + 1
            if byteRangeEnd > last.ByteRangeEnd {
              last.ByteRangeEnd = byteRangeEnd
            }
            workspace.Runs[lastIndex] = last
            return
          }
      }
      let runIndex = workspace.RunCount
      if runIndex < 0 || runIndex == Int32.MaxValue
        || firstInstance < 0 || firstInstance >= workspace.RecordCount{
          throw InvalidOperationException("Vulkan text segment run overflow")
        }
      workspace.EnsureRunCapacity(runIndex + 1)
      workspace.Runs[runIndex] = VulkanTextSegmentRun{
        FirstInstance: firstInstance,
        InstanceCount: 1,
        AtlasId: atlasId,
        PipelineKind: pipelineKind,
        ByteRangeEnd: byteRangeEnd,
      }
      workspace.RunCount = runIndex + 1
    }

  private func ComposeLogicalTransform(
    frame SceneFrame,
    parentIndex int32,
    inner TransformRecord,
    out result TransformRecord) bool{
      var a = inner.A
      var b = inner.B
      var c = inner.C
      var d = inner.D
      var tx = inner.TX
      var ty = inner.TY
      var current = parentIndex
      var steps int32 = 0
      while current >= 0 {
        if current >= frame.TransformCount || steps >= frame.TransformCount {
          result = TransformRecord{}
          return false
        }
        let outer = frame.Transforms[current]
        let nextA = outer.A * a + outer.C * b
        let nextB = outer.B * a + outer.D * b
        let nextC = outer.A * c + outer.C * d
        let nextD = outer.B * c + outer.D * d
        let nextTX = outer.A * tx + outer.C * ty + outer.TX
        let nextTY = outer.B * tx + outer.D * ty + outer.TY
        a = nextA
        b = nextB
        c = nextC
        d = nextD
        tx = nextTX
        ty = nextTY
        current = outer.ParentIndex
        steps = steps + 1
      }
      if !FiniteValue(a) || !FiniteValue(b) || !FiniteValue(c)
        || !FiniteValue(d) || !FiniteValue(tx) || !FiniteValue(ty) {
          result = TransformRecord{}
          return false
        }
      result = TransformRecord{
        A: a,
        B: b,
        C: c,
        D: d,
        TX: tx,
        TY: ty,
        ParentIndex: -1,
      }
      return true
    }

  private func TransformGlyphBounds(
    transform TransformRecord,
    minX float32,
    minY float32,
    maxX float32,
    maxY float32,
    out result ConservativeBounds) bool{
      let x0 = transform.A * minX + transform.C * minY + transform.TX
      let y0 = transform.B * minX + transform.D * minY + transform.TY
      let x1 = transform.A * maxX + transform.C * minY + transform.TX
      let y1 = transform.B * maxX + transform.D * minY + transform.TY
      let x2 = transform.A * minX + transform.C * maxY + transform.TX
      let y2 = transform.B * minX + transform.D * maxY + transform.TY
      let x3 = transform.A * maxX + transform.C * maxY + transform.TX
      let y3 = transform.B * maxX + transform.D * maxY + transform.TY
      let left = MathF.Min(MathF.Min(x0, x1), MathF.Min(x2, x3))
      let right = MathF.Max(MathF.Max(x0, x1), MathF.Max(x2, x3))
      let top = MathF.Min(MathF.Min(y0, y1), MathF.Min(y2, y3))
      let bottom = MathF.Max(MathF.Max(y0, y1), MathF.Max(y2, y3))
      if !FiniteValue(left) || !FiniteValue(top) || !FiniteValue(right)
        || !FiniteValue(bottom) || right <= left || bottom <= top{
          result = ConservativeBounds{}
          return false
        }
      result = ConservativeBounds{
        X: left,
        Y: top,
        Width: right - left,
        Height: bottom - top,
      }
      return true
    }

  private func UnionBounds(
    left ConservativeBounds,
    right ConservativeBounds) ConservativeBounds{
      let minX = left.X < right.X ? left.X : right.X
      let minY = left.Y < right.Y ? left.Y : right.Y
      let maxX = left.Right > right.Right ? left.Right : right.Right
      let maxY = left.Bottom > right.Bottom ? left.Bottom : right.Bottom
      return ConservativeBounds{
        X: minX,
        Y: minY,
        Width: maxX - minX,
        Height: maxY - minY,
      }
    }

  private func LinearForeground(
    color uint32,
    pipelineKind uint32,
    effectMode uint32,
    out red float32,
    out green float32,
    out blue float32,
    out alpha float32) {
      let packed = int32(color)
      let redByte = (packed >> int32(24)) & int32(255)
      let greenByte = (packed >> int32(16)) & int32(255)
      let blueByte = (packed >> int32(8)) & int32(255)
      alpha = float32(packed & int32(255)) / 255.0F
      red = srgbToLinear[redByte]
      green = srgbToLinear[greenByte]
      blue = srgbToLinear[blueByte]
      if pipelineKind == 0u || effectMode != TextEffectFill {
        red = red * alpha
        green = green * alpha
        blue = blue * alpha
      }
    }

  private func ParentTransformMinimumScale(frame SceneFrame, parentIndex int32) float32 {
    var a = 1.0F
    var b = 0.0F
    var c = 0.0F
    var d = 1.0F
    var current = parentIndex
    var steps int32 = 0
    while current >= 0 {
      if current >= frame.TransformCount || steps >= frame.TransformCount {
        return 1.0F
      }
      let value = frame.Transforms[current]
      let nextA = value.A * a + value.C * b
      let nextB = value.B * a + value.D * b
      let nextC = value.A * c + value.C * d
      let nextD = value.B * c + value.D * d
      a = nextA
      b = nextB
      c = nextC
      d = nextD
      current = value.ParentIndex
      steps = steps + 1
    }
    let determinant = MathF.Abs(a * d - b * c)
    let firstLength = MathF.Sqrt(a * a + b * b)
    let secondLength = MathF.Sqrt(c * c + d * d)
    let maximum = firstLength > secondLength ? firstLength : secondLength
    if determinant <= 0.0001F || maximum <= 0.0001F {
      return 0.0001F
    }
    let result = determinant / maximum
    return result > 0.0001F ? result : 0.0001F
  }

  private func BeginContentClip(frame SceneFrame, node Node, transformIndex int32) bool {
    let bounds = ContentBounds(node)
    if bounds.IsEmpty { return false }
    frame.AddRectClipBegin(RectClipRecord{
      Bounds: bounds,
      TransformIndex: transformIndex,
      ParentIndex: -1,
    })
    return true
  }

  private func EndContentClip(frame SceneFrame, node Node, transformIndex int32) {
    frame.AddRectClipEnd(RectClipRecord{
      Bounds: ContentBounds(node),
      TransformIndex: transformIndex,
      ParentIndex: -1,
    })
  }

  private func ContentBounds(node Node) ConservativeBounds -> ConservativeBounds {
    X: BoxGeometry.ContentLeft(node),
    Y: BoxGeometry.ContentTop(node),
    Width: BoxGeometry.ContentWidth(node),
    Height: BoxGeometry.ContentHeight(node),
  }

  private func AddSelectionBoxes(
    frame SceneFrame,
    values IReadOnlyList[float32],
    originX float32,
    y float32,
    height float32,
    color Color,
    opacity float32,
    transformIndex int32) {
      if color.A <= 0.0F || opacity <= 0.0F { return }
      var index int32 = 0
      while index + 1 < values.Count {
        let left = values[index]
        let right = values[index + 1]
        if right > left {
          AddSolid(frame, ConservativeBounds{
            X: originX + left,
            Y: y,
            Width: right - left,
            Height: height,
          }, color, opacity, transformIndex)
        }
        index = index + 2
      }
    }

  private func AddSolid(
    frame SceneFrame,
    bounds ConservativeBounds,
    color Color,
    opacity float32,
    transformIndex int32) {
      if color.A <= 0.0F || opacity <= 0.0F || bounds.IsEmpty { return }
      frame.AddSolidBox(SolidBoxRecord{
        Bounds: bounds,
        Color: PackedColor(color, opacity),
        Opacity: 1.0F,
        TransformIndex: transformIndex,
      })
    }

  private func PackedColor(color Color, opacity float32) uint32 -> Color.FromNormalized(color.R, color.G, color.B, color.A * opacity).ToPackedRgba()

  private func BlinkVisible(value float64) bool {
    let phase = value - Math.Floor(value)
    return phase < 0.5
  }

}
