using System;
using Goo;
using Xunit;

public sealed class MotionTests
{
    [Fact]
    public void TweenFactoryUsesExactDurationAndEasing()
    {
        Assert.True(new MotionFixtures().TweenFactoryContract());
        Assert.Throws<ArgumentOutOfRangeException>(() => Motion.Tween(-1.0));
        Assert.Throws<ArgumentOutOfRangeException>(() => Motion.Tween(double.NaN));
        Assert.Throws<ArgumentOutOfRangeException>(() => Motion.Tween(1.0, (Easing)999));
    }

    [Fact]
    public void CallbackAnimationPublishesWithoutRebuilding()
    {
        Assert.True(new MotionFixtures().CallbackAnimationContract());
        Assert.Throws<ArgumentNullException>(() => new Cell().Animate(0.0, (Action<double>)null!));
    }

    [Fact]
    public void NullSpecsLeaveStateUntouched()
    {
        var original = Motion.Default;
        var anim = new Cell().Animate(0.0);
        try
        {
            Motion.Default = null!;
            Assert.Throws<InvalidOperationException>(() => anim.To(1.0));

            Func<double, double, double, Simulation> selected = null!;
            Assert.Throws<ArgumentNullException>(() => anim.To(1.0, selected));

            Func<double, double, double, Simulation> result = (_, _, _) => null!;
            Assert.Throws<InvalidOperationException>(() => anim.To(1.0, result));

            Assert.False(anim.Running);
            Assert.Equal(0.0, anim.Value);
            Assert.Equal(0.0, anim.Target);
        }
        finally
        {
            Motion.Default = original;
        }
    }

    [Fact]
    public void TimeScaleRejectsNonFiniteValues()
    {
        var original = Motion.TimeScale;
        try
        {
            Assert.Throws<ArgumentOutOfRangeException>(() => Motion.TimeScale = double.NaN);
            Assert.Throws<ArgumentOutOfRangeException>(() => Motion.TimeScale = double.PositiveInfinity);
            Assert.Throws<ArgumentOutOfRangeException>(() => Motion.TimeScale = double.NegativeInfinity);
            Assert.Equal(original, Motion.TimeScale);
        }
        finally
        {
            Motion.TimeScale = original;
        }
    }
}
