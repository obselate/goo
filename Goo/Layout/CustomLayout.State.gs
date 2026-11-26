package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices

internal struct CustomLayoutChild {
  internal var Node Node
  internal var Bounds ElementRect
  internal var Arranged bool
}

internal class CustomLayoutState {
  internal let Node Node
  internal var Algorithm LayoutAlgorithm
  internal let Children List[CustomLayoutChild] = List[CustomLayoutChild]()
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
  private var activeState FlexThreadState?
  private var activeFrame uint64

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
    let nodeCount = Node.Children.Count
    var same = true
    var slot = 0
    for i in 0 ... nodeCount {
      let child = Node.Children[i]
      if child.IsPortal { continue }
      if slot >= Children.Count || Children[slot].Node != child {
        same = false
        break
      }
      slot++
    }
    if same && slot == Children.Count { return }
    Children.Clear()
    for i in 0 ... nodeCount {
      let child = Node.Children[i]
      if !child.IsPortal {
        Children.Add(CustomLayoutChild{Node: child})
      }
    }
    Invalidate()
  }

  internal func ChildInvalidated() {
    if !Active { version++ }
  }

  internal func ChildCount() int32 {
    RequireActive()
    return Children.Count
  }

  internal func EffectiveDirection() Direction {
    RequireActive()
    if Node.LogicalLayout.Valid { return Node.LogicalLayout.Direction }
    return Node.Direction == Direction.Auto ? Direction.LeftToRight : Node.Direction
  }

  internal func EffectiveDensity() float64 {
    RequireActive()
    return float64(CustomLayouts.Density)
  }

  internal func ChildDisplay(index int32) Display -> Child(index).Node.Display

  internal func TryGetChildTrait[T any](index int32, key LayoutKey[T], out value T) bool {
    if key == nil { throw ArgumentNullException("key") }
    let child = Child(index)
    return LayoutTraits.TryGetNode(child.Node, key, out value)
  }

  internal func ChildTrait[T any](index int32, key LayoutKey[T]) T {
    TryGetChildTrait(index, key, out var value)
    return value
  }

  private func RequireActive() {
    if !Active || Node.Retired || activeThreadId != Environment.CurrentManagedThreadId { throw InvalidOperationException("${Algorithm.GetType().Name} used an inactive LayoutContext or the wrong thread: use the context only inside its current Measure or Arrange callback.") }
  }

  private func Child(index int32) CustomLayoutChild {
    RequireActive()
    if index < 0 || index >= Children.Count { throw ArgumentOutOfRangeException("index") }
    return Children[index]
  }

  private func Begin(isArrange bool, state FlexThreadState, frame uint64) {
    if Active || CustomLayouts.Depth >= 64 { throw InvalidOperationException("${Algorithm.GetType().Name} reentered custom layout or exceeded 64 nested panels: remove recursive layout calls or reduce panel nesting.") }
    Active = true
    activeThreadId = Environment.CurrentManagedThreadId
    arranging = isArrange
    activeState = state
    activeFrame = frame
    calls = 0
    CustomLayouts.Depth++
  }

  private func End() {
    CustomLayouts.Depth--
    Active = false
    arranging = false
    activeState = nil
    activeFrame = 0uL
  }

  internal func Measure(available LayoutSize, state FlexThreadState, frame uint64) LayoutSize {
    SyncChildren()
    Begin(false, state, frame)
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

  private func validateConstraint(constraint LayoutConstraint) {
    if constraint.Mode == LayoutMeasureMode.AtMost || constraint.Mode == LayoutMeasureMode.Exactly {
      if !Double.IsFinite(constraint.Size) || constraint.Size < 0.0 || constraint.Size > float64(Single.MaxValue) {
        throw ArgumentOutOfRangeException("constraint")
      }
    } else if constraint.Mode != LayoutMeasureMode.Unbounded && constraint.Mode != LayoutMeasureMode.MinContent {
      throw ArgumentOutOfRangeException("constraint")
    }
  }

  private func flexConstraint(constraint LayoutConstraint, margin float32) FlexConstraint -> switch constraint.Mode {
    case LayoutMeasureMode.Exactly: FlexConstraint.Exact(float32(constraint.Size) - margin)
    case LayoutMeasureMode.AtMost: FlexConstraint.Cap(float32(constraint.Size) - margin)
    case LayoutMeasureMode.MinContent: FlexConstraint.Minimum()
    case _: FlexConstraint{}
  }

  private func ownerBasis(constraint LayoutConstraint) float32 ->
    constraint.Mode == LayoutMeasureMode.AtMost || constraint.Mode == LayoutMeasureMode.Exactly
    ? float32(constraint.Size) : Single.NaN

  private func measureCore(
    index int32,
    width LayoutConstraint,
    height LayoutConstraint,
    wantBaseline bool,
    out baseline float64?
  ) LayoutSize {
    let child = Child(index)
    validateConstraint(width)
    validateConstraint(height)
    calls++
    if calls > Math.Min(65536, Math.Max(32, Children.Count * 16)) { throw InvalidOperationException("${Algorithm.GetType().Name}.MeasureChild exceeded the measurement budget for child $index after $calls calls: bound measurement loops and reuse measured sizes.") }
    let n = child.Node
    if n.Display == Display.None {
      baseline = nil
      return LayoutSize(0.0, 0.0)
    }
    let engine = FlexLayoutEngine.Shared
    let ownerW = ownerBasis(width)
    let ownerH = ownerBasis(height)
    var request = engine.RootRequest(ownerW, ownerH, CustomLayouts.Density, Node.Direction)
    request.Override = FlexOverride.Capped
    request.Baseline = wantBaseline
    let margin = engine.ResolveMargins(n, in request)
    request.Width = flexConstraint(width, margin.Sum(true))
    request.Height = flexConstraint(height, margin.Sum(false))
    let threadState = activeState ?? FlexThreadState.Current()
    let savedTop = threadState.Arena.Top
    var measured FlexSize
    try {
      measured = engine.Solve(n, ref request, false, activeFrame, threadState)
    } finally {
      threadState.Arena.Release(savedTop)
    }
    baseline = if wantBaseline && measured.TextBaseline { float64(margin.Top + measured.Baseline) } else { nil }
    var w = float64(measured.Width + margin.Sum(true))
    var h = float64(measured.Height + margin.Sum(false))
    if width.Mode == LayoutMeasureMode.AtMost { w = Math.Min(w, width.Size) }
    if height.Mode == LayoutMeasureMode.AtMost { h = Math.Min(h, height.Size) }
    return LayoutSize(Math.Max(0.0, w), Math.Max(0.0, h))
  }

  internal func MeasureChild(index int32, available LayoutSize) LayoutSize {
    CustomLayouts.ValidateSize(available, true)
    return measureCore(
      index,
      LayoutConstraint.AtMost(available.Width),
      LayoutConstraint.AtMost(available.Height),
      false,
      out var ignored
    )
  }

  internal func MeasureChild(index int32, width LayoutConstraint, height LayoutConstraint) LayoutSize ->
    measureCore(index, width, height, false, out var ignored)

  internal func MeasureChildBaseline(index int32, width LayoutConstraint, height LayoutConstraint) float64? {
    measureCore(index, width, height, true, out var baseline)
    return baseline
  }

  internal func ArrangeChild(index int32, bounds ElementRect) {
    let child = Child(index)
    if !arranging { throw InvalidOperationException("${Algorithm.GetType().Name}.ArrangeChild($index) ran during Measure: call ArrangeChild only from Arrange.") }
    if child.Arranged { throw InvalidOperationException("${Algorithm.GetType().Name}.ArrangeChild($index) ran twice: arrange each child exactly once per Arrange callback.") }
    CustomLayouts.ValidateSize(LayoutSize(bounds.Width, bounds.Height), false)
    if !Double.IsFinite(bounds.X) || !Double.IsFinite(bounds.Y) || Math.Abs(bounds.X) > float64(Single.MaxValue) || Math.Abs(bounds.Y) > float64(Single.MaxValue) {
      throw ArgumentOutOfRangeException("bounds")
    }
    Children[index] = CustomLayoutChild{Node: child.Node, Bounds: bounds, Arranged: true}
  }

  internal func Arrange(state FlexThreadState, frame uint64) {
    SyncChildren()
    let logical = Node.LogicalLayout
    let width = MathF.Max(0.0F, logical.Snapped.W - logical.Border.Sum(true) - logical.Padding.Sum(true))
    let height = MathF.Max(0.0F, logical.Snapped.H - logical.Border.Sum(false) - logical.Padding.Sum(false))
    let density = logical.Density
    if arrangedVersion == version && arrangedWidth == float64(width)
      && arrangedHeight == float64(height) && arrangedDensity == density { return }
    Begin(true, state, frame)
    try {
      arrangedVersion = 0L
      for i in 0 ... Children.Count {
        var child = Children[i]
        child.Arranged = false
        Children[i] = child
      }
      availableSize = LayoutSize(float64(width), float64(height))
      Algorithm.Arrange(context, availableSize)
      ContentWidth = 0.0F
      ContentHeight = 0.0F
      for i in 0 ... Children.Count {
        let child = Children[i]
        if !child.Arranged { throw InvalidOperationException("${Algorithm.GetType().Name}.Arrange omitted a child with key '${child.Node.Key ?? "<unkeyed>"}': call ArrangeChild once for every child.") }
        CustomLayouts.ArrangeRoot(child.Node, child.Bounds, Node.Direction, density, state, frame)
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

    internal func State(node Node) CustomLayoutState? -> node.RetainedCustomLayout

    internal func Configure(node Node, algorithm LayoutAlgorithm?) bool {
      let current = node.RetainedCustomLayout
      if let selected = algorithm {
        if let state = current {
          if Object.ReferenceEquals(state.Algorithm, selected) { return false }
          state.Algorithm = selected
          state.Invalidate()
        } else {
          node.RetainedCustomLayout = CustomLayoutState(node, selected)
          FlexLayoutEngine.Invalidate(node)
        }
        return true
      }
      guard let state = current else { return false }
      if state.Active { throw InvalidOperationException("${state.Algorithm.GetType().Name} changed its custom layout during a callback: defer the change until Measure or Arrange returns.") }
      FlexLayoutEngine.Invalidate(node)
      node.RetainedCustomLayout = nil
      return true
    }

    internal func ValidateSize(value LayoutSize, unbounded bool) {
      if !ValidDimension(value.Width, unbounded) || !ValidDimension(value.Height, unbounded) {
        throw ArgumentOutOfRangeException("size", "Layout sizes must be nonnegative and fit finite layout coordinates; only constraints permit positive infinity")
      }
    }

    private func ValidDimension(value float64, unbounded bool) bool -> value >= 0.0 && (value <= float64(Single.MaxValue) || (unbounded && Double.IsPositiveInfinity(value)))
    internal func Constraint(value float64) float32 -> if Double.IsPositiveInfinity(value) { Single.NaN } else { float32(value) }
    internal func ArrangeRoot(
      node Node,
      bounds ElementRect,
      direction Direction,
      density float32,
      state FlexThreadState,
      frame uint64
    ) {
      let engine = FlexLayoutEngine.Shared
      let width = float32(bounds.Width)
      let height = float32(bounds.Height)
      var request = engine.RootRequest(width, height, density, direction)
      let margin = engine.ResolveMargins(node, in request)
      request.Override = FlexOverride.AssignedBox
      request.Width = FlexConstraint.Exact(width - margin.Sum(true))
      request.Height = FlexConstraint.Exact(height - margin.Sum(false))
      engine.ArrangeSubtreeWithState(node, ref request, frame, state)
    }
  }
}
