package Goo

import System
import System.Collections.Generic

/// Supplies one image binding when a Goo element mounts.
public interface ImageSourceProvider {
  prop ContentVersion uint64 { get; }
  event ContentChanged Action
  /// Creates the lease Goo owns and disposes for one mounted element.
  func Acquire() ImageSourceLease;
}

/// Owns one immutable premultiplied RGBA image resource.
public class ImageSource : ImageSourceProvider, IDisposable {
  shared {
    /// Creates an immutable source by taking ownership of an exact pixel buffer.
    /// @param width The positive pixel width.
    /// @param height The positive pixel height.
    /// @param pixels The exact row-major premultiplied RGBA buffer transferred to Goo.
    /// @param released Called exactly once after Goo can no longer read the transferred array.
    /// @returns The owned image source.
    public func Transfer(width int32, height int32, pixels []uint8,
      released Action) ImageSource{
        validate(width, height, pixels)
        if Object.ReferenceEquals(released, nil) { throw ArgumentNullException("released") }
        let created = DecodedImage.FromTransferredRgba(width, height, pixels, released)
        return ImageSource(width, height, created)
      }

    private func validate(width int32, height int32, pixels []uint8) {
      if width <= 0 { throw ArgumentOutOfRangeException("width") }
      if height <= 0 { throw ArgumentOutOfRangeException("height") }
      if Object.ReferenceEquals(pixels, nil) { throw ArgumentNullException("pixels") }
      if int64(width) > Int64.MaxValue / int64(height) / int64(4) {
        throw ArgumentOutOfRangeException("width")
      }
      let required = int64(width) * int64(height) * int64(4)
      if required != int64(pixels.Length) {
        throw ArgumentException("Pixels must exactly fill the image", "pixels")
      }
    }
  }

  private let gate object
  private var image DecodedImage?
  private let width int32
  private let height int32
  private var disposed bool

  /// Copies exactly Width times Height premultiplied RGBA pixels into an owned image.
  /// @param width The positive pixel width.
  /// @param height The positive pixel height.
  /// @param pixels The row-major premultiplied RGBA pixels.
  public init(width int32, height int32, pixels []uint8) {
    gate = Object()
    validate(width, height, pixels)
    let created = DecodedImage.FromRgba(width, height, pixels)
    if !created.IsValid {
      created.Release()
      throw InvalidOperationException("Unable to create image source")
    }
    this.width = width
    this.height = height
    image = created
  }

  private init(width int32, height int32, created DecodedImage) {
    gate = Object()
    this.width = width
    this.height = height
    image = created
  }

  /// Gets this immutable source's pixel width.
  public prop Width int32{ get -> width }
  /// Gets this immutable source's pixel height.
  public prop Height int32{ get -> height }
  public prop ContentVersion uint64{ get -> 1uL }
  public event ContentChanged Action
  /// Gets whether this source has released its owner reference.
  public prop IsDisposed bool{
    get {
      var result bool
      lock gate { result = disposed }
      return result
    }
  }

  /// Creates an already-completed binding that retains this source until release.
  /// @returns The completed binding for this source.
  public func Acquire() ImageSourceLease -> ImageSourceLease(this)

  /// Releases this source's owner reference. Existing mounted leases stay valid.
  public func Dispose() {
    var current DecodedImage?
    var release bool
    lock gate {
      if !disposed {
        disposed = true
        current = image
        image = nil
        release = true
      }
    }
    if release { current?.Release() }
  }

  internal func retainImage() DecodedImage? {
    lock gate {
      if disposed { return nil }
      if let current = image {
        current.Retain()
        return current
      }
    }
    return nil
  }

  internal func RetainSource() ImageSource {
    guard let retained = retainImage() else { throw ObjectDisposedException("ImageSource") }
    return ImageSource(width, height, retained)
  }

}

/// Owns one provider result while it is mounted by Goo.
public class ImageSourceLease : IDisposable {
  private let registrations List[ImageSourceCompletion]
  private var image DecodedImage?
  private var completed bool
  private var failed bool
  private var disposed bool
  private var versionSnapshot uint64
  private var contentVersionProvider ImageSourceProvider?
  private var ownerPost((Action) -> void)?
  private var ownerThreadId int32

  /// Raised synchronously once when Goo releases this binding.
  public event Released Action

  /// Creates a pending provider binding.
  public init() {
    registrations = List[ImageSourceCompletion]()
  }

  internal init(source ImageSource) {
    registrations = List[ImageSourceCompletion]()
    let retained = source.retainImage()
    completed = true
    image = retained
    failed = retained == nil
  }

  internal func BindContentVersion(version uint64) bool -> BindContentVersion(version, nil)

  internal func BindContentVersion(version uint64, provider ImageSourceProvider?) bool {
    if version == 0uL { throw ArgumentOutOfRangeException("version") }
    lock registrations {
      if disposed { return false }
      if versionSnapshot != 0uL && versionSnapshot != version { return false }
      contentVersionProvider = provider
      if completed {
        if versionSnapshot == 0uL { versionSnapshot = version }
        return true
      }
      versionSnapshot = version
      return true
    }
  }

  internal func BindOwner(post((Action) -> void)?, threadId int32) {
    if threadId == 0 { return }
    lock registrations {
      if disposed || ownerThreadId != 0 { return }
      ownerPost = post
      ownerThreadId = threadId
      for registration in registrations {
        registration.BindOwner(post, threadId)
      }
    }
  }

  /// Gets whether the provider completed this binding.
  public prop IsComplete bool{
    get {
      var result bool
      lock registrations { result = completed }
      return result
    }
  }
  /// Gets whether this binding completed without an image.
  public prop IsFailed bool{
    get {
      var result bool
      lock registrations { result = completed && failed }
      return result
    }
  }
  /// Gets whether Goo released this binding.
  public prop IsDisposed bool{
    get {
      var result bool
      lock registrations { result = disposed }
      return result
    }
  }

  /// Completes this binding with a retained source resource.
  /// @param source The source whose image the binding retains.
  /// @returns False when this binding was already completed or released.
  public func Complete(source ImageSource) bool {
    if Object.ReferenceEquals(source, nil) { throw ArgumentNullException("source") }
    return complete(source)
  }

  private func complete(source ImageSource?) bool {
    var completedRegistrations [] ? ImageSourceCompletion = nil
    var provider ImageSourceProvider?
    var snapshot uint64
    var retained DecodedImage?
    var finalProvider ImageSourceProvider?
    var finalSnapshot uint64
    lock registrations {
      if disposed || completed {
        return false
      }
      provider = contentVersionProvider
      snapshot = versionSnapshot
    }
    if !providerVersionMatches(provider, snapshot) { return false }
    if let currentSource = source { retained = currentSource.retainImage() }
    lock registrations {
      if disposed || completed {
        finalProvider = nil
        finalSnapshot = 0uL
      } else {
        finalProvider = contentVersionProvider
        finalSnapshot = versionSnapshot
      }
    }
    if !Object.ReferenceEquals(provider, finalProvider) || snapshot != finalSnapshot
      || !providerVersionMatches(finalProvider, finalSnapshot) {
        retained?.Release()
        return false
      }
    var published bool
    lock registrations {
      if disposed || completed || !Object.ReferenceEquals(contentVersionProvider, finalProvider)
        || versionSnapshot != finalSnapshot{
          published = false
        } else {
          completed = true
          image = retained
          failed = retained == nil
          completedRegistrations = registrations.ToArray()
          registrations.Clear()
          published = true
        }
    }
    if !published {
      retained?.Release()
      return false
    }
    if let current = completedRegistrations {
      for registration in current { registration.InvokeOnOwner() }
    }
    return true
  }

  private func providerVersionMatches(provider ImageSourceProvider?, snapshot uint64) bool {
    if let currentProvider = provider {
      if snapshot == 0uL { return false }
      var currentVersion uint64
      try { currentVersion = currentProvider.ContentVersion } catch (error Exception) { return false }
      return currentVersion != 0uL && currentVersion == snapshot
    }
    return snapshot == 0uL
  }

  /// Completes this binding as a failure.
  /// @returns False when this binding was already completed or released.
  public func Fail() bool -> complete(nil)

  internal func OnCompleted(callback Action) ImageSourceCompletion {
    if Object.ReferenceEquals(callback, nil) { throw ArgumentNullException("callback") }
    let registration = ImageSourceCompletion(callback, registrations)
    var invokeNow bool
    var post((Action) -> void)?
    var threadId int32
    lock registrations {
      post = ownerPost
      threadId = ownerThreadId
      registration.BindOwner(post, threadId)
      if completed && !disposed {
        invokeNow = true
      } else if !disposed {
        registrations.Add(registration)
      } else {
        registration.Dispose()
      }
    }
    if invokeNow { registration.InvokeOnOwner() }
    return registration
  }

  /// Releases the retained result and notifies the provider.
  public func Dispose() {
    var current DecodedImage?
    var cancelled [] ? ImageSourceCompletion = nil
    var release bool
    lock registrations {
      if !disposed {
        disposed = true
        current = image
        image = nil
        contentVersionProvider = nil
        cancelled = registrations.ToArray()
        registrations.Clear()
        ownerPost = nil
        ownerThreadId = 0
        release = true
      }
    }
    if !release {
      return
    }
    if let currentCancelled = cancelled {
      for registration in currentCancelled { registration.Dispose() }
    }
    current?.Release()
    try {
      Released?.Invoke()
    } catch (error Exception) {
    }
  }

  internal func Result() DecodedImage? {
    var result DecodedImage?
    lock registrations { result = image }
    return result
  }
}

internal class ImageSourceCompletion : IDisposable {
  private let gate object
  private var callback Action?
  private var ownerPost((Action) -> void)?
  private var ownerThreadId int32

  internal init(callback Action, gate object) {
    this.gate = gate
    this.callback = callback
  }

  internal func BindOwner(post((Action) -> void)?, threadId int32) {
    if threadId == 0 { return }
    lock gate {
      if ownerThreadId == 0 {
        ownerPost = post
        ownerThreadId = threadId
      }
    }
  }

  public func Dispose() {
    lock gate { callback = nil }
  }

  internal func Invoke() {
    var current Action?
    lock gate {
      current = callback
      callback = nil
    }
    current?.Invoke()
  }

  internal func InvokeOnOwner() {
    var post((Action) -> void)?
    var threadId int32
    lock gate {
      post = ownerPost
      threadId = ownerThreadId
    }
    if let queue = post {
      if Environment.CurrentManagedThreadId != threadId {
        try {
          queue(func() { Invoke() })
        } catch (error Exception) {
          Dispose()
        }
        return
      }
    }
    Invoke()
  }
}
