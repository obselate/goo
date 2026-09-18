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
    token ImageSourceBindingToken?,
    fit ImageFit,
    opacity float32,
    transformIndex int32) bool{
      if disposed {
        return false
      }
      if opacity <= 0.0F || bounds.IsEmpty {
        return true
      }
      guard let binding = token else {
        return true
      }
      if binding.Version == 0uL {
        return true
      }
      let lease = binding.Lease
      if !lease.IsComplete {
        return true
      }
      if lease.IsFailed {
        return true
      }
      guard let decoded = lease.Result() else {
        return true
      }
      if !decoded.IsValid || decoded.Width <= 0 || decoded.Height <= 0 {
        return true
      }
      guard let pixels = decoded.Pixels() else {
        return true
      }
      if pixels.Length == 0 {
        return true
      }
      let width = uint32(decoded.Width)
      let height = uint32(decoded.Height)
      let byteCount = uint64(width) * uint64(height) * 4uL
      if byteCount == 0uL || byteCount != uint64(pixels.Length) {
        return true
      }
      if cachedLookupState != 0 && cachedVersion == binding.Version
        && Object.ReferenceEquals(cachedProvider, binding.Source) {
          return if cachedLookupState == 1 { true } else { EmitLookup(frame, bounds, cachedLookup, fit, opacity, transformIndex) }
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
              generation)
          }
          redrawRequired = true
        }
        let prior = imageResources.PriorRenderableSourceVersion(source,
          identities.LinearSamplerId, VulkanImageSamplerMode.Linear)
        if prior.Renderable {
          Cache(binding.Source, binding.Version, prior, 2)
          return EmitLookup(frame, bounds, prior, fit, opacity, transformIndex)
        }
        Cache(binding.Source, binding.Version, VulkanImageResourceLookup{}, 1)
        return true
      }
      Cache(binding.Source, binding.Version, lookup, 2)
      let emitted = EmitLookup(frame, bounds, lookup, fit, opacity, transformIndex)
      if emitted {
        imageResources.PromoteSourceVersion(source)
      }
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
    transformIndex int32) bool{
      EnsurePendingReferenceCapacity(lookup.Id)
      AddPendingReference(lookup.Id)
      let fitResult = Fit(bounds, lookup.Width, lookup.Height, fit)
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
  }

  private func Fit(
    destination ConservativeBounds,
    width uint32,
    height uint32,
    fit ImageFit) VulkanImageFitResult{
      let imageWidth = float32(width)
      let imageHeight = float32(height)
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
          result.SourceWidth = destination.Width / scaledWidth
          result.SourceHeight = destination.Height / scaledHeight
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
