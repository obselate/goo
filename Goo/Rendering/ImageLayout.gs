package Goo

import System
import System.Runtime.CompilerServices

internal open class ImageSourceBinding {
  internal prop Mount NodeMount{ get; init; }
  internal var Source ImageSourceProvider?
  internal var Lease ImageSourceLease?
  internal var SourceCompletion ImageSourceCompletion?
  internal var Fallback ImageSourceBindingToken?
  internal var RetainedFallback ImageSourceBindingToken?
  internal var PixelsPerUnit float64 = 1.0
  internal var AcceptedWidth float64
  internal var AcceptedHeight float64
  internal var AcceptedComplete bool
  internal var AcceptedFailed bool
  internal var Declaration Image?
  private var sourceChangedRegistration Action?
  private var sourceChangedHandler Action?
  private var contentVersionSnapshot uint64
  private var currentToken ImageSourceBindingToken?
  private var ownerPost((Action) -> void)?
  private var ownerThreadId int32

  internal func SetSourceChanged(callback Action) {
    sourceChangedHandler = callback
  }

  internal func BindSource(source ImageSourceProvider, owner Window?) {
    ownerThreadId = Environment.CurrentManagedThreadId
    ownerPost = nil
    if let window = owner {
      ownerPost = (action Action) -> {
        window.PostEnvironment(action)
      }
    }
    BindSource(source, 0uL)
  }

  private func BindSource(source ImageSourceProvider, minimumVersion uint64) {
    let registration = () -> {
      dispatchToOwner(() -> {
        if Object.ReferenceEquals(Source, source) {
          var version uint64
          try { version = source.ContentVersion } catch (error Exception) { return }
          if version == 0uL || version <= contentVersionSnapshot { return }
          RebindSource(source)
          sourceChangedHandler?.Invoke()
        }
      })
    }
    sourceChangedRegistration = registration
    try {
      source.ContentChanged += registration
    } catch (error Exception) { }
    var lease ImageSourceLease?
    var acceptedVersion uint64
    var observedVersion uint64
    var accepted bool
    var attempt int32 = 0
    observedVersion = minimumVersion
    while attempt < 2 && !accepted {
      var before uint64
      try { before = source.ContentVersion } catch (error Exception) { before = 0uL }
      if before > observedVersion { observedVersion = before }
      if before == 0uL || (minimumVersion != 0uL && before < minimumVersion) {
        break
      }
      var candidate ImageSourceLease?
      try { candidate = source.Acquire() } catch (error Exception) { candidate = nil }
      if candidate == nil || (candidate?.IsDisposed ?? false) {
        candidate?.Dispose()
        break
      }
      candidate?.BindOwner(ownerPost, ownerThreadId)
      if !(candidate?.BindContentVersion(before, source) ?? false) {
        candidate?.Dispose()
        attempt++
        continue
      }
      var after uint64
      try { after = source.ContentVersion } catch (error Exception) { after = 0uL }
      if after > observedVersion { observedVersion = after }
      if after == before {
        lease = candidate
        acceptedVersion = before
        accepted = true
        break
      }
      candidate?.Dispose()
      if after == 0uL || after < before {
        break
      }
      attempt++
    }
    if !accepted {
      lease = ImageSourceLease()
      lease?.BindOwner(ownerPost, ownerThreadId)
      lease?.Fail()
      if observedVersion != 0uL {
        lease?.BindContentVersion(observedVersion, source)
        acceptedVersion = observedVersion
      } else {
        acceptedVersion = 0uL
      }
    }
    Source = source
    Lease = lease
    contentVersionSnapshot = acceptedVersion
    currentToken = nil
    if acceptedVersion != 0uL {
      if let currentLease = lease {
        currentToken = ImageSourceBindingToken(this, source, currentLease, acceptedVersion)
      }
    }
  }

  private func dispatchToOwner(action Action) {
    if let queue = ownerPost {
      if Environment.CurrentManagedThreadId != ownerThreadId {
        try { queue(action) } catch (error Exception) { }
        return
      }
    }
    let previous = LayoutOrigin.Current
    LayoutOrigin.Current = LayoutCause.Environment
    try { action() }
    finally { LayoutOrigin.Current = previous }
  }

  internal func RebindSource(source ImageSourceProvider) {
    let sameSource = Object.ReferenceEquals(Source, source)
    let priorVersion = if sameSource { contentVersionSnapshot } else { 0uL }
    ReleaseSource()
    BindSource(source, priorVersion)
  }

  internal func WatchSource(callback Action[ImageSourceBindingToken]) {
    SourceCompletion?.Dispose()
    guard let token = currentToken else { return }
    SourceCompletion = token.Lease.OnCompleted(() -> {
      if IsCurrentToken(token) {
        callback(token)
      }
    })
  }

  internal func IsCurrentToken(token ImageSourceBindingToken) bool ->
  Object.ReferenceEquals(currentToken, token)

  internal func CurrentToken() ImageSourceBindingToken ? -> currentToken

  internal func CompletedResult() DecodedImage? {
    SourceCompletion?.Dispose()
    SourceCompletion = nil
    return Lease?.Result()
  }

  internal func ReleaseRetainedFallback() {
    let prior = RetainedFallback
    RetainedFallback = nil
    prior?.Lease.Dispose()
  }

  internal func ReleaseSource() {
    if let source = Source {
      if let registration = sourceChangedRegistration {
        try { source.ContentChanged -= registration } catch (error Exception) { }
      }
    }
    sourceChangedRegistration = nil
    SourceCompletion?.Dispose()
    Lease?.Dispose()
    Source = nil
    Lease = nil
    SourceCompletion = nil
    contentVersionSnapshot = 0uL
    currentToken = nil
    Fallback = nil
  }
}

internal class ImageSourceBindingToken {
  internal let Binding ImageSourceBinding
  internal let Source ImageSourceProvider
  internal let Lease ImageSourceLease
  internal let Version uint64

  internal init(binding ImageSourceBinding, source ImageSourceProvider, lease ImageSourceLease,
    version uint64) {
      Binding = binding
      Source = source
      Lease = lease
      Version = version
    }
}

internal class ImageLayouts {
  shared {
    private var sourceValues ConditionalWeakTable[Node, ImageSourceBinding]?

    internal func Source(n Node) ImageSourceProvider ? -> sourceState(n)?.Source
    internal func Lease(n Node) ImageSourceLease ? -> sourceState(n)?.Lease
    internal func SourceCompletion(n Node) ImageSourceCompletion ? ->
    sourceState(n)?.SourceCompletion
    internal func Binding(n Node) ImageSourceBinding ? -> sourceState(n)
    internal func IsCurrent(n Node, token object) bool {
      if let value = token as ImageSourceBindingToken? {
        return sourceState(n)?.IsCurrentToken(value) ?? false
      }
      return false
    }


    internal func ApplySource(n Node, source ImageSourceProvider, fit ImageFit,
      completed((Node, object) -> void)?,
      owner Window?, pixelsPerUnit float64 = 1.0, keepPreviousWhilePending bool = false) {
        n.ImageFit = fit
        let prior = sourceState(n)
        if prior?.Source == source {
          let changed = prior!!.PixelsPerUnit != pixelsPerUnit
          prior!!.PixelsPerUnit = pixelsPerUnit
          if changed && prior!!.AcceptedComplete {
            publishIntrinsic(n, prior!!.AcceptedWidth / pixelsPerUnit,
              prior!!.AcceptedHeight / pixelsPerUnit, n.DecodedImage)
          }
          return
        }
        let intrinsicWidth = n.ImageIntrinsicWidth
        let intrinsicHeight = n.ImageIntrinsicHeight
        let fallback = prior?.CurrentToken() ?? prior?.Fallback
        let value = ImageSourceBinding{Mount: NodeMount(n)}
        if keepPreviousWhilePending {
          if let previous = prior {
            if let token = previous.CurrentToken() && previous.AcceptedComplete
              && token.Lease.IsComplete && !token.Lease.IsFailed {
                value.RetainedFallback = token
                previous.Lease = nil
            } else {
              value.RetainedFallback = previous.RetainedFallback
              previous.RetainedFallback = nil
            }
          }
        }
        removeSource(n, prior)
        n.DecodedImage = nil
        n.ImageIntrinsicWidth = intrinsicWidth
        n.ImageIntrinsicHeight = intrinsicHeight
        value.PixelsPerUnit = pixelsPerUnit
        value.SetSourceChanged(() -> {
          if let current = value.Mount.Current { ImageLayouts.refreshSource(current, value, completed) }
        })
        value.BindSource(source, owner)
        if value.Lease?.IsComplete == true { value.Fallback = fallback }
        if sourceValues == nil { sourceValues = ConditionalWeakTable[Node, ImageSourceBinding]() }
        sourceValues?.Add(n, value)
        n.HasDirectImageSourceState = true
        if Refresh(n, value) {
          return
        }
        value.WatchSource((token ImageSourceBindingToken) -> {
          if let current = value.Mount.Current { ImageLayouts.invalidateSource(current, value, token, completed) }
        })
      }

    internal func Refresh(n Node, known ImageSourceBinding? = nil) bool {
      guard let value = known ?? sourceState(n), let lease = value.Lease else { return false }
      if !lease.IsComplete { return false }
      let decoded = value.CompletedResult()
      let external = lease.ExternalResult()
      value.AcceptedComplete = true
      value.AcceptedFailed = lease.IsFailed
      let retained = value.RetainedFallback
      if let previous = retained {
        if !value.AcceptedFailed { value.Fallback = previous }
        value.ReleaseRetainedFallback()
      }
      value.AcceptedWidth = if let image = decoded { image.IsValid ? float64(image.Width) : 0.0 }
        else { float64(external?.Width ?? 0) }
      value.AcceptedHeight = if let image = decoded { image.IsValid ? float64(image.Height) : 0.0 }
        else { float64(external?.Height ?? 0) }
      if publishIntrinsic(n, value.AcceptedWidth / value.PixelsPerUnit,
        value.AcceptedHeight / value.PixelsPerUnit, decoded) { return true }
      if retained == nil { return false }
      n.BumpScenePaintVersion()
      return true
    }

    private func publishIntrinsic(n Node, width float64, height float64, decoded DecodedImage?) bool {
      if n.DecodedImage == decoded && n.ImageIntrinsicWidth == float32(width)
        && n.ImageIntrinsicHeight == float32(height) { return false }
      n.DecodedImage = decoded
      n.ImageIntrinsicWidth = float32(width)
      n.ImageIntrinsicHeight = float32(height)
      n.BumpScenePaintVersion()
      FlexLayoutEngine.Invalidate(n)
      return true
    }

    internal func Dispose(n Node) {
      let hadDimensions = n.ImageIntrinsicWidth > 0.0F || n.ImageIntrinsicHeight > 0.0F
        || n.DecodedImage != nil
      removeSource(n)
      n.DecodedImage = nil
      n.ImageIntrinsicWidth = 0.0F
      n.ImageIntrinsicHeight = 0.0F
      if hadDimensions {
        n.BumpScenePaintVersion()
        FlexLayoutEngine.Invalidate(n)
      }
    }

    private func sourceState(n Node) ImageSourceBinding? {
      if !n.HasDirectImageSourceState { return nil }
      if let table = sourceValues {
        if table.TryGetValue(n, out var value) { return value }
      }
      n.HasDirectImageSourceState = false
      return nil
    }
    private func removeSource(n Node, known ImageSourceBinding? = nil) {
      if let value = known ?? sourceState(n) {
        sourceValues?.Remove(n)
        n.HasDirectImageSourceState = false
        value.ReleaseSource()
        value.ReleaseRetainedFallback()
      }
    }
    private func refreshSource(n Node, value ImageSourceBinding,
      completed((Node, object) -> void)?) {
        if n.Retired { return }
        guard let current = sourceState(n) else { return }
        if current != value { return }
        guard let lease = value.Lease else { return }
        if lease.IsComplete {
          if let callback = completed, let token = value.CurrentToken() { callback(n, token) }
          else { Refresh(n, value) }
          return
        }
        value.WatchSource((token ImageSourceBindingToken) -> {
          if let current = value.Mount.Current { ImageLayouts.invalidateSource(current, value, token, completed) }
        })
      }
    private func invalidateSource(n Node, value ImageSourceBinding, token ImageSourceBindingToken,
      completed((Node, object) -> void)?) {
        if n.Retired { return }
        if let current = sourceState(n) {
          if current == value && value.IsCurrentToken(token) {
            if let callback = completed { callback(n, token) }
          }
        }
      }
  }
}
