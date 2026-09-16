using Goo;
using Xunit;

public sealed class DevToolsInputTests
{
    [Fact]
    public void InputRequiresOptInUsesDefaultActionsAndAcknowledgesSettledState() =>
        Assert.True(new DevToolsInputFixtures().OptInRoutingSettlementAndStaleTargets());

    [Fact]
    public void CapturedDragRejectsForeignClientsThenCancelsAndInvalidInputIsRejected() =>
        Assert.True(new DevToolsInputFixtures().CaptureCancelAndValidation());

    [Fact]
    public void TimedOutQueuedRequestsCannotApplyInputLater() =>
        Assert.True(new DevToolsInputFixtures().QueuedTimeoutCannotExecuteLater());
}
