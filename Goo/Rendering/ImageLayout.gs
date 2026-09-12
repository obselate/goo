package Goo

import System
import System.Runtime.CompilerServices
import Facebook.Yoga

internal open class ImageSourceBinding {
  internal var Source ImageSourceProvider?
  internal var Lease ImageSourceLease?
  internal var SourceCompletion ImageSourceCompletion?
  private var sourceChangedRegistration Action?
  private var sourceChangedHandler Action?
  private var contentVersionSnapshot uint64
  private var currentToken ImageSourceBindingToken?
  private var ownerPost((Action) -> void)?
  private var ownerThreadId int32

  internal func SetSourceChanged(callback Action) {
    sourceChangedHandler = callback
  }

  internal func BindSource(source ImageSourceProvider) {
    BindSource(source, 0uL)
  }

  private func BindSource(source ImageSourceProvider, minimumVersion uint64) {
    captureOwner()
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
    } catch (error Exception) {
    }
  }

  private func captureOwner() {
    if ownerThreadId != 0 { return }
    ownerThreadId = Environment.CurrentManagedThreadId
    if let owner = ElementHandles.CurrentOwner() {
      ownerPost = (action Action) -> { owner.Post(action) }
    }
  }

  private func dispatchToOwner(action Action) {
    if let queue = ownerPost {
      if Environment.CurrentManagedThreadId != ownerThreadId {
        try { queue(action) } catch (error Exception) { }
        return
      }
    }
    action()
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
    internal func CurrentToken(n Node) ImageSourceBindingToken ? -> sourceState(n)?.CurrentToken()
    internal func IsCurrent(n Node, token object) bool {
      if Object.ReferenceEquals(n.ImageRequest, token) {
        return true
      }
      if let value = token as ImageSourceBindingToken? {
        return sourceState(n)?.IsCurrentToken(value) ?? false
      }
      return Object.ReferenceEquals(sourceState(n), token)
    }

    internal func ApplyPath(n Node, path string, fit ImageFit,
      completed((Node, object) -> void)?) {
        n.ImageFit = fit
        if path == "" {
          Dispose(n)
          return
        }
        throw NotSupportedException("Image.Path does not decode files. Await ImageSourceCache.LoadAsync(path) outside Build and assign the result to Image.Source.")
      }

    internal func ApplySource(n Node, source ImageSourceProvider, fit ImageFit,
      completed((Node, object) -> void)?) {
        n.ImageFit = fit
        let prior = sourceState(n)
        if prior?.Source == source {
          Refresh(n)
          return
        }
        let intrinsicWidth = n.ImageIntrinsicWidth
        let intrinsicHeight = n.ImageIntrinsicHeight
        n.ImageRequest = nil
        removeSource(n, prior)
        n.ImagePath = ""
        n.DecodedImage = nil
        n.ImageIntrinsicWidth = intrinsicWidth
        n.ImageIntrinsicHeight = intrinsicHeight
        let value = ImageSourceBinding()
        value.SetSourceChanged(() -> {
          ImageLayouts.refreshSource(n, value, completed)
        })
        value.BindSource(source)
        if sourceValues == nil { sourceValues = ConditionalWeakTable[Node, ImageSourceBinding]() }
        sourceValues?.Add(n, value)
        n.HasDirectImageSourceState = true
        if Refresh(n, value) {
          return
        }
        value.WatchSource((token ImageSourceBindingToken) -> {
          ImageLayouts.invalidateSource(n, value, token, completed)
        })
      }

    internal func Refresh(n Node, known ImageSourceBinding? = nil) bool {
      var decoded DecodedImage?
      if let value = known ?? sourceState(n) {
        guard let lease = value.Lease else { return false }
        if !lease.IsComplete { return false }
        decoded = value.CompletedResult()
      } else if let request = n.ImageRequest {
        decoded = request.Result
      } else {
        return false
      }
      let width = if let image = decoded {
        image.IsValid && image.Width > 0 ? float32(image.Width) : 0.0F
      } else { 0.0F }
      let height = if let image = decoded {
        image.IsValid && image.Height > 0 ? float32(image.Height) : 0.0F
      } else { 0.0F }
      if n.DecodedImage == decoded
        && n.ImageIntrinsicWidth == width
        && n.ImageIntrinsicHeight == height{
          return false
        }
      n.DecodedImage = decoded
      n.ImageIntrinsicWidth = width
      n.ImageIntrinsicHeight = height
      if let yoga = n.Yoga {
        YGNodeAPI.YGNodeMarkDirty(yoga)
      }
      return true
    }

    internal func Dispose(n Node) {
      let hadDimensions = n.ImageIntrinsicWidth > 0.0F || n.ImageIntrinsicHeight > 0.0F
        || n.DecodedImage != nil
      removeSource(n)
      n.ImageRequest = nil
      n.DecodedImage = nil
      n.ImageIntrinsicWidth = 0.0F
      n.ImageIntrinsicHeight = 0.0F
      n.ImagePath = ""
      if hadDimensions {
        if let yoga = n.Yoga { YGNodeAPI.YGNodeMarkDirty(yoga) }
      }
    }

    internal func Measure(yoga Facebook.Yoga.Node, width float32, widthMode MeasureMode,
      height float32, heightMode MeasureMode) YGSize{
        let n = nodeFromYoga(yoga)
        Refresh(n)
        var naturalWidth = 0.0F
        var naturalHeight = 0.0F
        if let image = n.DecodedImage {
          if !image.IsValid || image.Width <= 0 || image.Height <= 0 {
            return YGSize{}
          }
          naturalWidth = float32(image.Width)
          naturalHeight = float32(image.Height)
        } else {
          if sourceState(n) != nil { return YGSize{} }
          guard let request = n.ImageRequest else { return YGSize{} }
          if !request.Result.IsValid { return YGSize{} }
          if n.ImageIntrinsicWidth <= 0.0F || n.ImageIntrinsicHeight <= 0.0F {
            return YGSize{}
          }
          naturalWidth = n.ImageIntrinsicWidth
          naturalHeight = n.ImageIntrinsicHeight
        }
        var measuredWidth = naturalWidth
        var measuredHeight = naturalHeight
        if widthMode == MeasureMode.Exactly && heightMode != MeasureMode.Exactly {
          measuredWidth = width
          measuredHeight = naturalHeight * width / naturalWidth
        } else if heightMode == MeasureMode.Exactly && widthMode != MeasureMode.Exactly {
          measuredHeight = height
          measuredWidth = naturalWidth * height / naturalHeight
        } else if widthMode == MeasureMode.Exactly && heightMode == MeasureMode.Exactly {
          measuredWidth = width
          measuredHeight = height
        } else {
          if widthMode == MeasureMode.AtMost && measuredWidth > width {
            measuredWidth = width
            measuredHeight = naturalHeight * width / naturalWidth
          }
          if heightMode == MeasureMode.AtMost && measuredHeight > height {
            measuredHeight = height
            measuredWidth = naturalWidth * height / naturalHeight
          }
        }
        return YGSize{ Width: measuredWidth, Height: measuredHeight }
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
      }
    }
    private func refreshSource(n Node, value ImageSourceBinding,
      completed((Node, object) -> void)?) {
        if n.Retired { return }
        guard let current = sourceState(n) else { return }
        if current != value { return }
        if Refresh(n, value) {
          if let callback = completed, let token = value.CurrentToken() { callback(n, token) }
          return
        }
        guard let lease = value.Lease else { return }
        if lease.IsComplete { return }
        value.WatchSource((token ImageSourceBindingToken) -> {
          ImageLayouts.invalidateSource(n, value, token, completed)
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
