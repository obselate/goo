using System;
using System.Collections.Generic;
using Goo;
using Xunit;

public sealed class PlatformInputTests
{
    [Fact]
    public void PasswordEntryCompositionSelectionAndKeyboardLifetimeUseThePublicHost()
    {
        using var cell = new EditingCell();
        using var host = Open(cell);
        var input = host.Window!.PlatformInput;
        var snapshots = new List<FocusedEditorSnapshot?>();
        input.EditorChanged += snapshots.Add;

        Assert.True(cell.EntryHandle.Focus());
        Assert.True(input.Editor!.Value.IsPassword);
        Assert.False(input.Editor.Value.IsMultiline);
        var firstFocus = input.Editor.Value.FocusId;
        Assert.True(input.SetComposition("s😀", 3, 0));
        Assert.Equal("s😀", input.Editor.Value.Text);
        Assert.Equal(0, cell.Changes);
        Assert.True(input.CancelComposition());
        Assert.Equal("", input.Editor.Value.Text);
        Assert.Equal(0, cell.Changes);

        Assert.True(input.SetComposition("safe", 4, 0));
        Assert.True(input.CommitText("safe"));
        Assert.Equal("safe", cell.EntryValue);
        Assert.Equal(1, cell.Changes);
        Assert.True(input.SetSelection(1, 3));
        Assert.True(input.CommitText("X"));
        Assert.Equal("sXe", cell.EntryValue);
        Assert.True(input.SetSelection(1, 2));
        Assert.True(input.DeleteSurroundingText(1, 1));
        Assert.Equal("X", cell.EntryValue);
        Assert.Equal(0, input.Editor.Value.SelectionStart);
        Assert.Equal(1, input.Editor.Value.SelectionEnd);
        Assert.False(input.Execute(new TextCommand { Kind = TextCommandKind.Copy }));
        Assert.Equal("", host.Clipboard);
        Assert.True(input.SetSelection(1, 1));
        Assert.True(input.SetCompositionRange(0, 1));
        Assert.Equal(1, input.Editor.Value.SelectionEnd);
        Assert.True(input.CancelComposition());
        Assert.Equal(1, input.Editor.Value.SelectionEnd);

        input.ClearFocus();
        Assert.Null(input.Editor);
        Assert.True(host.Stops > 0);
        Assert.Null(snapshots[^1]);
        Assert.True(cell.EntryHandle.Focus());
        Assert.NotEqual(firstFocus, input.Editor!.Value.FocusId);
        Assert.True(host.Starts >= 2);
        Assert.True(host.ImeAreas > 0);
    }

    [Fact]
    public void MultilineCompositionReplacesSelectionAndPreservesDocumentCommands()
    {
        using var cell = new EditingCell("ab\ncd");
        using var host = Open(cell);
        var input = host.Window!.PlatformInput;
        Assert.True(cell.EditorHandle.Focus());
        Assert.True(input.Editor!.Value.IsMultiline);
        Assert.False(input.Editor.Value.IsPassword);
        Assert.True(input.SetSelection(1, 4));
        Assert.True(input.SetComposition("😀\nx", 4, 0));
        Assert.Equal("a😀\nxd", input.Editor.Value.Text);
        Assert.Equal("ab\ncd", cell.Document.GetText());
        Assert.Equal(1, input.Editor.Value.CompositionStart);
        Assert.Equal(5, input.Editor.Value.CompositionEnd);
        Assert.True(input.SetComposition("中", 1, 0));
        Assert.Equal("a中d", input.Editor.Value.Text);
        Assert.True(input.CommitText("漢\n字"));
        Assert.Equal("a漢\n字d", cell.Document.GetText());
        Assert.Equal(-1, input.Editor.Value.CompositionStart);
        Assert.True(input.SetSelection(1, 4));
        Assert.True(input.DeleteSurroundingText(1, 1));
        Assert.Equal("漢\n字", cell.Document.GetText());
        Assert.True(input.Execute(new TextCommand { Kind = TextCommandKind.Submit }));
        Assert.Equal(1, cell.Submits);
        Assert.True(input.Execute(new TextCommand { Kind = TextCommandKind.Undo }));
        Assert.Equal("a漢\n字d", cell.Document.GetText());
        Assert.True(input.SetSelection(4, 4));
        Assert.True(input.SetCompositionRange(1, 2));
        Assert.Equal(4, input.Editor.Value.SelectionStart);
        Assert.Equal(4, input.Editor.Value.SelectionEnd);
        cell.Document.Apply(new TextChange { Range = new TextRange { Start = 0, Length = 0 }, InsertedText = "!" });
        host.RenderFrame(0);
        Assert.Equal(5, input.Editor.Value.SelectionStart);
        Assert.Equal(5, input.Editor.Value.SelectionEnd);
        Assert.Equal(2, input.Editor.Value.CompositionStart);
        Assert.True(input.SetSelection(3, 2));
        cell.Document.Apply(new TextChange { Range = new TextRange { Start = 0, Length = 0 }, InsertedText = "?" });
        host.RenderFrame(0);
        Assert.Equal(4, input.Editor.Value.SelectionStart);
        Assert.Equal(3, input.Editor.Value.SelectionEnd);
        Assert.Equal(3, input.Editor.Value.CompositionStart);
        Assert.True(input.SetComposition("temporary", 9, 0));
        input.FocusLost();
        Assert.Null(input.Editor);
        Assert.Null(cell.Controller.Composition);
        Assert.Equal("?!a漢\n字d", cell.Document.GetText());
        cell.Rebuild();
        host.RenderFrame(0);
        Assert.Null(input.Editor);
    }

    [Fact]
    public void TouchCancellationFocusSwitchAndUtf16DeletionKeepTheRetainedEditorAuthoritative()
    {
        using var cell = new EditingCell("a😀e\u0301z");
        using var host = Open(cell);
        var input = host.Window!.PlatformInput;
        Assert.True(cell.EditorHandle.Focus());
        Assert.True(input.SetSelection(3, 3));
        Assert.True(input.DeleteSurroundingText(1, 1));
        Assert.Equal("az", cell.Document.GetText());
        Assert.Equal(1, input.Editor!.Value.SelectionEnd);
        Assert.True(input.SetComposition("pending", 7, 0));
        var oldFocus = input.Editor.Value.FocusId;
        Assert.True(input.MoveFocus(false));
        Assert.True(input.Editor!.Value.IsPassword);
        Assert.NotEqual(oldFocus, input.Editor.Value.FocusId);
        Assert.Null(cell.Controller.Composition);
        Assert.Equal("az", cell.Document.GetText());

        var button = cell.ButtonHandle.BorderBox;
        var x = (float)(button.X + button.Width / 2);
        var y = (float)(button.Y + button.Height / 2);
        input.PointerPress(41, PointerDevice.Touch, x, y, PointerButton.Primary, default, 1);
        input.PointerCancel(41, PointerDevice.Touch);
        input.PointerRelease(41, PointerDevice.Touch, x, y, PointerButton.Primary, default, 0);
        Assert.Equal(1, cell.Cancels);
        Assert.Equal(0, cell.Clicks);
        input.PointerPress(42, PointerDevice.Touch, x, y, PointerButton.Primary, default, 1);
        input.PointerRelease(42, PointerDevice.Touch, x, y, PointerButton.Primary, default, 0);
        Assert.Equal(1, cell.Clicks);
        input.PointerPress(43, PointerDevice.Touch, x, y, PointerButton.Primary, default, 1);
        input.FocusLost();
        Assert.Equal(2, cell.Cancels);
        Assert.Equal(1, cell.Clicks);
        input.PointerPress(44, PointerDevice.Touch, x, y, PointerButton.Primary, default, 1);
        host.Suspend();
        Assert.Equal(3, cell.Cancels);
        host.Resume();
        input.PointerRelease(44, PointerDevice.Touch, x, y, PointerButton.Primary, default, 0);
        Assert.Equal(1, cell.Clicks);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void SurroundingDeletionPreservesPreeditAndCommittedTextAcrossCompositionBoundaries(bool multiline)
    {
        using var cell = new EditingCell("abXYcd") { EntryValue = "abXYcd" };
        using var host = Open(cell);
        var input = host.Window!.PlatformInput;
        Assert.True((multiline ? cell.EditorHandle : cell.EntryHandle).Focus());
        string CommittedText() => multiline ? cell.Document.GetText() : cell.EntryValue;
        Assert.True(input.SetSelection(2, 4));
        Assert.True(input.SetComposition("12345", 5, 0));
        var unchanged = input.Editor!.Value;
        Assert.True(input.DeleteSurroundingText(0, 0));
        Assert.Equal(unchanged, input.Editor!.Value);
        Assert.Equal("abXYcd", CommittedText());
        Assert.Equal(0, cell.Changes);

        Assert.True(input.SetSelection(5, 4));
        if (multiline)
        {
            cell.Controller.OnCommand = command => command.Cancel = command.Command.Kind == TextCommandKind.DeleteBackward;
            Assert.False(input.DeleteSurroundingText(1, 1));
            Assert.Equal("ab12345cd", input.Editor.Value.Text);
            Assert.Equal("abXYcd", CommittedText());
            cell.Controller.OnCommand = null;
        }
        Assert.True(input.DeleteSurroundingText(1, 1));
        Assert.Equal("a12345d", input.Editor.Value.Text);
        Assert.Equal("aXYd", CommittedText());
        Assert.Equal(1, input.Editor.Value.CompositionStart);
        Assert.Equal(6, input.Editor.Value.CompositionEnd);
        Assert.Equal(4, input.Editor.Value.SelectionStart);
        Assert.Equal(3, input.Editor.Value.SelectionEnd);
        Assert.True(input.CancelComposition());
        Assert.Equal("aXYd", input.Editor.Value.Text);

        Assert.True(input.SetSelection(1, 3));
        Assert.True(input.SetComposition("abc", 3, 0));
        Assert.True(input.DeleteSurroundingText(1, 0));
        Assert.Equal("abcd", input.Editor.Value.Text);
        Assert.Equal("XYd", CommittedText());
        Assert.Equal(0, input.Editor.Value.CompositionStart);
        Assert.Equal(3, input.Editor.Value.CompositionEnd);
        Assert.True(input.SetComposition("Z", 1, 0));
        Assert.Equal("Zd", input.Editor.Value.Text);
        Assert.True(input.FinishComposition());
        Assert.Equal("Zd", CommittedText());
        Assert.True(input.SetSelection(0, input.Editor.Value.Text.Length));
        Assert.True(input.CommitText("a"));
        Assert.True(input.SetComposition("\u0301", 1, 0));
        var combined = input.Editor.Value;
        Assert.True(input.DeleteSurroundingText(0, 0));
        Assert.Equal(combined, input.Editor.Value);
        Assert.Equal("a", CommittedText());
        Assert.True(input.CancelComposition());
    }

    private static InputTestHost Open(EditingCell cell)
    {
        var host = new InputTestHost();
        host.Resize(320, 240, 320, 240);
        new Window { Width = 320, Height = 240, Root = cell }.Attach(host);
        host.RenderFrame(0);
        return host;
    }

    private sealed class EditingCell : Cell, IDisposable
    {
        public readonly ElementHandle EntryHandle = new();
        public readonly ElementHandle EditorHandle = new();
        public readonly ElementHandle ButtonHandle = new();
        public readonly TextDocument Document;
        public readonly TextEditorController Controller;
        public string EntryValue = "";
        public int Changes;
        public int Submits;
        public int Cancels;
        public int Clicks;

        public EditingCell(string value = "")
        {
            Document = new TextDocument(value);
            Controller = new TextEditorController(Document);
        }

        public override Blob Build() => new Container
        {
            Width = 320.0,
            Height = 240.0,
            FlexDirection = FlexDirection.Column,
            Children = new Blob[]
            {
                new TextEntry
                {
                    Key = "password", Handle = EntryHandle, Value = EntryValue,
                    Password = true, AutoFocus = true, Width = 280.0, Height = 40.0,
                    OnChange = value => { EntryValue = value; Changes++; }
                },
                new TextEditor(Controller)
                {
                    Key = "multiline", Handle = EditorHandle, Width = 280.0, Height = 100.0,
                    OnSubmit = () => Submits++
                },
                new Button
                {
                    Key = "button", Handle = ButtonHandle, Width = 80.0, Height = 40.0,
                    OnPointerDown = value => value.Capture(),
                    OnPointerCancel = value => Cancels++,
                    OnClick = () => Clicks++
                }
            }
        };

        public void Dispose() => Controller.Dispose();
    }

    private sealed class InputTestHost : EmbeddedWindowHost
    {
        public int Starts;
        public int Stops;
        public int ImeAreas;
        public string Clipboard = "";
        protected override void RequestFrame() { }
        protected override bool LoadVulkanLibrary() => false;
        protected override nint GetVulkanGetInstanceProcAddr() => 0;
        protected override void UnloadVulkanLibrary() { }
        protected override string[] GetVulkanInstanceExtensions() => [];
        protected override bool CreateVulkanSurface(nint instance, out ulong surface)
        {
            surface = 0;
            return false;
        }
        protected override void DestroyVulkanSurface(nint instance, ulong surface) { }
        protected override bool StartTextInput() { Starts++; return true; }
        protected override void StopTextInput() => Stops++;
        protected override bool SetImeArea(int x, int y, int width, int height, int cursor)
        {
            ImeAreas++;
            return true;
        }
        protected override string GetClipboardText() => Clipboard;
        protected override void SetClipboardText(string value) => Clipboard = value;
    }
}
