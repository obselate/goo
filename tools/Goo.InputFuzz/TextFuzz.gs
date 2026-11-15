import Goo
import System
import System.Collections.Generic
import System.Globalization

class TextFuzz {
    shared {
        private let alphabet[]string = []string{"", "a", " b", "\n", "\r", "\r\n", "😀", "\u0301", "e\u0301", "👩‍💻"}

        private let moves[]TextCommandKind = []TextCommandKind{
            TextCommandKind.MoveLeft,
            TextCommandKind.MoveRight,
            TextCommandKind.MoveWordLeft,
            TextCommandKind.MoveWordRight,
            TextCommandKind.MoveUp,
            TextCommandKind.MoveDown,
            TextCommandKind.MoveLineStart,
            TextCommandKind.MoveLineEnd,
            TextCommandKind.MoveDocumentStart,
            TextCommandKind.MoveDocumentEnd,
            TextCommandKind.PageUp,
            TextCommandKind.PageDown,
        }

        func Run(input[]uint8) {
            let initial = "a😀 e\u0301\r\nlast\n"
            let document = TextDocument(initial)
            using let controller = TextEditorController(document)
            let history = List[string]{initial}
            var reference = initial
            var version = 0
            var cursor = 0
            var operation = 0
            var preedit string? = nil
            var compositionRange = TextRange{}
            Verify(document, controller, reference, operation)

            while cursor < input.Length && operation < 64 {
                let kind = int32(input[cursor]) % 30
                cursor++
                let a = cursor < input.Length ? int32(input[cursor]): 0
                if cursor < input.Length {
                    cursor++
                }
                let b = cursor < input.Length ? int32(input[cursor]): 0
                if cursor < input.Length {
                    cursor++
                }
                let c = cursor < input.Length ? int32(input[cursor]): 0
                if cursor < input.Length {
                    cursor++
                }
                operation++
                let text = alphabet[c % alphabet.Length]
                let starts = StringInfo.ParseCombiningCharacters(reference)
                let first = Boundary(starts, reference.Length, a)
                let second = Boundary(starts, reference.Length, b)
                let selected = controller.Selection
                var textRange = TextRange(
                    Math.Min(selected.Anchor.Offset, selected.Active.Offset),
                    Math.Abs(selected.Anchor.Offset - selected.Active.Offset)
                )
                var inserted = ""
                var edit = false

                if kind <= 5 || kind == 22 || kind == 23 {
                    controller.Execute(TextCommand{Kind: TextCommandKind.CancelComposition})
                    preedit = nil
                }
                controller.BreakUndoGroup()
                switch kind {
                    case 0, 1, 2 {
                        textRange = TextRange(Math.Min(first, second), Math.Abs(first - second))
                        if kind == 0 {
                            textRange = TextRange(first, 0)
                        }
                        inserted = kind == 1 ? "": text
                        document.Apply(TextChange(textRange, inserted))
                        edit = textRange.Length != 0 || inserted.Length != 0
                    }
                    case 3 {
                        inserted = text
                        controller.Execute(TextCommand{Kind: TextCommandKind.Insert, Text: text})
                        edit = text.Length != 0
                    }
                    case 4, 5 {
                        if textRange.Length == 0 {
                            let caret = selected.Active.Offset
                            var edge = kind == 4 ? 0: reference.Length
                            for start in starts {
                                if kind == 4 && start < caret {
                                    edge = start
                                }
                                if kind == 5 && start > caret {
                                    edge = start
                                    break
                                }
                            }
                            textRange = TextRange(Math.Min(caret, edge), Math.Abs(caret - edge))
                        }
                        controller.Execute(
                            TextCommand{
                                Kind: kind == 4
                                ? TextCommandKind.DeleteBackward: TextCommandKind.DeleteForward
                            }
                        )
                        edit = textRange.Length != 0
                    }
                    case 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17 {
                        controller.Execute(TextCommand{Kind: moves[kind - 6], ExtendSelection: (a & 1) != 0})
                    }
                    case 18 {
                        controller.Execute(TextCommand{Kind: TextCommandKind.SelectAll})
                        if controller.Selection.Anchor.Offset != 0
                        || controller.Selection.Active.Offset != reference.Length {
                            throw InvalidOperationException("Operation $operation: select-all range")
                        }
                    }
                    case 19, 20, 21 {
                        controller.Selection = TextSelection(
                            TextPosition(first, TextAffinity.Upstream),
                            TextPosition(second, TextAffinity.Downstream)
                        )
                    }
                    case 22 {
                        let expected = version > 0
                        if controller.Execute(TextCommand{Kind: TextCommandKind.Undo}) != expected {
                            throw InvalidOperationException("Operation $operation: undo availability")
                        }
                        if expected {
                            version--
                        }
                        reference = history[version]
                    }
                    case 23 {
                        let expected = version + 1 < history.Count
                        if controller.Execute(TextCommand{Kind: TextCommandKind.Redo}) != expected {
                            throw InvalidOperationException("Operation $operation: redo availability")
                        }
                        if expected {
                            version++
                        }
                        reference = history[version]
                    }
                    case 24, 25 {
                        if preedit == nil {
                            compositionRange = textRange
                            preedit = ""
                        }
                        if kind == 24 {
                            controller.Execute(TextCommand{Kind: TextCommandKind.BeginComposition})
                        } else {
                            preedit = text
                            controller.UpdateComposition(text, (a & 1) == 0 ? 0: text.Length, 0)
                        }
                    }
                    case 26, 28 {
                        textRange = preedit != nil ? compositionRange: textRange
                        inserted = kind == 28 ? text: (preedit ?? "")
                        if kind == 28 {
                            controller.CommitComposition(text)
                        } else {
                            controller.CommitComposition()
                        }
                        preedit = nil
                        edit = textRange.Length != 0 || inserted.Length != 0
                    }
                    case 27 {
                        controller.Execute(TextCommand{Kind: TextCommandKind.CancelComposition})
                        preedit = nil
                    }
                    case _ {
                        let query = TextRange(Math.Min(first, second), Math.Abs(first - second))
                        if document.GetText(query) != reference.Substring(query.Start, query.Length) {
                            throw InvalidOperationException("Operation $operation: queried text range")
                        }
                    }
                }
                if edit {
                    reference = reference.Remove(textRange.Start, textRange.Length).Insert(textRange.Start, inserted)
                    if version + 1 < history.Count {
                        history.RemoveRange(version + 1, history.Count - version - 1)
                    }
                    history.Add(reference)
                    version++
                }
                Verify(document, controller, reference, operation)
                if document.CanUndo != (version > 0) || document.CanRedo != (version + 1 < history.Count) {
                    throw InvalidOperationException("Operation $operation: history availability")
                }
                if (controller.Composition != nil) != (preedit != nil)
                ||
                    (
                    preedit != nil &&
                        (
                        controller.Composition!!.Text != preedit
                        || controller.Composition!!.Range != compositionRange
                    )
                ) {
                    throw InvalidOperationException("Operation $operation: transient composition")
                }
            }
            let finalVersion = version
            controller.Execute(TextCommand{Kind: TextCommandKind.CancelComposition})
            while version > 0 {
                if !controller.Execute(TextCommand{Kind: TextCommandKind.Undo}) {
                    throw InvalidOperationException("Operation $operation: undo to initial text")
                }
                version--
                Verify(document, controller, history[version], ++ operation)
            }
            while version + 1 < history.Count {
                if !controller.Execute(TextCommand{Kind: TextCommandKind.Redo}) {
                    throw InvalidOperationException("Operation $operation: redo to final text")
                }
                version++
                Verify(document, controller, history[version], ++ operation)
            }
            while version > finalVersion {
                controller.Execute(TextCommand{Kind: TextCommandKind.Undo})
                version--
                Verify(document, controller, history[version], ++ operation)
            }
            if document.GetText() != reference {
                throw InvalidOperationException("Operation $operation: history round trip")
            }
        }

        private func Boundary(starts[]int32, length int32, value int32) int32 ->
        value % (starts.Length + 1) == starts.Length ? length: starts[value % (starts.Length + 1)]

        private func Verify(document TextDocument, controller TextEditorController, reference string, operation int32) {
            if document.GetText() != reference || document.Length != reference.Length {
                throw InvalidOperationException("Operation $operation: reference text")
            }
            let starts = StringInfo.ParseCombiningCharacters(reference)
            for offset in[]int32{controller.Selection.Anchor.Offset, controller.Selection.Active.Offset} {
                if offset < 0 || offset > reference.Length
                || (offset != reference.Length && Array.IndexOf(starts, offset) < 0) {
                    throw InvalidOperationException("Operation $operation: selection grapheme boundary at $offset")
                }
            }
            var line = 0
            var start = 0
            var offset = 0
            while offset <= reference.Length {
                if (offset == reference.Length || !Char.IsLowSurrogate(reference[offset]))
                && document.GetLineIndex(offset) != line {
                    throw InvalidOperationException("Operation $operation: line index at $offset")
                }
                let ending = offset == reference.Length || reference[offset] == '\r' || reference[offset] == '\n'
                if ending {
                    let expected = TextRange(start, offset - start)
                    if line >= document.LineCount || document.GetLineRange(line) != expected
                    || document.GetLineText(line) != reference.Substring(start, offset - start) {
                        throw InvalidOperationException("Operation $operation: line $line range")
                    }
                    if offset == reference.Length {
                        break
                    }
                    if reference[offset] == '\r' && offset + 1 < reference.Length && reference[offset + 1] == '\n' {
                        if document.GetLineIndex(offset + 1) != line {
                            throw InvalidOperationException("Operation $operation: CRLF line index")
                        }
                        offset++
                    }
                    line++
                    start = offset + 1
                }
                offset++
            }
            if document.LineCount != line + 1 || document.GetLineIndex(reference.Length) != line {
                throw InvalidOperationException("Operation $operation: line count")
            }
        }
    }
}
