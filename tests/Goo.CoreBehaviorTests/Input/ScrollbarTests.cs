using Goo;
using Xunit;

public sealed class ScrollbarTests
{

    [Fact]
    public void WarmThumbDraggingAllocatesNothing()
    {
        Assert.Equal(0, new ScrollbarFixtures().WarmDragBytes());
    }
}
