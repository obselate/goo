package Goo

import System
import System.Diagnostics

internal partial class VulkanSceneCompiler {
  private let profileOcclusion bool = Environment.GetEnvironmentVariable("GOO_OVERDRAW_OPTION") == "A"
  private let opaqueOccluders []ConservativeBounds = [8]ConservativeBounds
  private let occlusionClips []ConservativeBounds = [MaxRectClipDepth + 1]ConservativeBounds

  private func CullOccludedDraws(scaleX float32, scaleY float32, viewportWidth float32, viewportHeight float32) {
    if !profileOcclusion { return }
    let started = Stopwatch.GetTimestamp()
    let count = frame.DrawRefCount
    if frame.OccludedDraws.Length < count { frame.OccludedDraws = [count]bool }
    Array.Clear(frame.OccludedDraws, 0, count)
    var occluderCount int32 = 0
    var removed int32 = 0
    var comparisons int32 = 0
    var chunkIndex = frame.ChunkCount - 1
    var clipDepth int32 = 0
    occlusionClips[0] = ConservativeBounds{ Width: viewportWidth * scaleX, Height: viewportHeight * scaleY }
    for reverse in 0 ... count {
      let index = count - 1 - reverse
      while chunkIndex >= 0 && index < frame.Chunks[chunkIndex].FirstDraw { chunkIndex-- }
      let reference = frame.DrawRefs[index]
      if reference.Kind == SceneDrawKind.RectClipEnd {
        let clip = frame.RectClips[reference.Index]
        let bounds = clip.Bounds
        let x = bounds.X * scaleX
        let y = bounds.Y * scaleY
        let physical = if clip.TransformIndex == -1 {
          ConservativeBounds{
            X: MathF.Floor(x), Y: MathF.Floor(y),
            Width: MathF.Ceiling(x + bounds.Width * scaleX) - MathF.Floor(x),
            Height: MathF.Ceiling(y + bounds.Height * scaleY) - MathF.Floor(y)
          }
        } else { ConservativeBounds{} }
        occlusionClips[clipDepth + 1] = IntersectBounds(occlusionClips[clipDepth], physical)
        clipDepth++
        continue
      }
      if reference.Kind == SceneDrawKind.RectClipBegin {
        clipDepth--
        continue
      }
      if reference.Kind == SceneDrawKind.LayerBegin || reference.Kind == SceneDrawKind.LayerEnd
        || reference.Kind == SceneDrawKind.GeneratorEffect {
        occluderCount = 0
        continue
      }
      if chunkIndex < 0 { continue }
      let transform = switch reference.Kind {
        case SceneDrawKind.SolidBox: frame.SolidBoxes[reference.Index].TransformIndex
        case SceneDrawKind.RoundedBox: frame.RoundedBoxes[reference.Index].TransformIndex
        case SceneDrawKind.PerEdgeBorder: frame.PerEdgeBorders[reference.Index].TransformIndex
        case SceneDrawKind.CachedImage: frame.CachedImages[reference.Index].TransformIndex
        case SceneDrawKind.CachedTextSegment: frame.Chunks[chunkIndex].TransformIndex
        case SceneDrawKind.AnalyticPathBand: frame.AnalyticPathBands[reference.Index].TransformIndex
        case SceneDrawKind.LinearGradient: frame.LinearGradients[reference.Index].TransformIndex
        case SceneDrawKind.RadialGradient: frame.RadialGradients[reference.Index].TransformIndex
        case SceneDrawKind.Shadow: frame.Shadows[reference.Index].TransformIndex
        case SceneDrawKind.Underline: frame.Underlines[reference.Index].TransformIndex
        default: -2
      }
      if transform != -1 { continue }
      let logical = frame.Chunks[chunkIndex].Bounds
      let x = logical.X * scaleX
      let y = logical.Y * scaleY
      let bounds = IntersectBounds(ConservativeBounds{
        X: MathF.Floor(x), Y: MathF.Floor(y),
        Width: MathF.Ceiling(x + logical.Width * scaleX) - MathF.Floor(x),
        Height: MathF.Ceiling(y + logical.Height * scaleY) - MathF.Floor(y)
      }, occlusionClips[clipDepth])
      if bounds.IsEmpty { continue }
      for candidate in 0 ... occluderCount {
        comparisons++
        let cover = opaqueOccluders[candidate]
        if bounds.X >= cover.X && bounds.Y >= cover.Y
          && bounds.Right <= cover.Right && bounds.Bottom <= cover.Bottom {
          frame.OccludedDraws[index] = true
          removed++
          break
        }
      }
      if frame.OccludedDraws[index] || reference.Kind != SceneDrawKind.SolidBox
        || reference.ClipChainId != 0 { continue }
      let value = frame.SolidBoxes[reference.Index]
      if value.Opacity != 1.0F || (value.Color & 255u) != 255u
        || value.Bounds.Width < 32.0F || value.Bounds.Height < 32.0F { continue }
      let left = MathF.Ceiling(value.Bounds.X * scaleX + 1.0F)
      let top = MathF.Ceiling(value.Bounds.Y * scaleY + 1.0F)
      let right = MathF.Floor(value.Bounds.X * scaleX + value.Bounds.Width * scaleX - 1.0F)
      let bottom = MathF.Floor(value.Bounds.Y * scaleY + value.Bounds.Height * scaleY - 1.0F)
      let inset = IntersectBounds(
        ConservativeBounds{ X: left, Y: top, Width: MathF.Max(0, right - left), Height: MathF.Max(0, bottom - top) },
        occlusionClips[clipDepth])
      if occluderCount < opaqueOccluders.Length {
        opaqueOccluders[occluderCount] = inset
        occluderCount++
      } else {
        var smallest int32 = 0
        for slot in 1 ... opaqueOccluders.Length {
          if opaqueOccluders[slot].Width * opaqueOccluders[slot].Height
            < opaqueOccluders[smallest].Width * opaqueOccluders[smallest].Height { smallest = slot }
        }
        if inset.Width * inset.Height > opaqueOccluders[smallest].Width * opaqueOccluders[smallest].Height {
          opaqueOccluders[smallest] = inset
        }
      }
    }
    let ticks = Stopwatch.GetTimestamp() - started
    Console.WriteLine("[goo.profile.occlusion] draws=$count removed=$removed comparisons=$comparisons ticks=$ticks frequency=${Stopwatch.Frequency}")
  }
}
