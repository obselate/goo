using System;
using Goo;
using Xunit;

public sealed class WindowOwnershipTests
{
    [Fact]
    public void IndependentWindowsRemainDefaultAndCyclesNeverChangeConfiguration()
    {
        var root = new Window();
        var child = new Window { Owner = root };
        var grandchild = new Window { Owner = child, Modal = true };
        Assert.Null(root.Owner);
        Assert.False(root.Modal);
        Assert.False(root.IsInputBlocked);
        Assert.Throws<ArgumentException>(() => root.Owner = root);
        Assert.Throws<ArgumentException>(() => root.Owner = grandchild);
        Assert.Null(root.Owner);
        Assert.Same(root, child.Owner);
        child.Owner = null;
        Assert.Null(child.Owner);
        Assert.Same(child, grandchild.Owner);
    }

    [Fact]
    public void ModalNeedsAnOwnerAndClosedOwnersAreRejectedBeforeNativeAllocation()
    {
        var missing = new Window { Modal = true };
        Assert.Throws<InvalidOperationException>(() => missing.Open());
        Assert.False(missing.IsOpen);
        var child = new Window { Owner = new Window() };
        Assert.Throws<InvalidOperationException>(() => child.Open());
        Assert.False(child.IsOpen);
    }
}
