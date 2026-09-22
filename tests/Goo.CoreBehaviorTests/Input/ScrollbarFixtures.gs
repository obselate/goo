package Goo

import System

internal class ScrollbarFixtures {
  func DescriptorGeometryAndVisibilityContract() bool {
    var zeroRejected bool
    var nonFiniteRejected bool
    var overflowRejected bool
    try {
      let ignored = Scrollbar{ Thickness: 0.0 }
    } catch (error ArgumentOutOfRangeException) {
      zeroRejected = error.ParamName == "Thickness"
    }
    try {
      let ignored = Scrollbar{ FadeMs: Double.NaN }
    } catch (error ArgumentOutOfRangeException) {
      nonFiniteRejected = error.ParamName == "FadeMs"
    }
    try {
      let ignored = Scrollbar{ HitThickness: Double.MaxValue }
    } catch (error ArgumentOutOfRangeException) {
      overflowRejected = error.ParamName == "HitThickness"
    }
    if !zeroRejected || !nonFiniteRejected || !overflowRejected { return false }
    let descriptor = scrollbar(8.0, 20.0, 3.0, 40.0, false)
    let root = mountScrollViewportWith(nil, descriptor,
      ScrollbarVisibility.Auto, ScrollbarVisibility.Always, 100.0, 300.0)
    var vertical ScrollThumbGeometry
    if root.Children.Count != 1 || root.ScrollbarX != nil || root.ScrollbarY != descriptor
      || !verticalScrollThumb(root, out vertical)
      || vertical.TrackBounds.X != 89.0F || vertical.TrackBounds.Y != 3.0F
      || vertical.TrackBounds.W != 8.0F || vertical.TrackBounds.H != 94.0F
      || vertical.Bounds.X != 89.0F || vertical.Bounds.Y != 3.0F
      || vertical.Bounds.W != 8.0F || vertical.Bounds.H != 40.0F
      || vertical.HitBounds.X != 83.0F || vertical.HitBounds.W != 17.0F
      || vertical.Maximum != 200.0F || root.ScrollBarAlpha != 1.0F {
        return false
      }
    let parts = ScrollbarParts.Children(root)
    if parts.Count != 2 || ScrollbarParts.ActiveChildren(root).Count != 2 {
      return false
    }
    var hasTrack bool
    var hasThumb bool
    for part in parts {
      if part.Rect.X == vertical.TrackBounds.X && part.Rect.Y == vertical.TrackBounds.Y
        && part.Rect.W == vertical.TrackBounds.W && part.Rect.H == vertical.TrackBounds.H {
          hasTrack = true
        }
      if part.Rect.X == vertical.Bounds.X && part.Rect.Y == vertical.Bounds.Y
        && part.Rect.W == vertical.Bounds.W && part.Rect.H == vertical.Bounds.H {
          hasThumb = true
        }
    }
    if !hasTrack || !hasThumb { return false }

    let hiddenRoot = mountScrollViewportWith(nil, descriptor,
      ScrollbarVisibility.Auto, ScrollbarVisibility.Hidden, 100.0, 300.0)
    if verticalScrollThumb(hiddenRoot, out vertical) || hiddenRoot.ScrollBarAlpha != 0.0F
      || ScrollbarParts.ActiveChildren(hiddenRoot).Count != 0 {
        return false
      }

    let nilRoot = mountScrollViewportWith(nil, nil,
      ScrollbarVisibility.Always, ScrollbarVisibility.Always, 100.0, 300.0)
    if verticalScrollThumb(nilRoot, out vertical) || nilRoot.ScrollBarAlpha != 0.0F
      || ScrollbarParts.Children(nilRoot).Count != 0 {
        return false
      }

    let shorthandDescriptor = scrollbar(6.0, 12.0, 2.0, 24.0, false)
    let shorthand = Reconciler{ Res: Resolver{} }.Mount(Container{
      Width: 100.0,
      Height: 100.0,
      Overflow: Overflow.Scroll,
      Scrollbar: shorthandDescriptor,
      ScrollbarVisibility: ScrollbarVisibility.Always,
      Container{ Width: 300.0, Height: 300.0, FlexShrink: 0.0 },
    })
    Layout().Calculate(shorthand, 100.0F, 100.0F)
    return shorthand.ScrollbarX == shorthandDescriptor
      && shorthand.ScrollbarY == shorthandDescriptor
      && shorthand.ScrollbarVisibilityX == ScrollbarVisibility.Always
      && shorthand.ScrollbarVisibilityY == ScrollbarVisibility.Always
      && ScrollbarParts.Children(shorthand).Count == 4
  }

  func ThumbDragHitThicknessAndCancellationContract() bool {
    let root = mountScrollViewport(false, ScrollbarVisibility.Always)
    let resolver = Resolver{}
    let input = InputCoordinator()
    input.AfterTreeUpdated(root, resolver, true)
    input.QueuePointerPress(91.0F, 10.0F, PointerButton.Primary, KeyModifiers{})
    input.QueuePointerMove(91.0F, 66.0F, KeyModifiers{})
    input.QueuePointerRelease(91.0F, 66.0F, PointerButton.Primary, KeyModifiers{})
    if !input.Drain(root, resolver, 0.0, nil)
      || root.ScrollY < 174.0F || root.ScrollY > 176.0F
      || root.ScrollTargetY != root.ScrollY {
        return false
      }

    let canceled = mountScrollViewport(false, ScrollbarVisibility.Always)
    input.AfterTreeUpdated(canceled, resolver, true)
    input.QueuePointerPress(91.0F, 10.0F, PointerButton.Primary, KeyModifiers{})
    input.Drain(canceled, resolver, 1.0, nil)
    input.QueuePointerCancel(0, PointerDevice.Mouse)
    input.QueuePointerMove(91.0F, 66.0F, KeyModifiers{})
    input.Drain(canceled, resolver, 2.0, nil)
    return canceled.ScrollY == 0.0F && canceled.ScrollTargetY == 0.0F
  }

  func TrackPagingAndPreventDefaultContract() bool {
    let paged = mountScrollViewport(false, ScrollbarVisibility.Always)
    let resolver = Resolver{}
    let input = InputCoordinator()
    input.AfterTreeUpdated(paged, resolver, true)
    input.QueuePointerPress(96.0F, 80.0F, PointerButton.Primary, KeyModifiers{})
    input.Drain(paged, resolver, 0.0, nil)
    if paged.ScrollTargetY != 100.0F || paged.ScrollY != 0.0F {
      return false
    }

    var presses int32
    let prevented = Reconciler{ Res: Resolver{} }.Mount(Container{
      Width: 100.0,
      Height: 100.0,
      OverflowY: Overflow.Scroll,
      ScrollbarY: scrollbar(4.0, 10.0, 2.0, 24.0, false),
      ScrollbarVisibilityY: ScrollbarVisibility.Always,
      OnPointerDown: (e PointerEvent) -> {
        presses++
        e.PreventDefault()
      },
      Container{ Width: 100.0, Height: 300.0, FlexShrink: 0.0 },
    })
    Layout().Calculate(prevented, 100.0F, 100.0F)
    let preventedInput = InputCoordinator()
    let preventedResolver = Resolver{}
    preventedInput.AfterTreeUpdated(prevented, preventedResolver, true)
    preventedInput.QueuePointerPress(96.0F, 80.0F, PointerButton.Primary, KeyModifiers{})
    preventedInput.Drain(prevented, preventedResolver, 0.0, nil)
    return presses == 1 && prevented.ScrollTargetY == 0.0F && prevented.ScrollY == 0.0F
  }

  func AutoHoverAndFadeContract() bool {
    let descriptor = fadingScrollbar()
    let window = Window{ Root: ScrollbarFadeCell(descriptor), Width: 100, Height: 100 }
    window.UpdateTree()
    guard let root = window.Tree else { return false }
    if root.ScrollBarAlpha != 0.0F || ScrollbarParts.ActiveChildren(root).Count != 0 {
      return false
    }

    window.InputForTest.QueuePointerMove(96.0F, 10.0F)
    window.DrainQueuedInputForTest()
    if root.ScrollBarAlpha != 1.0F || ScrollbarParts.ActiveChildren(root).Count != 2 {
      return false
    }
    window.UpdateTree(0.1)
    if root.ScrollBarAlpha != 1.0F { return false }

    window.InputForTest.QueuePointerMove(10.0F, 10.0F)
    window.DrainQueuedInputForTest()
    window.UpdateTree(0.05)
    if root.ScrollBarAlpha != 1.0F { return false }
    window.UpdateTree(0.05)
    if root.ScrollBarAlpha < 0.49F || root.ScrollBarAlpha > 0.51F {
      return false
    }
    window.UpdateTree(0.05)
    return root.ScrollBarAlpha == 0.0F && ScrollbarParts.ActiveChildren(root).Count == 0
  }

  func ReservedGutterAndCoupledAxesContract() bool {
    let horizontal = scrollbar(6.0, 14.0, 4.0, 20.0, true)
    let vertical = scrollbar(8.0, 18.0, 3.0, 20.0, true)
    let root = mountScrollViewportWith(horizontal, vertical,
      ScrollbarVisibility.Always, ScrollbarVisibility.Auto, 95.0, 300.0)
    if scrollViewportWidth(root) != 89.0F || scrollViewportHeight(root) != 90.0F
      || maxScrollX(root) != 6.0F || maxScrollY(root) != 210.0F {
        return false
      }
    var horizontalGeometry ScrollThumbGeometry
    var verticalGeometry ScrollThumbGeometry
    if !horizontalScrollThumb(root, out horizontalGeometry)
      || !verticalScrollThumb(root, out verticalGeometry)
      || horizontalGeometry.TrackBounds.X != 4.0F
      || horizontalGeometry.TrackBounds.Y != 90.0F
      || horizontalGeometry.TrackBounds.W != 81.0F
      || horizontalGeometry.TrackBounds.H != 6.0F
      || verticalGeometry.TrackBounds.X != 89.0F
      || verticalGeometry.TrackBounds.Y != 3.0F
      || verticalGeometry.TrackBounds.W != 8.0F
      || verticalGeometry.TrackBounds.H != 84.0F {
        return false
      }
    if scrollViewportWidth(root) != 89.0F { return false }
    let hiddenRoot = mountScrollViewportWith(horizontal, vertical,
      ScrollbarVisibility.Always, ScrollbarVisibility.Hidden, 300.0, 300.0)
    if scrollViewportWidth(hiddenRoot) != 100.0F || maxScrollX(hiddenRoot) != 200.0F
      || !horizontalScrollThumb(hiddenRoot, out horizontalGeometry)
      || horizontalGeometry.TrackBounds.W != 92.0F
      || verticalScrollThumb(hiddenRoot, out verticalGeometry) {
        return false
      }
    let paddedBar = scrollbar(8.0, 18.0, 4.0, 20.0, true)
    let padded = Reconciler{ Res: Resolver{} }.Mount(Container{
      Width: 100.0,
      Height: 100.0,
      Padding: EdgeLengths{ Right: 14.0 },
      OverflowY: Overflow.Scroll,
      ScrollbarY: paddedBar,
      ScrollbarVisibilityY: ScrollbarVisibility.Always,
      Container{ Width: 86.0, Height: 300.0, FlexShrink: 0.0 },
    })
    Layout().Calculate(padded, 100.0F, 100.0F)
    if scrollViewportWidth(padded) != 86.0F
      || !verticalScrollThumb(padded, out verticalGeometry)
      || verticalGeometry.TrackBounds.X != 88.0F
      || verticalGeometry.TrackBounds.X + verticalGeometry.TrackBounds.W != 96.0F {
        return false
      }
    return true
  }

  func MountedPartHandleAndCallbackContract() bool {
    let trackHandle = ElementHandle{}
    let thumbHandle = ElementHandle{}
    var trackPresses int32
    var thumbPresses int32
    let descriptor = Scrollbar{
      Thickness: 4.0,
      HitThickness: 10.0,
      Inset: 2.0,
      MinThumbLength: 24.0,
      Track: Container{
        Handle: trackHandle,
        OnPointerDown: (e PointerEvent) -> {
          trackPresses++
          e.PreventDefault()
        },
      },
      Thumb: Container{
        Handle: thumbHandle,
        OnPointerDown: (e PointerEvent) -> thumbPresses++,
      },
    }
    let root = mountScrollViewportWith(nil, descriptor,
      ScrollbarVisibility.Auto, ScrollbarVisibility.Always, 100.0, 300.0)
    guard let track = trackHandle.AttachedNode(), let thumb = thumbHandle.AttachedNode() else {
      return false
    }
    if track.Parent != root || thumb.Parent != root || track == thumb
      || root.Children.Count != 1 || ScrollbarParts.Children(root).Count != 2
      || !trackHandle.IsMounted || !thumbHandle.IsMounted {
        return false
      }

    let resolver = Resolver{}
    let input = InputCoordinator()
    input.AfterTreeUpdated(root, resolver, true)
    input.QueuePointerPress(96.0F, 80.0F, PointerButton.Primary, KeyModifiers{})
    input.Drain(root, resolver, 0.0, nil)
    input.QueuePointerRelease(96.0F, 80.0F, PointerButton.Primary, KeyModifiers{})
    input.Drain(root, resolver, 0.0, nil)
    if trackPresses != 1 || root.ScrollTargetY != 0.0F { return false }

    input.QueuePointerPress(96.0F, 10.0F, PointerButton.Primary, KeyModifiers{})
    input.QueuePointerMove(96.0F, 66.0F, KeyModifiers{})
    input.QueuePointerRelease(96.0F, 66.0F, PointerButton.Primary, KeyModifiers{})
    input.Drain(root, resolver, 1.0, nil)
    return thumbPresses == 1 && root.ScrollY > 0.0F
  }

  func WarmDragBytes() int64 {
    let root = mountScrollViewport(false, ScrollbarVisibility.Always)
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
    return if handle.ScrollOffset.Y != 200.0 { false } else { !window.UpdateTree(2.0) }
  }

  private func mountScrollViewport(horizontal bool, visibility ScrollbarVisibility) Node {
    let descriptor = scrollbar(4.0, 10.0, 2.0, 24.0, false)
    return mountScrollViewportWith(
      horizontal ? descriptor : nil,
      horizontal ? nil : descriptor,
      horizontal ? visibility : ScrollbarVisibility.Auto,
      horizontal ? ScrollbarVisibility.Auto : visibility,
      horizontal ? 300.0 : 100.0,
      horizontal ? 100.0 : 300.0)
  }

  private func mountScrollViewportWith(descriptorX Scrollbar?, descriptorY Scrollbar?,
    visibilityX ScrollbarVisibility, visibilityY ScrollbarVisibility,
    contentWidth float64, contentHeight float64) Node{
      let viewport = Container{
        Width: 100.0,
        Height: 100.0,
        OverflowX: descriptorX != nil ? Overflow.Scroll : Overflow.Hidden,
        OverflowY: descriptorY != nil ? Overflow.Scroll : Overflow.Hidden,
        ScrollbarX: descriptorX,
        ScrollbarY: descriptorY,
        ScrollbarVisibilityX: visibilityX,
        ScrollbarVisibilityY: visibilityY,
        Container{
          Width: contentWidth,
          Height: contentHeight,
          FlexShrink: 0.0,
        },
      }
      let root = Reconciler{ Res: Resolver{} }.Mount(viewport)
      Layout().Calculate(root, 100.0F, 100.0F)
      return root
    }

  private func scrollbar(thickness float64, hitThickness float64, inset float64,
    minThumbLength float64, reserveSpace bool) Scrollbar ->
    Scrollbar{
      Thickness: thickness,
      HitThickness: hitThickness,
      Inset: inset,
      MinThumbLength: minThumbLength,
      HideDelayMs: 1000.0,
      FadeMs: 250.0,
      ReserveSpace: reserveSpace,
      Track: Container{ BackgroundColor: Color.Rgb(20, 30, 40) },
      Thumb: Container{ BackgroundColor: Color.Rgb(40, 50, 60) },
    }

  private func fadingScrollbar() Scrollbar ->
    Scrollbar{
      Thickness: 4.0,
      HitThickness: 10.0,
      Inset: 2.0,
      MinThumbLength: 24.0,
      HideDelayMs: 50.0,
      FadeMs: 100.0,
      Track: Container{ BackgroundColor: Color.Rgb(20, 30, 40) },
      Thumb: Container{ BackgroundColor: Color.Rgb(40, 50, 60) },
    }
}

internal class ScrollbarPublicCell(handle ElementHandle) : Cell {
  override func Build() Blob -> Container{
    Width: 100.0,
    Height: 100.0,
    Handle: handle,
    OverflowY: Overflow.Scroll,
    ScrollbarVisibilityY: ScrollbarVisibility.Always,
    ScrollbarY: Scrollbar{
      Thickness: 4.0,
      HitThickness: 10.0,
      Inset: 2.0,
      MinThumbLength: 24.0,
      HideDelayMs: 1000.0,
      FadeMs: 250.0,
      ReserveSpace: false,
      Track: Container{ BackgroundColor: Color.Rgb(20, 30, 40) },
      Thumb: Container{ BackgroundColor: Color.Rgb(40, 50, 60) },
    },
    Container{ Width: 100.0, Height: 300.0, FlexShrink: 0.0 },
  }
}

internal class ScrollbarFadeCell(descriptor Scrollbar) : Cell {
  override func Build() Blob -> Container{
    Width: 100.0,
    Height: 100.0,
    OverflowY: Overflow.Scroll,
    ScrollbarY: descriptor,
    ScrollbarVisibilityY: ScrollbarVisibility.Auto,
    Container{ Width: 100.0, Height: 300.0, FlexShrink: 0.0 },
  }
}
