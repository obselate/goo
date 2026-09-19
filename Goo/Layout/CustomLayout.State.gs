package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices
import Facebook.Yoga

internal data struct CustomMeasure {
  internal var Width float64
  internal var Height float64
  internal var Result LayoutSize
  internal var Version int64
}

internal class CustomLayoutChild {
  internal var Node Node
  internal var Bounds ElementRect
  internal var Arranged bool
  internal var Cache List[CustomMeasure]?
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
  internal var ContentWidth float32
  internal var ContentHeight float32

  internal init(node Node, algorithm LayoutAlgorithm) {
    Node = node
    Algorithm = algorithm
    context = LayoutContext(this)
  }

  internal func Invalidate() {
    version++
    if let yoga = Node.Yoga { YGNodeAPI.YGNodeMarkDirty(yoga) }
  }

  internal func SyncChildren() {
    let count = Portals.LayoutChildCount(Node)
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
    for child in Children {
      if let yoga = child.Node.Yoga {
        YGNodeAPI.YGNodeSetContext(yoga, child.Node)
        YGNodeAPI.YGNodeSetDirtiedFunc(yoga, CustomLayouts.ChildDirty)
      }
    }
  }

  internal func ChildCount() int32 {
    RequireActive()
    return Children.Length
  }

  private func RequireActive() {
    if !Active || Node.Retired || activeThreadId != Environment.CurrentManagedThreadId { throw InvalidOperationException("LayoutContext is valid only on the thread running its current layout callback") }
  }

  private func Child(index int32) CustomLayoutChild {
    RequireActive()
    if index < 0 || index >= Children.Length { throw ArgumentOutOfRangeException("index") }
    return Children[index]
  }

  private func Begin(isArrange bool) {
    if Active || CustomLayouts.Depth >= 64 { throw InvalidOperationException("Custom layout is cyclic or exceeds 64 nested panels") }
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
    Begin(false)
    try {
      let result = Algorithm.Measure(context, available)
      CustomLayouts.ValidateSize(result, false)
      return LayoutSize{Width: Math.Min(result.Width, available.Width), Height: Math.Min(result.Height, available.Height)}
    } finally { End() }
  }

  internal func MeasureChild(index int32, available LayoutSize) LayoutSize {
    let child = Child(index)
    CustomLayouts.ValidateSize(available, true)
    calls++
    if calls > Math.Min(65536, Math.Max(32, Children.Length * 16)) { throw InvalidOperationException("Custom layout exceeded its child measurement budget") }
    if let cache = child.Cache {
      for entry in cache {
        if entry.Version == version && entry.Width == available.Width && entry.Height == available.Height { return entry.Result }
      }
    }
    let n = child.Node
    guard let yoga = n.Yoga else { throw InvalidOperationException("Custom layout child has no retained layout") }
    arrangedVersion = 0L
    CustomLayouts.RestoreSize(n)
    let width = CustomLayouts.Constraint(available.Width)
    let height = CustomLayouts.Constraint(available.Height)
    YGNodeStyleAPI.YGNodeStyleSetMaxWidth(yoga, CustomLayouts.Maximum(n.MaxWidth, width, width))
    YGNodeStyleAPI.YGNodeStyleSetMaxHeight(yoga, CustomLayouts.Maximum(n.MaxHeight, height, height))
    YGNodeAPI.YGNodeCalculateLayout(yoga, width, height, yogaDirection(Node.Direction))
    let desiredWidth = YGNodeLayoutAPI.YGNodeLayoutGetWidth(yoga) + CustomLayouts.MarginX(yoga)
    let desiredHeight = YGNodeLayoutAPI.YGNodeLayoutGetHeight(yoga) + CustomLayouts.MarginY(yoga)
    let result = LayoutSize{
      Width: Math.Max(0.0, Math.Min(float64(desiredWidth), available.Width)),
      Height: Math.Max(0.0, Math.Min(float64(desiredHeight), available.Height)),
    }
    CustomLayouts.ValidateSize(result, false)
    child.Cache ??= List[CustomMeasure](4)
    let cache = child.Cache!!
    if cache.Count == 4 { cache.RemoveAt(0) }
    cache.Add(CustomMeasure{Width: available.Width, Height: available.Height, Result: result, Version: version})
    return result
  }

  internal func ArrangeChild(index int32, bounds ElementRect) {
    let child = Child(index)
    if !arranging { throw InvalidOperationException("ArrangeChild is allowed only during Arrange") }
    if child.Arranged { throw InvalidOperationException("A custom layout child was arranged more than once") }
    CustomLayouts.ValidateSize(LayoutSize{Width: bounds.Width, Height: bounds.Height}, false)
    if !Double.IsFinite(bounds.X) || !Double.IsFinite(bounds.Y) || Math.Abs(bounds.X) > float64(Single.MaxValue) || Math.Abs(bounds.Y) > float64(Single.MaxValue) {
      throw ArgumentOutOfRangeException("bounds")
    }
    child.Bounds = bounds
    child.Arranged = true
  }

  internal func Arrange() {
    guard let yoga = Node.Yoga else { return }
    let left = CustomLayouts.Inset(yoga, YGEdge.Left)
    let top = CustomLayouts.Inset(yoga, YGEdge.Top)
    let right = CustomLayouts.Inset(yoga, YGEdge.Right)
    let bottom = CustomLayouts.Inset(yoga, YGEdge.Bottom)
    let width = Math.Max(0.0F, Node.Rect.W - left - right)
    let height = Math.Max(0.0F, Node.Rect.H - top - bottom)
    if arrangedVersion == version && arrangedWidth == float64(width) && arrangedHeight == float64(height) { return }
    Begin(true)
    try {
      arrangedVersion = 0L
      for child in Children { child.Arranged = false }
      Algorithm.Arrange(context, LayoutSize{Width: float64(width), Height: float64(height)})
      ContentWidth = left + right
      ContentHeight = top + bottom
      for child in Children {
        if !child.Arranged { throw InvalidOperationException("Custom layout must arrange every child exactly once") }
        CustomLayouts.ArrangeRoot(child.Node, child.Bounds, Node.Direction)
        if let childYoga = child.Node.Yoga {
          let x = left + float32(child.Bounds.X) + YGNodeLayoutAPI.YGNodeLayoutGetLeft(childYoga)
          let y = top + float32(child.Bounds.Y) + YGNodeLayoutAPI.YGNodeLayoutGetTop(childYoga)
          ContentWidth = Math.Max(ContentWidth, x + YGNodeLayoutAPI.YGNodeLayoutGetWidth(childYoga) + right)
          ContentHeight = Math.Max(ContentHeight, y + YGNodeLayoutAPI.YGNodeLayoutGetHeight(childYoga) + bottom)
        }
      }
      if !Single.IsFinite(ContentWidth) || !Single.IsFinite(ContentHeight) { throw InvalidOperationException("Custom layout content extent overflowed") }
      arrangedWidth = float64(width)
      arrangedHeight = float64(height)
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
        }
        return true
      }
      guard let state = current else { return false }
      if state.Active { throw InvalidOperationException("Custom layout cannot change during its callback") }
      if let yoga = node.Yoga {
        YGNodeAPI.YGNodeMarkDirty(yoga)
        YGNodeAPI.YGNodeSetMeasureFunc(yoga, nil)
      }
      for child in state.Children {
        if let yoga = child.Node.Yoga { YGNodeAPI.YGNodeSetDirtiedFunc(yoga, nil) }
        RestoreSize(child.Node)
      }
      nodes?.Remove(node)
      node.HasCustomLayout = false
      return true
    }

    internal func ChildDirty(yoga Facebook.Yoga.Node) {
      guard let child = YGNodeAPI.YGNodeGetContext(yoga) as Node, let parent = child.Parent, let state = State(parent) else { return }
      if !state.Active { state.Invalidate() }
    }

    internal func Measure(yoga Facebook.Yoga.Node, width float32, widthMode MeasureMode,
      height float32, heightMode MeasureMode) YGSize{
        let node = nodeFromYoga(yoga)
        guard let state = State(node) else { throw InvalidOperationException("Custom layout policy is missing") }
        let available = LayoutSize{
          Width: if widthMode == MeasureMode.Undefined { Double.PositiveInfinity } else { float64(Math.Max(0.0F, width)) },
          Height: if heightMode == MeasureMode.Undefined { Double.PositiveInfinity } else { float64(Math.Max(0.0F, height)) },
        }
        let result = state.Measure(available)
        return YGSize{Width: float32(result.Width), Height: float32(result.Height)}
      }

    internal func ValidateSize(value LayoutSize, unbounded bool) {
      if !ValidDimension(value.Width, unbounded) || !ValidDimension(value.Height, unbounded) {
        throw ArgumentOutOfRangeException("size", "Layout sizes must be nonnegative and fit finite layout coordinates; only constraints permit positive infinity")
      }
    }

    private func ValidDimension(value float64, unbounded bool) bool -> value >= 0.0 && (value <= float64(Single.MaxValue) || (unbounded && Double.IsPositiveInfinity(value)))
    internal func Constraint(value float64) float32 -> if Double.IsPositiveInfinity(value) { Single.NaN } else { float32(value) }
    internal func Inset(yoga Facebook.Yoga.Node, edge YGEdge) float32 -> YGNodeLayoutAPI.YGNodeLayoutGetPadding(yoga, edge) + YGNodeLayoutAPI.YGNodeLayoutGetBorder(yoga, edge)
    internal func MarginX(yoga Facebook.Yoga.Node) float32 -> YGNodeLayoutAPI.YGNodeLayoutGetMargin(yoga, YGEdge.Left) + YGNodeLayoutAPI.YGNodeLayoutGetMargin(yoga, YGEdge.Right)
    internal func MarginY(yoga Facebook.Yoga.Node) float32 -> YGNodeLayoutAPI.YGNodeLayoutGetMargin(yoga, YGEdge.Top) + YGNodeLayoutAPI.YGNodeLayoutGetMargin(yoga, YGEdge.Bottom)
    internal func Maximum(length Length, available float32, reference float32) float32 {
      let authored = if length.Unit == LengthUnit.Px { length.Value } else if length.Unit == LengthUnit.Percent { length.Value * reference / 100.0F } else { Single.NaN }
      if Single.IsNaN(available) { return authored }
      return if Single.IsNaN(authored) { available } else { Math.Min(authored, available) }
    }

    internal func RestoreSize(node Node) {
      guard let yoga = node.Yoga else { return }
      // Native overrides are private to a custom-layout root; reset all six dimensions from authored state.
      YGNodeStyleAPI.YGNodeStyleSetWidthAuto(yoga)
      YGNodeStyleAPI.YGNodeStyleSetHeightAuto(yoga)
      YGNodeStyleAPI.YGNodeStyleSetMinWidth(yoga, Single.NaN)
      YGNodeStyleAPI.YGNodeStyleSetMinHeight(yoga, Single.NaN)
      YGNodeStyleAPI.YGNodeStyleSetMaxWidth(yoga, Single.NaN)
      YGNodeStyleAPI.YGNodeStyleSetMaxHeight(yoga, Single.NaN)
      applySize(yoga, node)
      applyMinMax(yoga, node)
    }

    internal func ArrangeRoot(node Node, bounds ElementRect, direction Direction) {
      guard let yoga = node.Yoga else { return }
      if node.Display == Display.None {
        YGNodeAPI.YGNodeCalculateLayout(yoga, 0.0F, 0.0F, yogaDirection(direction))
        return
      }
      // Resolve margins under the final available width before assigning the border box.
      RestoreSize(node)
      let width = float32(bounds.Width)
      let height = float32(bounds.Height)
      YGNodeStyleAPI.YGNodeStyleSetMaxWidth(yoga, width)
      YGNodeStyleAPI.YGNodeStyleSetMaxHeight(yoga, height)
      YGNodeAPI.YGNodeCalculateLayout(yoga, width, height, yogaDirection(direction))
      let borderWidth = Math.Max(0.0F, width - MarginX(yoga))
      let borderHeight = Math.Max(0.0F, height - MarginY(yoga))
      YGNodeStyleAPI.YGNodeStyleSetMinWidth(yoga, Single.NaN)
      YGNodeStyleAPI.YGNodeStyleSetMinHeight(yoga, Single.NaN)
      YGNodeStyleAPI.YGNodeStyleSetMaxWidth(yoga, Single.NaN)
      YGNodeStyleAPI.YGNodeStyleSetMaxHeight(yoga, Single.NaN)
      YGNodeStyleAPI.YGNodeStyleSetWidth(yoga, borderWidth)
      YGNodeStyleAPI.YGNodeStyleSetHeight(yoga, borderHeight)
      YGNodeAPI.YGNodeCalculateLayout(yoga, width, height, yogaDirection(direction))
    }
  }
}
