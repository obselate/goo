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
      root.BumpScenePaintVersion()
      if !compiler.Compile(root, Color.Black, 100.0F, 100.0F).BackgroundDrawn { return false }
      if compiler.Frame.SolidBoxes[compiler.Frame.SolidBoxCount - 1].Opacity != 0.5F { return false }
      root.Opacity = 1.0
      root.BorderRadius = Length(8)
      root.BumpScenePaintVersion()
      if !compiler.Compile(root, Color.Black, 100.0F, 100.0F).BackgroundDrawn { return false }
      root.BorderRadius = Length(0)
      root.BumpScenePaintVersion()
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
      guard let priorFirst = root.VulkanOwner else { return false }
      let priorSecondId = second.Compile(root, Color.Transparent, 100.0F, 100.0F).RootOwnerId
      guard let priorSecond = root.VulkanOwner else { return false }
      NodeLifecycle.DisposeTree(root)
      if root.VulkanOwner != nil || root.VulkanOwnerToken != nil
        || priorFirst.RetainedLeafValid || priorSecond.RetainedLeafValid { return false }
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

  func RectangleUpdatesPreserveFloatBits() bool {
    let root = Reconciler{Res: Resolver{}}.Mount(Container{
      Width: 100, Height: 100, BackgroundColor: Color.Rgb(255, 0, 0),
    })
    Layout().Calculate(root, 100.0F, 100.0F)
    try {
      let compiler = VulkanSceneCompiler(64)
      compiler.Compile(root, Color.Transparent, 100.0F, 100.0F)
      var bounds = root.Rect
      bounds.X = BitConverter.Int32BitsToSingle(int32.MinValue)
      root.Rect = bounds
      compiler.Compile(root, Color.Transparent, 100.0F, 100.0F)
      return compiler.Frame.SolidBoxCount == 1
        && BitConverter.SingleToInt32Bits(compiler.Frame.SolidBoxes[0].Bounds.X) == int32.MinValue
    } finally {
      NodeLifecycle.DisposeTree(root)
    }
  }

  func DirtySubtreeRecompileMatchesFresh() bool {
    let create = (clipped bool, color Color) -> Container{
      Width: 120, Height: 100,
      Container{
        Key: "changed", Width: 50, Height: 40, BackgroundColor: color,
        OverflowX: clipped ? Overflow.Hidden : Overflow.Visible,
        OverflowY: clipped ? Overflow.Hidden : Overflow.Visible,
      },
      Container{
        Key: "retained", Width: 50, Height: 40,
        OverflowX: Overflow.Hidden, OverflowY: Overflow.Hidden,
        Container{ Width: 20, Height: 20, BackgroundColor: Color.White },
      },
    }
    let resolver = Resolver{}
    let reconciler = Reconciler{ Res: resolver }
    let root = reconciler.Mount(create(false, Color.Black))
    let oracleRoot = Reconciler{ Res: Resolver{} }.Mount(create(true, Color.White))
    try {
      Layout().Calculate(root, 120.0F, 100.0F)
      let compiler = VulkanSceneCompiler(64)
      compiler.Compile(root, Color.Transparent, 120.0F, 100.0F)
      compiler.Compile(root, Color.Transparent, 120.0F, 100.0F)
      if compiler.RangeHitCount != 1 || compiler.RangeCompileCount != 0
        || compiler.RetainedOwnerCount != 4 { return false }
      let precedingVersion = compiler.LastResult.FrameVersion
      var region VulkanDamageRegion
      var fullRedraw bool
      if !compiler.BuildDamage(0uL, precedingVersion, 1.0F, 1.0F,
        120u, 100u, out region, out fullRedraw) || !fullRedraw { return false }
      reconciler.Diff(root, create(false, Color.White))
      resolver.FlushEffects()
      Layout().Calculate(root, 120.0F, 100.0F)
      let changed = compiler.Compile(root, Color.Transparent, 120.0F, 100.0F)
      guard let changedOwner = root.Children[0].VulkanOwner,
        let retainedOwner = root.Children[1].Children[0].VulkanOwner else { return false }
      var changedVerified = false
      var retainedVerified = false
      for index in 0 ... compiler.Frame.ChunkCount {
        let chunk = compiler.Frame.Chunks[index]
        if chunk.OwnerId == changedOwner.Value && chunk.DrawCount > 0 {
          if !chunk.Dirty || chunk.RangeContentRetained { return false }
          changedVerified = true
        }
        if chunk.OwnerId == retainedOwner.Value && chunk.DrawCount > 0 {
          if chunk.Dirty || !chunk.RangeContentRetained { return false }
          retainedVerified = true
        }
      }
      if !changedVerified || !retainedVerified { return false }
      if !compiler.BuildDamage(precedingVersion, changed.FrameVersion, 1.0F, 1.0F,
        120u, 100u, out region, out fullRedraw) || fullRedraw || region.IsEmpty { return false }
      reconciler.Diff(root, create(true, Color.White))
      resolver.FlushEffects()
      Layout().Calculate(root, 120.0F, 100.0F)
      compiler.Compile(root, Color.Transparent, 120.0F, 100.0F)
      if compiler.RangeHitCount != 1 || compiler.RangeCompileCount != 2 { return false }
      Layout().Calculate(oracleRoot, 120.0F, 100.0F)
      let oracle = VulkanSceneCompiler(64)
      oracle.Compile(oracleRoot, Color.Transparent, 120.0F, 100.0F)
      let actual = compiler.Frame
      let expected = oracle.Frame
      if actual.DrawRefCount != expected.DrawRefCount { return false }
      for index in 0 ... actual.DrawRefCount {
        let left = actual.DrawRefs[index]
        let right = expected.DrawRefs[index]
        if left.Kind != right.Kind || left.Flags != right.Flags || left.ClipChainId != right.ClipChainId
          || actual.DrawContentDigest(left) != expected.DrawContentDigest(right) { return false }
      }
      return compiler.RangeRetainedBytes <= 16L * 1024L * 1024L
        && compiler.RangePeakBytes <= 16L * 1024L * 1024L
    } finally {
      NodeLifecycle.DisposeTree(root)
      NodeLifecycle.DisposeTree(oracleRoot)
    }
  }
}
