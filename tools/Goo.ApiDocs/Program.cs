using GSharp.Core.CodeAnalysis.Syntax;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml.Linq;

var repositoryRoot = FindRepositoryRoot(Environment.CurrentDirectory);
var arguments = ParseArguments(args);
var xmlPath = Resolve(arguments.GetValueOrDefault("xml"),
    Path.Combine(repositoryRoot, "Goo", "bin", "Release", "net10.0", "Goo.xml"));
var sourceRoot = Resolve(arguments.GetValueOrDefault("source"), Path.Combine(repositoryRoot, "Goo"));
var outputRoot = Resolve(arguments.GetValueOrDefault("output"), Path.Combine(repositoryRoot, "docs", "api"));

if (!File.Exists(xmlPath))
    throw new FileNotFoundException("Build Goo in Release mode before generating API pages.", xmlPath);

var sourceDirectories = Directory.EnumerateDirectories(sourceRoot)
    .Where(path => Path.GetFileName(path) is not ("bin" or "obj"))
    .OrderBy(Path.GetFileName, StringComparer.Ordinal)
    .ToArray();
var types = sourceDirectories
    .SelectMany(path => ReadTypes(path, sourceRoot))
    .GroupBy(type => type.XmlName, StringComparer.Ordinal)
    .Select(group => group.OrderByDescending(type => type.Sources.Any(source =>
        source.FileName == type.DisplayName.Split('<')[0] + ".gs")).First() with
    {
        Sources = group.SelectMany(type => type.Sources)
            .OrderBy(source => source.RelativeFile, StringComparer.Ordinal)
            .ToArray(),
    })
    .OrderBy(type => type.Directory, StringComparer.Ordinal)
    .ThenBy(type => type.DisplayName, StringComparer.Ordinal)
    .ToArray();
var members = XDocument.Load(xmlPath)
    .Descendants("member")
    .Select(element => new ApiMember(
        element.Attribute("name")?.Value ?? throw new InvalidDataException("XML member has no name."),
        element))
    .ToArray();

var guideRoot = Path.Combine(repositoryRoot, "tools", "Goo.ApiDocs", "Guides");
var documentedDirectories = sourceDirectories
    .Where(path => types.Any(type => type.Directory == Path.GetFileName(path)))
    .ToArray();
var matched = new HashSet<string>(StringComparer.Ordinal);
var pages = new Dictionary<string, string>(StringComparer.Ordinal);
foreach (var directoryPath in documentedDirectories)
{
    var directory = Path.GetFileName(directoryPath);
    var pageTypes = types.Where(type => type.Directory == directory).ToArray();
    var markdown = BuildPage(directory, pageTypes, members, matched, guideRoot);
    pages.Add(directory.ToLowerInvariant() + ".md", FormatPage(markdown));
}

var unmatched = members.Select(member => member.Id)
    .Where(id => !matched.Contains(id))
    .Order(StringComparer.Ordinal)
    .ToArray();
if (unmatched.Length != 0)
    throw new InvalidDataException("Unmapped Goo.xml members:" + Environment.NewLine + string.Join(Environment.NewLine, unmatched));

pages.Add("README.md", FormatPage(BuildIndex(documentedDirectories)));
Directory.CreateDirectory(outputRoot);
foreach (var stalePath in Directory.EnumerateFiles(outputRoot, "*.md"))
{
    if (!pages.ContainsKey(Path.GetFileName(stalePath)))
        File.Delete(stalePath);
}
foreach (var (name, markdown) in pages)
    WriteIfChanged(Path.Combine(outputRoot, name), markdown);
Console.WriteLine($"Generated {documentedDirectories.Length} API pages in {outputRoot}.");

static void AppendGradientStopsGuide(StringBuilder text)
{
    text.AppendLine();
    text.AppendLine("## Gradient stops");
    text.AppendLine();
    text.AppendLine("Linear and radial gradients accept two or more ordered stops, including repeated");
    text.AppendLine("positions for hard color edges. There is no fixed four-stop limit. Larger stop");
    text.AppendLine("lists use Goo-owned GPU storage and remain a single gradient draw; device storage");
    text.AppendLine("limits still apply. Interpolation uses premultiplied linear color, including");
    text.AppendLine("per-stop alpha and element opacity.");
}

static string BuildPage(string directory, ApiType[] types, ApiMember[] members, HashSet<string> matched, string guideRoot)
{
    var text = new StringBuilder();
    text.AppendLine($"# {directory} API");
    text.AppendLine();
    text.AppendLine("Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.");
    text.AppendLine();
    text.AppendLine($"Source: [`Goo/{directory}`](../../Goo/{directory})");

    if (directory is "Accessibility" or "Window" or "Input" or "Tree" or "Layout")
    {
        text.AppendLine();
        text.Append(File.ReadAllText(Path.Combine(guideRoot, directory.ToLowerInvariant() + ".md")));
    }

    if (directory == "Style")
        AppendStyleCompositionGuide(text);
    if (directory == "Cell")
        AppendCellInputGuide(text);
    if (directory == "Cell")
        AppendCellFactoryGuide(text);
    if (directory == "Rendering")
        AppendShaderEffectGuide(text);
    if (directory == "Rendering")
        AppendGradientStopsGuide(text);

    foreach (var type in types)
    {
        text.AppendLine();
        text.AppendLine($"## `{type.DisplayName}`");
        text.AppendLine();
        text.AppendLine(type.Sources.Count == 1 ? "Source:" : "Sources:");
        text.AppendLine();
        foreach (var source in type.Sources)
            text.AppendLine($"- [`{source.FileName}`](../../Goo/{source.RelativeFile})");

        var typeId = "T:" + type.XmlName;
        var typeMember = members.SingleOrDefault(member => member.Id == typeId);
        if (typeMember is not null)
        {
            matched.Add(typeId);
            AppendText(text, Summary(typeMember.Element));
        }
        else
        {
            AppendText(text, type.Summary);
        }

        if (type.EnumValues.Count != 0)
        {
            text.AppendLine();
            text.AppendLine("### Values");
            text.AppendLine();
            foreach (var value in type.EnumValues)
                text.AppendLine($"- `{value}`");
        }

        if (type.XmlName == "Goo.ImageSourceProvider"
            && !members.Any(member => BelongsTo(member.Id, type.XmlName, type.IsFunction)))
            AppendImageSourceProviderMembers(text);

        foreach (var member in members
            .Where(member => BelongsTo(member.Id, type.XmlName, type.IsFunction))
            .OrderBy(member => member.Id, StringComparer.Ordinal))
        {
            matched.Add(member.Id);
            text.AppendLine();
            text.AppendLine($"### `{DisplayMember(member, type)}`");
            AppendText(text, Summary(member.Element));

            var parameters = member.Element.Elements("typeparam")
                .Concat(member.Element.Elements("param"))
                .ToArray();
            if (parameters.Length != 0)
            {
                text.AppendLine();
                foreach (var parameter in parameters)
                    text.AppendLine($"- `{parameter.Attribute("name")?.Value}`: {Normalize(parameter.Value)}");
            }

            var returns = Normalize(member.Element.Element("returns")?.Value);
            if (returns.Length != 0)
            {
                text.AppendLine();
                text.AppendLine($"Returns: {returns}");
            }
        }
    }

    return text.ToString();
}

static void AppendCellInputGuide(StringBuilder text)
{
    text.AppendLine();
    text.AppendLine("## Build input cells");
    text.AppendLine();
    text.AppendLine("Store local Cell state in ordinary fields. Goo rebuilds the owning Cell after its input callbacks. Call `Rebuild()` after mutations outside Goo input dispatch.");
    text.AppendLine();
    text.AppendLine("A packaged G# component derived from `Cell<TInput>` should be an `open class` and override `protected Build(input TInput) Blob`. G# requires the inheritable class declaration because the override is protected. Goo passes the stored immutable snapshot through this typed dispatch path. Existing same-assembly components that override parameterless `Build()` remain valid. If a component overrides both overloads, the typed overload takes precedence. Override `ShouldRebuild(previous, next)` only when default structural equality does not match the component's rebuild policy.");
}

static void AppendCellFactoryGuide(StringBuilder text)
{
    text.AppendLine();
    text.AppendLine("""
        ## Mount with a factory

        `Cell.Mount<TCell>(factory, key)` accepts a `System.Func<TCell>` and does not require a parameterless constructor. The factory can supply constructor dependencies or create an F# object expression. The existing mounts with configuration, seeding, or typed inputs remain available.

        ```gsharp
        Cell.Mount[Counter](() -> Counter(store), "counter")
        ```

        ```csharp
        Cell.Mount(() => new Counter(store), "counter")
        ```

        A mounted Cell is retained by its declared `TCell` and sibling key. The factory runs only when a new mount is needed. Rebuilding the parent, replacing its factory delegate, or changing values captured by the factory does not recreate the retained Cell. Use a different key when a different instance is required. When several factories return the base `Cell` type, give their distinct components distinct stable keys.

        Goo owns the returned Cell and disposes it when removed. Each factory invocation must return a fresh, unmounted, undisposed instance. Do not return one instance for multiple mounts or return a disposed instance after removal. A null factory or result is rejected.

        Constructor arguments are initialization, not changing input snapshots. For later updates, use typed inputs, configuration, or an external store read by `Build()`. Call the mounted Cell's `Rebuild()` after changes outside Goo input callbacks. Read changing values from the store or a getter instead of capturing a copied scalar. Calling a Cell's `Build()` directly only returns its Blob tree and does not mount that Cell.

        F# can call the CLR overload directly or through a helper:

        ```fsharp
        open System
        open Goo

        let mount key (create: unit -> Cell) =
            Cell.Mount<Cell>(Func<Cell>(create), key)

        let counter (value: int ref) =
            { new Cell() with
                override _.Build() =
                    Text(Content = $"Count: {value.Value}") :> Blob }

        let value = ref 0
        let direct = Cell.Mount<Cell>(Func<Cell>(fun () -> counter value), "direct")
        let throughHelper = mount "helper" (fun () -> counter value)
        ```

        Creating a capturing factory inside every parent build can allocate a new delegate and closure even when the Cell is reused. Cache the factory when its dependencies are stable. Goo does not invoke a factory merely to discover the created Cell's runtime type.
        """);
}

static void AppendStyleCompositionGuide(StringBuilder text)
{
    text.AppendLine();
    text.AppendLine("## Compose reusable styles");
    text.AppendLine();
    text.AppendLine("`Style.BasedOn` copies another style's ordered declarations at its exact declaration position. Declarations written afterward win, as in `Container{ BasedOn: CardStyle, BackgroundColor: selectedColor }`. The destination does not retain the source Style or share its declaration log.");
    text.AppendLine();
    text.AppendLine("`BackgroundGradient: nil` is an explicit clear declaration. It removes an earlier composed or lower-state gradient while preserving `BackgroundColor`. Omitting `BackgroundGradient` leaves the earlier declaration in effect.");
}

static void AppendImageSourceProviderMembers(StringBuilder text)
{
    text.AppendLine();
    text.AppendLine("### `Acquire`");
    text.AppendLine();
    text.AppendLine("Creates the lease that Goo owns and disposes for one mounted image or background binding.");
}

static void AppendShaderEffectGuide(StringBuilder text)
{
    text.AppendLine();
    text.AppendLine("## Apply fragment shaders to retained elements");
    text.AppendLine();
    text.AppendLine("Load one backend-neutral `ShaderEffectProgram`, create retained `ShaderEffect` state from it, and assign the effect through the ordinary `Style.ShaderEffect` property on a `Container`, `Button`, `Text`, `Image`, `Shape`, or another Blob. Goo renders that element and its subtree into a bounded offscreen layer, runs the selected backend artifact, then composites the result without changing layout, hit testing, accessibility, transforms, or clipping.");
    text.AppendLine();
    text.AppendLine("```gsharp");
    text.AppendLine("import System");
    text.AppendLine("import System.IO");
    text.AppendLine("import System.Numerics");
    text.AppendLine("import Goo");
    text.AppendLine();
    text.AppendLine("let path = Path.Combine(AppContext.BaseDirectory, \"Shaders\", \"glass.goo-effect\")");
    text.AppendLine("let program = ShaderEffectProgram.Load(path)");
    text.AppendLine("let effect = ShaderEffect(program,");
    text.AppendLine("  samplesBackdrop: true,");
    text.AppendLine("  backdropOutset: 24.0F)");
    text.AppendLine("effect.SetParameter(0, Vector4(0.18F, 0.65F, 0.9F, 1.0F))");
    text.AppendLine("let data = ShaderEffectData(BitConverter.GetBytes(1.0F))");
    text.AppendLine("effect.SetData(0, data)");
    text.AppendLine();
    text.AppendLine("let control = Button{");
    text.AppendLine("  Width: 180,");
    text.AppendLine("  Height: 52,");
    text.AppendLine("  BorderRadius: 18,");
    text.AppendLine("  ShaderEffect: effect,");
    text.AppendLine("}");
    text.AppendLine("```");
    text.AppendLine();
    text.AppendLine("Reuse the same effect instance for controls that share program and parameters. Create separate effect instances from the same program when controls need independent parameter state. Program sharing also shares the backend pipeline identity. `SetParameter` accepts slots 0 through 7, marks mounted users paint-dirty only when a value changes, and stays allocation-free after construction.");
    text.AppendLine();
    text.AppendLine("Set `Playing = true` to opt into continuous renderer-driven playback. `ElapsedSeconds` is supplied separately through `gooElapsedSeconds()`, so playback does not consume one of the eight parameter slots. Pausing preserves the current elapsed position, and assigning `ElapsedSeconds` seeks while paused or playing. Goo schedules continuous frames only while a playing effect is mounted.");
    text.AppendLine();
    text.AppendLine("Author ShaderEffects in native Slang by including Goo's fixed module and implementing `float4 gooEffect(float2 uv, float4 source, float4 backdrop)`. GLSL compatibility sources instead include `goo_effect.glsl` and implement the equivalent `vec4` function. `gooDataByteLength(slot)` and `gooDataWord(slot, wordIndex)` read retained data slots zero through three; invalid slots and out-of-range words return zero.");
    text.AppendLine();
    text.AppendLine("```slang");
    text.AppendLine("#include \"goo_effect.slang\"");
    text.AppendLine();
    text.AppendLine("float4 gooEffect(float2 uv, float4 source, float4 backdrop)");
    text.AppendLine("{");
    text.AppendLine("    float gain = gooDataByteLength(0) >= 4 ? asfloat(gooDataWord(0, 0)) : 1.0;");
    text.AppendLine("    float pulse = 0.5 + 0.5 * sin(gooElapsedSeconds());");
    text.AppendLine("    return lerp(source, backdrop, gooParameter(0).x * pulse) * gain;");
    text.AppendLine("}");
    text.AppendLine("```");
    text.AppendLine();
    text.AppendLine("Add the source to the G# project:");
    text.AppendLine();
    text.AppendLine("```xml");
    text.AppendLine("<ItemGroup>");
    text.AppendLine("  <GooShaderEffect Include=\"Shaders/glass.slang\" />");
    text.AppendLine("</ItemGroup>");
    text.AppendLine("```");
    text.AppendLine();
    text.AppendLine("Build requires [Slang 2026.16](https://github.com/shader-slang/slang/releases/tag/v2026.16) through `SLANG_SDK` or `PATH` and SPIRV-Tools 2026.3 from [Vulkan SDK 1.4.357.0](https://vulkan.lunarg.com/sdk/home) through `VULKAN_SDK` or `PATH`. Goo compiles and validates the source during the build, writes deterministic intermediates under `obj`, and copies `Shaders/glass.goo-effect` plus `Shaders/glass.goo-effect.json` provenance to build and publish output. The program container can carry separate artifacts for multiple rendering backends. The current compiler emits Vulkan SPIR-V. Set `TargetPath` on `GooShaderEffect` to override the relative output path. Unchanged inputs skip compilation. Tool-version mismatches, compiler errors, validation errors, ABI mismatches, and unsupported capabilities fail the build.");
    text.AppendLine();
    text.AppendLine("The fixed ABI binds the isolated source at set 0, the optional backdrop at set 1, Goo primitive data at set 2, Goo clip data at set 3, optional retained effect data at set 4, and eight `vec4` values in a 128-byte fragment push block. `uv` is normalized to the visible element bounds. `source` and `backdrop` are premultiplied linear colors. Return premultiplied linear color. Goo applies retained clip coverage and element opacity after `gooEffect`. Set `backdropOutset` to the largest displacement or filter radius the shader needs beyond those bounds. When backdrop sampling is disabled, the backdrop argument aliases the source and Goo skips the target copy.");
    text.AppendLine();
    text.AppendLine("Each `ShaderEffectData` publication is a complete replacement. The constructor and `Publish` copy bytes. `Transfer` and `PublishTransferred` take array ownership and invoke the supplied callback after Goo no longer reads that publication. Each source is limited to 16 MiB, each compiled scene frame is limited to 64 MiB of effect data, and unchanged retained versions reuse the existing upload. Goo recreates device-local data from the retained publication after device recovery.");
    text.AppendLine();
    text.AppendLine("The compiled program stays a sidecar asset in JIT and NativeAOT builds. Goo packages the build adapter, but neither the adapter, authoring modules, nor compiler toolchains are copied to application output. Goo does not invoke a runtime shader compiler. The first use creates a backend pipeline in a device-generation cache. Warm parameter updates reuse that pipeline and the retained layer pool. One target format supports up to 32 distinct effect program identities per device generation. A non-normal `BlendMode` cannot currently share the same element with `ShaderEffect`.");
}

static string BuildIndex(string[] sourceDirectories)
{
    var text = new StringBuilder();
    text.AppendLine("# Goo API");
    text.AppendLine();
    text.AppendLine("These pages are generated from the Release `Goo.xml` file.");
    text.AppendLine();
    foreach (var path in sourceDirectories)
    {
        var name = Path.GetFileName(path);
        text.AppendLine($"- [{name}]({name.ToLowerInvariant()}.md)");
    }
    return text.ToString();
}

static IEnumerable<ApiType> ReadTypes(string directoryPath, string sourceRoot)
{
    var typePattern = new Regex(
        @"(?m)^public\s+(?:(?:partial|sealed|open|data)\s+)*(?<kind>class|struct|enum|interface|func)\s+(?<name>[A-Za-z_][A-Za-z0-9_]*)(?<generic>\[[^\]\r\n]+\])?",
        RegexOptions.CultureInvariant);
    foreach (var file in Directory.EnumerateFiles(directoryPath, "*.gs", SearchOption.AllDirectories)
        .Order(StringComparer.Ordinal))
    {
        var source = File.ReadAllText(file);
        foreach (Match match in typePattern.Matches(source))
        {
            var name = match.Groups["name"].Value;
            var isFunction = match.Groups["kind"].Value == "func";
            if (isFunction && name == "operator")
                continue;
            var generic = match.Groups["generic"].Value;
            var arity = generic.Length == 0 ? 0 : generic.Count(character => character == ',') + 1;
            var xmlName = "Goo." + name + (arity == 0 ? "" : (isFunction ? "``" : "`") + arity);
            var values = match.Groups["kind"].Value == "enum"
                ? ReadEnumValues(source, match.Index + match.Length)
                : [];
            yield return new ApiType(
                Path.GetFileName(directoryPath),
                name + generic.Replace('[', '<').Replace(']', '>'),
                xmlName,
                ReadSourceSummary(source, match.Index),
                values,
                [new ApiSource(
                    Path.GetRelativePath(sourceRoot, file).Replace(Path.DirectorySeparatorChar, '/'),
                    Path.GetFileName(file))], isFunction);
        }
    }
}

static IReadOnlyList<string> ReadEnumValues(string source, int start) =>
    SyntaxTree.Parse(source).Root.Members.OfType<EnumDeclarationSyntax>()
        .Single(declaration => declaration.Span.Start < start && declaration.Span.End > start)
        .Members.Select(member => member.Identifier.Text).ToArray();

static string ReadSourceSummary(string source, int declarationStart)
{
    var lines = source[..declarationStart].Replace("\r\n", "\n").Split('\n').ToList();
    while (lines.Count != 0 && (lines[^1].Trim().Length == 0 || lines[^1].TrimStart().StartsWith('@')))
        lines.RemoveAt(lines.Count - 1);
    var summary = new List<string>();
    while (lines.Count != 0 && lines[^1].TrimStart().StartsWith("///", StringComparison.Ordinal))
    {
        summary.Add(lines[^1].TrimStart()[3..].Trim());
        lines.RemoveAt(lines.Count - 1);
    }
    summary.Reverse();
    return Normalize(string.Join(' ', summary));
}

static bool BelongsTo(string id, string xmlTypeName, bool isFunction = false) =>
    isFunction ? id.StartsWith("M:" + xmlTypeName + "(", StringComparison.Ordinal) :
    id.StartsWith("M:" + xmlTypeName + ".", StringComparison.Ordinal) ||
    id.StartsWith("P:" + xmlTypeName + ".", StringComparison.Ordinal) ||
    id.StartsWith("F:" + xmlTypeName + ".", StringComparison.Ordinal) ||
    id.StartsWith("E:" + xmlTypeName + ".", StringComparison.Ordinal);

static string DisplayMember(ApiMember member, ApiType type)
{
    var value = type.IsFunction
        ? type.DisplayName + member.Id[(type.XmlName.Length + 2)..]
        : member.Id[(type.XmlName.Length + 3)..];
    var methodParameters = member.Element.Elements("typeparam")
        .Select(element => element.Attribute("name")?.Value ?? "T")
        .ToArray();
    for (var index = 0; index < methodParameters.Length; index++)
        value = value.Replace("``" + index, methodParameters[index], StringComparison.Ordinal);
    var typeParameters = GenericNames(type.DisplayName);
    for (var index = 0; index < typeParameters.Length; index++)
        value = value.Replace("`" + index, typeParameters[index], StringComparison.Ordinal);
    return value
        .Replace("#ctor", "new", StringComparison.Ordinal)
        .Replace("System.Boolean", "bool", StringComparison.Ordinal)
        .Replace("System.Double", "float64", StringComparison.Ordinal)
        .Replace("System.Single", "float32", StringComparison.Ordinal)
        .Replace("System.Int32", "int32", StringComparison.Ordinal)
        .Replace("System.String", "string", StringComparison.Ordinal)
        .Replace("Goo.", "", StringComparison.Ordinal);
}

static string[] GenericNames(string displayName)
{
    var open = displayName.IndexOf('<');
    return open < 0
        ? []
        : displayName[(open + 1)..^1].Split(',', StringSplitOptions.TrimEntries);
}

static string Summary(XElement element) => Normalize(element.Element("summary")?.Value);

static string Normalize(string? value) =>
    Regex.Replace(value ?? "", @"\s+", " ").Trim();

static void AppendText(StringBuilder text, string value)
{
    if (value.Length == 0)
        return;
    text.AppendLine();
    text.AppendLine(value);
}

static string FormatPage(string content) => Regex.Replace(content.Replace("\r\n", "\n"),
    @"(```gsharp\n)(.*?)(```)",
    match => match.Groups[1].Value + Goo.Tools.SourceFormatting.Format(match.Groups[2].Value) + match.Groups[3].Value,
    RegexOptions.Singleline);

static void WriteIfChanged(string path, string content)
{
    if (File.Exists(path) && File.ReadAllText(path) == content)
        return;
    Directory.CreateDirectory(Path.GetDirectoryName(path)!);
    File.WriteAllText(path, content, new UTF8Encoding(false));
}

static Dictionary<string, string> ParseArguments(string[] values)
{
    var result = new Dictionary<string, string>(StringComparer.Ordinal);
    for (var index = 0; index < values.Length; index += 2)
    {
        if (!values[index].StartsWith("--", StringComparison.Ordinal) || index + 1 >= values.Length)
            throw new ArgumentException("Use --xml, --source, or --output followed by a path.");
        result[values[index][2..]] = values[index + 1];
    }
    return result;
}

static string Resolve(string? value, string fallback) =>
    Path.GetFullPath(value ?? fallback);

static string FindRepositoryRoot(string start)
{
    for (var directory = new DirectoryInfo(start); directory is not null; directory = directory.Parent)
    {
        if (File.Exists(Path.Combine(directory.FullName, "Goo", "Goo.gsproj")))
            return directory.FullName;
    }
    throw new DirectoryNotFoundException("Could not find the Goo repository root.");
}

sealed record ApiType(
    string Directory,
    string DisplayName,
    string XmlName,
    string Summary,
    IReadOnlyList<string> EnumValues,
    IReadOnlyList<ApiSource> Sources,
    bool IsFunction = false);

sealed record ApiSource(string RelativeFile, string FileName);

sealed record ApiMember(string Id, XElement Element);
