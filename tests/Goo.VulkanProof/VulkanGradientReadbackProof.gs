package Goo.VulkanProof

import System
import Goo

// Read real production pixels for long gradients, including partial final stop groups.
internal unsafe func VerifyLongGradientReadbacks(capture VulkanProductionReadbackCapture) {
  let frame = SceneFrame(16)
  let counts = []int32{ 2, 3, 4, 5, 7, 9, 17, 257, 4097 }
  var clear = VkClearColorValue{}
  clear.float32.values[2] = 1.0F
  clear.float32.values[3] = 1.0F
  for count in counts {
    for variant in 0 ... 2 {
      frame.ResetForReuse()
      frame.BeginChunk(0x4752414449454E54uL, uint64(count * 2 + variant + 1),
        ConservativeBounds{ X: 0.0F, Y: 0.0F, Width: 64.0F, Height: 64.0F }, true)
      for index in 0 ... count {
        // Variant 1 has repeated offsets, exercising hard edges beyond the fourth stop.
        let offset = if variant == 0 { float32(index) / float32(count - 1) } else {
          float32(index / 2) / float32((count - 1) / 2 + 1) }
        let color = if (index + variant) % 3 == 0 { 0xFF000080u } else {
          if (index + variant) % 3 == 1 { 0x00FF00FFu } else { 0x0000FF40u } }
        frame.AddGradientStop(GradientStopRecord{ Offset: offset, Color: color })
      }
      frame.AddLinearGradient(LinearGradientRecord{
        Bounds: ConservativeBounds{ X: 0.0F, Y: 0.0F, Width: 64.0F, Height: 32.0F },
        StartX: 0.0F, StartY: 0.0F, EndX: 64.0F, EndY: 0.0F,
        StopStart: 0, StopCount: count, Opacity: 0.75F, TransformIndex: -1,
      })
      frame.AddRadialGradient(RadialGradientRecord{
        Bounds: ConservativeBounds{ X: 0.0F, Y: 32.0F, Width: 64.0F, Height: 32.0F },
        CenterX: 0.0F, CenterY: 48.5F, RadiusX: 64.0F, RadiusY: 16.0F,
        StopStart: 0, StopCount: count, Opacity: 0.75F, TransformIndex: -1,
      })
      frame.AddSolidBox(SolidBoxRecord{
        Bounds: ConservativeBounds{ X: 62.0F, Y: 62.0F, Width: 2.0F, Height: 2.0F },
        Color: 0xFFFFFFFFu, Opacity: 1.0F, TransformIndex: -1,
      })
      frame.EndChunk()
      WarmVulkanProductionReadback(capture, frame, clear)
      let result = RequestVulkanProductionReadback(capture, frame, clear)
      for x in 0 ... 64 {
        let t = (float32(x) + 0.5F) / 64.0F
        var right int32 = 0
        while right < count && frame.GradientStops[right].Offset <= t { right++ }
        let left = Math.Max(0, right - 1)
        let end = Math.Min(count - 1, right)
        let span = frame.GradientStops[end].Offset - frame.GradientStops[left].Offset
        let amount = if span <= 0.0F { 0.0F } else { Math.Clamp((t - frame.GradientStops[left].Offset) / span, 0.0F, 1.0F) }
        let first = frame.GradientStops[left].Color
        let last = frame.GradientStops[end].Color
        let alphaA = float32(first & 255u) / 255.0F * 0.75F
        let alphaB = float32(last & 255u) / 255.0F * 0.75F
        for channel in 0 ... 3 {
          let shift = (3 - channel) * 8
          let a = float32((first >> shift) & 255u) / 255.0F * alphaA
          let b = float32((last >> shift) & 255u) / 255.0F * alphaB
          let linear = a + (b - a) * amount + if channel == 2 { 1.0F - (alphaA + (alphaB - alphaA) * amount) } else { 0.0F }
          let srgb = if linear <= 0.0031308F { linear * 12.92F } else { 1.055F * MathF.Pow(linear, 1.0F / 2.4F) - 0.055F }
          let expected = int32(srgb * 255.0F + 0.5F)
          for y in []int32 { 16, 48 } {
            let actual = int32(result.Pixels[(y * 64 + x) * 4 + channel])
            if Math.Abs(actual - expected) > 3 {
              throw InvalidOperationException("Gradient pixels: count=${count} variant=${variant} x=${x} y=${y} channel=${channel} expected=${expected} actual=${actual}")
            }
          }
        }
      }
      if result.Pixels[(63 * 64 + 63) * 4] != 255u {
        throw InvalidOperationException("Draw after gradient stop storage was corrupted")
      }
    }
  }
  Console.WriteLine("Gradient readback: linear/radial 2–4097 stops, hard edges, alpha, opacity, buffer reuse, and following draws passed")
}
