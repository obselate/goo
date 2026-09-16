using Goo;
using Xunit;

public sealed class PointerStateTests
{

    [Fact]
    public void PointerLifecycleSidecarsKeepDefaultRetainedCostsWithinBudget()
    {
        var fixtures = new InputFixtures();
        Assert.Equal(192, fixtures.PointerLifecycleEmptyBlobBytes());
        Assert.Equal(1_152, fixtures.PointerLifecycleEmptyNodeBytes());
        Assert.InRange(fixtures.PointerLifecycleEmptyWindowBytes(), 1, 3_744);
        Assert.Equal(0, fixtures.PointerLifecycleStablePlainDiffBytes());
    }
}
