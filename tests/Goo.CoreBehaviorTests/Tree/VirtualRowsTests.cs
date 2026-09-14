using System;
using System.Collections.Generic;
using System.Linq;
using Goo;
using Xunit;

public sealed class VirtualRowsTests
{
    [Fact]
    public void PrefixIndexMatchesLinearOffsetsAfterMeasuredHeightChanges()
    {
        var random = new Random(123);
        var heights = Enumerable.Range(0, 300).Select(_ => (float)random.Next(0, 80)).ToArray();
        var index = new VirtualRowIndex(heights, 3);
        for (var step = 0; step < 100; step++)
        {
            var item = random.Next(heights.Length);
            var next = random.Next(0, 120);
            index.Add(item, next - heights[item]);
            heights[item] = next;
            var sum = 0.0;
            for (var i = 0; i < heights.Length; i++)
            {
                Assert.Equal(sum, index.Prefix(i));
                Assert.Equal(i, index.Find(sum));
                Assert.Equal(i, index.Find(sum + heights[i] + 2.5));
                sum += heights[i] + 3;
            }
            Assert.Equal(sum, index.Prefix(heights.Length));
        }
        Assert.Equal(0, new VirtualRowIndex(Array.Empty<float>(), 0).Find(0));
        Assert.Equal(2, new VirtualRowIndex(new float[] { 0, 0, 8 }, 0).Find(0));
    }

    [Fact]
    public void AlternatingHeightsUseMeasuredPositionsAndOnlyRealizeTheViewport()
    {
        var cell = new Rows(10000);
        var window = new Window { Root = cell, Width = 240, Height = 120 };
        try
        {
            Settle(window);
            var root = window.Tree!;
            Assert.InRange(root.Children.Count, 4, 8);
            Assert.True(cell.Builds < 12);
            AssertRowsTouch(root, 3);
            var nodes = root.Children.ToArray();
            var builds = cell.Builds;
            for (var i = 0; i < 5; i++) window.UpdateTree();
            Assert.Equal(builds, cell.Builds);
            Assert.Equal(nodes, root.Children.ToArray());
            Assert.True(cell.Handle.ScrollToItem("5000"));
            Settle(window);
            Assert.Contains(root.Children, n => n.Key == "5000");
            Assert.InRange(cell.Handles[5000].BorderBox.Y, -.02, .02);
            AssertRowsTouch(root, 3);
            Assert.False(cell.Handles[0].IsMounted);
        }
        finally { window.Close(); }
        Assert.False(cell.Handle.ScrollToItem("5000"));
    }

    [Fact]
    public void InsertingAndExpandingEarlierRowsPreservesTheVisibleKeyAndPixelOffset()
    {
        var cell = new Rows(500);
        var window = new Window { Root = cell, Width = 240, Height = 120 };
        try
        {
            Settle(window);
            Assert.True(cell.Handle.ScrollToItem("200"));
            Settle(window);
            Assert.True(cell.Handle.JumpTo(0, cell.Handle.ScrollOffset.Y + 7));
            Settle(window);
            var node = window.Tree!.Children.Single(n => n.Key == "200");
            var y = cell.Handles[200].BorderBox.Y;
            cell.Items.Insert(0, new Row(1001, 75));
            cell.Rebuild();
            Settle(window);
            Assert.Equal(y, cell.Handles[200].BorderBox.Y, 2);
            Assert.Same(node, window.Tree.Children.Single(n => n.Key == "200"));
            var earlier = cell.Items.FindIndex(r => r.Id == 199);
            cell.Items[earlier] = cell.Items[earlier] with { Height = 140 };
            cell.Rebuild();
            Settle(window);
            Assert.Equal(y, cell.Handles[200].BorderBox.Y, 2);
            AssertRowsTouch(window.Tree, 3);
        }
        finally { window.Close(); }
    }

    [Fact]
    public void WrappedContentRemeasuresOnWidthAndContentChanges()
    {
        var cell = new Rows(100) { Wrapped = true };
        var window = new Window { Root = cell, Width = 420, Height = 220 };
        try
        {
            Settle(window);
            cell.Handle.ScrollToItem("20");
            Settle(window);
            var height = cell.Handles[20].BorderBox.Height;
            var node = window.Tree!.Children.Single(n => n.Key == "20");
            window.Width = 180;
            Settle(window);
            Assert.True(cell.Handles[20].BorderBox.Height > height);
            Assert.InRange(cell.Handles[20].BorderBox.Y, -.02, .02);
            Assert.Same(node, window.Tree.Children.Single(n => n.Key == "20"));
            height = cell.Handles[20].BorderBox.Height;
            cell.Items[20] = cell.Items[20] with { Text = "short" };
            cell.Rebuild();
            Settle(window);
            Assert.True(cell.Handles[20].BorderBox.Height < height);
            AssertRowsTouch(window.Tree, 3);
        }
        finally { window.Close(); }
    }

    [Fact]
    public void FocusedRowRemainsMountedOutsideTheViewportUntilBlurred()
    {
        var cell = new Rows(500);
        var window = new Window { Root = cell, Width = 240, Height = 120 };
        try
        {
            Settle(window);
            var first = window.Tree!.Children.Single(n => n.Key == "0");
            Assert.True(cell.Handles[0].Focus());
            cell.Handle.ScrollToItem("300");
            Settle(window);
            Assert.True(cell.Handles[0].IsMounted);
            Assert.Same(first, window.Tree.Children.Single(n => n.Key == "0"));
            Assert.True(first.Children[0].Focused);
            Assert.True(cell.Handles[0].Blur());
            Settle(window);
            Assert.False(cell.Handles[0].IsMounted);
        }
        finally { window.Close(); }
    }

    [Fact]
    public void FailedBuilderLeavesCommittedExtentAndScrollAnchorUsable()
    {
        var cell = new Rows(500);
        var window = new Window { Root = cell, Width = 240, Height = 120 };
        try
        {
            Settle(window);
            cell.Handle.ScrollToItem("200");
            Settle(window);
            var range = cell.Handle.ScrollRange.Y;
            var scroll = cell.Handle.ScrollOffset.Y;
            cell.Items[200] = cell.Items[200] with { Height = 130 };
            cell.Fail = true;
            cell.Rebuild();
            Assert.Throws<InvalidOperationException>(() => window.UpdateTree());
            Assert.Equal(range, cell.Handle.ScrollRange.Y);
            Assert.Equal(scroll, cell.Handle.ScrollOffset.Y);
            cell.Fail = false;
            cell.Rebuild();
            Settle(window);
            Assert.Equal(130, cell.Handles[200].BorderBox.Height);
            Assert.InRange(cell.Handles[200].BorderBox.Y, -.02, .02);
        }
        finally { window.Close(); }
    }

    [Fact]
    public void LargeViewportContinuesMeasuringAcrossFramesAndThenBecomesIdle()
    {
        var cell = new Rows(2000) { Gap = 0, Estimate = 1 };
        for (var i = 0; i < cell.Items.Count; i++) cell.Items[i] = cell.Items[i] with { Height = 1 };
        var window = new Window { Root = cell, Width = 240, Height = 800 };
        try
        {
            window.UpdateTree();
            Assert.True(Virtualization.State(window.Tree!)!.NeedsContinuation(window.Tree!));
            Settle(window);
            Assert.False(Virtualization.State(window.Tree!)!.NeedsContinuation(window.Tree!));
            Assert.Equal(1200, cell.Handle.ScrollRange.Y);
            Assert.InRange(window.Tree!.Children.Count, 800, 804);
        }
        finally { window.Close(); }
    }

    [Fact]
    public void WarmMeasuredListDoesNotAllocateOnAnUnchangedFrame()
    {
        var window = new Window { Root = new Rows(1000), Width = 240, Height = 120 };
        try
        {
            Settle(window);
            for (var i = 0; i < 10; i++) window.UpdateTree();
            var before = GC.GetAllocatedBytesForCurrentThread();
            window.UpdateTree();
            Assert.Equal(0, GC.GetAllocatedBytesForCurrentThread() - before);
        }
        finally { window.Close(); }
    }

    [Fact]
    public void FractionalMeasuredHeightsDoNotChooseThePreviousRowAtAStableKeyBoundary()
    {
        var cell = new Rows(1000) { Estimate = 100, Gap = 10 };
        for (var i = 0; i < cell.Items.Count; i++) cell.Items[i] = cell.Items[i] with { Height = i % 2 == 0 ? 116.8 : 75.6 };
        var window = new Window { Root = cell, Width = 240, Height = 520 };
        try
        {
            Settle(window);
            cell.Handle.ScrollToItem("400");
            Settle(window);
            Assert.InRange(cell.Handles[400].BorderBox.Y, -.01, .01);
        }
        finally { window.Close(); }
    }

    [Fact]
    public void DuplicateKeysAndUnsupportedLayoutsFailExplicitly()
    {
        var cell = new Rows(5);
        cell.Items[4] = cell.Items[0];
        var window = new Window { Root = cell, Width = 240, Height = 120 };
        try { Assert.Throws<InvalidOperationException>(() => window.UpdateTree()); }
        finally { window.Close(); }
        Assert.Throws<ArgumentException>(() => new ElementHandle().ScrollToItem(""));
        Assert.False(new ElementHandle().ScrollToItem("missing"));
        var state = new VirtualRowsStorage<int>();
        Assert.Throws<InvalidOperationException>(() => state.Prepare(new Node { FlexDirection = FlexDirection.Row }, new[] { 1 }, 10, i => i.ToString(), i => new Container()));
    }

    private static void Settle(Window window)
    {
        for (var i = 0; i < 30; i++)
        {
            window.UpdateTree();
            if (window.Tree is { } root && Virtualization.State(root)?.NeedsContinuation(root) == false) return;
        }
        throw new Exception("Measured rows did not settle within 30 frames");
    }

    private static void AssertRowsTouch(Node root, double gap)
    {
        for (var i = 1; i < root.Children.Count; i++)
        {
            var before = root.Children[i - 1].Rect;
            Assert.Equal(before.Y + before.H + gap, root.Children[i].Rect.Y, 2);
        }
    }

    private sealed record Row(int Id, double Height, string Text = "A wrapping paragraph with enough words to occupy several lines as the available width becomes narrower.");
    private sealed class Rows : Cell
    {
        public readonly List<Row> Items;
        public readonly Dictionary<int, ElementHandle> Handles = new();
        public readonly ElementHandle Handle = new();
        public bool Wrapped, Fail;
        public double Gap = 3;
        public float Estimate = 32;
        public int Builds;
        private readonly Func<Row, Blob> builder;
        public Rows(int count)
        {
            Items = Enumerable.Range(0, count).Select(i => new Row(i, i % 2 == 0 ? 20 : 60)).ToList();
            builder = BuildRow;
        }
        public override Blob Build() => new VirtualRowsBlob<Row>(Items, Estimate, r => r.Id.ToString(), builder)
        {
            Handle = Handle, Width = Length.Percent(100), Height = Length.Percent(100), RowGap = Gap,
            Position = PositionType.Relative, OverflowX = Overflow.Hidden, OverflowY = Overflow.Scroll
        };
        private Blob BuildRow(Row row)
        {
            if (Fail) throw new InvalidOperationException("row builder failed");
            Builds++;
            if (!Handles.TryGetValue(row.Id, out var handle)) Handles.Add(row.Id, handle = new());
            return Wrapped
                ? new Container { Handle = handle, Focusable = true, Children = { new Text(row.Text) { FontSize = 16 } } }
                : new Container { Handle = handle, Focusable = true, Height = row.Height };
        }
    }
}
