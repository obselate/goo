using Goo;
using Xunit;

public sealed class DiagnosticsTests
{
    [Fact]
    public void SnapshotIdentityAndDeltasRemainStable()
    {
        Assert.True(new DiagnosticsFixtures().SnapshotIdentityAndDeltaContract());
    }

    [Fact]
    public void CaptureRetriesWhenThePrerequisiteFrameIsNotReady()
    {
        Assert.True(new DiagnosticsFixtures().CaptureRequestRetriesAfterNotReady());
    }

    [Fact]
    public void SnapshotsUseResolvedSemanticsBoundEditorTextAndMaskPasswords()
    {
        Assert.True(new DiagnosticsFixtures().ResolvedSemanticsAndEditorPrivacyContract());
    }

    [Fact]
    public void InspectClickConsumesReleaseAndEscapeRestoresSelection()
    {
        Assert.True(new DiagnosticsFixtures().InspectClickAndEscapeContract());
    }

    [Fact]
    public void RuntimeOverridesPropagateInheritanceAndResetExactly()
    {
        Assert.True(new DiagnosticsFixtures().RuntimeOverrideInheritanceAndResetContract());
    }

    [Fact]
    public void OpenAutomaticallyAttachesOneDiagnosticsSessionAndCloseCleansIt()
    {
        Assert.True(new DiagnosticsFixtures().AutomaticAttachOnOpenIsIdempotentAndCloses());
    }
}
