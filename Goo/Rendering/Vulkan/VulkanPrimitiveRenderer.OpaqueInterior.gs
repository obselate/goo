package Goo

import System

internal unsafe partial class VulkanPrimitiveRenderer {
  private const OpaqueInteriorMinimumArea int64 = 4096L
  private let profileOpaqueInteriors bool = Environment.GetEnvironmentVariable("GOO_OVERDRAW_OPTION") == "B"
  private var solidInteriorEligible bool

  private func TryEmitOpaqueInterior(commandBuffer VkCommandBuffer, bounds ConservativeBounds,
    transform PrimitiveTransform, push *VulkanPrimitiveGpuRecord, color uint32, opacity float32) bool {
    if !profileOpaqueInteriors || !solidInteriorEligible || layerDepth != 0 || currentTarget != nil
      || opacity != 1.0F || (color & 255u) != 255u || transform.A != 1.0F || transform.D != 1.0F
      || transform.B != 0.0F || transform.C != 0.0F || push -> params_x != 0.0F
      || push -> params_y != 0.0F { return false }
    let radius = MathF.Max(MathF.Max(push -> radii_x, push -> radii_y), MathF.Max(push -> radii_z, push -> radii_w))
    let inset = radius + 2.0F
    let clip = clipStack[clipDepth - 1]
    let minimumX = MathF.Max(bounds.X + transform.TX + inset, float32(clip.Left))
    let minimumY = MathF.Max(bounds.Y + transform.TY + inset, float32(clip.Top))
    let maximumX = MathF.Min(bounds.Right + transform.TX - inset, float32(clip.Right))
    let maximumY = MathF.Min(bounds.Bottom + transform.TY - inset, float32(clip.Bottom))
    if minimumX >= maximumX || minimumY >= maximumY { return false }
    let left = int32(MathF.Ceiling(minimumX))
    let top = int32(MathF.Ceiling(minimumY))
    let right = int32(MathF.Floor(maximumX))
    let bottom = int32(MathF.Floor(maximumY))
    if right <= left || bottom <= top
      || int64(right - left) * int64(bottom - top) < OpaqueInteriorMinimumArea { return false }
    for band in 0 ... 5 {
      let region = switch band {
        case 0: PrimitiveClip{Left: clip.Left, Top: clip.Top, Right: clip.Right, Bottom: top}
        case 1: PrimitiveClip{Left: clip.Left, Top: bottom, Right: clip.Right, Bottom: clip.Bottom}
        case 2: PrimitiveClip{Left: clip.Left, Top: top, Right: left, Bottom: bottom}
        case 3: PrimitiveClip{Left: right, Top: top, Right: clip.Right, Bottom: bottom}
        default: PrimitiveClip{Left: left, Top: top, Right: right, Bottom: bottom}
      }
      if !primitivePrepass { SetScissor(commandBuffer, Intersect(clip, region)) }
      push -> params_z = if band == 4 { 1.0F } else { 0.0F }
      let pipeline = if band == 4 { primitivePipelines.OpaqueSolidPipeline } else { primitivePipelines.SolidPipeline }
      BindAndDraw(commandBuffer, pipeline, *void(push))
    }
    if !primitivePrepass { SetScissor(commandBuffer, clip) }
    return true
  }
}
