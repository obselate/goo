using Goo;
using Xunit;

public sealed class GradientTests
{
    [Fact]
    public void LongLinearAndRadialGradientsReachTheSceneWithoutFallback()
    {
        Assert.True(new GradientFixtures().LongGradientsCompileWithoutUnsupportedFallback());
    }
}
