package Goo.CoreBehaviorTests

import Goo
import System
import System.Collections.Generic
import Xunit

class ExplicitKeyBindingTests {
    @Fact
    func PublicPastePreservesInterceptionCompositionAndUndo() {
        using let controller = TextEditorController(TextDocument(""))
        let handle = ElementHandle()
        let window = Window{
            Width: 320,
            Height: 120,
            Root: ExplicitKeyBindingTests.BuildCell(() -> TextEditor(controller){Handle = handle})
        }
        try {
            window.UpdateTree()
            Assert.True(handle.Focus())
            let input = window.PlatformInput
            input.CommitText("a")
            input.KeyPress(Key.Enter, default(KeyModifiers))
            input.KeyRelease(Key.Enter)
            input.KeyPress(Key.Enter, KeyModifiers{Shift: true})
            input.KeyRelease(Key.Enter)
            Assert.Equal("a", controller.Document.GetText())
            let seen = List[TextCommandKind]()
            controller.OnCommand = (e TextCommandEvent) -> seen.Add(e.Command.Kind)
            window.InputForTest.SetClipboardFallback("b")
            Assert.True(input.Execute(TextCommand{Kind: TextCommandKind.Paste}))
            Assert.Equal([]TextCommandKind{TextCommandKind.Paste}, seen)
            Assert.Equal("ab", controller.Document.GetText())
            input.Execute(TextCommand{Kind: TextCommandKind.Undo})
            Assert.Equal("a", controller.Document.GetText())
            input.SetComposition("preedit", 0, 0)
            controller.OnCommand = (e TextCommandEvent) -> {
                if e.Command.Kind == TextCommandKind.Paste {
                    e.Cancel = true
                }
            }
            Assert.False(input.Execute(TextCommand{Kind: TextCommandKind.Paste, Text: "rejected"}))
            Assert.Equal("a", controller.Document.GetText())
            Assert.NotNull(controller.Composition)
            Assert.Equal("preedit", controller.Composition!!.Text)
        } finally {
            window.Close()
        }
    }

    @Theory
    @InlineData(false)
    @InlineData(true)
    func OversizedPasteDoesNotReplaceSelection(editor bool) {
        using let controller = TextEditorController(TextDocument("keep"))
        let handle = ElementHandle()
        var value = "keep"
        let window = Window{
            Width: 320,
            Height: 120,
            Root: ExplicitKeyBindingTests.BuildCell(
                () -> if editor {
                    cast[Blob](TextEditor(controller){Handle = handle})
                } else {
                    cast[Blob](
                        TextEntry{
                            Handle: handle,
                            Value: value,
                            OnChange: (next string) -> {
                                value = next
                            }
                        }
                    )
                }
            )
        }
        try {
            window.UpdateTree()
            Assert.True(handle.Focus())
            let input = window.PlatformInput
            input.Execute(TextCommand{Kind: TextCommandKind.SelectAll})
            var intercepted = 0
            if editor {
                controller.OnCommand = (e TextCommandEvent) -> {
                    intercepted++
                    e.Cancel = true
                }
            }
            for text in[]string{String('\t', 16777217), String('é', 8388609)} {
                window.InputForTest.SetClipboardFallback(text)
                let before = intercepted
                Assert.False(input.Execute(TextCommand{Kind: TextCommandKind.Paste}))
                Assert.False(input.Execute(TextCommand{Kind: TextCommandKind.Paste, Text: text}))
                Assert.Equal(before + (if editor { 1 } else { 0 }), intercepted)
                Assert.Equal(
                    "keep",
                    if editor {
                        controller.Document.GetText()
                    } else {
                        value
                    }
                )
            }
            window.InputForTest.SetClipboardFallback("ok")
            controller.OnCommand = nil
            Assert.True(input.Execute(TextCommand{Kind: TextCommandKind.Paste}))
            Assert.Equal(
                "ok",
                if editor {
                    controller.Document.GetText()
                } else {
                    value
                }
            )
        } finally {
            window.Close()
        }
    }

    @Theory
    @InlineData(false, "a😀b", int32(2), int32(3))
    @InlineData(true, "a😀b", int32(2), int32(3))
    @InlineData(false, "aéb", int32(2), int32(3))
    @InlineData(true, "aéb", int32(2), int32(3))
    func AccessibilitySelectionSnapsToGraphemesBeforeCopyAndPaste(
        editor bool,
        content string,
        interior int32,
        end int32
    ) {
        using let controller = TextEditorController(TextDocument(content))
        let handle = ElementHandle()
        var value = content
        let adapter = AccessibilityTestAdapter()
        let window = Window{
            Width: 320,
            Height: 120,
            AccessibilityAdapter: adapter,
            Root: ExplicitKeyBindingTests.BuildCell(
                () -> if editor {
                    cast[Blob](TextEditor(controller){Handle = handle})
                } else {
                    cast[Blob](
                        TextEntry{
                            Handle: handle,
                            Value: value,
                            OnChange: (next string) -> {
                                value = next
                            }
                        }
                    )
                }
            )
        }
        try {
            window.UpdateTree()
            Assert.True(handle.Focus())
            let id = adapter.Tree!!.Root!!.Id
            Assert.True(window.PerformAccessibilityAction(id, AccessibilityActionRequest.SetSelection(interior, 0)))
            var snapshot = window.InputForTest.EditorSnapshot()!!
            Assert.Equal(1, snapshot.SelectionStart)
            Assert.Equal(1, snapshot.SelectionEnd)
            for (start, stop) in[](int32, int32){(1, interior), (interior, end)} {
                for caret in[]int32{start, stop} {
                    Assert.True(
                        window.PerformAccessibilityAction(
                            id,
                            AccessibilityActionRequest.SetSelection(start, stop - start, caret)
                        )
                    )
                    snapshot = window.InputForTest.EditorSnapshot()!!
                    Assert.Equal(
                        if caret == start {
                            end
                        } else {
                            1
                        },
                        snapshot.SelectionStart
                    )
                    Assert.Equal(
                        if caret == start {
                            1
                        } else {
                            end
                        },
                        snapshot.SelectionEnd
                    )
                }
            }
            let input = window.PlatformInput
            Assert.True(input.Execute(TextCommand{Kind: TextCommandKind.Copy}))
            Assert.True(input.Execute(TextCommand{Kind: TextCommandKind.SelectAll}))
            Assert.True(input.Execute(TextCommand{Kind: TextCommandKind.Paste}))
            Assert.Equal(
                content.Substring(1, end - 1),
                if editor {
                    controller.Document.GetText()
                } else {
                    value
                }
            )
        } finally {
            window.Close()
        }
    }

    @Fact
    func PrimitivesRequireBindingsAndEntryCancelRestoresTheFocusValue() {
        let entry = ElementHandle()
        let button = ElementHandle()
        var value = "original"
        var submissions = 0
        var clicks = 0
        let window = Window{
            Width: 320,
            Height: 120,
            Root: ExplicitKeyBindingTests.BuildCell(
                () -> Container{
                    Children: []Blob{
                        TextEntry{
                            Handle: entry,
                            Value: value,
                            Height: 30,
                            OnChange: (next string) -> {
                                value = next
                            },
                            OnSubmit: (_ string) -> submissions++
                        },
                        Button{Handle: button, Height: 30, OnClick: () -> clicks++}
                    }
                }
            )
        }
        try {
            window.UpdateTree()
            Assert.True(entry.Focus())
            let input = window.PlatformInput
            input.Execute(TextCommand{Kind: TextCommandKind.MoveDocumentEnd})
            input.CommitText("X")
            for key in[]Key{Key.Backspace, Key.Enter, Key.Tab, Key.Escape} {
                input.KeyPress(key, default(KeyModifiers))
                input.KeyRelease(key)
            }
            Assert.Equal("originalX", value)
            Assert.Equal(0, submissions)
            Assert.NotNull(input.Editor)
            Assert.True(input.Execute(TextCommand{Kind: TextCommandKind.CancelEdit}))
            Assert.Equal("original", value)
            Assert.Null(input.Editor)
            Assert.True(button.Focus())
            for key in[]Key{Key.Enter, Key.Space} {
                input.KeyPress(key, default(KeyModifiers))
                input.KeyRelease(key)
            }
            Assert.Equal(0, clicks)
            Assert.True(button.Activate())
            Assert.Equal(1, clicks)
        } finally {
            window.Close()
        }
    }

    @Fact
    func ExplicitBindingsRepeatOnAnyPrimitiveAndCleanUpPresses() {
        let handle = ElementHandle()
        let other = ElementHandle()
        var presses = 0
        var releases = 0
        var clicks = 0
        var block = false
        var failRelease = false
        let events = List[string]()
        let window = Window{
            Width: 320,
            Height: 120,
            Root: ExplicitKeyBindingTests.BuildCell(
                () -> Container{
                    OnKeyDown: (e KeyEvent) -> {
                        var e = e
                        events.Add("parent")
                        if block {
                            e.PreventDefault()
                        }
                    },
                    Children: []Blob{
                        Button{
                            Handle: handle,
                            Height: 30,
                            OnClick: () -> clicks++,
                            OnKeyDown: (_ KeyEvent) -> events.Add("button"),
                            OnKeyUp: (_ KeyEvent) -> {
                                if failRelease {
                                    throw InvalidOperationException("release")
                                }
                            },
                            KeyBindings: []KeyBinding{
                                KeyBinding{
                                    Key: Key.H,
                                    Repeat: true,
                                    Action: () -> {
                                        presses++
                                        events.Add("action")
                                    }
                                },
                                KeyBinding{
                                    Key: Key.J,
                                    Modifiers: KeyModifiers{Ctrl: true},
                                    Action: () -> handle.BeginPress(),
                                    OnRelease: () -> {
                                        releases++
                                        handle.EndPress(true)
                                    }
                                }
                            }
                        },
                        Container{Handle: other, Focusable: true, Height: 30}
                    }
                }
            )
        }
        try {
            window.UpdateTree()
            Assert.True(handle.Focus())
            let input = window.PlatformInput
            input.KeyPress(Key.H, default(KeyModifiers))
            Assert.Equal([]string{"button", "parent", "action"}, events)
            window.InputForTest.Step(window.Tree, Resolver(), 0.5)
            Assert.Equal(2, presses)
            input.KeyRelease(Key.H)
            window.InputForTest.Step(window.Tree, Resolver(), 0.5)
            Assert.Equal(2, presses)
            block = true
            input.KeyPress(Key.H, default(KeyModifiers))
            Assert.Equal(2, presses)
            block = false
            input.KeyPress(Key.J, KeyModifiers{Ctrl: true})
            Assert.True(handle.AttachedNode()!!.Pressed)
            input.KeyRelease(Key.J)
            Assert.Equal(1, releases)
            Assert.Equal(1, clicks)
            Assert.False(handle.AttachedNode()!!.Pressed)
            input.KeyPress(Key.J, KeyModifiers{Ctrl: true})
            failRelease = true
            Assert.Throws[InvalidOperationException](() -> input.KeyRelease(Key.J))
            Assert.False(handle.AttachedNode()!!.Pressed)
            failRelease = false
            input.KeyPress(Key.J, KeyModifiers{Ctrl: true})
            Assert.True(other.Focus())
            input.KeyRelease(Key.J)
            Assert.Equal(1, clicks)
            Assert.False(handle.AttachedNode()!!.Pressed)
            Assert.True(handle.Focus())
            input.KeyPress(Key.J, KeyModifiers{Ctrl: true})
            Assert.True(other.Focus())
            Assert.True(handle.Focus())
            input.KeyRelease(Key.J)
            Assert.Equal(1, clicks)
            Assert.False(handle.AttachedNode()!!.Pressed)
            input.KeyPress(Key.H, default(KeyModifiers))
            Assert.True(other.Focus())
            window.InputForTest.Step(window.Tree, Resolver(), 0.5)
            Assert.Equal(3, presses)
            Assert.True(handle.Focus())
            input.KeyPress(Key.J, KeyModifiers{Ctrl: true})
            Assert.True(handle.AttachedNode()!!.Pressed)
            let bounds = other.BorderBox
            input.PointerPress(
                0,
                PointerDevice.Mouse,
                float32(bounds.X) + float32(5.0F),
                float32(bounds.Y) + float32(5.0F),
                PointerButton.Primary,
                default(KeyModifiers),
                0.0F
            )
            Assert.True(other.AttachedNode()!!.Focused)
            Assert.False(handle.AttachedNode()!!.KeyboardPressed)
            Assert.False(handle.AttachedNode()!!.Pressed)
            input.PointerRelease(
                0,
                PointerDevice.Mouse,
                float32(bounds.X) + float32(5.0F),
                float32(bounds.Y) + float32(5.0F),
                PointerButton.Primary,
                default(KeyModifiers),
                0.0F
            )
            input.KeyRelease(Key.J)
            Assert.Equal(1, releases)
        } finally {
            window.Close()
        }
    }

    @Fact
    func MixedIngressKeepsTextAndPointerOrderAndRejectsStaleFocus() {
        let first = ElementHandle()
        let second = ElementHandle()
        var firstValue = ""
        var secondValue = ""
        let window = Window{
            Width: 320,
            Height: 120,
            Root: ExplicitKeyBindingTests.BuildCell(
                () -> Container{
                    Children: []Blob{
                        TextEntry{
                            Handle: first,
                            Value: firstValue,
                            Width: 120,
                            Height: 30,
                            OnChange: (value string) -> {
                                firstValue = value
                            }
                        },
                        TextEntry{
                            Handle: second,
                            Value: secondValue,
                            Width: 120,
                            Height: 30,
                            OnChange: (value string) -> {
                                secondValue = value
                            }
                        }
                    }
                }
            )
        }
        try {
            window.UpdateTree()
            Assert.True(first.Focus())
            let bounds = second.BorderBox
            let queued = window.InputForTest
            queued.QueueText("before")
            queued.QueuePointerPress(float32(bounds.X) + float32(5.0), float32(bounds.Y) + float32(5.0))
            queued.QueuePointerRelease(float32(bounds.X) + float32(5.0), float32(bounds.Y) + float32(5.0))
            queued.QueueText("after")
            window.PlatformInput.KeyRelease(Key.Unknown)
            Assert.Equal("before", firstValue)
            Assert.Equal("after", secondValue)
            queued.QueueText("stale")
            Assert.True(first.Focus())
            window.PlatformInput.KeyRelease(Key.Unknown)
            Assert.Equal("before", firstValue)
            Assert.Equal("after", secondValue)
        } finally {
            window.Close()
        }
    }

    @Fact
    func NestedInjectedInputRunsOnceAndKeepsOuterCancellation() {
        let handle = ElementHandle()
        let events = List[string]()
        var actions = 0
        var downs = 0
        var cancels = 0
        var releaseModifiers = default(KeyModifiers)
        var window Window? = nil
        window = Window{
            Width: 160,
            Height: 80,
            Root: ExplicitKeyBindingTests.BuildCell(
                () -> Button{
                    Handle: handle,
                    Width: 100,
                    Height: 40,
                    OnKeyDown: (e KeyEvent) -> {
                        var e = e
                        events.Add(e.Key.ToString())
                        if e.Key == Key.A {
                            window!!.PlatformInput.KeyPress(Key.B, default(KeyModifiers))
                            e.PreventDefault()
                        }
                        if e.Key == Key.C && e.Repeat {
                            events.Add("repeat-start")
                            window!!.PlatformInput.KeyPress(Key.B, default(KeyModifiers))
                            window!!.PlatformInput.KeyRelease(Key.C)
                            events.Add("repeat-end")
                        }
                    },
                    OnKeyUp: (e KeyEvent) -> {
                        var e = e
                        releaseModifiers = e.Modifiers
                        if e.Key == Key.C {
                            events.Add("up:C")
                        }
                    },
                    KeyBindings: []KeyBinding{
                        KeyBinding{Key: Key.A, Action: () -> actions++},
                        KeyBinding{Key: Key.C, Repeat: true, Action: () -> { }}
                    },
                    OnPointerDown: (e PointerEvent) -> {
                        var e = e
                        downs++
                        e.Capture()
                        window!!.PlatformInput.PointerCancel(0, PointerDevice.Mouse)
                    },
                    OnPointerCancel: (_ PointerEvent) -> cancels++,
                    OnClick: () -> actions++
                }
            )
        }
        try {
            window.UpdateTree()
            Assert.True(handle.Focus())
            let input = window.PlatformInput
            input.KeyPress(Key.A, default(KeyModifiers))
            Assert.Equal([]string{"A", "B"}, events)
            Assert.Equal(0, actions)
            input.KeyRelease(Key.A, KeyModifiers{Shift: true})
            Assert.True(releaseModifiers.Shift)
            input.KeyPress(Key.C, default(KeyModifiers))
            events.Clear()
            window.InputForTest.Step(window.Tree, Resolver(), 0.5)
            Assert.Equal([]string{"C", "repeat-start", "repeat-end", "B", "up:C"}, events)
            window.InputForTest.Step(window.Tree, Resolver(), 0.5)
            Assert.Equal(5, events.Count)
            events.Clear()
            window.InputForTest.QueueKeyPress(Key.C, default(KeyModifiers))
            window.InputForTest.FocusLost(window.Tree, Resolver())
            window.InputForTest.FocusGained()
            window.InputForTest.QueueKeyPress(Key.D, default(KeyModifiers))
            input.KeyRelease(Key.Unknown)
            Assert.Equal([]string{"C", "D"}, events)
            input.PointerPress(0, PointerDevice.Mouse, 10.0F, 10.0F, PointerButton.Primary, default(KeyModifiers), 0.0F)
            Assert.Equal(1, downs)
            Assert.Equal(1, cancels)
            input.PointerRelease(
                0,
                PointerDevice.Mouse,
                10.0F,
                10.0F,
                PointerButton.Primary,
                default(KeyModifiers),
                0.0F
            )
            Assert.Equal(0, actions)
            Assert.False(handle.AttachedNode()!!.Pressed)
        } finally {
            window.Close()
        }
    }

    @Fact
    func NestedFocusKeepsOuterControlAndBlurFailureStillReleasesPointer() {
        let first = ElementHandle()
        let second = ElementHandle()
        var outer = default(FocusEvent)
        var parents = 0
        var failBlur = false
        var cancels = 0
        let window = Window{
            Width: 320,
            Height: 120,
            Root: ExplicitKeyBindingTests.BuildCell(
                () -> Container{
                    OnFocus: (_ FocusEvent) -> parents++,
                    Children: []Blob{
                        Button{
                            Handle: first,
                            Width: 100,
                            Height: 30,
                            OnFocus: (e FocusEvent) -> {
                                outer = e
                                second.Focus()
                            }
                        },
                        Button{
                            Handle: second,
                            Width: 100,
                            Height: 30,
                            OnFocus: (_ FocusEvent) -> outer.StopPropagation(),
                            OnBlur: (_ FocusEvent) -> {
                                if failBlur {
                                    throw InvalidOperationException("blur")
                                }
                            },
                            OnPointerDown: (e PointerEvent) -> e.Capture(),
                            OnPointerCancel: (_ PointerEvent) -> cancels++
                        }
                    }
                }
            )
        }
        try {
            window.UpdateTree()
            Assert.False(first.Focus())
            Assert.True(second.AttachedNode()!!.Focused)
            Assert.Equal(1, parents)
            let bounds = second.BorderBox
            let input = window.PlatformInput
            input.PointerPress(
                0,
                PointerDevice.Mouse,
                float32(bounds.X) + float32(5.0F),
                float32(bounds.Y) + float32(5.0F),
                PointerButton.Primary,
                default(KeyModifiers),
                0.0F
            )
            failBlur = true
            Assert.Throws[InvalidOperationException](() -> input.FocusLost())
            Assert.Equal(1, cancels)
            Assert.False(second.AttachedNode()!!.Pressed)
            Assert.False(second.AttachedNode()!!.Focused)
            failBlur = false
            input.PointerRelease(
                0,
                PointerDevice.Mouse,
                float32(bounds.X) + float32(5.0F),
                float32(bounds.Y) + float32(5.0F),
                PointerButton.Primary,
                default(KeyModifiers),
                0.0F
            )
        } finally {
            window.Close()
        }
    }

    @Fact
    func SharedCommandGuardsEveryActivationAndRebuildsDisabledSemantics() {
        let handle = ElementHandle()
        var enabled = true
        var calls = 0
        let command = Command(() -> calls++, () -> enabled)
        let adapter = AccessibilityTestAdapter()
        let cell = ExplicitKeyBindingTests.BuildCell(
            () -> Button{
                Handle: handle,
                Width: 100,
                Height: 40,
                Command: command,
                KeyBindings: []KeyBinding{KeyBinding{Key: Key.Enter, Command: command}}
            }
        )
        let window = Window{Width: 160, Height: 80, Root: cell, AccessibilityAdapter: adapter}
        try {
            window.UpdateTree()
            Assert.True(handle.Focus())
            let input = window.PlatformInput
            input.KeyPress(Key.Enter, default(KeyModifiers))
            input.KeyRelease(Key.Enter)
            Assert.Equal(1, calls)
            enabled = false
            Assert.False(handle.Activate())
            Assert.False(
                window.PerformAccessibilityAction(
                    adapter.Tree!!.Root!!.Id,
                    AccessibilityActionRequest(AccessibilityAction.Activate)
                )
            )
            input.KeyPress(Key.Enter, default(KeyModifiers))
            input.KeyRelease(Key.Enter)
            input.PointerPress(0, PointerDevice.Mouse, 10.0F, 10.0F, PointerButton.Primary, default(KeyModifiers), 0.0F)
            input.PointerRelease(
                0,
                PointerDevice.Mouse,
                10.0F,
                10.0F,
                PointerButton.Primary,
                default(KeyModifiers),
                0.0F
            )
            Assert.Equal(1, calls)
            cell.Rebuild()
            window.UpdateTree()
            Assert.True(handle.AttachedNode()!!.Disabled)
            enabled = true
            cell.Rebuild()
            window.UpdateTree()
            Assert.False(handle.AttachedNode()!!.Disabled)
            Assert.True(
                window.PerformAccessibilityAction(
                    adapter.Tree!!.Root!!.Id,
                    AccessibilityActionRequest(AccessibilityAction.Activate)
                )
            )
            Assert.Equal(2, calls)
        } finally {
            window.Close()
        }
    }

    private class BuildCell(build() -> Blob) : Cell {
        override func Build() Blob -> build()
    }
}
