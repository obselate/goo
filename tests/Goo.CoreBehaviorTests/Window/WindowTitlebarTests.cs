using System;
using System.Reflection;
using Goo;
using Xunit;

public sealed class WindowTitlebarTests
{
    [Fact]
    public void NativeDoubleClickExcludesControlsAndPreservesHandledState()
    {
        var window = new Window { Width = 300, Height = 100, Decorated = false };
        var root = new Reconciler { Res = new Resolver() }.Mount(Window.DragRegion(new Container
        {
            Width = 300.0, Height = 32.0, FlexDirection = FlexDirection.Row,
            Children =
            {
                new Button { Width = 50.0, Height = 32.0, OnClick = () => { } },
                new Container { Width = 50.0, Height = 32.0, Focusable = true },
                new Container { FlexGrow = 1.0 },
            },
        }));
        new Layout().Calculate(root, 300, 100);
        typeof(Window).GetField("node", BindingFlags.Instance | BindingFlags.NonPublic)!.SetValue(window, root);
        var calls = 0;
        Action<WindowTitlebarEvent> callback = value =>
        {
            Assert.Equal(150.0, value.Position.X);
            Assert.Equal(16.0, value.Position.Y);
            calls++;
            value.Handled = true;
        };
        Action<WindowTitlebarEvent> observer = value => Assert.True(value.Handled);
        window.TitlebarDoubleClicked += callback;
        window.TitlebarDoubleClicked += observer;

        Assert.True(window.NativeTitlebarDoubleClick(150, 16));
        Assert.False(window.NativeTitlebarDoubleClick(25, 16));
        Assert.False(window.NativeTitlebarDoubleClick(75, 16));
        Assert.False(window.NativeTitlebarDoubleClick(150, 1));
        Assert.False(window.NativeTitlebarDoubleClick(150, 50));
        Assert.False(window.NativeTitlebarDoubleClick(double.NaN, 16));
        Assert.False(window.NativeTitlebarDoubleClick(300, 16));
        Assert.Equal(1, calls);
        window.Decorated = true;
        Assert.False(window.NativeTitlebarDoubleClick(150, 16));
        window.Decorated = false;
        window.TitlebarDoubleClicked -= observer;
        window.TitlebarDoubleClicked -= callback;
        Assert.Null(WindowTitlebarCallbacks.Get(window));
        Assert.False(window.NativeTitlebarDoubleClick(150, 16));
        Assert.Equal(1, calls);
    }

    [Fact]
    public void NativeDoubleClickLeavesDefaultActionUnlessHandled()
    {
        var window = new Window { Width = 200, Height = 100, Decorated = false };
        var root = new Reconciler { Res = new Resolver() }.Mount(Window.DragRegion(new Container { Width = 200.0, Height = 32.0 }));
        new Layout().Calculate(root, 200, 100);
        typeof(Window).GetField("node", BindingFlags.Instance | BindingFlags.NonPublic)!.SetValue(window, root);
        var calls = 0;
        window.TitlebarDoubleClicked += value => calls++;
        Assert.False(window.NativeTitlebarDoubleClick(100, 16));
        Assert.Equal(1, calls);
    }
}
