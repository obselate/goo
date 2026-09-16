using System;
using Goo;
using Xunit;

public sealed class ElementHandleTests
{








    [Fact]
    public void ElementsWithoutHandlesDoNotAllocateDuringAStableDiff()
        => Assert.Equal(0, new ElementHandleFixtures().NoHandleDiffBytes());









    [Fact]
    public void UnsubscribedHandlesDoNotAllocateDuringAStableDiff()
        => Assert.Equal(0, new ElementHandleFixtures().HandleNoSubscriptionDiffBytes());

    [Fact]
    public void UnsubscribedHandlesDoNotAllocateDuringAStableFrame()
        => Assert.Equal(0, new ElementHandleFixtures().HandleNoSubscriptionFrameBytes());

    [Fact]
    public void WarmMetricsNotificationDoesNotAllocate()
        => Assert.Equal(0, new ElementHandleFixtures().MetricsNotificationBytes());

    [Fact]
    public void TextInputAreaRejectsInvalidAndExtremeLogicalRectanglesBeforeMounting()
    {
        var handle = new ElementHandle();

        Assert.False(handle.SetTextInputArea(new ElementRect()));
        Assert.Throws<ArgumentOutOfRangeException>(() => handle.SetTextInputArea(new ElementRect
        {
            X = double.NaN,
        }));
        Assert.Throws<ArgumentOutOfRangeException>(() => handle.SetTextInputArea(new ElementRect
        {
            Width = -1,
        }));
        Assert.Throws<ArgumentOutOfRangeException>(() => handle.SetTextInputArea(new ElementRect
        {
            X = int.MaxValue,
            Width = 1,
        }));
        Assert.Throws<ArgumentOutOfRangeException>(() => handle.SetTextInputArea(new ElementRect
        {
            X = int.MinValue,
            Width = (double)int.MaxValue * 2,
        }));
    }
}
