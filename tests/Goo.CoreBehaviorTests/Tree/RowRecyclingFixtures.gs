package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices

internal class RowRecyclingFixtures {
  func ReusesStorageAndResetsKeyScopedStateContract() bool {
    let cell = RecyclingViewportCell()
    let adapter = AccessibilityTestAdapter()
    let window = Window{Root: cell, Size: LayoutSize(100, 20), }
    window.AccessibilityAdapter = adapter
    try {
      window.UpdateTree()
      guard let first = cell.Current, let inner = first.Inner,
        let body = cell.Handles[0].AttachedNode(), let wrapper = body.Parent,
        let viewport = cell.Viewport.AttachedNode(), let state = Virtualization.State(viewport),
        let semantic = AccessibilityNodeStates.Get(body) else { return false }
      let bodyYoga = body.Yoga
      let label = body.Children[0]
      let labelYoga = label.Yoga
      let stale = NodeMount(body)
      let identity = semantic.Id
      first.Local = 7
      inner.Local = 9
      inner.Rebuild()
      window.UpdateTree()
      if body.Children[0].Content != "0:7:9" { return false }
      cell.Viewport.JumpTo(0.0, 20.0)
      window.UpdateTree()
      if first.Disposals != 1 || inner.Disposals != 1 || !inner.Animation.IsDisposed
        || state.RecycledRowCount != 1 || stale.Current != nil { return false }
      cell.Viewport.JumpTo(0.0, 40.0)
      window.UpdateTree()
      guard let current = cell.Current, let currentInner = current.Inner,
        let rebound = cell.Handles[2].AttachedNode(),
        let reboundSemantic = AccessibilityNodeStates.Get(rebound) else { return false }
      if rebound != body || rebound.Parent != wrapper || rebound.Yoga != bodyYoga
        || rebound.Children[0] != label || label.Yoga != labelYoga
        || stale.Captured != nil || rebound.MountGeneration != 2uL
        || current == first || currentInner == inner || current.Local != 0 || currentInner.Local != 0
        || rebound.Children[0].Content != "2:0:0" || reboundSemantic.Id == identity {
        return false
      }
      first.Local = 99
      first.Rebuild()
      inner.Rebuild()
      window.UpdateTree()
      window.PlatformInput.PointerPress(0L, PointerDevice.Mouse, 5.0F, 5.0F,
        PointerButton.Primary, KeyModifiers{}, 1.0F)
      window.PlatformInput.PointerRelease(0L, PointerDevice.Mouse, 5.0F, 5.0F,
        PointerButton.Primary, KeyModifiers{}, 1.0F)
      if cell.Clicked != 2 || rebound.Children[0].Content != "2:0:0" { return false }
      cell.Viewport.JumpTo(0.0, 0.0)
      window.UpdateTree()
      guard let returned = cell.Current, let returnedInner = returned.Inner else { return false }
      return returned != first && returnedInner != inner && returned.Local == 0 && returnedInner.Local == 0
        && cell.Handles[0].AttachedNode()?.Children[0].Content == "0:0:0"
        && state.RecycledRowCount <= 1 && state.RecycledNodeCount <= 3
        && state.RecycledStorageBytes <= 1048576
    } finally { window.Close() }
  }

  func DisposesRunningAnimationBeforeStorageRebindContract() bool {
    let cell = RecyclingViewportCell()
    let window = Window{Root: cell, Size: LayoutSize(100, 20), }
    try {
      window.UpdateTree()
      guard let initial = cell.Current?.Inner, let body = cell.Handles[0].AttachedNode() else { return false }
      let animation = initial.Animation
      animation.To(0.0, Motion.Tween(1000.0))
      window.UpdateTree(0.1)
      if !animation.Running || body.Opacity >= 1.0 { return false }
      cell.Viewport.JumpTo(0.0, 20.0)
      window.UpdateTree()
      if !animation.IsDisposed || animation.Running { return false }
      cell.Viewport.JumpTo(0.0, 40.0)
      window.UpdateTree()
      if cell.Handles[2].AttachedNode() != body || body.Opacity != 1.0 { return false }
      try { animation.Set(0.2) } catch (_ ObjectDisposedException) { }
      window.UpdateTree(0.5)
      if body.Opacity != 1.0 { return false }
      cell.Viewport.JumpTo(0.0, 0.0)
      window.UpdateTree()
      guard let returned = cell.Current?.Inner else { return false }
      return returned != initial && returned.Animation != animation && !returned.Animation.IsDisposed
        && !returned.Animation.Running && returned.Animation.Value == 1.0
    } finally { window.Close() }
  }

  func ExcludesFocusedAndEditingRowsContract() bool {
    for editing in []bool{false, true} {
      let cell = RecyclingViewportCell{Editing: editing}
      let window = Window{Root: cell, Size: LayoutSize(100, 20), }
      try {
        window.UpdateTree()
        guard let first = cell.Handles[0].AttachedNode() else { return false }
        if !editing && !cell.Handles[0].Focus() { return false }
        if editing {
          if !cell.Handles[0].Focus() { return false }
          window.InputForTest.QueueText("changed")
          window.DrainQueuedInputForTest()
          if first.Buffer == "0" { return false }
        }
        cell.Viewport.JumpTo(0.0, 20.0)
        window.UpdateTree()
        guard let second = cell.Handles[1].AttachedNode() else { return false }
        cell.Viewport.JumpTo(0.0, 40.0)
        window.UpdateTree()
        if cell.Handles[2].AttachedNode() == first || first.MountGeneration != 1uL { return false }
        cell.Viewport.JumpTo(0.0, 0.0)
        window.UpdateTree()
        guard let returned = cell.Handles[0].AttachedNode() else { return false }
        if returned == first || returned.Focused || editing && returned.Buffer != "0" { return false }
        if editing && (returned == second || second.MountGeneration != 1uL) { return false }
      } finally { window.Close() }
    }
    return true
  }

  func ReconcilesChangedShapeAndDrainsSourcePoolContract() bool {
    let cell = RecyclingViewportCell{DifferentShape: true}
    let window = Window{Root: cell, Size: LayoutSize(100, 20), }
    try {
      window.UpdateTree()
      guard let first = cell.Handles[0].AttachedNode(), let wrapper = first.Parent,
        let viewport = cell.Viewport.AttachedNode(), let state = Virtualization.State(viewport) else { return false }
      cell.Viewport.JumpTo(0.0, 20.0)
      window.UpdateTree()
      cell.Viewport.JumpTo(0.0, 40.0)
      window.UpdateTree()
      guard let changed = cell.Handles[2].AttachedNode() else { return false }
      if changed.Parent != wrapper || changed == first || changed.Kind != NodeKind.Text || !first.Retired
        || state.RecycledNodeCount > 2 { return false }
      cell.Viewport.JumpTo(0.0, 60.0)
      window.UpdateTree()
      if state.RecycledRowCount != 1 { return false }
      cell.Source = RecyclingRowsSource(cell)
      cell.Rebuild()
      window.UpdateTree()
      if state.RecycledRowCount != 0 { return false }
      cell.Viewport.JumpTo(0.0, 80.0)
      window.UpdateTree()
      return cell.Handles[4].AttachedNode()?.Parent != wrapper
    } finally { window.Close() }
  }

  func KeepsStorageAcrossOwnerRebuildWithContinuingStateContract() bool {
    let cell = RecyclingViewportCell{FreshSource: true}
    let window = Window{Root: cell, Size: LayoutSize(100, 20), }
    try {
      window.UpdateTree()
      guard let body = cell.Handles[0].AttachedNode(),
        let viewport = cell.Viewport.AttachedNode(), let state = Virtualization.State(viewport) else { return false }
      cell.Viewport.JumpTo(0.0, 20.0)
      window.UpdateTree()
      if state.RecycledRowCount != 1 { return false }
      cell.Rebuild()
      cell.Viewport.JumpTo(0.0, 40.0)
      window.UpdateTree()
      return cell.Handles[2].AttachedNode() == body && body.MountGeneration == 2uL
        && state.RecycledRowCount == 1
    } finally { window.Close() }
  }

  func DiscardsFailedRebindAndReleasesRetiredDataContract() bool {
    let cell = RecyclingViewportCell()
    let window = Window{Root: cell, Size: LayoutSize(100, 20), }
    try {
      window.UpdateTree()
      guard let initial = cell.Handles[0].AttachedNode(), let wrapper = initial.Parent,
        let viewport = cell.Viewport.AttachedNode(), let state = Virtualization.State(viewport) else { return false }
      cell.Viewport.JumpTo(0.0, 20.0)
      window.UpdateTree()
      cell.ThrowIndex = 2
      cell.Viewport.JumpTo(0.0, 40.0)
      var failed = false
      try { window.UpdateTree() } catch (_ InvalidOperationException) { failed = true }
      if !failed || !wrapper.Retired || state.RecycledRowCount != 0 || cell.Handles[2].IsMounted { return false }
      cell.ThrowIndex = -1
      window.UpdateTree()
      if cell.Handles[2].AttachedNode()?.Parent == wrapper { return false }
      let weak = retirePayload(cell, window)
      GC.Collect()
      GC.WaitForPendingFinalizers()
      GC.Collect()
      return !weak.TryGetTarget(out var ignored)
    } finally { window.Close() }
  }

  func ReboundTextMatchesFreshLayoutContract() bool {
    for offset in []int32{0, 2} {
      let recycled = RecyclingViewportCell{DetailedText: true, DataOffset: offset}
      let fresh = RecyclingViewportCell{DetailedText: true, DataOffset: offset}
      let recycledWindow = Window{Root: recycled, Size: LayoutSize(100, 20), }
      let freshWindow = Window{Root: fresh, Size: LayoutSize(100, 20), }
      try {
        recycledWindow.UpdateTree()
        freshWindow.UpdateTree()
        guard let initial = recycled.Handles[0].AttachedNode() else { return false }
        let initialTextWidth = initial.Children[0].Rect.W
        recycled.Viewport.JumpTo(0.0, 20.0)
        recycledWindow.UpdateTree()
        recycled.Viewport.JumpTo(0.0, 40.0)
        recycledWindow.UpdateTree()
        fresh.Viewport.JumpTo(0.0, 40.0)
        freshWindow.UpdateTree()
        guard let actual = recycled.Handles[2].AttachedNode(),
          let expected = fresh.Handles[2].AttachedNode() else { return false }
        if actual.MountGeneration != 2uL || expected.MountGeneration != 1uL
          || !sameLayout(actual, expected) { return false }
        if offset == 2 && expected.Children[0].Rect.W <= initialTextWidth { return false }
      } finally {
        recycledWindow.Close()
        freshWindow.Close()
      }
    }
    return true
  }

  private func sameLayout(actual Node, expected Node) bool {
    if actual.Kind != expected.Kind || actual.Content != expected.Content || actual.Language != expected.Language
      || actual.FontSize.Value != expected.FontSize.Value || actual.FontWeight != expected.FontWeight
      || actual.Direction != expected.Direction || actual.Rect.X != expected.Rect.X || actual.Rect.Y != expected.Rect.Y
      || actual.Rect.W != expected.Rect.W || actual.Rect.H != expected.Rect.H
      || actual.Children.Count != expected.Children.Count { return false }
    for i in 0 ... actual.Children.Count {
      if !sameLayout(actual.Children[i], expected.Children[i]) { return false }
    }
    return true
  }

  @MethodImpl(MethodImplOptions.NoInlining)
  private func retirePayload(cell RecyclingViewportCell, window Window) WeakReference[RecyclingRowData] {
    cell.Viewport.JumpTo(0.0, 100.0)
    window.UpdateTree()
    guard let data = cell.Current?.Item else { throw InvalidOperationException("Missing retired row data") }
    let weak = WeakReference[RecyclingRowData](data)
    cell.Viewport.JumpTo(0.0, 120.0)
    window.UpdateTree()
    cell.Viewport.JumpTo(0.0, 140.0)
    window.UpdateTree()
    return weak
  }
}

internal class RecyclingViewportCell : Cell {
  internal let Viewport ElementHandle = ElementHandle()
  internal let Handles List[ElementHandle] = List[ElementHandle]()
  internal var Source RecyclingRowsSource
  internal var Current RecyclingRowCell?
  internal var Editing bool
  internal var FreshSource bool
  internal var DifferentShape bool
  internal var DetailedText bool
  internal var DataOffset int32
  internal var ThrowIndex int32 = -1
  internal var Clicked int32 = -1

  internal init() {
    for i in 0 ... 100 { Handles.Add(ElementHandle()) }
    Source = RecyclingRowsSource(this)
  }

  override func Build() Blob {
    var source VirtualSource = Source
    if FreshSource { source = RecyclingContinuingSource(Source) }
    return Virtual(){Source = source, Handle = Viewport, Width = 100, Height = 20}
  }
}

internal class RecyclingRowsSource(owner RecyclingViewportCell) : VirtualState, VirtualSource {
  private var index int32 = -1
  private var pendingIndex int32

  public func State(current VirtualState?) VirtualState -> this

  public override func NeedsRealize(viewport VirtualViewport) bool ->
    index != Math.Clamp(int32(viewport.ScrollOffset.Y / 20.0), 0, 99)

  public override func Realize(viewport VirtualViewport, output VirtualOutput) {
    pendingIndex = Math.Clamp(int32(viewport.ScrollOffset.Y / 20.0), 0, 99)
    let item = RecyclingRowData(pendingIndex + owner.DataOffset, owner.Handles[pendingIndex])
    output.Add(VirtualItem{Key: "row-$pendingIndex", Index: pendingIndex,
      Y: float64(pendingIndex) * 20.0, Width: 100, Height: 20,
      Content: Cell.Mount[RecyclingRowCell]("row-$pendingIndex", (row RecyclingRowCell) -> {
        row.Host = owner
        row.Item = item
        owner.Current = row
      })})
    output.ContentSize = LayoutSize(100, 2000)
    output.ItemCount = 100
  }

  public override func Commit() {
    index = pendingIndex
  }
}

internal class RecyclingContinuingSource(state RecyclingRowsSource) : VirtualSource {
  public func State(current VirtualState?) VirtualState -> current ?? state
}

internal class RecyclingRowData(index int32, handle ElementHandle) {
  internal let Index int32 = index
  internal let Handle ElementHandle = handle
}

internal class RecyclingRowCell : Cell, IDisposable {
  internal var Host RecyclingViewportCell?
  internal var Item RecyclingRowData?
  internal var Inner RecyclingInnerCell?
  internal var Local int32
  internal var Disposals int32

  func Dispose() { Disposals++ }

  override func Build() Blob {
    guard let host = Host, let item = Item else { throw InvalidOperationException("Missing row inputs") }
    return Cell.Mount[RecyclingInnerCell](nil, (inner RecyclingInnerCell) -> {
      inner.Host = host
      inner.Item = item
      inner.Outer = this
      Inner = inner
    })
  }
}

internal class RecyclingInnerCell : Cell, IDisposable {
  internal var Host RecyclingViewportCell?
  internal var Item RecyclingRowData?
  internal var Outer RecyclingRowCell?
  internal var Local int32
  internal var Disposals int32
  internal let Animation Anim[float64]

  init() { Animation = Animate(1.0) }

  func Dispose() { Disposals++ }

  override func Build() Blob {
    guard let host = Host, let item = Item, let outer = Outer else {
      throw InvalidOperationException("Missing row inputs")
    }
    if host.ThrowIndex == item.Index { throw InvalidOperationException("Requested row build failure") }
    if host.Editing {
      return TextEntry{Handle: item.Handle, Value: item.Index.ToString(), Width: 100, Height: 20}
    }
    if host.DifferentShape && item.Index == 2 {
      return Text{Key: "body-${item.Index}", Handle: item.Handle, Content: "changed", Width: 100, Height: 20}
    }
    let detailed = host.DetailedText && item.Index >= 2
    return Container(){.Key: "body-${item.Index}", .Handle: item.Handle, .Width: detailed ? 80 : 100, .Height: 20,
      .FontSize: detailed ? 18 : 14, .FontWeight: detailed ? 600 : 400,
      .Language: detailed ? "ar" : "en", .Direction: detailed ? Direction.RightToLeft : Direction.LeftToRight,
      .Focusable: true, .OpacityAnim: Animation, .Accessibility: Accessibility{Role: AccessibilityRole.Button, Name: "row-${item.Index}"},
      .OnClick: () -> { host.Clicked = item.Index },
      host.DetailedText && item.Index == 0
        ? Text{Key: "label-0", Content: "0:0:0", Left: 7, Top: 9, Margin: 3, Padding: 2}
        : Text{Key: "label-${item.Index}", TextWrap: detailed ? TextWrap.Wrap : TextWrap.NoWrap,
          AlignSelf: detailed ? AlignSelf.FlexStart : AlignSelf.Auto,
          Content: detailed ? item.Index == 2 ? "مرحبا" : "مرحبا بالنص المختلف الأطول الذي يمتد على أسطر متعددة" : "${item.Index}:${outer.Local}:$Local"},
    }
  }
}
