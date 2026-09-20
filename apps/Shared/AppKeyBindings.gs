package GooSamples

import Goo
import System
import System.Collections.Generic

internal class AppKeyBindings {
    shared {
        internal func Editing(input PlatformInput?)[]KeyBinding {
            if input == nil {
                return []KeyBinding{}
            }
            let result = List[KeyBinding]()
            let mac = OperatingSystem.IsMacOS()
            for shift in[]bool{false, true} {
                let plain = KeyModifiers{Shift: shift}
                let primary = KeyModifiers{Shift: shift, Ctrl: !mac, Super: mac}
                let word = KeyModifiers{Shift: shift, Ctrl: !mac, Alt: mac}
                add(result, input, Key.Left, plain, TextCommandKind.MoveLeft, true)
                add(result, input, Key.Right, plain, TextCommandKind.MoveRight, true)
                add(result, input, Key.Home, plain, TextCommandKind.MoveLineStart, true)
                add(result, input, Key.End, plain, TextCommandKind.MoveLineEnd, true)
                add(result, input, Key.Backspace, plain, TextCommandKind.DeleteBackward, true)
                add(result, input, Key.Delete, plain, TextCommandKind.DeleteForward, true)
                add(result, input, Key.Left, word, TextCommandKind.MoveWordLeft, true)
                add(result, input, Key.Right, word, TextCommandKind.MoveWordRight, true)
                add(result, input, Key.Backspace, word, TextCommandKind.DeleteWordBackward, true)
                add(result, input, Key.Delete, word, TextCommandKind.DeleteWordForward, true)
                result.Add(
                    KeyBinding{
                        Key: Key.Tab,
                        Modifiers: plain,
                        Action: () -> {
                            input.MoveFocus(!shift)
                        }
                    }
                )
                add(result, input, Key.Enter, plain, TextCommandKind.Submit, false)
                add(result, input, Key.KeypadEnter, plain, TextCommandKind.Submit, false)
                add(result, input, Key.A, primary, TextCommandKind.SelectAll, false)
                add(result, input, Key.C, primary, TextCommandKind.Copy, false)
                add(result, input, Key.X, primary, TextCommandKind.Cut, false)
                add(result, input, Key.V, primary, TextCommandKind.Paste, false)
            }
            result.Add(
                KeyBinding{
                    Key: Key.Escape,
                    Action: () -> {
                        if !input.CancelDrag() && !input.CancelComposition() {
                            input.Execute(TextCommand{Kind: TextCommandKind.CancelEdit})
                        }
                    }
                }
            )
            return result.ToArray()
        }

        private func add(
            result List[KeyBinding],
            input PlatformInput,
            key Key,
            modifiers KeyModifiers,
            kind TextCommandKind,
            repeat bool
        ) {
            result.Add(
                KeyBinding{
                    Key: key,
                    Modifiers: modifiers,
                    Repeat: repeat,
                    Action: () -> {
                        input.Execute(TextCommand{Kind: kind, ExtendSelection: modifiers.Shift})
                    }
                }
            )
        }
    }
}
