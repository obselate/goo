using System.Globalization;
using System.Linq;
using System.Text;

internal sealed record ScriptGenerationResult(
    byte[] ScriptsData,
    byte[] ScriptExtensionsData,
    int ScriptRangeCount,
    int ScriptExtensionRangeCount);

internal static class ScriptGenerator
{
    public static ScriptGenerationResult Generate(
        string scriptsSource,
        string scriptExtensionsSource,
        string propertyValueAliasesSource)
    {
        var aliases = ParseAliases(propertyValueAliasesSource);
        var scripts = ParseScripts(scriptsSource, aliases);
        var extensions = ParseScriptExtensions(scriptExtensionsSource, aliases);
        return new ScriptGenerationResult(
            EncodeScripts(scripts),
            EncodeScriptExtensions(extensions),
            scripts.Count,
            extensions.Ranges.Count);
    }

    private static Dictionary<string, string> ParseAliases(string source)
    {
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var rawLine in source.Split('\n'))
        {
            var line = StripComment(rawLine);
            if (line.Length == 0)
                continue;
            var fields = line.Split(';', StringSplitOptions.TrimEntries);
            if (fields.Length < 3 || fields[0] != "sc")
                continue;
            var shortName = fields[1];
            foreach (var alias in fields.Skip(1))
            {
                if (alias.Length == 0)
                    continue;
                if (result.TryGetValue(alias, out var prior) && prior != shortName)
                    throw new InvalidDataException($"Conflicting Script alias: {alias}");
                result[alias] = shortName;
            }
        }
        return result;
    }

    private static List<ScriptRange> ParseScripts(string source,
        Dictionary<string, string> aliases)
    {
        var ranges = new List<ScriptRange>();
        foreach (var rawLine in source.Split('\n'))
        {
            var line = StripComment(rawLine);
            if (line.Length == 0)
                continue;
            var separator = line.IndexOf(';');
            if (separator < 0)
                throw new InvalidDataException($"Malformed Scripts row: {rawLine}");
            var range = ParseRange(line[..separator].Trim());
            var property = line[(separator + 1)..].Trim();
            ranges.Add(new ScriptRange(range.Start, range.End, ResolveTag(property, aliases)));
        }
        ranges.Sort((left, right) => left.Start.CompareTo(right.Start));
        var result = new List<ScriptRange>();
        foreach (var range in ranges)
        {
            if (result.Count != 0 && range.Start <= result[^1].End)
                throw new InvalidDataException("Overlapping Scripts ranges.");
            if (result.Count != 0 && result[^1].Tag == range.Tag
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

    private static ScriptExtensionData ParseScriptExtensions(string source,
        Dictionary<string, string> aliases)
    {
        var sets = new List<uint[]>();
        var setIndices = new Dictionary<string, int>(StringComparer.Ordinal);
        var ranges = new List<ScriptExtensionRange>();
        foreach (var rawLine in source.Split('\n'))
        {
            var line = StripComment(rawLine);
            if (line.Length == 0)
                continue;
            var separator = line.IndexOf(';');
            if (separator < 0)
                throw new InvalidDataException($"Malformed ScriptExtensions row: {rawLine}");
            var range = ParseRange(line[..separator].Trim());
            var names = line[(separator + 1)..].Trim()
                .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            if (names.Length == 0)
                throw new InvalidDataException($"Empty ScriptExtensions set: {rawLine}");
            var tags = names.Select(name => ResolveTag(name, aliases)).Distinct().Order().ToArray();
            if (tags.Length == 0)
                throw new InvalidDataException($"Empty ScriptExtensions set: {rawLine}");
            var key = string.Join(",", tags.Select(value => value.ToString(CultureInfo.InvariantCulture)));
            if (!setIndices.TryGetValue(key, out var setIndex))
            {
                setIndex = sets.Count;
                setIndices.Add(key, setIndex);
                sets.Add(tags);
            }
            if (ranges.Count != 0 && ranges[^1].End >= range.Start)
                throw new InvalidDataException("Overlapping ScriptExtensions ranges.");
            if (ranges.Count != 0 && ranges[^1].SetIndex == setIndex
                && ranges[^1].End + 1 == range.Start)
            {
                var prior = ranges[^1];
                ranges[^1] = prior with { End = range.End };
            }
            else
            {
                ranges.Add(new ScriptExtensionRange(range.Start, range.End, setIndex));
            }
        }

        var offsets = new int[sets.Count];
        var flattened = new List<uint>();
        for (var index = 0; index < sets.Count; index++)
        {
            offsets[index] = flattened.Count;
            flattened.AddRange(sets[index]);
        }
        return new ScriptExtensionData(ranges, offsets, sets.Select(set => set.Length).ToArray(), flattened);
    }

    private static uint ResolveTag(string name, Dictionary<string, string> aliases)
    {
        if (!aliases.TryGetValue(name, out var shortName))
            throw new InvalidDataException($"Unknown Script value: {name}");
        if (shortName.Length != 4)
            throw new InvalidDataException($"Invalid ISO 15924 Script tag: {shortName}");
        return ((uint)(byte)shortName[0] << 24)
            | ((uint)(byte)shortName[1] << 16)
            | ((uint)(byte)shortName[2] << 8)
            | (uint)(byte)shortName[3];
    }

    private static byte[] EncodeScripts(List<ScriptRange> ranges) => Encode(writer =>
    {
        writer.Write(ranges.Count);
        foreach (var range in ranges)
        {
            writer.Write(range.Start);
            writer.Write(range.End);
            writer.Write(range.Tag);
        }
    });

    private static byte[] EncodeScriptExtensions(ScriptExtensionData data) => Encode(writer =>
    {
        writer.Write(data.Tags.Count);
        foreach (var tag in data.Tags)
            writer.Write(tag);
        writer.Write(data.Ranges.Count);
        foreach (var range in data.Ranges)
        {
            writer.Write(range.Start);
            writer.Write(range.End);
            writer.Write(data.Offsets[range.SetIndex]);
            writer.Write(data.Counts[range.SetIndex]);
        }
    });

    private static byte[] Encode(Action<BinaryWriter> write)
    {
        using var stream = new MemoryStream();
        using (var writer = new BinaryWriter(stream, Encoding.UTF8, true))
            write(writer);
        return stream.ToArray();
    }

    private static string StripComment(string rawLine)
    {
        var line = rawLine.Trim().TrimStart('\uFEFF');
        var comment = line.IndexOf('#');
        return comment >= 0 ? line[..comment].Trim() : line;
    }

    private static CodePointRange ParseRange(string value)
    {
        var separator = value.IndexOf("..", StringComparison.Ordinal);
        var start = ParseCodePoint(separator < 0 ? value : value[..separator]);
        var end = ParseCodePoint(separator < 0 ? value : value[(separator + 2)..]);
        if (end < start)
            throw new InvalidDataException($"Descending Unicode range: {value}");
        return new CodePointRange(start, end);
    }

    private static int ParseCodePoint(string value) =>
        int.Parse(value.Trim(), NumberStyles.HexNumber, CultureInfo.InvariantCulture);

    private sealed record ScriptRange(int Start, int End, uint Tag);
    private sealed record ScriptExtensionRange(int Start, int End, int SetIndex);
    private sealed record ScriptExtensionData(
        List<ScriptExtensionRange> Ranges,
        int[] Offsets,
        int[] Counts,
        List<uint> Tags);
    private readonly record struct CodePointRange(int Start, int End);
}
