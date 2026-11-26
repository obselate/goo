package Goo

import System

internal class BuiltInLayoutsGapProbeAlgorithm : LayoutAlgorithm {
  internal var MeasuredRowGap float64
  internal var MeasuredColGap float64

  public func Measure(context LayoutContext, available LayoutSize) LayoutSize {
    MeasuredRowGap = context.RowGap
    MeasuredColGap = context.ColumnGap
    return LayoutSize(100.0, 60.0)
  }

  public func Arrange(context LayoutContext, finalSize LayoutSize) {
    MeasuredRowGap = context.RowGap
    MeasuredColGap = context.ColumnGap
    for i in 0 ... context.ChildCount {
      context.ArrangeChild(i, ElementRect{ X: 0.0, Y: 0.0, Width: finalSize.Width, Height: finalSize.Height })
    }
  }
}

internal class BuiltInLayoutsFixtures {
  private func mount(blob Blob) Node -> Reconciler{ Res: Resolver{} }.Mount(blob)

  private func approx(a float32, b float64, tol float64 = 0.25) bool ->
    Math.Abs(float64(a) - b) <= tol

  func GridFixedAutoFractionAndMinMaxContract() bool {
    let sourceTracks = []GridTrack{
      GridTrack.Fixed(40),
      GridTrack.Auto(30, 50),
      GridTrack.Fr(1.0, 20, 70),
      GridTrack.Fr(2.0),
    }
    let grid = Grid{
      Columns: sourceTracks,
      Rows: GridTrack.Repeat(2, GridTrack.Fr(1.0, 10)),
    }
    // Mutating caller array must not affect Grid's defensive copy
    sourceTracks[0] = GridTrack.Fixed(999)

    let c0 = Container{ Key: "fixed", MinWidth: 0, MinHeight: 0 }
    let c1 = Container{ Key: "auto", Width: 80, MinWidth: 0, MinHeight: 0 }
    let c2 = Container{ Key: "capped", MinWidth: 0, MinHeight: 0 }
    let c3 = Container{ Key: "rest", MinWidth: 0, MinHeight: 0 }
    let c4 = Grid.Span(Container{ Key: "bottom", MinWidth: 0, MinHeight: 0 }, columns: 4)

    let root = mount(Container{
      Width: 300,
      Height: 100,
      Layout: grid,
      c0, c1, c2, c3, c4,
    })
    let layout = Layout()
    layout.Calculate(root, 300.0F, 100.0F)
    let nodes = root.Children
    if !approx(nodes[0].Rect.W, 40) || !approx(nodes[1].Rect.W, 50)
      || !approx(nodes[2].Rect.W, 70) || !approx(nodes[3].Rect.W, 140) { return false }
    if !approx(nodes[4].Rect.W, 300) || !approx(nodes[4].Rect.Y, 50) || !approx(nodes[4].Rect.H, 50) { return false }

    // MinContent vs MaxContent tracks
    let minMaxRoot = mount(Container{
      ColumnGap: 10,
      Layout: Grid{
        Columns: []GridTrack{ GridTrack.MinContent(), GridTrack.MaxContent() },
      },
      Text{ Content: "alpha beta" },
      Text{ Content: "alpha beta" },
    })
    layout.Calculate(minMaxRoot, 400.0F, 200.0F)
    let minColW = minMaxRoot.Children[0].Rect.W
    let maxColW = minMaxRoot.Children[1].Rect.W
    return minColW > 0.0F && maxColW > minColW + 5.0F
  }

  func GridPlacementAutoFlowDenseAndSpansContract() bool {
    let layout = Layout()
    let makeDenseTest = (dense bool) -> {
      let a = Grid.Span(Container{ Key: "a", Width: 20, Height: 20 }, columns: 2)
      let b = Grid.Span(Container{ Key: "b", Width: 20, Height: 20 }, columns: 2)
      let c = Container{ Key: "c", Width: 20, Height: 20 }
      return mount(Container{
        Width: 300,
        Height: 100,
        Layout: Grid{
          Columns: GridTrack.Repeat(3, GridTrack.Fr(1)),
          Rows: GridTrack.Repeat(2, GridTrack.Fixed(40)),
          Dense: dense,
        },
        a, b, c,
      })
    }

    let sparseRoot = makeDenseTest(false)
    layout.Calculate(sparseRoot, 300.0F, 100.0F)
    if !approx(sparseRoot.Children[2].Rect.X, 200) || !approx(sparseRoot.Children[2].Rect.Y, 40) { return false }

    let denseRoot = makeDenseTest(true)
    layout.Calculate(denseRoot, 300.0F, 100.0F)
    if !approx(denseRoot.Children[2].Rect.X, 200) || !approx(denseRoot.Children[2].Rect.Y, 0) { return false }

    let aligned = Grid.Align(
      Grid.Place(Container{ Width: 20, Height: 10 }, column: 1, row: 1),
      horizontal: LayoutAlign.End,
      vertical: LayoutAlign.Center
    )
    let flowRoot = mount(Container{
      Width: 200,
      Height: 100,
      Layout: Grid{
        Columns: GridTrack.Repeat(2, GridTrack.Fixed(100)),
        Rows: GridTrack.Repeat(2, GridTrack.Fixed(50)),
        Flow: GridFlow.Column,
      },
      Container{},
      Container{},
      aligned,
      Grid.Place(Container{}, column: 1, row: 1),
    })
    layout.Calculate(flowRoot, 200.0F, 100.0F)
    let r2 = flowRoot.Children[2].Rect
    let r3 = flowRoot.Children[3].Rect
    return approx(flowRoot.Children[1].Rect.X, 0) && approx(flowRoot.Children[1].Rect.Y, 50)
      && approx(r2.X, 180) && approx(r2.Y, 70) && approx(r2.W, 20) && approx(r2.H, 10)
      && approx(r3.X, 100) && approx(r3.Y, 50) && approx(r3.W, 100) && approx(r3.H, 50)
  }

  func GridGapsRtlWrappingDisplayNoneAndNestedContract() bool {
    let layout = Layout()
    let innerGrid = Container{
      ColumnGap: 4,
      Layout: Grid{
        Columns: GridTrack.Repeat(2, GridTrack.Fr(1)),
      },
      Container{ Height: 16 },
      Container{ Height: 16 },
    }
    let wrappedText = Text{ Content: "This sentence should wrap cleanly inside a 100px grid column." }
    let hidden = Container{ Width: 500, Height: 500, Display: Display.None }

    let root = mount(Container{
      Width: 220,
      Direction: Direction.RightToLeft,
      RowGap: 10,
      ColumnGap: 20,
      Layout: Grid{
        Columns: []GridTrack{ GridTrack.Fixed(100), GridTrack.Fr(1) },
      },
      wrappedText,
      hidden,
      innerGrid,
    })
    layout.Calculate(root, 220.0F, 400.0F)
    let textRect = root.Children[0].Rect
    let hiddenRect = root.Children[1].Rect
    let innerRect = root.Children[2].Rect
    if !approx(textRect.X, 120) || !approx(textRect.W, 100) || textRect.H <= 20.0F { return false }
    if hiddenRect.W != 0.0F || hiddenRect.H != 0.0F { return false }
    if !approx(innerRect.X, 0) || !approx(innerRect.W, 100) { return false }
    if !approx(root.Children[2].Children[0].Rect.W, 48) || !approx(root.Children[2].Children[1].Rect.W, 48) { return false }

    let changed = CustomLayouts.Configure(root, Grid{
      Columns: []GridTrack{ GridTrack.Fixed(100), GridTrack.Fr(1) },
    })
    return !changed
  }

  func OverlayAlignmentIgnoreSizeAndRtlContract() bool {
    let layout = Layout()
    let bg = Container{ Width: 100, Height: 60 }
    let badge = Overlay.Place(
      Container{ Width: 16, Height: 16 },
      horizontal: LayoutAlign.End,
      vertical: LayoutAlign.Start,
      ignoreSize: true
    )
    let hugeIgnored = Overlay.Place(
      Container{ Width: 500, Height: 500 },
      ignoreSize: true
    )
    let hidden = Container{ Width: 400, Height: 400, Display: Display.None }
    let centerWrap = Overlay.Place(
      Text{ Content: "Hi" },
      horizontal: LayoutAlign.Stretch,
      vertical: LayoutAlign.Center
    )

    let overlay = Container{
      Direction: Direction.RightToLeft,
      Layout: Overlay.Default,
      bg,
      badge,
      hugeIgnored,
      hidden,
      centerWrap,
    }
    let host = mount(Container{
      Width: 400,
      Height: 400,
      FlexDirection: FlexDirection.Row,
      AlignItems: AlignItems.FlexStart,
      overlay,
    })
    layout.Calculate(host, 400.0F, 400.0F)
    let root = host.Children[0]
    if !approx(root.Rect.W, 100) || !approx(root.Rect.H, 60) { return false }
    if !approx(root.Children[0].Rect.W, 100) || !approx(root.Children[0].Rect.H, 60) { return false }
    if !approx(root.Children[1].Rect.X, 0) || !approx(root.Children[1].Rect.Y, 0) { return false }
    if root.Children[3].Rect.W != 0.0F || root.Children[3].Rect.H != 0.0F { return false }
    let wrapRect = root.Children[4].Rect
    return approx(wrapRect.W, 100) && wrapRect.Y >= 10.0F && wrapRect.H > 0.0F && wrapRect.H < 40.0F
  }

  func DockEdgesFillOrderGapsAndRtlContract() bool {
    let layout = Layout()
    let fillFirst = Dock.Fill(Container{ Key: "fill", MinWidth: 0, MinHeight: 0 })
    let top = Dock.Top(Container{ Height: 20 })
    let bottom = Dock.Bottom(Container{ Height: 10 })
    let start = Dock.Start(Container{ Width: 30 })
    let end = Dock.End(Container{ Width: 15 })
    let hidden = Dock.Top(Container{ Height: 100, Display: Display.None })

    let root = mount(Container{
      Width: 200,
      Height: 100,
      RowGap: 4,
      ColumnGap: 6,
      Layout: Dock.Default,
      fillFirst,
      top,
      bottom,
      start,
      end,
      hidden,
    })
    layout.Calculate(root, 200.0F, 100.0F)
    let c = root.Children
    if !approx(c[1].Rect.Y, 0) || !approx(c[1].Rect.H, 20) { return false }
    if !approx(c[2].Rect.Y, 90) || !approx(c[2].Rect.H, 10) { return false }
    if !approx(c[3].Rect.X, 0) || !approx(c[3].Rect.W, 30) || !approx(c[3].Rect.H, 62) { return false }
    if !approx(c[4].Rect.X, 185) || !approx(c[4].Rect.W, 15) { return false }
    if c[5].Rect.W != 0.0F || c[5].Rect.H != 0.0F { return false }
    if !approx(c[0].Rect.X, 36) || !approx(c[0].Rect.Y, 24)
      || !approx(c[0].Rect.W, 143) || !approx(c[0].Rect.H, 62) { return false }

    let rtlRoot = mount(Container{
      Width: 100,
      Height: 50,
      Direction: Direction.RightToLeft,
      Layout: Dock{ LastChildFill: false },
      Dock.Start(Container{ Width: 20 }),
      Dock.Left(Container{ Width: 10 }),
      Container{ Width: 15 },
    })
    layout.Calculate(rtlRoot, 100.0F, 50.0F)
    let rc = rtlRoot.Children
    if !approx(rc[0].Rect.X, 80) || !approx(rc[1].Rect.X, 0) || !approx(rc[2].Rect.X, 65) { return false }

    let intrinsicHost = mount(Container{
      Width: 500,
      Height: 500,
      FlexDirection: FlexDirection.Row,
      AlignItems: AlignItems.FlexStart,
      Container{
        Gap: 5,
        Layout: Dock.Default,
        Dock.Top(Container{ Width: 60, Height: 20 }),
        Dock.Start(Container{ Width: 25, Height: 30 }),
        Container{ Width: 50, Height: 40 },
      },
    })
    layout.Calculate(intrinsicHost, 500.0F, 500.0F)
    let intrinsic = intrinsicHost.Children[0]
    return approx(intrinsic.Rect.W, 80) && approx(intrinsic.Rect.H, 65)
  }

  func LayoutContextGapAndZeroAllocationContract() bool {
    let layout = Layout()
    let probe = BuiltInLayoutsGapProbeAlgorithm()
    let probeRoot = mount(Container{
      Width: 200,
      Height: 100,
      Gap: 12,
      ColumnGap: Percent(10),
      Layout: probe,
      Container{},
    })
    layout.Calculate(probeRoot, 200.0F, 100.0F)
    if Math.Abs(probe.MeasuredRowGap - 12.0) > 0.01 || Math.Abs(probe.MeasuredColGap - 20.0) > 0.01 {
      return false
    }

    let gridRoot = Container{
      Layout: Grid{
        Columns: GridTrack.Repeat(3, GridTrack.Fr(1)),
        Rows: GridTrack.Repeat(2, GridTrack.Auto()),
      },
      Gap: 8,
      Container{ Height: 20 }, Container{ Height: 20 }, Container{ Height: 20 },
      Container{ Height: 20 }, Container{ Height: 20 }, Container{ Height: 20 },
    }
    let overlayRoot = Container{
      Layout: Overlay.Default,
      Container{ Width: 40, Height: 30 },
      Overlay.Place(Container{ Width: 10, Height: 10 }, horizontal: LayoutAlign.End, vertical: LayoutAlign.End),
    }
    let dockRoot = Container{
      Layout: Dock.Default,
      Gap: 4,
      Dock.Top(Container{ Height: 20 }),
      Dock.Start(Container{ Width: 30 }),
      Container{},
    }
    let benchRoot = mount(Container{
      Width: Percent(100),
      Height: Percent(100),
      gridRoot,
      overlayRoot,
      dockRoot,
    })
    layout.Calculate(benchRoot, 320.0F, 240.0F)
    layout.Calculate(benchRoot, 480.0F, 360.0F)

    let before = GC.GetAllocatedBytesForCurrentThread()
    for step in 0 ... 10 {
      let w = 300.0F + float32(step * 20)
      let h = 240.0F + float32(step * 10)
      layout.Calculate(benchRoot, w, h)
    }
    let allocated = GC.GetAllocatedBytesForCurrentThread() - before
    return allocated == 0L
  }

  func BuiltInLayoutsValidationContract() bool {
    var threw = false
    try { let _ = GridTrack.Fixed(-1.0) } catch (_ ArgumentOutOfRangeException) { threw = true }
    if !threw { return false }
    threw = false
    try { let _ = GridTrack.Fr(0.0) } catch (_ ArgumentOutOfRangeException) { threw = true }
    if !threw { return false }
    threw = false
    try { let _ = GridTrack.Repeat(-1, GridTrack.Auto()) } catch (_ ArgumentOutOfRangeException) { threw = true }
    if !threw { return false }
    threw = false
    try { let _ = Grid.Place(Container{}, column: -1) } catch (_ ArgumentOutOfRangeException) { threw = true }
    if !threw { return false }
    threw = false
    try { let _ = Grid.Span(Container{}, columns: 0) } catch (_ ArgumentOutOfRangeException) { threw = true }
    if !threw { return false }
    threw = false
    try { let _ = Overlay.Place(Container{}, horizontal: LayoutAlign(99)) } catch (_ ArgumentOutOfRangeException) { threw = true }
    return threw
  }

  func OverlayAndDockLayoutTransitionProjectionContract() bool {
    let transition = LayoutTransition(1000.0, Easing.Linear)
    let scene = (w float64, h float64) -> Container{
      Width: 300,
      Height: 300,
      FlexDirection: FlexDirection.Column,
      AlignItems: AlignItems.FlexStart,
      Gap: 10,
      Container{
        Width: w,
        Height: h,
        LayoutTransition: transition,
        Layout: Overlay.Default,
        Overlay.Place(
          Container{ Width: 20, Height: 10, LayoutTransition: transition },
          horizontal: LayoutAlign.End,
          vertical: LayoutAlign.End
        ),
      },
      Container{
        Width: w,
        Height: h,
        LayoutTransition: transition,
        Layout: Dock.Default,
        Dock.Bottom(Container{ Height: 14, LayoutTransition: transition }),
        Dock.End(Container{ Width: 24, LayoutTransition: transition }),
        Container{},
      },
    }
    let pump = MotionPump()
    let reconciler = Reconciler{ Res: Resolver{}, Pump: pump }
    let layout = Layout()
    let root = reconciler.Mount(scene(100.0, 80.0))
    try {
      layout.Calculate(root, 300.0F, 300.0F)
      reconciler.Diff(root, scene(200.0, 160.0))
      layout.Calculate(root, 300.0F, 300.0F)
      pump.Sweep(0.5)
      layout.RefreshRects(root)

      let overlayBox = root.Children[0]
      let overlayBadge = overlayBox.Children[0]
      // At t=0.5, overlayBox is 150x120; badge (20x10) must stick to End/End => (130, 110)
      if !approx(overlayBox.Rect.W, 150) || !approx(overlayBox.Rect.H, 120) { return false }
      if !approx(overlayBadge.Rect.X - overlayBox.Rect.X, 130)
        || !approx(overlayBadge.Rect.Y - overlayBox.Rect.Y, 110) { return false }

      let dockBox = root.Children[1]
      let dockBottom = dockBox.Children[0]
      let dockEnd = dockBox.Children[1]
      // At t=0.5, dockBox is 150x120; dockBottom (h=14) at Y=106, dockEnd (w=24) at X=126
      if !approx(dockBox.Rect.W, 150) || !approx(dockBox.Rect.H, 120) { return false }
      if !approx(dockBottom.Rect.Y - dockBox.Rect.Y, 106) { return false }
      if !approx(dockEnd.Rect.X - dockBox.Rect.X, 126) { return false }
      return true
    } finally { NodeLifecycle.DisposeTree(root) }
  }

  private func swapScene(algo LayoutAlgorithm?) Blob {
    let target = Container{
      Key: "swap-target",
      Height: 120,
      FlexDirection: FlexDirection.Row,
      Gap: 10,
      Layout: algo,
      Container{ Key: "c0", Width: 60, Height: 40 },
      Container{ Key: "c1", Width: 60, Height: 40 },
    }
    let middle = Container{}
    middle.Children.Add(target)
    let outer = Container{
      Width: 300,
      Height: 200,
      Layout: Dock.Default,
    }
    outer.Children.Add(Dock.Top(Container{ Height: 20 }))
    outer.Children.Add(middle)
    return outer
  }

  func NestedCustomLayoutSwapToFlexContract() bool {
    let layout = Layout()
    let gridAlgo = Grid{ Columns: GridTrack.Repeat(2, GridTrack.Fr(1)) }
    let reconciler = Reconciler{ Res: Resolver{} }
    let root = reconciler.Mount(swapScene(gridAlgo))
    try {
      layout.Calculate(root, 300.0F, 200.0F)
      let target = root.Children[1].Children[0]
      let c0 = target.Children[0]
      let c1 = target.Children[1]
      // Grid: 2 columns of (300 - 10)/2 = 145
      if !approx(c0.Rect.W, 145) || !approx(c1.Rect.X - target.Rect.X, 155) { return false }

      // Swap to nil (Flex Row): c0 and c1 return to declared 60x40!
      reconciler.Diff(root, swapScene(nil))
      layout.Calculate(root, 300.0F, 200.0F)
      if !approx(c0.Rect.W, 60) || !approx(c1.Rect.W, 60) || !approx(c1.Rect.X - target.Rect.X, 70) { return false }

      // Swap to Dock
      reconciler.Diff(root, swapScene(Dock.Default))
      layout.Calculate(root, 300.0F, 200.0F)
      if !approx(c0.Rect.H, 120) || !approx(c1.Rect.W, 230) { return false }

      // Swap back to nil (Flex Row)
      reconciler.Diff(root, swapScene(nil))
      layout.Calculate(root, 300.0F, 200.0F)
      return approx(c0.Rect.W, 60) && approx(c0.Rect.H, 40) && approx(c1.Rect.W, 60)
    } finally { NodeLifecycle.DisposeTree(root) }
  }

  func FixedSizeDockGapAndDirectionInvalidationContract() bool {
    let layout = Layout()
    let scene = (gap float64, dir Direction) -> Container{
      Width: 200,
      Height: 100,
      Gap: gap,
      Direction: dir,
      Layout: Dock.Default,
      Dock.Top(Container{ Key: "top", Height: 20 }),
      Dock.Start(Container{ Key: "start", Width: 30 }),
      Container{ Key: "fill" },
    }
    let reconciler = Reconciler{ Res: Resolver{} }
    let root = reconciler.Mount(scene(0.0, Direction.LeftToRight))
    try {
      layout.Calculate(root, 200.0F, 100.0F)
      let start = root.Children[1]
      let fill = root.Children[2]
      if !approx(start.Rect.Y, 20) || !approx(start.Rect.X, 0) || !approx(fill.Rect.X, 30) || !approx(fill.Rect.W, 170) {
        return false
      }

      // Change Gap only on fixed-size Dock (same 200x100 size)
      reconciler.Diff(root, scene(10.0, Direction.LeftToRight))
      layout.Calculate(root, 200.0F, 100.0F)
      if !approx(start.Rect.Y, 30) || !approx(fill.Rect.X, 40) || !approx(fill.Rect.W, 160) {
        return false
      }

      // Change Direction only on fixed-size Dock (same 200x100 size)
      reconciler.Diff(root, scene(10.0, Direction.RightToLeft))
      layout.Calculate(root, 200.0F, 100.0F)
      return approx(start.Rect.X, 170) && approx(fill.Rect.X, 0) && approx(fill.Rect.W, 160)
    } finally { NodeLifecycle.DisposeTree(root) }
  }

  func GridRtlOverflowAutoShrinkImmutabilityAndLargeWeightsContract() bool {
    let layout = Layout()
    // 1. RTL overflow: columns must not collapse onto X=0
    let rtlOverflow = mount(Container{
      Width: 150,
      Height: 60,
      Direction: Direction.RightToLeft,
      Layout: Grid{
        Columns: []GridTrack{ GridTrack.Fixed(120), GridTrack.Fixed(120) },
      },
      Container{ Key: "r0", Height: 30 },
      Container{ Key: "r1", Height: 30 },
    })
    layout.Calculate(rtlOverflow, 150.0F, 60.0F)
    if !approx(rtlOverflow.Children[0].Rect.X, 120) || !approx(rtlOverflow.Children[1].Rect.X, 0) {
      return false
    }

    // 2. Auto shrinks toward MinContent under tight width while MaxContent stays unconstrained
    let autoRoot = mount(Container{
      Width: 160,
      Layout: Grid{
        Columns: []GridTrack{ GridTrack.Auto(), GridTrack.Fixed(60) },
      },
      Text{ Content: "Long wrapping sentence inside an auto column track." },
      Container{ Height: 20 },
    })
    layout.Calculate(autoRoot, 160.0F, 200.0F)
    if !approx(autoRoot.Children[0].Rect.W, 100) || autoRoot.Children[0].Rect.H <= 22.0F {
      return false
    }

    let maxRoot = mount(Container{
      Width: 160,
      Layout: Grid{
        Columns: []GridTrack{ GridTrack.MaxContent(), GridTrack.Fixed(60) },
      },
      Text{ Content: "Long wrapping sentence inside a max-content column track." },
      Container{ Height: 20 },
    })
    layout.Calculate(maxRoot, 160.0F, 200.0F)
    if maxRoot.Children[0].Rect.W <= 120.0F { return false }

    // 3. Columns/Rows views cannot be downcast to mutable []GridTrack
    let g = Grid{
      Columns: []GridTrack{ GridTrack.Fr(1e300), GridTrack.Fr(2e300) },
      Rows: []GridTrack{ GridTrack.Fixed(40) },
    }
    if (g.Columns is []GridTrack) || (g.Rows is []GridTrack) { return false }

    // 4. Huge Fraction weights normalize without Infinity/NaN overflow
    let hugeRoot = mount(Container{
      Width: 300,
      Height: 40,
      Layout: g,
      Container{},
      Container{},
    })
    layout.Calculate(hugeRoot, 300.0F, 40.0F)
    return approx(hugeRoot.Children[0].Rect.W, 100) && approx(hugeRoot.Children[1].Rect.W, 200)
  }

  func OverlayChildOnlySizeTransitionStaysCenteredContract() bool {
    let transition = LayoutTransition(1000.0, Easing.Linear)
    let scene = (w float64, h float64) -> Container{
      Width: 200,
      Height: 100,
      Layout: Overlay.Default,
      Overlay.Place(
        Container{ Width: w, Height: h, LayoutTransition: transition },
        horizontal: LayoutAlign.Center,
        vertical: LayoutAlign.Center
      ),
    }
    let pump = MotionPump()
    let reconciler = Reconciler{ Res: Resolver{}, Pump: pump }
    let layout = Layout()
    let root = reconciler.Mount(scene(40.0, 20.0))
    try {
      layout.Calculate(root, 200.0F, 100.0F)
      reconciler.Diff(root, scene(100.0, 60.0))
      layout.Calculate(root, 200.0F, 100.0F)
      pump.Sweep(0.5)
      layout.RefreshRects(root)

      let child = root.Children[0]
      return approx(child.Rect.W, 70) && approx(child.Rect.H, 40)
        && approx(child.Rect.X, 65) && approx(child.Rect.Y, 30)
    } finally { NodeLifecycle.DisposeTree(root) }
  }
}
