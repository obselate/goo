using Goo;
using Xunit;

public sealed class TabStopTests
{
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
