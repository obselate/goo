package Goo

import System
import System.Runtime.InteropServices

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkImageDrmFormatModifierListCreateInfoEXT {
    var sType int32
    var pNext *void
    var drmFormatModifierCount uint32
    var pDrmFormatModifiers *uint64
}

@StructLayout(LayoutKind.Sequential)
internal struct VkExternalProofImageSubresource {
    var aspectMask uint32
    var mipLevel uint32
    var arrayLayer uint32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkExternalProofSemaphoreSignalInfo {
    var sType int32
    var pNext *void
    var semaphore VkSemaphore
    var value uint64
}

internal unsafe sealed partial class VulkanExternalProducer {
    private const CompletionTimeoutMilliseconds int32 = 5000
    private const PendingExportProbeMilliseconds int32 = 1000
    private let dma bool
    private let syncFd bool
    private let signalAddress nint
    private let layoutAddress nint
    private var gate VkSemaphore
    private var readyBinary VkSemaphore
    private var plane VkSubresourceLayout
    private var completed bool
    private var pendingExport bool
    private var gateSignaled bool

    internal prop OriginalSyncHandleOpen bool { get -> semaphoreHandle?.IsClosed == false }
    internal prop CanExportPendingSyncFd bool { get -> pendingExport && semaphoreHandle?.IsInvalid == false }

    private func ReadDmaLayout() {
        let query = layoutAddress as (unmanaged[Cdecl](VkDevice, VkImage, *VkExternalProofImageSubresource, *VkSubresourceLayout) -> void)?
        if query == nil { throw NotSupportedException("DMA-BUF plane layout query is unavailable") }
        var subresource = VkExternalProofImageSubresource{ aspectMask: 0x80u }
        query(device, image, &subresource, &plane)
    }

    private func DescribePlanes() ReadOnlyMemory[ExternalImagePlane] -> if dma {
        ReadOnlyMemory[ExternalImagePlane]([1]ExternalImagePlane{ ExternalImagePlane{ Offset: plane.offset, RowPitch: plane.rowPitch } })
    } else { default(ReadOnlyMemory[ExternalImagePlane]) }

    private func PrepareSyncFd() {
        var typeInfo = VkSemaphoreTypeCreateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_SEMAPHORE_TYPE_CREATE_INFO,
            semaphoreType: VkConstants.VK_SEMAPHORE_TYPE_TIMELINE }
        var info = VkSemaphoreCreateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_SEMAPHORE_CREATE_INFO, pNext: *void(&typeInfo) }
        let create = dispatch.vkCreateSemaphore
        Check(create(device, &info, nil, &gate))
        var exportInfo = VkExportSemaphoreCreateInfo{ sType: 1000077000, handleTypes: 16u }
        info.pNext = *void(&exportInfo)
        Check(create(device, &info, nil, &readyBinary))
        Submit()
        using let done = System.Threading.ManualResetEvent(false)
        var failure Exception?
        let worker = System.Threading.Thread(() -> {
            try { ExportSyncFd() }
            catch (error Exception) { failure = error }
            finally { done.Set() }
        })
        worker.IsBackground = true
        worker.Start()
        pendingExport = done.WaitOne(PendingExportProbeMilliseconds)
        if !pendingExport { SignalGate() }
        if !done.WaitOne(CompletionTimeoutMilliseconds) { throw TimeoutException("Sync-FD export did not complete") }
        worker.Join()
        if let error = failure { throw error }
        if !pendingExport { WaitCompletion() }
    }

    private func ExportSyncFd() {
        let exportFd = semaphoreFdAddress as (unmanaged[Cdecl](VkDevice, *VkSemaphoreGetFdInfoKHR, *int32) -> VkResult)?
        if exportFd == nil { throw NotSupportedException("Sync-FD export is unavailable") }
        var fdInfo = VkSemaphoreGetFdInfoKHR{ sType: 1000079001, semaphore: readyBinary, handleType: 16u }
        var fd int32 = -1
        Check(exportFd(device, &fdInfo, &fd))
        semaphoreHandle = ExternalNativeHandle(nint(fd), false)
    }

    private func SignalGate() {
        if gateSignaled { return }
        let signal = signalAddress as (unmanaged[Cdecl](VkDevice, *VkExternalProofSemaphoreSignalInfo) -> VkResult)?
        if signal == nil { throw NotSupportedException("Producer timeline signal is unavailable") }
        var info = VkExternalProofSemaphoreSignalInfo{ sType: 1000207005, semaphore: gate, value: 1uL }
        Check(signal(device, &info))
        gateSignaled = true
    }

    private func WaitSyncFd() {
        let deadline = Environment.TickCount64 + int64(CompletionTimeoutMilliseconds)
        var result VkResult = VkConstants.VK_NOT_READY
        while Environment.TickCount64 < deadline {
            result = ExternalNativeHandle.PollReady(semaphoreHandle!!)
            if result != VkConstants.VK_NOT_READY { break }
            System.Threading.Thread.Yield()
        }
        Check(result)
    }

    private func DestroySyncFd() {
        let destroy = dispatch.vkDestroySemaphore
        if readyBinary != 0uL { destroy(device, readyBinary, nil) }
        if gate != 0uL { destroy(device, gate, nil) }
    }
}
