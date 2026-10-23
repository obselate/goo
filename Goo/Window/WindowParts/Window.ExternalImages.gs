package Goo

/// Provides external image session creation for a window.
public partial class Window {
    internal func OpenExternalImageSession() ExternalImageSessionResult {
        requireUiThread("ExternalImageSession.Open")
        if !IsOpen { return ExternalImageSessionResult(ExternalImageStatus.Closed) }
        guard let target = windowTarget as VulkanWindowTarget? else {
            return ExternalImageSessionResult(ExternalImageStatus.Unsupported)
        }
        return target.OpenExternalSession(this)
    }
}
