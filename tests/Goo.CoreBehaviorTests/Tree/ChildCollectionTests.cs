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
    [Fact]
    public void AddAppendsChildrenInOrder()
    {
        var first = new Text("first");
        var second = new Text("second");
        var container = new Container();
        var button = new Button();

        container.Add(first);
        container.Add(second);
        button.Add(first);
        button.Add(second);

        Assert.Equal(2, container.Children.Count);
        Assert.Same(first, container.Children[0]);
        Assert.Same(second, container.Children[1]);
        Assert.Equal(2, button.Children.Count);
        Assert.Same(first, button.Children[0]);
        Assert.Same(second, button.Children[1]);
    }
}
