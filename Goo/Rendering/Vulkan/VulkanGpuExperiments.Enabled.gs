package Goo

import System
import System.IO

internal class VulkanGpuExperiments {
  shared {
    internal let Selected VulkanGpuExperiment = ReadSelection()

    private func ReadSelection() VulkanGpuExperiment {
      if Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") != "1" {
        return VulkanGpuExperiment.None
      }
      var value = Environment.GetEnvironmentVariable("GOO_VK_GPU_EXPERIMENT")
      let path = Environment.GetEnvironmentVariable("GOO_VK_GPU_EXPERIMENT_FILE")
      if !String.IsNullOrEmpty(path) && File.Exists(path) {
        value = File.ReadAllText(path).Trim()
      }
      let selected = switch value {
        case nil or "" or "none": VulkanGpuExperiment.None
        case "full-redraw": VulkanGpuExperiment.FullRedraw
        case "no-text": VulkanGpuExperiment.NoText
        case "no-shadows": VulkanGpuExperiment.NoShadows
        case "no-images": VulkanGpuExperiment.NoImages
        case "no-layers": VulkanGpuExperiment.NoLayers
        case "no-clip-sampling": VulkanGpuExperiment.NoClipSampling
        case "clip-clear-only": VulkanGpuExperiment.ClipClearOnly
        case "clip-regenerate": VulkanGpuExperiment.ClipRegenerate
        case "no-gpu-timestamps": VulkanGpuExperiment.NoGpuTimestamps
        default: throw ArgumentException("Unknown Vulkan GPU experiment: " + value)
      }
      Console.Error.WriteLine("Goo Vulkan GPU experiment: " + (value ?? "none"))
      return selected
    }
  }
}
