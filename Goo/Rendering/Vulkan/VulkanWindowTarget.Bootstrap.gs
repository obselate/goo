package Goo

import System
import System.Runtime.InteropServices

internal unsafe partial class VulkanWindowTarget {
  private func Bootstrap() {
    if !vulkanLoaded {
      if !host.LoadVulkanLibrary() {
        throw InvalidOperationException("Vulkan loader initialization failed")
      }
      vulkanLoaded = true
      getProcAddress = host.GetVulkanGetInstanceProcAddr()
    }
    if getProcAddress == nint(0) {
      throw InvalidOperationException("Vulkan global procedure lookup is unavailable")
    }
    if let shared = VulkanSharedRuntime.TryAcquire() {
      runtime = shared
      ApplySharedRuntime(shared)
      CreateSurface()
      ValidateSharedPresentationSupport()
    } else {
      if diagnostics == nil {
        diagnostics = VulkanDiagnostics.Create(
          Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1")
      }
      if diagnostics != nil && objectAccounting == nil {
        objectAccounting = VulkanObjectAccounting(nil)
        sharedObjectAccounting = VulkanObjectAccounting(objectAccounting)
        windowObjectAccounting = VulkanObjectAccounting(objectAccounting)
      }
      CreateInstance()
      LoadInstanceDispatch()
      CreateSurface()
      SelectPhysicalDevice()
      CreateDevice()
      LoadDeviceDispatch()
      AcquireQueue()
      var sharedMemoryProperties = VkPhysicalDeviceMemoryProperties{}
      let getMemoryProperties = instanceDispatch.vkGetPhysicalDeviceMemoryProperties
      getMemoryProperties(physicalDevice, &sharedMemoryProperties)
      var sharedPhysicalProperties = VkPhysicalDeviceProperties{}
      let getPhysicalDeviceProperties = instanceDispatch.vkGetPhysicalDeviceProperties
      getPhysicalDeviceProperties(physicalDevice, &sharedPhysicalProperties)
      runtime = VulkanSharedRuntime.Publish(
        instance,
        instanceDispatch,
        physicalDevice,
        device,
        dispatch,
        queue,
        queue,
        queueFamilyIndex,
        queueFamilyIndex,
        deviceWaitIdleAddress,
        instanceMaintenanceVariant,
        swapchainMaintenanceVariant,
        deviceFacts,
        &sharedPhysicalProperties.pipelineCacheUUID[0],
        sharedMemoryProperties,
        sharedPhysicalProperties.limits.maxMemoryAllocationCount,
        sharedPhysicalProperties.limits.maxStorageBufferRange,
        sharedPhysicalProperties.limits.nonCoherentAtomSize,
        sharedPhysicalProperties.limits.bufferImageGranularity,
        memoryBudgetSupported,
        diagnostics,
        debugUtilsEnabled,
        validation,
        validationMessenger,
        validationMessengerCreated,
        instanceDestroyAvailable,
        deviceDestroyAvailable,
        objectAccounting,
        sharedObjectAccounting)
      validation = nil
      validationMessenger = 0uL
      validationMessengerCreated = false
    }
    if let activeRuntime = runtime {
      queueMailbox = activeRuntime.QueueWorker.CreateMailbox(host)
    }
    CreateCommandResources()
  }

  private func CreateSurface() {
    var createdSurface VkSurfaceKHR = 0uL
    if !host.CreateVulkanSurface(instance, out createdSurface) || createdSurface == 0uL {
      throw InvalidOperationException("Vulkan surface creation failed")
    }
    try {
      if let accounting = windowObjectAccounting {
        accounting.Allocate()
      }
    } catch (error Exception) {
      try { host.DestroyVulkanSurface(instance, createdSurface) } catch (cleanup Exception) { }
      throw error
    }
    surface = createdSurface
    surfaceCreated = true
  }

  private func ApplySharedRuntime(shared VulkanSharedLease) {
    diagnostics = shared.Diagnostics
    objectAccounting = shared.ObjectAccounting
    sharedObjectAccounting = nil
    windowObjectAccounting = nil
    if let accounting = objectAccounting {
      sharedObjectAccounting = VulkanObjectAccounting(accounting)
      windowObjectAccounting = VulkanObjectAccounting(accounting)
    }
    instance = shared.Instance
    instanceDispatch = shared.InstanceDispatch
    physicalDevice = shared.PhysicalDevice
    device = shared.Device
    dispatch = shared.Dispatch
    queue = shared.GraphicsQueue
    queueFamilyIndex = shared.GraphicsFamilyIndex
    deviceWaitIdleAddress = shared.DeviceWaitIdleAddress
    instanceMaintenanceVariant = shared.InstanceMaintenanceVariant
    swapchainMaintenanceVariant = shared.SwapchainMaintenanceVariant
    debugUtilsEnabled = shared.DebugUtilsEnabled
    deviceFacts = shared.Facts
    memoryAllocator = shared.MemoryAllocator
    imageResources = shared.ImageResources
    pathResources = shared.PathResources
    timestampValidBits = deviceFacts.TimestampValidBits
    timestampPeriod = deviceFacts.TimestampPeriod
    timestampComputeAndGraphics = deviceFacts.TimestampComputeAndGraphics
    instanceDestroyAvailable = true
    deviceDestroyAvailable = true
  }

  private func ValidateSharedPresentationSupport() {
    var supported VkBool32 = VkConstants.VK_FALSE
    let surfaceSupport = instanceDispatch.vkGetPhysicalDeviceSurfaceSupportKHR
    let result = surfaceSupport(physicalDevice, queueFamilyIndex, surface, &supported)
    if result != VkConstants.VK_SUCCESS || supported != VkConstants.VK_TRUE {
      throw InvalidOperationException("Vulkan shared queue does not support the SDL surface")
    }
  }

  private func CreateInstance() {
    let requiredExtensions = host.GetVulkanInstanceExtensions()
    if requiredExtensions.Length == 0 {
      throw InvalidOperationException("Vulkan instance extensions are unavailable")
    }
    instanceMaintenanceVariant = ResolveInstanceMaintenanceVariant()
    debugUtilsEnabled = diagnostics != nil
      && HasInstanceExtensionName(VkConstants.VK_EXT_DEBUG_UTILS_EXTENSION_NAME)
    validation = VulkanDiagnosticsValidation.Create(diagnostics, debugUtilsEnabled)
    let surfaceMaintenanceName = if instanceMaintenanceVariant == VulkanSwapchainMaintenanceVariant.Khr {
      VulkanWindowTargetExtensionNames.SurfaceMaintenanceKhr
    } else {
      VulkanWindowTargetExtensionNames.SurfaceMaintenanceExt
    }
    let addDebugUtilsExtension = debugUtilsEnabled
      && !ContainsExtensionName(requiredExtensions, VkConstants.VK_EXT_DEBUG_UTILS_EXTENSION_NAME)
    let portabilityEnumerationEnabled = HasInstanceExtensionName(
      VkConstants.VK_KHR_PORTABILITY_ENUMERATION_EXTENSION_NAME)
    let skipRequiredPortabilityEnumeration = !portabilityEnumerationEnabled
      && ContainsExtensionName(
        requiredExtensions, VkConstants.VK_KHR_PORTABILITY_ENUMERATION_EXTENSION_NAME)
    let addPortabilityEnumerationExtension = portabilityEnumerationEnabled
      && !ContainsExtensionName(
        requiredExtensions, VkConstants.VK_KHR_PORTABILITY_ENUMERATION_EXTENSION_NAME)
    var enabledExtensionCount int32 = requiredExtensions.Length
    -(if skipRequiredPortabilityEnumeration { 1 } else { 0 })
    if instanceMaintenanceVariant != VulkanSwapchainMaintenanceVariant.None
      && !ContainsExtensionName(requiredExtensions, surfaceMaintenanceName) {
        enabledExtensionCount = enabledExtensionCount + 1
      }
    if instanceMaintenanceVariant != VulkanSwapchainMaintenanceVariant.None
      && !ContainsExtensionName(requiredExtensions, VkConstants.VK_KHR_GET_SURFACE_CAPABILITIES_2_EXTENSION_NAME) {
        enabledExtensionCount = enabledExtensionCount + 1
      }
    if addDebugUtilsExtension {
      enabledExtensionCount = enabledExtensionCount + 1
    }
    if addPortabilityEnumerationExtension {
      enabledExtensionCount = enabledExtensionCount + 1
    }
    var extensionStorage []nint = [enabledExtensionCount]nint
    var appNameStorage nint = nint(0)
    var engineNameStorage nint = nint(0)
    try {
      let extensionPointers * VulkanWindowTargetExtensionPointer =
      stackalloc[enabledExtensionCount]VulkanWindowTargetExtensionPointer
      var extensionIndex int32 = 0
      var requiredExtensionIndex int32 = 0
      while requiredExtensionIndex < requiredExtensions.Length {
        let requiredExtension = requiredExtensions[requiredExtensionIndex]
        requiredExtensionIndex = requiredExtensionIndex + 1
        if skipRequiredPortabilityEnumeration
          && requiredExtension == VkConstants.VK_KHR_PORTABILITY_ENUMERATION_EXTENSION_NAME{
            continue
          }
        let storage = Marshal.StringToCoTaskMemUTF8(requiredExtension)
        extensionStorage[extensionIndex] = storage
        extensionPointers[extensionIndex].Value = *int8(storage)
        extensionIndex = extensionIndex + 1
      }
      if instanceMaintenanceVariant != VulkanSwapchainMaintenanceVariant.None
        && !ContainsExtensionName(requiredExtensions, surfaceMaintenanceName) {
          let storage = Marshal.StringToCoTaskMemUTF8(surfaceMaintenanceName)
          extensionStorage[extensionIndex] = storage
          extensionPointers[extensionIndex].Value = *int8(storage)
          extensionIndex = extensionIndex + 1
        }
      if instanceMaintenanceVariant != VulkanSwapchainMaintenanceVariant.None
        && !ContainsExtensionName(requiredExtensions, VkConstants.VK_KHR_GET_SURFACE_CAPABILITIES_2_EXTENSION_NAME) {
          let storage = Marshal.StringToCoTaskMemUTF8(VkConstants.VK_KHR_GET_SURFACE_CAPABILITIES_2_EXTENSION_NAME)
          extensionStorage[extensionIndex] = storage
          extensionPointers[extensionIndex].Value = *int8(storage)
          extensionIndex = extensionIndex + 1
        }
      if addDebugUtilsExtension {
        let storage = Marshal.StringToCoTaskMemUTF8(VkConstants.VK_EXT_DEBUG_UTILS_EXTENSION_NAME)
        extensionStorage[extensionIndex] = storage
        extensionPointers[extensionIndex].Value = *int8(storage)
        extensionIndex = extensionIndex + 1
      }
      if addPortabilityEnumerationExtension {
        let storage = Marshal.StringToCoTaskMemUTF8(
          VkConstants.VK_KHR_PORTABILITY_ENUMERATION_EXTENSION_NAME)
        extensionStorage[extensionIndex] = storage
        extensionPointers[extensionIndex].Value = *int8(storage)
        extensionIndex = extensionIndex + 1
      }
      appNameStorage = Marshal.StringToCoTaskMemUTF8("Goo")
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
      if portabilityEnumerationEnabled {
        createInfo.flags = uint32(
          VkConstants.VK_INSTANCE_CREATE_ENUMERATE_PORTABILITY_BIT_KHR)
      }
      createInfo.enabledExtensionCount = uint32(enabledExtensionCount)
      createInfo.ppEnabledExtensionNames = &extensionPointers[0].Value
      var debugMessengerCreateInfo = VkDebugUtilsMessengerCreateInfoEXT{}
      if let currentValidation = validation {
        let callbackAddress = Marshal.GetFunctionPointerForDelegate(currentValidation.Callback)
        let callback = callbackAddress as (unmanaged[Cdecl](VkDebugUtilsMessageSeverityFlagBitsEXT, VkDebugUtilsMessageTypeFlagsEXT, nint, nint) -> VkBool32)?
        if callback == nil {
          throw InvalidOperationException("Vulkan validation callback address is unavailable")
        }
        debugMessengerCreateInfo.sType = VkConstants.VK_STRUCTURE_TYPE_DEBUG_UTILS_MESSENGER_CREATE_INFO_EXT
        debugMessengerCreateInfo.messageSeverity = uint32(VkConstants.VK_DEBUG_UTILS_MESSAGE_SEVERITY_ERROR_BIT_EXT)
        | uint32(VkConstants.VK_DEBUG_UTILS_MESSAGE_SEVERITY_WARNING_BIT_EXT)
        debugMessengerCreateInfo.messageType = uint32(VkConstants.VK_DEBUG_UTILS_MESSAGE_TYPE_GENERAL_BIT_EXT)
        | uint32(VkConstants.VK_DEBUG_UTILS_MESSAGE_TYPE_VALIDATION_BIT_EXT)
        | uint32(VkConstants.VK_DEBUG_UTILS_MESSAGE_TYPE_PERFORMANCE_BIT_EXT)
        debugMessengerCreateInfo.pfnUserCallback = callback!!
        debugMessengerCreateInfo.pUserData = nil
        createInfo.pNext = *void(&debugMessengerCreateInfo)
      }
      if let currentDiagnostics = diagnostics {
        currentDiagnostics.CaptureInstanceFacts(
          VkConstants.VK_API_VERSION_1_3,
          uint32(enabledExtensionCount),
          if debugUtilsEnabled { 1u } else { 0u })
      }
      let address = ResolveGlobalProc(nint(0), "vkCreateInstance")
      let nullable = address as (unmanaged[Cdecl](*VkInstanceCreateInfo, *VkAllocationCallbacks, *VkInstance) -> VkResult)?
      if nullable == nil {
        throw InvalidOperationException("vkCreateInstance is unavailable")
      }
      let createInstance = nullable!!
      var createdInstance VkInstance = nint(0)
      let result = createInstance(&createInfo, nil, &createdInstance)
      if result != VkConstants.VK_SUCCESS || createdInstance == nint(0) {
        throw InvalidOperationException("vkCreateInstance failed: " + result.ToString())
      }
      try {
        if let accounting = sharedObjectAccounting {
          accounting.Allocate()
        }
      } catch (error Exception) {
        let destroyInstance = ResolveGlobalProc(createdInstance, "vkDestroyInstance") as (unmanaged[Cdecl](VkInstance, *VkAllocationCallbacks) -> void)?
        if destroyInstance != nil {
          let destroyInstanceFunction = destroyInstance!!
          destroyInstanceFunction(createdInstance, nil)
        }
        throw error
      }
      instance = createdInstance
      if let currentValidation = validation {
        currentValidation.KeepAlive()
      }
    } finally {
      var index int32 = 0
      while index < extensionStorage.Length {
        if extensionStorage[index] != nint(0) {
          Marshal.FreeCoTaskMem(extensionStorage[index])
          extensionStorage[index] = nint(0)
        }
        index = index + 1
      }
      if appNameStorage != nint(0) {
        Marshal.FreeCoTaskMem(appNameStorage)
      }
      if engineNameStorage != nint(0) {
        Marshal.FreeCoTaskMem(engineNameStorage)
      }
    }
  }

  private func ResolveInstanceMaintenanceVariant() VulkanSwapchainMaintenanceVariant {
    if Environment.GetEnvironmentVariable("GOO_VK_DISABLE_SWAPCHAIN_MAINTENANCE") == "1" {
      return VulkanSwapchainMaintenanceVariant.None
    }
    let address = ResolveGlobalProc(nint(0), "vkEnumerateInstanceExtensionProperties")
    let nullable = address as (unmanaged[Cdecl](*int8, *uint32, *VkExtensionProperties) -> VkResult)?
    if nullable == nil {
      return VulkanSwapchainMaintenanceVariant.None
    }
    let enumerate = nullable!!
    var count uint32 = 0u
    if enumerate(nil, &count, nil) != VkConstants.VK_SUCCESS || count == 0u {
      return VulkanSwapchainMaintenanceVariant.None
    }
    let extensions * VkExtensionProperties = stackalloc[int32(count)]VkExtensionProperties
    if enumerate(nil, &count, extensions) != VkConstants.VK_SUCCESS {
      return VulkanSwapchainMaintenanceVariant.None
    }
    var hasSurfaceExt = false
    var hasSurfaceKhr = false
    var hasCapabilities2 = false
    var index uint32 = 0u
    while index < count {
      if !hasSurfaceExt {
        hasSurfaceExt = ExtensionNameEquals(
          &extensions[index], VulkanWindowTargetExtensionNames.SurfaceMaintenanceExt)
      }
      if !hasSurfaceKhr {
        hasSurfaceKhr = ExtensionNameEquals(
          &extensions[index], VulkanWindowTargetExtensionNames.SurfaceMaintenanceKhr)
      }
      if !hasCapabilities2 {
        hasCapabilities2 = ExtensionNameEquals(
          &extensions[index], VkConstants.VK_KHR_GET_SURFACE_CAPABILITIES_2_EXTENSION_NAME)
      }
      index = index + 1u
    }
    if !hasCapabilities2 {
      return VulkanSwapchainMaintenanceVariant.None
    }
    if hasSurfaceKhr {
      return VulkanSwapchainMaintenanceVariant.Khr
    }
    if hasSurfaceExt {
      return VulkanSwapchainMaintenanceVariant.Ext
    }
    return VulkanSwapchainMaintenanceVariant.None
  }

  private func HasInstanceExtensionName(expected string) bool {
    let address = ResolveGlobalProc(nint(0), "vkEnumerateInstanceExtensionProperties")
    let nullable = address as (unmanaged[Cdecl](*int8, *uint32, *VkExtensionProperties) -> VkResult)?
    if nullable == nil {
      return false
    }
    let enumerate = nullable!!
    var count uint32 = 0u
    if enumerate(nil, &count, nil) != VkConstants.VK_SUCCESS || count == 0u {
      return false
    }
    let extensions * VkExtensionProperties = stackalloc[int32(count)]VkExtensionProperties
    if enumerate(nil, &count, extensions) != VkConstants.VK_SUCCESS {
      return false
    }
    var index uint32 = 0u
    while index < count {
      if ExtensionNameEquals(&extensions[index], expected) {
        return true
      }
      index = index + 1u
    }
    return false
  }

  private func ContainsExtensionName(extensions []string, expected string) bool {
    var index int32 = 0
    while index < extensions.Length {
      if extensions[index] == expected {
        return true
      }
      index = index + 1
    }
    return false
  }

  private func LoadInstanceDispatch() {
    let destroyInstance = ResolveGlobalProc(instance, "vkDestroyInstance") as (unmanaged[Cdecl](VkInstance, *VkAllocationCallbacks) -> void)?
    if destroyInstance == nil { throw InvalidOperationException("vkDestroyInstance is unavailable") }
    instanceDispatch.vkDestroyInstance = destroyInstance!!
    instanceDestroyAvailable = true
    let enumeratePhysicalDevices = ResolveGlobalProc(instance, "vkEnumeratePhysicalDevices") as (unmanaged[Cdecl](VkInstance, *uint32, *VkPhysicalDevice) -> VkResult)?
    if enumeratePhysicalDevices == nil { throw InvalidOperationException("vkEnumeratePhysicalDevices is unavailable") }
    instanceDispatch.vkEnumeratePhysicalDevices = enumeratePhysicalDevices!!
    let getPhysicalDeviceQueueFamilyProperties = ResolveGlobalProc(instance, "vkGetPhysicalDeviceQueueFamilyProperties") as (unmanaged[Cdecl](VkPhysicalDevice, *uint32, *VkQueueFamilyProperties) -> void)?
    if getPhysicalDeviceQueueFamilyProperties == nil { throw InvalidOperationException("vkGetPhysicalDeviceQueueFamilyProperties is unavailable") }
    instanceDispatch.vkGetPhysicalDeviceQueueFamilyProperties = getPhysicalDeviceQueueFamilyProperties!!
    let getPhysicalDeviceProperties = ResolveGlobalProc(instance, "vkGetPhysicalDeviceProperties") as (unmanaged[Cdecl](VkPhysicalDevice, *VkPhysicalDeviceProperties) -> void)?
    if getPhysicalDeviceProperties == nil { throw InvalidOperationException("vkGetPhysicalDeviceProperties is unavailable") }
    instanceDispatch.vkGetPhysicalDeviceProperties = getPhysicalDeviceProperties!!
    let getPhysicalDeviceSurfaceSupport = ResolveGlobalProc(instance, "vkGetPhysicalDeviceSurfaceSupportKHR") as (unmanaged[Cdecl](VkPhysicalDevice, uint32, VkSurfaceKHR, *VkBool32) -> VkResult)?
    if getPhysicalDeviceSurfaceSupport == nil { throw InvalidOperationException("vkGetPhysicalDeviceSurfaceSupportKHR is unavailable") }
    instanceDispatch.vkGetPhysicalDeviceSurfaceSupportKHR = getPhysicalDeviceSurfaceSupport!!
    let getDeviceProcAddr = ResolveGlobalProc(instance, "vkGetDeviceProcAddr") as (unmanaged[Cdecl](VkDevice, *int8) -> unmanaged[Cdecl]() -> void)?
    if getDeviceProcAddr == nil { throw InvalidOperationException("vkGetDeviceProcAddr is unavailable") }
    instanceDispatch.vkGetDeviceProcAddr = getDeviceProcAddr!!
    let getPhysicalDeviceFeatures2 = ResolveGlobalProc(instance, "vkGetPhysicalDeviceFeatures2") as (unmanaged[Cdecl](VkPhysicalDevice, *VkPhysicalDeviceFeatures2) -> void)?
    if getPhysicalDeviceFeatures2 == nil { throw InvalidOperationException("vkGetPhysicalDeviceFeatures2 is unavailable") }
    instanceDispatch.vkGetPhysicalDeviceFeatures2 = getPhysicalDeviceFeatures2!!
    let enumerateDeviceExtensionProperties = ResolveGlobalProc(instance, "vkEnumerateDeviceExtensionProperties") as (unmanaged[Cdecl](VkPhysicalDevice, *int8, *uint32, *VkExtensionProperties) -> VkResult)?
    if enumerateDeviceExtensionProperties == nil { throw InvalidOperationException("vkEnumerateDeviceExtensionProperties is unavailable") }
    instanceDispatch.vkEnumerateDeviceExtensionProperties = enumerateDeviceExtensionProperties!!
    let getPhysicalDeviceSurfaceCapabilities = ResolveGlobalProc(instance, "vkGetPhysicalDeviceSurfaceCapabilitiesKHR") as (unmanaged[Cdecl](VkPhysicalDevice, VkSurfaceKHR, *VkSurfaceCapabilitiesKHR) -> VkResult)?
    if getPhysicalDeviceSurfaceCapabilities == nil { throw InvalidOperationException("vkGetPhysicalDeviceSurfaceCapabilitiesKHR is unavailable") }
    instanceDispatch.vkGetPhysicalDeviceSurfaceCapabilitiesKHR = getPhysicalDeviceSurfaceCapabilities!!
    let getPhysicalDeviceSurfaceFormats = ResolveGlobalProc(instance, "vkGetPhysicalDeviceSurfaceFormatsKHR") as (unmanaged[Cdecl](VkPhysicalDevice, VkSurfaceKHR, *uint32, *VkSurfaceFormatKHR) -> VkResult)?
    if getPhysicalDeviceSurfaceFormats == nil { throw InvalidOperationException("vkGetPhysicalDeviceSurfaceFormatsKHR is unavailable") }
    instanceDispatch.vkGetPhysicalDeviceSurfaceFormatsKHR = getPhysicalDeviceSurfaceFormats!!
    let getPhysicalDeviceSurfacePresentModes = ResolveGlobalProc(instance, "vkGetPhysicalDeviceSurfacePresentModesKHR") as (unmanaged[Cdecl](VkPhysicalDevice, VkSurfaceKHR, *uint32, *VkPresentModeKHR) -> VkResult)?
    if getPhysicalDeviceSurfacePresentModes == nil { throw InvalidOperationException("vkGetPhysicalDeviceSurfacePresentModesKHR is unavailable") }
    instanceDispatch.vkGetPhysicalDeviceSurfacePresentModesKHR = getPhysicalDeviceSurfacePresentModes!!
    let getPhysicalDeviceMemoryProperties = ResolveGlobalProc(instance, "vkGetPhysicalDeviceMemoryProperties") as (unmanaged[Cdecl](VkPhysicalDevice, *VkPhysicalDeviceMemoryProperties) -> void)?
    if getPhysicalDeviceMemoryProperties == nil { throw InvalidOperationException("vkGetPhysicalDeviceMemoryProperties is unavailable") }
    instanceDispatch.vkGetPhysicalDeviceMemoryProperties = getPhysicalDeviceMemoryProperties!!
    let getPhysicalDeviceMemoryProperties2 = ResolveGlobalProc(instance, "vkGetPhysicalDeviceMemoryProperties2") as (unmanaged[Cdecl](VkPhysicalDevice, *VkPhysicalDeviceMemoryProperties2) -> void)?
    if getPhysicalDeviceMemoryProperties2 == nil { throw InvalidOperationException("vkGetPhysicalDeviceMemoryProperties2 is unavailable") }
    instanceDispatch.vkGetPhysicalDeviceMemoryProperties2 = getPhysicalDeviceMemoryProperties2!!
    let getPhysicalDeviceFormatProperties = ResolveGlobalProc(instance, "vkGetPhysicalDeviceFormatProperties") as (unmanaged[Cdecl](VkPhysicalDevice, VkFormat, *VkFormatProperties) -> void)?
    if getPhysicalDeviceFormatProperties == nil { throw InvalidOperationException("vkGetPhysicalDeviceFormatProperties is unavailable") }
    instanceDispatch.vkGetPhysicalDeviceFormatProperties = getPhysicalDeviceFormatProperties!!
    let createDevice = ResolveGlobalProc(instance, "vkCreateDevice") as (unmanaged[Cdecl](VkPhysicalDevice, *VkDeviceCreateInfo, *VkAllocationCallbacks, *VkDevice) -> VkResult)?
    if createDevice == nil { throw InvalidOperationException("vkCreateDevice is unavailable") }
    instanceDispatch.vkCreateDevice = createDevice!!
    if debugUtilsEnabled {
      let createMessenger = ResolveGlobalProc(instance, "vkCreateDebugUtilsMessengerEXT") as (unmanaged[Cdecl](VkInstance, *VkDebugUtilsMessengerCreateInfoEXT, *VkAllocationCallbacks, *VkDebugUtilsMessengerEXT) -> VkResult)?
      if createMessenger == nil { throw InvalidOperationException("vkCreateDebugUtilsMessengerEXT is unavailable") }
      instanceDispatch.vkCreateDebugUtilsMessengerEXT = createMessenger!!
      let destroyMessenger = ResolveGlobalProc(instance, "vkDestroyDebugUtilsMessengerEXT") as (unmanaged[Cdecl](VkInstance, VkDebugUtilsMessengerEXT, *VkAllocationCallbacks) -> void)?
      if destroyMessenger == nil { throw InvalidOperationException("vkDestroyDebugUtilsMessengerEXT is unavailable") }
      instanceDispatch.vkDestroyDebugUtilsMessengerEXT = destroyMessenger!!
      CreateValidationMessenger()
    }
  }

  private func CreateValidationMessenger() {
    if !debugUtilsEnabled || validation == nil || instance == nint(0) {
      return
    }
    let currentValidation = validation!!
    let callbackAddress = Marshal.GetFunctionPointerForDelegate(currentValidation.Callback)
    let callback = callbackAddress as (unmanaged[Cdecl](VkDebugUtilsMessageSeverityFlagBitsEXT, VkDebugUtilsMessageTypeFlagsEXT, nint, nint) -> VkBool32)?
    if callback == nil {
      throw InvalidOperationException("Vulkan validation callback address is unavailable")
    }
    var createInfo = VkDebugUtilsMessengerCreateInfoEXT{}
    createInfo.sType = VkConstants.VK_STRUCTURE_TYPE_DEBUG_UTILS_MESSENGER_CREATE_INFO_EXT
    createInfo.messageSeverity = uint32(VkConstants.VK_DEBUG_UTILS_MESSAGE_SEVERITY_ERROR_BIT_EXT)
    | uint32(VkConstants.VK_DEBUG_UTILS_MESSAGE_SEVERITY_WARNING_BIT_EXT)
    createInfo.messageType = uint32(VkConstants.VK_DEBUG_UTILS_MESSAGE_TYPE_GENERAL_BIT_EXT)
    | uint32(VkConstants.VK_DEBUG_UTILS_MESSAGE_TYPE_VALIDATION_BIT_EXT)
    | uint32(VkConstants.VK_DEBUG_UTILS_MESSAGE_TYPE_PERFORMANCE_BIT_EXT)
    createInfo.pfnUserCallback = callback!!
    createInfo.pUserData = nil
    let createMessenger = instanceDispatch.vkCreateDebugUtilsMessengerEXT
    let result = createMessenger(instance, &createInfo, nil, &validationMessenger)
    RecordDiagnosticResult(VulkanDiagnosticEventIds.ValidationMessage, result)
    if result != VkConstants.VK_SUCCESS || validationMessenger == 0uL {
      validationMessenger = 0uL
      throw InvalidOperationException("vkCreateDebugUtilsMessengerEXT failed: " + result.ToString())
    }
    try {
      if let accounting = sharedObjectAccounting {
        accounting.Allocate()
      }
    } catch (error Exception) {
      let destroyMessenger = instanceDispatch.vkDestroyDebugUtilsMessengerEXT
      destroyMessenger(instance, validationMessenger, nil)
      validationMessenger = 0uL
      throw error
    }
    validationMessengerCreated = true
    currentValidation.KeepAlive()
  }

  private func DestroyValidationMessenger() {
    if validationMessengerCreated && instance != nint(0)
      && instanceDispatch.vkDestroyDebugUtilsMessengerEXT != nil {
        let destroyMessenger = instanceDispatch.vkDestroyDebugUtilsMessengerEXT
        destroyMessenger(instance, validationMessenger, nil)
        if let accounting = sharedObjectAccounting {
          accounting.Release()
        }
        validationMessenger = 0uL
        validationMessengerCreated = false
      }
    if let currentValidation = validation {
      currentValidation.KeepAlive()
    }
  }

  private func SelectPhysicalDevice() {
    var count uint32 = 0u
    let enumerate = instanceDispatch.vkEnumeratePhysicalDevices
    if enumerate(instance, &count, nil) != VkConstants.VK_SUCCESS || count == 0u {
      throw InvalidOperationException("No Vulkan physical device is available")
    }
    let devices * VkPhysicalDevice = stackalloc[int32(count)]VkPhysicalDevice
    if enumerate(instance, &count, devices) != VkConstants.VK_SUCCESS {
      throw InvalidOperationException("Vulkan physical device enumeration failed")
    }
    var deviceIndex uint32 = 0u
    while deviceIndex < count {
      let candidate = devices[deviceIndex]
      var properties = VkPhysicalDeviceProperties{}
      let getProperties = instanceDispatch.vkGetPhysicalDeviceProperties
      getProperties(candidate, &properties)
      if properties.apiVersion >= VkConstants.VK_API_VERSION_1_3
        && HasGraphicsPresentationQueue(candidate)
        && HasRequiredDeviceExtensions(candidate)
        && HasRequiredFeatures(candidate) {
          physicalDevice = candidate
          CaptureDiagnosticDeviceFacts(properties)
          timestampPeriod = properties.limits.timestampPeriod
          timestampComputeAndGraphics = properties.limits.timestampComputeAndGraphics
          deviceFacts = VulkanSharedDeviceFacts{
            ApiVersion: properties.apiVersion,
            DriverVersion: properties.driverVersion,
            VendorId: properties.vendorID,
            DeviceId: properties.deviceID,
            DeviceType: properties.deviceType,
            TimestampValidBits: timestampValidBits,
            TimestampPeriod: timestampPeriod,
            TimestampComputeAndGraphics: timestampComputeAndGraphics,
          }
          CaptureDiagnosticTimestampCapabilities()
          return
        }
      deviceIndex = deviceIndex + 1u
    }
    throw InvalidOperationException("No Vulkan physical device satisfies the Goo presentation requirements")
  }

  private func HasGraphicsPresentationQueue(candidate VkPhysicalDevice) bool {
    var count uint32 = 0u
    let getProperties = instanceDispatch.vkGetPhysicalDeviceQueueFamilyProperties
    getProperties(candidate, &count, nil)
    if count == 0u {
      return false
    }
    let families * VkQueueFamilyProperties = stackalloc[int32(count)]VkQueueFamilyProperties
    getProperties(candidate, &count, families)
    var familyIndex uint32 = 0u
    while familyIndex < count {
      let family = families[familyIndex]
      if family.queueCount > 0u
        && (family.queueFlags & uint32(VkConstants.VK_QUEUE_GRAPHICS_BIT)) != 0u {
          var supported VkBool32 = VkConstants.VK_FALSE
          let surfaceSupport = instanceDispatch.vkGetPhysicalDeviceSurfaceSupportKHR
          let supportResult = surfaceSupport(
            candidate, familyIndex, surface, &supported)
          if supportResult == VkConstants.VK_SUCCESS && supported == VkConstants.VK_TRUE {
            queueFamilyIndex = familyIndex
            timestampValidBits = family.timestampValidBits
            return true
          }
        }
      familyIndex = familyIndex + 1u
    }
    return false
  }

  private func HasRequiredDeviceExtensions(candidate VkPhysicalDevice) bool {
    swapchainMaintenanceVariant = VulkanSwapchainMaintenanceVariant.None
    portabilitySubsetSupported = false
    memoryBudgetSupported = false
    var count uint32 = 0u
    let enumerate = instanceDispatch.vkEnumerateDeviceExtensionProperties
    if enumerate(candidate, nil, &count, nil) != VkConstants.VK_SUCCESS || count == 0u {
      return false
    }
    let extensions * VkExtensionProperties = stackalloc[int32(count)]VkExtensionProperties
    if enumerate(candidate, nil, &count, extensions) != VkConstants.VK_SUCCESS {
      return false
    }
    var hasSwapchain = false
    var hasMaintenanceExt = false
    var hasMaintenanceKhr = false
    var hasPortabilitySubset = false
    var hasMemoryBudget = false
    var index uint32 = 0u
    while index < count {
      if ExtensionNameEquals(&extensions[index], VkConstants.VK_KHR_SWAPCHAIN_EXTENSION_NAME) {
        hasSwapchain = true
      }
      if ExtensionNameEquals(&extensions[index], VulkanWindowTargetExtensionNames.SwapchainMaintenanceExt) {
        hasMaintenanceExt = true
      }
      if ExtensionNameEquals(&extensions[index], VulkanWindowTargetExtensionNames.SwapchainMaintenanceKhr) {
        hasMaintenanceKhr = true
      }
      if ExtensionNameEquals(&extensions[index], VkConstants.VK_KHR_PORTABILITY_SUBSET_EXTENSION_NAME) {
        hasPortabilitySubset = true
      }
      if ExtensionNameEquals(&extensions[index], VkConstants.VK_EXT_MEMORY_BUDGET_EXTENSION_NAME) {
        hasMemoryBudget = true
      }
      index = index + 1u
    }
    if instanceMaintenanceVariant == VulkanSwapchainMaintenanceVariant.Khr && hasMaintenanceKhr {
      swapchainMaintenanceVariant = VulkanSwapchainMaintenanceVariant.Khr
    } else if instanceMaintenanceVariant == VulkanSwapchainMaintenanceVariant.Ext && hasMaintenanceExt {
      swapchainMaintenanceVariant = VulkanSwapchainMaintenanceVariant.Ext
    }
    if !hasSwapchain {
      return false
    }
    portabilitySubsetSupported = hasPortabilitySubset
    memoryBudgetSupported = hasMemoryBudget
    return true
  }

  private func HasRequiredFeatures(candidate VkPhysicalDevice) bool {
    var features2 = VkPhysicalDeviceFeatures2{}
    var features12 = VkPhysicalDeviceVulkan12Features{}
    var features13 = VkPhysicalDeviceVulkan13Features{}
    var maintenance = VkPhysicalDeviceSwapchainMaintenance1FeaturesEXT{}
    features2.sType = VkConstants.VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_FEATURES_2
    features2.pNext = *void(&features12)
    features12.sType = VkConstants.VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_VULKAN_1_2_FEATURES
    features12.pNext = *void(&features13)
    features13.sType = VkConstants.VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_VULKAN_1_3_FEATURES
    if swapchainMaintenanceVariant != VulkanSwapchainMaintenanceVariant.None {
      features13.pNext = *void(&maintenance)
      maintenance.sType = VkConstants.VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_SWAPCHAIN_MAINTENANCE_1_FEATURES_EXT
    }
    let getFeatures = instanceDispatch.vkGetPhysicalDeviceFeatures2
    getFeatures(candidate, &features2)
    let maintenanceSupported = swapchainMaintenanceVariant == VulkanSwapchainMaintenanceVariant.None
      || maintenance.swapchainMaintenance1 == VkConstants.VK_TRUE
    var textFormatProperties = VkFormatProperties{}
    let getFormatProperties = instanceDispatch.vkGetPhysicalDeviceFormatProperties
    getFormatProperties(candidate, VkConstants.VK_FORMAT_R16G16B16A16_SINT,
      &textFormatProperties)
    let textBufferSupported = (textFormatProperties.bufferFeatures
      &uint32(VkConstants.VK_FORMAT_FEATURE_UNIFORM_TEXEL_BUFFER_BIT)) != 0u
    return textBufferSupported
      && features12.timelineSemaphore == VkConstants.VK_TRUE
      && features13.synchronization2 == VkConstants.VK_TRUE
      && features13.dynamicRendering == VkConstants.VK_TRUE
      && maintenanceSupported
  }

  private func CreateDevice() {
    var features2 = VkPhysicalDeviceFeatures2{}
    var features12 = VkPhysicalDeviceVulkan12Features{}
    var features13 = VkPhysicalDeviceVulkan13Features{}
    var maintenance = VkPhysicalDeviceSwapchainMaintenance1FeaturesEXT{}
    features2.sType = VkConstants.VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_FEATURES_2
    features2.pNext = *void(&features12)
    features12.sType = VkConstants.VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_VULKAN_1_2_FEATURES
    features12.pNext = *void(&features13)
    features12.timelineSemaphore = VkConstants.VK_TRUE
    features13.sType = VkConstants.VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_VULKAN_1_3_FEATURES
    features13.synchronization2 = VkConstants.VK_TRUE
    features13.dynamicRendering = VkConstants.VK_TRUE
    if swapchainMaintenanceVariant != VulkanSwapchainMaintenanceVariant.None {
      features13.pNext = *void(&maintenance)
      maintenance.sType = VkConstants.VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_SWAPCHAIN_MAINTENANCE_1_FEATURES_EXT
      maintenance.swapchainMaintenance1 = VkConstants.VK_TRUE
    }
    let priorities * float32 = stackalloc[1]float32{1.0F}
    var queueInfo = VkDeviceQueueCreateInfo{}
    queueInfo.sType = VkConstants.VK_STRUCTURE_TYPE_DEVICE_QUEUE_CREATE_INFO
    queueInfo.queueFamilyIndex = queueFamilyIndex
    queueInfo.queueCount = 1u
    queueInfo.pQueuePriorities = priorities
    var extensionStorage []nint = [4]nint
    try {
      extensionStorage[0] = Marshal.StringToCoTaskMemUTF8(VkConstants.VK_KHR_SWAPCHAIN_EXTENSION_NAME)
      let extensionPointers * VulkanWindowTargetExtensionPointer = stackalloc[4]VulkanWindowTargetExtensionPointer
      extensionPointers[0].Value = *int8(extensionStorage[0])
      var deviceExtensionCount uint32 = 1u
      if portabilitySubsetSupported {
        let extensionIndex = int32(deviceExtensionCount)
        extensionStorage[extensionIndex] = Marshal.StringToCoTaskMemUTF8(
          VkConstants.VK_KHR_PORTABILITY_SUBSET_EXTENSION_NAME)
        extensionPointers[extensionIndex].Value = *int8(extensionStorage[extensionIndex])
        deviceExtensionCount = deviceExtensionCount + 1u
      }
      if swapchainMaintenanceVariant != VulkanSwapchainMaintenanceVariant.None {
        let extensionIndex = int32(deviceExtensionCount)
        extensionStorage[extensionIndex] = Marshal.StringToCoTaskMemUTF8(MaintenanceDeviceExtensionName())
        extensionPointers[extensionIndex].Value = *int8(extensionStorage[extensionIndex])
        deviceExtensionCount = deviceExtensionCount + 1u
      }
      if memoryBudgetSupported {
        let extensionIndex = int32(deviceExtensionCount)
        extensionStorage[extensionIndex] = Marshal.StringToCoTaskMemUTF8(VkConstants.VK_EXT_MEMORY_BUDGET_EXTENSION_NAME)
        extensionPointers[extensionIndex].Value = *int8(extensionStorage[extensionIndex])
        deviceExtensionCount = deviceExtensionCount + 1u
      }
      var createInfo = VkDeviceCreateInfo{}
      createInfo.sType = VkConstants.VK_STRUCTURE_TYPE_DEVICE_CREATE_INFO
      createInfo.pNext = *void(&features2)
      createInfo.queueCreateInfoCount = 1u
      createInfo.pQueueCreateInfos = &queueInfo
      createInfo.enabledExtensionCount = deviceExtensionCount
      createInfo.ppEnabledExtensionNames = &extensionPointers[0].Value
      let createDevice = instanceDispatch.vkCreateDevice
      var createdDevice VkDevice = nint(0)
      let result = createDevice(physicalDevice, &createInfo, nil, &createdDevice)
      if result != VkConstants.VK_SUCCESS || createdDevice == nint(0) {
        throw InvalidOperationException("vkCreateDevice failed: " + result.ToString())
      }
      try {
        if let accounting = sharedObjectAccounting {
          accounting.Allocate()
        }
      } catch (error Exception) {
        let destroyDevice = ResolveGlobalProc(instance, "vkDestroyDevice") as (unmanaged[Cdecl](VkDevice, *VkAllocationCallbacks) -> void)?
        if destroyDevice != nil {
          let destroyDeviceFunction = destroyDevice!!
          destroyDeviceFunction(createdDevice, nil)
        }
        throw error
      }
      device = createdDevice
    } finally {
      var index int32 = 0
      while index < extensionStorage.Length {
        if extensionStorage[index] != nint(0) {
          Marshal.FreeCoTaskMem(extensionStorage[index])
          extensionStorage[index] = nint(0)
        }
        index = index + 1
      }
    }
  }

  private func CreateCommandResources() {
    guard let activeRuntime = runtime else {
      throw InvalidOperationException("Vulkan shared runtime is unavailable")
    }
    memoryAllocator = activeRuntime.MemoryAllocator
    imageResources = activeRuntime.ImageResources
    pathResources = activeRuntime.PathResources
    if let currentDiagnostics = diagnostics {
      let currentTimestampState = VulkanDiagnosticTimestampState(currentDiagnostics, windowObjectAccounting)
      timestampState = currentTimestampState
      currentTimestampState.CreateTimestampQueryPool(
        device,
        dispatch,
        timestampValidBits,
        timestampPeriod,
        timestampComputeAndGraphics,
        activeRuntime)
    }
    let buffers * VkCommandBuffer = stackalloc[2]VkCommandBuffer
    let commandAllocation = VulkanCommandFactory.CreatePoolAndAllocate(
      device,
      dispatch,
      windowObjectAccounting,
      queueFamilyIndex,
      uint32(VkConstants.VK_COMMAND_POOL_CREATE_TRANSIENT_BIT)
      | uint32(VkConstants.VK_COMMAND_POOL_CREATE_RESET_COMMAND_BUFFER_BIT),
      VkConstants.VK_COMMAND_BUFFER_LEVEL_PRIMARY,
      2u,
      buffers)
    commandPool = commandAllocation.Pool
    commandBufferObjectCount = commandAllocation.BufferCount
    frameSlots.Create(
      device,
      dispatch,
      buffers[0],
      buffers[1],
      windowObjectAccounting,
      activeRuntime)
    imageScene = VulkanImageScene(
      activeRuntime.ImageIdentityRegistry,
      activeRuntime.ImageResources,
      activeRuntime.Generation)
    pathScene = VulkanPathScene(activeRuntime.PathResources)
    var physicalProperties = VkPhysicalDeviceProperties{}
    let getPhysicalDeviceProperties = instanceDispatch.vkGetPhysicalDeviceProperties
    getPhysicalDeviceProperties(physicalDevice, &physicalProperties)
    clipMaskFormatSupport = QueryClipMaskFormatSupport()
    let maxAtlasBytes = uint64(physicalProperties.limits.maxTexelBufferElements) * 8uL
    let atlasByteSize = ResolveTextAtlasByteSize(maxAtlasBytes)
    if atlasByteSize < 8192uL {
      throw InvalidOperationException("Vulkan text atlas capacity is too small")
    }
    if atlasByteSize > uint64.MaxValue / 8uL {
      throw OverflowException("Vulkan text atlas byte budget overflow")
    }
    let atlasByteBudget = atlasByteSize * 8uL
    textAtlas = VulkanTextAtlasSet(device, dispatch, memoryAllocator!!, atlasByteSize,
      physicalProperties.limits.maxTexelBufferElements,
      activeRuntime.PrimitiveState.TextDescriptorSetLayout, windowObjectAccounting,
      diagnostics,
      atlasByteBudget, activeRuntime.Generation)
    textScene = VulkanTextScene(textAtlas!!)
    if let currentDiagnostics = diagnostics {
      textAtlasDiagnosticsToken = currentDiagnostics.RegisterTextAtlasContribution()
    }
  }

  private func QueryClipMaskFormatSupport() VulkanClipMaskFormatSupport {
    let getFormatProperties = instanceDispatch.vkGetPhysicalDeviceFormatProperties
    var r8Properties = VkFormatProperties{}
    var rgba8Properties = VkFormatProperties{}
    getFormatProperties(physicalDevice, VkConstants.VK_FORMAT_R8_UNORM, &r8Properties)
    getFormatProperties(physicalDevice, VkConstants.VK_FORMAT_R8G8B8A8_UNORM, &rgba8Properties)
    let sampledImage = uint32(VkConstants.VK_FORMAT_FEATURE_SAMPLED_IMAGE_BIT)
    let colorAttachment = uint32(VkConstants.VK_FORMAT_FEATURE_COLOR_ATTACHMENT_BIT)
    let linearFilter = uint32(VkConstants.VK_FORMAT_FEATURE_SAMPLED_IMAGE_FILTER_LINEAR_BIT)
    return VulkanClipMaskFormatSupport{
      R8UnormSampledImage: (r8Properties.optimalTilingFeatures & sampledImage) != 0u,
      R8UnormColorAttachment: (r8Properties.optimalTilingFeatures & colorAttachment) != 0u,
      R8UnormLinearFilter: (r8Properties.optimalTilingFeatures & linearFilter) != 0u,
      Rgba8UnormSampledImage: (rgba8Properties.optimalTilingFeatures & sampledImage) != 0u,
      Rgba8UnormColorAttachment: (rgba8Properties.optimalTilingFeatures & colorAttachment) != 0u,
      Rgba8UnormLinearFilter: (rgba8Properties.optimalTilingFeatures & linearFilter) != 0u,
    }
  }

  private func ResolveTextAtlasByteSize(maxAtlasBytes uint64) uint64 {
    var atlasByteSize = maxAtlasBytes < 262144uL ? maxAtlasBytes : 262144uL
    if diagnostics == nil
      || Environment.GetEnvironmentVariable("GOO_TEXT_ATLAS_SMOKE") != "1" {
        return atlasByteSize
      }
    let overrideValue = Environment.GetEnvironmentVariable("GOO_VK_TEXT_ATLAS_BYTES")
    if overrideValue != nil && overrideValue != "" {
      try {
        let requested = UInt64.Parse(overrideValue)
        if requested >= 8192uL && requested <= 262144uL && requested <= maxAtlasBytes {
          let aligned = requested - (requested % 8uL)
          if aligned >= 8192uL {
            atlasByteSize = aligned
          }
        }
      } catch (error Exception) { }
    }
    return atlasByteSize
  }

  private func AcquireQueue() {
    var acquiredQueue VkQueue = nint(0)
    let getDeviceQueue = dispatch.vkGetDeviceQueue
    getDeviceQueue(device, queueFamilyIndex, 0u, &acquiredQueue)
    if acquiredQueue == nint(0) {
      throw InvalidOperationException("Vulkan queue acquisition failed")
    }
    queue = acquiredQueue
  }

  private func MaintenanceDeviceExtensionName() string {
    if swapchainMaintenanceVariant == VulkanSwapchainMaintenanceVariant.Khr {
      return VulkanWindowTargetExtensionNames.SwapchainMaintenanceKhr
    }
    return VulkanWindowTargetExtensionNames.SwapchainMaintenanceExt
  }
}
