using System;
using Goo;
using Goo.FSharpInterop;
using Xunit;

public sealed class CellFactoryInteropTests
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void FSharpFactoryMountReadsCurrentStateAndOwnsReuseAndRetirement(bool useCurriedFactory)
    {
        var store = new MountStore("initial", 1);
        var scenario = new MountScenario(store, "slot", useCurriedFactory);
        var window = new Window { Root = scenario.Root, Width = 120, Height = 40 };

        window.UpdateTree();
        var firstTree = window.Tree;
        Assert.NotNull(firstTree);
        var firstNode = Assert.Single(firstTree!.Children);
        var firstCell = store.CreatedCell;
        Assert.NotNull(firstCell);
        Assert.Equal("initial:1", firstNode.Content);
        Assert.Equal(1, store.FactoryCalls);
        var firstState = Assert.IsAssignableFrom<ITrackedCell>(firstCell);
        Assert.Equal(1, firstState.BuildCount);
        Assert.False(firstState.WasDisposed);

        store.Payload = "updated";
        store.Tick = 2;
        firstCell!.Rebuild();
        window.UpdateTree();

        var rebuiltTree = window.Tree;
        Assert.NotNull(rebuiltTree);
        var rebuiltNode = Assert.Single(rebuiltTree!.Children);
        Assert.Equal("updated:2", rebuiltNode.Content);
        Assert.Same(firstCell, rebuiltNode.Fiber);
        Assert.Equal(1, store.FactoryCalls);
        Assert.Equal(2, store.ReaderCalls);
        Assert.Equal(2, firstState.BuildCount);

        scenario.Root.Rebuild();
        window.UpdateTree();
        var parentRebuiltTree = window.Tree;
        Assert.NotNull(parentRebuiltTree);
        var parentRebuiltNode = Assert.Single(parentRebuiltTree!.Children);
        Assert.Same(firstCell, parentRebuiltNode.Fiber);
        Assert.Same(firstCell, store.CreatedCell);
        Assert.Equal(1, store.FactoryCalls);
        Assert.Equal(2, firstState.BuildCount);

        scenario.ChildVisible = false;
        scenario.Root.Rebuild();
        window.UpdateTree();
        var removedTree = window.Tree;
        Assert.NotNull(removedTree);
        Assert.Empty(removedTree!.Children);
        Assert.Equal(1, store.DisposalCalls);
        Assert.True(firstState.WasDisposed);

        scenario.ChildVisible = true;
        scenario.Root.Rebuild();
        window.UpdateTree();
        var remountedCell = store.CreatedCell;
        Assert.NotNull(remountedCell);
        Assert.NotSame(firstCell, remountedCell);
        Assert.Equal(2, store.FactoryCalls);
        Assert.Equal(1, store.DisposalCalls);
        var remountedState = Assert.IsAssignableFrom<ITrackedCell>(remountedCell);
        Assert.False(remountedState.WasDisposed);

        scenario.Key = "other";
        scenario.Root.Rebuild();
        window.UpdateTree();
        var differentKeyCell = store.CreatedCell;
        Assert.NotNull(differentKeyCell);
        Assert.NotSame(remountedCell, differentKeyCell);
        Assert.Equal(3, store.FactoryCalls);
        Assert.Equal(2, store.DisposalCalls);
        Assert.True(remountedState.WasDisposed);
        var differentKeyState = Assert.IsAssignableFrom<ITrackedCell>(differentKeyCell);
        Assert.False(differentKeyState.WasDisposed);

        window.Close();
        Assert.Equal(3, store.DisposalCalls);
    }

    [Fact]
    public void CSharpFactoryInfersParameterizedCellAndGooOwnsItsLifetime()
    {
        var factoryCalls = 0;
        ParameterizedCell? first = null;
        var firstMount = Cell.Mount(() =>
        {
            factoryCalls++;
            return first = new ParameterizedCell("first");
        }, "slot");

        Assert.Equal(0, factoryCalls);
        var reconciler = new Reconciler { Res = new Resolver() };
        var node = reconciler.Mount(firstMount);
        Assert.Equal(1, factoryCalls);
        Assert.Equal("first", node.Content);
        Assert.NotNull(first);
        Assert.Equal(1, first!.BuildCount);
        Assert.False(first.WasDisposed);

        ParameterizedCell? replacement = null;
        node = reconciler.Diff(node, Cell.Mount(() =>
        {
            factoryCalls++;
            return replacement = new ParameterizedCell("replacement");
        }, "slot"));
        Assert.Equal(1, factoryCalls);
        Assert.Same(first, node.Fiber);
        Assert.Null(replacement);
        Assert.Equal("first", node.Content);

        node = reconciler.Diff(node, Cell.Mount(() =>
        {
            factoryCalls++;
            return replacement = new ParameterizedCell("replacement");
        }, "other"));
        Assert.Equal(2, factoryCalls);
        Assert.Equal("replacement", node.Content);
        Assert.NotNull(replacement);
        Assert.NotSame(first, replacement);
        Assert.True(first.WasDisposed);
        Assert.Equal(1, first.DisposeCount);
        Assert.False(replacement!.WasDisposed);

        reconciler.Diff(node, new Container());
        Assert.True(replacement.WasDisposed);
        Assert.Equal(1, replacement.DisposeCount);
    }

    private sealed class ParameterizedCell : Cell, IDisposable
    {
        public ParameterizedCell(string content)
        {
            Content = content;
        }

        public string Content { get; }
        public int BuildCount { get; private set; }
        public int DisposeCount { get; private set; }
        public bool WasDisposed { get; private set; }

        public override Blob Build()
        {
            BuildCount++;
            return new Text { Content = Content };
        }

        public void Dispose()
        {
            DisposeCount++;
            WasDisposed = true;
        }
    }
}
