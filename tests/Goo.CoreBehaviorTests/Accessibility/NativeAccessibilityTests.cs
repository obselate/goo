using System;
using System.Collections;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using Goo;
using Xunit;

public sealed class NativeAccessibilityTests
{
    private const BindingFlags Hidden = BindingFlags.Instance | BindingFlags.NonPublic;
    private const string Library = "goo-accesskit-0.23";
    [DllImport(Library, CallingConvention = CallingConvention.Cdecl, EntryPoint = "accesskit_tree_update_debug")]
    private static extern nint DebugUpdate(nint update);
    [DllImport(Library, CallingConvention = CallingConvention.Cdecl, EntryPoint = "accesskit_string_free")]
    private static extern void FreeString(nint value);

    [Fact]
    public void OptionalRuntimeMatchesThePinned64BitAbi()
    {
        Assert.True(NativeAccessibilityAdapter.IsAvailable);
        Assert.Equal(32, Marshal.SizeOf<AccessKitRect>());
        Assert.Equal(16, Marshal.SizeOf<AccessKitTextPosition>());
        Assert.Equal(32, Marshal.SizeOf<AccessKitTextSelection>());
        var pointer = Marshal.AllocHGlobal(80);
        try
        {
            Marshal.Copy(new byte[80], 0, pointer, 80);
            Marshal.WriteByte(pointer, 18);
            Marshal.WriteInt64(pointer, 24, 731);
            Marshal.WriteByte(pointer, 32, 1);
            Marshal.WriteInt32(pointer, 40, 7);
            Marshal.WriteInt64(pointer, 48, 1001);
            Marshal.WriteInt64(pointer, 56, 2);
            Marshal.WriteInt64(pointer, 64, 1002);
            Marshal.WriteInt64(pointer, 72, 5);
            var value = NativeAccessibilityAdapter.ReadAction(pointer);
            Assert.Equal(18, value.Action);
            Assert.Equal(731UL, value.Target);
            Assert.Equal(1001UL, value.AnchorNode);
            Assert.Equal(2UL, value.AnchorIndex);
            Assert.Equal(1002UL, value.FocusNode);
            Assert.Equal(5UL, value.FocusIndex);
        }
        finally { Marshal.FreeHGlobal(pointer); }
    }

    [Fact]
    public void RetainedUpdatesKeepNativeIdentitiesAndRetireRemovedNodes()
    {
        using var scene = new Scene();
        var initial = scene.Encode(true);
        Assert.Contains("Button", initial);
        Assert.Contains("Save", initial);
        Assert.Contains("ListBox", initial);
        Assert.Contains("ListBoxOption", initial);
        Assert.Contains("is_selected: true", initial);
        Assert.Contains("labelled_by", initial);
        Assert.Contains("MultilineTextInput", initial);
        var count = Cache(scene.Adapter).Count;
        Assert.Contains("nodes: []", scene.Encode(false));
        scene.Root.Caption = "Store";
        scene.Refresh();
        var changed = scene.Encode(false);
        Assert.Contains("Store", changed);
        Assert.DoesNotContain("MultilineTextInput", changed);
        Assert.Equal(count, Cache(scene.Adapter).Count);
        scene.Root.ShowRow = false;
        scene.Refresh();
        scene.Encode(false);
        Assert.Equal(count - 1, Cache(scene.Adapter).Count);
        Assert.False(scene.Window.PerformAccessibilityAction(scene.RowId, new(AccessibilityAction.Select)));
    }

    [Fact]
    public void UnicodeRunsUseUtf8LengthsButActionsRoundTripUtf16AndDirection()
    {
        using var scene = new Scene("A😀e\u0301\n日本\n");
        scene.Encode(true);
        var entry = Cache(scene.Adapter)[scene.Editor.Id.Value];
        Assert.Equal(3, entry.Runs.Count);
        var first = entry.Runs[0];
        Assert.Equal(new[] { 0, 1, 3, 5, 6 }, first.Starts);
        Assert.Equal(new byte[] { 1, 4, 3, 1 }, first.Lengths);
        Assert.Equal("", entry.Runs[2].Text);
        var request = Convert(scene, new NativeAccessibilityRequest
        {
            Action = 18, Tag = 7, AnchorNode = first.Id, AnchorIndex = 3,
            FocusNode = first.Id, FocusIndex = 1
        });
        Assert.NotNull(request);
        Assert.Equal(1, request.SelectionStart);
        Assert.Equal(4, request.SelectionLength);
        Assert.Equal(1, request.SelectionCaret);
        Assert.True(scene.Window.PerformAccessibilityAction(scene.Editor.Id, request));
        Assert.Equal(5, scene.Root.Controller.Selection.Anchor.Offset);
        Assert.Equal(1, scene.Root.Controller.Selection.Active.Offset);
        scene.Root.Controller.Document.Apply(new TextChange { Range = new TextRange { Start = 0, Length = 1 }, InsertedText = "Z" });
        scene.Refresh();
        scene.Encode(false);
        Assert.Null(Convert(scene, new NativeAccessibilityRequest
        {
            Action = 18, Tag = 7, AnchorNode = first.Id, FocusNode = first.Id
        }));
    }

    [Fact]
    public void EmptyAndLongTextStayRepresentableWithoutSplittingSurrogatePairs()
    {
        using var empty = new Scene("");
        Assert.Contains("TextRun", empty.Encode(true));
        Assert.Empty(Cache(empty.Adapter)[empty.Editor.Id.Value].Runs[0].Lengths);
        using var longText = new Scene(string.Concat(Enumerable.Repeat("😀", 401)));
        longText.Encode(true);
        var runs = Cache(longText.Adapter)[longText.Editor.Id.Value].Runs;
        Assert.Equal(new[] { 200, 200, 1 }, runs.Select(r => r.Lengths.Length));
        Assert.All(runs, r => Assert.All(r.Lengths, b => Assert.Equal(4, b)));
    }

    [Fact]
    public void NativeActionsRemainCapabilityGatedAndPreserveNumericPayloads()
    {
        using var scene = new Scene();
        scene.Encode(true);
        var request = Convert(scene, new NativeAccessibilityRequest { Action = 20, Tag = 2, Number = 123.5 });
        Assert.Equal("123.5", request!.Value);
        Assert.Null(Convert(scene, new NativeAccessibilityRequest { Action = 20, Tag = 2, Number = double.NaN }));
        Assert.Null(Convert(scene, new NativeAccessibilityRequest { Action = 18, Tag = 7, AnchorNode = 99, FocusNode = 99 }));
        scene.Root.Disabled = true;
        scene.Refresh();
        Assert.False(scene.Window.PerformAccessibilityAction(scene.Button.Id, new(AccessibilityAction.Activate)));
        Assert.Contains("is_disabled: true", scene.Encode(false));
        Assert.Equal(0, scene.Root.Clicks);
    }

    [Fact]
    public void NativeClickSelectsAndDeselectsAccordingToTheCurrentSemanticState()
    {
        using var scene = new Scene();
        scene.Encode(true);
        var row = scene.Tree.Root!.Children.SelectMany(n => n.Children).Single(n => n.Role == AccessibilityRole.ListItem);
        var deselect = Convert(scene, new NativeAccessibilityRequest { Action = 0 }, row);
        Assert.Equal(AccessibilityAction.Deselect, deselect!.Action);
        Assert.True(scene.Window.PerformAccessibilityAction(row.Id, deselect));
        scene.Refresh();
        row = scene.Tree.Root!.Children.SelectMany(n => n.Children).Single(n => n.Role == AccessibilityRole.ListItem);
        var select = Convert(scene, new NativeAccessibilityRequest { Action = 0 }, row);
        Assert.Equal(AccessibilityAction.Select, select!.Action);
        Assert.True(scene.Window.PerformAccessibilityAction(row.Id, select));
        Assert.True(scene.Root.Selected);
        Assert.Equal(AccessibilityAction.Activate, Convert(scene, new NativeAccessibilityRequest { Action = 0 }, scene.Button)!.Action);
    }

    [Fact]
    public void OwnershipThreadChecksAndDisposalAreDeterministic()
    {
        using var scene = new Scene();
        Assert.Throws<InvalidOperationException>(() => new Window { AccessibilityAdapter = scene.Adapter });
        typeof(Window).GetField("uiThreadBound", Hidden)!.SetValue(scene.Window, true);
        typeof(Window).GetField("ownerThreadId", Hidden)!.SetValue(scene.Window, Environment.CurrentManagedThreadId);
        Exception? error = null;
        var tree = scene.Tree;
        var worker = new System.Threading.Thread(() => error = Record.Exception(() => scene.Adapter.Update(tree)));
        worker.Start();
        worker.Join();
        Assert.IsType<InvalidOperationException>(error);
        scene.Adapter.Dispose();
        Assert.Null(scene.Window.AccessibilityAdapter);
        scene.Adapter.Dispose();
        Assert.Throws<ObjectDisposedException>(() => scene.Adapter.Update(tree));
        Assert.Throws<ObjectDisposedException>(() => new Window { AccessibilityAdapter = scene.Adapter });
    }

    [Fact]
    public void SelectionFactoriesValidateTheActiveEndpointWithoutChangingTheOldDefault()
    {
        Assert.Equal(6, AccessibilityActionRequest.SetSelection(2, 4).SelectionCaret);
        Assert.Equal(2, AccessibilityActionRequest.SetSelection(2, 4, 2).SelectionCaret);
        Assert.Throws<ArgumentOutOfRangeException>(() => AccessibilityActionRequest.SetSelection(2, 4, 3));
        Assert.Throws<ArgumentOutOfRangeException>(() => AccessibilityActionRequest.SetSelection(int.MaxValue, 1, 0));
    }

    private static System.Collections.Generic.Dictionary<long, NativeAccessibilityNodeCache> Cache(NativeAccessibilityAdapter adapter)
        => (System.Collections.Generic.Dictionary<long, NativeAccessibilityNodeCache>)typeof(NativeAccessibilityAdapter).GetField("cache", Hidden)!.GetValue(adapter)!;
    private static AccessibilityActionRequest? Convert(Scene scene, NativeAccessibilityRequest request, AccessibilityNode? node = null)
        => (AccessibilityActionRequest?)typeof(NativeAccessibilityAdapter).GetMethod("ConvertAction", Hidden)!.Invoke(scene.Adapter,
            new object[] { request, node ?? scene.Editor, scene.Window.NativeAccessibilityNodeFor((node ?? scene.Editor).Id)! });

    private sealed class Scene : IDisposable
    {
        internal readonly Root Root;
        internal readonly Window Window;
        internal readonly NativeAccessibilityAdapter Adapter = new();
        internal readonly AccessibilityId RowId;
        internal AccessibilityTree Tree => (AccessibilityTree)typeof(NativeAccessibilityAdapter).GetField("tree", Hidden)!.GetValue(Adapter)!;
        internal AccessibilityNode Editor => Find(Tree.Root!, AccessibilityRole.TextEditor);
        internal AccessibilityNode Button => Find(Tree.Root!, AccessibilityRole.Button);
        internal Scene(string text = "Native editor")
        {
            Root = new Root(text);
            Window = new Window { Root = Root, Width = 420, Height = 300, Title = "Native test", AccessibilityAdapter = Adapter };
            Window.UpdateTree();
            RowId = Find(Tree.Root!, AccessibilityRole.ListItem).Id;
        }
        internal void Refresh() { Root.Rebuild(); Window.UpdateTree(); }
        internal string Encode(bool all)
        {
            var update = (nint)typeof(NativeAccessibilityAdapter).GetMethod("Encode", Hidden)!.Invoke(Adapter, new object[] { all })!;
            try
            {
                var text = DebugUpdate(update);
                try { return Marshal.PtrToStringUTF8(text)!; }
                finally { FreeString(text); }
            }
            finally { AccessKitNative.TreeUpdateFree(update); }
        }
        public void Dispose() {
            var tree = typeof(Window).GetField("node", Hidden)!.GetValue(Window) as Node;
            Adapter.Dispose();
            if (tree is not null) NodeLifecycle.DisposeTree(tree);
            Root.Controller.Dispose();
        }
        private static AccessibilityNode Find(AccessibilityNode node, AccessibilityRole role)
        {
            if (node.Role == role) return node;
            foreach (var child in node.Children)
            {
                try { return Find(child, role); }
                catch (InvalidOperationException) { }
            }
            throw new InvalidOperationException($"Missing {role}");
        }
    }

    private sealed class Root : Cell
    {
        internal readonly TextEditorController Controller;
        internal readonly ElementHandle Label = new();
        internal bool ShowRow = true, Disabled;
        internal bool Selected = true;
        internal int Clicks;
        internal string Caption = "Save";
        internal Root(string text) => Controller = new TextEditorController(new TextDocument(text));
        public override Blob Build() => new Container
        {
            FlexDirection = FlexDirection.Column,
            Children = {
                new Text("Editor label") { Handle = Label },
                new Button { Children = { new Text(Caption) }, Disabled = Disabled, OnClick = () => Clicks++ },
                new TextEditor(Controller) { Width = 300, Height = 80,
                    Accessibility = new Accessibility { Relationships = new AccessibilityRelationships { LabelledBy = new[] { Label } } } },
                new Container { Accessibility = new Accessibility { Role = AccessibilityRole.List }, Children = ShowRow
                    ? new Blob[] { new Container { Accessibility = new Accessibility { Role = AccessibilityRole.ListItem, Name = "Selected row", Selected = Selected,
                        Actions = new[] { AccessibilityAction.Select, AccessibilityAction.Deselect },
                        OnAction = request => { Selected = request!.Action == AccessibilityAction.Select; return true; } } } }
                    : Array.Empty<Blob>() }
            }
        };
    }
}
