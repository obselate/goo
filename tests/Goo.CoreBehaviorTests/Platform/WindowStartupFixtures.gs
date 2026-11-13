package Goo

import System
import System.Threading
import System.Threading.Tasks
import System.Reflection
import System.Runtime.InteropServices
import System.Diagnostics

internal class WindowStartupFixtures {

  async func HostedOwnerContextContract() Task[bool] {
    let hostContext = SynchronizationContext.Current
    if hostContext == nil || hostContext is WindowCallbackContext { return false }
    let owner = WindowAsyncCell()
    let window = Window{Root: owner, Width: 100, Height: 100}
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
    let window = Window{Root: owner, Width: 100, Height: 100}
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
    let window = Window{Root: owner, Width: 100, Height: 100}
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
    let closing = Window{Root: late, Width: 100, Height: 100, CloseDrainMs: 0.0}
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
    let window = Window{Root: owner, Width: 100, Height: 100}
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
