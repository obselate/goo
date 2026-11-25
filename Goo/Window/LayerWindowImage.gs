package Goo

import System
import System.Collections.Generic
import System.IO
import System.Threading

/// Describes a still image for a Wayland layer window. Share the same instance across outputs.
public sealed class LayerWindowImage {
  /// Gets the local PNG, JPEG, GIF or WebP path. Only the first frame is used.
  public prop Path string { get -> path }
  /// Gets the fit used to paint the image over the window background.
  public prop Fit ImageFit { get -> fit }
  private let path string
  private let fit ImageFit
  private var storage VulkanStillImage?
  private let nativeSurfaces List[WaylandStillImage] = List[WaylandStillImage]()
  private var sourceWidth int32
  private var sourceHeight int32
  private var fallbackUsers int32
  private var fallbackSource ImageSource?

  internal prop NativeStorage VulkanStillImage? { get -> storage }

  /// Describes one image without opening the file. Create a new instance after replacing the file.
  /// @param path The local image path.
  /// @param fit The fit mode. The default is Cover.
  public init(path string, fit ImageFit = ImageFit.Cover) {
    ArgumentException.ThrowIfNullOrWhiteSpace(path)
    if uint32(fit) > uint32(ImageFit.None) { throw ArgumentOutOfRangeException("fit") }
    this.path = path
    this.fit = fit
  }

  private func Load(maxDimension int32) ImageSource? {
    try {
      return RasterImageDecoder.Load(Path,
        ImageDecodeLimits{MaxPixelsPerSide: Math.Min(8192, maxDimension)}, CancellationToken.None)
    } catch (_ IOException) { return nil }
      catch (_ UnauthorizedAccessException) { return nil }
      catch (_ ImageLimitException) { return nil }
      catch (_ NotSupportedException) { return nil }
      catch (_ InvalidOperationException) { return nil }
      catch (_ InvalidDataException) { return nil }
  }

  internal func TryAttach(host SdlHost, presenter WaylandStillImage) bool {
    let registered = nativeSurfaces.Contains(presenter)
    if let resident = storage {
      let scale = host.StillImageScale(sourceWidth, sourceHeight, Fit)
      if resident.Width >= Math.Ceiling(sourceWidth * scale) && resident.Height >= Math.Ceiling(sourceHeight * scale) {
        if registered { return true }
        if !presenter.SetImage(resident) { return false }
        nativeSurfaces.Add(presenter)
        return true
      }
    }
    var headless VulkanWindowTarget?
    var runtime = VulkanSharedRuntime.TryAcquire()
    try {
      if runtime == nil {
        headless = VulkanWindowTarget(VulkanHeadlessHost(host.GetVulkanInstanceExtensions()))
        runtime = VulkanSharedRuntime.TryAcquire()
      }
      guard let active = runtime else { return false }
      if !VulkanStillImage.Supports(active) { return false }
      let source = fallbackSource ?? Load(int32(active.Facts.MaxImageDimension2D))
      if source == nil { return storage == nil && presenter.SetImage(nil) }
      var reduced ImageSource?
      try {
        let scale = host.StillImageScale(source.Width, source.Height, Fit)
        if scale < 1.0 {
          let width = Math.Max(1, int32(Math.Ceiling(source.Width * scale)))
          let height = Math.Max(1, int32(Math.Ceiling(source.Height * scale)))
          if let decoded = source.retainImage() {
            try {
              if let pixels = decoded.Pixels() {
                let resized = RasterImageDecoder.Resample(pixels, source.Width, source.Height,
                  width, height, 1, CancellationToken.None)
                reduced = ImageSource.Transfer(width, height, resized, () -> {})
              }
            } finally { decoded.Release() }
          }
        }
        let previous = storage
        let created = VulkanStillImage.TryCreate(reduced ?? source, presenter.RenderNode!!, presenter.Formats,
          (image VulkanStillImage) -> ReplaceBuffers(presenter, image, registered))
        if created == nil {
          if previous == nil { fallbackSource ??= source }
          return false
        }
        storage = created
        sourceWidth = source.Width
        sourceHeight = source.Height
        if !registered { nativeSurfaces.Add(presenter) }
        previous?.Dispose()
        return true
      } finally {
        reduced?.Dispose()
        if !Object.ReferenceEquals(source, fallbackSource) { source.Dispose() }
      }
    } catch (_ InvalidOperationException) { return false }
      finally {
        runtime?.Release()
        headless?.Dispose()
      }
  }

  private func ReplaceBuffers(presenter WaylandStillImage, image VulkanStillImage, registered bool) bool {
    let count = nativeSurfaces.Count
    if count == 0 { return presenter.SetImage(image) }
    let staged = [count + (registered ? 0 : 1)]nint
    try {
      for index in 0 ... staged.Length {
        let surface = if index < count { nativeSurfaces[index] } else { presenter }
        staged[index] = surface.CreateBuffer(image)
        if staged[index] == nint(0) { return false }
      }
      for index in 0 ... staged.Length {
        let surface = if index < count { nativeSurfaces[index] } else { presenter }
        surface.SetBuffer(image, staged[index])
        staged[index] = nint(0)
      }
      SdlRuntime.Wake()
      return true
    } finally {
      for buffer in staged { WaylandStillImage.Destroy(buffer) }
    }
  }

  internal func ReleaseNative(presenter WaylandStillImage) {
    if nativeSurfaces.Remove(presenter) && nativeSurfaces.Count == 0 {
      storage?.Dispose()
      storage = nil
    }
  }

  internal func AcquireFallback() ImageSource? {
    if fallbackUsers == 0 { fallbackSource ??= Load(8192) }
    fallbackUsers++
    return fallbackSource
  }

  internal func ReleaseFallback() {
    fallbackUsers--
    if fallbackUsers == 0 {
      fallbackSource?.Dispose()
      fallbackSource = nil
    }
  }
}

internal sealed class LayerWindowImageFallback : Cell {
  private var image LayerWindowImage?
  private var source ImageSource?

  internal func SetImage(value LayerWindowImage?) {
    if Object.ReferenceEquals(image, value) { return }
    image?.ReleaseFallback()
    image = value
    source = value?.AcquireFallback()
    Rebuild()
  }

  internal func ReleaseImage() {
    image?.ReleaseFallback()
    image = nil
    source = nil
  }

  override func Build() Blob -> Image{
    Width: Percent(100), Height: Percent(100), Source: source, Fit: image?.Fit ?? ImageFit.Cover}
}
