package Goo

import System

internal class ScrollbarFixtures {
  func GeometryRenderingAndVisibilityContract() bool {
    let root = mountScrollViewport(false, ScrollbarVisibility.Always, nil)
    var vertical ScrollThumbGeometry
    if !verticalScrollThumb(root, out vertical)
      || vertical.Bounds.X != 94.0F || vertical.Bounds.Y != 2.0F
      || vertical.Bounds.W != 4.0F || vertical.Bounds.H != 32.0F
      || vertical.Maximum != 200.0F {
        return false
      }
    let compiler = VulkanSceneCompiler(64)
    compiler.Compile(root, Color.Transparent, 100.0F, 100.0F)
    if compiler.Frame.RoundedBoxCount != 1 { return false }
    root.ScrollbarVisibility = ScrollbarVisibility.Hidden
    compiler.Compile(root, Color.Transparent, 100.0F, 100.0F)
    if compiler.Frame.RoundedBoxCount != 0 { return false }
    root.ScrollbarVisibility = ScrollbarVisibility.Auto
    root.ScrollBarAlpha = 0.0F
    compiler.Compile(root, Color.Transparent, 100.0F, 100.0F)
    if compiler.Frame.RoundedBoxCount != 0 { return false }
    root.ScrollBarAlpha = 1.0F
    compiler.Compile(root, Color.Transparent, 100.0F, 100.0F)
    return compiler.Frame.RoundedBoxCount == 1
  }

  func PointerDragAndCancellationContract() bool {
    var presses int32
    let root = mountScrollViewport(false, ScrollbarVisibility.Always,
      func() { presses++ })
    let resolver = Resolver{}
    let input = InputCoordinator()
    input.AfterTreeUpdated(root, resolver, true)
    input.QueuePointerPress(96.0F, 10.0F, PointerButton.Primary, KeyModifiers{})
    input.QueuePointerMove(96.0F, 66.0F, KeyModifiers{})
    input.QueuePointerRelease(96.0F, 66.0F, PointerButton.Primary, KeyModifiers{})
    if !input.Drain(root, resolver, 0.0, nil)
      || root.ScrollY < 174.0F || root.ScrollY > 176.0F
      || root.ScrollTargetY != root.ScrollY || presses != 0
      || !input.ConsumeScrollRectsDirty() {
        return false
      }

    let horizontal = mountScrollViewport(true, ScrollbarVisibility.Always, nil)
    input.AfterTreeUpdated(horizontal, resolver, true)
    input.QueuePointerPress(10.0F, 96.0F, PointerButton.Primary, KeyModifiers{})
    input.QueuePointerMove(66.0F, 96.0F, KeyModifiers{})
    input.QueuePointerRelease(66.0F, 96.0F, PointerButton.Primary, KeyModifiers{})
    if !input.Drain(horizontal, resolver, 1.0, nil)
      || horizontal.ScrollX < 174.0F || horizontal.ScrollX > 176.0F
      || horizontal.ScrollTargetX != horizontal.ScrollX{
        return false
      }

    let hidden = mountScrollViewport(false, ScrollbarVisibility.Hidden, nil)
    input.AfterTreeUpdated(hidden, resolver, true)
    input.QueuePointerPress(96.0F, 10.0F, PointerButton.Primary, KeyModifiers{})
    input.QueuePointerMove(96.0F, 66.0F, KeyModifiers{})
    input.QueuePointerRelease(96.0F, 66.0F, PointerButton.Primary, KeyModifiers{})
    input.Drain(hidden, resolver, 2.0, nil)
    if hidden.ScrollY != 0.0F { return false }

    let canceled = mountScrollViewport(false, ScrollbarVisibility.Always, nil)
    input.AfterTreeUpdated(canceled, resolver, true)
    input.QueuePointerPress(96.0F, 10.0F, PointerButton.Primary, KeyModifiers{})
    input.Drain(canceled, resolver, 3.0, nil)
    input.QueuePointerCancel(0, PointerDevice.Mouse)
    input.QueuePointerMove(96.0F, 66.0F, KeyModifiers{})
    input.Drain(canceled, resolver, 4.0, nil)
    if canceled.ScrollY != 0.0F { return false }

    let touch = mountScrollViewport(false, ScrollbarVisibility.Always, nil)
    input.AfterTreeUpdated(touch, resolver, true)
    input.QueuePointerPress(101, PointerDevice.Touch, 96.0F, 10.0F,
      PointerButton.Primary, KeyModifiers{})
    input.QueuePointerMove(0, PointerDevice.Mouse, 20.0F, 20.0F, KeyModifiers{})
    input.QueuePointerMove(101, PointerDevice.Touch, 96.0F, 66.0F, KeyModifiers{})
    input.QueuePointerRelease(101, PointerDevice.Touch, 96.0F, 66.0F,
      PointerButton.Primary, KeyModifiers{})
    input.Drain(touch, resolver, 5.0, nil)
    if touch.ScrollY < 174.0F || touch.ScrollY > 176.0F { return false }

    let retired = mountScrollViewport(false, ScrollbarVisibility.Always, nil)
    input.AfterTreeUpdated(retired, resolver, true)
    input.QueuePointerPress(96.0F, 10.0F, PointerButton.Primary, KeyModifiers{})
    input.Drain(retired, resolver, 6.0, nil)
    retired.Retired = true
    input.AfterTreeUpdated(retired, resolver, true)
    input.QueuePointerMove(96.0F, 66.0F, KeyModifiers{})
    input.Drain(retired, resolver, 7.0, nil)
    return retired.ScrollY == 0.0F
  }

  func WarmDragBytes() int64 {
    let root = mountScrollViewport(false, ScrollbarVisibility.Always, nil)
    let resolver = Resolver{}
    let input = InputCoordinator()
    input.AfterTreeUpdated(root, resolver, true)
    input.QueuePointerPress(96.0F, 10.0F, PointerButton.Primary, KeyModifiers{})
    input.Drain(root, resolver, 0.0, nil)
    for i in 0 ... 32 {
      let y = (i & 1) == 0 ? 40.0F : 70.0F
      input.QueuePointerMove(96.0F, y, KeyModifiers{})
      input.Drain(root, resolver, 0.0, nil)
      input.ConsumeScrollRectsDirty()
    }
    let before = GC.GetAllocatedBytesForCurrentThread()
    for i in 0 ... 256 {
      let y = (i & 1) == 0 ? 40.0F : 70.0F
      input.QueuePointerMove(96.0F, y, KeyModifiers{})
      input.Drain(root, resolver, 0.0, nil)
      input.ConsumeScrollRectsDirty()
    }
    let allocated = GC.GetAllocatedBytesForCurrentThread() - before
    input.QueuePointerRelease(96.0F, 70.0F, PointerButton.Primary, KeyModifiers{})
    input.Drain(root, resolver, 0.0, nil)
    return allocated
  }

  func PublicMetricsAndJumpContract() bool {
    let handle = ElementHandle{}
    let cell = ScrollbarPublicCell(handle)
    let window = Window{ Root: cell, Width: 100, Height: 100 }
    var latest ElementMetrics
    handle.MetricsChanged += func(metrics ElementMetrics) { latest = metrics }
    window.UpdateTree()
    let scrollRangeValue = handle.ScrollRange
    if scrollRangeValue.X != 0.0 || scrollRangeValue.Y != 200.0
      || latest.ScrollRange.X != 0.0 || latest.ScrollRange.Y != 200.0 {
        return false
      }
    if !handle.JumpTo(0.0, 125.0) { return false }
    window.UpdateTree()
    if handle.ScrollOffset.Y != 125.0 || latest.ScrollOffset.Y != 125.0 { return false }
    if handle.ScrollTo(0.0, 200.0) == false { return false }
    window.UpdateTree(1.0)
    if handle.ScrollOffset.Y != 200.0 { return false }
    return !window.UpdateTree(2.0)
  }

  private func mountScrollViewport(horizontal bool, visibility ScrollbarVisibility,
    onPointerDown Action?) Node{
      let viewport = Container() {.Width: 100.0,.Height: 100.0,.OverflowX: horizontal ? Overflow.Scroll : Overflow.Hidden,.OverflowY: horizontal ? Overflow.Hidden : Overflow.Scroll,.ScrollbarVisibility: visibility,.OnPointerDown: func(event PointerEvent) { onPointerDown?.Invoke() },
      Container{
            Width: horizontal ? 300.0 : 100.0,
            Height: horizontal ? 100.0 : 300.0,
            FlexShrink: 0.0,
        },
      }
      let root = Reconciler{ Res: Resolver{} }.Mount(viewport)
      Layout().Calculate(root, 100.0F, 100.0F)
      return root
    }
}

internal class ScrollbarPublicCell(handle ElementHandle) : Cell {
  override func Build() Blob -> Container() {.Handle: handle,.Width: 100.0,.Height: 100.0,.OverflowY: Overflow.Scroll,.ScrollbarVisibility: ScrollbarVisibility.Always,
    Container{ Width: 100.0, Height: 300.0, FlexShrink: 0.0 },
    }
}
