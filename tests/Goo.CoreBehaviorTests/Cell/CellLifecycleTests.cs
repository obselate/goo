using System;
using Goo;
using Xunit;

public sealed class CellLifecycleTests
{

    [Fact]
    public void FactoryRejectsNullResultFromClrDelegate()
    {
        Assert.Throws<ArgumentNullException>(() => Cell.Mount<Cell>((Func<Cell>)null!, null));
        Blob mount = Cell.Mount<Cell>((Func<Cell>)(() => null!), null);
        Assert.Throws<InvalidOperationException>(() => new CellFixtures().MountFactoryBlob(mount));
    }
}
