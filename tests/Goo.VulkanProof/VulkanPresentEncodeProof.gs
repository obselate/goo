package Goo.VulkanProof

import Goo
import System

private func RequirePresentEncodePixel(result VulkanReadbackResult, x int32, y int32,
  red int32, green int32, blue int32, alpha int32) {
    let expected = []int32{ red, green, blue, alpha }
    for channel in 0 ... 4 {
      let actual = int32(result.Pixels[(y * 64 + x) * 4 + channel])
      if Math.Abs(actual - expected[channel]) > 2 {
        throw InvalidOperationException("Present encode pixels: x=${x} y=${y} channel=${channel} expected=${expected[channel]} actual=${actual}")
      }
    }
  }

internal func RunPresentEncodeReadback() {
  let window = OpenVulkanProductionProofWindow()
  var capture VulkanProductionReadbackCapture? = nil
  try {
    let opened = VulkanProductionReadbackFixture.Open(window, 64u, 64u, true)
    capture = opened
    let frame = SceneFrame(16)
    let clear = VkClearColorValue{}
    frame.BeginChunk(0x50524553454E54uL, 1uL,
      ConservativeBounds{ X: 0.0F, Y: 0.0F, Width: 64.0F, Height: 64.0F }, true)
    frame.AddSolidBox(SolidBoxRecord{
      Bounds: ConservativeBounds{ X: 0.0F, Y: 0.0F, Width: 32.0F, Height: 32.0F },
      Color: 0xFFFFFFFFu, Opacity: 0.5F, TransformIndex: -1,
    })
    frame.AddSolidBox(SolidBoxRecord{
      Bounds: ConservativeBounds{ X: 32.0F, Y: 0.0F, Width: 32.0F, Height: 32.0F },
      Color: 0x336699FFu, Opacity: 1.0F, TransformIndex: -1,
    })
    frame.AddSolidBox(SolidBoxRecord{
      Bounds: ConservativeBounds{ X: 0.0F, Y: 32.0F, Width: 32.0F, Height: 32.0F },
      Color: 0xFF8000FFu, Opacity: 0.25F, TransformIndex: -1,
    })
    frame.EndChunk()
    WarmVulkanProductionReadback(opened, frame, clear)
    let result = RequestVulkanProductionReadback(opened, frame, clear)
    RequirePresentEncodePixel(result, 16, 16, 128, 128, 128, 128)
    RequirePresentEncodePixel(result, 48, 16, 51, 102, 153, 255)
    RequirePresentEncodePixel(result, 16, 48, 64, 32, 0, 64)
    RequirePresentEncodePixel(result, 48, 48, 0, 0, 0, 0)
    Console.WriteLine("Present encode readback: translucent, opaque and empty pixels passed")
  } finally {
    if let active = capture {
      active.Dispose()
    }
    CloseVulkanProductionProofWindow(window)
  }
}
