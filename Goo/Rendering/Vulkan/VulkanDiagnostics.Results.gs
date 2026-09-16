package Goo

internal enum VulkanDiagnosticResultClass {
  Success;
  RecoverableWsi;
  NonSuccess;
}

internal class VulkanDiagnosticResultClassifier {
  shared {
    internal func Classify(result VkResult) VulkanDiagnosticResultClass {
      if result == VkConstants.VK_SUCCESS {
        return VulkanDiagnosticResultClass.Success
      }
      return if result == VkConstants.VK_SUBOPTIMAL_KHR { VulkanDiagnosticResultClass.RecoverableWsi } else { VulkanDiagnosticResultClass.NonSuccess }
    }
  }
}
