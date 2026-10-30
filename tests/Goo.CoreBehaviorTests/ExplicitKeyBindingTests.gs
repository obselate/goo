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
    func TextEditingIsBuiltInAndButtonActivationRequiresBindings() {
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
            Assert.Equal("original", value)
            Assert.Equal(1, submissions)
            Assert.Null(input.Editor)
            Assert.True(entry.Focus())
            input.CommitText("X")
            input.KeyPress(Key.Escape, default(KeyModifiers))
            input.KeyRelease(Key.Escape)
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

    @Theory
    @InlineData(false, false, false)
    @InlineData(false, true, false)
    @InlineData(true, false, false)
    @InlineData(true, true, false)
    @InlineData(false, false, true)
    @InlineData(false, true, true)
    @InlineData(true, false, true)
    @InlineData(true, true, true)
    func DefaultEditingKeysPrecedeRootBindings(editor bool, legacyBindings bool, mac bool) {
        let saved = InputPolicy.Mac
        InputPolicy.Mac = mac
        using let controller = TextEditorController(TextDocument("abcd"))
        let field = ElementHandle()
        let button = ElementHandle()
        var value = "abcd"
        var submissions = 0
        var rootActions = 0
        var window Window?
        let primary = KeyModifiers{Ctrl: !mac, Super: mac}
        let primaryShift = KeyModifiers{Ctrl: !mac, Super: mac, Shift: true}
        window = Window{
            Width: 320,
            Height: 160,
            Root: ExplicitKeyBindingTests.BuildCell(
                () -> Container{
                    KeyBindings: if legacyBindings {
                        ExplicitKeyBindingTests.EditingBindings(window!!.PlatformInput, () -> rootActions++)
                    } else {
                        []KeyBinding{KeyBinding{Key: Key.A, Modifiers: primary, Action: () -> rootActions++}}
                    },
                    Children: []Blob{
                        if editor {
                            cast[Blob](TextEditor(controller){Handle = field, Height = 60})
                        } else {
                            cast[Blob](TextEntry{
                                Handle: field,
                                Value: value,
                                Height: 30,
                                OnChange: (next string) -> { value = next },
                                OnSubmit: (_ string) -> submissions++
                            })
                        },
                        Button{Handle: button, Height: 30}
                    }
                }
            )
        }
        try {
            window.UpdateTree()
            Assert.True(field.Focus())
            let input = window.PlatformInput
            input.SetSelection(4, 4)
            ExplicitKeyBindingTests.Press(input, Key.Backspace)
            Assert.Equal("abc", input.Editor!!.Text)
            ExplicitKeyBindingTests.Press(input, Key.Home)
            ExplicitKeyBindingTests.Press(input, Key.Delete)
            Assert.Equal("bc", input.Editor!!.Text)
            ExplicitKeyBindingTests.Press(input, Key.Right)
            Assert.Equal(1, input.Editor!!.SelectionEnd)
            ExplicitKeyBindingTests.Press(input, Key.Right, KeyModifiers{Shift: true})
            Assert.Equal(1, input.Editor!!.SelectionStart)
            Assert.Equal(2, input.Editor!!.SelectionEnd)
            ExplicitKeyBindingTests.Press(input, Key.Left)
            Assert.Equal(1, input.Editor!!.SelectionEnd)
            ExplicitKeyBindingTests.Press(input, Key.A, primary)
            Assert.Equal(0, input.Editor!!.SelectionStart)
            Assert.Equal(2, input.Editor!!.SelectionEnd)
            ExplicitKeyBindingTests.Press(input, Key.C, primary)
            ExplicitKeyBindingTests.Press(input, Key.End)
            ExplicitKeyBindingTests.Press(input, Key.V, primary)
            Assert.Equal("bcbc", input.Editor!!.Text)
            ExplicitKeyBindingTests.Press(input, Key.Z, primary)
            Assert.Equal("bc", input.Editor!!.Text)
            ExplicitKeyBindingTests.Press(input, Key.Z, primaryShift)
            Assert.Equal("bcbc", input.Editor!!.Text)
            ExplicitKeyBindingTests.Press(input, Key.A, primary)
            ExplicitKeyBindingTests.Press(input, Key.X, primary)
            Assert.Equal("", input.Editor!!.Text)
            ExplicitKeyBindingTests.Press(input, Key.Z, primary)
            Assert.Equal("bcbc", input.Editor!!.Text)
            ExplicitKeyBindingTests.Press(input, Key.Y, KeyModifiers{Ctrl: true})
            Assert.Equal("", input.Editor!!.Text)
            ExplicitKeyBindingTests.Press(input, Key.V, primary)
            ExplicitKeyBindingTests.Press(input, Key.Enter)
            Assert.Equal(editor ? "bcbc\n" : "bcbc", input.Editor!!.Text)
            Assert.Equal(editor ? 0 : 1, submissions)
            ExplicitKeyBindingTests.Press(input, Key.KeypadEnter, KeyModifiers{Shift: true})
            Assert.Equal(editor ? "bcbc\n\n" : "bcbc", input.Editor!!.Text)
            Assert.Equal(editor ? 0 : 2, submissions)
            ExplicitKeyBindingTests.Press(input, Key.Tab)
            if editor {
                Assert.Equal("bcbc\n\n\t", input.Editor!!.Text)
                ExplicitKeyBindingTests.Press(input, Key.Tab, KeyModifiers{Shift: true})
                Assert.Equal("bcbc\n\n", input.Editor!!.Text)
            } else {
                Assert.Null(input.Editor)
                Assert.True(button.AttachedNode()!!.Focused)
                ExplicitKeyBindingTests.Press(input, Key.Tab, KeyModifiers{Shift: true})
                Assert.NotNull(input.Editor)
            }
            let before = input.Editor!!.Text
            window.InputForTest.QueueComposition("preedit", 0, 0)
            input.KeyRelease(Key.Unknown)
            Assert.True(input.Editor!!.CompositionStart >= 0)
            ExplicitKeyBindingTests.Press(input, Key.Escape)
            Assert.Equal(before, input.Editor!!.Text)
            Assert.Equal(-1, input.Editor!!.CompositionStart)
            ExplicitKeyBindingTests.Press(input, Key.Escape)
            if editor {
                Assert.Equal(before, input.Editor!!.Text)
            } else {
                Assert.Equal(before, value)
                Assert.Null(input.Editor)
            }
            Assert.Equal(legacyBindings && !editor ? 1 : 0, rootActions)
            rootActions = 0
            Assert.True(button.Focus())
            ExplicitKeyBindingTests.Press(input, Key.A, primary)
            Assert.Equal(1, rootActions)
            input.ClearFocus()
            ExplicitKeyBindingTests.Press(input, Key.Tab)
            Assert.True(field.AttachedNode()!!.Focused)
        } finally {
            window.Close()
            InputPolicy.Mac = saved
        }
    }

    @Fact
    func FieldBindingsAndPreventDefaultOverrideEditingAndOnlyEditingMotionRepeats() {
        let field = ElementHandle()
        var value = "abcd"
        var overrideCalls = 0
        var prevent = true
        let primary = KeyModifiers{Ctrl: !InputPolicy.Mac, Super: InputPolicy.Mac}
        let window = Window{
            Width: 320,
            Height: 120,
            Root: ExplicitKeyBindingTests.BuildCell(
                () -> TextEntry{
                    Handle: field,
                    Value: value,
                    OnChange: (next string) -> { value = next },
                    OnKeyDown: (e KeyEvent) -> {
                        if prevent { e.PreventDefault() }
                    },
                    KeyBindings: []KeyBinding{
                        KeyBinding{Key: Key.A, Modifiers: primary, Action: () -> overrideCalls++}
                    }
                }
            )
        }
        try {
            window.UpdateTree()
            Assert.True(field.Focus())
            let input = window.PlatformInput
            input.SetSelection(4, 4)
            ExplicitKeyBindingTests.Press(input, Key.Backspace)
            ExplicitKeyBindingTests.Press(input, Key.A, primary)
            Assert.Equal("abcd", value)
            Assert.Equal(0, overrideCalls)
            prevent = false
            ExplicitKeyBindingTests.Press(input, Key.A, primary)
            Assert.Equal(1, overrideCalls)
            Assert.Equal(4, input.Editor!!.SelectionStart)
            input.KeyPress(Key.Backspace, default(KeyModifiers))
            window.InputForTest.Step(window.Tree, Resolver(), 0.5)
            Assert.Equal("ab", value)
            input.KeyRelease(Key.Backspace)
            input.KeyPress(Key.Left, default(KeyModifiers))
            window.InputForTest.Step(window.Tree, Resolver(), 0.5)
            Assert.Equal(0, input.Editor!!.SelectionEnd)
            input.KeyRelease(Key.Left)
            input.KeyPress(Key.Delete, default(KeyModifiers))
            window.InputForTest.Step(window.Tree, Resolver(), 0.5)
            Assert.Equal("", value)
            input.KeyRelease(Key.Delete)
            window.InputForTest.SetClipboardFallback("x")
            input.KeyPress(Key.V, primary)
            window.InputForTest.Step(window.Tree, Resolver(), 0.5)
            Assert.Equal("x", value)
            input.KeyRelease(Key.V)
            input.KeyPress(Key.Z, primary)
            window.InputForTest.Step(window.Tree, Resolver(), 0.5)
            Assert.Equal("", value)
            input.KeyRelease(Key.Z)
            input.KeyPress(Key.Z, KeyModifiers{Ctrl: primary.Ctrl, Super: primary.Super, Shift: true})
            window.InputForTest.Step(window.Tree, Resolver(), 0.5)
            Assert.Equal("x", value)
            input.KeyRelease(Key.Z)
        } finally {
            window.Close()
        }
    }

    shared {
    private func Press(input PlatformInput, key Key, modifiers KeyModifiers = default(KeyModifiers)) {
        input.KeyPress(key, modifiers)
        input.KeyRelease(key, modifiers)
    }

    private func EditingBindings(input PlatformInput, action() -> void) []KeyBinding {
        let result = List[KeyBinding]()
        for shift in []bool{false, true} {
            let plain = KeyModifiers{Shift: shift}
            let primary = KeyModifiers{Shift: shift, Ctrl: !InputPolicy.Mac, Super: InputPolicy.Mac}
            let word = KeyModifiers{Shift: shift, Ctrl: !InputPolicy.Mac, Alt: InputPolicy.Mac}
            for (key, kind, modifiers, repeat) in [](Key, TextCommandKind, KeyModifiers, bool){
                (Key.Left, TextCommandKind.MoveLeft, plain, true),
                (Key.Right, TextCommandKind.MoveRight, plain, true),
                (Key.Up, TextCommandKind.MoveUp, plain, true),
                (Key.Down, TextCommandKind.MoveDown, plain, true),
                (Key.PageUp, TextCommandKind.PageUp, plain, true),
                (Key.PageDown, TextCommandKind.PageDown, plain, true),
                (Key.Home, TextCommandKind.MoveLineStart, plain, true),
                (Key.End, TextCommandKind.MoveLineEnd, plain, true),
                (Key.Home, TextCommandKind.MoveDocumentStart, primary, true),
                (Key.End, TextCommandKind.MoveDocumentEnd, primary, true),
                (Key.Backspace, TextCommandKind.DeleteBackward, plain, true),
                (Key.Delete, TextCommandKind.DeleteForward, plain, true),
                (Key.Left, TextCommandKind.MoveWordLeft, word, true),
                (Key.Right, TextCommandKind.MoveWordRight, word, true),
                (Key.Backspace, TextCommandKind.DeleteWordBackward, word, true),
                (Key.Delete, TextCommandKind.DeleteWordForward, word, true),
                (Key.A, TextCommandKind.SelectAll, primary, false),
                (Key.C, TextCommandKind.Copy, primary, false),
                (Key.X, TextCommandKind.Cut, primary, false),
                (Key.V, TextCommandKind.Paste, primary, false),
                (Key.Z, shift ? TextCommandKind.Redo : TextCommandKind.Undo, primary, false)
            } {
                result.Add(KeyBinding{Key: key, Modifiers: modifiers, Repeat: repeat, Action: () -> {
                    action()
                    input.Execute(TextCommand{Kind: kind, ExtendSelection: modifiers.Shift})
                }})
            }
            result.Add(KeyBinding{Key: Key.Tab, Modifiers: plain, Action: () -> {
                action()
                if input.Editor?.IsMultiline == true && input.Editor?.IsReadOnly == false {
                    input.Execute(TextCommand{Kind: shift ? TextCommandKind.Outdent : TextCommandKind.InsertTab})
                } else { input.MoveFocus(!shift) }
            }})
            for key in []Key{Key.Enter, Key.KeypadEnter} {
                result.Add(KeyBinding{Key: key, Modifiers: plain, Action: () -> {
                    action()
                    input.Execute(TextCommand{
                        Kind: input.Editor?.IsMultiline == true && input.Editor?.IsReadOnly == false
                            ? TextCommandKind.Insert : TextCommandKind.Submit,
                        Text: "\n"
                    })
                }})
            }
        }
        result.Add(KeyBinding{Key: Key.Y, Modifiers: KeyModifiers{Ctrl: true}, Action: () -> {
            action()
            input.Execute(TextCommand{Kind: TextCommandKind.Redo})
        }})
        result.Add(KeyBinding{Key: Key.Escape, Action: () -> {
            action()
            if !input.CancelDrag() && !input.CancelComposition() {
                input.Execute(TextCommand{Kind: TextCommandKind.CancelEdit})
            }
        }})
        return result.ToArray()
    }
    }

    private class BuildCell(build() -> Blob) : Cell {
        override func Build() Blob -> build()
    }
}
