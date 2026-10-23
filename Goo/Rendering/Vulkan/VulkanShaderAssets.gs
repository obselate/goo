package Goo

import System.IO

internal class VulkanShaderAssets {
  shared {
    private const MaxAssetBytes int32 = 4194304

    internal func Read(fileName string) []uint8 {
      using let stream = typeof(VulkanShaderAssets).Assembly.GetManifestResourceStream(
        "Goo.Vulkan.Shaders." + fileName)
      if stream == nil { throw FileNotFoundException("Goo Vulkan shader asset is missing", fileName) }
      return BoundedInput.ReadAll(stream, MaxAssetBytes, "Vulkan shader asset")
    }
  }
}
