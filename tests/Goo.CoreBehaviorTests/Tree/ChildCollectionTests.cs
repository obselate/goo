using System;
using System.Collections.Generic;
using Goo;
using Xunit;

public sealed class ChildCollectionTests
{
    [Fact]
    public void ReadOnlyFactoryChildrenRemainMutableWithoutChangingTheSource()
    {
        var first = new Text { Content = "first" };
        Blob[] source = { first };
        var container = new Container { Children = source };
        var button = new Button { Children = Array.AsReadOnly(source) };
        container.Children.Clear();
        button.Children.Clear();
        container.Children.Add(new Text { Content = "container" });
        button.Children.Add(new Text { Content = "button" });
        Assert.Same(first, Assert.Single(source));
        Assert.Single(container.Children);
        Assert.Single(button.Children);
        Assert.False(container.Children.IsReadOnly);
        Assert.False(button.Children.IsReadOnly);
    }

    [Fact]
    public void MutableChildListsRetainTheirIdentity()
    {
        IList<Blob> children = new List<Blob>();
        Assert.Same(children, new Container { Children = children }.Children);
        Assert.Same(children, new Button { Children = children }.Children);
    }
}
