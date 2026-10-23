package Goo

import System
import System.Runtime.InteropServices

internal sealed class VulkanMetalProducer : IDisposable {
    private var state nint
    private let ready MetalObjectHandle

    internal init(device nint) {
        state = Create(device)
        if state == nint(0) { throw InvalidOperationException("Metal producer creation failed") }
        ready = MetalObjectHandle(GetEvent(state))
    }

    internal prop Texture nint { get -> GetTexture(state) }
    internal prop Surface nint { get -> GetSurface(state) }
    internal prop ReleaseCount int32 { get -> GetReleaseCount(state) }
    internal func Ready() ExternalImageSync -> ExternalImageSync{
        Kind: ExternalImageSyncKind.MetalSharedEvent, Handle: ready, Timeline: true, Value: 1uL,
        ImageLayout: VkConstants.VK_IMAGE_LAYOUT_GENERAL, QueueFamily: 0xFFFFFFFEu }
    internal func Complete() {
        if CompleteNative(state) != 1 { throw InvalidOperationException("Metal producer command did not complete") }
    }
    internal func DropTexture() { DropTextureNative(state) }
    internal func ReleaseFrame() { ReleaseFrameNative(state) }
    public func Dispose() {
        if state == nint(0) { return }
        ready.Dispose()
        Destroy(state)
        state = nint(0)
    }

    shared {
        @DllImport("goo-external-metal-proof", EntryPoint: "goo_external_metal_create")
        private func Create(device nint) nint;
        @DllImport("goo-external-metal-proof", EntryPoint: "goo_external_metal_texture")
        private func GetTexture(state nint) nint;
        @DllImport("goo-external-metal-proof", EntryPoint: "goo_external_metal_surface")
        private func GetSurface(state nint) nint;
        @DllImport("goo-external-metal-proof", EntryPoint: "goo_external_metal_event")
        private func GetEvent(state nint) nint;
        @DllImport("goo-external-metal-proof", EntryPoint: "goo_external_metal_complete")
        private func CompleteNative(state nint) int32;
        @DllImport("goo-external-metal-proof", EntryPoint: "goo_external_metal_drop_texture")
        private func DropTextureNative(state nint);
        @DllImport("goo-external-metal-proof", EntryPoint: "goo_external_metal_release_frame")
        private func ReleaseFrameNative(state nint);
        @DllImport("goo-external-metal-proof", EntryPoint: "goo_external_metal_release_count")
        private func GetReleaseCount(state nint) int32;
        @DllImport("goo-external-metal-proof", EntryPoint: "goo_external_metal_destroy")
        private func Destroy(state nint);
    }
}

internal unsafe partial class VulkanExternalImageProof {
    shared {
        internal func RunMetal() {
            if !OperatingSystem.IsMacOS() {
                Console.WriteLine("Metal external image import: Unsupported (macOS producer proof)")
                return
            }
            let previous = Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS")
            let originalError = Console.Error
            using let captured = System.IO.StringWriter()
            Environment.SetEnvironmentVariable("GOO_VK_DIAGNOSTICS", "1")
            Console.SetError(captured)
            try {
                VerifyMetalLifecycle()
            } catch (error Exception) {
                originalError.Write(captured.ToString())
                throw error
            } finally {
                Console.SetError(originalError)
                Environment.SetEnvironmentVariable("GOO_VK_DIAGNOSTICS", previous)
            }
            for line in captured.ToString().Split('\n') {
                if !line.Contains("\"validationErrorCount\":") { continue }
                using let json = System.Text.Json.JsonDocument.Parse(line)
                Require(json.RootElement.GetProperty("validationErrorCount").GetUInt64() == 0uL, "Metal import emitted Vulkan validation errors")
            }
            Console.WriteLine("Metal external image import: passed (texture, IOSurface, CVPixelBuffer, shared events, crop, capture, redraw, release, close dependency)")
        }

        private func VerifyMetalLifecycle() {
            let root = VulkanExternalProofCell{}
            let window = Window{ Title: "Metal external image proof", Width: 64, Height: 64, VSync: false, Root: root }
            try {
                window.Open()
                WindowReadbackTestFixture.ForceRender(window, 0.0)
                let opened = ExternalImageSession.Open(window)
                Require(opened.Status == ExternalImageStatus.Success, "bundled MoltenVK did not expose Metal import: " + opened.Detail)
                using let session = opened.Session!!
                let device = session.Runtime.Dispatch.MetalDevice
                Require(device != nint(0), "bundled MoltenVK did not export its Metal device")
                let frame = ExternalFrameDescription{ X: 2, Y: 1, Width: 4, Height: 2, Orientation: 6,
                    AlphaMode: ExternalImageAlphaMode.Opaque, ColorEncoding: ExternalImageColorEncoding.Srgb }
                VerifyMetalTextures(window, root, session, device, frame)
                VerifyMetalSurface(window, root, session, device, frame)
                VerifyMetalClose(window, session, device, frame)
            } finally {
                if window.IsOpen {
                    window.RequestClose()
                    WindowReadbackTestFixture.ForceRender(window, 0.0)
                }
            }
        }

        private func VerifyMetalTextures(window Window, root VulkanExternalProofCell,
            session ExternalImageSession, device nint, frame ExternalFrameDescription) {
            using let producerA = VulkanMetalProducer(device)
            using let producerB = VulkanMetalProducer(device)
            let importedA = session.ImportMetalTexture(producerA.Texture)
            let importedB = session.ImportMetalTexture(producerB.Texture)
            Require(importedA.Status == ExternalImageStatus.Success && importedB.Status == ExternalImageStatus.Success,
                "Metal texture import failed: " + importedA.Detail + importedB.Detail)
            using let imageA = importedA.Image!!
            using let imageB = importedB.Image!!
            using let source = session.CreateSource()
            var dropped int32 = 0
            var released int32 = 0
            Require(source.Publish(imageA, frame, producerA.Ready(), (result ExternalFrameResult) -> {
                dropped++
                Require(result.Status == ExternalFrameStatus.Dropped, "replaced Metal frame was not dropped")
                producerA.ReleaseFrame()
            }) == ExternalImageStatus.Success, "Metal frame A was not published")
            Require(source.Publish(imageB, frame, producerB.Ready(), (result ExternalFrameResult) -> {
                released++
                Require(result.Status == ExternalFrameStatus.Released, "sampled Metal frame was not released")
                producerB.ReleaseFrame()
            }) == ExternalImageStatus.Success, "Metal frame B was not published")
            root.Source = source
            root.Rebuild()
            Capture(window)
            Require(dropped == 0 && released == 0, "an unreadied Metal frame was recycled")
            producerA.Complete()
            PumpUntil(window, () -> dropped == 1)
            Require(producerA.ReleaseCount == 1, "dropped CVPixelBuffer was not released once")
            producerB.Complete()
            producerB.DropTexture()
            WaitReady(window, source)
            let capture = Capture(window)
            VerifyPixel(capture, 1u, 1u, 0, 0, 255)
            VerifyPixel(capture, 7u, 1u, 255, 0, 0)
            VerifyPixel(capture, 1u, 7u, 255, 255, 0)
            VerifyPixel(capture, 7u, 7u, 0, 255, 0)
            Capture(window)
            Require(released == 0 && producerB.ReleaseCount == 0, "redraw recycled the displayed CVPixelBuffer")
            imageB.Dispose()
            Require(released == 0, "logical Metal image disposal released the displayed frame")
            source.Dispose()
            PumpUntil(window, () -> released == 1)
            Require(producerB.ReleaseCount == 1, "sampled CVPixelBuffer was not released once")
        }

        private func VerifyMetalSurface(window Window, root VulkanExternalProofCell,
            session ExternalImageSession, device nint, frame ExternalFrameDescription) {
            using let producer = VulkanMetalProducer(device)
            let imported = session.ImportMetalIoSurface(producer.Surface, 0)
            Require(imported.Status == ExternalImageStatus.Success, "IOSurface import failed: " + imported.Detail)
            using let image = imported.Image!!
            using let source = session.CreateSource()
            var released int32 = 0
            Require(source.Publish(image, frame, producer.Ready(), (result ExternalFrameResult) -> {
                released++
                Require(result.Status == ExternalFrameStatus.Released, "IOSurface frame was not released")
                producer.ReleaseFrame()
            }) == ExternalImageStatus.Success, "IOSurface frame was not published")
            root.Source = source
            root.Rebuild()
            producer.Complete()
            producer.DropTexture()
            WaitReady(window, source)
            let capture = Capture(window)
            VerifyPixel(capture, 1u, 1u, 0, 0, 255)
            VerifyPixel(capture, 7u, 7u, 0, 255, 0)
            image.Dispose()
            source.Dispose()
            PumpUntil(window, () -> released == 1)
            Require(producer.ReleaseCount == 1, "IOSurface owner was not released once")
        }

        private func VerifyMetalClose(window Window, session ExternalImageSession,
            device nint, frame ExternalFrameDescription) {
            using let producer = VulkanMetalProducer(device)
            let imported = session.ImportMetalTexture(producer.Texture)
            Require(imported.Status == ExternalImageStatus.Success, "pending Metal texture import failed")
            using let image = imported.Image!!
            using let source = session.CreateSource()
            var result ExternalFrameResult?
            var callbacks int32 = 0
            Require(source.Publish(image, frame, producer.Ready(), (value ExternalFrameResult) -> {
                callbacks++
                result = value
            }) == ExternalImageStatus.Success, "pending Metal frame was not published")
            window.RequestClose()
            WindowReadbackTestFixture.ForceRender(window, 0.0)
            PumpUntil(window, () -> !window.IsOpen)
            Require(!window.IsOpen && callbacks == 1 && result?.Status == ExternalFrameStatus.Closed,
                "close did not return the pending Metal frame once")
            let closed = result!!
            using let dependency = closed.ReleaseSync!!
            Require(MetalObjectHandle.Integer(dependency.DangerousGetHandle(), "signaledValue") < closed.Value,
                "close did not preserve the pending shared event")
            producer.Complete()
            Require(MetalObjectHandle.Integer(dependency.DangerousGetHandle(), "signaledValue") >= closed.Value,
                "returned shared event did not complete")
            producer.ReleaseFrame()
            Require(callbacks == 1 && producer.ReleaseCount == 1, "close recycled a Metal frame more than once")
        }
    }
}
