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
    cancellation CancellationToken, ownerClosed CancellationToken, reusable WindowCapture?) Task[OffscreenRenderResult] {
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
      if active.DeviceLost || active.Terminal {
        return Task.FromResult(OffscreenRenderResult{ Status: OffscreenRenderStatus.DeviceLost })
      }
      let completion = TaskCompletionSource[OffscreenRenderResult](TaskCreationOptions.RunContinuationsAsynchronously)
      if frameBegun || queueStage != QueueStageIdle || active.QueueWorker.HasOutstandingWork {
        queuedPageResult = completion
        queuedPage = () -> BeginPage(root, options, cancellation, ownerClosed, reusable, completion)
        host.Wake()
      } else {
        BeginPage(root, options, cancellation, ownerClosed, reusable, completion)
      }
      return completion.Task
    }

  private func BeginPage(root Cell, options OffscreenRenderOptions, cancellation CancellationToken,
    ownerClosed CancellationToken, reusable WindowCapture?, completion TaskCompletionSource[OffscreenRenderResult]) {
      if cancellation.IsCancellationRequested || ownerClosed.IsCancellationRequested {
        completion.TrySetResult(OffscreenRenderResult{ Status: OffscreenRenderStatus.Cancelled })
        return
      }
      guard let active = runtime, let allocator = memoryAllocator else {
        completion.TrySetResult(OffscreenRenderResult{ Status: OffscreenRenderStatus.NotReady })
        return
      }
      if active.DeviceLost || active.Terminal {
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
        let page = Window{ Root: root, Width: int32(Math.Ceiling(options.LogicalWidth)),
          Height: int32(Math.Ceiling(options.LogicalHeight)), Background: options.Background }
        pageWindow = page
        page.PrepareOffscreenPage(options)
        let atlasBytes = ResolveTextAtlasByteSize(uint64(properties.limits.maxTexelBufferElements) * 8uL)
        let atlases = VulkanTextAtlasSet(device, dispatch, allocator, atlasBytes,
          properties.limits.maxTexelBufferElements, active.PrimitiveState.TextDescriptorSetLayout,
          objectAccounting, nil, atlasBytes * 8uL, active.Generation)
        pageAtlases = atlases
        let clips = VulkanClipMaskAtlas(device, dispatch, allocator, options.PixelWidth, options.PixelHeight,
          clipMaskFormatSupport, uint64(options.MaxBytes), active.Generation, objectAccounting)
        pageClips = clips
        pageText = VulkanTextScene(atlases)
        pageImages = VulkanImageScene(active.ImageIdentityRegistry, active.ImageResources, active.Generation)
        pagePaths = VulkanPathScene(active.PathResources)
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
            extent, pixels * 4uL, active.GraphicsFamilyIndex, VkConstants.VK_FORMAT_R8G8B8A8_UNORM,
            active.ImageResources, active.Generation, active.MaxStorageBufferRange, active.ResourcePolicy,
            active.PrimitiveState, active.PathResources.Atlas, active.PathResources, clips, atlases,
            objectAccounting, nil, nil, active.QueueWorker.CreateMailbox(nil), lease)
          target.EnableResourceUploads()
          leaseTransferred = true
          pageReadback = VulkanReadbackFactory.Create(target, lease, active.Generation)
        } finally {
          if !leaseTransferred {
            target?.Dispose()
            lease.Release()
          }
        }
        SubmitPage()
      } catch (_ VulkanOperationBudgetException) {
        FinishPage(OffscreenRenderStatus.BudgetExceeded)
      } catch (_ InvalidOperationException) {
        FinishPage(if active.DeviceLost { OffscreenRenderStatus.DeviceLost } else { OffscreenRenderStatus.Failed })
      } catch (error Exception) {
        completion.TrySetException(error)
        FinishPage(OffscreenRenderStatus.Failed)
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
    let queried = active.GetCompletedGraphicsSubmissionSerial(out completed)
    if queried != VkConstants.VK_SUCCESS {
      FinishPage(OffscreenRenderStatus.DeviceLost)
      return
    }
    let scaleX = float32(pageOptions.PixelWidth) / pageOptions.LogicalWidth
    let scaleY = float32(pageOptions.PixelHeight) / pageOptions.LogicalHeight
    text.PublishCompletedUploads()
    text.BeginCompile(completed, scaleY)
    let result = compiler.Compile(page.Tree, pageOptions.Background,
      pageOptions.LogicalWidth, pageOptions.LogicalHeight)
    if result.UnsupportedNodeCount != 0 || result.UnsupportedPrimitiveCount != 0 {
      FinishPage(OffscreenRenderStatus.Unsupported)
      return
    }
    pageRepeat = text.RedrawRequired || images.RedrawRequired || paths.RedrawRequired || result.PathResourceDeferred
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
      } else { OffscreenRenderStatus.Failed })
    }
  }

  private func PollPage() {
    guard let request = pageReadback, let allocator = memoryAllocator else { return }
    let result = request.PollCompletion()
    if result == VkConstants.VK_NOT_READY { return }
    if result != VkConstants.VK_SUCCESS {
      FinishPage(if result == VkConstants.VK_ERROR_DEVICE_LOST {
        OffscreenRenderStatus.DeviceLost
      } else { OffscreenRenderStatus.Failed })
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
    } catch (_ InvalidOperationException) {
      FinishPage(if runtime?.DeviceLost == true {
        OffscreenRenderStatus.DeviceLost
      } else { OffscreenRenderStatus.Failed })
    } catch (error Exception) {
      pageCompletion?.TrySetException(error)
      FinishPage(OffscreenRenderStatus.Failed)
    } finally {
      pageBytesRemaining = allocator.EndOperationLimit()
    }
    host.Wake()
  }

  private func StartQueuedPage() {
    if queuedPage != nil { CancelDeferredInitialFrame() }
    if queuedPage == nil || frameBegun || queueStage != QueueStageIdle
      || runtime?.QueueWorker.HasOutstandingWork == true { return }
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

  private func FinishPage(status OffscreenRenderStatus) {
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
      pageAtlases?.DisposeAfterDeviceLoss()
      pageClips?.DisposeAfterDeviceLoss()
    } else {
      pageAtlases?.Dispose()
      pageClips?.Dispose()
    }
    pageAtlases = nil
    pageClips = nil
    pageCompiler = nil
    try { pageWindow?.Close() }
    catch (error Exception) { completion?.TrySetException(error) }
    pageWindow = nil
    completion?.TrySetResult(OffscreenRenderResult{ Status: status, Capture: capture })
  }
}

internal sealed class VulkanOperationBudgetException : Exception {
  internal init() : base("The offscreen operation memory limit was exceeded") { }
}
