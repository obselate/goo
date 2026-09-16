package Goo

import System
import System.Collections.Generic

internal class TextInputPrimitivesFixtures {
  func GenericCallbacksReceiveNormalizedUtf16Payloads() bool {
    let textFocus = FocusManager()
    var committed = ""
    var compositionText = ""
    var selectionStart = -1
    var selectionLength = -1
    var candidate = ""
    var selectedCandidate = 0
    var horizontal = false
    var cancellations int32
    let root = Reconciler{ Res: Resolver{} }.Mount(Container{
      Width: 100, Height: 30, Focusable: true,
      OnTextInput: (value string) -> { committed = value },
      OnTextComposition: (value TextCompositionEvent) -> {
        compositionText = value.Text
        selectionStart = value.SelectionStart
        selectionLength = value.SelectionLength
      },
      OnTextCandidates: (value TextCandidateEvent) -> {
        candidate = value.Candidates.Count == 0 ? "" : value.Candidates[0]
        selectedCandidate = value.SelectedCandidate
        horizontal = value.Horizontal
      },
      OnTextCompositionCancel: () -> { cancellations++ },
    })
    let resolver = Resolver{}
    let text = TextInput(textFocus)
    let keyboard = KeyboardInput(textFocus)
    textFocus.SetFocus(resolver, root)
    keyboard.QueueText("😀", textFocus.Generation)
    keyboard.QueueComposition("a😀b", 2, 0, textFocus.Generation)
    keyboard.QueueCompositionCandidates([]string{ "first", "second" }, 7, true, textFocus.Generation)
    keyboard.QueueCompositionCancel(textFocus.Generation)
    let changed = keyboard.Drain(root, resolver, text, nil)
    return !changed && committed == "😀" && compositionText == "a😀b"
      && selectionStart == 0 && selectionLength == 0 && candidate == "first"
      && selectedCandidate == -1 && horizontal && cancellations == 1
  }

  func StaleTextEventsDropAcrossTransfersAndFocusCycles() bool {
    let textFocus = FocusManager()
    let events = List[string]()
    let root = Reconciler{ Res: Resolver{} }.Mount(Container() {
        Container{
          Key: "first", Width: 100, Height: 30, Focusable: true,
          OnTextInput: (value string) -> { events.Add("first:text:" + value) },
          OnTextComposition: (value TextCompositionEvent) -> {
            events.Add("first:composition:" + value.Text)
          },
          OnTextCandidates: (value TextCandidateEvent) -> {
            events.Add("first:candidate:" + value.Candidates[0])
          },
          OnTextCompositionCancel: () -> { events.Add("first:cancel") },
        },
        Container{
          Key: "second", Width: 100, Height: 30, Focusable: true,
          OnTextInput: (value string) -> { events.Add("second:text:" + value) },
          OnTextComposition: (value TextCompositionEvent) -> {
            events.Add("second:composition:" + value.Text)
          },
          OnTextCandidates: (value TextCandidateEvent) -> {
            events.Add("second:candidate:" + value.Candidates[0])
          },
          OnTextCompositionCancel: () -> { events.Add("second:cancel") },
        },
      })
    let resolver = Resolver{}
    let text = TextInput(textFocus)
    let keyboard = KeyboardInput(textFocus)
    let first = root.Children[0]
    let second = root.Children[1]
    textFocus.SetFocus(resolver, first)
    queueAll(keyboard, textFocus, "stale-first")
    textFocus.SetFocus(resolver, second)
    queueAll(keyboard, textFocus, "stale-second")
    textFocus.SetFocus(resolver, first)
    queueAll(keyboard, textFocus, "final")
    if keyboard.Drain(root, resolver, text, nil) { return false }
    let expected = []string{
      "first:text:final",
      "first:composition:final",
      "first:candidate:final",
      "first:cancel",
    }
    if events.Count != expected.Length { return false }
    for i in 0 ... expected.Length {
      if events[i] != expected[i] { return false }
    }
    return true
  }

  func BuiltInDefaultsPrecedeThrowingObserversAndRetainQueuedSuffix() bool {
    let textFocus = FocusManager()
    var observerCalls int32
    var throwFirst = true
    let root = Reconciler{ Res: Resolver{} }.Mount(TextEntry{
      Value: "",
      OnTextInput: (value string) -> {
        observerCalls++
        if throwFirst {
          throwFirst = false
          throw InvalidOperationException("observer")
        }
      },
    })
    let resolver = Resolver{}
    let text = TextInput(textFocus)
    let keyboard = KeyboardInput(textFocus)
    textFocus.SetFocus(resolver, root)
    keyboard.QueueText("a", textFocus.Generation)
    keyboard.QueueText("b", textFocus.Generation)
    var threw = false
    try {
      keyboard.Drain(root, resolver, text, nil)
    } catch (error Exception) {
      threw = true
    }
    if !threw || root.Buffer != "a" || observerCalls != 1 { return false }
    let changed = keyboard.Drain(root, resolver, text, nil)
    return changed && root.Buffer == "ab" && observerCalls == 2
  }

  func UnavailableOrRemovedFocusedClientsDropQueuedText() bool {
    var calls int32
    let root = Reconciler{ Res: Resolver{} }.Mount(Container{
      Width: 100, Height: 30, Focusable: true,
      OnTextInput: (value string) -> { calls++ },
    })
    let replacement = Reconciler{ Res: Resolver{} }.Mount(Container{
      Width: 100, Height: 30, Focusable: true,
      OnTextInput: (value string) -> { calls++ },
    })
    let resolver = Resolver{}
    let input = InputCoordinator()
    if !input.FocusElement(resolver, root) { return false }
    input.QueueText("disabled")
    root.Disabled = true
    input.AfterTreeUpdated(root, resolver, true)
    input.Drain(root, resolver, 0.0, nil)
    if calls != 0 || input.FocusedNode() != nil { return false }

    root.Disabled = false
    if !input.FocusElement(resolver, root) { return false }
    input.QueueText("hidden")
    root.Visibility = Visibility.Hidden
    input.AfterTreeUpdated(root, resolver, true)
    input.Drain(root, resolver, 0.0, nil)
    if calls != 0 || input.FocusedNode() != nil { return false }

    root.Visibility = Visibility.Visible
    if !input.FocusElement(resolver, root) { return false }
    input.QueueText("removed")
    input.AfterTreeUpdated(replacement, resolver, true)
    input.Drain(replacement, resolver, 0.0, nil)
    return calls == 0 && input.FocusedNode() == nil
  }

  func TextCallbackStateStaysAbsentUntilConfigured() bool {
    let plain = Container{ Width: 10, Height: 10 }
    if plain.HasSparseInputState || TextInputCallbacks.HasBlobCallbacks(plain) { return false }
    let keyboard = Container{
      Width: 10, Height: 10, Focusable: true,
      OnKeyDown: (value KeyEvent) -> {},
    }
    if TextInputCallbacks.HasBlobCallbacks(keyboard) { return false }
    let keyboardNode = Reconciler{ Res: Resolver{} }.Mount(keyboard)
    if TextInputCallbacks.HasNodeCallbacks(keyboardNode) { return false }
    let text = Container{
      Width: 10, Height: 10, Focusable: true,
      OnTextInput: (value string) -> {},
    }
    if !text.HasSparseInputState || !TextInputCallbacks.HasBlobCallbacks(text) { return false }
    let textNode = Reconciler{ Res: Resolver{} }.Mount(text)
    return textNode.HasSparseInputState && TextInputCallbacks.HasNodeCallbacks(textNode)
  }

  func SameDiffKeyboardAndTextCallbacksStaySynchronized() bool {
    let inputFocus = FocusManager()
    var keyCalls int32
    var text = ""
    let resolver = Resolver{}
    let rec = Reconciler{ Res: resolver }
    var root = rec.Mount(Container{ Key: "client", Width: 100, Height: 30, Focusable: true })
    root = rec.Diff(root, Container{
      Key: "client", Width: 100, Height: 30, Focusable: true,
      OnKeyDown: (value KeyEvent) -> { keyCalls = keyCalls + 1 },
      OnTextInput: (value string) -> { text = "first:" + value },
    })
    let input = TextInput(inputFocus)
    let keyboard = KeyboardInput(inputFocus)
    inputFocus.SetFocus(resolver, root)
    keyboard.HandleKey(root, resolver, input, Key.A, KeyModifiers{})
    input.HandleChar(root, "a")
    if keyCalls != 1 || text != "first:a" { return false }

    root = rec.Diff(root, Container{
      Key: "client", Width: 100, Height: 30, Focusable: true,
      OnKeyDown: (value KeyEvent) -> { keyCalls = keyCalls + 10 },
      OnTextInput: (value string) -> { text = "newest:" + value },
    })
    keyboard.HandleKey(root, resolver, input, Key.B, KeyModifiers{})
    input.HandleChar(root, "b")
    NodeLifecycle.DisposeTree(root)
    return keyCalls == 11 && text == "newest:b"
  }

  func TextCallbackOptOutDeclarationBytes() int64 {
    let warm = Container{}
    TextInputCallbacks.HasBlobCallbacks(warm)
    let before = GC.GetAllocatedBytesForCurrentThread()
    let value = Container{}
    let bytes = GC.GetAllocatedBytesForCurrentThread() - before
    TextInputCallbacks.HasBlobCallbacks(value)
    return bytes
  }

  func TextCallbackOptOutStableDiffBytes() int64 {
    let rec = Reconciler{ Res: Resolver{} }
    let blob = Container() {.Width: 100,.Height: 30, Text{ Content: "plain"} }
    let root = rec.Mount(blob)
    rec.Diff(root, blob)
    let before = GC.GetAllocatedBytesForCurrentThread()
    rec.Diff(root, blob)
    let bytes = GC.GetAllocatedBytesForCurrentThread() - before
    NodeLifecycle.DisposeTree(root)
    return bytes
  }

  func MountedCustomContainerContract() bool {
    let cell = MountedTextClientCell{}
    let window = Window{ Root: cell, Width: 160, Height: 90 }
    window.Open()
    try {
      window.UpdateTree()
      let area = ElementRect{ X: 8.0, Y: 12.0, Width: 40.0, Height: 18.0 }
      if !cell.First.Focus() { return false }
      let nativeTextInput = window.NativeTextInputActiveForTest()
      if cell.First.SetTextInputArea(area) != nativeTextInput { return false }
      window.QueueTextInputForTest("commit")
      window.QueueCompositionForTest("a😀b", 1, 2)
      window.QueueCandidatesForTest([]string{ "one", "two" }, 0, true)
      window.QueueCompositionCancelForTest()
      window.DrainTextInputForTest()
      if cell.Committed != "commit" || cell.Composition != "a😀b" || cell.SelectionStart != 1
        || cell.SelectionLength != 2 || cell.Candidate != "one" || !cell.Horizontal
        || cell.Cancellations != 1 {
          return false
        }
      if !cell.Second.Focus() || cell.First.SetTextInputArea(area)
        || cell.Second.SetTextInputArea(area) != nativeTextInput{
          return false
        }
      cell.FirstAttached = false
      cell.Rebuild()
      window.UpdateTree()
      if cell.First.SetTextInputArea(area)
        || cell.Second.SetTextInputArea(area) != nativeTextInput{ return false }
      window.Close()
      return !cell.Second.SetTextInputArea(area)
    } finally {
      if window.IsOpen { window.Close() }
    }
  }

  func NativeTextInputLifecycleContract() bool {
    let cell = NativeTextInputLifecycleCell{}
    let window = Window{ Root: cell, Width: 180, Height: 120 }
    window.Open()
    try {
      window.UpdateTree()
      if window.NativeTextInputActiveForTest() { return false }
      if !cell.First.Focus() { return false }
      if !window.NativeTextInputActiveForTest() {
        if !cell.Second.Focus() || window.NativeTextInputActiveForTest() { return false }
        if !cell.Entry.Focus() || window.NativeTextInputActiveForTest() { return false }
        if !cell.Editor.Focus() || window.NativeTextInputActiveForTest() { return false }
        if !cell.Plain.Focus() || window.NativeTextInputActiveForTest() { return false }
        window.Close()
        return !window.NativeTextInputActiveForTest()
      }
      if !cell.Second.Focus() || !window.NativeTextInputActiveForTest() { return false }
      if !cell.Entry.Focus() || !window.NativeTextInputActiveForTest() { return false }
      if !cell.Editor.Focus() || !window.NativeTextInputActiveForTest() { return false }
      if !cell.Plain.Focus() || window.NativeTextInputActiveForTest() { return false }

      if !cell.First.Focus() || !window.NativeTextInputActiveForTest() { return false }
      cell.FirstTextEnabled = false
      cell.Rebuild()
      window.UpdateTree()
      if window.NativeTextInputActiveForTest() { return false }
      cell.FirstTextEnabled = true
      cell.Rebuild()
      window.UpdateTree()
      if !window.NativeTextInputActiveForTest() { return false }

      cell.FirstHidden = true
      cell.Rebuild()
      window.UpdateTree()
      if window.NativeTextInputActiveForTest() { return false }
      cell.FirstHidden = false
      cell.Rebuild()
      window.UpdateTree()
      if !cell.First.Focus() || !window.NativeTextInputActiveForTest() { return false }

      cell.FirstDisabled = true
      cell.Rebuild()
      window.UpdateTree()
      if window.NativeTextInputActiveForTest() { return false }
      cell.FirstDisabled = false
      cell.Rebuild()
      window.UpdateTree()
      if !cell.First.Focus() || !window.NativeTextInputActiveForTest() { return false }

      cell.FirstAttached = false
      cell.Rebuild()
      window.UpdateTree()
      if window.NativeTextInputActiveForTest() { return false }
      if !cell.Second.Focus() || !window.NativeTextInputActiveForTest() { return false }
      window.NativeFocusLostForTest()
      if window.NativeTextInputActiveForTest() { return false }
      if !cell.Second.Focus() || !window.NativeTextInputActiveForTest() { return false }
      window.Close()
      return !window.NativeTextInputActiveForTest()
    } finally {
      if window.IsOpen { window.Close() }
    }
  }

  private func queueAll(keyboard KeyboardInput, focus FocusManager, value string) {
    let generation = focus.Generation
    keyboard.QueueText(value, generation)
    keyboard.QueueComposition(value, 0, value.Length, generation)
    keyboard.QueueCompositionCandidates([]string{ value }, 0, false, generation)
    keyboard.QueueCompositionCancel(generation)
  }
}

public partial class Window {
  internal prop KeyPressedCallbacksForTest Action[Key, KeyModifiers]? {
    get -> notifications.KeyPressedCallbacks
  }

  internal func QueueTextInputForTest(value string) {
    input.QueueText(value)
  }

  internal func QueueCompositionForTest(value string, selectionStart int32, selectionLength int32) {
    input.QueueComposition(value, selectionStart, selectionLength)
  }

  internal func QueueCandidatesForTest(values IReadOnlyList[string], selected int32, horizontal bool) {
    input.QueueCompositionCandidates(values, selected, horizontal)
  }

  internal func QueueCompositionCancelForTest() {
    input.QueueCompositionCancel()
  }

  internal func DrainTextInputForTest() bool -> input.Drain(node, resolver, timeS, nil)

  internal func NativeTextInputActiveForTest() bool -> host?.IsTextInputActive == true

  internal func NativeFocusLostForTest() {
    input.FocusLost(resolver)
  }
}

internal class MountedTextClientCell : Cell {
  internal let First ElementHandle
  internal let Second ElementHandle
  internal var FirstAttached bool
  internal var Committed string
  internal var Composition string
  internal var SelectionStart int32
  internal var SelectionLength int32
  internal var Candidate string
  internal var Horizontal bool
  internal var Cancellations int32

  init() {
    First = ElementHandle{}
    Second = ElementHandle{}
    FirstAttached = true
    Committed = ""
    Composition = ""
    Candidate = ""
  }

  override func Build() Blob {
    let root = Container() {.Width: 160,.Height: 90,}
    if FirstAttached {
      root.Children.Add(Container{
        Key: "custom-first", Handle: First, Width: 70, Height: 30, Focusable: true,
        OnTextInput: (value string) -> { Committed = value },
        OnTextComposition: (value TextCompositionEvent) -> {
          Composition = value.Text
          SelectionStart = value.SelectionStart
          SelectionLength = value.SelectionLength
        },
        OnTextCandidates: (value TextCandidateEvent) -> {
          Candidate = value.Candidates.Count == 0 ? "" : value.Candidates[0]
          Horizontal = value.Horizontal
        },
        OnTextCompositionCancel: () -> { Cancellations = Cancellations + 1 },
      })
    }
    root.Children.Add(Container{
      Key: "custom-second", Handle: Second, Width: 70, Height: 30, Focusable: true,
      OnTextInput: (value string) -> {},
    })
    return root
  }
}

internal class NativeTextInputLifecycleCell : Cell {
  internal let First ElementHandle
  internal let Second ElementHandle
  internal let Entry ElementHandle
  internal let Editor ElementHandle
  internal let Plain ElementHandle
  internal let Document TextDocument
  internal let Controller TextEditorController
  internal var FirstAttached bool
  internal var FirstTextEnabled bool
  internal var FirstHidden bool
  internal var FirstDisabled bool

  init() {
    First = ElementHandle{}
    Second = ElementHandle{}
    Entry = ElementHandle{}
    Editor = ElementHandle{}
    Plain = ElementHandle{}
    Document = TextDocument{}
    Controller = TextEditorController(Document)
    FirstAttached = true
    FirstTextEnabled = true
  }

  override func Build() Blob {
    let root = Container() {.Width: 180,.Height: 120,}
    if FirstAttached {
      let callback Action[string]? = FirstTextEnabled ? func(value string) {} : nil
      root.Children.Add(Container{
        Key: "generic-first", Handle: First, Width: 80, Height: 20, Focusable: true,
        Disabled: FirstDisabled,
        Visibility: FirstHidden ? Visibility.Hidden : Visibility.Visible,
        OnTextInput: callback,
      })
    }
    root.Children.Add(Container{
      Key: "generic-second", Handle: Second, Width: 80, Height: 20, Focusable: true,
      OnTextInput: (value string) -> {},
    })
    root.Children.Add(TextEntry{ Key: "entry", Handle: Entry, Width: 80, Height: 20 })
    let editor = TextEditor(Controller) {
      Key = "editor", Handle = Editor, Width = 80, Height = 20,
    }
    root.Children.Add(editor)
    root.Children.Add(Container{ Key: "plain", Handle: Plain, Width: 80, Height: 20, Focusable: true })
    return root
  }
}
