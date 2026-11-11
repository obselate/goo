package Goo.PluginMcp

import System
import System.Collections.Concurrent
import System.Collections.Generic
import System.IO
import System.Linq
import System.Reflection
import System.Text
import System.Text.Json
import System.Text.Json.Nodes
import System.Text.RegularExpressions
import System.Xml
import System.Xml.Linq

partial class GooServer {
    private data class SearchUnit(
        Path string,
        Hash string,
        Id string,
        Heading string,
        Parent string,
        Start int32,
        End int32,
        Text string,
        Summary string,
        Words Dictionary[string, int32],
        Names HashSet[string]
    ) { }

    private data class IndexedDocument(
        Modified int64,
        Length int64,
        AssemblyModified int64,
        AssemblyLength int64,
        Units[]SearchUnit
    ) { }
    private let Index ConcurrentDictionary[string, IndexedDocument] = ConcurrentDictionary[string, IndexedDocument](
        StringComparer.Ordinal
    )

    func Units(path string, filename string)[]SearchUnit {
        let file = FileInfo(filename)
        let assembly = FileInfo(Path.ChangeExtension(filename, ".dll"))
        let assemblyModified = if assembly.Exists {
            assembly.LastWriteTimeUtc.Ticks
        } else {
            0L
        }
        let assemblyLength = if assembly.Exists {
            assembly.Length
        } else {
            0L
        }
        if Index.TryGetValue(filename, out var cached) &&
            cached.Modified == file
            .LastWriteTimeUtc
            .Ticks &&
            cached.Length == file.Length &&
            cached.AssemblyModified == assemblyModified &&
            cached.AssemblyLength == assemblyLength {
            return cached.Units
        }
        let bytes = File.ReadAllBytes(filename)
        let digest = Hash(bytes)
        let result = List[SearchUnit]()
        if path.EndsWith(".xml", StringComparison.Ordinal) {
            let declarations = Declarations(filename)
            let xml = XDocument.Parse(
                Encoding.UTF8.GetString(bytes),
                LoadOptions.SetLineInfo | LoadOptions.PreserveWhitespace
            )
            for member in xml.Descendants("member") {
                let name = member.Attribute("name")?.Value ?? ""
                let summary = XmlText(member.Element("summary"))
                let declaration = if declarations.TryGetValue(name, out var signature) {
                    signature
                } else {
                    "Declaration unavailable"
                }
                let body = StringBuilder(name + "\n\n" + declaration + "\n\n" + summary)
                for child in member.Elements().Where(x -> x.Name.LocalName != "summary") {
                    body.Append("\n\n").Append(child.Name.LocalName)
                    let parameter = child.Attribute("name")?.Value ?? ""
                    if parameter != "" {
                        body.Append(" ").Append(parameter)
                    }
                    body.Append(": ").Append(XmlText(child))
                }
                let text = body.ToString()
                let start = IXmlLineInfo(member).LineNumber
                result.Add(
                    SearchUnit(
                        path,
                        digest,
                        name,
                        name,
                        "",
                        start,
                        start + Lines(member.ToString(SaveOptions.DisableFormatting)).Length - 1,
                        text,
                        summary,
                        WordCounts(text),
                        HashSet[string](Words(name))
                    )
                )
            }
        } else {
            let lines = Lines(Encoding.UTF8.GetString(bytes))
            let starts = List[int32](){0}
            var fence = ""
            for i in 0 ... lines.Length {
                let trimmed = lines[i].TrimStart()
                if trimmed.StartsWith("```") || trimmed.StartsWith("~~~") {
                    let marker = trimmed.Substring(0, 3)
                    fence = if fence == marker {
                        ""
                    } else if fence == "" {
                        marker
                    } else {
                        fence
                    }
                }
                if fence == "" && i > 0 && Regex.IsMatch(lines[i], "^#{1,6} ") {
                    starts.Add(i)
                }
            }
            starts.Add(lines.Length)
            var parent = ""
            for i in 0 ... (starts.Count - 1) {
                let start = starts[i]
                var end = starts[i + 1]
                let depth = if start < lines.Length {
                    Regex.Match(lines[start], "^#{1,6}(?= )").Length
                } else {
                    0
                }
                if depth == 1 {
                    end = lines.Length
                }
                if depth >= 2 {
                    for next in(i + 1) ... (starts.Count - 1) {
                        let nextDepth = Regex.Match(lines[starts[next]], "^#{1,6}(?= )").Length
                        if nextDepth <= depth {
                            break
                        }
                        end = starts[next + 1]
                    }
                }
                let heading = if start < lines.Length {
                    lines[start]
                } else {
                    ""
                }
                if heading.StartsWith("## ") {
                    parent = heading
                }
                let context = if heading.StartsWith("###") {
                    parent
                } else {
                    ""
                }
                let text = string.Join("\n", lines.Skip(start).Take(end - start))
                let summary = lines
                    .Skip(start + 1)
                    .Take(Math.Max(0, end - start - 1))
                    .FirstOrDefault(
                    x -> x.Trim() != "" && !x.StartsWith("```") && !x.StartsWith("Source:") && !x.StartsWith(
                        "Sources:"
                    ) &&
                        !x.StartsWith("- [")
                ) ??
                    ""
                result.Add(
                    SearchUnit(
                        path,
                        digest,
                        digest.Substring(0, 12) + ":" + (start + 1).ToString(),
                        heading,
                        context,
                        start + 1,
                        end,
                        text,
                        summary,
                        WordCounts(context + "\n" + text),
                        HashSet[string](Words(context + "\n" + heading))
                    )
                )
            }
        }
        let units = result.ToArray()
        Index[filename] = IndexedDocument(
            file.LastWriteTimeUtc.Ticks,
            file.Length,
            assemblyModified,
            assemblyLength,
            units
        )
        return units
    }

    func Search(a JsonObject) JsonObject {
        let query = S(a, "query")
        let terms = SearchTerms(query)
        let limit = I(a, "limit")
        Require(
            terms.Count > 0 && query.Length <= 256 && limit >= 1 && limit <= 20,
            "Supply a query of 1-256 characters and a limit of 1-20"
        )
        let root = Source(S(a, "repository"))
        let packages = PackageDocuments(S(a, "project"))
        let units = List[SearchUnit]()
        for relative in Documents(root).Where(x -> x.EndsWith(".md")) {
            let documentUnits = Units(relative, Document(root, relative))
            units.AddRange(documentUnits.Where(x -> !x.Heading.StartsWith("# ") || documentUnits.Length == 1))
        }
        for entry in packages {
            units.AddRange(Units(entry.Key, entry.Value))
        }
        let frequencies = terms.ToDictionary(term -> term, term -> units.Count(x -> x.Words.ContainsKey(term)))
        let average = if units.Count > 0 {
            Math.Max(1.0, units.Average(x -> double(x.Words.Values.Sum())))
        } else {
            1.0
        }
        let ranked = units
            .Select(
            unit -> {
                var score = 0.0
                var matched = 0
                let length = unit.Words.Values.Sum()
                for term in terms {
                    if !unit.Words.TryGetValue(term, out var count) {
                        continue
                    }
                    matched++
                    let idf = Math.Log(1 + (units.Count - frequencies[term] + 0.5) / (frequencies[term] + 0.5))
                    score += idf * count * 2.2 / (count + 1.2 * (0.25 + 0.75 * length / average))
                    if unit.Names.Contains(term) {
                        score += idf * 0.4
                    }
                }
                score *= Math.Pow(double(matched) / terms.Count, 2)
                if terms.Count >= 4 && unit.Heading.StartsWith("#") && !unit.Heading.Contains('`') {
                    score *= 2
                }
                if terms.All(term -> unit.Names.Contains(term)) &&
                    (terms.Count == 1 || Regex.IsMatch(query, "[A-Z][a-zA-Z]+[A-Z]|[.]")) {
                    score += 12
                }
                return (Unit: unit, Score: score)
            }
        )
            .Where(x -> x.Score > 0)
            .OrderByDescending(x -> x.Score)
            .ThenBy(x -> x.Unit.Path, StringComparer.Ordinal)
            .ThenBy(x -> x.Unit.Start)
            .ToArray()
        let results = JsonArray()
        for item in ranked.Take(int32(limit)) {
            let unit = item.Unit
            let summary = Regex.Replace(unit.Summary, "\\s+", " ").Trim()
            results.Add(
                JsonObject(){
                    ["path"] = unit.Path,
                    ["section"] = unit.Heading,
                    ["section_id"] = unit.Id,
                    ["line"] = unit.Start,
                    ["endLine"] = unit.End,
                    ["sha256"] = unit.Hash,
                    ["summary"] = summary.Substring(0, Math.Min(180, summary.Length))
                }
            )
        }
        return JsonObject(){
            ["source"] = root,
            ["queryTerms"] = Strings(terms),
            ["mode"] = if ranked.Length == 0 {
                "none"
            } else {
                "ranked"
            },
            ["total"] = ranked.Length,
            ["packages"] = PackageStatus(packages),
            ["results"] = results
        }
    }

    shared {
        private let CaseFolding Dictionary[int32, string] = LoadCaseFolding()

        func LoadCaseFolding() Dictionary[int32, string] {
            using let resource = Assembly.GetExecutingAssembly().GetManifestResourceStream(
                "Goo.PluginMcp.CaseFold.json"
            )!!
            return JsonSerializer.Deserialize[Dictionary[int32, string]](resource)
        }

        func CaseFold(value string) string {
            if value.All(x -> x <= '\u007f') {
                return value.ToLowerInvariant()
            }
            let result = StringBuilder(value.Length)
            var offset = 0
            for rune in value.EnumerateRunes() {
                if CaseFolding.TryGetValue(rune.Value, out var folded) {
                    result.Append(folded)
                } else {
                    result.Append(value, offset, rune.Utf16SequenceLength)
                }
                offset += rune.Utf16SequenceLength
            }
            return result.ToString()
        }

        func Words(value string) IEnumerable[string] {
            let split = Regex.Replace(value, "(?<=[\\p{Ll}0-9])(?=\\p{Lu})|(?<=\\p{Lu})(?=\\p{Lu}\\p{Ll})", " ")
            let identifiers = Regex
                .Matches(value, "[\\p{L}\\p{N}_]+(?:\\+\\+|#)?")
                .Where(
                x -> x.Value.Contains('_') || Regex.IsMatch(x.Value, "[\\p{Ll}0-9]\\p{Lu}|\\p{Lu}\\p{Lu}\\p{Ll}")
            )
                .Select(x -> Stem(CaseFold(x.Value)))
            return Regex
                .Matches(CaseFold(split.Replace('_', ' ')), "[\\p{L}\\p{N}]+(?:\\+\\+|#)?")
                .Select(x -> Stem(x.Value))
                .Concat(identifiers)
        }

        func Stem(term string) string {
            var result = term
            if result.EndsWith("ies") && result.Length > 4 {
                result = result.Substring(0, result.Length - 3) + "y"
            } else if result.EndsWith("s") && !result.EndsWith("ss") && result.Length > 3 {
                result = result.Substring(0, result.Length - 1)
            }
            if result.EndsWith("ied") && result.Length > 4 {
                result = result.Substring(0, result.Length - 3) + "y"
            } else if result.EndsWith("ing") && result.Length > 5 {
                result = result.Substring(0, result.Length - 3)
            } else if result.EndsWith("ed") && result.Length > 5 {
                result = result.Substring(0, result.Length - 2)
            }
            let stem = if result.EndsWith("e") && result.Length > 4 {
                result.Substring(0, result.Length - 1)
            } else {
                result
            }
            return switch stem {
                case "component": "cell"
                case "refresh": "rebuild"
                case "typefac": "font"
                case "screenshot": "captur"
                default: stem
            }
        }

        func WordCounts(value string) Dictionary[string, int32] -> Words(value).GroupBy(x -> x).ToDictionary(
            x -> x.Key,
            x -> x.Count()
        )

        func SearchTerms(value string) List[string] {
            let stop = HashSet[string](
                Words(
                    "a across an and are as at be by can do does for from get how i in into is it its my of on only or should than that the their them then this through to using when which while with without"
                )
            )
            return Words(value).Where(x -> !stop.Contains(x)).Distinct().ToList()
        }

        func XmlText(element XElement?) string {
            if element == nil {
                return ""
            }
            let copy = XElement(element)
            for reference in copy
                .Descendants()
                .Where(
                x -> x
                    .Name
                    .LocalName == "see" ||
                    x
                    .Name
                    .LocalName == "seealso" ||
                    x
                    .Name
                    .LocalName == "paramref" ||
                    x
                    .Name
                    .LocalName == "typeparamref"
            )
                .ToArray() {
                reference.ReplaceWith(
                    XText(reference.Attribute("cref")?.Value ?? reference.Attribute("name")?.Value ?? reference.Value)
                )
            }
            return Regex.Replace(copy.Value, "\\s+", " ").Trim()
        }
    }
}
