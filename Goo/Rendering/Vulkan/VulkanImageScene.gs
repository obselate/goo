package Goo

import System

internal data struct VulkanImageFitResult {
  internal var Bounds ConservativeBounds
  internal var SourceX float32
  internal var SourceY float32
  internal var SourceWidth float32
  internal var SourceHeight float32
}

internal unsafe sealed class VulkanImageScene : IDisposable {
  private const ImageFormat VkFormat = VkConstants.VK_FORMAT_R8G8B8A8_SRGB
  private const CurrentReferenceCapacity int32 = 256

  private let identities VulkanImageIdentityRegistry
  private let imageResources VulkanImageResources
  private let generation uint64
  private let currentReferences VulkanCurrentResourceSet
  private var cachedProvider ImageSourceProvider? = nil
  private var cachedVersion uint64
  private var cachedLookup VulkanImageResourceLookup
  private var cachedLookupState int32
  private var referencesCommitted bool
  private var redrawRequired bool
  private var disposed bool

  internal prop RedrawRequired bool{
    get {
      CommitCurrentReferences()
      return redrawRequired
    }
  }

  internal init(
    nativeIdentities VulkanImageIdentityRegistry,
    nativeImageResources VulkanImageResources,
    nativeGeneration uint64) {
      if nativeIdentities == nil {
        throw ArgumentNullException("nativeIdentities")
      }
      if nativeImageResources == nil {
        throw ArgumentNullException("nativeImageResources")
      }
      if nativeGeneration == 0uL || nativeImageResources.Generation != nativeGeneration {
        throw ArgumentOutOfRangeException("nativeGeneration")
      }
      identities = nativeIdentities
      imageResources = nativeImageResources
      generation = nativeGeneration
      currentReferences = VulkanCurrentResourceSet(
        CurrentReferenceCapacity, 0)
    }

  internal func BeginCompile() {
    if disposed {
      return
    }
    currentReferences.Begin()
    cachedProvider = nil
    cachedVersion = 0uL
    cachedLookup = VulkanImageResourceLookup{}
    cachedLookupState = 0
    referencesCommitted = false
    redrawRequired = false
  }

  internal func Emit(
    frame SceneFrame,
    bounds ConservativeBounds,
    source ImageSourceBinding?,
    fit ImageFit,
    opacity float32,
    transformIndex int32) {
      if disposed || opacity <= 0.0F || bounds.IsEmpty {
        return
      }
      guard let binding = source else {
        return
      }
      let token = binding.CurrentToken()
      if EmitCurrent(frame, bounds, token, fit, opacity, transformIndex, binding.PixelsPerUnit)
        || (token?.Lease.IsFailed ?? true) {
          binding.Fallback = nil
          return
        }
      guard let prior = binding.Fallback else {
        return
      }
      let lookup = imageResources.Lookup(
        identities.FindImage(prior.Source, prior.Version),
        identities.LinearSamplerId,
        VulkanImageSamplerMode.Linear,
        generation)
      if lookup.Renderable {
        EmitLookup(frame, bounds, lookup, fit, opacity, transformIndex, prior.Binding.PixelsPerUnit)
      }
    }

  private func EmitCurrent(
    frame SceneFrame,
    bounds ConservativeBounds,
    token ImageSourceBindingToken?,
    fit ImageFit,
    opacity float32,
    transformIndex int32, pixelsPerUnit float32) bool{
      guard let binding = token else {
        return false
      }
      if binding.Version == 0uL {
        return false
      }
      let lease = binding.Lease
      if !lease.IsComplete {
        return false
      }
      if lease.IsFailed {
        return false
      }
      if let external = lease.ExternalResult() {
        return EmitExternal(frame, bounds, binding, external, fit, opacity, transformIndex, pixelsPerUnit)
      }
      guard let decoded = lease.Result() else {
        return false
      }
      if !decoded.IsValid || decoded.Width <= 0 || decoded.Height <= 0 {
        return false
      }
      guard let pixels = decoded.Pixels() else {
        return false
      }
      if pixels.Length == 0 {
        return false
      }
      let width = uint32(decoded.Width)
      let height = uint32(decoded.Height)
      let byteCount = uint64(width) * uint64(height) * 4uL
      if byteCount == 0uL || byteCount != uint64(pixels.Length) {
        return false
      }
      if cachedLookupState != 0 && cachedVersion == binding.Version
        && Object.ReferenceEquals(cachedProvider, binding.Source) {
          return if cachedLookupState == 1 { false }
            else { EmitLookup(frame, bounds, cachedLookup, fit, opacity, transformIndex, pixelsPerUnit) }
        }
      let identity = identities.ResolveImage(binding.Source, binding.Version,
        generation, ImageFormat)
      let source = VulkanResourceSource{
        ProviderId: identity.ProviderId,
        SourceId: identity.SourceId,
        Version: binding.Version,
        Bytes: VkDeviceSize(byteCount),
      }
      let lookup = imageResources.RegisterImage(
        identity.ImageId,
        width,
        height,
        source,
        true,
        identities.LinearSamplerId,
        VulkanImageSamplerMode.Linear)
      if !lookup.Renderable {
        if lookup.Found {
          fixed sourcePixels * uint8 = pixels{
            imageResources.QueueUpload(
              identity.ImageId,
              sourcePixels,
              VkDeviceSize(byteCount),
              generation, decoded)
          }
          redrawRequired = true
        }
        let prior = imageResources.PriorRenderableSourceVersion(source,
          identities.LinearSamplerId, VulkanImageSamplerMode.Linear)
        if prior.Renderable {
          Cache(binding.Source, binding.Version, prior, 2)
          return EmitLookup(frame, bounds, prior, fit, opacity, transformIndex, pixelsPerUnit)
        }
        Cache(binding.Source, binding.Version, VulkanImageResourceLookup{}, 1)
        return false
      }
      Cache(binding.Source, binding.Version, lookup, 2)
      let emitted = EmitLookup(frame, bounds, lookup, fit, opacity, transformIndex, pixelsPerUnit)
      if emitted {
        imageResources.PromoteSourceVersion(source)
      }
      return emitted
    }

  private func EmitExternal(frame SceneFrame, bounds ConservativeBounds,
    binding ImageSourceBindingToken, external ExternalFrameLease, fit ImageFit,
    opacity float32, transformIndex int32, pixelsPerUnit float32) bool {
      if external.Terminal || external.Source.Session.IsClosed || !external.Ready
        || external.Image.Native.Runtime.Generation != generation { return false }
      let identity = identities.ResolveImage(binding.Source, binding.Version,
        generation, external.Image.Native.Format)
      let source = VulkanResourceSource{
        ProviderId: identity.ProviderId, SourceId: identity.SourceId,
        Version: binding.Version,
        Bytes: uint64(external.Image.Width) * uint64(external.Image.Height) * 4uL,
      }
      let lookup = imageResources.RegisterExternal(identity.ImageId, source, identities.LinearSamplerId, external)
      if !lookup.Renderable { return false }
      let emitted = EmitLookup(frame, bounds, lookup, fit, opacity, transformIndex, pixelsPerUnit)
      if emitted { imageResources.PromoteSourceVersion(source) }
      return emitted
    }

  private func Cache(provider ImageSourceProvider, version uint64,
    lookup VulkanImageResourceLookup, state int32) {
      cachedProvider = provider
      cachedVersion = version
      cachedLookup = lookup
      cachedLookupState = state
    }

  private func EmitLookup(frame SceneFrame, bounds ConservativeBounds,
    lookup VulkanImageResourceLookup, fit ImageFit, opacity float32,
    transformIndex int32, pixelsPerUnit float32) bool{
      EnsurePendingReferenceCapacity(lookup.Id)
      AddPendingReference(lookup.Id)
      let fitResult = Fit(bounds, lookup.Width, lookup.Height, fit, pixelsPerUnit)
      if fitResult.Bounds.IsEmpty {
        return true
      }
      frame.AddCachedImage(CachedImageRefRecord{
        Bounds: fitResult.Bounds,
        ImageId: lookup.Id,
        SamplerId: lookup.SamplerId,
        SourceX: fitResult.SourceX,
        SourceY: fitResult.SourceY,
        SourceWidth: fitResult.SourceWidth,
        SourceHeight: fitResult.SourceHeight,
        Opacity: opacity,
        Sampling: 1u,
        TransformIndex: transformIndex,
      })
      return true
    }

  public func Dispose() {
    if disposed {
      return
    }
    disposed = true
    var index int32 = 0
    while index < currentReferences.CurrentCount {
      imageResources.ReleaseCurrentReference(currentReferences.CurrentAt(index), generation)
      index++
    }
    currentReferences.Reset()
    referencesCommitted = true
  }

  private func EnsurePendingReferenceCapacity(id ResourceId) {
    currentReferences.EnsureCanAdd(id)
  }

  private func AddPendingReference(id ResourceId) {
    currentReferences.Add(id)
  }

  private func CommitCurrentReferences() {
    if disposed || referencesCommitted {
      return
    }
    var index int32 = 0
    while index < currentReferences.CurrentCount {
      let id = currentReferences.CurrentAt(index)
      if !currentReferences.PendingContains(id) {
        imageResources.ReleaseCurrentReference(id, generation)
      }
      index++
    }
    index = 0
    while index < currentReferences.PendingCount {
      let id = currentReferences.PendingAt(index)
      if !currentReferences.CurrentContains(id)
        && !imageResources.AddCurrentReference(id, generation) {
          throw InvalidOperationException("Vulkan image current reference is not registered")
        }
      index++
    }
    currentReferences.Commit()
    referencesCommitted = true
    if identities.ReleaseDisposedProviders(imageResources) {
      redrawRequired = true
    }
  }

  private func Fit(
    destination ConservativeBounds,
    width uint32,
    height uint32,
    fit ImageFit, pixelsPerUnit float32) VulkanImageFitResult{
      let imageWidth = float32(width) / pixelsPerUnit
      let imageHeight = float32(height) / pixelsPerUnit
      var result = VulkanImageFitResult{
        Bounds: destination,
        SourceX: 0.0F,
        SourceY: 0.0F,
        SourceWidth: 1.0F,
        SourceHeight: 1.0F,
      }
      switch fit {
        case ImageFit.Fill {
          return result
        }
        case ImageFit.None {
          let fittedWidth = imageWidth < destination.Width ? imageWidth : destination.Width
          let fittedHeight = imageHeight < destination.Height ? imageHeight : destination.Height
          result.Bounds = ConservativeBounds{
            X: destination.X,
            Y: destination.Y,
            Width: fittedWidth,
            Height: fittedHeight,
          }
          result.SourceWidth = fittedWidth / imageWidth
          result.SourceHeight = fittedHeight / imageHeight
          return result
        }
        case ImageFit.Contain {
          let widthScale = destination.Width / imageWidth
          let heightScale = destination.Height / imageHeight
          let scale = widthScale < heightScale ? widthScale : heightScale
          let fittedWidth = imageWidth * scale
          let fittedHeight = imageHeight * scale
          result.Bounds = ConservativeBounds{
            X: destination.X + (destination.Width - fittedWidth) * 0.5F,
            Y: destination.Y + (destination.Height - fittedHeight) * 0.5F,
            Width: fittedWidth,
            Height: fittedHeight,
          }
          return result
        }
        case ImageFit.Cover {
          let widthScale = destination.Width / imageWidth
          let heightScale = destination.Height / imageHeight
          let scale = widthScale > heightScale ? widthScale : heightScale
          let scaledWidth = imageWidth * scale
          let scaledHeight = imageHeight * scale
          let sourceWidth = destination.Width / scaledWidth
          let sourceHeight = destination.Height / scaledHeight
          result.SourceWidth = sourceWidth < 1.0F ? sourceWidth : 1.0F
          result.SourceHeight = sourceHeight < 1.0F ? sourceHeight : 1.0F
          result.SourceX = (1.0F - result.SourceWidth) * 0.5F
          result.SourceY = (1.0F - result.SourceHeight) * 0.5F
          return result
        }
        default {
          return result
        }
      }
    }
}
