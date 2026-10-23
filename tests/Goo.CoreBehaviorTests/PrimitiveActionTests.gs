package Goo.CoreBehaviorTests

import Goo
import System
import System.Collections.Generic
import Xunit

class PrimitiveActionTests {
    @Fact
    func SelectionCommandsAndMouseGesturesUseTheSameUnits() {
        const value = "foo_bar  !! é🙂\r\nsecond line"
        using let controller = TextEditorController(TextDocument(value))
        let editor = ElementHandle()
        let entry = ElementHandle()
        let window = Window{
            Width: 420,
            Height: 180,
            Root: PrimitiveActionTests.BuildCell(
                () -> Container{
                    Children: []Blob{
                        TextEditor(controller){Handle = editor, Height = 100, FontFamily = "monospace", FontSize = 16},
                        TextEntry{
                            Handle: entry,
                            Value: "foo_bar  !!",
                            Height: 40,
                            FontFamily: "monospace",
                            FontSize: 16
                        }
                    }
                }
            )
        }
        try {
            window.UpdateTree()
            Assert.True(editor.Focus())
            let input = window.PlatformInput
            Assert.True(input.Execute(TextCommand{Kind: TextCommandKind.SelectWord, Position: Position(2)}))
            Assert.Equal("foo_bar", controller.Copy())
            controller.OnCommand = (e TextCommandEvent) -> {
                e.Cancel = e.Command.Kind == TextCommandKind.SelectWord
            }
            Assert.False(input.Execute(TextCommand{Kind: TextCommandKind.SelectWord, Position: Position(10)}))
            Assert.Equal("foo_bar", controller.Copy())
            controller.OnCommand = nil
            Click(window, editor, 7, 2, 0.0, dx: -1)
            Assert.Equal("foo_bar", controller.Copy())
            Click(window, editor, 8, 2, 1.0)
            Assert.Equal("  ", controller.Copy())
            Click(window, editor, 10, 2, 2.0)
            Assert.Equal("!!", controller.Copy())
            Click(window, editor, 12, 2, 3.0)
            Assert.Equal("é", controller.Copy())
            Click(window, editor, 14, 2, 4.0)
            Assert.Equal("🙂", controller.Copy())
            Click(window, editor, 2, 3, 5.0)
            Assert.Equal("foo_bar  !! é🙂\r\n", controller.Copy())
            Click(window, editor, 2, 2, 6.0, releaseLast: false)
            Move(window, PointAt(editor, 10), 6.2)
            Assert.Equal("foo_bar  !!", controller.Copy())
            Move(window, PointAt(editor, 3), 6.3)
            Assert.Equal("foo_bar", controller.Copy())
            Release(window, PointAt(editor, 3), 6.4)
            Assert.True(entry.Focus())
            Click(window, entry, 7, 2, 7.0, dx: -1)
            Assert.Equal(0, input.Editor!!.SelectionStart)
            Assert.Equal(7, input.Editor!!.SelectionEnd)
            Click(window, entry, 2, 2, 8.0, releaseLast: false)
            Move(window, PointAt(entry, 2, 0.1), 8.15)
            Assert.Equal(0, input.Editor!!.SelectionStart)
            Assert.Equal(7, input.Editor!!.SelectionEnd)
            Move(window, PointAt(entry, 10), 8.2)
            Assert.Equal(11, input.Editor!!.SelectionEnd)
            Release(window, PointAt(entry, 10), 8.3)
            Click(window, entry, 2, 3, 9.0)
            Assert.Equal(0, input.Editor!!.SelectionStart)
            Assert.Equal(11, input.Editor!!.SelectionEnd)
            Assert.True(input.Execute(TextCommand{Kind: TextCommandKind.SelectWord, Position: Position(10)}))
            Assert.Equal(9, input.Editor!!.SelectionStart)
            Assert.Equal(11, input.Editor!!.SelectionEnd)
        } finally {
            window.Close()
        }
    }

    @Fact
    func ExplicitTabBindingPreservesIndentationUndoAndSourceGeometry() {
        using let controller = TextEditorController(TextDocument(`ab
cd
ef`))
        let handle = ElementHandle()
        let window = Window{
            Width: 420,
            Height: 160,
            Root: PrimitiveActionTests.BuildCell(
                () -> TextEditor(controller){
                    Handle = handle,
                    FontFamily = "monospace",
                    FontSize = 16,
                    KeyBindings = []KeyBinding{
                        KeyBinding{
                            Key: Key.Tab,
                            Action: () -> controller.Execute(TextCommand{Kind: TextCommandKind.InsertTab})
                        },
                        KeyBinding{
                            Key: Key.Tab,
                            Modifiers: KeyModifiers{Shift: true},
                            Action: () -> controller.Execute(TextCommand{Kind: TextCommandKind.Outdent})
                        }
                    }
                }
            )
        }
        try {
            window.UpdateTree()
            Assert.True(handle.Focus())
            controller.Selection = TextSelection{Anchor: Position(1), Active: Position(1)}
            window.PlatformInput.KeyPress(Key.Tab, default(KeyModifiers))
            window.PlatformInput.KeyRelease(Key.Tab)
            Assert.Equal(`a	b
cd
ef`, controller.Document.GetText())
            Assert.Equal(2, controller.Selection.Active.Offset)
            window.UpdateTree()
            let start = Caret(handle, 0)
            let before = Caret(handle, 1)
            let after = Caret(handle, 2)
            let expected = TextShaping.MeasureLineUncached("a   ", 0, 4, "monospace", 16.0F, 400, false, 0.0F, 0)
            Assert.InRange(after.X - start.X, float64(expected) - 0.2, float64(expected) + 0.2)
            Assert.True(
                handle.TryGetTextPositionAt(
                    Point{X: (before.X + after.X) / float64(2.0), Y: before.Y + float64(2.0)},
                    TextCoordinateSpace.Window,
                    out var hit
                )
            )
            Assert.Contains(hit.Offset, []int32{1, 2})
            controller.Execute(TextCommand{Kind: TextCommandKind.MoveLeft})
            Assert.Equal(1, controller.Selection.Active.Offset)
            controller.Execute(TextCommand{Kind: TextCommandKind.MoveRight})
            Assert.Equal(2, controller.Selection.Active.Offset)
            controller.Execute(TextCommand{Kind: TextCommandKind.Undo})
            Assert.Equal(`ab
cd
ef`, controller.Document.GetText())
            controller.Selection = TextSelection{Anchor: Position(6), Active: Position(0)}
            window.PlatformInput.KeyPress(Key.Tab, default(KeyModifiers))
            window.PlatformInput.KeyRelease(Key.Tab)
            Assert.Equal(`	ab
	cd
ef`, controller.Document.GetText())
            window.PlatformInput.KeyPress(Key.Tab, KeyModifiers{Shift: true})
            window.PlatformInput.KeyRelease(Key.Tab)
            Assert.Equal(`ab
cd
ef`, controller.Document.GetText())
            controller.Execute(TextCommand{Kind: TextCommandKind.Undo})
            Assert.Equal(`	ab
	cd
ef`, controller.Document.GetText())
            controller.Execute(TextCommand{Kind: TextCommandKind.Undo})
            Assert.Equal(`ab
cd
ef`, controller.Document.GetText())
        } finally {
            window.Close()
        }
    }

    @Fact
    func EditorIndentationSettingsControlCommandsAndTabGeometry() {
        using let controller = TextEditorController(TextDocument(`a	b
  	cd
ef`)){UseTabs = false, IndentWidth = 2, TabWidth = 8}
        let handle = ElementHandle()
        let window = Window{
            Width: 420,
            Height: 160,
            Root: PrimitiveActionTests.BuildCell(
                () -> TextEditor(controller){
                    Handle = handle,
                    FontFamily = "monospace",
                    FontSize = 16,
                    KeyBindings = []KeyBinding{
                        KeyBinding{
                            Key: Key.Tab,
                            Action: () -> controller.Execute(TextCommand{Kind: TextCommandKind.InsertTab})
                        },
                        KeyBinding{
                            Key: Key.Tab,
                            Modifiers: KeyModifiers{Shift: true},
                            Action: () -> controller.Execute(TextCommand{Kind: TextCommandKind.Outdent})
                        }
                    }
                }
            )
        }
        try {
            window.UpdateTree()
            Assert.True(handle.Focus())
            controller.Selection = TextSelection{Anchor: Position(1), Active: Position(1)}
            window.PlatformInput.KeyPress(Key.Tab, default(KeyModifiers))
            window.PlatformInput.KeyRelease(Key.Tab)
            Assert.Equal(`a 	b
  	cd
ef`, controller.Document.GetText())
            Assert.Equal(2, controller.Selection.Active.Offset)
            window.UpdateTree()
            let wide = Caret(handle, 3).X - Caret(handle, 0).X
            let expectedWide = TextShaping.MeasureLineUncached(
                "a       ",
                0,
                8,
                "monospace",
                16.0F,
                400,
                false,
                0.0F,
                0
            )
            Assert.InRange(wide, float64(expectedWide) - 0.2, float64(expectedWide) + 0.2)
            controller.TabWidth = 4
            window.UpdateTree()
            let narrow = Caret(handle, 3).X - Caret(handle, 0).X
            let expectedNarrow = TextShaping.MeasureLineUncached("a   ", 0, 4, "monospace", 16.0F, 400, false, 0.0F, 0)
            Assert.InRange(narrow, float64(expectedNarrow) - 0.2, float64(expectedNarrow) + 0.2)
            Assert.True(
                handle.TryGetTextPositionAt(
                    Point{
                        X: (Caret(handle, 2).X + Caret(handle, 3).X) / float64(2.0),
                        Y: Caret(handle, 2).Y + float64(2.0)
                    },
                    TextCoordinateSpace.Window,
                    out var hit
                )
            )
            Assert.Contains(hit.Offset, []int32{2, 3})
            controller.Execute(TextCommand{Kind: TextCommandKind.Undo})
            Assert.Equal(`a	b
  	cd
ef`, controller.Document.GetText())
            controller.Selection = TextSelection{Anchor: Position(10), Active: Position(0)}
            controller.Execute(TextCommand{Kind: TextCommandKind.Indent})
            Assert.Equal(`  a	b
    	cd
ef`, controller.Document.GetText())
            Assert.True(controller.Selection.Anchor.Offset > controller.Selection.Active.Offset)
            controller.Execute(TextCommand{Kind: TextCommandKind.Outdent})
            Assert.Equal(`a	b
  	cd
ef`, controller.Document.GetText())
            controller.Execute(TextCommand{Kind: TextCommandKind.Undo})
            Assert.Equal(`  a	b
    	cd
ef`, controller.Document.GetText())
            controller.Execute(TextCommand{Kind: TextCommandKind.Redo})
            Assert.Equal(`a	b
  	cd
ef`, controller.Document.GetText())
            controller.Selection = TextSelection{Anchor: Position(4), Active: Position(9)}
            controller.Execute(TextCommand{Kind: TextCommandKind.Outdent})
            Assert.Equal(`a	b
	cd
ef`, controller.Document.GetText())
            controller.OnCommand = (e TextCommandEvent) -> {
                e.Cancel = e.Command.Kind == TextCommandKind.InsertTab
            }
            controller.Selection = TextSelection{Anchor: Position(0), Active: Position(0)}
            Assert.False(controller.Execute(TextCommand{Kind: TextCommandKind.InsertTab}))
            Assert.Equal(`a	b
	cd
ef`, controller.Document.GetText())
        } finally {
            window.Close()
        }
    }

    @Fact
    func BoundDragActionsNegotiateDropAndCleanUpWithoutPointerCapture() {
        let source = ElementHandle()
        let target = ElementHandle()
        let events = List[string]()
        var reject = false
        var fail = false
        var disabled = false
        var reenterDrop = true
        var reenterQuery = true
        var nestedUpdate = true
        var nestedQueryDrop = true
        var nestedDrop = true
        var nestedCancel = true
        var window Window? = nil
        let cell = PrimitiveActionTests.BuildCell(
            () -> Container{
                KeyBindings: []KeyBinding{
                    KeyBinding{Key: Key.G, Action: () -> window!!.PlatformInput.BeginDrag(source)},
                    KeyBinding{Key: Key.T, Action: () -> window!!.PlatformInput.UpdateDrag(target)},
                    KeyBinding{Key: Key.Enter, Action: () -> window!!.PlatformInput.DropDrag()}
                },
                Children: []Blob{
                    Container{
                        Handle: source,
                        Focusable: true,
                        Width: 40,
                        Height: 40,
                        DragSource: DragSource(
                            (e DragStartEvent) -> {
                                var e = e
                                Assert.False(e.IsPointer)
                                events.Add("start")
                                return DragData("value", DragEffect.Copy | DragEffect.Move)
                            },
                            (e DragEndEvent) -> events.Add("end:" + e.Kind.ToString())
                        )
                    },
                    Container{
                        Handle: target,
                        Width: 80,
                        Height: 40,
                        Disabled: disabled,
                        DropTarget: DropTarget(
                            (e DragEvent) -> {
                                var e = e
                                Assert.False(e.IsPointer)
                                if fail {
                                    throw InvalidOperationException("query")
                                }
                                if reenterQuery {
                                    reenterQuery = false
                                    nestedUpdate = window!!.PlatformInput.UpdateDrag(target)
                                    nestedQueryDrop = window!!.PlatformInput.DropDrag()
                                }
                                return if reject {
                                    DragEffect.None
                                } else {
                                    (
                                        if e.Modifiers.Ctrl {
                                            DragEffect.Copy
                                        } else {
                                            DragEffect.Move
                                        }
                                    )
                                }
                            },
                            (e DragEvent) -> {
                                var e = e
                                if e.Kind != DragEventKind.Move {
                                    events.Add(e.Kind.ToString() + ":" + e.Effect.ToString())
                                }
                                if e.Kind == DragEventKind.Drop && reenterDrop {
                                    reenterDrop = false
                                    nestedDrop = window!!.PlatformInput.DropDrag()
                                    nestedCancel = window!!.PlatformInput.CancelDrag()
                                }
                            }
                        )
                    }
                }
            }
        )
        window = Window{Width: 320, Height: 160, Root: cell}
        try {
            window.UpdateTree()
            Assert.True(source.Focus())
            let input = window.PlatformInput
            input.KeyPress(Key.G, default(KeyModifiers))
            input.KeyRelease(Key.G)
            input.KeyPress(Key.T, default(KeyModifiers))
            input.KeyRelease(Key.T)
            Assert.False(source.AttachedNode()!!.Pressed)
            input.KeyPress(Key.Enter, default(KeyModifiers))
            input.KeyRelease(Key.Enter)
            Assert.Equal([]string{"start", "Enter:Move", "Drop:Move", "end:Dropped"}, events)
            Assert.False(nestedDrop)
            Assert.False(nestedCancel)
            Assert.False(nestedUpdate)
            Assert.False(nestedQueryDrop)
            Assert.False(input.CancelDrag())
            Assert.True(input.BeginDrag(source))
            Assert.True(input.UpdateDrag(target))
            Assert.True(input.CancelDrag())
            Assert.Equal("end:Canceled", events[^1])
            reject = true
            Assert.True(input.BeginDrag(source))
            Assert.False(input.UpdateDrag(target))
            Assert.False(input.DropDrag())
            Assert.False(input.CancelDrag())
            reject = false
            Assert.True(input.BeginDrag(source))
            fail = true
            Assert.Throws[InvalidOperationException](() -> input.UpdateDrag(target))
            Assert.False(input.CancelDrag())
            fail = false
            Assert.True(input.BeginDrag(source))
            Assert.True(input.UpdateDrag(target))
            disabled = true
            cell.Rebuild()
            window.UpdateTree()
            Assert.False(input.DropDrag())
            Assert.Equal("end:Canceled", events[^1])
            Assert.True(input.BeginDrag(source))
            input.FocusLost()
            Assert.False(input.CancelDrag())
        } finally {
            window.Close()
        }
    }

    private class BuildCell(build() -> Blob) : Cell {
        override func Build() Blob -> build()
    }

    shared {
        private func Position(offset int32) TextPosition -> TextPosition{
            Offset: offset,
            Affinity: TextAffinity.Downstream
        }

        private func Caret(handle ElementHandle, offset int32) ElementRect {
            Assert.True(handle.TryGetTextCaretRect(Position(offset), TextCoordinateSpace.Window, out var rect))
            return rect
        }

        private func PointAt(handle ElementHandle, offset int32, dx float64 = 0.5) Point {
            let rect = Caret(handle, offset)
            return Point{X: rect.X + dx, Y: rect.Y + rect.Height / float64(2.0)}
        }

        private func Click(
            window Window,
            handle ElementHandle,
            offset int32,
            count int32,
            time float64,
            releaseLast bool = true,
            dx float64 = 0.5
        ) {
            let point = PointAt(handle, offset, dx)
            for var i = 0; i < count; i++ {
                window.InputForTest.QueuePointerPress(float32(point.X), float32(point.Y))
                Drain(window, time + float64(i) * 0.1)
                if releaseLast || i + 1 < count {
                    Release(window, point, time + float64(i) * 0.1 + 0.01)
                }
            }
        }

        private func Move(window Window, point Point, time float64) {
            let point = point
            window.InputForTest.QueuePointerMove(float32(point.X), float32(point.Y))
            Drain(window, time)
        }

        private func Release(window Window, point Point, time float64) {
            let point = point
            window.InputForTest.QueuePointerRelease(float32(point.X), float32(point.Y))
            Drain(window, time)
        }

        private func Drain(window Window, time float64) -> window.InputForTest.Drain(window.Tree, Resolver(), time, nil)
    }
}
