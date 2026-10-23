package Goo.CoreBehaviorTests

import Goo
import Goo.Svg
import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Reflection
import System.Text
import Xunit

class SvgRuntimeTests {
    @Fact
    func AuthoredAssetsSnapshotChildAndRootArrays() {
        Assert.Equal(float64(1.0), default(VectorNodeStyle).Opacity)
        Assert.Equal(float64(1.0), default(VectorNodeStyle).Transform.Scale)
        let path = PathBuilder(0.0, 0.0, 20.0, 10.0)
            .MoveTo(0.0, 0.0)
            .LineTo(20.0, 0.0)
            .LineTo(20.0, 10.0)
            .Close()
            .Build()
        let paint = VectorPaint(Color.Rgb(18, 52, 86))
        let children = []VectorNode{VectorNode(path, VectorNodeStyle{Fill: paint}, System.Array.Empty[VectorNode]())}
        let group = VectorNode(children)
        let roots = []VectorNode{group}
        let asset = VectorAsset(0.0, 0.0, 20.0, 10.0, roots)
        children[0] = VectorNode(VectorPath.Empty)
        roots[0] = VectorNode(VectorPath.Empty)
        Assert.Equal(path, group.Children[0].Path)
        Assert.Equal(2, asset.NodeCount)
        Assert.Same(paint, asset.Nodes[0].Children[0].Fill)
        Assert.Throws[NotSupportedException](() -> (cast[IList[VectorNode]](asset.Nodes)).Clear())
    }

    @Fact
    func ParseProducesVectorAsset() {
        let asset = Svg.Parse(BasicSvg)
        Assert.Equal(float32(20.0), asset.ViewBoxWidth)
        Assert.Equal(float32(10.0), asset.ViewBoxHeight)
        Assert.Equal(2, asset.NodeCount)
        Assert.Equal(1, asset.ContourCount)
        Assert.Equal(3, asset.CurveCount)
        Assert.Equal(1, asset.PaintCount)
    }

    @Theory
    @InlineData("rotate(90)", int32(90), int32(0), int32(0))
    @InlineData("rotate(90 10 20)", int32(90), int32(30), int32(10))
    @InlineData("skewX(30)", int32(0), int32(0), int32(0))
    @InlineData("skewY(30)", int32(30), int32(0), int32(0))
    @InlineData("matrix(1 2 3 4 5 6)", 63.4349488, int32(5), int32(6))
    func SvgTransformsUseSvgCoefficientOrder(source string, rotation float64, translateX float64, translateY float64) {
        let asset = Svg.Parse("<svg viewBox=\"0 0 100 100\"><path transform=\"$source\" d=\"M0 0 L1 1\"/></svg>")
        let transform = asset.Nodes[0].Children[0].Transform
        Assert.Equal(rotation, transform.Rotate, 4)
        Assert.Equal(translateX, transform.TranslateX.Magnitude, 4)
        Assert.Equal(translateY, transform.TranslateY.Magnitude, 4)
    }

    @Theory
    @InlineData(true, false)
    @InlineData(true, true)
    @InlineData(false, false)
    func StreamLoadMatchesTextAndLeavesCallerStreamOpen(seekable bool, growing bool) {
        let bytes = Encoding.UTF8.GetBytes(BasicSvg)
        using let stream = ReportedLengthStream(bytes, seekable, if growing { 1L } else { int64(bytes.Length) })
        let fromStream = Svg.Load(stream)
        let fromText = Svg.Parse(BasicSvg)
        Assert.Equal(fromText.NodeCount, fromStream.NodeCount)
        Assert.Equal(fromText.ContourCount, fromStream.ContourCount)
        Assert.Equal(fromText.CurveCount, fromStream.CurveCount)
        Assert.Equal(fromText.PaintCount, fromStream.PaintCount)
        Assert.True(stream.CanRead)
    }

    @Fact
    func StreamLoadRejectsOversizedLengthBeforeReading() {
        using let stream = ReportedLengthStream(Encoding.UTF8.GetBytes(BasicSvg), true, 16777217)
        let error = Assert.Throws[SvgParseException](() -> Svg.Load(stream))
        Assert.Contains("SVG input exceeds 16777216 bytes", error.Message)
        Assert.Equal(0L, stream.Position)
        Assert.True(stream.CanRead)
    }

    private class ReportedLengthStream(bytes []uint8, seekable bool, length int64) : MemoryStream(bytes) {
        override prop CanSeek bool -> seekable

        override prop Length int64 -> length
    }

    @Fact
    func FileLoadMatchesText() {
        let path = Path.Combine(Path.GetTempPath(), "goo-svg-${Guid.NewGuid():N}.svg")
        try {
            File.WriteAllText(path, BasicSvg, UTF8Encoding(false))
            let fromFile = Svg.Load(path)
            let fromText = Svg.Parse(BasicSvg)
            Assert.Equal(fromText.NodeCount, fromFile.NodeCount)
            Assert.Equal(fromText.CurveCount, fromFile.CurveCount)
        } finally {
            File.Delete(path)
        }
    }

    @Fact
    func AnimatedColorsRetainPaintOpacityFromTransparentStaticColors() {
        let asset = Svg.Parse(
            "<svg viewBox='0 0 10 10'>" +
                "<rect width='10' height='10' fill='transparent' fill-opacity='0.2'" +
                " stroke='transparent' stroke-opacity='0.3'>" +
                "<animate attributeName='fill' values='red;blue' dur='1s' fill='freeze'/>" +
                "<animate attributeName='stroke' values='red;blue' dur='1s' fill='freeze'/>" +
                "</rect></svg>"
        )
        let flags = BindingFlags.Instance | BindingFlags.NonPublic
        let animation = typeof(VectorAsset).GetField("animation", flags)!!.GetValue(asset)!!
        let frames = cast[Array](animation.GetType().GetField("Keyframes", flags)!!.GetValue(animation)!!)
        Assert.Equal(4, frames.Length)
        for var index = 0; index < frames.Length; index++ {
            let frame = frames.GetValue(index)!!
            let alpha = float32(frame.GetType().GetField("D", flags)!!.GetValue(frame)!!)
            Assert.Equal(
                if index < 2 {
                    0.2f
                } else {
                    0.3f
                },
                alpha,
                6
            )
        }
    }

    @Theory
    @InlineData(int32(4097), int32(1), false)
    @InlineData(int32(2049), int32(2), false)
    @InlineData(int32(4096), int32(1), true)
    func ExpandedAnimationBudgetIsReservedAcrossTracks(values int32, tracks int32, accepted bool) {
        let animation = "<animate attributeName=\"opacity\" values=\"${string.Join(';', Enumerable.Repeat('0', values))}\" dur=\"1s\" repeatCount=\"64\" fill=\"freeze\"/>"
        let source = StringBuilder("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 10 10\">")
        for var index = 0; index < tracks; index++ {
            source.Append("<rect width=\"1\" height=\"1\">$animation</rect>")
        }
        source.Append("</svg>")
        if accepted {
            Assert.NotNull(Svg.Parse(source.ToString()))
        } else {
            let exception = Assert.Throws[SvgParseException](() -> Svg.Parse(source.ToString()))
            Assert.Contains("animation track limit", exception.Message)
            Assert.StartsWith("line 1, column", exception.Message)
        }
    }

    @Fact
    func CubicSubdivisionDoesNotTrustItsMidpoint() {
        const source = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><path d=\"M0 0 C0 100 100 -100 100 0\"/></svg>"
        let asset = Svg.Parse(source)
        Assert.True(asset.CurveCount > 1)
    }

    @Theory
    @InlineData("<rect width='10' height='10' transform='translate(30 0)'/>", int32(40))
    @InlineData(
        "<g transform='translate(20 0)'><rect width='10' height='10' transform='translate(30 0)'/></g>",
        int32(60)
    )
    @InlineData("<g transform='scale(2)'><rect width='10' height='10' transform='translate(30 0)'/></g>", int32(70))
    func ClipsComposeTransformsAndInheritRules(content string, minX float64) {
        let asset = Svg.Parse(
            "<svg viewBox='0 0 100 100'><defs><clipPath id='c' transform='translate(10 0)' clip-rule='evenodd'>$content</clipPath></defs><rect width='100' height='100' clip-path='url(#c)'/></svg>"
        )
        let node = asset.NodeAt(1)
        let geometryType = typeof(VectorAsset).Assembly.GetType("Goo.PathGeometry")!!
        let geometry = geometryType.GetMethod("For", BindingFlags.Static | BindingFlags.NonPublic)!!.Invoke(
            nil,
            []object? {node.ClipPath}
        )!!
        let actualMinX = float32(
            geometryType.GetField("MinX", BindingFlags.Instance | BindingFlags.NonPublic)!!.GetValue(geometry)!!
        )
        Assert.Equal(minX, actualMinX, 4)
        Assert.Equal(FillRule.EvenOdd, node.ClipPathFillRule)
    }

    @Fact
    func RootAndNestedGroupClipsStayInTheirOwnCoordinateSpaces() {
        let asset = Svg.Parse(
            "<svg viewBox='0 0 100 100' clip-path='url(#outer)'>" +
                "<defs><clipPath id='outer'><rect width='30' height='30'/></clipPath>" +
                "<clipPath id='inner'><rect width='10' height='10'/></clipPath></defs>" +
                "<g clip-path='url(#outer)'><g transform='translate(20 0)' clip-path='url(#inner)'>" +
                "<rect width='20' height='20' transform='translate(5 0)'/></g></g></svg>"
        )
        let geometryType = typeof(VectorAsset).Assembly.GetType("Goo.PathGeometry")!!
        let geometryFor = geometryType.GetMethod("For", BindingFlags.Static | BindingFlags.NonPublic)!!
        let contains = geometryType.GetMethod("Contains", BindingFlags.Instance | BindingFlags.NonPublic)!!
        let points = [](X float32, Expected bool){(X: 25f, Expected: true), (X: 35f, Expected: false)}
        let childClip = geometryFor.Invoke(nil, []object? {asset.NodeAt(3).ClipPath})!!
        Assert.Equal(
            0,
            geometryType.GetField("QuadraticCount", BindingFlags.Instance | BindingFlags.NonPublic)!!.GetValue(
                childClip
            )
        )
        for point in points {
            var inside = true
            var x = point.Item1
            for var index = 0; index < 3; index++ {
                let node = asset.NodeAt(index)
                x -= float32(node.Transform.TranslateX.Magnitude)
                let geometry = geometryFor.Invoke(nil, []object? {node.ClipPath})!!
                inside &= bool(contains.Invoke(geometry, []object? {x, 5f, node.ClipPathFillRule})!!)
            }
            Assert.Equal(point.Item2, inside)
        }
    }

    @Fact
    func ClipRuleOverridesStillRejectMixedRules() {
        const source = "<svg viewBox='0 0 100 100'><defs><clipPath id='c' clip-rule='evenodd'><g><rect width='10' height='10'/><rect width='10' height='10' clip-rule='nonzero'/></g></clipPath></defs><rect width='100' height='100' clip-path='url(#c)'/></svg>"
        let error = Assert.Throws[SvgParseException](() -> Svg.Parse(source))
        Assert.Contains("cannot mix fill rules", error.Message)
    }

    @Fact
    func DtdAndExternalEntitiesAreRejected() {
        const source = "<!DOCTYPE svg [<!ENTITY external SYSTEM \"file:///etc/passwd\">]><svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1 1\"><path d=\"M0 0 L1 1\" fill=\"&external;\"/></svg>"
        let exception = Assert.Throws[SvgParseException](() -> Svg.Parse(source))
        Assert.Contains("DTD", exception.Message, StringComparison.OrdinalIgnoreCase)
    }

    @Theory
    @InlineData("opacity:0.8", 0.8)
    @InlineData("opacity:0.2;opacity:0.8", 0.8)
    func InlineOpacityOverridesPresentationOpacity(style string, expected float64) {
        let asset = Svg.Parse(
            "<svg viewBox=\"0 0 100 100\"><g opacity=\"0.5\"><g opacity=\"0.25\"><path opacity=\"0.5\" style=\"$style\" d=\"M0 0 L1 1\"/></g></g></svg>"
        )
        Assert.Equal(0.5, asset.NodeAt(1).Opacity, 6)
        Assert.Equal(0.25, asset.NodeAt(2).Opacity, 6)
        Assert.Equal(expected, asset.NodeAt(3).Opacity, 6)
    }

    @Fact
    func InvalidViewBoxIncludesDiagnostic() {
        const source = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 0 1\"/>"
        let exception = Assert.Throws[SvgParseException](() -> Svg.Parse(source))
        Assert.Contains("viewBox", exception.Message, StringComparison.Ordinal)
    }

    @Theory
    @InlineData(false)
    @InlineData(true)
    func DeepXmlIsRejectedBeforeBuildingDefinitions(fromStream bool) {
        let source = "<svg viewBox='0 0 10 10'><defs>" + string.Concat(Enumerable.Repeat("<g>", 50000)) + string.Concat(
            Enumerable.Repeat("</g>", 50000)
        ) +
            "</defs></svg>"
        using let stream = MemoryStream(Encoding.UTF8.GetBytes(source))
        let exception = Assert.Throws[SvgParseException](
            () -> if fromStream {
                Svg.Load(stream)
            } else {
                Svg.Parse(source)
            }
        )
        Assert.Contains("node depth exceeds renderer limit 1024", exception.Message)
        Assert.StartsWith("line 1, column", exception.Message)
    }

    @Theory
    @InlineData("s13-representative.svg", int32(5), int32(3), int32(137), int32(4), int32(2), int32(1))
    @InlineData("s13-animated.svg", int32(4), int32(2), int32(71), int32(4), int32(2), int32(0))
    @InlineData("s13-morph.svg", int32(2), int32(1), int32(3), int32(2), int32(1), int32(0))
    func RuntimeLoadsSamples(
        fileName string,
        nodes int32,
        contours int32,
        curves int32,
        paints int32,
        strokes int32,
        clips int32
    ) {
        let asset = Svg.Load(SamplePath(fileName))
        Assert.Equal(nodes, asset.NodeCount)
        Assert.Equal(contours, asset.ContourCount)
        Assert.Equal(curves, asset.CurveCount)
        Assert.Equal(paints, asset.PaintCount)
        Assert.Equal(strokes, asset.StrokeCount)
        Assert.Equal(clips, asset.ClipCount)
    }

    @Theory
    @InlineData("gradient", int32(256), true)
    @InlineData("gradient", int32(257), false)
    @InlineData("definition", int32(65536), true)
    @InlineData("definition", int32(65537), false)
    @InlineData("dash", int32(511), true)
    @InlineData("dash", int32(513), false)
    @InlineData("dash", int32(1024), true)
    @InlineData("dash", int32(1025), false)
    @InlineData("inherited", int32(127), true)
    @InlineData("inherited", int32(128), false)
    @InlineData("animation", int32(262144), true)
    @InlineData("animation", int32(262145), false)
    func SvgResourceBudgetsBoundDefinitionsAndInheritedValues(kind string, count int32, accepted bool) {
        let content = switch kind {
            case "gradient": "<defs>" + string.Concat(
                Enumerable.Range(0, count).Select(
                    (index int32) -> "<linearGradient id='g$index' href='#g${index + 1}'/>"
                )
            ) +
                "<linearGradient id='g$count'><stop offset='0' stop-color='red'/><stop offset='1' stop-color='blue'/></linearGradient></defs>" +
                "<path d='M0 0L1 1' fill='url(#g0)'/>"
            case "definition": "<defs>" + string.Concat(
                Enumerable.Range(0, count).Select((index int32) -> "<linearGradient id='g$index'/>")
            ) +
                "</defs>"
            case "dash": "<path d='M0 0L1 1' stroke='black' stroke-dasharray='${string.Join(' ', Enumerable.Repeat(1, count))}'/>"
            case "inherited": "<g stroke='black' stroke-dasharray='${string.Join(' ', Enumerable.Repeat(1, 1024))}'>" +
                string.Concat(Enumerable.Repeat("<path d='M0 0L1 1'/>", count)) + "</g>"
            default: "<path d='M0 0L1 1'><animate attributeName='opacity' values='${string.Join(';', Enumerable.Repeat(1, count))}' dur='1s' fill='freeze'/></path>"
        }
        let source = "<svg viewBox='0 0 10 10'>$content</svg>"
        if accepted {
            Assert.NotNull(Svg.Parse(source))
        } else {
            let exception = Assert.Throws[SvgParseException](() -> Svg.Parse(source))
            Assert.Contains(
                switch kind {
                    case "gradient": "gradient reference depth exceeds 256"
                    case "definition": "definition count exceeds 65536"
                    case "dash": "stroke-dasharray entry count exceeds 1024"
                    case "inherited": "dash entry count exceeds 262144"
                    default: "animation track limit exceeded"
                },
                exception.Message
            )
            Assert.StartsWith("line 1, column", exception.Message)
        }
    }

    @Fact
    func GradientInheritanceCycleIsRejected() {
        const source = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 10 10\"><defs><linearGradient id=\"a\" href=\"#b\"/><linearGradient id=\"b\" href=\"#a\"/></defs><path d=\"M0 0 L10 0 L10 10 Z\" fill=\"url(#a)\"/></svg>"
        Assert.Contains("cycle", Assert.Throws[SvgParseException](() -> Svg.Parse(source)).Message)
    }

    shared {
        private const BasicSvg string = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 20 10\"><path d=\"M0 0 L20 0 L20 10 Z\" fill=\"#123456\"/></svg>"

        private func SamplePath(fileName string) string -> Path.Combine(AppContext.BaseDirectory, "Assets", fileName)
    }
}
