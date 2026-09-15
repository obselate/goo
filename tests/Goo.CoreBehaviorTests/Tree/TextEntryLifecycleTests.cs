using Goo;
using Xunit;

public sealed class TextEntryLifecycleTests
{
    [Fact]
    public void TextEntryFocusWinsOverControlledValue()
    {
        Assert.True(new TreeFixtures().TextEntryControlledValueContract());
    }

    [Fact]
    public void ExplicitControlledValueRetainsFocusAndValidGraphemeSelection()
    {
        Assert.True(new TreeFixtures().ExplicitControlledEntryValue());
    }

    [Fact]
    public void ControlledReplacementCancelsCompositionWithoutReportingAnEdit()
    {
        Assert.True(new TreeFixtures().ControlledEntryComposition());
    }
}
