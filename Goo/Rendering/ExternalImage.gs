package Goo

import System
import System.Runtime.InteropServices
import System.Threading

/// Owns one imported GPU allocation. Dispose retires it after its last frame lease.
public sealed class ExternalImage : IDisposable {
    internal let Native VulkanExternalImage
    internal var Session ExternalImageSession?

    internal init(native VulkanExternalImage) { Native = native }

    /// Gets the allocation width in pixels.
    public prop Width int32 { get -> Native.Width }
    /// Gets the allocation height in pixels.
    public prop Height int32 { get -> Native.Height }

    /// Stops new publications. Native storage remains alive through existing reads.
    public func Dispose() {
        guard let session = Session else { return }
        lock session.Gate {
            Native.Closed = true
            if !Native.Busy { Native.Dispose() }
        }
    }
}

internal sealed class ExternalFrameLease {
    internal let Image ExternalImage
    internal let Description ExternalFrameDescription
    internal let Sync ExternalImageSync
    internal let Source ExternalImageSource
    internal let Released Action[ExternalFrameResult]
    internal var ReadySemaphore VkSemaphore
    internal var ReadyHandle SafeHandle?
    internal var Ready bool
    internal var ReadyResult VkResult = VkConstants.VK_NOT_READY
    internal var Dropped bool
    internal var AcquireCommand VkCommandBuffer
    internal var Retiring bool
    internal var Sampled bool
    internal var Acquired bool
    internal var LastUse uint64
    internal var References int32 = 1
    internal var Terminal bool
    internal var ReleaseSerial uint64
    internal var ReleaseQueued bool

    internal init(source ExternalImageSource, image ExternalImage, description ExternalFrameDescription,
        sync ExternalImageSync, released Action[ExternalFrameResult]) {
        Source = source
        Image = image
        Description = description
        Sync = sync
        Released = released
    }

    internal prop Width int32 { get -> if Description.Orientation >= 5 { Description.Height } else { Description.Width } }
    internal prop Height int32 { get -> if Description.Orientation >= 5 { Description.Width } else { Description.Height } }

    internal func Retain() {
        lock Source.Session.Gate {
            if Terminal { throw ObjectDisposedException("ExternalFrameLease") }
            References++
        }
    }

    internal func Release() {
        lock Source.Session.Gate {
            if References <= 0 { throw InvalidOperationException("External frame reference count is invalid") }
            References--
        }
        Source.Session.Wake()
    }
}

/// Supplies a bounded latest external frame to Image.Source. Callbacks run on the session window owner thread.
public sealed class ExternalImageSource : ImageSourceProvider, IDisposable {
    internal let Session ExternalImageSession
    private var current ExternalFrameLease?
    private var pending ExternalFrameLease?
    private var version uint64 = 1uL
    private var changed bool
    private var disposed bool
    internal prop IsDisposed bool { get -> disposed }

    internal init(session ExternalImageSession) { Session = session }

    /// Raised on the owner thread when the source changes.
    public event ContentChanged Action

    /// Gets the nonzero publication version.
    public prop ContentVersion uint64 { get { lock Session.Gate { return version } } }

    /// Publishes one frame without waiting for producer GPU work. Busy preserves caller ownership.
    /// @param image An unused image imported by this session.
    /// @param frame The visible sRGB crop and orientation.
    /// @param ready Producer completion and released layout ownership.
    /// @param released Receives exactly one terminal result after a successful publication.
    /// @returns The publication status. A failure does not take a frame lease.
    public func Publish(image ExternalImage, frame ExternalFrameDescription, ready ExternalImageSync,
        released Action[ExternalFrameResult]) ExternalImageStatus {
        if Object.ReferenceEquals(image, nil) { throw ArgumentNullException("image") }
        if Object.ReferenceEquals(ready, nil) { throw ArgumentNullException("ready") }
        if Object.ReferenceEquals(released, nil) { throw ArgumentNullException("released") }
        if frame.X < 0 || frame.Y < 0 || frame.Width <= 0 || frame.Height <= 0
            || frame.X > image.Width - frame.Width || frame.Y > image.Height - frame.Height
            || frame.Orientation < 1 || frame.Orientation > 8 { throw ArgumentOutOfRangeException("frame") }
        if frame.ColorEncoding != ExternalImageColorEncoding.Srgb
            || (frame.AlphaMode != ExternalImageAlphaMode.Premultiplied && frame.AlphaMode != ExternalImageAlphaMode.Opaque) {
            return ExternalImageStatus.UnsupportedFormat
        }
        lock Session.Gate {
            if disposed || Session.IsClosed { return ExternalImageStatus.Closed }
            if image.Native.Runtime.Generation != Session.Generation { return ExternalImageStatus.StaleGeneration }
            if !Object.ReferenceEquals(image.Session, Session) { return ExternalImageStatus.WrongDevice }
            if image.Native.Closed { return ExternalImageStatus.Closed }
            if image.Native.Busy { return ExternalImageStatus.Busy }
            let alphaStatus = image.Native.EnsureAlphaView(frame.AlphaMode)
            if alphaStatus != ExternalImageStatus.Success { return alphaStatus }
            let next = ExternalFrameLease(this, image, frame, ready, released)
            let status = Session.Accept(next)
            if status != ExternalImageStatus.Success { return status }
            if let old = pending {
                old.Dropped = true
                old.Release()
            }
            pending = next
            image.Native.Busy = true
            AdvanceVersion()
        }
        Session.Wake()
        return ExternalImageStatus.Success
    }

    private func AdvanceVersion() {
        version = if version == uint64.MaxValue { 1uL } else { version + 1uL }
        changed = true
    }

    internal func Select(frame ExternalFrameLease) {
        lock Session.Gate {
            if disposed || !Object.ReferenceEquals(pending, frame) { return }
            let old = current
            current = frame
            if let previous = old {
                previous.Retiring = true
                previous.Release()
            }
            pending = nil
            AdvanceVersion()
        }
    }

    internal func NotifyChanged() {
        var notify bool
        lock Session.Gate {
            notify = changed
            changed = false
        }
        if !notify { return }
        var failure Exception?
        var callbacks = Delegate.EnumerateInvocationList[Action](ContentChanged)
        while callbacks.MoveNext() {
            try { callbacks.Current.Invoke() } catch (error Exception) { failure ??= error }
        }
        if let error = failure { throw error }
    }

    /// Acquires the last complete frame. Producer work is never waited inside painting.
    /// @returns A retained external frame lease, or a failed lease before the first ready frame.
    public func Acquire() ImageSourceLease {
        lock Session.Gate {
            if !disposed {
                if let frame = current { return ImageSourceLease(frame) }
            }
            let lease = ImageSourceLease()
            lease.Fail()
            return lease
        }
    }

    /// Stops publication and retires the displayed and pending read leases.
    public func Dispose() {
        lock Session.Gate {
            if disposed { return }
            disposed = true
            if let frame = pending {
                frame.Dropped = true
                frame.Release()
                pending = nil
            }
            if let frame = current { frame.Retiring = true }
            current?.Release()
            current = nil
            AdvanceVersion()
        }
        Session.Wake()
    }
}
