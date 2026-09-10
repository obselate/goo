package Goo

import System
import System.Collections.Generic

internal class InputFixtures {
  func TransformRoutesHitsAndLocalPositions() bool {
    let events = List[string]()
    let tree = Reconciler{ Res: Resolver{} }.Mount(Container{
      Width: 20, Height: 20,
      Transform: PanelTransform{ TranslateX: 40 },
      TransformOriginX: Length.Percent(0), TransformOriginY: Length.Percent(0),
      OnPointerDown: (e PointerEvent) -> {
        events.Add(e.Position.X.ToString() + ":" + e.Position.Y.ToString())
      },
      OnWheel: (e WheelEvent) -> {
        events.Add("wheel:" + e.Position.X.ToString() + ":" + e.Position.Y.ToString())
      },
    })
    Layout().Calculate(tree, 100.0F, 100.0F)
    if hitTopmost(tree, 45.0F, 5.0F) != tree || hitTopmost(tree, 5.0F, 5.0F) != nil {
      return false
    }
    let input = PointerInput()
    let resolver = Resolver{}
    input.QueuePress(45.0F, 5.0F)
    input.QueueWheel(45.0F, 5.0F, 0.0F, 1.0F)
    input.Drain(tree, resolver, 0.0, TextInput())
    if events.Count != 2 || events[0] != "5:5" || events[1] != "wheel:5:5" {
      return false
    }

    let nestedEvents = List[string]()
    let nested = Reconciler{ Res: Resolver{} }.Mount(Container{
      Width: 20, Height: 20,
      Transform: PanelTransform{ TranslateX: 20 },
      TransformOriginX: Length.Percent(0), TransformOriginY: Length.Percent(0),
      Children: { Container{
        Width: 10, Height: 10,
        Transform: PanelTransform{ TranslateX: 10 },
        TransformOriginX: Length.Percent(0), TransformOriginY: Length.Percent(0),
        OnPointerDown: (e PointerEvent) -> {
          nestedEvents.Add(e.Position.X.ToString() + ":" + e.Position.Y.ToString())
        },
      } },
    })
    Layout().Calculate(nested, 100.0F, 100.0F)
    let nestedInput = PointerInput()
    nestedInput.QueuePress(35.0F, 5.0F)
    nestedInput.Drain(nested, Resolver{}, 0.0, TextInput())
    if nestedEvents.Count != 1 || nestedEvents[0] != "5:5" { return false }

    let singular = Reconciler{ Res: Resolver{} }.Mount(Container{
      Width: 20, Height: 20, Transform: PanelTransform{ Scale: 0 }, OnClick: () -> {},
    })
    Layout().Calculate(singular, 100.0F, 100.0F)
    if hitTopmost(singular, 10.0F, 10.0F) != nil { return false }

    let shape = Reconciler{ Res: Resolver{} }.Mount(Shape{
      Width: 100, Height: 100,
      Path: PathBuilder().MoveTo(0.5, 0.0).ArcTo(0.5, 0.5, 0.0, false, true, 0.5, 1.0).ArcTo(0.5, 0.5, 0.0, false, true, 0.5, 0.0).Close().Build(),
      Transform: PanelTransform{ TranslateX: 50 },
      TransformOriginX: Length.Percent(0), TransformOriginY: Length.Percent(0),
      OnClick: () -> {},
    })
    Layout().Calculate(shape, 200.0F, 100.0F)
    if hitTopmost(shape, 100.0F, 50.0F) != shape
      || hitTopmost(shape, 55.0F, 5.0F) != nil {
        return false
      }

    let capturedEvents = List[string]()
    let captured = Reconciler{ Res: Resolver{} }.Mount(Container{
      Width: 20, Height: 20,
      Transform: PanelTransform{ TranslateX: 40 },
      TransformOriginX: Length.Percent(0), TransformOriginY: Length.Percent(0),
      OnPointerDown: (e PointerEvent) -> { e.Capture() },
      OnPointerMove: (e PointerEvent) -> {
        capturedEvents.Add(e.Position.X.ToString() + ":" + e.Delta.X.ToString())
      },
    })
    Layout().Calculate(captured, 100.0F, 100.0F)
    let capturedInput = PointerInput()
    capturedInput.QueuePress(45.0F, 5.0F)
    capturedInput.QueueMove(65.0F, 5.0F)
    capturedInput.Drain(captured, Resolver{}, 0.0, TextInput())
    if capturedEvents.Count != 1 || capturedEvents[0] != "25:20" { return false }

    let scaledEvents = List[string]()
    let scaledInput = Reconciler{ Res: Resolver{} }.Mount(Container{
      Width: 20, Height: 20,
      Transform: PanelTransform{ TranslateX: 40, Scale: 2 },
      TransformOriginX: Length.Percent(0), TransformOriginY: Length.Percent(0),
      OnPointerMove: (e PointerEvent) -> {
        scaledEvents.Add(e.Position.X.ToString() + ":" + e.Delta.X.ToString())
      },
    })
    Layout().Calculate(scaledInput, 100.0F, 100.0F)
    let scaledPointer = PointerInput()
    scaledPointer.QueueMove(45.0F, 5.0F)
    scaledPointer.QueueMove(65.0F, 5.0F)
    scaledPointer.Drain(scaledInput, Resolver{}, 0.0, TextInput())
    if scaledEvents.Count != 2 || scaledEvents[1] != "12.5:10" { return false }

    let rotatedEvents = List[PointerEvent]()
    let rotatedInput = Reconciler{ Res: Resolver{} }.Mount(Container{
      Width: 20, Height: 10,
      Transform: PanelTransform{ TranslateX: 20, Rotate: 90 },
      TransformOriginX: Length.Percent(0), TransformOriginY: Length.Percent(0),
      OnPointerMove: (e PointerEvent) -> { rotatedEvents.Add(e) },
    })
    Layout().Calculate(rotatedInput, 100.0F, 100.0F)
    let rotatedPointer = PointerInput()
    rotatedPointer.QueueMove(15.0F, 5.0F)
    rotatedPointer.QueueMove(15.0F, 15.0F)
    rotatedPointer.Drain(rotatedInput, Resolver{}, 0.0, TextInput())
    if rotatedEvents.Count != 2 { return false }
    let rotatedEvent = rotatedEvents[1]
    if Math.Abs(rotatedEvent.Position.X - 15.0) > 0.001
      || Math.Abs(rotatedEvent.Position.Y - 5.0) > 0.001
      || Math.Abs(rotatedEvent.Delta.X - 10.0) > 0.001
      || Math.Abs(rotatedEvent.Delta.Y) > 0.001 {
        return false
      }

    let entry = Reconciler{ Res: Resolver{} }.Mount(TextEntry{
      Value: "WW", Width: 200, Height: 30, FontSize: 20,
      Transform: PanelTransform{ TranslateX: 40 },
      TransformOriginX: Length.Percent(0), TransformOriginY: Length.Percent(0),
    })
    Layout().Calculate(entry, 240.0F, 40.0F)
    let metrics = TextMetrics()
    let entryShape = metrics.BufferShape(entry)
    let origin = metrics.EntryOriginX(entry, entryShape)
    let gap = entryShape.CaretX(1, int32(TextAffinity.Downstream))
    PointerInput().HandlePress(entry, Resolver{}, TextInput(), 0.0,
      40.0F + origin + gap, entry.Rect.Y + entry.Rect.H * 0.5F)
    return entry.Caret == 1
  }

  func ShapeStrokeHitChangesInvalidateInputContract() bool {
    let path = PathBuilder().MoveTo(0.0, 0.0).LineTo(1.0, 1.0).Build()
    let red = Color.Rgb(255, 0, 0)
    let solid = inputShape(path, StrokeCap.Butt, StrokeJoin.Miter, 4.0, nil, red)
    if shapeDiffHasInput(solid,
      inputShape(path, StrokeCap.Butt, StrokeJoin.Miter, 4.0, nil, red)) {
        return false
      }
    if !shapeDiffHasInput(solid,
      inputShape(path, StrokeCap.Round, StrokeJoin.Miter, 4.0, nil, red)) {
        return false
      }
    if !shapeDiffHasInput(solid,
      inputShape(path, StrokeCap.Butt, StrokeJoin.Bevel, 4.0, nil, red)) {
        return false
      }
    if !shapeDiffHasInput(solid,
      inputShape(path, StrokeCap.Butt, StrokeJoin.Miter, 2.0, nil, red)) {
        return false
      }
    if !shapeDiffHasInput(solid,
      inputShape(path, StrokeCap.Butt, StrokeJoin.Miter, 4.0,
        DashPattern([]float64{ 4.0, 2.0 }, 0.0), red)) {
          return false
        }
    return shapeDiffHasInput(solid,
      inputShape(path, StrokeCap.Butt, StrokeJoin.Miter, 4.0, nil, Color.Transparent))
  }

  private func inputShape(path VectorPath, cap StrokeCap, join StrokeJoin,
    miterLimit float64, dashes DashPattern?, color Color) Shape -> Shape{
      Width: 100, Height: 100, Path: path, BorderWidth: 8, BorderColor: color,
      StrokeCap: cap, StrokeJoin: join, MiterLimit: miterLimit, Dashes: dashes,
    }

  private func shapeDiffHasInput(before Shape, after Shape) bool {
    let node = Reconciler{ Res: Resolver{} }.Mount(before)
    let reconciler = Reconciler{ Res: Resolver{} }
    reconciler.Diff(node, after)
    return (int32(reconciler.Effects) & int32(ReconcileEffects.Input)) != 0
  }

  func EntryBufferShapeIsRetainedAcrossReads() bool {
    let entry = Reconciler{ Res: Resolver{} }.Mount(TextEntry{
      Value: "abc", Width: 200, Height: 30, FontSize: 20,
    })
    Layout().Calculate(entry, 240.0F, 40.0F)
    let metrics = TextMetrics()
    let first = metrics.BufferShape(entry)
    let second = metrics.BufferShape(entry)
    if first != second { return false }
    entry.Buffer = "abcd"
    let third = metrics.BufferShape(entry)
    return second != third
  }

  func PointerDrainConsumesThrowingEventOnceAndRetainsRest() bool {
    let events = List[string]()
    var throwNext = true
    let root = Reconciler{ Res: Resolver{} }.Mount(Container{
      Width: 100.0F,
      Height: 30.0F,
      OnPointerMove: (e PointerEvent) -> {
        events.Add(int32(e.WindowPosition.X).ToString())
        if throwNext {
          throwNext = false
          throw InvalidOperationException("pointer queue")
        }
      },
    })
    Layout().Calculate(root, 100.0F, 30.0F)
    let input = PointerInput()
    input.QueueMove(10.0F, 10.0F)
    input.QueueMove(20.0F, 10.0F)
    input.QueueMove(30.0F, 10.0F)
    var threw = false
    try {
      input.Drain(root, Resolver{}, 0.0, TextInput())
    } catch (e Exception) {
      threw = true
    }
    if !threw || events.Count != 1 || events[0] != "10" {
      return false
    }
    input.Drain(root, Resolver{}, 0.0, TextInput())
    if events.Count != 3 || events[1] != "20" || events[2] != "30" {
      return false
    }
    input.Drain(root, Resolver{}, 0.0, TextInput())
    return events.Count == 3
  }

  func KeyboardDrainConsumesThrowingEventOnceAndRetainsRest() bool {
    let keyboard = KeyboardInput()
    let text = TextInput()
    let seen = List[Key]()
    var throwNext = true
    let onKeyPress(Key, KeyModifiers) -> void = (key Key, modifiers KeyModifiers) -> {
      seen.Add(key)
      if throwNext {
        throwNext = false
        throw InvalidOperationException("keyboard queue")
      }
    }
    keyboard.QueueKeyPress(Key.A, KeyModifiers{})
    keyboard.QueueKeyPress(Key.B, KeyModifiers{})
    keyboard.QueueKeyPress(Key.C, KeyModifiers{})
    var threw = false
    try {
      keyboard.Drain(nil, Resolver{}, text, onKeyPress)
    } catch (e Exception) {
      threw = true
    }
    if !threw || seen.Count != 1 || seen[0] != Key.A {
      return false
    }
    keyboard.Drain(nil, Resolver{}, text, onKeyPress)
    if seen.Count != 3 || seen[1] != Key.B || seen[2] != Key.C {
      return false
    }
    keyboard.Drain(nil, Resolver{}, text, onKeyPress)
    return seen.Count == 3
  }

  func KeyboardRepeatCancelsWhenFocusedEntryBecomesUnavailable() bool {
    let cell = InputDisableFocusedEntryCell{}
    let driver = InputFixtureDriver(cell, 200, 50)
    driver.Press(10.0F, 10.0F)
    driver.Input.QueueKeyPress(Key.Backspace, KeyModifiers{})
    driver.Drain()
    if driver.Input.NextTickDeadlineSeconds() > 0.41 {
      return false
    }
    cell.Disable()
    driver.Update()
    return driver.Input.NextTickDeadlineSeconds() >= 0.99
  }

  func PointerLifecycleBubblesStopsAndReportsAllMouseButtons() bool {
    let events = List[string]()
    let cell = InputPointerLifecycleCell{ Events: events }
    let driver = InputFixtureDriver(cell, 100, 100)
    let modifiers = KeyModifiers{ Alt: true, Shift: true, Ctrl: true, Super: true }

    driver.Input.QueuePointerPress(35.0F, 37.0F, PointerButton.Primary, modifiers)
    driver.Input.QueuePointerPress(35.0F, 37.0F, PointerButton.Secondary, modifiers)
    driver.Input.QueuePointerMove(38.0F, 41.0F, modifiers)
    driver.Input.QueuePointerRelease(38.0F, 41.0F, PointerButton.Secondary, modifiers)
    driver.Input.QueuePointerPress(38.0F, 41.0F, PointerButton.Middle, modifiers)
    driver.Input.QueuePointerRelease(38.0F, 41.0F, PointerButton.Middle, modifiers)
    driver.Input.QueuePointerPress(38.0F, 41.0F, PointerButton.Back, modifiers)
    driver.Input.QueuePointerRelease(38.0F, 41.0F, PointerButton.Back, modifiers)
    driver.Input.QueuePointerPress(38.0F, 41.0F, PointerButton.Forward, modifiers)
    driver.Input.QueuePointerRelease(38.0F, 41.0F, PointerButton.Forward, modifiers)
    driver.Input.QueuePointerRelease(38.0F, 41.0F, PointerButton.Primary, modifiers)
    driver.Drain()

    let expected = []string{
      "down:leaf:1:1:20:20:35:37:0:0:1111", "down:mid:1:1:25:27:35:37:0:0:1111", "down:root:1:1:35:37:35:37:0:0:1111",
      "down:leaf:2:3:20:20:35:37:0:0:1111",
      "move:leaf:0:3:23:24:38:41:3:4:1111", "move:mid:0:3:28:31:38:41:3:4:1111", "move:root:0:3:38:41:38:41:3:4:1111",
      "up:leaf:2:1:23:24:38:41:0:0:1111", "up:mid:2:1:28:31:38:41:0:0:1111", "up:root:2:1:38:41:38:41:0:0:1111",
      "down:leaf:3:5:23:24:38:41:0:0:1111", "down:mid:3:5:28:31:38:41:0:0:1111", "down:root:3:5:38:41:38:41:0:0:1111",
      "up:leaf:3:1:23:24:38:41:0:0:1111", "up:mid:3:1:28:31:38:41:0:0:1111", "up:root:3:1:38:41:38:41:0:0:1111",
      "down:leaf:4:9:23:24:38:41:0:0:1111", "down:mid:4:9:28:31:38:41:0:0:1111", "down:root:4:9:38:41:38:41:0:0:1111",
      "up:leaf:4:1:23:24:38:41:0:0:1111", "up:mid:4:1:28:31:38:41:0:0:1111", "up:root:4:1:38:41:38:41:0:0:1111",
      "down:leaf:5:17:23:24:38:41:0:0:1111", "down:mid:5:17:28:31:38:41:0:0:1111", "down:root:5:17:38:41:38:41:0:0:1111",
      "up:leaf:5:1:23:24:38:41:0:0:1111", "up:mid:5:1:28:31:38:41:0:0:1111", "up:root:5:1:38:41:38:41:0:0:1111",
      "up:leaf:1:0:23:24:38:41:0:0:1111", "up:mid:1:0:28:31:38:41:0:0:1111", "up:root:1:0:38:41:38:41:0:0:1111",
    }
    if events.Count != expected.Length {
      return false
    }
    for i in 0 ... expected.Length {
      if events[i] != expected[i] {
        return false
      }
    }
    return cell.Clicks == 0
  }

  func PointerCaptureRoutesMiddleDragUntilRelease() bool {
    let events = List[string]()
    let cell = InputPointerCaptureCell{ Events: events }
    let driver = InputFixtureDriver(cell, 200, 100)

    driver.PointerDown(25.0F, 25.0F, PointerButton.Middle)
    driver.Input.QueuePointerMove(125.0F, 25.0F, KeyModifiers{})
    driver.PointerUp(125.0F, 25.0F, PointerButton.Middle)
    driver.Input.QueuePointerMove(125.0F, 25.0F, KeyModifiers{})
    driver.Drain()

    cell.ReleaseOnCapturedMove = true
    driver.PointerDown(25.0F, 25.0F, PointerButton.Middle)
    driver.Input.QueuePointerMove(125.0F, 25.0F, KeyModifiers{})
    driver.Input.QueuePointerMove(125.0F, 25.0F, KeyModifiers{})
    driver.PointerUp(125.0F, 25.0F, PointerButton.Middle)
    driver.Drain()

    let expected = []string{
      "down:child", "down:root", "move:child", "move:root", "up:child", "up:root",
      "move:sibling", "move:root", "down:child", "down:root", "move:child", "move:root",
      "move:sibling", "move:root", "up:sibling", "up:root",
    }
    if events.Count != expected.Length || cell.Clicks != 0 { return false }
    for i in 0 ... expected.Length {
      if events[i] != expected[i] { return false }
    }
    return true
  }

  func PointerIdentityKeepsContactsIndependent() bool {
    let events = List[string]()
    let cell = InputMultiPointerCell{ Events: events }
    let driver = InputFixtureDriver(cell, 200, 100)
    let modifiers = KeyModifiers{}
    driver.Input.QueuePointerPress(101, PointerDevice.Touch, 25.0F, 25.0F,
      PointerButton.Primary, modifiers)
    driver.Input.QueuePointerPress(202, PointerDevice.Touch, 125.0F, 25.0F,
      PointerButton.Primary, modifiers)
    driver.Drain()
    guard let pressed = driver.Window.Tree else { return false }
    if !pressed.Pressed || !pressed.Children[0].Pressed || !pressed.Children[1].Pressed {
      return false
    }
    driver.Input.QueuePointerMove(101, PointerDevice.Touch, 175.0F, 25.0F, modifiers)
    driver.Input.QueuePointerMove(202, PointerDevice.Touch, 25.0F, 25.0F, modifiers)
    driver.Input.QueuePointerCancel(202, PointerDevice.Touch)
    driver.Drain()
    guard let canceled = driver.Window.Tree else { return false }
    if !canceled.Pressed || !canceled.Children[0].Pressed || canceled.Children[1].Pressed
      || !canceled.Children[0].Focused{
        return false
      }
    driver.Input.QueuePointerMove(101, PointerDevice.Touch, 175.0F, 25.0F, modifiers)
    driver.Input.QueuePointerRelease(101, PointerDevice.Touch, 175.0F, 25.0F,
      PointerButton.Primary, modifiers)
    driver.Drain()
    guard let released = driver.Window.Tree else { return false }
    if released.Pressed || released.Children[0].Pressed || released.Children[1].Pressed {
      return false
    }
    return containsPointerEvent(events, "move:left:101:Touch")
      && containsPointerEvent(events, "move:right:202:Touch")
      && containsPointerEvent(events, "cancel:right:202:Touch")
      && containsPointerEvent(events, "up:left:101:Touch")
  }

  func MouseRemainsPrimaryWhileTouchIsHeld() bool {
    let events = List[string]()
    let cell = InputMultiPointerCell{ Events: events }
    let driver = InputFixtureDriver(cell, 200, 100)
    let modifiers = KeyModifiers{}
    driver.Input.QueuePointerPress(101, PointerDevice.Touch, 25.0F, 25.0F,
      PointerButton.Primary, modifiers)
    driver.Input.QueuePointerPress(0, PointerDevice.Mouse, 125.0F, 25.0F,
      PointerButton.Primary, modifiers)
    driver.Input.QueuePointerRelease(0, PointerDevice.Mouse, 125.0F, 25.0F,
      PointerButton.Primary, modifiers)
    driver.Drain()
    driver.Input.QueuePointerCancel(101, PointerDevice.Touch)
    driver.Drain()
    guard let tree = driver.Window.Tree else { return false }
    return cell.RightClicks == 1 && tree.Children[1].Focused
      && containsPointerEvent(events, "down:right:0:Mouse")
  }

  func PenIdentityIsDistinctFromTouchIdentity() bool {
    let events = List[string]()
    let cell = InputMultiPointerCell{ Events: events }
    let driver = InputFixtureDriver(cell, 200, 100)
    let modifiers = KeyModifiers{}
    driver.Input.QueuePointerPress(41, PointerDevice.Touch, 25.0F, 25.0F,
      PointerButton.Primary, modifiers)
    driver.Input.QueuePointerPress(41, PointerDevice.Pen, 125.0F, 25.0F,
      PointerButton.Primary, modifiers)
    driver.Input.QueuePointerMove(41, PointerDevice.Touch, 175.0F, 25.0F, modifiers)
    driver.Input.QueuePointerMove(41, PointerDevice.Pen, 25.0F, 25.0F, modifiers)
    driver.Input.QueuePointerRelease(41, PointerDevice.Pen, 25.0F, 25.0F,
      PointerButton.Primary, modifiers)
    driver.Input.QueuePointerCancel(41, PointerDevice.Touch)
    driver.Drain()
    return containsPointerEvent(events, "down:left:41:Touch")
      && containsPointerEvent(events, "down:right:41:Pen")
      && containsPointerEvent(events, "move:left:41:Touch")
      && containsPointerEvent(events, "move:right:41:Pen")
      && containsPointerEvent(events, "up:right:41:Pen")
      && containsPointerEvent(events, "cancel:left:41:Touch")
  }

  func TouchCancelRetainsPreexistingFocus() bool {
    let cell = InputMultiPointerCell{ Events: List[string]() }
    let driver = InputFixtureDriver(cell, 200, 100)
    guard let tree = driver.Window.Tree else { return false }
    let left = tree.Children[0]
    if !driver.Input.FocusElement(driver.Resolver, left) { return false }
    driver.Input.QueuePointerPress(101, PointerDevice.Touch, 25.0F, 25.0F,
      PointerButton.Primary, KeyModifiers{})
    driver.Input.QueuePointerCancel(101, PointerDevice.Touch)
    driver.Drain()
    guard let updated = driver.Window.Tree else { return false }
    return updated.Children[0].Focused && !updated.Children[1].Focused
  }

  func TouchPrimaryWaitsForAllContactsToEnd() bool {
    let events = List[string]()
    let cell = InputMultiPointerCell{ Events: events }
    let driver = InputFixtureDriver(cell, 200, 100)
    let modifiers = KeyModifiers{}
    driver.Input.QueuePointerPress(1, PointerDevice.Touch, 25.0F, 25.0F,
      PointerButton.Primary, modifiers)
    driver.Input.QueuePointerPress(2, PointerDevice.Touch, 125.0F, 25.0F,
      PointerButton.Primary, modifiers)
    driver.Input.QueuePointerRelease(1, PointerDevice.Touch, 25.0F, 25.0F,
      PointerButton.Primary, modifiers)
    driver.Input.QueuePointerPress(3, PointerDevice.Touch, 125.0F, 25.0F,
      PointerButton.Primary, modifiers)
    driver.Input.QueuePointerRelease(3, PointerDevice.Touch, 125.0F, 25.0F,
      PointerButton.Primary, modifiers)
    driver.Input.QueuePointerRelease(2, PointerDevice.Touch, 125.0F, 25.0F,
      PointerButton.Primary, modifiers)
    driver.Drain()
    guard let tree = driver.Window.Tree else { return false }
    if cell.LeftClicks != 1 || cell.RightClicks != 0 || !tree.Children[0].Focused
      || !containsPointerEvent(events, "down:right:3:Touch")
      || !containsPointerEvent(events, "up:right:3:Touch") {
        return false
      }
    driver.Input.QueuePointerPress(4, PointerDevice.Touch, 125.0F, 25.0F,
      PointerButton.Primary, modifiers)
    driver.Input.QueuePointerRelease(4, PointerDevice.Touch, 125.0F, 25.0F,
      PointerButton.Primary, modifiers)
    driver.Drain()
    guard let restarted = driver.Window.Tree else { return false }
    return cell.RightClicks == 1 && restarted.Children[1].Focused
  }

  func PointerResetStartsTheNextTouchSequence() bool {
    let cell = InputMultiPointerCell{ Events: List[string]() }
    let driver = InputFixtureDriver(cell, 200, 100)
    let modifiers = KeyModifiers{}
    driver.Input.QueuePointerPress(1, PointerDevice.Touch, 25.0F, 25.0F,
      PointerButton.Primary, modifiers)
    driver.Drain()
    driver.Input.Reset(driver.Window.Tree, driver.Resolver)
    driver.Update()
    driver.Input.QueuePointerPress(2, PointerDevice.Touch, 125.0F, 25.0F,
      PointerButton.Primary, modifiers)
    driver.Input.QueuePointerRelease(2, PointerDevice.Touch, 125.0F, 25.0F,
      PointerButton.Primary, modifiers)
    driver.Drain()
    guard let tree = driver.Window.Tree else { return false }
    return cell.RightClicks == 1 && tree.Children[1].Focused
  }

  func PenHoverKeepsContactStateUntilCancel() bool {
    let events = List[string]()
    let driver = InputFixtureDriver(InputPenHoverCell{ Events: events }, 100, 100)
    let modifiers = KeyModifiers{}
    driver.Input.QueuePointerMove(91, PointerDevice.Pen, 20.0F, 20.0F, modifiers)
    driver.Input.QueuePointerPress(91, PointerDevice.Pen, 25.0F, 20.0F,
      PointerButton.Primary, modifiers)
    driver.Input.QueuePointerRelease(91, PointerDevice.Pen, 25.0F, 20.0F,
      PointerButton.Primary, modifiers)
    driver.Input.QueuePointerMove(91, PointerDevice.Pen, 35.0F, 20.0F, modifiers)
    driver.Drain()
    if events.Count != 2 || events[0] != "91:Pen:0:0:0" || events[1] != "91:Pen:10:0:0" {
      return false
    }
    driver.Input.QueuePointerCancel(91, PointerDevice.Pen)
    driver.Input.QueuePointerMove(91, PointerDevice.Pen, 45.0F, 20.0F, modifiers)
    driver.Drain()
    return events.Count == 3 && events[2] == "91:Pen:0:0:0"
  }

  func PointerPrimaryAndPressureContract() bool {
    let events = List[PointerEvent]()
    let driver = InputFixtureDriver(InputPointerPressureCell{ Events: events }, 100, 100)
    let modifiers = KeyModifiers{}
    driver.Input.QueuePointerPress(1, PointerDevice.Touch, 10.0F, 10.0F,
      PointerButton.Primary, modifiers, 0.2F)
    driver.Input.QueuePointerPress(2, PointerDevice.Touch, 10.0F, 10.0F,
      PointerButton.Primary, modifiers, 0.3F)
    driver.Input.QueuePointerMove(2, PointerDevice.Touch, 20.0F, 10.0F, modifiers, 0.4F)
    driver.Input.QueuePointerRelease(1, PointerDevice.Touch, 10.0F, 10.0F,
      PointerButton.Primary, modifiers, 0.5F)
    driver.Input.QueuePointerPress(3, PointerDevice.Touch, 10.0F, 10.0F,
      PointerButton.Primary, modifiers, 0.6F)
    driver.Input.QueuePointerRelease(2, PointerDevice.Touch, 10.0F, 10.0F,
      PointerButton.Primary, modifiers, 0.7F)
    driver.Input.QueuePointerRelease(3, PointerDevice.Touch, 10.0F, 10.0F,
      PointerButton.Primary, modifiers, 0.8F)
    driver.Input.QueuePointerPress(4, PointerDevice.Touch, 10.0F, 10.0F,
      PointerButton.Primary, modifiers, 0.9F)
    driver.Input.QueuePointerRelease(4, PointerDevice.Touch, 10.0F, 10.0F,
      PointerButton.Primary, modifiers, 1.0F)
    driver.Input.QueuePointerPress(41, PointerDevice.Pen, 10.0F, 10.0F,
      PointerButton.Primary, modifiers, 0.1F)
    driver.Input.QueuePointerPress(42, PointerDevice.Pen, 10.0F, 10.0F,
      PointerButton.Primary, modifiers, 0.2F)
    driver.Input.QueuePointerRelease(41, PointerDevice.Pen, 10.0F, 10.0F,
      PointerButton.Primary, modifiers, 0.3F)
    driver.Input.QueuePointerRelease(42, PointerDevice.Pen, 10.0F, 10.0F,
      PointerButton.Primary, modifiers, 0.4F)
    driver.Input.QueuePointerPress(43, PointerDevice.Pen, 10.0F, 10.0F,
      PointerButton.Primary, modifiers, 0.5F)
    driver.Input.QueuePointerPress(10.0F, 10.0F, PointerButton.Primary, modifiers)
    driver.Input.QueuePointerPress(10.0F, 10.0F, PointerButton.Secondary, modifiers)
    driver.Input.QueuePointerRelease(10.0F, 10.0F, PointerButton.Primary, modifiers)
    driver.Input.QueuePointerRelease(10.0F, 10.0F, PointerButton.Secondary, modifiers)
    driver.Drain()
    return events.Count == 18
      && pointerState(events[0], 1, PointerDevice.Touch, true, 0.2)
      && pointerState(events[1], 2, PointerDevice.Touch, false, 0.3)
      && pointerState(events[2], 2, PointerDevice.Touch, false, 0.4)
      && pointerState(events[3], 1, PointerDevice.Touch, true, 0.5)
      && pointerState(events[4], 3, PointerDevice.Touch, false, 0.6)
      && pointerState(events[5], 2, PointerDevice.Touch, false, 0.7)
      && pointerState(events[6], 3, PointerDevice.Touch, false, 0.8)
      && pointerState(events[7], 4, PointerDevice.Touch, true, 0.9)
      && pointerState(events[8], 4, PointerDevice.Touch, true, 1.0)
      && pointerState(events[9], 41, PointerDevice.Pen, true, 0.1)
      && pointerState(events[10], 42, PointerDevice.Pen, false, 0.2)
      && pointerState(events[11], 41, PointerDevice.Pen, true, 0.3)
      && pointerState(events[12], 42, PointerDevice.Pen, false, 0.4)
      && pointerState(events[13], 43, PointerDevice.Pen, true, 0.5)
      && pointerState(events[14], 0, PointerDevice.Mouse, true, 1.0)
      && pointerState(events[15], 0, PointerDevice.Mouse, true, 1.0)
      && pointerState(events[16], 0, PointerDevice.Mouse, true, 0.0)
      && pointerState(events[17], 0, PointerDevice.Mouse, true, 0.0)
  }

  func PointerHoverLifecycleOrderAndFailureContract() bool {
    if !hoverSiblingOrder() || !hoverUnavailableOrder(1, false) || !hoverUnavailableOrder(2, true)
      || !hoverUnavailableOrder(3, false) || !hoverFocusLossOrder() || !hoverTransformOrder() {
        return false
      }
    let events = List[string]()
    let cell = InputPointerHoverLifecycleCell{ Events: events, ThrowOnEnter: true }
    let driver = InputFixtureDriver(cell, 200, 100)
    var threw = false
    try {
      driver.Move(25.0F, 25.0F)
    } catch (error Exception) {
      threw = true
    }
    guard let afterThrow = driver.Window.Tree else { return false }
    if !threw || !afterThrow.Hovered || !afterThrow.Children[0].Hovered {
      return false
    }
    cell.ThrowOnEnter = false
    driver.Move(25.0F, 25.0F)
    guard let recovered = driver.Window.Tree else { return false }
    return recovered.Hovered && recovered.Children[0].Hovered
      && events.Count == 3 && events[0] == "enter:root" && events[1] == "enter:ancestor"
      && events[2] == "enter:leaf"
  }

  private func hoverSiblingOrder() bool {
    let events = List[string]()
    let driver = InputFixtureDriver(InputPointerHoverLifecycleCell{ Events: events }, 200, 100)
    driver.Move(25.0F, 25.0F)
    driver.Move(125.0F, 25.0F)
    return equalEvents(events, []string{
      "enter:root", "enter:ancestor", "enter:leaf", "leave:leaf", "leave:ancestor",
      "enter:sibling",
    })
  }

  private func hoverUnavailableOrder(cause int32, leavesRoot bool) bool {
    let events = List[string]()
    let cell = InputPointerHoverLifecycleCell{ Events: events }
    let driver = InputFixtureDriver(cell, 200, 100)
    driver.Move(25.0F, 25.0F)
    cell.Cause = cause
    cell.Rebuild()
    driver.Update()
    let expected = leavesRoot ? []string{
      "enter:root", "enter:ancestor", "enter:leaf", "leave:leaf", "leave:ancestor", "leave:root",
    } : []string{
      "enter:root", "enter:ancestor", "enter:leaf", "leave:leaf", "leave:ancestor",
    }
    return equalEvents(events, expected)
  }

  private func hoverFocusLossOrder() bool {
    let events = List[string]()
    let driver = InputFixtureDriver(InputPointerHoverLifecycleCell{ Events: events }, 200, 100)
    driver.Move(25.0F, 25.0F)
    driver.FocusLost()
    return equalEvents(events, []string{
      "enter:root", "enter:ancestor", "enter:leaf", "leave:leaf", "leave:ancestor", "leave:root",
    })
  }

  private func hoverTransformOrder() bool {
    let events = List[PointerEvent]()
    let root = Reconciler{ Res: Resolver{} }.Mount(Container{
      Width: 20, Height: 20,
      Transform: PanelTransform{ TranslateX: 40 },
      TransformOriginX: Length.Percent(0), TransformOriginY: Length.Percent(0),
      OnPointerEnter: (e PointerEvent) -> { events.Add(e) },
      OnPointerLeave: (e PointerEvent) -> { events.Add(e) },
    })
    Layout().Calculate(root, 100.0F, 100.0F)
    let input = PointerInput()
    let resolver = Resolver{}
    input.HandleMove(root, resolver, 45.0F, 5.0F)
    input.HandleMove(root, resolver, 75.0F, 5.0F)
    return events.Count == 2 && Math.Abs(events[0].Position.X - 5.0) < 0.001
      && Math.Abs(events[1].Position.X - 35.0) < 0.001
  }

  private func equalEvents(actual List[string], expected []string) bool {
    if actual.Count != expected.Length { return false }
    for i in 0 ... expected.Length {
      if actual[i] != expected[i] { return false }
    }
    return true
  }

  private func pointerState(event PointerEvent, id int64, device PointerDevice, primary bool,
    expectedPressure float64) bool -> event.PointerId == id && event.Device == device && event.IsPrimary == primary
    && Math.Abs(event.Pressure - expectedPressure) < 0.001

  func PointerAndKeyboardPressesShareStateSafely() bool {
    let driver = InputFixtureDriver(InputPressedOwnershipCell{}, 100, 50)
    guard let tree = driver.Window.Tree else { return false }
    if !driver.Input.FocusElement(driver.Resolver, tree) { return false }
    driver.Input.QueuePointerPress(25.0F, 25.0F, PointerButton.Primary, KeyModifiers{})
    driver.Input.QueueKeyPress(Key.Space, KeyModifiers{})
    driver.Input.QueueKeyRelease(Key.Space)
    driver.Drain()
    if !tree.Pressed || tree.PointerPressCount != 1 || tree.KeyboardPressed { return false }
    driver.Input.QueuePointerRelease(25.0F, 25.0F, PointerButton.Primary, KeyModifiers{})
    driver.Drain()
    if tree.Pressed || tree.PointerPressCount != 0 || tree.KeyboardPressed { return false }

    driver.Input.QueuePointerPress(25.0F, 25.0F, PointerButton.Primary, KeyModifiers{})
    driver.Input.QueueKeyPress(Key.Space, KeyModifiers{})
    driver.Drain()
    if !tree.Pressed || tree.PointerPressCount != 1 || !tree.KeyboardPressed { return false }
    driver.Input.QueuePointerRelease(25.0F, 25.0F, PointerButton.Primary, KeyModifiers{})
    driver.Drain()
    if !tree.Pressed || tree.PointerPressCount != 0 || !tree.KeyboardPressed { return false }
    driver.Input.QueueKeyRelease(Key.Space)
    driver.Drain()
    return !tree.Pressed && tree.PointerPressCount == 0 && !tree.KeyboardPressed
  }

  private func containsPointerEvent(events List[string], prefix string) bool {
    for i in 0 ... events.Count {
      if events[i].StartsWith(prefix) { return true }
    }
    return false
  }

  func PointerCancelBalancesAnActiveRouteOnFocusLossAndInvalidation() bool -> cancelAfterFocusLoss()
    && cancelAfterInvalidation(1)
    && cancelAfterInvalidation(2)
    && cancelAfterInvalidation(3)
    && cancelAfterInvalidation(4)
    && cancelAfterInvalidation(5)
    && completedPointerRouteDoesNotCancel()
    && throwingCancelStillCleansUp()
    && throwingUpStillCleansUp()

  private func cancelAfterFocusLoss() bool {
    let events = List[string]()
    let cell = InputPointerCancelCell{ Events: events }
    let driver = InputFixtureDriver(cell, 100, 100)
    let modifiers = KeyModifiers{ Alt: true, Shift: true, Ctrl: true, Super: true }
    driver.Move(25.0F, 25.0F)
    driver.Input.QueuePointerPress(25.0F, 25.0F, PointerButton.Primary, modifiers)
    driver.FocusLost()
    driver.Drain()
    return cancelledPointerRouteIsBalanced(cell, driver, events)
  }

  private func cancelAfterInvalidation(cause int32) bool {
    let events = List[string]()
    let cell = InputPointerCancelCell{ Events: events }
    let driver = InputFixtureDriver(cell, 100, 100)
    let modifiers = KeyModifiers{ Alt: true, Shift: true, Ctrl: true, Super: true }
    driver.Input.QueuePointerPress(25.0F, 25.0F, PointerButton.Primary, modifiers)
    driver.Drain()
    cell.Cause = cause
    cell.Rebuild()
    driver.Update()
    return cancelledPointerRouteIsBalanced(cell, driver, events)
  }

  private func cancelledPointerRouteIsBalanced(cell InputPointerCancelCell,
    driver InputFixtureDriver, events List[string]) bool{
      let expected = []string{
        "down:child:1:1:15:15:25:25:0:0:1111",
        "down:root:1:1:25:25:25:25:0:0:1111",
        "cancel:child:0:0:15:15:25:25:0:0:1111",
        "cancel:root:0:0:25:25:25:25:0:0:1111",
      }
      if events.Count != expected.Length {
        return false
      }
      for i in 0 ... expected.Length {
        if events[i] != expected[i] {
          return false
        }
      }
      if cell.Cause != 1 {
        guard let tree = driver.Window.Tree else { return false }
        if tree.Children[0].Hovered || tree.Children[0].Pressed { return false }
      }
      driver.PointerUp(25.0F, 25.0F, PointerButton.Primary)
      driver.Drain()
      driver.Update()
      return events.Count == expected.Length && cell.Clicks == 0
    }

  private func completedPointerRouteDoesNotCancel() bool {
    let events = List[string]()
    let cell = InputPointerCancelCell{ Events: events }
    let driver = InputFixtureDriver(cell, 100, 100)
    let modifiers = KeyModifiers{ Alt: true, Shift: true, Ctrl: true, Super: true }
    driver.Input.QueuePointerPress(25.0F, 25.0F, PointerButton.Primary, modifiers)
    driver.PointerUp(25.0F, 25.0F, PointerButton.Primary)
    driver.Drain()
    let expected = []string{
      "down:child:1:1:15:15:25:25:0:0:1111",
      "down:root:1:1:25:25:25:25:0:0:1111",
      "up:child:1:0:15:15:25:25:0:0:0000",
      "up:root:1:0:25:25:25:25:0:0:0000",
    }
    if events.Count != expected.Length || cell.Clicks != 1 {
      return false
    }
    for i in 0 ... expected.Length {
      if events[i] != expected[i] {
        return false
      }
    }
    cell.Cause = 3
    cell.Rebuild()
    driver.Update()
    cell.Cause = 1
    cell.Rebuild()
    driver.Update()
    return events.Count == expected.Length && cell.Clicks == 1
  }

  private func throwingCancelStillCleansUp() bool {
    let events = List[string]()
    let cell = InputPointerCancelCell{ Events: events, ThrowOnCancel: true }
    let driver = InputFixtureDriver(cell, 100, 100)
    driver.PointerDown(25.0F, 25.0F, PointerButton.Primary)
    driver.Drain()
    cell.Cause = 1
    cell.Rebuild()
    var threw = false
    try {
      driver.Update()
    } catch (e Exception) {
      threw = true
    }
    if !threw || events.Count != 4 {
      return false
    }
    driver.PointerUp(25.0F, 25.0F, PointerButton.Primary)
    driver.Drain()
    driver.Update()
    return events.Count == 4 && cell.Clicks == 0
  }

  private func throwingUpStillCleansUp() bool {
    let events = List[string]()
    let cell = InputPointerCancelCell{ Events: events, ThrowOnUp: true }
    let driver = InputFixtureDriver(cell, 100, 100)
    driver.PointerDown(25.0F, 25.0F, PointerButton.Primary)
    driver.Drain()
    driver.PointerUp(25.0F, 25.0F, PointerButton.Primary)
    var threw = false
    try {
      driver.Drain()
    } catch (e Exception) {
      threw = true
    }
    if !threw || events.Count != 3 {
      return false
    }
    cell.Cause = 1
    cell.Rebuild()
    driver.Update()
    try {
      driver.Drain()
    } catch (e Exception) {
      return false
    }
    return events.Count == 3 && cell.Clicks == 0
  }

  func PointerHoverActiveAndSiblingIsolation() bool {
    let chain = InputFixtureDriver(InputStaticCell{}, 200, 200)
    chain.Move(25.0F, 25.0F)
    guard let root = chain.Window.Tree else { return false }
    let inner = root.Children[0]
    if !root.Hovered || !inner.Hovered || root.Opacity != 0.5 || inner.Opacity != 0.25 {
      return false
    }
    chain.Press(25.0F, 25.0F)
    if !root.Pressed || !inner.Pressed {
      return false
    }
    chain.Release(25.0F, 25.0F)
    if root.Pressed || inner.Pressed {
      return false
    }
    chain.Move(150.0F, 150.0F)
    if !root.Hovered || inner.Hovered || inner.Opacity != 1.0 {
      return false
    }

    let siblings = InputFixtureDriver(InputTwoCardsCell{}, 200, 200)
    siblings.Move(25.0F, 25.0F)
    guard let cards = siblings.Window.Tree else { return false }
    return cards.Children[0].Opacity == 0.5 && cards.Children[1].Opacity == 1.0
  }

  func PointerReacquiresHoverAfterRebuild() bool {
    let cell = InputHoverReplacementCell{}
    let driver = InputFixtureDriver(cell, 200, 200)
    driver.Move(25.0F, 25.0F)
    guard let before = driver.Window.Tree else { return false }
    let old = before.Children[0]
    cell.Increment()
    driver.Update()
    guard let after = driver.Window.Tree else { return false }
    let current = after.Children[0]
    return current != old && current.Hovered && current.Opacity == 0.5
  }

  func PointerEventsFlushStyleChangesInOrder() bool {
    let cell = InputHoverHidesCell{}
    let driver = InputFixtureDriver(cell, 200, 200)
    driver.Input.QueuePointerMove(25.0F, 25.0F)
    driver.Input.QueuePointerPress(25.0F, 25.0F, PointerButton.Primary, KeyModifiers{})
    driver.Input.QueuePointerRelease(25.0F, 25.0F, PointerButton.Primary, KeyModifiers{})
    driver.Drain()
    return cell.Clicks == 0
  }

  func FocusTransferAndTraversal() bool {
    let clear = InputFixtureDriver(InputFocusCell{}, 200, 200)
    clear.Press(25.0F, 25.0F)
    guard let clearRoot = clear.Window.Tree else { return false }
    if !clearRoot.Children[0].Focused || clearRoot.Children[0].Opacity != 0.5 {
      return false
    }
    clear.Press(150.0F, 150.0F)
    if clearRoot.Children[0].Focused || clearRoot.Children[0].Opacity != 1.0 {
      return false
    }

    let transfer = InputFixtureDriver(InputTwoFocusCell{}, 200, 200)
    transfer.Press(25.0F, 25.0F)
    transfer.Press(75.0F, 25.0F)
    guard let transferRoot = transfer.Window.Tree else { return false }
    if transferRoot.Children[0].Focused || !transferRoot.Children[1].Focused {
      return false
    }

    let traversal = InputFixtureDriver(InputTabCell{}, 300, 200)
    traversal.Key(Key.Tab, false, false)
    if focusedKey(traversal.Window.Tree) != "a" {
      return false
    }
    traversal.Char("z")
    traversal.Key(Key.Tab, false, false)
    if focusedKey(traversal.Window.Tree) != "b" {
      return false
    }
    traversal.Key(Key.Tab, false, false)
    traversal.Key(Key.Tab, false, false)
    if focusedKey(traversal.Window.Tree) != "a" {
      return false
    }
    traversal.Key(Key.Tab, true, false)
    guard let traversalRoot = traversal.Window.Tree else { return false }
    if focusedKey(traversal.Window.Tree) != "c" || traversalRoot.Children[0].Buffer != "z" {
      return false
    }

    let disabled = InputDisabledCell{}
    let disabledDriver = InputFixtureDriver(disabled, 400, 100)
    guard let disabledRoot = disabledDriver.Window.Tree else { return false }
    guard let button = findByKey(disabledRoot, "button") else { return false }
    guard let disabledEntry = findByKey(disabledRoot, "entry") else { return false }
    if !button.Disabled || button.Focusable || button.Opacity != 0.5
      || !disabledEntry.Disabled || disabledEntry.Focusable{
        return false
      }

    disabledDriver.Move(25.0F, 15.0F)
    disabledDriver.Press(25.0F, 15.0F)
    disabledDriver.Release(25.0F, 15.0F)
    if button.Hovered || button.Pressed || button.Focused || disabled.ButtonClicks != 0 {
      return false
    }

    disabledDriver.Press(125.0F, 15.0F)
    disabledDriver.Release(125.0F, 15.0F)
    disabledDriver.Char("x")
    if disabledEntry.Focused || disabledEntry.Buffer != "" {
      return false
    }

    disabledDriver.Press(225.0F, 15.0F)
    disabledDriver.Release(225.0F, 15.0F)
    if disabled.GroupClicks != 0 {
      return false
    }

    disabledDriver.Key(Key.Tab, false, false)
    if focusedKey(disabledDriver.Window.Tree) != "enabled" {
      return false
    }
    disabledDriver.Key(Key.Enter, false, false)
    if disabled.EnabledClicks != 1 {
      return false
    }
    disabledDriver.Input.QueueKeyRelease(Key.Enter)
    disabledDriver.Drain()

    let dynamicCell = InputDisableFocusedEntryCell{}
    let dynamic = InputFixtureDriver(dynamicCell, 200, 50)
    dynamic.Press(10.0F, 10.0F)
    guard let before = dynamic.Window.Tree else { return false }
    if !before.Focused || !before.Pressed {
      return false
    }
    dynamicCell.Disable()
    dynamic.Update()
    guard let after = dynamic.Window.Tree else { return false }
    let caret = after.Caret
    dynamic.Move(190.0F, 10.0F)
    dynamic.Release(190.0F, 10.0F)
    dynamic.Char("x")
    return after.Disabled && !after.Focused && !after.Pressed
      && after.Buffer == "hello" && after.Caret == caret
  }

  func AutoFocusSelectsFirstEligibleNodeOnlyWhenFocusIsEmpty() bool {
    let driver = InputFixtureDriver(InputAutoFocusCell{}, 200, 160)
    if focusedKey(driver.Window.Tree) != "first" {
      return false
    }
    driver.Key(Key.Tab, false, false)
    if focusedKey(driver.Window.Tree) != "second" {
      return false
    }
    driver.Update()
    if focusedKey(driver.Window.Tree) != "second" {
      return false
    }
    driver.FocusLost()
    driver.Update()
    if focusedKey(driver.Window.Tree) != "" { return false }
    driver.Input.FocusGained()
    driver.Update()
    return focusedKey(driver.Window.Tree) == "first"
  }

  func FocusReplacementDropsStaleFocus() bool {
    let cell = InputFocusReplacementCell{}
    let driver = InputFixtureDriver(cell, 200, 200)
    driver.Press(25.0F, 25.0F)
    guard let before = driver.Window.Tree else { return false }
    if !before.Children[0].Focused {
      return false
    }
    cell.Increment()
    driver.Update()
    guard let after = driver.Window.Tree else { return false }
    if after.Children[0].Focused {
      return false
    }
    driver.Press(150.0F, 150.0F)
    driver.Press(25.0F, 25.0F)
    if !after.Children[0].Focused {
      return false
    }
    return focusLossClearsInputState()
  }

  func EditHandlesGraphemeClustersAndWordBoundaries() bool {
    let edit = Edit()
    let surrogate = edit.Backspace(EditState{ Text: "A😀", Caret: 3, Anchor: 3 })
    if surrogate.Text != "A" || surrogate.Caret != 1 || surrogate.Anchor != 1 {
      return false
    }
    let combining = edit.Delete(EditState{ Text: "éx", Caret: 0, Anchor: 0 })
    if combining.Text != "x" || combining.Caret != 0 || combining.Anchor != 0 {
      return false
    }
    let familyText = "A👨‍👩‍👧‍👦B"
    let family = edit.Delete(EditState{ Text: familyText, Caret: 1, Anchor: 1 })
    if family.Text != "AB" || family.Caret != 1 || family.Anchor != 1 {
      return false
    }
    let words = EditState{ Text: "é👨‍👩‍👧‍👦x", Caret: 0, Anchor: 0 }
    if edit.WordRight(words, false).Caret != 2
      || edit.WordRight(EditState{ Text: words.Text, Caret: 2, Anchor: 2 }, false).Caret != 14
      || edit.WordLeft(EditState{ Text: words.Text, Caret: 14, Anchor: 14 }, false).Caret != 13
      || edit.WordLeft(EditState{ Text: words.Text, Caret: 13, Anchor: 13 }, false).Caret != 0 {
        return false
      }
    let killRight = edit.KillWordRight(EditState{ Text: words.Text, Caret: 2, Anchor: 2 })
    if killRight.Text != "é" || killRight.Caret != 2 || killRight.Anchor != 2 {
      return false
    }
    let killLeft = edit.KillWordLeft(EditState{ Text: words.Text, Caret: 14, Anchor: 14 })
    if killLeft.Text != "é👨‍👩‍👧‍👦" || killLeft.Caret != 13 || killLeft.Anchor != 13 {
      return false
    }
    let killLeftGap = edit.KillWordLeft(EditState{ Text: words.Text, Caret: 13, Anchor: 13 })
    if killLeftGap.Text != "x" || killLeftGap.Caret != 0 || killLeftGap.Anchor != 0 {
      return false
    }
    let selected = edit.SelectWordAt(EditState{ Text: "éx", Caret: 0, Anchor: 0 }, 1)
    return selected.Caret == 3 && selected.Anchor == 0 && edit.Selected(selected) == "éx"
  }

  func TextEntryCommandsAndSanitization() bool {
    let typed = InputEntryCell{}
    let typing = entryDriver(typed)
    typing.Char("h")
    typing.Char("i")
    if entry(typing).Buffer != "hi" || typed.changed != "hi" {
      return false
    }
    typing.Key(Key.Left, true, false)
    typing.Key(Key.Left, true, false)
    typing.Char("Z")
    if entry(typing).Buffer != "Z" {
      return false
    }

    let replace = InputEntryCell{}
    let replacing = entryDriver(replace)
    replacing.Char("a")
    replacing.Char("b")
    replacing.Char("c")
    replacing.Key(Key.A, false, true)
    replacing.Char("Z")
    if entry(replacing).Buffer != "Z" {
      return false
    }

    let words = InputEntryCell{}
    let wordDriver = entryDriver(words)
    for value in []string { "a", "b", " ", "c", "d" } {
      wordDriver.Char(value)
    }
    wordDriver.Key(Key.Backspace, false, true)
    if entry(wordDriver).Buffer != "ab " {
      return false
    }

    let edges = InputEntryCell{ value: "ab" }
    let edgeDriver = entryDriver(edges)
    edgeDriver.Key(Key.Home, false, false)
    edgeDriver.Key(Key.Backspace, false, false)
    edgeDriver.Key(Key.End, false, false)
    edgeDriver.Key(Key.Delete, false, false)
    if entry(edgeDriver).Buffer != "ab" {
      return false
    }
    edgeDriver.Key(Key.Home, false, false)
    edgeDriver.Key(Key.Right, false, false)
    edgeDriver.Key(Key.Delete, false, false)
    if entry(edgeDriver).Buffer != "a" {
      return false
    }

    let right = InputEntryCell{ value: "foo  bar-baz" }
    let rightDriver = entryDriver(right)
    rightDriver.Key(Key.Home, false, false)
    rightDriver.Key(Key.Right, false, true)
    if entry(rightDriver).Caret != 3 {
      return false
    }
    rightDriver.Key(Key.Delete, false, true)
    if entry(rightDriver).Buffer != "foo-baz" {
      return false
    }

    let sanitized = InputEntryCell{}
    let sanitizeDriver = entryDriver(sanitized)
    sanitizeDriver.Char("a\nb\tc")
    if entry(sanitizeDriver).Buffer != "abc" {
      return false
    }

    let submit = InputEntryCell{}
    let submitDriver = entryDriver(submit)
    submitDriver.Char("a")
    submitDriver.Char("b")
    submitDriver.Key(Key.Enter, false, false)
    if submit.submitted != "ab" {
      return false
    }
    submitDriver.Key(Key.Escape, false, false)
    let submittedEntry = entry(submitDriver)
    if submittedEntry.Buffer != "" || submit.changed != "" || submittedEntry.Focused {
      return false
    }

    let copy = entryDriver(InputEntryCell{})
    copy.Char("h")
    copy.Char("i")
    copy.Key(Key.A, false, true)
    copy.Key(Key.C, false, true)
    copy.Key(Key.Right, false, false)
    copy.Key(Key.V, false, true)
    if entry(copy).Buffer != "hihi" {
      return false
    }

    let cut = entryDriver(InputEntryCell{})
    cut.Char("a")
    cut.Char("b")
    cut.Key(Key.A, false, true)
    cut.Key(Key.X, false, true)
    if entry(cut).Buffer != "" {
      return false
    }
    cut.Key(Key.V, false, true)
    if entry(cut).Buffer != "ab" {
      return false
    }

    let paste = entryDriver(InputEntryCell{})
    paste.Input.SetClipboardFallback("a\nb\tc")
    paste.Key(Key.V, false, true)
    return entry(paste).Buffer == "abc"
  }

  func KeyboardQueueAndRepeatLifecycle() bool {
    let orderedCell = InputEntryCell{}
    let ordered = entryDriver(orderedCell)
    ordered.Input.QueueKeyPress(Key.A, KeyModifiers{})
    ordered.Input.QueueText("a")
    ordered.Input.QueueKeyPress(Key.Backspace, KeyModifiers{})
    ordered.Drain()
    if entry(ordered).Buffer != "" {
      return false
    }

    let callbackCell = InputEntryCell{ value: "aa" }
    let callback = entryDriver(callbackCell)
    callback.Key(Key.End, false, false)
    var calls = 0
    var secondCalls = 0
    let first Action[Key, KeyModifiers] = (key Key, modifiers KeyModifiers) -> { calls++ }
    let second Action[Key, KeyModifiers] = (key Key, modifiers KeyModifiers) -> { secondCalls++ }
    callback.Window.KeyPressed += first
    callback.Window.KeyPressed += second
    callback.Input.QueueKeyPress(Key.Backspace, KeyModifiers{})
    callback.Drain()
    callback.Step(0.4)
    if calls != 1 || secondCalls != 1 || entry(callback).Buffer.Length != 0 {
      return false
    }
    callback.Window.KeyPressed -= second
    callback.Input.QueueKeyPress(Key.A, KeyModifiers{})
    callback.Drain()
    if calls != 2 || secondCalls != 1 { return false }

    let releasedCell = InputEntryCell{ value: "aa" }
    let released = entryDriver(releasedCell)
    released.Key(Key.End, false, false)
    released.Input.QueueKeyPress(Key.Backspace, KeyModifiers{})
    released.Input.QueueKeyRelease(Key.Backspace)
    released.Drain()
    released.Step(1.0)
    if entry(released).Buffer.Length != 1 {
      return false
    }

    let repeatCell = InputEntryCell{ value: "aaaaaa" }
    let repeat = entryDriver(repeatCell)
    repeat.Key(Key.End, false, false)
    repeat.Input.QueueKeyPress(Key.Backspace, KeyModifiers{})
    repeat.Drain()
    repeat.Step(0.39)
    let beforeDelay = entry(repeat).Buffer.Length
    repeat.Step(0.01)
    let atDelay = entry(repeat).Buffer.Length
    repeat.Step(0.05)
    let oneTick = entry(repeat).Buffer.Length
    repeat.Input.QueueKeyRelease(Key.Backspace)
    repeat.Drain()
    repeat.Step(1.0)
    if beforeDelay != 5 || atDelay != 4 || oneTick != 3 || entry(repeat).Buffer.Length != 3 {
      return false
    }

    let stalledCell = InputEntryCell{ value: "aaaaaa" }
    let stalled = entryDriver(stalledCell)
    stalled.Key(Key.End, false, false)
    stalled.Input.QueueKeyPress(Key.Backspace, KeyModifiers{})
    stalled.Drain()
    stalled.Step(1.0)
    if entry(stalled).Buffer.Length != 4 {
      return false
    }

    let idleCell = InputEntryCell{ value: "ab" }
    let idle = InputFixtureDriver(idleCell, 300, 100)
    idle.Input.QueueKeyPress(Key.Backspace, KeyModifiers{})
    idle.Drain()
    idle.Press(10.0F, 10.0F)
    idle.Step(0.5)
    if entry(idle).Buffer != "ab" {
      return false
    }

    let buttons = InputButtonCell{}
    let buttonDriver = InputFixtureDriver(buttons, 300, 100)
    guard let initialRoot = buttonDriver.Window.Tree else { return false }
    guard let initialEnter = findByKey(initialRoot, "enter") else { return false }
    let buttonRect = initialEnter.Rect
    let labelRect = initialEnter.Children[0].Rect
    buttonDriver.Key(Key.Tab, false, false)
    buttonDriver.Update()
    if focusedKey(buttonDriver.Window.Tree) != "enter" {
      return false
    }
    guard let focusedRoot = buttonDriver.Window.Tree else { return false }
    guard let focusedEnter = findByKey(focusedRoot, "enter") else { return false }
    if !sameRect(buttonRect, focusedEnter.Rect) || !sameRect(labelRect, focusedEnter.Children[0].Rect) {
      return false
    }

    buttonDriver.Input.QueueKeyPress(Key.Enter, KeyModifiers{})
    buttonDriver.Drain()
    guard let enterRoot = buttonDriver.Window.Tree else { return false }
    guard let enter = findByKey(enterRoot, "enter") else { return false }
    if buttons.enterClicks != 1 || !enter.Pressed || enter.Opacity != 0.5 {
      return false
    }
    buttonDriver.Step(1.0)
    if buttons.enterClicks != 1 {
      return false
    }
    buttonDriver.Input.QueueKeyRelease(Key.Enter)
    buttonDriver.Drain()
    if enter.Pressed || enter.Opacity != 1.0 {
      return false
    }

    buttonDriver.Key(Key.Tab, false, false)
    if focusedKey(buttonDriver.Window.Tree) != "space" {
      return false
    }
    buttonDriver.Input.QueueKeyPress(Key.Space, KeyModifiers{})
    buttonDriver.Drain()
    guard let spaceRoot = buttonDriver.Window.Tree else { return false }
    guard let space = findByKey(spaceRoot, "space") else { return false }
    if buttons.spaceClicks != 0 || !space.Pressed || space.Opacity != 0.5 {
      return false
    }
    buttonDriver.Step(1.0)
    if buttons.spaceClicks != 0 {
      return false
    }
    buttonDriver.Input.QueueKeyRelease(Key.Space)
    buttonDriver.Drain()
    if buttons.spaceClicks != 1 || space.Pressed || space.Opacity != 1.0 {
      return false
    }

    buttonDriver.Key(Key.Tab, false, false)
    buttonDriver.Input.QueueKeyPress(Key.Enter, KeyModifiers{})
    buttonDriver.Input.QueueKeyRelease(Key.Enter)
    buttonDriver.Drain()
    if focusedKey(buttonDriver.Window.Tree) != "generic" || buttons.genericClicks != 0 {
      return false
    }

    let cancelledCell = InputButtonCell{}
    let cancelled = InputFixtureDriver(cancelledCell, 300, 100)
    cancelled.Key(Key.Tab, false, false)
    cancelled.Key(Key.Tab, false, false)
    cancelled.Input.QueueKeyPress(Key.Space, KeyModifiers{})
    cancelled.Input.QueueKeyPress(Key.Tab, KeyModifiers{})
    cancelled.Input.QueueKeyRelease(Key.Space)
    cancelled.Drain()
    guard let cancelledRoot = cancelled.Window.Tree else { return false }
    guard let cancelledSpace = findByKey(cancelledRoot, "space") else { return false }
    if cancelledCell.spaceClicks != 0 || cancelledSpace.Pressed
      || focusedKey(cancelled.Window.Tree) != "generic" {
        return false
      }

    let hiddenCell = InputButtonCell{}
    let hidden = InputFixtureDriver(hiddenCell, 300, 100)
    hidden.Key(Key.Tab, false, false)
    hidden.Key(Key.Tab, false, false)
    hidden.Input.QueueKeyPress(Key.Space, KeyModifiers{})
    hidden.Drain()
    guard let pressedRoot = hidden.Window.Tree else { return false }
    guard let pressedSpace = findByKey(pressedRoot, "space") else { return false }
    if !pressedSpace.Focused || !pressedSpace.Pressed { return false }
    hiddenCell.HideSpace = true
    hiddenCell.Rebuild()
    hidden.Update()
    hidden.Input.QueueKeyRelease(Key.Space)
    hidden.Drain()
    return pressedSpace.Visibility == Visibility.Hidden && !pressedSpace.Focused
      && !pressedSpace.Pressed && hiddenCell.spaceClicks == 0
  }

  func ControlledTextEntryKeepsFocus() bool {
    let cell = InputEntryCell{ writeBack: true }
    let driver = entryDriver(cell)
    driver.Char("a")
    driver.Char("b")
    driver.Update()
    return entry(driver).Buffer == "ab" && cell.value == "ab" && entry(driver).Focused
  }

  func TextEntryPointerSelectionLifecycle() bool {
    let click = entryDriver(InputEntryCell{ value: "hello" })
    click.Press(190.0F, 10.0F)
    click.Release(190.0F, 10.0F)
    if entry(click).Caret != 5 {
      return false
    }
    click.Press(1.0F, 10.0F)
    click.Release(1.0F, 10.0F)
    if entry(click).Caret != 0 {
      return false
    }

    let drag = entryDriver(InputEntryCell{ value: "hello" })
    drag.Press(1.0F, 10.0F)
    drag.Move(190.0F, 10.0F)
    drag.Release(190.0F, 10.0F)
    if entry(drag).Anchor != 0 || entry(drag).Caret != 5 {
      return false
    }

    let word = entryDriver(InputEntryCell{ value: "foo bar" })
    word.Press(2.0F, 10.0F)
    word.Release(2.0F, 10.0F)
    word.Press(2.0F, 10.0F)
    word.Release(2.0F, 10.0F)
    if entry(word).Anchor != 0 || entry(word).Caret != 3 {
      return false
    }

    let slow = entryDriver(InputEntryCell{ value: "foo bar" })
    slow.Press(2.0F, 10.0F)
    slow.Release(2.0F, 10.0F)
    slow.Step(0.5)
    slow.Press(2.0F, 10.0F)
    slow.Release(2.0F, 10.0F)
    if entry(slow).Anchor != entry(slow).Caret {
      return false
    }

    let replacingCell = InputEntryReplacementCell{}
    let replacing = InputFixtureDriver(replacingCell, 300, 100)
    replacing.Press(15.0F, 15.0F)
    guard let replacingTree = replacing.Window.Tree else { return false }
    let orphan = replacingTree.Children[0]
    let orphanCaret = orphan.Caret
    replacingCell.Increment()
    replacing.Update()
    replacing.Move(100.0F, 15.0F)
    if orphan.Caret != orphanCaret {
      return false
    }

    let two = InputFixtureDriver(InputTwoEntryCell{}, 300, 100)
    two.Press(10.0F, 28.5F)
    two.Release(10.0F, 28.5F)
    two.Press(10.0F, 31.5F)
    two.Release(10.0F, 31.5F)
    guard let twoTree = two.Window.Tree else { return false }
    if twoTree.Children[1].Caret != twoTree.Children[1].Anchor {
      return false
    }
    return queuedPointerSelectionKeepsSdl3Order()
  }

  func NestedWheelOwnershipAndBoundary() bool {
    let nested = InputFixtureDriver(InputNestedScrollCell{}, 200, 200)
    nested.Wheel(50.0F, 50.0F, 0.0F, -1.0F)
    guard let nestedRoot = nested.Window.Tree else { return false }
    guard let nestedInner = findByKey(nestedRoot, "inner") else { return false }
    if nestedInner.ScrollTargetY != 48.0F || nestedRoot.ScrollTargetY != 0.0F {
      return false
    }

    let sibling = InputFixtureDriver(InputNestedScrollCell{}, 200, 200)
    sibling.Wheel(50.0F, 150.0F, 0.0F, -1.0F)
    guard let siblingRoot = sibling.Window.Tree else { return false }
    guard let siblingInner = findByKey(siblingRoot, "inner") else { return false }
    if siblingInner.ScrollTargetY != 0.0F || siblingRoot.ScrollTargetY != 48.0F {
      return false
    }

    let boundary = InputFixtureDriver(InputNestedScrollCell{ InnerFits: true }, 200, 200)
    boundary.Wheel(50.0F, 50.0F, 0.0F, -1.0F)
    guard let boundaryRoot = boundary.Window.Tree else { return false }
    guard let boundaryInner = findByKey(boundaryRoot, "inner") else { return false }
    if boundaryInner.ScrollTargetY != 0.0F || boundaryRoot.ScrollTargetY != 48.0F {
      return false
    }

    let modifiers = KeyModifiers{ Ctrl: true }
    let regularEvents = List[string]()
    let regular = InputWheelCell{ Events: regularEvents }
    let regularDriver = InputFixtureDriver(regular, 200, 100)
    regularDriver.PointerDown(25.0F, 50.0F, PointerButton.Middle)
    regularDriver.Drain()
    regularDriver.Input.QueuePointerWheel(150.0F, 50.0F, 0.0F, -3.0F, modifiers)
    regularDriver.Drain()
    regularDriver.Input.QueuePointerMove(150.0F, 50.0F, KeyModifiers{})
    regularDriver.Drain()
    for i in 0 ... 120 { regularDriver.Step(1.0 / 60.0) }
    regularDriver.PointerDown(150.0F, 50.0F, PointerButton.Primary)
    regularDriver.PointerUp(150.0F, 50.0F, PointerButton.Primary)
    regularDriver.Drain()
    if !wheelEventsMatch(regularEvents, []string {
      "item:50:50:0:-3:1", "scroll:50:50:0:-3:1",
    }) || regular.CaptureMoves != 1 || regular.FirstClicks != 0 || regular.SecondClicks != 1 {
      return false
    }

    let preventedEvents = List[string]()
    let prevented = InputWheelCell{ Events: preventedEvents, PreventDefault: true }
    let preventedDriver = InputFixtureDriver(prevented, 200, 100)
    preventedDriver.PointerDown(25.0F, 50.0F, PointerButton.Middle)
    preventedDriver.Drain()
    preventedDriver.Input.QueuePointerWheel(150.0F, 50.0F, 0.0F, -3.0F, modifiers)
    preventedDriver.Drain()
    preventedDriver.Input.QueuePointerMove(150.0F, 50.0F, KeyModifiers{})
    preventedDriver.Drain()
    for i in 0 ... 120 { preventedDriver.Step(1.0 / 60.0) }
    preventedDriver.PointerDown(150.0F, 50.0F, PointerButton.Primary)
    preventedDriver.PointerUp(150.0F, 50.0F, PointerButton.Primary)
    preventedDriver.Drain()
    if !wheelEventsMatch(preventedEvents, []string {
      "item:50:50:0:-3:1", "scroll:50:50:0:-3:1",
    }) || prevented.CaptureMoves != 1 || prevented.FirstClicks != 1 || prevented.SecondClicks != 0 {
      return false
    }

    let stoppedEvents = List[string]()
    let stopped = InputWheelCell{ Events: stoppedEvents, StopPropagation: true }
    let stoppedDriver = InputFixtureDriver(stopped, 200, 100)
    stoppedDriver.PointerDown(25.0F, 50.0F, PointerButton.Middle)
    stoppedDriver.Drain()
    stoppedDriver.Input.QueuePointerWheel(150.0F, 50.0F, 0.0F, -3.0F, modifiers)
    stoppedDriver.Drain()
    stoppedDriver.Input.QueuePointerMove(150.0F, 50.0F, KeyModifiers{})
    stoppedDriver.Drain()
    for i in 0 ... 120 { stoppedDriver.Step(1.0 / 60.0) }
    stoppedDriver.PointerDown(150.0F, 50.0F, PointerButton.Primary)
    stoppedDriver.PointerUp(150.0F, 50.0F, PointerButton.Primary)
    stoppedDriver.Drain()
    return wheelEventsMatch(stoppedEvents, []string{ "item:50:50:0:-3:1" })
      && stopped.CaptureMoves == 1 && stopped.FirstClicks == 0 && stopped.SecondClicks == 1
  }

  func UnhandledWheelStaysPresentationIdle() bool {
    let window = Window{ Root: InputWheelQuietCell{}, Width: 100, Height: 100 }
    window.UpdateTree()
    let input = InputCoordinator()
    let resolver = Resolver{}
    input.QueuePointerWheel(50.0F, 50.0F, 0.0F, 1.0F)
    let changed = input.Drain(window.Tree, resolver, 0.0, nil)
    return !changed && !window.UpdateTree(0.0)
  }

  private func wheelEventsMatch(actual List[string], expected []string) bool {
    if actual.Count != expected.Length { return false }
    for i in 0 ... expected.Length {
      if actual[i] != expected[i] { return false }
    }
    return true
  }
  func ScrollStateSurvivesRebuild() bool {
    let cell = InputScrollStateCell{}
    let driver = InputFixtureDriver(cell, 100, 100)
    guard let root = driver.Window.Tree else { return false }
    guard let list = findByKey(root, "list") else { return false }
    list.ScrollY = 40.0F
    list.ScrollTargetY = 40.0F
    cell.Grow()
    driver.Update()
    guard let afterRoot = driver.Window.Tree else { return false }
    guard let after = findByKey(afterRoot, "list") else { return false }
    return after == list && after.ScrollY == 40.0F
  }

  func AxisOverflowInteractionContract() bool {
    let cell = InputAxisScrollCell{}
    let driver = InputFixtureDriver(cell, 100, 100)
    driver.Wheel(50.0F, 50.0F, -1.0F, -1.0F)
    guard let scroll = driver.Window.Tree else { return false }
    if scroll.ScrollTargetX != 48.0F || scroll.ScrollTargetY != 0.0F { return false }
    scroll.ScrollX = 48.0F
    cell.HideX()
    driver.Update()
    guard let reset = driver.Window.Tree else { return false }
    if reset.OverflowX != Overflow.Hidden || reset.ScrollX != 0.0F
      || reset.ScrollTargetX != 0.0F || reset.ScrollBarAlpha != 0.0F {
        return false
      }

    var sideClicks = 0
    var bottomClicks = 0
    let root = Node{
      Kind: NodeKind.Container,
      Rect: Rect{ X: 0.0F, Y: 0.0F, W: 100.0F, H: 100.0F },
      OverflowX: Overflow.Visible,
      OverflowY: Overflow.Hidden,
    }
    let side = Node{
      Kind: NodeKind.Button,
      Rect: Rect{ X: 120.0F, Y: 20.0F, W: 30.0F, H: 30.0F },
      OnClick: () -> { sideClicks++ },
    }
    let bottom = Node{
      Kind: NodeKind.Button,
      Rect: Rect{ X: 20.0F, Y: 120.0F, W: 30.0F, H: 30.0F },
      OnClick: () -> { bottomClicks++ },
    }
    root.Children.Add(side)
    root.Children.Add(bottom)
    let chain = List[Node]()
    hitChainInto(root, 125.0F, 25.0F, chain)
    if chain.Count != 2 || chain[0] != root || chain[1] != side
      || hitTopmost(root, 125.0F, 25.0F) != side
      || !hitDispatchClick(root, 125.0F, 25.0F)
      || hitDispatchClick(root, 25.0F, 125.0F)
      || sideClicks != 1 || bottomClicks != 0 {
        return false
      }

    root.OverflowX = Overflow.Hidden
    root.OverflowY = Overflow.Visible
    return hitTopmost(root, 125.0F, 25.0F) == nil
      && hitTopmost(root, 25.0F, 125.0F) == bottom
      && !hitDispatchClick(root, 125.0F, 25.0F)
      && hitDispatchClick(root, 25.0F, 125.0F)
      && sideClicks == 1 && bottomClicks == 1
  }

  func ZIndexHitOrder() []string {
    let positive = overlapHit(10, 0)
    let negative = overlapHit(0, -10)
    let equal = overlapHit(5, 5)

    let isolated = Reconciler{ Res: Resolver{} }.Mount(Container{
      Key: "root", Width: 40, Height: 40, Children: {
        Container{ Key: "low-parent", Position: PositionType.Absolute, Width: 40, Height: 40,
          Children: {
            Container{ Key: "descendant", Position: PositionType.Absolute, Width: 40, Height: 40,
              ZIndex: 100 },
          } },
        Container{ Key: "high-parent", Position: PositionType.Absolute, Width: 40, Height: 40,
          ZIndex: 1, HitTestSelf: true },
      },
    })
    Layout().Calculate(isolated, 40.0F, 40.0F)

    let clipped = Reconciler{ Res: Resolver{} }.Mount(Container{
      Key: "root", Width: 40, Height: 40, HitTestSelf: false, Children: {
        Container{ Key: "clip", Position: PositionType.Absolute, Width: 20, Height: 20,
          Overflow: Overflow.Hidden, ZIndex: 10, HitTestSelf: false, Children: {
            Container{ Key: "clipped-child", Position: PositionType.Absolute,
              Width: 40, Height: 40, ZIndex: 100, HitTestSelf: true },
          } },
      },
    })
    Layout().Calculate(clipped, 40.0F, 40.0F)

    let runtime = zIndexRuntimeHits()
    return []string{
      positive,
      negative,
      equal,
      hitKey(isolated, 20.0F, 20.0F),
      hitKey(clipped, 10.0F, 10.0F),
      hitKey(clipped, 30.0F, 10.0F),
      runtime[0],
      runtime[1],
    }
  }

  private func overlapHit(firstZ int32, secondZ int32) string {
    let root = Reconciler{ Res: Resolver{} }.Mount(Container{
      Key: "root", Width: 40, Height: 40, Children: {
        Container{ Key: "first", Position: PositionType.Absolute, Width: 40, Height: 40,
          ZIndex: firstZ, HitTestSelf: true },
        Container{ Key: "second", Position: PositionType.Absolute, Width: 40, Height: 40,
          ZIndex: secondZ, HitTestSelf: true },
      },
    })
    Layout().Calculate(root, 40.0F, 40.0F)
    return hitKey(root, 20.0F, 20.0F)
  }

  private func hitKey(root Node, x float32, y float32) string -> hitTopmost(root, x, y)?.Key ?? ""

  private func zIndexRuntimeHits() []string {
    let window = Window{ Root: ZIndexRuntimeRootCell{}, Width: 40, Height: 40 }
    window.UpdateTree()
    guard let root = window.Tree else { return []string{ "", "" } }
    let before = hitKey(root, 20.0F, 20.0F)
    guard let fiber = root.Children[0].Fiber else { return []string{ before, "" } }
    if fiber is ZIndexRuntimeChildCell {
      fiber.Raised = true
      fiber.Rebuild()
    }
    window.UpdateTree()
    guard let updated = window.Tree else { return []string{ before, "" } }
    return []string{ before, hitKey(updated, 20.0F, 20.0F) }
  }

  func MacShortcutPolicyRoutesCommandAndOptionWord() bool {
    let saved = InputPolicy.Mac
    InputPolicy.Mac = true
    try {
      let driver = entryDriver(InputEntryCell{ value: "foo bar" })
      driver.Key(Key.End, KeyModifiers{})
      driver.Key(Key.Left, KeyModifiers{ Alt: true })
      if entry(driver).Caret != 4 { return false }
      driver.Key(Key.Left, KeyModifiers{ Ctrl: true })
      if entry(driver).Caret != 3 { return false }
      driver.Key(Key.A, KeyModifiers{ Super: true })
      driver.Char("Z")
      if entry(driver).Buffer != "Z" { return false }
      driver.Key(Key.A, KeyModifiers{ Ctrl: true })
      driver.Char("y")
      if entry(driver).Buffer != "Zy" { return false }
      driver.Key(Key.Backspace, KeyModifiers{ Alt: true })
      return entry(driver).Buffer == ""
    } finally {
      InputPolicy.Mac = saved
    }
  }

  func MacWheelUnitScrollsTenPerUnit() bool {
    let saved = InputPolicy.Mac
    InputPolicy.Mac = true
    try {
      let driver = InputFixtureDriver(InputAxisScrollCell{}, 100, 100)
      driver.Wheel(50.0F, 50.0F, -1.0F, 0.0F)
      guard let scroll = driver.Window.Tree else { return false }
      if scroll.ScrollTargetX != 10.0F { return false }
      driver.Wheel(50.0F, 50.0F, -0.5F, 0.0F)
      if scroll.ScrollTargetX != 15.0F { return false }
      InputPolicy.Mac = false
      driver.Wheel(50.0F, 50.0F, -1.0F, 0.0F)
      return scroll.ScrollTargetX == 63.0F
    } finally {
      InputPolicy.Mac = saved
    }
  }

  private func entryDriver(cell InputEntryCell) InputFixtureDriver {
    let driver = InputFixtureDriver(cell, 300, 100)
    driver.Press(10.0F, 10.0F)
    driver.Release(10.0F, 10.0F)
    return driver
  }

  private func entry(driver InputFixtureDriver) Node -> driver.Window.Tree!!.Children[0]

  private func focusLossClearsInputState() bool {
    let cell = InputEntryCell{ value: "ab" }
    let driver = InputFixtureDriver(cell, 300, 100)
    driver.Input.QueuePointerPress(10.0F, 10.0F)
    driver.Input.QueueKeyPress(Key.Backspace, KeyModifiers{})
    driver.Drain()
    let current = entry(driver)
    if !current.Focused || !current.Pressed {
      return false
    }
    let buffer = current.Buffer
    let caret = current.Caret
    driver.FocusLost()
    driver.Input.QueuePointerMove(190.0F, 10.0F)
    driver.Drain()
    driver.Step(1.0)
    if current.Focused
      || current.Pressed
      || current.Buffer != buffer
      || current.Caret != caret {
        return false
      }
    let queued = InputFixtureDriver(InputEntryCell{ value: "queued" }, 300, 100)
    queued.Input.QueuePointerPress(77, PointerDevice.Touch, 10.0F, 10.0F,
      PointerButton.Primary, KeyModifiers{})
    queued.Input.FocusLost(queued.Window.Tree, queued.Resolver)
    queued.Drain()
    let untouched = entry(queued)
    if untouched.Focused || untouched.Pressed || queued.Input.FocusedNode() != nil {
      return false
    }
    queued.Input.QueuePointerRelease(77, PointerDevice.Touch, 10.0F, 10.0F,
      PointerButton.Primary, KeyModifiers{})
    queued.Drain()
    return !untouched.Focused && !untouched.Pressed
      && queued.Input.FocusedNode() == nil
  }

  private func queuedPointerSelectionKeepsSdl3Order() bool {
    let driver = InputFixtureDriver(InputEntryCell{ value: "hello" }, 300, 100)
    driver.Input.QueuePointerPress(1.0F, 10.0F)
    driver.Input.QueuePointerMove(190.0F, 10.0F)
    driver.Input.QueuePointerRelease(190.0F, 10.0F)
    driver.Drain()
    let current = entry(driver)
    return current.Anchor == 0 && current.Caret == 5
  }

  func PointerSelectsDeepestResolvedCursorAndClearsIt() bool {
    let driver = InputFixtureDriver(InputCursorCell{}, 300, 200)
    if driver.Input.CurrentCursor() != Cursor.Default { return false }
    driver.Move(25.0F, 25.0F)
    if driver.Input.CurrentCursor() != Cursor.Text { return false }
    driver.Move(150.0F, 100.0F)
    if driver.Input.CurrentCursor() != Cursor.Move { return false }
    driver.Move(250.0F, 100.0F)
    if driver.Input.CurrentCursor() != Cursor.Default { return false }
    driver.Move(25.0F, 25.0F)
    driver.FocusLost()
    return driver.Input.CurrentCursor() == Cursor.Default
  }

  private func focusedKey(root Node?) string {
    guard let tree = root else { return "" }
    for child in tree.Children {
      if child.Focused {
        return child.Key ?? ""
      }
    }
    return ""
  }

  func KeyboardCallbacksBubbleStopAndRepeat() bool {
    let events = List[string]()
    var stale KeyEvent
    let root = Reconciler{ Res: Resolver{} }.Mount(Container{
      Width: 100, Height: 30,
      OnFocus: (e FocusEvent) -> { events.Add("focus:root") },
      OnBlur: (e FocusEvent) -> { events.Add("blur:root") },
      OnKeyDown: (e KeyEvent) -> {
        events.Add("down:root:" + e.Key.ToString() + ":" + (e.Modifiers.Ctrl ? "1" : "0")
          +":" + (e.Repeat ? "1" : "0"))
      },
      OnKeyUp: (e KeyEvent) -> {
        events.Add("up:root:" + e.Key.ToString() + ":" + (e.Modifiers.Alt ? "1" : "0"))
      },
      Children: {
        Container{
          Width: 100, Height: 30, Focusable: true,
          OnFocus: (e FocusEvent) -> { events.Add("focus:leaf") },
          OnBlur: (e FocusEvent) -> { events.Add("blur:leaf") },
          OnKeyDown: (e KeyEvent) -> {
            events.Add("down:leaf:" + e.Key.ToString() + ":" + (e.Modifiers.Ctrl ? "1" : "0")
              +":" + (e.Repeat ? "1" : "0"))
            if e.Key == Key.A { stale = e }
            if e.Key == Key.B { e.StopPropagation() }
          },
          OnKeyUp: (e KeyEvent) -> {
            events.Add("up:leaf:" + e.Key.ToString() + ":" + (e.Modifiers.Alt ? "1" : "0"))
          },
        },
      },
    })
    let resolver = Resolver{}
    let text = TextInput()
    let keyboard = KeyboardInput()
    text.SetFocus(resolver, root.Children[0])
    keyboard.QueueKeyPress(Key.A, KeyModifiers{ Ctrl: true })
    keyboard.QueueKeyPress(Key.B, KeyModifiers{})
    keyboard.QueueKeyPress(Key.Left, KeyModifiers{})
    keyboard.QueueKeyRelease(Key.Left, KeyModifiers{ Alt: true })
    keyboard.Drain(root, resolver, text, nil)
    keyboard.QueueKeyPress(Key.Left, KeyModifiers{})
    keyboard.Drain(root, resolver, text, nil)
    keyboard.Step(root, resolver, text, 0.5)
    keyboard.QueueKeyRelease(Key.Left, KeyModifiers{})
    keyboard.Drain(root, resolver, text, nil)
    stale.StopPropagation()
    stale.PreventDefault()
    keyboard.QueueKeyPress(Key.C, KeyModifiers{})
    keyboard.Drain(root, resolver, text, nil)
    text.SetFocus(resolver, nil)
    let expected = []string{
      "focus:leaf", "focus:root",
      "down:leaf:A:1:0", "down:root:A:1:0",
      "down:leaf:B:0:0",
      "down:leaf:Left:0:0", "down:root:Left:0:0",
      "up:leaf:Left:1", "up:root:Left:1",
      "down:leaf:Left:0:0", "down:root:Left:0:0",
      "down:leaf:Left:0:1", "down:root:Left:0:1",
      "up:leaf:Left:0", "up:root:Left:0",
      "down:leaf:C:0:0", "down:root:C:0:0",
      "blur:leaf", "blur:root",
    }
    if events.Count != expected.Length { return false }
    for i in 0 ... expected.Length {
      if events[i] != expected[i] { return false }
    }
    return true
  }

  func KeyboardDefaultPreventionPreservesTextAndButtonRelease() bool {
    var buttonClicks = 0
    let root = Reconciler{ Res: Resolver{} }.Mount(Container{
      Width: 100, Height: 60,
      Children: {
        TextEntry{
          Key: "entry", Value: "x", Width: 100, Height: 30,
          OnKeyDown: (e KeyEvent) -> {
            if e.Key == Key.Backspace || e.Key == Key.Tab { e.PreventDefault() }
          },
        },
        TextEntry{ Key: "second", Value: "y", Width: 100, Height: 30 },
        Button{
          Key: "button", Width: 100, Height: 30,
          OnKeyUp: (e KeyEvent) -> {
            if e.Key == Key.Space { e.PreventDefault() }
          },
          OnKeyDown: (e KeyEvent) -> {
            if e.Key == Key.Enter { e.PreventDefault() }
          },
          OnClick: () -> { buttonClicks++ },
        },
      },
    })
    let resolver = Resolver{}
    let text = TextInput()
    let keyboard = KeyboardInput()
    let entry = root.Children[0]
    let button = root.Children[2]
    text.SetFocus(resolver, entry)
    keyboard.QueueKeyPress(Key.Backspace, KeyModifiers{})
    keyboard.Drain(root, resolver, text, nil)
    if entry.Buffer != "x" { return false }
    keyboard.QueueKeyPress(Key.Tab, KeyModifiers{})
    keyboard.Drain(root, resolver, text, nil)
    if !entry.Focused { return false }
    text.SetFocus(resolver, button)
    keyboard.QueueKeyPress(Key.Enter, KeyModifiers{})
    keyboard.QueueKeyPress(Key.Space, KeyModifiers{})
    keyboard.QueueKeyRelease(Key.Space, KeyModifiers{})
    keyboard.Drain(root, resolver, text, nil)
    return buttonClicks == 0 && !button.Pressed
  }

  func KeyboardCallbackFailuresCleanUpAndKeepQueuedSuffix() bool {
    var releaseThrows = true
    var buttonClicks = 0
    var queuedSuffix = 0
    let button = Reconciler{ Res: Resolver{} }.Mount(Button{
      Width: 100, Height: 30,
      OnKeyUp: (e KeyEvent) -> {
        if releaseThrows {
          releaseThrows = false
          throw InvalidOperationException("key up")
        }
      },
      OnKeyDown: (e KeyEvent) -> {
        if e.Key == Key.A { queuedSuffix++ }
      },
      OnClick: () -> { buttonClicks++ },
    })
    let resolver = Resolver{}
    let text = TextInput()
    let keyboard = KeyboardInput()
    text.SetFocus(resolver, button)
    keyboard.QueueKeyPress(Key.Space, KeyModifiers{})
    keyboard.QueueKeyRelease(Key.Space, KeyModifiers{})
    keyboard.QueueKeyPress(Key.A, KeyModifiers{})
    var threw = false
    try {
      keyboard.Drain(button, resolver, text, nil)
    } catch (e Exception) {
      threw = true
    }
    if !threw || button.Pressed || buttonClicks != 0 { return false }
    keyboard.Drain(button, resolver, text, nil)
    if queuedSuffix != 1 { return false }

    var repeatThrows = true
    let repeatRoot = Reconciler{ Res: Resolver{} }.Mount(Container{
      Width: 100, Height: 30, Focusable: true,
      OnKeyDown: (e KeyEvent) -> {
        if e.Repeat && repeatThrows {
          repeatThrows = false
          throw InvalidOperationException("repeat")
        }
      },
    })
    let repeatText = TextInput()
    let repeatKeyboard = KeyboardInput()
    repeatText.SetFocus(resolver, repeatRoot)
    repeatKeyboard.QueueKeyPress(Key.Left, KeyModifiers{})
    repeatKeyboard.Drain(repeatRoot, resolver, repeatText, nil)
    threw = false
    try {
      repeatKeyboard.Step(repeatRoot, resolver, repeatText, 0.5)
    } catch (e Exception) {
      threw = true
    }
    return threw && repeatKeyboard.RepeatDeadlineSeconds() >= 0.99
  }

  func CallbackReplacementUsesNewestDelegateWithoutInputEffect() bool {
    var directCalls int32
    let direct = Reconciler{ Res: Resolver{} }.Mount(Container{
      Width: 10, Height: 10,
      OnWheel: (e WheelEvent) -> { directCalls = directCalls + 1 },
    })
    let directDiff = Reconciler{ Res: Resolver{} }
    directDiff.Diff(direct, Container{
      Width: 10, Height: 10,
      OnWheel: (e WheelEvent) -> { directCalls = directCalls + 10 },
    })
    if (int32(directDiff.Effects) & int32(ReconcileEffects.Input)) != 0 { return false }
    guard let wheel = direct.OnWheel else { return false }
    wheel(WheelEvent{})
    if directCalls != 10 { return false }

    let directPresence = Reconciler{ Res: Resolver{} }.Mount(Container{ Width: 10, Height: 10 })
    let directAdded = Reconciler{ Res: Resolver{} }
    directAdded.Diff(directPresence, Container{ Width: 10, Height: 10, OnPointerDown: (e PointerEvent) -> {} })
    if (int32(directAdded.Effects) & int32(ReconcileEffects.Input)) == 0 { return false }
    let directRemoved = Reconciler{ Res: Resolver{} }
    directRemoved.Diff(directPresence, Container{ Width: 10, Height: 10 })
    if (int32(directRemoved.Effects) & int32(ReconcileEffects.Input)) == 0 { return false }

    var keyCalls int32
    let sparse = Reconciler{ Res: Resolver{} }.Mount(Container{
      Width: 10, Height: 10, Focusable: true,
      OnKeyDown: (e KeyEvent) -> { keyCalls = keyCalls + 1 },
      OnFocus: (e FocusEvent) -> { keyCalls = keyCalls + 1 },
    })
    let sparseDiff = Reconciler{ Res: Resolver{} }
    sparseDiff.Diff(sparse, Container{
      Width: 10, Height: 10, Focusable: true,
      OnKeyDown: (e KeyEvent) -> { keyCalls = keyCalls + 10 },
      OnFocus: (e FocusEvent) -> { keyCalls = keyCalls + 100 },
    })
    if (int32(sparseDiff.Effects) & int32(ReconcileEffects.Input)) != 0 { return false }
    guard let key = InputCallbacks.KeyDown(sparse) else { return false }
    guard let focus = InputCallbacks.Focus(sparse) else { return false }
    key(KeyEvent{ Key: Key.A })
    focus(FocusEvent{})
    if keyCalls != 110 { return false }

    let sparsePresence = Reconciler{ Res: Resolver{} }
    sparsePresence.Diff(sparse, Container{
      Width: 10, Height: 10, Focusable: true,
      OnKeyUp: (e KeyEvent) -> {},
    })
    if (int32(sparsePresence.Effects) & int32(ReconcileEffects.Input)) == 0 { return false }

    var hoverCalls int32
    let hover = Reconciler{ Res: Resolver{} }.Mount(Container{
      Width: 10, Height: 10,
      OnPointerEnter: (e PointerEvent) -> { hoverCalls = hoverCalls + 1 },
      OnPointerLeave: (e PointerEvent) -> { hoverCalls = hoverCalls + 10 },
    })
    let hoverReplacement = Reconciler{ Res: Resolver{} }
    hoverReplacement.Diff(hover, Container{
      Width: 10, Height: 10,
      OnPointerEnter: (e PointerEvent) -> { hoverCalls = hoverCalls + 100 },
      OnPointerLeave: (e PointerEvent) -> { hoverCalls = hoverCalls + 1_000 },
    })
    if (int32(hoverReplacement.Effects) & int32(ReconcileEffects.Input)) != 0 { return false }
    guard let enter = InputCallbacks.PointerEnter(hover) else { return false }
    guard let leave = InputCallbacks.PointerLeave(hover) else { return false }
    enter(PointerEvent{})
    leave(PointerEvent{})
    if hoverCalls != 1_100 { return false }
    let hoverPresence = Reconciler{ Res: Resolver{} }
    hoverPresence.Diff(hover, Container{ Width: 10, Height: 10 })
    if (int32(hoverPresence.Effects) & int32(ReconcileEffects.Input)) == 0 { return false }

    var entryCalls int32
    let entry = Reconciler{ Res: Resolver{} }.Mount(TextEntry{
      Value: "value", OnChange: (value string) -> { entryCalls = entryCalls + 1 },
    })
    let entryDiff = Reconciler{ Res: Resolver{} }
    entryDiff.Diff(entry, TextEntry{
      Value: "value", OnChange: (value string) -> { entryCalls = entryCalls + 10 },
    })
    if (int32(entryDiff.Effects) & int32(ReconcileEffects.Input)) != 0 { return false }
    guard let change = entry.OnChange else { return false }
    change("next")
    if entryCalls != 10 { return false }

    var textCalls int32
    let text = Reconciler{ Res: Resolver{} }.Mount(Container{
      Width: 10, Height: 10, Focusable: true,
      OnTextInput: (value string) -> { textCalls++ },
    })
    let textDiff = Reconciler{ Res: Resolver{} }
    textDiff.Diff(text, Container{
      Width: 10, Height: 10, Focusable: true,
      OnTextInput: (value string) -> { textCalls = textCalls + 10 },
    })
    if (int32(textDiff.Effects) & int32(ReconcileEffects.Input)) != 0 { return false }
    guard let onText = TextInputCallbacks.TextInput(text) else { return false }
    onText("value")
    if textCalls != 10 { return false }

    let textPresence = Reconciler{ Res: Resolver{} }
    textPresence.Diff(text, Container{ Width: 10, Height: 10, Focusable: true })
    if (int32(textPresence.Effects) & int32(ReconcileEffects.Input)) == 0 { return false }

    var pairedCalls int32
    let paired = Reconciler{ Res: Resolver{} }.Mount(Container{
      Width: 10, Height: 10, Focusable: true,
    })
    let pairedPresence = Reconciler{ Res: Resolver{} }
    pairedPresence.Diff(paired, Container{
      Width: 10, Height: 10, Focusable: true,
      OnKeyDown: (e KeyEvent) -> { pairedCalls++ },
      OnTextInput: (value string) -> { pairedCalls = pairedCalls + 10 },
    })
    if (int32(pairedPresence.Effects) & int32(ReconcileEffects.Input)) == 0 { return false }
    let pairedReplacement = Reconciler{ Res: Resolver{} }
    pairedReplacement.Diff(paired, Container{
      Width: 10, Height: 10, Focusable: true,
      OnKeyDown: (e KeyEvent) -> { pairedCalls = pairedCalls + 100 },
      OnTextInput: (value string) -> { pairedCalls = pairedCalls + 1_000 },
    })
    if (int32(pairedReplacement.Effects) & int32(ReconcileEffects.Input)) != 0 { return false }
    guard let pairedKey = InputCallbacks.KeyDown(paired) else { return false }
    guard let pairedText = TextInputCallbacks.TextInput(paired) else { return false }
    pairedKey(KeyEvent{ Key: Key.A })
    pairedText("value")
    return pairedCalls == 1_100
  }

  func PointerLifecycleEmptyBlobBytes() int64 {
    let warm = Container{}
    InputCallbacks.HasBlobCallbacks(warm)
    let before = GC.GetAllocatedBytesForCurrentThread()
    let value = Container{}
    let bytes = GC.GetAllocatedBytesForCurrentThread() - before
    return !value.HasSparseInputState && !InputCallbacks.HasBlobCallbacks(value) ? bytes : -1
  }

  func PointerLifecycleEmptyNodeBytes() int64 {
    let warm = Node{}
    InputCallbacks.HasNodeCallbacks(warm)
    let before = GC.GetAllocatedBytesForCurrentThread()
    let value = Node{}
    let bytes = GC.GetAllocatedBytesForCurrentThread() - before
    return !value.HasSparseInputState && !InputCallbacks.HasNodeCallbacks(value) ? bytes : -1
  }

  func PointerLifecycleEmptyWindowBytes() int64 {
    let warm = Window{}
    warm.drainPostedActions()
    let before = GC.GetAllocatedBytesForCurrentThread()
    let value = Window{}
    let bytes = GC.GetAllocatedBytesForCurrentThread() - before
    return value.Width == 0 && value.Height == 0 ? bytes : -1
  }

  func PointerLifecycleStablePlainDiffBytes() int64 {
    let rec = Reconciler{ Res: Resolver{} }
    let blob = Container{ Width: 100, Height: 30, Children: { Text{ Content: "plain" } } }
    let root = rec.Mount(blob)
    rec.Diff(root, blob)
    let before = GC.GetAllocatedBytesForCurrentThread()
    rec.Diff(root, blob)
    let bytes = GC.GetAllocatedBytesForCurrentThread() - before
    TextLayouts.DisposeTree(root)
    return bytes
  }

  func RoutedKeyCallbackRebuildStaysPresentationIdle() bool {
    let cell = InputRoutedCallbackCell{}
    let window = Window{ Root: cell, Width: 100, Height: 30 }
    window.UpdateTree()
    guard let root = window.Tree else { return false }
    let input = InputCoordinator()
    let resolver = Resolver{}
    if !input.FocusElement(resolver, root) { return false }
    input.QueueKeyPress(Key.Left, KeyModifiers{})
    let pressed = input.Drain(window.Tree, resolver, 0.0, nil)
    let repeated = input.Step(window.Tree, resolver, 0.5)
    return !pressed && !repeated && cell.Calls == 2 && !window.UpdateTree(0.5)
  }

  func GenericTextCallbackRebuildStaysPresentationIdle() bool {
    let cell = InputGenericTextCallbackCell{}
    let window = Window{ Root: cell, Width: 100, Height: 30 }
    window.UpdateTree()
    guard let root = window.Tree else { return false }
    let input = InputCoordinator()
    let resolver = Resolver{}
    if !input.FocusElement(resolver, root) { return false }
    input.QueueText("x")
    let changed = input.Drain(window.Tree, resolver, 0.0, nil)
    return !changed && cell.Calls == 1 && !window.UpdateTree(0.0)
  }

  func FocusCallbacksCoverUnavailableRemovalAndReentry() bool {
    let events = List[string]()
    let cell = InputKeyboardFocusLifecycleCell{ Events: events }
    let driver = InputFixtureDriver(cell, 100, 30)
    driver.Press(10.0F, 10.0F)
    cell.Disable()
    driver.Update()
    driver.Key(Key.A, KeyModifiers{})
    cell.Enable()
    driver.Update()
    driver.Press(10.0F, 10.0F)
    cell.Hide()
    driver.Update()
    cell.Enable()
    driver.Update()
    driver.Press(10.0F, 10.0F)
    cell.Remove()
    driver.Update()
    let expected = []string{
      "focus:leaf", "focus:root", "blur:leaf", "blur:root",
      "focus:leaf", "focus:root", "blur:leaf", "blur:root",
      "focus:leaf", "focus:root", "blur:leaf", "blur:root",
    }
    if events.Count != expected.Length { return false }
    for i in 0 ... expected.Length {
      if events[i] != expected[i] { return false }
    }

    let resolver = Resolver{}
    let staleEvents = List[string]()
    var stale FocusEvent
    let staleRoot = Reconciler{ Res: Resolver{} }.Mount(Container{
      OnFocus: (e FocusEvent) -> { staleEvents.Add("root") },
      Children: {
        Container{ Key: "a", Focusable: true, OnFocus: (e FocusEvent) -> { stale = e } },
        Container{ Key: "b", Focusable: true, OnFocus: (e FocusEvent) -> { staleEvents.Add("b") } },
      },
    })
    let staleText = TextInput()
    staleText.SetFocus(resolver, staleRoot.Children[0])
    stale.StopPropagation()
    staleText.SetFocus(resolver, staleRoot.Children[1])
    if staleEvents.Count != 3 || staleEvents[1] != "b" || staleEvents[2] != "root" {
      return false
    }

    let text = TextInput()
    var second Node?
    let reentrant = Reconciler{ Res: Resolver{} }.Mount(Container{ Children: {
      Container{ Key: "a", Focusable: true, OnBlur: (e FocusEvent) -> {
        if let target = second { text.SetFocus(resolver, target) }
      } },
      Container{ Key: "b", Focusable: true },
      Container{ Key: "c", Focusable: true },
    } })
    let first = reentrant.Children[0]
    second = reentrant.Children[1]
    let third = reentrant.Children[2]
    text.SetFocus(resolver, first)
    text.SetFocus(resolver, third)
    if first.Focused || !second!!.Focused || third.Focused { return false }

    let failing = Reconciler{ Res: Resolver{} }.Mount(Container{ Children: {
      Container{ Key: "a", Focusable: true, OnBlur: (e FocusEvent) -> {
        throw InvalidOperationException("blur")
      } },
      Container{ Key: "b", Focusable: true },
    } })
    let failingText = TextInput()
    failingText.SetFocus(resolver, failing.Children[0])
    var threw = false
    try {
      failingText.SetFocus(resolver, failing.Children[1])
    } catch (e Exception) {
      threw = true
    }
    return threw && !failing.Children[0].Focused && failing.Children[1].Focused
  }

  private func sameRect(a Rect, b Rect) bool -> a.X == b.X && a.Y == b.Y && a.W == b.W && a.H == b.H

  private func findByKey(n Node, key string) Node? {
    if n.Key == key {
      return n
    }
    for child in n.Children {
      if let found = findByKey(child, key) {
        return found
      }
    }
    return nil
  }

}

internal class ZIndexRuntimeRootCell : Cell {
  override func Build() Blob -> Container { Width: 40, Height: 40, Children: {
    Cell.Mount[ZIndexRuntimeChildCell]("dynamic"),
    Container{ Key: "sibling", Position: PositionType.Absolute,
      Width: 40, Height: 40, ZIndex: 1, HitTestSelf: true },
  } }
}

internal class ZIndexRuntimeChildCell : Cell {
  internal var Raised bool

  init() {
    Raised = false
  }

  override func Build() Blob {
    if Raised {
      return Button{ Position: PositionType.Absolute, Width: 40, Height: 40, ZIndex: 2 }
    }
    return Container{ Position: PositionType.Absolute, Width: 40, Height: 40, HitTestSelf: true }
  }
}

internal class InputFixtureDriver {
  internal var Window Window
  internal var Input InputCoordinator
  internal var Resolver Resolver
  internal var Time float64

  init(root Cell, width int32, height int32) {
    Window = Window{ Width: width, Height: height, Root: root }
    Input = InputCoordinator()
    Resolver = Resolver{}
    Window.UpdateTree()
    Input.AfterTreeUpdated(Window.Tree, Resolver, true)
  }

  internal func Update() {
    Window.UpdateTree()
    Input.AfterTreeUpdated(Window.Tree, Resolver, true)
  }

  internal func Drain() {
    Input.Drain(Window.Tree, Resolver, Time, Window.KeyPressedCallbacksForTest)
    Update()
  }

  internal func Move(x float32, y float32) {
    Input.HandleMove(Window.Tree, Resolver, x, y)
  }

  internal func Press(x float32, y float32) {
    Input.HandlePress(Window.Tree, Resolver, Time, x, y)
  }

  internal func Release(x float32, y float32) {
    Input.HandleRelease(Window.Tree, Resolver, x, y)
  }

  internal func PointerDown(x float32, y float32, button PointerButton) {
    Input.QueuePointerPress(x, y, button, KeyModifiers{})
  }

  internal func PointerUp(x float32, y float32, button PointerButton) {
    Input.QueuePointerRelease(x, y, button, KeyModifiers{})
  }

  internal func FocusLost() {
    Input.FocusLost(Resolver)
  }

  internal func Wheel(x float32, y float32, dx float32, dy float32) {
    Input.HandleWheel(Window.Tree, x, y, dx, dy)
  }

  internal func Key(key Key, shift bool, ctrl bool) {
    Input.HandleKey(Window.Tree, Resolver, key, shift, ctrl)
  }

  internal func Key(key Key, modifiers KeyModifiers) {
    Input.HandleKey(Window.Tree, Resolver, key, modifiers)
  }

  internal func Char(value string) {
    Input.HandleChar(Window.Tree, value)
  }

  internal func Step(dt float64) {
    Time = Time + dt
    Input.Step(Window.Tree, Resolver, dt)
    Window.UpdateTree(dt)
    Input.RefreshHover(Window.Tree, Resolver)
    Input.AfterTreeUpdated(Window.Tree, Resolver, true)
  }
}

internal class InputStaticCell : Cell {
  override func Build() Blob -> Container {
    Width: 200.0,
    Height: 200.0,
    Hover: Style{ Opacity: 0.5 },
    Children: {
      Container{ Width: 50.0, Height: 50.0, Hover: Style{ Opacity: 0.25 } },
    },
  }
}

internal class InputCursorCell : Cell {
  override func Build() Blob -> Container {
    Width: 200.0,
    Height: 200.0,
    Cursor: Cursor.Move,
    Children: {
      Container{
        Width: 50.0,
        Height: 50.0,
        Cursor: Cursor.Pointer,
        Hover: Style{ Cursor: Cursor.Text },
      },
    },
  }
}

internal class InputTwoCardsCell : Cell {
  override func Build() Blob -> Container {
    Width: 200.0,
    Height: 200.0,
    FlexDirection: FlexDirection.Row,
    Children: {
      Container{ Width: 50.0, Height: 50.0, Hover: Style{ Opacity: 0.5 } },
      Container{ Width: 50.0, Height: 50.0, Hover: Style{ Opacity: 0.5 } },
    },
  }
}

internal class InputFocusCell : Cell {
  override func Build() Blob -> Container {
    Width: 200.0,
    Height: 200.0,
    Children: {
      Container{
        Width: 50.0,
        Height: 50.0,
        Focusable: true,
        Focus: Style{ Opacity: 0.5 },
      },
    },
  }
}

internal class InputTwoFocusCell : Cell {
  override func Build() Blob -> Container {
    Width: 200.0,
    Height: 200.0,
    FlexDirection: FlexDirection.Row,
    Children: {
      Container{ Width: 50.0, Height: 50.0, Focusable: true },
      Container{ Width: 50.0, Height: 50.0, Focusable: true },
    },
  }
}

internal class InputAutoFocusCell : Cell {
  override func Build() Blob -> Container {
    Width: 200.0,
    Height: 160.0,
    Children: {
      Container{
        Key: "hidden-root",
        Visibility: Visibility.Hidden,
        Children: { TextEntry{ Key: "hidden", AutoFocus: true, Height: 30.0 } },
      },
      Container{
        Key: "disabled-root",
        Disabled: true,
        Children: { TextEntry{ Key: "disabled", AutoFocus: true, Height: 30.0 } },
      },
      TextEntry{ Key: "first", AutoFocus: true, Height: 30.0 },
      TextEntry{ Key: "second", Height: 30.0 },
    },
  }
}

internal class InputHoverReplacementCell : Cell {
  private var count int32

  internal func Increment() {
    count++
    Rebuild()
  }

  override func Build() Blob -> Container {
    Width: 200.0,
    Height: 200.0,
    Children: {
      Container{
        Key: "hover-$count",
        Width: 50.0,
        Height: 50.0,
        Hover: Style{ Opacity: 0.5 },
      },
    },
  }
}

internal class InputHoverHidesCell : Cell {
  internal var Clicks int32

  override func Build() Blob -> Container {
    Width: 200.0,
    Height: 200.0,
    Children: {
      Container{
        Width: 50.0,
        Height: 50.0,
        Hover: Style{ Display: Display.None },
        OnClick: func() { Clicks++ },
      },
    },
  }
}

internal class InputFocusReplacementCell : Cell {
  private var count int32

  internal func Increment() {
    count++
    Rebuild()
  }

  override func Build() Blob -> Container {
    Width: 200.0,
    Height: 200.0,
    Children: {
      Container{
        Key: "focus-$count",
        Width: 50.0,
        Height: 50.0,
        Focusable: true,
      },
    },
  }
}

internal class InputEntryReplacementCell : Cell {
  private var count int32

  internal func Increment() {
    count++
    Rebuild()
  }

  override func Build() Blob -> Container {
    Width: 300.0,
    Height: 100.0,
    Children: {
      TextEntry{
        Key: "entry-$count",
        Value: "abcdef",
        Width: 200.0,
        Height: 30.0,
        FontSize: 16.0,
      },
    },
  }
}

internal class InputEntryCell : Cell {
  internal var value string
  internal var writeBack bool
  internal var changed string
  internal var submitted string

  init() {
    value = ""
    changed = ""
    submitted = ""
  }

  override func Build() Blob -> Container {
    Width: 300.0,
    Height: 100.0,
    Children: {
      TextEntry{
        Key: "entry",
        Value: value,
        Placeholder: "hint",
        Width: 200.0,
        Height: 30.0,
        FontSize: 16.0,
        LineHeight: 1.5,
        Color: Color.White,
        OnChange: (next string) -> {
          changed = next
          if writeBack {
            value = next
          }
        },
        OnSubmit: (next string) -> { submitted = next },
      },
    },
  }
}

internal class InputTabCell : Cell {
  override func Build() Blob -> Container {
    Width: 300.0,
    Height: 200.0,
    Children: {
      TextEntry{ Key: "a", Width: 100.0, Height: 30.0 },
      Container{ Key: "b", Width: 100.0, Height: 30.0, Focusable: true },
      TextEntry{ Key: "c", Width: 100.0, Height: 30.0 },
    },
  }
}

internal class InputButtonCell : Cell {
  internal var enterClicks int32
  internal var spaceClicks int32
  internal var genericClicks int32
  internal var HideSpace bool

  init() { HideSpace = false }

  override func Build() Blob -> Container {
    Width: 300.0,
    Height: 100.0,
    FlexDirection: FlexDirection.Row,
    Children: {
      Button{
        Key: "enter",
        Width: 100.0,
        Height: 30.0,
        Active: Style{ Opacity: 0.5 },
        OnClick: func() { enterClicks++ },
        Children: { Text{ Content: "Enter" } },
      },
      Button{
        Key: "space",
        Width: 100.0,
        Height: 30.0,
        Visibility: HideSpace ? Visibility.Hidden : Visibility.Visible,
        Active: Style{ Opacity: 0.5 },
        OnClick: func() { spaceClicks++ },
        Children: { Text{ Content: "Space" } },
      },
      Container{
        Key: "generic",
        Width: 100.0,
        Height: 30.0,
        Focusable: true,
        OnClick: func() { genericClicks++ },
      },
    },
  }
}

internal class InputPointerLifecycleCell : Cell {
  internal prop Events List[string]{ get; init; }
  internal var Clicks int32
  internal var Stale PointerEvent?

  override func Build() Blob -> Container {
    Width: 100.0,
    Height: 100.0,
    OnClick: () -> { Clicks++ },
    OnPointerDown: (e PointerEvent) -> {
      pointerRecord("down", "root", e)
      if e.Button == PointerButton.Primary { e.PreventDefault() }
    },
    OnPointerMove: (e PointerEvent) -> { pointerRecord("move", "root", e) },
    OnPointerUp: (e PointerEvent) -> {
      pointerRecord("up", "root", e)
      if e.Button == PointerButton.Primary { e.PreventDefault() }
    },
    Children: {
      Container{
        Position: PositionType.Absolute,
        Left: 10,
        Top: 10,
        Width: 80,
        Height: 80,
        OnPointerDown: (e PointerEvent) -> { pointerRecord("down", "mid", e) },
        OnPointerMove: (e PointerEvent) -> { pointerRecord("move", "mid", e) },
        OnPointerUp: (e PointerEvent) -> { pointerRecord("up", "mid", e) },
        Children: {
          Container{
            Position: PositionType.Absolute,
            Left: 5,
            Top: 7,
            Width: 60,
            Height: 60,
            OnPointerDown: (e PointerEvent) -> {
              pointerRecord("down", "leaf", e)
              if e.Button == PointerButton.Primary { Stale = e }
              if e.Button == PointerButton.Middle {
                if let stale = Stale { stale.StopPropagation() }
              }
              if e.Button == PointerButton.Secondary { e.StopPropagation() }
            },
            OnPointerMove: (e PointerEvent) -> { pointerRecord("move", "leaf", e) },
            OnPointerUp: (e PointerEvent) -> { pointerRecord("up", "leaf", e) },
          },
        },
      },
    },
  }

  private func pointerRecord(phase string, name string, e PointerEvent) {
    let modifiers = (e.Modifiers.Alt ? "1" : "0") + (e.Modifiers.Shift ? "1" : "0")
    +(e.Modifiers.Ctrl ? "1" : "0") + (e.Modifiers.Super ? "1" : "0")
    Events.Add(phase + ":" + name + ":" + int32(e.Button).ToString()
      +":" + int32(e.Buttons).ToString() + ":" + e.Position.X.ToString()
      +":" + e.Position.Y.ToString() + ":" + e.WindowPosition.X.ToString()
      +":" + e.WindowPosition.Y.ToString() + ":" + e.Delta.X.ToString()
      +":" + e.Delta.Y.ToString() + ":" + modifiers)
  }
}

internal class InputPointerCaptureCell : Cell {
  internal prop Events List[string]{ get; init; }
  internal var ReleaseOnCapturedMove bool

  override func Build() Blob -> Container {
    Width: 200.0,
    Height: 100.0,
    FlexDirection: FlexDirection.Row,
    OnPointerDown: (e PointerEvent) -> { Events.Add("down:root") },
    OnPointerMove: (e PointerEvent) -> {
      Events.Add("move:root")
      e.ReleaseCapture()
    },
    OnPointerUp: (e PointerEvent) -> { Events.Add("up:root") },
    Children: {
      Container{
        Key: "child",
        Width: 100.0,
        Height: 100.0,
        Focusable: true,
        OnClick: () -> { Clicks++ },
        OnPointerDown: (e PointerEvent) -> {
          Events.Add("down:child")
          if e.Button == PointerButton.Middle { e.Capture() }
        },
        OnPointerMove: (e PointerEvent) -> {
          Events.Add("move:child")
          if ReleaseOnCapturedMove {
            ReleaseOnCapturedMove = false
            e.ReleaseCapture()
          }
        },
        OnPointerUp: (e PointerEvent) -> { Events.Add("up:child") },
      },
      Container{
        Key: "sibling",
        Width: 100.0,
        Height: 100.0,
        OnPointerDown: (e PointerEvent) -> { Events.Add("down:sibling") },
        OnPointerMove: (e PointerEvent) -> { Events.Add("move:sibling") },
        OnPointerUp: (e PointerEvent) -> { Events.Add("up:sibling") },
      },
    },
  }

  internal var Clicks int32
}

internal class InputMultiPointerCell : Cell {
  internal prop Events List[string]{ get; init; }
  internal var LeftClicks int32
  internal var RightClicks int32

  override func Build() Blob -> Container {
    Width: 200.0,
    Height: 100.0,
    FlexDirection: FlexDirection.Row,
    OnPointerDown: (e PointerEvent) -> { record("down", "root", e) },
    OnPointerMove: (e PointerEvent) -> { record("move", "root", e) },
    OnPointerUp: (e PointerEvent) -> { record("up", "root", e) },
    OnPointerCancel: (e PointerEvent) -> { record("cancel", "root", e) },
    Children: {
      Container{
        Key: "left",
        Width: 100.0,
        Height: 100.0,
        Focusable: true,
        OnClick: () -> { LeftClicks++ },
        OnPointerDown: (e PointerEvent) -> {
          record("down", "left", e)
          e.Capture()
        },
        OnPointerMove: (e PointerEvent) -> { record("move", "left", e) },
        OnPointerUp: (e PointerEvent) -> { record("up", "left", e) },
        OnPointerCancel: (e PointerEvent) -> { record("cancel", "left", e) },
      },
      Container{
        Key: "right",
        Width: 100.0,
        Height: 100.0,
        Focusable: true,
        OnClick: () -> { RightClicks++ },
        OnPointerDown: (e PointerEvent) -> {
          record("down", "right", e)
          e.Capture()
        },
        OnPointerMove: (e PointerEvent) -> { record("move", "right", e) },
        OnPointerUp: (e PointerEvent) -> { record("up", "right", e) },
        OnPointerCancel: (e PointerEvent) -> { record("cancel", "right", e) },
      },
    },
  }

  private func record(phase string, target string, e PointerEvent) {
    Events.Add(phase + ":" + target + ":" + e.PointerId.ToString() + ":" + e.Device.ToString())
  }
}

internal class InputPenHoverCell : Cell {
  internal prop Events List[string]{ get; init; }

  override func Build() Blob -> Container {
    Width: 100.0,
    Height: 100.0,
    OnPointerMove: (e PointerEvent) -> {
      Events.Add(e.PointerId.ToString() + ":" + e.Device.ToString() + ":"
        +e.Delta.X.ToString() + ":" + e.Delta.Y.ToString() + ":"
        +int32(e.Buttons).ToString())
    },
  }
}

internal class InputPointerPressureCell : Cell {
  internal prop Events List[PointerEvent]{ get; init; }

  override func Build() Blob -> Container {
    Width: 100.0,
    Height: 100.0,
    OnPointerDown: (e PointerEvent) -> { Events.Add(e) },
    OnPointerMove: (e PointerEvent) -> { Events.Add(e) },
    OnPointerUp: (e PointerEvent) -> { Events.Add(e) },
  }
}

internal class InputPointerHoverLifecycleCell : Cell {
  internal prop Events List[string]{ get; init; }
  internal var Cause int32
  internal var ThrowOnEnter bool

  override func Build() Blob {
    let root = Container{
      Key: "root",
      Width: 200.0,
      Height: 100.0,
      OnPointerEnter: (e PointerEvent) -> { Events.Add("enter:root") },
      OnPointerLeave: (e PointerEvent) -> { Events.Add("leave:root") },
    }
    if Cause != 1 {
      root.Children.Add(Container{
        Key: "ancestor",
        Position: PositionType.Absolute,
        Width: 100.0,
        Height: 100.0,
        Disabled: Cause == 2,
        Visibility: Cause == 3 ? Visibility.Hidden : Visibility.Visible,
        OnPointerEnter: (e PointerEvent) -> { Events.Add("enter:ancestor") },
        OnPointerLeave: (e PointerEvent) -> { Events.Add("leave:ancestor") },
        Children: {
          Container{
            Key: "leaf",
            Position: PositionType.Absolute,
            Left: 10.0,
            Top: 10.0,
            Width: 40.0,
            Height: 40.0,
            OnPointerEnter: (e PointerEvent) -> {
              Events.Add("enter:leaf")
              if ThrowOnEnter { throw InvalidOperationException("hover enter") }
            },
            OnPointerLeave: (e PointerEvent) -> { Events.Add("leave:leaf") },
          },
        },
      })
    }
    root.Children.Add(Container{
      Key: "sibling",
      Position: PositionType.Absolute,
      Left: 100.0,
      Width: 100.0,
      Height: 100.0,
      OnPointerEnter: (e PointerEvent) -> { Events.Add("enter:sibling") },
      OnPointerLeave: (e PointerEvent) -> { Events.Add("leave:sibling") },
    })
    return root
  }
}

internal class InputPressedOwnershipCell : Cell {
  override func Build() Blob -> Button { Width: 100.0, Height: 50.0 }
}

internal class InputPointerCancelCell : Cell {
  internal prop Events List[string]{ get; init; }
  internal var Clicks int32
  internal var Cause int32
  internal prop ThrowOnCancel bool{ get; init; }
  internal prop ThrowOnUp bool{ get; init; }

  override func Build() Blob {
    let root = Container{
      Key: "root",
      Width: 100.0,
      Height: 100.0,
      OnPointerDown: (e PointerEvent) -> { record("down", "root", e) },
      OnPointerUp: (e PointerEvent) -> {
        record("up", "root", e)
        if ThrowOnUp { throw InvalidOperationException("up") }
      },
      OnPointerCancel: (e PointerEvent) -> {
        record("cancel", "root", e)
        if ThrowOnCancel { throw InvalidOperationException("cancel") }
        e.Capture()
        e.PreventDefault()
        e.StopPropagation()
      },
    }
    if Cause != 1 {
      root.Children.Add(Container{
        Key: "capture",
        Position: PositionType.Absolute,
        Left: 10,
        Top: 10,
        Width: 50.0,
        Height: 50.0,
        Disabled: Cause == 2,
        Display: Cause == 3 ? Display.None : Display.Flex,
        Visibility: Cause == 4 ? Visibility.Hidden : Visibility.Visible,
        Transform: Cause == 5 ? PanelTransform{ Scale: 0 } : PanelTransform{},
        OnClick: () -> { Clicks++ },
        OnPointerDown: (e PointerEvent) -> {
          record("down", "child", e)
          e.Capture()
        },
        OnPointerUp: (e PointerEvent) -> {
          record("up", "child", e)
          if ThrowOnUp { throw InvalidOperationException("up") }
        },
        OnPointerCancel: (e PointerEvent) -> { record("cancel", "child", e) },
      })
    }
    return root
  }

  private func record(phase string, target string, e PointerEvent) {
    let modifiers = (e.Modifiers.Alt ? "1" : "0") + (e.Modifiers.Shift ? "1" : "0")
    +(e.Modifiers.Ctrl ? "1" : "0") + (e.Modifiers.Super ? "1" : "0")
    Events.Add(phase + ":" + target + ":" + int32(e.Button).ToString()
      +":" + int32(e.Buttons).ToString() + ":" + e.Position.X.ToString()
      +":" + e.Position.Y.ToString() + ":" + e.WindowPosition.X.ToString()
      +":" + e.WindowPosition.Y.ToString() + ":" + e.Delta.X.ToString()
      +":" + e.Delta.Y.ToString() + ":" + modifiers)
  }
}

internal class InputDisabledCell : Cell {
  internal var ButtonClicks int32
  internal var GroupClicks int32
  internal var EnabledClicks int32

  override func Build() Blob -> Container {
    Width: 400.0,
    Height: 100.0,
    FlexDirection: FlexDirection.Row,
    Children: {
      Button{
        Key: "button",
        Width: 100.0,
        Height: 30.0,
        Disabled: true,
        DisabledStyle: Style{ Opacity: 0.5 },
        Hover: Style{ Opacity: 0.8 },
        Active: Style{ Opacity: 0.6 },
        OnClick: func() { ButtonClicks++ },
        Children: { Text{ Content: "Disabled" } },
      },
      TextEntry{
        Key: "entry",
        Width: 100.0,
        Height: 30.0,
        Disabled: true,
      },
      Container{
        Key: "group",
        Width: 100.0,
        Height: 30.0,
        Disabled: true,
        Children: {
          Button{
            Width: 100.0,
            Height: 30.0,
            OnClick: func() { GroupClicks++ },
            Children: { Text{ Content: "Group" } },
          },
        },
      },
      Button{
        Key: "enabled",
        Width: 100.0,
        Height: 30.0,
        OnClick: func() { EnabledClicks++ },
        Children: { Text{ Content: "Enabled" } },
      },
    },
  }
}

internal class InputDisableFocusedEntryCell : Cell {
  internal var Off bool

  init() {
    Off = false
  }

  internal func Disable() {
    Off = true
    Rebuild()
  }

  override func Build() Blob -> TextEntry {
    Value: "hello",
    Width: 200.0,
    Height: 30.0,
    Disabled: Off,
  }
}

internal class InputKeyboardFocusLifecycleCell : Cell {
  internal prop Events List[string]{ get; init; }
  private var mode int32

  internal func Disable() {
    mode = 1
    Rebuild()
  }

  internal func Hide() {
    mode = 2
    Rebuild()
  }

  internal func Remove() {
    mode = 3
    Rebuild()
  }

  internal func Enable() {
    mode = 0
    Rebuild()
  }

  override func Build() Blob {
    if mode == 3 {
      return Container{
        Width: 100, Height: 30,
        OnFocus: (e FocusEvent) -> { Events.Add("focus:root") },
        OnBlur: (e FocusEvent) -> { Events.Add("blur:root") },
      }
    }
    return Container{
      Width: 100, Height: 30,
      OnFocus: (e FocusEvent) -> { Events.Add("focus:root") },
      OnBlur: (e FocusEvent) -> { Events.Add("blur:root") },
      Children: {
        Container{
          Key: "leaf", Width: 100, Height: 30, Focusable: true,
          Disabled: mode == 1,
          Visibility: mode == 2 ? Visibility.Hidden : Visibility.Visible,
          OnFocus: (e FocusEvent) -> { Events.Add("focus:leaf") },
          OnBlur: (e FocusEvent) -> { Events.Add("blur:leaf") },
        },
      },
    }
  }
}

internal class InputTwoEntryCell : Cell {
  override func Build() Blob -> Container {
    Width: 300.0,
    Height: 100.0,
    Children: {
      TextEntry{ Key: "a", Value: "hello", Width: 200.0, Height: 30.0, FontSize: 16.0 },
      TextEntry{ Key: "b", Value: "hello", Width: 200.0, Height: 30.0, FontSize: 16.0 },
    },
  }
}

internal class InputNestedScrollCell : Cell {
  internal prop InnerFits bool{ get; init; }

  override func Build() Blob -> Container {
    Width: 200.0,
    Height: 200.0,
    Overflow: Overflow.Scroll,
    Children: {
      Container{
        Key: "inner",
        Width: 200.0,
        Height: 100.0,
        Overflow: Overflow.Scroll,
        Children: { Container{ Height: InnerFits ? 80.0 : 300.0 } },
      },
      Container{ Key: "tail", Height: 300.0 },
    },
  }
}

internal class InputWheelQuietCell : Cell {
  override func Build() Blob -> Container { Width: 100, Height: 100 }
}

internal class InputRoutedCallbackCell : Cell {
  internal var Calls int32

  override func Build() Blob -> Container {
    Width: 100, Height: 30, Focusable: true,
    OnKeyDown: (e KeyEvent) -> { Calls++ },
  }
}

internal class InputGenericTextCallbackCell : Cell {
  internal var Calls int32

  override func Build() Blob -> Container {
    Width: 100, Height: 30, Focusable: true,
    OnTextInput: (value string) -> { Calls++ },
  }
}

internal class InputWheelCell : Cell {
  internal prop Events List[string]{ get; init; }
  internal prop PreventDefault bool{ get; init; }
  internal prop StopPropagation bool{ get; init; }
  internal var CaptureMoves int32
  internal var FirstClicks int32
  internal var SecondClicks int32

  override func Build() Blob {
    let item = Container{
      Key: "item",
      Width: 100.0,
      Height: 100.0,
      OnClick: () -> { FirstClicks++ },
      OnWheel: (e WheelEvent) -> {
        record("item", e)
        if PreventDefault { e.PreventDefault() }
        if StopPropagation { e.StopPropagation() }
      },
    }
    let scroll = Container{
      Key: "scroll",
      Width: 100.0,
      Height: 100.0,
      FlexShrink: 0.0,
      Overflow: Overflow.Scroll,
      OnWheel: (e WheelEvent) -> { record("scroll", e) },
      Children: {
        item,
        Container{
          Key: "next",
          Width: 100.0,
          Height: 100.0,
          OnClick: () -> { SecondClicks++ },
        },
      },
    }
    return Container{
      Width: 200.0,
      Height: 100.0,
      FlexDirection: FlexDirection.Row,
      Children: {
        Container{
          Key: "capture",
          Width: 100.0,
          Height: 100.0,
          FlexShrink: 0.0,
          OnPointerDown: (e PointerEvent) -> { e.Capture() },
          OnPointerMove: (e PointerEvent) -> { CaptureMoves++ },
          OnWheel: (e WheelEvent) -> { Events.Add("capture") },
        },
        scroll,
      },
    }
  }

  private func record(name string, e WheelEvent) {
    Events.Add(name + ":" + e.Position.X.ToString() + ":" + e.Position.Y.ToString()
      +":" + e.Delta.X.ToString() + ":" + e.Delta.Y.ToString()
      +":" + (e.Modifiers.Ctrl ? "1" : "0"))
  }
}

internal class InputScrollStateCell : Cell {
  private var rows int32

  init() {
    rows = 3
  }

  internal func Grow() {
    rows++
    Rebuild()
  }

  override func Build() Blob {
    let list = Container{
      Key: "list",
      Width: 100.0,
      Height: 100.0,
      Overflow: Overflow.Scroll,
    }
    for i in 0 ... rows {
      list.Children.Add(Container{ Key: "row$i", Height: 60.0 })
    }
    return Container{
      Width: 100.0,
      Height: 100.0,
      Children: { list },
    }
  }
}

internal class InputAxisScrollCell : Cell {
  private var hiddenX bool

  init() {
    hiddenX = false
  }

  internal func HideX() {
    hiddenX = true
    Rebuild()
  }

  override func Build() Blob -> Container {
    Width: 100.0,
    Height: 100.0,
    OverflowX: hiddenX ? Overflow.Hidden : Overflow.Scroll,
    OverflowY: Overflow.Hidden,
    Children: {
      Container{ Width: 300.0, Height: 300.0, FlexShrink: 0.0 },
    },
  }
}
