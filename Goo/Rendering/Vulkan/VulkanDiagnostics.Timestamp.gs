package Goo

import System

internal enum VulkanDiagnosticTimestampStage {
  Upload;
  Main;
  Effects;
  Offscreen;
}

internal struct VulkanDiagnosticTimestampContext {
  var run uint64
  var workload uint64
  var process uint64
  var window uint64
  var frame uint64
  var sample uint64
  var queue uint64
  var submission uint64
  var fence uint64
  var completionSerial uint64
}
internal data struct VulkanDiagnosticTimestampSnapshot {
  var stage VulkanDiagnosticTimestampStage
  var run uint64
  var workload uint64
  var process uint64
  var window uint64
  var frame uint64
  var sample uint64
  var queue uint64
  var submission uint64
  var fence uint64
  var elapsedTicks uint64
  var elapsedNanoseconds uint64
  var scopeCount int32
  var droppedScopeCount int32
}

internal struct VulkanDiagnosticTimestampRange {
  var firstQuery uint32
  var reset bool
  var beginRecorded bool
  var endRecorded bool
  var submitted bool
  var resolved bool
  var unavailable bool
  var result VkResult
  var run uint64
  var workload uint64
  var process uint64
  var window uint64
  var frame uint64
  var sample uint64
  var queue uint64
  var submission uint64
  var fence uint64
  var beginTicks uint64
  var endTicks uint64
  var elapsedTicks uint64
  var elapsedNanoseconds uint64
}

internal struct VulkanDiagnosticTimestampStageState {
  var reset bool
  var scopeCount int32
  var droppedScopeCount int32
  var submitted bool
  var resolved bool
  var unavailable bool
  var result VkResult
  var run uint64
  var workload uint64
  var process uint64
  var window uint64
  var frame uint64
  var sample uint64
  var queue uint64
  var submission uint64
  var fence uint64
  var completionSerial uint64
  var elapsedTicks uint64
  var elapsedNanoseconds uint64
}

internal unsafe sealed class VulkanDiagnosticTimestampState {
  private const TimestampFrameSlotCount int32 = 2
  private const TimestampStageCount int32 = 4
  private const TimestampScopesPerStage int32 = 16
  private const TimestampQueriesPerScope int32 = 2
  private const TimestampQueriesPerStage int32 = TimestampScopesPerStage * TimestampQueriesPerScope
  private const TimestampQueriesPerSlot int32 = TimestampStageCount * TimestampQueriesPerStage
  private const TimestampQueryCount int32 = TimestampFrameSlotCount * TimestampQueriesPerSlot

  private let timestampRanges []VulkanDiagnosticTimestampRange =
  [TimestampFrameSlotCount * TimestampStageCount * TimestampScopesPerStage]VulkanDiagnosticTimestampRange
  private let timestampStages []VulkanDiagnosticTimestampStageState =
  [TimestampFrameSlotCount * TimestampStageCount]VulkanDiagnosticTimestampStageState
  private var timestampDevice VkDevice = nint(0)
  private var timestampDispatch VkDeviceDispatch = VkDeviceDispatch{}
  private var timestampPool VkQueryPool = 0uL
  private var timestampPoolCreated bool
  private var timestampSupported bool
  private var timestampComputeAndGraphics bool
  private var timestampValidBits uint32
  private var timestampMask uint64
  private var timestampPeriod float32
  private var timestampLastResult VkResult = VkConstants.VK_SUCCESS
  private var timestampLease VulkanSharedLease? = nil

  private let diagnostics VulkanDiagnostics
  private let objectAccounting VulkanObjectAccounting?
  private var mainPassTimestampSink Action[VulkanDiagnosticTimestampSnapshot]?
  private var allTimestampSink Action[VulkanDiagnosticTimestampSnapshot]?

  internal init(nativeDiagnostics VulkanDiagnostics,
    nativeObjectAccounting VulkanObjectAccounting?) {
      diagnostics = nativeDiagnostics
      objectAccounting = nativeObjectAccounting
    }

  internal func SetMainPassTimestampSink(
    sink Action[VulkanDiagnosticTimestampSnapshot]?) {
      mainPassTimestampSink = sink
    }

  internal func SetAllTimestampSink(
    sink Action[VulkanDiagnosticTimestampSnapshot]?) {
      allTimestampSink = sink
    }

  internal prop TimestampQueriesSupported bool{ get -> timestampSupported }
  internal prop TimestampValidBits uint32{ get -> timestampValidBits }
  internal prop TimestampPeriod float32{ get -> timestampPeriod }

  internal func CreateTimestampQueryPool(nativeDevice VkDevice, nativeDispatch VkDeviceDispatch,
    validBits uint32, period float32, computeAndGraphics VkBool32,
    sharedLease VulkanSharedLease) VkResult{
      if timestampPoolCreated {
        if nativeDevice == timestampDevice {
          return VkConstants.VK_SUCCESS
        }
        return VkConstants.VK_ERROR_INITIALIZATION_FAILED
      }
      if sharedLease == nil || sharedLease.Device != nativeDevice {
        return VkConstants.VK_ERROR_INITIALIZATION_FAILED
      }

      timestampDevice = nativeDevice
      timestampDispatch = nativeDispatch
      timestampLease = sharedLease
      timestampValidBits = validBits
      timestampPeriod = period
      timestampComputeAndGraphics = computeAndGraphics != VkConstants.VK_FALSE
      timestampMask = VulkanTimestamp.BuildMask(validBits)
      timestampSupported = nativeDevice != nint(0) && validBits != 0u && validBits <= 64u
        && period > 0.0F
      timestampLastResult = VkConstants.VK_SUCCESS
      ResetTimestampRangeState()

      if !timestampSupported || timestampDispatch.vkCreateQueryPool == nil
        || timestampDispatch.vkDestroyQueryPool == nil
        || timestampDispatch.vkGetQueryPoolResults == nil
        || timestampDispatch.vkCmdResetQueryPool == nil
        || timestampDispatch.vkCmdWriteTimestamp2 == nil {
          timestampSupported = false
          timestampComputeAndGraphics = false
          MarkAllTimestampRangesUnavailable()
          timestampLastResult = VkConstants.VK_ERROR_FEATURE_NOT_PRESENT
          return VkConstants.VK_NOT_READY
        }

      var createInfo = VkQueryPoolCreateInfo{}
      createInfo.sType = VkConstants.VK_STRUCTURE_TYPE_QUERY_POOL_CREATE_INFO
      createInfo.queryType = VkConstants.VK_QUERY_TYPE_TIMESTAMP
      createInfo.queryCount = uint32(TimestampQueryCount)
      let createQueryPool = timestampDispatch.vkCreateQueryPool
      let result = createQueryPool(timestampDevice, &createInfo, nil, &timestampPool)
      timestampLastResult = result
      if result != VkConstants.VK_SUCCESS || timestampPool == 0uL {
        timestampPool = 0uL
        timestampPoolCreated = false
        timestampSupported = false
        timestampComputeAndGraphics = false
        if result == VkConstants.VK_SUCCESS {
          timestampLastResult = VkConstants.VK_ERROR_INITIALIZATION_FAILED
        }
        MarkAllTimestampRangesUnavailable()
        diagnostics.RecordResult(VulkanDiagnosticEventIds.GpuTimestamp, int32(timestampLastResult))
        return timestampLastResult
      }
      try {
        if let accounting = objectAccounting {
          accounting.Allocate()
        }
      } catch (error Exception) {
        let destroyQueryPool = timestampDispatch.vkDestroyQueryPool
        destroyQueryPool(timestampDevice, timestampPool, nil)
        timestampPool = 0uL
        timestampPoolCreated = false
        throw error
      }
      timestampPoolCreated = true
      diagnostics.RecordResult(VulkanDiagnosticEventIds.GpuTimestamp, int32(result))
      return result
    }

  internal func DestroyTimestampQueryPool() {
    if !timestampPoolCreated {
      timestampLease = nil
      return
    }
    if !TimestampPoolComplete() {
      return
    }
    if timestampPool == 0uL || timestampDispatch.vkDestroyQueryPool == nil {
      return
    }
    let destroyQueryPool = timestampDispatch.vkDestroyQueryPool
    destroyQueryPool(timestampDevice, timestampPool, nil)
    if let accounting = objectAccounting {
      accounting.Release()
    }
    timestampPool = 0uL
    timestampPoolCreated = false
    timestampSupported = false
    timestampComputeAndGraphics = false
    timestampDevice = nint(0)
    timestampDispatch = VkDeviceDispatch{}
    timestampLease = nil
    timestampLastResult = VkConstants.VK_SUCCESS
    ResetTimestampRangeState()
  }

  internal func ForceDestroyTimestampQueryPool() bool {
    if !timestampPoolCreated {
      timestampLease = nil
      return true
    }
    if timestampPool == 0uL {
      timestampPoolCreated = false
      timestampSupported = false
      timestampComputeAndGraphics = false
      timestampValidBits = 0u
      timestampMask = 0uL
      timestampPeriod = 0.0F
      timestampDevice = nint(0)
      timestampDispatch = VkDeviceDispatch{}
      timestampLease = nil
      timestampLastResult = VkConstants.VK_ERROR_DEVICE_LOST
      ResetTimestampRangeState()
      return true
    }
    if timestampDevice == nint(0) || timestampDispatch.vkDestroyQueryPool == nil {
      return false
    }
    let destroyQueryPool = timestampDispatch.vkDestroyQueryPool
    destroyQueryPool(timestampDevice, timestampPool, nil)
    if let accounting = objectAccounting {
      accounting.Release()
    }
    timestampPool = 0uL
    timestampPoolCreated = false
    timestampSupported = false
    timestampComputeAndGraphics = false
    timestampValidBits = 0u
    timestampMask = 0uL
    timestampPeriod = 0.0F
    timestampDevice = nint(0)
    timestampDispatch = VkDeviceDispatch{}
    timestampLease = nil
    timestampLastResult = VkConstants.VK_ERROR_DEVICE_LOST
    ResetTimestampRangeState()
    return true
  }

  internal func AbandonTimestampQueryPool() {
    timestampPool = 0uL
    timestampPoolCreated = false
    timestampSupported = false
    timestampComputeAndGraphics = false
    timestampValidBits = 0u
    timestampMask = 0uL
    timestampPeriod = 0.0F
    timestampDevice = nint(0)
    timestampDispatch = VkDeviceDispatch{}
    timestampLease = nil
    timestampLastResult = VkConstants.VK_ERROR_DEVICE_LOST
    ResetTimestampRangeState()
  }

  private func TimestampPoolComplete() bool {
    guard let lease = timestampLease else {
      return false
    }
    var requiredCompletionSerial uint64 = 0uL
    var slot int32 = 0
    while slot < TimestampFrameSlotCount {
      var stageIndex int32 = 0
      while stageIndex < TimestampStageCount {
        let state = timestampStages[slot * TimestampStageCount + stageIndex]
        if state.submitted && !state.resolved && !state.unavailable {
          if state.completionSerial == 0uL {
            return false
          }
          if state.completionSerial > requiredCompletionSerial {
            requiredCompletionSerial = state.completionSerial
          }
        }
        stageIndex++
      }
      slot++
    }
    if requiredCompletionSerial == 0uL { return true }
    return lease.PollGraphicsSubmission(requiredCompletionSerial) == VkConstants.VK_SUCCESS
  }

  internal func ResetTimestampQueries(commandBuffer VkCommandBuffer, slot int32,
    context VulkanDiagnosticTimestampContext) bool{
      if !ValidTimestampSlot(slot) || commandBuffer == nint(0) {
        MarkTimestampSlotUnavailable(slot)
        return false
      }
      if !timestampPoolCreated || !timestampSupported
        || timestampDispatch.vkCmdResetQueryPool == nil {
          MarkTimestampSlotUnavailable(slot)
          RecordTimestampControl(context, VkConstants.VK_NOT_READY, 0uL, 0uL)
          return false
        }

      if TimestampSlotPending(slot) {
        return false
      }

      ClearTimestampSlot(slot)
      let firstQuery = FirstTimestampQuery(slot, 0, 0)
      let resetQueryPool = timestampDispatch.vkCmdResetQueryPool
      resetQueryPool(commandBuffer, timestampPool, firstQuery, uint32(TimestampQueriesPerSlot))
      RecordTimestampControl(context, VkConstants.VK_SUCCESS, uint64(firstQuery), uint64(TimestampQueriesPerSlot))
      return true
    }

  internal func BeginTimestampStage(commandBuffer VkCommandBuffer, slot int32,
    stage VulkanDiagnosticTimestampStage, context VulkanDiagnosticTimestampContext) bool -> BeginTimestampScope(commandBuffer, slot, stage, context) >= 0

  internal func EndTimestampStage(commandBuffer VkCommandBuffer, slot int32,
    stage VulkanDiagnosticTimestampStage, context VulkanDiagnosticTimestampContext) bool -> EndTimestampScope(commandBuffer, TimestampScopeHandle(slot, stage, 0), context)

  internal func BeginTimestampScope(commandBuffer VkCommandBuffer, slot int32,
    stage VulkanDiagnosticTimestampStage, context VulkanDiagnosticTimestampContext) int32 -> BeginTimestampScope(commandBuffer, slot, stage,
      VkConstants.VK_PIPELINE_STAGE_2_TOP_OF_PIPE_BIT, context)

  internal func BeginTimestampScope(commandBuffer VkCommandBuffer, slot int32,
    stage VulkanDiagnosticTimestampStage, pipelineStage VkPipelineStageFlags2,
    context VulkanDiagnosticTimestampContext) int32{
      if !ValidTimestampSlot(slot) || !ValidTimestampStage(stage)
        || commandBuffer == nint(0) || !timestampPoolCreated || !timestampSupported
        || timestampDispatch.vkCmdWriteTimestamp2 == nil {
          MarkTimestampStageUnavailable(slot, stage)
          return -1
        }
      let stageIndex = TimestampRangeIndex(slot, stage)
      var stageState = timestampStages[stageIndex]
      if !stageState.reset || stageState.unavailable {
        MarkTimestampStageUnavailable(slot, stage)
        return -1
      }
      if stageState.scopeCount >= TimestampScopesPerStage {
        stageState.droppedScopeCount = stageState.droppedScopeCount + 1
        timestampStages[stageIndex] = stageState
        RecordTimestampControl(context, VkConstants.VK_NOT_READY,
          uint64(int32(stage)), uint64(stageState.droppedScopeCount))
        return -1
      }
      let scopeIndex = stageState.scopeCount
      let rangeIndex = TimestampScopeRangeIndex(slot, stage, scopeIndex)
      let query = timestampRanges[rangeIndex].firstQuery
      let writeTimestamp = timestampDispatch.vkCmdWriteTimestamp2
      writeTimestamp(commandBuffer, pipelineStage, timestampPool, query)
      var scopeState = timestampRanges[rangeIndex]
      scopeState.beginRecorded = true
      scopeState.run = context.run
      scopeState.workload = context.workload
      scopeState.process = context.process
      scopeState.window = context.window
      scopeState.frame = context.frame
      scopeState.sample = context.sample
      scopeState.queue = context.queue
      scopeState.submission = context.submission
      scopeState.fence = context.fence
      scopeState.result = VkConstants.VK_SUCCESS
      timestampRanges[rangeIndex] = scopeState
      stageState.scopeCount = stageState.scopeCount + 1
      stageState.run = context.run
      stageState.workload = context.workload
      stageState.process = context.process
      stageState.window = context.window
      stageState.frame = context.frame
      stageState.sample = context.sample
      stageState.queue = context.queue
      stageState.submission = context.submission
      stageState.fence = context.fence
      stageState.result = VkConstants.VK_SUCCESS
      timestampStages[stageIndex] = stageState
      return TimestampScopeHandle(slot, stage, scopeIndex)
    }

  internal func EndTimestampScope(commandBuffer VkCommandBuffer,
    handle int32, context VulkanDiagnosticTimestampContext) bool -> EndTimestampScope(commandBuffer, handle,
      VkConstants.VK_PIPELINE_STAGE_2_BOTTOM_OF_PIPE_BIT, context)

  internal func EndTimestampScope(commandBuffer VkCommandBuffer,
    handle int32, pipelineStage VkPipelineStageFlags2,
    context VulkanDiagnosticTimestampContext) bool{
      if !ValidTimestampHandle(handle) || commandBuffer == nint(0)
        || !timestampPoolCreated || !timestampSupported
        || timestampDispatch.vkCmdWriteTimestamp2 == nil {
          return false
        }
      let encoded = handle - 1
      let scopeIndex = encoded % TimestampScopesPerStage
      let stageOrdinal = encoded / TimestampScopesPerStage
      let slot = stageOrdinal / TimestampStageCount
      let stage = TimestampStageFromIndex(stageOrdinal % TimestampStageCount)
      let stageIndex = TimestampRangeIndex(slot, stage)
      let rangeIndex = TimestampScopeRangeIndex(slot, stage, scopeIndex)
      var scopeState = timestampRanges[rangeIndex]
      if !scopeState.reset || !scopeState.beginRecorded || scopeState.endRecorded {
        MarkTimestampStageUnavailable(slot, stage)
        return false
      }
      let query = scopeState.firstQuery + 1u
      let writeTimestamp = timestampDispatch.vkCmdWriteTimestamp2
      writeTimestamp(commandBuffer, pipelineStage, timestampPool, query)
      scopeState.endRecorded = true
      scopeState.run = context.run
      scopeState.workload = context.workload
      scopeState.process = context.process
      scopeState.window = context.window
      scopeState.frame = context.frame
      scopeState.sample = context.sample
      scopeState.queue = context.queue
      scopeState.submission = context.submission
      scopeState.fence = context.fence
      scopeState.result = VkConstants.VK_SUCCESS
      timestampRanges[rangeIndex] = scopeState
      var stageState = timestampStages[stageIndex]
      stageState.run = context.run
      stageState.workload = context.workload
      stageState.process = context.process
      stageState.window = context.window
      stageState.frame = context.frame
      stageState.sample = context.sample
      stageState.queue = context.queue
      stageState.submission = context.submission
      stageState.fence = context.fence
      stageState.result = VkConstants.VK_SUCCESS
      timestampStages[stageIndex] = stageState
      return true
    }

  internal func EndTimestampScope(commandBuffer VkCommandBuffer, slot int32,
    stage VulkanDiagnosticTimestampStage, handle int32,
    context VulkanDiagnosticTimestampContext) bool{
      if !ValidTimestampHandle(handle) || TimestampHandleSlot(handle) != slot
        || TimestampHandleStage(handle) != stage{
          return false
        }
      return EndTimestampScope(commandBuffer, handle, context)
    }

  internal func SubmitTimestampSlot(slot int32, context VulkanDiagnosticTimestampContext) bool {
    if !ValidTimestampSlot(slot) || context.completionSerial == 0uL {
      return false
    }
    var submittedStageIndex int32 = 0
    while submittedStageIndex < TimestampStageCount {
      if timestampStages[slot * TimestampStageCount + submittedStageIndex].submitted {
        return false
      }
      submittedStageIndex++
    }
    var submitted = false
    var stageIndex int32 = 0
    while stageIndex < TimestampStageCount {
      let rangeIndex = slot * TimestampStageCount + stageIndex
      var state = timestampStages[rangeIndex]
      if !state.unavailable && state.scopeCount > 0
        && TimestampStageCompleteForSubmit(slot, stageIndex, state.scopeCount) {
          state.submitted = true
          state.resolved = false
          state.run = context.run
          state.workload = context.workload
          state.process = context.process
          state.window = context.window
          state.frame = context.frame
          state.sample = context.sample
          state.queue = context.queue
          state.submission = context.submission
          state.fence = context.fence
          state.completionSerial = context.completionSerial
          state.result = VkConstants.VK_SUCCESS
          var scopeIndex int32 = 0
          while scopeIndex < state.scopeCount {
            var scopeState = timestampRanges[TimestampScopeRangeIndex(
              slot, TimestampStageFromIndex(stageIndex), scopeIndex)]
            scopeState.submitted = true
            scopeState.resolved = false
            timestampRanges[TimestampScopeRangeIndex(
              slot, TimestampStageFromIndex(stageIndex), scopeIndex)] = scopeState
            scopeIndex++
          }
          submitted = true
        } else {
          state.unavailable = true
          state.resolved = true
          state.result = VkConstants.VK_NOT_READY
        }
      timestampStages[rangeIndex] = state
      stageIndex++
    }
    return submitted
  }

  internal func ResolveTimestampSlot(slot int32, context VulkanDiagnosticTimestampContext) VkResult {
    if !ValidTimestampSlot(slot) || !timestampPoolCreated || !timestampSupported {
      return VkConstants.VK_NOT_READY
    }
    guard let lease = timestampLease else { return VkConstants.VK_NOT_READY }
    if timestampDispatch.vkGetQueryPoolResults == nil {
      return VkConstants.VK_NOT_READY
    }

    var hasPendingStage = false
    var completionSerial uint64 = 0uL
    var stageIndex int32 = 0
    while stageIndex < TimestampStageCount {
      let state = timestampStages[slot * TimestampStageCount + stageIndex]
      if state.submitted && !state.resolved && !state.unavailable {
        hasPendingStage = true
        if state.completionSerial > completionSerial {
          completionSerial = state.completionSerial
        }
      }
      stageIndex++
    }
    if !hasPendingStage {
      return VkConstants.VK_SUCCESS
    }

    if completionSerial == 0uL {
      return VkConstants.VK_NOT_READY
    }
    let completionResult = lease.PollGraphicsSubmission(completionSerial)
    if completionResult != VkConstants.VK_SUCCESS {
      if completionResult != VkConstants.VK_NOT_READY {
        timestampLastResult = completionResult
        diagnostics.RecordResult(VulkanDiagnosticEventIds.GpuTimestamp, int32(completionResult),
          context.frame, context.queue, context.submission, context.fence)
      }
      return completionResult
    }

    let values * uint64 = stackalloc[TimestampQueriesPerStage]uint64
    let getQueryPoolResults = timestampDispatch.vkGetQueryPoolResults
    var overallResult VkResult = VkConstants.VK_SUCCESS
    stageIndex = 0
    while stageIndex < TimestampStageCount {
      let stageRangeIndex = slot * TimestampStageCount + stageIndex
      var stageState = timestampStages[stageRangeIndex]
      if stageState.submitted && !stageState.resolved && !stageState.unavailable {
        let queryCount = stageState.scopeCount * TimestampQueriesPerScope
        let result = getQueryPoolResults(
          timestampDevice,
          timestampPool,
          FirstTimestampQuery(slot, stageIndex, 0),
          uint32(queryCount),
          nuint(queryCount * 8),
          *void(values),
          VkDeviceSize(8),
          VkQueryResultFlags(uint32(VkConstants.VK_QUERY_RESULT_64_BIT)))
        timestampLastResult = result
        if result == VkConstants.VK_NOT_READY {
          overallResult = result
        } else if result != VkConstants.VK_SUCCESS {
          stageState.unavailable = true
          stageState.resolved = true
          stageState.result = result
          MarkTimestampStageRangesUnavailable(slot, stageIndex, stageState.scopeCount, result)
          timestampStages[stageRangeIndex] = stageState
          overallResult = result
          diagnostics.RecordResult(VulkanDiagnosticEventIds.GpuTimestamp, int32(result),
            context.frame, context.queue, context.submission, context.fence)
        } else {
          var totalTicks uint64 = 0uL
          var totalNanoseconds uint64 = 0uL
          var scopeIndex int32 = 0
          while scopeIndex < stageState.scopeCount {
            let rangeIndex = TimestampScopeRangeIndex(
              slot, TimestampStageFromIndex(stageIndex), scopeIndex)
            var scopeState = timestampRanges[rangeIndex]
            scopeState.beginTicks = values[scopeIndex * TimestampQueriesPerScope]
            scopeState.endTicks = values[scopeIndex * TimestampQueriesPerScope + 1]
            scopeState.elapsedTicks = VulkanTimestamp.ElapsedTicks(
              scopeState.beginTicks, scopeState.endTicks, timestampMask)
            scopeState.elapsedNanoseconds = VulkanTimestamp.Nanoseconds(
              scopeState.elapsedTicks, timestampPeriod)
            scopeState.resolved = true
            scopeState.result = result
            timestampRanges[rangeIndex] = scopeState
            totalTicks = SaturatingAddTimestamp(totalTicks, scopeState.elapsedTicks)
            totalNanoseconds = SaturatingAddTimestamp(
              totalNanoseconds, scopeState.elapsedNanoseconds)
            scopeIndex++
          }
          stageState.elapsedTicks = totalTicks
          stageState.elapsedNanoseconds = totalNanoseconds
          stageState.resolved = true
          stageState.result = result
          timestampStages[stageRangeIndex] = stageState
          let stage = TimestampStageFromIndex(stageIndex)
          RecordTimestampStage(stageState, stage, slot)
          PublishTimestamp(stageState, stage)
        }
      }
      stageIndex++
    }
    diagnostics.RecordResult(VulkanDiagnosticEventIds.GpuTimestamp, int32(overallResult),
      context.frame, context.queue, context.submission, context.fence)
    return overallResult
  }

  private func ValidTimestampSlot(slot int32) bool -> slot >= 0 && slot < TimestampFrameSlotCount

  private func ValidTimestampStage(stage VulkanDiagnosticTimestampStage) bool {
    let index = int32(stage)
    return index >= 0 && index < TimestampStageCount
  }

  private func TimestampSlotPending(slot int32) bool {
    if !ValidTimestampSlot(slot) {
      return false
    }
    var stageIndex int32 = 0
    while stageIndex < TimestampStageCount {
      let state = timestampStages[slot * TimestampStageCount + stageIndex]
      if state.submitted && !state.resolved && !state.unavailable {
        return true
      }
      stageIndex++
    }
    return false
  }

  private func TimestampStageCompleteForSubmit(slot int32,
    stageIndex int32, scopeCount int32) bool{
      let stage = TimestampStageFromIndex(stageIndex)
      var scopeIndex int32 = 0
      while scopeIndex < scopeCount {
        let scopeState = timestampRanges[TimestampScopeRangeIndex(slot, stage, scopeIndex)]
        if !scopeState.beginRecorded || !scopeState.endRecorded || scopeState.unavailable {
          return false
        }
        scopeIndex++
      }
      return true
    }

  private func TimestampRangeIndex(slot int32, stage VulkanDiagnosticTimestampStage) int32 -> slot * TimestampStageCount + int32(stage)

  private func TimestampScopeRangeIndex(slot int32,
    stage VulkanDiagnosticTimestampStage, scopeIndex int32) int32 -> (slot * TimestampStageCount + int32(stage)) * TimestampScopesPerStage + scopeIndex

  private func FirstTimestampQuery(slot int32, stageIndex int32, scopeIndex int32) uint32 -> uint32(slot * TimestampQueriesPerSlot
    +stageIndex * TimestampQueriesPerStage
    +scopeIndex * TimestampQueriesPerScope)

  private func TimestampScopeHandle(slot int32,
    stage VulkanDiagnosticTimestampStage, scopeIndex int32) int32 -> 1 + ((slot * TimestampStageCount + int32(stage)) * TimestampScopesPerStage)
  +scopeIndex

  private func ValidTimestampHandle(handle int32) bool -> handle > 0
    && handle <= TimestampFrameSlotCount * TimestampStageCount * TimestampScopesPerStage

  private func TimestampHandleSlot(handle int32) int32 -> (handle - 1) / (TimestampStageCount * TimestampScopesPerStage)

  private func TimestampHandleStage(handle int32) VulkanDiagnosticTimestampStage {
    let stageIndex = ((handle - 1) / TimestampScopesPerStage) % TimestampStageCount
    return TimestampStageFromIndex(stageIndex)
  }

  private func TimestampStageFromIndex(stageIndex int32) VulkanDiagnosticTimestampStage {
    if stageIndex == int32(VulkanDiagnosticTimestampStage.Upload) {
      return VulkanDiagnosticTimestampStage.Upload
    }
    if stageIndex == int32(VulkanDiagnosticTimestampStage.Main) {
      return VulkanDiagnosticTimestampStage.Main
    }
    if stageIndex == int32(VulkanDiagnosticTimestampStage.Effects) {
      return VulkanDiagnosticTimestampStage.Effects
    }
    return VulkanDiagnosticTimestampStage.Offscreen
  }

  private func SaturatingAddTimestamp(left uint64, right uint64) uint64 {
    if uint64.MaxValue - left < right {
      return uint64.MaxValue
    }
    return left + right
  }

  private func ResetTimestampRangeState() {
    var slot int32 = 0
    while slot < TimestampFrameSlotCount {
      ClearTimestampSlot(slot)
      slot++
    }
  }

  private func ClearTimestampSlot(slot int32) {
    var stageIndex int32 = 0
    while stageIndex < TimestampStageCount {
      let stageRangeIndex = slot * TimestampStageCount + stageIndex
      timestampStages[stageRangeIndex] = VulkanDiagnosticTimestampStageState{
        reset: true,
        scopeCount: 0,
        droppedScopeCount: 0,
        submitted: false,
        resolved: false,
        unavailable: false,
        result: VkConstants.VK_SUCCESS,
        run: 0uL,
        workload: 0uL,
        process: 0uL,
        window: 0uL,
        frame: 0uL,
        sample: 0uL,
        queue: 0uL,
        submission: 0uL,
        fence: 0uL,
        completionSerial: 0uL,
        elapsedTicks: 0uL,
        elapsedNanoseconds: 0uL,
      }
      var scopeIndex int32 = 0
      while scopeIndex < TimestampScopesPerStage {
        let rangeIndex = TimestampScopeRangeIndex(
          slot, TimestampStageFromIndex(stageIndex), scopeIndex)
        timestampRanges[rangeIndex] = VulkanDiagnosticTimestampRange{
          firstQuery: FirstTimestampQuery(slot, stageIndex, scopeIndex),
          reset: true,
          beginRecorded: false,
          endRecorded: false,
          submitted: false,
          resolved: false,
          unavailable: false,
          result: VkConstants.VK_SUCCESS,
          run: 0uL,
          workload: 0uL,
          process: 0uL,
          window: 0uL,
          frame: 0uL,
          sample: 0uL,
          queue: 0uL,
          submission: 0uL,
          fence: 0uL,
          beginTicks: 0uL,
          endTicks: 0uL,
          elapsedTicks: 0uL,
          elapsedNanoseconds: 0uL,
        }
        scopeIndex++
      }
      stageIndex++
    }
  }

  private func MarkAllTimestampRangesUnavailable() {
    var slot int32 = 0
    while slot < TimestampFrameSlotCount {
      MarkTimestampSlotUnavailable(slot)
      slot++
    }
  }

  private func MarkTimestampSlotUnavailable(slot int32) {
    if !ValidTimestampSlot(slot) {
      return
    }
    var stageIndex int32 = 0
    while stageIndex < TimestampStageCount {
      let stageRangeIndex = slot * TimestampStageCount + stageIndex
      var state = timestampStages[stageRangeIndex]
      if state.submitted && !state.resolved {
        stageIndex++
        continue
      }
      state.unavailable = true
      state.resolved = true
      state.result = VkConstants.VK_NOT_READY
      timestampStages[stageRangeIndex] = state
      MarkTimestampStageRangesUnavailable(slot, stageIndex, state.scopeCount,
        VkConstants.VK_NOT_READY)
      stageIndex++
    }
  }

  private func MarkTimestampStageUnavailable(slot int32,
    stage VulkanDiagnosticTimestampStage) {
      if !ValidTimestampSlot(slot) || !ValidTimestampStage(stage) {
        return
      }
      let stageRangeIndex = TimestampRangeIndex(slot, stage)
      var state = timestampStages[stageRangeIndex]
      if state.submitted && !state.resolved {
        return
      }
      state.unavailable = true
      state.resolved = true
      state.result = VkConstants.VK_NOT_READY
      timestampStages[stageRangeIndex] = state
      MarkTimestampStageRangesUnavailable(slot, int32(stage), state.scopeCount,
        VkConstants.VK_NOT_READY)
    }

  private func MarkTimestampStageRangesUnavailable(slot int32, stageIndex int32,
    scopeCount int32, result VkResult) {
      let stage = TimestampStageFromIndex(stageIndex)
      var scopeIndex int32 = 0
      while scopeIndex < scopeCount {
        let rangeIndex = TimestampScopeRangeIndex(slot, stage, scopeIndex)
        var scopeState = timestampRanges[rangeIndex]
        scopeState.unavailable = true
        scopeState.resolved = true
        scopeState.result = result
        timestampRanges[rangeIndex] = scopeState
        scopeIndex++
      }
    }

  private func RecordTimestampControl(context VulkanDiagnosticTimestampContext,
    result VkResult, value0 uint64, value1 uint64) {
      diagnostics.Record(context.run, context.workload, context.process, context.window,
        context.frame, context.sample, context.queue, context.submission, context.fence,
        0uL, VulkanDiagnosticEventIds.GpuTimestamp, VulkanDiagnosticCategories.Timing,
        0uL, result, value0, value1)
    }

  private func RecordTimestampStage(state VulkanDiagnosticTimestampStageState,
    stage VulkanDiagnosticTimestampStage, slot int32) {
      let eventId = if stage == VulkanDiagnosticTimestampStage.Upload {
        VulkanDiagnosticEventIds.UploadStage
      } else if stage == VulkanDiagnosticTimestampStage.Main {
        VulkanDiagnosticEventIds.MainPass
      } else if stage == VulkanDiagnosticTimestampStage.Effects {
        VulkanDiagnosticEventIds.EffectsPass
      } else {
        VulkanDiagnosticEventIds.OffscreenPass
      }
      diagnostics.Record(state.run, state.workload, state.process, state.window, state.frame, state.sample,
        state.queue, state.submission, state.fence,
        uint64(FirstTimestampQuery(slot, int32(stage), 0)), eventId,
        VulkanDiagnosticCategories.Timing, 0uL, state.result,
        state.elapsedTicks, state.elapsedNanoseconds)
    }

  private func PublishTimestamp(state VulkanDiagnosticTimestampStageState,
    stage VulkanDiagnosticTimestampStage) {
      let snapshot = VulkanDiagnosticTimestampSnapshot{
        stage: stage,
        run: state.run,
        workload: state.workload,
        process: state.process,
        window: state.window,
        frame: state.frame,
        sample: state.sample,
        queue: state.queue,
        submission: state.submission,
        fence: state.fence,
        elapsedTicks: state.elapsedTicks,
        elapsedNanoseconds: state.elapsedNanoseconds,
        scopeCount: state.scopeCount,
        droppedScopeCount: state.droppedScopeCount,
      }
      if let sink = allTimestampSink {
        sink.Invoke(snapshot)
      }
      if stage == VulkanDiagnosticTimestampStage.Main {
        if let sink = mainPassTimestampSink {
          sink.Invoke(snapshot)
        }
      }
    }
}

internal class VulkanTimestamp {
  shared {
    func BuildMask(validBits uint32) uint64 {
      if validBits >= 64u {
        return uint64.MaxValue
      }
      if validBits == 0u {
        return 0uL
      }
      return (1uL << int32(validBits)) - 1uL
    }

    func ElapsedTicks(begin uint64, end uint64, timestampMask uint64) uint64 {
      let maskedBegin = begin & timestampMask
      let maskedEnd = end & timestampMask
      if maskedEnd >= maskedBegin {
        return maskedEnd - maskedBegin
      }
      return (timestampMask - maskedBegin + 1uL) + maskedEnd
    }

    func Nanoseconds(ticks uint64, timestampPeriod float32) uint64 {
      if timestampPeriod <= 0.0F {
        return 0uL
      }
      return uint64(float64(ticks) * float64(timestampPeriod))
    }
  }
}
