package Goo.Svg

import Goo
import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Security
import System.Text
import System.Xml
import System.Xml.Linq

internal partial class SvgParser {
    private let gradients Dictionary[string, SvgGradientDefinition] = Dictionary[string, SvgGradientDefinition](
        StringComparer.Ordinal
    )
    private let clips Dictionary[string, SvgClipDefinition] = Dictionary[string, SvgClipDefinition](
        StringComparer.Ordinal
    )
    private let ids HashSet[string] = HashSet[string](StringComparer.Ordinal)
    private let nodes List[SvgNode] = List[SvgNode]()
    private var reservedCurveCount int32
    private var reservedAnimationTracks int32
    private var reservedAnimationKeyframes int32
    private var reservedMorphCurves int64
    private var viewBoxX float64
    private var viewBoxY float64
    private var viewBoxWidth float64
    private var viewBoxHeight float64

    private init() { }

    private func Parse(root XElement) VectorAsset {
        RequireName(root, "svg")
        ValidateNamespace(root)
        CollectDefinitions(root)
        ParseViewBox(root)
        let rootStyle = ResolveStyle(root, SvgStyle())
        let rootNode = SvgNode{
            Parent: nil,
            Transform: SvgMatrix.Identity,
            Opacity: rootStyle.LocalOpacity,
            Clip: if let clip = rootStyle.ClipPath {
                ParseClip(clip, root)
            } else {
                nil
            },
            Index: 0
        }
        nodes.Add(rootNode)
        if rootStyle.DisplayNone {
            return BuildAsset()
        }
        for child in root.Elements() {
            ParseChild(child, rootNode, rootStyle, false, 1)
        }
        if nodes.Count > MaxNodes {
            throw Fail(root, "SVG complexity limit exceeded")
        }
        return BuildAsset()
    }

    private func CollectDefinitions(root XElement) {
        for element in root.DescendantsAndSelf() {
            ValidateNamespace(element)
            let name = LocalName(element)
            if let id = string?(element.Attribute("id")) {
                if id.Length == 0 || !ids.Add(id) {
                    throw Fail(element, "duplicate or empty id")
                }
                if (name is "linearGradient" or "radialGradient") {
                    gradients.Add(id, SvgGradientDefinition(element))
                } else if name == "clipPath" {
                    clips.Add(id, SvgClipDefinition(element))
                }
            }
            if (
                name is "style" or
                    "script" or
                    "filter" or
                    "mask" or
                    "foreignObject" or
                    "image" or
                    "text" or
                    "use" or
                    "pattern" or
                    "symbol"
            ) {
                throw Fail(element, "SVG element '$name' is outside the supported subset")
            }
            if (name is "animateMotion" or "animateColor" or "set" or "mpath") {
                throw Fail(element, "SVG animation element '$name' is outside the controlled animation subset")
            }
            if IsAnimationElement(element) &&
                (
                element.Parent == nil ||
                    LocalName(element.Parent!!) is not(
                    "g" or "path" or "rect" or "circle" or "ellipse" or "line" or "polyline" or "polygon"
                ) ||
                    element
                    .Ancestors().Any(
                    (ancestor XElement) -> (
                        LocalName(ancestor) is "defs" or "clipPath" or "linearGradient" or "radialGradient" or "stop"
                    )
                )
            ) {
                throw Fail(element, "SVG animation element '$name' is not attached to a renderable node")
            }
            for attribute in element.Attributes() {
                let attributeName = attribute.Name.LocalName
                if attributeName == "class" || attributeName.StartsWith("on", StringComparison.OrdinalIgnoreCase) ||
                    (attributeName is "filter" or "mask" or "externalResourcesRequired") {
                    throw Fail(element, "SVG attribute '$attributeName' is outside the supported subset")
                }
                if (attributeName is "href" or "xlink:href") {
                    let value = attribute.Value.Trim()
                    if !value.StartsWith("#", StringComparison.Ordinal) || value.Length == 1 {
                        throw Fail(element, "external SVG references are not allowed")
                    }
                }
            }
        }
    }

    private func ParseViewBox(root XElement) {
        if let viewBox = string?(root.Attribute("viewBox")) {
            let values = ParseNumberList(viewBox, root, "viewBox")
            if values.Count != 4 || values[2] <= 0.0 || values[3] <= 0.0 {
                throw Fail(root, "viewBox must contain four positive finite values")
            }
            viewBoxX = values[0]
            viewBoxY = values[1]
            viewBoxWidth = values[2]
            viewBoxHeight = values[3]
            return
        }
        viewBoxX = 0.0
        viewBoxY = 0.0
        viewBoxWidth = ParseLength(string?(root.Attribute("width")) ?? "0", 0.0, root, "width")
        viewBoxHeight = ParseLength(string?(root.Attribute("height")) ?? "0", 0.0, root, "height")
        if viewBoxWidth <= 0.0 || viewBoxHeight <= 0.0 {
            throw Fail(root, "root SVG requires a positive viewBox or width and height")
        }
    }

    private func ParseChild(element XElement, parent SvgNode, inherited SvgStyle, inClip bool, depth int32) {
        let name = LocalName(element)
        if (name is "defs" or "title" or "desc" or "metadata") {
            return
        }
        if name == "svg" {
            throw Fail(element, "nested svg elements are not supported")
        }
        if depth >= MaxRenderDepth {
            throw Fail(element, "node depth exceeds renderer limit $MaxRenderDepth")
        }
        if name == "g" {
            let style = ResolveStyle(element, inherited)
            if style.DisplayNone {
                return
            }
            let group = AddNode(
                parent,
                ParseTransform(string?(element.Attribute("transform")), element),
                style.LocalOpacity,
                nil,
                style,
                element
            )
            for child in element.Elements() {
                if IsAnimationElement(child) {
                    ParseAnimation(child, group)
                } else {
                    ParseChild(child, group, style, inClip, depth + 1)
                }
            }
            return
        }
        if inClip {
            throw Fail(element, "clipPath child '$name' is not representable")
        }
        if (name is "path" or "rect" or "circle" or "ellipse" or "line" or "polyline" or "polygon") {
            let style = ResolveStyle(element, inherited)
            if style.DisplayNone {
                return
            }
            let path = ParseGeometry(element)
            let shape = BuildShape(element, path, style)
            let transform = ParseTransform(string?(element.Attribute("transform")), element)
            let node = AddNode(parent, transform, style.LocalOpacity, shape, style, element)
            for child in element.Elements() {
                if IsAnimationElement(child) {
                    ParseAnimation(child, node)
                } else {
                    throw Fail(child, "SVG shape child '${LocalName(child)}' is not supported")
                }
            }
            return
        }
        throw Fail(element, "SVG element '$name' is outside the supported subset")
    }

    private func AddNode(
        parent SvgNode,
        transform SvgMatrix,
        opacity float64,
        shape SvgShape?,
        style SvgStyle,
        element XElement
    ) SvgNode {
        if nodes.Count >= MaxNodes {
            throw SvgParseException("node count exceeds $MaxNodes")
        }
        let node = SvgNode{
            Parent: parent,
            Transform: transform,
            Opacity: opacity,
            Shape: shape,
            Clip: if let clip = style.ClipPath {
                ParseClip(clip, element)
            } else {
                nil
            },
            Index: nodes.Count
        }
        nodes.Add(node)
        parent.Children.Add(node)
        return node
    }

    shared {
        private const MaxInputBytes int32 = 16 * 1024 * 1024
        private const MaxXmlCharacters int32 = 32 * 1024 * 1024
        private const MaxNodes int32 = 65536
        private const MaxCurves int32 = 262144
        private const MaxPaints int32 = 65536
        private const MaxStrokes int32 = 65536
        private const MaxRenderDepth int32 = 1024
        private const MaxAnimationTracks int32 = 65536
        private const MaxAnimationKeyframes int32 = 262144
        private const MaxMorphCurves int32 = 262144
        private const QuadraticTolerance float64 = 0.0001
        private const EllipseControlRatio float64 = 0.5522847498307936

        internal func LoadFile(path string) VectorAsset {
            if string.IsNullOrWhiteSpace(path) {
                throw SvgParseException("input path is empty")
            }
            try {
                using let stream = File.OpenRead(path)
                return LoadStream(stream, path)
            } catch (exception Exception) when exception is IOException ||
                exception is UnauthorizedAccessException ||
                exception is ArgumentException ||
                exception is NotSupportedException ||
                exception is SecurityException {
                throw SvgParseException("cannot read '$path': ${exception.Message}")
            }
        }

        internal func ParseText(text string?) VectorAsset {
            if text == nil {
                throw SvgParseException("input text is null")
            }
            if Encoding.UTF8.GetByteCount(text) > MaxInputBytes {
                throw SvgParseException("input exceeds $MaxInputBytes bytes")
            }
            try {
                using let depthSource = StringReader(text)
                using let depthReader = XmlReader.Create(depthSource, CreateXmlSettings(), "<string>")
                ValidateDepth(depthReader)
                using let source = StringReader(text)
                using let reader = XmlReader.Create(source, CreateXmlSettings(), "<string>")
                return ParseDocument(reader, "<string>")
            } catch (SvgParseException) {
                rethrow
            } catch (exception Exception) {
                throw SvgParseException(exception.Message)
            }
        }

        internal func LoadStream(stream Stream?, sourceName string) VectorAsset {
            var sourceName = sourceName
            if stream == nil {
                throw SvgParseException("input stream is null")
            }
            if string.IsNullOrWhiteSpace(sourceName) {
                sourceName = "<stream>"
            }
            try {
                using let copy = MemoryStream()
                let buffer = [81920]uint8
                var total = 0
                while true {
                    let read = stream.Read(buffer, 0, buffer.Length)
                    if read == 0 {
                        break
                    }
                    if total > MaxInputBytes - read {
                        throw SvgParseException("input exceeds $MaxInputBytes bytes")
                    }
                    copy.Write(buffer, 0, read)
                    total += read
                }
                return ParseBytes(copy.ToArray(), sourceName)
            } catch (SvgParseException) {
                rethrow
            } catch (exception Exception) when exception is IOException ||
                exception is UnauthorizedAccessException ||
                exception is ObjectDisposedException ||
                exception is NotSupportedException {
                throw SvgParseException("cannot read '$sourceName': ${exception.Message}")
            }
        }

        private func ParseBytes(bytes[]uint8, sourceName string) VectorAsset {
            if bytes.Length > MaxInputBytes {
                throw SvgParseException("input exceeds $MaxInputBytes bytes")
            }
            try {
                using let stream = MemoryStream(bytes, writable: false)
                using let depthReader = XmlReader.Create(stream, CreateXmlSettings(), sourceName)
                ValidateDepth(depthReader)
                stream.Position = 0
                using let reader = XmlReader.Create(stream, CreateXmlSettings(), sourceName)
                return ParseDocument(reader, sourceName)
            } catch (SvgParseException) {
                rethrow
            } catch (exception Exception) {
                throw SvgParseException(exception.Message)
            }
        }

        private func ParseDocument(reader XmlReader, sourceName string) VectorAsset {
            try {
                let document = XDocument.Load(reader, LoadOptions.SetLineInfo)
                let root = document.Root ?? throw SvgParseException("document has no root element")
                return SvgParser().Parse(root)
            } catch (SvgParseException) {
                rethrow
            } catch (exception XmlException) {
                throw SvgParseException(
                    "XML line ${exception.LineNumber}, column ${exception.LinePosition}: ${exception.Message}"
                )
            } catch (exception Exception) {
                throw SvgParseException("$sourceName: ${exception.Message}")
            }
        }

        private func ValidateDepth(reader XmlReader) {
            while reader.Read() {
                if reader.NodeType == XmlNodeType.Element && reader.Depth >= MaxRenderDepth {
                    let info = cast[IXmlLineInfo](reader)
                    throw SvgParseException(
                        "line ${info.LineNumber}, column ${info.LinePosition}: node depth exceeds renderer limit $MaxRenderDepth"
                    )
                }
            }
        }

        private func CreateXmlSettings() XmlReaderSettings -> XmlReaderSettings{
            DtdProcessing: DtdProcessing.Prohibit,
            XmlResolver: nil,
            MaxCharactersInDocument: MaxXmlCharacters,
            MaxCharactersFromEntities: 0,
            IgnoreComments: true,
            IgnoreWhitespace: false
        }
    }
}
