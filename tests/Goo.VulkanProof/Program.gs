package Goo.VulkanProof

import System

internal unsafe func RunVulkanProof() int32 {
  if Environment.GetEnvironmentVariable("GOO_VK_TEXT_E2E") == "1" {
    RunVulkanTextE2E()
    return 0
  }
  if Environment.GetEnvironmentVariable("GOO_VK_TEXT_PAINT_E2E") == "1" {
    VulkanTextPaintE2E().Run()
    return 0
  }
  if Environment.GetEnvironmentVariable("GOO_VK_SCENE_PLAN") == "1" {
    RunScenePlanProof()
    return 0
  }
  if Environment.GetEnvironmentVariable("GOO_VK_SCENE_READBACK") == "1" {
    RunProductionSceneReadback(false)
    return 0
  }
  if Environment.GetEnvironmentVariable("GOO_VK_SHADOW_READBACK") == "1" {
    RunProductionSceneReadback(true)
    return 0
  }
  if Environment.GetEnvironmentVariable("GOO_VK_IMAGE_READBACK") == "1" {
    RunProductionImageReadback()
    return 0
  }
  if Environment.GetEnvironmentVariable("GOO_VK_TEXT_READBACK") == "1" {
    RunProductionTextReadback(false)
    return 0
  }
  if Environment.GetEnvironmentVariable("GOO_VK_TEXT_EFFECT_READBACK") == "1" {
    RunProductionTextReadback(true)
    return 0
  }
  if Environment.GetEnvironmentVariable("GOO_VK_TEXT_PAINT_READBACK") == "1" {
    RunProductionTextPaintReadback()
    return 0
  }
  return RunVulkanProductionLegacyProof(
    Environment.GetEnvironmentVariable("GOO_VK_READBACK") == "1",
    Environment.GetEnvironmentVariable("GOO_VK_LIFECYCLE") == "1")
}
