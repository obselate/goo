using Goo;
using Xunit;

public sealed class TabStopTests
{
    [Fact]
    public void ExplicitFocusableFalseOverridesInteractivePrimitiveDefaults()
    {
        var resolver = new Resolver();
        var reconciler = new Reconciler { Res = resolver };
        var controller = new TextEditorController(new TextDocument("Editor"));
        var root = reconciler.Mount(new Container { Children = {
            new Button(), new Button { Focusable = false },
            new TextEntry(), new TextEntry { Focusable = false },
            new TextEditor(controller) { Focusable = false }
        } });
        var input = new InputCoordinator();
        try
        {
            Assert.True(root.Children[0].Focusable);
            Assert.False(root.Children[1].Focusable);
            Assert.True(root.Children[2].Focusable);
            Assert.False(root.Children[3].Focusable);
            Assert.False(root.Children[4].Focusable);
            Assert.False(input.FocusElement(resolver, root.Children[1]));
            Assert.False(input.FocusElement(resolver, root.Children[3]));
            Assert.False(input.FocusElement(resolver, root.Children[4]));
            reconciler.Diff(root.Children[1], new Button());
            Assert.True(root.Children[1].Focusable);
            Assert.True(input.FocusElement(resolver, root.Children[0]));
            reconciler.Diff(root.Children[0], new Button { Focusable = false });
            input.AfterTreeUpdated(root, resolver, true);
            Assert.Null(input.FocusedNode());
        }
        finally { input.Dispose(); TextLayouts.DisposeTree(root); controller.Dispose(); }
    }

    [Fact]
    public void SequentialFocusSkipsCompositeChildrenButExplicitFocusRemainsAvailable()
    {
        var resolver = new Resolver();
        var reconciler = new Reconciler { Res = resolver };
        var root = reconciler.Mount(new Container
        {
            Children = {
                new Button { Key = "before" },
                new Button { Key = "composite", TabStop = false },
                new Button { Key = "after" }
            }
        });
        var text = new TextInput();
        var keyboard = new KeyboardInput();
        try
        {
            text.SetFocus(resolver, root.Children[0]);
            Press(new KeyModifiers());
            Assert.True(root.Children[2].Focused);
            Press(new KeyModifiers { Shift = true });
            Assert.True(root.Children[0].Focused);
            Assert.True(root.Children[1].Focusable);
            text.SetFocus(resolver, root.Children[1]);
            Assert.True(root.Children[1].Focused);
            reconciler.Diff(root.Children[1], new Button { Key = "composite", TabStop = false, AutoFocus = true });
            reconciler.Diff(root.Children[1], new Button { Key = "composite", TabStop = false });
            Assert.False(root.Children[1].TabStop);
            reconciler.Diff(root.Children[1], new Button { Key = "composite" });
            text.SetFocus(resolver, root.Children[0]);
            Press(new KeyModifiers());
            Assert.True(root.Children[1].Focused);
        }
        finally { text.Dispose(); }

        void Press(KeyModifiers modifiers)
        {
            keyboard.QueueKeyPress(Key.Tab, modifiers);
            keyboard.QueueKeyRelease(Key.Tab, modifiers);
            keyboard.Drain(root, resolver, text, null);
        }
    }
}
