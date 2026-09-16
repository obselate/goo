using Goo;
using Xunit;

public sealed class DragDropTests
{

    [Fact]
    public void WarmNoDragDrainAllocatesZero()
    {
        Assert.Equal(0, new DragDropFixtures().WarmNoDragDrainAllocatesZero());
    }
}
