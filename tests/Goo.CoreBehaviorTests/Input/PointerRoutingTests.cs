using Goo;
using Xunit;

public sealed class PointerRoutingTests
{

    [Fact]
    public void ZIndexOrdersHitsWithinBounds()
    {
        Assert.Equal(
            new[]
            {
                "first",
                "first",
                "second",
                "high-parent",
                "clipped-child",
                "",
                "sibling",
                "dynamic",
            },
            new InputFixtures().ZIndexHitOrder());
    }
}
