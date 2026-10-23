package Goo

import System

public unsafe sealed partial class ExternalImageSession {
    private func ImportMetalReady(frame ExternalFrameLease) ExternalImageStatus {
        if !OperatingSystem.IsMacOS() || !Runtime.Dispatch.MetalObjects || !frame.Sync.Timeline {
            return ExternalImageStatus.UnsupportedSynchronization
        }
        guard let original = frame.Sync.Handle else { throw ArgumentException("A Metal shared event is required", "ready") }
        var dependency MetalObjectHandle?
        var retained bool = false
        try {
            original.DangerousAddRef(ref retained)
            if original.IsClosed || original.IsInvalid { throw ObjectDisposedException("ready") }
            dependency = MetalObjectHandle(original.DangerousGetHandle())
        } finally {
            if retained { original.DangerousRelease() }
        }
        var accepted bool = false
        try {
            let value = dependency!!.DangerousGetHandle()
            if !MetalObjectHandle.SameDevice(value, Runtime.Dispatch.MetalDevice) { return ExternalImageStatus.WrongDevice }
            var typeInfo = VkSemaphoreTypeCreateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_SEMAPHORE_TYPE_CREATE_INFO,
                semaphoreType: VkConstants.VK_SEMAPHORE_TYPE_TIMELINE }
            var eventInfo = VkImportMetalSharedEventInfoEXT{ sType: 1000311011, pNext: *void(&typeInfo), mtlSharedEvent: value }
            var info = VkSemaphoreCreateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_SEMAPHORE_CREATE_INFO, pNext: *void(&eventInfo) }
            var semaphore VkSemaphore
            let create = Runtime.Dispatch.vkCreateSemaphore
            let result = create(Runtime.Device, &info, nil, &semaphore)
            if result != VkConstants.VK_SUCCESS {
                return if result == VkConstants.VK_ERROR_DEVICE_LOST { ExternalImageStatus.DeviceLost } else { ExternalImageStatus.Failed }
            }
            frame.ReadySemaphore = semaphore
            frame.ReadyHandle = dependency
            accepted = true
            return ExternalImageStatus.Success
        } finally {
            if !accepted { dependency?.Dispose() }
        }
    }
}
