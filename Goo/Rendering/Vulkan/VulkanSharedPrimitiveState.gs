package Goo

import System
import System.IO
import System.Runtime.CompilerServices

internal unsafe class VulkanNativeHandleDestroyer {
  shared {
    internal func DestroyPipeline(
      device VkDevice,
      destroyPipeline unmanaged[Cdecl](VkDevice, VkPipeline, *VkAllocationCallbacks) -> void,
      objectAccounting VulkanObjectAccounting?,
      ref pipeline VkPipeline) {
        if pipeline != 0uL {
          destroyPipeline(device, pipeline, nil)
          if let accounting = objectAccounting { accounting.Release() }
          pipeline = 0uL
        }
      }

    internal func DestroyPipelineLayout(
      device VkDevice,
      destroyPipelineLayout unmanaged[Cdecl](VkDevice, VkPipelineLayout, *VkAllocationCallbacks) -> void,
      objectAccounting VulkanObjectAccounting?,
      ref layout VkPipelineLayout) {
        if layout != 0uL {
          destroyPipelineLayout(device, layout, nil)
          if let accounting = objectAccounting { accounting.Release() }
          layout = 0uL
        }
      }

    internal func DestroyDescriptorSetLayout(
      device VkDevice,
      destroyDescriptorSetLayout unmanaged[Cdecl](VkDevice, VkDescriptorSetLayout, *VkAllocationCallbacks) -> void,
      objectAccounting VulkanObjectAccounting?,
      ref layout VkDescriptorSetLayout) {
        if layout != 0uL {
          destroyDescriptorSetLayout(device, layout, nil)
          if let accounting = objectAccounting { accounting.Release() }
          layout = 0uL
        }
      }

    internal func DestroyShaderModule(
      device VkDevice,
      destroyShaderModule unmanaged[Cdecl](VkDevice, VkShaderModule, *VkAllocationCallbacks) -> void,
      objectAccounting VulkanObjectAccounting?,
      ref module VkShaderModule) {
        if module != 0uL {
          destroyShaderModule(device, module, nil)
          if let accounting = objectAccounting { accounting.Release() }
          module = 0uL
        }
      }
  }
}

internal sealed class VulkanShaderEffectPipelineEntry {
  internal let Digest []uint8
  internal let Spirv []uint8
  internal var Pipeline VkPipeline

  internal init(digest []uint8, spirv []uint8) {
    Digest = digest
    Spirv = spirv
  }
}

internal unsafe sealed partial class VulkanSharedPrimitiveFormatState : IDisposable {
  private const ShaderEffectCapacity int32 = 32
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
  private let shaderEffectPipelines []VulkanShaderEffectPipelineEntry?
  private let shaderEffectPipelineAliases ConditionalWeakTable[ShaderEffectProgram,
    VulkanShaderEffectPipelineEntry]
  private let solidModule VkShaderModule
  private let shadowModule VkShaderModule
  private let borderModule VkShaderModule
  private let linearModule VkShaderModule
  private let radialModule VkShaderModule
  private let sampledModule VkShaderModule
  private let lavaModule VkShaderModule
  private let blendModule VkShaderModule
  private let pathVertexModule VkShaderModule
  private let pathFragmentModule VkShaderModule
  private let textVertexModule VkShaderModule
  private let textFragmentModule VkShaderModule
  private let textPaintFragmentModule VkShaderModule
  private let pipelineGate object
  private var shaderEffectPipelineCount int32
  private var solidPipeline VkPipeline
  private var shadowPipeline VkPipeline
  private var borderPipeline VkPipeline
  private var linearPipeline VkPipeline
  private var radialPipeline VkPipeline
  private var sampledPipeline VkPipeline
  private var lavaPipeline VkPipeline
  private var blendPipeline VkPipeline
  private var pathPipeline VkPipeline
  private var textPipeline VkPipeline
  private var textPaintPipeline VkPipeline
  private var disposed bool

  internal prop Format VkFormat{ get -> format }
  internal prop PipelineLayout VkPipelineLayout{ get -> pipelineLayout }
  internal prop BlendPipelineLayout VkPipelineLayout{ get -> blendPipelineLayout }
  internal prop PathPipelineLayout VkPipelineLayout{ get -> pathPipelineLayout }
  internal prop TextPipelineLayout VkPipelineLayout{ get -> textPipelineLayout }
  internal prop SolidPipeline VkPipeline{
    get -> ResolvePipeline(ref solidPipeline, analyticVertexModule, solidModule,
      pipelineLayout, true, true)
  }
  internal prop ShadowPipeline VkPipeline{
    get -> ResolvePipeline(ref shadowPipeline, analyticVertexModule, shadowModule,
      pipelineLayout, true, true)
  }
  internal prop BorderPipeline VkPipeline{
    get -> ResolvePipeline(ref borderPipeline, analyticVertexModule, borderModule,
      pipelineLayout, true, true)
  }
  internal prop LinearPipeline VkPipeline{
    get -> ResolvePipeline(ref linearPipeline, analyticVertexModule, linearModule,
      pipelineLayout, true, true)
  }
  internal prop RadialPipeline VkPipeline{
    get -> ResolvePipeline(ref radialPipeline, analyticVertexModule, radialModule,
      pipelineLayout, true, true)
  }
  internal prop SampledPipeline VkPipeline{
    get -> ResolvePipeline(ref sampledPipeline, analyticVertexModule, sampledModule,
      pipelineLayout, true, true)
  }
  internal prop LavaPipeline VkPipeline{
    get -> ResolvePipeline(ref lavaPipeline, analyticVertexModule, lavaModule,
      pipelineLayout, true, true)
  }
  internal prop BlendPipeline VkPipeline{
    get -> ResolvePipeline(ref blendPipeline, analyticVertexModule, blendModule,
      blendPipelineLayout, true, true)
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
  internal prop LiveObjectCount uint64{
    get {
      var count uint64 = 0uL
      if solidPipeline != 0uL { count++ }
      if shadowPipeline != 0uL { count++ }
      if borderPipeline != 0uL { count++ }
      if linearPipeline != 0uL { count++ }
      if radialPipeline != 0uL { count++ }
      if sampledPipeline != 0uL { count++ }
      if lavaPipeline != 0uL { count++ }
      if blendPipeline != 0uL { count++ }
      if pathPipeline != 0uL { count++ }
      if textPipeline != 0uL { count++ }
      if textPaintPipeline != 0uL { count++ }
      count = count + uint64(shaderEffectPipelineCount)
      return count
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
    solidModule VkShaderModule,
    shadowModule VkShaderModule,
    borderModule VkShaderModule,
    linearModule VkShaderModule,
    radialModule VkShaderModule,
    sampledModule VkShaderModule,
    lavaModule VkShaderModule,
    blendModule VkShaderModule,
    pathVertexModule VkShaderModule,
    pathFragmentModule VkShaderModule,
    textVertexModule VkShaderModule,
    textFragmentModule VkShaderModule,
    textPaintFragmentModule VkShaderModule,
    nativeObjectAccounting VulkanObjectAccounting?) {
      if nativeDevice == nint(0) {
        throw ArgumentException("Vulkan device is null", "nativeDevice")
      }
      if nativePipelineCache == nil {
        throw ArgumentNullException("nativePipelineCache")
      }
      if targetFormat != VkConstants.VK_FORMAT_R8G8B8A8_SRGB
        && targetFormat != VkConstants.VK_FORMAT_B8G8R8A8_SRGB{
          throw ArgumentException("Vulkan primitive pipeline requires an sRGB RGBA target", "targetFormat")
        }
      if nativePipelineLayout == 0uL {
        throw ArgumentException("Vulkan primitive pipeline layout is null", "nativePipelineLayout")
      }
      if nativePathPipelineLayout == 0uL {
        throw ArgumentException("Vulkan path pipeline layout is null", "nativePathPipelineLayout")
      }
      if nativeTextPipelineLayout == 0uL {
        throw ArgumentException("Vulkan text pipeline layout is null", "nativeTextPipelineLayout")
      }
      if nativeBlendPipelineLayout == 0uL {
        throw ArgumentException("Vulkan blend pipeline layout is null", "nativeBlendPipelineLayout")
      }
      if vertexModule == 0uL || solidModule == 0uL || borderModule == 0uL
        || shadowModule == 0uL || linearModule == 0uL || radialModule == 0uL
        || sampledModule == 0uL || lavaModule == 0uL || blendModule == 0uL {
          throw ArgumentException("Vulkan primitive shader module is null")
        }
      if pathVertexModule == 0uL || pathFragmentModule == 0uL {
        throw ArgumentException("Vulkan path shader module is null")
      }
      if textVertexModule == 0uL || textFragmentModule == 0uL
        || textPaintFragmentModule == 0uL {
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
      this.solidModule = solidModule
      this.shadowModule = shadowModule
      this.borderModule = borderModule
      this.linearModule = linearModule
      this.radialModule = radialModule
      this.sampledModule = sampledModule
      this.lavaModule = lavaModule
      this.blendModule = blendModule
      this.pathVertexModule = pathVertexModule
      this.pathFragmentModule = pathFragmentModule
      this.textVertexModule = textVertexModule
      this.textFragmentModule = textFragmentModule
      this.textPaintFragmentModule = textPaintFragmentModule
      pipelineGate = Object()
      shaderEffectPipelines = [ShaderEffectCapacity]VulkanShaderEffectPipelineEntry?
      shaderEffectPipelineAliases = ConditionalWeakTable[ShaderEffectProgram,
        VulkanShaderEffectPipelineEntry]()
    }
  internal func MaterializePipelines() {
    ResolvePipeline(ref solidPipeline, analyticVertexModule, solidModule,
      pipelineLayout, true, true)
    ResolvePipeline(ref shadowPipeline, analyticVertexModule, shadowModule,
      pipelineLayout, true, true)
    ResolvePipeline(ref borderPipeline, analyticVertexModule, borderModule,
      pipelineLayout, true, true)
    ResolvePipeline(ref linearPipeline, analyticVertexModule, linearModule,
      pipelineLayout, true, true)
    ResolvePipeline(ref radialPipeline, analyticVertexModule, radialModule,
      pipelineLayout, true, true)
    ResolvePipeline(ref sampledPipeline, analyticVertexModule, sampledModule,
      pipelineLayout, true, true)
    ResolvePipeline(ref lavaPipeline, analyticVertexModule, lavaModule,
      pipelineLayout, true, true)
    ResolvePipeline(ref blendPipeline, analyticVertexModule, blendModule,
      blendPipelineLayout, true, true)
    ResolvePipeline(ref pathPipeline, pathVertexModule, pathFragmentModule,
      pathPipelineLayout, true, false)
    ResolvePipeline(ref textPipeline, textVertexModule, textFragmentModule,
      textPipelineLayout, true, false)
    ResolvePipeline(ref textPaintPipeline, textVertexModule,
      textPaintFragmentModule, textPipelineLayout, true, false)
  }

  private func ResolvePipeline(ref pipeline VkPipeline,
    vertex VkShaderModule, fragment VkShaderModule, layout VkPipelineLayout,
    enableBlend bool, primitiveInput bool) VkPipeline{
      if pipeline != 0uL {
        return pipeline
      }
      lock (pipelineGate) {
        if disposed {
          throw ObjectDisposedException("VulkanSharedPrimitiveFormatState")
        }
        if pipeline == 0uL {
          let topology = if primitiveInput {
            VkConstants.VK_PRIMITIVE_TOPOLOGY_TRIANGLE_STRIP
          } else {
            VkConstants.VK_PRIMITIVE_TOPOLOGY_TRIANGLE_LIST
          }
          pipeline = VulkanPipelineFactory.CreateGraphics(
            device,
            dispatch,
            pipelineCache,
            objectAccounting,
            vertex,
            fragment,
            layout,
            format,
            topology,
            enableBlend,
            FullColorWriteMask())
        }
        return pipeline
      }
    }

  private func FullColorWriteMask() uint32 ->
  uint32(VkConstants.VK_COLOR_COMPONENT_R_BIT)
  | uint32(VkConstants.VK_COLOR_COMPONENT_G_BIT)
  | uint32(VkConstants.VK_COLOR_COMPONENT_B_BIT)
  | uint32(VkConstants.VK_COLOR_COMPONENT_A_BIT)

  internal func ResolveShaderEffectPipeline(effect ShaderEffect) VkPipeline {
    if disposed { throw ObjectDisposedException("VulkanSharedPrimitiveFormatState") }
    let program = effect.Program
    if shaderEffectPipelineAliases.TryGetValue(program, out var existing) {
      return existing.Pipeline
    }
    lock (pipelineGate) {
      if disposed { throw ObjectDisposedException("VulkanSharedPrimitiveFormatState") }
      if shaderEffectPipelineAliases.TryGetValue(program, out var cached) {
        return cached.Pipeline
      }
      let spirv = program.VulkanSpirv
      let digest = program.VulkanSpirvDigest
      var index int32
      while index < shaderEffectPipelineCount {
        if let entry = shaderEffectPipelines[index] {
          if BytesEqual(entry.Digest, digest) && BytesEqual(entry.Spirv, spirv) {
            shaderEffectPipelineAliases.Add(program, entry)
            return entry.Pipeline
          }
        }
        index++
      }
      if shaderEffectPipelineCount >= shaderEffectPipelines.Length {
        throw InvalidOperationException("Vulkan shader effect pipeline capacity exhausted")
      }
      let entry = VulkanShaderEffectPipelineEntry(digest, spirv)
      let fragmentModule = VulkanPipelineFactory.CreateShaderModule(
        device,
        dispatch,
        objectAccounting,
        spirv,
        "shader effect")
      var pipeline VkPipeline
      try {
        pipeline = VulkanPipelineFactory.CreateGraphics(
          device,
          dispatch,
          pipelineCache,
          objectAccounting,
          analyticVertexModule,
          fragmentModule,
          blendPipelineLayout,
          format,
          VkConstants.VK_PRIMITIVE_TOPOLOGY_TRIANGLE_STRIP,
          true,
          FullColorWriteMask())
      } finally {
        let destroyShaderModule = dispatch.vkDestroyShaderModule
        destroyShaderModule(device, fragmentModule, nil)
        if let accounting = objectAccounting { accounting.Release() }
      }
      entry.Pipeline = pipeline
      shaderEffectPipelines[shaderEffectPipelineCount] = entry
      shaderEffectPipelineCount++
      shaderEffectPipelineAliases.Add(program, entry)
      return pipeline
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
      DestroyPipelines()
    }
  }

  private func DestroyPipelines() {
    let destroyPipeline = dispatch.vkDestroyPipeline
    var shaderIndex int32 = 0
    while shaderIndex < shaderEffectPipelineCount {
      if let entry = shaderEffectPipelines[shaderIndex] {
        if entry.Pipeline != 0uL {
          destroyPipeline(device, entry.Pipeline, nil)
          if let accounting = objectAccounting { accounting.Release() }
        }
      }
      shaderEffectPipelines[shaderIndex] = nil
      shaderIndex = shaderIndex + 1
    }
    shaderEffectPipelineAliases.Clear()
    shaderEffectPipelineCount = 0
    VulkanNativeHandleDestroyer.DestroyPipeline(
      device, dispatch.vkDestroyPipeline, objectAccounting, ref textPaintPipeline)
    VulkanNativeHandleDestroyer.DestroyPipeline(
      device, dispatch.vkDestroyPipeline, objectAccounting, ref textPipeline)
    VulkanNativeHandleDestroyer.DestroyPipeline(
      device, dispatch.vkDestroyPipeline, objectAccounting, ref sampledPipeline)
    VulkanNativeHandleDestroyer.DestroyPipeline(
      device, dispatch.vkDestroyPipeline, objectAccounting, ref lavaPipeline)
    VulkanNativeHandleDestroyer.DestroyPipeline(
      device, dispatch.vkDestroyPipeline, objectAccounting, ref blendPipeline)
    VulkanNativeHandleDestroyer.DestroyPipeline(
      device, dispatch.vkDestroyPipeline, objectAccounting, ref pathPipeline)
    VulkanNativeHandleDestroyer.DestroyPipeline(
      device, dispatch.vkDestroyPipeline, objectAccounting, ref shadowPipeline)
    VulkanNativeHandleDestroyer.DestroyPipeline(
      device, dispatch.vkDestroyPipeline, objectAccounting, ref radialPipeline)
    VulkanNativeHandleDestroyer.DestroyPipeline(
      device, dispatch.vkDestroyPipeline, objectAccounting, ref linearPipeline)
    VulkanNativeHandleDestroyer.DestroyPipeline(
      device, dispatch.vkDestroyPipeline, objectAccounting, ref borderPipeline)
    VulkanNativeHandleDestroyer.DestroyPipeline(
      device, dispatch.vkDestroyPipeline, objectAccounting, ref solidPipeline)
  }

  deinit{
    Dispose()
  }
}

internal unsafe sealed class VulkanSharedPrimitiveState : IDisposable {
  private const FormatCapacity int32 = 2
  private let device VkDevice
  private let dispatch VkDeviceDispatch
  private let pipelineCache VulkanPipelineCache
  private let imageResources VulkanImageResources
  private let objectAccounting VulkanObjectAccounting?
  private let generation uint64
  private let formatStates []VulkanSharedPrimitiveFormatState?
  private let clipPipelineGate object
  private let eagerPipelineCreation bool
  private var vertexModule VkShaderModule
  private var solidModule VkShaderModule
  private var shadowModule VkShaderModule
  private var borderModule VkShaderModule
  private var linearModule VkShaderModule
  private var radialModule VkShaderModule
  private var sampledModule VkShaderModule
  private var lavaModule VkShaderModule
  private var blendModule VkShaderModule
  private var pathVertexModule VkShaderModule
  private var pathFragmentModule VkShaderModule
  private var clipMaskVertexModule VkShaderModule
  private var clipMaskFragmentModule VkShaderModule
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
  private var clipMaskPipelineLayout VkPipelineLayout
  private var clipMaskR8Pipeline VkPipeline
  private var clipMaskRgba8Pipeline VkPipeline
  private var disposed bool

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
  internal prop ClipMaskPipelineLayout VkPipelineLayout{ get -> clipMaskPipelineLayout }
  internal prop ClipMaskR8Pipeline VkPipeline{
    get -> ResolveClipMaskPipeline(ref clipMaskR8Pipeline,
      VkConstants.VK_FORMAT_R8_UNORM)
  }
  internal prop ClipMaskRgba8Pipeline VkPipeline{
    get -> ResolveClipMaskPipeline(ref clipMaskRgba8Pipeline,
      VkConstants.VK_FORMAT_R8G8B8A8_UNORM)
  }
  internal prop LiveObjectCount uint64{
    get {
      var count uint64 = 0uL
      if vertexModule != 0uL { count++ }
      if solidModule != 0uL { count++ }
      if shadowModule != 0uL { count++ }
      if borderModule != 0uL { count++ }
      if linearModule != 0uL { count++ }
      if radialModule != 0uL { count++ }
      if sampledModule != 0uL { count++ }
      if lavaModule != 0uL { count++ }
      if blendModule != 0uL { count++ }
      if pathVertexModule != 0uL { count++ }
      if pathFragmentModule != 0uL { count++ }
      if clipMaskVertexModule != 0uL { count++ }
      if clipMaskFragmentModule != 0uL { count++ }
      if textVertexModule != 0uL { count++ }
      if effectDataDescriptorSetLayout != 0uL { count++ }
      if textFragmentModule != 0uL { count++ }
      if textPaintFragmentModule != 0uL { count++ }
      if pipelineLayout != 0uL { count++ }
      if blendPipelineLayout != 0uL { count++ }
      if pathDescriptorSetLayout != 0uL { count++ }
      if pathPipelineLayout != 0uL { count++ }
      if textDescriptorSetLayout != 0uL { count++ }
      if textPipelineLayout != 0uL { count++ }
      if primitiveDescriptorSetLayout != 0uL { count++ }
      if clipDescriptorSetLayout != 0uL { count++ }
      if clipMaskPipelineLayout != 0uL { count++ }
      if clipMaskR8Pipeline != 0uL { count++ }
      if clipMaskRgba8Pipeline != 0uL { count++ }
      var index int32 = 0
      while index < formatStates.Length {
        if let state = formatStates[index] {
          count += state.LiveObjectCount
        }
        index++
      }
      return count
    }
  }

  internal init(
    nativeDevice VkDevice,
    nativeDispatch VkDeviceDispatch,
    nativePipelineCache VulkanPipelineCache,
    nativeImageResources VulkanImageResources,
    nativeGeneration uint64,
    createPipelinesEagerly bool,
    nativeObjectAccounting VulkanObjectAccounting?) {
      if nativeDevice == nint(0) {
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
      eagerPipelineCreation = createPipelinesEagerly
      formatStates = [FormatCapacity]VulkanSharedPrimitiveFormatState?
      clipPipelineGate = Object()
      let vertexCode = LoadShaderCode("analytic.vert.spv")
      let solidCode = LoadShaderCode("analytic_solid.frag.spv")
      let shadowCode = LoadShaderCode("analytic_shadow.frag.spv")
      let borderCode = LoadShaderCode("analytic_border.frag.spv")
      let linearCode = LoadShaderCode("analytic_linear4.frag.spv")
      let radialCode = LoadShaderCode("analytic_radial4.frag.spv")
      let sampledCode = LoadShaderCode("analytic_sampled_image.frag.spv")
      let lavaCode = LoadShaderCode("lava.frag.spv")
      let blendCode = LoadShaderCode("analytic_blend.frag.spv")
      let pathVertexCode = LoadShaderCode("path_band.vert.spv")
      let pathFragmentCode = LoadShaderCode("path_band.frag.spv")
      let clipMaskVertexCode = LoadShaderCode("clip_mask.vert.spv")
      let clipMaskFragmentCode = LoadShaderCode("clip_mask.frag.spv")
      let textVertexCode = LoadShaderCode("hb_gpu.vert.spv")
      let textFragmentCode = LoadShaderCode("hb_gpu_draw.frag.spv")
      let textPaintFragmentCode = LoadShaderCode("hb_gpu_paint.frag.spv")
      try {
        vertexModule = CreateShaderModule(vertexCode, "analytic.vert.spv")
        solidModule = CreateShaderModule(solidCode, "analytic_solid.frag.spv")
        shadowModule = CreateShaderModule(shadowCode, "analytic_shadow.frag.spv")
        borderModule = CreateShaderModule(borderCode, "analytic_border.frag.spv")
        linearModule = CreateShaderModule(linearCode, "analytic_linear4.frag.spv")
        radialModule = CreateShaderModule(radialCode, "analytic_radial4.frag.spv")
        sampledModule = CreateShaderModule(sampledCode, "analytic_sampled_image.frag.spv")
        lavaModule = CreateShaderModule(lavaCode, "lava.frag.spv")
        blendModule = CreateShaderModule(blendCode, "analytic_blend.frag.spv")
        pathVertexModule = CreateShaderModule(pathVertexCode, "path_band.vert.spv")
        pathFragmentModule = CreateShaderModule(pathFragmentCode, "path_band.frag.spv")
        clipMaskVertexModule = CreateShaderModule(clipMaskVertexCode, "clip_mask.vert.spv")
        clipMaskFragmentModule = CreateShaderModule(clipMaskFragmentCode, "clip_mask.frag.spv")
        textVertexModule = CreateShaderModule(textVertexCode, "hb_gpu.vert.spv")
        textFragmentModule = CreateShaderModule(textFragmentCode, "hb_gpu_draw.frag.spv")
        textPaintFragmentModule = CreateShaderModule(textPaintFragmentCode, "hb_gpu_paint.frag.spv")
        pathDescriptorSetLayout = CreatePathDescriptorSetLayout()
        textDescriptorSetLayout = CreateTextDescriptorSetLayout()
        primitiveDescriptorSetLayout = CreatePrimitiveDescriptorSetLayout()
        clipDescriptorSetLayout = CreateClipDescriptorSetLayout()
        effectDataDescriptorSetLayout = CreateEffectDataDescriptorSetLayout()
        pipelineLayout = CreatePipelineLayout()
        blendPipelineLayout = CreateBlendPipelineLayout()
        pathPipelineLayout = CreatePathPipelineLayout()
        textPipelineLayout = CreateTextPipelineLayout()
        clipMaskPipelineLayout = CreateClipMaskPipelineLayout()
        if eagerPipelineCreation {
          clipMaskR8Pipeline = CreateClipMaskPipeline(VkConstants.VK_FORMAT_R8_UNORM)
          clipMaskRgba8Pipeline = CreateClipMaskPipeline(VkConstants.VK_FORMAT_R8G8B8A8_UNORM)
        }
      } catch (error Exception) {
        Dispose()
        throw error
      }
    }

  internal func PipelinesFor(targetFormat VkFormat) VulkanSharedPrimitiveFormatState {
    EnsureOpen()
    var slot int32 = -1
    if targetFormat == VkConstants.VK_FORMAT_R8G8B8A8_SRGB {
      slot = 0
    } else if targetFormat == VkConstants.VK_FORMAT_B8G8R8A8_SRGB {
      slot = 1
    } else {
      throw ArgumentException("Vulkan primitive pipeline requires an sRGB RGBA target", "targetFormat")
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
      solidModule,
      shadowModule,
      borderModule,
      linearModule,
      radialModule,
      sampledModule,
      lavaModule,
      blendModule,
      pathVertexModule,
      pathFragmentModule,
      textVertexModule,
      textFragmentModule,
      textPaintFragmentModule,
      objectAccounting)
    if eagerPipelineCreation {
      created.MaterializePipelines()
    }
    formatStates[slot] = created
    return created
  }

  internal func ClipMaskPipelineFor(value VulkanClipMaskFormat) VkPipeline {
    EnsureOpen()
    if value == VulkanClipMaskFormat.R8Unorm {
      return ClipMaskR8Pipeline
    }
    if value == VulkanClipMaskFormat.Rgba8Unorm {
      return ClipMaskRgba8Pipeline
    }
    throw ArgumentOutOfRangeException("value")
  }

  private func ResolveClipMaskPipeline(ref pipeline VkPipeline,
    targetFormat VkFormat) VkPipeline{
      if pipeline != 0uL {
        return pipeline
      }
      lock (clipPipelineGate) {
        EnsureOpen()
        if pipeline == 0uL {
          pipeline = CreateClipMaskPipeline(targetFormat)
        }
        return pipeline
      }
    }

  private func CreatePipelineLayout() VkPipelineLayout {
    let descriptorLayout = imageResources.DescriptorSetLayout
    if descriptorLayout == 0uL {
      throw InvalidOperationException("Vulkan sampled image descriptor layout is unavailable")
    }
    if clipDescriptorSetLayout == 0uL || primitiveDescriptorSetLayout == 0uL {
      throw InvalidOperationException("Vulkan analytic descriptor layouts are unavailable")
    }
    let descriptorLayouts * VkDescriptorSetLayout = stackalloc[3]VkDescriptorSetLayout
    descriptorLayouts[0] = descriptorLayout
    descriptorLayouts[1] = clipDescriptorSetLayout
    descriptorLayouts[2] = primitiveDescriptorSetLayout
    return VulkanPipelineFactory.CreateLayout(
      device,
      dispatch,
      objectAccounting,
      descriptorLayouts,
      3u,
      nil,
      0u)
  }

  private func CreateBlendPipelineLayout() VkPipelineLayout {
    let descriptorLayout = imageResources.DescriptorSetLayout
    if descriptorLayout == 0uL || primitiveDescriptorSetLayout == 0uL
      || clipDescriptorSetLayout == 0uL || effectDataDescriptorSetLayout == 0uL {
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
    | uint32(VkConstants.VK_SHADER_STAGE_FRAGMENT_BIT))

  private func CreateClipDescriptorSetLayout() VkDescriptorSetLayout {
    let bindings * VkDescriptorSetLayoutBinding = stackalloc[2]VkDescriptorSetLayoutBinding
    bindings[0] = VkDescriptorSetLayoutBinding{}
    bindings[0].binding = 0u
    bindings[0].descriptorType = VkConstants.VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER
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
    if pathDescriptorSetLayout == 0uL || clipDescriptorSetLayout == 0uL {
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
    if textDescriptorSetLayout == 0uL || clipDescriptorSetLayout == 0uL
      || primitiveDescriptorSetLayout == 0uL {
        throw InvalidOperationException("Vulkan text descriptor layouts are unavailable")
      }
    let descriptorLayouts * VkDescriptorSetLayout = stackalloc[3]VkDescriptorSetLayout
    descriptorLayouts[0] = textDescriptorSetLayout
    descriptorLayouts[1] = clipDescriptorSetLayout
    descriptorLayouts[2] = primitiveDescriptorSetLayout
    var pushRange = VkPushConstantRange{}
    pushRange.stageFlags = uint32(VkConstants.VK_SHADER_STAGE_VERTEX_BIT)
    pushRange.offset = 0u
    pushRange.size = 32u
    return VulkanPipelineFactory.CreateLayout(
      device,
      dispatch,
      objectAccounting,
      descriptorLayouts,
      3u,
      &pushRange,
      1u)
  }

  private func CreateClipMaskPipelineLayout() VkPipelineLayout {
    if pathDescriptorSetLayout == 0uL {
      throw InvalidOperationException("Vulkan clip mask path descriptor layout is unavailable")
    }
    var descriptorLayout VkDescriptorSetLayout = pathDescriptorSetLayout
    var pushRange = VkPushConstantRange{}
    pushRange.stageFlags = uint32(VkConstants.VK_SHADER_STAGE_VERTEX_BIT)
    | uint32(VkConstants.VK_SHADER_STAGE_FRAGMENT_BIT)
    pushRange.offset = 0u
    pushRange.size = 112u
    return VulkanPipelineFactory.CreateLayout(
      device,
      dispatch,
      objectAccounting,
      &descriptorLayout,
      1u,
      &pushRange,
      1u)
  }

  private func CreateClipMaskPipeline(targetFormat VkFormat) VkPipeline {
    if targetFormat != VkConstants.VK_FORMAT_R8_UNORM
      && targetFormat != VkConstants.VK_FORMAT_R8G8B8A8_UNORM{
        throw ArgumentException("Vulkan clip mask pipeline requires R8 or RGBA8 UNORM", "targetFormat")
      }
    return VulkanPipelineFactory.CreateGraphics(
      device,
      dispatch,
      pipelineCache,
      objectAccounting,
      clipMaskVertexModule,
      clipMaskFragmentModule,
      clipMaskPipelineLayout,
      targetFormat,
      VkConstants.VK_PRIMITIVE_TOPOLOGY_TRIANGLE_LIST,
      false,
      uint32(VkConstants.VK_COLOR_COMPONENT_R_BIT))
  }

  private func LoadShaderCode(fileName string) []uint8 {
    let path = Path.Combine(AppContext.BaseDirectory, "Vulkan", "Shaders", fileName)
    let code = File.ReadAllBytes(path)
    if code.Length == 0 || (code.Length & 3) != 0 {
      throw InvalidDataException("Invalid SPIR-V artifact: " + path)
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

  public func Dispose() {
    if disposed {
      return
    }
    disposed = true
    var index int32 = 0
    while index < formatStates.Length {
      if let state = formatStates[index] {
        state.Dispose()
        formatStates[index] = nil
      }
      index++
    }
    VulkanNativeHandleDestroyer.DestroyPipeline(
      device, dispatch.vkDestroyPipeline, objectAccounting, ref clipMaskR8Pipeline)
    VulkanNativeHandleDestroyer.DestroyPipeline(
      device, dispatch.vkDestroyPipeline, objectAccounting, ref clipMaskRgba8Pipeline)
    VulkanNativeHandleDestroyer.DestroyPipelineLayout(
      device, dispatch.vkDestroyPipelineLayout, objectAccounting, ref pipelineLayout)
    VulkanNativeHandleDestroyer.DestroyPipelineLayout(
      device, dispatch.vkDestroyPipelineLayout, objectAccounting, ref blendPipelineLayout)
    VulkanNativeHandleDestroyer.DestroyPipelineLayout(
      device, dispatch.vkDestroyPipelineLayout, objectAccounting, ref pathPipelineLayout)
    VulkanNativeHandleDestroyer.DestroyPipelineLayout(
      device, dispatch.vkDestroyPipelineLayout, objectAccounting, ref textPipelineLayout)
    VulkanNativeHandleDestroyer.DestroyPipelineLayout(
      device, dispatch.vkDestroyPipelineLayout, objectAccounting, ref clipMaskPipelineLayout)
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
      device, dispatch.vkDestroyShaderModule, objectAccounting, ref sampledModule)
    VulkanNativeHandleDestroyer.DestroyShaderModule(
      device, dispatch.vkDestroyShaderModule, objectAccounting, ref lavaModule)
    VulkanNativeHandleDestroyer.DestroyShaderModule(
      device, dispatch.vkDestroyShaderModule, objectAccounting, ref blendModule)
    VulkanNativeHandleDestroyer.DestroyShaderModule(
      device, dispatch.vkDestroyShaderModule, objectAccounting, ref pathFragmentModule)
    VulkanNativeHandleDestroyer.DestroyShaderModule(
      device, dispatch.vkDestroyShaderModule, objectAccounting, ref pathVertexModule)
    VulkanNativeHandleDestroyer.DestroyShaderModule(
      device, dispatch.vkDestroyShaderModule, objectAccounting, ref clipMaskFragmentModule)
    VulkanNativeHandleDestroyer.DestroyShaderModule(
      device, dispatch.vkDestroyShaderModule, objectAccounting, ref clipMaskVertexModule)
    VulkanNativeHandleDestroyer.DestroyShaderModule(
      device, dispatch.vkDestroyShaderModule, objectAccounting, ref shadowModule)
    VulkanNativeHandleDestroyer.DestroyShaderModule(
      device, dispatch.vkDestroyShaderModule, objectAccounting, ref radialModule)
    VulkanNativeHandleDestroyer.DestroyShaderModule(
      device, dispatch.vkDestroyShaderModule, objectAccounting, ref linearModule)
    VulkanNativeHandleDestroyer.DestroyShaderModule(
      device, dispatch.vkDestroyShaderModule, objectAccounting, ref borderModule)
    VulkanNativeHandleDestroyer.DestroyShaderModule(
      device, dispatch.vkDestroyShaderModule, objectAccounting, ref solidModule)
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
