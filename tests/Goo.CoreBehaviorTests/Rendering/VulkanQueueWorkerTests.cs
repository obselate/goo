using Goo;
using Xunit;

public sealed class VulkanQueueWorkerTests
{
    [Fact]
    public void WakeFailureDrainsFollowingMailboxAndQuiesces()
    {
        Assert.True(new VulkanQueueWorkerFixtures().WakeFailureDrainsFollowingMailboxAndQuiesces());
    }
}
