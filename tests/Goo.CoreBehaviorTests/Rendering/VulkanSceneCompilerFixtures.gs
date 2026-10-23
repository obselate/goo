package Goo

import System

internal class VulkanSceneCompilerFixtures {
  func OwnerIdentitySurvivesCompilerHandoff() bool {
    let resolver = Resolver{}
    let root = Reconciler{Res: resolver}.Mount(Container{
      Width: 100, Height: 100, BackgroundColor: Color.Rgb(255, 0, 0),
    })
    resolver.FlushEffects()
    Layout().Calculate(root, 100.0F, 100.0F)
    try {
      let first = VulkanSceneCompiler(64)
      let second = VulkanSceneCompiler(64)
      let firstId = first.Compile(root, Color.Transparent, 100.0F, 100.0F).RootOwnerId
      let firstOwner = root.VulkanOwner
      let secondId = second.Compile(root, Color.Transparent, 100.0F, 100.0F).RootOwnerId
      let secondOwner = root.VulkanOwner
      if firstOwner == nil || secondOwner == nil || Object.ReferenceEquals(firstOwner, secondOwner) {
        return false
      }
      if first.Compile(root, Color.Transparent, 100.0F, 100.0F).RootOwnerId != firstId
        || !Object.ReferenceEquals(root.VulkanOwner, firstOwner) {
        return false
      }
      return second.Compile(root, Color.Transparent, 100.0F, 100.0F).RootOwnerId == secondId
        && Object.ReferenceEquals(root.VulkanOwner, secondOwner)
    } finally {
      NodeLifecycle.DisposeTree(root)
    }
  }
}
