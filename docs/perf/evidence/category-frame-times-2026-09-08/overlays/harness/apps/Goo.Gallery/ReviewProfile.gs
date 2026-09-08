package GooGallery

import System
import Goo

class ReviewProfile : FrameProfileSink {
  private let window Window
  private let downstream FrameProfileSink?
  private let capacity int32
  private let stageCount int32
  private let frameIds []uint64
  private let ticks []int64
  private let bytes []int64
  private let calls []int32
  private let pendingTicks []int64
  private let pendingBytes []int64
  private let pendingCalls []int32
  private var capturedCount int32
  private var currentFrameId uint64
  private var currentFrameIndex int32
  private var enabled bool
  private var overflow bool

  prop Active bool {
    get -> enabled || downstream?.Active == true
  }

  prop Overflow bool { get -> overflow }
  prop CapturedCount int32 { get -> capturedCount }

  init(owner Window, target FrameProfileSink?, sampleCapacity int32) {
    window = owner
    downstream = target
    capacity = sampleCapacity + 16
    stageCount = int32(FrameProfileStage.Count)
    frameIds = [capacity]uint64
    ticks = [capacity * stageCount]int64
    bytes = [capacity * stageCount]int64
    calls = [capacity * stageCount]int32
    pendingTicks = [stageCount]int64
    pendingBytes = [stageCount]int64
    pendingCalls = [stageCount]int32
    capturedCount = 0
    currentFrameId = 0uL
    currentFrameIndex = -1
    enabled = false
    overflow = false
  }

  func Start() {
    capturedCount = 0
    currentFrameId = 0uL
    currentFrameIndex = -1
    overflow = false
    var frameIndex int32 = 0
    while frameIndex < capacity {
      frameIds[frameIndex] = 0uL
      var stageIndex int32 = 0
      while stageIndex < stageCount {
        let index = frameIndex * stageCount + stageIndex
        ticks[index] = 0L
        bytes[index] = 0L
        calls[index] = 0
        stageIndex = stageIndex + 1
      }
      frameIndex = frameIndex + 1
    }
    var stageIndex int32 = 0
    while stageIndex < stageCount {
      pendingTicks[stageIndex] = 0L
      pendingBytes[stageIndex] = 0L
      pendingCalls[stageIndex] = 0
      stageIndex = stageIndex + 1
    }
    enabled = true
  }

  func Stop() {
    enabled = false
  }

  private func FindFrame(frame uint64) int32 {
    var low int32 = 0
    var high int32 = capturedCount - 1
    while low <= high {
      let middle = low + (high - low) / 2
      if frameIds[middle] == frame {
        return middle
      }
      if frameIds[middle] < frame {
        low = middle + 1
      } else {
        high = middle - 1
      }
    }
    return -1
  }

  private func IsPreRenderStage(stage int32) bool ->
    stage >= int32(FrameProfileStage.Events)
      && stage < int32(FrameProfileStage.Render)

  private func EnsureCurrentFrame(frame uint64) int32 {
    if currentFrameId == frame {
      return currentFrameIndex
    }
    if capturedCount >= capacity {
      overflow = true
      return -1
    }
    currentFrameId = frame
    currentFrameIndex = capturedCount
    frameIds[currentFrameIndex] = frame
    capturedCount = capturedCount + 1
    return currentFrameIndex
  }

  private func AddFrame(frame uint64, stage int32, elapsedTicks int64,
    allocatedBytes int64) {
    let frameIndex = EnsureCurrentFrame(frame)
    if frameIndex < 0 {
      return
    }
    let index = frameIndex * stageCount + stage
    ticks[index] = ticks[index] + (elapsedTicks < 0L ? 0L : elapsedTicks)
    bytes[index] = bytes[index] + (allocatedBytes < 0L ? 0L : allocatedBytes)
    calls[index] = calls[index] + 1
  }

  func Record(stage FrameProfileStage, elapsedTicks int64, allocatedBytes int64) {
    if enabled {
      let stageIndex = int32(stage)
      if stageIndex >= 0 && stageIndex < stageCount {
        let frame = WindowReadbackTestFixture.DiagnosticFrameId(window)
        if frame != 0uL {
          if IsPreRenderStage(stageIndex) {
            pendingTicks[stageIndex] = pendingTicks[stageIndex]
              + (elapsedTicks < 0L ? 0L : elapsedTicks)
            pendingBytes[stageIndex] = pendingBytes[stageIndex]
              + (allocatedBytes < 0L ? 0L : allocatedBytes)
            pendingCalls[stageIndex] = pendingCalls[stageIndex] + 1
          } else {
            if stageIndex == int32(FrameProfileStage.TargetBegin) {
              let frameIndex = EnsureCurrentFrame(frame)
              var pendingStage int32 = 0
              while pendingStage < stageCount {
                if pendingCalls[pendingStage] > 0 {
                  if frameIndex >= 0 {
                    let index = frameIndex * stageCount + pendingStage
                    ticks[index] = ticks[index] + pendingTicks[pendingStage]
                    bytes[index] = bytes[index] + pendingBytes[pendingStage]
                    calls[index] = calls[index] + pendingCalls[pendingStage]
                  }
                  pendingTicks[pendingStage] = 0L
                  pendingBytes[pendingStage] = 0L
                  pendingCalls[pendingStage] = 0
                }
                pendingStage = pendingStage + 1
              }
            }
            AddFrame(frame, stageIndex, elapsedTicks, allocatedBytes)
          }
        }
      }
    }
    if let current = downstream {
      current.Record(stage, elapsedTicks, allocatedBytes)
    }
  }

  func Resolve(expected []uint64, outputTicks []int64, outputBytes []int64,
    outputCalls []int32, outputValid []bool) int32 {
    var validCount int32 = 0
    var sampleIndex int32 = 0
    while sampleIndex < expected.Length {
      let frameIndex = FindFrame(expected[sampleIndex])
      var frameValid = frameIndex >= 0
      var stageIndex int32 = 0
      while stageIndex < stageCount {
        let outputIndex = stageIndex * expected.Length + sampleIndex
        if frameIndex >= 0 {
          let sourceIndex = frameIndex * stageCount + stageIndex
          outputTicks[outputIndex] = ticks[sourceIndex]
          outputBytes[outputIndex] = bytes[sourceIndex]
          outputCalls[outputIndex] = calls[sourceIndex]
        } else {
          outputTicks[outputIndex] = 0L
          outputBytes[outputIndex] = 0L
          outputCalls[outputIndex] = 0
        }
        stageIndex = stageIndex + 1
      }
      if frameValid {
        let targetBeginIndex = int32(FrameProfileStage.TargetBegin) * expected.Length + sampleIndex
        let renderIndex = int32(FrameProfileStage.Render) * expected.Length + sampleIndex
        frameValid = outputCalls[targetBeginIndex] > 0 || outputCalls[renderIndex] > 0
      }
      outputValid[sampleIndex] = frameValid
      if frameValid {
        validCount = validCount + 1
      }
      sampleIndex = sampleIndex + 1
    }
    return validCount
  }
}

func ReviewCpuStageName(stage int32) string -> switch FrameProfileStage(stage) {
  case FrameProfileStage.Frame: "frame"
  case FrameProfileStage.Events: "events"
  case FrameProfileStage.Input: "input"
  case FrameProfileStage.Tree: "tree"
  case FrameProfileStage.Motion: "motion"
  case FrameProfileStage.Reconcile: "reconcile"
  case FrameProfileStage.Build: "build"
  case FrameProfileStage.Diff: "diff"
  case FrameProfileStage.StyleResolve: "style_resolve"
  case FrameProfileStage.Transitions: "transitions"
  case FrameProfileStage.Layout: "layout"
  case FrameProfileStage.InputTree: "input_tree"
  case FrameProfileStage.Render: "render"
  case FrameProfileStage.TargetBegin: "target_begin"
  case FrameProfileStage.Paint: "paint"
  case FrameProfileStage.CanvasFlush: "canvas_flush"
  case FrameProfileStage.TargetFlush: "target_flush"
  case FrameProfileStage.Present: "present"
  default: "unknown"
}

func ReviewWorkloadRoute() int32 {
  var value = Environment.GetEnvironmentVariable("GOO_GALLERY_REVIEW_WORKLOAD")
  if value == nil || value!!.Length == 0 {
    value = Environment.GetEnvironmentVariable("GOO_GALLERY_REVIEW_ROUTE")
  }
  if value == nil || value!!.Length == 0 {
    let state = Environment.GetEnvironmentVariable("GOO_GALLERY_REVIEW_STATE")
    if state == "text" || state == "text-preset" || state == "surfaces" || state == "retained" { value = "text" }
    else if state == "layout" || state == "layout-reflow" || state == "tiles" || state == "compose" { value = "layout" }
    else if state == "list" || state == "list-category" || state == "components" { value = "list" }
    else if state == "image" || state == "image-upload" || state == "math-image" { value = "image" }
  }
  if value == nil || value!!.Length == 0 {
    return -1
  }
  if value!! == "text" || value!! == "text-preset" || value!! == "surfaces" || value!! == "retained" { return 0 }
  if value!! == "layout" || value!! == "layout-reflow" || value!! == "tiles" || value!! == "compose" { return 1 }
  if value!! == "list" || value!! == "list-category" || value!! == "components" { return 2 }
  if value!! == "image" || value!! == "image-upload" || value!! == "math-image" { return 3 }
  throw ArgumentOutOfRangeException("GOO_GALLERY_REVIEW_WORKLOAD")
}

func ReviewWorkloadName(route int32) string -> switch route {
  case 0: "text-preset"
  case 1: "layout-reflow"
  case 2: "list-category"
  case 3: "image-upload"
  default: "unknown"
}

func ReviewWorkloadShowcase(route int32) int32 -> switch route {
  case 0: 5
  case 1: 1
  case 2: 5
  case 3: 0
  default: -1
}
