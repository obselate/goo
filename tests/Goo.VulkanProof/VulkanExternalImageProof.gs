package Goo

import System
import System.Threading

internal class VulkanExternalProofCell : Cell {
    internal var Source ImageSourceProvider?
    internal var Opacity float32 = 1.0F

    override func Build() Blob {
        if let source = Source {
            return Container{
                Width: 64, Height: 64, Overflow: Overflow.Hidden, BorderRadius: 8,
                Children: [1]Blob{ Image{ Source: source, Width: 64, Height: 64, Fit: ImageFit.Fill, Opacity: Opacity } },
            }
        }
        return Container{ Width: 64, Height: 64 }
    }
}

internal unsafe class VulkanExternalImageProof {
    shared {
        private const TimeoutMilliseconds int64 = 5000L
        private const SampleGrid uint32 = 8u

        private func Require(condition bool, detail string) {
            if !condition { throw InvalidOperationException("External image proof: " + detail) }
        }

        private func PumpUntil(window Window, condition (() -> bool)) {
            let deadline = Environment.TickCount64 + TimeoutMilliseconds
            while Environment.TickCount64 < deadline {
                if condition() { return }
                window.Pump(0.0)
                Thread.Yield()
            }
            Require(false, "operation did not complete")
        }

        private func WaitReady(window Window, source ExternalImageSource) {
            PumpUntil(window, () -> {
                using let lease = source.Acquire()
                return !lease.IsFailed
            })
        }

        private func Capture(window Window) WindowCapture {
            WindowReadbackTestFixture.DrainWindowQueue(window, int32(TimeoutMilliseconds))
            Require(window.RequestCapture() == WindowCaptureRequestStatus.Accepted, "capture request was not accepted")
            var capture WindowCapture?
            PumpUntil(window, () -> {
                capture = window.PollCapture()
                return capture != nil
            })
            return capture!!
        }

        internal func Run() {
            if !OperatingSystem.IsLinux() {
                Console.WriteLine("External image import: Unsupported (Linux FD producer proof)")
                return
            }
            let previous = Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS")
            let originalError = Console.Error
            using let capturedError = System.IO.StringWriter()
            Environment.SetEnvironmentVariable("GOO_VK_DIAGNOSTICS", "1")
            Console.SetError(capturedError)
            try {
                if !VerifyLifecycle() { return }
            } catch (error Exception) {
                originalError.Write(capturedError.ToString())
                throw error
            } finally {
                Console.SetError(originalError)
                Environment.SetEnvironmentVariable("GOO_VK_DIAGNOSTICS", previous)
            }
            let diagnostics = capturedError.ToString()
            for line in diagnostics.Split('\n') {
                if !line.Contains("\"validationErrorCount\":") { continue }
                using let json = System.Text.Json.JsonDocument.Parse(line)
                Require(json.RootElement.GetProperty("validationErrorCount").GetUInt64() == 0uL,
                    "Vulkan validation rejected the lifecycle: " + diagnostics)
            }
            Console.WriteLine("External image import: passed (two devices, two windows, crop, capture, redraw, release, device loss, close, FD ownership)")
        }

        private func VerifyLifecycle() bool {
            let root = VulkanExternalProofCell{}
            let window = Window{ Title: "External image lifecycle proof", Width: 64, Height: 64, VSync: false, Root: root }
            var session ExternalImageSession?
            var producer VulkanExternalProducer?
            var image ExternalImage?
            var source ExternalImageSource?
            var secondWindow Window?
            try {
                window.Open()
                WindowReadbackTestFixture.ForceRender(window, 0.0)
                WindowReadbackTestFixture.DrainWindowQueue(window, int32(TimeoutMilliseconds))
                let opened = ExternalImageSession.Open(window)
                if opened.Status == ExternalImageStatus.Unsupported {
                    Console.WriteLine("External image import: Unsupported (external memory extension)")
                    return false
                }
                Require(opened.Status == ExternalImageStatus.Success, "session did not open")
                session = opened.Session!!
                guard let target = WindowReadbackTestFixture.CaptureTarget(window) else {
                    throw InvalidOperationException("External image proof target is unavailable")
                }
                if !ExportSupported(session.Runtime) {
                    Console.WriteLine("External image import: Unsupported (driver cannot export and import RGBA images)")
                    return false
                }
                let timeline = TimelineSupported(session.Runtime)
                Console.WriteLine("External image readiness: timeline=${timeline}")
                producer = target.CreateExternalProducerForProof(timeline)
                if !timeline { producer.Complete() }
                let imported = session.ImportVulkan(producer.Description(session))
                Require(imported.Status == ExternalImageStatus.Success, "import failed: " + imported.Detail)
                image = imported.Image!!
                Require(producer.OriginalHandleOpen, "import closed the producer memory handle")
                Require(session.ImportMetalTexture(nint(1)).Status == ExternalImageStatus.Unsupported, "foreign platform import did not report Unsupported")
                source = session.CreateSource()
                var callbacks int32 = 0
                var released ExternalFrameStatus = ExternalFrameStatus.Closed
                let owner = Environment.CurrentManagedThreadId
                let frame = ExternalFrameDescription{ X: 2, Y: 1, Width: 4, Height: 2, Orientation: 6,
                    AlphaMode: ExternalImageAlphaMode.Opaque, ColorEncoding: ExternalImageColorEncoding.Srgb }
                let ready = producer.Ready()
                Require(source.Publish(image, frame, ExternalImageSync{ Kind: ExternalImageSyncKind.OpaqueFdSemaphore,
                    ImageLayout: VkConstants.VK_IMAGE_LAYOUT_GENERAL, QueueFamily: 0xFFFFFFFEu }, (_ ExternalFrameResult) -> { })
                    == ExternalImageStatus.UnsupportedSynchronization, "binary producer wait was accepted without a readiness queue")
                root.Source = source
                root.Rebuild()
                VerifyLatest(window, target, session, source, image, frame, ready, timeline, (result ExternalFrameResult) -> {
                    Require(Environment.CurrentManagedThreadId == owner, "release callback used a foreign thread")
                    callbacks++
                    released = result.Status
                })
                if timeline { producer.Complete() }
                Require(source.Publish(image, frame, ready, (_ ExternalFrameResult) -> { }) == ExternalImageStatus.Busy,
                    "an in-use ring slot was accepted for another write")
                WaitReady(window, source)
                let first = Capture(window)
                Require(first.Pixels.Length == int32(first.Width * first.Height * 4u), "capture extent is invalid")
                Require(Math.Abs(int32(first.Pixels[0]) - int32(first.Pixels[2])) < 4, "rounded clip did not mask the imported image")
                VerifyPixel(first, 1u, 1u, 0, 0, 255)
                VerifyPixel(first, 7u, 1u, 255, 0, 0)
                VerifyPixel(first, 1u, 7u, 255, 255, 0)
                VerifyPixel(first, 7u, 7u, 0, 255, 0)
                secondWindow = Window{ Title: "External image shared device proof", Width: 64, Height: 64, VSync: false,
                    Root: VulkanExternalProofCell{ Source: source } }
                secondWindow.Open()
                let second = Capture(secondWindow)
                VerifyPixel(second, 1u, 1u, 0, 0, 255)
                VerifyPixel(second, 7u, 7u, 0, 255, 0)
                Require(callbacks == 0, "first draw released the retained frame")
                Capture(window)
                Require(callbacks == 0, "redraw released the retained frame")
                image.Dispose()
                Require(callbacks == 0, "logical image disposal released a displayed frame")
                source.Dispose()
                PumpUntil(window, () -> {
                    secondWindow!!.Pump(0.0)
                    return callbacks == 1
                })
                Require(released == ExternalFrameStatus.Released, "sampled frame did not retire after final GPU use")
                Require(producer.OriginalHandleOpen, "retirement closed the producer memory handle")
                source.Dispose()
                session.Dispose()
                window.Pump(0.0)
                Require(callbacks == 1, "release callback ran more than once")
                Require(session.ImportVulkan(producer.Description(session)).Status == ExternalImageStatus.Closed,
                    "closed session accepted an import")
                secondWindow.RequestClose()
                WindowReadbackTestFixture.ForceRender(secondWindow, 0.0)
                VerifyRecoveryAndClose(window, root, producer, frame, owner)
            } finally {
                source?.Dispose()
                image?.Dispose()
                session?.Dispose()
                if let other = secondWindow {
                    if other.IsOpen {
                        other.RequestClose()
                        WindowReadbackTestFixture.ForceRender(other, 0.0)
                    }
                }
                if window.IsOpen {
                    window.RequestClose()
                    WindowReadbackTestFixture.ForceRender(window, 0.0)
                }
                producer?.Dispose()
            }
            return true
        }

        private func VerifyRecoveryAndClose(window Window, root VulkanExternalProofCell,
            producer VulkanExternalProducer, frame ExternalFrameDescription, owner int32) {
            let opened = ExternalImageSession.Open(window)
            Require(opened.Status == ExternalImageStatus.Success, "recovery session did not open")
            using let session = opened.Session!!
            let imported = session.ImportVulkan(producer.Description(session))
            Require(imported.Status == ExternalImageStatus.Success, "recovery image import failed")
            using let image = imported.Image!!
            using let source = session.CreateSource()
            var callbacks int32 = 0
            var status ExternalFrameStatus = ExternalFrameStatus.Closed
            Require(source.Publish(image, frame, producer.Ready(), (result ExternalFrameResult) -> {
                Require(Environment.CurrentManagedThreadId == owner, "device-loss callback used a foreign thread")
                callbacks++
                status = result.Status
            }) == ExternalImageStatus.Success, "recovery frame was not published")
            root.Source = source
            root.Rebuild()
            WaitReady(window, source)
            Capture(window)
            producer.Dispose()
            VulkanSharedRuntime.FailNextGraphicsSubmissionForTest()
            root.Opacity = 0.5F
            root.Rebuild()
            WindowReadbackTestFixture.ForceRender(window, 0.0)
            PumpUntil(window, () -> callbacks == 1)
            Require(callbacks == 1 && status == ExternalFrameStatus.DeviceLost, "device loss did not complete the frame once")
            using let lease = source.Acquire()
            Require(lease.IsFailed, "a foreign frame survived device loss")
            let reopened = ExternalImageSession.Open(window)
            Require(reopened.Status == ExternalImageStatus.Success, "session did not reopen after device loss")
            using let next = reopened.Session!!
            Require(next.Generation != session.Generation, "device loss reused the old generation")
            VerifyClose(window, root, next, frame, owner)
        }

        private func VerifyClose(window Window, root VulkanExternalProofCell,
            session ExternalImageSession, frame ExternalFrameDescription, owner int32) {
            guard let target = WindowReadbackTestFixture.CaptureTarget(window) else {
                throw InvalidOperationException("Recovered external image target is unavailable")
            }
            using let producer = target.CreateExternalProducerForProof(TimelineSupported(session.Runtime))
            producer.Complete()
            let imported = session.ImportVulkan(producer.Description(session))
            Require(imported.Status == ExternalImageStatus.Success, "close image import failed")
            using let image = imported.Image!!
            using let source = session.CreateSource()
            var callbacks int32 = 0
            var status ExternalFrameStatus = ExternalFrameStatus.Closed
            Require(source.Publish(image, frame, producer.Ready(), (result ExternalFrameResult) -> {
                Require(Environment.CurrentManagedThreadId == owner, "close callback used a foreign thread")
                status = result.Status
                callbacks++
            }) == ExternalImageStatus.Success, "close frame was not published")
            root.Source = source
            root.Rebuild()
            WaitReady(window, source)
            Capture(window)
            window.RequestClose()
            WindowReadbackTestFixture.ForceRender(window, 0.0)
            Require(!window.IsOpen && callbacks == 1, "close did not complete the frame once")
            Require(status == ExternalFrameStatus.Released, "close did not return a sampled frame")
            Require(producer.OriginalHandleOpen, "close took ownership of the producer handle")
        }

        private func VerifyPixel(capture WindowCapture, sampleX uint32, sampleY uint32,
            red int32, green int32, blue int32) {
            let offset = int32((capture.Height * sampleY / SampleGrid * capture.Width + capture.Width * sampleX / SampleGrid) * 4u)
            Require(Math.Abs(int32(capture.Pixels[offset]) - red) < 4
                && Math.Abs(int32(capture.Pixels[offset + 1]) - green) < 4
                && Math.Abs(int32(capture.Pixels[offset + 2]) - blue) < 4
                && capture.Pixels[offset + 3] > 250,
                "crop/orientation at ${sampleX},${sampleY}: RGBA=${capture.Pixels[offset]},"
                + "${capture.Pixels[offset + 1]},${capture.Pixels[offset + 2]},${capture.Pixels[offset + 3]}")
        }

        private func VerifyLatest(window Window, target VulkanWindowTarget, session ExternalImageSession,
            source ExternalImageSource, image ExternalImage, frame ExternalFrameDescription,
            ready ExternalImageSync, timeline bool, released Action[ExternalFrameResult]) {
            using let pendingProducer = target.CreateExternalProducerForProof(timeline)
            if !timeline { pendingProducer.Complete() }
            let imported = session.ImportVulkan(pendingProducer.Description(session))
            Require(imported.Status == ExternalImageStatus.Success, "pending ring import failed")
            using let pendingImage = imported.Image!!
            var dropped int32 = 0
            let before = source.ContentVersion
            Require(source.Publish(pendingImage, frame, pendingProducer.Ready(), (result ExternalFrameResult) -> {
                Require(result.Status == ExternalFrameStatus.Dropped, "replaced pending frame was sampled")
                dropped++
            }) == ExternalImageStatus.Success, "pending publication failed")
            Require(source.Publish(image, frame, ready, released) == ExternalImageStatus.Success, "latest publication failed")
            Require(source.ContentVersion > before, "publication did not advance the source version")
            if timeline { Require(dropped == 0, "unready pending frame was released") }
            Capture(window)
            if timeline {
                Require(dropped == 0, "capture released an unready frame")
                pendingProducer.Complete()
            }
            PumpUntil(window, () -> dropped == 1)
            Require(pendingProducer.OriginalHandleOpen, "dropped frame closed its producer memory handle")
        }

        private func TimelineSupported(runtime VulkanSharedLease) bool {
            if (runtime.Dispatch.ExternalSemaphoreKinds & 1u) == 0u { return false }
            var timeline = VkSemaphoreTypeCreateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_SEMAPHORE_TYPE_CREATE_INFO,
                semaphoreType: VkConstants.VK_SEMAPHORE_TYPE_TIMELINE }
            var info = VkPhysicalDeviceExternalSemaphoreInfo{ sType: 1000076000, pNext: *void(&timeline), handleType: 1u }
            var properties = VkExternalSemaphoreProperties{ sType: 1000076001 }
            let query = runtime.InstanceDispatch.vkGetPhysicalDeviceExternalSemaphoreProperties
            query(runtime.PhysicalDevice, &info, &properties)
            return (properties.externalSemaphoreFeatures & 3u) == 3u
        }

        private func ExportSupported(runtime VulkanSharedLease) bool {
            var external = VkPhysicalDeviceExternalImageFormatInfo{ sType: 1000071000, handleType: 1u }
            var info = VkPhysicalDeviceImageFormatInfo2{ sType: 1000059004, pNext: *void(&external),
                format: VkConstants.VK_FORMAT_R8G8B8A8_SRGB, imageType: VkConstants.VK_IMAGE_TYPE_2D,
                tiling: VkConstants.VK_IMAGE_TILING_OPTIMAL,
                usage: uint32(VkConstants.VK_IMAGE_USAGE_SAMPLED_BIT) | uint32(VkConstants.VK_IMAGE_USAGE_TRANSFER_DST_BIT) }
            var externalProperties = VkExternalImageFormatProperties{ sType: 1000071001 }
            var properties = VkImageFormatProperties2{ sType: 1000059003, pNext: *void(&externalProperties) }
            let query = runtime.InstanceDispatch.vkGetPhysicalDeviceImageFormatProperties2
            return query(runtime.PhysicalDevice, &info, &properties) == VkConstants.VK_SUCCESS
                && (externalProperties.externalMemoryProperties.externalMemoryFeatures & 6u) == 6u
        }
    }
}
