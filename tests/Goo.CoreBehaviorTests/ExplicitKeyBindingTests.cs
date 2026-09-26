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

    [Fact]
    public void MixedIngressKeepsTextAndPointerOrderAndRejectsStaleFocus()
    {
        var first = new ElementHandle();
        var second = new ElementHandle();
        var firstValue = "";
        var secondValue = "";
        var window = new Window { Width = 320, Height = 120, Root = new BuildCell(() => new Container {
            Children = new Blob[] {
                new TextEntry { Handle = first, Value = firstValue, Width = 120, Height = 30,
                    OnChange = value => firstValue = value },
                new TextEntry { Handle = second, Value = secondValue, Width = 120, Height = 30,
                    OnChange = value => secondValue = value }
            }
        }) };
        try
        {
            window.UpdateTree();
            Assert.True(first.Focus());
            var bounds = second.BorderBox;
            var queued = window.InputForTest;
            queued.QueueText("before");
            queued.QueuePointerPress((float)bounds.X + 5, (float)bounds.Y + 5);
            queued.QueuePointerRelease((float)bounds.X + 5, (float)bounds.Y + 5);
            queued.QueueText("after");
            window.PlatformInput.KeyRelease(Key.Unknown);
            Assert.Equal("before", firstValue);
            Assert.Equal("after", secondValue);
            queued.QueueText("stale");
            Assert.True(first.Focus());
            window.PlatformInput.KeyRelease(Key.Unknown);
            Assert.Equal("before", firstValue);
            Assert.Equal("after", secondValue);
        }
        finally { window.Close(); }
    }

    [Fact]
    public void NestedInjectedInputRunsOnceAndKeepsOuterCancellation()
    {
        var handle = new ElementHandle();
        var events = new List<string>();
        var actions = 0;
        var downs = 0;
        var cancels = 0;
        var releaseModifiers = default(KeyModifiers);
        Window window = null!;
        window = new Window { Width = 160, Height = 80, Root = new BuildCell(() => new Button {
            Handle = handle, Width = 100, Height = 40,
            OnKeyDown = e => {
                events.Add(e.Key.ToString());
                if (e.Key == Key.A) { window.PlatformInput.KeyPress(Key.B, default); e.PreventDefault(); }
            },
            OnKeyUp = e => releaseModifiers = e.Modifiers,
            KeyBindings = new[] { new KeyBinding { Key = Key.A, Action = () => actions++ } },
            OnPointerDown = e => { downs++; e.Capture(); window.PlatformInput.PointerCancel(0, PointerDevice.Mouse); },
            OnPointerCancel = _ => cancels++, OnClick = () => actions++
        }) };
        try
        {
            window.UpdateTree();
            Assert.True(handle.Focus());
            var input = window.PlatformInput;
            input.KeyPress(Key.A, default);
            Assert.Equal(new[] { "A", "B" }, events);
            Assert.Equal(0, actions);
            input.KeyRelease(Key.A, new KeyModifiers { Shift = true });
            Assert.True(releaseModifiers.Shift);
            events.Clear();
            window.InputForTest.QueueKeyPress(Key.C, default);
            window.InputForTest.FocusLost(window.Tree, new Resolver());
            window.InputForTest.FocusGained();
            window.InputForTest.QueueKeyPress(Key.D, default);
            input.KeyRelease(Key.Unknown);
            Assert.Equal(new[] { "C", "D" }, events);
            input.PointerPress(0, PointerDevice.Mouse, 10, 10, PointerButton.Primary, default, 0);
            Assert.Equal(1, downs);
            Assert.Equal(1, cancels);
            input.PointerRelease(0, PointerDevice.Mouse, 10, 10, PointerButton.Primary, default, 0);
            Assert.Equal(0, actions);
            Assert.False(handle.AttachedNode()!.Pressed);
        }
        finally { window.Close(); }
    }

    [Fact]
    public void NestedFocusKeepsOuterControlAndBlurFailureStillReleasesPointer()
    {
        var first = new ElementHandle();
        var second = new ElementHandle();
        var outer = default(FocusEvent);
        var parents = 0;
        var failBlur = false;
        var cancels = 0;
        var window = new Window { Width = 320, Height = 120, Root = new BuildCell(() => new Container {
            OnFocus = _ => parents++,
            Children = new Blob[] {
                new Button { Handle = first, Width = 100, Height = 30,
                    OnFocus = e => { outer = e; second.Focus(); } },
                new Button { Handle = second, Width = 100, Height = 30,
                    OnFocus = _ => outer.StopPropagation(),
                    OnBlur = _ => { if (failBlur) throw new InvalidOperationException("blur"); },
                    OnPointerDown = e => e.Capture(), OnPointerCancel = _ => cancels++ }
            }
        }) };
        try
        {
            window.UpdateTree();
            Assert.False(first.Focus());
            Assert.True(second.AttachedNode()!.Focused);
            Assert.Equal(1, parents);
            var bounds = second.BorderBox;
            var input = window.PlatformInput;
            input.PointerPress(0, PointerDevice.Mouse, (float)bounds.X + 5, (float)bounds.Y + 5,
                PointerButton.Primary, default, 0);
            failBlur = true;
            Assert.Throws<InvalidOperationException>(() => input.FocusLost());
            Assert.Equal(1, cancels);
            Assert.False(second.AttachedNode()!.Pressed);
            Assert.False(second.AttachedNode()!.Focused);
            failBlur = false;
            input.PointerRelease(0, PointerDevice.Mouse, (float)bounds.X + 5, (float)bounds.Y + 5,
                PointerButton.Primary, default, 0);
        }
        finally { window.Close(); }
    }

    [Fact]
    public void SharedCommandGuardsEveryActivationAndRebuildsDisabledSemantics()
    {
        var handle = new ElementHandle();
        var enabled = true;
        var calls = 0;
        var command = new Command(() => calls++, () => enabled);
        var adapter = new AccessibilityTestAdapter();
        var cell = new BuildCell(() => new Button {
            Handle = handle, Width = 100, Height = 40, Command = command,
            KeyBindings = new[] { new KeyBinding { Key = Key.Enter, Command = command } }
        });
        var window = new Window { Width = 160, Height = 80, Root = cell, AccessibilityAdapter = adapter };
        try
        {
            window.UpdateTree();
            Assert.True(handle.Focus());
            var input = window.PlatformInput;
            input.KeyPress(Key.Enter, default);
            input.KeyRelease(Key.Enter);
            Assert.Equal(1, calls);
            enabled = false;
            Assert.False(handle.Activate());
            Assert.False(window.PerformAccessibilityAction(adapter.Tree!.Root!.Id,
                new AccessibilityActionRequest(AccessibilityAction.Activate)));
            input.KeyPress(Key.Enter, default);
            input.KeyRelease(Key.Enter);
            input.PointerPress(0, PointerDevice.Mouse, 10, 10, PointerButton.Primary, default, 0);
            input.PointerRelease(0, PointerDevice.Mouse, 10, 10, PointerButton.Primary, default, 0);
            Assert.Equal(1, calls);
            cell.Rebuild();
            window.UpdateTree();
            Assert.True(handle.AttachedNode()!.Disabled);
            enabled = true;
            cell.Rebuild();
            window.UpdateTree();
            Assert.False(handle.AttachedNode()!.Disabled);
            Assert.True(window.PerformAccessibilityAction(adapter.Tree!.Root!.Id,
                new AccessibilityActionRequest(AccessibilityAction.Activate)));
            Assert.Equal(2, calls);
        }
        finally { window.Close(); }
    }

    private sealed class BuildCell(Func<Blob> build) : Cell
    {
        public override Blob Build() => build();
    }
}
