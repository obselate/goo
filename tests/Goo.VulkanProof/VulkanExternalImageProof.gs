package Goo

import System
import System.Threading

internal class VulkanExternalProofCell : Cell {
    internal var Source ImageSourceProvider?

    override func Build() Blob {
        if let source = Source {
            return Container{
                Width: 64, Height: 64, Overflow: Overflow.Hidden, BorderRadius: 8,
                Children: [1]Blob{ Image{ Source: source, Width: 64, Height: 64, Fit: ImageFit.Fill } },
            }
        }
        return Container{ Width: 64, Height: 64 }
    }
}

internal unsafe class VulkanExternalImageProof {
    shared {
        private const TimeoutMilliseconds int64 = 5000L

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
            let root = VulkanExternalProofCell{}
            let window = Window{ Title: "External image lifecycle proof", Width: 64, Height: 64, VSync: false, Root: root }
            var session ExternalImageSession?
            var producer VulkanExternalProducer?
            var image ExternalImage?
            var source ExternalImageSource?
            try {
                window.Open()
                WindowReadbackTestFixture.ForceRender(window, 0.0)
                WindowReadbackTestFixture.DrainWindowQueue(window, int32(TimeoutMilliseconds))
                let opened = ExternalImageSession.Open(window)
                if opened.Status == ExternalImageStatus.Unsupported {
                    Console.WriteLine("External image import: Unsupported (external memory extension)")
                    return
                }
                Require(opened.Status == ExternalImageStatus.Success, "session did not open")
                session = opened.Session!!
                guard let target = WindowReadbackTestFixture.CaptureTarget(window) else {
                    throw InvalidOperationException("External image proof target is unavailable")
                }
                if !ExportSupported(session.Runtime) {
                    Console.WriteLine("External image import: Unsupported (driver cannot export and import RGBA images)")
                    return
                }
                let timeline = TimelineSupported(session.Runtime)
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
                PumpUntil(window, () -> {
                    using let lease = source!!.Acquire()
                    return !lease.IsFailed
                })
                let first = Capture(window)
                Require(first.Pixels.Length == int32(first.Width * first.Height * 4u), "capture extent is invalid")
                VerifyPixel(first, 1u, 1u, 0, 0, 255)
                VerifyPixel(first, 3u, 1u, 255, 0, 0)
                VerifyPixel(first, 1u, 3u, 255, 255, 0)
                VerifyPixel(first, 3u, 3u, 0, 255, 0)
                Require(callbacks == 0, "first draw released the retained frame")
                Capture(window)
                Require(callbacks == 0, "redraw released the retained frame")
                image.Dispose()
                Require(callbacks == 0, "logical image disposal released a displayed frame")
                source.Dispose()
                PumpUntil(window, () -> callbacks == 1)
                Require(released == ExternalFrameStatus.Released, "sampled frame did not retire after final GPU use")
                Require(producer.OriginalHandleOpen, "retirement closed the producer memory handle")
                source.Dispose()
                session.Dispose()
                window.Pump(0.0)
                Require(callbacks == 1, "release callback ran more than once")
                Require(session.ImportVulkan(producer.Description(session)).Status == ExternalImageStatus.Closed,
                    "closed session accepted an import")
                Console.WriteLine("External image import: passed (separate device, crop, orientation, capture, retained redraw, final-use release, FD ownership)")
            } finally {
                source?.Dispose()
                image?.Dispose()
                session?.Dispose()
                if window.IsOpen {
                    window.RequestClose()
                    WindowReadbackTestFixture.ForceRender(window, 0.0)
                }
                producer?.Dispose()
            }
        }

        private func VerifyPixel(capture WindowCapture, quarterX uint32, quarterY uint32,
            red int32, green int32, blue int32) {
            let offset = int32((capture.Height * quarterY / 4u * capture.Width + capture.Width * quarterX / 4u) * 4u)
            Require(Math.Abs(int32(capture.Pixels[offset]) - red) < 4
                && Math.Abs(int32(capture.Pixels[offset + 1]) - green) < 4
                && Math.Abs(int32(capture.Pixels[offset + 2]) - blue) < 4
                && capture.Pixels[offset + 3] > 250,
                "crop/orientation at ${quarterX},${quarterY}: RGBA=${capture.Pixels[offset]},"
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
