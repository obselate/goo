package Goo

import System
import System.Collections.Generic

internal class DragDropFixtures {
  func ThresholdNegotiationTargetingAndClickContract() bool {
    let events = List[string]()
    var clicks int32
    let reconciler = Reconciler{ Res: Resolver{} }
    let root = reconciler.Mount(Container() {.Width: 240,.Height: 80,
        Container{
          Key: "source",
          Position: PositionType.Absolute,
          Width: 40,
          Height: 40,
          OnClick: () -> clicks++,
          DragSource: DragSource(
            (e DragStartEvent) -> {
              events.Add("create:" + int32(e.Position.X).ToString())
              return DragData("payload", DragEffect.Copy | DragEffect.Move)
            },
            (e DragEndEvent) -> events.Add("end:" + e.Kind.ToString()
              +":" + e.Effect.ToString())),
        },
        Container() {.Key: "target",.Position: PositionType.Absolute,.Width: 40,.Height: 40,.OverflowX: Overflow.Hidden,.Transform: PanelTransform{ TranslateX: 100, Scale: 2 },.TransformOriginX: Length.Percent(0),.TransformOriginY: Length.Percent(0),.DropTarget: DropTarget(
            (e DragEvent) -> {
              events.Add("query:" + int32(e.Position.X).ToString())
              return e.Modifiers.Ctrl ? DragEffect.Copy : DragEffect.Move
            },
            (e DragEvent) -> events.Add(e.Kind.ToString() + ":" + e.Effect.ToString())),
          Container{
            Width: 40,
            Height: 40,
            DropTarget: DropTarget((e DragEvent) -> DragEffect.None),
        },
      },
    })
    Layout().Calculate(root, 240.0F, 80.0F)
    let input = InputCoordinator()
    let resolver = Resolver{}
    input.AfterTreeUpdated(root, resolver, true)

    input.QueuePointerPress(10.0F, 10.0F)
    input.QueuePointerMove(13.0F, 10.0F)
    input.QueuePointerRelease(13.0F, 10.0F)
    input.Drain(root, resolver, 0.0, nil)
    if clicks != 1 || events.Count != 0 { return false }

    input.QueuePointerPress(10.0F, 10.0F)
    input.QueuePointerMove(14.0F, 10.0F)
    input.QueuePointerMove(120.0F, 10.0F)
    input.Drain(root, resolver, 1.0, nil)
    input.QueueKeyPress(Key.ControlLeft, KeyModifiers{ Ctrl: true })
    input.Drain(root, resolver, 1.0, nil)
    input.QueuePointerRelease(120.0F, 10.0F, PointerButton.Primary,
      KeyModifiers{ Ctrl: true })
    input.Drain(root, resolver, 1.0, nil)

    let expected = []string{
      "create:14",
      "query:10", "Enter:Move",
      "query:10", "Move:Copy",
      "query:10", "Drop:Copy",
      "end:Dropped:Copy",
    }
    if clicks != 1 || events.Count != expected.Length { return false }
    for i in 0 ... expected.Length {
      if events[i] != expected[i] { return false }
    }
    return true
  }

  func CancellationContactAndCleanupContract() bool {
    let events = List[string]()
    let reconciler = Reconciler{ Res: Resolver{} }
    let root = reconciler.Mount(Container() {.Width: 200,.Height: 60,.DropTarget: DropTarget((e DragEvent) -> DragEffect.Move,
        (e DragEvent) -> events.Add(e.Kind.ToString())),
        Container{
        Width: 40,
        Height: 40,
        DragSource: DragSource(
          (e DragStartEvent) -> {
            events.Add("create:" + e.PointerId.ToString())
            return DragData(events, DragEffect.Move)
          },
          (e DragEndEvent) -> events.Add("end:" + e.Kind.ToString())),
        },
    })
    Layout().Calculate(root, 200.0F, 60.0F)
    let input = InputCoordinator()
    let resolver = Resolver{}
    input.AfterTreeUpdated(root, resolver, true)

    input.QueuePointerPress(41, PointerDevice.Touch, 10.0F, 10.0F,
      PointerButton.Primary, KeyModifiers{})
    input.QueuePointerMove(41, PointerDevice.Touch, 15.0F, 10.0F, KeyModifiers{})
    input.QueuePointerPress(52, PointerDevice.Touch, 80.0F, 10.0F,
      PointerButton.Primary, KeyModifiers{})
    input.QueuePointerCancel(52, PointerDevice.Touch)
    input.Drain(root, resolver, 0.0, nil)
    if events.Count != 2 || events[0] != "create:41" || events[1] != "Enter" {
      return false
    }

    input.HandleKey(root, resolver, Key.Escape, KeyModifiers{})
    if events.Count != 4 || events[2] != "Leave" || events[3] != "end:Canceled" {
      return false
    }
    input.QueuePointerRelease(41, PointerDevice.Touch, 15.0F, 10.0F,
      PointerButton.Primary, KeyModifiers{})
    input.Drain(root, resolver, 1.0, nil)
    return events.Count == 4
  }

  func RemovalDisableAndResetContract() bool {
    var endCount int32
    var leaveCount int32
    let source = Container{
      Key: "source",
      Position: PositionType.Absolute,
      Width: 40,
      Height: 40,
      DragSource: DragSource(
        (e DragStartEvent) -> DragData("payload", DragEffect.Move),
        (e DragEndEvent) -> endCount++),
    }
    let target = Container{
      Key: "target",
      Position: PositionType.Absolute,
      Left: 80,
      Width: 40,
      Height: 40,
      DropTarget: DropTarget((e DragEvent) -> DragEffect.Move,
        (e DragEvent) -> { if e.Kind == DragEventKind.Leave { leaveCount++ } }),
    }
    let root = Reconciler{ Res: Resolver{} }.Mount(Container() {.Width: 160,.Height: 50, source, target,
    })
    Layout().Calculate(root, 160.0F, 50.0F)
    let input = InputCoordinator()
    let resolver = Resolver{}
    input.AfterTreeUpdated(root, resolver, true)

    beginDrag(input, root, resolver, 10.0F, 90.0F)
    root.Children.RemoveAt(1)
    input.AfterTreeUpdated(root, resolver, true)
    input.QueuePointerRelease(90.0F, 10.0F)
    input.Drain(root, resolver, 1.0, nil)
    if endCount != 1 || leaveCount != 0 { return false }

    let disableRoot = Reconciler{ Res: Resolver{} }.Mount(Container() {.Width: 160,.Height: 50,.DropTarget: DropTarget((e DragEvent) -> DragEffect.Move,
        (e DragEvent) -> { if e.Kind == DragEventKind.Leave { leaveCount++ } }),
        Container{
        Width: 40,
        Height: 40,
        DragSource: DragSource(
          (e DragStartEvent) -> DragData("payload", DragEffect.Move),
          (e DragEndEvent) -> endCount++),
        },
    })
    Layout().Calculate(disableRoot, 160.0F, 50.0F)
    let disableInput = InputCoordinator()
    disableInput.AfterTreeUpdated(disableRoot, resolver, true)
    beginDrag(disableInput, disableRoot, resolver, 10.0F, 90.0F)
    disableRoot.Children[0].Disabled = true
    disableInput.AfterTreeUpdated(disableRoot, resolver, true)
    if endCount != 2 || leaveCount != 1 { return false }

    let resetRoot = Reconciler{ Res: Resolver{} }.Mount(Container() {.Width: 160,.Height: 50,.DropTarget: DropTarget((e DragEvent) -> DragEffect.Move,
        (e DragEvent) -> { if e.Kind == DragEventKind.Leave { leaveCount++ } }),
        Container{
        Width: 40,
        Height: 40,
        DragSource: DragSource(
          (e DragStartEvent) -> DragData("payload", DragEffect.Move),
          (e DragEndEvent) -> endCount++),
        },
    })
    Layout().Calculate(resetRoot, 160.0F, 50.0F)
    let resetInput = InputCoordinator()
    resetInput.AfterTreeUpdated(resetRoot, resolver, true)
    beginDrag(resetInput, resetRoot, resolver, 10.0F, 90.0F)
    resetInput.Reset(resetRoot, resolver)
    if endCount != 3 || leaveCount != 2 { return false }

    var detachedEndCount int32
    let detachedRoot = Reconciler{ Res: Resolver{} }.Mount(Container() {.Width: 160,.Height: 50,.DropTarget: DropTarget((e DragEvent) -> DragEffect.Move),
        Container{
        Width: 40,
        Height: 40,
        DragSource: DragSource(
          (e DragStartEvent) -> DragData("payload", DragEffect.Move),
          (e DragEndEvent) -> detachedEndCount++),
        },
    })
    Layout().Calculate(detachedRoot, 160.0F, 50.0F)
    let detachedInput = InputCoordinator()
    detachedInput.AfterTreeUpdated(detachedRoot, resolver, true)
    beginDrag(detachedInput, detachedRoot, resolver, 10.0F, 90.0F)
    detachedRoot.Children.RemoveAt(0)
    detachedInput.AfterTreeUpdated(detachedRoot, resolver, true)
    detachedInput.QueuePointerRelease(90.0F, 10.0F)
    detachedInput.Drain(detachedRoot, resolver, 1.0, nil)
    return detachedEndCount == 0
  }

  func CallbackFailureTerminatesAndDoesNotRetry() bool {
    var queryCount int32
    var endCount int32
    var throwQuery bool
    let root = Reconciler{ Res: Resolver{} }.Mount(Container() {.Width: 160,.Height: 50,.DropTarget: DropTarget((e DragEvent) -> {
        queryCount++
        if throwQuery { throw InvalidOperationException("drag query") }
        return DragEffect.Move
      }),
        Container{
        Width: 40,
        Height: 40,
        DragSource: DragSource(
          (e DragStartEvent) -> DragData("payload", DragEffect.Move),
          (e DragEndEvent) -> {
            endCount++
            throw InvalidOperationException("drag end")
          }),
        },
    })
    Layout().Calculate(root, 160.0F, 50.0F)
    let input = InputCoordinator()
    let resolver = Resolver{}
    input.AfterTreeUpdated(root, resolver, true)
    beginDrag(input, root, resolver, 10.0F, 60.0F)
    throwQuery = true
    var threw = false
    try {
      input.HandleKey(root, resolver, Key.ControlLeft, KeyModifiers{ Ctrl: true })
    } catch (error InvalidOperationException) {
      threw = error.Message == "drag query"
    }
    let afterFailure = queryCount
    input.HandleKey(root, resolver, Key.ShiftLeft, KeyModifiers{ Shift: true })
    input.QueuePointerRelease(60.0F, 10.0F)
    input.Drain(root, resolver, 1.0, nil)
    if !threw || endCount != 1 || queryCount != afterFailure { return false }

    var throwMove bool
    var moveEndCount int32
    var callbackInput InputCoordinator?
    var callbackRoot Node?
    let callbackResolver = Resolver{}
    let mountedCallbackRoot = Reconciler{ Res: Resolver{} }.Mount(Container() {.Width: 160,.Height: 50,.DropTarget: DropTarget((e DragEvent) -> DragEffect.Move),.OnPointerMove: (e PointerEvent) -> {
        if throwMove {
          if let coordinator = callbackInput {
            if let tree = callbackRoot { coordinator.Reset(tree, callbackResolver) }
          }
          throwAfterDragReset()
        }
      },
        Container{
        Width: 40,
        Height: 40,
        DragSource: DragSource(
          (e DragStartEvent) -> DragData("payload", DragEffect.Move),
          (e DragEndEvent) -> moveEndCount++),
        },
    })
    callbackRoot = mountedCallbackRoot
    Layout().Calculate(mountedCallbackRoot, 160.0F, 50.0F)
    let mountedCallbackInput = InputCoordinator()
    callbackInput = mountedCallbackInput
    mountedCallbackInput.AfterTreeUpdated(mountedCallbackRoot, callbackResolver, true)
    beginDrag(mountedCallbackInput, mountedCallbackRoot, callbackResolver, 10.0F, 60.0F)
    throwMove = true
    mountedCallbackInput.QueuePointerMove(70.0F, 10.0F)
    var stackPreserved bool
    try {
      mountedCallbackInput.Drain(mountedCallbackRoot, callbackResolver, 2.0, nil)
    } catch (error InvalidOperationException) {
      if let stack = error.StackTrace {
        stackPreserved = error.Message == "drag move" && stack.Contains("throwAfterDragReset")
      }
    }
    mountedCallbackInput.QueuePointerRelease(70.0F, 10.0F)
    mountedCallbackInput.Drain(mountedCallbackRoot, callbackResolver, 3.0, nil)
    return stackPreserved && moveEndCount == 1
  }

  func DropMutationAndPayloadOwnershipContract() bool {
    DragDropDisposable.DisposeCount = 0
    var dropCount int32
    var droppedEndCount int32
    var rootValue Node?
    let root = Reconciler{ Res: Resolver{} }.Mount(Container() {.Width: 160,.Height: 50,
        Container{
          Width: 40,
          Height: 40,
          DragSource: DragSource(
            (e DragStartEvent) -> DragData("payload", DragEffect.Move),
            (e DragEndEvent) -> {
              if e.Kind == DragEndKind.Dropped { droppedEndCount++ }
            }),
        },
        Container{
          Position: PositionType.Absolute,
          Left: 80,
          Width: 40,
          Height: 40,
          DropTarget: DropTarget((e DragEvent) -> DragEffect.Move,
            (e DragEvent) -> {
              if e.Kind == DragEventKind.Drop {
                dropCount++
                if let value = rootValue { value.Children.RemoveAt(1) }
              }
            }),
      },
    })
    rootValue = root
    Layout().Calculate(root, 160.0F, 50.0F)
    let input = InputCoordinator()
    let resolver = Resolver{}
    input.AfterTreeUpdated(root, resolver, true)
    beginDrag(input, root, resolver, 10.0F, 90.0F)
    input.QueuePointerRelease(90.0F, 10.0F)
    input.Drain(root, resolver, 1.0, nil)
    if dropCount != 1 || droppedEndCount != 1 { return false }

    return payloadReleases(false) && payloadReleases(true)
      && DragDropDisposable.DisposeCount == 0
  }

  func ArbitrationReentrantResetAndCaptureCleanupContract() bool {
    var preventedCreates int32
    let preventedRoot = Reconciler{ Res: Resolver{} }.Mount(Container{
      Width: 100,
      Height: 50,
      OnPointerDown: (e PointerEvent) -> e.PreventDefault(),
      DragSource: DragSource((e DragStartEvent) -> {
        preventedCreates++
        return DragData("prevented", DragEffect.Move)
      }),
    })
    Layout().Calculate(preventedRoot, 100.0F, 50.0F)
    let resolver = Resolver{}
    let preventedInput = InputCoordinator()
    preventedInput.AfterTreeUpdated(preventedRoot, resolver, true)
    preventedInput.QueuePointerPress(10.0F, 10.0F)
    preventedInput.QueuePointerMove(20.0F, 10.0F)
    preventedInput.QueuePointerRelease(20.0F, 10.0F)
    preventedInput.Drain(preventedRoot, resolver, 0.0, nil)
    if preventedCreates != 0 { return false }

    var capturedCreates int32
    let capturedRoot = Reconciler{ Res: Resolver{} }.Mount(Container{
      Width: 100,
      Height: 50,
      OnPointerDown: (e PointerEvent) -> e.Capture(),
      DragSource: DragSource((e DragStartEvent) -> {
        capturedCreates++
        return DragData("captured", DragEffect.Move)
      }),
    })
    Layout().Calculate(capturedRoot, 100.0F, 50.0F)
    let capturedInput = InputCoordinator()
    capturedInput.AfterTreeUpdated(capturedRoot, resolver, true)
    capturedInput.QueuePointerPress(10.0F, 10.0F)
    capturedInput.QueuePointerMove(20.0F, 10.0F)
    capturedInput.QueuePointerRelease(20.0F, 10.0F)
    capturedInput.Drain(capturedRoot, resolver, 0.0, nil)
    if capturedCreates != 0 { return false }

    var captureAfterStart bool
    var capturedMoves int32
    var normalMoves int32
    var captureEnds int32
    let cleanupRoot = Reconciler{ Res: Resolver{} }.Mount(Container() {.Width: 200,.Height: 50,.DropTarget: DropTarget((e DragEvent) -> DragEffect.Move),.OnPointerMove: (e PointerEvent) -> {
        if captureAfterStart {
          capturedMoves++
          e.Capture()
        }
      },
        Container{
          Width: 40,
          Height: 40,
          DragSource: DragSource(
            (e DragStartEvent) -> {
              captureAfterStart = true
              return DragData("cleanup", DragEffect.Move)
            },
            (e DragEndEvent) -> captureEnds++),
        },
        Container{
          Position: PositionType.Absolute,
          Left: 100,
          Width: 40,
          Height: 40,
          OnPointerMove: (e PointerEvent) -> normalMoves++,
      },
    })
    Layout().Calculate(cleanupRoot, 200.0F, 50.0F)
    let cleanupInput = InputCoordinator()
    cleanupInput.AfterTreeUpdated(cleanupRoot, resolver, true)
    cleanupInput.QueuePointerPress(10.0F, 10.0F)
    cleanupInput.QueuePointerMove(14.0F, 10.0F)
    cleanupInput.Drain(cleanupRoot, resolver, 0.0, nil)
    cleanupInput.QueuePointerMove(80.0F, 10.0F)
    cleanupInput.Drain(cleanupRoot, resolver, 1.0, nil)
    cleanupInput.HandleKey(cleanupRoot, resolver, Key.Escape, KeyModifiers{})
    captureAfterStart = false
    cleanupInput.QueuePointerMove(110.0F, 10.0F)
    cleanupInput.Drain(cleanupRoot, resolver, 2.0, nil)
    if capturedMoves != 1 || captureEnds != 1 || normalMoves != 1 { return false }

    var queryCount int32
    var resetEnds int32
    var reentrantRoot Node?
    var reentrantInput InputCoordinator?
    let mountedReentrant = Reconciler{ Res: Resolver{} }.Mount(Container() {.Width: 160,.Height: 50,.DropTarget: DropTarget((e DragEvent) -> {
        queryCount++
        if let coordinator = reentrantInput { coordinator.Reset(reentrantRoot, resolver) }
        return DragEffect.Move
      }),
        Container{
        Width: 40,
        Height: 40,
        DragSource: DragSource(
          (e DragStartEvent) -> DragData("reset", DragEffect.Move),
          (e DragEndEvent) -> resetEnds++),
        },
    })
    reentrantRoot = mountedReentrant
    reentrantInput = InputCoordinator()
    Layout().Calculate(mountedReentrant, 160.0F, 50.0F)
    let coordinator = reentrantInput
    coordinator.AfterTreeUpdated(mountedReentrant, resolver, true)
    beginDrag(coordinator, mountedReentrant, resolver, 10.0F, 80.0F)
    coordinator.QueuePointerRelease(80.0F, 10.0F)
    coordinator.Drain(mountedReentrant, resolver, 1.0, nil)
    return queryCount == 1 && resetEnds == 1
  }

  func DescriptorReplacementRequeriesStationarySession() bool {
    var firstQueries int32
    var secondQueries int32
    var firstEnds int32
    var secondEnds int32
    let resolver = Resolver{}
    let reconciler = Reconciler{ Res: resolver }
    var root = reconciler.Mount(Container() {.Width: 160,.Height: 50,.DropTarget: DropTarget((e DragEvent) -> {
        firstQueries++
        return DragEffect.Move
      }),
        Container{
        Width: 40,
        Height: 40,
        DragSource: DragSource(
          (e DragStartEvent) -> DragData("payload", DragEffect.Move),
          (e DragEndEvent) -> firstEnds++),
        },
    })
    Layout().Calculate(root, 160.0F, 50.0F)
    let input = InputCoordinator()
    input.AfterTreeUpdated(root, resolver, true)
    beginDrag(input, root, resolver, 10.0F, 90.0F)
    let firstBeforeDiff = firstQueries

    let diff = Reconciler{ Res: resolver }
    root = diff.Diff(root, Container() {.Width: 160,.Height: 50,.DropTarget: DropTarget((e DragEvent) -> {
        secondQueries++
        return DragEffect.Move
      }),
        Container{
        Width: 40,
        Height: 40,
        DragSource: DragSource(
          (e DragStartEvent) -> DragData("replacement", DragEffect.Move),
          (e DragEndEvent) -> secondEnds++),
        },
    })
    if (int32(diff.Effects) & int32(ReconcileEffects.Input)) == 0 { return false }
    input.AfterTreeUpdated(root, resolver, true)
    if firstQueries != firstBeforeDiff || secondQueries != 1 { return false }
    input.QueuePointerRelease(90.0F, 10.0F)
    input.Drain(root, resolver, 1.0, nil)
    return firstEnds == 0 && secondEnds == 1 && secondQueries == 2
  }

  func WarmNoDragDrainAllocatesZero() int64 {
    let input = InputCoordinator()
    let resolver = Resolver{}
    input.Drain(nil, resolver, 0.0, nil)
    let before = GC.GetAllocatedBytesForCurrentThread()
    var index int32
    while index < 1_000 {
      input.Drain(nil, resolver, 0.0, nil)
      index++
    }
    return GC.GetAllocatedBytesForCurrentThread() - before
  }

  private func beginDrag(input InputCoordinator, root Node, resolver Resolver,
    sourceX float32, targetX float32) {
      input.QueuePointerPress(sourceX, 10.0F)
      input.QueuePointerMove(sourceX + 4.0F, 10.0F)
      input.QueuePointerMove(targetX, 10.0F)
      input.Drain(root, resolver, 0.0, nil)
    }

  private func throwAfterDragReset() {
    throw InvalidOperationException("drag move")
  }

  private func createPayloadCase() DragDropPayloadCase {
    let payload = DragDropDisposable()
    let factory = DragDropPayloadFactory{ Value: payload }
    let weak = WeakReference(payload)
    let root = Reconciler{ Res: Resolver{} }.Mount(Container() {.Width: 120,.Height: 50,.DropTarget: DropTarget((e DragEvent) -> DragEffect.Move),
        Container{
        Width: 40,
        Height: 40,
        DragSource: DragSource((e DragStartEvent) -> factory.Create()),},
    })
    Layout().Calculate(root, 120.0F, 50.0F)
    let input = InputCoordinator()
    let resolver = Resolver{}
    input.AfterTreeUpdated(root, resolver, true)
    beginDrag(input, root, resolver, 10.0F, 80.0F)
    factory.Value = nil
    return DragDropPayloadCase(root, input, resolver, weak)
  }

  private func payloadReleases(drop bool) bool {
    let value = createPayloadCase()
    GC.Collect()
    GC.WaitForPendingFinalizers()
    GC.Collect()
    if !value.Weak.IsAlive { return false }
    if drop {
      value.Input.QueuePointerRelease(80.0F, 10.0F)
      value.Input.Drain(value.Root, value.Resolver, 1.0, nil)
    } else {
      value.Input.HandleKey(value.Root, value.Resolver, Key.Escape, KeyModifiers{})
    }
    GC.Collect()
    GC.WaitForPendingFinalizers()
    GC.Collect()
    let released = !value.Weak.IsAlive && DragDropDisposable.DisposeCount == 0
    GC.KeepAlive(value.Input)
    GC.KeepAlive(value.Root)
    return released
  }
}

internal class DragDropPayloadFactory {
  internal var Value DragDropDisposable?

  internal func Create() DragData? {
    guard let value = Value else { return nil }
    return DragData(value, DragEffect.Move)
  }
}

internal class DragDropPayloadCase {
  internal let Root Node
  internal let Input InputCoordinator
  internal let Resolver Resolver
  internal let Weak WeakReference

  internal init(root Node, input InputCoordinator, resolver Resolver, weak WeakReference) {
    Root = root
    Input = input
    Resolver = resolver
    Weak = weak
  }
}

internal sealed class DragDropDisposable : IDisposable {
  shared { internal var DisposeCount int32 }
  func Dispose() { DisposeCount++ }
}
