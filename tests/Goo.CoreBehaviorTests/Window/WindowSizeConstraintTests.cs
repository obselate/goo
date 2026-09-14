using System;
using Goo;
using Xunit;

public sealed class WindowSizeConstraintTests
{
    [Fact]
    public void LimitsValidateBeforeChangingTheConfiguration()
    {
        var window = new Window();
        Assert.Equal(0, window.MinWidth);
        Assert.Equal(0, window.MinHeight);
        Assert.Equal(0, window.MaxWidth);
        Assert.Equal(0, window.MaxHeight);
        Assert.Throws<ArgumentOutOfRangeException>(() => window.MinWidth = -1);
        Assert.Throws<ArgumentOutOfRangeException>(() => window.MinHeight = -1);
        Assert.Throws<ArgumentOutOfRangeException>(() => window.MaxWidth = -1);
        Assert.Throws<ArgumentOutOfRangeException>(() => window.MaxHeight = -1);
        window.MinWidth = 640;
        window.MinHeight = 480;
        window.MaxWidth = 1280;
        window.MaxHeight = 720;
        Assert.Throws<ArgumentOutOfRangeException>(() => window.MinWidth = 1281);
        Assert.Throws<ArgumentOutOfRangeException>(() => window.MinHeight = 721);
        Assert.Throws<ArgumentOutOfRangeException>(() => window.MaxWidth = 639);
        Assert.Throws<ArgumentOutOfRangeException>(() => window.MaxHeight = 479);
        Assert.Equal(640, window.MinWidth);
        Assert.Equal(480, window.MinHeight);
        Assert.Equal(1280, window.MaxWidth);
        Assert.Equal(720, window.MaxHeight);
        window.MaxWidth = 640;
        window.MaxHeight = 480;
        window.MaxWidth = 0;
        window.MaxHeight = 0;
        window.MinWidth = 2000;
        window.MinHeight = 1200;
        window.MinWidth = 0;
        window.MinHeight = 0;
    }
}
