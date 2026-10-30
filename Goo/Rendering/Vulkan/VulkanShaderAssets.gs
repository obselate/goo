package Goo

import System.IO
import System.IO.Compression

internal class VulkanShaderAssets {
  shared {
    private const MaxAssetBytes int32 = 4194304

    internal func Read(fileName string) []uint8 {
      using let stream = typeof(VulkanShaderAssets).Assembly.GetManifestResourceStream(
        "Goo.Vulkan.Shaders." + fileName)
      if stream == nil { throw FileNotFoundException("Goo Vulkan shader asset is missing", fileName) }
      using let decompressed = GZipStream(stream, CompressionMode.Decompress)
      return BoundedInput.ReadAll(decompressed, MaxAssetBytes, "Vulkan shader asset")
    }
  }
}
