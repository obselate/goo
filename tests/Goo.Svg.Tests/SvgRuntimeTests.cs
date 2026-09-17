using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using Goo.Svg;
using Xunit;

namespace Goo.Svg.Tests;

public sealed class SvgRuntimeTests
{
    private const string BasicSvg = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 20 10\"><path d=\"M0 0 L20 0 L20 10 Z\" fill=\"#123456\"/></svg>";

    [Fact]
    public void AuthoredAssetsSnapshotChildAndRootArrays()
    {
        Assert.Equal(1, default(VectorNodeStyle).Opacity);
        Assert.Equal(1, default(VectorNodeStyle).Transform.Scale);
        var path = new PathBuilder(0, 0, 20, 10)
            .MoveTo(0, 0).LineTo(20, 0).LineTo(20, 10).Close().Build();
        var paint = new VectorPaint(Color.Rgb(18, 52, 86));
        var children = new[] { new VectorNode(path, new VectorNodeStyle { Fill = paint }, []) };
        var group = new VectorNode(children);
        var roots = new[] { group };
        var asset = new VectorAsset(0, 0, 20, 10, roots);

        children[0] = new VectorNode(VectorPath.Empty);
        roots[0] = new VectorNode(VectorPath.Empty);

        Assert.Equal(path, group.Children[0].Path);
        Assert.Equal(2, asset.NodeCount);
        Assert.Same(paint, asset.Nodes[0].Children[0].Fill);
        Assert.Throws<NotSupportedException>(() =>
            ((IList<VectorNode>)asset.Nodes).Clear());
    }

    [Fact]
    public void ParseProducesVectorAsset()
    {
        var asset = Svg.Parse(BasicSvg);

        Assert.Equal(20, asset.ViewBoxWidth);
        Assert.Equal(10, asset.ViewBoxHeight);
        Assert.Equal(2, asset.NodeCount);
        Assert.Equal(1, asset.ContourCount);
        Assert.Equal(3, asset.CurveCount);
        Assert.Equal(1, asset.PaintCount);
    }

    [Fact]
    public void StreamLoadMatchesTextAndLeavesCallerStreamOpen()
    {
        var bytes = Encoding.UTF8.GetBytes(BasicSvg);
        using var stream = new MemoryStream(bytes, writable: false);

        var fromStream = Svg.Load(stream);
        var fromText = Svg.Parse(BasicSvg);

        Assert.Equal(fromText.NodeCount, fromStream.NodeCount);
        Assert.Equal(fromText.ContourCount, fromStream.ContourCount);
        Assert.Equal(fromText.CurveCount, fromStream.CurveCount);
        Assert.Equal(fromText.PaintCount, fromStream.PaintCount);
        Assert.True(stream.CanRead);
    }

    [Fact]
    public void FileLoadMatchesText()
    {
        var path = Path.Combine(Path.GetTempPath(), $"goo-svg-{Guid.NewGuid():N}.svg");
        try
        {
            File.WriteAllText(path, BasicSvg, new UTF8Encoding(false));
            var fromFile = Svg.Load(path);
            var fromText = Svg.Parse(BasicSvg);

            Assert.Equal(fromText.NodeCount, fromFile.NodeCount);
            Assert.Equal(fromText.CurveCount, fromFile.CurveCount);
        }
        finally
        {
            File.Delete(path);
        }
    }

    [Fact]
    public void CubicSubdivisionDoesNotTrustItsMidpoint()
    {
        const string source = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><path d=\"M0 0 C0 100 100 -100 100 0\"/></svg>";

        var asset = Svg.Parse(source);

        Assert.True(asset.CurveCount > 1);
    }

    [Fact]
    public void DtdAndExternalEntitiesAreRejected()
    {
        const string source = "<!DOCTYPE svg [<!ENTITY external SYSTEM \"file:///etc/passwd\">]><svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1 1\"><path d=\"M0 0 L1 1\" fill=\"&external;\"/></svg>";

        var exception = Assert.Throws<SvgParseException>(() => Svg.Parse(source));

        Assert.Contains("DTD", exception.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void InvalidViewBoxIncludesDiagnostic()
    {
        const string source = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 0 1\"/>";

        var exception = Assert.Throws<SvgParseException>(() => Svg.Parse(source));

        Assert.Contains("viewBox", exception.Message, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("s13-representative.svg", 5, 3, 77, 4, 2, 1)]
    [InlineData("s13-animated.svg", 4, 2, 11, 4, 2, 0)]
    [InlineData("s13-morph.svg", 2, 1, 3, 2, 1, 0)]
    public void RuntimeLoadsSamples(string fileName, int nodes, int contours,
        int curves, int paints, int strokes, int clips)
    {
        var asset = Svg.Load(SamplePath(fileName));

        Assert.Equal(nodes, asset.NodeCount);
        Assert.Equal(contours, asset.ContourCount);
        Assert.Equal(curves, asset.CurveCount);
        Assert.Equal(paints, asset.PaintCount);
        Assert.Equal(strokes, asset.StrokeCount);
        Assert.Equal(clips, asset.ClipCount);
    }

    private static string SamplePath(string fileName)
    {
        return Path.Combine(AppContext.BaseDirectory, "Assets", fileName);
    }
}
