package Goo.VulkanProof

import System.Runtime.InteropServices
import Goo

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
type VulkanValidationCallback = delegate func(
  severity VkDebugUtilsMessageSeverityFlagBitsEXT,
  types VkDebugUtilsMessageTypeFlagsEXT,
  callbackData nint,
  userData nint) VkBool32

internal unsafe class VulkanValidation {
  private let callback VulkanValidationCallback
  private let diagnostics VulkanDiagnostics

  internal prop Callback VulkanValidationCallback{ get -> callback }

  internal init(diagnostics VulkanDiagnostics) {
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
        diagnostics.CaptureValidation(uint32(severity), uint32(types), callbackDataPointer -> messageIdNumber, callbackDataPointer -> pMessage)
      }
      return VkConstants.VK_FALSE
    }

  internal func KeepAlive() {
    GC.KeepAlive(callback)
  }
}
