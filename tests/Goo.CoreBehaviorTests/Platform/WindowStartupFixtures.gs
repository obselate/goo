package Goo

import System
import System.Collections.Generic
import System.Threading
import System.Threading.Tasks
import System.Reflection
import System.Runtime.InteropServices
import System.Diagnostics

internal class WindowStartupFixtures {
  func CloseCancelsDragBeforeUnmountContract() bool {
    let owner = WindowDragCloseCell()
    let window = Window{Root: owner, Size: LayoutSize(100, 100)}
    try {
      window.UpdateTree()
      guard let tree = window.Tree else { return false }
      if !window.InputForTest.BeginDrag(tree, window.ResolverForTest, tree, default(KeyModifiers)) { return false }
      window.Close()
      return owner.EndCount == 1 && owner.EndedMounted && owner.EndedCancelled
        && !owner.Handle.IsMounted && owner.Cancelled
    } finally { window.Close() }
  }
  func HostedContextOperationCountingContract() bool {
    let previous = SynchronizationContext.Current
    let host = WindowCountingContext()
    SynchronizationContext.SetSynchronizationContext(host)
    let owner = WindowAsyncCell()
    let window = Window{Root: owner, Size: LayoutSize(100, 100)}
    try {
      window.UpdateTree()
      var captured SynchronizationContext?
      owner.RunOwnedAction(() -> {
        captured = SynchronizationContext.Current
        owner.RunHandler()
      })
      if host.Started != 1 || host.Completed != 0 { return false }
      let copy = captured!!.CreateCopy()
      guard let copyHost = host.LastCopy else { return false }
      if copy is not WindowCallbackContext { return false }
      if copy.Owner != owner || copy.Window != window || copy.HostContext != copyHost { return false }
      copy.OperationStarted()
      copy.OperationCompleted()
      var posted int32
      copy.Post(_ -> { posted++ }, nil)
      copyHost.Drain()
      if host.Copies != 1 || copyHost.Started != 1 || copyHost.Completed != 1
        || copyHost.Posts != 1 || posted != 1 { return false }
      owner.ClearDirty()
      owner.Pending.SetResult(true)
      host.Drain()
      return host.Started == 1 && host.Completed == 1 && host.Posts == 1
        && owner.Resumed == 1 && owner.IsDirty() && window.callbackOperations == 0
    } finally {
      window.Close()
      SynchronizationContext.SetSynchronizationContext(previous)
    }
  }

  func AsyncTaskDispatcherContract() bool {
    let previous = SynchronizationContext.Current
    SynchronizationContext.SetSynchronizationContext(nil)
    let window = Window{}
    try {
      let pending = TaskCompletionSource[bool]()
      let pendingTask Task = pending.Task
      var calls int32
      let action = window.InvokeAsync(async () -> {
        await pending.Task
        calls++
      })
      let forwarded = window.InvokeAsync(() -> pendingTask)
      window.drainPostedActions()
      if action.IsCompleted || forwarded.IsCompleted || calls != 0 { return false }
      pending.SetResult(true)
      window.drainPostedActions()
      if !Task.WaitAll([]Task{action, forwarded}, 5000) || calls != 1 { return false }
      let never Task = TaskCompletionSource[bool]().Task
      let cancelled = window.InvokeAsync(() -> never)
      window.drainPostedActions()
      window.Close()
      Task.WhenAny(cancelled, Task.Delay(5000)).GetAwaiter().GetResult()
      return cancelled.IsCanceled
    } finally {
      window.Close()
      SynchronizationContext.SetSynchronizationContext(previous)
    }
  }

  async func HostedOwnerContextContract() Task[bool] {
    let hostContext = SynchronizationContext.Current
    if hostContext == nil || hostContext is WindowCallbackContext { return false }
    let owner = WindowAsyncCell()
    let window = Window{Root: owner, Size: LayoutSize(100, 100)}
    try {
      window.UpdateTree()
      owner.RunOwnedAction(owner.RunHandler)
      owner.ClearDirty()
      if SynchronizationContext.Current != hostContext { return false }
      owner.Pending.SetResult(true)
      let clock = Stopwatch.StartNew()
      while !owner.IsDirty() && clock.ElapsedMilliseconds < 5000 { await Task.Delay(1) }
      if !owner.IsDirty() || owner.Resumed != 1 { return false }
      window.UpdateTree()
      return window.Tree?.Content == "1"
    } finally { window.Close() }
  }

  func EmbeddedCloseRejectsReentrantDisposalContract() bool {
    let previous = SynchronizationContext.Current
    SynchronizationContext.SetSynchronizationContext(nil)
    try {
      let owner = WindowAsyncCell()
      let host = EmbeddedSmokeHost()
      host.Resize(100, 100, 100, 100)
      let window = Window{Root: owner, CloseDrainMs: 10000.0}.Attach(host)
      host.RenderFrame(0.0)
      owner.RunOwnedAction(() -> owner.RunDisposing(host, window))
      owner.Pending.SetResult(true)
      let clock = Stopwatch.StartNew()
      host.Dispose()
      return owner.FinallyCount == 1 && !owner.ClosedDuringReentry
        && window.Closed.IsCancellationRequested && host.Window == nil
        && clock.ElapsedMilliseconds < 5000
    } finally { SynchronizationContext.SetSynchronizationContext(previous) }
  }

  func EmbeddedCloseDrainsContinuationsContract() bool {
    let previous = SynchronizationContext.Current
    SynchronizationContext.SetSynchronizationContext(nil)
    try {
      let owner = WindowAsyncCell()
      let host = EmbeddedSmokeHost()
      host.Resize(100, 100, 100, 100)
      let window = Window{Root: owner}.Attach(host)
      host.RenderFrame(0.0)
      owner.RunOwnedAction(owner.RunHandler)
      go {
        if owner.Closing.Wait(5000) { owner.Pending.TrySetResult(true) }
      }
      host.Dispose()
      return owner.FinallyCount == 1 && owner.ResumeThread == Environment.CurrentManagedThreadId
        && window.Closed.IsCancellationRequested && host.Window == nil
    } finally { SynchronizationContext.SetSynchronizationContext(previous) }
  }

  func AsyncDispatcherContract() bool {
    let window = Window{}
    var calls int32
    let result = window.InvokeAsync[int32](() -> {
      calls++
      return 42
    })
    if result.IsCompleted { return false }
    window.drainPostedActions()
    if !result.Wait(5000) || result.Result != 42 || calls != 1 { return false }
    let failure = window.InvokeAsync(() -> { throw InvalidOperationException("dispatch") })
    window.drainPostedActions()
    try { failure.GetAwaiter().GetResult()
      return false }
    catch (error InvalidOperationException) { if error.Message != "dispatch" { return false } }
    var continuations int32
    let context = window.CallbackContext()
    context.Post(_ -> {
      continuations++
      window.drainPostedActions()
    }, nil)
    context.Post(_ -> { continuations++ }, nil)
    window.drainPostedActions()
    if continuations != 2 { return false }
    var order = ""
    window.Post(() -> { order += "A" })
    context.Post(_ -> { order += "B" }, nil)
    window.Post(() -> { order += "C" })
    context.Post(_ -> { order += "D" }, nil)
    window.drainPostedActions()
    if order != "ABCD" { return false }
    let pending = window.InvokeAsync(() -> { calls++ })
    let presentation = window.NextPresentationAsync()
    window.Close()
    try { pending.GetAwaiter().GetResult()
      return false }
    catch (_ OperationCanceledException) { }
    try { presentation.GetAwaiter().GetResult()
      return false }
    catch (_ OperationCanceledException) { }
    return calls == 1 && !window.Post(() -> { calls++ })
  }

  func AsyncOwnerContextContract() bool {
    let priorContext = SynchronizationContext.Current
    SynchronizationContext.SetSynchronizationContext(nil)
    try {
      let owner = WindowAsyncCell()
    let window = Window{Root: owner, Size: LayoutSize(100, 100)}
    window.UpdateTree()
    owner.RunOwnedAction(owner.RunHandler)
    owner.ClearDirty()
    if SynchronizationContext.Current != nil { return false }
    owner.Pending.SetResult(true)
    window.drainPostedActions()
    if owner.Resumed != 1 || owner.ResumeThread != Environment.CurrentManagedThreadId
      || !owner.IsDirty() { return false }
    let host = SynchronizationContext()
    SynchronizationContext.SetSynchronizationContext(host)
    try {
      let previous = owner.BeginCallback()
      let current = SynchronizationContext.Current
      if current is not WindowCallbackContext { return false }
      if current.HostContext != host { return false }
      owner.EndCallback(previous)
      if SynchronizationContext.Current != host { return false }
    } finally { SynchronizationContext.SetSynchronizationContext(nil) }
    window.Close()
    return true
  } finally {
      SynchronizationContext.SetSynchronizationContext(priorContext)
    }
  }

  func AsyncCloseDrainContract() bool {
    let priorContext = SynchronizationContext.Current
    SynchronizationContext.SetSynchronizationContext(nil)
    try {
    let owner = WindowAsyncCell()
    let window = Window{Root: owner, Size: LayoutSize(100, 100)}
    window.UpdateTree()
    owner.RunOwnedAction(owner.RunCancelled)
      let deadline = Stopwatch.StartNew()
      while !window.Closed.IsCancellationRequested && deadline.ElapsedMilliseconds < 5000 {
        window.Close()
        if !window.Closed.IsCancellationRequested {
          Thread.Sleep(1)
        }
      }
      if owner.FinallyCount != 1 || owner.ResumeThread != Environment.CurrentManagedThreadId
      || !window.Closed.IsCancellationRequested { return false }
    let late = WindowAsyncCell()
    let closing = Window{Root: late, Size: LayoutSize(100, 100), CloseDrainMs: 0.0}
    closing.UpdateTree()
    late.RunOwnedAction(late.RunHandler)
    closing.Close()
    late.Pending.SetResult(true)
    if !late.Finished.Wait(5000) { return false }
    return late.FinallyCount == 1 && late.ResumeThread != Environment.CurrentManagedThreadId
      && !closing.Post(() -> {}) && closing.Closed.IsCancellationRequested
  } finally {
      SynchronizationContext.SetSynchronizationContext(priorContext)
    }
  }

  func AsyncStateContinuationContract() bool {
    let priorContext = SynchronizationContext.Current
    SynchronizationContext.SetSynchronizationContext(nil)
    try {
    let owner = WindowAsyncStateCell()
    let window = Window{Root: owner, Size: LayoutSize(100, 100)}
    window.UpdateTree()
    let unchanged = TaskCompletionSource[bool]()
    owner.RunOwnedAction(() -> owner.Resume(unchanged.Task, false))
    owner.ClearDirty()
    unchanged.SetResult(true)
    window.drainPostedActions()
    if owner.IsDirty() { return false }
    let changed = TaskCompletionSource[bool]()
    owner.RunOwnedAction(() -> owner.Resume(changed.Task, true))
    changed.SetResult(true)
    window.drainPostedActions()
    let dirty = owner.IsDirty()
    window.Close()
    return dirty
  } finally {
      SynchronizationContext.SetSynchronizationContext(priorContext)
    }
  }

  func LateFileDialogCompletionContract() bool {
    let window = Window{}
    let dialog = NativeFileDialog(window, nint(0), FileDialogKind.Folder, FileDialogOptions())
    let pending = dialog.Task.WaitAsync(window.PendingTaskToken())
    window.Close()
    let paths = Marshal.AllocHGlobal(nint.Size)
    try {
      Marshal.WriteIntPtr(paths, nint(0))
      typeof(NativeFileDialog).GetMethod("Receive", BindingFlags.Instance | BindingFlags.NonPublic)!!
        .Invoke(dialog, []object{paths, -1})
    } finally { Marshal.FreeHGlobal(paths) }
    window.drainPostedActions()
    return pending.IsCanceled && dialog.NativeCompleted
    && window.Closed.IsCancellationRequested && !window.Post(() -> {})
  }
  func ApplicationStateVerificationContract() bool {
    let previous = StateVerification.Override
    try {
      StateVerification.Enabled = true
      if !Application.VerifyState { return false }
      Application.VerifyState = false
      if StateVerification.Enabled || Application.VerifyState { return false }
      Application.VerifyState = true
      return StateVerification.Enabled
    } finally { StateVerification.Override = previous }
  }

  func SingleInstanceRejectsAttachedWindowContract() bool {
    using let host = ElementHandleEmbeddedHost()
    let window = Window{}
    let previous = Application.HasOpenedWindow
    Application.HasOpenedWindow = false
    try {
      window.Attach(host)
      try {
        let result = Application.AcquireSingleInstance([]string{})
        result.Lease?.Dispose()
        return false
      } catch (error InvalidOperationException) {
        return error.Message == "Acquire a single instance before opening the first window"
      }
    } finally {
      window.Close()
      Application.HasOpenedWindow = previous
    }
  }
  func InitialBoundsContract() bool {
    let usable = ElementRect{ X: -1366, Y: 24, Width: 1366, Height: 720 }
    let oversized = SdlHost.ConstrainInitialBounds(ElementRect{ Width: 1824, Height: 1026 }, 0, 0, false, usable)
    let centered = SdlHost.ConstrainInitialBounds(ElementRect{ Width: 800, Height: 600 }, 0, 0, false, usable)
    let positioned = SdlHost.ConstrainInitialBounds(ElementRect{ X: 100, Y: -100, Width: 800, Height: 600 }, 0, 0, true, usable)
    let contained = SdlHost.ConstrainInitialBounds(ElementRect{ X: -1200, Y: 50, Width: 800, Height: 600 }, 0, 0, true, usable)
    let minimum = SdlHost.ConstrainInitialBounds(ElementRect{ Width: 800, Height: 600 }, 1824, 1026, false, usable)
    return oversized.X == -1366 && oversized.Y == 24 && oversized.Width == 1366 && oversized.Height == 720
      && centered.X == -1083 && centered.Y == 84 && centered.Width == 800 && centered.Height == 600
      && positioned.X == -800 && positioned.Y == 24 && positioned.Width == 800 && positioned.Height == 600
      && contained.X == -1200 && contained.Y == 50 && contained.Width == 800 && contained.Height == 600
      && minimum.X == -1366 && minimum.Y == 24 && minimum.Width == 1824 && minimum.Height == 1026
  }

  func PresentModesContract() bool {
    var selected VkPresentModeKHR
    return VulkanPresentModeSelector.TrySelect(true, true, true, true, out selected)
      && selected == VkConstants.VK_PRESENT_MODE_FIFO_KHR
      && !VulkanPresentModeSelector.TrySelect(true, true, true, false, out selected)
      && VulkanPresentModeSelector.TrySelect(false, true, true, true, out selected)
      && selected == VkConstants.VK_PRESENT_MODE_IMMEDIATE_KHR
      && VulkanPresentModeSelector.TrySelect(false, false, true, true, out selected)
      && selected == VkConstants.VK_PRESENT_MODE_MAILBOX_KHR
      && VulkanPresentModeSelector.TrySelect(false, false, false, true, out selected)
      && selected == VkConstants.VK_PRESENT_MODE_FIFO_KHR
      && !VulkanPresentModeSelector.TrySelect(false, false, false, false, out selected)
  }

  func WindowLayoutSizeContract() bool {
    let window = Window{Size: LayoutSize(101.25, 80.5), UiScale: 1.5F,
      MinSize: LayoutSize(10.25, 20.5), MaxSize: LayoutSize(400.5, 300.25)}
    try {
      window.UpdateTree()
      if window.NativeWidth != 152 || window.NativeHeight != 121 { return false }
      if window.Size != LayoutSize(152.0 / 1.5, 121.0 / 1.5) { return false }
      window.MinSize = LayoutSize(15, 400)
      return false
    } catch (error System.ArgumentOutOfRangeException) {
      return window.MinSize == LayoutSize(10.25, 20.5)
        && window.MaxSize == LayoutSize(400.5, 300.25)
    } finally { window.Close() }
  }

  func SizeToContentContract() bool {
    for index in 0 ... 5 {
      let root = WindowSizeCell{Percentage: index == 1, Margin: if index == 4 { 10.0 } else { 0.0 },
        ContentWidth: if index == 2 { 900.0 } else { 120.0 },
        ContentHeight: if index == 2 { 800.0 } else { 80.0 }}
      let window = Window{Root: root, InitiallyVisible: false, UiScale: 1.5F,
        Size: LayoutSize(400, 300), SizeToContent: SizeToContent.Both,
        MinSize: if index == 3 { LayoutSize(150, 120) } else { LayoutSize(0, 0) },
        MaxSize: if index == 2 { LayoutSize(240, 160) } else { LayoutSize(0, 0) }}
      window.Open()
      try {
        let expected = if index == 1 { LayoutSize(400, 80) }
          else if index == 2 { LayoutSize(240, 160) }
          else if index == 3 { LayoutSize(150, 120) }
          else if index == 4 { LayoutSize(140, 100) }
          else { LayoutSize(120, 80) }
        if window.IsVisible || window.Size != expected { return false }
        root.ContentWidth = 200
        root.ContentHeight = 200
        root.Rebuild()
        window.UpdateTree()
        if window.Size != expected { return false }
      } finally { window.Close() }
    }
    return true
  }

  func RelativeSizeToContentContract() bool {
    let widths = []Length{Vw(50), Length.Auto, Percent(100) - Rem(2), Em(2), Length.Auto}
    let heights = []Length{Length.Auto, Vh(50), Vh(50) + Em(1), Rem(3), Length.Auto}
    let expected = []LayoutSize{LayoutSize(400, 80), LayoutSize(120, 300), LayoutSize(400, 300),
      LayoutSize(32, 48), LayoutSize(200, 150)}
    for index in 0 ... widths.Length {
      let window = Window{Root: RelativeWindowSizeCell(widths[index], heights[index], index == 4),
        InitiallyVisible: false, Size: LayoutSize(400, 300), SizeToContent: SizeToContent.Both}
      try {
        window.Open()
        if window.Size != expected[index] { return false }
      } finally { window.Close() }
    }
    return true
  }
}

internal class WindowDragCloseCell : Cell {
  internal let Handle ElementHandle = ElementHandle()
  internal var EndCount int32
  internal var EndedMounted bool
  internal var EndedCancelled bool
  internal prop Cancelled bool { get -> Lifetime.IsCancellationRequested }

  override func Build() Blob -> Container{
    Handle: Handle, Width: 100, Height: 100,
    DragSource: DragSource(_ -> DragData("payload", DragEffect.Copy), e -> {
      EndCount++
      EndedMounted = Handle.IsMounted && !Lifetime.IsCancellationRequested
      EndedCancelled = e.Kind == DragEndKind.Canceled && e.Status == DataTransferStatus.Cancelled
    })}
}

internal class WindowSizeCell : Cell {
  internal var Percentage bool
  internal var ContentWidth float64
  internal var ContentHeight float64
  internal var Margin float64

  public override func Build() Blob -> Container{
    Width: if Percentage { Percent(100) } else { ContentWidth },
    Height: ContentHeight, Margin: Margin}
}

internal class RelativeWindowSizeCell(width Length, height Length, descendant bool) : Cell {
  public override func Build() Blob -> Container{Width: width, Height: height,
    Container{Width: descendant ? Vw(50) : 120, Height: descendant ? Vh(50) : 80}}
}
internal class WindowAsyncCell : Cell {
  internal let Pending TaskCompletionSource[bool] = TaskCompletionSource[bool]()
  internal let Finished ManualResetEventSlim = ManualResetEventSlim()
  internal let Closing ManualResetEventSlim = ManualResetEventSlim()
  internal var Resumed int32
  internal var ResumeThread int32
  internal var FinallyCount int32
  internal var ClosedDuringReentry bool

  public override func Build() Blob -> Text(Resumed.ToString())

  protected override func Unmounting() { Closing.Set() }

  internal async func RunHandler() void {
    try {
      await Pending.Task
      Resumed++
    } finally {
      ResumeThread = Environment.CurrentManagedThreadId
      FinallyCount++
      Finished.Set()
    }
  }

  internal async func RunCancelled() void {
    try { await Task.Delay(Timeout.Infinite, Lifetime) }
    finally {
      ResumeThread = Environment.CurrentManagedThreadId
      FinallyCount++
    }
  }

  internal async func RunDisposing(host EmbeddedWindowHost, window Window) void {
    try { await Pending.Task }
    finally {
      host.Dispose()
      ClosedDuringReentry = window.Closed.IsCancellationRequested
      FinallyCount++
    }
  }
}

internal class WindowAsyncStateCell : Cell {
  private let value State[int32] = State[int32](0)

  public override func Build() Blob -> Text(value.Value.ToString())

  internal async func Resume(pending Task, changed bool) void {
    await pending
    if changed { value.Value++ }
  }
}

internal class WindowCountingContext : SynchronizationContext {
  internal var Started int32
  internal var Completed int32
  internal var Copies int32
  internal var Posts int32
  internal var LastCopy WindowCountingContext?
  private let callbacks Queue[Action] = Queue[Action]()

  public override func OperationStarted() { Started++ }
  public override func OperationCompleted() { Completed++ }
  public override func CreateCopy() SynchronizationContext {
    Copies++
    LastCopy = WindowCountingContext()
    return LastCopy!!
  }
  public override func Post(callback SendOrPostCallback, state object?) {
    Posts++
    callbacks.Enqueue(() -> callback(state))
  }
  internal func Drain() {
    let previous = SynchronizationContext.Current
    SynchronizationContext.SetSynchronizationContext(this)
    try {
      while callbacks.TryDequeue(out var callback) { callback() }
    } finally { SynchronizationContext.SetSynchronizationContext(previous) }
  }
}
