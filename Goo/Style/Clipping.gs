package Goo

import System.Runtime.CompilerServices

internal class ClipPaths {
  shared {
    private var values ConditionalWeakTable[Node, ClipPathValue]?

    // Nil means no clip. Fit-only state remains available through Fit.
    internal func Get(n Node) ClipPathValue? {
      if !n.HasClipPath {
        return nil
      }
      guard let value = state(n) else { return nil }
      return value.Path.CommandCount == 0 ? nil : value
    }

    internal func Path(n Node) VectorPath {
      if let value = Get(n) { return value.Path }
      return VectorPath.Empty
    }

    internal func Fit(n Node) ShapeFit {
      if let value = state(n) { return value.Fit }
      return ShapeFit.Fill
    }

    internal func FillRule(n Node) FillRule {
      if let value = state(n) { return value.FillRule }
      return n.ClipPathFillRule
    }

    internal func SetPath(n Node, path VectorPath) {
      if let value = state(n) {
        value.Path = path
        n.HasClipPath = path.CommandCount != 0
        prune(n, value)
        return
      }
      if path.CommandCount == 0 {
        n.HasClipPath = false
        return
      }
      n.HasClipPath = true
      add(n, ClipPathValue{ Path: path, Fit: ShapeFit.Fill, FillRule: n.ClipPathFillRule })
    }

    internal func SetFit(n Node, fit ShapeFit) {
      if let value = state(n) {
        value.Fit = fit
        prune(n, value)
        return
      }
      if fit == ShapeFit.Fill {
        return
      }
      add(n, ClipPathValue{ Fit: fit })
    }

    internal func SetFillRule(n Node, fillRule FillRule) {
      n.ClipPathFillRule = fillRule
      if let value = state(n) {
        value.FillRule = fillRule
        prune(n, value)
        return
      }
      if fillRule == FillRule.NonZero {
        return
      }
      add(n, ClipPathValue{ FillRule: fillRule })
    }

    private func state(n Node) ClipPathValue? {
      guard let table = values else { return nil }
      return if table.TryGetValue(n, out var value) { value } else { nil }
    }

    private func add(n Node, value ClipPathValue) {
      if values == nil { values = ConditionalWeakTable[Node, ClipPathValue]() }
      values?.Add(n, value)
    }

    private func prune(n Node, value ClipPathValue) {
      if value.Path.CommandCount != 0 || value.Fit != ShapeFit.Fill
        || value.FillRule != FillRule.NonZero{
          return
        }
      values?.Remove(n)
      n.HasClipPath = false
    }
  }
}

internal class ClipPathValue {
  internal var Path VectorPath
  internal var Fit ShapeFit
  internal var FillRule FillRule

  internal init() {
    Path = VectorPath.Empty
    Fit = ShapeFit.Fill
    FillRule = FillRule.NonZero
  }
}
