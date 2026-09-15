using System;
using System.Collections.Generic;
using System.Reflection;
using Goo;
using Xunit;

public sealed class FocusScopeTests
{
    [Fact]
    public void ModalContainsFocusAndBlocksBackgroundRoutesAndAccessibility()
    {
        using var scene = new Scene();
        Assert.True(scene.Content.Before.Focus());
        var backgroundId = scene.Find("Background").Id;
        using var scope = scene.Content.Outer.BeginFocusScope(new FocusScopeOptions { Modal = true });
        // Actions against the previously published tree must be blocked before the next publish.
        Assert.False(scene.Window.PerformAccessibilityAction(backgroundId, new AccessibilityActionRequest(AccessibilityAction.Activate)));
        scene.Window.UpdateTree();
        Assert.Same(scene.Content.First.AttachedNode(), scene.Input.FocusedNode());
        Assert.Null(scene.FindOrNull("Background"));
        Assert.False(scene.Content.Before.Focus());
        scene.Press(Key.Tab);
        Assert.Same(scene.Content.Last.AttachedNode(), scene.Input.FocusedNode());
        scene.Press(Key.Tab);
        Assert.Same(scene.Content.First.AttachedNode(), scene.Input.FocusedNode());
        scene.Press(Key.Tab, true);
        Assert.Same(scene.Content.Last.AttachedNode(), scene.Input.FocusedNode());
        scene.Press(Key.Enter);
        Assert.Equal(1, scene.Content.DialogClicks);
        Assert.Equal(0, scene.Content.BackgroundKeys);
        Assert.Equal(0, scene.GlobalKeys);
        var rect = scene.Content.Before.BorderBox;
        scene.Input.QueuePointerPress((float)rect.X + 2, (float)rect.Y + 2);
        scene.Input.QueuePointerRelease((float)rect.X + 2, (float)rect.Y + 2);
        scene.Drain();
        Assert.Equal(0, scene.Content.BackgroundClicks);
        scope.Dispose();
        Assert.False(scope.IsActive);
        scene.Window.UpdateTree();
        Assert.Same(scene.Content.Before.AttachedNode(), scene.Input.FocusedNode());
        Assert.NotNull(scene.FindOrNull("Background"));
        scene.Press(Key.A);
        Assert.Equal(1, scene.Content.BackgroundKeys);
        Assert.Equal(1, scene.GlobalKeys);
    }

    [Fact]
    public void NestedScopesRestoreUnderlyingFocusAndSkipRemovedLayers()
    {
        using var scene = new Scene();
        scene.Content.Before.Focus();
        using var outer = scene.Content.Outer.BeginFocusScope(new FocusScopeOptions { Modal = true });
        scene.Window.UpdateTree();
        scene.Content.Last.Focus();
        using var inner = scene.Content.Inner.BeginFocusScope(new FocusScopeOptions { Modal = true });
        scene.Window.UpdateTree();
        Assert.Same(scene.Content.InnerButton.AttachedNode(), scene.Input.FocusedNode());
        Assert.False(scene.Content.First.Focus());
        inner.Dispose();
        scene.Window.UpdateTree();
        Assert.Same(scene.Content.Last.AttachedNode(), scene.Input.FocusedNode());
        using var next = scene.Content.Inner.BeginFocusScope(new FocusScopeOptions { Modal = true });
        scene.Window.UpdateTree();
        outer.Dispose();
        Assert.True(next.IsActive);
        next.Dispose();
        scene.Window.UpdateTree();
        Assert.Same(scene.Content.Before.AttachedNode(), scene.Input.FocusedNode());
    }

    [Fact]
    public void EmptyScopesFallbackAndUnavailableRootsAutomaticallyClose()
    {
        using var scene = new Scene();
        scene.Content.Before.Focus();
        using var scope = scene.Content.Empty.BeginFocusScope(new FocusScopeOptions { Modal = true });
        scene.Window.UpdateTree();
        Assert.Same(scene.Content.Empty.AttachedNode(), scene.Input.FocusedNode());
        scene.Press(Key.Tab);
        scene.Press(Key.Tab, true);
        Assert.Same(scene.Content.Empty.AttachedNode(), scene.Input.FocusedNode());
        scene.Content.HideEmpty = true;
        scene.Refresh();
        Assert.False(scope.IsActive);
        Assert.Same(scene.Content.Before.AttachedNode(), scene.Input.FocusedNode());
        using var outer = scene.Content.Outer.BeginFocusScope(new FocusScopeOptions { Modal = true });
        scene.Window.UpdateTree();
        scene.Content.ShowOuter = false;
        scene.Refresh();
        Assert.False(outer.IsActive);
        Assert.Same(scene.Content.Before.AttachedNode(), scene.Input.FocusedNode());
    }

    [Fact]
    public void ExplicitInitialFocusValidationAndNonmodalAccessibilityRemainAvailable()
    {
        using var scene = new Scene();
        Assert.Throws<InvalidOperationException>(() => new ElementHandle().BeginFocusScope());
        Assert.Throws<ArgumentException>(() => scene.Content.Outer.BeginFocusScope(
            new FocusScopeOptions { InitialFocus = scene.Content.Before }));
        using var scope = scene.Content.Outer.BeginFocusScope(new FocusScopeOptions { InitialFocus = scene.Content.Last });
        Assert.Throws<InvalidOperationException>(() => scene.Content.Outer.BeginFocusScope());
        scene.Window.UpdateTree();
        Assert.Same(scene.Content.Last.AttachedNode(), scene.Input.FocusedNode());
        var background = scene.Find("Background");
        Assert.True(scene.Window.PerformAccessibilityAction(background.Id, new AccessibilityActionRequest(AccessibilityAction.Activate)));
        Assert.Equal(1, scene.Content.BackgroundClicks);
        scene.Input.Dispose();
        Assert.False(scope.IsActive);
        Assert.False(scene.Root.HasFocusScopes);
    }

    [Fact]
    public void NonmodalChildrenOfAModalKeepTheirParentMenuAvailable()
    {
        using var scene = new Scene();
        using var modal = scene.Content.Outer.BeginFocusScope(new FocusScopeOptions { Modal = true });
        scene.Window.UpdateTree();
        using var popup = scene.Content.Inner.BeginFocusScope();
        scene.Window.UpdateTree();
        Assert.True(popup.Order > modal.Order);
        Assert.NotNull(scene.FindOrNull("Outer"));
        Assert.NotNull(scene.FindOrNull("Inner"));
        Assert.Null(scene.FindOrNull("Background"));
        Assert.True(scene.Content.First.Focus());
        Assert.False(scene.Content.Before.Focus());
        scene.Press(Key.Tab);
        Assert.Same(scene.Content.InnerButton.AttachedNode(), scene.Input.FocusedNode());
    }

    [Fact]
    public void ClosingAPopupPreservesExplicitFocusMovedToAnotherParentItem()
    {
        using var scene = new Scene();
        using var modal = scene.Content.Outer.BeginFocusScope(new FocusScopeOptions { Modal = true });
        scene.Window.UpdateTree();
        scene.Content.Last.Focus();
        using var popup = scene.Content.Inner.BeginFocusScope();
        scene.Window.UpdateTree();
        Assert.Same(scene.Content.InnerButton.AttachedNode(), scene.Input.FocusedNode());
        Assert.True(scene.Content.First.Focus());
        popup.Dispose();
        scene.Window.UpdateTree();
        Assert.Same(scene.Content.First.AttachedNode(), scene.Input.FocusedNode());
    }

    [Fact]
    public void FocusRestorationWaitsForNativeFocusAndRejectsDisabledPriorTarget()
    {
        using var scene = new Scene();
        scene.Content.Before.Focus();
        using var scope = scene.Content.Outer.BeginFocusScope(new FocusScopeOptions { Modal = true });
        scene.Window.UpdateTree();
        scene.Input.FocusLost(scene.Root, scene.Resolver);
        scope.Dispose();
        scene.Window.UpdateTree();
        Assert.Null(scene.Input.FocusedNode());
        scene.Input.FocusGained();
        scene.Drain();
        Assert.Same(scene.Content.Before.AttachedNode(), scene.Input.FocusedNode());
        using var next = scene.Content.Outer.BeginFocusScope(new FocusScopeOptions { Modal = true });
        scene.Window.UpdateTree();
        scene.Content.DisableBefore = true;
        scene.Refresh();
        next.Dispose();
        scene.Content.ShowOuter = false;
        scene.Refresh();
        Assert.NotSame(scene.Content.Before.AttachedNode(), scene.Input.FocusedNode());
    }

    private sealed class Scene : IDisposable
    {
        private const BindingFlags Hidden = BindingFlags.Instance | BindingFlags.NonPublic;
        internal readonly ScopeContent Content = new();
        internal readonly Window Window;
        internal readonly RecordingAdapter Adapter = new();
        internal readonly InputCoordinator Input;
        internal readonly Resolver Resolver;
        internal Node Root => (Node)typeof(Window).GetField("node", Hidden)!.GetValue(Window)!;
        internal int GlobalKeys;
        internal Scene()
        {
            Window = new Window { Root = Content, Width = 600, Height = 400, AccessibilityAdapter = Adapter };
            Input = (InputCoordinator)typeof(Window).GetField("input", Hidden)!.GetValue(Window)!;
            Resolver = (Resolver)typeof(Window).GetField("resolver", Hidden)!.GetValue(Window)!;
            Window.KeyPressed += (_, _) => GlobalKeys++;
            Window.UpdateTree();
        }
        internal void Refresh() { Content.Rebuild(); Window.UpdateTree(); }
        internal void Drain() => Input.Drain(Root, Resolver, 0, Window.PlatformKeyPressedCallbacks);
        internal void Press(Key key, bool shift = false)
        {
            Input.QueueKeyPress(key, new KeyModifiers { Shift = shift });
            Input.QueueKeyRelease(key);
            Drain();
        }
        internal AccessibilityNode Find(string name) => FindOrNull(name) ?? throw new InvalidOperationException(name);
        internal AccessibilityNode? FindOrNull(string name)
        {
            var pending = new Stack<AccessibilityNode>();
            if (Adapter.Tree?.Root is { } root) pending.Push(root);
            while (pending.TryPop(out var node))
            {
                if (node.Name == name) return node;
                foreach (var child in node.Children) pending.Push(child);
            }
            return null;
        }
        public void Dispose() { Input.Dispose(); NodeLifecycle.DisposeTree(Root); }
    }

    private sealed class RecordingAdapter : AccessibilityAdapter
    {
        internal AccessibilityTree? Tree;
        public void Update(AccessibilityTree tree) => Tree = tree;
    }

    private sealed class ScopeContent : Cell
    {
        internal readonly ElementHandle Before = new(), Outer = new(), First = new(), Last = new(),
            Inner = new(), InnerButton = new(), Empty = new();
        internal bool ShowOuter = true, HideEmpty, DisableBefore;
        internal int BackgroundKeys, BackgroundClicks, DialogClicks;
        public override Blob Build()
        {
            var root = new Container { OnKeyDown = _ => BackgroundKeys++, Gap = 8 };
            root.Children.Add(new Button { Key = "before", Handle = Before, Width = 100, Height = 30,
                Disabled = DisableBefore, OnClick = () => BackgroundClicks++,
                Accessibility = new Accessibility { Name = "Background", Actions = new[] { AccessibilityAction.Activate },
                    OnAction = _ => { BackgroundClicks++; return true; } } });
            if (ShowOuter) root.Children.Add(new Container { Key = "outer", Handle = Outer, Focusable = true,
                Accessibility = new Accessibility { Role = AccessibilityRole.Dialog, Name = "Outer", Modal = true },
                Children = {
                    new Button { Key = "first", Handle = First, Width = 100, Height = 30 },
                    new Button { Key = "disabled", Disabled = true },
                    new Button { Key = "skip", TabStop = false },
                    new Button { Key = "last", Handle = Last, OnClick = () => DialogClicks++, Width = 100, Height = 30 }
                } });
            root.Children.Add(new Container { Key = "inner", Handle = Inner, Focusable = true,
                Accessibility = new Accessibility { Role = AccessibilityRole.Dialog, Name = "Inner", Modal = true },
                Children = { new Button { Handle = InnerButton, Width = 100, Height = 30 } } });
            root.Children.Add(new Container { Key = "empty", Handle = Empty, Focusable = true,
                Visibility = HideEmpty ? Visibility.Hidden : Visibility.Visible });
            return root;
        }
    }
}
