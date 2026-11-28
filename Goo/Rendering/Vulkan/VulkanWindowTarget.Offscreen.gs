package Goo

import System
import System.Numerics
import System.Threading
import System.Threading.Tasks

internal unsafe partial class VulkanWindowTarget {
  private var pageCompletion TaskCompletionSource[OffscreenRenderResult]?
  private var pageWindow Window?
  private var pageCompiler VulkanSceneCompiler?
  private var pageText VulkanTextScene?
  private var pageAtlases VulkanTextAtlasSet?
  private var pageColorAtlas VulkanColorGlyphAtlas?
  private var pageClips VulkanClipMaskAtlas?
  private var pageImages VulkanImageScene?
  private var pagePaths VulkanPathScene?
  private var pageReadback VulkanAsyncReadback?
  private var pageOptions OffscreenRenderOptions
  private var pageCancellation CancellationTokenRegistration
  private var pageOwnerClose CancellationTokenRegistration
  private var pageCancelled int32
  private var pageRepeat bool
  private var pageBytesRemaining VkDeviceSize
  private var pagePixels([]uint8)?
  private var queuedPage Action?
  private var queuedPageResult TaskCompletionSource[OffscreenRenderResult]?

  internal func RenderOffscreenAsync(root Cell, options OffscreenRenderOptions,
    cancellation CancellationToken, ownerClosed CancellationToken, reusable WindowCapture?,
    renderWindow Window? = nil) Task[OffscreenRenderResult] {
      if root.contextWindow != nil {
        throw InvalidOperationException("The Cell is attached to a window. Offscreen rendering requires an unattached Cell.")
      }
      if cancellation.IsCancellationRequested || ownerClosed.IsCancellationRequested {
        return Task.FromResult(OffscreenRenderResult{ Status: OffscreenRenderStatus.Cancelled })
      }
      if pageCompletion != nil || queuedPage != nil || readbackRequest?.IsPending == true
        || readbackRequest?.State == VulkanReadbackState.Complete || readbackPrerequisiteFrame != nil {
        return Task.FromResult(OffscreenRenderResult{ Status: OffscreenRenderStatus.Busy })
      }
      VulkanDeviceRecoveryCoordinator.ServiceQueueCompletions(this)
      guard let active = runtime else {
        return Task.FromResult(OffscreenRenderResult{ Status: OffscreenRenderStatus.NotReady })
      }
      if active.Runtime.DeviceLost || active.Runtime.Terminal {
        return Task.FromResult(OffscreenRenderResult{ Status: OffscreenRenderStatus.DeviceLost })
      }
      let completion = TaskCompletionSource[OffscreenRenderResult](TaskCreationOptions.RunContinuationsAsynchronously)
      if frameBegun || queueStage != QueueStageIdle || active.Runtime.QueueWorker.HasOutstandingWork {
        queuedPageResult = completion
        queuedPage = () -> BeginPage(root, options, cancellation, ownerClosed, reusable, renderWindow, completion)
        host.Wake()
      } else {
        BeginPage(root, options, cancellation, ownerClosed, reusable, renderWindow, completion)
      }
      return completion.Task
    }

  private func BeginPage(root Cell, options OffscreenRenderOptions, cancellation CancellationToken,
    ownerClosed CancellationToken, reusable WindowCapture?, renderWindow Window?,
    completion TaskCompletionSource[OffscreenRenderResult]) {
      if cancellation.IsCancellationRequested || ownerClosed.IsCancellationRequested {
        completion.TrySetResult(OffscreenRenderResult{ Status: OffscreenRenderStatus.Cancelled })
        return
      }
      guard let active = runtime, let allocator = memoryAllocator else {
        completion.TrySetResult(OffscreenRenderResult{ Status: OffscreenRenderStatus.NotReady })
        return
      }
      if active.Runtime.DeviceLost || active.Runtime.Terminal {
        completion.TrySetResult(OffscreenRenderResult{ Status: OffscreenRenderStatus.DeviceLost })
        return
      }
      let pixels = uint64(options.PixelWidth) * uint64(options.PixelHeight)
      if pixels > uint64(Int32.MaxValue) / 4uL || pixels > uint64(options.MaxBytes) / 12uL {
        completion.TrySetResult(OffscreenRenderResult{ Status: OffscreenRenderStatus.BudgetExceeded })
        return
      }
      var properties VkPhysicalDeviceProperties
      let query = instanceDispatch.vkGetPhysicalDeviceProperties
      query(physicalDevice, &properties)
      if options.PixelWidth > properties.limits.maxImageDimension2D
        || options.PixelHeight > properties.limits.maxImageDimension2D {
          completion.TrySetResult(OffscreenRenderResult{ Status: OffscreenRenderStatus.Unsupported })
          return
        }
      let remaining = uint64(options.MaxBytes) - pixels * 4uL
      if !allocator.TryBeginOperationLimit(remaining) {
        completion.TrySetResult(OffscreenRenderResult{ Status: OffscreenRenderStatus.Busy })
        return
      }
      pageCompletion = completion
      pagePixels = reusable?.Pixels
      pageOptions = options
      pageBytesRemaining = remaining
      pageCancelled = 0
      try {
        pageCancellation = cancellation.Register(() -> { Interlocked.Exchange(ref pageCancelled, 1) })
        pageOwnerClose = ownerClosed.Register(() -> { Interlocked.Exchange(ref pageCancelled, 1) })
        let page = renderWindow ?? Window{ Root: root,
          Size: options.Size, Background: options.Background }
        pageWindow = page
        page.PrepareOffscreenPage(options)
        let maxAtlasBytes = uint64(properties.limits.maxTexelBufferElements) * 8uL
        let atlasBytes = ResolveTextAtlasByteSize(maxAtlasBytes)
        let atlasMaxBytes = ResolveTextAtlasMaxByteSize(maxAtlasBytes, atlasBytes)
        let atlases = VulkanTextAtlasSet(device, dispatch, allocator, atlasBytes,
          properties.limits.maxTexelBufferElements, active.Runtime.PrimitiveState.TextDescriptorSetLayout,
          objectAccounting, nil, active.Runtime.Generation, atlasMaxBytes)
        pageAtlases = atlases
        let colorAtlas = VulkanColorGlyphAtlas(device, dispatch, allocator,
          active.Runtime.ImageResources, active.Runtime.ImageIdentityRegistry, active.Runtime.Generation,
          objectAccounting, nil)
        pageColorAtlas = colorAtlas
        let clips = VulkanClipMaskAtlas(device, dispatch, allocator, options.PixelWidth, options.PixelHeight,
          clipMaskFormatSupport, uint64(options.MaxBytes), active.Runtime.Generation, objectAccounting)
        pageClips = clips
        pageText = VulkanTextScene(atlases, colorAtlas)
        pageImages = VulkanImageScene(active.Runtime.ImageIdentityRegistry, active.Runtime.ImageResources, active.Runtime.Generation)
        pagePaths = VulkanPathScene(active.Runtime.PathResources)
        let compiler = VulkanSceneCompiler()
        pageCompiler = compiler
        compiler.SetTextScene(pageText)
        compiler.SetImageScene(pageImages)
        compiler.SetPathScene(pagePaths)
        guard let lease = VulkanSharedRuntime.TryAcquire() else {
          FinishPage(OffscreenRenderStatus.NotReady)
          return
        }
        let extent = VkExtent2D{ width: options.PixelWidth, height: options.PixelHeight }
        var target VulkanOffscreenTarget?
        var leaseTransferred bool
        try {
          target = VulkanOffscreenTarget(device, dispatch, queue, allocator, EnsureReadbackDispatch(),
            extent, pixels * 4uL, active.Runtime.GraphicsFamilyIndex, VkConstants.VK_FORMAT_R8G8B8A8_UNORM,
            active.Runtime.ImageResources, active.Runtime.Generation, active.Runtime.MaxStorageBufferRange, active.Runtime.ResourcePolicy,
            active.Runtime.PrimitiveState, active.Runtime.PathResources.Atlas, active.Runtime.PathResources, clips, atlases,
            objectAccounting, nil, nil, active.Runtime.QueueWorker.CreateMailbox(nil), lease, colorAtlas)
          target.EnableResourceUploads()
          leaseTransferred = true
          pageReadback = VulkanReadbackFactory.Create(target, lease, active.Runtime.Generation)
        } finally {
          if !leaseTransferred {
            target?.Dispose()
            lease.Release()
          }
        }
        SubmitPage()
      } catch (_ VulkanOperationBudgetException) {
        FinishPage(OffscreenRenderStatus.BudgetExceeded)
      } catch (error InvalidOperationException) {
        FinishPage(if active.Runtime.DeviceLost { OffscreenRenderStatus.DeviceLost } else { OffscreenRenderStatus.Failed },
          error.Message)
      } catch (error Exception) {
        FinishPage(OffscreenRenderStatus.Failed, error.Message)
      } finally {
        pageBytesRemaining = allocator.EndOperationLimit()
      }
      host.Wake()
    }

  private func SubmitPage() {
    guard let page = pageWindow, let compiler = pageCompiler, let text = pageText,
    let images = pageImages, let paths = pagePaths, let request = pageReadback,
    let active = runtime else { return }
    if Interlocked.CompareExchange(ref pageCancelled, 0, 0) != 0 {
      FinishPage(OffscreenRenderStatus.Cancelled)
      return
    }
    var completed uint64
    let queried = active.Runtime.GetCompletedGraphicsSubmissionSerial(out completed)
    if queried != VkConstants.VK_SUCCESS {
      FinishPage(OffscreenRenderStatus.DeviceLost)
      return
    }
    let scaleX = float32(float64(pageOptions.PixelWidth) / pageOptions.Size.Width)
    let scaleY = float32(float64(pageOptions.PixelHeight) / pageOptions.Size.Height)
    pageColorAtlas?.Collect(completed)
    text.PublishCompletedUploads()
    text.BeginCompile(completed, scaleY)
    let result = compiler.Compile(page.Tree, pageOptions.Background,
      float32(pageOptions.Size.Width), float32(pageOptions.Size.Height))
    if result.UnsupportedNodeCount != 0 || result.UnsupportedPrimitiveCount != 0 {
      FinishPage(OffscreenRenderStatus.Unsupported)
      return
    }
    pageRepeat = text.RedrawRequired || text.ResourceDeferred || images.RedrawRequired
      || paths.RedrawRequired || result.PathResourceDeferred
    text.PrepareUpload()
    paths.PrepareUpload()
    ScaleFrame(compiler.Frame, scaleX, scaleY)
    let pixels = request.Result?.OwnedPixels ?? pagePixels
    let submitted = request.Request(compiler.Frame, VkClearColorValue{},
      VulkanReadbackRegion{ Width: pageOptions.PixelWidth, Height: pageOptions.PixelHeight },
      scaleX, scaleY, pixels)
    if submitted != VkConstants.VK_SUCCESS {
      FinishPage(if submitted == VkConstants.VK_ERROR_DEVICE_LOST {
        OffscreenRenderStatus.DeviceLost
      } else { OffscreenRenderStatus.Failed }, "Offscreen readback submission failed with Vulkan result $submitted")
    }
  }

  private func PollPage() {
    guard let request = pageReadback, let allocator = memoryAllocator else { return }
    let result = request.PollCompletion()
    if result == VkConstants.VK_NOT_READY { return }
    if result != VkConstants.VK_SUCCESS {
      FinishPage(if result == VkConstants.VK_ERROR_DEVICE_LOST {
        OffscreenRenderStatus.DeviceLost
      } else { OffscreenRenderStatus.Failed }, "Offscreen readback completion failed with Vulkan result $result")
      return
    }
    if Interlocked.CompareExchange(ref pageCancelled, 0, 0) != 0 {
      FinishPage(OffscreenRenderStatus.Cancelled)
      return
    }
    if !pageRepeat {
      FinishPage(OffscreenRenderStatus.Success)
      return
    }
    if !allocator.TryBeginOperationLimit(pageBytesRemaining) { return }
    try {
      SubmitPage()
    } catch (_ VulkanOperationBudgetException) {
      FinishPage(OffscreenRenderStatus.BudgetExceeded)
    } catch (error InvalidOperationException) {
      FinishPage(if runtime?.Runtime.DeviceLost == true {
        OffscreenRenderStatus.DeviceLost
      } else { OffscreenRenderStatus.Failed }, error.Message)
    } catch (error Exception) {
      FinishPage(OffscreenRenderStatus.Failed, error.Message)
    } finally {
      pageBytesRemaining = allocator.EndOperationLimit()
    }
    host.Wake()
  }

  private func StartQueuedPage() {
    if queuedPage != nil { CancelDeferredInitialFrame() }
    if queuedPage == nil || frameBegun || queueStage != QueueStageIdle
      || runtime?.Runtime.QueueWorker.HasOutstandingWork == true { return }
    let start = queuedPage
    queuedPage = nil
    queuedPageResult = nil
    start?.Invoke()
  }

  private func CancelQueuedPage() {
    queuedPage = nil
    queuedPageResult?.TrySetResult(OffscreenRenderResult{ Status: OffscreenRenderStatus.Cancelled })
    queuedPageResult = nil
  }

  private func FinishPage(status OffscreenRenderStatus, errorMessage string = "") {
    let completion = pageCompletion
    var capture WindowCapture?
    if status == OffscreenRenderStatus.Success {
      if let result = pageReadback?.Result { capture = WindowCapture(result) }
    }
    pageCompletion = nil
    pageCancellation.Dispose()
    pageOwnerClose.Dispose()
    if status == OffscreenRenderStatus.DeviceLost { pageReadback?.AbandonAfterDeviceLoss() }
    else { pageReadback?.Dispose() }
    pageReadback = nil
    pagePixels = nil
    pageImages?.Dispose()
    pageImages = nil
    pagePaths?.Dispose()
    pagePaths = nil
    pageText = nil
    if status == OffscreenRenderStatus.DeviceLost {
      pageColorAtlas?.DisposeAfterDeviceLoss()
      pageAtlases?.DisposeAfterDeviceLoss()
      pageClips?.DisposeAfterDeviceLoss()
    } else {
      pageColorAtlas?.Dispose()
      pageAtlases?.Dispose()
      pageClips?.Dispose()
    }
    pageColorAtlas = nil
    pageAtlases = nil
    pageClips = nil
    pageCompiler = nil
    try { pageWindow?.Close() }
    catch (error Exception) { completion?.TrySetException(error) }
    pageWindow = nil
    completion?.TrySetResult(OffscreenRenderResult{ Status: status, Capture: capture, Error: errorMessage })
  }
}

internal sealed class VulkanOperationBudgetException : Exception {
  internal init() : base("The offscreen operation memory limit was exceeded") { }
}
