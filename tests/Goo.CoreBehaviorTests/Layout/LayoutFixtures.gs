package Goo

import System
import System.Collections.Generic
import Facebook.Yoga

internal class LayoutFixtures {
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
    let other = Reconciler{ Res: Resolver{} }.Mount(Container{
      Width: Length.Percent(100),
      Children: {
        Container{ Width: Length.Percent(100), Height: 10 },
      },
    })
    otherLayout.Calculate(other, 100.0F, 100.0F)
    layout.Calculate(root, 200.0F, 200.0F)
    layout.Calculate(other, 200.0F, 200.0F)
    return other.Rect.W == 200.0F && other.Children[0].Rect.W == 200.0F
  }

  func KeyedReorderRetainsYogaLayouts() bool {
    let reconciler = Reconciler{ Res: Resolver{} }
    var root = reconciler.Mount(Container{
      Width: 90, Height: 20, FlexDirection: FlexDirection.Row,
      Children: {
        Container{ Key: "a", Width: 10, Height: 10 },
        Container{ Key: "b", Width: 20, Height: 10 },
        Container{ Key: "c", Width: 30, Height: 10 },
      },
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

    root = reconciler.Diff(root, Container{
      Width: 90, Height: 20, FlexDirection: FlexDirection.Row,
      Children: {
        Container{ Key: "c", Width: 30, Height: 10 },
        Container{ Key: "a", Width: 10, Height: 10 },
        Container{ Key: "b", Width: 20, Height: 10 },
      },
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

    root = reconciler.Diff(root, Container{
      Width: 90, Height: 20, FlexDirection: FlexDirection.Row,
      Children: {
        Container{ Key: "a", Width: 10, Height: 10 },
        Container{ Key: "d", Width: 40, Height: 10 },
        Container{ Key: "c", Width: 30, Height: 10 },
      },
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
    let root = Reconciler{ Res: Resolver{} }.Mount(Container{
      Width: 100, Height: 100,
      Children: {
        Container{ Position: PositionType.Static, Left: 25, Top: 25, Width: 10, Height: 10 },
        Container{ Position: PositionType.Relative, Left: 25, Top: 25, Width: 10, Height: 10 },
      },
    })
    Layout().Calculate(root, 100.0F, 100.0F)
    let still = root.Children[0]
    let moved = root.Children[1]
    return still.Rect.X == 0.0F && still.Rect.Y == 0.0F
      && moved.Rect.X == 25.0F && moved.Rect.Y == 35.0F
  }

  func LogicalEdgesRespectDirection() bool {
    let ltr = Reconciler{ Res: Resolver{} }.Mount(Container{
      Width: 100, Height: 60, FlexDirection: FlexDirection.Row,
      Children: { Container{ Width: 20, Height: 10, MarginStart: 10 } },
    })
    let rtl = Reconciler{ Res: Resolver{} }.Mount(Container{
      Width: 100, Height: 60, Direction: Direction.RightToLeft,
      FlexDirection: FlexDirection.Row,
      Children: { Container{ Width: 20, Height: 10, MarginStart: 10 } },
    })
    let ltrPadding = Reconciler{ Res: Resolver{} }.Mount(Container{
      Width: 100, Height: 60, PaddingStart: 10,
      Children: { Container{ Width: 20, Height: 10 } },
    })
    let rtlPadding = Reconciler{ Res: Resolver{} }.Mount(Container{
      Width: 100, Height: 60, Direction: Direction.RightToLeft, PaddingStart: 10,
      FlexDirection: FlexDirection.Row,
      Children: { Container{ Width: 20, Height: 10 } },
    })
    let ltrAbsolute = Reconciler{ Res: Resolver{} }.Mount(Container{
      Width: 100, Height: 60,
      Children: { Container{ Width: 20, Height: 10, Position: PositionType.Absolute, Start: 10 } },
    })
    let rtlAbsolute = Reconciler{ Res: Resolver{} }.Mount(Container{
      Width: 100, Height: 60, Direction: Direction.RightToLeft,
      Children: { Container{ Width: 20, Height: 10, Position: PositionType.Absolute, Start: 10 } },
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
    let dynamic = Reconciler{ Res: dynamicResolver }.Mount(Container{
      Width: 100, Height: 60, FlexDirection: FlexDirection.Row,
      Children: { Container{ Width: 20, Height: 10, MarginStart: 10 } },
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

  func TextEntryUsesIntrinsicLineBoxHeight() bool {
    let reconciler = Reconciler{ Res: Resolver{} }
    var root = reconciler.Mount(Container{
      Width: 200,
      Children: {
        TextEntry{
          Key: "value", Value: "hello", FontSize: 16, LineHeight: 1.25,
          Padding: 12, BorderWidth: 2,
        },
        TextEntry{
          Key: "placeholder", Placeholder: "Search", FontSize: 16, LineHeight: 1.25,
          PaddingTop: Length.Percent(5), PaddingBottom: Length.Percent(5), BorderWidth: 2,
        },
        TextEntry{
          Key: "explicit", Value: "hello", Height: 31, FontSize: 16, LineHeight: 1.25,
          Padding: 12, BorderWidth: 2,
        },
        TextEntry{
          Key: "auto", Height: Length.Auto, FontSize: 16, LineHeight: 1.25,
          Padding: 12, BorderWidth: 2,
        },
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

    root = reconciler.Diff(root, Container{
      Width: 200,
      Children: {
        TextEntry{
          Key: "value", Value: "hello", FontSize: 20, LineHeight: 1.5,
          Padding: 12, BorderWidth: 2,
        },
        TextEntry{
          Key: "placeholder", Placeholder: "Search", FontSize: 16, LineHeight: 1.25,
          PaddingTop: Length.Percent(5), PaddingBottom: Length.Percent(5), BorderWidth: 2,
        },
        TextEntry{
          Key: "explicit", Value: "hello", Height: 31, FontSize: 20, LineHeight: 1.5,
          Padding: 12, BorderWidth: 2,
        },
        TextEntry{
          Key: "auto", Height: Length.Auto, FontSize: 16, LineHeight: 1.25,
          Padding: 12, BorderWidth: 2,
        },
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

  private func layoutTransitionScene(firstWidth float64) Container -> Container {
    Width: 200,
    Height: 40,
    FlexDirection: FlexDirection.Row,
    Children: {
      Container{ Key: "first", Width: firstWidth, Height: 20 },
      Container{
        Key: "target",
        Width: 20,
        Height: 20,
        LayoutTransition: LayoutTransition(100.0, Easing.Linear),
      },
    },
  }

  private func layoutScene(firstHeight float64) Container -> Container {
    Width: 400,
    Height: 296,
    Gap: 4,
    Children: {
      Container{ Key: "hidden", Width: 50, Height: 50, Display: Display.None },
      Container{ Key: "percent", Width: Length.Percent(50), Height: firstHeight },
      Container{ Key: "unset", Height: 20 },
      Container{ Key: "nested", Height: 30, Padding: 5, Children: {
        Container{ Key: "leaf", Width: 10, Height: 10 },
      } },
      Container{ Key: "grow-one", FlexGrow: 1.0 },
      Container{ Key: "grow-two", FlexGrow: 2.0 },
    },
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
    let first = Container{ Width: 200, Height: 100, Children: {
      Container{ Key: "target", Width: 80, Height: 60, Padding: 10, Children: {
        Container{ Key: "leaf", Width: 10, Height: 10 },
      } },
    } }
    let second = Container{ Width: 200, Height: 100, Children: {
      Container{ Key: "target", Children: {
        Container{ Key: "leaf", Width: 10, Height: 10 },
      } },
    } }
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
    let first = Container{
      Width: 200, Height: 100, FlexDirection: FlexDirection.Row,
      Gap: 5, ColumnGap: 10,
      Children: {
        Container{ Key: "target", Width: 50, Height: 50, MarginLeft: 20, PaddingLeft: 15, Children: {
          Container{ Key: "leaf", Width: 10, Height: 10 },
        } },
        Container{ Key: "sibling", Width: 20, Height: 20 },
      },
    }
    let second = Container{
      Width: 200, Height: 100, FlexDirection: FlexDirection.Row,
      Children: {
        Container{ Key: "target", Width: 50, Height: 50, Children: {
          Container{ Key: "leaf", Width: 10, Height: 10 },
        } },
        Container{ Key: "sibling", Width: 20, Height: 20 },
      },
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
    let first = Container{
      Width: 300, Height: 100, FlexDirection: FlexDirection.Row,
      Children: {
        Container{ Key: "min", Width: 20, Height: 10, MinWidth: 80 },
        Container{ Key: "max", Width: 100, Height: 10, MaxWidth: 40 },
        Container{ Key: "basis", Width: 20, Height: 10, FlexBasis: 70 },
      },
    }
    let second = Container{
      Width: 300, Height: 100, FlexDirection: FlexDirection.Row,
      Children: {
        Container{ Key: "min", Width: 20, Height: 10 },
        Container{ Key: "max", Width: 100, Height: 10 },
        Container{ Key: "basis", Width: 20, Height: 10 },
      },
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
    let first = Container{ Width: 200, Height: 100, Children: {
      Container{
        Key: "target", Width: 40, AspectRatio: 2.0,
        Position: PositionType.Absolute, Left: 30, Top: 25,
      },
    } }
    let second = Container{ Width: 200, Height: 100, Children: {
      Container{ Key: "target", Width: 40, Position: PositionType.Absolute },
    } }
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
