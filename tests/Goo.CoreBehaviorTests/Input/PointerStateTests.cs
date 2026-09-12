using Goo;
using Xunit;

public sealed class PointerStateTests
{
    [Fact]
    public void HoverAndActiveIgnoreSiblings()
    {
        Assert.True(new InputFixtures().PointerHoverActiveAndSiblingIsolation());
    }

    [Fact]
    public void StationaryPointerReacquiresHoverAfterRebuild()
    {
        Assert.True(new InputFixtures().PointerReacquiresHoverAfterRebuild());
    }

    [Fact]
    public void QueuedPointerEventsObservePriorStyles()
    {
        Assert.True(new InputFixtures().PointerEventsFlushStyleChangesInOrder());
    }

    [Fact]
    public void PointerUsesDeepestCursor()
    {
        Assert.True(new InputFixtures().PointerSelectsDeepestResolvedCursorAndClearsIt());
    }

    [Fact]
    public void FocusTransfersAndTraverses()
    {
        Assert.True(new InputFixtures().FocusTransferAndTraversal());
    }

    [Fact]
    public void AutoFocusUsesFirstEligibleNode()
    {
        Assert.True(new InputFixtures().AutoFocusSelectsFirstEligibleNodeOnlyWhenFocusIsEmpty());
    }

    [Fact]
    public void ReplacingFocusedNodeClearsStaleFocus()
    {
        Assert.True(new InputFixtures().FocusReplacementDropsStaleFocus());
    }

    [Fact]
    public void PointerCancelBalancesActiveRoute()
    {
        Assert.True(new InputFixtures().PointerCancelBalancesAnActiveRouteOnFocusLossAndInvalidation());
    }

    [Fact]
    public void ThrowingPointerEventIsNotRetried()
    {
        Assert.True(new InputFixtures().PointerDrainConsumesThrowingEventOnceAndRetainsRest());
    }

    [Fact]
    public void HoverLifecycleUsesRetainedRouteOrder()
    {
        Assert.True(new InputFixtures().PointerHoverLifecycleOrderAndFailureContract());
    }

    [Fact]
    public void PointerLifecycleSidecarsKeepDefaultRetainedCostsExact()
    {
        var fixtures = new InputFixtures();
        Assert.Equal(192, fixtures.PointerLifecycleEmptyBlobBytes());
        Assert.Equal(1_232, fixtures.PointerLifecycleEmptyNodeBytes());
        Assert.Equal(3_312, fixtures.PointerLifecycleEmptyWindowBytes());
        Assert.Equal(0, fixtures.PointerLifecycleStablePlainDiffBytes());
    }
}
