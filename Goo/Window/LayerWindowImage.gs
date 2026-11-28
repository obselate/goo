package Goo

import System
import System.Collections.Generic
import System.IO
import System.Threading
import System.Threading.Tasks

internal data struct LayerImageDecode(Source ImageSource?, Width int32, Height int32)

/// Describes a still image for a Wayland layer window. Share the same instance across outputs.
public class LayerWindowImage {
  /// Gets the local PNG, JPEG, GIF or WebP path. Only the first frame is used.
  /// Limits: 64 MiB encoded, 144 MiB decoded RGBA, and 8192 pixels per side or the device's lower limit.
  public prop Path string { get -> path }
  /// Gets the fit used to paint the image over the window background.
  public prop Fit ImageFit { get -> fit }
  private let path string
  private let fit ImageFit
  private var storage VulkanStillImage?
  private let nativeSurfaces Dictionary[WaylandStillImage, SdlHost] = Dictionary[WaylandStillImage, SdlHost]()
  private let waiting Dictionary[WaylandStillImage, SdlHost] = Dictionary[WaylandStillImage, SdlHost]()
  private var decoding Task[LayerImageDecode]?
  private var resizing Task[ImageSource]?
  private var uploading Task[bool]?
  private var decoded LayerImageDecode
  private var reduced ImageSource?
  private var importing VulkanStillImage?
  private var nextCandidate int32
  private var unreadable bool
  private var importFailureReported bool
  private var failedRenderNode string?
  private var sourceWidth int32
  private var sourceHeight int32
  private var fallbackUsers int32
  private var fallbackSource AsyncImageSource?

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

  private func Load(maxDimension int32, token CancellationToken) ImageSource? {
    try {
      return RasterImageDecoder.Load(Path, ImageDecodeLimits{
        MaxPixelsPerSide: Math.Min(8192, maxDimension), MaxEncodedBytes: 64 * 1024 * 1024,
        MaxDecodedBytes: 144 * 1024 * 1024}, token)
    } catch (error Exception) when error is IOException || error is UnauthorizedAccessException
        || error is ImageLimitException || error is NotSupportedException
        || error is InvalidOperationException || error is InvalidDataException {
      Console.Error.WriteLine("Cannot load Wayland still image '$path': ${error.Message}")
      return nil
    }
  }

  internal prop PreparationReady bool {
    get -> decoding?.IsCompleted != false && resizing?.IsCompleted != false && uploading?.IsCompleted != false
  }

  internal func TryAttach(host SdlHost, presenter WaylandStillImage, owner Window) bool? {
    if unreadable {
      waiting.Remove(presenter)
      return presenter.SetImage(nil)
    }
    if failedRenderNode != nil && failedRenderNode == presenter.RenderNode {
      waiting.Remove(presenter)
      return false
    }
    let registered = nativeSurfaces.ContainsKey(presenter)
    if decoding == nil && uploading == nil && decoded.Source == nil {
      if let resident = storage {
        let (x, y) = host.StillImageOutputPixels()
        let scale = Scale(sourceWidth, sourceHeight, x, y, Fit)
        if resident.Width >= Math.Ceiling(sourceWidth * scale) && resident.Height >= Math.Ceiling(sourceHeight * scale) {
          waiting.Remove(presenter)
          if registered { return true }
          if !presenter.SetImage(resident) { return false }
          nativeSurfaces.Add(presenter, host)
          return true
        }
      }
    }
    waiting[presenter] = host
    let result = Prepare(host, presenter, owner)
    if result != nil {
      waiting.Remove(presenter)
      if result == true && storage != nil && !nativeSurfaces.ContainsKey(presenter) {
        nativeSurfaces.Add(presenter, host)
      }
    }
    return result
  }

  private func Prepare(host SdlHost, presenter WaylandStillImage, owner Window) bool? {
    if let transfer = uploading {
      if !transfer.IsCompleted { return nil }
      let uploaded = transfer.GetAwaiter().GetResult()
      uploading = nil
      let candidate = importing!!
      importing = nil
      candidate.ReleaseStaging()
      if uploaded && ReplaceBuffers(presenter, candidate) {
        let previous = storage
        storage = candidate
        sourceWidth = decoded.Width
        sourceHeight = decoded.Height
        ResetPreparation()
        previous?.Dispose()
        return true
      }
      candidate.Dispose()
    }
    if let job = decoding {
      if !job.IsCompleted { return nil }
      decoded = job.GetAwaiter().GetResult()
      decoding = nil
      if decoded.Source == nil {
        if storage != nil { return false }
        unreadable = true
        return presenter.SetImage(nil)
      }
    }
    if let job = resizing {
      if !job.IsCompleted { return nil }
      reduced = job.GetAwaiter().GetResult()
      resizing = nil
    }
    if let original = decoded.Source {
      var scale = 0.0
      for host in nativeSurfaces.Values {
        let (x, y) = host.StillImageOutputPixels()
        scale = Math.Max(scale, Scale(original.Width, original.Height, x, y, Fit))
      }
      for host in waiting.Values {
        let (x, y) = host.StillImageOutputPixels()
        scale = Math.Max(scale, Scale(original.Width, original.Height, x, y, Fit))
      }
      let width = Math.Max(1, int32(Math.Ceiling(original.Width * scale)))
      let height = Math.Max(1, int32(Math.Ceiling(original.Height * scale)))
      if scale < 1.0 && (reduced?.Width != width || reduced?.Height != height) {
        reduced?.Dispose()
        reduced = nil
        let job = Task.Run[ImageSource](() -> Resize(original, width, height))
        resizing = job
        job.ContinueWith((task Task) -> owner.NotifyStillImageReady(), TaskScheduler.Default)
        return nil
      }
      if scale >= 1.0 {
        reduced?.Dispose()
        reduced = nil
      }
    }
    var headless VulkanWindowTarget?
    var runtime VulkanSharedLease?
    try {
      runtime = VulkanSharedRuntime.TryAcquire()
      if runtime == nil {
        headless = VulkanWindowTarget(VulkanHeadlessHost(host.GetVulkanInstanceExtensions()))
        runtime = VulkanSharedRuntime.TryAcquire()
      }
      guard let active = runtime else { return FailImport(presenter) }
      if !VulkanStillImage.Supports(active) { return FailImport(presenter, cacheFailure: true) }
      if let pixels = reduced ?? decoded.Source {
        guard let candidate = VulkanStillImage.TryImport(pixels, presenter.RenderNode!!, presenter.Formats,
          ref nextCandidate) else { return FailImport(presenter, cacheFailure: true) }
        importing = candidate
        let transfer = candidate.StartUpload(pixels)
        uploading = transfer
        transfer.ContinueWith((task Task) -> owner.NotifyStillImageReady(), TaskScheduler.Default)
      } else {
        let maxDimension = int32(active.Runtime.Facts.MaxImageDimension2D)
        let job = Task.Run[LayerImageDecode](() -> {
          let image = Load(maxDimension, CancellationToken.None)
          return LayerImageDecode(image, image?.Width ?? 0, image?.Height ?? 0)
        })
        decoding = job
        job.ContinueWith((task Task) -> owner.NotifyStillImageReady(), TaskScheduler.Default)
      }
    } catch (_ InvalidOperationException) { return FailImport(presenter) }
      finally {
        runtime?.Release()
        headless?.Dispose()
      }
    return nil
  }

  private func Resize(source ImageSource, width int32, height int32) ImageSource {
    guard let decoded = source.retainImage() else { throw InvalidOperationException("Still image has no source pixels") }
    try {
      guard let pixels = decoded.Pixels() else { throw InvalidOperationException("Still image has no decoded pixels") }
      let resized = RasterImageDecoder.Resample(pixels, source.Width, source.Height, width, height, 1, CancellationToken.None)
      return ImageSource.Transfer(width, height, resized, () -> {})
    } finally { decoded.Release() }
  }

  shared {
    private func Scale(width int32, height int32, x int32, y int32, fit ImageFit) float64 {
      if x <= 0 || y <= 0 || fit == ImageFit.None { return 1.0 }
      let horizontal = float64(x) / width
      let vertical = float64(y) / height
      return Math.Min(1.0, fit == ImageFit.Contain ? Math.Min(horizontal, vertical) : Math.Max(horizontal, vertical))
    }
  }

  private func FailImport(presenter WaylandStillImage, cacheFailure bool = false) bool {
    if cacheFailure && storage == nil { failedRenderNode = presenter.RenderNode }
    if !importFailureReported {
      Console.Error.WriteLine("Wayland still image '$path' cannot import DMA-BUFs from ${presenter.RenderNode}.")
      importFailureReported = true
    }
    ResetPreparation()
    return false
  }

  private func ResetPreparation() {
    reduced?.Dispose()
    reduced = nil
    decoded.Source?.Dispose()
    decoded = LayerImageDecode{}
    nextCandidate = 0
  }

  internal func FinishPreparation(presenter WaylandStillImage) bool {
    if !waiting.ContainsKey(presenter) { return true }
    if waiting.Count == 1 {
      if uploading?.IsCompleted == false { return false }
      if let job = decoding {
        job.ContinueWith((task Task) -> {
          if job.IsCompletedSuccessfully { job.Result.Source?.Dispose() } else { job.Exception }
        }, TaskScheduler.Default)
      }
      if let job = resizing {
        let original = decoded.Source
        decoded = LayerImageDecode{}
        job.ContinueWith((task Task) -> {
          try {
            if job.IsCompletedSuccessfully { job.Result.Dispose() } else { job.Exception }
          } finally { original?.Dispose() }
        }, TaskScheduler.Default)
      }
      decoding = nil
      resizing = nil
      uploading = nil
      importing?.Dispose()
      importing = nil
      ResetPreparation()
    }
    waiting.Remove(presenter)
    return true
  }

  private func ReplaceBuffers(presenter WaylandStillImage, image VulkanStillImage) bool {
    if nativeSurfaces.Count == 0 { return presenter.SetImage(image) }
    let surfaces = List[WaylandStillImage](nativeSurfaces.Keys)
    if !nativeSurfaces.ContainsKey(presenter) { surfaces.Add(presenter) }
    let staged = [surfaces.Count]nint
    try {
      for index in 0 ... staged.Length {
        staged[index] = surfaces[index].CreateBuffer(image)
        if staged[index] == nint(0) { return false }
      }
      for index in 0 ... staged.Length {
        surfaces[index].SetBuffer(image, staged[index])
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

  internal func AcquireFallback() AsyncImageSource {
    fallbackSource ??= AsyncImageSource(token -> Task.FromResult(Load(8192, token)
      ?? throw InvalidOperationException("Cannot load the still image")))
    fallbackUsers++
    return fallbackSource!!
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
  private var source ImageSourceProvider?

  internal func Preparing(value LayerWindowImage?, node Node?) bool ->
    source != nil && Object.ReferenceEquals(value, image) && node != nil
      && ImageLayouts.Binding(node)?.AcceptedComplete == false

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
    Width: Percent(100), Height: Percent(100), Source: source, Fit: image?.Fit ?? ImageFit.Cover, KeepPreviousWhilePending: true}
}
