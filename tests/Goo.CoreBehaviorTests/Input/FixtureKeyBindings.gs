package Goo

import System
import System.Collections.Generic

internal class FixtureKeyBindings {
  shared {
    internal func Install(root Node, input InputCoordinator, resolver Resolver) {
      bind(root, root, input, resolver)
    }

    private func bind(root Node, node Node, input InputCoordinator, resolver Resolver) {
      let bindings = List[KeyBinding]()
      for bits in 0 ... 16 {
        let modifiers = KeyModifiers{ Shift: (bits & 1) != 0, Ctrl: (bits & 2) != 0,
          Alt: (bits & 4) != 0, Super: (bits & 8) != 0 }
        let primary = InputPolicy.Mac ? modifiers.Super : modifiers.Ctrl
        let word = InputPolicy.Mac ? modifiers.Alt : modifiers.Ctrl
        let extend = modifiers.Shift
        bindings.Add(KeyBinding{ Key: Key.Tab, Modifiers: modifiers, Action: () -> {
          if node.Kind == NodeKind.Editor && !node.EditorReadOnly {
            input.ExecuteEditorCommand(root, resolver, TextCommand{
              Kind: extend ? TextCommandKind.Outdent : TextCommandKind.InsertTab })
          } else { input.MoveEditorFocus(root, resolver, !extend) }
        } })
        if node.Kind == NodeKind.Button {
          bindings.Add(KeyBinding{ Key: Key.Enter, Modifiers: modifiers,
            Action: () -> { input.BeginPress(resolver, node)
              hitActivate(root, node) },
            OnRelease: () -> { input.EndPress(root, resolver, node, false) } })
          bindings.Add(KeyBinding{ Key: Key.Space, Modifiers: modifiers,
            Action: () -> { input.BeginPress(resolver, node) },
            OnRelease: () -> { input.EndPress(root, resolver, node, true) } })
        }
        if node.Kind != NodeKind.Entry && node.Kind != NodeKind.Editor { continue }
        add(bindings, input, root, resolver, Key.Left, modifiers,
          word ? TextCommandKind.MoveWordLeft : TextCommandKind.MoveLeft, true)
        add(bindings, input, root, resolver, Key.Right, modifiers,
          word ? TextCommandKind.MoveWordRight : TextCommandKind.MoveRight, true)
        add(bindings, input, root, resolver, Key.Home, modifiers,
          primary ? TextCommandKind.MoveDocumentStart : TextCommandKind.MoveLineStart, true)
        add(bindings, input, root, resolver, Key.End, modifiers,
          primary ? TextCommandKind.MoveDocumentEnd : TextCommandKind.MoveLineEnd, true)
        add(bindings, input, root, resolver, Key.Backspace, modifiers,
          word ? TextCommandKind.DeleteWordBackward : TextCommandKind.DeleteBackward, true)
        add(bindings, input, root, resolver, Key.Delete, modifiers,
          word ? TextCommandKind.DeleteWordForward : TextCommandKind.DeleteForward, true)
        let multiline = node.Kind == NodeKind.Editor
        for key in []Key{ Key.Enter, Key.KeypadEnter } {
          bindings.Add(KeyBinding{ Key: key, Modifiers: modifiers, Action: () -> {
            input.ExecuteEditorCommand(root, resolver, TextCommand{
              Kind: multiline && !primary ? TextCommandKind.Insert : TextCommandKind.Submit, Text: "\n" })
          } })
        }
        bindings.Add(KeyBinding{ Key: Key.Escape, Modifiers: modifiers, Action: () -> {
          if !input.CancelEditorComposition(root) && !multiline {
            input.ExecuteEditorCommand(root, resolver, TextCommand{ Kind: TextCommandKind.CancelEdit })
          }
        } })
        if primary {
          add(bindings, input, root, resolver, Key.A, modifiers, TextCommandKind.SelectAll, false)
          add(bindings, input, root, resolver, Key.C, modifiers, TextCommandKind.Copy, false)
          add(bindings, input, root, resolver, Key.X, modifiers, TextCommandKind.Cut, false)
          add(bindings, input, root, resolver, Key.V, modifiers, TextCommandKind.Paste, false)
          add(bindings, input, root, resolver, Key.Z, modifiers,
            extend ? TextCommandKind.Redo : TextCommandKind.Undo, false)
          add(bindings, input, root, resolver, Key.Y, modifiers, TextCommandKind.Redo, false)
        }
        if multiline {
          add(bindings, input, root, resolver, Key.Up, modifiers, TextCommandKind.MoveUp, true)
          add(bindings, input, root, resolver, Key.Down, modifiers, TextCommandKind.MoveDown, true)
          add(bindings, input, root, resolver, Key.PageUp, modifiers, TextCommandKind.PageUp, true)
          add(bindings, input, root, resolver, Key.PageDown, modifiers, TextCommandKind.PageDown, true)
          add(bindings, input, root, resolver, Key.Insert, modifiers, TextCommandKind.ToggleOverwrite, false)
        }
      }
      InputCallbacks.Sync(node, Container{ KeyBindings: bindings.ToArray(),
        OnKeyDown: InputCallbacks.KeyDown(node), OnKeyUp: InputCallbacks.KeyUp(node),
        OnFocus: InputCallbacks.Focus(node), OnBlur: InputCallbacks.Blur(node),
        OnPointerEnter: InputCallbacks.PointerEnter(node), OnPointerLeave: InputCallbacks.PointerLeave(node) })
      InputMetadata.Refresh(node)
      for child in node.Children { bind(root, child, input, resolver) }
    }

    private func add(bindings List[KeyBinding], input InputCoordinator, root Node,
      resolver Resolver, key Key, modifiers KeyModifiers, kind TextCommandKind, repeat bool) {
        bindings.Add(KeyBinding{ Key: key, Modifiers: modifiers, Repeat: repeat, Action: () -> {
          input.ExecuteEditorCommand(root, resolver, TextCommand{ Kind: kind, ExtendSelection: modifiers.Shift })
        } })
      }
  }
}
