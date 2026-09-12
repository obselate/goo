using Goo;
using Xunit;

public sealed class LayoutIntegrationTests
{
    [Fact]
    public void ComposedTreeMapsDeclarationsAndRelayouts()
    {
        Assert.True(new LayoutFixtures().ComposedTreeMapsDeclarationsAndRelayouts());
    }

    [Fact]
    public void LayoutIsStableAcrossRoots()
    {
        Assert.True(new LayoutFixtures().LayoutIsStableAcrossRoots());
    }

    [Fact]
    public void KeyedReorderRetainsYogaLayouts()
    {
        Assert.True(new LayoutFixtures().KeyedReorderRetainsYogaLayouts());
    }

    [Fact]
    public void StaticPositionIgnoresInsets()
    {
        Assert.True(new LayoutFixtures().StaticPositionIgnoresInsets());
    }

    [Fact]
    public void LogicalEdgesUseLtrAndRtlLayoutDirections()
    {
        Assert.True(new LayoutFixtures().LogicalEdgesRespectDirection());
    }

    [Fact]
    public void LayoutTransitionGlidesComputedPosition()
    {
        Assert.True(new LayoutFixtures().LayoutTransitionGlidesComputedPosition());
    }

    [Fact]
    public void TextEntryUsesIntrinsicLineBoxHeight()
    {
        Assert.True(new LayoutFixtures().TextEntryUsesIntrinsicLineBoxHeight());
    }

}
