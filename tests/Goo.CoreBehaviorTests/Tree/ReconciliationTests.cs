using Goo;
using Xunit;

public sealed class ReconciliationTests
{

    [Fact]
    public void ButtonStylesReuseEquivalentCompositionAndRefreshChangedState()
    {
        var fixtures = new TreeFixtures();
        Assert.True(fixtures.ButtonSemanticPrimitiveContract());
        Assert.True(fixtures.ButtonStyleSpillContract());
    }

    [Fact]
    public void RejectsMixedAndDuplicateKeys()
    {
        var fixtures = new TreeFixtures();
        Assert.True(fixtures.RejectsInvalidChildList("mount-mixed"));
        Assert.True(fixtures.RejectsInvalidChildList("diff-mixed"));
        Assert.True(fixtures.RejectsInvalidChildList("mount-duplicate"));
        Assert.True(fixtures.RejectsInvalidChildList("diff-duplicate"));
    }
}
