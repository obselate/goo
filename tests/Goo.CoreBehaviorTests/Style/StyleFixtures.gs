package Goo

import System
import System.Collections.Generic

internal class StyleFixtures {
  func ShaderEffectOnlyReplacementContract() bool {
    let program = ShaderEffectProgram([]uint8{
      71, 69, 70, 70, 1, 0, 0, 0, 1, 0, 0, 0,
      86, 83, 80, 86, 20, 0, 0, 0,
      3, 2, 35, 7, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0,
    })
    let first = ShaderEffect(program)
    let second = ShaderEffect(program)
    let reconciler = Reconciler{ Res: Resolver{} }
    let mounted = reconciler.Mount(Container{
      Width: 64,
      Height: 32,
      BackgroundColor: Color.White,
      ShaderEffect: first,
    })
    let retained = reconciler.Diff(mounted, Container{
      Width: 64,
      Height: 32,
      BackgroundColor: Color.White,
      ShaderEffect: second,
    })
    return retained == mounted && mounted.ShaderEffect == second
  }

  func TokenCompositionContract() bool {
    let theme = CompositionTokens{
      Surface: Color.Rgb(18, 52, 86),
      Foreground: Color.Rgb(240, 244, 248),
      Padding: 12,
    }
    let declaration = Tokens.Scope[CompositionTokens, Blob](theme, () -> Container() {.Gap: 6, tokenCard("synchronous"),
        tokenCell("retained"),
    })

    var scopeEnded = false
    try {
      let ignored = Tokens.Get[CompositionTokens]()
    } catch (error InvalidOperationException) {
      scopeEnded = true
    }
    if !scopeEnded { return false }

    let root = Reconciler{ Res: Resolver{} }.Mount(declaration)
    return root.Gap.Value == 6.0F
      && root.Children.Count == 2
      && matchesCard(root.Children[0], "synchronous", theme)
      && matchesCard(root.Children[1], "retained", theme)
  }

  func StyleConstructionContract() bool {
    let resolved = Reconciler{ Res: Resolver{} }.Mount(Container{
      Opacity: 2.0,
      BoxShadow: BoxShadow{ Blur: -8 },
      TransitionMs: -1.0,
    })
    let low = Reconciler{ Res: Resolver{} }.Mount(Container{ Opacity: -2.0, Margin: -1 })
    if resolved.Opacity != 1.0 || boxShadowCount(resolved.BoxShadows) != 1
      || boxShadowAt(resolved.BoxShadows, 0).Blur.Value != 0.0F
      || resolved.TransitionMs != 0.0 || low.Opacity != 0.0
      || low.MarginLeft.Value != -1.0F || low.MarginTop.Value != -1.0F
      || low.MarginRight.Value != -1.0F || low.MarginBottom.Value != -1.0F {
        return false
      }
    return rejectsInvalidStyleDeclarations()
  }

  func ClipPathResolutionStorageAndSnapContract() bool {
    let path = PathBuilder().MoveTo(0.0, 0.0).LineTo(1.0, 0.0).LineTo(1.0, 1.0).LineTo(0.0, 1.0).Close().Build()
    let defaults = Node{ Kind: NodeKind.Container }
    if defaults.HasClipPath || ClipPaths.Get(defaults) != nil || ClipPaths.Fit(defaults) != ShapeFit.Fill {
      return false
    }

    let resolver = Resolver{}
    let root = Reconciler{ Res: resolver }.Mount(Container{
      ClipPath: path, TransitionMs: 100.0,
      Hover: Style{ ClipPathFit: ShapeFit.Contain },
    })
    guard let initial = ClipPaths.Get(root) else { return false }
    if !root.HasClipPath || !samePath(initial.Path, path) || initial.Fit != ShapeFit.Fill
      || resolver.Animating.Count != 0 {
        return false
      }

    root.Hovered = true
    resolver.Invalidate(root, false)
    resolver.Flush()
    guard let hovered = ClipPaths.Get(root) else { return false }
    if !samePath(hovered.Path, path) || hovered.Fit != ShapeFit.Contain
      || resolver.Animating.Count != 0 {
        return false
      }

    root.Hovered = false
    resolver.Invalidate(root, false)
    resolver.Flush()
    guard let restored = ClipPaths.Get(root) else { return false }
    if !samePath(restored.Path, path) || restored.Fit != ShapeFit.Fill {
      return false
    }

    root.BaseStyle = nil
    resolver.Invalidate(root, false)
    resolver.Flush()
    return !root.HasClipPath && ClipPaths.Get(root) == nil && ClipPaths.Fit(root) == ShapeFit.Fill
      && resolver.Animating.Count == 0
  }

  func DirectionAndLogicalEdgeContract() bool {
    let defaults = Node{ Kind: NodeKind.Container }
    if defaults.Direction != Direction.Auto || defaults.TextAlign != TextAlign.Start {
      return false
    }

    let red = Color.Rgb(255, 0, 0)
    let blue = Color.Rgb(0, 0, 255)
    let ltr = Reconciler{ Res: Resolver{} }.Mount(Container{
      Direction: Direction.LeftToRight,
      Margin: Edges{ Left: 1, Right: 3 }, MarginStart: 2, MarginEnd: 4,
      Padding: Edges{ Left: 5, Right: 7 }, PaddingStart: 6, PaddingEnd: 8,
      Left: 9, Start: 10, Right: 11, End: 12,
      BorderLeftWidth: 13, BorderStartWidth: 14, BorderRightWidth: 15, BorderEndWidth: 16,
      BorderLeftColor: red, BorderStartColor: blue, BorderRightColor: red, BorderEndColor: blue,
    })
    if ltr.MarginLeft.Value != 2.0F || ltr.MarginRight.Value != 4.0F
      || ltr.PaddingLeft.Value != 6.0F || ltr.PaddingRight.Value != 8.0F
      || ltr.Left.Value != 10.0F || ltr.Right.Value != 12.0F
      || ltr.BorderLeftWidth.Value != 14.0F || ltr.BorderRightWidth.Value != 16.0F
      || !sameColor(ltr.BorderLeftColor, blue) || !sameColor(ltr.BorderRightColor, blue) {
        return false
      }

    let physicalLater = Reconciler{ Res: Resolver{} }.Mount(Container{
      Direction: Direction.LeftToRight,
      MarginStart: 2, Margin: Edges{ Left: 1 },
    })
    if physicalLater.MarginLeft.Value != 1.0F { return false }

    let rtl = Reconciler{ Res: Resolver{} }.Mount(Container{
      Direction: Direction.RightToLeft,
      Margin: Edges{ Right: 1, Left: 3 }, MarginStart: 2, MarginEnd: 4,
      Padding: Edges{ Right: 5, Left: 7 }, PaddingStart: 6, PaddingEnd: 8,
      Right: 9, Start: 10, Left: 11, End: 12,
      BorderRightWidth: 13, BorderStartWidth: 14, BorderLeftWidth: 15, BorderEndWidth: 16,
      BorderRightColor: red, BorderStartColor: blue, BorderLeftColor: red, BorderEndColor: blue,
    })
    if rtl.MarginRight.Value != 2.0F || rtl.MarginLeft.Value != 4.0F
      || rtl.PaddingRight.Value != 6.0F || rtl.PaddingLeft.Value != 8.0F
      || rtl.Right.Value != 10.0F || rtl.Left.Value != 12.0F
      || rtl.BorderRightWidth.Value != 14.0F || rtl.BorderLeftWidth.Value != 16.0F
      || !sameColor(rtl.BorderRightColor, blue) || !sameColor(rtl.BorderLeftColor, blue) {
        return false
      }

    let resolver = Resolver{}
    let root = Reconciler{ Res: resolver }.Mount(Container() {.Direction: Direction.LeftToRight,.TextAlign: TextAlign.End,
        Container{ MarginStart: 4, PaddingStart: 5, Start: 6,
        BorderStartWidth: 7, BorderStartColor: red},
    })
    let inherited = root.Children[0]
    if inherited.Direction != Direction.LeftToRight || inherited.TextAlign != TextAlign.End
      || inherited.MarginLeft.Value != 4.0F || inherited.MarginRight.Unit != LengthUnit.Unset
      || inherited.PaddingLeft.Value != 5.0F || inherited.Left.Value != 6.0F
      || inherited.BorderLeftWidth.Value != 7.0F || !sameColor(inherited.BorderLeftColor, red) {
        return false
      }

    root.BaseStyle = Style{
      Direction: Direction.RightToLeft, TextAlign: TextAlign.Start,
      Margin: Edges{ Right: 2 }, Padding: Edges{ Right: 3 }, Right: 4,
      BorderRightWidth: 5, BorderRightColor: red,
    }.Entries()
    resolver.Invalidate(root, false)
    resolver.Flush()
    if inherited.Direction != Direction.RightToLeft || inherited.TextAlign != TextAlign.Start
      || inherited.MarginLeft.Unit != LengthUnit.Unset || inherited.MarginRight.Value != 4.0F
      || inherited.PaddingLeft.Unit != LengthUnit.Unset || inherited.PaddingRight.Value != 5.0F
      || inherited.Left.Unit != LengthUnit.Unset || inherited.Right.Value != 6.0F
      || inherited.BorderLeftWidth.Unit != LengthUnit.Unset || inherited.BorderRightWidth.Value != 7.0F
      || inherited.BorderLeftColor.A != 0.0F || !sameColor(inherited.BorderRightColor, red) {
        return false
      }

    root.HoverStyle = Style{ MarginStart: 20, PaddingStart: 21, Start: 22,
      BorderStartWidth: 23, BorderStartColor: blue }.Entries()
    root.Hovered = true
    resolver.Invalidate(root, false)
    resolver.Flush()
    if root.MarginRight.Value != 20.0F || root.PaddingRight.Value != 21.0F
      || root.Right.Value != 22.0F || root.BorderRightWidth.Value != 23.0F
      || !sameColor(root.BorderRightColor, blue) {
        return false
      }
    root.Hovered = false
    resolver.Invalidate(root, false)
    resolver.Flush()
    if root.MarginRight.Value != 2.0F || root.PaddingRight.Value != 3.0F
      || root.Right.Value != 4.0F || root.BorderRightWidth.Value != 5.0F
      || !sameColor(root.BorderRightColor, red) {
        return false
      }
    root.BaseStyle = nil
    resolver.Invalidate(root, false)
    resolver.Flush()
    if root.MarginRight.Unit != LengthUnit.Unset || root.PaddingRight.Unit != LengthUnit.Unset
      || root.Right.Unit != LengthUnit.Unset || root.BorderRightWidth.Unit != LengthUnit.Unset
      || root.BorderRightColor.A != 0.0F {
        return false
      }

    let reverse = Node{ Kind: NodeKind.Container }
    let reverseResolver = Resolver{}
    reverse.BaseStyle = Style{ Direction: Direction.LeftToRight, MarginStart: 1 }.Entries()
    reverse.HoverStyle = Style{ Margin: Edges{ Left: 9 } }.Entries()
    reverseResolver.Invalidate(reverse, true)
    reverseResolver.Flush()
    reverse.Hovered = true
    reverseResolver.Invalidate(reverse, false)
    reverseResolver.Flush()
    if reverse.MarginLeft.Value != 9.0F { return false }
    reverse.Hovered = false
    reverseResolver.Invalidate(reverse, false)
    reverseResolver.Flush()
    if reverse.MarginLeft.Value != 1.0F { return false }

    let directionState = Node{ Kind: NodeKind.Container }
    let directionStateResolver = Resolver{}
    directionState.BaseStyle = Style{
      Direction: Direction.LeftToRight, MarginStart: 1,
    }.Entries()
    directionState.HoverStyle = Style{ Direction: Direction.RightToLeft }.Entries()
    directionStateResolver.Invalidate(directionState, true)
    directionStateResolver.Flush()
    if directionState.MarginLeft.Value != 1.0F
      || directionState.MarginRight.Unit != LengthUnit.Unset{
        return false
      }
    directionState.Hovered = true
    directionStateResolver.Invalidate(directionState, false)
    directionStateResolver.Flush()
    if directionState.Direction != Direction.RightToLeft
      || directionState.MarginLeft.Unit != LengthUnit.Unset
      || directionState.MarginRight.Value != 1.0F {
        return false
      }
    directionState.Hovered = false
    directionStateResolver.Invalidate(directionState, false)
    directionStateResolver.Flush()
    if directionState.Direction != Direction.LeftToRight
      || directionState.MarginLeft.Value != 1.0F
      || directionState.MarginRight.Unit != LengthUnit.Unset{
        return false
      }

    let orderedDirectionState = Node{ Kind: NodeKind.Container }
    let orderedDirectionResolver = Resolver{}
    orderedDirectionState.BaseStyle = Style{ Direction: Direction.LeftToRight }.Entries()
    orderedDirectionState.HoverStyle = Style{
      MarginStart: 9, Direction: Direction.RightToLeft,
    }.Entries()
    orderedDirectionResolver.Invalidate(orderedDirectionState, true)
    orderedDirectionResolver.Flush()
    orderedDirectionState.Hovered = true
    orderedDirectionResolver.Invalidate(orderedDirectionState, false)
    orderedDirectionResolver.Flush()
    if orderedDirectionState.Direction != Direction.RightToLeft
      || orderedDirectionState.MarginLeft.Unit != LengthUnit.Unset
      || orderedDirectionState.MarginRight.Value != 9.0F {
        return false
      }

    let snap = Node{ Kind: NodeKind.Container }
    let snapResolver = Resolver{}
    snap.TransitionMs = 100.0
    snap.BaseStyle = Style{ MarginStart: 1 }.Entries()
    snap.HoverStyle = Style{ MarginStart: 9 }.Entries()
    snapResolver.Invalidate(snap, true)
    snapResolver.Flush()
    snap.Hovered = true
    snapResolver.Invalidate(snap, false)
    snapResolver.Flush()
    if snap.MarginLeft.Value != 9.0F || snapResolver.Animating.Count != 0 { return false }

    let shape = Reconciler{ Res: Resolver{} }.Mount(Shape{
      BorderStartWidth: 9, BorderStartColor: red,
    })
    return shape.BorderLeftWidth.Unit == LengthUnit.Unset && shape.BorderRightWidth.Unit == LengthUnit.Unset
      && shape.BorderLeftColor.A == 0.0F && shape.BorderRightColor.A == 0.0F
      && rejectsInvalidLogicalEdgeDeclarations()
  }

  func ShorthandLogicalCascadeContract() bool {
    let authored = Style{ Margin: 1, Padding: 2 }
    guard let authoredEntries = authored.Entries() else { return false }
    if authoredEntries.Count != 2 || authoredEntries.At(0).Field != StyleField.Margin
      || authoredEntries.At(1).Field != StyleField.Padding{
        return false
      }

    let ltrShorthandLater = Reconciler{ Res: Resolver{} }.Mount(Container{
      Direction: Direction.LeftToRight,
      MarginStart: 1, Margin: 2,
      PaddingStart: 3, Padding: 4,
    })
    if ltrShorthandLater.MarginLeft.Value != 2.0F || ltrShorthandLater.MarginRight.Value != 2.0F
      || ltrShorthandLater.PaddingLeft.Value != 4.0F || ltrShorthandLater.PaddingRight.Value != 4.0F {
        return false
      }

    let ltrLogicalLater = Reconciler{ Res: Resolver{} }.Mount(Container{
      Direction: Direction.LeftToRight,
      Margin: 2, MarginStart: 1,
      Padding: 4, PaddingStart: 3,
    })
    if ltrLogicalLater.MarginLeft.Value != 1.0F || ltrLogicalLater.MarginRight.Value != 2.0F
      || ltrLogicalLater.PaddingLeft.Value != 3.0F || ltrLogicalLater.PaddingRight.Value != 4.0F {
        return false
      }

    let rtlShorthandLater = Reconciler{ Res: Resolver{} }.Mount(Container{
      Direction: Direction.RightToLeft,
      MarginStart: 1, Margin: 2,
      PaddingStart: 3, Padding: 4,
    })
    if rtlShorthandLater.MarginRight.Value != 2.0F || rtlShorthandLater.MarginLeft.Value != 2.0F
      || rtlShorthandLater.PaddingRight.Value != 4.0F || rtlShorthandLater.PaddingLeft.Value != 4.0F {
        return false
      }

    let rtlLogicalLater = Reconciler{ Res: Resolver{} }.Mount(Container{
      Direction: Direction.RightToLeft,
      Margin: 2, MarginStart: 1,
      Padding: 4, PaddingStart: 3,
    })
    if rtlLogicalLater.MarginRight.Value != 1.0F || rtlLogicalLater.MarginLeft.Value != 2.0F
      || rtlLogicalLater.PaddingRight.Value != 3.0F || rtlLogicalLater.PaddingLeft.Value != 4.0F {
        return false
      }

    let shorthandState = Node{ Kind: NodeKind.Container }
    let shorthandResolver = Resolver{}
    shorthandState.BaseStyle = Style{
      Direction: Direction.RightToLeft, MarginStart: 1, PaddingStart: 2,
    }.Entries()
    shorthandState.HoverStyle = Style{ Margin: 10, Padding: 20 }.Entries()
    shorthandResolver.Invalidate(shorthandState, true)
    shorthandResolver.Flush()
    shorthandState.Hovered = true
    shorthandResolver.Invalidate(shorthandState, false)
    shorthandResolver.Flush()
    if shorthandState.MarginLeft.Value != 10.0F || shorthandState.MarginRight.Value != 10.0F
      || shorthandState.PaddingLeft.Value != 20.0F || shorthandState.PaddingRight.Value != 20.0F {
        return false
      }

    let logicalState = Node{ Kind: NodeKind.Container }
    let logicalResolver = Resolver{}
    logicalState.BaseStyle = Style{
      Direction: Direction.RightToLeft, Margin: 10, Padding: 20,
    }.Entries()
    logicalState.HoverStyle = Style{ MarginStart: 1, PaddingStart: 2 }.Entries()
    logicalResolver.Invalidate(logicalState, true)
    logicalResolver.Flush()
    logicalState.Hovered = true
    logicalResolver.Invalidate(logicalState, false)
    logicalResolver.Flush()
    return logicalState.MarginRight.Value == 1.0F && logicalState.MarginLeft.Value == 10.0F
      && logicalState.PaddingRight.Value == 2.0F && logicalState.PaddingLeft.Value == 20.0F
      && logicalState.Margin.Unit == LengthUnit.Unset && logicalState.Padding.Unit == LengthUnit.Unset
  }

  func EdgesContract() bool {
    let reconciler = Reconciler{ Res: Resolver{} }
    let two = reconciler.Mount(Container{ Padding: Edges(4, 8) })
    let three = reconciler.Mount(Container{ Padding: Edges(4, 8, 12) })
    let four = reconciler.Mount(Container{ Margin: Edges(-1, 2, -3, 4) })
    let uniformOverride = reconciler.Mount(Container{ Padding: Edges(4){.Top: 6} })
    let percent = reconciler.Mount(Container{ Padding: Length.Percent(10) })
    let edgeValue = Edges(4){.Top: 6}
    let partial = reconciler.Mount(Container{
      BasedOn: Style{ Padding: 5 },
      Padding: Edges{ Left: Length.Percent(10) },
    })
    var invalidPadding = false
    var invalidMargin = false
    try { let ignored = Style{ Padding: Edges{ Bottom: -1 } } }
    catch (error ArgumentException) { invalidPadding = true }
    try { let ignored = Style{ Margin: Edges(Length.Auto, 2) } }
    catch (error ArgumentException) { invalidMargin = true }
    return two.PaddingTop.Value == 4.0F && two.PaddingRight.Value == 8.0F
      && two.PaddingBottom.Value == 4.0F && two.PaddingLeft.Value == 8.0F
      && three.PaddingTop.Value == 4.0F && three.PaddingRight.Value == 8.0F
      && three.PaddingBottom.Value == 12.0F && three.PaddingLeft.Value == 8.0F
      && four.MarginTop.Value == -1.0F && four.MarginRight.Value == 2.0F
      && four.MarginBottom.Value == -3.0F && four.MarginLeft.Value == 4.0F
      && uniformOverride.PaddingTop.Value == 6.0F
      && uniformOverride.PaddingRight.Value == 4.0F
      && edgeValue.Top.Value == 6.0F && edgeValue.Right.Value == 4.0F
      && percent.PaddingTop.IsPercent && percent.PaddingLeft.Value == 10.0F
      && partial.PaddingTop.Value == 5.0F && partial.PaddingRight.Value == 5.0F
      && partial.PaddingBottom.Value == 5.0F && partial.PaddingLeft.IsPercent
      && partial.PaddingLeft.Value == 10.0F && invalidPadding && invalidMargin
  }

  func DeclarationInlineSpillOrderContract() bool {
    let declaration = Style{}
    declaration.pushLength(StyleField.Width, Length{ Unit: LengthUnit.Px, Value: 10 })
    declaration.pushLength(StyleField.Height, Length{ Unit: LengthUnit.Px, Value: 20 })
    declaration.pushLength(StyleField.Width, Length{ Unit: LengthUnit.Px, Value: 30 })
    declaration.pushLength(StyleField.Gap, Length{ Unit: LengthUnit.Px, Value: 4 })
    declaration.pushLength(StyleField.Width, Length{ Unit: LengthUnit.Px, Value: 50 })
    guard let entries = declaration.Entries() else { return false }
    if entries.Count != 5 || entries.At(0).Field != StyleField.Width
      || entries.At(1).Field != StyleField.Height || entries.At(2).Field != StyleField.Width
      || entries.At(3).Field != StyleField.Gap || entries.At(4).Field != StyleField.Width{
        return false
      }
    let n = Node{ Kind: NodeKind.Container }
    n.BaseStyle = entries
    let resolver = Resolver{}
    resolver.Invalidate(n, true)
    resolver.Flush()
    return n.Width.Value == 50.0F && n.Height.Value == 20.0F && n.Gap.Value == 4.0F
  }

  func OrderedCompositionAndGradientClearContract() bool {
    let red = Color.Rgb(255, 0, 0)
    let gradient = LinearGradient(Color.Black, Color.White)
    let baseStyle = Style{
      Padding: Edges(4){.Left: 6},
      BackgroundColor: red,
      BackgroundGradient: gradient,
    }
    let baseLater = Container{ Padding: Edges{ Left: 9 }, BasedOn: baseStyle }
    let derivedStyle = Style{
      BasedOn: baseStyle,
      Padding: Edges{ Left: 9 },
      BackgroundGradient: nil,
    }
    let localLater = Container{ BasedOn: derivedStyle, Padding: Edges{ Top: 8 } }
    baseStyle.pushLength(StyleField.PaddingLeft,
      Length{ Unit: LengthUnit.Px, Value: 99 })

    let reconciler = Reconciler{ Res: Resolver{} }
    let baseLaterNode = reconciler.Mount(baseLater)
    let localLaterNode = reconciler.Mount(localLater)
    if baseLaterNode.PaddingLeft.Value != 6.0F
      || localLaterNode.PaddingLeft.Value != 9.0F
      || localLaterNode.PaddingTop.Value != 8.0F
      || !sameColor(localLaterNode.BackgroundColor, red)
      || localLaterNode.BackgroundGradient != nil {
        return false
      }

    let resolver = Resolver{}
    let stateNode = Reconciler{ Res: resolver }.Mount(Container{
      BasedOn: baseStyle,
      Hover: Style{ BackgroundGradient: nil },
    })
    if stateNode.BackgroundGradient == nil { return false }
    stateNode.Hovered = true
    resolver.Invalidate(stateNode, false)
    resolver.Flush()
    if stateNode.BackgroundGradient != nil { return false }
    stateNode.Hovered = false
    resolver.Invalidate(stateNode, false)
    resolver.Flush()
    return stateNode.BackgroundGradient != nil
  }

  func StateStyleRetentionAndEqualityContract() bool {
    let resolver = Resolver{}
    let reconciler = Reconciler{ Res: resolver }
    let node = reconciler.Mount(Container{ Hover: Style{ Opacity: 0.25 } })
    guard let retained = node.HoverStyle else { return false }
    reconciler.Diff(node, Container{ Hover: Style{ Opacity: 0.25 } })
    if node.HoverStyle != retained { return false }
    node.Hovered = true
    resolver.Invalidate(node, false)
    resolver.Flush()
    if node.Opacity != 0.25 { return false }
    reconciler.Diff(node, Container{ Hover: Style{ Opacity: 0.5 } })
    return node.HoverStyle != retained && node.Opacity == 0.5
  }

  func BoxShadowPrecedenceCopyAndResetContract() bool {
    let red = Color.Rgb(255, 0, 0)
    let blue = Color.Rgb(0, 0, 255)
    let source = []BoxShadow{
      BoxShadow{ OffsetX: 3, Color: red },
      BoxShadow{ Inset: true, Spread: 2, Color: blue },
    }
    let copiedStyle = Style{ BoxShadows: source }
    source[0] = BoxShadow{ OffsetX: 99, Color: blue }
    let copied = Node{ Kind: NodeKind.Container }
    copied.BaseStyle = copiedStyle.Entries()
    let copiedResolver = Resolver{}
    copiedResolver.Invalidate(copied, true)
    copiedResolver.Flush()
    if boxShadowCount(copied.BoxShadows) != 2
      || boxShadowAt(copied.BoxShadows, 0).OffsetX.Value != 3.0F
      || !boxShadowAt(copied.BoxShadows, 1).Inset{
        return false
      }

    let singularThenPlural = Reconciler{ Res: Resolver{} }.Mount(Container{
      BoxShadow: BoxShadow{ OffsetX: 1, Color: red },
      BoxShadows: []BoxShadow{ BoxShadow{ OffsetX: 4, Color: blue } },
    })
    if boxShadowCount(singularThenPlural.BoxShadows) != 1
      || boxShadowAt(singularThenPlural.BoxShadows, 0).OffsetX.Value != 4.0F {
        return false
      }
    let pluralThenSingular = Reconciler{ Res: Resolver{} }.Mount(Container{
      BoxShadows: []BoxShadow{ BoxShadow{ OffsetX: 4, Color: blue } },
      BoxShadow: BoxShadow{ OffsetX: 1, Color: red },
    })
    if boxShadowAt(pluralThenSingular.BoxShadows, 0).OffsetX.Value != 1.0F {
      return false
    }

    let n = Node{ Kind: NodeKind.Container }
    let resolver = Resolver{}
    n.BaseStyle = Style{ BoxShadow: BoxShadow{ Color: red } }.Entries()
    n.HoverStyle = Style{ BoxShadows: []BoxShadow{} }.Entries()
    resolver.Invalidate(n, true)
    resolver.Flush()
    n.Hovered = true
    resolver.Invalidate(n, false)
    resolver.Flush()
    if boxShadowCount(n.BoxShadows) != 0 { return false }
    n.Hovered = false
    resolver.Invalidate(n, false)
    resolver.Flush()
    if boxShadowCount(n.BoxShadows) != 1 { return false }
    n.BaseStyle = nil
    resolver.Invalidate(n, false)
    resolver.Flush()
    return n.BoxShadows == nil
  }

  func TextShadowValueValidationContract() bool {
    let red = Color.Rgb(255, 0, 0)
    let value = TextShadow{ OffsetX: -4, OffsetY: 5, Blur: -6, Color: red }
    if value.OffsetX.Magnitude != -4.0 || value.OffsetY.Magnitude != 5.0
      || value.Blur.Magnitude != 0.0 || !sameColor(value.Color, red) {
        return false
      }
    let zero = TextShadow{}
    if !zero.OffsetX.HasMagnitude || zero.OffsetX.Magnitude != 0.0
      || !zero.OffsetY.HasMagnitude || zero.OffsetY.Magnitude != 0.0
      || !zero.Blur.HasMagnitude || zero.Blur.Magnitude != 0.0
      || zero.Color.A != 0.0F {
        return false
      }

    var percentOffset = false
    var autoBlur = false
    var invalidNumber = false
    try { let ignored = TextShadow{ OffsetX: Length.Percent(10) } }
    catch (error ArgumentException) { percentOffset = true }
    try { let ignored = TextShadow{ Blur: Length.Auto } }
    catch (error ArgumentException) { autoBlur = true }
    try {
      let ignored = TextShadow{
        OffsetY: Length{ Unit: LengthUnit.Px, Value: float32(Double.PositiveInfinity) },
      }
    } catch (error ArgumentException) { invalidNumber = true }
    return percentOffset && autoBlur && invalidNumber
  }

  func TextShadowResolutionStorageAndDiffContract() bool {
    let red = Color.Rgb(255, 0, 0)
    let blue = Color.Rgb(0, 0, 255)
    let source = []TextShadow{
      TextShadow{ OffsetX: 3, OffsetY: 2, Color: red },
      TextShadow{ OffsetX: 99, Color: Color.Transparent },
    }
    let copiedStyle = Style{ TextShadows: source }
    source[0] = TextShadow{ OffsetX: 40, Color: blue }
    let copied = Node{ Kind: NodeKind.Text, Content: "copy" }
    copied.BaseStyle = copiedStyle.Entries()
    let copiedResolver = Resolver{}
    copiedResolver.Invalidate(copied, true)
    copiedResolver.Flush()
    if !copied.HasTextShadowState || textShadowCount(copied.TextShadows) != 1
      || textShadowAt(copied.TextShadows, 0).OffsetX.Magnitude != 3.0
      || !sameColor(textShadowAt(copied.TextShadows, 0).Color, red) {
        return false
      }

    let transparent = Reconciler{ Res: Resolver{} }.Mount(Text{
      Content: "zero",
      TextShadow: TextShadow{ OffsetX: 12, Blur: 8, Color: Color.Transparent },
    })
    if transparent.HasTextShadowState || textShadowCount(transparent.TextShadows) != 0 {
      return false
    }

    let singularThenPlural = Reconciler{ Res: Resolver{} }.Mount(Text{
      Content: "order",
      TextShadow: TextShadow{ OffsetX: 1, Color: red },
      TextShadows: []TextShadow{ TextShadow{ OffsetX: 4, Color: blue } },
    })
    let pluralThenSingular = Reconciler{ Res: Resolver{} }.Mount(Text{
      Content: "order",
      TextShadows: []TextShadow{ TextShadow{ OffsetX: 4, Color: blue } },
      TextShadow: TextShadow{ OffsetX: 1, Color: red },
    })
    if textShadowAt(singularThenPlural.TextShadows, 0).OffsetX.Magnitude != 4.0
      || textShadowAt(pluralThenSingular.TextShadows, 0).OffsetX.Magnitude != 1.0 {
        return false
      }

    let resolver = Resolver{}
    let root = Reconciler{ Res: resolver }.Mount(Container() {.TextShadows: []TextShadow{
        TextShadow{ OffsetX: 2, Color: red },
        TextShadow{ OffsetY: 3, Blur: 4, Color: blue },
      },.TransitionMs: 100.0,.Hover: Style{ TextShadow: TextShadow{ OffsetX: 8, Color: blue } },
        Text{ Content: "inherited" },
        TextEntry{ Value: "entry" },
        Container() {.TextShadows: []TextShadow{}, Text{ Content: "cleared"},
      },
    })
    let inherited = root.Children[0]
    let entry = root.Children[1]
    let cleared = root.Children[2]
    let clearedText = cleared.Children[0]
    if textShadowCount(inherited.TextShadows) != 2 || textShadowCount(entry.TextShadows) != 2
      || textShadowCount(cleared.TextShadows) != 0 || textShadowCount(clearedText.TextShadows) != 0
      || !inherited.HasTextShadowState || !entry.HasTextShadowState
      || cleared.HasTextShadowState || clearedText.HasTextShadowState{
        return false
      }
    let retainedLayout = TextLayouts.For(inherited, 100.0F)
    root.Hovered = true
    resolver.Invalidate(root, false)
    resolver.Flush()
    if textShadowCount(inherited.TextShadows) != 1
      || textShadowAt(inherited.TextShadows, 0).OffsetX.Magnitude != 8.0
      || textShadowCount(entry.TextShadows) != 1
      || TextLayouts.For(inherited, 100.0F) != retainedLayout
      || resolver.Animating.Count != 0
      || resolver.FlushEffects() != ReconcileEffects.Paint{
        return false
      }

    root.Hovered = false
    root.BaseStyle = nil
    resolver.Invalidate(root, false)
    resolver.Flush()
    if root.HasTextShadowState || inherited.HasTextShadowState || entry.HasTextShadowState
      || textShadowCount(root.TextShadows) != 0 || textShadowCount(inherited.TextShadows) != 0 {
        return false
      }

    let reconciler = Reconciler{ Res: Resolver{} }
    var textNode = reconciler.Mount(Text{
      Content: "diff", TextShadow: TextShadow{ Color: red },
    })
    textNode = reconciler.Diff(textNode, Text{
      Content: "diff", TextShadow: TextShadow{ Color: blue },
    })
    if !sameColor(textShadowAt(textNode.TextShadows, 0).Color, blue) { return false }

    var boxNode = reconciler.Mount(Container{ BoxShadow: BoxShadow{ Color: red } })
    boxNode = reconciler.Diff(boxNode, Container{ BoxShadow: BoxShadow{ Color: blue } })
    return sameColor(boxShadowAt(boxNode.BoxShadows, 0).Color, blue)
  }

  func TextStrokeResolutionStorageAndDiffContract() bool {
    let red = Color.Rgb(255, 0, 0)
    let blue = Color.Rgb(0, 0, 255)
    let defaults = Node{ Kind: NodeKind.Text }
    if defaults.HasTextStrokeState || defaults.TextStrokeWidth.Unit != LengthUnit.Unset
      || !sameColor(defaults.TextStrokeColor, Color.Transparent) {
        return false
      }

    let zero = Reconciler{ Res: Resolver{} }.Mount(Text{
      Content: "zero", TextStrokeWidth: 0, TextStrokeColor: Color.Transparent,
    })
    if zero.HasTextStrokeState || TextStroking.Visible(zero) != nil { return false }

    let resolver = Resolver{}
    let root = Reconciler{ Res: resolver }.Mount(Container() {.TextStrokeWidth: 2,.TextStrokeColor: red,.TransitionMs: 100.0,.Hover: Style{ TextStrokeWidth: 4, TextStrokeColor: blue },
        Text{ Content: "inherited" },
        TextEntry{ Value: "entry" },
        Text{ Content: "width-clear", TextStrokeWidth: 0 },
        Container() {.TextStrokeColor: Color.Transparent, Text{ Content: "color-clear"},
      },
    })
    resolver.FlushEffects()
    let inherited = root.Children[0]
    let entry = root.Children[1]
    let widthClear = root.Children[2]
    let colorClear = root.Children[3]
    let colorClearText = colorClear.Children[0]
    let retained = TextLayouts.For(inherited, 100.0F)
    if TextStroking.Visible(root) == nil || TextStroking.Visible(inherited) == nil
      || TextStroking.Visible(entry) == nil || TextStroking.Visible(widthClear) != nil
      || TextStroking.Visible(colorClear) != nil || TextStroking.Visible(colorClearText) != nil {
        return false
      }

    root.Hovered = true
    resolver.Invalidate(root, false)
    resolver.Flush()
    if inherited.TextStrokeWidth.Value != 4.0F || entry.TextStrokeWidth.Value != 4.0F
      || !sameColor(inherited.TextStrokeColor, blue)
      || TextStroking.Visible(widthClear) != nil || TextStroking.Visible(colorClearText) != nil
      || TextLayouts.For(inherited, 100.0F) != retained || resolver.Animating.Count != 0
      || resolver.FlushEffects() != ReconcileEffects.Paint{
        return false
      }

    root.Hovered = false
    root.BaseStyle = nil
    resolver.Invalidate(root, false)
    resolver.Flush()
    if root.HasTextStrokeState || inherited.HasTextStrokeState || entry.HasTextStrokeState
      || widthClear.HasTextStrokeState || colorClear.HasTextStrokeState
      || colorClearText.HasTextStrokeState || TextLayouts.For(inherited, 100.0F) != retained{
        return false
      }

    let reconciler = Reconciler{ Res: Resolver{} }
    var textNode = reconciler.Mount(Text{
      Content: "diff", TextStrokeWidth: 2, TextStrokeColor: red,
    })
    textNode = reconciler.Diff(textNode, Text{
      Content: "diff", TextStrokeWidth: 3, TextStrokeColor: blue,
    })
    guard let changed = TextStroking.Visible(textNode) else { return false }
    return changed.Width.Value == 3.0F && sameColor(changed.Color, blue)
  }

  func ResolvePrecedenceAndResetContract() bool {
    let n = Node{ Kind: NodeKind.Container }
    let resolver = Resolver{}
    n.BaseStyle = Style{ Opacity: 0.1, Width: 100 }.Entries()
    n.HoverStyle = Style{ Opacity: 0.4, BorderWidth: 2 }.Entries()
    n.FocusStyle = Style{ Opacity: 0.7 }.Entries()
    n.ActiveStyle = Style{ Opacity: 0.9 }.Entries()
    resolver.Invalidate(n, true)
    resolver.Flush()
    if !near(n.Opacity, 0.1) { return false }
    n.Hovered = true
    resolver.Invalidate(n, false)
    resolver.Flush()
    if !near(n.Opacity, 0.4) || n.BorderLeftWidth.Value != 2.0F { return false }
    n.Focused = true
    resolver.Invalidate(n, false)
    resolver.Flush()
    if !near(n.Opacity, 0.7) { return false }
    n.Pressed = true
    resolver.Invalidate(n, false)
    resolver.Flush()
    if !near(n.Opacity, 0.9) { return false }
    n.Pressed = false
    n.Focused = false
    n.Hovered = false
    resolver.Invalidate(n, false)
    resolver.Flush()
    if !near(n.Opacity, 0.1) || n.BorderLeftWidth.Unit != LengthUnit.Unset { return false }
    n.BaseStyle = Style{ Width: 100 }.Entries()
    resolver.Invalidate(n, false)
    resolver.Flush()
    return n.Width.Value == 100.0F && n.Opacity == 1.0
  }

  func AxisOverflowPrecedenceAndResetContract() bool {
    let shorthandThenAxis = Reconciler{ Res: Resolver{} }.Mount(Container{
      Overflow: Overflow.Scroll,
      OverflowX: Overflow.Hidden,
    })
    if shorthandThenAxis.OverflowX != Overflow.Hidden
      || shorthandThenAxis.OverflowY != Overflow.Scroll{
        return false
      }

    let axisThenShorthand = Reconciler{ Res: Resolver{} }.Mount(Container{
      OverflowX: Overflow.Hidden,
      Overflow: Overflow.Scroll,
    })
    if axisThenShorthand.OverflowX != Overflow.Scroll
      || axisThenShorthand.OverflowY != Overflow.Scroll{
        return false
      }

    let n = Node{ Kind: NodeKind.Container }
    let resolver = Resolver{}
    n.BaseStyle = Style{ Overflow: Overflow.Scroll, OverflowX: Overflow.Hidden }.Entries()
    n.HoverStyle = Style{ OverflowY: Overflow.Hidden }.Entries()
    resolver.Invalidate(n, true)
    resolver.Flush()
    if n.OverflowX != Overflow.Hidden || n.OverflowY != Overflow.Scroll { return false }
    n.Hovered = true
    resolver.Invalidate(n, false)
    resolver.Flush()
    if n.OverflowX != Overflow.Hidden || n.OverflowY != Overflow.Hidden { return false }
    n.Hovered = false
    resolver.Invalidate(n, false)
    resolver.Flush()
    if n.OverflowX != Overflow.Hidden || n.OverflowY != Overflow.Scroll { return false }
    n.BaseStyle = Style{ OverflowX: Overflow.Scroll }.Entries()
    resolver.Invalidate(n, false)
    resolver.Flush()
    return n.OverflowX == Overflow.Scroll && n.OverflowY == Overflow.Visible
  }

  func BorderEdgePrecedenceResetAndMaskContract() bool {
    let red = Color.Rgb(255, 0, 0)
    let green = Color.Rgb(0, 255, 0)
    let blue = Color.Rgb(0, 0, 255)
    let shorthandThenEdge = Reconciler{ Res: Resolver{} }.Mount(Container{
      BorderWidth: 2,
      BorderLeftWidth: 5,
      BorderColor: red,
      BorderTopColor: green,
    })
    if shorthandThenEdge.BorderLeftWidth.Value != 5.0F
      || shorthandThenEdge.BorderTopWidth.Value != 2.0F
      || shorthandThenEdge.BorderRightWidth.Value != 2.0F
      || shorthandThenEdge.BorderBottomWidth.Value != 2.0F
      || !sameColor(shorthandThenEdge.BorderLeftColor, red)
      || !sameColor(shorthandThenEdge.BorderTopColor, green)
      || !sameColor(shorthandThenEdge.BorderRightColor, red)
      || !sameColor(shorthandThenEdge.BorderBottomColor, red) {
        return false
      }

    let edgeThenShorthand = Reconciler{ Res: Resolver{} }.Mount(Container{
      BorderLeftWidth: 5,
      BorderWidth: 2,
      BorderTopColor: green,
      BorderColor: red,
    })
    if edgeThenShorthand.BorderLeftWidth.Value != 2.0F
      || !sameColor(edgeThenShorthand.BorderTopColor, red) {
        return false
      }

    let n = Node{ Kind: NodeKind.Container }
    let resolver = Resolver{}
    n.BaseStyle = Style{ BorderWidth: 1, BorderColor: red }.Entries()
    n.HoverStyle = Style{ BorderRightWidth: 4, BorderRightColor: blue }.Entries()
    resolver.Invalidate(n, true)
    resolver.Flush()
    n.Hovered = true
    resolver.Invalidate(n, false)
    resolver.Flush()
    if n.BorderRightWidth.Value != 4.0F || !sameColor(n.BorderRightColor, blue)
      || n.BorderLeftWidth.Value != 1.0F || !sameColor(n.BorderLeftColor, red) {
        return false
      }
    n.Hovered = false
    resolver.Invalidate(n, false)
    resolver.Flush()
    if n.BorderRightWidth.Value != 1.0F || !sameColor(n.BorderRightColor, red) {
      return false
    }

    let high = Node{ Kind: NodeKind.Container }
    let highResolver = Resolver{}
    high.BaseStyle = Style{
      TextAlign: TextAlign.Center,
      BackgroundGradient: LinearGradient(Color.Black, Color.White),
    }.Entries()
    highResolver.Invalidate(high, true)
    highResolver.Flush()
    if high.TextAlign != TextAlign.Center || high.BackgroundGradient == nil {
      return false
    }
    high.BaseStyle = nil
    highResolver.Invalidate(high, false)
    highResolver.Flush()
    return high.TextAlign == TextAlign.Start && high.BackgroundGradient == nil
  }

  func ShapeStrokeShorthandResolutionContract() bool {
    let red = Color.Rgb(255, 0, 0)
    let blue = Color.Rgb(0, 0, 255)
    let n = Node{ Kind: NodeKind.Shape }
    let resolver = Resolver{}
    n.BaseStyle = Style{ BorderWidth: 2, BorderColor: red }.Entries()
    n.HoverStyle = Style{ BorderWidth: 6, BorderColor: blue }.Entries()
    resolver.Invalidate(n, true)
    resolver.Flush()
    if n.BorderLeftWidth.Value != 2.0F || !sameColor(n.BorderLeftColor, red) {
      return false
    }
    n.Hovered = true
    resolver.Invalidate(n, false)
    resolver.Flush()
    if n.BorderLeftWidth.Value != 6.0F || !sameColor(n.BorderLeftColor, blue) {
      return false
    }
    n.Hovered = false
    resolver.Invalidate(n, false)
    resolver.Flush()
    if n.BorderLeftWidth.Value != 2.0F || !sameColor(n.BorderLeftColor, red) {
      return false
    }
    resolver.FlushEffects()

    n.HoverStyle = Style{
      BorderLeftWidth: 10, BorderTopWidth: 11,
      BorderRightWidth: 12, BorderBottomWidth: 13,
      BorderLeftColor: blue, BorderTopColor: blue,
      BorderRightColor: blue, BorderBottomColor: blue,
    }.Entries()
    n.Hovered = true
    resolver.Invalidate(n, false)
    resolver.Flush()
    if n.BorderLeftWidth.Value != 2.0F || !sameColor(n.BorderLeftColor, red) {
      return false
    }

    n.Hovered = false
    n.BaseStyle = nil
    resolver.Invalidate(n, false)
    resolver.Flush()
    return n.BorderLeftWidth.Unit == LengthUnit.Unset && n.BorderLeftColor.A == 0.0F
  }

  func ShapeStrokeTransitionContract() bool {
    let red = Color.Rgb(255, 0, 0)
    let blue = Color.Rgb(0, 0, 255)
    let n = Node{ Kind: NodeKind.Shape }
    let resolver = Resolver{}
    n.TransitionMs = 100.0
    n.TransitionEasing = Easing.Linear
    n.TransitionSelection = makeTransitionSelection([]TransitionProperty{
      TransitionProperty.BorderWidth,
      TransitionProperty.BorderColor,
    })
    n.BaseStyle = Style{ BorderWidth: 2, BorderColor: red }.Entries()
    n.HoverStyle = Style{ BorderWidth: 6, BorderColor: blue }.Entries()
    resolver.Invalidate(n, true)
    resolver.Flush()
    n.Hovered = true
    resolver.Invalidate(n, false)
    resolver.Flush()
    resolver.Advance(0.05)
    if n.BorderLeftWidth.Value != 4.0F || n.BorderLeftColor.R < 0.49F
      || n.BorderLeftColor.R > 0.51F || n.BorderLeftColor.B < 0.49F
      || n.BorderLeftColor.B > 0.51F || resolver.Animating.Count != 1 {
        return false
      }
    resolver.Advance(0.06)
    return n.BorderLeftWidth.Value == 6.0F && sameColor(n.BorderLeftColor, blue)
      && resolver.Animating.Count == 0
  }

  func TypographyInheritanceContract() bool {
    let resolver = Resolver{}
    let root = Reconciler{ Res: resolver }.Mount(Container() {.Color: Color.Rgb(255, 0, 0),.FontFamily: "base",.TextAlign: TextAlign.Right,.Hover: Style{
        Color: Color.Rgb(0, 255, 0), FontFamily: "hover", TextAlign: TextAlign.Center,
      },
        Text{ Content: "inherited" },
        Text{ Content: "local", Color: Color.Rgb(0, 0, 255)},
    })
    let inherited = root.Children[0]
    let local = root.Children[1]
    if inherited.FontFamily != "base" || inherited.TextAlign != TextAlign.Right
      || !sameColor(inherited.Color, Color.Rgb(255, 0, 0))
      || local.FontFamily != "base" || !sameColor(local.Color, Color.Rgb(0, 0, 255)) {
        return false
      }
    root.Hovered = true
    resolver.Invalidate(root, false)
    resolver.Flush()
    return inherited.FontFamily == "hover" && inherited.TextAlign == TextAlign.Center
      && sameColor(inherited.Color, Color.Rgb(0, 255, 0))
      && local.FontFamily == "hover" && sameColor(local.Color, Color.Rgb(0, 0, 255))
  }

  func TextTransformInheritanceStateAndCacheContract() bool {
    let defaults = Node{ Kind: NodeKind.Text }
    if defaults.TextTransform != TextTransform.None { return false }

    let resolver = Resolver{}
    let root = Reconciler{ Res: resolver }.Mount(Container() {.TextTransform: TextTransform.Uppercase,.TransitionMs: 100.0,.Hover: Style{ TextTransform: TextTransform.Lowercase },
        Text{ Content: "i I" },
        Text{ Content: "local", TextTransform: TextTransform.None },
        TextEntry{ Value: "entry"},
    })
    let inherited = root.Children[0]
    let local = root.Children[1]
    let entry = root.Children[2]
    let retained = TextLayouts.For(inherited, 100.0F)
    if inherited.TextTransform != TextTransform.Uppercase
      || local.TextTransform != TextTransform.None
      || entry.TextTransform != TextTransform.Uppercase{
        return false
      }

    root.Hovered = true
    resolver.Invalidate(root, false)
    resolver.Flush()
    if root.TextTransform != TextTransform.Lowercase
      || inherited.TextTransform != TextTransform.Lowercase
      || local.TextTransform != TextTransform.None
      || entry.TextTransform != TextTransform.Lowercase
      || TextLayouts.For(inherited, 100.0F) == retained{
        return false
      }

    root.Hovered = false
    root.BaseStyle = nil
    resolver.Invalidate(root, false)
    resolver.Flush()
    return root.TextTransform == TextTransform.None
      && inherited.TextTransform == TextTransform.None
      && local.TextTransform == TextTransform.None
      && entry.TextTransform == TextTransform.None
  }

  func TextWrapAndTrimmingStateInheritanceContract() bool {
    let defaults = Node{ Kind: NodeKind.Text }
    if defaults.TextWrap != TextWrap.Wrap || defaults.TextTrimming != TextTrimming.None {
      return false
    }

    let resolver = Resolver{}
    let root = Reconciler{ Res: resolver }.Mount(Container() {.TextWrap: TextWrap.NoWrap,.TextTrimming: TextTrimming.Ellipsis,.TransitionMs: 100.0,.Hover: Style{ TextWrap: TextWrap.Wrap, TextTrimming: TextTrimming.None },
        Text{ Content: "inherited" },
        Text{ Content: "local", TextWrap: TextWrap.Wrap, TextTrimming: TextTrimming.Ellipsis},
    })
    let inherited = root.Children[0]
    let local = root.Children[1]
    if inherited.TextWrap != TextWrap.NoWrap || inherited.TextTrimming != TextTrimming.None
      || local.TextWrap != TextWrap.Wrap || local.TextTrimming != TextTrimming.Ellipsis{
        return false
      }

    root.Hovered = true
    resolver.Invalidate(root, false)
    resolver.Flush()
    if root.TextWrap != TextWrap.Wrap || root.TextTrimming != TextTrimming.None
      || inherited.TextWrap != TextWrap.Wrap || inherited.TextTrimming != TextTrimming.None
      || local.TextWrap != TextWrap.Wrap || local.TextTrimming != TextTrimming.Ellipsis{
        return false
      }

    root.Hovered = false
    resolver.Invalidate(root, false)
    resolver.Flush()
    if root.TextWrap != TextWrap.NoWrap || root.TextTrimming != TextTrimming.Ellipsis
      || inherited.TextWrap != TextWrap.NoWrap || inherited.TextTrimming != TextTrimming.None{
        return false
      }

    root.BaseStyle = nil
    resolver.Invalidate(root, false)
    resolver.Flush()
    return !(root.TextWrap != TextWrap.Wrap || root.TextTrimming != TextTrimming.None
      || inherited.TextWrap != TextWrap.Wrap || inherited.TextTrimming != TextTrimming.None
      || local.TextWrap != TextWrap.Wrap || local.TextTrimming != TextTrimming.Ellipsis)
  }

  func TextMaxLinesResolutionStateAndCacheContract() bool {
    let defaults = Node{ Kind: NodeKind.Text }
    if defaults.TextMaxLines != 0 { return false }

    let parent = Reconciler{ Res: Resolver{} }.Mount(Container() {.TextMaxLines: 1, Text{ Content: "one\ntwo"},
    })
    if parent.TextMaxLines != 1 || parent.Children[0].TextMaxLines != 0 {
      return false
    }

    let resolver = Resolver{}
    let n = Reconciler{ Res: resolver }.Mount(Text{
      Content: "one\ntwo\nthree",
      TextMaxLines: 1,
      TransitionMs: 100.0,
      Hover: Style{ TextMaxLines: 2 },
    })
    resolver.FlushEffects()
    let retained = TextLayouts.For(n, 100.0F)
    if n.TextMaxLines != 1 || retained.Lines.Count != 1 || !retained.Clamped {
      return false
    }

    n.Hovered = true
    resolver.Invalidate(n, false)
    resolver.Flush()
    let expanded = TextLayouts.For(n, 100.0F)
    if n.TextMaxLines != 2 || expanded == retained || expanded.Lines.Count != 2
      || !expanded.Clamped{
        return false
      }

    n.Hovered = false
    n.BaseStyle = nil
    resolver.Invalidate(n, false)
    resolver.Flush()
    let unlimited = TextLayouts.For(n, 100.0F)
    return n.TextMaxLines == 0 && unlimited != expanded && unlimited.Lines.Count == 3
      && !unlimited.Clamped
  }

  func OutlineStateResetTransitionAndStorageContract() bool {
    let defaults = Node{ Kind: NodeKind.Container }
    if defaults.HasOutlineState || defaults.OutlineWidth.Unit != LengthUnit.Unset
      || defaults.OutlineOffset.Unit != LengthUnit.Unset
      || !sameColor(defaults.OutlineColor, Color.Transparent) {
        return false
      }

    let resolver = Resolver{}
    let root = Reconciler{ Res: resolver }.Mount(Container() {.OutlineWidth: 2,.OutlineColor: Color.Rgb(255, 0, 0),.OutlineOffset: 1,.TransitionMs: 100.0,.Focus: Style{
        OutlineWidth: 4,
        OutlineColor: Color.Rgb(0, 0, 255),
        OutlineOffset: -2,
      },
        Container{},
    })
    let child = root.Children[0]
    if !root.HasOutlineState || root.OutlineWidth.Value != 2.0F
      || root.OutlineOffset.Value != 1.0F
      || !sameColor(root.OutlineColor, Color.Rgb(255, 0, 0))
      || child.HasOutlineState{
        return false
      }

    root.Focused = true
    resolver.Invalidate(root, false)
    resolver.Flush()
    if root.OutlineWidth.Value != 4.0F || root.OutlineOffset.Value != -2.0F
      || !sameColor(root.OutlineColor, Color.Rgb(0, 0, 255))
      || resolver.Animating.Count != 0 {
        return false
      }

    root.Focused = false
    resolver.Invalidate(root, false)
    resolver.Flush()
    if root.OutlineWidth.Value != 2.0F || root.OutlineOffset.Value != 1.0F
      || resolver.Animating.Count != 0 {
        return false
      }

    root.BaseStyle = nil
    resolver.Invalidate(root, false)
    resolver.Flush()
    return !(root.HasOutlineState || root.OutlineWidth.Unit != LengthUnit.Unset
      || root.OutlineOffset.Unit != LengthUnit.Unset
      || !sameColor(root.OutlineColor, Color.Transparent))
  }

  func VisibilityStateResetTransitionAndStorageContract() bool {
    let defaults = Node{ Kind: NodeKind.Container }
    if defaults.Visibility != Visibility.Visible { return false }

    let combined = Node{ Kind: NodeKind.Container }
    combined.Display = Display.None
    combined.Visibility = Visibility.Hidden
    combined.Display = Display.Flex
    if combined.Display != Display.Flex || combined.Visibility != Visibility.Hidden
      || !combined.PaintInputHidden{
        return false
      }
    combined.Visibility = Visibility.Visible
    if combined.PaintInputHidden { return false }

    let resolver = Resolver{}
    let root = Reconciler{ Res: resolver }.Mount(Container() {.Visibility: Visibility.Visible,.TransitionMs: 100.0,.Hover: Style{ Visibility: Visibility.Hidden },
        Container{},
    })
    let child = root.Children[0]
    if root.Visibility != Visibility.Visible || child.Visibility != Visibility.Visible {
      return false
    }

    root.Hovered = true
    resolver.Invalidate(root, false)
    resolver.Flush()
    if root.Visibility != Visibility.Hidden || child.Visibility != Visibility.Visible
      || resolver.Animating.Count != 0 || canReceiveInput(child) {
        return false
      }

    root.Hovered = false
    resolver.Invalidate(root, false)
    resolver.Flush()
    if root.Visibility != Visibility.Visible || resolver.Animating.Count != 0 { return false }

    root.BaseStyle = nil
    resolver.Invalidate(root, false)
    resolver.Flush()
    return root.Visibility == Visibility.Visible
  }

  func TextDecorationInheritanceStateAndStorageContract() bool {
    let defaults = Node{ Kind: NodeKind.Text }
    if defaults.TextDecoration != TextDecoration.None || defaults.PaintInputHidden {
      return false
    }

    let resolver = Resolver{}
    let root = Reconciler{ Res: resolver }.Mount(Container() {.TextDecoration: TextDecoration.Underline,.TransitionMs: 100.0,.Hover: Style{ TextDecoration: TextDecoration.LineThrough },
        Text{ Content: "inherited" },
        TextEntry{ Value: "entry" },
        Text{ Content: "clear", TextDecoration: TextDecoration.None},
    })
    let inherited = root.Children[0]
    let entry = root.Children[1]
    let cleared = root.Children[2]
    let retained = TextLayouts.For(inherited, 100.0F)
    if inherited.TextDecoration != TextDecoration.Underline
      || entry.TextDecoration != TextDecoration.Underline
      || cleared.TextDecoration != TextDecoration.None{
        return false
      }

    root.Hovered = true
    resolver.Invalidate(root, false)
    resolver.Flush()
    if inherited.TextDecoration != TextDecoration.LineThrough
      || entry.TextDecoration != TextDecoration.LineThrough
      || cleared.TextDecoration != TextDecoration.None
      || TextLayouts.For(inherited, 100.0F) != retained
      || resolver.Animating.Count != 0 {
        return false
      }

    root.Hovered = false
    root.BaseStyle = nil
    resolver.Invalidate(root, false)
    resolver.Flush()
    return !(root.TextDecoration != TextDecoration.None
      || inherited.TextDecoration != TextDecoration.None
      || entry.TextDecoration != TextDecoration.None
      || cleared.TextDecoration != TextDecoration.None)
  }

  func CursorInheritanceAndResetContract() bool {
    let resolver = Resolver{}
    let root = Reconciler{ Res: resolver }.Mount(Container() {.Cursor: Cursor.Move,.TransitionMs: 100.0,.Hover: Style{ Cursor: Cursor.Crosshair },
        Text{ Content: "inherited" },
        Container{ Cursor: Cursor.Pointer},
    })
    let inherited = root.Children[0]
    let local = root.Children[1]
    if inherited.Cursor != Cursor.Move || local.Cursor != Cursor.Pointer {
      return false
    }

    root.Hovered = true
    resolver.Invalidate(root, false)
    resolver.Flush()
    if root.Cursor != Cursor.Crosshair || inherited.Cursor != Cursor.Crosshair
      || local.Cursor != Cursor.Pointer{
        return false
      }

    local.BaseStyle = nil
    resolver.Invalidate(local, false)
    resolver.Flush()
    if local.Cursor != Cursor.Crosshair { return false }

    root.Hovered = false
    resolver.Invalidate(root, false)
    resolver.Flush()
    return !(root.Cursor != Cursor.Move || inherited.Cursor != Cursor.Move
      || local.Cursor != Cursor.Move)
  }

  func ZIndexRangeStateAndResetContract() bool {
    let resolver = Resolver{}
    let root = Reconciler{ Res: resolver }.Mount(Container() {.ZIndex: 20,
        Container{ ZIndex: Int32.MinValue, Hover: Style{ ZIndex: Int32.MaxValue } },
        Container{},
    })
    let child = root.Children[0]
    if root.ZIndex != 20 || child.ZIndex != Int32.MinValue || root.Children[1].ZIndex != 0 {
      return false
    }
    let low = Stacking.Children(root)
    if low[0] != child || low[1] != root.Children[1] { return false }

    child.Hovered = true
    resolver.Invalidate(child, false)
    resolver.Flush()
    let high = Stacking.Children(root)
    if child.ZIndex != Int32.MaxValue || high[0] != root.Children[1]
      || high[1] != child{
        return false
      }

    child.Hovered = false
    child.BaseStyle = nil
    resolver.Invalidate(child, false)
    resolver.Flush()
    let reset = Stacking.Children(root)
    return child.ZIndex == 0 && root.Children[1].ZIndex == 0
      && reset[0] == child && !root.StackingChildren
  }

  func TransitionInterpolationAndRetargetContract() bool {
    let n = Node{ Kind: NodeKind.Container }
    let resolver = Resolver{}
    n.TransitionMs = 100.0
    n.TransitionEasing = Easing.EaseIn
    n.BaseStyle = Style{ Opacity: 0.0 }.Entries()
    n.HoverStyle = Style{ Opacity: 1.0 }.Entries()
    resolver.Invalidate(n, true)
    resolver.Flush()
    n.Hovered = true
    resolver.Invalidate(n, false)
    resolver.Flush()
    resolver.Advance(0.05)
    if !near(n.Opacity, 0.25) { return false }
    n.Hovered = false
    resolver.Invalidate(n, false)
    resolver.Flush()
    resolver.Advance(0.05)
    if n.Opacity < 0.17 || n.Opacity > 0.20 { return false }
    resolver.Advance(0.06)
    return n.Opacity == 0.0 && resolver.Animating.Count == 0
  }

  func TransitionDelayAndPropertySelectionContract() bool {
    let n = Node{ Kind: NodeKind.Container }
    let resolver = Resolver{}
    n.TransitionMs = 100.0
    n.TransitionDelayMs = 100.0
    n.TransitionSelection = makeTransitionSelection([]TransitionProperty{
      TransitionProperty.Opacity,
    })
    n.BaseStyle = Style{ Width: 10, Opacity: 0.0 }.Entries()
    n.HoverStyle = Style{ Width: 20, Opacity: 1.0 }.Entries()
    resolver.Invalidate(n, true)
    resolver.Flush()
    n.Hovered = true
    resolver.Invalidate(n, false)
    resolver.Flush()
    if n.Width.Value != 20.0F || n.Opacity != 0.0 || resolver.Animating.Count != 1 {
      return false
    }
    resolver.VisualDirty = false
    resolver.Advance(0.05)
    if n.Opacity != 0.0 || resolver.VisualDirty { return false }
    resolver.Advance(0.075)
    if !near(n.Opacity, 0.25) { return false }

    n.Hovered = false
    resolver.Invalidate(n, false)
    resolver.Flush()
    resolver.Advance(0.05)
    if !near(n.Opacity, 0.25) { return false }
    resolver.Advance(0.10)
    if !near(n.Opacity, 0.125) { return false }

    n.TransitionSelection = makeTransitionSelection([]TransitionProperty{})
    resolver.Invalidate(n, false)
    resolver.Flush()
    resolver.Advance(0.0)
    return n.Opacity == 0.0 && resolver.Animating.Count == 0
  }

  func TransitionDeclarationContract() bool {
    let selected = []TransitionProperty{ TransitionProperty.Opacity }
    let blob = Container{
      TransitionDelayMs: -10.0,
      TransitionEasing: Easing.EaseIn,
      TransitionProperties: selected,
      Focusable: true,
      Disabled: true,
    }
    selected[0] = TransitionProperty.Width
    let first = blob.TransitionProperties
    if blob.TransitionDelayMs != 0.0 || blob.TransitionEasing != Easing.EaseIn
      || !blob.Focusable || !blob.Disabled || first.Length != 1
      || first[0] != TransitionProperty.Opacity{
        return false
      }
    first[0] = TransitionProperty.Height
    let second = blob.TransitionProperties
    let defaults = Container{}.TransitionProperties
    let empty = Container{ TransitionProperties: []TransitionProperty{} }.TransitionProperties
    let reverse = Container{
      TransitionProperties: []TransitionProperty{ TransitionProperty.Width },
      TransitionEasing: Easing.EaseOut,
    }
    return second.Length == 1 && second[0] == TransitionProperty.Opacity
      && defaults.Length == 1 && defaults[0] == TransitionProperty.All
      && empty.Length == 0 && reverse.TransitionEasing == Easing.EaseOut
      && reverse.TransitionProperties[0] == TransitionProperty.Width
  }

  func ShorthandTransitionSelectionContract() bool {
    let marginSelection = makeTransitionSelection([]TransitionProperty{ TransitionProperty.Margin })
    if !transitionSelected(marginSelection, StyleField.MarginLeft)
      || !transitionSelected(marginSelection, StyleField.MarginTop)
      || !transitionSelected(marginSelection, StyleField.MarginRight)
      || !transitionSelected(marginSelection, StyleField.MarginBottom) {
        return false
      }
    let marginProperties = transitionSelectionProperties(marginSelection)
    if marginProperties.Length != 1 || marginProperties[0] != TransitionProperty.Margin {
      return false
    }

    let margin = Node{ Kind: NodeKind.Container }
    let marginResolver = Resolver{}
    margin.TransitionMs = 100.0
    margin.TransitionEasing = Easing.Linear
    margin.TransitionSelection = marginSelection
    margin.BaseStyle = Style{ Margin: 0 }.Entries()
    margin.HoverStyle = Style{ Margin: 10 }.Entries()
    marginResolver.Invalidate(margin, true)
    marginResolver.Flush()
    margin.Hovered = true
    marginResolver.Invalidate(margin, false)
    marginResolver.Flush()
    marginResolver.Advance(0.05)
    if margin.MarginLeft.Value != 5.0F || margin.MarginTop.Value != 5.0F
      || margin.MarginRight.Value != 5.0F || margin.MarginBottom.Value != 5.0F {
        return false
      }

    let paddingSelection = makeTransitionSelection([]TransitionProperty{ TransitionProperty.PaddingLeft })
    if !transitionSelected(paddingSelection, StyleField.PaddingLeft)
      || transitionSelected(paddingSelection, StyleField.PaddingTop)
      || transitionSelected(paddingSelection, StyleField.PaddingRight)
      || transitionSelected(paddingSelection, StyleField.PaddingBottom) {
        return false
      }
    let paddingProperties = transitionSelectionProperties(paddingSelection)
    if paddingProperties.Length != 1 || paddingProperties[0] != TransitionProperty.PaddingLeft {
      return false
    }

    let padding = Node{ Kind: NodeKind.Container }
    let paddingResolver = Resolver{}
    padding.TransitionMs = 100.0
    padding.TransitionEasing = Easing.Linear
    padding.TransitionSelection = paddingSelection
    padding.BaseStyle = Style{ Padding: 0 }.Entries()
    padding.HoverStyle = Style{ Padding: 8 }.Entries()
    paddingResolver.Invalidate(padding, true)
    paddingResolver.Flush()
    padding.Hovered = true
    paddingResolver.Invalidate(padding, false)
    paddingResolver.Flush()
    if padding.PaddingLeft.Value != 0.0F || padding.PaddingTop.Value != 8.0F
      || padding.PaddingRight.Value != 8.0F || padding.PaddingBottom.Value != 8.0F {
        return false
      }
    paddingResolver.Advance(0.05)
    return padding.PaddingLeft.Value == 4.0F
  }

  func ShapeSideTransitionSelectorsSnapUniformStrokeContract() bool {
    let red = Color.Rgb(255, 0, 0)
    let blue = Color.Rgb(0, 0, 255)
    let n = Node{ Kind: NodeKind.Shape }
    let resolver = Resolver{}
    n.TransitionMs = 100.0
    n.TransitionSelection = makeTransitionSelection([]TransitionProperty{
      TransitionProperty.BorderLeftWidth,
      TransitionProperty.BorderLeftColor,
    })
    n.BaseStyle = Style{ BorderWidth: 2, BorderColor: red }.Entries()
    n.HoverStyle = Style{ BorderWidth: 6, BorderColor: blue }.Entries()
    resolver.Invalidate(n, true)
    resolver.Flush()
    n.Hovered = true
    resolver.Invalidate(n, false)
    resolver.Flush()
    return n.BorderLeftWidth.Value == 6.0F && sameColor(n.BorderLeftColor, blue)
      && resolver.Animating.Count == 0
  }

  func TransitionBlobEasingContract() bool {
    let resolver = Resolver{}
    let root = Reconciler{ Res: resolver }.Mount(Container{
      TransitionMs: 100,
      TransitionEasing: Easing.EaseIn,
      Opacity: 0.0,
      Hover: Style{ Opacity: 1.0 },
    })
    root.Hovered = true
    resolver.Invalidate(root, false)
    resolver.Flush()
    resolver.Advance(0.05)
    return near(root.Opacity, 0.25)
  }

  func BoxShadowTransitionContract() bool {
    let red = Color.Rgb(255, 0, 0)
    let blue = Color.Rgb(0, 0, 255)
    let n = Node{ Kind: NodeKind.Container }
    let resolver = Resolver{}
    n.TransitionMs = 100.0
    n.TransitionEasing = Easing.Linear
    n.BaseStyle = Style{ BoxShadows: []BoxShadow{
      BoxShadow{ OffsetX: 0, Color: red },
    } }.Entries()
    n.HoverStyle = Style{ BoxShadows: []BoxShadow{
      BoxShadow{ OffsetX: 10, Color: blue },
      BoxShadow{ Inset: true, Spread: 4, Color: red },
    } }.Entries()
    resolver.Invalidate(n, true)
    resolver.Flush()
    n.Hovered = true
    resolver.Invalidate(n, false)
    resolver.Flush()
    resolver.Advance(0.05)
    if boxShadowCount(n.BoxShadows) != 2
      || boxShadowAt(n.BoxShadows, 0).OffsetX.Value != 5.0F
      || boxShadowAt(n.BoxShadows, 1).Color.A < 0.49F
      || boxShadowAt(n.BoxShadows, 1).Color.A > 0.51F
      || !boxShadowAt(n.BoxShadows, 1).Inset{
        return false
      }
    n.Hovered = false
    resolver.Invalidate(n, false)
    resolver.Flush()
    resolver.Advance(0.05)
    if boxShadowAt(n.BoxShadows, 0).OffsetX.Value != 2.5F {
      return false
    }
    resolver.Advance(0.06)
    if boxShadowCount(n.BoxShadows) != 1
      || boxShadowAt(n.BoxShadows, 0).OffsetX.Value != 0.0F
      || resolver.Animating.Count != 0 {
        return false
      }

    let mismatch = Node{ Kind: NodeKind.Container }
    let mismatchResolver = Resolver{}
    mismatch.TransitionMs = 100.0
    mismatch.BaseStyle = Style{ BoxShadow: BoxShadow{ Color: red } }.Entries()
    mismatch.HoverStyle = Style{ BoxShadow: BoxShadow{ Inset: true, Color: blue } }.Entries()
    mismatchResolver.Invalidate(mismatch, true)
    mismatchResolver.Flush()
    mismatch.Hovered = true
    mismatchResolver.Invalidate(mismatch, false)
    mismatchResolver.Flush()
    return boxShadowAt(mismatch.BoxShadows, 0).Inset
      && sameColor(boxShadowAt(mismatch.BoxShadows, 0).Color, blue)
      && mismatchResolver.Animating.Count == 0
  }

  func TransitionSnapAndResetContract() bool {
    let enums = Node{ Kind: NodeKind.Container }
    let enumResolver = Resolver{}
    enums.TransitionMs = 100.0
    enums.BaseStyle = Style{ FlexDirection: FlexDirection.Column }.Entries()
    enums.HoverStyle = Style{ FlexDirection: FlexDirection.Row }.Entries()
    enumResolver.Invalidate(enums, true)
    enumResolver.Flush()
    enums.Hovered = true
    enumResolver.Invalidate(enums, false)
    enumResolver.Flush()
    if enums.FlexDirection != FlexDirection.Row || enumResolver.Animating.Count != 0 { return false }

    let reset = Node{ Kind: NodeKind.Container }
    let resetResolver = Resolver{}
    reset.TransitionMs = 100.0
    reset.HoverStyle = Style{ Opacity: 0.5 }.Entries()
    resetResolver.Invalidate(reset, true)
    resetResolver.Flush()
    reset.Hovered = true
    resetResolver.Invalidate(reset, false)
    resetResolver.Flush()
    resetResolver.Advance(0.05)
    reset.Hovered = false
    resetResolver.Invalidate(reset, false)
    resetResolver.Flush()
    if !near(reset.Opacity, 0.75) || resetResolver.Animating.Count != 1 { return false }
    resetResolver.Advance(0.05)
    if !near(reset.Opacity, 0.875) { return false }
    resetResolver.Advance(0.06)
    return reset.Opacity == 1.0 && resetResolver.Animating.Count == 0
  }

  func StateOnlyTransitionFallbackContract() bool {
    let n = Node{ Kind: NodeKind.Container }
    let resolver = Resolver{}
    n.TransitionMs = 100.0
    n.TransitionEasing = Easing.Linear
    n.HoverStyle = Style{
      BackgroundColor: Color.Rgb(255, 0, 0),
      BoxShadow: BoxShadow{ OffsetX: 10, Color: Color.Black },
      Transform: PanelTransform{ TranslateX: 10, Scale: 2 },
    }.Entries()
    resolver.Invalidate(n, true)
    resolver.Flush()
    n.Hovered = true
    resolver.Invalidate(n, false)
    resolver.Flush()
    resolver.Advance(0.05)
    if !near(n.BackgroundColor.A, 0.5)
      || !near(boxShadowAt(n.BoxShadows, 0).OffsetX.Magnitude, 5.0)
      || !near(boxShadowAt(n.BoxShadows, 0).Color.A, 0.5)
      || !near(Transforming.TranslateX(n).Value, 5.0)
      || !near(Transforming.Scale(n), 1.5) {
        return false
      }

    n.Hovered = false
    resolver.Invalidate(n, false)
    resolver.Flush()
    if !near(n.BackgroundColor.A, 0.5)
      || !near(Transforming.TranslateX(n).Value, 5.0) {
        return false
      }
    resolver.Advance(0.05)
    if !near(n.BackgroundColor.A, 0.25)
      || !near(boxShadowAt(n.BoxShadows, 0).OffsetX.Magnitude, 2.5)
      || !near(boxShadowAt(n.BoxShadows, 0).Color.A, 0.25)
      || !near(Transforming.TranslateX(n).Value, 2.5)
      || !near(Transforming.Scale(n), 1.25) {
        return false
      }
    resolver.Advance(0.06)
    return sameColor(n.BackgroundColor, Color.Transparent)
      && boxShadowCount(n.BoxShadows) == 0
      && Transforming.TranslateX(n).Value == 0.0F
      && Transforming.Scale(n) == 1.0F
      && !n.HasTransformState && resolver.Animating.Count == 0
  }

  func TransitionTimingSnapshotContract() bool {
    let resolver = Resolver{}
    let reconciler = Reconciler{ Res: resolver }
    var n = reconciler.Mount(Container{
      Opacity: 0.0,
      BoxShadow: BoxShadow{ OffsetX: 0, Color: Color.Black },
      TransitionMs: 100.0,
      TransitionEasing: Easing.Linear,
      Hover: Style{
        Opacity: 1.0,
        BoxShadow: BoxShadow{ OffsetX: 10, Color: Color.White },
      },
    })
    n.Hovered = true
    resolver.Invalidate(n, false)
    resolver.Flush()
    resolver.Advance(0.025)
    if !near(n.Opacity, 0.25)
      || !near(boxShadowAt(n.BoxShadows, 0).OffsetX.Magnitude, 2.5) {
        return false
      }

    n = reconciler.Diff(n, Container{
      Opacity: 0.0,
      BoxShadow: BoxShadow{ OffsetX: 0, Color: Color.Black },
      TransitionMs: 1000.0,
      TransitionDelayMs: 1000.0,
      TransitionEasing: Easing.EaseIn,
      Hover: Style{
        Opacity: 1.0,
        BoxShadow: BoxShadow{ OffsetX: 10, Color: Color.White },
      },
    })
    resolver.Advance(0.025)
    if !near(n.Opacity, 0.5)
      || !near(boxShadowAt(n.BoxShadows, 0).OffsetX.Magnitude, 5.0) {
        return false
      }
    resolver.Advance(0.06)
    return n.Opacity == 1.0
      && boxShadowAt(n.BoxShadows, 0).OffsetX.Magnitude == 10.0
      && resolver.Animating.Count == 0
  }

  func TransformStateTransitionAndGeometryContract() bool {
    let turn = Node{ Kind: NodeKind.Container, Rect: Rect{ W: 20, H: 20 } }
    let turnResolver = Resolver{}
    turn.TransitionMs = 100.0
    turn.TransitionSelection = makeTransitionSelection([]TransitionProperty{
      TransitionProperty.Transform,
    })
    turn.BaseStyle = Style{ Transform: PanelTransform{} }.Entries()
    turn.HoverStyle = Style{ Transform: PanelTransform{ Rotate: 360 } }.Entries()
    turnResolver.Invalidate(turn, true)
    turnResolver.Flush()
    turn.Hovered = true
    turnResolver.Invalidate(turn, false)
    turnResolver.Flush()
    turnResolver.Advance(0.05)
    if Transforming.Rotate(turn) != 180.0F || !turn.HasVisualTransform { return false }
    turnResolver.Advance(0.06)
    if Transforming.Rotate(turn) != 360.0F || !turn.HasVisualTransform { return false }

    let percent = Node{ Kind: NodeKind.Container, Rect: Rect{ W: 100, H: 50 } }
    let percentResolver = Resolver{}
    percent.TransitionMs = 100.0
    percent.TransitionSelection = makeTransitionSelection([]TransitionProperty{
      TransitionProperty.Transform,
    })
    percent.BaseStyle = Style{
      Transform: PanelTransform{ TranslateX: Length.Percent(0) },
    }.Entries()
    percent.HoverStyle = Style{
      Transform: PanelTransform{ TranslateX: Length.Percent(50) },
    }.Entries()
    percentResolver.Invalidate(percent, true)
    percentResolver.Flush()
    if !percent.HasTransformState || percent.HasVisualTransform
      || Transforming.TranslateX(percent).Unit != LengthUnit.Percent{
        return false
      }
    percent.Hovered = true
    percentResolver.Invalidate(percent, false)
    percentResolver.Flush()
    percentResolver.Advance(0.05)
    if Transforming.TranslateX(percent).Unit != LengthUnit.Percent
      || Transforming.TranslateX(percent).Value != 25.0F {
        return false
      }

    let rec = Reconciler{ Res: Resolver{} }
    let mounted = rec.Mount(Container{ Transform: PanelTransform{ TranslateX: 12, Rotate: 30 } })
    if !mounted.HasTransformState || !mounted.HasVisualTransform { return false }
    rec.Diff(mounted, Container{})
    if mounted.HasTransformState || mounted.HasVisualTransform { return false }

    let plain = rec.Mount(Container() {.Width: 40,.Height: 30, Container{ Width: 12, Height: 8} })
    let transformed = rec.Mount(Container() {.Width: 40,.Height: 30,.Transform: PanelTransform{ TranslateX: Length.Percent(50), Rotate: 25, Scale: 1.5 },
        Container{ Width: 12, Height: 8},
    })
    let layout = Layout()
    layout.Calculate(plain, 100.0F, 100.0F)
    layout.Calculate(transformed, 100.0F, 100.0F)
    let responsive = rec.Mount(Container{
      Width: Length.Percent(50), Height: 20,
      Transform: PanelTransform{ TranslateX: Length.Percent(100) },
    })
    layout.Calculate(responsive, 100.0F, 100.0F)
    let smallTranslation = TransformGeometry.Matrix(responsive).TX
    layout.Calculate(responsive, 200.0F, 100.0F)
    let largeTranslation = TransformGeometry.Matrix(responsive).TX
    return near(smallTranslation, 50.0) && near(largeTranslation, 100.0)
      && plain.Rect == transformed.Rect && plain.Children[0].Rect == transformed.Children[0].Rect
      && !transformed.Children[0].HasTransformState
  }

  private func rejectsInvalidStyleDeclarations() bool {
    var negativeSize = false
    var invalidUnit = false
    var invalidNumber = false
    var negativeOutline = false
    var percentOutline = false
    var invalidDecoration = false
    try {
      let ignored = Style{ Width: -1 }
    } catch (error ArgumentException) {
      negativeSize = true
    }
    try {
      let ignored = Style{ BorderRadius: Length.Percent(10) }
    } catch (error ArgumentException) {
      invalidUnit = true
    }
    try {
      let ignored = Style{ Opacity: Double.NaN }
    } catch (error ArgumentException) {
      invalidNumber = true
    }
    try {
      let ignored = Style{ OutlineWidth: -1 }
    } catch (error ArgumentException) {
      negativeOutline = true
    }
    try {
      let ignored = Style{ OutlineOffset: Length.Percent(10) }
    } catch (error ArgumentException) {
      percentOutline = true
    }
    try {
      let ignored = Style{ TextDecoration: TextDecoration(4) }
    } catch (error ArgumentException) {
      invalidDecoration = true
    }
    return negativeSize && invalidUnit && invalidNumber && negativeOutline && percentOutline
      && invalidDecoration
  }

  private func rejectsInvalidLogicalEdgeDeclarations() bool {
    var padding = false
    var margin = false
    var position = false
    var border = false
    try { let ignored = Style{ PaddingStart: -1 } }
    catch (error ArgumentException) { padding = true }
    try { let ignored = Style{ MarginEnd: Length.Auto } }
    catch (error ArgumentException) { margin = true }
    try { let ignored = Style{ Start: Length.Auto } }
    catch (error ArgumentException) { position = true }
    try { let ignored = Style{ BorderEndWidth: Length.Percent(10) } }
    catch (error ArgumentException) { border = true }
    return padding && margin && position && border
  }

  internal func StyleFieldExhaustivenessContract(field StyleField) bool {
    guard let declaration = styleFieldDeclaration(field) else { return false }
    guard let entries = declaration.Entries(), let source = styleFieldEntry(entries, field) else {
      return false
    }
    let container = Node{ Kind: NodeKind.Container }
    let shape = Node{ Kind: NodeKind.Shape }
    if !styleFieldApplies(container, field)
      || styleFieldApplies(shape, field) != styleFieldAppliesToShape(field) {
        return false
      }
    let kindTarget = styleFieldContractTarget(container, field)
    if !styleFieldDeclarationMatchesKind(source, fieldKind(kindTarget))
      || int32(styleEffects(kindTarget)) == 0 {
        return false
      }
    let primaryKind = styleFieldUsesShapeStorage(field) ? NodeKind.Shape : NodeKind.Container
    if !styleFieldResolutionContract(field, declaration, source, primaryKind, Direction.Auto) {
      return false
    }
    if isLogicalStyleField(field)
      && !styleFieldResolutionContract(field, declaration, source, NodeKind.Container,
        Direction.RightToLeft) {
          return false
        }
    return !(styleFieldUsesShapeStorage(field)
      && !styleFieldResolutionContract(field, declaration, source, NodeKind.Container,
        Direction.Auto))
  }

  private func styleFieldResolutionContract(field StyleField, declaration Style,
    source StyleEntry, kind NodeKind, direction Direction) bool{
      let n = Node{ Kind: kind, Direction: direction }
      n.BaseStyle = declaration.Entries()
      let resolver = Resolver{}
      resolver.Invalidate(n, true)
      resolver.Flush()
      let targets = styleFieldContractTargets(n, field)
      for target in targets {
        var expected = source
        expected.Field = target
        if !sameStyleEntry(readField(n, target), expected) { return false }
      }
      n.BaseStyle = nil
      resolver.Invalidate(n, false)
      resolver.Flush()
      for target in targets {
        if !sameStyleEntry(readField(n, target), defaultStyleEntry(target)) { return false }
      }
      return true
    }

  private func styleFieldContractTargets(n Node, field StyleField) []StyleField {
    switch field {
      case StyleField.Padding {
        return []StyleField{ StyleField.PaddingLeft, StyleField.PaddingTop,
          StyleField.PaddingRight, StyleField.PaddingBottom }
      }
      case StyleField.Margin {
        return []StyleField{ StyleField.MarginLeft, StyleField.MarginTop,
          StyleField.MarginRight, StyleField.MarginBottom }
      }
      default { return []StyleField{ styleFieldContractTarget(n, field) } }
    }
  }

  private func styleFieldContractTarget(n Node, field StyleField) StyleField {
    if field == StyleField.ShapeStrokeWidth && n.Kind != NodeKind.Shape {
      return StyleField.BorderLeftWidth
    }
    if field == StyleField.ShapeStrokeColor && n.Kind != NodeKind.Shape {
      return StyleField.BorderLeftColor
    }
    let rtl = n.Direction == Direction.RightToLeft
    return switch field {
      case StyleField.MarginStart: rtl ? StyleField.MarginRight : StyleField.MarginLeft
      case StyleField.MarginEnd: rtl ? StyleField.MarginLeft : StyleField.MarginRight
      case StyleField.PaddingStart: rtl ? StyleField.PaddingRight : StyleField.PaddingLeft
      case StyleField.PaddingEnd: rtl ? StyleField.PaddingLeft : StyleField.PaddingRight
      case StyleField.Start: rtl ? StyleField.Right : StyleField.Left
      case StyleField.End: rtl ? StyleField.Left : StyleField.Right
      case StyleField.BorderStartWidth: rtl ? StyleField.BorderRightWidth : StyleField.BorderLeftWidth
      case StyleField.BorderEndWidth: rtl ? StyleField.BorderLeftWidth : StyleField.BorderRightWidth
      case StyleField.BorderStartColor: rtl ? StyleField.BorderRightColor : StyleField.BorderLeftColor
      case StyleField.BorderEndColor: rtl ? StyleField.BorderLeftColor : StyleField.BorderRightColor
      case _: field
    }
  }

  private func styleFieldUsesShapeStorage(field StyleField) bool -> field == StyleField.ShapeStrokeWidth || field == StyleField.ShapeStrokeColor

  private func styleFieldAppliesToShape(field StyleField) bool -> field != StyleField.BorderLeftWidth && field != StyleField.BorderTopWidth
    && field != StyleField.BorderRightWidth && field != StyleField.BorderBottomWidth
    && field != StyleField.BorderLeftColor && field != StyleField.BorderTopColor
    && field != StyleField.BorderRightColor && field != StyleField.BorderBottomColor
    && field != StyleField.BorderStartWidth && field != StyleField.BorderEndWidth
    && field != StyleField.BorderStartColor && field != StyleField.BorderEndColor

  private func styleFieldDeclarationMatchesKind(entry StyleEntry, kind FieldKind) bool -> switch kind {
    case FieldKind.KLength: entry.B == float32(int32(LengthUnit.Px))
    case FieldKind.KColor: entry.D == 1.0F
    case FieldKind.KScalar: entry.A != 0.0F
    case FieldKind.KEnum: entry.A != 0.0F || entry.B != 0.0F
    case FieldKind.KString: entryText(entry) == "style-field-contract"
    case FieldKind.KGradient: entry.Payload != nil
    case FieldKind.KBoxShadows: entry.Payload != nil
    case FieldKind.KPath: entry.Payload != nil
    case FieldKind.KImageSource: entry.Payload == nil
    case FieldKind.KShaderEffect: entry.Payload != nil
    case FieldKind.KScrollbar: entryScrollbar(entry) != nil
  }

  private func styleFieldEntry(entries StyleEntries, field StyleField) StyleEntry? {
    for i in 0 ... entries.Count {
      let entry = entries.At(i)
      if entry.Field == field { return entry }
    }
    return nil
  }

  private func styleFieldDeclaration(field StyleField) Style? {
    switch field {
      case StyleField.Width { return Style{ Width: 7 } }
      case StyleField.Height { return Style{ Height: 7 } }
      case StyleField.MinWidth { return Style{ MinWidth: 7 } }
      case StyleField.MinHeight { return Style{ MinHeight: 7 } }
      case StyleField.MaxWidth { return Style{ MaxWidth: 7 } }
      case StyleField.MaxHeight { return Style{ MaxHeight: 7 } }
      case StyleField.AspectRatio { return Style{ AspectRatio: 2 } }
      case StyleField.Padding { return Style{ Padding: 7 } }
      case StyleField.PaddingLeft { return Style{ Padding: Edges{ Left: 7 } } }
      case StyleField.PaddingTop { return Style{ Padding: Edges{ Top: 7 } } }
      case StyleField.PaddingRight { return Style{ Padding: Edges{ Right: 7 } } }
      case StyleField.PaddingBottom { return Style{ Padding: Edges{ Bottom: 7 } } }
      case StyleField.Margin { return Style{ Margin: 7 } }
      case StyleField.MarginLeft { return Style{ Margin: Edges{ Left: 7 } } }
      case StyleField.MarginTop { return Style{ Margin: Edges{ Top: 7 } } }
      case StyleField.MarginRight { return Style{ Margin: Edges{ Right: 7 } } }
      case StyleField.MarginBottom { return Style{ Margin: Edges{ Bottom: 7 } } }
      case StyleField.Gap { return Style{ Gap: 7 } }
      case StyleField.RowGap { return Style{ RowGap: 7 } }
      case StyleField.ColumnGap { return Style{ ColumnGap: 7 } }
      case StyleField.FlexDirection { return Style{ FlexDirection: FlexDirection.Row } }
      case StyleField.FlexWrap { return Style{ FlexWrap: FlexWrap.Wrap } }
      case StyleField.JustifyContent { return Style{ JustifyContent: JustifyContent.Center } }
      case StyleField.AlignItems { return Style{ AlignItems: AlignItems.Center } }
      case StyleField.AlignSelf { return Style{ AlignSelf: AlignSelf.Center } }
      case StyleField.AlignContent { return Style{ AlignContent: AlignContent.Center } }
      case StyleField.FlexGrow { return Style{ FlexGrow: 2 } }
      case StyleField.FlexShrink { return Style{ FlexShrink: 2 } }
      case StyleField.FlexBasis { return Style{ FlexBasis: 7 } }
      case StyleField.Position { return Style{ Position: PositionType.Absolute } }
      case StyleField.Left { return Style{ Left: 7 } }
      case StyleField.Top { return Style{ Top: 7 } }
      case StyleField.Right { return Style{ Right: 7 } }
      case StyleField.Bottom { return Style{ Bottom: 7 } }
      case StyleField.Display { return Style{ Display: Display.None } }
      case StyleField.OverflowX { return Style{ OverflowX: Overflow.Scroll } }
      case StyleField.OverflowY { return Style{ OverflowY: Overflow.Scroll } }
      case StyleField.BackgroundColor { return Style{ BackgroundColor: Color.White } }
      case StyleField.BorderRadius { return Style{ BorderRadius: 7 } }
      case StyleField.BorderTopLeftRadius { return Style{ BorderTopLeftRadius: 7 } }
      case StyleField.BorderTopRightRadius { return Style{ BorderTopRightRadius: 7 } }
      case StyleField.BorderBottomLeftRadius { return Style{ BorderBottomLeftRadius: 7 } }
      case StyleField.BorderBottomRightRadius { return Style{ BorderBottomRightRadius: 7 } }
      case StyleField.BorderLeftWidth { return Style{ BorderLeftWidth: 7 } }
      case StyleField.BorderTopWidth { return Style{ BorderTopWidth: 7 } }
      case StyleField.BorderRightWidth { return Style{ BorderRightWidth: 7 } }
      case StyleField.BorderBottomWidth { return Style{ BorderBottomWidth: 7 } }
      case StyleField.BorderLeftColor { return Style{ BorderLeftColor: Color.White } }
      case StyleField.BorderTopColor { return Style{ BorderTopColor: Color.White } }
      case StyleField.BorderRightColor { return Style{ BorderRightColor: Color.White } }
      case StyleField.BorderBottomColor { return Style{ BorderBottomColor: Color.White } }
      case StyleField.Opacity { return Style{ Opacity: 0.5 } }
      case StyleField.BoxShadows {
        return Style{ BoxShadow: BoxShadow{ OffsetX: 7, Color: Color.White } }
      }
      case StyleField.Color { return Style{ Color: Color.White } }
      case StyleField.FontFamily { return Style{ FontFamily: "style-field-contract" } }
      case StyleField.FontSize { return Style{ FontSize: 7 } }
      case StyleField.FontStyle { return Style{ FontStyle: FontStyle.Italic } }
      case StyleField.FontWeight { return Style{ FontWeight: 500 } }
      case StyleField.LetterSpacing { return Style{ LetterSpacing: 7 } }
      case StyleField.LineHeight { return Style{ LineHeight: 2 } }
      case StyleField.TextAlign { return Style{ TextAlign: TextAlign.Center } }
      case StyleField.BackgroundGradient {
        return Style{ BackgroundGradient: LinearGradient(Color.Black, Color.White) }
      }
      case StyleField.Cursor { return Style{ Cursor: Cursor.Pointer } }
      case StyleField.ZIndex { return Style{ ZIndex: 2 } }
      case StyleField.TextWrap { return Style{ TextWrap: TextWrap.NoWrap } }
      case StyleField.TextTrimming { return Style{ TextTrimming: TextTrimming.Ellipsis } }
      case StyleField.TextTransform { return Style{ TextTransform: TextTransform.Uppercase } }
      case StyleField.OutlineWidth { return Style{ OutlineWidth: 7 } }
      case StyleField.OutlineColor { return Style{ OutlineColor: Color.White } }
      case StyleField.OutlineOffset { return Style{ OutlineOffset: 7 } }
      case StyleField.Visibility { return Style{ Visibility: Visibility.Hidden } }
      case StyleField.TextDecoration { return Style{ TextDecoration: TextDecoration.Underline } }
      case StyleField.TransformTranslateX {
        return Style{ Transform: PanelTransform{ TranslateX: 7 } }
      }
      case StyleField.TransformTranslateY {
        return Style{ Transform: PanelTransform{ TranslateY: 7 } }
      }
      case StyleField.TransformRotate { return Style{ Transform: PanelTransform{ Rotate: 7 } } }
      case StyleField.TransformScale { return Style{ Transform: PanelTransform{ Scale: 2 } } }
      case StyleField.TransformOriginX { return Style{ TransformOriginX: 7 } }
      case StyleField.TransformOriginY { return Style{ TransformOriginY: 7 } }
      case StyleField.TextShadows {
        return Style{ TextShadow: TextShadow{ OffsetX: 7, Color: Color.White } }
      }
      case StyleField.ShapeStrokeWidth { return Style{ BorderWidth: 7 } }
      case StyleField.ShapeStrokeColor { return Style{ BorderColor: Color.White } }
      case StyleField.TextMaxLines { return Style{ TextMaxLines: 2 } }
      case StyleField.TextStrokeWidth { return Style{ TextStrokeWidth: 7 } }
      case StyleField.TextStrokeColor { return Style{ TextStrokeColor: Color.White } }
      case StyleField.Direction { return Style{ Direction: Direction.RightToLeft } }
      case StyleField.MarginStart { return Style{ MarginStart: 7 } }
      case StyleField.MarginEnd { return Style{ MarginEnd: 7 } }
      case StyleField.PaddingStart { return Style{ PaddingStart: 7 } }
      case StyleField.PaddingEnd { return Style{ PaddingEnd: 7 } }
      case StyleField.Start { return Style{ Start: 7 } }
      case StyleField.End { return Style{ End: 7 } }
      case StyleField.BorderStartWidth { return Style{ BorderStartWidth: 7 } }
      case StyleField.BorderEndWidth { return Style{ BorderEndWidth: 7 } }
      case StyleField.BorderStartColor { return Style{ BorderStartColor: Color.White } }
      case StyleField.BorderEndColor { return Style{ BorderEndColor: Color.White } }
      case StyleField.BackgroundImage { return Style{ BackgroundImage: "style-field-contract" } }
      case StyleField.BackgroundImageFit { return Style{ BackgroundImageFit: ImageFit.Fill } }
      case StyleField.ClipPath { return Style{ ClipPath: styleFieldContractPath() } }
      case StyleField.ClipPathFillRule {
        return Style{ ClipPathFillRule: FillRule.EvenOdd }
      }
      case StyleField.ClipPathFit { return Style{ ClipPathFit: ShapeFit.Cover } }
      case StyleField.BorderStyle { return Style{ BorderStyle: BorderStyle.Dashed } }
      case StyleField.BlendMode { return Style{ BlendMode: BlendMode.Multiply } }
      case StyleField.TransformScaleX { return Style{ Transform: PanelTransform{ ScaleX: 2 } } }
      case StyleField.TransformScaleY { return Style{ Transform: PanelTransform{ ScaleY: 2 } } }
      case StyleField.TransformSkewX { return Style{ Transform: PanelTransform{ SkewX: 7 } } }
      case StyleField.TransformSkewY { return Style{ Transform: PanelTransform{ SkewY: 7 } } }
      case StyleField.BackgroundImageSource { return Style{ BackgroundImageSource: nil } }
      case StyleField.ShaderEffect {
        return Style{ ShaderEffect: ShaderEffect(ShaderEffectProgram([]uint8{
          71, 69, 70, 70, 1, 0, 0, 0, 1, 0, 0, 0,
          86, 83, 80, 86, 20, 0, 0, 0,
          3, 2, 35, 7, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0,
        })) }
      }
      case StyleField.ScrollbarVisibilityX {
        return Style{ ScrollbarVisibilityX: ScrollbarVisibility.Always }
      }
      case StyleField.ScrollbarVisibilityY {
        return Style{ ScrollbarVisibilityY: ScrollbarVisibility.Always }
      }
      case StyleField.ScrollbarX {
        return Style{ ScrollbarX: Scrollbar{ Thumb: Container{} } }
      }
      case StyleField.ScrollbarY {
        return Style{ ScrollbarY: Scrollbar{ Thumb: Container{} } }
      }
      default { return nil }
    }
  }

  private func styleFieldContractPath() VectorPath -> PathBuilder().MoveTo(0.0, 0.0).LineTo(1.0, 0.0).LineTo(1.0, 1.0).Close().Build()

  private func near(a float64, b float64) bool {
    let d = a - b
    return (d < 0.0 ? -d : d) < 0.0001
  }

  private func matchesCard(node Node, label string, theme CompositionTokens) bool {
    if node.Kind != NodeKind.Container
      || node.PaddingLeft.Unit != theme.Padding.Unit || node.PaddingLeft.Value != theme.Padding.Value
      || node.PaddingTop.Unit != theme.Padding.Unit || node.PaddingTop.Value != theme.Padding.Value
      || node.PaddingRight.Unit != theme.Padding.Unit || node.PaddingRight.Value != theme.Padding.Value
      || node.PaddingBottom.Unit != theme.Padding.Unit || node.PaddingBottom.Value != theme.Padding.Value
      || !sameColor(node.BackgroundColor, theme.Surface) || node.Children.Count != 1 {
        return false
      }
    let text = node.Children[0]
    return text.Kind == NodeKind.Text && text.Content == label && sameColor(text.Color, theme.Foreground)
  }

  private func sameColor(left Color, right Color) bool -> left.R == right.R && left.G == right.G && left.B == right.B && left.A == right.A
}

internal data struct CompositionTokens {
  internal var Surface Color
  internal var Foreground Color
  internal var Padding Length
}

internal data struct CompositionCellInput {
  internal var Theme CompositionTokens
  internal var Label string
}

internal func tokenCard(label string) Container -> compositionCard(Tokens.Get[CompositionTokens](), label)

internal func tokenCell(label string) Blob {
  let theme = Tokens.Get[CompositionTokens]()
  return Cell.Mount[CompositionCellInput, CompositionCell](
    nil,
    CompositionCellInput{ Theme: theme, Label: label })
}

internal func compositionCard(theme CompositionTokens, label string) Container -> Container() {.Padding: theme.Padding,.BackgroundColor: theme.Surface,
  Text{ Content: label, Color: theme.Foreground},
}

internal class CompositionCell : Cell[CompositionCellInput] {
  override func Build() Blob -> compositionCard(Input.Theme, Input.Label)
}
