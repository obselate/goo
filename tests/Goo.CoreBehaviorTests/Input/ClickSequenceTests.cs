using Goo;
using Xunit;

public sealed class ClickSequenceTests
{
    [Fact]
    public void GenericCountsRespectSequenceBoundaries() =>
        Assert.True(new ClickSequenceFixtures().GenericCountsRespectBoundariesTargetsButtonsAndCancellation());

    [Fact]
    public void TextSelectionAndCaptureShareTheSequence() =>
        Assert.True(new ClickSequenceFixtures().TextSelectionUsesTheRoutedCountAndCaptureDoesNotCreateFalseClicks());

    [Fact]
    public void DeviceSequencesStayIndependent() =>
        Assert.True(new ClickSequenceFixtures().TouchCountsArePerContactAndPenSequencesAreIndependent());
}
