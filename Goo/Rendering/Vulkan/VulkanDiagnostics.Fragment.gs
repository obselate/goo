package Goo

import System

internal unsafe sealed partial class VulkanDiagnosticTimestampState {
  private const FragmentQueriesPerSlot int32 = 8192
  private let fragmentProfile bool = Environment.GetEnvironmentVariable("GOO_FRAGMENT_PROFILE") == "1"
  private var fragmentPool VkQueryPool
  private var fragmentKinds []int32 = [0]int32
  private var fragmentPassIds []int32 = [0]int32
  private let fragmentPassSequences []int32 = [2]int32
  private var fragmentValues []uint64 = [0]uint64
  private let fragmentCounts []int32 = [2]int32
  private let fragmentOmitted []int32 = [2]int32
  private let fragmentResolved []bool = [2]bool

  private func CreateFragmentPool() {
    if !fragmentProfile || fragmentPool != 0uL { return }
    var info = VkQueryPoolCreateInfo{
      sType: VkConstants.VK_STRUCTURE_TYPE_QUERY_POOL_CREATE_INFO,
      queryType: VkConstants.VK_QUERY_TYPE_PIPELINE_STATISTICS,
      queryCount: uint32(FragmentQueriesPerSlot * TimestampFrameSlotCount),
      pipelineStatistics: uint32(VkConstants.VK_QUERY_PIPELINE_STATISTIC_FRAGMENT_SHADER_INVOCATIONS_BIT),
    }
    var pool VkQueryPool
    let result = timestampDispatch.vkCreateQueryPool(timestampDevice, &info, nil, &pool)
    if result != VkConstants.VK_SUCCESS { throw InvalidOperationException("Fragment query pool failed: $result") }
    fragmentPool = pool
    fragmentKinds = [FragmentQueriesPerSlot * TimestampFrameSlotCount]int32
    fragmentPassIds = [FragmentQueriesPerSlot * TimestampFrameSlotCount]int32
    fragmentValues = [FragmentQueriesPerSlot]uint64
  }

  private func DestroyFragmentPool() {
    if fragmentPool == 0uL { return }
    timestampDispatch.vkDestroyQueryPool(timestampDevice, fragmentPool, nil)
    fragmentPool = 0uL
  }

  private func ResetFragmentQueries(commandBuffer VkCommandBuffer, slot int32) {
    if fragmentPool == 0uL { return }
    timestampDispatch.vkCmdResetQueryPool(commandBuffer, fragmentPool,
      uint32(slot * FragmentQueriesPerSlot), uint32(FragmentQueriesPerSlot))
    fragmentCounts[slot] = 0
    fragmentOmitted[slot] = 0
    fragmentResolved[slot] = false
    fragmentPassSequences[slot] = 0
  }

  internal func BeginFragmentPass(slot int32) {
    if fragmentPool != 0uL && ValidTimestampSlot(slot) { fragmentPassSequences[slot]++ }
  }

  internal func BeginFragmentQuery(commandBuffer VkCommandBuffer, slot int32,
    pass int32, kind int32) int32 {
    if fragmentPool == 0uL || !ValidTimestampSlot(slot) { return -1 }
    let count = fragmentCounts[slot]
    if count >= FragmentQueriesPerSlot {
      fragmentOmitted[slot]++
      return -1
    }
    let query = slot * FragmentQueriesPerSlot + count
    fragmentKinds[query] = pass * 10 + kind
    fragmentPassIds[query] = fragmentPassSequences[slot]
    timestampDispatch.vkCmdBeginQuery(commandBuffer, fragmentPool, uint32(query), 0u)
    fragmentCounts[slot]++
    return query
  }

  internal func EndFragmentQuery(commandBuffer VkCommandBuffer, query int32) {
    if query >= 0 { timestampDispatch.vkCmdEndQuery(commandBuffer, fragmentPool, uint32(query)) }
  }

  private func ResolveFragmentQueries(slot int32) {
    let count = fragmentCounts[slot]
    if fragmentPool == 0uL || fragmentResolved[slot] || count == 0 { return }
    let context = timestampStages[slot * TimestampStageCount + int32(VulkanDiagnosticTimestampStage.Frame)]
    var result VkResult
    fixed values * uint64 = fragmentValues {
      result = timestampDispatch.vkGetQueryPoolResults(timestampDevice, fragmentPool,
        uint32(slot * FragmentQueriesPerSlot), uint32(count), nuint(count * 8),
        *void(values), 8uL, uint32(VkConstants.VK_QUERY_RESULT_64_BIT))
    }
    if result != VkConstants.VK_SUCCESS {
      Console.WriteLine("[goo.profile.fragments] window=${context.window} frame=${context.frame} result=$result available=False")
      return
    }
    fragmentResolved[slot] = true
    for query in 0 ... count {
      let offset = slot * FragmentQueriesPerSlot + query
      let kind = fragmentKinds[offset]
      Console.WriteLine("[goo.profile.fragments] window=${context.window} frame=${context.frame} submission=${context.completionSerial} physicalPass=${fragmentPassIds[offset]} pass=${kind / 10} kind=${kind % 10} invocations=${fragmentValues[query]} omitted=${fragmentOmitted[slot]} available=True")
    }
  }
}

internal unsafe partial class VulkanPrimitiveRenderer {
  private var fragmentPass int32
  private let fragmentEnabled bool = Environment.GetEnvironmentVariable("GOO_FRAGMENT_PROFILE") == "1"

  private func BeginFragmentQuery(commandBuffer VkCommandBuffer, kind int32) int32 {
    guard let state = timestampState else { return -1 }
    return state.BeginFragmentQuery(commandBuffer, timestampSlot, fragmentPass, kind)
  }

  private func EndFragmentQuery(commandBuffer VkCommandBuffer, query int32) {
    timestampState?.EndFragmentQuery(commandBuffer, query)
  }

  private func FragmentPrimitiveKind(pipeline VkPipeline) int32 {
    if pipeline == primitivePipelines.OpaqueSolidPipeline { return 8 }
    if pipeline == primitivePipelines.SolidPipeline { return 0 }
    if pipeline == primitivePipelines.BorderPipeline { return 2 }
    if pipeline == primitivePipelines.ShadowPipeline { return 3 }
    if pipeline == primitivePipelines.SampledPipeline { return 5 }
    if pipeline == primitivePipelines.LinearPipeline || pipeline == primitivePipelines.RadialPipeline { return 6 }
    return 4
  }
}
