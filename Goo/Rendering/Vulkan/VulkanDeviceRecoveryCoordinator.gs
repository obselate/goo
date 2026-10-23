package Goo

import System

internal class VulkanDeviceRecoveryCoordinator {
  private const InitialTargetCapacity int32 = 8

  shared {
    private var targets([]VulkanWindowTarget?)? = nil
    private var targetCount int32
    private var recoveryInProgress bool

    internal prop Count int32{
      get -> targetCount
    }

    internal prop InProgress bool{
      get -> recoveryInProgress
    }

    internal func Register(target VulkanWindowTarget) {
      if target == nil {
        throw ArgumentNullException("target")
      }
      if targets == nil {
        targets = [InitialTargetCapacity]VulkanWindowTarget?
      }
      guard let initialStorage = targets else {
        throw InvalidOperationException("Vulkan live target storage is unavailable")
      }
      var storage = initialStorage
      var index int32 = 0
      while index < targetCount {
        if storage[index] == target {
          return
        }
        index = index + 1
      }
      if targetCount >= storage.Length {
        if storage.Length <= 0 || storage.Length > Int32.MaxValue / 2 {
          throw InvalidOperationException("Vulkan live target capacity overflow")
        }
        let expanded = [storage.Length * 2]VulkanWindowTarget?
        Array.Copy(storage, expanded, targetCount)
        targets = expanded
        storage = expanded
      }
      storage[targetCount] = target
      targetCount = targetCount + 1
    }

    internal func Unregister(target VulkanWindowTarget) {
      guard let storage = targets else {
        return
      }
      var index int32 = 0
      while index < targetCount {
        if storage[index] == target {
          var readIndex = index + 1
          while readIndex < targetCount {
            storage[readIndex - 1] = storage[readIndex]
            readIndex = readIndex + 1
          }
          targetCount = targetCount - 1
          storage[targetCount] = nil
          return
        }
        index = index + 1
      }
    }

    internal func ServiceQueueCompletions(excluding VulkanWindowTarget?) {
      guard let storage = targets else {
        return
      }
      var index int32 = 0
      while index < targetCount {
        if let target = storage[index] {
          if target != excluding {
            target.ServiceRecoveryQueueCompletion()
          }
        }
        index = index + 1
      }
    }

    internal func ServiceExternalImageCompletions() {
      guard let storage = targets else { return }
      for index in 0 ... targetCount {
        if let target = storage[index] { target.ServiceExternalImageCompletion() }
      }
    }

    internal func Recover(result VkResult) bool {
      if recoveryInProgress {
        VulkanSharedRuntime.MarkGlobalTerminalFailure(result)
        return false
      }
      guard let storage = targets else {
        VulkanSharedRuntime.MarkGlobalTerminalFailure(result)
        return false
      }
      if targetCount == 0 {
        VulkanSharedRuntime.MarkGlobalTerminalFailure(result)
        return false
      }
      var leader VulkanWindowTarget? = nil
      var index int32 = 0
      while index < targetCount {
        if let target = storage[index] {
          leader = target
          break
        }
        index = index + 1
      }
      guard let first = leader else {
        VulkanSharedRuntime.MarkGlobalTerminalFailure(result)
        return false
      }
      index = 0
      while index < targetCount {
        if let target = storage[index] {
          if !target.DrainStartup() { return true }
        }
        index++
      }
      recoveryInProgress = true
      try {
        guard let oldRuntime = first.RecoveryRuntime() else {
          throw InvalidOperationException("Vulkan shared runtime is unavailable during recovery")
        }
        oldRuntime.MarkDeviceLost()
        oldRuntime.QuiesceQueueAfterDeviceLoss()
        index = 0
        while index < targetCount {
          if let target = storage[index] {
            target.AbandonForDeviceRecovery()
          }
          index = index + 1
        }
        VulkanSharedRuntime.DiscardAfterDeviceLoss()
        first.RebuildAfterDeviceRecovery()
        index = 0
        while index < targetCount {
          if let target = storage[index] {
            if target != first {
              target.RebuildAfterDeviceRecovery()
            }
          }
          index = index + 1
        }
        index = 0
        while index < targetCount {
          if let target = storage[index] {
            target.FinishDeviceRecovery()
          }
          index = index + 1
        }
        first.RecordDeviceRecovery(result, oldRuntime.Generation, targetCount)
        recoveryInProgress = false
        return true
      } catch (error Exception) {
        first.RecordDeviceRecoveryFailure(result)
        index = 0
        while index < targetCount {
          if let target = storage[index] {
            target.CleanupFailedDeviceRecovery()
          }
          index = index + 1
        }
        try { VulkanSharedRuntime.DiscardAfterDeviceLoss() } catch (cleanup Exception) { }
        recoveryInProgress = false
        VulkanSharedRuntime.MarkGlobalTerminalFailure(result)
        index = 0
        while index < targetCount {
          if let target = storage[index] {
            target.MarkRecoveryTerminal()
          }
          index = index + 1
        }
        return false
      }
    }
  }
}
