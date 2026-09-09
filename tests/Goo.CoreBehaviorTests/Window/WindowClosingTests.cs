using Goo;
using Xunit;

public sealed class WindowClosingTests
{
    [Fact]
    public void AcceptedDecisionIsReusedAcrossClosePreparationRetries()
    {
        var window = new Window();
        var calls = 0;
        window.OnClosing = () =>
        {
            calls++;
            return true;
        };

        Assert.False(window.drainCloseRequest());

        window.RequestClose();
        window.RequestClose();

        Assert.True(window.drainCloseRequest());
        Assert.True(window.drainCloseRequest());
        Assert.Equal(1, calls);

        window.RequestClose();

        Assert.True(window.drainCloseRequest());
        Assert.Equal(1, calls);
    }

    [Fact]
    public void VetoAllowsALaterCloseRequest()
    {
        var window = new Window();
        var calls = 0;
        var accept = false;
        window.OnClosing = () =>
        {
            calls++;
            return accept;
        };

        window.RequestClose();

        Assert.False(window.drainCloseRequest());
        Assert.Equal(1, calls);
        Assert.False(window.drainCloseRequest());
        Assert.Equal(1, calls);

        accept = true;
        window.RequestClose();

        Assert.True(window.drainCloseRequest());
        Assert.True(window.drainCloseRequest());
        Assert.Equal(2, calls);
    }

    [Fact]
    public void RequestMadeDuringVetoRemainsPending()
    {
        var window = new Window();
        var calls = 0;
        window.OnClosing = () =>
        {
            calls++;
            if (calls == 1)
            {
                window.RequestClose();
                return false;
            }
            return true;
        };

        window.RequestClose();

        Assert.False(window.drainCloseRequest());
        Assert.True(window.drainCloseRequest());
        Assert.True(window.drainCloseRequest());
        Assert.Equal(2, calls);
    }

    [Fact]
    public void RequestMadeDuringAcceptanceDoesNotReplaceAcceptedDecision()
    {
        var window = new Window();
        var calls = 0;
        window.OnClosing = () =>
        {
            calls++;
            window.RequestClose();
            return true;
        };

        window.RequestClose();

        Assert.True(window.drainCloseRequest());
        Assert.True(window.drainCloseRequest());
        Assert.Equal(1, calls);
    }

    [Fact]
    public void MissingHandlerAcceptsAndRetainsTheCloseDecision()
    {
        var window = new Window();

        window.RequestClose();
        window.RequestClose();

        Assert.True(window.drainCloseRequest());
        Assert.True(window.drainCloseRequest());
    }
}
