package Goo.VulkanProof

import System
import System.Diagnostics
import System.Threading
import System.Runtime.InteropServices
import Goo

@DllImport("SDL3", EntryPoint: "SDL_Init", CallingConvention: CallingConvention.Cdecl)
unsafe func SDL_Init(flags uint32) uint8;

@DllImport("SDL3", EntryPoint: "SDL_Quit", CallingConvention: CallingConvention.Cdecl)
func SDL_Quit() void;

@DllImport("SDL3", EntryPoint: "SDL_Vulkan_LoadLibrary", CallingConvention: CallingConvention.Cdecl)
unsafe func SDL_Vulkan_LoadLibrary(path nint) uint8;

@DllImport("SDL3", EntryPoint: "SDL_GetError", CallingConvention: CallingConvention.Cdecl)
func SDL_GetError() nint;

@DllImport("SDL3", EntryPoint: "SDL_Vulkan_GetVkGetInstanceProcAddr", CallingConvention: CallingConvention.Cdecl)
unsafe func SDL_Vulkan_GetVkGetInstanceProcAddr() nint;

@DllImport("SDL3", EntryPoint: "SDL_Vulkan_UnloadLibrary", CallingConvention: CallingConvention.Cdecl)
func SDL_Vulkan_UnloadLibrary() void;

@DllImport("SDL3", EntryPoint: "SDL_Vulkan_GetInstanceExtensions", CallingConvention: CallingConvention.Cdecl)
unsafe func SDL_Vulkan_GetInstanceExtensions(ref count uint32) * *int8;

@DllImport("SDL3", EntryPoint: "SDL_CreateWindow", CallingConvention: CallingConvention.Cdecl)
func SDL_CreateWindow(title string, width int32, height int32, flags uint64) nint;

@DllImport("SDL3", EntryPoint: "SDL_DestroyWindow", CallingConvention: CallingConvention.Cdecl)
func SDL_DestroyWindow(window nint) void;

@DllImport("SDL3", EntryPoint: "SDL_PushEvent", CallingConvention: CallingConvention.Cdecl)
unsafe func SDL_PushEvent(event * SdlEvent) uint8;

@DllImport("SDL3", EntryPoint: "SDL_Vulkan_CreateSurface", CallingConvention: CallingConvention.Cdecl)
unsafe func SDL_Vulkan_CreateSurface(window nint, instance VkInstance, allocator * VkAllocationCallbacks, ref surface VkSurfaceKHR) uint8;

@DllImport("SDL3", EntryPoint: "SDL_Vulkan_DestroySurface", CallingConvention: CallingConvention.Cdecl)
unsafe func SDL_Vulkan_DestroySurface(instance VkInstance, surface VkSurfaceKHR, allocator * VkAllocationCallbacks) void;

@DllImport("SDL3", EntryPoint: "SDL_Vulkan_GetPresentationSupport", CallingConvention: CallingConvention.Cdecl)
unsafe func SDL_Vulkan_GetPresentationSupport(instance VkInstance, physicalDevice VkPhysicalDevice, queueFamilyIndex uint32) uint8;

unsafe data struct VulkanExtensionNamePointer {
  var value * int8
}

unsafe func LoadGlobalProc(getProc nint, instance VkInstance, name string) nint {
  let nameStorage = Marshal.StringToCoTaskMemUTF8(name)
  let namePointer = *int8(nameStorage)
  let pointer = getProc as (unmanaged[Cdecl](VkInstance, *int8) -> unmanaged[Cdecl]() -> void)?
  let nonNullable = pointer!!
  let result = nonNullable(instance, namePointer)
  Marshal.FreeCoTaskMem(nameStorage)
  let resultAddress = result as nint?
  return resultAddress!!
}

unsafe func LoadDeviceProc(getProc nint, device VkDevice, name string) nint {
  let nameStorage = Marshal.StringToCoTaskMemUTF8(name)
  let namePointer = *int8(nameStorage)
  let pointer = getProc as (unmanaged[Cdecl](VkDevice, *int8) -> unmanaged[Cdecl]() -> void)?
  let nonNullable = pointer!!
  let result = nonNullable(device, namePointer)
  Marshal.FreeCoTaskMem(nameStorage)
  let resultAddress = result as nint?
  return resultAddress!!
}

unsafe func ExtensionNameEquals(property * VkExtensionProperties, expected string) bool {
  let expectedStorage = Marshal.StringToCoTaskMemUTF8(expected)
  try {
    let expectedPointer = *int8(expectedStorage)
    let actualPointer = property -> extensionName
    var index uint32 = 0u
    while index < VkConstants.VK_MAX_EXTENSION_NAME_SIZE {
      let actual = actualPointer[index]
      let wanted = expectedPointer[index]
      if actual != wanted {
        return false
      }
      if actual == 0 {
        return true
      }
      index++
    }
    return false
  } finally {
    Marshal.FreeCoTaskMem(expectedStorage)
  }
}

func TrackResult(diagnostics VulkanDiagnostics?, eventId uint64, result VkResult) VkResult {
  if let diagnostics = diagnostics {
    diagnostics.RecordResult(eventId, int32(result))
    if result < VkConstants.VK_SUCCESS {
      diagnostics.CaptureFatal(int32(result), eventId)
    }
  }
  return result
}

internal class VulkanSceneStageEvents {
  const Tree uint64 = 300uL
  const Plan uint64 = 301uL
  const Upload uint64 = 302uL
  const Record uint64 = 303uL
  const Submit uint64 = 304uL
  const Gpu uint64 = 305uL
  const Present uint64 = 306uL
}

func RecordSceneStage(
  diagnostics VulkanDiagnostics?,
  eventId uint64,
  result VkResult,
  value0 uint64,
  value1 uint64) {
    if let diagnostics = diagnostics {
      diagnostics.Record(0uL, 0uL, 0uL, 0uL, 0uL, 0uL, 0uL, 0uL, 0uL, 0uL,
        eventId, 3uL, 0uL, int32(result), value0, value1)
    }
  }

func RecordSceneCpuStage(
  diagnostics VulkanDiagnostics?,
  eventId uint64,
  result VkResult,
  elapsedTicks int64) {
    if elapsedTicks < 0L {
      throw InvalidOperationException("Stopwatch elapsed ticks are negative")
    }
    RecordSceneStage(diagnostics, eventId, result, uint64(elapsedTicks), uint64(Stopwatch.Frequency))
  }

func ByteNear(actual uint8, expected int32) bool {
  let delta = int32(actual) - expected
  return delta >= -3 && delta <= 3
}

func CountLiveObjects(
  window nint,
  instance VkInstance,
  surface VkSurfaceKHR,
  device VkDevice,
  swapchain VkSwapchainKHR,
  swapchainImageCount uint32,
  commandPool VkCommandPool,
  allocatedCommandBufferCount uint32,
  liveFrameSlotCount uint32,
  solidQuadHandleCount uint32,
  offscreenTargetHandleCount uint32,
  imageResourceHandleCount uint64,
  imageUploadFence VkFence,
  validationMessenger VkDebugUtilsMessengerEXT,
  queryPool VkQueryPool) uint64{
    var count uint64 = 0uL
    if window != nint(0) { count++ }
    if instance != nint(0) { count++ }
    if surface != 0uL { count++ }
    if device != nint(0) { count++ }
    if swapchain != 0uL {
      count = count + 1uL + uint64(swapchainImageCount) * 3uL
    }
    if commandPool != 0uL { count++ }
    count = count + uint64(allocatedCommandBufferCount)
    count = count + uint64(liveFrameSlotCount) * 2uL
    count = count + uint64(solidQuadHandleCount)
    count = count + uint64(offscreenTargetHandleCount)
    count = count + imageResourceHandleCount
    if imageUploadFence != 0uL { count++ }
    if validationMessenger != 0uL { count++ }
    if queryPool != 0uL { count++ }
    return count
  }

unsafe func WaitForVulkanGenerationCompletion(
  generation VulkanSwapchainGeneration,
  frameSlot0 VulkanFrameSlot,
  frameSlot1 VulkanFrameSlot,
  retirement VulkanPresentationRetirement) {
    let slot0Result = frameSlot0.PrepareAcquire()
    if slot0Result != VkConstants.VK_SUCCESS {
      throw InvalidOperationException("Vulkan frame-slot 0 retirement wait failed")
    }
    retirement.CollectCompleted(0u, frameSlot0.LastCompletedSerial)
    frameSlot0.AbortPrepared()
    let slot1Result = frameSlot1.PrepareAcquire()
    if slot1Result != VkConstants.VK_SUCCESS {
      throw InvalidOperationException("Vulkan frame-slot 1 retirement wait failed")
    }
    retirement.CollectCompleted(1u, frameSlot1.LastCompletedSerial)
    frameSlot1.AbortPrepared()
    let presentResult = generation.WaitForPresentCompletion(retirement)
    if presentResult != VkConstants.VK_SUCCESS {
      throw InvalidOperationException("Vulkan presentation retirement wait failed")
    }
  }

unsafe func SyncSdlLifecycle(lifecycle SdlLifecycle, window nint) int32 {
  lifecycle.SyncWindow(window)
  let result = lifecycle.DrainEvents()
  if result < 0 {
    throw InvalidOperationException("SDL lifecycle event drain failed")
  }
  lifecycle.RefreshMetrics(window)
  return result
}

func LifecycleExtent(lifecycle SdlLifecycle) VkExtent2D {
  if lifecycle.PixelWidth <= 0 || lifecycle.PixelHeight <= 0 {
    throw InvalidOperationException("SDL lifecycle pixel extent is zero")
  }
  var extent = VkExtent2D{}
  extent.width = uint32(lifecycle.PixelWidth)
  extent.height = uint32(lifecycle.PixelHeight)
  return extent
}

func ResolveLifecycleExtent(lifecycle SdlLifecycle, capabilities VkSurfaceCapabilitiesKHR) VkExtent2D {
  if capabilities.currentExtent.width != uint32.MaxValue {
    return capabilities.currentExtent
  }
  var extent = LifecycleExtent(lifecycle)
  if extent.width < capabilities.minImageExtent.width {
    extent.width = capabilities.minImageExtent.width
  } else if extent.width > capabilities.maxImageExtent.width {
    extent.width = capabilities.maxImageExtent.width
  }
  if extent.height < capabilities.minImageExtent.height {
    extent.height = capabilities.minImageExtent.height
  } else if extent.height > capabilities.maxImageExtent.height {
    extent.height = capabilities.maxImageExtent.height
  }
  return extent
}

func LifecycleRecoveryRenderStep(step uint32) uint32 {
  switch step {
    case 1u { return 0u }
    case 4u { return 3u }
    case 6u { return 5u }
    case 9u { return 8u }
    default { return step }
  }
}

unsafe data struct VulkanSwapchainSelection {
  var capabilities VkSurfaceCapabilitiesKHR
  var format VkSurfaceFormatKHR
  var presentMode VkPresentModeKHR
  var compositeAlpha VkCompositeAlphaFlagBitsKHR
}

func IsSupportedSrgbSurfaceFormat(value VkSurfaceFormatKHR) bool {
  if value.colorSpace != VkConstants.VK_COLOR_SPACE_SRGB_NONLINEAR_KHR {
    return false
  }
  return value.format == VkConstants.VK_FORMAT_B8G8R8A8_SRGB
    || value.format == VkConstants.VK_FORMAT_R8G8B8A8_SRGB
}

unsafe func TrySelectSrgbSurfaceFormat(
  formats * VkSurfaceFormatKHR,
  formatCount uint32,
  ref selected VkSurfaceFormatKHR) bool{
    if formatCount == 0u {
      return false
    }
    if formatCount == 1u && formats[0].format == VkConstants.VK_FORMAT_UNDEFINED {
      if formats[0].colorSpace != VkConstants.VK_COLOR_SPACE_SRGB_NONLINEAR_KHR {
        return false
      }
      selected.format = VkConstants.VK_FORMAT_B8G8R8A8_SRGB
      selected.colorSpace = VkConstants.VK_COLOR_SPACE_SRGB_NONLINEAR_KHR
      return true
    }
    var formatIndex uint32 = 0u
    while formatIndex < formatCount {
      let candidate = formats[formatIndex]
      if candidate.format == VkConstants.VK_FORMAT_B8G8R8A8_SRGB
        && candidate.colorSpace == VkConstants.VK_COLOR_SPACE_SRGB_NONLINEAR_KHR{
          selected = candidate
          return true
        }
      formatIndex++
    }
    formatIndex = 0u
    while formatIndex < formatCount {
      let candidate = formats[formatIndex]
      if candidate.format == VkConstants.VK_FORMAT_R8G8B8A8_SRGB
        && candidate.colorSpace == VkConstants.VK_COLOR_SPACE_SRGB_NONLINEAR_KHR{
          selected = candidate
          return true
        }
      formatIndex++
    }
    return false
  }

unsafe func QuerySwapchainSelection(
  physicalDevice VkPhysicalDevice,
  surface VkSurfaceKHR,
  instanceDispatch VkInstanceDispatch,
  diagnostics VulkanDiagnostics?,
  eventBase uint64) VulkanSwapchainSelection{
    let getSurfaceCapabilities = instanceDispatch.vkGetPhysicalDeviceSurfaceCapabilitiesKHR
    let getSurfaceFormats = instanceDispatch.vkGetPhysicalDeviceSurfaceFormatsKHR
    let getPresentModes = instanceDispatch.vkGetPhysicalDeviceSurfacePresentModesKHR
    let getPhysicalDeviceFormatProperties = instanceDispatch.vkGetPhysicalDeviceFormatProperties
    var result = VulkanSwapchainSelection{}
    if TrackResult(diagnostics, eventBase, getSurfaceCapabilities(physicalDevice, surface, &result.capabilities)) != VkConstants.VK_SUCCESS {
      throw InvalidOperationException("Vulkan surface capabilities query failed")
    }
    if (result.capabilities.supportedUsageFlags & uint32(VkConstants.VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT)) == 0u {
      throw InvalidOperationException("Vulkan surface does not support color attachment swapchain images")
    }

    var formatCount uint32 = 0u
    if TrackResult(diagnostics, eventBase + 1uL, getSurfaceFormats(physicalDevice, surface, &formatCount, nil)) != VkConstants.VK_SUCCESS || formatCount == 0u {
      throw InvalidOperationException("Vulkan surface formats are unavailable")
    }
    let formats * VkSurfaceFormatKHR = stackalloc[int32(formatCount)]VkSurfaceFormatKHR
    if TrackResult(diagnostics, eventBase + 2uL, getSurfaceFormats(physicalDevice, surface, &formatCount, formats)) != VkConstants.VK_SUCCESS {
      throw InvalidOperationException("Vulkan surface format query failed")
    }
    if !TrySelectSrgbSurfaceFormat(formats, formatCount, ref result.format) {
      throw InvalidOperationException("Vulkan surface exposes no supported sRGB swapchain format with VK_COLOR_SPACE_SRGB_NONLINEAR_KHR")
    }
    if !IsSupportedSrgbSurfaceFormat(result.format) {
      throw InvalidOperationException("Vulkan selected surface format is outside Goo's sRGB swapchain contract")
    }
    var surfaceFormatProperties = VkFormatProperties{}
    getPhysicalDeviceFormatProperties(
      physicalDevice,
      result.format.format,
      &surfaceFormatProperties)
    let requiredSurfaceFormatFeatures = uint32(VkConstants.VK_FORMAT_FEATURE_COLOR_ATTACHMENT_BIT)
    | uint32(VkConstants.VK_FORMAT_FEATURE_COLOR_ATTACHMENT_BLEND_BIT)
    if (surfaceFormatProperties.optimalTilingFeatures & requiredSurfaceFormatFeatures) != requiredSurfaceFormatFeatures {
      throw InvalidOperationException("Vulkan selected sRGB surface format lacks optimal color attachment blend support")
    }

    var presentModeCount uint32 = 0u
    if TrackResult(diagnostics, eventBase + 3uL, getPresentModes(physicalDevice, surface, &presentModeCount, nil)) != VkConstants.VK_SUCCESS || presentModeCount == 0u {
      throw InvalidOperationException("Vulkan surface present modes are unavailable")
    }
    let presentModes * VkPresentModeKHR = stackalloc[int32(presentModeCount)]VkPresentModeKHR
    if TrackResult(diagnostics, eventBase + 4uL, getPresentModes(physicalDevice, surface, &presentModeCount, presentModes)) != VkConstants.VK_SUCCESS {
      throw InvalidOperationException("Vulkan surface present mode query failed")
    }
    var foundFifo = false
    var presentModeIndex uint32 = 0u
    while presentModeIndex < presentModeCount {
      if presentModes[presentModeIndex] == VkConstants.VK_PRESENT_MODE_FIFO_KHR {
        foundFifo = true
      }
      presentModeIndex++
    }
    if !foundFifo {
      throw InvalidOperationException("Vulkan FIFO present mode is unavailable")
    }
    result.presentMode = VkConstants.VK_PRESENT_MODE_FIFO_KHR

    if (result.capabilities.supportedCompositeAlpha & uint32(VkConstants.VK_COMPOSITE_ALPHA_OPAQUE_BIT_KHR)) != 0u {
      result.compositeAlpha = VkConstants.VK_COMPOSITE_ALPHA_OPAQUE_BIT_KHR
    } else if (result.capabilities.supportedCompositeAlpha & uint32(VkConstants.VK_COMPOSITE_ALPHA_PRE_MULTIPLIED_BIT_KHR)) != 0u {
      result.compositeAlpha = VkConstants.VK_COMPOSITE_ALPHA_PRE_MULTIPLIED_BIT_KHR
    } else if (result.capabilities.supportedCompositeAlpha & uint32(VkConstants.VK_COMPOSITE_ALPHA_POST_MULTIPLIED_BIT_KHR)) != 0u {
      result.compositeAlpha = VkConstants.VK_COMPOSITE_ALPHA_POST_MULTIPLIED_BIT_KHR
    } else if (result.capabilities.supportedCompositeAlpha & uint32(VkConstants.VK_COMPOSITE_ALPHA_INHERIT_BIT_KHR)) != 0u {
      result.compositeAlpha = VkConstants.VK_COMPOSITE_ALPHA_INHERIT_BIT_KHR
    } else {
      throw InvalidOperationException("No supported swapchain composite alpha mode is available")
    }
    return result
  }

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
  var diagnostics VulkanDiagnostics? = nil
  var validation VulkanValidation? = nil
  if Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1" {
    diagnostics = VulkanDiagnostics()
    validation = VulkanValidation(diagnostics)
  }
  var sdlInitialized = false
  var vulkanLoaded = false
  var window nint = nint(0)
  var instance VkInstance = nint(0)
  var surface VkSurfaceKHR = uint64(0)
  var surfaceCreated = false
  var appNameStorage nint = nint(0)
  var engineNameStorage nint = nint(0)
  var swapchainExtensionStorage nint = nint(0)
  var maintenanceExtensionStorage nint = nint(0)
  var memoryBudgetExtensionStorage nint = nint(0)
  var surfaceMaintenanceExtensionStorage nint = nint(0)
  var surfaceCapabilities2ExtensionStorage nint = nint(0)
  var destroyInstanceAddress nint = nint(0)
  var device VkDevice = nint(0)
  var deviceCreated = false
  var queue VkQueue = nint(0)
  var swapchain VkSwapchainKHR = uint64(0)
  var swapchainCreated = false
  var swapchainImageCount uint32 = 0u
  var commandPool VkCommandPool = uint64(0)
  var commandPoolCreated = false
  var deviceDispatch = VkDeviceDispatch{}
  var instanceDispatch = VkInstanceDispatch{}
  var destroyCommandPoolAddress nint = nint(0)
  var destroyDeviceAddress nint = nint(0)
  var validationMessenger VkDebugUtilsMessengerEXT = uint64(0)
  var validationMessengerCreated = false
  var destroyValidationMessengerAddress nint = nint(0)
  var queryPool VkQueryPool = uint64(0)
  var queryPoolCreated = false
  var destroyQueryPoolAddress nint = nint(0)
  var debugExtensionNameStorage nint = nint(0)
  var solidQuad VulkanSolidQuad? = nil
  var swapchainGeneration VulkanSwapchainGeneration? = nil
  var frameSlot0 VulkanFrameSlot? = nil
  var frameSlot1 VulkanFrameSlot? = nil
  var presentationRetirement VulkanPresentationRetirement? = nil
  let readbackRequested = Environment.GetEnvironmentVariable("GOO_VK_READBACK") == "1"
  var readbackMemoryProperties = VkPhysicalDeviceMemoryProperties{}
  var readbackAllocator VulkanMemoryAllocator? = nil
  var readbackDispatch VulkanReadbackDispatch? = nil
  var offscreenTarget VulkanSolidQuadReadbackTarget? = nil
  var offscreenCommandBuffer VkCommandBuffer = nint(0)
  var offscreenCommandBufferNeedsReset = false
  var offscreenQueueAccepted = false
  var allocatedCommandBufferCount uint32 = 0u
  var resetCommandBufferAddress nint = nint(0)
  var frameIndex uint64 = 0uL
  var generation uint64 = 1uL
  var lifecycle SdlLifecycle? = nil
  let lifecycleRequested = Environment.GetEnvironmentVariable("GOO_VK_LIFECYCLE") == "1"
  let lifecycleDpiDeferred = Environment.GetEnvironmentVariable("GOO_VK_SKIP_DPI") == "1"
  let lifecycleMinimizeDeferred = Environment.GetEnvironmentVariable("GOO_VK_SKIP_MINIMIZE") == "1"
  var pendingRetiredGeneration VulkanSwapchainGeneration? = nil
  var acquireAttemptCount uint64 = 0uL
  var acquireResultCount uint64 = 0uL
  var acquireSuccessCount uint64 = 0uL
  var submitAttemptCount uint64 = 0uL
  var submitResultCount uint64 = 0uL
  var submitSuccessCount uint64 = 0uL
  var presentAttemptCount uint64 = 0uL
  var presentResultCount uint64 = 0uL
  var presentSuccessCount uint64 = 0uL
  var recordCount uint64 = 0uL
  var lifecycleDpiChanged = false
  var lifecycleCloseEventHandled = false

  try {
    if SDL_Init(0x00004020u) == 0u {
      throw InvalidOperationException("SDL video initialization failed")
    }
    sdlInitialized = true

    if SDL_Vulkan_LoadLibrary(nint(0)) == 0u {
      throw InvalidOperationException("Vulkan loader initialization failed: "
        +Marshal.PtrToStringUTF8(SDL_GetError()))
    }
    vulkanLoaded = true

    let getProcAddress nint = SDL_Vulkan_GetVkGetInstanceProcAddr()
    if getProcAddress == nint(0) {
      throw InvalidOperationException("Vulkan global procedure lookup is unavailable")
    }
    let getProcNullable = getProcAddress as (unmanaged[Cdecl](VkInstance, *int8) -> unmanaged[Cdecl]() -> void)?
    if getProcNullable == nil {
      throw InvalidOperationException("Vulkan global procedure lookup has an invalid address")
    }

    let enumerateVersionAddress = LoadGlobalProc(getProcAddress, nint(0), "vkEnumerateInstanceVersion")
    let enumerateVersionNullable = enumerateVersionAddress as (unmanaged[Cdecl](*uint32) -> VkResult)?
    if enumerateVersionNullable == nil {
      throw InvalidOperationException("vkEnumerateInstanceVersion is unavailable")
    }
    let enumerateVersion = enumerateVersionNullable

    let enumerateExtensionsAddress = LoadGlobalProc(getProcAddress, nint(0), "vkEnumerateInstanceExtensionProperties")
    let enumerateExtensionsNullable = enumerateExtensionsAddress as (unmanaged[Cdecl](*int8, *uint32, *VkExtensionProperties) -> VkResult)?
    if enumerateExtensionsNullable == nil {
      throw InvalidOperationException("vkEnumerateInstanceExtensionProperties is unavailable")
    }
    let enumerateExtensions = enumerateExtensionsNullable

    let createInstanceAddress = LoadGlobalProc(getProcAddress, nint(0), "vkCreateInstance")
    let createInstanceNullable = createInstanceAddress as (unmanaged[Cdecl](*VkInstanceCreateInfo, *VkAllocationCallbacks, *VkInstance) -> VkResult)?
    if createInstanceNullable == nil {
      throw InvalidOperationException("vkCreateInstance is unavailable")
    }
    let createInstance = createInstanceNullable

    var apiVersion uint32 = 0u
    if TrackResult(diagnostics, 10uL, enumerateVersion(&apiVersion)) != VkConstants.VK_SUCCESS || apiVersion < VkConstants.VK_API_VERSION_1_3 {
      throw InvalidOperationException("Vulkan 1.3 is required")
    }

    var availableExtensionCount uint32 = 0u
    if TrackResult(diagnostics, 11uL, enumerateExtensions(nil, &availableExtensionCount, nil)) != VkConstants.VK_SUCCESS {
      throw InvalidOperationException("vkEnumerateInstanceExtensionProperties failed")
    }
    var debugUtilsAvailable = false
    var surfaceMaintenanceAvailable = false
    var surfaceCapabilities2Available = false
    if availableExtensionCount > 0u {
      let availableExtensions * VkExtensionProperties = stackalloc[int32(availableExtensionCount)]VkExtensionProperties
      if TrackResult(diagnostics, 12uL, enumerateExtensions(nil, &availableExtensionCount, availableExtensions)) != VkConstants.VK_SUCCESS {
        throw InvalidOperationException("vkEnumerateInstanceExtensionProperties data query failed")
      }
      var availableExtensionIndex uint32 = 0u
      while availableExtensionIndex < availableExtensionCount {
        if !debugUtilsAvailable {
          debugUtilsAvailable = ExtensionNameEquals(&availableExtensions[availableExtensionIndex], VkConstants.VK_EXT_DEBUG_UTILS_EXTENSION_NAME)
        }
        if !surfaceMaintenanceAvailable {
          surfaceMaintenanceAvailable = ExtensionNameEquals(&availableExtensions[availableExtensionIndex], VkConstants.VK_EXT_SURFACE_MAINTENANCE_1_EXTENSION_NAME)
        }
        if !surfaceCapabilities2Available {
          surfaceCapabilities2Available = ExtensionNameEquals(&availableExtensions[availableExtensionIndex], VkConstants.VK_KHR_GET_SURFACE_CAPABILITIES_2_EXTENSION_NAME)
        }
        availableExtensionIndex++
      }
    }
    if let diagnostics = diagnostics {
      let debugUtilsFlag = debugUtilsAvailable ? 1u : 0u
      diagnostics.CaptureInstanceFacts(apiVersion, availableExtensionCount, debugUtilsFlag)
    }
    if diagnostics != nil && !debugUtilsAvailable {
      throw InvalidOperationException("VK_EXT_debug_utils is unavailable")
    }
    if !surfaceMaintenanceAvailable {
      throw InvalidOperationException("VK_EXT_surface_maintenance1 is unavailable")
    }
    if !surfaceCapabilities2Available {
      throw InvalidOperationException("VK_KHR_get_surface_capabilities2 is unavailable")
    }

    var requiredExtensionCount uint32 = 0u
    let requiredExtensions = SDL_Vulkan_GetInstanceExtensions(ref requiredExtensionCount)
    if requiredExtensions == nil || requiredExtensionCount == 0u {
      throw InvalidOperationException("SDL Vulkan instance extensions are unavailable")
    }
    let requiredExtensionPointers = *VulkanExtensionNamePointer(requiredExtensions)
    if let diagnostics = diagnostics {
      var requiredExtensionIndex uint32 = 0u
      while requiredExtensionIndex < requiredExtensionCount {
        diagnostics.CaptureExtension(1u, requiredExtensionPointers[requiredExtensionIndex].value)
        requiredExtensionIndex++
      }
    }
    surfaceMaintenanceExtensionStorage = Marshal.StringToCoTaskMemUTF8(VkConstants.VK_EXT_SURFACE_MAINTENANCE_1_EXTENSION_NAME)
    surfaceCapabilities2ExtensionStorage = Marshal.StringToCoTaskMemUTF8(VkConstants.VK_KHR_GET_SURFACE_CAPABILITIES_2_EXTENSION_NAME)
    let surfaceMaintenanceExtensionName = *int8(surfaceMaintenanceExtensionStorage)
    let surfaceCapabilities2ExtensionName = *int8(surfaceCapabilities2ExtensionStorage)
    let extensionNames * VulkanExtensionNamePointer = stackalloc[int32(requiredExtensionCount + 3u)]VulkanExtensionNamePointer
    var extensionIndex uint32 = 0u
    while extensionIndex < requiredExtensionCount {
      extensionNames[extensionIndex].value = requiredExtensionPointers[extensionIndex].value
      extensionIndex++
    }
    extensionNames[requiredExtensionCount].value = surfaceMaintenanceExtensionName
    extensionNames[requiredExtensionCount + 1u].value = surfaceCapabilities2ExtensionName
    var instanceExtensionCount = requiredExtensionCount + 2u
    if let diagnostics = diagnostics {
      diagnostics.CaptureExtension(1u, surfaceMaintenanceExtensionName)
      diagnostics.CaptureExtension(1u, surfaceCapabilities2ExtensionName)
    }
    var debugMessengerCreateInfo = VkDebugUtilsMessengerCreateInfoEXT{}
    if let validation = validation {
      debugExtensionNameStorage = Marshal.StringToCoTaskMemUTF8(VkConstants.VK_EXT_DEBUG_UTILS_EXTENSION_NAME)
      extensionNames[instanceExtensionCount].value = *int8(debugExtensionNameStorage)
      if let diagnostics = diagnostics {
        diagnostics.CaptureExtension(1u, *int8(debugExtensionNameStorage))
      }
      instanceExtensionCount++
      let callbackAddress = Marshal.GetFunctionPointerForDelegate(validation.Callback)
      let callbackNullable = callbackAddress as (unmanaged[Cdecl](VkDebugUtilsMessageSeverityFlagBitsEXT, VkDebugUtilsMessageTypeFlagsEXT, nint, nint) -> VkBool32)?
      if callbackNullable == nil {
        throw InvalidOperationException("Vulkan validation callback address is unavailable")
      }
      debugMessengerCreateInfo.sType = VkConstants.VK_STRUCTURE_TYPE_DEBUG_UTILS_MESSENGER_CREATE_INFO_EXT
      debugMessengerCreateInfo.messageSeverity = uint32(VkConstants.VK_DEBUG_UTILS_MESSAGE_SEVERITY_ERROR_BIT_EXT)
      | uint32(VkConstants.VK_DEBUG_UTILS_MESSAGE_SEVERITY_WARNING_BIT_EXT)
      debugMessengerCreateInfo.messageType = uint32(VkConstants.VK_DEBUG_UTILS_MESSAGE_TYPE_GENERAL_BIT_EXT)
      | uint32(VkConstants.VK_DEBUG_UTILS_MESSAGE_TYPE_VALIDATION_BIT_EXT)
      | uint32(VkConstants.VK_DEBUG_UTILS_MESSAGE_TYPE_PERFORMANCE_BIT_EXT)
      debugMessengerCreateInfo.pfnUserCallback = callbackNullable
      debugMessengerCreateInfo.pUserData = nil
    }
    let instanceExtensionNames * *int8 = &extensionNames[0].value

    appNameStorage = Marshal.StringToCoTaskMemUTF8("Goo Vulkan Proof")
    engineNameStorage = Marshal.StringToCoTaskMemUTF8("Goo")
    var applicationInfo = VkApplicationInfo{}
    applicationInfo.sType = VkConstants.VK_STRUCTURE_TYPE_APPLICATION_INFO
    applicationInfo.pApplicationName = *int8(appNameStorage)
    applicationInfo.applicationVersion = 1u
    applicationInfo.pEngineName = *int8(engineNameStorage)
    applicationInfo.engineVersion = 1u
    applicationInfo.apiVersion = VkConstants.VK_API_VERSION_1_3

    var createInfo = VkInstanceCreateInfo{}
    createInfo.sType = VkConstants.VK_STRUCTURE_TYPE_INSTANCE_CREATE_INFO
    createInfo.pApplicationInfo = &applicationInfo
    createInfo.enabledExtensionCount = instanceExtensionCount
    createInfo.ppEnabledExtensionNames = instanceExtensionNames
    if validation != nil {
      createInfo.pNext = *void(&debugMessengerCreateInfo)
    }

    if TrackResult(diagnostics, 13uL, createInstance(&createInfo, nil, &instance)) != VkConstants.VK_SUCCESS || instance == nint(0) {
      throw InvalidOperationException("vkCreateInstance failed")
    }

    destroyInstanceAddress = LoadGlobalProc(getProcAddress, instance, "vkDestroyInstance")
    let destroyInstanceNullable = destroyInstanceAddress as (unmanaged[Cdecl](VkInstance, *VkAllocationCallbacks) -> void)?
    if destroyInstanceNullable == nil {
      throw InvalidOperationException("vkDestroyInstance is unavailable")
    }
    instanceDispatch.vkDestroyInstance = destroyInstanceNullable
    let destroyInstance = instanceDispatch.vkDestroyInstance

    if let validation = validation {
      let createMessengerAddress = LoadGlobalProc(getProcAddress, instance, "vkCreateDebugUtilsMessengerEXT")
      let createMessengerNullable = createMessengerAddress as (unmanaged[Cdecl](VkInstance, *VkDebugUtilsMessengerCreateInfoEXT, *VkAllocationCallbacks, *VkDebugUtilsMessengerEXT) -> VkResult)?
      if createMessengerNullable == nil {
        throw InvalidOperationException("vkCreateDebugUtilsMessengerEXT is unavailable")
      }
      instanceDispatch.vkCreateDebugUtilsMessengerEXT = createMessengerNullable
      let destroyMessengerAddress = LoadGlobalProc(getProcAddress, instance, "vkDestroyDebugUtilsMessengerEXT")
      let destroyMessengerNullable = destroyMessengerAddress as (unmanaged[Cdecl](VkInstance, VkDebugUtilsMessengerEXT, *VkAllocationCallbacks) -> void)?
      if destroyMessengerNullable == nil {
        throw InvalidOperationException("vkDestroyDebugUtilsMessengerEXT is unavailable")
      }
      instanceDispatch.vkDestroyDebugUtilsMessengerEXT = destroyMessengerNullable
      destroyValidationMessengerAddress = destroyMessengerAddress
      let createMessenger = instanceDispatch.vkCreateDebugUtilsMessengerEXT
      let createMessengerResult = createMessenger(instance, &debugMessengerCreateInfo, nil, &validationMessenger)
      if TrackResult(diagnostics, 1uL, createMessengerResult) != VkConstants.VK_SUCCESS {
        throw InvalidOperationException("vkCreateDebugUtilsMessengerEXT failed")
      }
      validationMessengerCreated = true
      validation.KeepAlive()
    }

    let enumeratePhysicalDevicesAddress = LoadGlobalProc(getProcAddress, instance, "vkEnumeratePhysicalDevices")
    let enumeratePhysicalDevicesNullable = enumeratePhysicalDevicesAddress as (unmanaged[Cdecl](VkInstance, *uint32, *VkPhysicalDevice) -> VkResult)?
    if enumeratePhysicalDevicesNullable == nil {
      throw InvalidOperationException("vkEnumeratePhysicalDevices is unavailable")
    }
    let enumeratePhysicalDevices = enumeratePhysicalDevicesNullable

    let queueFamilyPropertiesAddress = LoadGlobalProc(getProcAddress, instance, "vkGetPhysicalDeviceQueueFamilyProperties")
    let queueFamilyPropertiesNullable = queueFamilyPropertiesAddress as (unmanaged[Cdecl](VkPhysicalDevice, *uint32, *VkQueueFamilyProperties) -> void)?
    if queueFamilyPropertiesNullable == nil {
      throw InvalidOperationException("vkGetPhysicalDeviceQueueFamilyProperties is unavailable")
    }
    let queueFamilyProperties = queueFamilyPropertiesNullable

    let physicalDevicePropertiesAddress = LoadGlobalProc(getProcAddress, instance, "vkGetPhysicalDeviceProperties")
    let physicalDevicePropertiesNullable = physicalDevicePropertiesAddress as (unmanaged[Cdecl](VkPhysicalDevice, *VkPhysicalDeviceProperties) -> void)?
    if physicalDevicePropertiesNullable == nil {
      throw InvalidOperationException("vkGetPhysicalDeviceProperties is unavailable")
    }
    instanceDispatch.vkGetPhysicalDeviceProperties = physicalDevicePropertiesNullable

    let getPhysicalDeviceFormatPropertiesAddress = LoadGlobalProc(getProcAddress, instance, "vkGetPhysicalDeviceFormatProperties")
    let getPhysicalDeviceFormatPropertiesNullable = getPhysicalDeviceFormatPropertiesAddress as (unmanaged[Cdecl](VkPhysicalDevice, VkFormat, *VkFormatProperties) -> void)?
    if getPhysicalDeviceFormatPropertiesNullable == nil {
      throw InvalidOperationException("vkGetPhysicalDeviceFormatProperties is unavailable")
    }
    instanceDispatch.vkGetPhysicalDeviceFormatProperties = getPhysicalDeviceFormatPropertiesNullable

    let surfaceSupportAddress = LoadGlobalProc(getProcAddress, instance, "vkGetPhysicalDeviceSurfaceSupportKHR")
    let surfaceSupportNullable = surfaceSupportAddress as (unmanaged[Cdecl](VkPhysicalDevice, uint32, VkSurfaceKHR, *VkBool32) -> VkResult)?
    if surfaceSupportNullable == nil {
      throw InvalidOperationException("vkGetPhysicalDeviceSurfaceSupportKHR is unavailable")
    }
    let surfaceSupport = surfaceSupportNullable

    let getDeviceProcAddressAddress = LoadGlobalProc(getProcAddress, instance, "vkGetDeviceProcAddr")
    let getDeviceProcAddressNullable = getDeviceProcAddressAddress as (unmanaged[Cdecl](VkDevice, *int8) -> unmanaged[Cdecl]() -> void)?
    if getDeviceProcAddressNullable == nil {
      throw InvalidOperationException("vkGetDeviceProcAddr is unavailable")
    }
    instanceDispatch.vkGetDeviceProcAddr = getDeviceProcAddressNullable

    let getPhysicalDeviceFeatures2Address = LoadGlobalProc(getProcAddress, instance, "vkGetPhysicalDeviceFeatures2")
    let getPhysicalDeviceFeatures2Nullable = getPhysicalDeviceFeatures2Address as (unmanaged[Cdecl](VkPhysicalDevice, *VkPhysicalDeviceFeatures2) -> void)?
    if getPhysicalDeviceFeatures2Nullable == nil {
      throw InvalidOperationException("vkGetPhysicalDeviceFeatures2 is unavailable")
    }
    instanceDispatch.vkGetPhysicalDeviceFeatures2 = getPhysicalDeviceFeatures2Nullable

    let enumerateDeviceExtensionsAddress = LoadGlobalProc(getProcAddress, instance, "vkEnumerateDeviceExtensionProperties")
    let enumerateDeviceExtensionsNullable = enumerateDeviceExtensionsAddress as (unmanaged[Cdecl](VkPhysicalDevice, *int8, *uint32, *VkExtensionProperties) -> VkResult)?
    if enumerateDeviceExtensionsNullable == nil {
      throw InvalidOperationException("vkEnumerateDeviceExtensionProperties is unavailable")
    }
    instanceDispatch.vkEnumerateDeviceExtensionProperties = enumerateDeviceExtensionsNullable

    let getSurfaceCapabilitiesAddress = LoadGlobalProc(getProcAddress, instance, "vkGetPhysicalDeviceSurfaceCapabilitiesKHR")
    let getSurfaceCapabilitiesNullable = getSurfaceCapabilitiesAddress as (unmanaged[Cdecl](VkPhysicalDevice, VkSurfaceKHR, *VkSurfaceCapabilitiesKHR) -> VkResult)?
    if getSurfaceCapabilitiesNullable == nil {
      throw InvalidOperationException("vkGetPhysicalDeviceSurfaceCapabilitiesKHR is unavailable")
    }
    instanceDispatch.vkGetPhysicalDeviceSurfaceCapabilitiesKHR = getSurfaceCapabilitiesNullable

    let getSurfaceFormatsAddress = LoadGlobalProc(getProcAddress, instance, "vkGetPhysicalDeviceSurfaceFormatsKHR")
    let getSurfaceFormatsNullable = getSurfaceFormatsAddress as (unmanaged[Cdecl](VkPhysicalDevice, VkSurfaceKHR, *uint32, *VkSurfaceFormatKHR) -> VkResult)?
    if getSurfaceFormatsNullable == nil {
      throw InvalidOperationException("vkGetPhysicalDeviceSurfaceFormatsKHR is unavailable")
    }
    instanceDispatch.vkGetPhysicalDeviceSurfaceFormatsKHR = getSurfaceFormatsNullable

    let getPresentModesAddress = LoadGlobalProc(getProcAddress, instance, "vkGetPhysicalDeviceSurfacePresentModesKHR")
    let getPresentModesNullable = getPresentModesAddress as (unmanaged[Cdecl](VkPhysicalDevice, VkSurfaceKHR, *uint32, *VkPresentModeKHR) -> VkResult)?
    if getPresentModesNullable == nil {
      throw InvalidOperationException("vkGetPhysicalDeviceSurfacePresentModesKHR is unavailable")
    }
    instanceDispatch.vkGetPhysicalDeviceSurfacePresentModesKHR = getPresentModesNullable

    let createDeviceAddress = LoadGlobalProc(getProcAddress, instance, "vkCreateDevice")
    let createDeviceNullable = createDeviceAddress as (unmanaged[Cdecl](VkPhysicalDevice, *VkDeviceCreateInfo, *VkAllocationCallbacks, *VkDevice) -> VkResult)?
    if createDeviceNullable == nil {
      throw InvalidOperationException("vkCreateDevice is unavailable")
    }
    instanceDispatch.vkCreateDevice = createDeviceNullable

    window = SDL_CreateWindow("Goo Vulkan Proof", 640, 480, uint64(0x0000000010000000))
    if window == nint(0) {
      throw InvalidOperationException("SDL Vulkan window creation failed")
    }
    if SDL_Vulkan_CreateSurface(window, instance, nil, ref surface) == 0u {
      throw InvalidOperationException("SDL Vulkan surface creation failed")
    }
    surfaceCreated = true
    if lifecycleRequested {
      let lifecycleValue = SdlLifecycle()
      lifecycle = lifecycleValue
      lifecycleValue.BeginOpen(window)
      lifecycleValue.ShowWindow(window)
      lifecycleValue.SyncWindow(window)
      if lifecycleValue.DrainEvents() < 0 {
        throw InvalidOperationException("SDL lifecycle event drain failed")
      }
      lifecycleValue.RefreshMetrics(window)
      lifecycleValue.MarkReady()
    }
    if let diagnostics = diagnostics {
      diagnostics.CaptureWsiFacts(uint64(window), surface, 0uL, frameIndex, generation)
    }

    var physicalDeviceCount uint32 = 0u
    if TrackResult(diagnostics, 20uL, enumeratePhysicalDevices(instance, &physicalDeviceCount, nil)) != VkConstants.VK_SUCCESS || physicalDeviceCount == 0u {
      throw InvalidOperationException("No Vulkan physical device is available")
    }
    let physicalDevices * VkPhysicalDevice = stackalloc[int32(physicalDeviceCount)]VkPhysicalDevice
    if TrackResult(diagnostics, 21uL, enumeratePhysicalDevices(instance, &physicalDeviceCount, physicalDevices)) != VkConstants.VK_SUCCESS {
      throw InvalidOperationException("vkEnumeratePhysicalDevices data query failed")
    }

    let getPhysicalDeviceFeatures2 = instanceDispatch.vkGetPhysicalDeviceFeatures2
    let getPhysicalDeviceProperties = instanceDispatch.vkGetPhysicalDeviceProperties
    let getPhysicalDeviceFormatProperties = instanceDispatch.vkGetPhysicalDeviceFormatProperties
    let enumerateDeviceExtensions = instanceDispatch.vkEnumerateDeviceExtensionProperties
    let getSurfaceCapabilities = instanceDispatch.vkGetPhysicalDeviceSurfaceCapabilitiesKHR
    let getSurfaceFormats = instanceDispatch.vkGetPhysicalDeviceSurfaceFormatsKHR
    let getPresentModes = instanceDispatch.vkGetPhysicalDeviceSurfacePresentModesKHR
    var selectedPhysicalDevice VkPhysicalDevice = nint(0)
    var selectedQueueFamilyIndex uint32 = 0u
    var selectedTimestampValidBits uint32 = 0u
    var selectedSurfaceCapabilities = VkSurfaceCapabilitiesKHR{}
    var selectedSurfaceFormat = VkSurfaceFormatKHR{}
    var selectedPresentMode VkPresentModeKHR = VkConstants.VK_PRESENT_MODE_FIFO_KHR
    var selectedDeviceExtensionCount uint32 = 0u
    var selectedSwapchainMaintenance = false
    var selectedMemoryBudgetSupported = false
    var physicalIndex uint32 = 0u
    while physicalIndex < physicalDeviceCount && selectedPhysicalDevice == nint(0) {
      let physicalDevice = physicalDevices[physicalIndex]
      var candidateProperties = VkPhysicalDeviceProperties{}
      getPhysicalDeviceProperties(physicalDevice, &candidateProperties)
      var candidateQualified = candidateProperties.apiVersion >= VkConstants.VK_API_VERSION_1_3
      var textAtlasFormatProperties = VkFormatProperties{}
      getPhysicalDeviceFormatProperties(physicalDevice,
        VkConstants.VK_FORMAT_R16G16B16A16_SINT, &textAtlasFormatProperties)
      candidateQualified = candidateQualified
        && (textAtlasFormatProperties.bufferFeatures
          &uint32(VkConstants.VK_FORMAT_FEATURE_UNIFORM_TEXEL_BUFFER_BIT))
      == uint32(VkConstants.VK_FORMAT_FEATURE_UNIFORM_TEXEL_BUFFER_BIT)
      var candidateQueueFamilyIndex uint32 = 0u
      var candidateTimestampValidBits uint32 = 0u
      var hasPresentationQueue = false
      var queueFamilyCount uint32 = 0u
      var candidateDeviceExtensionCount uint32 = 0u
      var candidateMemoryBudgetSupported = false
      if candidateQualified {
        queueFamilyProperties(physicalDevice, &queueFamilyCount, nil)
        if queueFamilyCount > 0u {
          let queueFamilies * VkQueueFamilyProperties = stackalloc[int32(queueFamilyCount)]VkQueueFamilyProperties
          queueFamilyProperties(physicalDevice, &queueFamilyCount, queueFamilies)
          var queueFamilyIndex uint32 = 0u
          while queueFamilyIndex < queueFamilyCount && !hasPresentationQueue {
            let queueFamily = queueFamilies[queueFamilyIndex]
            if queueFamily.queueCount > 0u && (queueFamily.queueFlags & uint32(VkConstants.VK_QUEUE_GRAPHICS_BIT)) != 0u {
              var supported VkBool32 = VkConstants.VK_FALSE
              if TrackResult(diagnostics, 22uL, surfaceSupport(physicalDevice, queueFamilyIndex, surface, &supported)) != VkConstants.VK_SUCCESS {
                throw InvalidOperationException("vkGetPhysicalDeviceSurfaceSupportKHR failed")
              }
              let sdlSupported = SDL_Vulkan_GetPresentationSupport(instance, physicalDevice, queueFamilyIndex)
              if supported != VkConstants.VK_FALSE && sdlSupported != 0u {
                candidateQueueFamilyIndex = queueFamilyIndex
                candidateTimestampValidBits = queueFamily.timestampValidBits
                hasPresentationQueue = true
              }
            }
            queueFamilyIndex++
          }
        }
      }

      candidateQualified = candidateQualified && hasPresentationQueue
      var candidateSurfaceCapabilities = VkSurfaceCapabilitiesKHR{}
      var candidateSurfaceFormat = VkSurfaceFormatKHR{}
      let candidatePresentMode VkPresentModeKHR = VkConstants.VK_PRESENT_MODE_FIFO_KHR
      if candidateQualified {
        var deviceExtensionCount uint32 = 0u
        if TrackResult(diagnostics, 23uL, enumerateDeviceExtensions(physicalDevice, nil, &deviceExtensionCount, nil)) != VkConstants.VK_SUCCESS || deviceExtensionCount == 0u {
          candidateQualified = false
        } else {
          candidateDeviceExtensionCount = deviceExtensionCount
          let deviceExtensions * VkExtensionProperties = stackalloc[int32(deviceExtensionCount)]VkExtensionProperties
          if TrackResult(diagnostics, 24uL, enumerateDeviceExtensions(physicalDevice, nil, &deviceExtensionCount, deviceExtensions)) != VkConstants.VK_SUCCESS {
            candidateQualified = false
          } else {
            var hasSwapchainExtension = false
            var hasSwapchainMaintenanceExtension = false
            var hasMemoryBudgetExtension = false
            var extensionIndex uint32 = 0u
            while extensionIndex < deviceExtensionCount {
              if ExtensionNameEquals(&deviceExtensions[extensionIndex], VkConstants.VK_KHR_SWAPCHAIN_EXTENSION_NAME) {
                hasSwapchainExtension = true
              }
              if ExtensionNameEquals(&deviceExtensions[extensionIndex], VkConstants.VK_EXT_SWAPCHAIN_MAINTENANCE_1_EXTENSION_NAME) {
                hasSwapchainMaintenanceExtension = true
              }
              if ExtensionNameEquals(&deviceExtensions[extensionIndex], VkConstants.VK_EXT_MEMORY_BUDGET_EXTENSION_NAME) {
                hasMemoryBudgetExtension = true
              }
              extensionIndex++
            }
            candidateMemoryBudgetSupported = hasMemoryBudgetExtension
            candidateQualified = hasSwapchainExtension && hasSwapchainMaintenanceExtension
            if candidateQualified {
              var supportedFeatures2 = VkPhysicalDeviceFeatures2{}
              var supportedFeatures12 = VkPhysicalDeviceVulkan12Features{}
              var supportedFeatures13 = VkPhysicalDeviceVulkan13Features{}
              var supportedMaintenance = VkPhysicalDeviceSwapchainMaintenance1FeaturesEXT{}
              supportedFeatures2.sType = VkConstants.VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_FEATURES_2
              supportedFeatures2.pNext = *void(&supportedFeatures12)
              supportedFeatures12.sType = VkConstants.VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_VULKAN_1_2_FEATURES
              supportedFeatures12.pNext = *void(&supportedFeatures13)
              supportedFeatures13.sType = VkConstants.VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_VULKAN_1_3_FEATURES
              supportedFeatures13.pNext = *void(&supportedMaintenance)
              supportedMaintenance.sType = VkConstants.VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_SWAPCHAIN_MAINTENANCE_1_FEATURES_EXT
              getPhysicalDeviceFeatures2(physicalDevice, &supportedFeatures2)
              candidateQualified = supportedFeatures12.timelineSemaphore == VkConstants.VK_TRUE
                && supportedFeatures13.synchronization2 == VkConstants.VK_TRUE
                && supportedFeatures13.dynamicRendering == VkConstants.VK_TRUE
                && supportedMaintenance.swapchainMaintenance1 == VkConstants.VK_TRUE
            }
          }
        }
      }

      if candidateQualified {
        if TrackResult(diagnostics, 25uL, getSurfaceCapabilities(physicalDevice, surface, &candidateSurfaceCapabilities)) != VkConstants.VK_SUCCESS || (candidateSurfaceCapabilities.supportedUsageFlags & uint32(VkConstants.VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT)) == 0u {
          candidateQualified = false
        }
      }

      if candidateQualified {
        var surfaceFormatCount uint32 = 0u
        if TrackResult(diagnostics, 26uL, getSurfaceFormats(physicalDevice, surface, &surfaceFormatCount, nil)) != VkConstants.VK_SUCCESS || surfaceFormatCount == 0u {
          candidateQualified = false
        } else {
          let surfaceFormats * VkSurfaceFormatKHR = stackalloc[int32(surfaceFormatCount)]VkSurfaceFormatKHR
          if TrackResult(diagnostics, 27uL, getSurfaceFormats(physicalDevice, surface, &surfaceFormatCount, surfaceFormats)) != VkConstants.VK_SUCCESS {
            candidateQualified = false
          } else if !TrySelectSrgbSurfaceFormat(
            surfaceFormats,
            surfaceFormatCount,
            ref candidateSurfaceFormat) {
              candidateQualified = false
            }
          if candidateQualified {
            var candidateSurfaceFormatProperties = VkFormatProperties{}
            getPhysicalDeviceFormatProperties(
              physicalDevice,
              candidateSurfaceFormat.format,
              &candidateSurfaceFormatProperties)
            let requiredSurfaceFormatFeatures = uint32(VkConstants.VK_FORMAT_FEATURE_COLOR_ATTACHMENT_BIT)
            | uint32(VkConstants.VK_FORMAT_FEATURE_COLOR_ATTACHMENT_BLEND_BIT)
            candidateQualified = (candidateSurfaceFormatProperties.optimalTilingFeatures
              &requiredSurfaceFormatFeatures) == requiredSurfaceFormatFeatures
          }
        }
      }

      if candidateQualified {
        var presentModeCount uint32 = 0u
        if TrackResult(diagnostics, 28uL, getPresentModes(physicalDevice, surface, &presentModeCount, nil)) != VkConstants.VK_SUCCESS || presentModeCount == 0u {
          candidateQualified = false
        } else {
          let presentModes * VkPresentModeKHR = stackalloc[int32(presentModeCount)]VkPresentModeKHR
          if TrackResult(diagnostics, 29uL, getPresentModes(physicalDevice, surface, &presentModeCount, presentModes)) != VkConstants.VK_SUCCESS {
            candidateQualified = false
          } else {
            var hasFifoPresentMode = false
            var presentModeIndex uint32 = 0u
            while presentModeIndex < presentModeCount {
              if presentModes[presentModeIndex] == VkConstants.VK_PRESENT_MODE_FIFO_KHR {
                hasFifoPresentMode = true
              }
              presentModeIndex++
            }
            candidateQualified = hasFifoPresentMode
          }
        }
      }

      if candidateQualified {
        selectedPhysicalDevice = physicalDevice
        selectedQueueFamilyIndex = candidateQueueFamilyIndex
        selectedTimestampValidBits = candidateTimestampValidBits
        selectedSurfaceCapabilities = candidateSurfaceCapabilities
        selectedSurfaceFormat = candidateSurfaceFormat
        selectedPresentMode = candidatePresentMode
        selectedDeviceExtensionCount = candidateDeviceExtensionCount
        selectedSwapchainMaintenance = true
        selectedMemoryBudgetSupported = candidateMemoryBudgetSupported
      }
      physicalIndex++
    }
    if selectedPhysicalDevice == nint(0) {
      throw InvalidOperationException("No Vulkan physical device satisfies Vulkan 1.3, swapchain maintenance, sRGB surface blending, and R16G16B16A16_SINT uniform texel-buffer support")
    }
    if !selectedSwapchainMaintenance {
      throw InvalidOperationException("Vulkan swapchain maintenance is required for persistent presentation cleanup")
    }
    var selectedPhysicalDeviceProperties = VkPhysicalDeviceProperties{}
    getPhysicalDeviceProperties(selectedPhysicalDevice, &selectedPhysicalDeviceProperties)
    if let diagnostics = diagnostics {
      diagnostics.CaptureDeviceFacts(
        selectedPhysicalDeviceProperties.apiVersion,
        selectedPhysicalDeviceProperties.driverVersion,
        selectedPhysicalDeviceProperties.vendorID,
        selectedPhysicalDeviceProperties.deviceID,
        int32(selectedPhysicalDeviceProperties.deviceType),
        &selectedPhysicalDeviceProperties.deviceName[0],
        1u,
        1u,
        1u)
      diagnostics.CaptureDeviceExtensionCount(selectedDeviceExtensionCount)
    }
    if readbackRequested {
      let getMemoryPropertiesAddress = LoadGlobalProc(getProcAddress, instance, "vkGetPhysicalDeviceMemoryProperties")
      let getMemoryPropertiesNullable = getMemoryPropertiesAddress as (unmanaged[Cdecl](VkPhysicalDevice, *VkPhysicalDeviceMemoryProperties) -> void)?
      if getMemoryPropertiesNullable == nil {
        throw InvalidOperationException("vkGetPhysicalDeviceMemoryProperties is unavailable")
      }
      instanceDispatch.vkGetPhysicalDeviceMemoryProperties = getMemoryPropertiesNullable
      if selectedMemoryBudgetSupported {
        let getMemoryProperties2Address = LoadGlobalProc(getProcAddress, instance, "vkGetPhysicalDeviceMemoryProperties2")
        let getMemoryProperties2Nullable = getMemoryProperties2Address as (unmanaged[Cdecl](VkPhysicalDevice, *VkPhysicalDeviceMemoryProperties2) -> void)?
        if getMemoryProperties2Nullable == nil {
          throw InvalidOperationException("vkGetPhysicalDeviceMemoryProperties2 is unavailable")
        }
        instanceDispatch.vkGetPhysicalDeviceMemoryProperties2 = getMemoryProperties2Nullable
      }
      let readbackFormat = VkConstants.VK_FORMAT_R8G8B8A8_UNORM
      var readbackFormatProperties = VkFormatProperties{}
      getPhysicalDeviceFormatProperties(selectedPhysicalDevice, readbackFormat, &readbackFormatProperties)
      let requiredReadbackFeatures = uint32(VkConstants.VK_FORMAT_FEATURE_COLOR_ATTACHMENT_BIT)
      | uint32(VkConstants.VK_FORMAT_FEATURE_TRANSFER_SRC_BIT)
      if (readbackFormatProperties.optimalTilingFeatures & requiredReadbackFeatures) != requiredReadbackFeatures {
        throw InvalidOperationException("Vulkan offscreen target format lacks color attachment or transfer source support")
      }
      let getMemoryProperties = instanceDispatch.vkGetPhysicalDeviceMemoryProperties
      getMemoryProperties(selectedPhysicalDevice, &readbackMemoryProperties)
    }

    var swapchainExtent = selectedSurfaceCapabilities.currentExtent
    if swapchainExtent.width == uint32.MaxValue {
      swapchainExtent.width = 640u
      if swapchainExtent.width < selectedSurfaceCapabilities.minImageExtent.width {
        swapchainExtent.width = selectedSurfaceCapabilities.minImageExtent.width
      } else if swapchainExtent.width > selectedSurfaceCapabilities.maxImageExtent.width {
        swapchainExtent.width = selectedSurfaceCapabilities.maxImageExtent.width
      }
      swapchainExtent.height = 480u
      if swapchainExtent.height < selectedSurfaceCapabilities.minImageExtent.height {
        swapchainExtent.height = selectedSurfaceCapabilities.minImageExtent.height
      } else if swapchainExtent.height > selectedSurfaceCapabilities.maxImageExtent.height {
        swapchainExtent.height = selectedSurfaceCapabilities.maxImageExtent.height
      }
    }
    if lifecycleRequested {
      swapchainExtent = ResolveLifecycleExtent(lifecycle!!, selectedSurfaceCapabilities)
    }
    var compositeAlpha VkCompositeAlphaFlagBitsKHR = VkConstants.VK_COMPOSITE_ALPHA_OPAQUE_BIT_KHR
    var hasCompositeAlpha = false
    if (selectedSurfaceCapabilities.supportedCompositeAlpha & uint32(VkConstants.VK_COMPOSITE_ALPHA_OPAQUE_BIT_KHR)) != 0u {
      hasCompositeAlpha = true
    } else if (selectedSurfaceCapabilities.supportedCompositeAlpha & uint32(VkConstants.VK_COMPOSITE_ALPHA_PRE_MULTIPLIED_BIT_KHR)) != 0u {
      compositeAlpha = VkConstants.VK_COMPOSITE_ALPHA_PRE_MULTIPLIED_BIT_KHR
      hasCompositeAlpha = true
    } else if (selectedSurfaceCapabilities.supportedCompositeAlpha & uint32(VkConstants.VK_COMPOSITE_ALPHA_POST_MULTIPLIED_BIT_KHR)) != 0u {
      compositeAlpha = VkConstants.VK_COMPOSITE_ALPHA_POST_MULTIPLIED_BIT_KHR
      hasCompositeAlpha = true
    } else if (selectedSurfaceCapabilities.supportedCompositeAlpha & uint32(VkConstants.VK_COMPOSITE_ALPHA_INHERIT_BIT_KHR)) != 0u {
      compositeAlpha = VkConstants.VK_COMPOSITE_ALPHA_INHERIT_BIT_KHR
      hasCompositeAlpha = true
    }
    if !hasCompositeAlpha {
      throw InvalidOperationException("No supported swapchain composite alpha mode is available")
    }

    var enabledFeatures2 = VkPhysicalDeviceFeatures2{}
    var enabledFeatures12 = VkPhysicalDeviceVulkan12Features{}
    var enabledFeatures13 = VkPhysicalDeviceVulkan13Features{}
    var enabledSwapchainMaintenance = VkPhysicalDeviceSwapchainMaintenance1FeaturesEXT{}
    enabledFeatures2.sType = VkConstants.VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_FEATURES_2
    enabledFeatures2.pNext = *void(&enabledFeatures12)
    enabledFeatures12.sType = VkConstants.VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_VULKAN_1_2_FEATURES
    enabledFeatures12.pNext = *void(&enabledFeatures13)
    enabledFeatures12.timelineSemaphore = VkConstants.VK_TRUE
    enabledFeatures13.sType = VkConstants.VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_VULKAN_1_3_FEATURES
    enabledFeatures13.pNext = *void(&enabledSwapchainMaintenance)
    enabledFeatures13.synchronization2 = VkConstants.VK_TRUE
    enabledFeatures13.dynamicRendering = VkConstants.VK_TRUE
    enabledSwapchainMaintenance.sType = VkConstants.VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_SWAPCHAIN_MAINTENANCE_1_FEATURES_EXT
    enabledSwapchainMaintenance.swapchainMaintenance1 = VkConstants.VK_TRUE

    let priorities * float32 = stackalloc[1]float32{1.0F}
    var queueCreateInfo = VkDeviceQueueCreateInfo{}
    queueCreateInfo.sType = VkConstants.VK_STRUCTURE_TYPE_DEVICE_QUEUE_CREATE_INFO
    queueCreateInfo.queueFamilyIndex = selectedQueueFamilyIndex
    queueCreateInfo.queueCount = 1u
    queueCreateInfo.pQueuePriorities = priorities

    swapchainExtensionStorage = Marshal.StringToCoTaskMemUTF8(VkConstants.VK_KHR_SWAPCHAIN_EXTENSION_NAME)
    let swapchainExtensionName = *int8(swapchainExtensionStorage)
    maintenanceExtensionStorage = Marshal.StringToCoTaskMemUTF8(VkConstants.VK_EXT_SWAPCHAIN_MAINTENANCE_1_EXTENSION_NAME)
    let maintenanceExtensionName = *int8(maintenanceExtensionStorage)
    if let diagnostics = diagnostics {
      diagnostics.CaptureExtension(2u, swapchainExtensionName)
      diagnostics.CaptureExtension(2u, maintenanceExtensionName)
    }
    let deviceExtensionPointers * VulkanExtensionNamePointer = stackalloc[3]VulkanExtensionNamePointer
    deviceExtensionPointers[0].value = swapchainExtensionName
    deviceExtensionPointers[1].value = maintenanceExtensionName
    var deviceExtensionCount uint32 = 2u
    if selectedMemoryBudgetSupported {
      memoryBudgetExtensionStorage = Marshal.StringToCoTaskMemUTF8(VkConstants.VK_EXT_MEMORY_BUDGET_EXTENSION_NAME)
      deviceExtensionPointers[2].value = *int8(memoryBudgetExtensionStorage)
      deviceExtensionCount = 3u
    }

    var deviceCreateInfo = VkDeviceCreateInfo{}
    deviceCreateInfo.sType = VkConstants.VK_STRUCTURE_TYPE_DEVICE_CREATE_INFO
    deviceCreateInfo.pNext = *void(&enabledFeatures2)
    deviceCreateInfo.queueCreateInfoCount = 1u
    deviceCreateInfo.pQueueCreateInfos = &queueCreateInfo
    deviceCreateInfo.enabledExtensionCount = deviceExtensionCount
    deviceCreateInfo.ppEnabledExtensionNames = &deviceExtensionPointers[0].value
    let createDevice = instanceDispatch.vkCreateDevice
    if TrackResult(diagnostics, 30uL, createDevice(selectedPhysicalDevice, &deviceCreateInfo, nil, &device)) != VkConstants.VK_SUCCESS || device == nint(0) {
      throw InvalidOperationException("vkCreateDevice failed")
    }
    deviceCreated = true

    let getDeviceProcAddress = instanceDispatch.vkGetDeviceProcAddr
    let destroyDeviceAddressLoaded = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkDestroyDevice")
    destroyDeviceAddress = destroyDeviceAddressLoaded
    let destroyDeviceNullable = destroyDeviceAddressLoaded as (unmanaged[Cdecl](VkDevice, *VkAllocationCallbacks) -> void)?
    if destroyDeviceNullable == nil {
      throw InvalidOperationException("vkDestroyDevice is unavailable")
    }
    deviceDispatch.vkDestroyDevice = destroyDeviceNullable
    let getDeviceQueueAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkGetDeviceQueue")
    let getDeviceQueueNullable = getDeviceQueueAddress as (unmanaged[Cdecl](VkDevice, uint32, uint32, *VkQueue) -> void)?
    if getDeviceQueueNullable == nil { throw InvalidOperationException("vkGetDeviceQueue is unavailable") }
    deviceDispatch.vkGetDeviceQueue = getDeviceQueueNullable
    let createSwapchainAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkCreateSwapchainKHR")
    let createSwapchainNullable = createSwapchainAddress as (unmanaged[Cdecl](VkDevice, *VkSwapchainCreateInfoKHR, *VkAllocationCallbacks, *VkSwapchainKHR) -> VkResult)?
    if createSwapchainNullable == nil { throw InvalidOperationException("vkCreateSwapchainKHR is unavailable") }
    deviceDispatch.vkCreateSwapchainKHR = createSwapchainNullable
    let destroySwapchainAddressLoaded = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkDestroySwapchainKHR")
    let destroySwapchainNullable = destroySwapchainAddressLoaded as (unmanaged[Cdecl](VkDevice, VkSwapchainKHR, *VkAllocationCallbacks) -> void)?
    if destroySwapchainNullable == nil { throw InvalidOperationException("vkDestroySwapchainKHR is unavailable") }
    deviceDispatch.vkDestroySwapchainKHR = destroySwapchainNullable
    let getSwapchainImagesAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkGetSwapchainImagesKHR")
    let getSwapchainImagesNullable = getSwapchainImagesAddress as (unmanaged[Cdecl](VkDevice, VkSwapchainKHR, *uint32, *VkImage) -> VkResult)?
    if getSwapchainImagesNullable == nil { throw InvalidOperationException("vkGetSwapchainImagesKHR is unavailable") }
    deviceDispatch.vkGetSwapchainImagesKHR = getSwapchainImagesNullable
    let createCommandPoolAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkCreateCommandPool")
    let createCommandPoolNullable = createCommandPoolAddress as (unmanaged[Cdecl](VkDevice, *VkCommandPoolCreateInfo, *VkAllocationCallbacks, *VkCommandPool) -> VkResult)?
    if createCommandPoolNullable == nil { throw InvalidOperationException("vkCreateCommandPool is unavailable") }
    deviceDispatch.vkCreateCommandPool = createCommandPoolNullable
    let destroyCommandPoolAddressLoaded = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkDestroyCommandPool")
    destroyCommandPoolAddress = destroyCommandPoolAddressLoaded
    let destroyCommandPoolNullable = destroyCommandPoolAddressLoaded as (unmanaged[Cdecl](VkDevice, VkCommandPool, *VkAllocationCallbacks) -> void)?
    if destroyCommandPoolNullable == nil { throw InvalidOperationException("vkDestroyCommandPool is unavailable") }
    deviceDispatch.vkDestroyCommandPool = destroyCommandPoolNullable
    let allocateCommandBuffersAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkAllocateCommandBuffers")
    let allocateCommandBuffersNullable = allocateCommandBuffersAddress as (unmanaged[Cdecl](VkDevice, *VkCommandBufferAllocateInfo, *VkCommandBuffer) -> VkResult)?
    if allocateCommandBuffersNullable == nil { throw InvalidOperationException("vkAllocateCommandBuffers is unavailable") }
    deviceDispatch.vkAllocateCommandBuffers = allocateCommandBuffersNullable
    let createSemaphoreAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkCreateSemaphore")
    let createSemaphoreNullable = createSemaphoreAddress as (unmanaged[Cdecl](VkDevice, *VkSemaphoreCreateInfo, *VkAllocationCallbacks, *VkSemaphore) -> VkResult)?
    if createSemaphoreNullable == nil { throw InvalidOperationException("vkCreateSemaphore is unavailable") }
    deviceDispatch.vkCreateSemaphore = createSemaphoreNullable
    let destroySemaphoreAddressLoaded = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkDestroySemaphore")
    let destroySemaphoreNullable = destroySemaphoreAddressLoaded as (unmanaged[Cdecl](VkDevice, VkSemaphore, *VkAllocationCallbacks) -> void)?
    if destroySemaphoreNullable == nil { throw InvalidOperationException("vkDestroySemaphore is unavailable") }
    deviceDispatch.vkDestroySemaphore = destroySemaphoreNullable
    let createFenceAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkCreateFence")
    let createFenceNullable = createFenceAddress as (unmanaged[Cdecl](VkDevice, *VkFenceCreateInfo, *VkAllocationCallbacks, *VkFence) -> VkResult)?
    if createFenceNullable == nil { throw InvalidOperationException("vkCreateFence is unavailable") }
    deviceDispatch.vkCreateFence = createFenceNullable
    let destroyFenceAddressLoaded = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkDestroyFence")
    let destroyFenceNullable = destroyFenceAddressLoaded as (unmanaged[Cdecl](VkDevice, VkFence, *VkAllocationCallbacks) -> void)?
    if destroyFenceNullable == nil { throw InvalidOperationException("vkDestroyFence is unavailable") }
    deviceDispatch.vkDestroyFence = destroyFenceNullable
    let waitForFencesAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkWaitForFences")
    let waitForFencesNullable = waitForFencesAddress as (unmanaged[Cdecl](VkDevice, uint32, *VkFence, VkBool32, uint64) -> VkResult)?
    if waitForFencesNullable == nil { throw InvalidOperationException("vkWaitForFences is unavailable") }
    deviceDispatch.vkWaitForFences = waitForFencesNullable
    let acquireNextImageAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkAcquireNextImageKHR")
    let acquireNextImageNullable = acquireNextImageAddress as (unmanaged[Cdecl](VkDevice, VkSwapchainKHR, uint64, VkSemaphore, VkFence, *uint32) -> VkResult)?
    if acquireNextImageNullable == nil { throw InvalidOperationException("vkAcquireNextImageKHR is unavailable") }
    deviceDispatch.vkAcquireNextImageKHR = acquireNextImageNullable
    let beginCommandBufferAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkBeginCommandBuffer")
    let beginCommandBufferNullable = beginCommandBufferAddress as (unmanaged[Cdecl](VkCommandBuffer, *VkCommandBufferBeginInfo) -> VkResult)?
    if beginCommandBufferNullable == nil { throw InvalidOperationException("vkBeginCommandBuffer is unavailable") }
    deviceDispatch.vkBeginCommandBuffer = beginCommandBufferNullable
    let endCommandBufferAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkEndCommandBuffer")
    let endCommandBufferNullable = endCommandBufferAddress as (unmanaged[Cdecl](VkCommandBuffer) -> VkResult)?
    if endCommandBufferNullable == nil { throw InvalidOperationException("vkEndCommandBuffer is unavailable") }
    deviceDispatch.vkEndCommandBuffer = endCommandBufferNullable
    let pipelineBarrierAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkCmdPipelineBarrier2")
    let pipelineBarrierNullable = pipelineBarrierAddress as (unmanaged[Cdecl](VkCommandBuffer, *VkDependencyInfo) -> void)?
    if pipelineBarrierNullable == nil { throw InvalidOperationException("vkCmdPipelineBarrier2 is unavailable") }
    deviceDispatch.vkCmdPipelineBarrier2 = pipelineBarrierNullable
    let queueSubmitAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkQueueSubmit2")
    let queueSubmitNullable = queueSubmitAddress as (unmanaged[Cdecl](VkQueue, uint32, *VkSubmitInfo2, VkFence) -> VkResult)?
    if queueSubmitNullable == nil { throw InvalidOperationException("vkQueueSubmit2 is unavailable") }
    deviceDispatch.vkQueueSubmit2 = queueSubmitNullable
    let queuePresentAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkQueuePresentKHR")
    let queuePresentNullable = queuePresentAddress as (unmanaged[Cdecl](VkQueue, *VkPresentInfoKHR) -> VkResult)?
    if queuePresentNullable == nil { throw InvalidOperationException("vkQueuePresentKHR is unavailable") }
    deviceDispatch.vkQueuePresentKHR = queuePresentNullable
    let createImageViewAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkCreateImageView")
    let createImageViewNullable = createImageViewAddress as (unmanaged[Cdecl](VkDevice, *VkImageViewCreateInfo, *VkAllocationCallbacks, *VkImageView) -> VkResult)?
    if createImageViewNullable == nil { throw InvalidOperationException("vkCreateImageView is unavailable") }
    deviceDispatch.vkCreateImageView = createImageViewNullable
    let destroyImageViewAddressLoaded = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkDestroyImageView")
    let destroyImageViewNullable = destroyImageViewAddressLoaded as (unmanaged[Cdecl](VkDevice, VkImageView, *VkAllocationCallbacks) -> void)?
    if destroyImageViewNullable == nil { throw InvalidOperationException("vkDestroyImageView is unavailable") }
    deviceDispatch.vkDestroyImageView = destroyImageViewNullable
    let createShaderModuleAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkCreateShaderModule")
    let createShaderModuleNullable = createShaderModuleAddress as (unmanaged[Cdecl](VkDevice, *VkShaderModuleCreateInfo, *VkAllocationCallbacks, *VkShaderModule) -> VkResult)?
    if createShaderModuleNullable == nil { throw InvalidOperationException("vkCreateShaderModule is unavailable") }
    deviceDispatch.vkCreateShaderModule = createShaderModuleNullable
    let destroyShaderModuleAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkDestroyShaderModule")
    let destroyShaderModuleNullable = destroyShaderModuleAddress as (unmanaged[Cdecl](VkDevice, VkShaderModule, *VkAllocationCallbacks) -> void)?
    if destroyShaderModuleNullable == nil { throw InvalidOperationException("vkDestroyShaderModule is unavailable") }
    deviceDispatch.vkDestroyShaderModule = destroyShaderModuleNullable
    let createPipelineLayoutAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkCreatePipelineLayout")
    let createPipelineLayoutNullable = createPipelineLayoutAddress as (unmanaged[Cdecl](VkDevice, *VkPipelineLayoutCreateInfo, *VkAllocationCallbacks, *VkPipelineLayout) -> VkResult)?
    if createPipelineLayoutNullable == nil { throw InvalidOperationException("vkCreatePipelineLayout is unavailable") }
    deviceDispatch.vkCreatePipelineLayout = createPipelineLayoutNullable
    let destroyPipelineLayoutAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkDestroyPipelineLayout")
    let destroyPipelineLayoutNullable = destroyPipelineLayoutAddress as (unmanaged[Cdecl](VkDevice, VkPipelineLayout, *VkAllocationCallbacks) -> void)?
    if destroyPipelineLayoutNullable == nil { throw InvalidOperationException("vkDestroyPipelineLayout is unavailable") }
    deviceDispatch.vkDestroyPipelineLayout = destroyPipelineLayoutNullable
    let createGraphicsPipelinesAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkCreateGraphicsPipelines")
    let createGraphicsPipelinesNullable = createGraphicsPipelinesAddress as (unmanaged[Cdecl](VkDevice, VkPipelineCache, uint32, *VkGraphicsPipelineCreateInfo, *VkAllocationCallbacks, *VkPipeline) -> VkResult)?
    if createGraphicsPipelinesNullable == nil { throw InvalidOperationException("vkCreateGraphicsPipelines is unavailable") }
    deviceDispatch.vkCreateGraphicsPipelines = createGraphicsPipelinesNullable
    let destroyPipelineAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkDestroyPipeline")
    let destroyPipelineNullable = destroyPipelineAddress as (unmanaged[Cdecl](VkDevice, VkPipeline, *VkAllocationCallbacks) -> void)?
    if destroyPipelineNullable == nil { throw InvalidOperationException("vkDestroyPipeline is unavailable") }
    deviceDispatch.vkDestroyPipeline = destroyPipelineNullable
    let beginRenderingAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkCmdBeginRendering")
    let beginRenderingNullable = beginRenderingAddress as (unmanaged[Cdecl](VkCommandBuffer, *VkRenderingInfo) -> void)?
    if beginRenderingNullable == nil { throw InvalidOperationException("vkCmdBeginRendering is unavailable") }
    deviceDispatch.vkCmdBeginRendering = beginRenderingNullable
    let endRenderingAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkCmdEndRendering")
    let endRenderingNullable = endRenderingAddress as (unmanaged[Cdecl](VkCommandBuffer) -> void)?
    if endRenderingNullable == nil { throw InvalidOperationException("vkCmdEndRendering is unavailable") }
    deviceDispatch.vkCmdEndRendering = endRenderingNullable
    let bindPipelineAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkCmdBindPipeline")
    let bindPipelineNullable = bindPipelineAddress as (unmanaged[Cdecl](VkCommandBuffer, VkPipelineBindPoint, VkPipeline) -> void)?
    if bindPipelineNullable == nil { throw InvalidOperationException("vkCmdBindPipeline is unavailable") }
    deviceDispatch.vkCmdBindPipeline = bindPipelineNullable
    let pushConstantsAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkCmdPushConstants")
    let pushConstantsNullable = pushConstantsAddress as (unmanaged[Cdecl](VkCommandBuffer, VkPipelineLayout, VkShaderStageFlags, uint32, uint32, *void) -> void)?
    if pushConstantsNullable == nil { throw InvalidOperationException("vkCmdPushConstants is unavailable") }
    deviceDispatch.vkCmdPushConstants = pushConstantsNullable
    let drawAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkCmdDraw")
    let drawNullable = drawAddress as (unmanaged[Cdecl](VkCommandBuffer, uint32, uint32, uint32, uint32) -> void)?
    if drawNullable == nil { throw InvalidOperationException("vkCmdDraw is unavailable") }
    deviceDispatch.vkCmdDraw = drawNullable
    let setViewportAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkCmdSetViewport")
    let setViewportNullable = setViewportAddress as (unmanaged[Cdecl](VkCommandBuffer, uint32, uint32, *VkViewport) -> void)?
    if setViewportNullable == nil { throw InvalidOperationException("vkCmdSetViewport is unavailable") }
    deviceDispatch.vkCmdSetViewport = setViewportNullable
    let setScissorAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkCmdSetScissor")
    let setScissorNullable = setScissorAddress as (unmanaged[Cdecl](VkCommandBuffer, uint32, uint32, *VkRect2D) -> void)?
    if setScissorNullable == nil { throw InvalidOperationException("vkCmdSetScissor is unavailable") }
    deviceDispatch.vkCmdSetScissor = setScissorNullable
    resetCommandBufferAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkResetCommandBuffer")
    let resetCommandBufferNullable = resetCommandBufferAddress as (unmanaged[Cdecl](VkCommandBuffer, VkCommandBufferResetFlags) -> VkResult)?
    if resetCommandBufferNullable == nil { throw InvalidOperationException("vkResetCommandBuffer is unavailable") }
    deviceDispatch.vkResetCommandBuffer = resetCommandBufferNullable
    let getFenceStatusAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkGetFenceStatus")
    let getFenceStatusNullable = getFenceStatusAddress as (unmanaged[Cdecl](VkDevice, VkFence) -> VkResult)?
    if getFenceStatusNullable == nil { throw InvalidOperationException("vkGetFenceStatus is unavailable") }
    deviceDispatch.vkGetFenceStatus = getFenceStatusNullable
    let resetFencesAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkResetFences")
    let resetFencesNullable = resetFencesAddress as (unmanaged[Cdecl](VkDevice, uint32, *VkFence) -> VkResult)?
    if resetFencesNullable == nil { throw InvalidOperationException("vkResetFences is unavailable") }
    deviceDispatch.vkResetFences = resetFencesNullable
    if readbackRequested {
      let copyImageToBufferAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkCmdCopyImageToBuffer")
      if copyImageToBufferAddress == nint(0) { throw InvalidOperationException("vkCmdCopyImageToBuffer is unavailable") }
      readbackDispatch = VulkanReadbackDispatch(copyImageToBufferAddress)
      let createImageAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkCreateImage")
      let createImageNullable = createImageAddress as (unmanaged[Cdecl](VkDevice, *VkImageCreateInfo, *VkAllocationCallbacks, *VkImage) -> VkResult)?
      if createImageNullable == nil { throw InvalidOperationException("vkCreateImage is unavailable") }
      deviceDispatch.vkCreateImage = createImageNullable
      let destroyImageAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkDestroyImage")
      let destroyImageNullable = destroyImageAddress as (unmanaged[Cdecl](VkDevice, VkImage, *VkAllocationCallbacks) -> void)?
      if destroyImageNullable == nil { throw InvalidOperationException("vkDestroyImage is unavailable") }
      deviceDispatch.vkDestroyImage = destroyImageNullable
      let getImageMemoryRequirements2Address = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkGetImageMemoryRequirements2")
      let getImageMemoryRequirements2Nullable = getImageMemoryRequirements2Address as (unmanaged[Cdecl](VkDevice, *VkImageMemoryRequirementsInfo2, *VkMemoryRequirements2) -> void)?
      if getImageMemoryRequirements2Nullable == nil { throw InvalidOperationException("vkGetImageMemoryRequirements2 is unavailable") }
      deviceDispatch.vkGetImageMemoryRequirements2 = getImageMemoryRequirements2Nullable
      let allocateMemoryAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkAllocateMemory")
      let allocateMemoryNullable = allocateMemoryAddress as (unmanaged[Cdecl](VkDevice, *VkMemoryAllocateInfo, *VkAllocationCallbacks, *VkDeviceMemory) -> VkResult)?
      if allocateMemoryNullable == nil { throw InvalidOperationException("vkAllocateMemory is unavailable") }
      deviceDispatch.vkAllocateMemory = allocateMemoryNullable
      let freeMemoryAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkFreeMemory")
      let freeMemoryNullable = freeMemoryAddress as (unmanaged[Cdecl](VkDevice, VkDeviceMemory, *VkAllocationCallbacks) -> void)?
      if freeMemoryNullable == nil { throw InvalidOperationException("vkFreeMemory is unavailable") }
      deviceDispatch.vkFreeMemory = freeMemoryNullable
      let bindImageMemory2Address = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkBindImageMemory2")
      let bindImageMemory2Nullable = bindImageMemory2Address as (unmanaged[Cdecl](VkDevice, uint32, *VkBindImageMemoryInfo) -> VkResult)?
      if bindImageMemory2Nullable == nil { throw InvalidOperationException("vkBindImageMemory2 is unavailable") }
      deviceDispatch.vkBindImageMemory2 = bindImageMemory2Nullable
      let createBufferAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkCreateBuffer")
      let createBufferNullable = createBufferAddress as (unmanaged[Cdecl](VkDevice, *VkBufferCreateInfo, *VkAllocationCallbacks, *VkBuffer) -> VkResult)?
      if createBufferNullable == nil { throw InvalidOperationException("vkCreateBuffer is unavailable") }
      deviceDispatch.vkCreateBuffer = createBufferNullable
      let destroyBufferAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkDestroyBuffer")
      let destroyBufferNullable = destroyBufferAddress as (unmanaged[Cdecl](VkDevice, VkBuffer, *VkAllocationCallbacks) -> void)?
      if destroyBufferNullable == nil { throw InvalidOperationException("vkDestroyBuffer is unavailable") }
      deviceDispatch.vkDestroyBuffer = destroyBufferNullable
      let getBufferMemoryRequirements2Address = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkGetBufferMemoryRequirements2")
      let getBufferMemoryRequirements2Nullable = getBufferMemoryRequirements2Address as (unmanaged[Cdecl](VkDevice, *VkBufferMemoryRequirementsInfo2, *VkMemoryRequirements2) -> void)?
      if getBufferMemoryRequirements2Nullable == nil { throw InvalidOperationException("vkGetBufferMemoryRequirements2 is unavailable") }
      deviceDispatch.vkGetBufferMemoryRequirements2 = getBufferMemoryRequirements2Nullable
      let bindBufferMemory2Address = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkBindBufferMemory2")
      let bindBufferMemory2Nullable = bindBufferMemory2Address as (unmanaged[Cdecl](VkDevice, uint32, *VkBindBufferMemoryInfo) -> VkResult)?
      if bindBufferMemory2Nullable == nil { throw InvalidOperationException("vkBindBufferMemory2 is unavailable") }
      deviceDispatch.vkBindBufferMemory2 = bindBufferMemory2Nullable
      let mapMemoryAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkMapMemory")
      let mapMemoryNullable = mapMemoryAddress as (unmanaged[Cdecl](VkDevice, VkDeviceMemory, VkDeviceSize, VkDeviceSize, VkMemoryMapFlags, *void) -> VkResult)?
      if mapMemoryNullable == nil { throw InvalidOperationException("vkMapMemory is unavailable") }
      deviceDispatch.vkMapMemory = mapMemoryNullable
      let unmapMemoryAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkUnmapMemory")
      let unmapMemoryNullable = unmapMemoryAddress as (unmanaged[Cdecl](VkDevice, VkDeviceMemory) -> void)?
      if unmapMemoryNullable == nil { throw InvalidOperationException("vkUnmapMemory is unavailable") }
      deviceDispatch.vkUnmapMemory = unmapMemoryNullable
      let invalidateMappedMemoryRangesAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkInvalidateMappedMemoryRanges")
      let invalidateMappedMemoryRangesNullable = invalidateMappedMemoryRangesAddress as (unmanaged[Cdecl](VkDevice, uint32, *VkMappedMemoryRange) -> VkResult)?
      if invalidateMappedMemoryRangesNullable == nil { throw InvalidOperationException("vkInvalidateMappedMemoryRanges is unavailable") }
      deviceDispatch.vkInvalidateMappedMemoryRanges = invalidateMappedMemoryRangesNullable
    }

    if diagnostics != nil && selectedTimestampValidBits != 0u {
      let createQueryPoolAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkCreateQueryPool")
      let createQueryPoolNullable = createQueryPoolAddress as (unmanaged[Cdecl](VkDevice, *VkQueryPoolCreateInfo, *VkAllocationCallbacks, *VkQueryPool) -> VkResult)?
      if createQueryPoolNullable == nil { throw InvalidOperationException("vkCreateQueryPool is unavailable") }
      deviceDispatch.vkCreateQueryPool = createQueryPoolNullable
      let destroyQueryPoolAddressLoaded = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkDestroyQueryPool")
      destroyQueryPoolAddress = destroyQueryPoolAddressLoaded
      let destroyQueryPoolNullable = destroyQueryPoolAddressLoaded as (unmanaged[Cdecl](VkDevice, VkQueryPool, *VkAllocationCallbacks) -> void)?
      if destroyQueryPoolNullable == nil { throw InvalidOperationException("vkDestroyQueryPool is unavailable") }
      deviceDispatch.vkDestroyQueryPool = destroyQueryPoolNullable
      let getQueryPoolResultsAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkGetQueryPoolResults")
      let getQueryPoolResultsNullable = getQueryPoolResultsAddress as (unmanaged[Cdecl](VkDevice, VkQueryPool, uint32, uint32, nuint, *void, VkDeviceSize, VkQueryResultFlags) -> VkResult)?
      if getQueryPoolResultsNullable == nil { throw InvalidOperationException("vkGetQueryPoolResults is unavailable") }
      deviceDispatch.vkGetQueryPoolResults = getQueryPoolResultsNullable
      let resetQueryPoolAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkCmdResetQueryPool")
      let resetQueryPoolNullable = resetQueryPoolAddress as (unmanaged[Cdecl](VkCommandBuffer, VkQueryPool, uint32, uint32) -> void)?
      if resetQueryPoolNullable == nil { throw InvalidOperationException("vkCmdResetQueryPool is unavailable") }
      deviceDispatch.vkCmdResetQueryPool = resetQueryPoolNullable
      let writeTimestampAddress = LoadDeviceProc(getDeviceProcAddressAddress, device, "vkCmdWriteTimestamp2")
      let writeTimestampNullable = writeTimestampAddress as (unmanaged[Cdecl](VkCommandBuffer, VkPipelineStageFlags2, VkQueryPool, uint32) -> void)?
      if writeTimestampNullable == nil { throw InvalidOperationException("vkCmdWriteTimestamp2 is unavailable") }
      deviceDispatch.vkCmdWriteTimestamp2 = writeTimestampNullable
      var queryPoolCreateInfo = VkQueryPoolCreateInfo{}
      queryPoolCreateInfo.sType = VkConstants.VK_STRUCTURE_TYPE_QUERY_POOL_CREATE_INFO
      queryPoolCreateInfo.queryType = VkConstants.VK_QUERY_TYPE_TIMESTAMP
      queryPoolCreateInfo.queryCount = 2u
      let createQueryPool = deviceDispatch.vkCreateQueryPool
      let queryPoolResult = createQueryPool(device, &queryPoolCreateInfo, nil, &queryPool)
      if TrackResult(diagnostics, 2uL, queryPoolResult) != VkConstants.VK_SUCCESS {
        throw InvalidOperationException("vkCreateQueryPool failed")
      }
      queryPoolCreated = true
    }

    let getDeviceQueue = deviceDispatch.vkGetDeviceQueue
    getDeviceQueue(device, selectedQueueFamilyIndex, 0u, &queue)
    if queue == nint(0) { throw InvalidOperationException("Vulkan queue acquisition failed") }

    var generationValue = VulkanSwapchainGeneration(
      device,
      deviceDispatch,
      surface,
      selectedSurfaceCapabilities,
      selectedSurfaceFormat,
      selectedPresentMode,
      swapchainExtent,
      compositeAlpha,
      uint64(0),
      generation)
    swapchainGeneration = generationValue
    swapchain = generationValue.Handle
    swapchainCreated = true
    swapchainImageCount = generationValue.ImageCount
    if let diagnostics = diagnostics {
      diagnostics.CaptureWsiFacts(uint64(window), surface, swapchain, frameIndex, generation)
    }
    solidQuad = VulkanSolidQuad(device, deviceDispatch, generationValue.Format)

    var commandPoolCreateInfo = VkCommandPoolCreateInfo{}
    commandPoolCreateInfo.sType = VkConstants.VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO
    commandPoolCreateInfo.flags = uint32(VkConstants.VK_COMMAND_POOL_CREATE_TRANSIENT_BIT)
    | uint32(VkConstants.VK_COMMAND_POOL_CREATE_RESET_COMMAND_BUFFER_BIT)
    commandPoolCreateInfo.queueFamilyIndex = selectedQueueFamilyIndex
    let createCommandPool = deviceDispatch.vkCreateCommandPool
    if TrackResult(diagnostics, 34uL, createCommandPool(device, &commandPoolCreateInfo, nil, &commandPool)) != VkConstants.VK_SUCCESS {
      throw InvalidOperationException("vkCreateCommandPool failed")
    }
    commandPoolCreated = true

    let commandBufferCount uint32 = if readbackRequested {
      3u
    } else {
      2u
    }
    let commandBufferStorage * VkCommandBuffer = stackalloc[int32(commandBufferCount)]VkCommandBuffer
    var commandBufferAllocateInfo = VkCommandBufferAllocateInfo{}
    commandBufferAllocateInfo.sType = VkConstants.VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO
    commandBufferAllocateInfo.commandPool = commandPool
    commandBufferAllocateInfo.level = VkConstants.VK_COMMAND_BUFFER_LEVEL_PRIMARY
    commandBufferAllocateInfo.commandBufferCount = commandBufferCount
    let allocateCommandBuffers = deviceDispatch.vkAllocateCommandBuffers
    if TrackResult(diagnostics, 35uL, allocateCommandBuffers(device, &commandBufferAllocateInfo, commandBufferStorage)) != VkConstants.VK_SUCCESS {
      throw InvalidOperationException("vkAllocateCommandBuffers failed")
    }
    allocatedCommandBufferCount = commandBufferCount
    if readbackRequested {
      offscreenCommandBuffer = commandBufferStorage[2]
    }
    frameSlot0 = VulkanFrameSlot(device, deviceDispatch, commandBufferStorage[0])
    frameSlot1 = VulkanFrameSlot(device, deviceDispatch, commandBufferStorage[1])
    presentationRetirement = VulkanPresentationRetirement(16u, 4u)

    var clearColor = VkClearColorValue{}
    clearColor.float32.values[0] = 0.03F
    clearColor.float32.values[1] = 0.04F
    clearColor.float32.values[2] = 0.08F
    clearColor.float32.values[3] = 1.0F
    var pushConstants = SolidQuadPushConstants{}
    pushConstants.rect_x = -0.72F
    pushConstants.rect_y = -0.62F
    pushConstants.rect_z = 1.44F
    pushConstants.rect_w = 1.24F
    pushConstants.color_x = 0.88F
    pushConstants.color_y = 0.18F
    pushConstants.color_z = 0.65F
    pushConstants.color_w = 1.0F

    let acquireNextImage = deviceDispatch.vkAcquireNextImageKHR
    let beginCommandBuffer = deviceDispatch.vkBeginCommandBuffer
    let endCommandBuffer = deviceDispatch.vkEndCommandBuffer
    let pipelineBarrier = deviceDispatch.vkCmdPipelineBarrier2
    let queueSubmit = deviceDispatch.vkQueueSubmit2
    let queuePresent = deviceDispatch.vkQueuePresentKHR
    var frameNumber uint64 = 0uL
    var lifecycleStep uint32 = 0u
    var lifecycleRecoveryStep uint32 = 0u
    var lifecycleScriptedResize = false
    var lifecycleDone = !lifecycleRequested
    while ((!lifecycleRequested && frameNumber < 5uL) || (lifecycleRequested && !lifecycleDone)) {
      if lifecycleRequested {
        let lifecycleValue = lifecycle!!
        if lifecycleStep == 0u {
          if lifecycleValue.State != SdlLifecycleState.Ready || !lifecycleValue.RenderDirty {
            throw InvalidOperationException("SDL lifecycle did not request its initial frame")
          }
        } else if lifecycleStep == 1u {
          let acquireAttemptsBefore = acquireAttemptCount
          let acquireResultsBefore = acquireResultCount
          let acquireSuccessesBefore = acquireSuccessCount
          let submitAttemptsBefore = submitAttemptCount
          let submitResultsBefore = submitResultCount
          let submitSuccessesBefore = submitSuccessCount
          let presentAttemptsBefore = presentAttemptCount
          let presentResultsBefore = presentResultCount
          let presentSuccessesBefore = presentSuccessCount
          let recordsBefore = recordCount
          lifecycleValue.SyncWindow(window)
          let syncEvents = lifecycleValue.DrainEvents()
          if syncEvents < 0 {
            throw InvalidOperationException("SDL lifecycle clean wait drain failed")
          }
          lifecycleValue.RefreshMetrics(window)
          if lifecycleValue.RenderDirty {
            if lifecycleValue.State != SdlLifecycleState.Ready {
              throw InvalidOperationException("SDL lifecycle clean wait found a non-ready dirty window")
            }
          } else {
            let waitEvents = lifecycleValue.WaitAndDrain(25)
            if waitEvents < 0 {
              throw InvalidOperationException("SDL lifecycle clean wait failed")
            }
            lifecycleValue.RefreshMetrics(window)
            if waitEvents != 0 || lifecycleValue.RenderDirty {
              throw InvalidOperationException("SDL lifecycle clean wait became dirty")
            }
            if acquireAttemptsBefore != acquireAttemptCount || acquireResultsBefore != acquireResultCount || acquireSuccessesBefore != acquireSuccessCount
              || submitAttemptsBefore != submitAttemptCount || submitResultsBefore != submitResultCount || submitSuccessesBefore != submitSuccessCount
              || presentAttemptsBefore != presentAttemptCount || presentResultsBefore != presentResultCount || presentSuccessesBefore != presentSuccessCount
              || recordsBefore != recordCount{
                throw InvalidOperationException("SDL lifecycle clean wait submitted or recorded work")
              }
            Console.WriteLine("Lifecycle clean wait: true")
            lifecycleScriptedResize = true
            lifecycleStep = 2u
            continue
          }
        } else if lifecycleStep == 2u {
          if pendingRetiredGeneration != nil {
            WaitForVulkanGenerationCompletion(
              generationValue,
              frameSlot0,
              frameSlot1,
              presentationRetirement)
            WaitForVulkanGenerationCompletion(
              pendingRetiredGeneration,
              frameSlot0,
              frameSlot1,
              presentationRetirement)
            pendingRetiredGeneration.Dispose()
            pendingRetiredGeneration = nil
          }
          let originalLogicalWidth = lifecycleValue.LogicalWidth
          let originalLogicalHeight = lifecycleValue.LogicalHeight
          var resizeEvents int32 = 0
          if lifecycleScriptedResize {
            lifecycleValue.SetWindowSize(window, 720, 540)
            lifecycleValue.SetWindowSize(window, 800, 600)
            lifecycleValue.SetWindowSize(window, 960, 720)
            resizeEvents = SyncSdlLifecycle(lifecycleValue, window)
            if lifecycleValue.LogicalWidth != 960 || lifecycleValue.LogicalHeight != 720 {
              throw InvalidOperationException("SDL lifecycle resize did not coalesce to the latest logical extent")
            }
          } else {
            resizeEvents = SyncSdlLifecycle(lifecycleValue, window)
          }
          if lifecycleValue.PixelWidth <= 0 || lifecycleValue.PixelHeight <= 0 {
            throw InvalidOperationException("SDL lifecycle recreation produced a zero pixel extent")
          }
          let resizedSelection = QuerySwapchainSelection(
            selectedPhysicalDevice,
            surface,
            instanceDispatch,
            diagnostics,
            170uL)
          let resizedCapabilities = resizedSelection.capabilities
          let resizedExtent = ResolveLifecycleExtent(lifecycleValue, resizedCapabilities)
          let previousGeneration = generationValue
          let previousHandle = previousGeneration.Handle
          let nextGenerationId = generation + 1uL
          let nextGeneration = VulkanSwapchainGeneration(
            device,
            deviceDispatch,
            surface,
            resizedCapabilities,
            resizedSelection.format,
            resizedSelection.presentMode,
            resizedExtent,
            resizedSelection.compositeAlpha,
            previousHandle,
            nextGenerationId)
          generationValue = nextGeneration
          swapchainGeneration = nextGeneration
          swapchain = nextGeneration.Handle
          swapchainCreated = true
          swapchainImageCount = nextGeneration.ImageCount
          generation = nextGenerationId
          pendingRetiredGeneration = previousGeneration
          WaitForVulkanGenerationCompletion(
            previousGeneration,
            frameSlot0,
            frameSlot1,
            presentationRetirement)
          let resizedFormatChanged = resizedSelection.format.format != selectedSurfaceFormat.format || resizedSelection.format.colorSpace != selectedSurfaceFormat.colorSpace
          if resizedFormatChanged {
            if solidQuad != nil {
              solidQuad.Dispose()
            }
            solidQuad = VulkanSolidQuad(device, deviceDispatch, resizedSelection.format.format)
          }
          selectedSurfaceCapabilities = resizedCapabilities
          selectedSurfaceFormat = resizedSelection.format
          selectedPresentMode = resizedSelection.presentMode
          compositeAlpha = resizedSelection.compositeAlpha
          if let diagnostics = diagnostics {
            diagnostics.CaptureWsiFacts(uint64(window), surface, swapchain, frameIndex, generation)
          }
          if lifecycleScriptedResize {
            Console.WriteLine("Lifecycle resize coalesced: ${originalLogicalWidth}x${originalLogicalHeight} -> ${lifecycleValue.PixelWidth}x${lifecycleValue.PixelHeight}")
            if resizeEvents == 0 {
              Console.WriteLine("Lifecycle resize events: metrics")
            }
            lifecycleStep = 3u
          } else {
            lifecycleStep = lifecycleRecoveryStep
          }
          lifecycleScriptedResize = false
          continue
        } else if lifecycleStep == 3u {
          if lifecycleValue.State != SdlLifecycleState.Ready || !lifecycleValue.RenderDirty {
            throw InvalidOperationException("SDL lifecycle resize did not request a frame")
          }
        } else if lifecycleStep == 4u {
          if lifecycleDpiDeferred {
            Console.WriteLine("Lifecycle DPI scale changed: deferred")
            lifecycleStep = 6u
            continue
          }
          let originalScale = lifecycleValue.DisplayScale
          let originalPixelDensity = lifecycleValue.PixelDensity
          if originalScale > 1.25F {
            lifecycleValue.SetWindowPosition(window, 4000, 500)
          } else {
            lifecycleValue.SetWindowPosition(window, 1400, 500)
          }
          SyncSdlLifecycle(lifecycleValue, window)
          let changedScale = lifecycleValue.DisplayScale != originalScale
          let changedPixelDensity = lifecycleValue.PixelDensity != originalPixelDensity
          if !changedScale && !changedPixelDensity {
            throw InvalidOperationException("SDL lifecycle DPI move did not change display scale or pixel density")
          }
          lifecycleDpiChanged = true
          Console.WriteLine("Lifecycle DPI scale changed: true")
          let dpiSelection = QuerySwapchainSelection(
            selectedPhysicalDevice,
            surface,
            instanceDispatch,
            diagnostics,
            180uL)
          let dpiCapabilities = dpiSelection.capabilities
          let dpiExtent = ResolveLifecycleExtent(lifecycleValue, dpiCapabilities)
          let previousGeneration = generationValue
          let previousHandle = previousGeneration.Handle
          let nextGenerationId = generation + 1uL
          let nextGeneration = VulkanSwapchainGeneration(
            device,
            deviceDispatch,
            surface,
            dpiCapabilities,
            dpiSelection.format,
            dpiSelection.presentMode,
            dpiExtent,
            dpiSelection.compositeAlpha,
            previousHandle,
            nextGenerationId)
          generationValue = nextGeneration
          swapchainGeneration = nextGeneration
          swapchain = nextGeneration.Handle
          swapchainCreated = true
          swapchainImageCount = nextGeneration.ImageCount
          generation = nextGenerationId
          pendingRetiredGeneration = previousGeneration
          WaitForVulkanGenerationCompletion(
            previousGeneration,
            frameSlot0,
            frameSlot1,
            presentationRetirement)
          let dpiFormatChanged = dpiSelection.format.format != selectedSurfaceFormat.format || dpiSelection.format.colorSpace != selectedSurfaceFormat.colorSpace
          if dpiFormatChanged {
            if solidQuad != nil {
              solidQuad.Dispose()
            }
            solidQuad = VulkanSolidQuad(device, deviceDispatch, dpiSelection.format.format)
          }
          selectedSurfaceCapabilities = dpiCapabilities
          selectedSurfaceFormat = dpiSelection.format
          selectedPresentMode = dpiSelection.presentMode
          compositeAlpha = dpiSelection.compositeAlpha
          if let diagnostics = diagnostics {
            diagnostics.CaptureWsiFacts(uint64(window), surface, swapchain, frameIndex, generation)
          }
          lifecycleStep = 5u
          continue
        } else if lifecycleStep == 5u {
          if lifecycleValue.State != SdlLifecycleState.Ready || !lifecycleValue.RenderDirty {
            throw InvalidOperationException("SDL lifecycle DPI change did not request a frame")
          }
        } else if lifecycleStep == 6u {
          if lifecycleMinimizeDeferred {
            Console.WriteLine("Lifecycle minimize/restore: deferred")
            lifecycleStep = 9u
            continue
          }
          lifecycleValue.MinimizeWindow(window)
          lifecycleValue.SyncWindow(window)
          let minimizeEvents = lifecycleValue.DrainEvents()
          if minimizeEvents < 0 {
            throw InvalidOperationException("SDL lifecycle minimize drain failed")
          }
          lifecycleValue.RefreshMetrics(window)
          let minimized = lifecycleValue.Minimized || lifecycleValue.State == SdlLifecycleState.Suspended
            || lifecycleValue.PixelWidth == 0 || lifecycleValue.PixelHeight == 0
          if !minimized {
            throw InvalidOperationException("SDL lifecycle minimize did not suspend the window")
          }
          let acquireAttemptsBefore = acquireAttemptCount
          let acquireResultsBefore = acquireResultCount
          let acquireSuccessesBefore = acquireSuccessCount
          let submitAttemptsBefore = submitAttemptCount
          let submitResultsBefore = submitResultCount
          let submitSuccessesBefore = submitSuccessCount
          let presentAttemptsBefore = presentAttemptCount
          let presentResultsBefore = presentResultCount
          let presentSuccessesBefore = presentSuccessCount
          let recordsBefore = recordCount
          let waitEvents = lifecycleValue.WaitAndDrain(25)
          if waitEvents < 0 {
            throw InvalidOperationException("SDL lifecycle minimized wait failed")
          }
          if acquireAttemptsBefore != acquireAttemptCount || acquireResultsBefore != acquireResultCount || acquireSuccessesBefore != acquireSuccessCount
            || submitAttemptsBefore != submitAttemptCount || submitResultsBefore != submitResultCount || submitSuccessesBefore != submitSuccessCount
            || presentAttemptsBefore != presentAttemptCount || presentResultsBefore != presentResultCount || presentSuccessesBefore != presentSuccessCount
            || recordsBefore != recordCount{
              throw InvalidOperationException("SDL lifecycle minimized window submitted or recorded work")
            }
          Console.WriteLine("Lifecycle minimized suppression: true")
          lifecycleStep = 7u
          continue
        } else if lifecycleStep == 7u {
          lifecycleValue.RestoreWindow(window)
          lifecycleValue.ShowWindow(window)
          var restoreEvents = SyncSdlLifecycle(lifecycleValue, window)
          var restoreAttempt int32 = 0
          while (lifecycleValue.State != SdlLifecycleState.Ready || lifecycleValue.Minimized)
            && restoreAttempt < 20 {
              let drained = lifecycleValue.WaitAndDrain(50)
              if drained < 0 {
                throw InvalidOperationException("SDL lifecycle restore event wait failed")
              }
              restoreEvents += drained
              lifecycleValue.RefreshMetrics(window)
              restoreAttempt++
            }
          if restoreEvents < 0 || lifecycleValue.State != SdlLifecycleState.Ready
            || lifecycleValue.Minimized || lifecycleValue.PixelWidth <= 0 || lifecycleValue.PixelHeight <= 0 {
              throw InvalidOperationException("SDL lifecycle restore did not produce a pixel extent: state="
                +lifecycleValue.State.ToString() + ", minimized=" + lifecycleValue.Minimized.ToString()
                +", pixels=" + lifecycleValue.PixelWidth.ToString() + "x" + lifecycleValue.PixelHeight.ToString()
                +", events=" + restoreEvents.ToString())
            }
          lifecycleValue.MarkReady()
          let restoredSelection = QuerySwapchainSelection(
            selectedPhysicalDevice,
            surface,
            instanceDispatch,
            diagnostics,
            220uL)
          let restoredCapabilities = restoredSelection.capabilities
          let restoredExtent = ResolveLifecycleExtent(lifecycleValue, restoredCapabilities)
          let previousGeneration = generationValue
          let previousHandle = previousGeneration.Handle
          let nextGenerationId = generation + 1uL
          let nextGeneration = VulkanSwapchainGeneration(
            device,
            deviceDispatch,
            surface,
            restoredCapabilities,
            restoredSelection.format,
            restoredSelection.presentMode,
            restoredExtent,
            restoredSelection.compositeAlpha,
            previousHandle,
            nextGenerationId)
          generationValue = nextGeneration
          swapchainGeneration = nextGeneration
          swapchain = nextGeneration.Handle
          swapchainCreated = true
          swapchainImageCount = nextGeneration.ImageCount
          generation = nextGenerationId
          pendingRetiredGeneration = previousGeneration
          WaitForVulkanGenerationCompletion(
            previousGeneration,
            frameSlot0,
            frameSlot1,
            presentationRetirement)
          let restoredFormatChanged = restoredSelection.format.format != selectedSurfaceFormat.format || restoredSelection.format.colorSpace != selectedSurfaceFormat.colorSpace
          if restoredFormatChanged {
            if solidQuad != nil {
              solidQuad.Dispose()
            }
            solidQuad = VulkanSolidQuad(device, deviceDispatch, restoredSelection.format.format)
          }
          selectedSurfaceCapabilities = restoredCapabilities
          selectedSurfaceFormat = restoredSelection.format
          selectedPresentMode = restoredSelection.presentMode
          compositeAlpha = restoredSelection.compositeAlpha
          if let diagnostics = diagnostics {
            diagnostics.CaptureWsiFacts(uint64(window), surface, swapchain, frameIndex, generation)
          }
          lifecycleStep = 8u
          continue
        } else if lifecycleStep == 8u {
          if lifecycleValue.State != SdlLifecycleState.Ready || !lifecycleValue.RenderDirty {
            throw InvalidOperationException("SDL lifecycle restore did not request a frame")
          }
        } else if lifecycleStep == 9u {
          var closeEvent = SdlEvent{}
          let closeWindowEvent = *SdlWindowEvent(*void(&closeEvent))
          closeWindowEvent -> eventType = SdlEventConstants.WindowCloseRequested
          closeWindowEvent -> windowIdentifier = lifecycleValue.WindowId
          if SDL_PushEvent(&closeEvent) == 0u {
            throw InvalidOperationException("SDL lifecycle close event enqueue failed")
          }
          lifecycleValue.SyncWindow(window)
          let closeEvents = lifecycleValue.DrainEvents()
          if closeEvents < 1 || !lifecycleValue.CloseRequested || lifecycleValue.State != SdlLifecycleState.Closing {
            throw InvalidOperationException("SDL lifecycle close event was not handled")
          }
          lifecycleCloseEventHandled = true
          let instanceBeforeReopen = instance
          let deviceBeforeReopen = device
          let queueBeforeReopen = queue
          WaitForVulkanGenerationCompletion(
            generationValue,
            frameSlot0,
            frameSlot1,
            presentationRetirement)
          generationValue.Dispose()
          swapchainGeneration = nil
          swapchain = uint64(0)
          swapchainCreated = false
          if surfaceCreated {
            SDL_Vulkan_DestroySurface(instance, surface, nil)
          }
          surface = uint64(0)
          surfaceCreated = false
          let destroyedWindowId = lifecycleValue.WindowId
          SDL_DestroyWindow(window)
          window = nint(0)
          var destroyedEvent = SdlEvent{}
          let destroyedWindowEvent = *SdlWindowEvent(*void(&destroyedEvent))
          destroyedWindowEvent -> eventType = SdlEventConstants.WindowDestroyed
          destroyedWindowEvent -> windowIdentifier = destroyedWindowId
          if SDL_PushEvent(&destroyedEvent) == 0u {
            throw InvalidOperationException("SDL lifecycle destroyed event enqueue failed")
          }
          if lifecycleValue.DrainEvents() < 1 || !lifecycleValue.Destroyed || lifecycleValue.State != SdlLifecycleState.Closing {
            throw InvalidOperationException("SDL lifecycle destroyed event was not handled")
          }
          lifecycleValue.ResetClosed()
          window = SDL_CreateWindow("Goo Vulkan Proof", 960, 720, uint64(0x0000000010000000))
          if window == nint(0) {
            throw InvalidOperationException("SDL Vulkan window reopen failed")
          }
          lifecycleValue.BeginOpen(window)
          lifecycleValue.ShowWindow(window)
          lifecycleValue.SyncWindow(window)
          if lifecycleValue.DrainEvents() < 0 {
            throw InvalidOperationException("SDL lifecycle reopen drain failed")
          }
          lifecycleValue.RefreshMetrics(window)
          lifecycleValue.MarkReady()
          if SDL_Vulkan_CreateSurface(window, instance, nil, ref surface) == 0u {
            throw InvalidOperationException("SDL Vulkan reopened surface creation failed")
          }
          surfaceCreated = true
          var reopenedSupported VkBool32 = VkConstants.VK_FALSE
          if TrackResult(diagnostics, 173uL, surfaceSupport(selectedPhysicalDevice, selectedQueueFamilyIndex, surface, &reopenedSupported)) != VkConstants.VK_SUCCESS {
            throw InvalidOperationException("Vulkan reopened surface support query failed")
          }
          let reopenedSdlSupported = SDL_Vulkan_GetPresentationSupport(instance, selectedPhysicalDevice, selectedQueueFamilyIndex)
          if reopenedSupported == VkConstants.VK_FALSE || reopenedSdlSupported == 0u {
            throw InvalidOperationException("Vulkan selected queue lost presentation support after reopen")
          }
          let reopenedSelection = QuerySwapchainSelection(
            selectedPhysicalDevice,
            surface,
            instanceDispatch,
            diagnostics,
            190uL)
          let reopenedCapabilities = reopenedSelection.capabilities
          let reopenedFormat = reopenedSelection.format
          let reopenedPresentMode = reopenedSelection.presentMode
          let reopenedCompositeAlpha = reopenedSelection.compositeAlpha
          let formatChanged = reopenedFormat.format != selectedSurfaceFormat.format || reopenedFormat.colorSpace != selectedSurfaceFormat.colorSpace
          selectedSurfaceFormat = reopenedFormat
          selectedPresentMode = reopenedPresentMode
          compositeAlpha = reopenedCompositeAlpha
          if formatChanged {
            if solidQuad != nil {
              solidQuad.Dispose()
            }
            solidQuad = VulkanSolidQuad(device, deviceDispatch, selectedSurfaceFormat.format)
          }
          let reopenedExtent = ResolveLifecycleExtent(lifecycleValue, reopenedCapabilities)
          let nextGenerationId = generation + 1uL
          let nextGeneration = VulkanSwapchainGeneration(
            device,
            deviceDispatch,
            surface,
            reopenedCapabilities,
            reopenedFormat,
            reopenedPresentMode,
            reopenedExtent,
            reopenedCompositeAlpha,
            uint64(0),
            nextGenerationId)
          generationValue = nextGeneration
          swapchainGeneration = nextGeneration
          swapchain = nextGeneration.Handle
          swapchainCreated = true
          swapchainImageCount = nextGeneration.ImageCount
          generation = nextGenerationId
          selectedSurfaceCapabilities = reopenedCapabilities
          if instance != instanceBeforeReopen || device != deviceBeforeReopen || queue != queueBeforeReopen {
            throw InvalidOperationException("Vulkan close/reopen did not reuse instance, device, and queue")
          }
          Console.WriteLine("Lifecycle close/reopen reused device and queue: true")
          Console.WriteLine("Lifecycle queue present support after reopen: true")
          lifecycleStep = 10u
          continue
        } else if lifecycleStep == 10u {
          if lifecycleValue.State != SdlLifecycleState.Ready || !lifecycleValue.RenderDirty {
            throw InvalidOperationException("SDL lifecycle reopen did not request a frame")
          }
        }
      }
      var slot VulkanFrameSlot? = nil
      var slotIndex uint32 = 0u
      if (frameNumber & 1uL) == 0uL {
        slot = frameSlot0
        slotIndex = 0u
      } else {
        slot = frameSlot1
        slotIndex = 1u
      }
      let activeSlot = slot
      let prepareAcquireResult = activeSlot.PrepareAcquire()
      if TrackResult(diagnostics, 36uL + frameNumber * 20uL, prepareAcquireResult) != VkConstants.VK_SUCCESS {
        throw InvalidOperationException("Vulkan frame-slot acquire preparation failed")
      }
      presentationRetirement.CollectCompleted(slotIndex, activeSlot.LastCompletedSerial)
      var imageIndex uint32 = 0u
      acquireAttemptCount = acquireAttemptCount + 1uL
      let acquireResult = TrackResult(
        diagnostics,
        37uL + frameNumber * 20uL,
        acquireNextImage(device, swapchain, VkConstants.VK_WHOLE_SIZE, activeSlot.AcquireSemaphore, uint64(0), &imageIndex))
      acquireResultCount = acquireResultCount + 1uL
      if acquireResult == VkConstants.VK_ERROR_OUT_OF_DATE_KHR {
        let outOfDateMarkedResult = activeSlot.MarkAcquired(acquireResult)
        if outOfDateMarkedResult != VkConstants.VK_ERROR_OUT_OF_DATE_KHR {
          throw InvalidOperationException("Vulkan out-of-date acquire state was not consumed")
        }
        if lifecycleRequested {
          lifecycle!!.RequestRender()
          lifecycleRecoveryStep = lifecycleStep
          lifecycleScriptedResize = false
          lifecycleStep = 2u
          continue
        }
        throw InvalidOperationException("vkAcquireNextImageKHR returned VK_ERROR_OUT_OF_DATE_KHR")
      }
      let markedAcquireResult = activeSlot.MarkAcquired(acquireResult)
      if markedAcquireResult != VkConstants.VK_SUCCESS && markedAcquireResult != VkConstants.VK_SUBOPTIMAL_KHR {
        throw InvalidOperationException("vkAcquireNextImageKHR failed")
      }
      acquireSuccessCount = acquireSuccessCount + 1uL
      if imageIndex >= swapchainImageCount {
        throw InvalidOperationException("Acquired image index is invalid")
      }
      let acquiredLayout = generationValue.CurrentLayout(imageIndex)
      let hadPriorPresentation = acquiredLayout == VkConstants.VK_IMAGE_LAYOUT_PRESENT_SRC_KHR
      frameIndex = frameNumber + 1uL
      if let diagnostics = diagnostics {
        diagnostics.CaptureWsiFacts(uint64(window), surface, swapchain, frameIndex, generation)
      }

      var commandBufferBeginInfo = VkCommandBufferBeginInfo{}
      commandBufferBeginInfo.sType = VkConstants.VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO
      commandBufferBeginInfo.flags = uint32(VkConstants.VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT)
      if TrackResult(diagnostics, 38uL + frameNumber * 20uL, beginCommandBuffer(activeSlot.CommandBuffer, &commandBufferBeginInfo)) != VkConstants.VK_SUCCESS {
        throw InvalidOperationException("vkBeginCommandBuffer failed")
      }
      if frameNumber == 0uL && queryPoolCreated {
        let resetQueryPool = deviceDispatch.vkCmdResetQueryPool
        resetQueryPool(activeSlot.CommandBuffer, queryPool, 0u, 2u)
        let writeTimestamp = deviceDispatch.vkCmdWriteTimestamp2
        writeTimestamp(activeSlot.CommandBuffer, VkConstants.VK_PIPELINE_STAGE_2_TOP_OF_PIPE_BIT, queryPool, 0u)
      }

      var subresourceRange = VkImageSubresourceRange{}
      subresourceRange.aspectMask = uint32(VkConstants.VK_IMAGE_ASPECT_COLOR_BIT)
      subresourceRange.levelCount = 1u
      subresourceRange.layerCount = 1u
      var toColorBarrier = VkImageMemoryBarrier2{}
      toColorBarrier.sType = VkConstants.VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER_2
      if acquiredLayout == VkConstants.VK_IMAGE_LAYOUT_UNDEFINED {
        toColorBarrier.srcStageMask = VkConstants.VK_PIPELINE_STAGE_2_TOP_OF_PIPE_BIT
        toColorBarrier.srcAccessMask = VkConstants.VK_ACCESS_2_NONE
      } else if acquiredLayout == VkConstants.VK_IMAGE_LAYOUT_PRESENT_SRC_KHR {
        toColorBarrier.srcStageMask = VkConstants.VK_PIPELINE_STAGE_2_BOTTOM_OF_PIPE_BIT
        toColorBarrier.srcAccessMask = VkConstants.VK_ACCESS_2_NONE
      } else {
        throw InvalidOperationException("Vulkan swapchain image has an unsupported tracked layout")
      }
      toColorBarrier.dstStageMask = VkConstants.VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT
      toColorBarrier.dstAccessMask = VkConstants.VK_ACCESS_2_COLOR_ATTACHMENT_WRITE_BIT
      toColorBarrier.oldLayout = acquiredLayout
      toColorBarrier.newLayout = VkConstants.VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL
      toColorBarrier.srcQueueFamilyIndex = VkConstants.VK_QUEUE_FAMILY_IGNORED
      toColorBarrier.dstQueueFamilyIndex = VkConstants.VK_QUEUE_FAMILY_IGNORED
      toColorBarrier.image = generationValue.Image(imageIndex)
      toColorBarrier.subresourceRange = subresourceRange
      var firstDependency = VkDependencyInfo{}
      firstDependency.sType = VkConstants.VK_STRUCTURE_TYPE_DEPENDENCY_INFO
      firstDependency.imageMemoryBarrierCount = 1u
      firstDependency.pImageMemoryBarriers = &toColorBarrier
      pipelineBarrier(activeSlot.CommandBuffer, &firstDependency)
      solidQuad!!.Record(activeSlot.CommandBuffer, generationValue.ImageView(imageIndex), generationValue.Extent, clearColor, pushConstants)

      var toPresentBarrier = VkImageMemoryBarrier2{}
      toPresentBarrier.sType = VkConstants.VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER_2
      toPresentBarrier.srcStageMask = VkConstants.VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT
      toPresentBarrier.srcAccessMask = VkConstants.VK_ACCESS_2_COLOR_ATTACHMENT_WRITE_BIT
      toPresentBarrier.dstStageMask = VkConstants.VK_PIPELINE_STAGE_2_BOTTOM_OF_PIPE_BIT
      toPresentBarrier.dstAccessMask = VkConstants.VK_ACCESS_2_NONE
      toPresentBarrier.oldLayout = VkConstants.VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL
      toPresentBarrier.newLayout = VkConstants.VK_IMAGE_LAYOUT_PRESENT_SRC_KHR
      toPresentBarrier.srcQueueFamilyIndex = VkConstants.VK_QUEUE_FAMILY_IGNORED
      toPresentBarrier.dstQueueFamilyIndex = VkConstants.VK_QUEUE_FAMILY_IGNORED
      toPresentBarrier.image = generationValue.Image(imageIndex)
      toPresentBarrier.subresourceRange = subresourceRange
      var secondDependency = VkDependencyInfo{}
      secondDependency.sType = VkConstants.VK_STRUCTURE_TYPE_DEPENDENCY_INFO
      secondDependency.imageMemoryBarrierCount = 1u
      secondDependency.pImageMemoryBarriers = &toPresentBarrier
      pipelineBarrier(activeSlot.CommandBuffer, &secondDependency)
      if frameNumber == 0uL && queryPoolCreated {
        let writeTimestamp = deviceDispatch.vkCmdWriteTimestamp2
        writeTimestamp(activeSlot.CommandBuffer, VkConstants.VK_PIPELINE_STAGE_2_BOTTOM_OF_PIPE_BIT, queryPool, 1u)
      }
      if TrackResult(diagnostics, 39uL + frameNumber * 20uL, endCommandBuffer(activeSlot.CommandBuffer)) != VkConstants.VK_SUCCESS {
        throw InvalidOperationException("vkEndCommandBuffer failed")
      }
      recordCount = recordCount + 1uL

      let prepareSubmitResult = activeSlot.PrepareSubmit(true)
      if TrackResult(diagnostics, 40uL + frameNumber * 20uL, prepareSubmitResult) != VkConstants.VK_SUCCESS {
        throw InvalidOperationException("Vulkan frame-slot submit preparation failed")
      }
      var waitSemaphoreInfo = VkSemaphoreSubmitInfo{}
      waitSemaphoreInfo.sType = VkConstants.VK_STRUCTURE_TYPE_SEMAPHORE_SUBMIT_INFO
      waitSemaphoreInfo.semaphore = activeSlot.AcquireSemaphore
      waitSemaphoreInfo.stageMask = VkConstants.VK_PIPELINE_STAGE_2_ALL_COMMANDS_BIT
      var signalSemaphoreInfo = VkSemaphoreSubmitInfo{}
      signalSemaphoreInfo.sType = VkConstants.VK_STRUCTURE_TYPE_SEMAPHORE_SUBMIT_INFO
      signalSemaphoreInfo.semaphore = generationValue.RenderSemaphore(imageIndex)
      signalSemaphoreInfo.stageMask = VkConstants.VK_PIPELINE_STAGE_2_ALL_COMMANDS_BIT
      var commandBufferSubmitInfo = VkCommandBufferSubmitInfo{}
      commandBufferSubmitInfo.sType = VkConstants.VK_STRUCTURE_TYPE_COMMAND_BUFFER_SUBMIT_INFO
      commandBufferSubmitInfo.commandBuffer = activeSlot.CommandBuffer
      var submitInfo = VkSubmitInfo2{}
      submitInfo.sType = VkConstants.VK_STRUCTURE_TYPE_SUBMIT_INFO_2
      submitInfo.waitSemaphoreInfoCount = 1u
      submitInfo.pWaitSemaphoreInfos = &waitSemaphoreInfo
      submitInfo.commandBufferInfoCount = 1u
      submitInfo.pCommandBufferInfos = &commandBufferSubmitInfo
      submitInfo.signalSemaphoreInfoCount = 1u
      submitInfo.pSignalSemaphoreInfos = &signalSemaphoreInfo
      submitAttemptCount = submitAttemptCount + 1uL
      let submitResult = TrackResult(diagnostics, 41uL + frameNumber * 20uL, queueSubmit(queue, 1u, &submitInfo, activeSlot.SubmissionFence))
      submitResultCount = submitResultCount + 1uL
      let markedSubmitResult = activeSlot.MarkSubmitted(submitResult)
      if markedSubmitResult != VkConstants.VK_SUCCESS {
        throw InvalidOperationException("vkQueueSubmit2 failed")
      }
      submitSuccessCount = submitSuccessCount + 1uL
      if hadPriorPresentation {
        presentationRetirement.BindPriorSameImageToProof(generationValue.Generation, imageIndex, slotIndex, activeSlot.SubmissionSerial)
      }
      if let diagnostics = diagnostics {
        diagnostics.CaptureSubmission(activeSlot.SubmissionSerial, uint64(queue), activeSlot.SubmissionFence)
      }

      var completedPresentId uint64 = 0uL
      var presentFence = generationValue.PreparePresent(imageIndex, out completedPresentId)
      if completedPresentId != 0uL {
        presentationRetirement.CompletePresent(completedPresentId)
      }
      var presentFenceInfo = VkSwapchainPresentFenceInfoEXT{}
      presentFenceInfo.sType = VkConstants.VK_STRUCTURE_TYPE_SWAPCHAIN_PRESENT_FENCE_INFO_EXT
      presentFenceInfo.swapchainCount = 1u
      presentFenceInfo.pFences = &presentFence
      var presentInfo = VkPresentInfoKHR{}
      presentInfo.sType = VkConstants.VK_STRUCTURE_TYPE_PRESENT_INFO_KHR
      presentInfo.pNext = *void(&presentFenceInfo)
      presentInfo.waitSemaphoreCount = 1u
      presentInfo.pWaitSemaphores = &signalSemaphoreInfo.semaphore
      presentInfo.swapchainCount = 1u
      presentInfo.pSwapchains = &swapchain
      presentInfo.pImageIndices = &imageIndex
      presentAttemptCount = presentAttemptCount + 1uL
      let rawPresentResult = queuePresent(queue, &presentInfo)
      let presentResult = TrackResult(diagnostics, 42uL + frameNumber * 20uL, rawPresentResult)
      presentResultCount = presentResultCount + 1uL
      var presentId uint64 = 0uL
      if presentResult == VkConstants.VK_SUCCESS || presentResult == VkConstants.VK_SUBOPTIMAL_KHR {
        presentSuccessCount = presentSuccessCount + 1uL
        presentId = presentationRetirement.RecordPresent(generationValue.Generation, imageIndex)
      }
      let markedPresentResult = generationValue.MarkPresented(imageIndex, presentResult, presentId)
      if markedPresentResult != VkConstants.VK_SUCCESS && markedPresentResult != VkConstants.VK_SUBOPTIMAL_KHR && markedPresentResult != VkConstants.VK_ERROR_OUT_OF_DATE_KHR {
        throw InvalidOperationException("vkQueuePresentKHR failed")
      }
      if presentResult == VkConstants.VK_ERROR_OUT_OF_DATE_KHR && !lifecycleRequested {
        throw InvalidOperationException("vkQueuePresentKHR returned VK_ERROR_OUT_OF_DATE_KHR")
      }
      if presentResult == VkConstants.VK_SUCCESS || presentResult == VkConstants.VK_SUBOPTIMAL_KHR {
        generationValue.CommitLayout(imageIndex, VkConstants.VK_IMAGE_LAYOUT_PRESENT_SRC_KHR)
      }
      frameNumber = frameNumber + 1uL
      if lifecycleRequested {
        let lifecycleValue = lifecycle!!
        lifecycleValue.MarkPresented()
        if pendingRetiredGeneration != nil {
          if presentResult == VkConstants.VK_SUCCESS || presentResult == VkConstants.VK_SUBOPTIMAL_KHR {
            let completionResult = generationValue.WaitForPresentCompletion(presentationRetirement)
            if completionResult != VkConstants.VK_SUCCESS {
              throw InvalidOperationException("Vulkan lifecycle generation anchor completion failed")
            }
            presentationRetirement.QueueRetiredGeneration(pendingRetiredGeneration.Generation)
            presentationRetirement.AnchorRetiredGenerations(generationValue.Generation)
            var retiredGenerationId uint64 = 0uL
            if !presentationRetirement.TryPopRetiredGeneration(out retiredGenerationId) {
              throw InvalidOperationException("Vulkan lifecycle generation retirement is not proven")
            }
            let retiredGeneration = pendingRetiredGeneration
            if retiredGeneration.Generation != retiredGenerationId {
              throw InvalidOperationException("Vulkan lifecycle retired generation id mismatch")
            }
            retiredGeneration.Dispose()
            pendingRetiredGeneration = nil
          } else if presentResult == VkConstants.VK_ERROR_OUT_OF_DATE_KHR {
            WaitForVulkanGenerationCompletion(
              generationValue,
              frameSlot0,
              frameSlot1,
              presentationRetirement)
            pendingRetiredGeneration!!.Dispose()
            pendingRetiredGeneration = nil
          }
        }
        if presentResult == VkConstants.VK_ERROR_OUT_OF_DATE_KHR {
          lifecycleValue.RequestRender()
          lifecycleRecoveryStep = lifecycleStep
          lifecycleScriptedResize = false
          lifecycleStep = 2u
        } else {
          var nextLifecycleStep = lifecycleStep
          var lifecycleWouldComplete = false
          if lifecycleStep == 0u {
            nextLifecycleStep = 1u
          } else if lifecycleStep == 3u {
            nextLifecycleStep = 4u
          } else if lifecycleStep == 5u {
            nextLifecycleStep = 6u
          } else if lifecycleStep == 8u {
            nextLifecycleStep = 9u
          } else if lifecycleStep == 10u {
            lifecycleWouldComplete = true
          }
          if markedAcquireResult == VkConstants.VK_SUBOPTIMAL_KHR
            || presentResult == VkConstants.VK_SUBOPTIMAL_KHR{
              lifecycleValue.RequestRender()
              lifecycleRecoveryStep = if lifecycleWouldComplete {
                10u
              } else {
                LifecycleRecoveryRenderStep(nextLifecycleStep)
              }
              lifecycleScriptedResize = false
              lifecycleStep = 2u
            } else {
              lifecycleStep = nextLifecycleStep
              lifecycleDone = lifecycleWouldComplete
            }
        }
      }
    }

    let finalSlot0 = frameSlot0
    let finalSlot1 = frameSlot1
    let finalSlot0Result = finalSlot0.PrepareAcquire()
    if TrackResult(diagnostics, 160uL, finalSlot0Result) != VkConstants.VK_SUCCESS {
      throw InvalidOperationException("Vulkan frame-slot 0 completion failed")
    }
    presentationRetirement.CollectCompleted(0u, finalSlot0.LastCompletedSerial)
    finalSlot0.AbortPrepared()
    let finalSlot1Result = finalSlot1.PrepareAcquire()
    if TrackResult(diagnostics, 161uL, finalSlot1Result) != VkConstants.VK_SUCCESS {
      throw InvalidOperationException("Vulkan frame-slot 1 completion failed")
    }
    presentationRetirement.CollectCompleted(1u, finalSlot1.LastCompletedSerial)
    finalSlot1.AbortPrepared()

    if queryPoolCreated {
      let timestampValues * uint64 = stackalloc[2]uint64
      let timestampData = *void(timestampValues)
      let getQueryPoolResults = deviceDispatch.vkGetQueryPoolResults
      let timestampResult = getQueryPoolResults(
        device,
        queryPool,
        0u,
        2u,
        nuint(16),
        timestampData,
        VkDeviceSize(8),
        uint32(VkConstants.VK_QUERY_RESULT_64_BIT))
      let trackedTimestampResult = TrackResult(diagnostics, 3uL, timestampResult)
      if trackedTimestampResult == VkConstants.VK_SUCCESS {
        diagnostics!!.Record(0uL, 0uL, 0uL, 0uL, 0uL, 0uL, uint64(selectedQueueFamilyIndex), 0uL, uint64(finalSlot0.SubmissionFence), 0uL, 4uL, 1uL, 0uL, int32(trackedTimestampResult), timestampValues[0], timestampValues[1])
      } else if trackedTimestampResult != VkConstants.VK_NOT_READY {
        throw InvalidOperationException("vkGetQueryPoolResults failed")
      }
    }
    let presentCompletionResult = generationValue.WaitForPresentCompletion(presentationRetirement)
    if TrackResult(diagnostics, 162uL, presentCompletionResult) != VkConstants.VK_SUCCESS {
      throw InvalidOperationException("Vulkan swapchain presentation completion failed")
    }
    if readbackRequested {
      let readbackBudget = VulkanMemoryBudgetState(
        selectedPhysicalDevice,
        instanceDispatch,
        readbackMemoryProperties.memoryHeapCount,
        selectedMemoryBudgetSupported)
      let readbackAllocatorValue = VulkanMemoryAllocator(
        device,
        deviceDispatch,
        readbackMemoryProperties,
        selectedPhysicalDeviceProperties.limits.maxMemoryAllocationCount,
        selectedPhysicalDeviceProperties.limits.nonCoherentAtomSize,
        selectedPhysicalDeviceProperties.limits.bufferImageGranularity,
        readbackBudget,
        nil)
      readbackAllocator = readbackAllocatorValue
      let offscreenExtent = VkExtent2D{ width: 64u, height: 64u }
      let target = VulkanSolidQuadReadbackTarget(
        device,
        deviceDispatch,
        readbackAllocatorValue,
        readbackDispatch!!,
        offscreenExtent,
        VkConstants.VK_FORMAT_R8G8B8A8_UNORM)
      offscreenTarget = target
      let resetCommandBuffer = deviceDispatch.vkResetCommandBuffer
      let resetResult = resetCommandBuffer(
        offscreenCommandBuffer, VkCommandBufferResetFlags(0u))
      if TrackResult(diagnostics, 45uL, resetResult) != VkConstants.VK_SUCCESS {
        throw InvalidOperationException("vkResetCommandBuffer failed for direct quad readback")
      }
      if target.PrepareSubmit() != VkConstants.VK_SUCCESS {
        throw InvalidOperationException("Vulkan direct quad readback preparation failed")
      }
      var beginInfo = VkCommandBufferBeginInfo{}
      beginInfo.sType = VkConstants.VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO
      beginInfo.flags = uint32(VkConstants.VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT)
      let beginCommandBuffer = deviceDispatch.vkBeginCommandBuffer
      if TrackResult(diagnostics, 46uL,
        beginCommandBuffer(offscreenCommandBuffer, &beginInfo)) != VkConstants.VK_SUCCESS{
          throw InvalidOperationException("vkBeginCommandBuffer failed for direct quad readback")
        }
      offscreenCommandBufferNeedsReset = true
      target.Record(offscreenCommandBuffer, clearColor, pushConstants)
      let endCommandBuffer = deviceDispatch.vkEndCommandBuffer
      if TrackResult(diagnostics, 47uL,
        endCommandBuffer(offscreenCommandBuffer)) != VkConstants.VK_SUCCESS{
          throw InvalidOperationException("vkEndCommandBuffer failed for direct quad readback")
        }
      var commandInfo = VkCommandBufferSubmitInfo{}
      commandInfo.sType = VkConstants.VK_STRUCTURE_TYPE_COMMAND_BUFFER_SUBMIT_INFO
      commandInfo.commandBuffer = offscreenCommandBuffer
      var submitInfo = VkSubmitInfo2{}
      submitInfo.sType = VkConstants.VK_STRUCTURE_TYPE_SUBMIT_INFO_2
      submitInfo.commandBufferInfoCount = 1u
      submitInfo.pCommandBufferInfos = &commandInfo
      let queueSubmit = deviceDispatch.vkQueueSubmit2
      let submitResult = TrackResult(diagnostics, 48uL,
        queueSubmit(queue, 1u, &submitInfo, target.CompletionFence))
      if submitResult == VkConstants.VK_SUCCESS {
        offscreenQueueAccepted = true
      }
      target.MarkSubmitted(submitResult)
      if submitResult != VkConstants.VK_SUCCESS {
        throw InvalidOperationException("vkQueueSubmit2 failed for direct quad readback")
      }
      let deadline = Environment.TickCount64 + 5000L
      var completion = target.PollCompletion()
      while completion == VkConstants.VK_NOT_READY && Environment.TickCount64 < deadline {
        Thread.Sleep(1)
        completion = target.PollCompletion()
      }
      if completion != VkConstants.VK_SUCCESS {
        Console.WriteLine("Offscreen clear/quad readback: false")
        throw InvalidOperationException("Vulkan direct quad readback did not complete")
      }
      let readback = *uint8(target.ReadbackPointer)
      let clearPixelOffset int32 = 0
      let quadPixelOffset = int32((32u * offscreenExtent.width + 32u) * 4u)
      let clearPixelOk = ByteNear(readback[clearPixelOffset], 8)
        && ByteNear(readback[clearPixelOffset + 1], 10)
        && ByteNear(readback[clearPixelOffset + 2], 20)
        && ByteNear(readback[clearPixelOffset + 3], 255)
      let quadPixelOk = ByteNear(readback[quadPixelOffset], 224)
        && ByteNear(readback[quadPixelOffset + 1], 46)
        && ByteNear(readback[quadPixelOffset + 2], 166)
        && ByteNear(readback[quadPixelOffset + 3], 255)
      if !clearPixelOk || !quadPixelOk {
        Console.WriteLine("Offscreen clear/quad readback: false")
        throw InvalidOperationException("Vulkan direct quad readback pixels are invalid")
      }
      Console.WriteLine("Offscreen clear/quad readback: true")
    }
    if let diagnostics = diagnostics {
      diagnostics.CaptureWsiFacts(uint64(window), surface, swapchain, frameIndex, generation)
      let liveFrameSlotCount uint32 = (frameSlot0 != nil ? 1u : 0u) + (frameSlot1 != nil ? 1u : 0u)
      let solidQuadHandleCount uint32 = solidQuad != nil ? 2u : 0u
      let offscreenTargetHandleCount uint32 = if let offscreenTargetValue = offscreenTarget {
        offscreenTargetValue.LiveObjectCount
      } else {
        0u
      }
      var liveObjects = CountLiveObjects(
        window,
        instance,
        surface,
        device,
        swapchain,
        swapchainImageCount,
        commandPool,
        allocatedCommandBufferCount,
        liveFrameSlotCount,
        solidQuadHandleCount,
        offscreenTargetHandleCount,
        0uL,
        0uL,
        validationMessenger,
        queryPool)
      var heapAllocated uint64 = 0uL
      var retiredBytes uint64 = 0uL
      if readbackAllocator != nil {
        let counters = readbackAllocator.Counters
        heapAllocated = uint64(counters.residentBytes)
        retiredBytes = uint64(counters.retiredBytes)
        liveObjects = liveObjects + counters.residentAllocations
      }
      diagnostics.CaptureResourceFacts(
        0uL,
        heapAllocated,
        retiredBytes,
        liveObjects)
      if diagnostics.ValidationErrorCount != 0 {
        diagnostics.CaptureFatal(-2, uint64(diagnostics.ValidationErrorCount))
        throw InvalidOperationException("Vulkan validation errors were captured")
      }
    }
    Console.WriteLine("Vulkan version: ${apiVersion}")
    Console.WriteLine("Physical devices: ${physicalDeviceCount}")
    Console.WriteLine("Queue family: ${selectedQueueFamilyIndex}")
    Console.WriteLine("Swapchain images: ${swapchainImageCount}")
    if lifecycleRequested {
      if lifecycleDpiDeferred {
        Console.WriteLine("Lifecycle E2E display-scale proof: deferred")
      } else {
        Console.WriteLine("Lifecycle E2E display-scale proof: ${lifecycleDpiChanged}")
      }
      Console.WriteLine("Lifecycle counters: acquireAttempts=${acquireAttemptCount} acquireResults=${acquireResultCount} acquireSuccesses=${acquireSuccessCount} submitAttempts=${submitAttemptCount} submitResults=${submitResultCount} submitSuccesses=${submitSuccessCount} presentAttempts=${presentAttemptCount} presentResults=${presentResultCount} presentSuccesses=${presentSuccessCount} records=${recordCount}")
      Console.WriteLine("Lifecycle close event handled: ${lifecycleCloseEventHandled}")
    }
    if lifecycleRequested {
      Console.WriteLine("Lifecycle persistent solid quad/present: true")
    } else {
      Console.WriteLine("Persistent 5-frame solid quad/present: true")
    }
    return 0
  } catch (error Exception) {
    if let diagnostics = diagnostics {
      diagnostics.CaptureWsiFacts(uint64(window), surface, swapchain, frameIndex, generation)
      let liveFrameSlotCount uint32 = (frameSlot0 != nil ? 1u : 0u) + (frameSlot1 != nil ? 1u : 0u)
      let solidQuadHandleCount uint32 = solidQuad != nil ? 2u : 0u
      let offscreenTargetHandleCount uint32 = if let offscreenTargetValue = offscreenTarget {
        offscreenTargetValue.LiveObjectCount
      } else {
        0u
      }
      var liveObjects = CountLiveObjects(
        window,
        instance,
        surface,
        device,
        swapchain,
        swapchainImageCount,
        commandPool,
        allocatedCommandBufferCount,
        liveFrameSlotCount,
        solidQuadHandleCount,
        offscreenTargetHandleCount,
        0uL,
        0uL,
        validationMessenger,
        queryPool)
      var heapAllocated uint64 = 0uL
      var retiredBytes uint64 = 0uL
      if readbackAllocator != nil {
        let counters = readbackAllocator.Counters
        heapAllocated = uint64(counters.residentBytes)
        retiredBytes = uint64(counters.retiredBytes)
        liveObjects = liveObjects + counters.residentAllocations
      }
      diagnostics.CaptureResourceFacts(
        0uL,
        heapAllocated,
        retiredBytes,
        liveObjects)
      diagnostics.CaptureFatal(-1, 0uL)
    }
    Console.Error.WriteLine(error.ToString())
    throw error
  } finally {
    var offscreenSubmissionCompleted = !offscreenQueueAccepted
    try {
      if offscreenQueueAccepted {
        if offscreenTarget == nil || device == nint(0) {
          throw InvalidOperationException("Vulkan cleanup lost the accepted offscreen submission fence")
        }
        var completionFence = offscreenTarget.CompletionFence
        let waitForFences = deviceDispatch.vkWaitForFences
        let waitResult = waitForFences(device, 1u, &completionFence,
          VkConstants.VK_TRUE, VkConstants.VK_WHOLE_SIZE)
        if waitResult != VkConstants.VK_SUCCESS {
          throw InvalidOperationException("vkWaitForFences failed for accepted offscreen submission cleanup")
        }
        offscreenSubmissionCompleted = true
      }
    } catch (error Exception) {
      Console.Error.WriteLine("Vulkan cleanup accepted offscreen submission failed: " + error.ToString())
    }

    try {
      if offscreenCommandBufferNeedsReset && offscreenSubmissionCompleted {
        let resetCommandBufferNullable = resetCommandBufferAddress as (unmanaged[Cdecl](VkCommandBuffer, VkCommandBufferResetFlags) -> VkResult)?
        if resetCommandBufferNullable == nil {
          throw InvalidOperationException("vkResetCommandBuffer is unavailable during offscreen cleanup")
        }
        let resetCommandBuffer = resetCommandBufferNullable
        let resetResult = resetCommandBuffer(offscreenCommandBuffer, VkCommandBufferResetFlags(0u))
        if resetResult != VkConstants.VK_SUCCESS {
          throw InvalidOperationException("vkResetCommandBuffer failed during offscreen cleanup")
        }
        offscreenCommandBufferNeedsReset = false
      }
    } catch (error Exception) {
      Console.Error.WriteLine("Vulkan cleanup offscreen command buffer failed: " + error.ToString())
    }

    try {
      if offscreenTarget != nil {
        offscreenTarget.Dispose()
        offscreenTarget = nil
      }
    } catch (error Exception) {
      Console.Error.WriteLine("Vulkan cleanup offscreen target failed: " + error.ToString())
    }

    if offscreenTarget == nil {
      try {
        if readbackAllocator != nil {
          readbackAllocator.Dispose()
        }
        readbackAllocator = nil
      } catch (error Exception) {
        Console.Error.WriteLine("Vulkan cleanup readback allocator failed: " + error.ToString())
      }
    }

    try {
      if pendingRetiredGeneration != nil {
        if frameSlot0 != nil && frameSlot1 != nil && presentationRetirement != nil {
          WaitForVulkanGenerationCompletion(
            pendingRetiredGeneration,
            frameSlot0,
            frameSlot1,
            presentationRetirement)
        } else if presentationRetirement != nil {
          let pendingResult = pendingRetiredGeneration.WaitForPresentCompletion(presentationRetirement)
          if pendingResult != VkConstants.VK_SUCCESS {
            throw InvalidOperationException("Vulkan cleanup retired swapchain wait failed")
          }
        } else {
          throw InvalidOperationException("Vulkan cleanup retired swapchain wait skipped because presentation retirement is unavailable")
        }
        pendingRetiredGeneration.Dispose()
        pendingRetiredGeneration = nil
      }
    } catch (error Exception) {
      Console.Error.WriteLine("Vulkan cleanup retired swapchain failed: " + error.ToString())
    }

    try {
      if frameSlot0 != nil {
        let completionResult = frameSlot0.PrepareAcquire()
        if completionResult == VkConstants.VK_SUCCESS {
          frameSlot0.AbortPrepared()
        }
        frameSlot0.Dispose()
      }
    } catch (error Exception) {
      Console.Error.WriteLine("Vulkan cleanup frame slot 0 failed: " + error.ToString())
    }
    frameSlot0 = nil

    try {
      if frameSlot1 != nil {
        let completionResult = frameSlot1.PrepareAcquire()
        if completionResult == VkConstants.VK_SUCCESS {
          frameSlot1.AbortPrepared()
        }
        frameSlot1.Dispose()
      }
    } catch (error Exception) {
      Console.Error.WriteLine("Vulkan cleanup frame slot 1 failed: " + error.ToString())
    }
    frameSlot1 = nil

    try {
      if swapchainGeneration != nil && presentationRetirement != nil {
        let presentationResult = swapchainGeneration.WaitForPresentCompletion(presentationRetirement)
        if presentationResult == VkConstants.VK_SUCCESS {
          swapchainGeneration.Dispose()
        } else {
          Console.Error.WriteLine("Vulkan cleanup swapchain wait failed: " + presentationResult.ToString())
        }
      } else if swapchainGeneration != nil {
        Console.Error.WriteLine("Vulkan cleanup swapchain wait skipped because presentation retirement is unavailable")
      }
    } catch (error Exception) {
      Console.Error.WriteLine("Vulkan cleanup swapchain failed: " + error.ToString())
    }
    swapchainGeneration = nil
    presentationRetirement = nil
    swapchain = uint64(0)
    swapchainCreated = false

    try {
      if queryPoolCreated && destroyQueryPoolAddress != nint(0) {
        let destroyQueryPoolNullable = destroyQueryPoolAddress as (unmanaged[Cdecl](VkDevice, VkQueryPool, *VkAllocationCallbacks) -> void)?
        if destroyQueryPoolNullable != nil {
          let destroyQueryPool = destroyQueryPoolNullable
          destroyQueryPool(device, queryPool, nil)
        }
      }
    } catch (error Exception) {
      Console.Error.WriteLine("Vulkan cleanup query pool failed: " + error.ToString())
    }
    queryPool = uint64(0)
    queryPoolCreated = false

    try {
      if solidQuad != nil {
        solidQuad.Dispose()
      }
    } catch (error Exception) {
      Console.Error.WriteLine("Vulkan cleanup solid quad failed: " + error.ToString())
    }
    solidQuad = nil

    try {
      if commandPoolCreated && destroyCommandPoolAddress != nint(0) {
        let destroyCommandPoolNullable = destroyCommandPoolAddress as (unmanaged[Cdecl](VkDevice, VkCommandPool, *VkAllocationCallbacks) -> void)?
        if destroyCommandPoolNullable != nil {
          let destroyCommandPool = destroyCommandPoolNullable
          destroyCommandPool(device, commandPool, nil)
        }
      }
    } catch (error Exception) {
      Console.Error.WriteLine("Vulkan cleanup command pool failed: " + error.ToString())
    }
    commandPool = uint64(0)
    commandPoolCreated = false
    allocatedCommandBufferCount = 0u
    offscreenCommandBuffer = nint(0)

    try {
      if deviceCreated && destroyDeviceAddress != nint(0) {
        let destroyDeviceNullable = destroyDeviceAddress as (unmanaged[Cdecl](VkDevice, *VkAllocationCallbacks) -> void)?
        if destroyDeviceNullable != nil {
          let destroyDevice = destroyDeviceNullable
          destroyDevice(device, nil)
        }
      }
    } catch (error Exception) {
      Console.Error.WriteLine("Vulkan cleanup device failed: " + error.ToString())
    }
    device = nint(0)
    deviceCreated = false
    queue = nint(0)

    try {
      if swapchainExtensionStorage != nint(0) {
        Marshal.FreeCoTaskMem(swapchainExtensionStorage)
      }
    } catch (error Exception) {
      Console.Error.WriteLine("Vulkan cleanup swapchain extension string failed: " + error.ToString())
    }
    swapchainExtensionStorage = nint(0)

    try {
      if maintenanceExtensionStorage != nint(0) {
        Marshal.FreeCoTaskMem(maintenanceExtensionStorage)
      }
    } catch (error Exception) {
      Console.Error.WriteLine("Vulkan cleanup maintenance extension string failed: " + error.ToString())
    }
    maintenanceExtensionStorage = nint(0)

    try {
      if memoryBudgetExtensionStorage != nint(0) {
        Marshal.FreeCoTaskMem(memoryBudgetExtensionStorage)
      }
    } catch (error Exception) {
      Console.Error.WriteLine("Vulkan cleanup memory budget extension string failed: " + error.ToString())
    }
    memoryBudgetExtensionStorage = nint(0)

    try {
      if surfaceMaintenanceExtensionStorage != nint(0) {
        Marshal.FreeCoTaskMem(surfaceMaintenanceExtensionStorage)
      }
    } catch (error Exception) {
      Console.Error.WriteLine("Vulkan cleanup surface maintenance extension string failed: " + error.ToString())
    }
    surfaceMaintenanceExtensionStorage = nint(0)

    try {
      if surfaceCapabilities2ExtensionStorage != nint(0) {
        Marshal.FreeCoTaskMem(surfaceCapabilities2ExtensionStorage)
      }
    } catch (error Exception) {
      Console.Error.WriteLine("Vulkan cleanup surface capabilities extension string failed: " + error.ToString())
    }
    surfaceCapabilities2ExtensionStorage = nint(0)

    try {
      if debugExtensionNameStorage != nint(0) {
        Marshal.FreeCoTaskMem(debugExtensionNameStorage)
      }
    } catch (error Exception) {
      Console.Error.WriteLine("Vulkan cleanup debug extension string failed: " + error.ToString())
    }
    debugExtensionNameStorage = nint(0)

    try {
      if surfaceCreated {
        SDL_Vulkan_DestroySurface(instance, surface, nil)
      }
    } catch (error Exception) {
      Console.Error.WriteLine("Vulkan cleanup surface failed: " + error.ToString())
    }
    surface = uint64(0)
    surfaceCreated = false

    try {
      if window != nint(0) {
        SDL_DestroyWindow(window)
      }
    } catch (error Exception) {
      Console.Error.WriteLine("Vulkan cleanup window failed: " + error.ToString())
    }
    window = nint(0)

    try {
      if validationMessengerCreated && destroyValidationMessengerAddress != nint(0) {
        let destroyValidationMessengerNullable = destroyValidationMessengerAddress as (unmanaged[Cdecl](VkInstance, VkDebugUtilsMessengerEXT, *VkAllocationCallbacks) -> void)?
        if destroyValidationMessengerNullable != nil {
          let destroyValidationMessenger = destroyValidationMessengerNullable
          destroyValidationMessenger(instance, validationMessenger, nil)
          if let validation = validation {
            validation.KeepAlive()
          }
        }
      }
    } catch (error Exception) {
      Console.Error.WriteLine("Vulkan cleanup validation messenger failed: " + error.ToString())
    }
    validationMessenger = uint64(0)
    validationMessengerCreated = false
    validation = nil

    try {
      if instance != nint(0) && destroyInstanceAddress != nint(0) {
        let destroyInstanceNullable = destroyInstanceAddress as (unmanaged[Cdecl](VkInstance, *VkAllocationCallbacks) -> void)?
        if destroyInstanceNullable != nil {
          let destroyInstance = destroyInstanceNullable
          destroyInstance(instance, nil)
        }
      }
    } catch (error Exception) {
      Console.Error.WriteLine("Vulkan cleanup instance failed: " + error.ToString())
    }
    instance = nint(0)

    try {
      if engineNameStorage != nint(0) {
        Marshal.FreeCoTaskMem(engineNameStorage)
      }
    } catch (error Exception) {
      Console.Error.WriteLine("Vulkan cleanup engine name string failed: " + error.ToString())
    }
    engineNameStorage = nint(0)

    try {
      if appNameStorage != nint(0) {
        Marshal.FreeCoTaskMem(appNameStorage)
      }
    } catch (error Exception) {
      Console.Error.WriteLine("Vulkan cleanup application name string failed: " + error.ToString())
    }
    appNameStorage = nint(0)

    try {
      if vulkanLoaded {
        SDL_Vulkan_UnloadLibrary()
      }
    } catch (error Exception) {
      Console.Error.WriteLine("Vulkan cleanup library failed: " + error.ToString())
    }
    vulkanLoaded = false

    try {
      if sdlInitialized {
        SDL_Quit()
      }
    } catch (error Exception) {
      Console.Error.WriteLine("Vulkan cleanup SDL failed: " + error.ToString())
    }
    sdlInitialized = false

    try {
      if let diagnostics = diagnostics {
        diagnostics.FlushNdjson(Console.Error)
      }
    } catch (error Exception) {
      Console.Error.WriteLine("Vulkan cleanup diagnostics flush failed: " + error.ToString())
    }
    diagnostics = nil
  }
}
