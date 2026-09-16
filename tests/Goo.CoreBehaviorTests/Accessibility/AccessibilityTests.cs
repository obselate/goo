using Goo;
using Xunit;

public sealed class AccessibilityTests
{







    [Fact]
    public void ActionRequestFactoriesValidateAndRoutePayloads()
    {
        var setValue = AccessibilityActionRequest.SetValue("next");
        var selection = AccessibilityActionRequest.SetSelection(1, 2);
        var scroll = AccessibilityActionRequest.Scroll(0.0, 4.0);

        Assert.True(new AccessibilityFixtures().PayloadActionContract(setValue, selection, scroll));
        Assert.Throws<System.ArgumentOutOfRangeException>(() =>
            AccessibilityActionRequest.Scroll(0.0, double.NaN));
    }








    [Fact]
    public void ActionRequestConstructionIsImmutableAndPayloadSafe()
    {
        Assert.Throws<System.ArgumentException>(() =>
            new AccessibilityActionRequest(AccessibilityAction.SetValue));
        Assert.Throws<System.ArgumentException>(() =>
            new AccessibilityActionRequest(AccessibilityAction.SetSelection));
        Assert.Throws<System.ArgumentException>(() =>
            new AccessibilityActionRequest(AccessibilityAction.Scroll));
        Assert.Throws<System.ArgumentNullException>(() => AccessibilityActionRequest.SetValue(null!));
        Assert.Throws<System.ArgumentOutOfRangeException>(() =>
            AccessibilityActionRequest.SetSelection(int.MaxValue, 1));
        Assert.Throws<System.ArgumentOutOfRangeException>(() =>
            AccessibilityActionRequest.SetSelection(-1, 0));
        Assert.Throws<System.ArgumentOutOfRangeException>(() =>
            AccessibilityActionRequest.SetSelection(0, -1));
        Assert.Throws<System.ArgumentOutOfRangeException>(() =>
            AccessibilityActionRequest.Scroll(double.PositiveInfinity, 0));
        Assert.Null(typeof(AccessibilityActionRequest).GetProperty(nameof(AccessibilityActionRequest.Action))!.SetMethod);
        Assert.Single(typeof(AccessibilityActionRequest).GetConstructors());
        Assert.Throws<System.ArgumentNullException>(() => new AccessibilityValue { Text = null! });
        Assert.Throws<System.ArgumentNullException>(() => new Accessibility { Name = null! });
        Assert.Throws<System.ArgumentNullException>(() => new AccessibilityRelationships { LabelledBy = null! });
        Assert.Throws<System.ArgumentNullException>(() => new Accessibility { Actions = null! });
        Assert.Throws<System.ArgumentNullException>(() => new Window().PerformAccessibilityAction(
            new AccessibilityId(1), null!));
        Assert.False(new Window().PerformAccessibilityAction(new AccessibilityId(1),
            new AccessibilityActionRequest(AccessibilityAction.Activate)));
    }
}
