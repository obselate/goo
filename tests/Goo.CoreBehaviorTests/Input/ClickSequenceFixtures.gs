package Goo

import System
import System.Collections.Generic

internal class ClickSequenceFixtures {
  func GenericCountsRespectBoundariesTargetsButtonsAndCancellation() bool {
    let downs = List[int32]()
    let ups = List[int32]()
    var moveCount int32 = -1
    var cancelCount int32 = -1
    let resolver = Resolver{}
    let input = PointerInput()
    let text = TextInput()
    let root = Reconciler{Res: resolver}.Mount(Container{
      Width: 200, Height: 60, FlexDirection: FlexDirection.Row,
      Children: {
        Button{Width: 100, Height: 60,
          OnPointerDown: (e PointerEvent) -> { downs.Add(e.ClickCount) },
          OnPointerUp: (e PointerEvent) -> { ups.Add(e.ClickCount) },
          OnPointerMove: (e PointerEvent) -> { moveCount = e.ClickCount },
          OnPointerCancel: (e PointerEvent) -> { cancelCount = e.ClickCount },
          Children: {Text{Content: "First"}},
        },
        Button{Width: 100, Height: 60,
          OnPointerDown: (e PointerEvent) -> { downs.Add(e.ClickCount) },
          OnPointerUp: (e PointerEvent) -> { ups.Add(e.ClickCount) },
        },
      },
    })
    Layout().Calculate(root, 200.0F, 60.0F)
    let click = (time float64, x float32, button PointerButton) -> {
      input.QueuePress(x, 30.0F, button, KeyModifiers{})
      input.QueueRelease(x, 30.0F, button, KeyModifiers{})
      input.Drain(root, resolver, time, text)
    }
    for i in 0 ... 4 { click(float64(i) * 0.05, 10.0F, PointerButton.Primary) }
    if downs[0] != 1 || downs[1] != 2 || downs[2] != 3 || downs[3] != 3 { return false }
    for i in 0 ... 4 { if ups[i] != downs[i] { return false } }
    click(1.0, 10.0F, PointerButton.Primary)
    click(1.05, 14.0F, PointerButton.Primary)
    click(1.10, 14.0F, PointerButton.Secondary)
    if downs[4] != 1 || downs[5] != 1 || downs[6] != 1 { return false }
    click(2.0, 99.0F, PointerButton.Primary)
    click(2.05, 101.0F, PointerButton.Primary)
    if downs[7] != 1 || downs[8] != 1 { return false }
    click(3.0, 10.0F, PointerButton.Primary)
    input.QueueMove(30.0F, 30.0F)
    input.QueueMove(10.0F, 30.0F)
    input.Drain(root, resolver, 3.01, text)
    click(3.05, 10.0F, PointerButton.Primary)
    if downs[10] != 1 || moveCount != 0 { return false }
    input.QueueCancel()
    input.Drain(root, resolver, 3.06, text)
    click(3.10, 10.0F, PointerButton.Primary)
    if downs[11] != 1 { return false }
    input.QueuePress(10.0F, 30.0F, PointerButton.Primary, KeyModifiers{})
    input.QueueCancel()
    input.Drain(root, resolver, 3.15, text)
    click(3.20, 10.0F, PointerButton.Primary)
    if cancelCount != 0 || downs[13] != 1 { return false }
    input.Reset(root, resolver, text)
    click(0.0, 10.0F, PointerButton.Primary)
    click(0.4, 10.0F, PointerButton.Primary)
    return downs[14] == 1 && downs[15] == 1
  }

  func TextSelectionUsesTheRoutedCountAndCaptureDoesNotCreateFalseClicks() bool {
    var count int32
    var up int32
    var capture bool
    let resolver = Resolver{}
    let input = PointerInput()
    let text = TextInput()
    let root = Reconciler{Res: resolver}.Mount(TextEntry{
      Width: 200, Height: 40, Value: "hello world",
      OnPointerDown: (e PointerEvent) -> { count = e.ClickCount
        if capture { e.Capture() } },
      OnPointerUp: (e PointerEvent) -> { up = e.ClickCount },
    })
    Layout().Calculate(root, 200.0F, 40.0F)
    for i in 0 ... 3 {
      input.QueuePress(2.0F, 10.0F)
      input.QueueRelease(2.0F, 10.0F)
      input.Drain(root, resolver, float64(i) * 0.05, text)
      if count != i + 1 || up != count { return false }
      if i > 0 && (root.Anchor != 0 || root.Caret != 5) { return false }
    }
    capture = true
    input.QueuePress(2.0F, 10.0F)
    input.QueueMove(250.0F, 10.0F)
    input.QueueMove(2.0F, 10.0F)
    input.QueueRelease(2.0F, 10.0F)
    input.Drain(root, resolver, 0.15, text)
    input.QueuePress(2.0F, 10.0F)
    input.Drain(root, resolver, 0.20, text)
    if count != 1 { return false }
    input.QueueCancel()
    input.Drain(root, resolver, 0.21, text)
    input.QueuePress(2.0F, 10.0F)
    input.Drain(root, resolver, 0.22, text)
    return count == 1
  }

  func TouchCountsArePerContactAndPenSequencesAreIndependent() bool {
    let counts = List[int32]()
    let resolver = Resolver{}
    let input = PointerInput()
    let text = TextInput()
    let root = Reconciler{Res: resolver}.Mount(Button{
      Width: 200, Height: 60,
      OnPointerDown: (e PointerEvent) -> { counts.Add(e.ClickCount) },
    })
    Layout().Calculate(root, 200.0F, 60.0F)
    for device in []PointerDevice {PointerDevice.Touch, PointerDevice.Pen} {
      for i in 0 ... 2 {
        input.QueuePress(42L, device, 10.0F, 10.0F, PointerButton.Primary, KeyModifiers{}, 1.0F)
        input.QueueRelease(42L, device, 10.0F, 10.0F, PointerButton.Primary, KeyModifiers{}, 0.0F)
        input.Drain(root, resolver, float64(i) * 0.05, text)
      }
    }
    return counts.Count == 4 && counts[0] == 1 && counts[1] == 1 && counts[2] == 1 && counts[3] == 2
  }
}
