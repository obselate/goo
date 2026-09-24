package GooGitWorkbench

import System
import System.Collections.Generic
import System.IO
import TextMateSharp.Grammars
import TextMateSharp.Registry
import TextMateSharp.Themes
import TextMateSharp.Internal.Themes
import TextMateSharp.Internal.Types

class SyntaxRegistryOptions : IRegistryOptions {
    /// Supplies an empty theme for scope-based foreground mapping.
    public func GetDefaultTheme() IRawTheme -> ThemeRaw()

    /// No external themes are loaded.
    public func GetTheme(name string) IRawTheme? -> nil

    /// Grammars are loaded directly from the bundled files.
    public func GetGrammar(name string) IRawGrammar? -> nil

    /// The bundled grammars use no cross-grammar injections.
    public func GetInjections(name string) ICollection[string]? -> nil
}

class SyntaxHighlighter {
    shared {
        private let registry Registry = Registry(SyntaxRegistryOptions())
        private let grammars Dictionary[string, IGrammar] = Dictionary[string, IGrammar]()

        func CanHighlight(rows List[DiffRow], path string) bool {
            if grammarName(path) != "" {
                return true
            }
            for row in rows {
                if row.Kind == DiffRowKind.File && grammarName(row.Content) != "" {
                    return true
                }
            }
            return false
        }

        func Apply(
            rows List[DiffRow],
            path string,
            firstRows Action[List[DiffRow]]? = nil,
            cancelled Func[bool]? = nil
        ) {
            lock registry {
                var grammar = loadGrammar(path)
                var oldState IStateStack?
                var newState IStateStack?
                for index in 0 ... rows.Count {
                    if index % 32 == 0 && cancelled?.Invoke() == true {
                        return
                    }
                    if index == 64 {
                        firstRows?.Invoke(List[DiffRow](rows))
                    }
                    let row = rows[index]
                    if row.Kind == DiffRowKind.File {
                        grammar = loadGrammar(row.Content)
                        oldState = nil
                        newState = nil
                        continue
                    }
                    if row.Kind == DiffRowKind.Hunk {
                        oldState = nil
                        newState = nil
                        continue
                    }
                    if row.Kind == DiffRowKind.Note {
                        continue
                    }
                    guard let active = grammar else {
                        continue
                    }
                    try {
                        let previous = if row.Kind == DiffRowKind.Removed {
                            oldState
                        } else {
                            newState
                        }
                        guard let result = active.TokenizeLine(
                            row.Content,
                            previous,
                            TimeSpan.FromMilliseconds(100)
                        ) else {
                            grammar = nil
                            continue
                        }
                        if row.Kind == DiffRowKind.Removed {
                            oldState = result.RuleStack
                        } else {
                            if row.Kind == DiffRowKind.Context {
                                oldState = if Object.Equals(oldState, newState) {
                                    result.RuleStack
                                } else {
                                    active.TokenizeLine(row.Content, oldState, TimeSpan.FromMilliseconds(100))
                                        ?.RuleStack
                                }
                            }
                            newState = result.RuleStack
                        }
                        rows[index] = row with{Syntax = spans(result, row.Content.Length)}
                    } catch (error Exception) {
                        Console.Error.WriteLine("Syntax highlighting unavailable: " + error.Message)
                        grammar = nil
                    }
                }
            }
        }

        private func loadGrammar(path string) IGrammar? {
            let name = grammarName(path)
            if name == "" {
                return nil
            }
            if grammars.TryGetValue(name, out var grammar) {
                return grammar
            }
            try {
                guard let loaded = registry.LoadGrammarFromPathSync(
                    Path.Combine(AppContext.BaseDirectory, "Assets", "Grammars", name + ".tmLanguage.json"),
                    0,
                    Dictionary[string, int32]()
                ) else {
                    return nil
                }
                grammars[name] = loaded
                return loaded
            } catch (error Exception) {
                Console.Error.WriteLine("Could not load $name grammar: " + error.Message)
                return nil
            }
        }

        private func grammarName(path string) string -> switch Path.GetExtension(path).ToLowerInvariant() {
            case ".gs": "gsharp"
            case ".cs": "csharp"
            case ".csx": "csharp"
            case ".cake": "csharp"
            default: ""
        }

        private func spans(result ITokenizeLineResult, length int32)[]SyntaxSpan {
            let values = List[SyntaxSpan]()
            guard let tokens = result.Tokens else {
                return values.ToArray()
            }
            for candidate in tokens {
                guard let token = candidate else {
                    continue
                }
                guard let scopes = token.Scopes else {
                    continue
                }
                let kind = tokenKind(scopes)
                let start = Math.Min(token.StartIndex, length)
                let end = Math.Min(token.EndIndex, length)
                if kind == SyntaxKind.Plain || end <= start {
                    continue
                }
                if values.Count > 0 {
                    let last = values[values.Count - 1]
                    if last.Kind == kind && last.Start + last.Length == start {
                        values[values.Count - 1] = SyntaxSpan(last.Start, end - last.Start, kind)
                        continue
                    }
                }
                values.Add(SyntaxSpan(start, end - start, kind))
            }
            return values.ToArray()
        }

        private func tokenKind(scopes List[string]) SyntaxKind {
            var index = scopes.Count - 1
            while index >= 0 {
                let tokenScope = scopes[index]
                index--
                if tokenScope.StartsWith("comment.") {
                    return SyntaxKind.Comment
                }
                if tokenScope.StartsWith("keyword.") || tokenScope.StartsWith("storage.") {
                    return SyntaxKind.Keyword
                }
                if tokenScope.StartsWith("string.") {
                    return SyntaxKind.String
                }
                if tokenScope.StartsWith("constant.") {
                    return SyntaxKind.Constant
                }
                if tokenScope.StartsWith("entity.name.function.") || tokenScope.StartsWith("support.function.") {
                    return SyntaxKind.Function
                }
                if tokenScope.StartsWith("entity.name.type.") || tokenScope.StartsWith("support.type.") {
                    return SyntaxKind.Type
                }
            }
            return SyntaxKind.Plain
        }
    }
}
