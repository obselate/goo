package Goo

import System

internal unsafe partial class VulkanPrimitiveRenderer {
  private const OpaqueInteriorMinimumArea int64 = 4096L
  private var solidInteriorEligible bool

  private func TryEmitOpaqueInterior(commandBuffer VkCommandBuffer, bounds ConservativeBounds,
    transform PrimitiveTransform, push *VulkanPrimitiveGpuRecord, color uint32, opacity float32) bool {
    if !solidInteriorEligible || layerDepth != 0 || currentTarget != nil
      || opacity != 1.0F || (color & 255u) != 255u || transform.A != 1.0F || transform.D != 1.0F
      || transform.B != 0.0F || transform.C != 0.0F || push -> params_x != 0.0F
      || push -> params_y != 0.0F { return false }
    let radius = MathF.Max(MathF.Max(push -> radii_x, push -> radii_y), MathF.Max(push -> radii_z, push -> radii_w))
    let inset = radius + 2.0F
    let minimumX = MathF.Ceiling(bounds.X + transform.TX + inset)
    let minimumY = MathF.Ceiling(bounds.Y + transform.TY + inset)
    let maximumX = MathF.Floor(bounds.Right + transform.TX - inset)
    let maximumY = MathF.Floor(bounds.Bottom + transform.TY - inset)
    let width = float64(maximumX) - float64(minimumX)
    let height = float64(maximumY) - float64(minimumY)
    if width <= 0.0 || height <= 0.0 || width * height < float64(OpaqueInteriorMinimumArea) { return false }
    let clip = clipStack[clipDepth - 1]
    let left = int32(MathF.Max(float32(clip.Left), MathF.Min(minimumX, float32(clip.Right))))
    let top = int32(MathF.Max(float32(clip.Top), MathF.Min(minimumY, float32(clip.Bottom))))
    let right = int32(MathF.Max(float32(clip.Left), MathF.Min(maximumX, float32(clip.Right))))
    let bottom = int32(MathF.Max(float32(clip.Top), MathF.Min(maximumY, float32(clip.Bottom))))
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
