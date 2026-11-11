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
        IndexText string,
        Words Dictionary[string, int32],
        OwnWords HashSet[string],
        Forms HashSet[string],
        LineTerms[]HashSet[string],
        Names HashSet[string],
        Identifier string,
        Name string,
        DefinitionNames[]string,
        Owner string,
        OwnerNames[]string,
        Symbol string,
        WordTotal int32
    ) { }

    private data class IndexedDocument(
        Modified int64,
        Length int64,
        AssemblyModified int64,
        AssemblyLength int64,
        Units[]SearchUnit,
        AssemblyHash string
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
                let parts = name.Substring(2).Split('(')[0].Split('.')
                let memberName = Regex.Replace(
                    string.Join(
                        ".",
                        parts.TakeLast(
                            if name.StartsWith("T:") {
                                1
                            } else {
                                2
                            }
                        )
                    ),
                    "`[0-9]+",
                    ""
                )
                let identifier = memberName.Split('.').Last()
                let summary = XmlText(member.Element("summary"))
                let declaration = if declarations.TryGetValue(name, out var signature) {
                    signature
                } else {
                    "Declaration unavailable"
                }
                let body = StringBuilder(memberName + "\n\n" + declaration + "\n\n" + summary)
                for child in member.Elements().Where(x -> x.Name.LocalName != "summary") {
                    body.Append("\n\n").Append(child.Name.LocalName)
                    let parameter = child.Attribute("name")?.Value ?? child.Attribute("cref")?.Value ?? ""
                    if parameter != "" {
                        body.Append(" ").Append(parameter)
                    }
                    body.Append(": ").Append(XmlText(child))
                }
                let text = body.ToString()
                let indexed = IndexTerms(text)
                let words = indexed.Words
                let start = IXmlLineInfo(member).LineNumber
                result.Add(
                    SearchUnit(
                        path,
                        digest,
                        name,
                        memberName,
                        "",
                        start,
                        start + Lines(member.ToString(SaveOptions.DisableFormatting)).Length - 1,
                        text,
                        text,
                        words,
                        indexed.Own,
                        indexed.Forms,
                        indexed.Lines,
                        HashSet[string](Words(memberName)),
                        identifier,
                        Stem(CaseFold(identifier)),
                        DefinitionNameParts(memberName),
                        if name.StartsWith("T:") {
                            ""
                        } else {
                            CaseFold(string.Join(".", parts.Take(parts.Length - 1)))
                        },
                        Words(
                            if name.StartsWith("T:") {
                                ""
                            } else {
                                memberName.Split('.')[0]
                            },
                            false
                        )
                            .Distinct().ToArray(),
                        CaseFold(memberName),
                        words.Values.Sum()
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
                    if heading.StartsWith("## `") {
                        let summary = lines
                            .Skip(start + 1)
                            .Take(Math.Max(0, starts[i + 1] - start - 1))
                            .FirstOrDefault(
                            x -> x.Trim() != "" && !x.StartsWith("```") && !x.StartsWith("Source:") && !x.StartsWith(
                                "Sources:"
                            ) &&
                                !x.StartsWith("- [")
                        ) ??
                            ""
                        if summary != "" {
                            parent += "\n" + summary
                        }
                    }
                }
                let context = if heading.StartsWith("###") {
                    parent
                } else {
                    ""
                }
                let text = string.Join("\n", lines.Skip(start).Take(end - start))
                let ownText = string.Join("\n", lines.Skip(start).Take(starts[i + 1] - start))
                let contextHeading = context.Split('\n')[0]
                let indexText = contextHeading + "\n" + ownText
                let indexed = IndexTerms(ownText, contextHeading)
                let words = indexed.Words
                let memberName = Regex.Match(heading, "^#{2,6} `([^`(]+)").Groups[1].Value.Split('<')[0]
                let owner = Regex.Match(context, "^## `([^`< :(]+)").Groups[1].Value
                let symbol = if memberName == "" {
                    ""
                } else if heading.StartsWith("###") && owner != "" {
                    owner + "." + memberName
                } else {
                    memberName
                }
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
                        indexText,
                        words,
                        indexed.Own,
                        indexed.Forms,
                        indexed.Lines,
                        HashSet[string](Words(contextHeading + "\n" + heading)),
                        memberName,
                        Stem(CaseFold(memberName)),
                        DefinitionNameParts(symbol),
                        CaseFold(owner),
                        Words(owner, false).Distinct().ToArray(),
                        CaseFold(symbol),
                        words.Values.Sum()
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
            units,
            if assembly.Exists {
                Hash(File.ReadAllBytes(assembly.FullName))
            } else {
                ""
            }
        )
        return units
    }

    func Search(a JsonObject) JsonObject {
        let query = S(a, "query")
        let queryForms = Lexemes(query).Distinct().GroupBy(Stem).ToArray()
        let queryWords = queryForms.Select(x -> x.Key).ToList()
        let exactForms = queryForms.ToDictionary(x -> x.Key, x -> x.ToArray())
        let terms = queryWords.Where(x -> !StopWords.Contains(x)).ToList()
        let limit = I(a, "limit")
        Require(
            terms.Count > 0 && query.Length <= 256 && limit >= 1 && limit <= 20,
            "Supply a query of 1-256 characters and a limit of 1-20"
        )
        let queryName = CaseFold(Regex.Replace(query.Trim(), "[\\[(<].*$", ""))
        let symbolQuery = if Regex.IsMatch(queryName, "^[\\p{L}_][\\p{L}\\p{N}_]*(?:\\.[\\p{L}_][\\p{L}\\p{N}_]*)*$") {
            queryName
        } else {
            ""
        }
        let root = Source(S(a, "repository"))
        let packages = PackageDocuments(S(a, "project"))
        let units = List[SearchUnit]()
        let documents = Documents(root)
        for relative in documents.Where(x -> x.EndsWith(".md")) {
            units.AddRange(Units(relative, Document(root, relative, documents)))
        }
        for entry in packages {
            units.AddRange(Units(entry.Key, entry.Value))
        }
        let frequencies = terms.ToDictionary(term -> term, term -> units.Count(x -> x.Words.ContainsKey(term)))
        let average = if units.Count > 0 {
            Math.Max(1.0, units.Average(x -> double(x.WordTotal)))
        } else {
            1.0
        }
        let ranked = units
            .Select(
            unit -> {
                var score = 0.0
                var matched = 0
                var ownMatched = 0
                let length = unit.WordTotal
                for term in terms {
                    if !unit.Words.TryGetValue(term, out var count) {
                        continue
                    }
                    matched++
                    if unit.OwnWords.Contains(term) {
                        ownMatched++
                    }
                    let idf = Math.Log(1 + (units.Count - frequencies[term] + 0.5) / (frequencies[term] + 0.5))
                    var exact = false
                    for form in exactForms[term] {
                        if unit.Forms.Contains(form) {
                            exact = true
                            break
                        }
                    }
                    score += idf * count * 2.2 / (count + 1.2 * (0.5 + 0.5 * length / average)) * (
                        if exact {
                            1.25
                        } else {
                            1.0
                        }
                    )
                    if unit.Names.Contains(term) {
                        score += idf * 0.4
                    }
                    if unit.Name == term {
                        score += idf * 2
                    }
                }
                score *= Math.Pow(double(matched) / terms.Count, 2)
                var nearby = 0
                for line in unit.LineTerms {
                    var count = 0
                    for term in terms {
                        if line.Contains(term) {
                            count++
                        }
                    }
                    nearby = Math.Max(nearby, count)
                }
                if matched > 0 {
                    score *= 1 + double(nearby) / matched
                    score *= 1 + double(ownMatched) / matched
                }
                let defines = symbolQuery != "" &&
                    unit.Symbol != "" &&
                    (
                    unit.Symbol == symbolQuery || unit.Symbol.Length > symbolQuery.Length && unit.Symbol.EndsWith(
                        symbolQuery,
                        StringComparison.Ordinal
                    ) &&
                        unit.Symbol[unit.Symbol.Length - symbolQuery.Length - 1] == '.' ||
                        symbolQuery.Length > unit
                        .Symbol
                        .Length &&
                        symbolQuery.EndsWith(unit.Symbol, StringComparison.Ordinal) &&
                        symbolQuery[symbolQuery.Length - unit.Symbol.Length - 1] == '.'
                )
                var named = !defines && unit.DefinitionNames.Length > 1
                var nameTerms = 0
                if named {
                    for part in unit.DefinitionNames {
                        if !queryWords.Contains(part) {
                            named = false
                            break
                        }
                        if !StopWords.Contains(part) {
                            nameTerms++
                        }
                    }
                    named = named &&
                        (
                        if unit.Owner == "" {
                            nameTerms == terms.Count
                        } else {
                            nameTerms * 3 >= terms.Count * 2 || queryWords.Contains(unit.Name) &&
                                (
                                unit.Identifier.Contains('_') || Regex.IsMatch(
                                    unit.Identifier,
                                    "[\\p{Ll}0-9]\\p{Lu}|\\p{Lu}\\p{Lu}\\p{Ll}"
                                )
                            )
                        }
                    )
                }
                if named {
                    score *= 2
                } else if terms.Count >= 2 && unit.Heading.StartsWith("#") && unit.Symbol == "" {
                    score *= 3
                }
                var qualified = named && queryWords.Contains(unit.Name)
                if named && !qualified && unit.OwnerNames.Length > 0 {
                    qualified = true
                    for part in unit.OwnerNames {
                        if !queryWords.Contains(part) {
                            qualified = false
                            break
                        }
                    }
                }
                return (Unit: unit, Score: score, Defines: defines, Named: named, Qualified: qualified)
            }
        )
            .Where(x -> x.Score > 0)
            .OrderByDescending(x -> x.Defines)
            .ThenByDescending(x -> x.Qualified)
            .ThenByDescending(x -> x.Score)
            .ThenBy(x -> x.Unit.Path, StringComparer.Ordinal)
            .ThenBy(x -> x.Unit.Start)
            .ToArray()
        if ranked.Length > 1 &&
            !ranked[0].Defines &&
            !ranked[0].Named &&
            ranked[0]
            .Unit
            .Identifier != "" &&
            ranked[0]
            .Unit
            .Owner != "" &&
            !queryWords
            .Contains(ranked[0].Unit.Name) {
            let first = ranked[0]
            let own = Array.FindIndex(
                ranked,
                x -> x.Unit.Path == first.Unit.Path && x.Unit.Owner == first.Unit.Owner && queryWords.Contains(
                    x.Unit.Name
                ) &&
                    Regex.IsMatch(
                    first.Unit.Text,
                    "(?<![\\p{L}\\p{N}_])" + Regex.Escape(x.Unit.Identifier) + "(?![\\p{L}\\p{N}_])"
                )
            )
            if own > 0 {
                let selected = ranked[own]
                Array.Copy(ranked, 0, ranked, 1, own)
                ranked[0] = selected
            }
        }
        let results = JsonArray()
        for item in ranked.Take(int32(limit)) {
            let unit = item.Unit
            let excerpt = Excerpt(
                unit,
                terms,
                if results.Count == 0 {
                    600
                } else if results.Count < 3 {
                    360
                } else {
                    96
                }
            )
            results.Add(
                JsonObject(){
                    ["path"] = unit.Path,
                    ["section"] = unit.Heading,
                    ["section_id"] = unit.Id,
                    ["line"] = unit.Start,
                    ["excerpt"] = excerpt
                }
            )
        }
        return JsonObject(){
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

    func Excerpt(unit SearchUnit, terms List[string], cap int32) string {
        let text = unit.IndexText
        let width = cap - 8
        let positions = List[(Start int32, End int32, Term int32)]()
        for token in Regex.Matches(text, "[\\p{L}\\p{N}_]+(?:\\+\\+|#)?") {
            for word in Words(token.Value).Distinct() {
                let term = terms.IndexOf(word)
                if term >= 0 {
                    positions.Add((token.Index, token.Index + token.Length, term))
                }
            }
        }
        var start = 0
        var best = -1
        let counts = [terms.Count]int32
        var first = 0
        var last = 0
        var covered = 0
        var found = 0
        for position in positions {
            var candidate = Math.Max(0, position.Start - width / 4)
            if candidate > 0 && !char.IsWhiteSpace(text[candidate - 1]) {
                while candidate < position.Start && !char.IsWhiteSpace(text[candidate]) {
                    candidate++
                }
            }
            while last < positions.Count && positions[last].End <= candidate + width {
                let term = positions[last].Term
                if counts[term] == 0 {
                    covered++
                }
                counts[term]++
                found++
                last++
            }
            while first < last && positions[first].Start < candidate {
                let term = positions[first].Term
                counts[term]--
                if counts[term] == 0 {
                    covered--
                }
                found--
                first++
            }
            let score = covered * 100 + Math.Min(found, 20)
            if score > best {
                best = score
                start = candidate
            }
        }
        if start > 0 && char.IsLowSurrogate(text[start]) {
            start--
        }
        var end = Math.Min(text.Length, start + width)
        if end < text.Length && end > start && char.IsHighSurrogate(text[end - 1]) {
            end--
        }
        return (
            if start > 0 {
                "... "
            } else {
                ""
            }
        ) +
            Regex
            .Replace(text.Substring(start, end - start), "\\s+", " ").Trim() +
            (
            if end < text.Length {
                " ..."
            } else {
                ""
            }
        )
    }

    shared {
        private let CaseFolding Dictionary[int32, string] = LoadCaseFolding()
        private let StopWords HashSet[string] = HashSet[string](
            Words(
                "a across an and are as at be by can do does for from get how i in into is it its my of on only or should than that the their them then this through to using when which while with without"
            )
        )

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

        func DefinitionNameParts(name string)[]string {
            if name == "" {
                return Array.Empty[string]()
            }
            let segments = name.Split('.')
            let parts = Words(segments[segments.Length - 1], false).Distinct().ToArray()
            return if parts.Length == 1 && segments.Length > 1 {
                Words(segments[segments.Length - 2], false).Concat(parts).Distinct().ToArray()
            } else {
                parts
            }
        }

        func Words(value string, includeIdentifiers bool = true) IEnumerable[string] -> Lexemes(
            value,
            includeIdentifiers
        ).Select(Stem)

        func Lexemes(value string, includeIdentifiers bool = true) IEnumerable[string] {
            let split = Regex.Replace(value, "(?<=[\\p{Ll}0-9])(?=\\p{Lu})|(?<=\\p{Lu})(?=\\p{Lu}\\p{Ll})", " ")
            let words = Regex.Matches(CaseFold(split.Replace('_', ' ')), "[\\p{L}\\p{N}]+(?:\\+\\+|#)?").Select(
                x -> x.Value
            )
            if !includeIdentifiers {
                return words
            }
            return words.Concat(
                Regex
                    .Matches(value, "[\\p{L}\\p{N}_]+(?:\\+\\+|#)?")
                    .Where(
                    x -> x.Value.Contains('_') || Regex.IsMatch(x.Value, "[\\p{Ll}0-9]\\p{Lu}|\\p{Lu}\\p{Lu}\\p{Ll}")
                )
                    .Select(x -> CaseFold(x.Value))
            )
        }

        func Stem(term string) string {
            var result = term
            if result.EndsWith("sses") && result.Length > 5 {
                result = result.Substring(0, result.Length - 2)
            } else if result.EndsWith("ies") && result.Length > 4 {
                result = result.Substring(0, result.Length - 3) + "y"
            } else if result.EndsWith("s") && !result.EndsWith("ss") && !result.EndsWith("us") && !result.EndsWith(
                "is"
            ) &&
                result.Length > 4 {
                result = result.Substring(0, result.Length - 1)
            }
            if result.EndsWith("ied") && result.Length > 4 {
                result = result.Substring(0, result.Length - 3) + "y"
            } else {
                let suffix = if result.EndsWith("ing") {
                    3
                } else if result.EndsWith("ed") && !result.EndsWith("eed") {
                    2
                } else {
                    0
                }
                if suffix > 0 {
                    var stem = result.Substring(0, result.Length - suffix)
                    if stem.Length == 3 && Regex.IsMatch(stem, "^[^aeiou][aeiouy][^aeiouwxy]$") {
                        stem += "e"
                    }
                    if stem.Length >= 4 && Regex.IsMatch(stem, "[aeiouy]") {
                        result = stem
                        if result.Length > 4 &&
                            result[result.Length - 1] == result[result.Length - 2] &&
                            "bdgmnprt".Contains(result[result.Length - 1]) {
                            result = result.Substring(0, result.Length - 1)
                        }
                    }
                }
            }
            while result.EndsWith("er") && result.Length >= 6 && Regex.IsMatch(
                result.Substring(0, result.Length - 2),
                "[aeiouy]"
            ) {
                result = result.Substring(0, result.Length - 2)
                if result.Length > 4 && result[result.Length - 1] == result[result.Length - 2] && "bdgmnprt".Contains(
                    result[result.Length - 1]
                ) {
                    result = result.Substring(0, result.Length - 1)
                }
            }
            if result.EndsWith("ion") && result.Length >= 7 && Regex.IsMatch(
                result.Substring(0, result.Length - 3),
                "[aeiouy]"
            ) {
                result = result.Substring(0, result.Length - 3)
            }
            if result.EndsWith("ll") && result.Length > 4 && Regex.Matches(result, "[aeiouy]+[^aeiouy]+").Count > 1 {
                result = result.Substring(0, result.Length - 1)
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

        func IndexTerms(text string, context string = "")(
            Words Dictionary[string, int32],
            Own HashSet[string],
            Forms HashSet[string],
            Lines[]HashSet[string]
        ) {
            let words = Dictionary[string, int32]()
            let forms = HashSet[string]()
            let lines = List[HashSet[string]]()
            for line in Lines(text) {
                let found = HashSet[string]()
                for form in Lexemes(line) {
                    forms.Add(form)
                    let word = Stem(form)
                    words[word] = words.GetValueOrDefault(word) + 1
                    found.Add(word)
                }
                if found.Count > 0 {
                    lines.Add(found)
                }
            }
            let own = HashSet[string](words.Keys)
            if context != "" {
                let found = HashSet[string]()
                for form in Lexemes(context) {
                    forms.Add(form)
                    let word = Stem(form)
                    words[word] = words.GetValueOrDefault(word) + 1
                    found.Add(word)
                }
                lines.Add(found)
            }
            return (words, own, forms, lines.ToArray())
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
