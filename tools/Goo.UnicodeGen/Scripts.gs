import System
import System.Collections.Generic
import System.Globalization
import System.IO
import System.Linq
import System.Text

internal data class ScriptGenerationResult(
    ScriptsData[]uint8,
    ScriptExtensionsData[]uint8,
    ScriptRangeCount int32,
    ScriptExtensionRangeCount int32
) : IEquatable[ScriptGenerationResult] { }

internal shared class ScriptGenerator {
    private data class ScriptRange(Start int32, End int32, Tag uint32) : IEquatable[ScriptRange] { }

    private data class ScriptExtensionRange(Start int32, End int32, SetIndex int32) : IEquatable[
        ScriptExtensionRange
    ] { }

    private data class ScriptExtensionData(
        Ranges List[ScriptExtensionRange],
        Offsets[]int32,
        Counts[]int32,
        Tags List[uint32]
    ) : IEquatable[ScriptExtensionData] { }

    private data struct CodePointRange(Start int32, End int32) : IEquatable[ScriptGenerator.CodePointRange] { }

    func Generate(
        scriptsSource string,
        scriptExtensionsSource string,
        propertyValueAliasesSource string
    ) ScriptGenerationResult {
        let aliases = ParseAliases(propertyValueAliasesSource)
        let scripts = ParseScripts(scriptsSource, aliases)
        let extensions = ParseScriptExtensions(scriptExtensionsSource, aliases)
        return ScriptGenerationResult(
            EncodeScripts(scripts),
            EncodeScriptExtensions(extensions),
            scripts.Count,
            extensions.Ranges.Count
        )
    }

    private func ParseAliases(source string) Dictionary[string, string] {
        let result = Dictionary[string, string](StringComparer.Ordinal)
        for rawLine in source.Split('\n') {
            let line = StripComment(rawLine)
            if line.Length == 0 {
                continue
            }
            let fields = line.Split(';', StringSplitOptions.TrimEntries)
            if fields.Length < 3 || fields[0] != "sc" {
                continue
            }
            let shortName = fields[1]
            for alias in fields.Skip(1) {
                if alias.Length == 0 {
                    continue
                }
                if result.TryGetValue(alias, out var prior) && prior != shortName {
                    throw InvalidDataException("Conflicting Script alias: $alias")
                }
                result[alias] = shortName
            }
        }
        return result
    }

    private func ParseScripts(source string, aliases Dictionary[string, string]) List[ScriptRange] {
        let ranges = List[ScriptRange]()
        for rawLine in source.Split('\n') {
            let line = StripComment(rawLine)
            if line.Length == 0 {
                continue
            }
            let separator = line.IndexOf(';')
            if separator < 0 {
                throw InvalidDataException("Malformed Scripts row: $rawLine")
            }
            let range_ = ParseRange(line[.. separator].Trim())
            let property = line[(separator + 1) ..].Trim()
            ranges.Add(ScriptRange(range_.Start, range_.End, ResolveTag(property, aliases)))
        }
        ranges.Sort((left ScriptRange, right ScriptRange) -> left.Start.CompareTo(right.Start))
        let result = List[ScriptRange]()
        for range_ in ranges {
            if result.Count != 0 && range_.Start <= result[^1].End {
                throw InvalidDataException("Overlapping Scripts ranges.")
            }
            if result.Count != 0 && result[^1].Tag == range_.Tag && result[^1].End + 1 == range_.Start {
                let prior = result[^1]
                result[^1] = prior with{End = range_.End}
            } else {
                result.Add(range_)
            }
        }
        return result
    }

    private func ParseScriptExtensions(source string, aliases Dictionary[string, string]) ScriptExtensionData {
        let sets = List[[]uint32]()
        let setIndices = Dictionary[string, int32](StringComparer.Ordinal)
        let ranges = List[ScriptExtensionRange]()
        for rawLine in source.Split('\n') {
            let line = StripComment(rawLine)
            if line.Length == 0 {
                continue
            }
            let separator = line.IndexOf(';')
            if separator < 0 {
                throw InvalidDataException("Malformed ScriptExtensions row: $rawLine")
            }
            let range_ = ParseRange(line[.. separator].Trim())
            let names = line[(separator + 1) ..].Trim().Split(
                ' ',
                StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries
            )
            if names.Length == 0 {
                throw InvalidDataException("Empty ScriptExtensions set: $rawLine")
            }
            let tags = names.Select((name string) -> ResolveTag(name, aliases)).Distinct().Order().ToArray()
            if tags.Length == 0 {
                throw InvalidDataException("Empty ScriptExtensions set: $rawLine")
            }
            let key = string.Join(",", tags.Select((value uint32) -> value.ToString(CultureInfo.InvariantCulture)))
            if !setIndices.TryGetValue(key, out var setIndex) {
                setIndex = sets.Count
                setIndices.Add(key, setIndex)
                sets.Add(tags)
            }
            if ranges.Count != 0 && ranges[^1].End >= range_.Start {
                throw InvalidDataException("Overlapping ScriptExtensions ranges.")
            }
            if ranges.Count != 0 && ranges[^1].SetIndex == setIndex && ranges[^1].End + 1 == range_.Start {
                let prior = ranges[^1]
                ranges[^1] = prior with{End = range_.End}
            } else {
                ranges.Add(ScriptExtensionRange(range_.Start, range_.End, setIndex))
            }
        }
        let offsets = [sets.Count]int32
        let flattened = List[uint32]()
        for var index = 0; index < sets.Count; index++ {
            offsets[index] = flattened.Count
            flattened.AddRange(sets[index])
        }
        return ScriptExtensionData(ranges, offsets, sets.Select((set[]uint32) -> set.Length).ToArray(), flattened)
    }

    private func ResolveTag(name string, aliases Dictionary[string, string]) uint32 {
        if !aliases.TryGetValue(name, out var shortName) {
            throw InvalidDataException("Unknown Script value: $name")
        }
        if shortName.Length != 4 {
            throw InvalidDataException("Invalid ISO 15924 Script tag: $shortName")
        }
        return (uint32(uint8(shortName[0])) << 24) | (uint32(uint8(shortName[1])) << 16) | (
            uint32(uint8(shortName[2])) << 8
        ) | uint32(uint8(shortName[3]))
    }

    private func EncodeScripts(ranges List[ScriptRange])[]uint8 -> Encode(
        (writer BinaryWriter) -> {
            writer.Write(ranges.Count)
            for range_ in ranges {
                writer.Write(range_.Start)
                writer.Write(range_.End)
                writer.Write(range_.Tag)
            }
        }
    )

    private func EncodeScriptExtensions(data ScriptExtensionData)[]uint8 -> Encode(
        (writer BinaryWriter) -> {
            writer.Write(data.Tags.Count)
            for tag in data.Tags {
                writer.Write(tag)
            }
            writer.Write(data.Ranges.Count)
            for range_ in data.Ranges {
                writer.Write(range_.Start)
                writer.Write(range_.End)
                writer.Write(data.Offsets[range_.SetIndex])
                writer.Write(data.Counts[range_.SetIndex])
            }
        }
    )

    private func Encode(write(BinaryWriter) -> void)[]uint8 {
        using let stream = MemoryStream()
        {
            using let writer = BinaryWriter(stream, Encoding.UTF8, true)
            write(writer)
        }
        return stream.ToArray()
    }

    private func StripComment(rawLine string) string {
        let line = rawLine.Trim().TrimStart('﻿')
        let comment = line.IndexOf('#')
        return if comment >= 0 {
            line[.. comment].Trim()
        } else {
            line
        }
    }

    private func ParseRange(value string) ScriptGenerator.CodePointRange {
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
            throw InvalidDataException("Descending Unicode range: $value")
        }
        return ScriptGenerator.CodePointRange(start, end)
    }

    private func ParseCodePoint(value string) int32 -> int32.Parse(
        value.Trim(),
        NumberStyles.HexNumber,
        CultureInfo.InvariantCulture
    )
}
