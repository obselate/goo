package Goo.VulkanProof

import System
import Goo

internal unsafe func RunVulkanProof() int32 {
  if Environment.GetEnvironmentVariable("GOO_VK_EXTERNAL_IMAGE") == "1" {
    VulkanExternalImageProof.Run()
    return 0
  }
  if Environment.GetEnvironmentVariable("GOO_VK_DMA_BUF") == "1" {
    VulkanExternalImageProof.Run(true)
    return 0
  }
  if Environment.GetEnvironmentVariable("GOO_VK_TEXT_E2E") == "1" {
    RunVulkanTextE2E()
    return 0
  }
  if Environment.GetEnvironmentVariable("GOO_VK_TEXT_PAINT_E2E") == "1" {
    VulkanTextPaintE2E().Run()
    return 0
  }
  if Environment.GetEnvironmentVariable("GOO_VK_IMAGE_READBACK") == "1" {
    RunProductionImageReadback()
    RunLongGradientReadback()
    RunPresentEncodeReadback()
    VulkanExternalImageProof.Run()
    VulkanExternalImageProof.Run(true)
    return 0
  }
  if Environment.GetEnvironmentVariable("GOO_VK_TEXT_EFFECT_READBACK") == "1" {
    RunProductionTextReadback(false)
    RunProductionTextReadback(true)
    return 0
  }
  if Environment.GetEnvironmentVariable("GOO_VK_TEXT_PAINT_READBACK") == "1" {
    RunProductionTextPaintReadback()
    return 0
  }
  RunProductionImageReadback()
  return 0
}
