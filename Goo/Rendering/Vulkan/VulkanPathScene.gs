package Goo

import System

internal data struct VulkanPathSceneStats {
  internal let Resources VulkanPathResourcesStats
  internal let CurrentPathCount int32
  internal let PendingPathCount int32
  internal let RedrawRequired bool
}

internal unsafe sealed class VulkanPathScene : IDisposable {
  private const InitialReferenceCapacity int32 = 256

  private let resources VulkanPathResources
  private let sceneId uint64
  private let currentPaths VulkanCurrentResourceSet
  private var referencesCommitted bool
  private var redrawRequired bool
  private var observedRedrawSequence uint64
  private var renderAfterPlannedUpload bool
  private var resourceDeferred bool
  private var disposed bool

  internal prop Resources VulkanPathResources{ get -> resources }
  internal prop Atlas VulkanPathAtlas{ get -> resources.Atlas }
  internal prop AtlasId ResourceId{ get -> resources.AtlasId }
  internal prop ResourceDeferred bool{ get -> resourceDeferred }
  internal prop CurrentPathCount int32{
    get {
      CommitCurrentReferences()
      return currentPaths.CurrentCount
    }
  }
  internal prop RedrawRequired bool{
    get {
      CommitCurrentReferences()
      return redrawRequired || resources.RedrawRequiredSince(observedRedrawSequence)
    }
  }
  internal prop Stats VulkanPathSceneStats{
    get {
      CommitCurrentReferences()
      return VulkanPathSceneStats{
        Resources: resources.Stats,
        CurrentPathCount: currentPaths.CurrentCount,
        PendingPathCount: currentPaths.PendingCount,
        RedrawRequired: redrawRequired || resources.RedrawRequiredSince(observedRedrawSequence),
      }
    }
  }

  internal init(nativeResources VulkanPathResources) {
    if nativeResources == nil {
      throw ArgumentNullException("nativeResources")
    }
    resources = nativeResources
    sceneId = resources.RegisterScene()
    observedRedrawSequence = resources.RedrawSequence
    currentPaths = VulkanCurrentResourceSet(InitialReferenceCapacity, 0)
  }

  internal func BeginCompile() {
    EnsureOpen()
    let sharedRedraw = resources.RedrawRequiredSince(observedRedrawSequence)
    observedRedrawSequence = resources.RedrawSequence
    resources.BeginCompile(sceneId)
    currentPaths.Begin()
    referencesCommitted = false
    redrawRequired = sharedRedraw
    renderAfterPlannedUpload = resources.CanRenderAfterPlannedUpload
    resourceDeferred = false
  }

  internal func Emit(path VectorPath, fillRule FillRule) VulkanPathRenderable {
    EnsureOpen()
    let renderable = resources.Register(path, fillRule, renderAfterPlannedUpload)
    if renderable.PathId.IsValid {
      AddPendingPath(renderable.PathId)
      resources.MarkActive(sceneId, renderable.PathId)
    }
    if renderable.RedrawRequired {
      redrawRequired = true
    }
    if renderable.PathId.IsValid && renderable.AtlasId.IsValid
      && renderable.WordCount != 0u && !renderable.Renderable
      && renderable.UploadPending{
        resourceDeferred = true
      }
    return renderable
  }

  internal func Register(path VectorPath, fillRule FillRule) VulkanPathRenderable -> Emit(path, fillRule)

  internal func PrepareUpload() {
    EnsureOpen()
    resources.PrepareUpload()
    if resources.UploadPending {
      redrawRequired = true
    }
  }

  internal func PublishCompletedUploads() {
    EnsureOpen()
    if resources.PublishCompletedUploads() {
      redrawRequired = true
    }
  }

  internal func RecordUpload(commandBuffer VkCommandBuffer) {
    EnsureOpen()
    resources.RecordUpload(commandBuffer)
  }

  internal func FlushBeforeSubmit() VkResult {
    EnsureOpen()
    return resources.FlushBeforeSubmit()
  }

  internal func MarkSubmitted(commandBuffer VkCommandBuffer, fence uint64) {
    EnsureOpen()
    CommitCurrentReferences()
    resources.MarkSubmitted(commandBuffer, fence)
    resources.MarkPathUsage(currentPaths.Current, currentPaths.CurrentCount, fence)
  }

  internal func Collect(completedFence uint64) bool {
    EnsureOpen()
    let result = resources.Collect(completedFence)
    if result {
      redrawRequired = true
    }
    return result
  }

  internal func RestoreUpload() {
    EnsureOpen()
    resources.RestoreUpload()
  }

  internal func AbortUpload() bool {
    EnsureOpen()
    return resources.AbortUpload()
  }

  internal func ConsumeRedrawRequired() bool {
    EnsureOpen()
    CommitCurrentReferences()
    let result = redrawRequired || resources.RedrawRequiredSince(observedRedrawSequence)
    observedRedrawSequence = resources.RedrawSequence
    redrawRequired = false
    return result
  }

  public func Dispose() {
    if disposed {
      return
    }
    disposed = true
    resources.UnregisterScene(sceneId)
    currentPaths.Reset()
    referencesCommitted = true
  }

  deinit{
    try {
      Dispose()
    } catch (error Exception) {
    }
  }

  private func AddPendingPath(id ResourceId) {
    currentPaths.Add(id)
  }

  private func CommitCurrentReferences() {
    if disposed || referencesCommitted {
      return
    }
    currentPaths.Commit()
    referencesCommitted = true
  }

  private func EnsureOpen() {
    if disposed {
      throw ObjectDisposedException("VulkanPathScene")
    }
  }
}
