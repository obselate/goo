using System;
using System.Linq;
using Goo;
using Xunit;

public sealed class CustomLayoutTests
{
    [Fact]
    public void WrappedSubtreesAndImagesMeasureAtTheirAssignedWidthAndRetainIdentityOnResize()
    {
        using var image = new ImageSource(20, 12, new byte[20 * 12 * 4]);
        var policy = new Columns();
        var reconciler = new Reconciler { Res = new Resolver() };
        var root = reconciler.Mount(Scene(policy, image, "A wrapped paragraph with several words repeated to need more lines when its track becomes narrower."));
        try
        {
            var layout = new Layout();
            layout.Calculate(root, 360, 800);
            var panel = root.Children[0];
            var nodes = panel.Children.ToArray();
            var yoga = nodes.Select(n => n.Yoga).ToArray();
            var wideHeight = panel.Rect.H;
            Assert.Equal(20, policy.IntrinsicImage.Width);
            Assert.Equal(12, policy.IntrinsicImage.Height);
            Assert.Equal(60, nodes[0].Rect.W);
            Assert.Equal(68, nodes[1].Rect.X);
            Assert.True(nodes[1].Rect.H >= 20);
            var calls = policy.Arranges;
            layout.Calculate(root, 360, 800);
            layout.RefreshRects(root);
            Assert.Equal(calls, policy.Arranges);
            layout.Calculate(root, 180, 800);
            Assert.True(panel.Rect.H > wideHeight, $"Expected wrapping growth: {wideHeight} -> {panel.Rect.H}");
            for (var i = 0; i < nodes.Length; i++)
            {
                Assert.Same(nodes[i], panel.Children[i]);
                Assert.Same(yoga[i], panel.Children[i].Yoga);
            }
        }
        finally { NodeLifecycle.DisposeTree(root); }
    }

    [Fact]
    public void ContentAndFontChangesDirtyTheDetachedChildAndItsCustomParent()
    {
        using var image = new ImageSource(20, 12, new byte[20 * 12 * 4]);
        var policy = new Columns();
        var reconciler = new Reconciler { Res = new Resolver() };
        var root = reconciler.Mount(Scene(policy, image, "short"));
        try
        {
            var layout = new Layout();
            layout.Calculate(root, 200, 800);
            var panel = root.Children[0];
            var text = panel.Children[1].Children[0];
            var first = panel.Rect.H;
            root = reconciler.Diff(root, Scene(policy, image, "Many more words must wrap across several lines and cause the retained panel to grow after content changes.", 24));
            Assert.Same(text, root.Children[0].Children[1].Children[0]);
            Assert.True(layout.NeedsLayout(root));
            layout.MarkStructureDirty();
            layout.Calculate(root, 200, 800);
            Assert.True(panel.Rect.H > first);
        }
        finally { NodeLifecycle.DisposeTree(root); }
    }

    [Fact]
    public void RemovingThePolicyRestoresAuthoredChildSizesAndYogaOwnership()
    {
        var policy = new Rows(50);
        var reconciler = new Reconciler { Res = new Resolver() };
        Container Scene(LayoutAlgorithm? algorithm) => new()
        {
            Width = 200, Height = 150, Layout = algorithm,
            Children = { new Container { Key = "one", Width = 30, Height = 20 }, new Container { Key = "two", Width = 40, Height = 25 } }
        };
        var root = reconciler.Mount(Scene(policy));
        try
        {
            var layout = new Layout();
            layout.Calculate(root, 200, 150);
            var first = root.Children[0];
            Assert.Equal(200, first.Rect.W);
            Assert.Null(first.Yoga!.GetOwner());
            root = reconciler.Diff(root, Scene(null));
            layout.MarkStructureDirty();
            layout.Calculate(root, 200, 150);
            Assert.Same(first, root.Children[0]);
            Assert.Same(root.Yoga, first.Yoga!.GetOwner());
            Assert.Equal(30, first.Rect.W);
            Assert.Equal(20, first.Rect.H);
            Assert.Equal(20, root.Children[1].Rect.Y);
        }
        finally { NodeLifecycle.DisposeTree(root); }
    }

    [Fact]
    public void CustomPositionsDriveScrollExtentAndRectRefreshWithoutAnotherArrange()
    {
        var policy = new Rows(40);
        var root = new Reconciler { Res = new Resolver() }.Mount(new Container
        {
            Width = 120, Height = 50, Layout = policy, Padding = 5, OverflowY = Overflow.Scroll,
            Children = { new Container(), new Container(), new Container() }
        });
        try
        {
            var layout = new Layout();
            layout.Calculate(root, 120, 50);
            Assert.Equal(130, root.ContentH);
            Assert.Equal(85, root.Children[2].Rect.Y);
            var calls = policy.Arranges;
            root.ScrollY = root.ScrollTargetY = 80;
            layout.RefreshRects(root);
            Assert.Equal(5, root.Children[2].Rect.Y);
            Assert.Equal(calls, policy.Arranges);
        }
        finally { NodeLifecycle.DisposeTree(root); }
    }

    [Fact]
    public void ContextExpiresAfterItsCallbackAndMeasurementCallsAreBounded()
    {
        var policy = new Rows(20);
        var root = new Reconciler { Res = new Resolver() }.Mount(new Container { Width = 100, Height = 100, Layout = policy, Children = { new Container() } });
        try
        {
            new Layout().Calculate(root, 100, 100);
            Assert.Throws<InvalidOperationException>(() => policy.Context!.MeasureChild(0, Size(100, 100)));
            Assert.Throws<InvalidOperationException>(() => { _ = policy.Context!.ChildCount; });
        }
        finally { NodeLifecycle.DisposeTree(root); }
        AssertPolicyFails<InvalidOperationException>(new Faulty((context, size) =>
        {
            for (var i = 0; i < 33; i++) context.MeasureChild(0, Size(100, 100));
        }));
    }

    [Fact]
    public void InvalidArrangementAndReentrantLayoutFailWithoutLeavingActiveState()
    {
        AssertPolicyFails<InvalidOperationException>(new Faulty((context, size) => { }));
        AssertPolicyFails<ArgumentOutOfRangeException>(new Faulty((context, size) => context.ArrangeChild(0, new() { Width = double.NaN })));
        AssertPolicyFails<ArgumentOutOfRangeException>(new Faulty((context, size) => context.MeasureChild(0, Size(-1, 100))));
        AssertPolicyFails<InvalidOperationException>(new Faulty((context, size) =>
        {
            context.ArrangeChild(0, new() { Width = 10, Height = 10 });
            context.ArrangeChild(0, new() { Width = 10, Height = 10 });
        }));
        Node? root = null;
        var policy = new Faulty((context, size) => new Layout().Calculate(root!, 100, 100));
        root = new Reconciler { Res = new Resolver() }.Mount(new Container { Width = 100, Height = 100, Layout = policy, Children = { new Container() } });
        try { Assert.Throws<InvalidOperationException>(() => new Layout().Calculate(root, 100, 100)); }
        finally { NodeLifecycle.DisposeTree(root); }
        Assert.Equal(0, CustomLayouts.Depth);
    }

    [Fact]
    public void NestedMeasurementsCannotReplaceTheFinalArrangedChildGeometry()
    {
        using var image = new ImageSource(20, 12, new byte[20 * 12 * 4]);
        var inner = new Columns();
        Container SceneAt(double probe) => new()
        {
            Width = 400, Height = 400,
            Layout = new Faulty((context, size) =>
            {
                context.MeasureChild(0, Size(probe, double.PositiveInfinity));
                context.ArrangeChild(0, new() { Width = 200, Height = 300 });
            }),
            Children = { Scene(inner, image, "A nested wrapping paragraph with enough words for several lines.").Children[0] }
        };
        var reconciler = new Reconciler { Res = new Resolver() };
        var root = reconciler.Mount(SceneAt(80));
        try
        {
            var layout = new Layout();
            layout.Calculate(root, 400, 400);
            var child = root.Children[0].Children[1];
            Assert.Equal(132, child.Rect.W);
            root = reconciler.Diff(root, SceneAt(100));
            layout.MarkStructureDirty();
            layout.Calculate(root, 400, 400);
            Assert.Same(child, root.Children[0].Children[1]);
            Assert.Equal(132, child.Rect.W);
        }
        finally { NodeLifecycle.DisposeTree(root); }
    }

    [Fact]
    public void LayoutTransitionsIncludeTheCustomPlacementOffset()
    {
        var pump = new MotionPump();
        var reconciler = new Reconciler { Res = new Resolver(), Pump = pump, RetainedInvalidated = _ => { } };
        Container SceneAt(double height) => new()
        {
            Width = 200, Height = 300, Layout = new Rows(height),
            Children = { new Container { Key = "one" }, new Container { Key = "two", LayoutTransition = new LayoutTransition { DurationMs = 100, Easing = Easing.Linear } } }
        };
        var root = reconciler.Mount(SceneAt(50));
        try
        {
            var layout = new Layout();
            layout.Calculate(root, 200, 300);
            var second = root.Children[1];
            Assert.Equal(50, second.Rect.Y);
            root = reconciler.Diff(root, SceneAt(100));
            layout.MarkStructureDirty();
            layout.Calculate(root, 200, 300);
            Assert.Equal(50, second.Rect.Y);
            pump.Sweep(.05);
            layout.RefreshRects(root);
            Assert.InRange(second.Rect.Y, 74.99f, 75.01f);
            pump.Sweep(.05);
            layout.RefreshRects(root);
            Assert.Equal(100, second.Rect.Y);
        }
        finally { NodeLifecycle.DisposeTree(root); }
    }

    [Fact]
    public void ImageDimensionsInvalidateTheRetainedCustomMeasurement()
    {
        using var small = new ImageSource(20, 12, new byte[20 * 12 * 4]);
        using var tall = new ImageSource(20, 300, new byte[20 * 300 * 4]);
        var policy = new Columns();
        var reconciler = new Reconciler { Res = new Resolver() };
        var root = reconciler.Mount(Scene(policy, small, "short"));
        try
        {
            var layout = new Layout();
            layout.Calculate(root, 250, 800);
            var image = root.Children[0].Children[0];
            var height = root.Children[0].Rect.H;
            root = reconciler.Diff(root, Scene(policy, tall, "short"));
            layout.MarkStructureDirty();
            layout.Calculate(root, 250, 800);
            Assert.Same(image, root.Children[0].Children[0]);
            Assert.True(root.Children[0].Rect.H > height);
            Assert.Equal(300, policy.IntrinsicImage.Height);
        }
        finally { NodeLifecycle.DisposeTree(root); }
    }

    [Fact]
    public void ContextRejectsOtherThreadsDuringAnActiveCallback()
    {
        Exception? error = null;
        var policy = new Faulty((context, size) =>
        {
            var worker = new System.Threading.Thread(() =>
            {
                try { context.MeasureChild(0, Size(100, 100)); }
                catch (Exception failure) { error = failure; }
            });
            worker.Start();
            worker.Join();
            context.ArrangeChild(0, new() { Width = 100, Height = 100 });
        });
        var root = new Reconciler { Res = new Resolver() }.Mount(new Container { Width = 100, Height = 100, Layout = policy, Children = { new Container() } });
        try
        {
            new Layout().Calculate(root, 100, 100);
            Assert.IsType<InvalidOperationException>(error);
        }
        finally { NodeLifecycle.DisposeTree(root); }
    }

    private static void AssertPolicyFails<T>(LayoutAlgorithm policy) where T : Exception
    {
        var root = new Reconciler { Res = new Resolver() }.Mount(new Container { Width = 100, Height = 100, Layout = policy, Children = { new Container() } });
        try { Assert.Throws<T>(() => new Layout().Calculate(root, 100, 100)); }
        finally { NodeLifecycle.DisposeTree(root); }
        Assert.Equal(0, CustomLayouts.Depth);
    }

    private static Container Scene(LayoutAlgorithm policy, ImageSource image, string text, int font = 16) => new()
    {
        Height = 800,
        Children =
        {
            new Container
            {
                Key = "panel", Layout = policy, Width = Length.Percent(100),
                Children =
                {
                    new Image { Key = "image", Source = image },
                    new Container { Key = "wrapped", Children = { new Text(text) { FontSize = font } } },
                    new Container { Key = "fixed", Width = 25, Height = 30 },
                    new Container { Key = "nested", Padding = 3, Children = { new Container { Height = 18 } } }
                }
            }
        }
    };
    private static LayoutSize Size(double width, double height) => new() { Width = width, Height = height };

    private sealed class Columns : LayoutAlgorithm
    {
        public int Arranges;
        public LayoutSize IntrinsicImage;
        public LayoutSize Measure(LayoutContext context, LayoutSize available)
        {
            var width = double.IsPositiveInfinity(available.Width) ? 300 : available.Width;
            IntrinsicImage = context.MeasureChild(0, Size(double.PositiveInfinity, double.PositiveInfinity));
            var height = 0.0;
            for (var row = 0; row < context.ChildCount / 2; row++)
                height += Math.Max(context.MeasureChild(row * 2, Size(60, double.PositiveInfinity)).Height,
                                   context.MeasureChild(row * 2 + 1, Size(Math.Max(0, width - 68), double.PositiveInfinity)).Height) + (row == 0 ? 0 : 8);
            return Size(width, height);
        }
        public void Arrange(LayoutContext context, LayoutSize finalSize)
        {
            Arranges++;
            var y = 0.0;
            for (var row = 0; row < context.ChildCount / 2; row++)
            {
                var right = Math.Max(0, finalSize.Width - 68);
                var height = Math.Max(context.MeasureChild(row * 2, Size(60, double.PositiveInfinity)).Height,
                                      context.MeasureChild(row * 2 + 1, Size(right, double.PositiveInfinity)).Height);
                context.ArrangeChild(row * 2, new() { Y = y, Width = 60, Height = height });
                context.ArrangeChild(row * 2 + 1, new() { X = 68, Y = y, Width = right, Height = height });
                y += height + 8;
            }
        }
    }
    private sealed class Rows(double height) : LayoutAlgorithm
    {
        public int Arranges;
        public LayoutContext? Context;
        public LayoutSize Measure(LayoutContext context, LayoutSize available) => Size(double.IsFinite(available.Width) ? available.Width : 100, context.ChildCount * height);
        public void Arrange(LayoutContext context, LayoutSize finalSize)
        {
            Arranges++;
            Context = context;
            for (var i = 0; i < context.ChildCount; i++)
                context.ArrangeChild(i, new() { Y = i * height, Width = finalSize.Width, Height = height });
        }
    }
    private sealed class Faulty(Action<LayoutContext, LayoutSize> arrange) : LayoutAlgorithm
    {
        public LayoutSize Measure(LayoutContext context, LayoutSize available) => Size(100, 100);
        public void Arrange(LayoutContext context, LayoutSize finalSize) => arrange(context, finalSize);
    }
}
