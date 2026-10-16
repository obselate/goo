using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
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

    [Theory]
    [InlineData("rotate(90)", 90, 0, 0)]
    [InlineData("rotate(90 10 20)", 90, 30, 10)]
    [InlineData("skewX(30)", 0, 0, 0)]
    [InlineData("skewY(30)", 30, 0, 0)]
    [InlineData("matrix(1 2 3 4 5 6)", 63.4349488, 5, 6)]
    public void SvgTransformsUseSvgCoefficientOrder(string source, double rotation,
        double translateX, double translateY)
    {
        var asset = Svg.Parse($"<svg viewBox=\"0 0 100 100\"><path transform=\"{source}\" d=\"M0 0 L1 1\"/></svg>");
        var transform = asset.Nodes[0].Children[0].Transform;

        Assert.Equal(rotation, transform.Rotate, 4);
        Assert.Equal(translateX, transform.TranslateX.Magnitude, 4);
        Assert.Equal(translateY, transform.TranslateY.Magnitude, 4);
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

    [Theory]
    [InlineData(4097, 1, false)]
    [InlineData(2049, 2, false)]
    [InlineData(4096, 1, true)]
    public void ExpandedAnimationBudgetIsReservedAcrossTracks(int values, int tracks, bool accepted)
    {
        var animation = $"<animate attributeName=\"opacity\" values=\"{string.Join(';', Enumerable.Repeat('0', values))}\" dur=\"1s\" repeatCount=\"64\" fill=\"freeze\"/>";
        var source = new StringBuilder("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 10 10\">");
        for (var index = 0; index < tracks; index++)
        {
            source.Append($"<rect width=\"1\" height=\"1\">{animation}</rect>");
        }
        source.Append("</svg>");

        if (accepted)
        {
            Assert.NotNull(Svg.Parse(source.ToString()));
        }
        else
        {
            var exception = Assert.Throws<SvgParseException>(() => Svg.Parse(source.ToString()));
            Assert.Contains("animation track limit", exception.Message);
            Assert.StartsWith("line 1, column", exception.Message);
        }
    }

    [Fact]
    public void CubicSubdivisionDoesNotTrustItsMidpoint()
    {
        const string source = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><path d=\"M0 0 C0 100 100 -100 100 0\"/></svg>";

        var asset = Svg.Parse(source);

        Assert.True(asset.CurveCount > 1);
    }

    [Theory]
    [InlineData("<rect width='10' height='10' transform='translate(30 0)'/>", 40)]
    [InlineData("<g transform='translate(20 0)'><rect width='10' height='10' transform='translate(30 0)'/></g>", 60)]
    [InlineData("<g transform='scale(2)'><rect width='10' height='10' transform='translate(30 0)'/></g>", 70)]
    public void ClipsComposeTransformsAndInheritRules(string content, double minX)
    {
        var asset = Svg.Parse($"<svg viewBox='0 0 100 100'><defs><clipPath id='c' transform='translate(10 0)' clip-rule='evenodd'>{content}</clipPath></defs><rect width='100' height='100' clip-path='url(#c)'/></svg>");
        var node = asset.NodeAt(1);
        var geometryType = typeof(VectorAsset).Assembly.GetType("Goo.PathGeometry")!;
        var geometry = geometryType.GetMethod("For", BindingFlags.Static | BindingFlags.NonPublic)!
            .Invoke(null, [node.ClipPath])!;
        var actualMinX = (float)geometryType.GetField("MinX", BindingFlags.Instance | BindingFlags.NonPublic)!
            .GetValue(geometry)!;

        Assert.Equal(minX, actualMinX, 4);
        Assert.Equal(FillRule.EvenOdd, node.ClipPathFillRule);
    }

    [Fact]
    public void ClipRuleOverridesStillRejectMixedRules()
    {
        const string source = "<svg viewBox='0 0 100 100'><defs><clipPath id='c' clip-rule='evenodd'><g><rect width='10' height='10'/><rect width='10' height='10' clip-rule='nonzero'/></g></clipPath></defs><rect width='100' height='100' clip-path='url(#c)'/></svg>";

        var error = Assert.Throws<SvgParseException>(() => Svg.Parse(source));

        Assert.Contains("cannot mix fill rules", error.Message);
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

    [Fact]
    public void LongGradientInheritanceResolvesWithoutRecursion()
    {
        var source = new StringBuilder("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 10 10\"><defs>");
        for (var index = 0; index < 50000; index++)
        {
            source.Append($"<linearGradient id=\"g{index}\" href=\"#g{index + 1}\"/>");
        }
        source.Append("<linearGradient id=\"g50000\"><stop offset=\"0\" stop-color=\"red\"/><stop offset=\"1\" stop-color=\"blue\"/></linearGradient></defs><path d=\"M0 0 L10 0 L10 10 Z\" fill=\"url(#g0)\"/></svg>");

        Assert.Equal(1, Svg.Parse(source.ToString()).PaintCount);
    }

    [Fact]
    public void GradientInheritanceCycleIsRejected()
    {
        const string source = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 10 10\"><defs><linearGradient id=\"a\" href=\"#b\"/><linearGradient id=\"b\" href=\"#a\"/></defs><path d=\"M0 0 L10 0 L10 10 Z\" fill=\"url(#a)\"/></svg>";

        Assert.Contains("cycle", Assert.Throws<SvgParseException>(() => Svg.Parse(source)).Message);
    }

    private static string SamplePath(string fileName)
    {
        return Path.Combine(AppContext.BaseDirectory, "Assets", fileName);
    }
}
