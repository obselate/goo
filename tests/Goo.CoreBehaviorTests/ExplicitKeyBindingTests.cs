using System;
using System.Collections.Generic;
using Goo;
using Xunit;

namespace Goo.CoreBehaviorTests;

public sealed class ExplicitKeyBindingTests
{
    [Fact]
    public void PublicPastePreservesInterceptionCompositionAndUndo()
    {
        using var controller = new TextEditorController(new TextDocument(""));
        var handle = new ElementHandle();
        var window = new Window { Width = 320, Height = 120,
            Root = new BuildCell(() => new TextEditor(controller) { Handle = handle }) };
        try
        {
            window.UpdateTree();
            Assert.True(handle.Focus());
            var input = window.PlatformInput;
            input.CommitText("a");
            input.KeyPress(Key.Enter, default);
            input.KeyRelease(Key.Enter);
            input.KeyPress(Key.Enter, new KeyModifiers { Shift = true });
            input.KeyRelease(Key.Enter);
            Assert.Equal("a", controller.Document.GetText());
            var seen = new List<TextCommandKind>();
            controller.OnCommand = e => seen.Add(e.Command.Kind);
            window.InputForTest.SetClipboardFallback("b");
            Assert.True(input.Execute(new TextCommand { Kind = TextCommandKind.Paste }));
            Assert.Equal(new[] { TextCommandKind.Paste }, seen);
            Assert.Equal("ab", controller.Document.GetText());
            input.Execute(new TextCommand { Kind = TextCommandKind.Undo });
            Assert.Equal("a", controller.Document.GetText());
            input.SetComposition("preedit", 0, 0);
            controller.OnCommand = e => { if (e.Command.Kind == TextCommandKind.Paste) e.Cancel = true; };
            Assert.False(input.Execute(new TextCommand { Kind = TextCommandKind.Paste, Text = "rejected" }));
            Assert.Equal("a", controller.Document.GetText());
            Assert.NotNull(controller.Composition);
            Assert.Equal("preedit", controller.Composition!.Value.Text);
        }
        finally { window.Close(); }
    }

    [Fact]
    public void PrimitivesRequireBindingsAndEntryCancelRestoresTheFocusValue()
    {
        var entry = new ElementHandle();
        var button = new ElementHandle();
        var value = "original";
        var submissions = 0;
        var clicks = 0;
        var window = new Window { Width = 320, Height = 120, Root = new BuildCell(() => new Container {
            Children = new Blob[] {
                new TextEntry { Handle = entry, Value = value, Height = 30,
                    OnChange = next => value = next, OnSubmit = _ => submissions++ },
                new Button { Handle = button, Height = 30, OnClick = () => clicks++ }
            }
        }) };
        try
        {
            window.UpdateTree();
            Assert.True(entry.Focus());
            var input = window.PlatformInput;
            input.Execute(new TextCommand { Kind = TextCommandKind.MoveDocumentEnd });
            input.CommitText("X");
            foreach (var key in new[] { Key.Backspace, Key.Enter, Key.Tab, Key.Escape })
            {
                input.KeyPress(key, default);
                input.KeyRelease(key);
            }
            Assert.Equal("originalX", value);
            Assert.Equal(0, submissions);
            Assert.NotNull(input.Editor);
            Assert.True(input.Execute(new TextCommand { Kind = TextCommandKind.CancelEdit }));
            Assert.Equal("original", value);
            Assert.Null(input.Editor);
            Assert.True(button.Focus());
            foreach (var key in new[] { Key.Enter, Key.Space })
            {
                input.KeyPress(key, default);
                input.KeyRelease(key);
            }
            Assert.Equal(0, clicks);
            Assert.True(button.Activate());
            Assert.Equal(1, clicks);
        }
        finally { window.Close(); }
    }

    [Fact]
    public void ExplicitBindingsRepeatOnAnyPrimitiveAndCleanUpPresses()
    {
        var handle = new ElementHandle();
        var other = new ElementHandle();
        var presses = 0;
        var releases = 0;
        var clicks = 0;
        var block = false;
        var failRelease = false;
        var events = new List<string>();
        var window = new Window { Width = 320, Height = 120, Root = new BuildCell(() => new Container {
            OnKeyDown = e => { events.Add("parent"); if (block) e.PreventDefault(); },
            Children = new Blob[] {
                new Button { Handle = handle, Height = 30, OnClick = () => clicks++,
                    OnKeyDown = _ => events.Add("button"),
                    OnKeyUp = _ => { if (failRelease) throw new InvalidOperationException("release"); },
                    KeyBindings = new[] {
                        new KeyBinding { Key = Key.H, Repeat = true, Action = () => { presses++; events.Add("action"); } },
                        new KeyBinding { Key = Key.J, Modifiers = new KeyModifiers { Ctrl = true },
                            Action = () => handle.BeginPress(),
                            OnRelease = () => { releases++; handle.EndPress(true); } }
                    } },
                new Container { Handle = other, Focusable = true, Height = 30 }
            }
        }) };
        try
        {
            window.UpdateTree();
            Assert.True(handle.Focus());
            var input = window.PlatformInput;
            input.KeyPress(Key.H, default);
            Assert.Equal(new[] { "button", "parent", "action" }, events);
            window.InputForTest.Step(window.Tree, new Resolver(), 0.5);
            Assert.Equal(2, presses);
            input.KeyRelease(Key.H);
            window.InputForTest.Step(window.Tree, new Resolver(), 0.5);
            Assert.Equal(2, presses);
            block = true;
            input.KeyPress(Key.H, default);
            Assert.Equal(2, presses);
            block = false;
            input.KeyPress(Key.J, new KeyModifiers { Ctrl = true });
            Assert.True(handle.AttachedNode()!.Pressed);
            input.KeyRelease(Key.J);
            Assert.Equal(1, releases);
            Assert.Equal(1, clicks);
            Assert.False(handle.AttachedNode()!.Pressed);
            input.KeyPress(Key.J, new KeyModifiers { Ctrl = true });
            failRelease = true;
            Assert.Throws<InvalidOperationException>(() => input.KeyRelease(Key.J));
            Assert.False(handle.AttachedNode()!.Pressed);
            failRelease = false;
            input.KeyPress(Key.J, new KeyModifiers { Ctrl = true });
            Assert.True(other.Focus());
            input.KeyRelease(Key.J);
            Assert.Equal(1, clicks);
            Assert.False(handle.AttachedNode()!.Pressed);
            Assert.True(handle.Focus());
            input.KeyPress(Key.J, new KeyModifiers { Ctrl = true });
            Assert.True(other.Focus());
            Assert.True(handle.Focus());
            input.KeyRelease(Key.J);
            Assert.Equal(1, clicks);
            Assert.False(handle.AttachedNode()!.Pressed);
            input.KeyPress(Key.H, default);
            Assert.True(other.Focus());
            window.InputForTest.Step(window.Tree, new Resolver(), 0.5);
            Assert.Equal(3, presses);
        }
        finally { window.Close(); }
    }

    private sealed class BuildCell(Func<Blob> build) : Cell
    {
        public override Blob Build() => build();
    }
}
