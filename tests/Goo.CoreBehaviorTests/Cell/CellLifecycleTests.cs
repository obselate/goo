using System;
using Goo;
using Xunit;

public sealed class CellLifecycleTests
{
    [Fact]
    public void DirectCellCompositionAddsNoLayoutOrPaintNode()
    {
        Assert.True(new CellFixtures().DirectCompositionAddsNoRenderNode());
    }

    [Fact]
    public void CellsDisposeOnceAcrossUnmountPaths()
    {
        Assert.True(new CellFixtures().DisposesEachUnmountedCellExactlyOnce());
    }

    [Fact]
    public void KeyedRetirementContinuesAfterDisposeFailures()
    {
        Assert.True(new CellFixtures().KeyedRetirementContinuesAfterDisposeFailures());
    }

    [Fact]
    public void PositionalRetirementContinuesAfterDisposeFailures()
    {
        Assert.True(new CellFixtures().PositionalRetirementContinuesAfterDisposeFailures());
    }

    [Fact]
    public void WindowCloseCompletesAfterCleanupFailures()
    {
        Assert.True(new CellFixtures().WindowCloseCompletesAfterCleanupFailures());
    }

    [Fact]
    public void FactorySubtypeRetainsAcrossKeyedReorderAndIndependentRebuild()
    {
        Assert.True(new CellFixtures().FactorySubtypeRetainsAcrossKeyedReorderAndIndependentRebuild());
    }

    [Fact]
    public void FactoryKeyChangeRemountsAndDisposes()
    {
        Assert.True(new CellFixtures().FactoryKeyChangeRemountsAndDisposes());
    }

    [Fact]
    public void FactoryRejectsReusedAndDisposedInstancesWithoutCorruption()
    {
        Assert.True(new CellFixtures().FactoryRejectsReusedAndDisposedInstancesWithoutCorruption());
    }

    [Fact]
    public void FactoryBuildFailurePreservesPriorMount()
    {
        Assert.True(new CellFixtures().FactoryBuildFailurePreservesPriorMount());
    }

    [Fact]
    public void FactoryRejectsNullResultFromClrDelegate()
    {
        Assert.Throws<ArgumentNullException>(() => Cell.Mount<Cell>((Func<Cell>)null!, null));
        Blob mount = Cell.Mount<Cell>((Func<Cell>)(() => null!), null);
        Assert.Throws<InvalidOperationException>(() => new CellFixtures().MountFactoryBlob(mount));
    }

    [Fact]
    public void RootMountRetriesAfterInitialBuildFailure()
    {
        Assert.True(new CellFixtures().RootMountRetriesAfterInitialBuildFailure());
    }

    [Fact]
    public void FactoryRejectsCurrentlyBuildingRootWithoutCorruption()
    {
        Assert.True(new CellFixtures().FactoryRejectsCurrentlyBuildingRootWithoutCorruption());
    }
}
