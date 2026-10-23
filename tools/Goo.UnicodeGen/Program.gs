import System
import System.Collections.Generic
import System.Globalization
import System.IO
import System.Linq
import System.Net.Http
import System.Security.Cryptography
import System.Text

func ParseArguments(args[]string) Dictionary[string, string] {
    let result = Dictionary[string, string](StringComparer.Ordinal)
    for var index = 0; index < args.Length; index++ {
        let argument = args[index]
        if !argument.StartsWith("--", StringComparison.Ordinal) {
            throw ArgumentException("Unknown argument: $argument")
        }
        let body = argument[2 ..]
        let equals = body.IndexOf('=')
        if equals >= 0 {
            result[body[.. equals]] = body[(equals + 1) ..]
            continue
        }
        if body == "scripts-only" {
            result[body] = "true"
            continue
        }
        if index + 1 >= args.Length {
            throw ArgumentException("Missing value for --$body")
        }
        result[body] = args[(index += 1)]
    }
    for name in result.Keys {
        if !(
            (
                name == "input" ||
                    name == "line-break-input" ||
                    name == "output" ||
                    name == "context-output" ||
                    name == "east-asian-width-input" ||
                    name == "emoji-data-input" ||
                    name == "unicode-data-input" ||
                    name == "grapheme-break-input" ||
                    name == "derived-core-properties-input" ||
                    name == "grapheme-output" ||
                    name == "scripts-input" ||
                    name == "script-extensions-input" ||
                    name == "property-value-aliases-input" ||
                    name == "scripts-only" ||
                    name == "scripts-output" ||
                    name == "script-extensions-output"
            )
        ) {
            throw ArgumentException("Unknown option: --$name")
        }
    }
    return result
}

func DownloadSource(sourceUrl string)[]uint8 {
    using let client = HttpClient()
    return client.GetByteArrayAsync(sourceUrl).GetAwaiter().GetResult()
}

func ReadSource(options Dictionary[string, string], optionName string, sourceUrl string, expectedSha256 string)[]uint8 {
    let bytes = if options.TryGetValue(optionName, out var requestedInput) {
        File.ReadAllBytes(Path.GetFullPath(requestedInput))
    } else {
        DownloadSource(sourceUrl)
    }
    let actualSha256 = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant()
    if !string.Equals(actualSha256, expectedSha256, StringComparison.Ordinal) {
        throw InvalidDataException("Unicode source SHA-256 mismatch for $sourceUrl: $actualSha256")
    }
    return bytes
}

func FindRepositoryRoot() string {
    var current DirectoryInfo? = DirectoryInfo(Environment.CurrentDirectory)
    while current != nil {
        if File.Exists(Path.Combine(current.FullName, "Goo", "Goo.gsproj")) {
            return current.FullName
        }
        current = current.Parent
    }
    throw DirectoryNotFoundException("Could not find the goo-gsharp repository root.")
}

func NormalizeUnicodeRanges(ranges List[UnicodeRange]) List[UnicodeRange] {
    ranges.Sort((left UnicodeRange, right UnicodeRange) -> left.Start.CompareTo(right.Start))
    let result = List[UnicodeRange]()
    for range_ in ranges {
        if result.Count != 0 && range_.Start <= result[^1].End {
            let prior = result[^1]
            if prior.Class != range_.Class {
                throw InvalidDataException("Overlapping Unicode property ranges.")
            }
            result[^1] = prior with{End = Math.Max(prior.End, range_.End)}
        } else if result.Count != 0 && result[^1].Class == range_.Class && result[^1].End + 1 == range_.Start {
            let prior = result[^1]
            result[^1] = prior with{End = range_.End}
        } else {
            result.Add(range_)
        }
    }
    return result
}

func AddUnicodeBoundaries(boundaries SortedSet[int32], ranges IEnumerable[UnicodeRange]) {
    for range_ in ranges {
        boundaries.Add(range_.Start)
        if range_.End < 0x10FFFF {
            boundaries.Add(range_.End + 1)
        }
    }
}

func FindUnicodeClass(ranges List[UnicodeRange], value int32) string? {
    var low = 0
    var high = ranges.Count - 1
    while low <= high {
        let middle = low + (high - low) / 2
        let range_ = ranges[middle]
        if value < range_.Start {
            high = middle - 1
        } else if value > range_.End {
            low = middle + 1
        } else {
            return range_.Class
        }
    }
    return nil
}

func AddMergedGraphemeRange(ranges List[GraphemeRange], $range GraphemeRange) {
    if ranges.Count != 0 {
        let prior = ranges[^1]
        if prior.Class == $range.Class &&
            prior.InCB == $range.InCB &&
            prior.ExtendedPictographic == $range.ExtendedPictographic &&
            prior.End +
            1 == $range.Start {
            ranges[^1] = prior with{End = $range.End}
            return
        }
    }
    ranges.Add($range)
}

func AddCategoryRange(
    assigned List[CodePointRange],
    combining List[CodePointRange],
    initialQuote List[CodePointRange],
    finalQuote List[CodePointRange],
    start int32,
    end int32,
    category string
) {
    assigned.Add(CodePointRange(start, end))
    if category == "Mn" || category == "Mc" {
        combining.Add(CodePointRange(start, end))
    }
    if category == "Pi" {
        initialQuote.Add(CodePointRange(start, end))
    }
    if category == "Pf" {
        finalQuote.Add(CodePointRange(start, end))
    }
}

func AddBoundaries(boundaries SortedSet[int32], ranges IEnumerable[CodePointRange]) {
    for range_ in ranges {
        boundaries.Add(range_.Start)
        if range_.End < 0x10FFFF {
            boundaries.Add(range_.End + 1)
        }
    }
}

func Contains(ranges List[CodePointRange], value int32) bool {
    var low = 0
    var high = ranges.Count - 1
    while low <= high {
        let middle = low + (high - low) / 2
        let range_ = ranges[middle]
        if value < range_.Start {
            high = middle - 1
        } else if value > range_.End {
            low = middle + 1
        } else {
            return true
        }
    }
    return false
}

func BuildGraphemeRanges(
    graphemeBreak List[UnicodeRange],
    indicConjunctBreak List[UnicodeRange],
    extendedPictographic List[CodePointRange]
) List[GraphemeRange] {
    let boundaries = SortedSet[int32]{0, 0x110000}
    AddUnicodeBoundaries(boundaries, graphemeBreak)
    AddUnicodeBoundaries(boundaries, indicConjunctBreak)
    AddBoundaries(boundaries, extendedPictographic)
    let sorted = boundaries.ToArray()
    let result = List[GraphemeRange]()
    for var index = 0; index + 1 < sorted.Length; index++ {
        let start = sorted[index]
        let end = sorted[index + 1] - 1
        let graphemeClass = FindUnicodeClass(graphemeBreak, start) ?? "Other"
        let indicConjunctBreakClass = FindUnicodeClass(indicConjunctBreak, start) ?? "None"
        let isExtendedPictographic = Contains(extendedPictographic, start)
        if graphemeClass != "Other" || indicConjunctBreakClass != "None" || isExtendedPictographic {
            AddMergedGraphemeRange(
                result,
                GraphemeRange(start, end, graphemeClass, indicConjunctBreakClass, isExtendedPictographic)
            )
        }
    }
    return result
}

func MergeRanges(ranges List[CodePointRange]) List[CodePointRange] {
    ranges.Sort((left CodePointRange, right CodePointRange) -> left.Start.CompareTo(right.Start))
    let result = List[CodePointRange]()
    for range_ in ranges {
        if result.Count != 0 && result[^1].End + 1 >= range_.Start {
            let prior = result[^1]
            result[^1] = CodePointRange(prior.Start, Math.Max(prior.End, range_.End))
        } else {
            result.Add(range_)
        }
    }
    return result
}

func SubtractRanges(source List[CodePointRange], excluded List[CodePointRange]) List[CodePointRange] {
    let result = List[CodePointRange]()
    var excludedIndex = 0
    for range_ in source {
        var cursor = range_.Start
        while excludedIndex < excluded.Count && excluded[excludedIndex].End < cursor {
            excludedIndex++
        }
        var index = excludedIndex
        while index < excluded.Count && excluded[index].Start <= range_.End {
            let excludedRange = excluded[index]
            if excludedRange.Start > cursor {
                result.Add(CodePointRange(cursor, Math.Min(range_.End, excludedRange.Start - 1)))
            }
            if excludedRange.End >= cursor {
                cursor = Math.Max(cursor, excludedRange.End + 1)
            }
            if cursor > range_.End {
                break
            }
            index++
        }
        if cursor <= range_.End {
            result.Add(CodePointRange(cursor, range_.End))
        }
    }
    return MergeRanges(result)
}

func AddMergedRange(ranges List[UnicodeRange], $range CodePointRange, property string) {
    if ranges.Count != 0 {
        let prior = ranges[^1]
        if prior.Class == property && prior.End + 1 == $range.Start {
            ranges[^1] = prior with{End = $range.End}
            return
        }
        if $range.Start <= prior.End {
            throw InvalidDataException("Overlapping Unicode line-break data range.")
        }
    }
    ranges.Add(UnicodeRange($range.Start, $range.End, property))
}

func AddMergedContextRange(ranges List[ContextRange], $range ContextRange) {
    if ranges.Count != 0 {
        let prior = ranges[^1]
        if prior.Flags == $range.Flags && prior.End + 1 == $range.Start {
            ranges[^1] = prior with{End = $range.End}
            return
        }
    }
    ranges.Add($range)
}

func BuildContextRanges(
    eastAsian List[CodePointRange],
    extendedPictographic List[CodePointRange],
    unicodeData UnicodeDataRanges
) List[ContextRange] {
    let extendedPictographicUnassigned = SubtractRanges(extendedPictographic, unicodeData.Assigned)
    let boundaries = SortedSet[int32]{0, 0x110000}
    AddBoundaries(boundaries, eastAsian)
    AddBoundaries(boundaries, unicodeData.Combining)
    AddBoundaries(boundaries, unicodeData.InitialQuote)
    AddBoundaries(boundaries, unicodeData.FinalQuote)
    AddBoundaries(boundaries, extendedPictographic)
    AddBoundaries(boundaries, extendedPictographicUnassigned)
    let sorted = boundaries.ToArray()
    let result = List[ContextRange]()
    for var index = 0; index + 1 < sorted.Length; index++ {
        let start = sorted[index]
        let end = sorted[index + 1] - 1
        var flags = 0
        if Contains(eastAsian, start) {
            flags |= 1
        }
        if Contains(unicodeData.InitialQuote, start) {
            flags |= 2
        }
        if Contains(unicodeData.FinalQuote, start) {
            flags |= 4
        }
        if Contains(extendedPictographic, start) {
            flags |= 8
        }
        if Contains(extendedPictographicUnassigned, start) {
            flags |= 16
        }
        if Contains(unicodeData.Combining, start) {
            flags |= 32
        }
        if flags != 0 {
            AddMergedContextRange(result, ContextRange(start, end, flags))
        }
    }
    return result
}

func StripComment(rawLine string) string {
    let line = rawLine.Trim().TrimStart('﻿')
    let comment = line.IndexOf('#')
    return if comment >= 0 {
        line[.. comment].Trim()
    } else {
        line
    }
}

func ParseCodePoint(value string) int32 -> int32.Parse(
    value.Trim(),
    NumberStyles.HexNumber,
    CultureInfo.InvariantCulture
)

func ParseUnicodeData(source string) UnicodeDataRanges {
    let assigned = List[CodePointRange]()
    let combining = List[CodePointRange]()
    let initialQuote = List[CodePointRange]()
    let finalQuote = List[CodePointRange]()
    var rangeStart = -1
    var rangeCategory = ""
    for rawLine in source.Split('\n') {
        let line = rawLine.Trim()
        if line.Length == 0 {
            continue
        }
        let fields = line.Split(';')
        if fields.Length < 3 {
            throw InvalidDataException("Malformed UnicodeData row: $rawLine")
        }
        let value = ParseCodePoint(fields[0])
        let name = fields[1]
        let category = fields[2]
        if name.EndsWith(", First>", StringComparison.Ordinal) {
            rangeStart = value
            rangeCategory = category
            continue
        }
        if name.EndsWith(", Last>", StringComparison.Ordinal) {
            if rangeStart < 0 || !string.Equals(rangeCategory, category, StringComparison.Ordinal) {
                throw InvalidDataException("Malformed UnicodeData range: $rawLine")
            }
            AddCategoryRange(assigned, combining, initialQuote, finalQuote, rangeStart, value, category)
            rangeStart = -1
            rangeCategory = ""
            continue
        }
        AddCategoryRange(assigned, combining, initialQuote, finalQuote, value, value, category)
    }
    if rangeStart >= 0 {
        throw InvalidDataException("Unclosed UnicodeData range.")
    }
    return UnicodeDataRanges(
        MergeRanges(assigned),
        MergeRanges(combining),
        MergeRanges(initialQuote),
        MergeRanges(finalQuote)
    )
}

func ParseRange(value string) CodePointRange {
    let separator = value.IndexOf("..", StringComparison.Ordinal)
    let start = ParseCodePoint(
        if separator < 0 {
            value
        } else {
            value[.. separator]
        }
    )
    let end = ParseCodePoint(
        if separator < 0 {
            value
        } else {
            value[(separator + 2) ..]
        }
    )
    if end < start {
        throw InvalidDataException("Descending Unicode data range: $value")
    }
    return CodePointRange(start, end)
}

func ParseLineBreakRanges(source string) List[UnicodeRange] {
    let ranges = List[UnicodeRange]()
    for rawLine in source.Split('\n') {
        let line = StripComment(rawLine)
        if line.Length == 0 {
            continue
        }
        let separator = line.IndexOf(';')
        if separator < 0 {
            throw InvalidDataException("Malformed Unicode data row: $rawLine")
        }
        let codePoints = line[.. separator].Trim()
        let property = line[(separator + 1) ..].Trim()
        AddMergedRange(ranges, ParseRange(codePoints), property)
    }
    return ranges
}

func ParsePropertyRanges(source string, properties ...string) List[CodePointRange] {
    let accepted = HashSet[string](properties, StringComparer.Ordinal)
    let ranges = List[CodePointRange]()
    for rawLine in source.Split('\n') {
        let line = StripComment(rawLine)
        if line.Length == 0 {
            continue
        }
        let separator = line.IndexOf(';')
        if separator < 0 {
            throw InvalidDataException("Malformed Unicode data row: $rawLine")
        }
        let property = line[(separator + 1) ..].Trim()
        if !accepted.Contains(property) {
            continue
        }
        ranges.Add(ParseRange(line[.. separator].Trim()))
    }
    return MergeRanges(ranges)
}

func ParseGraphemeBreakRanges(source string) List[UnicodeRange] {
    let ranges = List[UnicodeRange]()
    for rawLine in source.Split('\n') {
        let line = StripComment(rawLine)
        if line.Length == 0 {
            continue
        }
        let separator = line.IndexOf(';')
        if separator < 0 {
            throw InvalidDataException("Malformed Unicode data row: $rawLine")
        }
        let property = line[(separator + 1) ..].Trim()
        if property == "Other" {
            continue
        }
        let range_ = ParseRange(line[.. separator].Trim())
        ranges.Add(UnicodeRange(range_.Start, range_.End, property))
    }
    return NormalizeUnicodeRanges(ranges)
}

func ParseIndicConjunctBreakRanges(source string) List[UnicodeRange] {
    let ranges = List[UnicodeRange]()
    for rawLine in source.Split('\n') {
        let line = StripComment(rawLine)
        if line.Length == 0 {
            continue
        }
        let fields = line.Split(';')
        if fields.Length < 3 || fields[1].Trim() != "InCB" {
            continue
        }
        let property = fields[2].Trim()
        if property == "None" {
            continue
        }
        let range_ = ParseRange(fields[0].Trim())
        ranges.Add(UnicodeRange(range_.Start, range_.End, property))
    }
    return NormalizeUnicodeRanges(ranges)
}

func Encode(write(BinaryWriter) -> void)[]uint8 {
    using let stream = MemoryStream()
    {
        using let writer = BinaryWriter(stream, Encoding.UTF8, true)
        write(writer)
    }
    return stream.ToArray()
}

func EncodeLineBreakData(ranges List[UnicodeRange])[]uint8 {
    let names = []string{
        "AI",
        "AK",
        "AL",
        "AP",
        "AS",
        "B2",
        "BA",
        "BB",
        "BK",
        "CB",
        "CJ",
        "CL",
        "CM",
        "CP",
        "CR",
        "EB",
        "EM",
        "EX",
        "GL",
        "H2",
        "H3",
        "HL",
        "HY",
        "ID",
        "IN",
        "IS",
        "JL",
        "JT",
        "JV",
        "LF",
        "NL",
        "NS",
        "NU",
        "OP",
        "PO",
        "PR",
        "QU",
        "RI",
        "SA",
        "SG",
        "SP",
        "SY",
        "VF",
        "VI",
        "WJ",
        "XX",
        "ZW",
        "ZWJ"
    }
    return Encode(
        (writer BinaryWriter) -> {
            writer.Write(ranges.Count)
            for range_ in ranges {
                let value = Array.IndexOf(names, range_.Class)
                if value < 0 {
                    throw InvalidDataException("Unsupported Line_Break class: ${range_.Class}")
                }
                writer.Write(range_.Start)
                writer.Write(range_.End)
                writer.Write(uint8(value))
            }
        }
    )
}

func EncodeContextData(ranges List[ContextRange])[]uint8 -> Encode(
    (writer BinaryWriter) -> {
        writer.Write(ranges.Count)
        for range_ in ranges {
            writer.Write(range_.Start)
            writer.Write(range_.End)
            writer.Write(uint8(range_.Flags))
        }
    }
)

func GraphemeClassValue(value string) uint8 -> switch value {
    case "Other": uint8(0)
    case "CR": uint8(1)
    case "LF": uint8(2)
    case "Control": uint8(3)
    case "Extend": uint8(4)
    case "ZWJ": uint8(5)
    case "Regional_Indicator": uint8(6)
    case "Prepend": uint8(7)
    case "SpacingMark": uint8(8)
    case "L": uint8(9)
    case "V": uint8(10)
    case "T": uint8(11)
    case "LV": uint8(12)
    case "LVT": uint8(13)
    default: throw InvalidDataException("Unsupported Grapheme_Cluster_Break class: $value")
}

func GraphemeInCbValue(value string) uint8 -> switch value {
    case "None": uint8(0)
    case "Consonant": uint8(1)
    case "Extend": uint8(2)
    case "Linker": uint8(3)
    default: throw InvalidDataException("Unsupported Indic_Conjunct_Break class: $value")
}

func EncodeGraphemeData(ranges List[GraphemeRange])[]uint8 -> Encode(
    (writer BinaryWriter) -> {
        writer.Write(ranges.Count)
        for range_ in ranges {
            writer.Write(range_.Start)
            writer.Write(range_.End)
            writer.Write(GraphemeClassValue(range_.Class))
            writer.Write(GraphemeInCbValue(range_.InCB))
            writer.Write(range_.ExtendedPictographic)
        }
    }
)

internal data struct CodePointRange(Start int32, End int32) : IEquatable[CodePointRange] { }

internal data struct UnicodeRange(Start int32, End int32, Class string) : IEquatable[UnicodeRange] { }

internal data struct ContextRange(Start int32, End int32, Flags int32) : IEquatable[ContextRange] { }

internal data struct GraphemeRange(
    Start int32,
    End int32,
    Class string,
    InCB string,
    ExtendedPictographic bool
) : IEquatable[GraphemeRange] { }

internal data struct UnicodeDataRanges(
    Assigned List[CodePointRange],
    Combining List[CodePointRange],
    InitialQuote List[CodePointRange],
    FinalQuote List[CodePointRange]
) : IEquatable[UnicodeDataRanges] { }

const version = "16.0.0"
const lineBreakSourceUrl = "https://www.unicode.org/Public/16.0.0/ucd/LineBreak.txt"
const lineBreakSourceSha256 = "e97e4259d0d20fab150b9c7b4b28abfae5cd78ca97e7f4ac6ed20d685d5f4a7c"
const eastAsianWidthSourceUrl = "https://www.unicode.org/Public/16.0.0/ucd/EastAsianWidth.txt"
const eastAsianWidthSourceSha256 = "43adc76c0686a42cb370764eb8cfe2b2a45b10b855e5572a2db4a0eecce15d5b"
const emojiDataSourceUrl = "https://www.unicode.org/Public/16.0.0/ucd/emoji/emoji-data.txt"
const emojiDataSourceSha256 = "f1365a5173eee18e1f98b240cdc492e84a25f1ce7e0c9d1094eb29c41a22696a"
const unicodeDataSourceUrl = "https://www.unicode.org/Public/16.0.0/ucd/UnicodeData.txt"
const unicodeDataSourceSha256 = "ff58e5823bd095166564a006e47d111130813dcf8bf234ef79fa51a870edb48f"
const graphemeBreakSourceUrl = "https://www.unicode.org/Public/16.0.0/ucd/auxiliary/GraphemeBreakProperty.txt"
const graphemeBreakSourceSha256 = "c29360bd6f7132811d701d29069541e827eb44bfc4c8fbde8c370d6982689dc1"
const derivedCorePropertiesSourceUrl = "https://www.unicode.org/Public/16.0.0/ucd/DerivedCoreProperties.txt"
const derivedCorePropertiesSourceSha256 = "39d35161f2954497f69e08bdb9e701493f476a3d30222de20028feda36c1dabd"
const scriptsSourceUrl = "https://www.unicode.org/Public/16.0.0/ucd/Scripts.txt"
const scriptsSourceSha256 = "9e88f0a677df47311106340be8ede2ecdacd9c1c931831218d2be6d5508e0039"
const scriptExtensionsSourceUrl = "https://www.unicode.org/Public/16.0.0/ucd/ScriptExtensions.txt"
const scriptExtensionsSourceSha256 = "049117ce26b9769fe2749b06eef51a50a89faef4a97764dd2d81daa715980700"
const propertyValueAliasesSourceUrl = "https://www.unicode.org/Public/16.0.0/ucd/PropertyValueAliases.txt"
const propertyValueAliasesSourceSha256 = "440fd3e5460b9bfe31da67b6f923992e1989d31fe2ed91e091c4b8f8e2620bf9"
let options = ParseArguments(args)
let repositoryRoot = FindRepositoryRoot()
let lineBreakOutputPath = if options.TryGetValue("output", out var requestedOutput) {
    Path.GetFullPath(requestedOutput)
} else {
    Path.Combine(repositoryRoot, "Goo", "Rendering", "Text", "Data", "UnicodeLineBreakData.bin")
}
let contextOutputPath = if options.TryGetValue("context-output", out var requestedContextOutput) {
    Path.GetFullPath(requestedContextOutput)
} else {
    Path.Combine(repositoryRoot, "Goo", "Rendering", "Text", "Data", "UnicodeLineBreakContext.bin")
}
let scriptsOutputPath = if options.TryGetValue("scripts-output", out var requestedScriptsOutput) {
    Path.GetFullPath(requestedScriptsOutput)
} else {
    Path.Combine(repositoryRoot, "Goo", "Rendering", "Text", "Data", "UnicodeScriptsData.bin")
}
let scriptExtensionsOutputPath = if options.TryGetValue(
    "script-extensions-output",
    out var requestedScriptExtensionsOutput
) {
    Path.GetFullPath(requestedScriptExtensionsOutput)
} else {
    Path.Combine(repositoryRoot, "Goo", "Rendering", "Text", "Data", "UnicodeScriptExtensionsData.bin")
}
let scriptsOnly = options.ContainsKey("scripts-only")
var emojiDataBytes = Array.Empty[uint8]()

if !scriptsOnly {
    let lineBreakBytes = ReadSource(
        options,
        if options.ContainsKey("input") {
            "input"
        } else {
            "line-break-input"
        },
        lineBreakSourceUrl,
        lineBreakSourceSha256
    )
    let eastAsianWidthBytes = ReadSource(
        options,
        "east-asian-width-input",
        eastAsianWidthSourceUrl,
        eastAsianWidthSourceSha256
    )
    emojiDataBytes = ReadSource(options, "emoji-data-input", emojiDataSourceUrl, emojiDataSourceSha256)
    let unicodeDataBytes = ReadSource(options, "unicode-data-input", unicodeDataSourceUrl, unicodeDataSourceSha256)
    let lineBreakRanges = ParseLineBreakRanges(Encoding.UTF8.GetString(lineBreakBytes))
    let contextRanges = BuildContextRanges(
        ParsePropertyRanges(Encoding.UTF8.GetString(eastAsianWidthBytes), "F", "W", "H"),
        ParsePropertyRanges(Encoding.UTF8.GetString(emojiDataBytes), "Extended_Pictographic"),
        ParseUnicodeData(Encoding.UTF8.GetString(unicodeDataBytes))
    )
    Directory.CreateDirectory(Path.GetDirectoryName(lineBreakOutputPath)!!)
    Directory.CreateDirectory(Path.GetDirectoryName(contextOutputPath)!!)
    File.WriteAllBytes(lineBreakOutputPath, EncodeLineBreakData(lineBreakRanges))
    File.WriteAllBytes(contextOutputPath, EncodeContextData(contextRanges))
    Console.WriteLine(
        "Generated ${lineBreakRanges.Count} Unicode $version line-break ranges into $lineBreakOutputPath."
    )
    Console.WriteLine(
        "Generated ${contextRanges.Count} Unicode $version line-break context ranges into $contextOutputPath."
    )
}

let scriptsBytes = ReadSource(options, "scripts-input", scriptsSourceUrl, scriptsSourceSha256)

let scriptExtensionsBytes = ReadSource(
    options,
    "script-extensions-input",
    scriptExtensionsSourceUrl,
    scriptExtensionsSourceSha256
)

let propertyValueAliasesBytes = ReadSource(
    options,
    "property-value-aliases-input",
    propertyValueAliasesSourceUrl,
    propertyValueAliasesSourceSha256
)

let scriptData = ScriptGenerator.Generate(
    Encoding.UTF8.GetString(scriptsBytes),
    Encoding.UTF8.GetString(scriptExtensionsBytes),
    Encoding.UTF8.GetString(propertyValueAliasesBytes)
)

Directory.CreateDirectory(Path.GetDirectoryName(scriptsOutputPath)!!)
Directory.CreateDirectory(Path.GetDirectoryName(scriptExtensionsOutputPath)!!)
File.WriteAllBytes(scriptsOutputPath, scriptData.ScriptsData)
File.WriteAllBytes(scriptExtensionsOutputPath, scriptData.ScriptExtensionsData)
Console.WriteLine("Generated ${scriptData.ScriptRangeCount} Unicode $version script ranges into $scriptsOutputPath.")

Console.WriteLine(
    "Generated ${scriptData.ScriptExtensionRangeCount} Unicode $version script-extension ranges into $scriptExtensionsOutputPath."
)

if options.ContainsKey("grapheme-break-input") || options.ContainsKey("derived-core-properties-input") ||
    options
    .ContainsKey("grapheme-output") {
    if scriptsOnly {
        throw ArgumentException("--scripts-only cannot be combined with grapheme generation.")
    }
    let graphemeOutputPath = if options.TryGetValue("grapheme-output", out var requestedGraphemeOutput) {
        Path.GetFullPath(requestedGraphemeOutput)
    } else {
        Path.Combine(repositoryRoot, "Goo", "Rendering", "Text", "Data", "UnicodeGraphemeData.bin")
    }
    let graphemeBreakBytes = ReadSource(
        options,
        "grapheme-break-input",
        graphemeBreakSourceUrl,
        graphemeBreakSourceSha256
    )
    let derivedCorePropertiesBytes = ReadSource(
        options,
        "derived-core-properties-input",
        derivedCorePropertiesSourceUrl,
        derivedCorePropertiesSourceSha256
    )
    let graphemeRanges = BuildGraphemeRanges(
        ParseGraphemeBreakRanges(Encoding.UTF8.GetString(graphemeBreakBytes)),
        ParseIndicConjunctBreakRanges(Encoding.UTF8.GetString(derivedCorePropertiesBytes)),
        ParsePropertyRanges(Encoding.UTF8.GetString(emojiDataBytes), "Extended_Pictographic")
    )
    Directory.CreateDirectory(Path.GetDirectoryName(graphemeOutputPath)!!)
    File.WriteAllBytes(graphemeOutputPath, EncodeGraphemeData(graphemeRanges))
    Console.WriteLine("Generated ${graphemeRanges.Count} Unicode $version grapheme ranges into $graphemeOutputPath.")
}
