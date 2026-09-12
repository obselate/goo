package Goo

import System
import System.Diagnostics
import System.IO
import System.Runtime.InteropServices
import System.Security.Cryptography

internal data struct VulkanPipelineCacheMetrics {
  var Enabled bool
  var LoadedBytes int64
  var PersistedBytes int64
  var GraphicsPipelineCreateCount int64
  var GraphicsPipelineCreateNanoseconds int64
}

internal unsafe sealed class VulkanPipelineCache : IDisposable {
  private const MaximumCacheBytes int32 = 64 * 1024 * 1024
  private const HeaderBytes int32 = 32
  private const CacheSchema string = "v1"
  private let device VkDevice
  private let dispatch VkDeviceDispatch
  private let objectAccounting VulkanObjectAccounting?
  private let gate object
  private var cachePath string = ""
  private var cache VkPipelineCache
  private var persistenceEnabled bool
  private var loadedBytes int64
  private var persistedBytes int64
  private var graphicsPipelineCreateCount int64
  private var graphicsPipelineCreateNanoseconds int64
  private var disposed bool

  internal init(nativeDevice VkDevice, nativeDispatch VkDeviceDispatch,
    vendorId uint32, deviceId uint32, driverVersion uint32,
    pipelineCacheUuid * uint8, nativeObjectAccounting VulkanObjectAccounting?) {
      device = nativeDevice
      dispatch = nativeDispatch
      objectAccounting = nativeObjectAccounting
      gate = Object()
      if nativeDevice == nint(0) || pipelineCacheUuid == nil
        || Environment.GetEnvironmentVariable("GOO_VK_PIPELINE_CACHE") == "0" {
          return
        }
      try {
        let uuid = [16]uint8
        var uuidIndex int32 = 0
        while uuidIndex < uuid.Length {
          uuid[uuidIndex] = pipelineCacheUuid[uuidIndex]
          uuidIndex++
        }
        cachePath = ResolveCachePath(vendorId, deviceId, driverVersion, uuid)
        if cachePath == "" {
          return
        }
        persistenceEnabled = true
        let initialData = LoadInitialData(vendorId, deviceId, uuid)
        cache = Create(initialData)
        var initialDataAccepted bool = cache != 0uL
        if cache == 0uL && initialData.Length != 0 {
          cache = Create([]uint8{})
          initialDataAccepted = false
        }
        if cache == 0uL {
          persistenceEnabled = false
          cachePath = ""
          return
        }
        if let accounting = objectAccounting {
          try {
            accounting.Allocate()
          } catch (error Exception) {
            let destroy = dispatch.vkDestroyPipelineCache
            destroy(device, cache, nil)
            cache = 0uL
            throw error
          }
        }
        if initialDataAccepted {
          loadedBytes = int64(initialData.Length)
        }
      } catch (error Exception) {
        if cache != 0uL {
          let destroy = dispatch.vkDestroyPipelineCache
          try { destroy(device, cache, nil) } catch (cleanup Exception) { }
        }
        persistenceEnabled = false
        cachePath = ""
        cache = 0uL
        loadedBytes = 0L
      }
    }

  internal prop Metrics VulkanPipelineCacheMetrics{
    get {
      lock (gate) {
        return VulkanPipelineCacheMetrics{
          Enabled: cache != 0uL,
          LoadedBytes: loadedBytes,
          PersistedBytes: persistedBytes,
          GraphicsPipelineCreateCount: graphicsPipelineCreateCount,
          GraphicsPipelineCreateNanoseconds: graphicsPipelineCreateNanoseconds,
        }
      }
    }
  }

  internal func CreateGraphicsPipelines(count uint32,
    createInfos * VkGraphicsPipelineCreateInfo, pipelines * VkPipeline) VkResult{
      lock (gate) {
        let start = Stopwatch.GetTimestamp()
        let create = dispatch.vkCreateGraphicsPipelines
        let result = create(device, cache, count, createInfos, nil, pipelines)
        let elapsed = Stopwatch.GetTimestamp() - start
        graphicsPipelineCreateCount = graphicsPipelineCreateCount + int64(count)
        graphicsPipelineCreateNanoseconds = graphicsPipelineCreateNanoseconds
        +TicksToNanoseconds(elapsed)
        return result
      }
    }

  private func Create(initialData []uint8) VkPipelineCache {
    var pin GCHandle
    var pinned bool = false
    try {
      var data * void = nil
      if initialData.Length != 0 {
        pin = GCHandle.Alloc(initialData, GCHandleType.Pinned)
        pinned = true
        data = *void(pin.AddrOfPinnedObject())
      }
      var created VkPipelineCache = 0uL
      var info = VkPipelineCacheCreateInfo{
        sType: VkConstants.VK_STRUCTURE_TYPE_PIPELINE_CACHE_CREATE_INFO,
        flags: 0u,
        initialDataSize: nuint(initialData.Length),
        pInitialData: data,
      }
      let create = dispatch.vkCreatePipelineCache
      let result = create(device, &info, nil, &created)
      if result != VkConstants.VK_SUCCESS {
        if created != 0uL {
          let destroy = dispatch.vkDestroyPipelineCache
          try { destroy(device, created, nil) } catch (cleanup Exception) { }
        }
        return 0uL
      }
      return created
    } finally {
      if pinned { pin.Free() }
    }
  }

  private func ResolveCachePath(vendorId uint32, deviceId uint32,
    driverVersion uint32, uuid []uint8) string{
      let manifestHash = SHA256.HashData(VulkanShaderAssets.Read("shader-manifest.json"))
      let directoryOverride = Environment.GetEnvironmentVariable("GOO_VK_PIPELINE_CACHE_DIR")
      let root = if directoryOverride != nil && directoryOverride != "" {
        directoryOverride
      } else {
        let local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)
        if local == "" { "" } else { Path.Combine(local, "Goo", "Vulkan", "PipelineCache") }
      }
      if root == "" {
        return ""
      }
      let fileName = CacheSchema
      +"-" + vendorId.ToString("X8")
      +"-" + deviceId.ToString("X8")
      +"-" + driverVersion.ToString("X8")
      +"-" + Convert.ToHexString(uuid)
      +"-" + Convert.ToHexString(manifestHash).Substring(0, 16)
      +".bin"
      return Path.Combine(root, fileName)
    }

  private func LoadInitialData(vendorId uint32, deviceId uint32,
    uuid []uint8) []uint8{
      try {
        if !File.Exists(cachePath) {
          return []uint8{}
        }
        let info = FileInfo(cachePath)
        if info.Length < int64(HeaderBytes) || info.Length > int64(MaximumCacheBytes) {
          return []uint8{}
        }
        let data = File.ReadAllBytes(cachePath)
        if data.Length < HeaderBytes
          || ReadUInt32(data, 0) != uint32(HeaderBytes)
          || ReadUInt32(data, 4) != 1u
          || ReadUInt32(data, 8) != vendorId
          || ReadUInt32(data, 12) != deviceId{
            return []uint8{}
          }
        var uuidIndex int32 = 0
        while uuidIndex < uuid.Length {
          if data[16 + uuidIndex] != uuid[uuidIndex] {
            return []uint8{}
          }
          uuidIndex++
        }
        return data
      } catch (error Exception) {
        return []uint8{}
      }
    }

  private func Persist() {
    if !persistenceEnabled || cache == 0uL || cachePath == "" {
      return
    }
    try {
      var size nuint = 0u
      let getData = dispatch.vkGetPipelineCacheData
      if getData(device, cache, &size, nil) != VkConstants.VK_SUCCESS
        || size < nuint(HeaderBytes) || size > nuint(MaximumCacheBytes) {
          return
        }
      let data = [int32(size)]uint8
      let pin = GCHandle.Alloc(data, GCHandleType.Pinned)
      try {
        var written = size
        let result = getData(device, cache, &written, *void(pin.AddrOfPinnedObject()))
        if result != VkConstants.VK_SUCCESS || written < nuint(HeaderBytes)
          || written > nuint(data.Length) {
            return
          }
        let output = if written == nuint(data.Length) {
          data
        } else {
          let exact = [int32(written)]uint8
          Array.Copy(data, exact, exact.Length)
          exact
        }
        WriteAtomically(output)
        persistedBytes = int64(output.Length)
      } finally {
        pin.Free()
      }
    } catch (error Exception) {
    }
  }

  private func WriteAtomically(data []uint8) {
    let directory = Path.GetDirectoryName(cachePath) ?? ""
    if directory == "" {
      return
    }
    Directory.CreateDirectory(directory)
    let temporaryPath = cachePath + "." + Environment.ProcessId.ToString()
    +"." + Guid.NewGuid().ToString("N") + ".tmp"
    try {
      File.WriteAllBytes(temporaryPath, data)
      File.Move(temporaryPath, cachePath, true)
    } finally {
      try {
        if File.Exists(temporaryPath) { File.Delete(temporaryPath) }
      } catch (cleanup Exception) {
      }
    }
  }

  private func DisposeCore(save bool) {
    lock (gate) {
      if disposed {
        return
      }
      disposed = true
      if save { Persist() }
      if cache != 0uL {
        let destroy = dispatch.vkDestroyPipelineCache
        destroy(device, cache, nil)
        if let accounting = objectAccounting { accounting.Release() }
        cache = 0uL
      }
    }
  }

  internal func DisposeAfterDeviceLoss() {
    DisposeCore(false)
  }

  public func Dispose() {
    DisposeCore(true)
  }

  shared {
    private func ReadUInt32(data []uint8, offset int32) uint32 ->
    uint32(data[offset])
    | (uint32(data[offset + 1]) << 8)
    | (uint32(data[offset + 2]) << 16)
    | (uint32(data[offset + 3]) << 24)

    private func TicksToNanoseconds(ticks int64) int64 ->
    int64(float64(ticks) * 1000000000.0 / float64(Stopwatch.Frequency))
  }
}
