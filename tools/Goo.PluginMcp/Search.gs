package Goo.PluginMcp

import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Reflection
import System.Text
import System.Text.Json
import System.Text.Json.Nodes
import System.Text.RegularExpressions

partial class GooServer {
    private data class SearchHit(Exact bool, Score int32, Result JsonObject) { }

    func Search(a JsonObject) JsonObject {
        let query = S(a, "query")
        let terms = SearchTerms(query)
        let limit = I(a, "limit")
        if terms.Count == 0 || query.Length > 256 || limit < 1 || limit > 20 {
            throw ArgumentException("Supply a query of 1-256 characters and a limit of 1-20")
        }
        let root = Source(S(a, "repository"))
        let matches = List[SearchHit]()
        for relative in Documents(root).Where(x -> x.EndsWith(".md")) {
            let bytes = File.ReadAllBytes(Document(root, relative))
            let digest = Hash(bytes)
            let lines = Lines(Encoding.UTF8.GetString(bytes))
            let starts = List[int32](){0}
            for i in 1 ... lines.Length {
                if lines[i].StartsWith("## ") {
                    starts.Add(i)
                }
            }
            starts.Add(lines.Length)
            for section in 0 ... (starts.Count - 1) {
                let start = starts[section]
                let end = starts[section + 1]
                let folded = Fold(string.Join("\n", lines.Skip(start).Take(end - start)))
                let matched = terms.Where(term -> folded.Contains(term)).ToArray()
                if matched.Length == 0 {
                    continue
                }
                let heading = if start < lines.Length {
                    lines[start]
                } else {
                    ""
                }
                let headingFolded = Fold(heading)
                var bestCount = -1
                var bestWeight = -1
                var hit = start
                for index in start ... end {
                    let line = Fold(lines[index])
                    let found = matched.Where(term -> line.Contains(term)).ToArray()
                    let weight = found.Sum(term -> terms.Count - terms.IndexOf(term))
                    if found.Length > bestCount || found.Length == bestCount && weight > bestWeight {
                        bestCount = found.Length
                        bestWeight = weight
                        hit = index
                    }
                }
                var score = matched.Length * 100 + bestCount * 50 + matched.Count(
                    term -> headingFolded.Contains(term)
                ) * 20
                for term in matched {
                    score += Math.Min((folded.Length - folded.Replace(term, "").Length) / term.Length, 5)
                }
                let excerpt = string.Join(
                    "\n",
                    lines.Skip(Math.Max(start, hit - 2)).Take(Math.Min(end, hit + 18) - Math.Max(start, hit - 2))
                )
                matches.Add(
                    SearchHit(
                        matched.Length == terms.Count,
                        score,
                        JsonObject(){
                            ["path"] = relative,
                            ["section"] = heading,
                            ["line"] = hit + 1,
                            ["sha256"] = digest,
                            ["matchedTerms"] = Strings(matched),
                            ["missingTerms"] = Strings(terms.Where(term -> !folded.Contains(term))),
                            ["coverage"] = Math.Round(double(matched.Length) / terms.Count, 3),
                            ["excerpt"] = excerpt.Substring(0, Math.Min(600, excerpt.Length))
                        }
                    )
                )
            }
        }
        let exact = matches.Where(x -> x.Exact).ToArray()
        let frequencies = terms.ToDictionary(
            term -> term,
            term -> matches.Count(x -> x.Result["matchedTerms"]!!.AsArray().Any(t -> t.GetValue[string]() == term))
        )
        let selected = if exact.Length > 0 {
            exact
        } else {
            matches.ToArray()
        }
        let results = JsonArray()
        for item in selected
            .OrderByDescending(
            x -> x.Result["matchedTerms"]!!.AsArray().Sum(t -> 1000.0 / frequencies[t.GetValue[string]()])
        )
            .ThenByDescending(x -> x.Score)
            .ThenBy(x -> S(x.Result, "path"), StringComparer.Ordinal)
            .ThenBy(x -> I(x.Result, "line"))
            .Take(int32(limit)) {
            results.Add(item.Result)
        }
        return JsonObject(){
            ["source"] = root,
            ["queryTerms"] = Strings(terms),
            ["mode"] = if exact.Length > 0 {
                "exact"
            } else if matches.Count > 0 {
                "relaxed"
            } else {
                "none"
            },
            ["total"] = selected.Length,
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

        func Fold(text string) string -> CaseFold(Regex.Replace(text, "(?<=[a-z0-9])(?=[A-Z])", " "))

        func SearchTerms(value string) List[string] {
            let stop = HashSet[string](
                "a across an and are do does for from get how i in is of on the to with".Split(' ')
            )
            let result = List[string]()
            for match in Regex.Matches(Fold(value), "[A-Za-z0-9_]+") {
                var term = match.Value
                if stop.Contains(term) {
                    continue
                }
                if term.EndsWith("ies") && term.Length > 4 {
                    term = term.Substring(0, term.Length - 3) + "y"
                } else if term.EndsWith("s") && !term.EndsWith("ss") && term.Length > 3 {
                    term = term.Substring(0, term.Length - 1)
                }
                if !result.Contains(term) {
                    result.Add(term)
                }
            }
            return result
        }
    }
}
