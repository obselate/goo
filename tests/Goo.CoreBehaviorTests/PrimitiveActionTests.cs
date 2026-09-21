using System;
using System.Collections.Generic;
using Goo;
using Xunit;

namespace Goo.CoreBehaviorTests;

public sealed class PrimitiveActionTests
{
    [Fact]
    public void SelectionCommandsAndMouseGesturesUseTheSameUnits()
    {
        const string value = "foo_bar  !! e\u0301🙂\r\nsecond line";
        using var controller = new TextEditorController(new TextDocument(value));
        var editor = new ElementHandle();
        var entry = new ElementHandle();
        var window = new Window { Width = 420, Height = 180, Root = new BuildCell(() => new Container {
            Children = new Blob[] {
                new TextEditor(controller) { Handle = editor, Height = 100, FontFamily = "monospace", FontSize = 16 },
                new TextEntry { Handle = entry, Value = "foo_bar  !!", Height = 40, FontFamily = "monospace", FontSize = 16 }
            }
        }) };
        try
        {
            window.UpdateTree();
            Assert.True(editor.Focus());
            var input = window.PlatformInput;
            Assert.True(input.Execute(new TextCommand { Kind = TextCommandKind.SelectWord, Position = Position(2) }));
            Assert.Equal("foo_bar", controller.Copy());
            controller.OnCommand = e => e.Cancel = e.Command.Kind == TextCommandKind.SelectWord;
            Assert.False(input.Execute(new TextCommand { Kind = TextCommandKind.SelectWord, Position = Position(10) }));
            Assert.Equal("foo_bar", controller.Copy());
            controller.OnCommand = null;
            Click(window, editor, 7, 2, 0, dx: -1);
            Assert.Equal("foo_bar", controller.Copy());

            Click(window, editor, 8, 2, 1);
            Assert.Equal("  ", controller.Copy());
            Click(window, editor, 10, 2, 2);
            Assert.Equal("!!", controller.Copy());
            Click(window, editor, 12, 2, 3);
            Assert.Equal("e\u0301", controller.Copy());
            Click(window, editor, 14, 2, 4);
            Assert.Equal("🙂", controller.Copy());
            Click(window, editor, 2, 3, 5);
            Assert.Equal("foo_bar  !! e\u0301🙂\r\n", controller.Copy());

            Click(window, editor, 2, 2, 6, releaseLast: false);
            Move(window, PointAt(editor, 10), 6.2);
            Assert.Equal("foo_bar  !!", controller.Copy());
            Move(window, PointAt(editor, 3), 6.3);
            Assert.Equal("foo_bar", controller.Copy());
            Release(window, PointAt(editor, 3), 6.4);

            Assert.True(entry.Focus());
            Click(window, entry, 7, 2, 7, dx: -1);
            Assert.Equal(0, input.Editor!.Value.SelectionStart);
            Assert.Equal(7, input.Editor!.Value.SelectionEnd);
            Click(window, entry, 2, 2, 8, releaseLast: false);
            Move(window, PointAt(entry, 2, 0.1), 8.15);
            Assert.Equal(0, input.Editor!.Value.SelectionStart);
            Assert.Equal(7, input.Editor!.Value.SelectionEnd);
            Move(window, PointAt(entry, 10), 8.2);
            Assert.Equal(11, input.Editor!.Value.SelectionEnd);
            Release(window, PointAt(entry, 10), 8.3);
            Click(window, entry, 2, 3, 9);
            Assert.Equal(0, input.Editor!.Value.SelectionStart);
            Assert.Equal(11, input.Editor!.Value.SelectionEnd);
            Assert.True(input.Execute(new TextCommand { Kind = TextCommandKind.SelectWord, Position = Position(10) }));
            Assert.Equal(9, input.Editor!.Value.SelectionStart);
            Assert.Equal(11, input.Editor!.Value.SelectionEnd);
        }
        finally { window.Close(); }
    }

    [Fact]
    public void ExplicitTabBindingPreservesIndentationUndoAndSourceGeometry()
    {
        using var controller = new TextEditorController(new TextDocument("ab\ncd\nef"));
        var handle = new ElementHandle();
        var window = new Window { Width = 420, Height = 160, Root = new BuildCell(() => new TextEditor(controller) {
            Handle = handle, FontFamily = "monospace", FontSize = 16,
            KeyBindings = new[] {
                new KeyBinding { Key = Key.Tab, Action = () => controller.Execute(new TextCommand { Kind = TextCommandKind.InsertTab }) },
                new KeyBinding { Key = Key.Tab, Modifiers = new KeyModifiers { Shift = true },
                    Action = () => controller.Execute(new TextCommand { Kind = TextCommandKind.Outdent }) }
            }
        }) };
        try
        {
            window.UpdateTree();
            Assert.True(handle.Focus());
            controller.Selection = new TextSelection { Anchor = Position(1), Active = Position(1) };
            window.PlatformInput.KeyPress(Key.Tab, default);
            window.PlatformInput.KeyRelease(Key.Tab);
            Assert.Equal("a\tb\ncd\nef", controller.Document.GetText());
            Assert.Equal(2, controller.Selection.Active.Offset);
            window.UpdateTree();
            var start = Caret(handle, 0);
            var before = Caret(handle, 1);
            var after = Caret(handle, 2);
            var expected = TextShaping.MeasureLineUncached("a   ", 0, 4, "monospace", 16, 400, false, 0, 0);
            Assert.InRange(after.X - start.X, expected - 0.2, expected + 0.2);
            Assert.True(handle.TryGetTextPositionAt(new Point { X = (before.X + after.X) / 2, Y = before.Y + 2 },
                TextCoordinateSpace.Window, out var hit));
            Assert.Contains(hit.Offset, new[] { 1, 2 });
            controller.Execute(new TextCommand { Kind = TextCommandKind.MoveLeft });
            Assert.Equal(1, controller.Selection.Active.Offset);
            controller.Execute(new TextCommand { Kind = TextCommandKind.MoveRight });
            Assert.Equal(2, controller.Selection.Active.Offset);
            controller.Execute(new TextCommand { Kind = TextCommandKind.Undo });
            Assert.Equal("ab\ncd\nef", controller.Document.GetText());
            controller.Selection = new TextSelection { Anchor = Position(6), Active = Position(0) };
            window.PlatformInput.KeyPress(Key.Tab, default);
            window.PlatformInput.KeyRelease(Key.Tab);
            Assert.Equal("\tab\n\tcd\nef", controller.Document.GetText());
            window.PlatformInput.KeyPress(Key.Tab, new KeyModifiers { Shift = true });
            window.PlatformInput.KeyRelease(Key.Tab);
            Assert.Equal("ab\ncd\nef", controller.Document.GetText());
            controller.Execute(new TextCommand { Kind = TextCommandKind.Undo });
            Assert.Equal("\tab\n\tcd\nef", controller.Document.GetText());
            controller.Execute(new TextCommand { Kind = TextCommandKind.Undo });
            Assert.Equal("ab\ncd\nef", controller.Document.GetText());
        }
        finally { window.Close(); }
    }

    [Fact]
    public void BoundDragActionsNegotiateDropAndCleanUpWithoutPointerCapture()
    {
        var source = new ElementHandle();
        var target = new ElementHandle();
        var events = new List<string>();
        var reject = false;
        var fail = false;
        var disabled = false;
        Window window = null!;
        var cell = new BuildCell(() => new Container {
            KeyBindings = new[] {
                new KeyBinding { Key = Key.G, Action = () => window.PlatformInput.BeginDrag(source) },
                new KeyBinding { Key = Key.T, Action = () => window.PlatformInput.UpdateDrag(target) },
                new KeyBinding { Key = Key.Enter, Action = () => window.PlatformInput.DropDrag() }
            },
            Children = new Blob[] {
                new Container { Handle = source, Focusable = true, Width = 40, Height = 40,
                    DragSource = new DragSource(e => { Assert.False(e.IsPointer); events.Add("start"); return new DragData("value", DragEffect.Copy | DragEffect.Move); },
                        e => events.Add("end:" + e.Kind)) },
                new Container { Handle = target, Width = 80, Height = 40, Disabled = disabled,
                    DropTarget = new DropTarget(e => { Assert.False(e.IsPointer); if (fail) throw new InvalidOperationException("query");
                            return reject ? DragEffect.None : e.Modifiers.Ctrl ? DragEffect.Copy : DragEffect.Move; },
                        e => { if (e.Kind != DragEventKind.Move) events.Add(e.Kind + ":" + e.Effect); }) }
            }
        });
        window = new Window { Width = 320, Height = 160, Root = cell };
        try
        {
            window.UpdateTree();
            Assert.True(source.Focus());
            var input = window.PlatformInput;
            input.KeyPress(Key.G, default);
            input.KeyRelease(Key.G);
            input.KeyPress(Key.T, default);
            input.KeyRelease(Key.T);
            Assert.False(source.AttachedNode()!.Pressed);
            input.KeyPress(Key.Enter, default);
            input.KeyRelease(Key.Enter);
            Assert.Equal(new[] { "start", "Enter:Move", "Drop:Move", "end:Dropped" }, events);
            Assert.False(input.CancelDrag());
            Assert.True(input.BeginDrag(source));
            Assert.True(input.UpdateDrag(target));
            Assert.True(input.CancelDrag());
            Assert.Equal("end:Canceled", events[^1]);
            reject = true;
            Assert.True(input.BeginDrag(source));
            Assert.False(input.UpdateDrag(target));
            Assert.False(input.DropDrag());
            Assert.False(input.CancelDrag());
            reject = false;
            Assert.True(input.BeginDrag(source));
            fail = true;
            Assert.Throws<InvalidOperationException>(() => input.UpdateDrag(target));
            Assert.False(input.CancelDrag());
            fail = false;
            Assert.True(input.BeginDrag(source));
            Assert.True(input.UpdateDrag(target));
            disabled = true;
            cell.Rebuild();
            window.UpdateTree();
            Assert.False(input.DropDrag());
            Assert.Equal("end:Canceled", events[^1]);
            Assert.True(input.BeginDrag(source));
            input.FocusLost();
            Assert.False(input.CancelDrag());
        }
        finally { window.Close(); }
    }

    private static TextPosition Position(int offset) => new() { Offset = offset, Affinity = TextAffinity.Downstream };
    private static ElementRect Caret(ElementHandle handle, int offset)
    {
        Assert.True(handle.TryGetTextCaretRect(Position(offset), TextCoordinateSpace.Window, out var rect));
        return rect;
    }
    private static Point PointAt(ElementHandle handle, int offset, double dx = 0.5)
    {
        var rect = Caret(handle, offset);
        return new Point { X = rect.X + dx, Y = rect.Y + rect.Height / 2 };
    }
    private static void Click(Window window, ElementHandle handle, int offset, int count, double time, bool releaseLast = true, double dx = 0.5)
    {
        var point = PointAt(handle, offset, dx);
        for (var i = 0; i < count; i++)
        {
            window.InputForTest.QueuePointerPress((float)point.X, (float)point.Y);
            Drain(window, time + i * 0.1);
            if (releaseLast || i + 1 < count) Release(window, point, time + i * 0.1 + 0.01);
        }
    }
    private static void Move(Window window, Point point, double time)
    {
        window.InputForTest.QueuePointerMove((float)point.X, (float)point.Y);
        Drain(window, time);
    }
    private static void Release(Window window, Point point, double time)
    {
        window.InputForTest.QueuePointerRelease((float)point.X, (float)point.Y);
        Drain(window, time);
    }
    private static void Drain(Window window, double time) => window.InputForTest.Drain(window.Tree, new Resolver(), time, null);
    private sealed class BuildCell(Func<Blob> build) : Cell { public override Blob Build() => build(); }
}
