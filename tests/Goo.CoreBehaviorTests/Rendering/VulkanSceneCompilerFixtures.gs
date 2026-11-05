package Goo

import System

internal class VulkanSceneCompilerFixtures {
  func OpaqueViewportRootSkipsCoveredBackground() bool {
    let resolver = Resolver{}
    let root = Reconciler{Res: resolver}.Mount(Container{
      Width: 100, Height: 100, BackgroundColor: Color.Rgb(255, 0, 0),
    })
    resolver.FlushEffects()
    Layout().Calculate(root, 100.0F, 100.0F)
    try {
      let compiler = VulkanSceneCompiler(64)
      if compiler.Compile(root, Color.Black, 100.0F, 100.0F).BackgroundDrawn { return false }
      root.Opacity = 0.5
      if !compiler.Compile(root, Color.Black, 100.0F, 100.0F).BackgroundDrawn { return false }
      root.Opacity = 1.0
      root.BorderRadius = Length(8)
      if !compiler.Compile(root, Color.Black, 100.0F, 100.0F).BackgroundDrawn { return false }
      root.BorderRadius = Length(0)
      return compiler.Compile(root, Color.Black, 101.0F, 100.0F).BackgroundDrawn
    } finally {
      NodeLifecycle.DisposeTree(root)
    }
  }

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

  func ReboundMountGetsFreshCompilerOwners() bool {
    let resolver = Resolver{}
    let reconciler = Reconciler{Res: resolver}
    let root = reconciler.Mount(Container{
      Width: 100, Height: 100, BackgroundColor: Color.Rgb(255, 0, 0),
    })
    Layout().Calculate(root, 100.0F, 100.0F)
    try {
      let first = VulkanSceneCompiler(64)
      let second = VulkanSceneCompiler(64)
      let priorFirstId = first.Compile(root, Color.Transparent, 100.0F, 100.0F).RootOwnerId
      let priorFirst = root.VulkanOwner
      let priorSecondId = second.Compile(root, Color.Transparent, 100.0F, 100.0F).RootOwnerId
      let priorSecond = root.VulkanOwner
      NodeLifecycle.DisposeTree(root)
      if !root.TryBeginRebind() { return false }
      let color = Color.Rgb(0, 0, 255)
      let rebound = reconciler.Diff(root, Container{
        Width: 100, Height: 100, BackgroundColor: color,
      })
      if !Object.ReferenceEquals(root, rebound) { return false }
      Layout().Calculate(root, 100.0F, 100.0F)
      let firstId = first.Compile(root, Color.Transparent, 100.0F, 100.0F).RootOwnerId
      guard let firstOwner = root.VulkanOwner else { return false }
      if firstId == priorFirstId || Object.ReferenceEquals(firstOwner, priorFirst)
        || firstOwner.Generation != root.MountGeneration || first.Frame.SolidBoxCount != 1
        || first.Frame.SolidBoxes[0].Color != color.ToPackedRgba() { return false }
      let secondId = second.Compile(root, Color.Transparent, 100.0F, 100.0F).RootOwnerId
      guard let secondOwner = root.VulkanOwner else { return false }
      if secondId == priorSecondId || Object.ReferenceEquals(secondOwner, priorSecond)
        || secondOwner.Generation != root.MountGeneration || second.Frame.SolidBoxCount != 1
        || second.Frame.SolidBoxes[0].Color != color.ToPackedRgba() { return false }
      return first.Compile(root, Color.Transparent, 100.0F, 100.0F).RootOwnerId == firstId
        && Object.ReferenceEquals(root.VulkanOwner, firstOwner)
    } finally {
      NodeLifecycle.DisposeTree(root)
    }
  }
}
