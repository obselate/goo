package GooAsyncReadbackSmoke

import System
import System.Diagnostics
import System.IO
import System.Threading
import Goo

class TimelineCompletionCell : Cell {
  override func Build() Blob -> Container {
    Width: Length.Percent(100),
    Height: Length.Percent(100),
    BackgroundColor: Color.Rgb(18, 30, 46),
    Children: {
      Container{
        Position: PositionType.Absolute,
        Left: 12,
        Top: 12,
        Width: 36,
        Height: 28,
        BackgroundColor: Color.Rgb(62, 134, 210),
      },
    },
  }
}

func TimelineCompletionRequire(condition bool, message string) {
  if !condition {
    throw InvalidOperationException(message)
  }
}

func TimelineCompletionSerialCount(snapshot VulkanFrameSubmissionTestSnapshot)
uint64 -> snapshot.Slot0Serial + snapshot.Slot1Serial

func TimelineCompletionPump(first Window, second Window) {
  WindowReadbackTestFixture.Pump(first, 0.0)
  WindowReadbackTestFixture.Pump(second, 0.0)
}

func TimelineCompletionDrain(first Window, second Window, timeoutMs int32) {
  let deadline = Stopwatch.GetTimestamp()
  +int64(float64(Stopwatch.Frequency) * float64(timeoutMs) / 1000.0)
  while Stopwatch.GetTimestamp() < deadline {
    TimelineCompletionPump(first, second)
    if !WindowReadbackTestFixture.RuntimeQueueWorkPending(first)
      && !WindowReadbackTestFixture.RuntimeQueueWorkPending(second) {
        return
      }
    Thread.Yield()
  }
  throw InvalidOperationException("Timeline window queues did not drain within the timeout")
}

func TimelineCompletionClose(window Window) {
  if window.IsOpen {
    window.RequestClose()
    WindowReadbackTestFixture.ForceRender(window, 0.0)
  }
}

func RunTimelineCompletionSmoke() {
  TimelineCompletionRequire(
    Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let capturedError = StringWriter()
  let originalError = Console.Error
  var first Window? = nil
  var second Window? = nil
  var deferredVerified = false
  var acquireDrainVerified = false
  var validationRollbackVerified = false
  var fifoVerified = false
  var pendingVerified = false
  var mailboxVerified = false
  var pixelsVerified = false
  try {
    let openedFirst = Window{
      Title: "Goo graphics timeline window",
      Width: 96,
      Height: 64,
      VSync: false,
      Root: TimelineCompletionCell{},
    }
    let openedSecond = Window{
      Title: "Goo graphics timeline offscreen",
      Width: 64,
      Height: 64,
      VSync: false,
      Root: ReadbackSmokeCell{},
    }
    first = openedFirst
    second = openedSecond
    Console.SetError(capturedError)
    openedFirst.Open()
    openedSecond.Open()
    WindowReadbackTestFixture.ForceRender(openedFirst, 0.0)
    WindowReadbackTestFixture.ForceRender(openedSecond, 0.0)
    TimelineCompletionDrain(openedFirst, openedSecond, 2000)

    let staged = WindowReadbackTestFixture.Request(openedSecond, 64u, 64u)
    TimelineCompletionRequire(staged == WindowReadbackRequestStatus.NotReady,
      "Timeline readback prerequisite was not staged")
    TimelineCompletionDrain(openedFirst, openedSecond, 2000)
    let warm = WindowReadbackTestFixture.GraphicsTimeline(openedFirst)
    TimelineCompletionRequire(warm.Available && warm.Timeline != 0uL
        && warm.RuntimeGeneration > 0uL
        && warm.CompletedResult == VkConstants.VK_SUCCESS
        && warm.LastEnqueuedSerial > 0uL,
      "Timeline runtime did not expose a valid warm state")
    TimelineCompletionRequire(
      WindowReadbackTestFixture.WaitGraphicsSubmission(
        openedFirst, warm.LastEnqueuedSerial, VkConstants.VK_WHOLE_SIZE)
      == VkConstants.VK_SUCCESS,
      "Timeline warm submissions did not complete")

    let settled = WindowReadbackTestFixture.GraphicsTimeline(openedFirst)
    TimelineCompletionRequire(settled.CompletedResult == VkConstants.VK_SUCCESS
        && settled.CompletedSerial >= settled.LastEnqueuedSerial,
      "Timeline warm completion watermark did not settle")
    let validation = WindowReadbackTestFixture.GraphicsTimelineValidationRollback(
      openedFirst)
    TimelineCompletionRequire(validation.Threw && validation.MailboxIdle
        && validation.SerialAfter == validation.SerialBefore
        && validation.MailboxSerial == 0uL,
      "Timeline validation failure changed FIFO state")
    validationRollbackVerified = true
    let deferredBefore = WindowReadbackTestFixture.RuntimeDeferredQueueEnqueueCount()
    WindowReadbackTestFixture.RuntimeDeferNextQueueEnqueue(openedFirst)
    WindowReadbackTestFixture.SetForceFullRedraw(openedFirst, true)
    WindowReadbackTestFixture.ForceRenderNonblocking(openedFirst, 0.0)
    let deferred = WindowReadbackTestFixture.GraphicsTimeline(openedFirst)
    TimelineCompletionRequire(
      WindowReadbackTestFixture.RuntimeDeferredQueueEnqueueCount()
      == deferredBefore + 1L,
      "Timeline deferred enqueue seam was not consumed once")
    TimelineCompletionRequire(
      deferred.LastEnqueuedSerial == settled.LastEnqueuedSerial
        && deferred.PendingWindowSerial == 0uL,
      "Timeline deferred enqueue consumed a graphics serial: settled="
      +settled.LastEnqueuedSerial.ToString() + " deferred="
      +deferred.LastEnqueuedSerial.ToString() + " pending="
      +deferred.PendingWindowSerial.ToString())
    deferredVerified = true
    WindowReadbackTestFixture.RuntimeHoldNextQueueSubmit(openedFirst)
    WindowReadbackTestFixture.ForceRenderNonblocking(openedFirst, 0.0)
    var retryHeld = false
    let retryHoldDeadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 2L
    while Stopwatch.GetTimestamp() < retryHoldDeadline {
      if WindowReadbackTestFixture.RuntimeWaitForHeldQueueCall(openedFirst, 10) {
        retryHeld = true
        break
      }
      Thread.Yield()
    }
    TimelineCompletionRequire(retryHeld,
      "Timeline deferred frame retry did not reach the held queue worker")
    let retried = WindowReadbackTestFixture.GraphicsTimeline(openedFirst)
    TimelineCompletionRequire(
      retried.PendingWindowSerial == settled.LastEnqueuedSerial + 1uL
        && retried.LastEnqueuedSerial == retried.PendingWindowSerial,
      "Timeline deferred frame retry did not receive the next serial: settled="
      +settled.LastEnqueuedSerial.ToString() + " enqueued="
      +retried.LastEnqueuedSerial.ToString() + " pending="
      +retried.PendingWindowSerial.ToString())
    let retrySerial = retried.PendingWindowSerial
    WindowReadbackTestFixture.RuntimeReleaseHeldQueueCall()
    TimelineCompletionDrain(openedFirst, openedSecond, 2000)
    TimelineCompletionRequire(
      WindowReadbackTestFixture.WaitGraphicsSubmission(
        openedFirst, retrySerial, VkConstants.VK_WHOLE_SIZE)
      == VkConstants.VK_SUCCESS,
      "Timeline deferred frame retry did not complete")

    let drainBefore = WindowReadbackTestFixture.GraphicsTimeline(openedFirst)
    let localBeforeDrain = WindowReadbackTestFixture.FrameSubmissions(openedFirst)
    var drainResult = WindowReadbackTestFixture.RuntimeAcquireAndAbandonFrame(openedFirst)
    let drainDeadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 2L
    while drainResult == VkConstants.VK_NOT_READY
      && Stopwatch.GetTimestamp() < drainDeadline{
        WindowReadbackTestFixture.PumpNativeEvents()
        Thread.Yield()
        drainResult = WindowReadbackTestFixture.RuntimeAcquireAndAbandonFrame(openedFirst)
      }
    let drainAfter = WindowReadbackTestFixture.GraphicsTimeline(openedFirst)
    let localAfterDrain = WindowReadbackTestFixture.FrameSubmissions(openedFirst)
    TimelineCompletionRequire(drainResult == VkConstants.VK_SUCCESS
        && drainAfter.LastEnqueuedSerial == drainBefore.LastEnqueuedSerial + 1uL
        && drainAfter.CompletedResult == VkConstants.VK_SUCCESS
        && drainAfter.CompletedSerial >= drainAfter.LastEnqueuedSerial
        && drainAfter.PendingWindowSerial == 0uL,
      "Timeline acquire drain did not complete one wait-only FIFO submission: result="
      +drainResult.ToString() + " before=" + drainBefore.LastEnqueuedSerial.ToString()
      +" after=" + drainAfter.LastEnqueuedSerial.ToString()
      +" completed_result=" + drainAfter.CompletedResult.ToString()
      +" completed=" + drainAfter.CompletedSerial.ToString()
      +" pending=" + drainAfter.PendingWindowSerial.ToString())
    TimelineCompletionRequire(
      TimelineCompletionSerialCount(localAfterDrain)
      == TimelineCompletionSerialCount(localBeforeDrain),
      "Timeline acquire drain changed a frame-slot submission serial")
    acquireDrainVerified = true

    let beforeHold = WindowReadbackTestFixture.GraphicsTimeline(openedFirst)
    let localBeforeHold = WindowReadbackTestFixture.FrameSubmissions(openedFirst)
    WindowReadbackTestFixture.RuntimeHoldNextQueueSubmit(openedFirst)
    WindowReadbackTestFixture.SetForceFullRedraw(openedFirst, true)
    WindowReadbackTestFixture.ForceRenderNonblocking(openedFirst, 0.0)
    var held = false
    let holdDeadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 2L
    while Stopwatch.GetTimestamp() < holdDeadline {
      if WindowReadbackTestFixture.RuntimeWaitForHeldQueueCall(openedFirst, 10) {
        held = true
        break
      }
      Thread.Yield()
    }
    TimelineCompletionRequire(held,
      "Timeline window submission did not reach the held queue worker")
    let heldWindow = WindowReadbackTestFixture.GraphicsTimeline(openedFirst)
    let windowSerial = heldWindow.PendingWindowSerial
    TimelineCompletionRequire(windowSerial == beforeHold.LastEnqueuedSerial + 1uL
        && heldWindow.LastEnqueuedSerial == windowSerial,
      "Timeline held window did not receive the next accepted FIFO serial")

    let accepted = WindowReadbackTestFixture.Request(openedSecond, 64u, 64u)
    TimelineCompletionRequire(accepted == WindowReadbackRequestStatus.Accepted,
      "Timeline offscreen readback was not accepted behind the held window")
    let heldOffscreen = WindowReadbackTestFixture.GraphicsTimeline(openedSecond)
    let offscreenSerial = heldOffscreen.ReadbackSerial
    TimelineCompletionRequire(offscreenSerial == windowSerial + 1uL
        && heldOffscreen.LastEnqueuedSerial == offscreenSerial,
      "Timeline window and offscreen submissions were not assigned consecutive FIFO serials")
    fifoVerified = true
    TimelineCompletionRequire(heldOffscreen.CompletedResult == VkConstants.VK_SUCCESS
        && heldOffscreen.CompletedSerial < windowSerial
        && WindowReadbackTestFixture.PollGraphicsSubmission(openedFirst, windowSerial)
      == VkConstants.VK_NOT_READY
        && WindowReadbackTestFixture.PollGraphicsSubmission(openedSecond, offscreenSerial)
      == VkConstants.VK_NOT_READY
        && WindowReadbackTestFixture.WaitGraphicsSubmission(openedFirst, windowSerial, 0uL)
      == VkConstants.VK_TIMEOUT
        && WindowReadbackTestFixture.WaitGraphicsSubmission(openedSecond, offscreenSerial, 0uL)
      == VkConstants.VK_TIMEOUT,
      "Timeline reported held FIFO work complete before native submission")
    pendingVerified = true

    WindowReadbackTestFixture.RuntimeReleaseHeldQueueCall()
    TimelineCompletionRequire(
      WindowReadbackTestFixture.WaitGraphicsSubmission(
        openedSecond, offscreenSerial, VkConstants.VK_WHOLE_SIZE)
      == VkConstants.VK_SUCCESS,
      "Timeline offscreen submission did not complete after release")
    let gpuComplete = WindowReadbackTestFixture.GraphicsTimeline(openedFirst)
    let localBeforeMailbox = WindowReadbackTestFixture.FrameSubmissions(openedFirst)
    let offscreenBeforeMailbox = WindowReadbackTestFixture.GraphicsTimeline(openedSecond)
    TimelineCompletionRequire(gpuComplete.CompletedSerial >= offscreenSerial
        && TimelineCompletionSerialCount(localBeforeMailbox)
      == TimelineCompletionSerialCount(localBeforeHold)
        && offscreenBeforeMailbox.ReadbackPendingReconcile,
      "Timeline completion bypassed required CPU mailbox reconciliation")
    mailboxVerified = true

    TimelineCompletionDrain(openedFirst, openedSecond, 2000)
    ReadbackAwaitReadbackReady(openedSecond, 2000)
    let result = ReadbackTakeReadback(openedSecond)
    ReadbackValidateReadbackResult(result)
    pixelsVerified = true
    let localAfterMailbox = WindowReadbackTestFixture.FrameSubmissions(openedFirst)
    TimelineCompletionRequire(
      TimelineCompletionSerialCount(localAfterMailbox)
      == TimelineCompletionSerialCount(localBeforeHold) + 1uL,
      "Timeline window mailbox did not reconcile exactly one submission")

    TimelineCompletionClose(openedFirst)
    TimelineCompletionClose(openedSecond)
    TimelineCompletionRequire(!openedFirst.IsOpen && !openedSecond.IsOpen,
      "Timeline windows did not close")
  } finally {
    WindowReadbackTestFixture.RuntimeReleaseHeldQueueCall()
    if let active = first {
      if active.IsOpen {
        TimelineCompletionClose(active)
      }
    }
    if let active = second {
      if active.IsOpen {
        TimelineCompletionClose(active)
      }
    }
    Console.SetError(originalError)
  }
  ReadbackValidateCommonDiagnostics(capturedError.ToString())
  Console.WriteLine("timeline-completion-smoke: deferred_no_hole="
    +(if deferredVerified { "1" } else { "0" })
    +" acquire_drain=" + (if acquireDrainVerified { "1" } else { "0" })
    +" validation_rollback=" + (if validationRollbackVerified { "1" } else { "0" })
    +" fifo_window_offscreen=" + (if fifoVerified { "1" } else { "0" })
    +" no_premature_completion=" + (if pendingVerified { "1" } else { "0" })
    +" cpu_mailbox=" + (if mailboxVerified { "1" } else { "0" })
    +" pixels=" + (if pixelsVerified { "1" } else { "0" }) + " cleanup=1")
}
