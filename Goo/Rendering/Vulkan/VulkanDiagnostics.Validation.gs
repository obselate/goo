package Goo

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

  internal prop Callback VulkanDiagnosticsValidationCallback{ get -> callback }

  private init(diagnostics VulkanDiagnostics) {
    this.diagnostics = diagnostics
    callback = (severity, types, callbackData, userData) -> OnValidation(severity, types, callbackData, userData)
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
