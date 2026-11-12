package Goo

import System
import System.Runtime.CompilerServices

internal class VulkanSceneCompilerFixtures {
  func TranslationSnappingComposesInWindowSpaceContract() bool {
    let chain = Reconciler{ Res: Resolver{} }.Mount(Container{
      Width: 100, Height: 100, Transform: PanelTransform{ TranslateX: 0.4 }, TransformOriginX: 0,
      Container{ Width: 100, Height: 100, Transform: PanelTransform{ TranslateX: 0.3 }, TransformOriginX: 0,
        Container{ Width: 100, Height: 100, Transform: PanelTransform{ TranslateX: -0.3 }, TransformOriginX: 0,
          Container{ Width: 20, Height: 20, Transform: PanelTransform{ TranslateX: 0.1 }, TransformOriginX: 0 },
        },
      },
    })
    try {
      let layout = Layout()
      layout.SetPixelDensity(1.25F)
      layout.Calculate(chain, 100.0F, 100.0F)
      var current = chain
      var total = 0.0F
      var previous = 0.0F
      for move in []float32{ 0.4F, 0.3F, -0.3F, 0.1F } {
        total += move
        let expected = MathF.Round(total * 1.25F) / 1.25F
        if TransformGeometry.WindowMatrix(current).TX != expected
          || TransformGeometry.Matrix(current).TX != expected - previous { return false }
        previous = expected
        if current.Children.Count > 0 { current = current.Children[0] }
      }
    } finally {
      NodeLifecycle.DisposeTree(chain)
    }
    for transform in []PanelTransform{
      PanelTransform{ TranslateX: 0.4 },
      PanelTransform{ TranslateX: 0.4, Scale: 1.5 },
      PanelTransform{ TranslateX: 0.4, Rotate: 90 },
      PanelTransform{ TranslateX: 0.4, SkewX: 10 },
    } {
      let root = Reconciler{ Res: Resolver{} }.Mount(Container{
        Width: 100, Height: 100, Transform: transform,
        TransformOriginX: 0, TransformOriginY: 0,
        Container{ Width: 20, Height: 20, BackgroundColor: Color.White,
          Transform: PanelTransform{ TranslateX: 0.4 },
          TransformOriginX: 0, TransformOriginY: 0 },
      })
      try {
        let layout = Layout()
        layout.SetPixelDensity(1.25F)
        layout.Calculate(root, 100.0F, 100.0F)
        let child = root.Children[0]
        let local = TransformGeometry.Matrix(child)
        let outer = TransformGeometry.Matrix(root)
        let world = TransformGeometry.WindowMatrix(child)
        let pure = transform.Scale == 1 && transform.Rotate == 0 && transform.SkewX == 0
        if pure {
          if world.TX * 1.25F != 1.0F || local.TX != 0.8F || outer.TX != 0.0F { return false }
        } else if local.TX != 0.4F || outer.TX != 0.4F
          || world.TX != outer.A * 0.4F + outer.TX { return false }
        let compiler = VulkanSceneCompiler(64)
        compiler.Compile(root, Color.Transparent, 100.0F, 100.0F)
        if compiler.Frame.TransformCount != 2 { return false }
        let drawn = compiler.Frame.Transforms[1]
        let parent = compiler.Frame.Transforms[drawn.ParentIndex]
        if drawn.TX != local.TX || parent.TX != outer.TX
          || parent.A * drawn.TX + parent.C * drawn.TY + parent.TX != world.TX { return false }
      } finally {
        NodeLifecycle.DisposeTree(root)
      }
    }
    for move in []float32{ -1.3F, -0.4F, 0.1F, 0.4F, 0.6F, 1.3F } {
      let root = Reconciler{ Res: Resolver{} }.Mount(Container{
        Width: 100, Height: 100, Transform: PanelTransform{ TranslateX: move },
        TransformOriginX: 0, TransformOriginY: 0,
        Container{ Width: 20, Height: 20, Transform: PanelTransform{ Scale: 1.5, TranslateX: 0.4 },
          TransformOriginX: 0, TransformOriginY: 0 },
      })
      try {
        let layout = Layout()
        layout.SetPixelDensity(move == 0.1F ? 0.0F : 1.25F)
        layout.Calculate(root, 100.0F, 100.0F)
        let density = TransformGeometry.PixelDensity(root)
        if move == 0.1F && density != 1.0F { return false }
        let parent = TransformGeometry.WindowMatrix(root)
        let child = TransformGeometry.WindowMatrix(root.Children[0])
        if parent.TX * density != MathF.Round(move * density)
          || MathF.Abs((parent.TX - move) * density) > 0.5F
          || child.TX != parent.TX + 0.4F { return false }
      } finally {
        NodeLifecycle.DisposeTree(root)
      }
    }
    return true
  }

  func TransparentLeafChunksMatchGenericPaint() bool {
    let root = Reconciler{Res: Resolver{}}.Mount(Container{
      Width: 120, Height: 100,
      Container{Width: 40, Height: 20, Opacity: 0.5, BorderRadius: 8},
      Container{Width: 40, Height: 20, BackgroundColor: Color.White},
    })
    try {
      Layout().Calculate(root, 120.0F, 100.0F)
      let compiler = VulkanSceneCompiler(64)
      let actual = compiler.Compile(root, Color.Transparent, 120.0F, 100.0F)
      root.Children[0].Hovered = true
      let oracle = VulkanSceneCompiler(64)
      let expected = oracle.Compile(root, Color.Transparent, 120.0F, 100.0F)
      if actual.ChunkCount != expected.ChunkCount || actual.DrawCount != expected.DrawCount
        || actual.VisibleNodeCount != expected.VisibleNodeCount
        || actual.EmittedNodeCount != expected.EmittedNodeCount
        || actual.UnsupportedPrimitiveCount != expected.UnsupportedPrimitiveCount { return false }
      for index in 0 ... compiler.Frame.ChunkCount {
        let left = compiler.Frame.Chunks[index]
        let right = oracle.Frame.Chunks[index]
        if left.OwnerId != right.OwnerId || left.ContentKey != right.ContentKey
          || left.TopologyKey != right.TopologyKey || left.TransformKey != right.TransformKey
          || left.DrawCount != right.DrawCount || left.ResourceCount != right.ResourceCount
          || left.RetentionState != right.RetentionState { return false }
      }
      let leaf = root.Children[0]
      leaf.Hovered = false
      leaf.BackgroundColor = Color.White
      leaf.BumpScenePaintVersion()
      compiler.Compile(root, Color.Transparent, 120.0F, 100.0F)
      if compiler.Frame.SolidBoxCount + compiler.Frame.RoundedBoxCount != 2 { return false }
      leaf.BackgroundColor = Color.Transparent
      leaf.BumpScenePaintVersion()
      compiler.Compile(root, Color.Transparent, 120.0F, 100.0F)
      return compiler.Frame.SolidBoxCount == 1 && compiler.Frame.RoundedBoxCount == 0
        && leaf.VulkanOwner?.RetainedLeafValid == false
    } finally {
      NodeLifecycle.DisposeTree(root)
    }
  }

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

  func LayerPaintCoverageSurvivesViewportClipping() bool {
    let create = (height int32) -> Container{
      Width: 100,
      Height: 100,
      Opacity: 0.5,
      Container{
        Position: PositionType.Absolute,
        Left: 0,
        Top: 0,
        Width: 80,
        Height: Length(height),
        BackgroundColor: Color.White,
      },
    }
    let resolver = Resolver{}
    let reconciler = Reconciler{Res: resolver}
    let root = reconciler.Mount(create(300))
    try {
      Layout().Calculate(root, 100.0F, 100.0F)
      let compiler = VulkanSceneCompiler(64)
      compiler.Compile(root, Color.Transparent, 100.0F, 100.0F)
      compiler.Compile(root, Color.Transparent, 100.0F, 100.0F)
      if compiler.RangeHitCount != 1 || compiler.RangeCompileCount != 0
        || compiler.Frame.LayerCount != 2 {
          return false
        }
      let retained = compiler.Frame.Layers[0]
      if compiler.Frame.Layer(0).Bounds.Height != 100.0F
        || retained.Bounds.Height != 300.0F || retained.ExtentHeight != 100u {
          return false
        }
      reconciler.Diff(root, create(400))
      resolver.FlushEffects()
      Layout().Calculate(root, 100.0F, 100.0F)
      compiler.Compile(root, Color.Transparent, 100.0F, 100.0F)
      let changed = compiler.Frame.Layers[0]
      return changed.Bounds.Height == 400.0F && compiler.Frame.Layer(0).Bounds.Height == 100.0F
        && changed.ExtentHeight == 100u && Unsafe.SizeOf[LayerRecord]() == 120
        && compiler.Frame.LayerCoverage.Length <= compiler.LastResult.VisibleNodeCount * 2
        && compiler.RangePeakBytes <= 16L * 1024L * 1024L
    } finally {
      NodeLifecycle.DisposeTree(root)
    }
  }
  func ScrollOffsetRetainsCanonicalContent() bool {
    let root = Reconciler{Res: Resolver{}}.Mount(Container{
      Width: 100, Height: 100, OverflowY: Overflow.Scroll,
      Container{Width: 80, Height: 80, FlexShrink: 0, BackgroundColor: Color.White},
      Container{Width: 80, Height: 80, FlexShrink: 0, BackgroundColor: Color.Black},
      Container{Width: 80, Height: 80, FlexShrink: 0, BackgroundColor: Color.White},
    })
    try {
      let layout = Layout()
      layout.Calculate(root, 100.0F, 100.0F)
      let compiler = VulkanSceneCompiler(64)
      compiler.Compile(root, Color.Transparent, 100.0F, 100.0F)
      let first = root.Children[0]
      let bounds = first.Rect
      let paintVersion = first.ScenePaintVersion
      root.ScrollY = 37.5F
      root.ScrollTargetY = 37.5F
      layout.RefreshRects(root)
      compiler.Compile(root, Color.Transparent, 100.0F, 100.0F)
      return first.Rect.Y == bounds.Y && first.ScenePaintVersion == paintVersion
        && TransformGeometry.BoundsToWindow(first).Y == bounds.Y - 38.0F
        && compiler.RangeHitCount == 1 && compiler.RangeCompileCount == 1
        && compiler.Frame.Transforms.Length <= compiler.LastResult.VisibleNodeCount * 3
        && compiler.RangePeakBytes <= 16L * 1024L * 1024L
    } finally {
      NodeLifecycle.DisposeTree(root)
    }
  }

}
