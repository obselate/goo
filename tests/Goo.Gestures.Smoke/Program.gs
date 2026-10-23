package GooGestureSmoke

import Goo
import Goo.Gestures
import System
import System.Collections.Generic

func Require(value bool, message string) {
  if !value { throw InvalidOperationException(message) }
}

let events = List[TransformGestureEvent]()
let recognizer = TransformGesture(events.Add)
let window = Window{Root: GestureScene(recognizer), Width: 300, Height: 300, Title: "Goo gesture check"}.Open()
try {
  window.Pump(0)
  let input = window.PlatformInput
  input.PointerPress(100, PointerDevice.Touch, 50, 50, PointerButton.Primary, KeyModifiers{}, 1.0F)
  input.PointerPress(101, PointerDevice.Touch, 150, 50, PointerButton.Primary, KeyModifiers{}, 1.0F)
  input.PointerMove(101, PointerDevice.Touch, 50, 250, KeyModifiers{}, 1.0F)
  input.PointerRelease(101, PointerDevice.Touch, 50, 250, PointerButton.Primary, KeyModifiers{}, 0.0F)
  input.PointerRelease(100, PointerDevice.Touch, 50, 50, PointerButton.Primary, KeyModifiers{}, 0.0F)
  Require(events.Count == 3, "Transform lifecycle did not complete once")
  Require(events[0].Phase == GesturePhase.Started && events[2].Phase == GesturePhase.Completed,
    "Transform lifecycle phases changed")
  Require(Math.Abs(events[1].Scale - 2.0) < 0.0001, "Pinch scale changed")
  Require(events[1].Rotation.Status == GestureRotationStatus.Available,
    "Contact rotation was unavailable")
  Require(Math.Abs(events[1].Rotation.Radians - Math.PI / 2.0) < 0.0001, "Contact rotation changed")
  input.PointerPress(102, PointerDevice.Touch, 50, 50, PointerButton.Primary, KeyModifiers{}, 1.0F)
  input.PointerPress(103, PointerDevice.Touch, 150, 50, PointerButton.Primary, KeyModifiers{}, 1.0F)
  input.PointerCancel(102, PointerDevice.Touch)
  input.PointerRelease(103, PointerDevice.Touch, 150, 50, PointerButton.Primary, KeyModifiers{}, 0.0F)
  Require(events.Count == 5 && events[4].Phase == GesturePhase.Canceled,
    "Canceled transform continued after contact cancellation")
  Console.WriteLine("gestures: pan=verified pinch=2 rotation=90 lifecycle=verified cancellation=verified")
} finally {
  window.RequestClose()
  window.Pump(0)
}

internal class GestureScene : Cell {
  private let recognizer GestureRecognizer

  internal init(recognizer GestureRecognizer) { this.recognizer = recognizer }

  public override func Build() Blob -> Container{
    Width: 300, Height: 300, Gestures: []GestureRecognizer{recognizer},
  }
}
