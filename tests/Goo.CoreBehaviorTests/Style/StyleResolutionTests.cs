using System;
using System.Reflection;
using System.Runtime.CompilerServices;
using Goo;
using Xunit;

public class StyleResolutionTests
{

    [Fact]
    public void StyleEntryHasOnePayloadReference()
    {
        Assert.Equal(32, Unsafe.SizeOf<StyleEntry>());
    }

    [Fact]
    public void ClipPathValidatesAndResolves()
    {
        Assert.Throws<System.ArgumentException>(() =>
            _ = new Style { ClipPath = new PathBuilder().MoveTo(0, 0).Build() });
        Assert.True(new StyleFixtures().ClipPathResolutionStorageAndSnapContract());
    }

    [Fact]
    public void TextStrokeValidatesAndResolves()
    {
        Assert.Throws<System.ArgumentOutOfRangeException>(() =>
            _ = new Style { TextStrokeWidth = -1 });
        Assert.Throws<System.ArgumentException>(() =>
            _ = new Style { TextStrokeWidth = Length.Percent(10) });
        Assert.Throws<System.ArgumentException>(() =>
            _ = new Style { TextStrokeWidth = Length.Auto });
        Assert.Throws<System.ArgumentOutOfRangeException>(() =>
            _ = new Style { TextStrokeWidth = double.NaN });
        Assert.True(new StyleFixtures().TextStrokeResolutionStorageAndDiffContract());
    }

    [Fact]
    public void TextMaxLinesUpdatesLayout()
    {
        Assert.Throws<System.ArgumentOutOfRangeException>(() =>
            _ = new Style { TextMaxLines = -1 });
        Assert.True(new StyleFixtures().TextMaxLinesResolutionStateAndCacheContract());
    }

    [Fact]
    public void TransformNormalizesAndTransitions()
    {
        Assert.True(new StyleFixtures().TransformStateTransitionAndGeometryContract());

        var identity = default(PanelTransform);
        var equivalent = new PanelTransform
        {
            TranslateX = 0,
            Scale = 1,
        };
        Assert.True(identity == equivalent);
        Assert.True(((object)identity).Equals(equivalent));
        Assert.Equal(identity.GetHashCode(), equivalent.GetHashCode());

        var fullTurn = new PanelTransform { Rotate = 360 };
        Assert.True(fullTurn != identity);
        Assert.False(((object)fullTurn).Equals(identity));

        var percentZero = new PanelTransform { TranslateX = Length.Percent(0) };
        Assert.True(percentZero != identity);
        Assert.True(percentZero.TranslateX.IsPercent);
    }

    [Fact]
    public void EveryStyleFieldHasAResolverContract()
    {
        var styleField = typeof(Style).Assembly.GetType("Goo.StyleField", throwOnError: true)!;
        var contract = typeof(StyleFixtures).GetMethod(
            "StyleFieldExhaustivenessContract",
            BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
        Assert.NotNull(contract);

        var fixtures = new StyleFixtures();
        foreach (var field in Enum.GetValues(styleField))
        {
            Assert.True((bool)contract!.Invoke(fixtures, new[] { field })!, field.ToString());
        }
    }

}
