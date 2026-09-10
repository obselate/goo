using System;
using Goo;
using Xunit;

public sealed class TouchScrollTests
{
    [Fact]
    public void TouchPanChainsNestedScrollersAndCancelsClickWhileCaptureKeepsControl()
    {
        using var host = new Host();
        host.Resize(120, 120, 120, 120);
        var cell = new ScrollCell();
        var window = new Window { Root = cell }.Attach(host);
        host.RenderFrame(0);
        var input = window.PlatformInput;

        input.PointerPress(1, PointerDevice.Touch, 20, 60, PointerButton.Primary, default, 1);
        input.PointerMove(1, PointerDevice.Touch, 20, -80, default, 1);
        input.PointerRelease(1, PointerDevice.Touch, 20, -80, PointerButton.Primary, default, 0);
        window.UpdateTree(1);
        Assert.Equal(cell.Inner.ScrollRange.Y, cell.Inner.ScrollOffset.Y);
        Assert.Equal(140 - cell.Inner.ScrollRange.Y, cell.Outer.ScrollOffset.Y, 3);
        Assert.Equal(1, cell.Cancels);
        Assert.Equal(0, cell.Clicks);

        cell.Outer.JumpTo(0, 0);
        cell.Inner.JumpTo(0, 0);
        host.RenderFrame(0);
        cell.Capture = true;
        input.PointerPress(2, PointerDevice.Touch, 20, 60, PointerButton.Primary, default, 1);
        input.PointerMove(2, PointerDevice.Touch, 20, 20, default, 1);
        input.PointerRelease(2, PointerDevice.Touch, 20, 20, PointerButton.Primary, default, 0);
        window.UpdateTree(1);
        Assert.Equal(0, cell.Inner.ScrollOffset.Y);
        Assert.Equal(0, cell.Outer.ScrollOffset.Y);
        Assert.Equal(1, cell.Clicks);
        Assert.Equal(1, cell.Cancels);

        cell.Capture = false;
        cell.PreventMove = true;
        input.PointerPress(3, PointerDevice.Touch, 20, 60, PointerButton.Primary, default, 1);
        input.PointerMove(3, PointerDevice.Touch, 20, 20, default, 1);
        input.PointerRelease(3, PointerDevice.Touch, 20, 20, PointerButton.Primary, default, 0);
        window.UpdateTree(1);
        Assert.Equal(0, cell.Inner.ScrollOffset.Y);
        Assert.Equal(0, cell.Outer.ScrollOffset.Y);

        cell.PreventMove = false;
        input.PointerPress(4, PointerDevice.Touch, 20, 60, PointerButton.Primary, default, 1);
        input.PointerMove(4, PointerDevice.Touch, 20, 20, default, 1);
        input.PointerCancel(4, PointerDevice.Touch);
        input.PointerMove(4, PointerDevice.Touch, 20, -80, default, 1);
        input.PointerRelease(4, PointerDevice.Touch, 20, -80, PointerButton.Primary, default, 0);
        window.UpdateTree(1);
        Assert.Equal(40, cell.Inner.ScrollOffset.Y);
        Assert.Equal(0, cell.Outer.ScrollOffset.Y);
    }

    private sealed class ScrollCell : Cell
    {
        public ElementHandle Outer = new();
        public ElementHandle Inner = new();
        public bool Capture;
        public bool PreventMove;
        public int Clicks;
        public int Cancels;

        public override Blob Build() => new Container
        {
            Handle = Outer, Width = 120.0, Height = 120.0,
            OverflowY = Overflow.Scroll, FlexDirection = FlexDirection.Column,
            Children = new Blob[]
            {
                new Container
                {
                    Handle = Inner, Width = 120.0, Height = 80.0, FlexShrink = 0,
                    OverflowY = Overflow.Scroll, FlexDirection = FlexDirection.Column,
                    Children = new Blob[]
                    {
                        new Container
                        {
                            Width = 100.0, Height = 160.0, FlexShrink = 0,
                            OnPointerDown = e => { if (Capture) e.Capture(); },
                            OnPointerMove = e => { if (PreventMove) e.PreventDefault(); },
                            OnPointerCancel = e => Cancels++,
                            OnClick = () => Clicks++
                        }
                    }
                },
                new Container { Width = 120.0, Height = 300.0, FlexShrink = 0 }
            }
        };
    }

    private sealed class Host : EmbeddedWindowHost
    {
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
    }
}
