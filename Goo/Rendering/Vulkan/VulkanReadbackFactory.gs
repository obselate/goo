package Goo

import System

internal class VulkanReadbackFactory {
  shared {
    internal func Create(target VulkanOffscreenTarget,
      lease VulkanSharedLease,
      generation uint64) VulkanAsyncReadback{
        if target == nil {
          throw ArgumentNullException("target")
        }
        if lease == nil {
          try { target.Dispose() } catch (cleanup Exception) { }
          throw ArgumentNullException("lease")
        }
        try {
          return VulkanAsyncReadback(target, lease, generation)
        } catch (error Exception) {
          try { target.Dispose() } catch (cleanup Exception) { }
          try { lease.Release() } catch (cleanup Exception) { }
          throw error
        }
      }
  }
}
