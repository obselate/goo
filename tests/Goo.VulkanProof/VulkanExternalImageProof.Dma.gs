package Goo

import System

internal unsafe partial class VulkanExternalImageProof {
    shared {
        private func VerifyDmaLifecycle() bool {
            let root = VulkanExternalProofCell{}
            let window = Window{ Title: "DMA-BUF lifecycle proof", Width: 64, Height: 64, VSync: false, Root: root }
            try {
                window.Open()
                WindowReadbackTestFixture.ForceRender(window, 0.0)
                let opened = ExternalImageSession.Open(window)
                if opened.Status == ExternalImageStatus.Unsupported {
                    Console.WriteLine("DMA-BUF import: Unsupported (external memory extension)")
                    return false
                }
                Require(opened.Status == ExternalImageStatus.Success, "DMA-BUF session did not open")
                using let session = opened.Session!!
                if (session.Runtime.Dispatch.ExternalMemoryKinds & 0x200u) == 0u
                    || !ExportSupported(session.Runtime, true) || !SemaphoreSupported(session.Runtime, true) {
                    Console.WriteLine("DMA-BUF import: Unsupported (modifier, memory or sync-FD support)")
                    return false
                }
                guard let target = WindowReadbackTestFixture.CaptureTarget(window) else {
                    throw InvalidOperationException("DMA-BUF target is unavailable")
                }
                using let producerA = target.CreateExternalProducerForProof(false, true, true)
                if !producerA.CanExportPendingSyncFd {
                    Console.WriteLine("DMA-BUF import: Unsupported (producer cannot export a pending sync FD)")
                    return false
                }
                using let producerB = target.CreateExternalProducerForProof(false, true, true)
                if !producerB.CanExportPendingSyncFd {
                    Console.WriteLine("DMA-BUF import: Unsupported (producer cannot export a pending sync FD)")
                    return false
                }
                let description = producerA.Description(session)
                Require(description.Planes.Span[0].RowPitch > uint64(description.Width * 4), "DMA-BUF fixture has no stride padding")
                let importedA = session.ImportVulkan(description)
                if importedA.Status == ExternalImageStatus.UnsupportedFormat {
                    Console.WriteLine("DMA-BUF import: Unsupported (linear sampled modifier)")
                    return false
                }
                Require(importedA.Status == ExternalImageStatus.Success, "DMA-BUF import A failed: " + importedA.Detail)
                using let imageA = importedA.Image!!
                let importedB = session.ImportVulkan(producerB.Description(session))
                Require(importedB.Status == ExternalImageStatus.Success, "DMA-BUF import B failed: " + importedB.Detail)
                using let imageB = importedB.Image!!
                Require(session.ImportVulkan(producerA.Description(session, VkConstants.VK_FORMAT_R8G8B8A8_UNORM)).Status
                    == ExternalImageStatus.UnsupportedFormat, "DMA-BUF failure path accepted an unsupported format")
                using let source = session.CreateSource()
                let frame = ExternalFrameDescription{ X: 2, Y: 1, Width: 4, Height: 2, Orientation: 6,
                    AlphaMode: ExternalImageAlphaMode.Opaque, ColorEncoding: ExternalImageColorEncoding.Srgb }
                Require(source.Publish(imageA, frame, ExternalImageSync{}, (_ ExternalFrameResult) -> { })
                    == ExternalImageStatus.UnsupportedSynchronization, "DMA-BUF accepted missing synchronization")
                var dropped int32 = 0
                var released int32 = 0
                Require(source.Publish(imageA, frame, producerA.Ready(), (result ExternalFrameResult) -> {
                    dropped++
                    Require(result.Status == ExternalFrameStatus.Dropped, "replaced DMA-BUF frame was not dropped")
                }) == ExternalImageStatus.Success, "DMA-BUF frame A was not published")
                Require(source.Publish(imageB, frame, producerB.Ready(), (result ExternalFrameResult) -> {
                    released++
                    Require(result.Status == ExternalFrameStatus.Released, "sampled DMA-BUF frame was not released")
                }) == ExternalImageStatus.Success, "DMA-BUF frame B was not published")
                root.Source = source
                root.Rebuild()
                Capture(window)
                Require(dropped == 0 && released == 0, "unreadied DMA-BUF frame was released")
                producerA.Complete()
                PumpUntil(window, () -> dropped == 1)
                producerB.Complete()
                WaitReady(window, source)
                let capture = Capture(window)
                VerifyPixel(capture, 1u, 1u, 0, 0, 255)
                VerifyPixel(capture, 7u, 1u, 255, 0, 0)
                VerifyPixel(capture, 1u, 7u, 255, 255, 0)
                VerifyPixel(capture, 7u, 7u, 0, 255, 0)
                Capture(window)
                Require(released == 0, "DMA-BUF redraw released the displayed frame")
                imageB.Dispose()
                Require(released == 0, "DMA-BUF logical disposal released the displayed frame")
                source.Dispose()
                PumpUntil(window, () -> released == 1)
                Require(producerA.OriginalHandleOpen && producerA.OriginalSyncHandleOpen
                    && producerB.OriginalHandleOpen && producerB.OriginalSyncHandleOpen, "DMA-BUF import closed caller handles")
                return VerifyDmaClose(window, session, target, frame)
            } finally {
                if window.IsOpen {
                    window.RequestClose()
                    WindowReadbackTestFixture.ForceRender(window, 0.0)
                }
            }
        }

        private func VerifyDmaClose(window Window, session ExternalImageSession,
            target VulkanWindowTarget, frame ExternalFrameDescription) bool {
            using let producer = target.CreateExternalProducerForProof(false, true, true)
            if !producer.CanExportPendingSyncFd {
                Console.WriteLine("DMA-BUF import: Unsupported (producer cannot export a pending sync FD)")
                return false
            }
            let imported = session.ImportVulkan(producer.Description(session))
            Require(imported.Status == ExternalImageStatus.Success, "pending close DMA-BUF import failed")
            using let image = imported.Image!!
            using let source = session.CreateSource()
            var closed ExternalFrameResult?
            var callbacks int32 = 0
            let owner = Environment.CurrentManagedThreadId
            Require(source.Publish(image, frame, producer.Ready(), (result ExternalFrameResult) -> {
                Require(Environment.CurrentManagedThreadId == owner, "DMA-BUF close callback used a foreign thread")
                callbacks++
                closed = result
            }) == ExternalImageStatus.Success, "pending close DMA-BUF frame was not published")
            window.RequestClose()
            WindowReadbackTestFixture.ForceRender(window, 0.0)
            Require(!window.IsOpen && callbacks == 1 && closed?.Status == ExternalFrameStatus.Closed,
                "close did not return the unreadied DMA-BUF frame once")
            guard let dependency = closed?.ReleaseSync as ExternalNativeHandle else {
                throw InvalidOperationException("Close lost the DMA-BUF acquire dependency")
            }
            using let fence = dependency
            Require(ExternalNativeHandle.PollReady(fence) == VkConstants.VK_NOT_READY, "close returned a different acquire fence")
            producer.Complete()
            Require(ExternalNativeHandle.PollReady(fence) == VkConstants.VK_SUCCESS, "returned acquire fence did not complete")
            Require(callbacks == 1 && producer.OriginalHandleOpen && producer.OriginalSyncHandleOpen,
                "close changed DMA-BUF caller ownership")
            return true
        }
    }
}
