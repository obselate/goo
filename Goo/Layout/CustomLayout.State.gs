package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices

internal class CustomLayoutChild {
  internal var Node Node
  internal var Bounds ElementRect
  internal var Arranged bool
}

internal class CustomLayoutState {
  internal let Node Node
  internal var Algorithm LayoutAlgorithm
  internal var Children []CustomLayoutChild = []CustomLayoutChild{}
  internal var Active bool
  private let context LayoutContext
  private var arranging bool
  private var activeThreadId int32
  private var calls int32
  private var version int64 = 1L
  private var arrangedVersion int64
  private var arrangedWidth float64 = -1.0
  private var arrangedHeight float64 = -1.0
  private var arrangedDensity float32
  internal var ContentWidth float32
  internal var ContentHeight float32
  private var availableSize LayoutSize

  internal init(node Node, algorithm LayoutAlgorithm) {
    Node = node
    Algorithm = algorithm
    context = LayoutContext(this)
  }

  internal func Invalidate() {
    version++
    FlexLayoutEngine.Invalidate(Node)
  }

  internal func SyncChildren() {
    let count = Portals.SourceChildCount(Node)
    var changed = Children.Length != count
    if !changed {
      var index int32
      for child in Node.Children {
        if !child.IsPortal && Children[index].Node != child {
          changed = true
          break
        }
        if !child.IsPortal { index++ }
      }
    }
    if changed {
      let old = Dictionary[Node, CustomLayoutChild]()
      for child in Children { old[child.Node] = child }
      let next = [count]CustomLayoutChild
      var index int32
      for child in Node.Children {
        if !child.IsPortal {
          next[index] = if old.TryGetValue(child, out var retained) { retained } else { CustomLayoutChild{Node: child} }
          index++
        }
      }
      Children = next
      Invalidate()
    }
  }

  internal func ChildInvalidated() {
    if !Active { version++ }
  }

  internal func ChildCount() int32 {
    RequireActive()
    return Children.Length
  }

  private func RequireActive() {
    if !Active || Node.Retired || activeThreadId != Environment.CurrentManagedThreadId { throw InvalidOperationException("${Algorithm.GetType().Name} used an inactive LayoutContext or the wrong thread: use the context only inside its current Measure or Arrange callback.") }
  }

  private func Child(index int32) CustomLayoutChild {
    RequireActive()
    if index < 0 || index >= Children.Length { throw ArgumentOutOfRangeException("index") }
    return Children[index]
  }

  private func Begin(isArrange bool) {
    if Active || CustomLayouts.Depth >= 64 { throw InvalidOperationException("${Algorithm.GetType().Name} reentered custom layout or exceeded 64 nested panels: remove recursive layout calls or reduce panel nesting.") }
    Active = true
    activeThreadId = Environment.CurrentManagedThreadId
    arranging = isArrange
    calls = 0
    CustomLayouts.Depth++
  }

  private func End() {
    CustomLayouts.Depth--
    Active = false
    arranging = false
  }

  internal func Measure(available LayoutSize) LayoutSize {
    SyncChildren()
    Begin(false)
    try {
      availableSize = available
      let result = Algorithm.Measure(context, available)
      CustomLayouts.ValidateSize(result, false)
      return LayoutSize(Math.Min(result.Width, available.Width), Math.Min(result.Height, available.Height))
    } finally { End() }
  }

  internal func ResolveLength(value Length, axis LayoutAxis) float64? {
    RequireActive()
    if axis != LayoutAxis.Horizontal && axis != LayoutAxis.Vertical { throw ArgumentOutOfRangeException("axis") }
    if value.Unit == LengthUnit.Auto || value.IsIntrinsic { return nil }
    if !value.IsFinite { throw ArgumentOutOfRangeException("value") }
    let basis = float32(axis == LayoutAxis.Horizontal ? availableSize.Width : availableSize.Height)
    let percent = value.Unit == LengthUnit.Percent ? value.Value : value.PercentPart
    if percent != 0.0F && !Single.IsFinite(basis) { return nil }
    return float64(LengthDeclarations.Pixels(value.Unit == LengthUnit.Percent ? Length{} : value, Node,
      CustomLayouts.ViewportWidth, CustomLayouts.ViewportHeight, false)
      + (percent == 0.0F ? 0.0F : percent * basis / 100.0F))
  }

  internal func MeasureChild(index int32, available LayoutSize) LayoutSize {
    let child = Child(index)
    CustomLayouts.ValidateSize(available, true)
    calls++
    if calls > Math.Min(65536, Math.Max(32, Children.Length * 16)) { throw InvalidOperationException("${Algorithm.GetType().Name}.MeasureChild exceeded the measurement budget for child $index after $calls calls: bound measurement loops and reuse measured sizes.") }
    let n = child.Node
    let engine = FlexLayoutEngine.Shared
    let width = CustomLayouts.Constraint(available.Width)
    let height = CustomLayouts.Constraint(available.Height)
    var request = engine.RootRequest(width, height, CustomLayouts.Density, Node.Direction)
    request.Override = FlexOverride.Capped
    let margin = engine.ResolveBox(n, in request).Margin
    request.Width = FlexConstraint.Cap(width - margin.Sum(true))
    request.Height = FlexConstraint.Cap(height - margin.Sum(false))
    let measured = engine.MeasureSubtree(n, request)
    return LayoutSize(
      Math.Max(0.0, Math.Min(float64(measured.Width + margin.Sum(true)), available.Width)),
      Math.Max(0.0, Math.Min(float64(measured.Height + margin.Sum(false)), available.Height)))
  }

  internal func ArrangeChild(index int32, bounds ElementRect) {
    let child = Child(index)
    if !arranging { throw InvalidOperationException("${Algorithm.GetType().Name}.ArrangeChild($index) ran during Measure: call ArrangeChild only from Arrange.") }
    if child.Arranged { throw InvalidOperationException("${Algorithm.GetType().Name}.ArrangeChild($index) ran twice: arrange each child exactly once per Arrange callback.") }
    CustomLayouts.ValidateSize(LayoutSize(bounds.Width, bounds.Height), false)
    if !Double.IsFinite(bounds.X) || !Double.IsFinite(bounds.Y) || Math.Abs(bounds.X) > float64(Single.MaxValue) || Math.Abs(bounds.Y) > float64(Single.MaxValue) {
      throw ArgumentOutOfRangeException("bounds")
    }
    child.Bounds = bounds
    child.Arranged = true
  }

  internal func Arrange() {
    SyncChildren()
    let width = BoxGeometry.ContentWidth(Node, true)
    let height = BoxGeometry.ContentHeight(Node, true)
    let density = Node.LogicalLayout.Density
    if arrangedVersion == version && arrangedWidth == float64(width)
      && arrangedHeight == float64(height) && arrangedDensity == density { return }
    Begin(true)
    try {
      arrangedVersion = 0L
      for child in Children { child.Arranged = false }
      availableSize = LayoutSize(float64(width), float64(height))
      Algorithm.Arrange(context, availableSize)
      ContentWidth = 0.0F
      ContentHeight = 0.0F
      for child in Children {
        if !child.Arranged { throw InvalidOperationException("${Algorithm.GetType().Name}.Arrange omitted a child with key '${child.Node.Key ?? "<unkeyed>"}': call ArrangeChild once for every child.") }
        CustomLayouts.ArrangeRoot(child.Node, child.Bounds, Node.Direction, density)
        let rect = child.Node.LogicalLayout.Snapped
        ContentWidth = Math.Max(ContentWidth, float32(child.Bounds.X) + rect.X + rect.W)
        ContentHeight = Math.Max(ContentHeight, float32(child.Bounds.Y) + rect.Y + rect.H)
      }
      if !Single.IsFinite(ContentWidth) || !Single.IsFinite(ContentHeight) { throw InvalidOperationException("Custom layout content extent overflowed") }
      arrangedWidth = float64(width)
      arrangedHeight = float64(height)
      arrangedDensity = density
      arrangedVersion = version
    } finally { End() }
  }
}

internal class CustomLayouts {
  shared {
    private var blobs ConditionalWeakTable[Container, LayoutAlgorithm]?
    private var nodes ConditionalWeakTable[Node, CustomLayoutState]?
    @ThreadStatic
    internal var Depth int32
    @ThreadStatic
    internal var ViewportWidth float32
    @ThreadStatic
    internal var ViewportHeight float32
    @ThreadStatic
    internal var Density float32

    internal func Remove(node Node) {
      Configure(node, nil)
    }

    internal func BlobValue(blob Container) LayoutAlgorithm? {
      if let values = blobs {
        if values.TryGetValue(blob, out var value) { return value }
      }
      return nil
    }

    internal func SetBlobValue(blob Container, algorithm LayoutAlgorithm?) {
      blobs?.Remove(blob)
      if let value = algorithm {
        blobs ??= ConditionalWeakTable[Container, LayoutAlgorithm]()
        blobs?.Add(blob, value)
      }
    }

    internal func State(node Node) CustomLayoutState? {
      if !node.HasCustomLayout { return nil }
      if let values = nodes {
        if values.TryGetValue(node, out var state) { return state }
      }
      return nil
    }

    internal func Configure(node Node, algorithm LayoutAlgorithm?) bool {
      let current = State(node)
      if let selected = algorithm {
        if let state = current {
          if Object.ReferenceEquals(state.Algorithm, selected) { return false }
          state.Algorithm = selected
          state.Invalidate()
        } else {
          nodes ??= ConditionalWeakTable[Node, CustomLayoutState]()
          nodes?.Add(node, CustomLayoutState(node, selected))
          node.HasCustomLayout = true
          FlexLayoutEngine.Invalidate(node)
        }
        return true
      }
      guard let state = current else { return false }
      if state.Active { throw InvalidOperationException("${state.Algorithm.GetType().Name} changed its custom layout during a callback: defer the change until Measure or Arrange returns.") }
      FlexLayoutEngine.Invalidate(node)
      nodes?.Remove(node)
      node.HasCustomLayout = false
      return true
    }

    internal func ValidateSize(value LayoutSize, unbounded bool) {
      if !ValidDimension(value.Width, unbounded) || !ValidDimension(value.Height, unbounded) {
        throw ArgumentOutOfRangeException("size", "Layout sizes must be nonnegative and fit finite layout coordinates; only constraints permit positive infinity")
      }
    }

    private func ValidDimension(value float64, unbounded bool) bool -> value >= 0.0 && (value <= float64(Single.MaxValue) || (unbounded && Double.IsPositiveInfinity(value)))
    internal func Constraint(value float64) float32 -> if Double.IsPositiveInfinity(value) { Single.NaN } else { float32(value) }
    internal func ArrangeRoot(node Node, bounds ElementRect, direction Direction, density float32) {
      let engine = FlexLayoutEngine.Shared
      let width = float32(bounds.Width)
      let height = float32(bounds.Height)
      var request = engine.RootRequest(width, height, density, direction)
      let margin = engine.ResolveBox(node, in request).Margin
      request.Override = FlexOverride.AssignedBox
      request.Width = FlexConstraint.Exact(width - margin.Sum(true))
      request.Height = FlexConstraint.Exact(height - margin.Sum(false))
      engine.ArrangeSubtree(node, request)
    }
  }
}
