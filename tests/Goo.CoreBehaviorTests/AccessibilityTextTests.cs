using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Goo;
using Xunit;

public sealed class AccessibilityTextTests
{
    [Fact]
    public void NativeTextGeometrySurvivesWrappingBidiAndResize()
    {
        const string content = "Hello שלום world again and again";
        using var adapter = new NativeAccessibilityAdapter();
        var window = new Window { Width = 180, Height = 400, Root = new TextCell(content) };
        window.AccessibilityAdapter = adapter;
        try
        {
            window.UpdateTree();
            var initial = Encode(adapter);
            Assert.Equal(content, string.Concat(initial.Select(run => run.Text)));
            Assert.All(initial, run => Assert.True(run.Geometry, run.Text));
            Assert.Contains(initial, run => run.Direction == 1);
            var initialLines = initial.Select(run => run.Bounds.Y).Distinct().Count();
            Assert.True(initialLines > 1);

            window.Width = 110;
            window.UpdateTree();
            var resized = Encode(adapter);
            Assert.Equal(content, string.Concat(resized.Select(run => run.Text)));
            Assert.All(resized, run => Assert.True(run.Geometry, run.Text));
            Assert.True(resized.Select(run => run.Bounds.Y).Distinct().Count()
                > initialLines);
        }
        finally { window.Close(); }
    }

    private static NativeAccessibilityTextRun[] Encode(NativeAccessibilityAdapter adapter)
    {
        var type = typeof(NativeAccessibilityAdapter);
        var update = (nint)type.GetMethod("Encode", BindingFlags.Instance | BindingFlags.NonPublic)!
            .Invoke(adapter, [true])!;
        AccessKitNative.TreeUpdateFree(update);
        var cache = (Dictionary<long, NativeAccessibilityNodeCache>)type
            .GetField("cache", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(adapter)!;
        return cache.Values.SelectMany(node => node.Runs).ToArray();
    }

    private sealed class TextCell(string content) : Cell
    {
        public override Blob Build() => new Text { Content = content, FontSize = 20, TextWrap = TextWrap.Wrap };
    }
}
