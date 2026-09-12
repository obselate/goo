package Goo

import System
import System.Runtime.InteropServices

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate VulkanDiagnosticsValidationCallback(
  severity VkDebugUtilsMessageSeverityFlagBitsEXT,
  types VkDebugUtilsMessageTypeFlagsEXT,
  callbackData nint,
  userData nint) VkBool32;

internal unsafe class VulkanDiagnosticsValidation {
  private let callback VulkanDiagnosticsValidationCallback
  private let diagnostics VulkanDiagnostics

  shared {
    func Create(diagnostics VulkanDiagnostics?, enabled bool) VulkanDiagnosticsValidation? {
      if !enabled || diagnostics == nil {
        return nil
      }
      return VulkanDiagnosticsValidation(diagnostics)
    }
  }

  private init(diagnostics VulkanDiagnostics) {
    this.diagnostics = diagnostics
    callback = (severity, types, callbackData, userData) -> OnValidation(severity, types, callbackData, userData)
  }

  internal func CreateInfo() VkDebugUtilsMessengerCreateInfoEXT {
    let callbackAddress = Marshal.GetFunctionPointerForDelegate(callback)
    let nativeCallback = callbackAddress as (unmanaged[Cdecl](VkDebugUtilsMessageSeverityFlagBitsEXT, VkDebugUtilsMessageTypeFlagsEXT, nint, nint) -> VkBool32)?
    if nativeCallback == nil {
      throw InvalidOperationException("Vulkan validation callback address is unavailable")
    }
    var createInfo = VkDebugUtilsMessengerCreateInfoEXT{}
    createInfo.sType = VkConstants.VK_STRUCTURE_TYPE_DEBUG_UTILS_MESSENGER_CREATE_INFO_EXT
    createInfo.messageSeverity = uint32(VkConstants.VK_DEBUG_UTILS_MESSAGE_SEVERITY_ERROR_BIT_EXT)
    | uint32(VkConstants.VK_DEBUG_UTILS_MESSAGE_SEVERITY_WARNING_BIT_EXT)
    createInfo.messageType = uint32(VkConstants.VK_DEBUG_UTILS_MESSAGE_TYPE_GENERAL_BIT_EXT)
    | uint32(VkConstants.VK_DEBUG_UTILS_MESSAGE_TYPE_VALIDATION_BIT_EXT)
    | uint32(VkConstants.VK_DEBUG_UTILS_MESSAGE_TYPE_PERFORMANCE_BIT_EXT)
    createInfo.pfnUserCallback = nativeCallback
    createInfo.pUserData = nil
    return createInfo
  }

  private func OnValidation(
    severity VkDebugUtilsMessageSeverityFlagBitsEXT,
    types VkDebugUtilsMessageTypeFlagsEXT,
    callbackData nint,
    userData nint) VkBool32{
      if callbackData != nint(0) {
        let callbackDataPointer = *VkDebugUtilsMessengerCallbackDataEXT(callbackData)
        diagnostics.CaptureValidation(
          uint32(severity),
          uint32(types),
          callbackDataPointer -> messageIdNumber,
          callbackDataPointer -> pMessage)
      }
      return VkConstants.VK_FALSE
    }

  internal func KeepAlive() {
    GC.KeepAlive(callback)
  }
}
