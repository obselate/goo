package Goo

import System.Collections.Generic

internal class ClipPathInputFixtures {
  func NormalPointerAcquisitionRespectsClipPath() bool {
    let events = List[string]()
    let driver = InputFixtureDriver(ClipPathHitCell{ Events: events }, 200, 100)
    guard let tree = driver.Window.Tree else { return false }
    guard let fallback = find(tree, "fallback") else { return false }
    guard let clipped = find(tree, "clipped") else { return false }
    if hitTopmost(tree, 90.0F, 25.0F) != fallback
      || hitTopmost(tree, 20.0F, 25.0F) != clipped{
        return false
      }

    driver.Move(90.0F, 25.0F)
    if !fallback.Hovered || clipped.Hovered { return false }
    driver.Input.QueuePointerMove(90.0F, 25.0F)
    driver.Input.QueuePointerPress(90.0F, 25.0F, PointerButton.Primary, KeyModifiers{})
    driver.Input.QueuePointerRelease(90.0F, 25.0F, PointerButton.Primary, KeyModifiers{})
    driver.Input.QueuePointerWheel(90.0F, 25.0F, 0.0F, 1.0F)
    driver.Drain()
    if !equal(events, []string { "move:fallback", "down:fallback", "click:fallback", "wheel:fallback" }) {
      return false
    }

    guard let current = driver.Window.Tree else { return false }
    guard let currentFallback = find(current, "fallback") else { return false }
    guard let currentClipped = find(current, "clipped") else { return false }
    events.Clear()
    driver.Move(20.0F, 25.0F)
    if !currentClipped.Hovered || currentFallback.Hovered { return false }
    driver.Input.QueuePointerMove(20.0F, 25.0F)
    driver.Input.QueuePointerPress(20.0F, 25.0F, PointerButton.Primary, KeyModifiers{})
    driver.Input.QueuePointerRelease(20.0F, 25.0F, PointerButton.Primary, KeyModifiers{})
    driver.Input.QueuePointerWheel(20.0F, 25.0F, 0.0F, 1.0F)
    driver.Drain()
    return equal(events, []string{ "move:clipped", "down:clipped", "click:clipped", "wheel:clipped" })
  }

  func NestedClipPathsIntersect() bool {
    let driver = InputFixtureDriver(ClipPathNestedCell{}, 200, 100)
    guard let tree = driver.Window.Tree else { return false }
    guard let fallback = find(tree, "fallback") else { return false }
    guard let clipped = find(tree, "clipped") else { return false }
    return hitTopmost(tree, 20.0F, 50.0F) == clipped
      && hitTopmost(tree, 60.0F, 50.0F) == fallback
      && hitTopmost(tree, 90.0F, 50.0F) == fallback
  }

  func TransformedClipPathUsesMappedCoordinates() bool {
    let driver = InputFixtureDriver(ClipPathTransformCell{}, 200, 100)
    guard let tree = driver.Window.Tree else { return false }
    guard let fallback = find(tree, "fallback") else { return false }
    guard let clipped = find(tree, "clipped") else { return false }
    return hitTopmost(tree, 120.0F, 50.0F) == clipped
      && hitTopmost(tree, 170.0F, 50.0F) == fallback
  }

  func CaptureContinuesOutsideClipUntilRelease() bool {
    let events = List[string]()
    let driver = InputFixtureDriver(ClipPathCaptureCell{ Events: events }, 200, 100)
    driver.Input.QueuePointerPress(20.0F, 50.0F, PointerButton.Middle, KeyModifiers{})
    driver.Input.QueuePointerMove(90.0F, 50.0F)
    driver.Input.QueuePointerRelease(90.0F, 50.0F, PointerButton.Middle, KeyModifiers{})
    driver.Input.QueuePointerMove(90.0F, 50.0F)
    driver.Drain()
    return equal(events, []string{ "down:clipped", "move:clipped", "up:clipped", "move:fallback" })
  }

  private func find(n Node, key string) Node? {
    if n.Key == key { return n }
    for child in n.Children {
      if let found = find(child, key) { return found }
    }
    return nil
  }

  private func equal(actual List[string], expected []string) bool {
    if actual.Count != expected.Length { return false }
    for i in 0 ... expected.Length {
      if actual[i] != expected[i] { return false }
    }
    return true
  }
}

internal class ClipPathHitCell : Cell {
  internal prop Events List[string]{ get; init; }

  override func Build() Blob -> Container() {.Width: 200.0,.Height: 100.0,
    clipPathFallback(Events),
      Container() {.Key: "clip",.Position: PositionType.Absolute,.Width: 100.0,.Height: 50.0,.ClipPath: leftHalf(),
      clipPathTarget(Events, 50.0),
    },
  }
}

internal class ClipPathNestedCell : Cell {
  override func Build() Blob -> Container() {.Width: 200.0,.Height: 100.0,
    Container{
        Key: "fallback",
        Position: PositionType.Absolute,
        Width: 200.0,
        Height: 100.0,
        HitTestSelf: true,
      },
      Container() {.Key: "outer",.Position: PositionType.Absolute,.Width: 100.0,.Height: 100.0,.ClipPath: leftThreeQuarters(),.HitTestSelf: false,
      Container() {.Key: "inner",.Position: PositionType.Absolute,.Width: 100.0,.Height: 100.0,.ClipPath: leftHalf(),.HitTestSelf: false,
        Container{
                Key: "clipped",
                Position: PositionType.Absolute,
                Width: 100.0,
                Height: 100.0,
                HitTestSelf: true,
              },
            },
          },
        }
}

internal class ClipPathTransformCell : Cell {
  override func Build() Blob -> Container() {.Width: 200.0,.Height: 100.0,
    Container{
        Key: "fallback",
        Position: PositionType.Absolute,
        Width: 200.0,
        Height: 100.0,
        HitTestSelf: true,
      },
      Container() {.Key: "clip",.Position: PositionType.Absolute,.Width: 100.0,.Height: 100.0,.Transform: PanelTransform{ TranslateX: 100 },.TransformOriginX: Length.Percent(0),.TransformOriginY: Length.Percent(0),.ClipPath: leftHalf(),.HitTestSelf: false,
      Container{
            Key: "clipped",
            Position: PositionType.Absolute,
            Width: 100.0,
            Height: 100.0,
            HitTestSelf: true,
      },
    },
  }
}

internal class ClipPathCaptureCell : Cell {
  internal prop Events List[string]{ get; init; }

  override func Build() Blob -> Container() {.Width: 200.0,.Height: 100.0,
    clipPathFallback(Events),
      Container() {.Key: "clip",.Position: PositionType.Absolute,.Width: 100.0,.Height: 100.0,.ClipPath: leftHalf(),.HitTestSelf: false,
      Container{
            Key: "clipped",
            Position: PositionType.Absolute,
            Width: 100.0,
            Height: 100.0,
            OnPointerDown: (e PointerEvent) -> {
              Events.Add("down:clipped")
              e.Capture()
            },
            OnPointerMove: (e PointerEvent) -> { Events.Add("move:clipped") },
            OnPointerUp: (e PointerEvent) -> { Events.Add("up:clipped")
        },
      },
    },
  }
}

internal func clipPathFallback(events List[string]) Container -> Container {
  Key: "fallback",
  Position: PositionType.Absolute,
  Width: 200.0,
  Height: 100.0,
  OnClick: () -> { events.Add("click:fallback") },
  OnPointerDown: (e PointerEvent) -> { events.Add("down:fallback") },
  OnPointerMove: (e PointerEvent) -> { events.Add("move:fallback") },
  OnWheel: (e WheelEvent) -> { events.Add("wheel:fallback") },
}

internal func clipPathTarget(events List[string], height float64) Container -> Container {
  Key: "clipped",
  Position: PositionType.Absolute,
  Width: 100.0,
  Height: height,
  OnClick: () -> { events.Add("click:clipped") },
  OnPointerDown: (e PointerEvent) -> { events.Add("down:clipped") },
  OnPointerMove: (e PointerEvent) -> { events.Add("move:clipped") },
  OnWheel: (e WheelEvent) -> { events.Add("wheel:clipped") },
}

internal func leftHalf() VectorPath -> PathBuilder(0.0, 0.0, 100.0, 100.0).MoveTo(0.0, 0.0).LineTo(50.0, 0.0).LineTo(50.0, 100.0).LineTo(0.0, 100.0).Close().Build()

internal func leftThreeQuarters() VectorPath -> PathBuilder(0.0, 0.0, 100.0, 100.0).MoveTo(0.0, 0.0).LineTo(75.0, 0.0).LineTo(75.0, 100.0).LineTo(0.0, 100.0).Close().Build()
