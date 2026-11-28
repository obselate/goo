package Goo

import System
import System.Collections.Generic
import System.IO
import System.Runtime.CompilerServices
import System.Runtime.InteropServices
import System.Threading

internal unsafe class VulkanNativeHandleDestroyer {
  shared {
    internal func DestroyPipeline(
      device VkDevice,
      destroyPipeline unmanaged[Cdecl](VkDevice, VkPipeline, *VkAllocationCallbacks) -> void,
      objectAccounting VulkanObjectAccounting?,
      ref pipeline VkPipeline) {
        if pipeline != VkPipeline.Null {
          destroyPipeline(device, pipeline, nil)
          if let recorder = FrameRecorder.Current {
            recorder.Resource(FrameResourceKind.Pipeline,
              recorder.NativeResource(FrameResourceKind.Pipeline, uint64(device), pipeline.Raw, remove: true),
              VulkanDiagnosticEventIds.PipelineDestroy, "pipeline.destroy", device: uint64(device))
          }
          if let accounting = objectAccounting { accounting.Release() }
          pipeline = VkPipeline.Null
        }
      }

    internal func DestroyPipelineLayout(
      device VkDevice,
      destroyPipelineLayout unmanaged[Cdecl](VkDevice, VkPipelineLayout, *VkAllocationCallbacks) -> void,
      objectAccounting VulkanObjectAccounting?,
      ref layout VkPipelineLayout) {
        if layout != VkPipelineLayout.Null {
          destroyPipelineLayout(device, layout, nil)
          if let accounting = objectAccounting { accounting.Release() }
          layout = VkPipelineLayout.Null
        }
      }

    internal func DestroyDescriptorSetLayout(
      device VkDevice,
      destroyDescriptorSetLayout unmanaged[Cdecl](VkDevice, VkDescriptorSetLayout, *VkAllocationCallbacks) -> void,
      objectAccounting VulkanObjectAccounting?,
      ref layout VkDescriptorSetLayout) {
        if layout != VkDescriptorSetLayout.Null {
          destroyDescriptorSetLayout(device, layout, nil)
          if let accounting = objectAccounting { accounting.Release() }
          layout = VkDescriptorSetLayout.Null
        }
      }

    internal func DestroyShaderModule(
      device VkDevice,
      destroyShaderModule unmanaged[Cdecl](VkDevice, VkShaderModule, *VkAllocationCallbacks) -> void,
      objectAccounting VulkanObjectAccounting?,
      ref module VkShaderModule) {
        if module != VkShaderModule.Null {
          destroyShaderModule(device, module, nil)
          if let recorder = FrameRecorder.Current {
            recorder.Resource(FrameResourceKind.Shader,
              recorder.NativeResource(FrameResourceKind.Shader, uint64(device), module.Raw, remove: true),
              VulkanDiagnosticEventIds.PipelineDestroy, "shader.destroy", device: uint64(device))
          }
          if let accounting = objectAccounting { accounting.Release() }
          module = VkShaderModule.Null
        }
      }
  }
}

internal struct VulkanPipelineSlot {
  internal var Handle VkPipeline
  internal var Creating bool
}

internal data struct VulkanRetiredPipelineEntry(
  Pipeline VkPipeline,
  RetireSerial uint64
) { }

internal sealed class VulkanShaderEffectPipelineEntry {
  internal let Key VulkanGraphicsPipelineKey
  internal let Digest []uint8
  internal let Spirv []uint8
  internal let ReplacesBackdrop bool
  internal var Pinned bool
  internal var Pipeline VkPipeline
  internal var LastUseSerial uint64
  internal var AccessTick uint64
  internal var Creating bool
  internal var Evicted bool

  internal init(
    key VulkanGraphicsPipelineKey,
    digest []uint8,
    spirv []uint8,
    replacesBackdrop bool,
    pinned bool
  ) {
    Key = key
    Digest = digest
    Spirv = spirv
    ReplacesBackdrop = replacesBackdrop
    Pinned = pinned
  }
}

internal unsafe sealed partial class VulkanSharedPrimitiveFormatState : IDisposable {
  private const UnpinnedShaderEffectCapacity int32 = 64
  private let device VkDevice
  private let dispatch VkDeviceDispatch
  private let pipelineCache VulkanPipelineCache
  private let format VkFormat
  private let objectAccounting VulkanObjectAccounting?
  private let pipelineLayout VkPipelineLayout
  private let blendPipelineLayout VkPipelineLayout
  private let pathPipelineLayout VkPipelineLayout
  private let textPipelineLayout VkPipelineLayout
  private let analyticVertexModule VkShaderModule
  private let batchedUiVertexModule VkShaderModule
  private let batchedUiFragmentModule VkShaderModule
  private let shaderEffectPipelines List[VulkanShaderEffectPipelineEntry]
  private let retiredPipelines List[VulkanRetiredPipelineEntry]
  private let shaderEffectPipelineAliases ConditionalWeakTable[ShaderEffectProgram,
    VulkanShaderEffectPipelineEntry]
  private let blendModule VkShaderModule
  private let pathVertexModule VkShaderModule
  private let pathFragmentModule VkShaderModule
  private let textVertexModule VkShaderModule
  private let textFragmentModule VkShaderModule
  private let textPaintFragmentModule VkShaderModule
  private let pipelineGate object
  private var activePipelineCreations int32
  private var nextAccessTick uint64
  private var shaderEffectReadyCount int32
  private var batchedUiPipeline VulkanPipelineSlot
  private var blendPipeline VulkanPipelineSlot
  private var blendReplacePipeline VulkanPipelineSlot
  private var pathPipeline VulkanPipelineSlot
  private var textPipeline VulkanPipelineSlot
  private var textPaintPipeline VulkanPipelineSlot
  private var disposed bool

  internal prop Format VkFormat{ get -> format }
  internal prop PipelineLayout VkPipelineLayout{ get -> pipelineLayout }
  internal prop BlendPipelineLayout VkPipelineLayout{ get -> blendPipelineLayout }
  internal prop PathPipelineLayout VkPipelineLayout{ get -> pathPipelineLayout }
  internal prop TextPipelineLayout VkPipelineLayout{ get -> textPipelineLayout }
  internal prop BatchedUiPipeline VkPipeline{
    get -> ResolvePipeline(ref batchedUiPipeline, batchedUiVertexModule, batchedUiFragmentModule,
      pipelineLayout, true, true)
  }
  internal prop BlendPipeline VkPipeline{
    get -> ResolvePipeline(ref blendPipeline, analyticVertexModule, blendModule,
      blendPipelineLayout, true, true)
  }
  internal prop BlendReplacePipeline VkPipeline{
    get -> ResolvePipeline(ref blendReplacePipeline, analyticVertexModule, blendModule,
      blendPipelineLayout, false, true)
  }
  internal prop PathPipeline VkPipeline{
    get -> ResolvePipeline(ref pathPipeline, pathVertexModule, pathFragmentModule,
      pathPipelineLayout, true, false)
  }
  internal prop TextPipeline VkPipeline{
    get -> ResolvePipeline(ref textPipeline, textVertexModule, textFragmentModule,
      textPipelineLayout, true, false)
  }
  internal prop TextPaintPipeline VkPipeline{
    get -> ResolvePipeline(ref textPaintPipeline, textVertexModule,
      textPaintFragmentModule, textPipelineLayout, true, false)
  }
  internal prop RetiredPipelineCount int32 {
    get {
      lock (pipelineGate) {
        return retiredPipelines.Count
      }
    }
  }

  internal func ProfileResources(recorder FrameRecorder) {
    lock pipelineGate {
      for pipeline in []VkPipeline{batchedUiPipeline.Handle, blendPipeline.Handle,
        blendReplacePipeline.Handle, pathPipeline.Handle, textPipeline.Handle,
        textPaintPipeline.Handle} {
        recorder.Resource(FrameResourceKind.Pipeline,
          recorder.NativeResource(FrameResourceKind.Pipeline, uint64(device), pipeline.Raw),
          VulkanDiagnosticEventIds.PipelineCreate, "pipeline", device: uint64(device), baseline: true)
      }
      for entry in shaderEffectPipelines {
        recorder.Resource(FrameResourceKind.Pipeline,
          recorder.NativeResource(FrameResourceKind.Pipeline, uint64(device), entry.Pipeline.Raw),
          VulkanDiagnosticEventIds.PipelineCreate, "pipeline", device: uint64(device), baseline: true)
      }
    }
  }

  internal init(
    nativeDevice VkDevice,
    nativeDispatch VkDeviceDispatch,
    nativePipelineCache VulkanPipelineCache,
    targetFormat VkFormat,
    nativePipelineLayout VkPipelineLayout,
    nativePathPipelineLayout VkPipelineLayout,
    nativeTextPipelineLayout VkPipelineLayout,
    nativeBlendPipelineLayout VkPipelineLayout,
    vertexModule VkShaderModule,
    batchedUiVertexModule VkShaderModule,
    batchedUiFragmentModule VkShaderModule,
    blendModule VkShaderModule,
    pathVertexModule VkShaderModule,
    pathFragmentModule VkShaderModule,
    textVertexModule VkShaderModule,
    textFragmentModule VkShaderModule,
    textPaintFragmentModule VkShaderModule,
    nativeObjectAccounting VulkanObjectAccounting?) {
      if nativeDevice == VkDevice.Null {
        throw ArgumentException("Vulkan device is null", "nativeDevice")
      }
      if nativePipelineCache == nil {
        throw ArgumentNullException("nativePipelineCache")
      }
      if targetFormat != VkConstants.VK_FORMAT_R8G8B8A8_UNORM
        && targetFormat != VkConstants.VK_FORMAT_B8G8R8A8_UNORM{
          throw ArgumentException("Vulkan primitive pipeline requires a UNORM RGBA target", "targetFormat")
        }
      if nativePipelineLayout == VkPipelineLayout.Null {
        throw ArgumentException("Vulkan primitive pipeline layout is null", "nativePipelineLayout")
      }
      if nativePathPipelineLayout == VkPipelineLayout.Null {
        throw ArgumentException("Vulkan path pipeline layout is null", "nativePathPipelineLayout")
      }
      if nativeTextPipelineLayout == VkPipelineLayout.Null {
        throw ArgumentException("Vulkan text pipeline layout is null", "nativeTextPipelineLayout")
      }
      if nativeBlendPipelineLayout == VkPipelineLayout.Null {
        throw ArgumentException("Vulkan blend pipeline layout is null", "nativeBlendPipelineLayout")
      }
      if vertexModule == VkShaderModule.Null || batchedUiVertexModule == VkShaderModule.Null
        || batchedUiFragmentModule == VkShaderModule.Null || blendModule == VkShaderModule.Null {
          throw ArgumentException("Vulkan primitive shader module is null")
        }
      if pathVertexModule == VkShaderModule.Null || pathFragmentModule == VkShaderModule.Null {
        throw ArgumentException("Vulkan path shader module is null")
      }
      if textVertexModule == VkShaderModule.Null || textFragmentModule == VkShaderModule.Null
        || textPaintFragmentModule == VkShaderModule.Null {
          throw ArgumentException("Vulkan text shader module is null")
        }
      device = nativeDevice
      dispatch = nativeDispatch
      pipelineCache = nativePipelineCache
      format = targetFormat
      objectAccounting = nativeObjectAccounting
      pipelineLayout = nativePipelineLayout
      pathPipelineLayout = nativePathPipelineLayout
      textPipelineLayout = nativeTextPipelineLayout
      blendPipelineLayout = nativeBlendPipelineLayout
      analyticVertexModule = vertexModule
      this.batchedUiVertexModule = batchedUiVertexModule
      this.batchedUiFragmentModule = batchedUiFragmentModule
      this.blendModule = blendModule
      this.pathVertexModule = pathVertexModule
      this.pathFragmentModule = pathFragmentModule
      this.textVertexModule = textVertexModule
      this.textFragmentModule = textFragmentModule
      this.textPaintFragmentModule = textPaintFragmentModule
      pipelineGate = Object()
      shaderEffectPipelines = List[VulkanShaderEffectPipelineEntry](16)
      retiredPipelines = List[VulkanRetiredPipelineEntry](8)
      shaderEffectPipelineAliases = ConditionalWeakTable[ShaderEffectProgram,
        VulkanShaderEffectPipelineEntry]()
    }

  internal func MaterializePipelines() {
    ResolvePipeline(ref textPipeline, textVertexModule, textFragmentModule,
      textPipelineLayout, true, false)
    ResolvePipeline(ref batchedUiPipeline, batchedUiVertexModule, batchedUiFragmentModule,
      pipelineLayout, true, true)
    ResolvePipeline(ref blendPipeline, analyticVertexModule, blendModule,
      blendPipelineLayout, true, true)
    ResolvePipeline(ref blendReplacePipeline, analyticVertexModule, blendModule,
      blendPipelineLayout, false, true)
    ResolvePipeline(ref pathPipeline, pathVertexModule, pathFragmentModule,
      pathPipelineLayout, true, false)
    ResolvePipeline(ref textPaintPipeline, textVertexModule,
      textPaintFragmentModule, textPipelineLayout, true, false)
  }

  private func ResolvePipeline(ref pipeline VulkanPipelineSlot,
    vertex VkShaderModule, fragment VkShaderModule, layout VkPipelineLayout,
    enableBlend bool, primitiveInput bool) VkPipeline {
    let existing = VkPipeline(Volatile.Read(in Unsafe.As[VkPipeline, uint64](ref pipeline.Handle)))
    if !existing.IsNull { return existing }
    lock (pipelineGate) {
      while pipeline.Creating { Monitor.Wait(pipelineGate) }
      if disposed { throw ObjectDisposedException("VulkanSharedPrimitiveFormatState") }
      if !pipeline.Handle.IsNull { return pipeline.Handle }
      pipeline.Creating = true
      activePipelineCreations++
    }
    var created VkPipeline
    try {
      let topology = if primitiveInput {
        VkConstants.VK_PRIMITIVE_TOPOLOGY_TRIANGLE_STRIP
      } else {
        VkConstants.VK_PRIMITIVE_TOPOLOGY_TRIANGLE_LIST
      }
      created = VulkanPipelineFactory.CreateGraphics(
        device, dispatch, pipelineCache, objectAccounting, vertex, fragment, layout,
        format, topology, enableBlend, FullColorWriteMask(), nil)
      return created
    } finally {
      lock (pipelineGate) {
        Volatile.Write(ref Unsafe.As[VkPipeline, uint64](ref pipeline.Handle), created.Raw)
        pipeline.Creating = false
        activePipelineCreations--
        Monitor.PulseAll(pipelineGate)
      }
    }
  }

  private func FullColorWriteMask() uint32 ->
  uint32(VkConstants.VK_COLOR_COMPONENT_R_BIT)
  | uint32(VkConstants.VK_COLOR_COMPONENT_G_BIT)
  | uint32(VkConstants.VK_COLOR_COMPONENT_B_BIT)
  | uint32(VkConstants.VK_COLOR_COMPONENT_A_BIT)

  private func ShaderEffectKey(replacesBackdrop bool) VulkanGraphicsPipelineKey ->
  VulkanGraphicsPipelineKey{
    TargetFormat: format,
    SampleCount: 1u,
    Topology: uint32(VkConstants.VK_PRIMITIVE_TOPOLOGY_TRIANGLE_STRIP),
    BlendEnabled: !replacesBackdrop,
    ColorWriteMask: FullColorWriteMask(),
    ProgramKind: VulkanGraphicsProgramKind.ShaderEffect,
    ReplacesBackdrop: replacesBackdrop,
  }

  internal func ResolveShaderEffectPipeline(
    effect ShaderEffect,
    inFlightSerial uint64 = 0uL,
    pinned bool = false
  ) VkPipeline -> ResolveShaderEffectPipeline(effect.Program, inFlightSerial, pinned)

  internal func ResolveShaderEffectPipeline(
    program ShaderEffectProgram,
    inFlightSerial uint64 = 0uL,
    pinned bool = false
  ) VkPipeline {
    if disposed { throw ObjectDisposedException("VulkanSharedPrimitiveFormatState") }
    let effectivePinned = pinned || program.IsBuiltIn
    lock (pipelineGate) {
      if shaderEffectPipelineAliases.TryGetValue(program, out var existing) {
        if !existing.Evicted && !existing.Creating && existing.Pipeline != VkPipeline.Null {
          nextAccessTick++
          existing.AccessTick = nextAccessTick
          if effectivePinned { existing.Pinned = true }
          if inFlightSerial > existing.LastUseSerial {
            existing.LastUseSerial = inFlightSerial
          }
          return existing.Pipeline
        }
        if existing.Evicted {
          shaderEffectPipelineAliases.Remove(program)
        }
      }
    }
    let (entry, create) = ReserveShaderEffectPipeline(program, inFlightSerial, effectivePinned)
    if !create { return entry.Pipeline }
    var created VkPipeline
    try {
      created = CreateShaderEffectPipeline(entry)
      return created
    } finally {
      lock (pipelineGate) {
        entry.Creating = false
        if created != VkPipeline.Null {
          entry.Pipeline = created
          shaderEffectReadyCount++
          shaderEffectPipelineAliases.AddOrUpdate(program, entry)
        } else {
          shaderEffectPipelines.Remove(entry)
        }
        activePipelineCreations--
        Monitor.PulseAll(pipelineGate)
      }
    }
  }

  internal func StampShaderEffectSubmission(programs List[ShaderEffectProgram], submissionSerial uint64) {
    if disposed || submissionSerial == 0uL || programs.Count == 0 {
      return
    }
    lock (pipelineGate) {
      for program in programs {
        if shaderEffectPipelineAliases.TryGetValue(program, out var entry) && !entry.Evicted {
          if submissionSerial > entry.LastUseSerial {
            entry.LastUseSerial = submissionSerial
          }
        }
      }
    }
  }

  internal func CollectRetiredPipelines(completedSubmissionSerial uint64) {
    lock (pipelineGate) {
      var index = retiredPipelines.Count - 1
      while index >= 0 {
        let entry = retiredPipelines[index]
        if entry.RetireSerial <= completedSubmissionSerial {
          var pipeline = entry.Pipeline
          retiredPipelines.RemoveAt(index)
          VulkanNativeHandleDestroyer.DestroyPipeline(
            device, dispatch.vkDestroyPipeline, objectAccounting, ref pipeline)
        }
        index--
      }
    }
  }

  private func ReserveShaderEffectPipeline(
    program ShaderEffectProgram,
    inFlightSerial uint64,
    pinned bool
  ) (VulkanShaderEffectPipelineEntry, bool) {
    let spirv = program.VulkanSpirv
    let digest = program.VulkanSpirvDigest
    let key = ShaderEffectKey(program.ReplacesBackdrop)
    lock (pipelineGate) {
      while true {
        if disposed { throw ObjectDisposedException("VulkanSharedPrimitiveFormatState") }
        if shaderEffectPipelineAliases.TryGetValue(program, out var cached) {
          if cached.Evicted {
            shaderEffectPipelineAliases.Remove(program)
          } else if cached.Creating || cached.Pipeline == VkPipeline.Null {
            Monitor.Wait(pipelineGate)
            continue
          } else {
            nextAccessTick++
            cached.AccessTick = nextAccessTick
            if pinned { cached.Pinned = true }
            if inFlightSerial > cached.LastUseSerial {
              cached.LastUseSerial = inFlightSerial
            }
            return (cached, false)
          }
        }
        var matched VulkanShaderEffectPipelineEntry?
        for entry in shaderEffectPipelines {
          if entry.Key == key && BytesEqual(entry.Digest, digest) && BytesEqual(entry.Spirv, spirv) {
            matched = entry
            break
          }
        }
        if let entry = matched {
          if entry.Creating || entry.Pipeline == VkPipeline.Null {
            Monitor.Wait(pipelineGate)
            continue
          }
          nextAccessTick++
          entry.AccessTick = nextAccessTick
          if pinned { entry.Pinned = true }
          if inFlightSerial > entry.LastUseSerial {
            entry.LastUseSerial = inFlightSerial
          }
          shaderEffectPipelineAliases.AddOrUpdate(program, entry)
          return (entry, false)
        }
        if !pinned {
          var unpinnedCount int32 = 0
          for entry in shaderEffectPipelines {
            if !entry.Pinned { unpinnedCount++ }
          }
          if unpinnedCount >= UnpinnedShaderEffectCapacity {
            var lruIndex int32 = -1
            var lowestTick = uint64.MaxValue
            var idx int32 = 0
            while idx < shaderEffectPipelines.Count {
              let candidate = shaderEffectPipelines[idx]
              if !candidate.Pinned && !candidate.Creating && candidate.Pipeline != VkPipeline.Null
                && candidate.AccessTick <= lowestTick {
                lowestTick = candidate.AccessTick
                lruIndex = idx
              }
              idx++
            }
            if lruIndex < 0 {
              Monitor.Wait(pipelineGate)
              continue
            }
            let evicted = shaderEffectPipelines[lruIndex]
            evicted.Evicted = true
            shaderEffectPipelines.RemoveAt(lruIndex)
            retiredPipelines.Add(VulkanRetiredPipelineEntry(evicted.Pipeline, evicted.LastUseSerial))
            shaderEffectReadyCount--
          }
        }
        let created = VulkanShaderEffectPipelineEntry(key, digest, spirv, program.ReplacesBackdrop, pinned)
        created.Creating = true
        nextAccessTick++
        created.AccessTick = nextAccessTick
        created.LastUseSerial = inFlightSerial
        shaderEffectPipelines.Add(created)
        activePipelineCreations++
        return (created, true)
      }
    }
  }

  private func CreateShaderEffectPipeline(entry VulkanShaderEffectPipelineEntry) VkPipeline {
    var fragmentModule = VulkanPipelineFactory.CreateShaderModule(
      device, dispatch, objectAccounting, entry.Spirv, "shader effect")
    var coordinates uint32 = 1u
    var specializationEntry = VkSpecializationMapEntry{constantID: 0u, size: 4u}
    var specialization = VkSpecializationInfo{
      mapEntryCount: 1u,
      pMapEntries: *VkSpecializationMapEntry(Unsafe.AsPointer[VkSpecializationMapEntry](in specializationEntry)),
      dataSize: 4u,
      pData: Unsafe.AsPointer[uint32](in coordinates),
    }
    try {
      return VulkanPipelineFactory.CreateGraphics(
        device,
        dispatch,
        pipelineCache,
        objectAccounting,
        analyticVertexModule,
        fragmentModule,
        blendPipelineLayout,
        format,
        VkConstants.VK_PRIMITIVE_TOPOLOGY_TRIANGLE_STRIP,
        !entry.ReplacesBackdrop,
        FullColorWriteMask(),
        vertexSpecialization: *VkSpecializationInfo(Unsafe.AsPointer[VkSpecializationInfo](in specialization))
      )
    } finally {
      VulkanNativeHandleDestroyer.DestroyShaderModule(
        device, dispatch.vkDestroyShaderModule, objectAccounting, ref fragmentModule)
    }
  }

  private func BytesEqual(left []uint8, right []uint8) bool ->
  MemoryExtensions.SequenceEqual[uint8](left.AsSpan(), right.AsSpan())

  public func Dispose() {
    lock (pipelineGate) {
      if disposed {
        return
      }
      disposed = true
      while activePipelineCreations != 0 { Monitor.Wait(pipelineGate) }
      DestroyPipelines()
    }
  }

  private func DestroyPipelines() {
    for retired in retiredPipelines {
      var pipeline = retired.Pipeline
      VulkanNativeHandleDestroyer.DestroyPipeline(
        device, dispatch.vkDestroyPipeline, objectAccounting, ref pipeline)
    }
    retiredPipelines.Clear()
    for entry in shaderEffectPipelines {
      entry.Evicted = true
      if entry.Pipeline != VkPipeline.Null {
        var pipeline = entry.Pipeline
        VulkanNativeHandleDestroyer.DestroyPipeline(
          device, dispatch.vkDestroyPipeline, objectAccounting, ref pipeline)
        entry.Pipeline = VkPipeline.Null
      }
    }
    shaderEffectPipelines.Clear()
    shaderEffectPipelineAliases.Clear()
    shaderEffectReadyCount = 0
    VulkanNativeHandleDestroyer.DestroyPipeline(
      device, dispatch.vkDestroyPipeline, objectAccounting, ref textPaintPipeline.Handle)
    VulkanNativeHandleDestroyer.DestroyPipeline(
      device, dispatch.vkDestroyPipeline, objectAccounting, ref textPipeline.Handle)
    VulkanNativeHandleDestroyer.DestroyPipeline(
      device, dispatch.vkDestroyPipeline, objectAccounting, ref blendPipeline.Handle)
    VulkanNativeHandleDestroyer.DestroyPipeline(
      device, dispatch.vkDestroyPipeline, objectAccounting, ref blendReplacePipeline.Handle)
    VulkanNativeHandleDestroyer.DestroyPipeline(
      device, dispatch.vkDestroyPipeline, objectAccounting, ref pathPipeline.Handle)
    VulkanNativeHandleDestroyer.DestroyPipeline(
      device, dispatch.vkDestroyPipeline, objectAccounting, ref batchedUiPipeline.Handle)
  }

  deinit{
    Dispose()
  }
}

internal unsafe sealed partial class VulkanSharedPrimitiveState : IDisposable {
  private const FormatCapacity int32 = 2
  private let device VkDevice
  private let dispatch VkDeviceDispatch
  private let pipelineCache VulkanPipelineCache
  private let imageResources VulkanImageResources
  private let objectAccounting VulkanObjectAccounting?
  private let generation uint64
  private let formatStates []VulkanSharedPrimitiveFormatState?
  private let strokePipelineGate object = Object()
  private var preparationThread Thread?
  private var preparationStopped int32
  private var vertexModule VkShaderModule
  private var batchedUiVertexModule VkShaderModule
  private var batchedUiFragmentModule VkShaderModule
  private var blendModule VkShaderModule
  private var pathVertexModule VkShaderModule
  private var pathFragmentModule VkShaderModule
  private var textVertexModule VkShaderModule
  private var textFragmentModule VkShaderModule
  private var textPaintFragmentModule VkShaderModule
  private var pipelineLayout VkPipelineLayout
  private var blendPipelineLayout VkPipelineLayout
  private var pathDescriptorSetLayout VkDescriptorSetLayout
  private var pathPipelineLayout VkPipelineLayout
  private var textDescriptorSetLayout VkDescriptorSetLayout
  private var textPipelineLayout VkPipelineLayout
  private var primitiveDescriptorSetLayout VkDescriptorSetLayout
  private var clipDescriptorSetLayout VkDescriptorSetLayout
  private var effectDataDescriptorSetLayout VkDescriptorSetLayout
  private var disposed bool
  private var profileTraceId string?
  private var profileBaseline int64 = -1L

  internal func ProfileResources(recorder FrameRecorder) {
    if profileTraceId == recorder.TraceId && profileBaseline == recorder.BaselineVersion { return }
    profileTraceId = recorder.TraceId
    profileBaseline = recorder.BaselineVersion
    for module in []VkShaderModule{vertexModule, batchedUiVertexModule, batchedUiFragmentModule,
      blendModule, pathVertexModule, pathFragmentModule,
      textVertexModule, textFragmentModule, textPaintFragmentModule,
      strokeFragmentModule, strokeMetricModule} {
      recorder.Resource(FrameResourceKind.Shader,
        recorder.NativeResource(FrameResourceKind.Shader, uint64(device), module.Raw),
        VulkanDiagnosticEventIds.ResourceCreate, "shader.module", device: uint64(device), baseline: true)
    }
    for pipeline in []VkPipeline{strokeRgbaPipeline, strokeBgraPipeline, strokeMetricPipeline} {
      recorder.Resource(FrameResourceKind.Pipeline,
        recorder.NativeResource(FrameResourceKind.Pipeline, uint64(device), pipeline.Raw),
        VulkanDiagnosticEventIds.PipelineCreate, "pipeline", device: uint64(device), baseline: true)
    }
    for state in formatStates { state?.ProfileResources(recorder) }
  }

  internal prop Generation uint64{ get -> generation }
  internal prop PipelineLayout VkPipelineLayout{ get -> pipelineLayout }
  internal prop PrimitiveDescriptorSetLayout VkDescriptorSetLayout{ get -> primitiveDescriptorSetLayout }
  internal prop EffectDataDescriptorSetLayout VkDescriptorSetLayout{
    get -> effectDataDescriptorSetLayout
  }
  internal prop PathDescriptorSetLayout VkDescriptorSetLayout{ get -> pathDescriptorSetLayout }
  internal prop PathPipelineLayout VkPipelineLayout{ get -> pathPipelineLayout }
  internal prop TextDescriptorSetLayout VkDescriptorSetLayout{ get -> textDescriptorSetLayout }
  internal prop ClipDescriptorSetLayout VkDescriptorSetLayout{ get -> clipDescriptorSetLayout }

  internal init(
    nativeDevice VkDevice,
    nativeDispatch VkDeviceDispatch,
    nativePipelineCache VulkanPipelineCache,
    nativeImageResources VulkanImageResources,
    nativeGeneration uint64,
    nativeObjectAccounting VulkanObjectAccounting?) {
      if nativeDevice == VkDevice.Null {
        throw ArgumentException("Vulkan device is null", "nativeDevice")
      }
      if nativeImageResources == nil {
        throw ArgumentNullException("nativeImageResources")
      }
      if nativePipelineCache == nil {
        throw ArgumentNullException("nativePipelineCache")
      }
      if nativeGeneration == 0uL || nativeImageResources.Generation != nativeGeneration {
        throw ArgumentOutOfRangeException("nativeGeneration")
      }
      device = nativeDevice
      dispatch = nativeDispatch
      pipelineCache = nativePipelineCache
      imageResources = nativeImageResources
      objectAccounting = nativeObjectAccounting
      generation = nativeGeneration
      formatStates = [FormatCapacity]VulkanSharedPrimitiveFormatState?
      let vertexCode = LoadShaderCode("analytic.vert.spv")
      let batchedUiVertexCode = LoadShaderCode("batched_ui.vert.spv")
      let batchedUiFragmentCode = LoadShaderCode("batched_ui.frag.spv")
      let blendCode = LoadShaderCode("analytic_blend.frag.spv")
      let pathVertexCode = LoadShaderCode("path_band.vert.spv")
      let pathFragmentCode = LoadShaderCode("path_band.frag.spv")
      let textVertexCode = LoadShaderCode("hb_gpu.vert.spv")
      let textFragmentCode = LoadShaderCode("hb_gpu_draw.frag.spv")
      let textPaintFragmentCode = LoadShaderCode("hb_gpu_paint.frag.spv")
      try {
        vertexModule = CreateShaderModule(vertexCode, "analytic.vert.spv")
        batchedUiVertexModule = CreateShaderModule(batchedUiVertexCode, "batched_ui.vert.spv")
        batchedUiFragmentModule = CreateShaderModule(batchedUiFragmentCode, "batched_ui.frag.spv")
        blendModule = CreateShaderModule(blendCode, "analytic_blend.frag.spv")
        pathVertexModule = CreateShaderModule(pathVertexCode, "path_band.vert.spv")
        pathFragmentModule = CreateShaderModule(pathFragmentCode, "path_band.frag.spv")
        textVertexModule = CreateShaderModule(textVertexCode, "hb_gpu.vert.spv")
        textFragmentModule = CreateShaderModule(textFragmentCode, "hb_gpu_draw.frag.spv")
        textPaintFragmentModule = CreateShaderModule(textPaintFragmentCode, "hb_gpu_paint.frag.spv")
        pathDescriptorSetLayout = CreatePathDescriptorSetLayout()
        textDescriptorSetLayout = CreateTextDescriptorSetLayout()
        primitiveDescriptorSetLayout = CreatePrimitiveDescriptorSetLayout()
        clipDescriptorSetLayout = CreateClipDescriptorSetLayout()
        effectDataDescriptorSetLayout = CreateEffectDataDescriptorSetLayout()
        EnsurePathStrokes()
        pipelineLayout = CreatePipelineLayout()
        blendPipelineLayout = CreateBlendPipelineLayout()
        pathPipelineLayout = CreatePathPipelineLayout()
        textPipelineLayout = CreateTextPipelineLayout()
      } catch (error Exception) {
        Dispose()
        rethrow
      }
    }

  internal func Collect(completedSubmissionSerial uint64) {
    if disposed {
      return
    }
    for state in formatStates {
      state?.CollectRetiredPipelines(completedSubmissionSerial)
    }
  }

  internal func PipelinesFor(targetFormat VkFormat) VulkanSharedPrimitiveFormatState {
    EnsureOpen()
    var slot int32 = -1
    if targetFormat == VkConstants.VK_FORMAT_R8G8B8A8_UNORM {
      slot = 0
    } else if targetFormat == VkConstants.VK_FORMAT_B8G8R8A8_UNORM {
      slot = 1
    } else {
      throw ArgumentException("Vulkan primitive pipeline requires a UNORM RGBA target", "targetFormat")
    }
    if let existing = formatStates[slot] {
      return existing
    }
    let created = VulkanSharedPrimitiveFormatState(
      device,
      dispatch,
      pipelineCache,
      targetFormat,
      pipelineLayout,
      pathPipelineLayout,
      textPipelineLayout,
      blendPipelineLayout,
      vertexModule,
      batchedUiVertexModule,
      batchedUiFragmentModule,
      blendModule,
      pathVertexModule,
      pathFragmentModule,
      textVertexModule,
      textFragmentModule,
      textPaintFragmentModule,
      objectAccounting)
    formatStates[slot] = created
    return created
  }

  internal func PreparePipelinesAfterPresent() {
    EnsureOpen()
    if preparationThread != nil { return }
    PipelinesFor(VkConstants.VK_FORMAT_R8G8B8A8_UNORM)
    PipelinesFor(VkConstants.VK_FORMAT_B8G8R8A8_UNORM)
    let worker = Thread(() -> { PreparePipelines() })
    worker.IsBackground = true
    worker.Priority = ThreadPriority.BelowNormal
    preparationThread = worker
    worker.Start()
  }

  private func PreparePipelines() {
    try {
      for state in formatStates {
        if Volatile.Read(in preparationStopped) != 0 { return }
        state?.MaterializePipelines()
      }
      if Volatile.Read(in preparationStopped) != 0 { return }
      let blur = ShaderEffect(ShaderEffectProgram.LoadEmbedded("filtered_backdrop.goo-effect"))
      for state in formatStates {
        if Volatile.Read(in preparationStopped) != 0 { return }
        state?.ResolveShaderEffectPipeline(blur, 0uL, true)
        state?.ResolveShaderEffectPipeline(BackdropBlurEffect.Shared, 0uL, true)
      }
      pipelineCache.Persist()
      if OperatingSystem.IsLinux() {
        let program = NativeLibrary.GetMainProgramHandle()
        if NativeLibrary.TryGetExport(program, "gnu_get_libc_version", out var glibc)
          && NativeLibrary.TryGetExport(program, "malloc_trim", out var address) {
          let nullable = address as (unmanaged[Cdecl](nuint) -> int32)?
          if nullable != nil {
            let trim = nullable
            trim(nuint(0))
          }
        }
      }
    } catch (error Exception) { }
  }

  private func CreatePipelineLayout() VkPipelineLayout {
    let descriptorLayout = imageResources.DescriptorSetLayout
    if descriptorLayout == VkDescriptorSetLayout.Null {
      throw InvalidOperationException("Vulkan sampled image descriptor layout is unavailable")
    }
    if clipDescriptorSetLayout == VkDescriptorSetLayout.Null
      || primitiveDescriptorSetLayout == VkDescriptorSetLayout.Null
      || strokeDescriptorLayout == VkDescriptorSetLayout.Null {
      throw InvalidOperationException("Vulkan analytic descriptor layouts are unavailable")
    }
    let descriptorLayouts * VkDescriptorSetLayout = stackalloc[4]VkDescriptorSetLayout
    descriptorLayouts[0] = descriptorLayout
    descriptorLayouts[1] = clipDescriptorSetLayout
    descriptorLayouts[2] = primitiveDescriptorSetLayout
    descriptorLayouts[3] = strokeDescriptorLayout
    return VulkanPipelineFactory.CreateLayout(
      device,
      dispatch,
      objectAccounting,
      descriptorLayouts,
      4u,
      nil,
      0u)
  }

  private func CreateBlendPipelineLayout() VkPipelineLayout {
    let descriptorLayout = imageResources.DescriptorSetLayout
    if descriptorLayout == VkDescriptorSetLayout.Null || primitiveDescriptorSetLayout == VkDescriptorSetLayout.Null
      || clipDescriptorSetLayout == VkDescriptorSetLayout.Null || effectDataDescriptorSetLayout == VkDescriptorSetLayout.Null {
        throw InvalidOperationException("Vulkan blend descriptor layouts are unavailable")
      }
    let descriptorLayouts * VkDescriptorSetLayout = stackalloc[5]VkDescriptorSetLayout
    descriptorLayouts[0] = descriptorLayout
    descriptorLayouts[1] = descriptorLayout
    descriptorLayouts[2] = primitiveDescriptorSetLayout
    descriptorLayouts[3] = clipDescriptorSetLayout
    descriptorLayouts[4] = effectDataDescriptorSetLayout
    var pushRange = VkPushConstantRange{}
    pushRange.stageFlags = uint32(VkConstants.VK_SHADER_STAGE_FRAGMENT_BIT)
    pushRange.offset = 0u
    pushRange.size = 128u
    return VulkanPipelineFactory.CreateLayout(
      device,
      dispatch,
      objectAccounting,
      descriptorLayouts,
      5u,
      &pushRange,
      1u)
  }

  private func CreatePathDescriptorSetLayout() VkDescriptorSetLayout ->
  VulkanDescriptorFactory.CreateSingleBindingLayout(
    device,
    dispatch,
    objectAccounting,
    VkConstants.VK_DESCRIPTOR_TYPE_STORAGE_BUFFER,
    uint32(VkConstants.VK_SHADER_STAGE_VERTEX_BIT)
    | uint32(VkConstants.VK_SHADER_STAGE_COMPUTE_BIT)
    | uint32(VkConstants.VK_SHADER_STAGE_FRAGMENT_BIT))

  private func CreateClipDescriptorSetLayout() VkDescriptorSetLayout {
    let bindings * VkDescriptorSetLayoutBinding = stackalloc[2]VkDescriptorSetLayoutBinding
    bindings[0] = VkDescriptorSetLayoutBinding{}
    bindings[0].binding = 0u
    bindings[0].descriptorType = VkConstants.VK_DESCRIPTOR_TYPE_STORAGE_BUFFER
    bindings[0].descriptorCount = 1u
    bindings[0].stageFlags = uint32(VkConstants.VK_SHADER_STAGE_FRAGMENT_BIT)
    bindings[1] = VkDescriptorSetLayoutBinding{}
    bindings[1].binding = 1u
    bindings[1].descriptorType = VkConstants.VK_DESCRIPTOR_TYPE_STORAGE_BUFFER
    bindings[1].descriptorCount = 1u
    bindings[1].stageFlags = uint32(VkConstants.VK_SHADER_STAGE_FRAGMENT_BIT)
    return VulkanDescriptorFactory.CreateLayout(
      device,
      dispatch,
      objectAccounting,
      bindings,
      2u)
  }

  private func CreatePathPipelineLayout() VkPipelineLayout {
    if pathDescriptorSetLayout == VkDescriptorSetLayout.Null || clipDescriptorSetLayout == VkDescriptorSetLayout.Null {
      throw InvalidOperationException("Vulkan path descriptor layout is unavailable")
    }
    let descriptorLayouts * VkDescriptorSetLayout = stackalloc[2]VkDescriptorSetLayout
    descriptorLayouts[0] = pathDescriptorSetLayout
    descriptorLayouts[1] = clipDescriptorSetLayout
    var pushRange = VkPushConstantRange{}
    pushRange.stageFlags = uint32(VkConstants.VK_SHADER_STAGE_VERTEX_BIT)
    | uint32(VkConstants.VK_SHADER_STAGE_FRAGMENT_BIT)
    pushRange.offset = 0u
    pushRange.size = 80u
    return VulkanPipelineFactory.CreateLayout(
      device,
      dispatch,
      objectAccounting,
      descriptorLayouts,
      2u,
      &pushRange,
      1u)
  }

  private func CreateTextDescriptorSetLayout() VkDescriptorSetLayout ->
  VulkanDescriptorFactory.CreateSingleBindingLayout(
    device,
    dispatch,
    objectAccounting,
    VkConstants.VK_DESCRIPTOR_TYPE_UNIFORM_TEXEL_BUFFER,
    uint32(VkConstants.VK_SHADER_STAGE_FRAGMENT_BIT))

  private func CreatePrimitiveDescriptorSetLayout() VkDescriptorSetLayout ->
  VulkanDescriptorFactory.CreateSingleBindingLayout(
    device,
    dispatch,
    objectAccounting,
    VkConstants.VK_DESCRIPTOR_TYPE_STORAGE_BUFFER,
    uint32(VkConstants.VK_SHADER_STAGE_VERTEX_BIT)
    | uint32(VkConstants.VK_SHADER_STAGE_FRAGMENT_BIT))

  private func CreateEffectDataDescriptorSetLayout() VkDescriptorSetLayout ->
  VulkanDescriptorFactory.CreateSingleBindingLayout(
    device,
    dispatch,
    objectAccounting,
    VkConstants.VK_DESCRIPTOR_TYPE_STORAGE_BUFFER,
    uint32(VkConstants.VK_SHADER_STAGE_FRAGMENT_BIT))

  private func CreateTextPipelineLayout() VkPipelineLayout {
    if textDescriptorSetLayout == VkDescriptorSetLayout.Null || clipDescriptorSetLayout == VkDescriptorSetLayout.Null
      || primitiveDescriptorSetLayout == VkDescriptorSetLayout.Null {
        throw InvalidOperationException("Vulkan text descriptor layouts are unavailable")
      }
    let descriptorLayouts * VkDescriptorSetLayout = stackalloc[3]VkDescriptorSetLayout
    descriptorLayouts[0] = textDescriptorSetLayout
    descriptorLayouts[1] = clipDescriptorSetLayout
    descriptorLayouts[2] = primitiveDescriptorSetLayout
    var pushRange = VkPushConstantRange{}
    pushRange.stageFlags = uint32(VkConstants.VK_SHADER_STAGE_VERTEX_BIT)
    pushRange.offset = 0u
    pushRange.size = 48u
    return VulkanPipelineFactory.CreateLayout(
      device,
      dispatch,
      objectAccounting,
      descriptorLayouts,
      3u,
      &pushRange,
      1u)
  }

  private func LoadShaderCode(fileName string) []uint8 {
    let code = VulkanShaderAssets.Read(fileName)
    if code.Length == 0 || (code.Length & 3) != 0 {
      throw InvalidDataException("Invalid SPIR-V artifact: " + fileName)
    }
    return code
  }

  private func CreateShaderModule(code []uint8, fileName string) VkShaderModule ->
  VulkanPipelineFactory.CreateShaderModule(
    device,
    dispatch,
    objectAccounting,
    code,
    fileName)

  internal func StopPipelinePreparation() {
    Volatile.Write(ref preparationStopped, 1)
    preparationThread?.Join()
  }

  public func Dispose() {
    if disposed {
      return
    }
    StopPipelinePreparation()
    disposed = true
    var index int32 = 0
    while index < formatStates.Length {
      if let state = formatStates[index] {
        state.Dispose()
        formatStates[index] = nil
      }
      index++
    }
    DisposePathStrokes()
    VulkanNativeHandleDestroyer.DestroyPipelineLayout(
      device, dispatch.vkDestroyPipelineLayout, objectAccounting, ref pipelineLayout)
    VulkanNativeHandleDestroyer.DestroyPipelineLayout(
      device, dispatch.vkDestroyPipelineLayout, objectAccounting, ref blendPipelineLayout)
    VulkanNativeHandleDestroyer.DestroyPipelineLayout(
      device, dispatch.vkDestroyPipelineLayout, objectAccounting, ref pathPipelineLayout)
    VulkanNativeHandleDestroyer.DestroyPipelineLayout(
      device, dispatch.vkDestroyPipelineLayout, objectAccounting, ref textPipelineLayout)
    VulkanNativeHandleDestroyer.DestroyDescriptorSetLayout(
      device, dispatch.vkDestroyDescriptorSetLayout, objectAccounting, ref pathDescriptorSetLayout)
    VulkanNativeHandleDestroyer.DestroyDescriptorSetLayout(
      device, dispatch.vkDestroyDescriptorSetLayout, objectAccounting, ref textDescriptorSetLayout)
    VulkanNativeHandleDestroyer.DestroyDescriptorSetLayout(
      device, dispatch.vkDestroyDescriptorSetLayout, objectAccounting, ref primitiveDescriptorSetLayout)
    VulkanNativeHandleDestroyer.DestroyDescriptorSetLayout(
      device, dispatch.vkDestroyDescriptorSetLayout, objectAccounting, ref effectDataDescriptorSetLayout)
    VulkanNativeHandleDestroyer.DestroyDescriptorSetLayout(
      device, dispatch.vkDestroyDescriptorSetLayout, objectAccounting, ref clipDescriptorSetLayout)
    VulkanNativeHandleDestroyer.DestroyShaderModule(
      device, dispatch.vkDestroyShaderModule, objectAccounting, ref textPaintFragmentModule)
    VulkanNativeHandleDestroyer.DestroyShaderModule(
      device, dispatch.vkDestroyShaderModule, objectAccounting, ref textFragmentModule)
    VulkanNativeHandleDestroyer.DestroyShaderModule(
      device, dispatch.vkDestroyShaderModule, objectAccounting, ref textVertexModule)
    VulkanNativeHandleDestroyer.DestroyShaderModule(
      device, dispatch.vkDestroyShaderModule, objectAccounting, ref blendModule)
    VulkanNativeHandleDestroyer.DestroyShaderModule(
      device, dispatch.vkDestroyShaderModule, objectAccounting, ref pathFragmentModule)
    VulkanNativeHandleDestroyer.DestroyShaderModule(
      device, dispatch.vkDestroyShaderModule, objectAccounting, ref pathVertexModule)
    VulkanNativeHandleDestroyer.DestroyShaderModule(
      device, dispatch.vkDestroyShaderModule, objectAccounting, ref batchedUiFragmentModule)
    VulkanNativeHandleDestroyer.DestroyShaderModule(
      device, dispatch.vkDestroyShaderModule, objectAccounting, ref batchedUiVertexModule)
    VulkanNativeHandleDestroyer.DestroyShaderModule(
      device, dispatch.vkDestroyShaderModule, objectAccounting, ref vertexModule)
  }

  private func EnsureOpen() {
    if disposed {
      throw ObjectDisposedException("VulkanSharedPrimitiveState")
    }
  }

  deinit{
    Dispose()
  }
}
