using System.Globalization;
using System.Security.Cryptography;
using System.Text;

const string version = "16.0.0";
const string lineBreakSourceUrl = "https://www.unicode.org/Public/16.0.0/ucd/LineBreak.txt";
const string lineBreakSourceSha256 = "e97e4259d0d20fab150b9c7b4b28abfae5cd78ca97e7f4ac6ed20d685d5f4a7c";
const string eastAsianWidthSourceUrl = "https://www.unicode.org/Public/16.0.0/ucd/EastAsianWidth.txt";
const string eastAsianWidthSourceSha256 = "43adc76c0686a42cb370764eb8cfe2b2a45b10b855e5572a2db4a0eecce15d5b";
const string emojiDataSourceUrl = "https://www.unicode.org/Public/16.0.0/ucd/emoji/emoji-data.txt";
const string emojiDataSourceSha256 = "f1365a5173eee18e1f98b240cdc492e84a25f1ce7e0c9d1094eb29c41a22696a";
const string unicodeDataSourceUrl = "https://www.unicode.org/Public/16.0.0/ucd/UnicodeData.txt";
const string unicodeDataSourceSha256 = "ff58e5823bd095166564a006e47d111130813dcf8bf234ef79fa51a870edb48f";
const string graphemeBreakSourceUrl = "https://www.unicode.org/Public/16.0.0/ucd/auxiliary/GraphemeBreakProperty.txt";
const string graphemeBreakSourceSha256 = "c29360bd6f7132811d701d29069541e827eb44bfc4c8fbde8c370d6982689dc1";
const string derivedCorePropertiesSourceUrl = "https://www.unicode.org/Public/16.0.0/ucd/DerivedCoreProperties.txt";
const string derivedCorePropertiesSourceSha256 = "39d35161f2954497f69e08bdb9e701493f476a3d30222de20028feda36c1dabd";
const string scriptsSourceUrl = "https://www.unicode.org/Public/16.0.0/ucd/Scripts.txt";
const string scriptsSourceSha256 = "9e88f0a677df47311106340be8ede2ecdacd9c1c931831218d2be6d5508e0039";
const string scriptExtensionsSourceUrl = "https://www.unicode.org/Public/16.0.0/ucd/ScriptExtensions.txt";
const string scriptExtensionsSourceSha256 = "049117ce26b9769fe2749b06eef51a50a89faef4a97764dd2d81daa715980700";
const string propertyValueAliasesSourceUrl = "https://www.unicode.org/Public/16.0.0/ucd/PropertyValueAliases.txt";
const string propertyValueAliasesSourceSha256 = "440fd3e5460b9bfe31da67b6f923992e1989d31fe2ed91e091c4b8f8e2620bf9";

var options = ParseArguments(args);
var repositoryRoot = FindRepositoryRoot();
var lineBreakOutputPath = options.TryGetValue("output", out var requestedOutput)
    ? Path.GetFullPath(requestedOutput)
    : Path.Combine(repositoryRoot, "Goo", "Rendering", "Text", "Data", "UnicodeLineBreakData.bin");
var contextOutputPath = options.TryGetValue("context-output", out var requestedContextOutput)
    ? Path.GetFullPath(requestedContextOutput)
    : Path.Combine(repositoryRoot, "Goo", "Rendering", "Text", "Data", "UnicodeLineBreakContext.bin");
var scriptsOutputPath = options.TryGetValue("scripts-output", out var requestedScriptsOutput)
    ? Path.GetFullPath(requestedScriptsOutput)
    : Path.Combine(repositoryRoot, "Goo", "Rendering", "Text", "Data", "UnicodeScriptsData.bin");
var scriptExtensionsOutputPath = options.TryGetValue("script-extensions-output",
    out var requestedScriptExtensionsOutput)
    ? Path.GetFullPath(requestedScriptExtensionsOutput)
    : Path.Combine(repositoryRoot, "Goo", "Rendering", "Text", "Data", "UnicodeScriptExtensionsData.bin");

var scriptsOnly = options.ContainsKey("scripts-only");
var emojiDataBytes = Array.Empty<byte>();
if (!scriptsOnly)
{
    var lineBreakBytes = ReadSource(options, options.ContainsKey("input") ? "input" : "line-break-input",
        lineBreakSourceUrl, lineBreakSourceSha256);
    var eastAsianWidthBytes = ReadSource(options, "east-asian-width-input", eastAsianWidthSourceUrl,
        eastAsianWidthSourceSha256);
    emojiDataBytes = ReadSource(options, "emoji-data-input", emojiDataSourceUrl, emojiDataSourceSha256);
    var unicodeDataBytes = ReadSource(options, "unicode-data-input", unicodeDataSourceUrl, unicodeDataSourceSha256);

    var lineBreakRanges = ParseLineBreakRanges(Encoding.UTF8.GetString(lineBreakBytes));
    var contextRanges = BuildContextRanges(
        ParsePropertyRanges(Encoding.UTF8.GetString(eastAsianWidthBytes), "F", "W", "H"),
        ParsePropertyRanges(Encoding.UTF8.GetString(emojiDataBytes), "Extended_Pictographic"),
        ParseUnicodeData(Encoding.UTF8.GetString(unicodeDataBytes)));

    Directory.CreateDirectory(Path.GetDirectoryName(lineBreakOutputPath)!);
    Directory.CreateDirectory(Path.GetDirectoryName(contextOutputPath)!);
    File.WriteAllBytes(lineBreakOutputPath, EncodeLineBreakData(lineBreakRanges));
    File.WriteAllBytes(contextOutputPath, EncodeContextData(contextRanges));
    Console.WriteLine($"Generated {lineBreakRanges.Count} Unicode {version} line-break ranges into {lineBreakOutputPath}.");
    Console.WriteLine($"Generated {contextRanges.Count} Unicode {version} line-break context ranges into {contextOutputPath}.");
}

var scriptsBytes = ReadSource(options, "scripts-input", scriptsSourceUrl, scriptsSourceSha256);
var scriptExtensionsBytes = ReadSource(options, "script-extensions-input", scriptExtensionsSourceUrl,
    scriptExtensionsSourceSha256);
var propertyValueAliasesBytes = ReadSource(options, "property-value-aliases-input",
    propertyValueAliasesSourceUrl, propertyValueAliasesSourceSha256);
var scriptData = ScriptGenerator.Generate(
    Encoding.UTF8.GetString(scriptsBytes),
    Encoding.UTF8.GetString(scriptExtensionsBytes),
    Encoding.UTF8.GetString(propertyValueAliasesBytes));
Directory.CreateDirectory(Path.GetDirectoryName(scriptsOutputPath)!);
Directory.CreateDirectory(Path.GetDirectoryName(scriptExtensionsOutputPath)!);
File.WriteAllBytes(scriptsOutputPath, scriptData.ScriptsData);
File.WriteAllBytes(scriptExtensionsOutputPath, scriptData.ScriptExtensionsData);
Console.WriteLine($"Generated {scriptData.ScriptRangeCount} Unicode {version} script ranges into {scriptsOutputPath}.");
Console.WriteLine($"Generated {scriptData.ScriptExtensionRangeCount} Unicode {version} script-extension ranges into {scriptExtensionsOutputPath}.");

if (options.ContainsKey("grapheme-break-input") || options.ContainsKey("derived-core-properties-input")
    || options.ContainsKey("grapheme-output"))
{
    if (scriptsOnly) throw new ArgumentException("--scripts-only cannot be combined with grapheme generation.");
    var graphemeOutputPath = options.TryGetValue("grapheme-output", out var requestedGraphemeOutput)
        ? Path.GetFullPath(requestedGraphemeOutput)
        : Path.Combine(repositoryRoot, "Goo", "Rendering", "Text", "Data", "UnicodeGraphemeData.bin");
    var graphemeBreakBytes = ReadSource(options, "grapheme-break-input", graphemeBreakSourceUrl,
        graphemeBreakSourceSha256);
    var derivedCorePropertiesBytes = ReadSource(options, "derived-core-properties-input",
        derivedCorePropertiesSourceUrl, derivedCorePropertiesSourceSha256);
    var graphemeRanges = BuildGraphemeRanges(
        ParseGraphemeBreakRanges(Encoding.UTF8.GetString(graphemeBreakBytes)),
        ParseIndicConjunctBreakRanges(Encoding.UTF8.GetString(derivedCorePropertiesBytes)),
        ParsePropertyRanges(Encoding.UTF8.GetString(emojiDataBytes), "Extended_Pictographic"));
    Directory.CreateDirectory(Path.GetDirectoryName(graphemeOutputPath)!);
    File.WriteAllBytes(graphemeOutputPath, EncodeGraphemeData(graphemeRanges));
    Console.WriteLine($"Generated {graphemeRanges.Count} Unicode {version} grapheme ranges into {graphemeOutputPath}.");
}

static Dictionary<string, string> ParseArguments(string[] args)
{
    var result = new Dictionary<string, string>(StringComparer.Ordinal);
    for (var index = 0; index < args.Length; index++)
    {
        var argument = args[index];
        if (!argument.StartsWith("--", StringComparison.Ordinal))
            throw new ArgumentException($"Unknown argument: {argument}");
        var body = argument[2..];
        var equals = body.IndexOf('=');
        if (equals >= 0)
        {
            result[body[..equals]] = body[(equals + 1)..];
            continue;
        }
        if (body == "scripts-only")
        {
            result[body] = "true";
            continue;
        }
        if (index + 1 >= args.Length)
            throw new ArgumentException($"Missing value for --{body}");
        result[body] = args[++index];
    }
    foreach (var name in result.Keys)
    {
        if (name is not ("input" or "line-break-input" or "output" or "context-output"
            or "east-asian-width-input" or "emoji-data-input" or "unicode-data-input"
            or "grapheme-break-input" or "derived-core-properties-input" or "grapheme-output"
            or "scripts-input" or "script-extensions-input" or "property-value-aliases-input"
            or "scripts-only" or "scripts-output" or "script-extensions-output"))
            throw new ArgumentException($"Unknown option: --{name}");
    }
    return result;
}

static byte[] ReadSource(Dictionary<string, string> options, string optionName, string sourceUrl,
    string expectedSha256)
{
    var bytes = options.TryGetValue(optionName, out var requestedInput)
        ? File.ReadAllBytes(Path.GetFullPath(requestedInput))
        : DownloadSource(sourceUrl);
    var actualSha256 = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
    if (!string.Equals(actualSha256, expectedSha256, StringComparison.Ordinal))
        throw new InvalidDataException($"Unicode source SHA-256 mismatch for {sourceUrl}: {actualSha256}");
    return bytes;
}

static byte[] DownloadSource(string sourceUrl)
{
    using var client = new HttpClient();
    return client.GetByteArrayAsync(sourceUrl).GetAwaiter().GetResult();
}

static string FindRepositoryRoot()
{
    var current = new DirectoryInfo(Environment.CurrentDirectory);
    while (current is not null)
    {
        if (File.Exists(Path.Combine(current.FullName, "Goo", "Goo.gsproj")))
            return current.FullName;
        current = current.Parent;
    }
    throw new DirectoryNotFoundException("Could not find the goo-gsharp repository root.");
}

static List<UnicodeRange> ParseLineBreakRanges(string source)
{
    var ranges = new List<UnicodeRange>();
    foreach (var rawLine in source.Split('\n'))
    {
        var line = StripComment(rawLine);
        if (line.Length == 0)
            continue;
        var separator = line.IndexOf(';');
        if (separator < 0)
            throw new InvalidDataException($"Malformed Unicode data row: {rawLine}");
        var codePoints = line[..separator].Trim();
        var property = line[(separator + 1)..].Trim();
        AddMergedRange(ranges, ParseRange(codePoints), property);
    }
    return ranges;
}

static List<CodePointRange> ParsePropertyRanges(string source, params string[] properties)
{
    var accepted = new HashSet<string>(properties, StringComparer.Ordinal);
    var ranges = new List<CodePointRange>();
    foreach (var rawLine in source.Split('\n'))
    {
        var line = StripComment(rawLine);
        if (line.Length == 0)
            continue;
        var separator = line.IndexOf(';');
        if (separator < 0)
            throw new InvalidDataException($"Malformed Unicode data row: {rawLine}");
        var property = line[(separator + 1)..].Trim();
        if (!accepted.Contains(property))
            continue;
        ranges.Add(ParseRange(line[..separator].Trim()));
    }
    return MergeRanges(ranges);
}

static List<UnicodeRange> ParseGraphemeBreakRanges(string source)
{
    var ranges = new List<UnicodeRange>();
    foreach (var rawLine in source.Split('\n'))
    {
        var line = StripComment(rawLine);
        if (line.Length == 0)
            continue;
        var separator = line.IndexOf(';');
        if (separator < 0)
            throw new InvalidDataException($"Malformed Unicode data row: {rawLine}");
        var property = line[(separator + 1)..].Trim();
        if (property == "Other")
            continue;
        var range = ParseRange(line[..separator].Trim());
        ranges.Add(new UnicodeRange(range.Start, range.End, property));
    }
    return NormalizeUnicodeRanges(ranges);
}

static List<UnicodeRange> ParseIndicConjunctBreakRanges(string source)
{
    var ranges = new List<UnicodeRange>();
    foreach (var rawLine in source.Split('\n'))
    {
        var line = StripComment(rawLine);
        if (line.Length == 0)
            continue;
        var fields = line.Split(';');
        if (fields.Length < 3 || fields[1].Trim() != "InCB")
            continue;
        var property = fields[2].Trim();
        if (property == "None")
            continue;
        var range = ParseRange(fields[0].Trim());
        ranges.Add(new UnicodeRange(range.Start, range.End, property));
    }
    return NormalizeUnicodeRanges(ranges);
}

static List<UnicodeRange> NormalizeUnicodeRanges(List<UnicodeRange> ranges)
{
    ranges.Sort((left, right) => left.Start.CompareTo(right.Start));
    var result = new List<UnicodeRange>();
    foreach (var range in ranges)
    {
        if (result.Count != 0 && range.Start <= result[^1].End)
        {
            var prior = result[^1];
            if (prior.Class != range.Class)
                throw new InvalidDataException("Overlapping Unicode property ranges.");
            result[^1] = prior with { End = Math.Max(prior.End, range.End) };
        }
        else if (result.Count != 0 && result[^1].Class == range.Class
            && result[^1].End + 1 == range.Start)
        {
            var prior = result[^1];
            result[^1] = prior with { End = range.End };
        }
        else
        {
            result.Add(range);
        }
    }
    return result;
}

static List<GraphemeRange> BuildGraphemeRanges(List<UnicodeRange> graphemeBreak,
    List<UnicodeRange> indicConjunctBreak, List<CodePointRange> extendedPictographic)
{
    var boundaries = new SortedSet<int> { 0, 0x110000 };
    AddUnicodeBoundaries(boundaries, graphemeBreak);
    AddUnicodeBoundaries(boundaries, indicConjunctBreak);
    AddBoundaries(boundaries, extendedPictographic);
    var sorted = boundaries.ToArray();
    var result = new List<GraphemeRange>();
    for (var index = 0; index + 1 < sorted.Length; index++)
    {
        var start = sorted[index];
        var end = sorted[index + 1] - 1;
        var graphemeClass = FindUnicodeClass(graphemeBreak, start) ?? "Other";
        var indicConjunctBreakClass = FindUnicodeClass(indicConjunctBreak, start) ?? "None";
        var isExtendedPictographic = Contains(extendedPictographic, start);
        if (graphemeClass != "Other" || indicConjunctBreakClass != "None" || isExtendedPictographic)
            AddMergedGraphemeRange(result, new GraphemeRange(start, end, graphemeClass,
                indicConjunctBreakClass, isExtendedPictographic));
    }
    return result;
}

static void AddUnicodeBoundaries(SortedSet<int> boundaries, IEnumerable<UnicodeRange> ranges)
{
    foreach (var range in ranges)
    {
        boundaries.Add(range.Start);
        if (range.End < 0x10FFFF)
            boundaries.Add(range.End + 1);
    }
}

static string? FindUnicodeClass(List<UnicodeRange> ranges, int value)
{
    var low = 0;
    var high = ranges.Count - 1;
    while (low <= high)
    {
        var middle = low + (high - low) / 2;
        var range = ranges[middle];
        if (value < range.Start) high = middle - 1;
        else if (value > range.End) low = middle + 1;
        else return range.Class;
    }
    return null;
}

static void AddMergedGraphemeRange(List<GraphemeRange> ranges, GraphemeRange range)
{
    if (ranges.Count != 0)
    {
        var prior = ranges[^1];
        if (prior.Class == range.Class && prior.InCB == range.InCB
            && prior.ExtendedPictographic == range.ExtendedPictographic
            && prior.End + 1 == range.Start)
        {
            ranges[^1] = prior with { End = range.End };
            return;
        }
    }
    ranges.Add(range);
}

static UnicodeDataRanges ParseUnicodeData(string source)
{
    var assigned = new List<CodePointRange>();
    var combining = new List<CodePointRange>();
    var initialQuote = new List<CodePointRange>();
    var finalQuote = new List<CodePointRange>();
    var rangeStart = -1;
    var rangeCategory = "";
    foreach (var rawLine in source.Split('\n'))
    {
        var line = rawLine.Trim();
        if (line.Length == 0)
            continue;
        var fields = line.Split(';');
        if (fields.Length < 3)
            throw new InvalidDataException($"Malformed UnicodeData row: {rawLine}");
        var value = ParseCodePoint(fields[0]);
        var name = fields[1];
        var category = fields[2];
        if (name.EndsWith(", First>", StringComparison.Ordinal))
        {
            rangeStart = value;
            rangeCategory = category;
            continue;
        }
        if (name.EndsWith(", Last>", StringComparison.Ordinal))
        {
            if (rangeStart < 0 || !string.Equals(rangeCategory, category, StringComparison.Ordinal))
                throw new InvalidDataException($"Malformed UnicodeData range: {rawLine}");
            AddCategoryRange(assigned, combining, initialQuote, finalQuote, rangeStart, value, category);
            rangeStart = -1;
            rangeCategory = "";
            continue;
        }
        AddCategoryRange(assigned, combining, initialQuote, finalQuote, value, value, category);
    }
    if (rangeStart >= 0)
        throw new InvalidDataException("Unclosed UnicodeData range.");
    return new UnicodeDataRanges(MergeRanges(assigned), MergeRanges(combining),
        MergeRanges(initialQuote), MergeRanges(finalQuote));
}

static void AddCategoryRange(List<CodePointRange> assigned, List<CodePointRange> combining,
    List<CodePointRange> initialQuote, List<CodePointRange> finalQuote, int start, int end,
    string category)
{
    assigned.Add(new CodePointRange(start, end));
    if (category is "Mn" or "Mc")
        combining.Add(new CodePointRange(start, end));
    if (category == "Pi")
        initialQuote.Add(new CodePointRange(start, end));
    if (category == "Pf")
        finalQuote.Add(new CodePointRange(start, end));
}

static List<ContextRange> BuildContextRanges(List<CodePointRange> eastAsian,
    List<CodePointRange> extendedPictographic, UnicodeDataRanges unicodeData)
{
    var extendedPictographicUnassigned = SubtractRanges(extendedPictographic, unicodeData.Assigned);
    var boundaries = new SortedSet<int> { 0, 0x110000 };
    AddBoundaries(boundaries, eastAsian);
    AddBoundaries(boundaries, unicodeData.Combining);
    AddBoundaries(boundaries, unicodeData.InitialQuote);
    AddBoundaries(boundaries, unicodeData.FinalQuote);
    AddBoundaries(boundaries, extendedPictographic);
    AddBoundaries(boundaries, extendedPictographicUnassigned);
    var sorted = boundaries.ToArray();
    var result = new List<ContextRange>();
    for (var index = 0; index + 1 < sorted.Length; index++)
    {
        var start = sorted[index];
        var end = sorted[index + 1] - 1;
        var flags = 0;
        if (Contains(eastAsian, start)) flags |= 1;
        if (Contains(unicodeData.InitialQuote, start)) flags |= 2;
        if (Contains(unicodeData.FinalQuote, start)) flags |= 4;
        if (Contains(extendedPictographic, start)) flags |= 8;
        if (Contains(extendedPictographicUnassigned, start)) flags |= 16;
        if (Contains(unicodeData.Combining, start)) flags |= 32;
        if (flags != 0)
            AddMergedContextRange(result, new ContextRange(start, end, flags));
    }
    return result;
}

static List<CodePointRange> SubtractRanges(List<CodePointRange> source, List<CodePointRange> excluded)
{
    var result = new List<CodePointRange>();
    var excludedIndex = 0;
    foreach (var range in source)
    {
        var cursor = range.Start;
        while (excludedIndex < excluded.Count && excluded[excludedIndex].End < cursor)
            excludedIndex++;
        var index = excludedIndex;
        while (index < excluded.Count && excluded[index].Start <= range.End)
        {
            var excludedRange = excluded[index];
            if (excludedRange.Start > cursor)
                result.Add(new CodePointRange(cursor, Math.Min(range.End, excludedRange.Start - 1)));
            if (excludedRange.End >= cursor)
                cursor = Math.Max(cursor, excludedRange.End + 1);
            if (cursor > range.End)
                break;
            index++;
        }
        if (cursor <= range.End)
            result.Add(new CodePointRange(cursor, range.End));
    }
    return MergeRanges(result);
}

static void AddBoundaries(SortedSet<int> boundaries, IEnumerable<CodePointRange> ranges)
{
    foreach (var range in ranges)
    {
        boundaries.Add(range.Start);
        if (range.End < 0x10FFFF)
            boundaries.Add(range.End + 1);
    }
}

static bool Contains(List<CodePointRange> ranges, int value)
{
    var low = 0;
    var high = ranges.Count - 1;
    while (low <= high)
    {
        var middle = low + (high - low) / 2;
        var range = ranges[middle];
        if (value < range.Start) high = middle - 1;
        else if (value > range.End) low = middle + 1;
        else return true;
    }
    return false;
}

static List<CodePointRange> MergeRanges(List<CodePointRange> ranges)
{
    ranges.Sort((left, right) => left.Start.CompareTo(right.Start));
    var result = new List<CodePointRange>();
    foreach (var range in ranges)
    {
        if (result.Count != 0 && result[^1].End + 1 >= range.Start)
        {
            var prior = result[^1];
            result[^1] = new CodePointRange(prior.Start, Math.Max(prior.End, range.End));
        }
        else
        {
            result.Add(range);
        }
    }
    return result;
}

static void AddMergedRange(List<UnicodeRange> ranges, CodePointRange range, string property)
{
    if (ranges.Count != 0)
    {
        var prior = ranges[^1];
        if (prior.Class == property && prior.End + 1 == range.Start)
        {
            ranges[^1] = prior with { End = range.End };
            return;
        }
        if (range.Start <= prior.End)
            throw new InvalidDataException("Overlapping Unicode line-break data range.");
    }
    ranges.Add(new UnicodeRange(range.Start, range.End, property));
}

static void AddMergedContextRange(List<ContextRange> ranges, ContextRange range)
{
    if (ranges.Count != 0)
    {
        var prior = ranges[^1];
        if (prior.Flags == range.Flags && prior.End + 1 == range.Start)
        {
            ranges[^1] = prior with { End = range.End };
            return;
        }
    }
    ranges.Add(range);
}

static string StripComment(string rawLine)
{
    var line = rawLine.Trim().TrimStart('\uFEFF');
    var comment = line.IndexOf('#');
    return comment >= 0 ? line[..comment].Trim() : line;
}

static CodePointRange ParseRange(string value)
{
    var separator = value.IndexOf("..", StringComparison.Ordinal);
    var start = ParseCodePoint(separator < 0 ? value : value[..separator]);
    var end = ParseCodePoint(separator < 0 ? value : value[(separator + 2)..]);
    if (end < start)
        throw new InvalidDataException($"Descending Unicode data range: {value}");
    return new CodePointRange(start, end);
}

static int ParseCodePoint(string value) =>
    int.Parse(value.Trim(), NumberStyles.HexNumber, CultureInfo.InvariantCulture);

static byte[] EncodeLineBreakData(List<UnicodeRange> ranges)
{
    var names = new[]
    {
        "AI", "AK", "AL", "AP", "AS", "B2", "BA", "BB", "BK", "CB", "CJ", "CL",
        "CM", "CP", "CR", "EB", "EM", "EX", "GL", "H2", "H3", "HL", "HY", "ID",
        "IN", "IS", "JL", "JT", "JV", "LF", "NL", "NS", "NU", "OP", "PO", "PR",
        "QU", "RI", "SA", "SG", "SP", "SY", "VF", "VI", "WJ", "XX", "ZW", "ZWJ",
    };
    return Encode(writer =>
    {
        writer.Write(ranges.Count);
        foreach (var range in ranges)
        {
            var value = Array.IndexOf(names, range.Class);
            if (value < 0)
                throw new InvalidDataException($"Unsupported Line_Break class: {range.Class}");
            writer.Write(range.Start);
            writer.Write(range.End);
            writer.Write((byte)value);
        }
    });
}

static byte[] EncodeContextData(List<ContextRange> ranges) => Encode(writer =>
{
    writer.Write(ranges.Count);
    foreach (var range in ranges)
    {
        writer.Write(range.Start);
        writer.Write(range.End);
        writer.Write((byte)range.Flags);
    }
});

static byte[] EncodeGraphemeData(List<GraphemeRange> ranges) => Encode(writer =>
{
    writer.Write(ranges.Count);
    foreach (var range in ranges)
    {
        writer.Write(range.Start);
        writer.Write(range.End);
        writer.Write(GraphemeClassValue(range.Class));
        writer.Write(GraphemeInCbValue(range.InCB));
        writer.Write(range.ExtendedPictographic);
    }
});

static byte[] Encode(Action<BinaryWriter> write)
{
    using var stream = new MemoryStream();
    using (var writer = new BinaryWriter(stream, Encoding.UTF8, true))
        write(writer);
    return stream.ToArray();
}

static byte GraphemeClassValue(string value) => value switch
{
    "Other" => 0,
    "CR" => 1,
    "LF" => 2,
    "Control" => 3,
    "Extend" => 4,
    "ZWJ" => 5,
    "Regional_Indicator" => 6,
    "Prepend" => 7,
    "SpacingMark" => 8,
    "L" => 9,
    "V" => 10,
    "T" => 11,
    "LV" => 12,
    "LVT" => 13,
    _ => throw new InvalidDataException($"Unsupported Grapheme_Cluster_Break class: {value}"),
};

static byte GraphemeInCbValue(string value) => value switch
{
    "None" => 0,
    "Consonant" => 1,
    "Extend" => 2,
    "Linker" => 3,
    _ => throw new InvalidDataException($"Unsupported Indic_Conjunct_Break class: {value}"),
};

readonly record struct CodePointRange(int Start, int End);
readonly record struct UnicodeRange(int Start, int End, string Class);
readonly record struct ContextRange(int Start, int End, int Flags);
readonly record struct GraphemeRange(int Start, int End, string Class, string InCB,
    bool ExtendedPictographic);
readonly record struct UnicodeDataRanges(List<CodePointRange> Assigned, List<CodePointRange> Combining,
    List<CodePointRange> InitialQuote, List<CodePointRange> FinalQuote);
