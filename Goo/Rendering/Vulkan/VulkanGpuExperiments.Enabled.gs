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
            var selected VulkanGpuExperiment
            switch value {
                case nil or "" or "none" {
                    selected = VulkanGpuExperiment.None
                }
                case "full-redraw" {
                    selected = VulkanGpuExperiment.FullRedraw
                }
                case "no-text" {
                    selected = VulkanGpuExperiment.NoText
                }
                case "no-shadows" {
                    selected = VulkanGpuExperiment.NoShadows
                }
                case "no-images" {
                    selected = VulkanGpuExperiment.NoImages
                }
                case "no-layers" {
                    selected = VulkanGpuExperiment.NoLayers
                }
                case "no-clip-sampling" {
                    selected = VulkanGpuExperiment.NoClipSampling
                }
                case "clip-clear-only" {
                    selected = VulkanGpuExperiment.ClipClearOnly
                }
                case "clip-regenerate" {
                    selected = VulkanGpuExperiment.ClipRegenerate
                }
                case "no-gpu-timestamps" {
                    selected = VulkanGpuExperiment.NoGpuTimestamps
                }
                default {
                    throw ArgumentException("Unknown Vulkan GPU experiment: " + value)
                }
            }
            Console.Error.WriteLine("Goo Vulkan GPU experiment: " + (value ?? "none"))
            return selected
        }
    }
}
