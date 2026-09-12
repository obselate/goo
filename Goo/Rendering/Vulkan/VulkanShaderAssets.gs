package Goo

import System
import System.IO

internal class VulkanShaderAssets {
  shared {
    internal func Read(fileName string) []uint8 {
      let path = Path.Combine(AppContext.BaseDirectory, "Vulkan", "Shaders", fileName)
      if File.Exists(path) { return File.ReadAllBytes(path) }
      using let stream = typeof(VulkanShaderAssets).Assembly.GetManifestResourceStream(
        "Goo.Vulkan.Shaders." + fileName)
      if stream == nil { throw FileNotFoundException("Goo Vulkan shader asset is missing", fileName) }
      using let output = MemoryStream()
      stream.CopyTo(output)
      return output.ToArray()
    }
  }
}
