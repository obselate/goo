package Goo

import System
import System.Collections.Generic
import System.Threading

/// Imports GPU images for one device generation. Open, import and Dispose require the window owner thread.
public sealed partial class ExternalImageSession : IDisposable {
    internal const FrameCapacity int32 = 64
    internal let Gate object = Object()
    internal let Runtime VulkanSharedLease
    private let window Window
    private let ownerThread int32
    private let frames []ExternalFrameLease? = [FrameCapacity]ExternalFrameLease?
    private let images List[ExternalImage] = List[ExternalImage]()
    private let sources List[ExternalImageSource] = List[ExternalImageSource]()
    private let timer Timer
    private let pump Action
    private var posted int32
    private var closed bool
    private var disposed bool
    private var closeStatus ExternalImageStatus
    private var callbackError Exception?
    private let deviceUuid []uint8 = [16]uint8
    private let driverUuid []uint8 = [16]uint8
    private var windowsDevice ExternalImageWindowsDevice?

    /// Raised once on the owner thread when the session closes or its device is lost.
    public event Invalidated Action[ExternalImageStatus]

    /// Gets the device generation. Imports never survive a device change.
    public prop Generation uint64 { get -> Runtime.Generation }
    /// Gets the 16-byte physical device UUID.
    public prop DeviceUuid ReadOnlyMemory[uint8] { get -> ReadOnlyMemory[uint8](deviceUuid) }
    /// Gets the 16-byte driver UUID.
    public prop DriverUuid ReadOnlyMemory[uint8] { get -> ReadOnlyMemory[uint8](driverUuid) }
    /// Gets Windows adapter identity, or nil when the driver does not expose a LUID.
    public prop WindowsDevice ExternalImageWindowsDevice? { get -> windowsDevice }
    internal prop IsClosed bool { get -> closed }
    internal prop NativeDisposed bool { get -> disposed }

    shared {
        /// Opens a session after the window has created its presentation device.
        /// @param window The owning window.
        /// @returns Success with a session, or an explicit device or platform status.
        public func Open(window Window) ExternalImageSessionResult {
            if Object.ReferenceEquals(window, nil) { throw ArgumentNullException("window") }
            return window.OpenExternalImageSession()
        }
    }

    internal init(owner Window, runtime VulkanSharedLease) {
        window = owner
        Runtime = runtime
        ownerThread = Environment.CurrentManagedThreadId
        ReadDeviceIdentity()
        pump = () -> {
            Interlocked.Exchange(ref posted, 0)
            Pump()
        }
        CreateReleaseCommands()
        timer = Timer((_ object?) -> { PollDependencies() }, nil, Timeout.Infinite, Timeout.Infinite)
    }

    private func PollDependencies() {
        lock Gate {
            if disposed { return }
            for frame in frames {
                if let current = frame {
                    if !current.Ready && current.ReadyResult == VkConstants.VK_NOT_READY {
                        current.ReadyResult = PollReady(current)
                    }
                }
            }
        }
        Wake()
    }

    private func RequireOwner() {
        if Environment.CurrentManagedThreadId != ownerThread { throw InvalidOperationException("External image operation requires the window owner thread") }
    }

    /// Imports a ring slot. The caller keeps the original memory handle and allocation.
    /// @param description Exact exported allocation metadata.
    /// @returns Success with a caller-owned imported image, or an explicit import status.
    public func ImportVulkan(description VulkanExternalImageDescription) ExternalImageResult {
        RequireOwner()
        if Object.ReferenceEquals(description, nil) { throw ArgumentNullException("description") }
        if description.Width <= 0 || description.Height <= 0 || description.AllocationSize == 0uL
            || description.DeviceUuid.Length != 16 || description.DriverUuid.Length != 16
            || Object.ReferenceEquals(description.Memory, nil) { throw ArgumentException("Invalid external allocation description", "description") }
        lock Gate {
            if closed { return ExternalImageResult(closeStatus) }
            if Runtime.DeviceLost { return ExternalImageResult(ExternalImageStatus.DeviceLost) }
            if !description.DeviceUuid.Span.SequenceEqual(DeviceUuid.Span)
                || !description.DriverUuid.Span.SequenceEqual(DriverUuid.Span) { return ExternalImageResult(ExternalImageStatus.WrongDevice) }
            var retiredIndex = images.Count - 1
            while retiredIndex >= 0 {
                if images[retiredIndex].Native.Closed && !images[retiredIndex].Native.Busy { images.RemoveAt(retiredIndex) }
                retiredIndex--
            }
            if images.Count >= FrameCapacity { return ExternalImageResult(ExternalImageStatus.Busy) }
            let result = VulkanExternalImage.Import(Runtime, description)
            if let image = result.Image {
                image.Session = this
                images.Add(image)
            }
            return result
        }
    }

    /// Retains an Android buffer and normalizes its qualified SDR samples to sRGB on the GPU without CPU readback.
    /// @param buffer A borrowed AHardwareBuffer pointer. Keep its AImage lease until the frame release callback.
    /// @returns Success with a retained buffer, or an explicit platform or format status.
    public func ImportAndroidHardwareBuffer(buffer nint) ExternalImageResult {
        RequireOwner()
        if buffer == nint(0) { throw ArgumentNullException("buffer") }
        lock Gate {
            if closed { return ExternalImageResult(closeStatus) }
            if Runtime.DeviceLost { return ExternalImageResult(ExternalImageStatus.DeviceLost) }
            var index = images.Count - 1
            while index >= 0 {
                if images[index].Native.Closed && !images[index].Native.Busy { images.RemoveAt(index) }
                index--
            }
            if images.Count >= FrameCapacity { return ExternalImageResult(ExternalImageStatus.Busy) }
            let result = VulkanExternalImage.ImportAndroid(Runtime, buffer)
            if let image = result.Image {
                image.Session = this
                images.Add(image)
            }
            return result
        }
    }

    /// Imports a retained Metal texture when the platform route is available.
    /// @param texture A borrowed MTLTexture pointer.
    /// @returns Unsupported on platforms without the Metal import route.
    public func ImportMetalTexture(texture nint) ExternalImageResult -> ExternalImageResult(ExternalImageStatus.Unsupported)

    /// Imports a retained IOSurface plane when the platform route is available.
    /// @param surface A borrowed IOSurface pointer.
    /// @param plane The surface plane index.
    /// @returns Unsupported on platforms without the Metal import route.
    public func ImportMetalIoSurface(surface nint, plane int32) ExternalImageResult -> ExternalImageResult(ExternalImageStatus.Unsupported)

    /// Creates a bounded latest-frame image provider.
    /// @returns A caller-owned provider for images from this session.
    public func CreateSource() ExternalImageSource {
        RequireOwner()
        lock Gate {
            if closed { throw ObjectDisposedException("ExternalImageSession") }
            if sources.Count >= FrameCapacity { throw InvalidOperationException("External image source capacity reached") }
            let source = ExternalImageSource(this)
            sources.Add(source)
            return source
        }
    }

    internal func Accept(frame ExternalFrameLease) ExternalImageStatus {
        var slot int32 = -1
        for index in 0 ... FrameCapacity {
            if frames[index] == nil {
                slot = index
                break
            }
        }
        if slot < 0 { return ExternalImageStatus.Busy }
        if !Runtime.ImageResources.ReserveExternalFrame() { return ExternalImageStatus.Busy }
        var accepted bool = false
        try {
            let status = ImportReady(frame)
            if status != ExternalImageStatus.Success { return status }
            frames[slot] = frame
            accepted = true
            timer.Change(0, 4)
            return ExternalImageStatus.Success
        } finally {
            if !accepted { Runtime.ImageResources.ReleaseExternalFrame() }
        }
    }

    internal func Wake() {
        if Interlocked.CompareExchange(ref posted, 1, 0) == 0 {
            if !window.TryPost(pump) { Interlocked.Exchange(ref posted, 0) }
        }
    }

    private func Pump() {
        RequireOwner()
        if disposed { return }
        if Runtime.DeviceLost {
            if let error = Close(ExternalImageStatus.DeviceLost) { throw error }
            return
        }
        var active bool
        lock Gate {
            Runtime.ImageResources.CollectCompletedExternal()
            for index in 0 ... FrameCapacity {
                guard let frame = frames[index] else { continue }
                if !frame.Ready {
                    let result = frame.ReadyResult
                    if result == VkConstants.VK_ERROR_DEVICE_LOST {
                        if let error = Close(ExternalImageStatus.DeviceLost) { throw error }
                        return
                    }
                    if result != VkConstants.VK_SUCCESS && result != VkConstants.VK_NOT_READY {
                        if let error = Close(ExternalImageStatus.Failed) { throw error }
                        return
                    }
                    if result == VkConstants.VK_NOT_READY {
                        active = true
                        continue
                    }
                    frame.Ready = true
                }
                if frame.Ready && !frame.Dropped { frame.Source.Select(frame) }
                if frame.References == 0 {
                    if !ReleaseFrame(index, frame) { active = true }
                } else if frame.Retiring { active = true }
                if closed && frames[index] != nil { active = true }
            }
            let sourceCount = sources.Count
            for index in 0 ... sourceCount {
                try { sources[index].NotifyChanged() } catch (error Exception) { callbackError ??= error }
            }
            var sourceIndex = sources.Count - 1
            while sourceIndex >= 0 {
                if sources[sourceIndex].IsDisposed { sources.RemoveAt(sourceIndex) }
                sourceIndex--
            }
            var remaining bool
            for frame in frames { remaining = remaining || frame != nil }
            if closed && !remaining { DisposeNative() }
            else if active || closed { timer.Change(4, 4) }
            else { timer.Change(Timeout.Infinite, Timeout.Infinite) }
        }
        ThrowCallbackError()
    }

    /// Invalidates this session and retires its native resources. Closed is not a producer completion promise.
    public func Dispose() {
        RequireOwner()
        lock Gate {
            if closed { return }
            closed = true
            closeStatus = ExternalImageStatus.Closed
            for source in sources { source.Dispose() }
            for image in images { image.Native.Closed = true }
            timer.Change(0, 4)
        }
        Wake()
        Invalidated?.Invoke(ExternalImageStatus.Closed)
    }

    internal func Close(status ExternalImageStatus) Exception? {
        RequireOwner()
        var notify bool
        lock Gate {
            if disposed { return nil }
            notify = !closed
            closed = true
            closeStatus = status
            timer.Dispose()
            for source in sources {
                source.Dispose()
                try { source.NotifyChanged() } catch (error Exception) { callbackError ??= error }
            }
            CloseFrames(status)
            DisposeNative()
        }
        if notify {
            try { Invalidated?.Invoke(status) } catch (error Exception) { callbackError ??= error }
        }
        let error = callbackError
        callbackError = nil
        if let current = error {
            if window.IsOpen && window.TryPost(() -> { throw current }) { return nil }
        }
        return error
    }

    private func DisposeNative() {
        disposed = true
        timer.Dispose()
        for image in images { image.Native.Dispose() }
        images.Clear()
        sources.Clear()
        DestroyReleaseCommands()
        Runtime.Release()
    }

    private func ThrowCallbackError() {
        let error = callbackError
        callbackError = nil
        if let current = error { throw current }
    }
}
