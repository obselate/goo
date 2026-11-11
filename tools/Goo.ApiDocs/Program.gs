import GSharp.Core.CodeAnalysis.Syntax
import System.Text
import System.Text.RegularExpressions
import System.Xml.Linq
import Goo.Tools
import System
import System.Collections.Generic
import System.IO
import System.Linq

func AppendGradientStopsGuide(text StringBuilder) {
    text.AppendLine()
    text.AppendLine("## Gradient stops")
    text.AppendLine()
    text.AppendLine("Gradients accept two or more ordered stops. Repeated offsets create hard edges.")
    text.AppendLine("Interpolation uses premultiplied encoded sRGB, including stop alpha and element opacity.")
}

func AppendCellInputGuide(text StringBuilder) {
    text.AppendLine()
    text.AppendLine("## Build input cells")
    text.AppendLine()
    text.AppendLine(
        "Derive packaged components as `open class X : Cell<TInput>` and override `protected Build(input TInput) Blob`. Goo passes the stored immutable input snapshot. Same-assembly components can still override parameterless `Build()`. If both overloads are overridden, the typed overload wins. Override `ShouldRebuild(previous, next)` only when default structural equality does not match the rebuild policy."
    )
    text.AppendLine()
    text.AppendLine("## Forward input callbacks")
    text.AppendLine()
    text.AppendLine("```gsharp")
    text.AppendLine("private func Changed(value string) {")
    text.AppendLine("    InvokeInputCallback(current.OnChange, value)")
    text.AppendLine("}")
    text.AppendLine("```")
    text.AppendLine()
    text.AppendLine(
        "Use protected `Cell<TInput>.InvokeInputCallback` for input-time callbacks. It rebuilds only the Cell that supplied the input, even if the callback throws."
    )
    text.AppendLine(
        "A child-created Blob must forward supplied callbacks through this helper. Parent-built Blob content keeps its original author automatically."
    )
    text.AppendLine(
        "Guard costly arguments when the callback can be nil. Call Build-time queries directly. They must not change host state."
    )
}

func AppendCellMountGuide(text StringBuilder) {
    text.AppendLine()
    text.AppendLine("## Mount parameterless cells")
    text.AppendLine()
    text.AppendLine("```gsharp")
    text.AppendLine("Cell.Mount[Counter]()")
    text.AppendLine("```")
    text.AppendLine()
    text.AppendLine()
    text.AppendLine("```gsharp")
    text.AppendLine("Cell.Mount[Counter](\"counter\")")
    text.AppendLine("```")
}

func AppendCellFactoryGuide(text StringBuilder) {
    text.AppendLine()
    text.AppendLine((`## Mount with a factory

` + "`" + `Cell.Mount[TCell](factory, key)` + "`" + ` mounts a Cell with constructor dependencies without a parameterless constructor.

` + "```" + `gsharp
Cell.Mount[Counter](() -> Counter(store), "counter")
` + "```" + `

A mounted Cell is retained by declared ` + "`" + `TCell` + "`" + ` and sibling key. The factory runs only for a new mount. Rebuilding the parent, replacing the delegate, or changing captured values does not recreate the Cell. Change the key for a new instance. Factories returning the base ` + "`" + `Cell` + "`" + ` type need distinct stable keys for distinct components.

Goo owns and disposes the Cell on removal. Each invocation must return a fresh, unmounted, undisposed instance. Do not share an instance across mounts or return a disposed instance. A null factory or result is rejected.

Constructor arguments initialize the Cell. Update it through typed inputs, configuration, or an external store read by ` + "`" + `Build()` + "`" + `. Call its ` + "`" + `Rebuild()` + "`" + ` after changes outside Goo input callbacks. Read changing values from a store or getter, not a captured scalar copy. Calling ` + "`" + `Build()` + "`" + ` directly returns a Blob tree without mounting the Cell.

See [language interop](../interop.md) for other languages.

Capturing factories inside parent builds can allocate delegates and closures even when the Cell is reused. Cache factories with stable dependencies. Goo never invokes a factory to discover its result's runtime type.`))
}

func AppendStyleCompositionGuide(text StringBuilder) {
    text.AppendLine()
    text.AppendLine("## Compose reusable styles")
    text.AppendLine()
    text.AppendLine(
        "`Style.BasedOn` copies another style's ordered declarations at its exact declaration position. Declarations written afterward win, as in `Container{ BasedOn: CardStyle, BackgroundColor: selectedColor }`. The destination does not retain the source Style or share its declaration log."
    )
    text.AppendLine()
    text.AppendLine(
        "`BackgroundGradient: nil` is an explicit clear declaration. It removes an earlier composed or lower-state gradient while preserving `BackgroundColor`. Omitting `BackgroundGradient` leaves the earlier declaration in effect."
    )
}

func AppendImageSourceProviderMembers(text StringBuilder) {
    text.AppendLine()
    text.AppendLine("### `Acquire`")
    text.AppendLine()
    text.AppendLine("Creates the lease that Goo owns and disposes for one mounted image or background binding.")
}

func AppendShaderEffectGuide(text StringBuilder) {
    text.AppendLine()
    text.AppendLine("## Color and compositing")
    text.AppendLine()
    text.AppendLine("Compositing, gradients and image samples use premultiplied display-encoded sRGB channels in UNORM attachments. Alpha is linear coverage.")
    text.AppendLine()
    text.AppendLine("Vulkan startup requires a compatible UNORM surface. Goo does not use linear-light blending.")
    text.AppendLine()
    text.AppendLine("## Apply fragment shaders to retained elements")
    text.AppendLine()
    text.AppendLine("Effect programs use `goo-shader-effect-3`. Build effect sources with the current Goo build adapter before loading them.")
    text.AppendLine()
    text.AppendLine(
        "Load one backend-neutral `ShaderEffectProgram`, create retained `ShaderEffect` state from it, and assign the effect through the ordinary `Style.ShaderEffect` property on a `Container`, `Button`, `Text`, `Image`, `Shape`, or another Blob. Ordinary effects render that element and its subtree into a bounded offscreen layer, run the selected backend artifact, then composite the result without changing layout, hit testing, accessibility, transforms, or clipping."
    )
    text.AppendLine()
    text.AppendLine("```gsharp")
    text.AppendLine("import System")
    text.AppendLine("import System.IO")
    text.AppendLine("import System.Numerics")
    text.AppendLine("import Goo")
    text.AppendLine()
    text.AppendLine("let path = Path.Combine(AppContext.BaseDirectory, \"Shaders\", \"glass.goo-effect\")")
    text.AppendLine("let program = ShaderEffectProgram.Load(path)")
    text.AppendLine("let effect = ShaderEffect(program,")
    text.AppendLine("  samplesBackdrop: true,")
    text.AppendLine("  backdropOutset: 24.0F)")
    text.AppendLine("effect.SetParameter(0, Vector4(0.18F, 0.65F, 0.9F, 1.0F))")
    text.AppendLine("let data = ShaderEffectData(BitConverter.GetBytes(1.0F))")
    text.AppendLine("effect.SetData(0, data)")
    text.AppendLine()
    text.AppendLine("let control = Button{")
    text.AppendLine("  Width: 180,")
    text.AppendLine("  Height: 52,")
    text.AppendLine("  BorderRadius: 18,")
    text.AppendLine("  ShaderEffect: effect,")
    text.AppendLine("}")
    text.AppendLine("```")
    text.AppendLine()
    text.AppendLine(
        "Reuse the same effect instance for controls that share program and parameters. Create separate effect instances from the same program when controls need independent parameter state. Program sharing also shares the backend pipeline identity. `SetParameter` accepts slots 0 through 7, marks mounted users paint-dirty only when a value changes, and stays allocation-free after construction."
    )
    text.AppendLine()
    text.AppendLine(
        "Set `Playing = true` to opt into continuous renderer-driven playback. `ElapsedSeconds` is supplied separately through `gooElapsedSeconds()`, so playback does not consume one of the eight parameter slots. Pausing preserves the current elapsed position, and assigning `ElapsedSeconds` seeks while paused or playing. Goo schedules continuous frames only while a playing effect is mounted."
    )
    text.AppendLine()
    text.AppendLine(
        "Author ShaderEffects in native Slang by including Goo's fixed module and implementing `float4 gooEffect(float2 uv, float4 source, float4 backdrop)`. GLSL compatibility sources instead include `goo_effect.glsl` and implement the equivalent `vec4` function. `gooDataByteLength(slot)` and `gooDataWord(slot, wordIndex)` read retained data slots zero through three; invalid slots and out-of-range words return zero."
    )
    text.AppendLine()
    text.AppendLine("```slang")
    text.AppendLine("#include \"goo_effect.slang\"")
    text.AppendLine()
    text.AppendLine("float4 gooEffect(float2 uv, float4 source, float4 backdrop)")
    text.AppendLine("{")
    text.AppendLine("    float gain = gooDataByteLength(0) >= 4 ? asfloat(gooDataWord(0, 0)) : 1.0;")
    text.AppendLine("    float pulse = 0.5 + 0.5 * sin(gooElapsedSeconds());")
    text.AppendLine("    return lerp(source, backdrop, gooParameter(0).x * pulse) * gain;")
    text.AppendLine("}")
    text.AppendLine("```")
    text.AppendLine()
    text.AppendLine("Add the source to the G# project:")
    text.AppendLine()
    text.AppendLine("```xml")
    text.AppendLine("<ItemGroup>")
    text.AppendLine("  <GooShaderEffect Include=\"Shaders/glass.slang\" />")
    text.AppendLine("</ItemGroup>")
    text.AppendLine("```")
    text.AppendLine()
    text.AppendLine(
        "Use the shader toolchain in [platform preflight](../platform-preflight.md#custom-shaders). Build validates the source and copies the `.goo-effect` sidecar to build and publish output. `TargetPath` overrides its relative output path. Invalid sources fail the build."
    )
    text.AppendLine()
    text.AppendLine(
        "`uv` is normalized to visible element bounds. Inputs and output use premultiplied encoded sRGB. Mix authored sRGB colors directly with samples. Goo applies clip coverage and opacity afterward. Set `backdropOutset` to the largest filter radius or displacement. Without backdrop sampling, `backdrop` aliases `source`."
    )
    text.AppendLine()
    text.AppendLine(
        "Each `ShaderEffectData` publication is a complete replacement. The constructor and `Publish` copy bytes. `Transfer` and `PublishTransferred` take array ownership and invoke the supplied callback after Goo no longer reads that publication. Each source is limited to 16 MiB, each compiled scene frame is limited to 64 MiB of effect data, and unchanged retained versions reuse the existing upload. Goo recreates device-local data from the retained publication after device recovery."
    )
    text.AppendLine()
    text.AppendLine(
        "The generic `Publish[T]` overload accepts `ReadOnlySpan[T]` for unmanaged elements and copies native memory layout directly into one owned publication. Match shader field layout, alignment and byte order explicitly. Data published during `Build` is available to the following scene compilation. Publish geometry-dependent data from `MetricsChanged`, which runs after layout and before paint. The renderer snapshots retained data during scene compilation. Concurrent later publications belong to a later frame."
    )
    text.AppendLine()
    text.AppendLine(
        "Use `<GooShaderEffect Include=\"Shaders/field.slang\" SourceIndependent=\"true\" />` for a generator that replaces the element's visual subtree without sampling it. Its `source` and `backdrop` arguments are zero, and source/backdrop texture descriptors are unavailable. Goo draws it directly into the current target while retaining layout, input, accessibility, transforms, opacity and clipping. The artifact records this mode, and constructing a generator with backdrop sampling enabled throws. Group opacity and non-normal blending can still require an isolation layer. This removes the otherwise unused source capture pass, not every possible offscreen pass."
    )
    text.AppendLine()
    text.AppendLine(
        "The compiled program remains a sidecar asset in JIT and NativeAOT output. Compiler tools are not shipped or run at runtime. A target format permits 32 effect program identities per device generation. A non-normal `BlendMode` cannot share an element with a source-sampling `ShaderEffect`."
    )
}

func BuildIndex(sourceDirectories[]string, product string) string {
    let text = StringBuilder()
    text.AppendLine("# $product API")
    text.AppendLine()
    text.AppendLine("Generated API reference.")
    text.AppendLine()
    if product == "Goo" {
        text.AppendLine("| Task | API | Package |")
        text.AppendLine("| --- | --- | --- |")
        text.AppendLine("| Open a window | [Window](window.md) | Goo core |")
        text.AppendLine("| Arrange content | [Layout](layout.md) | Goo core |")
        text.AppendLine("| Show text | [Text](text.md) | Goo core |")
        text.AppendLine("| Add a button | [ActionButton](https://github.com/obselate/goo-widgets/blob/main/docs/usage.md#basic-widgets) | Goo.Widgets |")
        text.AppendLine("| Accept input | [Input](input.md) | Goo core |")
        text.AppendLine("| Keep local state | [Cell](cell.md) | Goo core |")
        text.AppendLine("| Set styles | [Style](style.md) | Goo core |")
        text.AppendLine("| Show lists | [Virtualization](tree.md) | Goo core |")
        text.AppendLine("| Load images | [Images](../images.md) | Goo core |")
        text.AppendLine("| Apply a theme | [Themes](https://github.com/obselate/goo-widgets/blob/main/docs/usage.md#goo-theme) | Goo.Widgets |")
        text.AppendLine()
    }
    for path in sourceDirectories {
        let name = Path.GetFileName(path)
        text.AppendLine("- [$name](${name.ToLowerInvariant()}.md)")
    }
    return text.ToString()
}

func ReadEnumValues(source string, start int32) IReadOnlyList[string] -> SyntaxTree
    .Parse(source)
    .Root
    .Members
    .OfType[EnumDeclarationSyntax]()
    .Single((declaration EnumDeclarationSyntax) -> declaration.Span.Start < start && declaration.Span.End > start)
    .Members
    .Select((member EnumMemberSyntax) -> member.Identifier.Text)
    .ToArray()

func BelongsTo(id string, xmlTypeName string, isFunction bool = false) bool -> if isFunction {
    id.StartsWith("M:" + xmlTypeName + "(", StringComparison.Ordinal)
} else {
    id.StartsWith("M:" + xmlTypeName + ".", StringComparison.Ordinal) || id.StartsWith(
        "P:" + xmlTypeName + ".",
        StringComparison.Ordinal
    ) ||
        id.StartsWith("F:" + xmlTypeName + ".", StringComparison.Ordinal) || id.StartsWith(
        "E:" + xmlTypeName + ".",
        StringComparison.Ordinal
    )
}

func GenericNames(displayName string)[]string {
    let open_ = displayName.IndexOf('<')
    return if open_ < 0 {
        System.Array.Empty[string]()
    } else {
        displayName[(open_ + 1) .. ^1].Split(',', StringSplitOptions.TrimEntries)
            .Select((parameter string) -> parameter.Split(' ', StringSplitOptions.RemoveEmptyEntries)[0])
            .ToArray()
    }
}

func DisplayMember(member ApiMember, type ApiType) string {
    var value = if type.IsFunction {
        type.DisplayName + member.Id[(type.XmlName.Length + 2) ..]
    } else {
        member.Id[(type.XmlName.Length + 3) ..]
    }
    let methodParameters = member
        .Element
        .Elements("typeparam")
        .Select((element XElement) -> element.Attribute(XName?("name")!!)?.Value ?? "T")
        .ToArray()
    for var index = 0; index < methodParameters.Length; index++ {
        value = value.Replace("``" + index.ToString(), methodParameters[index], StringComparison.Ordinal)
    }
    let typeParameters = GenericNames(type.DisplayName)
    for var index = 0; index < typeParameters.Length; index++ {
        value = value.Replace("`" + index.ToString(), typeParameters[index], StringComparison.Ordinal)
    }
    return value
        .Replace("#ctor", "new", StringComparison.Ordinal)
        .Replace("System.Boolean", "bool", StringComparison.Ordinal)
        .Replace("System.Double", "float64", StringComparison.Ordinal)
        .Replace("System.Single", "float32", StringComparison.Ordinal)
        .Replace("System.Int32", "int32", StringComparison.Ordinal)
        .Replace("System.String", "string", StringComparison.Ordinal)
        .Replace("Goo.", "", StringComparison.Ordinal)
}

func Normalize(value string?) string -> Regex.Replace(value ?? "", "\\s+", " ").Trim()

func ReadSourceSummary(source string, declarationStart int32) string {
    let lines = source[.. declarationStart].Replace("\r\n", "\n").Split('\n').ToList()
    while lines.Count != 0 && (lines[^1].Trim().Length == 0 || lines[^1].TrimStart().StartsWith('@')) {
        lines.RemoveAt(lines.Count - 1)
    }
    let summary = List[string]()
    while lines.Count != 0 && lines[^1].TrimStart().StartsWith("///", StringComparison.Ordinal) {
        summary.Add(lines[^1].TrimStart()[3 ..].Trim())
        lines.RemoveAt(lines.Count - 1)
    }
    summary.Reverse()
    return Normalize(string.Join(' ', summary))
}

func ReadTypes(directoryPath string, sourceRoot string) IEnumerable[ApiType] {
    let typePattern = Regex(
        "(?m)^(?:public\\s+)?(?:(?:partial|sealed|open|abstract|data|shared|unsafe)\\s+)*" +
            "(?<kind>class|struct|enum|interface|func)\\s+(?<name>[A-Za-z_][A-Za-z0-9_]*)" +
            "(?<generic>\\[[^\\]\\r\\n]+\\])?",
        RegexOptions.CultureInvariant
    )
    for file in Directory.EnumerateFiles(
        directoryPath,
        "*.gs",
        if directoryPath == sourceRoot {
            SearchOption.TopDirectoryOnly
        } else {
            SearchOption.AllDirectories
        }
    )
        .Order(StringComparer.Ordinal) {
        let source = File.ReadAllText(file)
        let package_ = Regex.Match(source, "(?m)^package\\s+([A-Za-z_][A-Za-z0-9_.]*)").Groups[1].Value
        for match Match in typePattern.Matches(source) {
            let name = match.Groups["name"].Value
            let isFunction = match.Groups["kind"].Value == "func"
            if isFunction && name == "operator" {
                continue
            }
            let generic = match.Groups["generic"].Value
            let arity = if generic.Length == 0 {
                0
            } else {
                generic.Count((character char) -> character == ',') + 1
            }
            let xmlName = package_ +
                "." +
                name +
                (
                if arity == 0 {
                    ""
                } else {
                    (
                        if isFunction {
                            "``"
                        } else {
                            "`"
                        }
                    ) +
                        arity.ToString()
                }
            )
            let values = if match.Groups["kind"].Value == "enum" {
                ReadEnumValues(source, match.Index + match.Length)
            } else {
                []string{}
            }
            yield ApiType(
                Path.GetFileName(directoryPath),
                name + generic.Replace('[', '<').Replace(']', '>'),
                xmlName,
                ReadSourceSummary(source, match.Index),
                values,
                []ApiSource{
                    ApiSource(
                        Path.GetRelativePath(sourceRoot, file).Replace(Path.DirectorySeparatorChar, '/'),
                        Path.GetFileName(file)
                    )
                },
                isFunction
            )
        }
    }
}

func Summary(element XElement) string -> Normalize(element.Element(XName?("summary")!!)?.Value)

func AppendText(text StringBuilder, value string) {
    if value.Length == 0 {
        return
    }
    text.AppendLine()
    text.AppendLine(value)
}

func BuildPage(
    directory string,
    types[]ApiType,
    members[]ApiMember,
    matched HashSet[string],
    guideRoot string,
    product string,
    sourceLink string,
    isRoot bool
) string {
    let text = StringBuilder()
    text.AppendLine("# $directory API")
    text.AppendLine()
    text.AppendLine(
        if isRoot {
            "Source: [`$product`]($sourceLink)"
        } else {
            "Source: [`$product/$directory`]($sourceLink/$directory)"
        }
    )
    if directory == "Accessibility" ||
        directory == "Window" ||
        directory == "Input" ||
        directory == "Tree" ||
        directory == "Layout" ||
        directory == "Motion" {
        text.AppendLine()
        text.Append(File.ReadAllText(Path.Combine(guideRoot, directory.ToLowerInvariant() + ".md")))
    }
    if directory == "Style" {
        AppendStyleCompositionGuide(text)
    }
    if directory == "Cell" {
        AppendCellInputGuide(text)
    }
    if directory == "Cell" {
        AppendCellMountGuide(text)
    }
    if directory == "Cell" {
        AppendCellFactoryGuide(text)
    }
    if directory == "Rendering" {
        AppendShaderEffectGuide(text)
    }
    if directory == "Rendering" {
        AppendGradientStopsGuide(text)
    }
    if directory == "Text" {
        text.AppendLine()
        text.AppendLine("Use [Window.MeasureText](window.md#measuretextstringstyle) to size content to the widest label.")
    }
    if directory == "Images" {
        text.AppendLine()
        text.AppendLine("See [image loading](../images.md) and [owned sources](tree.md#owned-image-sources).")
    }
    if directory == "Diagnostics" {
        text.AppendLine()
        text.AppendLine("See the [diagnostics protocol](../devtools/protocol.md) for counters and capture fields.")
    }
    for type in types {
        text.AppendLine()
        text.AppendLine("## `${type.DisplayName}`")
        text.AppendLine()
        let typeId = "T:" + type.XmlName
        let typeMember ApiMember? = members.SingleOrDefault((member ApiMember) -> member.Id == typeId)
        if typeMember != nil {
            matched.Add(typeId)
            AppendText(text, Summary(typeMember.Element))
        } else if !type.IsFunction {
            AppendText(text, type.Summary)
        }
        let undocumentedValues = type.EnumValues.Where(
            (value string) -> !members.Any((member ApiMember) -> member.Id == "F:" + type.XmlName + "." + value)
        ).ToArray()
        if undocumentedValues.Length != 0 {
            text.AppendLine()
            text.AppendLine("### Values")
            text.AppendLine()
            for value in undocumentedValues {
                text.AppendLine("- `$value`")
            }
        }
        if type.XmlName == "Goo.ImageSourceProvider" && !members.Any(
            (member ApiMember) -> BelongsTo(member.Id, type.XmlName, type.IsFunction)
        ) {
            AppendImageSourceProviderMembers(text)
        }
        let summaries = HashSet[string](StringComparer.Ordinal)
        for member in members.Where((member ApiMember) -> BelongsTo(member.Id, type.XmlName, type.IsFunction)).OrderBy(
            (member ApiMember) -> member.Id,
            StringComparer.Ordinal
        ) {
            matched.Add(member.Id)
            let name = member.Id[(type.XmlName.Length + 3) ..]
            if !type.IsFunction && (
                name.StartsWith("Equals(System.Object)", StringComparison.Ordinal) ||
                name == "GetHashCode" ||
                name.StartsWith("op_Equality(", StringComparison.Ordinal) ||
                name.StartsWith("op_Inequality(", StringComparison.Ordinal) ||
                type.XmlName == "Goo.FontVariation" &&
                    (name.StartsWith("Equals(", StringComparison.Ordinal) ||
                     name.StartsWith("Deconstruct(", StringComparison.Ordinal) || name == "ToString")
            ) {
                continue
            }
            text.AppendLine()
            text.AppendLine("### `${DisplayMember(member, type)}`")
            let summary = Summary(member.Element)
            if summaries.Add(summary) {
                AppendText(text, summary)
            }
            let parameters = member.Element.Elements("typeparam").Concat(member.Element.Elements("param")).ToArray()
            if parameters.Length != 0 {
                text.AppendLine()
                for parameter in parameters {
                    text.AppendLine(
                        "- `${parameter.Attribute(XName?("name")!!)?.Value}`: ${Normalize(parameter.Value)}"
                    )
                }
            }
            let returns = Normalize(member.Element.Element(XName?("returns")!!)?.Value)
            if returns.Length != 0 && returns != "This builder." {
                text.AppendLine()
                text.AppendLine("Returns: $returns")
            }
        }
    }
    return text.ToString()
}

func FormatPage(content string) string -> Regex.Replace(
    content.Replace("\r\n", "\n"),
    "(```gsharp\\n)(.*?)(```)",
    (match Match) -> match.Groups[1].Value + SourceFormatting.Format(match.Groups[2].Value) + match.Groups[3].Value,
    RegexOptions.Singleline
)

func WriteIfChanged(path string, content string) {
    if File.Exists(path) && File.ReadAllText(path) == content {
        return
    }
    Directory.CreateDirectory(Path.GetDirectoryName(path)!!)
    File.WriteAllText(path, content, UTF8Encoding(false))
}

func ParseArguments(values[]string) Dictionary[string, string] {
    let result = Dictionary[string, string](StringComparer.Ordinal)
    for var index = 0; index < values.Length; index += 2 {
        let option = values[index]
        if option is not("--xml" or "--source" or "--output" or "--link-output") || index + 1 >= values.Length {
            throw ArgumentException("Use --xml, --source, --output or --link-output followed by a path.")
        }
        if !result.TryAdd(option[2 ..], values[index + 1]) {
            throw ArgumentException("Duplicate option: " + option)
        }
    }
    return result
}

func Resolve(value string?, fallback string) string -> Path.GetFullPath(value ?? fallback)

func FindRepositoryRoot(start string) string {
    for var directory DirectoryInfo? = DirectoryInfo(start); directory != nil; directory = directory!!.Parent {
        if File.Exists(Path.Combine(directory.FullName, "Goo", "Goo.gsproj")) {
            return directory.FullName
        }
    }
    throw DirectoryNotFoundException("Could not find the Goo repository root.")
}

internal data class ApiType(
    Directory string,
    DisplayName string,
    XmlName string,
    Summary string,
    EnumValues IReadOnlyList[string],
    Sources IReadOnlyList[ApiSource],
    IsFunction bool = false
) : IEquatable[ApiType] { }

internal data class ApiSource(RelativeFile string, FileName string) : IEquatable[ApiSource] { }

internal data class ApiMember(Id string, Element XElement) : IEquatable[ApiMember] { }

if args.Contains("--help") || args.Contains("-h") {
    Console.WriteLine("Usage: Goo.ApiDocs [--xml FILE] [--source DIRECTORY] [--output DIRECTORY]")
    return
}
let repositoryRoot = FindRepositoryRoot(Environment.CurrentDirectory)
let arguments = ParseArguments(args)

let xmlPath = Resolve(
    arguments.GetValueOrDefault("xml"),
    Path.Combine(repositoryRoot, "Goo", "bin", "Release", "net10.0", "Goo.xml")
)

let sourceRoot = Resolve(arguments.GetValueOrDefault("source"), Path.Combine(repositoryRoot, "Goo"))
let outputRoot = Resolve(arguments.GetValueOrDefault("output"), Path.Combine(repositoryRoot, "docs", "api"))
let product = Path.GetFileNameWithoutExtension(xmlPath)
let sourceLink = Path.GetRelativePath(Resolve(arguments.GetValueOrDefault("link-output"), outputRoot), sourceRoot).Replace(Path.DirectorySeparatorChar, '/')

if !File.Exists(xmlPath) {
    throw FileNotFoundException("Build Goo in Release mode before generating API pages.", xmlPath)
}

let sourceDirectories = Directory
    .EnumerateDirectories(sourceRoot)
    .Where((path string) -> Path.GetFileName(path) is not("bin" or "obj"))
    .Prepend(sourceRoot)
    .OrderBy(Path.GetFileName, StringComparer.Ordinal)
    .ToArray()

var types = sourceDirectories
    .SelectMany((path string) -> ReadTypes(path, sourceRoot))
    .GroupBy((type ApiType) -> type.XmlName, StringComparer.Ordinal)
    .Select(
    (group IGrouping[string, ApiType]) -> (
        group.OrderByDescending(
            (type ApiType) -> type.Sources.Any(
                (source ApiSource) -> source.FileName == type.DisplayName.Split('<')[0] + ".gs"
            )
        )
            .First() with{
            Sources = group
                .SelectMany(
                func (type ApiType) IEnumerable[ApiSource] {
                    return type.Sources
                }
            )
                .OrderBy((source ApiSource) -> source.RelativeFile, StringComparer.Ordinal)
                .ToArray()
        }
    )
)
    .ToArray()

let members = XDocument
    .Load(xmlPath)
    .Descendants("member")
    .Select(
    (element XElement) -> ApiMember(
        element.Attribute(XName?("name")!!)?.Value ?? throw InvalidDataException("XML member has no name."),
        element
    )
)
    .ToArray()

types = types.Concat(members
    .Where(member -> member.Id.StartsWith("T:", StringComparison.Ordinal) &&
        !types.Any(type -> type.XmlName == member.Id[2..]))
    .Select(member -> ApiType(
        Path.GetFileName(sourceRoot), member.Id[(member.Id.LastIndexOf('.') + 1)..],
        member.Id[2..], "", []string{}, []ApiSource{}, false
    )))
    .OrderBy(type -> type.Directory, StringComparer.Ordinal)
    .ThenBy(type -> type.DisplayName, StringComparer.Ordinal)
    .ToArray()

let guideRoot = Path.Combine(repositoryRoot, "tools", "Goo.ApiDocs", "Guides")

let documentedDirectories = sourceDirectories.Where(
    (path string) -> types.Any((type ApiType) -> type.Directory == Path.GetFileName(path))
)
    .ToArray()

let matched = HashSet[string](StringComparer.Ordinal)
let pages = Dictionary[string, string](StringComparer.Ordinal)

if product != "Goo" {
    pages.Add("README.md", FormatPage(BuildPage(product, types, members, matched, guideRoot, product, sourceLink, true)))
} else {
    for directoryPath in documentedDirectories {
        let directory = Path.GetFileName(directoryPath)
        let pageTypes = types.Where((type ApiType) -> type.Directory == directory).ToArray()
        let markdown = BuildPage(
            directory,
            pageTypes,
            members,
            matched,
            guideRoot,
            product,
            sourceLink,
            directoryPath == sourceRoot
        )
        pages.Add(directory.ToLowerInvariant() + ".md", FormatPage(markdown))
    }
}

let unmatched = members
    .Select((member ApiMember) -> member.Id)
    .Where((id string) -> !matched.Contains(id))
    .Order(StringComparer.Ordinal)
    .ToArray()

if unmatched.Length != 0 {
    throw InvalidDataException(
        "Unmapped Goo.xml members:" + Environment.NewLine + string.Join(Environment.NewLine, unmatched)
    )
}

if product == "Goo" {
    pages.Add("README.md", FormatPage(BuildIndex(documentedDirectories, product)))
}
Directory.CreateDirectory(outputRoot)

for stalePath in Directory.EnumerateFiles(outputRoot, "*.md") {
    if !pages.ContainsKey(Path.GetFileName(stalePath)) {
        File.Delete(stalePath)
    }
}

for (name, markdown) in pages {
    WriteIfChanged(Path.Combine(outputRoot, name), markdown)
}

Console.WriteLine("Generated ${documentedDirectories.Length} API pages in $outputRoot.")
