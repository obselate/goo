package Goo

import Facebook.Yoga
import System
import System.Collections.Generic
import System.IO
import System.Text

internal class LayoutFixtures {
  func RelativeLengthsResolveAfterLateMountContract() bool {
    let cell = RelativeLateMountFixtureCell()
    let window = Window{Root: cell, Size: LayoutSize(400, 100)}
    try {
      window.UpdateTree()
      let root = window.Tree!!
      if root.Children.Count != 0 { return false }
      window.Size = LayoutSize(600, 100)
      window.UpdateTree()
      cell.Visible.Value = true
      window.UpdateTree()
      let child = root.Children[0]
      if child.Rect.W != 300 || child.Children[0].Rect.X - child.Rect.X != 20
        || child.Children[0].Rect.Y - child.Rect.Y != 20 { return false }
      window.Size = LayoutSize(800, 100)
      window.UpdateTree()
      return window.Tree == root && root.Children[0] == child && child.Rect.W == 400
        && child.Children[0].Rect.X - child.Rect.X == 20 && child.Children[0].Rect.Y - child.Rect.Y == 20
    } finally { window.Close() }
  }

  func RelativeDeclarationsUpdateMountedNodesContract() bool {
    let cell = RelativeRigorFixtureCell()
    let window = Window{Root: cell, Size: LayoutSize(400, 100)}
    try {
      window.UpdateTree()
      let node = window.Tree!!.Children[0]
      if node.Rect.W != 20 || Transforming.TranslateX(node).Value != 20 { return false }
      cell.Units = 2
      cell.Rebuild()
      window.UpdateTree()
      return window.Tree!!.Children[0] == node && node.Rect.W == 40 && Transforming.TranslateX(node).Value == 40
    } finally { window.Close() }
  }

  func RetiredRelativeNodesStopResolvingContract() bool {
    let cell = RelativeRigorFixtureCell()
    let window = Window{Root: cell, Size: LayoutSize(400, 100)}
    try {
      window.UpdateTree()
      let retired = window.Tree!!.Children[1]
      if retired.Width.Px != 200 { return false }
      cell.Show = false
      cell.Rebuild()
      window.UpdateTree()
      if !retired.Retired { return false }
      window.Size = LayoutSize(800, 100)
      window.UpdateTree()
      return retired.Width.Px == 200 && window.Tree!!.Children.Count == 1
    } finally { window.Close() }
  }

  func SizedScrollExtentUsesContentContract() bool {
    let handle = ElementHandle()
    let content = ElementHandle()
    let window = Window{Size: LayoutSize(200, 100), SmoothScrolling: false,
      Root: SizedRootFixture(() -> Sized(size -> Container{Handle: content, Width: 300, Height: 500}){
        .Handle: handle, .Padding: 10, .OverflowY: Overflow.Scroll})}
    try {
      window.UpdateTree()
      let root = window.Tree!!
      if root.Rect.H != 100 || root.ContentH != 500 {
        throw InvalidOperationException("Sized scroll extent: height=${root.Rect.H}, content=${root.ContentH}")
      }
      if !handle.ScrollTo(0, 50) { return false }
      window.UpdateTree(1.0)
      if root.ScrollY != 50 || content.BorderBox.Y != -40 {
        throw InvalidOperationException("Sized scroll position: offset=${root.ScrollY}, content=${content.BorderBox.Y}")
      }
      window.Size = LayoutSize(220, 100)
      window.UpdateTree()
      if content.BorderBox.Y != -40 { return false }
      return true
    } finally { window.Close() }
  }

  func SizedNestedPortalUsesFinalSizeContract() bool {
    var builds = 0
    var received LayoutSize
    let window = Window{Size: LayoutSize(200, 100), Root: SizedRootFixture(() -> Sized(size ->
      Portal{Width: 120, Height: 60, Sized(nested -> {
        builds++
        received = nested
        return Text("portal")
      }){.FlexGrow: 1}}))}
    try {
      window.UpdateTree()
      return builds == 1 && received == LayoutSize(120, 60)
    } finally { window.Close() }
  }

  func SizedContentResolvesLengthsInSameFrameContract() bool {
    let window = Window{Size: LayoutSize(200, 100), Root: SizedRootFixture(() -> Sized(size ->
      Container{Width: Vw(50), Height: Length.MaxContent,
        Container{Width: Em(2), Height: Rem(1), FontSize: 20}}))}
    try {
      window.UpdateTree()
      let content = window.Tree!!.Children[0]
      if content.Rect.W != 100 || content.Rect.H <= 0 || content.Children[0].Rect.W != 40 { return false }
      let height = content.Rect.H
      window.UpdateTree()
      return content.Rect.W == 100 && content.Rect.H == height && content.Children[0].Rect.W == 40
    } finally { window.Close() }
  }

  func SizedAllottedSizeAndLayoutPassesContract() bool {
    var builds = 0
    var received LayoutSize
    let window = Window{Size: LayoutSize(200, 100), Root: SizedRootFixture(() -> Sized(size -> {
      builds++
      received = size
      return Container{Width: 2000, Height: 2000}
    }))}
    let passes = Dictionary[Facebook.Yoga.Node, int32]()
    let subscriber Event.Subscriber = (node Facebook.Yoga.Node?, kind EventType, data Event.Data) -> {
      if kind == EventType.LayoutPassStart && node != nil {
        passes[node] = passes.GetValueOrDefault(node) + 1
      }
    }
    Event.Subscribe(subscriber)
    try {
      window.UpdateTree()
      let root = window.Tree!!
      let yoga = root.Yoga!!
      let initial = passes.GetValueOrDefault(yoga)
      if builds != 1 || received != LayoutSize(200, 100) || root.Rect.W != 200 || root.Rect.H != 100
        || initial != 1 || passes.Count != 2 { return false }
      let child = root.Children[0]
      passes.Clear()
      window.UpdateTree()
      if builds != 1 || passes.Count != 0 { return false }
      window.Size = LayoutSize(240, 120)
      window.UpdateTree()
      let resized = passes.GetValueOrDefault(yoga)
      if builds != 2 || received != LayoutSize(240, 120) || root.Children[0] != child
        || resized != 1 { return false }
      passes.Clear()
      window.UpdateTree()
      Console.WriteLine("Sized layout passes: initial full=$initial, resize full=$resized, stable full=${passes.GetValueOrDefault(yoga)}, stable total=${passes.Count}")
      return builds == 2 && passes.Count == 0
    } finally {
      Event.Unsubscribe(subscriber)
      window.Close()
    }
  }

  func SizedNestedAndMountedGeometryContract() bool {
    var outer = 0
    var inner = 0
    var innerSize LayoutSize
    SizedMountedFixture.Ready = false
    let window = Window{Size: LayoutSize(180, 90), Root: SizedRootFixture(() -> Sized(size -> {
      outer++
      return Container{Padding: 10, Width: Percent(100), Height: Percent(100),
        Sized(nested -> {
          inner++
          innerSize = nested
          return Cell.Mount[SizedMountedFixture]()
        }){.FlexGrow: 1, .MinHeight: 0}}
    }))}
    try {
      window.UpdateTree()
      if outer != 1 || inner != 1 || innerSize != LayoutSize(160, 70) || !SizedMountedFixture.Ready { return false }
      window.UpdateTree()
      return outer == 1 && inner == 1
    } finally { window.Close() }
  }

  func SizedZeroAndUnboundedAxesContract() bool {
    for available in []LayoutSize{LayoutSize(0, 0), LayoutSize(Double.NaN, 80), LayoutSize(120, Double.NaN)} {
      var received LayoutSize
      var builds = 0
      let rec = Reconciler{Res: Resolver{}}
      let root = rec.Mount(Blob.Sized(size -> {
        received = size
        builds++
        return Container{Width: 500, Height: 500}
      }))
      let layout = Layout()
      try {
        layout.Calculate(root, float32(available.Width), float32(available.Height))
        layout.RefreshSized(root, rec)
        let expected = LayoutSize(Double.IsNaN(available.Width) ? 0 : available.Width,
          Double.IsNaN(available.Height) ? 0 : available.Height)
        if builds != 1 || received != expected || root.Rect.W != expected.Width || root.Rect.H != expected.Height {
          return false
        }
        layout.Calculate(root, float32(available.Width), float32(available.Height))
        layout.RefreshSized(root, rec)
        if builds != 1 { return false }
      } finally { NodeLifecycle.DisposeTree(root) }
    }
    return true
  }

  func EllipsisMinimumWidthCanShrinkAndExplicitMinimumWins() bool {
    let reconciler = Reconciler{Res: Resolver{}}
    var root = reconciler.Mount(Text{Content: "Unbreakable", TextTrimming: TextTrimming.Ellipsis})
    let layout = Layout()
    layout.Calculate(root, 20.0F, 40.0F)
    if YGNodeStyleAPI.YGNodeStyleGetMinWidth(root.Yoga!!).Value != 0.0F { return false }
    root = reconciler.Diff(root, Text{Content: "Unbreakable", TextTrimming: TextTrimming.Ellipsis, MinWidth: 50})
    layout.Calculate(root, 20.0F, 40.0F)
    if root.Rect.W != 50.0F { return false }
    root = reconciler.Diff(root, Text{Content: "Unbreakable"})
    layout.Calculate(root, 20.0F, 40.0F)
    return YGNodeStyleAPI.YGNodeStyleGetMinWidth(root.Yoga!!).Unit == Unit.Undefined
  }

  func CustomLayoutRetainsMixedMaximumMeasurements() bool {
    let policy = MixedMaximumFixture()
    let root = Reconciler{Res: Resolver{}}.Mount(Container{Width: Percent(100), Height: 200,
      Container{Width: Percent(50), Layout: policy,
        Container{Width: Percent(100), MaxWidth: Percent(50) + 10, Height: 24}}})
    let layout = Layout()
    layout.Calculate(root, 400.0F, 200.0F)
    let child = root.Children[0].Children[0]
    if !policy.Valid || child.Rect.W != 110.0F { return false }
    layout.Calculate(root, 600.0F, 200.0F)
    return policy.Valid && child == root.Children[0].Children[0] && child.Rect.W == 160.0F
  }

  func CustomLayoutResolvesLengthsInItsViewport() bool {
    let policy = LengthContextFixture()
    let root = Reconciler{Res: Resolver{}}.Mount(Container{Width: 400, Height: 200, FontSize: 20,
      Container{Width: 200, Height: 100, Layout: policy}})
    Layout().Calculate(root, 400.0F, 200.0F)
    if !policy.Valid || policy.Calls < 1 { return false }
    try { let ignored = policy.Context!!.ResolveLength(Em(1), LayoutAxis.Horizontal) }
    catch (_ InvalidOperationException) { return true }
    return false
  }

  func CustomLayoutLeavesUnboundedPercentUnresolved() bool {
    let policy = UnboundedLengthContextFixture()
    let root = Reconciler{Res: Resolver{}}.Mount(Container{Width: 400, Height: 200, OverflowY: Overflow.Scroll,
      Container{Layout: policy, Width: 100, Container{Width: 10, Height: 10}}})
    try {
      Layout().Calculate(root, 400.0F, 200.0F)
      return policy.Checked && policy.Valid
    } finally { NodeLifecycle.DisposeTree(root) }
  }

  func IntrinsicLimitsUseOwnerConstraints() bool {
    let content = (width Length) -> Container{Width: width, FlexDirection: FlexDirection.Row, FlexWrap: FlexWrap.Wrap,
      Container{Width: 40, Height: 10, FlexShrink: 0},
      Container{Width: 40, Height: 10, FlexShrink: 0},
      Container{Width: 40, Height: 10, FlexShrink: 0}}
    let definite = content(Length.FitContent(Percent(50)))
    let mixed = content(Length.FitContent(Percent(25) + 10))
    let cyclic = content(Length.FitContent(Percent(50)))
    let nested = content(Length.FitContent(Percent(50)))
    let root = Reconciler{Res: Resolver{}}.Mount(Container{Width: 400, Height: 400, AlignItems: AlignItems.FlexStart,
      Container{Width: 160, AlignItems: AlignItems.FlexStart, definite},
      Container{Width: 200, AlignItems: AlignItems.FlexStart, mixed},
      Container{Width: Length.MaxContent, AlignItems: AlignItems.FlexStart, cyclic},
      Container{Width: Length.MaxContent, AlignItems: AlignItems.FlexStart,
        Container{Width: Length.MaxContent, AlignItems: AlignItems.FlexStart, nested}}
    })
    Layout().Calculate(root, 400.0F, 400.0F)
    let a = root.Children[0].Children[0].Rect.W
    let b = root.Children[1].Children[0].Rect.W
    let c = root.Children[2].Children[0].Rect.W
    let d = root.Children[3].Children[0].Children[0].Rect.W
    if a != 80.0F || b != 60.0F || c != 60.0F || d != 60.0F
      || root.Children[2].Rect.W != 120.0F || root.Children[3].Rect.W != 120.0F
      || root.Children[3].Children[0].Rect.W != 120.0F {
      throw InvalidOperationException("intrinsic owner limits: $a, $b, $c, $d")
    }
    return true
  }

  func RelativeLengthsResolveFirstLayoutAndResize() bool {
    let resolver = Resolver{}
    let reconciler = Reconciler{Res: resolver}
    let scene = Container{Width: Percent(100), Height: Percent(100), FontSize: 20,
      Container{Width: Percent(50) - Em(1), Height: Vh(25), MinWidth: 0,
        Container{Width: Percent(50) + Rem(1), Height: Vw(10), MinWidth: 0,
          Padding: Em(0.5), FontSize: Em(1.5)}
      }
    }
    let root = reconciler.Mount(scene)
    let layout = Layout()
    layout.Calculate(root, 400.0F, 240.0F)
    let parent = root.Children[0]
    let child = parent.Children[0]
    if parent.Rect.W != 180.0F || parent.Rect.H != 60.0F || child.Rect.W != 110.0F
      || child.Rect.H != 40.0F || child.FontSize.Px != 30.0F
      || YGNodeLayoutAPI.YGNodeLayoutGetPadding(child.Yoga, YGEdge.Left) != 15.0F {
      throw InvalidOperationException("first mixed layout: ${parent.Rect.W}, ${parent.Rect.H}, ${child.Rect.W}, ${child.Rect.H}, ${child.FontSize.Px}")
    }
    layout.Calculate(root, 600.0F, 400.0F)
    if parent.Rect.W != 280.0F || parent.Rect.H != 100.0F || child.Rect.W != 160.0F || child.Rect.H != 60.0F {
      throw InvalidOperationException("resized mixed layout: ${parent.Rect.W}, ${parent.Rect.H}, ${child.Rect.W}, ${child.Rect.H}")
    }
    root.BaseStyle = Style{Width: Percent(100), Height: Percent(100), FontSize: 24}.Entries()
    resolver.Invalidate(root, false)
    resolver.Flush()
    layout.Calculate(root, 600.0F, 400.0F)
    return parent.Rect.W == 276.0F && child.FontSize.Px == 36.0F && child.Rect.W == 162.0F
  }

  func IntrinsicLengthsMeasureRetainedContent() bool {
    for kind in []Length{Length.MinContent, Length.MaxContent, Length.FitContent(80)} {
      let root = Reconciler{Res: Resolver{}}.Mount(Container{Width: 300, Height: 300, AlignItems: AlignItems.FlexStart,
        Container{Width: kind, FlexShrink: 0,
          Text{Content: "alpha beta gamma", FontSize: 16, TextWrap: TextWrap.Wrap}},
        Container{Height: kind, Width: 100, FlexShrink: 0,
          Container{Height: 24, FlexShrink: 0}, Container{Height: 32, FlexShrink: 0}}
      })
      let layout = Layout()
      layout.Calculate(root, 300.0F, 300.0F)
      let width = root.Children[0].Rect.W
      if width <= 0.0F || !Single.IsFinite(width) || root.Children[1].Rect.H != 56.0F {
        throw InvalidOperationException("intrinsic size: $width, ${root.Children[1].Rect.H}")
      }
      layout.Calculate(root, 400.0F, 400.0F)
      if root.Children[0].Rect.W != width || root.Children[1].Rect.H != 56.0F { return false }
    }
    for kind in []Length{Length.MinContent, Length.MaxContent, Length.FitContent(100)} {
      let declarations = []Style{Style{Width: kind}, Style{Height: kind}, Style{MinWidth: kind},
        Style{MinHeight: kind}, Style{MaxWidth: kind}, Style{MaxHeight: kind}, Style{FlexBasis: kind}}
      for declaration in declarations {
        let root = Reconciler{Res: Resolver{}}.Mount(Container{Width: 300, Height: 300,
          AlignItems: AlignItems.FlexStart,
          Container{BasedOn: declaration, FlexShrink: 0, Container{Width: 80, Height: 24}}})
        Layout().Calculate(root, 300.0F, 300.0F)
        if root.Children[0].Rect.W != 80.0F || root.Children[0].Rect.H != 24.0F {
          throw InvalidOperationException("intrinsic property: ${root.Children[0].Rect.W}, ${root.Children[0].Rect.H}")
        }
      }
    }
    return true
  }

  func RelativeLengthsValidateAtAssignment() bool {
    var rejected = 0
    for value in []Length{Vw(Double.NaN), Em(Double.PositiveInfinity), Percent(20) + Rem(Double.NaN)} {
      try { let ignored = Container{Width: value} }
      catch (_ ArgumentOutOfRangeException) { rejected++ }
    }
    for value in []Length{Em(1), Rem(1), Vw(1), Percent(10) + 1} {
      try { let ignored = Container{BorderRadius: value} }
      catch (_ ArgumentOutOfRangeException) { rejected++ }
    }
    for value in []Length{Length.Auto, Length.MinContent, Length.MaxContent, Length.FitContent(10)} {
      try { let ignored = value + 1 }
      catch (_ ArgumentException) { rejected++ }
    }
    try { let ignored = BoxShadow{OffsetX: Em(1)} }
    catch (_ ArgumentOutOfRangeException) { rejected++ }
    return rejected == 12 && !Em(2).HasMagnitude && !Em(2).IsPercent
      && (Percent(20) * 2).IsPercent && (cast[Length](10) + 2).Magnitude == 12
  }

  func CustomLayoutRearrangesWhenPixelDensityChanges() bool {
    let root = Reconciler{ Res: Resolver{} }.Mount(Container{ Width: 100, Height: 200,
      Layout: DensityFixtureLayout(),
      Container{ Width: 100, Height: 200,
        Container{ Position: PositionType.Absolute, Top: 166, Width: 20, Height: 20 },
      },
    })
    let layout = Layout()
    layout.SetPixelDensity(1.5F)
    layout.Calculate(root, 100.0F, 200.0F)
    let child = root.Children[0].Children[0]
    if child.Rect.Y != 166.0F { return false }
    layout.SetPixelDensity(2.25F)
    layout.Calculate(root, 100.0F, 200.0F)
    let expected = PixelGrid.RoundValueToPixelGrid(166.0, 2.25, false, false)
    if child.Rect.Y != expected {
      throw InvalidOperationException("density=2.25, child=${child.Rect.Y}, expected=${expected}")
    }
    return true
  }

  func ComposedTreeMapsDeclarationsAndRelayouts() bool {
    let reconciler = Reconciler{ Res: Resolver{} }
    var root = reconciler.Mount(layoutScene(20.0))
    let layout = Layout()
    layout.Calculate(root, 400.0F, 296.0F)

    let percent = root.Children[1]
    let unset = root.Children[2]
    let nested = root.Children[3]
    let leaf = nested.Children[0]
    let growOne = root.Children[4]
    let growTwo = root.Children[5]
    if percent.Rect.Y != 0.0F || percent.Rect.W != 200.0F
      || unset.Rect.Y != 24.0F || unset.Rect.W != 400.0F
      || nested.Rect.Y != 48.0F || leaf.Rect.X != 5.0F || leaf.Rect.Y != 53.0F
      || growOne.Rect.Y != 82.0F || growOne.Rect.H != 70.0F
      || growTwo.Rect.Y != 156.0F || growTwo.Rect.H != 140.0F {
        return false
      }

    root = reconciler.Diff(root, layoutScene(50.0))
    layout.Calculate(root, 400.0F, 296.0F)
    return root.Children[2].Rect.Y == 54.0F
  }

  func LayoutIsStableAcrossRoots() bool {
    let root = Reconciler{ Res: Resolver{} }.Mount(layoutScene(20.0))
    let layout = Layout()
    layout.Calculate(root, 400.0F, 296.0F)
    let first = List[float32]()
    snapshot(root, first)

    layout.Calculate(root, 400.0F, 296.0F)
    let second = List[float32]()
    snapshot(root, second)
    if !sameSnapshot(first, second) {
      return false
    }

    let otherLayout = Layout()
    let other = Reconciler{ Res: Resolver{} }.Mount(Container() {.Width: Percent(100), Container{ Width: Percent(100), Height: 10},
    })
    otherLayout.Calculate(other, 100.0F, 100.0F)
    layout.Calculate(root, 200.0F, 200.0F)
    layout.Calculate(other, 200.0F, 200.0F)
    return other.Rect.W == 200.0F && other.Children[0].Rect.W == 200.0F
  }

  func NarrowRowShrinksLabelAndKeepsFixedIcon() bool {
    let label = "A long label that does not fit"
    let root = Reconciler{ Res: Resolver{} }.Mount(Container() {.Width: 120,.Gap: 4,
      Container() {.FlexDirection: FlexDirection.Row,
        Text{ Content: label },
        Container{ Width: 24, Height: 24 },
      },
      Container() {.FlexDirection: FlexDirection.Row,
        Text{ Content: label, TextWrap: TextWrap.NoWrap, TextTrimming: TextTrimming.Ellipsis },
        Container{ Width: 24, Height: 24 },
      },
      Container() {.FlexDirection: FlexDirection.Row,.AlignItems: AlignItems.FlexStart,
        Text{ Content: label, TextWrap: TextWrap.NoWrap },
        Container{ Width: 24, Height: 24 },
      },
    })
    Layout().Calculate(root, 120.0F, 200.0F)
    for i in 0 ... 2 {
      let row = root.Children[i]
      if row.Children[0].Rect.W != 96.0F || row.Children[1].Rect.W != 24.0F
        || row.Children[1].Rect.X != 96.0F {
          return false
        }
    }
    let fixedText = root.Children[2].Children[0]
    if root.Children[0].Children[0].Rect.H <= 20.0F || fixedText.Rect.W <= 120.0F
      || root.Children[2].Children[1].Rect.X < fixedText.Rect.W - 1.0F {
        return false
      }
    let volume = Reconciler{ Res: Resolver{} }.Mount(Container() {.Width: 100,
      Container() {.FlexDirection: FlexDirection.Row,
        Text{ Content: "Volume", FontFamily: "DejaVu Sans", FontSize: 14 },
        Container{ Width: 120, Height: 10 },
      },
      Container() {.FlexDirection: FlexDirection.Row,
        Text{ Content: "Volume", FontFamily: "DejaVu Sans", FontSize: 14, MinWidth: 0 },
        Container{ Width: 120, Height: 10 },
      },
    })
    Layout().Calculate(volume, 100.0F, 200.0F)
    let word = TextLayouts.For(volume.Children[0].Children[0], -1.0F)
    if volume.Children[0].Children[0].Rect.W != MathF.Ceiling(word.Width)
      || volume.Children[0].Children[0].Rect.H != MathF.Ceiling(word.Height)
      || volume.Children[1].Children[0].Rect.W >= word.Width {
        return false
      }
    let natural = List[float32]()
    for width in []float32{ 400, 128 } {
      for grow in []float32{ 0, 1 } {
        let row = Container() {.FlexDirection: FlexDirection.Row,.Gap: 8}
        for label in []string{ "HSL", "HSV", "OKLCH" } {
          row.Children.Add(Button{ Height: 32, FlexGrow: grow, Padding: Edges{ Left: 12, Right: 12 },
            Text{ Content: label, FontFamily: "DejaVu Sans", FontSize: 13 } })
        }
        let swatches = Reconciler{ Res: Resolver{} }.Mount(Container{ Width: width, AlignItems: AlignItems.Stretch, row })
        Layout().Calculate(swatches, width, 100.0F)
        for i in 0 ... 3 {
          let w = swatches.Children[0].Children[i].Rect.W
          if natural.Count < 3 { natural.Add(w) } else if width == 128.0F && w != natural[i] { return false }
        }
      }
    }
    let bounded = Reconciler{ Res: Resolver{} }.Mount(Container() {.Width: 112,.FlexDirection: FlexDirection.Row,
      Container{ Width: 49, MinWidth: 34, FlexGrow: 1 },
      Container{ Width: 51, MinWidth: 34, FlexGrow: 1 },
      Container{ Width: 69, MinWidth: 34, FlexGrow: 1 },
    })
    Layout().Calculate(bounded, 112.0F, 100.0F)
    if bounded.Children[0].Rect.W != 34.0F || bounded.Children[1].Rect.W != 34.0F || bounded.Children[2].Rect.W != 44.0F {
      return false
    }
    let column = Reconciler{ Res: Resolver{} }.Mount(Container() {.Width: 120,.Height: 200,
      Container{ Height: 40 },
      Container{ Height: 300, OverflowY: Overflow.Scroll, Container{ Height: 400 } },
    })
    Layout().Calculate(column, 120.0F, 200.0F)
    let pane = column.Children[1]
    if pane.Rect.Y != 40.0F || pane.Rect.H != 160.0F || pane.ContentH != 400.0F { return false }
    let heights = []float64{ 36, 19.2, 48, 19.2, 19.2, 64, 48, 48, 150, 48, 48, 48, 240 }
    let scroll = Container{ Width: 411, Height: 683, Overflow: Overflow.Scroll, Padding: 20, Gap: 14 }
    for height in heights { scroll.Children.Add(Container{ Height: height }) }
    let page = Reconciler{ Res: Resolver{} }.Mount(scroll)
    Layout().Calculate(page, 411.0F, 683.0F)
    for i in 0 ... heights.Length {
      if MathF.Abs(page.Children[i].Rect.H - float32(heights[i])) > 1.0F { return false }
    }
    return page.ContentH < 1010.0F
  }

  func KeyedReorderRetainsYogaLayouts() bool {
    let reconciler = Reconciler{ Res: Resolver{} }
    var root = reconciler.Mount(Container() {.Width: 90,.Height: 20,.FlexDirection: FlexDirection.Row,
        Container{ Key: "a", Width: 10, Height: 10 },
        Container{ Key: "b", Width: 20, Height: 10 },
        Container{ Key: "c", Width: 30, Height: 10},
    })
    let layout = Layout()
    layout.Calculate(root, 90.0F, 20.0F)
    let a = root.Children[0]
    let b = root.Children[1]
    let c = root.Children[2]
    guard let aYoga = a.Yoga else { return false }
    guard let bYoga = b.Yoga else { return false }
    guard let cYoga = c.Yoga else { return false }
    let aLayout = aYoga.GetLayout()
    let bLayout = bYoga.GetLayout()
    let cLayout = cYoga.GetLayout()

    root = reconciler.Diff(root, Container() {.Width: 90,.Height: 20,.FlexDirection: FlexDirection.Row,
        Container{ Key: "c", Width: 30, Height: 10 },
        Container{ Key: "a", Width: 10, Height: 10 },
        Container{ Key: "b", Width: 20, Height: 10},
    })
    layout.MarkStructureDirty()
    layout.Calculate(root, 90.0F, 20.0F)

    if !Object.ReferenceEquals(root.Children[0], c)
      || !Object.ReferenceEquals(root.Children[1], a)
      || !Object.ReferenceEquals(root.Children[2], b) {
        throw InvalidOperationException("keyed node identity changed")
      }
    if !Object.ReferenceEquals(aYoga.GetLayout(), aLayout)
      || !Object.ReferenceEquals(bYoga.GetLayout(), bLayout)
      || !Object.ReferenceEquals(cYoga.GetLayout(), cLayout) {
        throw InvalidOperationException("Yoga layout storage changed")
      }
    if c.Rect.X != 0.0F || a.Rect.X != 30.0F || b.Rect.X != 40.0F {
      throw InvalidOperationException(c.Rect.X.ToString() + "," + a.Rect.X.ToString()
        +"," + b.Rect.X.ToString())
    }

    root = reconciler.Diff(root, Container() {.Width: 90,.Height: 20,.FlexDirection: FlexDirection.Row,
        Container{ Key: "a", Width: 10, Height: 10 },
        Container{ Key: "d", Width: 40, Height: 10 },
        Container{ Key: "c", Width: 30, Height: 10},
    })
    layout.MarkStructureDirty()
    layout.Calculate(root, 90.0F, 20.0F)
    guard let rootYoga = root.Yoga else { return false }
    guard let dYoga = root.Children[1].Yoga else { return false }
    if bYoga.GetOwner() != nil || Object.ReferenceEquals(bYoga.GetLayout(), bLayout) {
      throw InvalidOperationException("removed Yoga child retained state")
    }
    if !Object.ReferenceEquals(aYoga.GetLayout(), aLayout)
      || !Object.ReferenceEquals(cYoga.GetLayout(), cLayout) {
        throw InvalidOperationException("retained Yoga child lost state")
      }
    if dYoga.GetOwner() != rootYoga
      || a.Rect.X != 0.0F || root.Children[1].Rect.X != 10.0F || c.Rect.X != 50.0F {
        throw InvalidOperationException("mixed Yoga child sync failed")
      }
    return true
  }

  func RetainedYogaReset(family int32) bool -> switch family {
    case 0: resetSizeAndPadding()
    case 1: resetRootSize()
    case 2: resetEdgesAndGaps()
    case 3: resetMinMaxAndFlexBasis()
    case 4: resetPositionAndAspectRatio()
    case _: false
  }

  func StaticPositionIgnoresInsets() bool {
    let root = Reconciler{ Res: Resolver{} }.Mount(Container() {.Width: 100,.Height: 100,
        Container{ Position: PositionType.Static, Left: 25, Top: 25, Width: 10, Height: 10 },
        Container{ Position: PositionType.Relative, Left: 25, Top: 25, Width: 10, Height: 10},
    })
    Layout().Calculate(root, 100.0F, 100.0F)
    let still = root.Children[0]
    let moved = root.Children[1]
    return still.Rect.X == 0.0F && still.Rect.Y == 0.0F
      && moved.Rect.X == 25.0F && moved.Rect.Y == 35.0F
  }

  func LogicalEdgesRespectDirection() bool {
    let ltr = Reconciler{ Res: Resolver{} }.Mount(Container() {.Width: 100,.Height: 60,.FlexDirection: FlexDirection.Row,
        Container{ Width: 20, Height: 10, MarginStart: 10},
    })
    let rtl = Reconciler{ Res: Resolver{} }.Mount(Container() {.Width: 100,.Height: 60,.Direction: Direction.RightToLeft,.FlexDirection: FlexDirection.Row,
        Container{ Width: 20, Height: 10, MarginStart: 10},
    })
    let ltrPadding = Reconciler{ Res: Resolver{} }.Mount(Container() {.Width: 100,.Height: 60,.PaddingStart: 10, Container{ Width: 20, Height: 10},
    })
    let rtlPadding = Reconciler{ Res: Resolver{} }.Mount(Container() {.Width: 100,.Height: 60,.Direction: Direction.RightToLeft,.PaddingStart: 10,.FlexDirection: FlexDirection.Row,
        Container{ Width: 20, Height: 10},
    })
    let ltrAbsolute = Reconciler{ Res: Resolver{} }.Mount(Container() {.Width: 100,.Height: 60,
        Container{ Width: 20, Height: 10, Position: PositionType.Absolute, Start: 10 },
    })
    let rtlAbsolute = Reconciler{ Res: Resolver{} }.Mount(Container() {.Width: 100,.Height: 60,.Direction: Direction.RightToLeft,
        Container{ Width: 20, Height: 10, Position: PositionType.Absolute, Start: 10},
    })
    let layout = Layout()
    layout.Calculate(ltr, 100.0F, 60.0F)
    layout.Calculate(rtl, 100.0F, 60.0F)
    layout.Calculate(ltrPadding, 100.0F, 60.0F)
    layout.Calculate(rtlPadding, 100.0F, 60.0F)
    layout.Calculate(ltrAbsolute, 100.0F, 60.0F)
    layout.Calculate(rtlAbsolute, 100.0F, 60.0F)
    if ltr.Children[0].Rect.X != 10.0F || rtl.Children[0].Rect.X != 70.0F
      || ltrPadding.Children[0].Rect.X != 10.0F || rtlPadding.Children[0].Rect.X != 70.0F
      || ltrAbsolute.Children[0].Rect.X != 10.0F || rtlAbsolute.Children[0].Rect.X != 70.0F {
        return false
      }

    let dynamicResolver = Resolver{}
    let dynamic = Reconciler{ Res: dynamicResolver }.Mount(Container() {.Width: 100,.Height: 60,.FlexDirection: FlexDirection.Row,
        Container{ Width: 20, Height: 10, MarginStart: 10},
    })
    layout.Calculate(dynamic, 100.0F, 60.0F)
    if dynamic.Children[0].Rect.X != 10.0F { return false }
    dynamic.BaseStyle = Style{
      Width: 100, Height: 60, Direction: Direction.RightToLeft, FlexDirection: FlexDirection.Row,
    }.Entries()
    dynamicResolver.Invalidate(dynamic, false)
    dynamicResolver.Flush()
    layout.Calculate(dynamic, 100.0F, 60.0F)
    return dynamic.Children[0].Rect.X == 70.0F
  }

  func LayoutTransitionEnvironmentCallbackContract() bool {
    let width = State[float64](50.0)
    var factories int32
    let transition = LayoutTransition{SimulationFactory: (from float64, to float64, velocity float64) -> {
      factories++
      return LinearTimed(1.0, from, to, Easing.Linear)
    }}
    let window = Window{Size: LayoutSize(400, 200),
      Root: SizedRootFixture(() -> Container{Width: width.Value, Height: 40, LayoutTransition: transition})}
    window.MetricsChanged += _ -> { width.Value = window.Size.Width * 0.25 }
    try {
      window.UpdateTree()
      window.UpdateTree()
      if window.Tree!!.Rect.W != 100.0F || factories != 0 { return false }
      window.Size = LayoutSize(600, 200)
      window.UpdateTree()
      window.UpdateTree()
      if window.Tree!!.Rect.W != 150.0F || factories != 0 { return false }
      if !window.PostEnvironment(() -> { width.Value = 180.0 }) { return false }
      window.drainPostedActions()
      window.UpdateTree()
      if window.Tree!!.Rect.W != 180.0F || factories != 0 { return false }
      if !window.Post(() -> { width.Value = 200.0 }) { return false }
      window.drainPostedActions()
      window.UpdateTree()
      return window.Tree!!.Rect.W == 180.0F && factories == 1 && window.PaintMotionPump.Active
    } finally { window.Close() }
  }

  func LayoutTransitionStyleContinuationContract() bool {
    let wide = State[bool](false)
    let other = State[bool](false)
    var factories int32
    let transition = LayoutTransition{SimulationFactory: (from float64, to float64, velocity float64) -> {
      factories++
      return LinearTimed(1.0, from, to, Easing.Linear)
    }}
    let cell = SizedRootFixture(() -> Container{
      Width: Percent(100), Height: Percent(100), FlexDirection: FlexDirection.Row,
      Container{Width: wide.Value ? 120 : 40, Height: 20, FlexShrink: 0,
        TransitionMs: 1000, TransitionEasing: Easing.Linear,
        TransitionProperties: []TransitionProperty{TransitionProperty.Width}, LayoutTransition: transition},
      Container{Width: other.Value ? 80 : 40, Height: 20, FlexShrink: 0, LayoutTransition: transition},
      Container{Width: 20, Height: 20, FlexShrink: 0, LayoutTransition: transition},
    })
    let window = Window{Root: cell, Size: LayoutSize(400, 200)}
    try {
      window.UpdateTree()
      let children = window.Tree!!.Children
      wide.Value = true
      window.UpdateTree(0.25)
      if children[0].Rect.W != 40.0F || factories != 0 { return false }
      window.UpdateTree(0.25)
      if children[0].Rect.W != 60.0F || children[1].Rect.X != 60.0F || factories != 0 { return false }
      other.Value = true
      window.UpdateTree(0.25)
      if children[0].Rect.W != 80.0F || children[1].Rect.X != 80.0F
        || children[1].Rect.W != 40.0F || children[2].Rect.X != 120.0F || factories != 2 { return false }
      window.UpdateTree(0.5)
      if children[0].Rect.W != 120.0F || children[1].Rect.W != 60.0F
        || children[2].Rect.X != 180.0F || factories != 2 { return false }
      window.UpdateTree(0.5)
      return children[1].Rect.W == 80.0F && children[2].Rect.X == 200.0F && factories == 2
    } finally { window.Close() }
  }

  func LayoutTransitionFailedCommitContract() bool {
    var expanded = false
    var fail = false
    var enabled = true
    var factories int32
    let transition = LayoutTransition{SimulationFactory: (from float64, to float64, velocity float64) -> {
      factories++
      return LinearTimed(1.0, from, to, Easing.Linear)
    }}
    let cell = SizedRootFixture(() -> Container{
      Width: expanded ? 240 : 160, Height: 100, LayoutTransition: enabled ? transition : nil,
      Sized(size -> {
        if fail { throw InvalidOperationException("Failed layout presentation") }
        return Container{Width: Percent(100), Height: Percent(100)}
      }){.Width: Percent(100), .Height: Percent(100)},
    })
    let window = Window{Root: cell, Size: LayoutSize(400, 200)}
    try {
      window.UpdateTree()
      expanded = true
      fail = true
      cell.Rebuild()
      var failed = false
      try { window.UpdateTree() }
      catch (error InvalidOperationException) {
        if error.Message != "Failed layout presentation" { rethrow }
        failed = true
      }
      if !failed || factories != 0 || window.PaintMotionPump.Active { return false }
      fail = false
      window.UpdateTree()
      if window.Tree!!.Rect.W != 160.0F || factories != 1 { return false }
      window.UpdateTree(1.0)
      window.UpdateTree()
      if window.Tree!!.Rect.W != 240.0F || factories != 1 { return false }
      enabled = false
      cell.Rebuild()
      window.UpdateTree()
      return !window.PaintMotionPump.Active && window.Tree!!.RetainedLayoutTransition == nil
    } finally { window.Close() }
  }

  func LayoutTransitionRetainedTextContract() bool {
    let text = "one two three four five six seven eight nine ten"
    let document = TextDocument(text)
    using let controller = TextEditorController(document)
    using let baselineController = TextEditorController(TextDocument(text))
    var factories int32
    let transition = LayoutTransition{SimulationFactory: (from float64, to float64, velocity float64) -> {
      factories++
      return LinearTimed(1.0, from, to, Easing.Linear)
    }}
    let scene = (editor TextEditorController, motion LayoutTransition?) -> Container{
      Width: Percent(100), Height: Percent(100), AlignItems: AlignItems.FlexStart,
      TextEditor{Controller: editor, Width: Percent(50), FontSize: 16,
        TextWrap: TextWrap.Wrap, LayoutTransition: motion},
      Container{Width: 40, Height: 20, LayoutTransition: motion},
    }
    let window = Window{Root: SizedRootFixture(() -> scene(controller, transition)), Size: LayoutSize(400, 200)}
    let baseline = Window{Root: SizedRootFixture(() -> scene(baselineController, nil)), Size: LayoutSize(600, 200)}
    try {
      window.UpdateTree()
      baseline.UpdateTree()
      let oldHeight = baseline.Tree!!.Children[0].Rect.H
      let oldSiblingY = baseline.Tree!!.Children[1].Rect.Y
      document.Apply(TextChange(TextRange(document.Length, 0), "\nsecond line\nthird line"))
      window.Size = LayoutSize(600, 200)
      window.UpdateTree()
      let editor = window.Tree!!.Children[0]
      let sibling = window.Tree!!.Children[1]
      if editor.Rect.W != 300.0F || editor.Rect.H != oldHeight
        || sibling.Rect.Y != oldSiblingY || factories != 2 {
        throw InvalidOperationException("Retained text: ${editor.Rect.W}x${editor.Rect.H}, baseline=$oldHeight, sibling=${sibling.Rect.Y}, factories=$factories")
      }
      window.UpdateTree(1.0)
      guard let siblingYoga = sibling.Yoga else { return false }
      return editor.Rect.H == BoxGeometry.LayoutHeight(editor) && editor.Rect.H > oldHeight
        && sibling.Rect.Y == YGNodeLayoutAPI.YGNodeLayoutGetTop(siblingYoga) && factories == 2
    } finally {
      baseline.Close()
      window.Close()
    }
  }

  func LayoutTransitionFontPublicationContract() bool {
    let family = "Layout transition publication"
    let content = "Miiii Wwww 0123456789"
    using let font = FontSource.FromPath(family, 400, false,
      Path.Combine(AppContext.BaseDirectory, "Layout", "VendSans-VariableFont_wght.ttf"))
    let wide = State[bool](false)
    var publish = false
    var factories int32
    let transition = LayoutTransition{SimulationFactory: (from float64, to float64, velocity float64) -> {
      factories++
      return LinearTimed(1.0, from, to, Easing.Linear)
    }}
    let cell = SizedRootFixture(() -> {
      if publish {
        publish = false
        font.Register()
      }
      return Container{Width: Percent(100), Height: Percent(100), AlignItems: AlignItems.FlexStart,
        Text{FontFamily: family, FontSize: 24, Content: content, LayoutTransition: transition},
        Container{Width: wide.Value ? 100 : 50, Height: 20, LayoutTransition: transition},
      }
    })
    let window = Window{Root: cell, Size: LayoutSize(400, 200)}
    var oracle Node?
    try {
      window.UpdateTree()
      let text = window.Tree!!.Children[0]
      let oldWidth = text.Rect.W
      wide.Value = true
      publish = true
      window.UpdateTree()
      if text.Rect.W != oldWidth || factories != 1 { return false }
      window.UpdateTree()
      oracle = Reconciler{Res: Resolver{}}.Mount(Container{
        Width: 400, Height: 200, AlignItems: AlignItems.FlexStart,
        Text{FontFamily: family, FontSize: 24, Content: content},
      })
      Layout().Calculate(oracle, 400.0F, 200.0F)
      return text.Rect.W == oracle.Children[0].Rect.W && text.Rect.W != oldWidth
        && factories == 1
    } finally {
      if let tree = oracle { NodeLifecycle.DisposeTree(tree) }
      window.Close()
    }
  }

  func LayoutTransitionEnvironmentContract() bool {
    let cell = LayoutCauseFixtureCell()
    let window = Window{Root: cell, Size: LayoutSize(400, 200)}
    let baseline = Window{Root: LayoutCauseFixtureCell{Transitions: false}, Size: LayoutSize(400, 200)}
    try {
      window.UpdateTree()
      baseline.UpdateTree()
      let baselineTarget = baseline.Tree!!.Children[1]
      let target = window.Tree!!.Children[1]
      for frame in 0 ... 8 {
        window.Size = LayoutSize(400 + frame * 2, 200)
        window.UpdateTree(0.001)
        baseline.Size = LayoutSize(400 + frame * 2, 200)
        baseline.UpdateTree(0.001)
      }
      let before = GC.GetAllocatedBytesForCurrentThread()
      for frame in 0 ... 120 {
        window.Size = LayoutSize(400 + frame % 80 * 2, 200)
        window.UpdateTree(0.001)
        if target.Rect.W != BoxGeometry.LayoutWidth(target) { return false }
      }
      let allocated = GC.GetAllocatedBytesForCurrentThread() - before
      let baselineStart = GC.GetAllocatedBytesForCurrentThread()
      for frame in 0 ... 120 {
        baseline.Size = LayoutSize(400 + frame % 80 * 2, 200)
        baseline.UpdateTree(0.001)
        if baselineTarget.Rect.W != BoxGeometry.LayoutWidth(baselineTarget) { return false }
      }
      let baselineBytes = GC.GetAllocatedBytesForCurrentThread() - baselineStart
      let added = allocated - baselineBytes
      Console.WriteLine("resize-allocation: transitioned=$allocated baseline=$baselineBytes added=$added samples=120")
      if added != 0L { throw InvalidOperationException("Continuous resize added $added bytes") }
      for frame in 0 ... 20 {
        window.UiScale = 1.0 + float64(frame % 4) * 0.25
        window.UpdateTree(0.001)
        if target.Rect.W != BoxGeometry.LayoutWidth(target) { return false }
      }
      if let yoga = target.Yoga { YGNodeStyleAPI.YGNodeStyleSetMargin(yoga, YGEdge.Left, 11.0F) }
      window.UpdateTree()
      return cell.Simulations.Count == 0 && target.Rect.X > 0.0F
        && target.Rect.W == BoxGeometry.LayoutWidth(target) && !window.PaintMotionPump.Active
    } finally {
      baseline.Close()
      window.Close()
    }
  }

  func LayoutTransitionCauseAttributionContract() bool {
    for variant in 0 ... 4 {
      let cell = LayoutCauseFixtureCell{UseSized: variant >= 2, ReadMetrics: variant % 2 == 1}
      let window = Window{Root: cell, Size: LayoutSize(400, 200)}
      try {
        window.UpdateTree()
        window.Size = LayoutSize(600, 200)
        window.UpdateTree()
        let root = cell.UseSized ? window.Tree!!.Children[0] : window.Tree!!
        let parent = root.Children[0]
        let sibling = parent.Children[1]
        let environment = root.Children[1]
        let oldWidth = parent.Rect.W
        let oldX = sibling.Rect.X
        if cell.Simulations.Count != 0 || environment.Rect.W != 300.0F { return false }
        cell.Expanded.Value = true
        window.Size = LayoutSize(800, 200)
        window.UpdateTree()
        if parent.Rect.W != oldWidth || sibling.Rect.X != oldX
          || environment.Rect.W != 400.0F || cell.Simulations.Count != 2 {
          throw InvalidOperationException("Mixed commit variant $variant: width=${parent.Rect.W}, x=${sibling.Rect.X}, environment=${environment.Rect.W}, simulations=${cell.Simulations.Count}")
        }
        window.UpdateTree(1.0)
        let firstWidth = cell.ReadMetrics ? 180.0F : 100.0F
        if parent.Rect.W != firstWidth + 20.0F || sibling.Rect.X != firstWidth
          || cell.Simulations.Count != 2 || window.PaintMotionPump.Active { return false }
      } finally { window.Close() }
    }
    return true
  }

  func LayoutTransitionResizeContinuityContract() bool {
    let cell = LayoutCauseFixtureCell{ReadMetrics: true}
    let window = Window{Root: cell, Size: LayoutSize(400, 200)}
    try {
      window.UpdateTree()
      let sibling = window.Tree!!.Children[0].Children[1]
      cell.Expanded.Value = true
      window.UpdateTree()
      window.UpdateTree(0.25)
      let animation = cell.Simulations[0]
      let offset = float32(animation.Position(0.25))
      if MathF.Abs(sibling.Rect.X - (140.0F + offset)) > 0.001F { return false }
      window.Size = LayoutSize(600, 200)
      window.UpdateTree()
      if cell.Simulations.Count != 2 || MathF.Abs(sibling.Rect.X - (160.0F + offset)) > 0.001F { return false }
      window.UpdateTree(0.25)
      let velocity = animation.Velocity(0.5)
      let visual = sibling.Rect.X
      cell.Expanded.Value = false
      window.Size = LayoutSize(800, 200)
      window.UpdateTree()
      if cell.Simulations.Count != 4 || sibling.Rect.X != visual
        || Math.Abs(cell.Simulations[2].InitialVelocity - velocity) > 0.000001
        || Math.Abs(cell.Simulations[2].Position(0.0) - (animation.Position(0.5) + 30.0)) > 0.000001 {
        return false
      }
      window.UpdateTree(1.0)
      if sibling.Rect.X != 130.0F || window.PaintMotionPump.Active { return false }
      window.PaintMotionPump.ReducedMotion = true
      cell.Expanded.Value = true
      window.UpdateTree()
      return sibling.Rect.X == 180.0F && cell.Simulations.Count == 4 && !window.PaintMotionPump.Active
    } finally { window.Close() }
  }

  func LayoutTransitionGlidesComputedPosition() bool {
    let pump = MotionPump()
    let reconciler = Reconciler{
      Res: Resolver{},
      Pump: pump,
      RetainedInvalidated: (effects ReconcileEffects) -> { },
    }
    var root = reconciler.Mount(layoutTransitionScene(50))
    let layout = Layout()
    layout.Calculate(root, 200.0F, 40.0F)
    let target = root.Children[1]
    if target.Rect.X != 50.0F { return false }

    root = reconciler.Diff(root, layoutTransitionScene(100))
    layout.MarkStructureDirty()
    layout.Calculate(root, 200.0F, 40.0F)
    if target.Rect.X != 50.0F { return false }
    pump.Sweep(0.05)
    layout.RefreshRects(root)
    if MathF.Abs(target.Rect.X - 75.0F) > 0.01F { return false }
    pump.Sweep(0.05)
    layout.RefreshRects(root)
    return target.Rect.X == 100.0F
  }

  func LayoutTransitionInterpolatesWrappingBounds() bool {
    let pump = MotionPump()
    let reconciler = Reconciler{Res: Resolver{}, Pump: pump}
    let layout = Layout()
    var root = reconciler.Mount(layoutWrappingScene(false))
    try {
      layout.Calculate(root, 300.0F, 260.0F)
      let card = root.Children[1]
      let start = card.Rect
      root = reconciler.Diff(root, layoutWrappingScene(true))
      layout.MarkStructureDirty()
      layout.Calculate(root, 300.0F, 260.0F)
      let label = card.Children[0]
      let text = TextLayouts.For(label, BoxGeometry.ContentWidth(label))
      let labelWidth = label.Rect.W
      let labelHeight = label.Rect.H
      var previous = start.W
      for frame in 0 ... 21 {
        let rect = card.Rect
        let progress = float32(frame) / 20.0F
        if rect.X < 10.0F || rect.Y < 10.0F || rect.X + rect.W > 290.001F
          || rect.Y + rect.H > 250.001F || rect.W < previous
          || MathF.Abs(rect.W - (140.0F + 120.0F * progress)) > 0.01F
          || MathF.Abs(rect.H - (50.0F + 50.0F * progress)) > 0.01F {
          throw InvalidOperationException("Wrapping bounds at frame $frame: ${rect.X},${rect.Y},${rect.W},${rect.H}")
        }
        if label.Rect.W != labelWidth || label.Rect.H != labelHeight
          || label.Rect.X != rect.X + 10.0F || label.Rect.Y != rect.Y + 10.0F
          || !Object.ReferenceEquals(text, TextLayouts.For(label, BoxGeometry.ContentWidth(label)))
          || label.HasVisualTransform || card.HasVisualTransform {
          throw InvalidOperationException("Wrapping text geometry changed at frame $frame")
        }
        if hitTopmost(root, rect.X + rect.W * 0.5F, rect.Y + rect.H - 5.0F) != card
          || hitTopmost(root, rect.X + rect.W + 1.0F, rect.Y + rect.H * 0.5F) == card
          || hitTopmost(root, rect.X + rect.W + 1.0F, label.Rect.Y + 5.0F) == label {
          throw InvalidOperationException("Wrapping hit bounds differ at frame $frame")
        }
        let radius = BoxGeometry.Radius(card.BorderRadius, card.BorderRadius, rect.W, rect.H)
        if radius != 20.0F || BoxGeometry.ContainsRounded(card, rect.X + 2.0F, rect.Y + 2.0F)
          || !BoxGeometry.ContainsRounded(card, rect.X + 6.0F, rect.Y + 6.0F) {
          throw InvalidOperationException("Wrapping radius differs at frame $frame")
        }
        previous = rect.W
        if frame < 20 {
          pump.Sweep(0.005)
          layout.RefreshRects(root)
        }
      }
      if pump.Active || card.Rect.X != 10.0F || card.Rect.Y != 70.0F {
        throw InvalidOperationException("Wrapping transition did not settle: ${card.Rect.X},${card.Rect.Y}")
      }
      root = reconciler.Diff(root, layoutWrappingScene(false))
      layout.MarkStructureDirty()
      layout.Calculate(root, 300.0F, 260.0F)
      pump.Sweep(0.001)
      layout.RefreshRects(root)
      let allocated = GC.GetAllocatedBytesForCurrentThread()
      for frame in 0 ... 50 {
        pump.Sweep(0.001)
        layout.RefreshRects(root)
      }
      let bytes = GC.GetAllocatedBytesForCurrentThread() - allocated
      if bytes != 0L { throw InvalidOperationException("Wrapping transition allocated $bytes bytes") }
      pump.ReducedMotion = true
      pump.Sweep(0.0)
      layout.RefreshRects(root)
      return !pump.Active && card.Rect.X == start.X && card.Rect.Y == start.Y
        && card.Rect.W == start.W && card.Rect.H == start.H
    } finally { NodeLifecycle.DisposeTree(root) }
  }

  func LayoutTransitionRespectsInterpolatedOverflow() bool {
    for overflow in []Overflow{Overflow.Hidden, Overflow.Scroll, Overflow.Visible} {
      let pump = MotionPump()
      let reconciler = Reconciler{Res: Resolver{}, Pump: pump}
      let layout = Layout()
      var root = reconciler.Mount(layoutWrappingScene(false, overflow: overflow))
      using let resources = VulkanPathResources(VulkanPathAtlas(16384uL), VulkanPathIdentityRegistry())
      using let paths = VulkanPathScene(resources)
      let compiler = VulkanSceneCompiler(64)
      compiler.SetPathScene(paths)
      try {
        layout.Calculate(root, 300.0F, 260.0F)
        compiler.Compile(root, Color.Transparent, 300.0F, 260.0F)
        root = reconciler.Diff(root, layoutWrappingScene(true, overflow: overflow))
        layout.MarkStructureDirty()
        layout.Calculate(root, 300.0F, 260.0F)
        let card = root.Children[1]
        let label = card.Children[0]
        label.BackgroundColor = Color.Rgb(255, 0, 0)
        let clipped = overflow != Overflow.Visible
        for sample in 1 ... 4 {
          pump.Sweep(0.025)
          layout.RefreshRects(root)
          compiler.Compile(root, Color.Transparent, 300.0F, 260.0F)
          let rect = card.Rect
          if MathF.Abs(rect.W - (140.0F + 30.0F * float32(sample))) > 0.01F
            || label.Rect.W != 240.0F {
            throw InvalidOperationException("Overflow $overflow sample $sample: box ${rect.W}, label ${label.Rect.W}")
          }
          let frame = compiler.Frame
          if clipped {
            if frame.RectClipCount == 0 || frame.ClipMaskCount != 1 {
              throw InvalidOperationException("Overflow $overflow: rects ${frame.RectClipCount}, masks ${frame.ClipMaskCount}")
            }
            let clip = frame.RectClips[0].Bounds
            let mask = frame.ClipMasks[0]
            if clip.X != rect.X + 2.0F || clip.Y != rect.Y + 2.0F
              || clip.Width != rect.W - 4.0F || clip.Height != rect.H - 4.0F
              || mask.Bounds.X != clip.X || mask.Bounds.Y != clip.Y
              || mask.Bounds.Width != clip.Width || mask.Bounds.Height != clip.Height
              || mask.ScaleX != clip.Width || mask.ScaleY != clip.Height {
              throw InvalidOperationException("Overflow $overflow sample $sample: clip ${clip.X},${clip.Y},"
                + "${clip.Width},${clip.Height}, mask ${mask.Bounds.Width},${mask.Bounds.Height},"
                + " scale ${mask.ScaleX},${mask.ScaleY}")
            }
          } else if frame.RectClipCount != 0 || frame.ClipMaskCount != 0 {
            throw InvalidOperationException("Visible overflow gained a clip")
          }
          var painted = false
          var clipDepth = 0
          var rounded = false
          for index in 0 ... frame.DrawRefCount {
            let draw = frame.DrawRefs[index]
            if draw.Kind == SceneDrawKind.RectClipBegin {
              clipDepth++
              continue
            }
            if draw.Kind == SceneDrawKind.RectClipEnd {
              clipDepth--
              continue
            }
            if draw.Kind == SceneDrawKind.LayerEnd {
              rounded = draw.ClipChainId != 0
              continue
            }
            if draw.Kind != SceneDrawKind.SolidBox { continue }
            let box = frame.SolidBoxes[draw.Index]
            if box.Color != label.BackgroundColor.ToPackedRgba() { continue }
            if box.Bounds.X != label.Rect.X || box.Bounds.Y != label.Rect.Y
              || box.Bounds.Width != label.Rect.W || (clipDepth > 0) != clipped {
              throw InvalidOperationException("Overflow $overflow: child ${box.Bounds.Width}, depth $clipDepth")
            }
            painted = true
          }
          let outside = hitTopmost(root, rect.X + rect.W + 1.0F, label.Rect.Y + 5.0F) == label
          if !painted || rounded != clipped || clipDepth != 0 || outside == clipped {
            throw InvalidOperationException("Overflow $overflow: painted $painted, rounded $rounded,"
              + " depth $clipDepth, outside $outside")
          }
        }
        let allocated = GC.GetAllocatedBytesForCurrentThread()
        for frame in 0 ... 50 {
          pump.Sweep(0.0001)
          layout.RefreshRects(root)
        }
        let bytes = GC.GetAllocatedBytesForCurrentThread() - allocated
        if bytes != 0L { throw InvalidOperationException("Overflow transition allocated $bytes bytes") }
      } finally { NodeLifecycle.DisposeTree(root) }
    }
    return true
  }

  func LayoutTransitionBoundsReachMetricsAndAccessibility() bool {
    var wide = false
    let handle = ElementHandle()
    let cell = SizedRootFixture(() -> layoutWrappingScene(wide, handle))
    let window = Window{Root: cell, Size: LayoutSize(300, 260)}
    let adapter = AccessibilityTestAdapter()
    window.AccessibilityAdapter = adapter
    try {
      window.UpdateTree()
      wide = true
      cell.Rebuild()
      window.UpdateTree()
      window.UpdateTree(0.05)
      let card = window.Tree!!.Children[1]
      let bounds = handle.BorderBox
      guard let semantic = adapter.Tree?.Root else { return false }
      if MathF.Abs(card.Rect.W - 200.0F) > 0.01F
        || bounds.X != float64(card.Rect.X) || bounds.Y != float64(card.Rect.Y)
        || bounds.Width != float64(card.Rect.W) || bounds.Height != float64(card.Rect.H)
        || semantic.Bounds != bounds || semantic.Children[0].Bounds.Width != float64(card.Children[0].Rect.W) {
        throw InvalidOperationException("Visual width=${card.Rect.W}, metrics=$bounds, accessibility=${semantic.Bounds}")
      }
      return true
    } finally { window.Close() }
  }

  func LayoutTransitionSettlesInsideSized() bool {
    let scene = (columns int32, duration float64) -> Sized(size -> {
      let grid = Container{Width: 680, Height: 680, FlexDirection: FlexDirection.Row,
        FlexWrap: FlexWrap.Wrap, Gap: 16}
      for index in 0 ... 16 {
        grid.Add(Container{Key: "tile-$index", Width: (696.0 / columns) - 16.0,
          Height: 100, FlexShrink: 0, LayoutTransition: LayoutTransition(duration, Easing.Linear)})
      }
      return grid
    }){.Width: 680, .Height: 680}
    let pump = MotionPump()
    let reconciler = Reconciler{Res: Resolver{}, Pump: pump,
      RetainedInvalidated: (effects ReconcileEffects) -> { }}
    let layout = Layout()
    var root = reconciler.Mount(scene(4, 100))
    layout.Calculate(root, 680.0F, 680.0F)
    layout.RefreshSized(root, reconciler)
    let tiles = root.Children[0].Children
    let last = tiles[15]
    let oldRect = last.Rect

    root = reconciler.Diff(root, scene(8, 100))
    layout.MarkStructureDirty()
    layout.Calculate(root, 680.0F, 680.0F)
    layout.RefreshSized(root, reconciler)
    if !pump.Active || tiles[15] != last || last.Rect.X != oldRect.X || last.Rect.Y != oldRect.Y {
      return false
    }
    for frame in 0 ... 2 {
      pump.Sweep(0.05)
      layout.RefreshRects(root)
    }
    if pump.Active { return false }

    let truthReconciler = Reconciler{Res: Resolver{}}
    let truth = truthReconciler.Mount(scene(8, 0))
    let truthLayout = Layout()
    truthLayout.Calculate(truth, 680.0F, 680.0F)
    truthLayout.RefreshSized(truth, truthReconciler)
    for index in 0 ... tiles.Count {
      let actual = tiles[index].Rect
      let expected = truth.Children[0].Children[index].Rect
      if actual.X != expected.X || actual.Y != expected.Y || actual.W != expected.W || actual.H != expected.H {
        return false
      }
    }
    return true
  }

  func LayoutTransitionRetargetsWithVelocity() bool {
    let simulations = List[LayoutFixtureSimulation]()
    let factory(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> {
      let simulation = LayoutFixtureSimulation(from, to, velocity)
      simulations.Add(simulation)
      return simulation
    }
    let transition = LayoutTransition{
      DurationMs: 100.0,
      Easing: Easing.Linear,
      SimulationFactory: factory,
    }
    let pump = MotionPump()
    let reconciler = Reconciler{
      Res: Resolver{},
      Pump: pump,
      RetainedInvalidated: (effects ReconcileEffects) -> { },
    }
    var root = reconciler.Mount(layoutSimulationScene(20.0, 30.0, transition))
    let layout = Layout()
    layout.Calculate(root, 200.0F, 200.0F)
    let target = root.Children[0]
    if target.Rect.X != 20.0F || target.Rect.Y != 30.0F { return false }

    root = reconciler.Diff(root, layoutSimulationScene(100.0, 120.0, transition))
    layout.MarkStructureDirty()
    layout.Calculate(root, 200.0F, 200.0F)
    if simulations.Count != 4 || target.Rect.X != 20.0F || target.Rect.Y != 30.0F
      || target.Rect.W != 20.0F || target.Rect.H != 30.0F {
      return false
    }
    pump.Sweep(0.25)
    layout.RefreshRects(root)
    let firstX = target.Rect.X
    let firstY = target.Rect.Y
    let velocityX = simulations[0].Velocity(0.25)
    let velocityY = simulations[1].Velocity(0.25)

    root = reconciler.Diff(root, layoutSimulationScene(150.0, 40.0, transition))
    layout.MarkStructureDirty()
    layout.Calculate(root, 200.0F, 200.0F)
    if simulations.Count != 8 || MathF.Abs(target.Rect.X - firstX) > 0.001F
      || MathF.Abs(target.Rect.Y - firstY) > 0.001F
      || target.Rect.W != target.Rect.X || target.Rect.H != target.Rect.Y
      || Math.Abs(simulations[4].InitialVelocity - velocityX) > 0.000001
      || Math.Abs(simulations[5].InitialVelocity - velocityY) > 0.000001
      || simulations[6].InitialVelocity != simulations[4].InitialVelocity
      || simulations[7].InitialVelocity != simulations[5].InitialVelocity {
        return false
      }

    pump.Sweep(0.1)
    layout.RefreshRects(root)
    let secondX = target.Rect.X
    let secondY = target.Rect.Y
    let secondVelocityX = simulations[4].Velocity(0.1)
    let secondVelocityY = simulations[5].Velocity(0.1)
    root = reconciler.Diff(root, layoutSimulationScene(70.0, 80.0, transition))
    layout.MarkStructureDirty()
    layout.Calculate(root, 200.0F, 200.0F)
    if simulations.Count != 12 || MathF.Abs(target.Rect.X - secondX) > 0.001F
      || MathF.Abs(target.Rect.Y - secondY) > 0.001F
      || target.Rect.W != target.Rect.X || target.Rect.H != target.Rect.Y
      || Math.Abs(simulations[8].InitialVelocity - secondVelocityX) > 0.000001
      || Math.Abs(simulations[9].InitialVelocity - secondVelocityY) > 0.000001
      || simulations[10].InitialVelocity != simulations[8].InitialVelocity
      || simulations[11].InitialVelocity != simulations[9].InitialVelocity {
        return false
      }

    pump.ReducedMotion = true
    pump.Sweep(0.01)
    layout.RefreshRects(root)
    if pump.Active || target.Rect.X != 70.0F || target.Rect.Y != 80.0F
      || target.Rect.W != 70.0F || target.Rect.H != 80.0F { return false }
    pump.ReducedMotion = false
    root = reconciler.Diff(root, layoutSimulationScene(90.0, 100.0, transition))
    layout.MarkStructureDirty()
    layout.Calculate(root, 200.0F, 200.0F)
    if !pump.Active { return false }
    LayoutTransitions.Dispose(target)
    layout.RefreshRects(root)
    return !pump.Active && target.Rect.X == 90.0F && target.Rect.Y == 100.0F
      && target.Rect.W == 90.0F && target.Rect.H == 100.0F
  }

  func LongParagraphWrapResolvesScriptsOnce() bool {
    let words = StringBuilder("Wrapped:")
    for i in 0 ... 1500 { words.Append(" word").Append(i) }
    let resolver = Resolver{}
    let n = Reconciler{ Res: resolver }.Mount(Text{
      Content: "Unbroken:" + String('x', 6000) + " " + words.ToString() + " \u65E5\u672C\u8A9E \u05E2\u05D1\u05E8\u05D9\u05EA",
    })
    resolver.FlushEffects()
    let before = TextShaping.ScriptResolutionsForTest()
    let layout = TextLayouts.For(n, 300.0F)
    let resolutions = TextShaping.ScriptResolutionsForTest() - before
    var covered = 0
    for line in layout.Lines { covered += line.Content.Length }
    return layout.Lines.Count > 100 && covered == n.Content.Length && resolutions <= 1L
  }

  func WrappedMeasurementsMatchShapedLineWidths() bool {
    for text in []string{"", "office cafe\u0301", "\u05D0\u05D1\u05D2 abc \u0633\u0644\u0627\u0645", "\u65E5\u672C\u8A9E \uD83D\uDE00 text", "a\uD83D b\uDE00"} {
      for direction in 0 ... 3 {
        for spacing in []float32{-2.0F, 0.0F, 1.5F} {
          let resolver = Resolver{}
          let n = Reconciler{Res: resolver}.Mount(Text{
            Content: text, FontSize: 16,
            Direction: direction == 0 ? Direction.Auto : direction == 1 ? Direction.LeftToRight : Direction.RightToLeft,
            LetterSpacing: float64(spacing),
          })
          let paragraph = TextAnalyses.For(n).First
          let starts = UnicodeGraphemes.Starts(text)
          for i in 0 ... starts.Length {
            for j in i + 1 ... starts.Length + 1 {
              let end = j < starts.Length ? starts[j] : text.Length
              using let shape = TextLineShaper.Base(paragraph, starts[i], end)
              if TextFlow.MeasureBase(paragraph, starts[i], end) != shape.Width { return false }
            }
          }
          let layout = TextLayouts.For(n, 40.0F)
          var covered = 0
          for line in layout.Lines { covered += line.Content.Length }
          NodeLifecycle.DisposeTree(n)
          if covered != text.Length { return false }
        }
      }
    }
    return true
  }

  func IdenticalTextLayoutsSurviveSiblingRetirement() bool {
    let resolver = Resolver{}
    let reconciler = Reconciler{ Res: resolver }
    var root = reconciler.Mount(Container() {
      Text{ Key: "a", Content: "Shared wrapped text layout" },
      Text{ Key: "b", Content: "Shared wrapped text layout" },
    })
    resolver.FlushEffects()
    let first = TextLayouts.For(root.Children[0], 100.0F)
    let second = TextLayouts.For(root.Children[1], 100.0F)
    if !Object.ReferenceEquals(first, second) { return false }
    root = reconciler.Diff(root, Container() {
      Text{ Key: "b", Content: "Shared wrapped text layout" },
    })
    resolver.FlushEffects()
    for i in 0 ... 257 {
      let n = reconciler.Mount(Text{ Content: "Evict shared layout " + i.ToString() })
      TextLayouts.For(n, 100.0F)
      TextLayouts.Dispose(n)
    }
    let retained = TextLayouts.For(root.Children[0], 100.0F)
    if !Object.ReferenceEquals(second, retained) { return false }
    if retained.References != 1 { return false }
    return retained.Width > 0.0F && retained.Lines.Count > 1
  }

  func HiddenScrollLayoutsClearGeometry() bool {
    let root = Reconciler{ Res: Resolver{} }.Mount(Container{ Width: 100, Height: 100,
      Container{ Width: 100, Height: 100, OverflowY: Overflow.Scroll,
        Container{ Width: 100, Height: 300, FlexShrink: 0 },
      },
    })
    let layout = Layout()
    layout.Calculate(root, 100.0F, 100.0F)
    let scroll = root.Children[0]
    ScrollState.To(scroll, 0.0F, 150.0F, true)
    layout.RefreshRects(root)
    if scroll.ScrollY != 150.0F { return false }
    scroll.Display = Display.None
    syncYogaField(scroll, StyleField.Display)
    layout.MarkStructureDirty()
    layout.Calculate(root, 100.0F, 100.0F)
    return scroll.ScrollY == 0.0F && scroll.ScrollTargetY == 0.0F
      && scroll.Children[0].Rect.W == 0.0F && scroll.Children[0].Rect.H == 0.0F
      && !ScrollState.HasDemand(scroll)
  }

  func PixelSnappingPreservesScrollExtent() bool {
    for density in []float32{ 1.0F, 1.25F, 1.5F } {
      let root = Reconciler{ Res: Resolver{} }.Mount(Container{ Width: 960, Height: 640,
        Container{ Position: PositionType.Absolute, Left: 447.25, Top: 295.25,
          Width: 476, Height: 28, FlexDirection: FlexDirection.Row, Gap: 2,
          OverflowX: Overflow.Scroll,
          Container{ FlexGrow: 1, FlexBasis: 0, MinWidth: 0 },
          Container{ FlexGrow: 1, FlexBasis: 0, MinWidth: 0 },
        },
      })
      let layout = Layout()
      layout.SetPixelDensity(density)
      layout.Calculate(root, 960.0F, 640.0F)
      let tabs = root.Children[0]
      if maxScrollX(tabs) != 0.0F {
        throw InvalidOperationException("density=${density}, content=${tabs.ContentW}, viewport=${scrollViewportWidth(tabs)}")
      }
    }
    return true
  }

  func CustomLayoutScrollExtentExcludesInsets() bool {
    let root = Reconciler{ Res: Resolver{} }.Mount(Container{ Width: 200, Height: 200,
      Container{ Layout: LayoutMeasurementFixtureAlgorithm(), Width: 100, Height: 100, Padding: 10,
        OverflowY: Overflow.Scroll,
        Container{},
      },
    })

    Layout().Calculate(root, 200.0F, 200.0F)

    let scroller = root.Children[0]
    if scroller.ContentH != 80.0F {
      throw InvalidOperationException("content=${scroller.ContentH}, viewport=${scrollViewportHeight(scroller)}")
    }

    return true
  }

  func ScrollEndShowsFractionalContentEnd() bool {
    for density in []float32{ 1.0F, 1.25F, 1.5F } {
      let root = Reconciler{ Res: Resolver{} }.Mount(Container{ Width: 200, Height: 300,
        Container{ Height: 100, OverflowY: Overflow.Scroll },
      })
      let layout = Layout()
      layout.SetPixelDensity(density)
      layout.Calculate(root, 200.0F, 300.0F)
      let scroller = root.Children[0]
      for i in 0 ... 20 {
        let content = 250.0F + float32(i) * 0.05F
        ScrollState.SetExtent(scroller, 200.0F, content)
        ScrollState.To(scroller, 0.0F, 100000.0F, true)
        let end = content - scrollViewportHeight(scroller)
        let painted = TransformGeometry.ScrollOffset(scroller, TransformGeometry.WindowMatrix(scroller),
          scroller.ScrollX, scroller.ScrollY).Y
        if painted < end - 0.0001F || painted > end + 1.0F / density {
          throw InvalidOperationException("density=${density}, end=${end}, painted=${painted}")
        }
      }
    }
    return true
  }

  func NestedBaselinesIgnorePixelSnappedPositions() bool {
    let pair = (size float64) -> Container{
      Width: 100, FlexDirection: FlexDirection.Row, AlignItems: AlignItems.Baseline,
      Text{Content: "a", FontSize: 12}, Text{Content: "b", FontSize: size}}
    let scene = Container{Width: Percent(100), Height: Percent(100), Padding: Edges{Top: 229},
      Container{FlexDirection: FlexDirection.Row, AlignItems: AlignItems.Baseline,
        Padding: Edges{Top: 2}, pair(14), pair(18)},
      Container{Height: 38, Margin: Edges{Top: 2}, BorderWidth: Edges{Bottom: 1},
        FlexDirection: FlexDirection.Row, AlignItems: AlignItems.Center,
        Container{Width: 502, Padding: Edges{Left: 6}, FlexDirection: FlexDirection.Row,
          Overflow: Overflow.Hidden, Text{Content: "notes", FontSize: 12, FlexGrow: 1}}}}
    for density in []float32{1.0F, 1.25F, 1.5F, 2.0F} {
      let root = Reconciler{Res: Resolver{}}.Mount(scene)
      let layout = Layout()
      layout.SetPixelDensity(density)
      for resize in 0 ... 10 {
        let width = 600.0F + float32(resize % 2)
        layout.Calculate(root, width, 800.0F)
        let fresh = Reconciler{Res: Resolver{}}.Mount(scene)
        let freshLayout = Layout()
        freshLayout.SetPixelDensity(density)
        freshLayout.Calculate(fresh, width, 800.0F)
        let actual = List[float32]()
        let expected = List[float32]()
        snapshot(root, actual)
        snapshot(fresh, expected)
        if !sameSnapshot(actual, expected) {
          throw InvalidOperationException("density=${density}, resize=${resize}, cached=${root.Children[0].Rect.H}, fresh=${fresh.Children[0].Rect.H}")
        }
      }
    }
    return true
  }

  func PixelSnappingPreservesCachedLayoutsAcrossResizes() bool {
    let scene = Container{ Width: Percent(100), Height: Percent(100),
      Container{ Position: PositionType.Absolute, Left: 18, Bottom: 14,
        Width: 54, Height: 36, FlexDirection: FlexDirection.Row,
        AlignItems: AlignItems.Center, JustifyContent: JustifyContent.Center,
        Text{ Content: "day", FontSize: 13 },
      },
    }
    for changingDensity in []bool{ false, true } {
      let root = Reconciler{ Res: Resolver{} }.Mount(scene)
      let layout = Layout()
      for resize in 0 ... 100 {
        let height = 800.0F + float32(resize % 2)
        let density = if changingDensity { (2100.0F + float32(resize % 2) * 3.0F) / height } else { 2.625F }
        layout.SetPixelDensity(density)
        layout.Calculate(root, 400.0F, height)
        let fresh = Reconciler{ Res: Resolver{} }.Mount(scene)
        let freshLayout = Layout()
        freshLayout.SetPixelDensity(density)
        freshLayout.Calculate(fresh, 400.0F, height)
        let actual = List[float32]()
        let expected = List[float32]()
        snapshot(root, actual)
        snapshot(fresh, expected)
        if !sameSnapshot(actual, expected) {
          throw InvalidOperationException("resize=${resize}, density=${density}, cached=${root.Children[0].Children[0].Rect.Y}, fresh=${fresh.Children[0].Children[0].Rect.Y}")
        }
      }
    }
    return true
  }

  func PixelSnappingPreservesDistantItemSizes() bool {
    for density in []float32{ 1.0F, 1.5F, 2.0F } {
      let root = Reconciler{ Res: Resolver{} }.Mount(Container{ Width: 100, Height: 200,
        Container{ Position: PositionType.Absolute, Top: 65999672, Left: 65999672,
          Width: 33, Height: 33 },
      })
      let layout = Layout()
      layout.SetPixelDensity(density)
      layout.Calculate(root, 100.0F, 200.0F)
      let size = root.Children[0].Rect
      let expected = MathF.Floor(33.0F * density + 0.5F) / density
      if size.W != expected || size.H != expected { return false }
    }
    return true
  }

  func BorderSnappingAlignsPaddingBox() bool {
    for density in []float32{ 1.0F, 1.25F, 1.5F, 2.0F } {
      let root = Reconciler{ Res: Resolver{} }.Mount(Container{ Width: 100, Height: 50, BorderWidth: 1, Padding: 1,
        Container{ FlexGrow: 1 },
      })
      let layout = Layout()
      layout.SetPixelDensity(density)
      layout.Calculate(root, 100.0F, 50.0F)
      let border = MathF.Max(1.0F, MathF.Round(density, MidpointRounding.AwayFromZero)) / density
      if BoxGeometry.PaddingEdgeLeft(root) != border || BoxGeometry.PaddingEdgeWidth(root) != 100.0F - border - border
        || BoxGeometry.ContentLeft(root) != border + 1.0F {
        throw InvalidOperationException("density=${density}, border=${border}, paddingEdge=${BoxGeometry.PaddingEdgeLeft(root)}, contentLeft=${BoxGeometry.ContentLeft(root)}")
      }
    }
    return true
  }

  func CustomMeasurementsPreserveLogicalSizes() bool {
    for density in []float32{ 1.0F, 1.5F, 2.0F } {
      let policy = LayoutMeasurementFixtureAlgorithm()
      let root = Reconciler{ Res: Resolver{} }.Mount(Container{ Width: 100, Height: 200,
        Container{ Layout: policy,
          TextEntry{ Value: "value", Width: 50.25, FontSize: 15.5, LineHeight: 1.5,
            Padding: 12, BorderWidth: 1 },
        },
      })
      let layout = Layout()
      layout.SetPixelDensity(density)
      layout.Calculate(root, 100.0F, 200.0F)
      let border = MathF.Max(1.0F, MathF.Round(density, MidpointRounding.AwayFromZero)) / density
      let desired = 23.25F + (24.0F + border + border)
      let expected = MathF.Floor(desired * density + 0.5F) / density
      if policy.DesiredSize.Width != 50.25 || policy.DesiredSize.Height != float64(desired)
        || root.Children[0].Rect.H != expected || root.Children[0].Children[0].Rect.H != expected {
        throw InvalidOperationException("density=${density}, desired=${policy.DesiredSize.Width}x${policy.DesiredSize.Height}, expectedHeight=${desired}, rect=${root.Children[0].Rect.H}, child=${root.Children[0].Children[0].Rect.H}, expectedRect=${expected}")
      }
    }
    return true
  }

  func CustomPlacementsSnapToDevicePixelsAcrossRelayouts() bool {
    let scene = Container{ Width: Percent(100), Height: Percent(100),
      Container{ Position: PositionType.Absolute, Left: 7.3, Top: 5, Width: 160, Height: 40, Padding: 1,
        Layout: LayoutPlacementFixtureAlgorithm(),
        Container{ Width: 30, Height: 20 },
        Container{ Width: 30, Height: 20, Margin: 0.6 },
      },
    }
    for density in []float32{ 1.25F, 1.75F } {
      let root = Reconciler{ Res: Resolver{} }.Mount(scene)
      let layout = Layout()
      layout.SetPixelDensity(density)
      layout.Calculate(root, 200.0F, 100.0F)
      let expected = List[float32]()
      snapshot(root, expected)
      for pass in 0 ... 22 {
        if pass == 20 { layout.Calculate(root, 207.0F, 100.0F) }
        CustomLayouts.State(root.Children[0])!!.Invalidate()
        layout.Calculate(root, 200.0F, 100.0F)
        let actual = List[float32]()
        snapshot(root, actual)
        if !sameSnapshot(actual, expected) {
          throw InvalidOperationException("density=${density}, pass=${pass}, x=${root.Children[0].Children[1].Rect.X}")
        }
      }
      for child in root.Children[0].Children {
        let x = child.Rect.X * density
        let y = child.Rect.Y * density
        if MathF.Abs(x - MathF.Round(x)) > 0.001F || MathF.Abs(y - MathF.Round(y)) > 0.001F {
          throw InvalidOperationException("density=${density}, x=${x}, y=${y}")
        }
      }
    }
    return true
  }

  func HiddenCustomLayoutsWaitForVisibleGeometry() bool {
    let policy = LayoutVisibilityFixtureAlgorithm()
    let reconciler = Reconciler{ Res: Resolver{} }
    var root = reconciler.Mount(customVisibilityScene(policy, Display.None, "empty"))
    let layout = Layout()
    for step in 0 ... 5 {
      let shown = step == 2 || step == 4
      if step > 0 {
        root = reconciler.Diff(root, customVisibilityScene(policy,
          shown ? Display.Flex : Display.None, "pending host ${step}"))
      }
      layout.MarkStructureDirty()
      layout.Calculate(root, 200.0F, 100.0F)
      layout.RefreshRects(root)
      let expected = step < 2 ? 0 : step == 4 ? 2 : 1
      if policy.Arranges != expected { return false }
      if shown && (policy.FinalSize.Width != 100.0 || policy.FinalSize.Height != 40.0) {
        return false
      }
    }
    return true
  }

  private func customVisibilityScene(policy LayoutAlgorithm, display Display, content string) Blob ->
  Container{ Width: 200, Height: 100,
    Container{ Key: "table", Width: 100, Height: 40, Display: display,
      Container{ Layout: policy, Width: Percent(100), Height: Percent(100),
        Text{ Content: content },
      },
    },
  }

  func LoneSurrogateTextLaysOut() bool {
    let resolver = Resolver{}
    let n = Reconciler{ Res: resolver }.Mount(Text{ Content: "ab\uD83D cd \uDE00" })
    resolver.FlushEffects()
    let layout = TextLayouts.For(n, 300.0F)
    var covered = 0
    for line in layout.Lines { covered += line.Content.Length }
    return covered == n.Content.Length
  }

  func MeasuredTextMatchesLaidOutText() bool {
    let failures = List[string]()
    for style in []Style{
      Style{ FontSize: 13.5, FontWeight: 600.0, LetterSpacing: 0.3,
        TextTransform: TextTransform.Uppercase },
      Style{ FontSize: 16 },
    } {
      for scale in []float32{ 1.0F, 1.25F, 1.5F, 1.75F, 2.0F, 2.25F, 2.5F, 3.0F } {
        for start in []float64{ 0.0, 0.3, 0.55 } {
          if start != 0.0 && scale != 1.25F && scale != 1.75F { continue }
          for label in []string{ "Settings", "Large file transfer", "AVATAR office ffi",
            "1234 ([567])", "(AV) [office] {ffi}", "a\u0301 cafe\u0301",
            "\u05D0\u05D1\u05D2 abc", "\u0645\u0631\u062D\u0628\u0627",
            "\u0915\u094D\u0937\u093F", "\u65E5\u672C\u8A9E" } {
            let window = Window{ Root: LayoutTextFixtureCell(Text{ BasedOn: style, Content: label }, start),
              Size: LayoutSize(float64(600) / float64(scale), float64(100) / float64(scale)),  UiScale: scale }
            window.UpdateTree()
            guard let text = window.Tree?.Children[0] else { return false }
            let measured = window.MeasureText(label, style)
            if measured <= 0.0F || measured != text.Rect.W {
              failures.Add("scale=${scale} start=${start} label=${label} measured=${measured} laidOut=${text.Rect.W}")
            }
          }
        }
      }
    }
    if failures.Count > 0 { throw InvalidOperationException(String.Join("; ", failures)) }
    return true
  }

  func RtlRunPlacesFirstCharacterAtTheRight() bool {
    let shaped = TextShaping.Shape("\u05D0\u05D1\u05D2", "", 16.0F, 400, false, 0.0F, 0)
    if shaped.Runs.Count != 1 { return false }
    let run = shaped.Runs[0]
    if !run.RightToLeft || run.Points.Length != 3 || run.Clusters[0] != 2u { return false }
    return run.Points[0].X >= 0.0F && run.Points[0].X < run.Points[1].X
      && run.Points[1].X < run.Points[2].X && run.Points[2].X < shaped.Width
      && MathF.Abs(shaped.CaretX(0, 1) - shaped.Width) < 0.01F
      && MathF.Abs(shaped.CaretX(3, 0)) < 0.01F
  }

  func TextEntryUsesIntrinsicLineBoxHeight() bool {
    let reconciler = Reconciler{ Res: Resolver{} }
    var root = reconciler.Mount(Container() {.Width: 200,
        TextEntry{
          Key: "value", Value: "hello", FontSize: 16, LineHeight: 1.25,
          Padding: 12, BorderWidth: 2,
        },
        TextEntry{
          Key: "placeholder", Placeholder: "Search", FontSize: 16, LineHeight: 1.25,
          Padding: Edges{ Top: Percent(5), Bottom: Percent(5) }, BorderWidth: 2,
        },
        TextEntry{
          Key: "explicit", Value: "hello", Height: 31, FontSize: 16, LineHeight: 1.25,
          Padding: 12, BorderWidth: 2,
        },
        TextEntry{
          Key: "auto", Height: Length.Auto, FontSize: 16, LineHeight: 1.25,
          Padding: 12, BorderWidth: 2,
      },
    })
    let layout = Layout()
    layout.Calculate(root, 200.0F, 300.0F)
    if root.Children[0].Rect.H != 48.0F
      || root.Children[1].Rect.H != 44.0F
      || root.Children[2].Rect.H != 31.0F
      || root.Children[3].Rect.H != 48.0F {
        throw InvalidOperationException(root.Children[0].Rect.H.ToString() + ","
          +root.Children[1].Rect.H.ToString() + "," + root.Children[2].Rect.H.ToString()
          +"," + root.Children[3].Rect.H.ToString())
      }

    root = reconciler.Diff(root, Container() {.Width: 200,
        TextEntry{
          Key: "value", Value: "hello", FontSize: 20, LineHeight: 1.5,
          Padding: 12, BorderWidth: 2,
        },
        TextEntry{
          Key: "placeholder", Placeholder: "Search", FontSize: 16, LineHeight: 1.25,
          Padding: Edges{ Top: Percent(5), Bottom: Percent(5) }, BorderWidth: 2,
        },
        TextEntry{
          Key: "explicit", Value: "hello", Height: 31, FontSize: 20, LineHeight: 1.5,
          Padding: 12, BorderWidth: 2,
        },
        TextEntry{
          Key: "auto", Height: Length.Auto, FontSize: 16, LineHeight: 1.25,
          Padding: 12, BorderWidth: 2,
      },
    })
    layout.Calculate(root, 200.0F, 300.0F)
    if root.Children[0].Rect.H != 58.0F || root.Children[2].Rect.H != 31.0F {
      throw InvalidOperationException(root.Children[0].Rect.H.ToString() + ","
        +root.Children[2].Rect.H.ToString())
    }

    let entryRoot = Reconciler{ Res: Resolver{} }.Mount(TextEntry{
      Value: "hello", FontSize: 16, LineHeight: 1.25, Padding: 12, BorderWidth: 2,
    })
    Layout().Calculate(entryRoot, 200.0F, 300.0F)
    return entryRoot.Rect.H == 48.0F
  }

  private func layoutTransitionScene(firstWidth float64) Container -> Container() {.Width: 200,.Height: 40,.FlexDirection: FlexDirection.Row,
    Container{ Key: "first", Width: firstWidth, Height: 20 },
      Container{
        Key: "target",
        Width: 20,
        Height: 20,
        LayoutTransition: LayoutTransition(100.0, Easing.Linear),
      },
    }

  private func layoutWrappingScene(wide bool, handle ElementHandle? = nil,
    overflow Overflow = Overflow.Hidden) Container -> Container{
    Width: 300, Height: 260, Padding: 10, Gap: 10,
    FlexDirection: FlexDirection.Row, FlexWrap: FlexWrap.Wrap, AlignContent: AlignContent.FlexStart,
    Container{Key: "first", Width: 130, Height: 50, FlexShrink: 0},
    Container{
      Key: "card", Handle: handle, AccessibilityName: "Wrapping card", HitTestSelf: true,
      Width: wide ? 260 : 140, Height: wide ? 100 : 50, FlexShrink: 0,
      Padding: 8, BorderWidth: 2, BorderRadius: 20, Overflow: overflow,
      BackgroundColor: Color.White, LayoutTransition: LayoutTransition(100, Easing.Linear),
      Text{Content: "Wrapping card", AccessibilityName: "Card label", Height: 24, OnClick: () -> { }},
    },
  }

  private func layoutSimulationScene(x float64, y float64,
    transition LayoutTransition) Container -> Container() {.Width: 200,.Height: 200,
      Container{
        Key: "target", Position: PositionType.Absolute, Left: x, Top: y,
        Width: x, Height: y, LayoutTransition: transition,
      },
    }

  private func layoutScene(firstHeight float64) Container -> Container() {.Width: 400,.Height: 296,.Gap: 4,
    Container{ Key: "hidden", Width: 50, Height: 50, Display: Display.None },
      Container{ Key: "percent", Width: Percent(50), Height: firstHeight },
      Container{ Key: "unset", Height: 20 },
      Container() {.Key: "nested",.Height: 30,.Padding: 5, Container{ Key: "leaf", Width: 10, Height: 10} },
      Container{ Key: "grow-one", FlexGrow: 1.0 },
      Container{ Key: "grow-two", FlexGrow: 2.0},
  }

  private func snapshot(node Node, values List[float32]) {
    values.Add(float32(node.Children.Count))
    values.Add(node.Rect.X)
    values.Add(node.Rect.Y)
    values.Add(node.Rect.W)
    values.Add(node.Rect.H)
    for i in 0 ... node.Children.Count {
      snapshot(node.Children[i], values)
    }
  }

  private func sameSnapshot(a List[float32], b List[float32]) bool {
    if a.Count != b.Count {
      return false
    }
    for i in 0 ... a.Count {
      if a[i] != b[i] {
        return false
      }
    }
    return true
  }

  private func resetSizeAndPadding() bool {
    let reconciler = Reconciler{ Res: Resolver{} }
    let first = Container() {.Width: 200,.Height: 100,
      Container() {.Key: "target",.Width: 80,.Height: 60,.Padding: 10,
        Container{ Key: "leaf", Width: 10, Height: 10 }
      } }
    let second = Container() {.Width: 200,.Height: 100,
      Container() {.Key: "target", Container{ Key: "leaf", Width: 10, Height: 10 }} }
    let node = reconciler.Mount(first)
    let layout = Layout()
    layout.Calculate(node, 200.0F, 100.0F)
    let child = node.Children[0]
    let leaf = child.Children[0]
    if child.Rect.W != 80.0F || child.Rect.H != 60.0F || leaf.Rect.X != 10.0F {
      return false
    }

    reconciler.Diff(node, second)
    layout.Calculate(node, 200.0F, 100.0F)
    guard let yoga = child.Yoga else { return false }
    return child.Rect.W == 200.0F && child.Rect.H == 10.0F && leaf.Rect.X == 0.0F
      && YGNodeStyleAPI.YGNodeStyleGetWidth(yoga).Unit == Unit.Auto
      && YGNodeStyleAPI.YGNodeStyleGetHeight(yoga).Unit == Unit.Auto
  }

  private func resetRootSize() bool {
    let reconciler = Reconciler{ Res: Resolver{} }
    let node = reconciler.Mount(Container{ Width: 80, Height: 60 })
    let layout = Layout()
    layout.Calculate(node, 200.0F, 100.0F)
    if node.Rect.W != 80.0F || node.Rect.H != 60.0F {
      return false
    }

    reconciler.Diff(node, Container{})
    layout.Calculate(node, 200.0F, 100.0F)
    return node.Rect.W == 200.0F && node.Rect.H == 100.0F
  }

  private func resetEdgesAndGaps() bool {
    let reconciler = Reconciler{ Res: Resolver{} }
    let first = Container() {.Width: 200,.Height: 100,.FlexDirection: FlexDirection.Row,.Gap: 5,.ColumnGap: 10,
      Container() {.Key: "target",.Width: 50,.Height: 50,
        .Margin: Edges{ Left: 20 },.Padding: Edges{ Left: 15 },
        Container{ Key: "leaf", Width: 10, Height: 10} },
        Container{ Key: "sibling", Width: 20, Height: 20 },
      }
    let second = Container() {.Width: 200,.Height: 100,.FlexDirection: FlexDirection.Row,
      Container() {.Key: "target",.Width: 50,.Height: 50, Container{ Key: "leaf", Width: 10, Height: 10} },
        Container{ Key: "sibling", Width: 20, Height: 20},
    }
    let node = reconciler.Mount(first)
    let layout = Layout()
    layout.Calculate(node, 200.0F, 100.0F)
    let child = node.Children[0]
    let leaf = child.Children[0]
    let sibling = node.Children[1]
    if child.Rect.X != 20.0F || leaf.Rect.X != 35.0F || sibling.Rect.X != 80.0F {
      return false
    }

    reconciler.Diff(node, second)
    layout.Calculate(node, 200.0F, 100.0F)
    return child.Rect.X == 0.0F && leaf.Rect.X == 0.0F && sibling.Rect.X == 50.0F
  }

  private func resetMinMaxAndFlexBasis() bool {
    let reconciler = Reconciler{ Res: Resolver{} }
    let first = Container() {.Width: 300,.Height: 100,.FlexDirection: FlexDirection.Row,
      Container{ Key: "min", Width: 20, Height: 10, MinWidth: 80 },
        Container{ Key: "max", Width: 100, Height: 10, MaxWidth: 40 },
        Container{ Key: "basis", Width: 20, Height: 10, FlexBasis: 70 },
      }
    let second = Container() {.Width: 300,.Height: 100,.FlexDirection: FlexDirection.Row,
      Container{ Key: "min", Width: 20, Height: 10 },
        Container{ Key: "max", Width: 100, Height: 10 },
        Container{ Key: "basis", Width: 20, Height: 10},
    }
    let node = reconciler.Mount(first)
    let layout = Layout()
    layout.Calculate(node, 300.0F, 100.0F)
    if node.Children[0].Rect.W != 80.0F
      || node.Children[1].Rect.W != 40.0F
      || node.Children[2].Rect.W != 70.0F {
        return false
      }

    reconciler.Diff(node, second)
    layout.Calculate(node, 300.0F, 100.0F)
    guard let basisYoga = node.Children[2].Yoga else { return false }
    return node.Children[0].Rect.W == 20.0F
      && node.Children[1].Rect.W == 100.0F
      && node.Children[2].Rect.W == 20.0F
      && YGNodeStyleAPI.YGNodeStyleGetFlexBasis(basisYoga).Unit == Unit.Auto
  }

  private func resetPositionAndAspectRatio() bool {
    let reconciler = Reconciler{ Res: Resolver{} }
    let first = Container() {.Width: 200,.Height: 100,
      Container{
        Key: "target", Width: 40, AspectRatio: 2.0,
        Position: PositionType.Absolute, Left: 30, Top: 25,
      }
    }
    let second = Container() {.Width: 200,.Height: 100,
      Container{ Key: "target", Width: 40, Position: PositionType.Absolute} }
    let node = reconciler.Mount(first)
    let layout = Layout()
    layout.Calculate(node, 200.0F, 100.0F)
    let child = node.Children[0]
    if child.Rect.X != 30.0F || child.Rect.Y != 25.0F || child.Rect.H != 20.0F {
      return false
    }

    reconciler.Diff(node, second)
    layout.Calculate(node, 200.0F, 100.0F)
    return child.Rect.X == 0.0F && child.Rect.Y == 0.0F && child.Rect.H == 0.0F
  }
}

internal class LayoutCauseFixtureCell : Cell {
  internal let Expanded State[bool] = State[bool](false)
  internal let Simulations List[LayoutFixtureSimulation] = List[LayoutFixtureSimulation]()
  internal var ReadMetrics bool
  internal var UseSized bool
  internal var Transitions bool = true
  private let transition LayoutTransition

  internal init() {
    transition = LayoutTransition{SimulationFactory: (from float64, to float64, velocity float64) -> {
      let simulation = LayoutFixtureSimulation(from, to, velocity)
      Simulations.Add(simulation)
      return simulation
    }}
  }

  override func Build() Blob {
    if UseSized {
      return Sized(size -> content(ReadMetrics ? size.Width * 0.1 : 0.0)){.Width: Percent(100), .Height: Percent(100)}
    }
    return content(ReadMetrics ? Host.Size.Width * 0.1 : 0.0)
  }

  private func content(responsive float64) Blob {
    let firstWidth = (Expanded.Value ? 100.0 : 50.0) + responsive
    let motion LayoutTransition? = Transitions ? transition : nil
    return Container() {.Width: Percent(100), .Height: Percent(100), .AlignItems: AlignItems.FlexStart,
      Container() {.Key: "parent", .Height: 40, .FlexDirection: FlexDirection.Row, .LayoutTransition: motion,
        Container{Width: firstWidth, Height: 40, FlexShrink: 0},
        Container{Key: "sibling", Width: 20, Height: 40, FlexShrink: 0, LayoutTransition: motion},
      },
      Container{Key: "environment", Width: Percent(50), Height: 20, LayoutTransition: motion},
    }
  }
}

internal class LayoutFixtureSimulation : Simulation {
  private let start float64
  private let target float64
  private let initialVelocity float64

  internal prop InitialVelocity float64 { get -> initialVelocity }

  internal init(start float64, target float64, initialVelocity float64) {
    this.start = start
    this.target = target
    this.initialVelocity = initialVelocity
  }

  public override func Position(elapsed float64) float64 {
    let t = Math.Clamp(elapsed, 0.0, 1.0)
    let square = t * t
    let cube = square * t
    return (2.0 * cube - 3.0 * square + 1.0) * start
      + (cube - 2.0 * square + t) * initialVelocity
      + (-2.0 * cube + 3.0 * square) * target
  }

  public override func Velocity(elapsed float64) float64 {
    if elapsed < 0.0 || elapsed >= 1.0 { return 0.0 }
    let square = elapsed * elapsed
    return (6.0 * square - 6.0 * elapsed) * start
      + (3.0 * square - 4.0 * elapsed + 1.0) * initialVelocity
      + (-6.0 * square + 6.0 * elapsed) * target
  }

  public override func Done(elapsed float64) bool -> elapsed >= 1.0
}

internal class LayoutVisibilityFixtureAlgorithm : LayoutAlgorithm {
  internal var Arranges int32
  internal var FinalSize LayoutSize

  public func Measure(context LayoutContext, available LayoutSize) LayoutSize ->
  context.MeasureChild(0, available)

  public func Arrange(context LayoutContext, finalSize LayoutSize) {
    Arranges++
    context.MeasureChild(0, LayoutSize(Double.PositiveInfinity, Double.PositiveInfinity))
    context.MeasureChild(0, finalSize)
    context.ArrangeChild(0, ElementRect{ Width: finalSize.Width, Height: finalSize.Height })
    FinalSize = finalSize
  }
}

internal class LayoutPlacementFixtureAlgorithm : LayoutAlgorithm {
  public func Measure(context LayoutContext, available LayoutSize) LayoutSize -> available

  public func Arrange(context LayoutContext, finalSize LayoutSize) {
    context.ArrangeChild(0, ElementRect{ X: 22.8, Y: 3.3, Width: 30, Height: 20 })
    context.ArrangeChild(1, ElementRect{ X: 61.7, Y: 0.4, Width: 31.2, Height: 21.2 })
  }
}

internal class LayoutMeasurementFixtureAlgorithm : LayoutAlgorithm {
  internal var DesiredSize LayoutSize

  public func Measure(context LayoutContext, available LayoutSize) LayoutSize {
    DesiredSize = context.MeasureChild(0, available)
    return DesiredSize
  }

  public func Arrange(context LayoutContext, finalSize LayoutSize) {
    context.ArrangeChild(0, ElementRect{ Width: finalSize.Width, Height: finalSize.Height })
  }
}

internal class LayoutTextFixtureCell(text Text, start float64) : Cell {
  override func Build() Blob -> Container{ AlignItems: AlignItems.FlexStart, PaddingStart: start, text }
}

internal class DensityFixtureLayout : LayoutAlgorithm {
  public func Measure(context LayoutContext, available LayoutSize) LayoutSize -> available
  public func Arrange(context LayoutContext, finalSize LayoutSize) {
    context.ArrangeChild(0, ElementRect{ Width: finalSize.Width, Height: finalSize.Height })
  }
}

internal class LengthContextFixture : LayoutAlgorithm {
  internal var Context LayoutContext?
  internal var Valid bool = true
  internal var Calls int32

  private func Check(context LayoutContext, available LayoutSize) {
    Context = context
    Calls++
    let horizontal = context.ResolveLength(Percent(50) + Vw(10) - Em(1), LayoutAxis.Horizontal)
    let vertical = context.ResolveLength(Percent(25) + Vh(10), LayoutAxis.Vertical)
    Valid = Valid && horizontal == available.Width * 0.5 + 20.0
      && vertical == available.Height * 0.25 + 20.0
      && context.ResolveLength(Length.Auto, LayoutAxis.Horizontal) == nil
      && context.ResolveLength(Length.MinContent, LayoutAxis.Horizontal) == nil
  }

  public func Measure(context LayoutContext, available LayoutSize) LayoutSize {
    Check(context, available)
    return available
  }

  public func Arrange(context LayoutContext, finalSize LayoutSize) { Check(context, finalSize) }
}

internal class MixedMaximumFixture : LayoutAlgorithm {
  internal var Valid bool = true
  private var desired LayoutSize

  public func Measure(context LayoutContext, available LayoutSize) LayoutSize {
    let first = context.MeasureChild(0, available)
    let second = context.MeasureChild(0, available)
    Valid = Valid && first.Width == available.Width * 0.5 + 10.0
      && first.Width == second.Width && first.Height == second.Height
    desired = first
    return first
  }

  public func Arrange(context LayoutContext, finalSize LayoutSize) {
    context.ArrangeChild(0, ElementRect{Width: desired.Width, Height: desired.Height})
  }
}

internal class UnboundedLengthContextFixture : LayoutAlgorithm {
  internal var Checked bool
  internal var Valid bool = true

  public func Measure(context LayoutContext, available LayoutSize) LayoutSize {
    if Double.IsPositiveInfinity(available.Height) {
      Checked = true
      Valid = Valid && context.ResolveLength(Percent(50), LayoutAxis.Vertical) == nil
        && context.ResolveLength(Percent(50) + Em(1), LayoutAxis.Vertical) == nil
        && context.ResolveLength(Em(1), LayoutAxis.Vertical) == 16.0
        && context.ResolveLength(Length.Pixels(10), LayoutAxis.Vertical) == 10.0
    }
    let child = context.MeasureChild(0, available)
    return LayoutSize(available.Width, child.Height)
  }

  public func Arrange(context LayoutContext, finalSize LayoutSize) {
    context.ArrangeChild(0, ElementRect{Width: 10, Height: 10})
  }
}

internal class RelativeRigorFixtureCell : Cell {
  internal var Units int32 = 1
  internal var Show bool = true

  public override func Build() Blob {
    let result = Container{Width: Percent(100), Height: Percent(100),
      Container{Width: Em(Units), Height: 20, FontSize: 20, Transform: PanelTransform{TranslateX: Em(Units)}}}
    if Show { result.Add(Container{Width: Vw(50), Height: 20}) }
    return result
  }
}

internal class RelativeLateMountFixtureCell : Cell {
  internal let Visible State[bool] = State[bool](false)

  public override func Build() Blob {
    let result = Container{Width: Percent(100), Height: Percent(100)}
    if Visible.Value {
      result.Add(Container{Padding: Em(1), FontSize: 20, Width: Vw(50), Height: 80,
        Container{Width: 10, Height: 10}})
    }
    return result
  }
}
