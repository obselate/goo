package GooGitWorkbench

import Goo
import System
import System.Collections.Generic

func WorkbenchButtonBindings(action Action)[]KeyBinding -> []KeyBinding{
    KeyBinding{Key: Key.Enter, Action: action},
    KeyBinding{Key: Key.Space, Action: action},
}

func WorkbenchEditorBindings(window Window)[]KeyBinding {
    let bindings = List[KeyBinding]()
    bindings.Add(editBinding(window, Key.Backspace, TextCommandKind.DeleteBackward))
    bindings.Add(editBinding(window, Key.Delete, TextCommandKind.DeleteForward))
    bindings.Add(editBinding(window, Key.Backspace, TextCommandKind.DeleteWordBackward, ctrl: true))
    bindings.Add(editBinding(window, Key.Delete, TextCommandKind.DeleteWordForward, ctrl: true))
    for shift in[]bool{false, true} {
        bindings.Add(editBinding(window, Key.Left, TextCommandKind.MoveLeft, shift: shift, extend: shift))
        bindings.Add(editBinding(window, Key.Right, TextCommandKind.MoveRight, shift: shift, extend: shift))
        bindings.Add(editBinding(window, Key.Up, TextCommandKind.MoveUp, shift: shift, extend: shift))
        bindings.Add(editBinding(window, Key.Down, TextCommandKind.MoveDown, shift: shift, extend: shift))
        bindings.Add(editBinding(window, Key.Home, TextCommandKind.MoveLineStart, shift: shift, extend: shift))
        bindings.Add(editBinding(window, Key.End, TextCommandKind.MoveLineEnd, shift: shift, extend: shift))
        bindings.Add(editBinding(window, Key.PageUp, TextCommandKind.PageUp, shift: shift, extend: shift))
        bindings.Add(editBinding(window, Key.PageDown, TextCommandKind.PageDown, shift: shift, extend: shift))
        bindings.Add(
            editBinding(window, Key.Left, TextCommandKind.MoveWordLeft, ctrl: true, shift: shift, extend: shift)
        )
        bindings.Add(
            editBinding(window, Key.Right, TextCommandKind.MoveWordRight, ctrl: true, shift: shift, extend: shift)
        )
        bindings.Add(
            editBinding(window, Key.Home, TextCommandKind.MoveDocumentStart, ctrl: true, shift: shift, extend: shift)
        )
        bindings.Add(
            editBinding(window, Key.End, TextCommandKind.MoveDocumentEnd, ctrl: true, shift: shift, extend: shift)
        )
        bindings.Add(
            KeyBinding{
                Key: Key.Tab,
                Modifiers: KeyModifiers{Shift: shift},
                Action: () -> {
                    window.PlatformInput.MoveFocus(!shift)
                },
            }
        )
        bindings.Add(
            KeyBinding{
                Key: Key.Enter,
                Modifiers: KeyModifiers{Shift: shift},
                Action: () -> {
                    if let editor = window.PlatformInput.Editor {
                        if editor.IsMultiline {
                            window.PlatformInput.Execute(TextCommand{Kind: TextCommandKind.Insert, Text: "\n"})
                        }
                    }
                },
            }
        )
    }
    bindings.Add(editBinding(window, Key.A, TextCommandKind.SelectAll, ctrl: true))
    bindings.Add(editBinding(window, Key.C, TextCommandKind.Copy, ctrl: true))
    bindings.Add(editBinding(window, Key.X, TextCommandKind.Cut, ctrl: true))
    bindings.Add(editBinding(window, Key.V, TextCommandKind.Paste, ctrl: true))
    bindings.Add(editBinding(window, Key.Z, TextCommandKind.Undo, ctrl: true))
    bindings.Add(editBinding(window, Key.Y, TextCommandKind.Redo, ctrl: true))
    bindings.Add(editBinding(window, Key.Z, TextCommandKind.Redo, ctrl: true, shift: true))
    return bindings.ToArray()
}

private func editBinding(
    window Window,
    key Key,
    command TextCommandKind,
    ctrl bool = false,
    shift bool = false,
    extend bool = false
) KeyBinding -> KeyBinding{
    Key: key,
    Modifiers: KeyModifiers{Ctrl: ctrl, Shift: shift},
    Repeat: true,
    Action: () -> {
        window.PlatformInput.Execute(TextCommand{Kind: command, ExtendSelection: extend})
    },
}
