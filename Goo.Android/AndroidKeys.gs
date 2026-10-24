package Goo.Android

import Android.Views
import Goo

internal shared class AndroidKeys {
    internal func Map(key Keycode) Key -> switch key {
        case >= Keycode.A and <= Keycode.Z: Key.A + (key - Keycode.A)
        case >= Keycode.Num0 and <= Keycode.Num9: Key.Number0 + (key - Keycode.Num0)
        case >= Keycode.F1 and <= Keycode.F12: Key.F1 + (key - Keycode.F1)
        case Keycode.Enter or Keycode.NumpadEnter: Key.Enter
        case Keycode.Del: Key.Backspace
        case Keycode.ForwardDel: Key.Delete
        case Keycode.Tab: Key.Tab
        case Keycode.Escape or Keycode.Back: Key.Escape
        case Keycode.DpadLeft: Key.Left
        case Keycode.DpadRight: Key.Right
        case Keycode.DpadUp: Key.Up
        case Keycode.DpadDown: Key.Down
        case Keycode.MoveHome: Key.Home
        case Keycode.MoveEnd: Key.End
        case Keycode.PageUp: Key.PageUp
        case Keycode.PageDown: Key.PageDown
        case Keycode.Space: Key.Space
        case Keycode.Comma: Key.Comma
        case Keycode.Period: Key.Period
        case Keycode.Minus: Key.Minus
        case Keycode.Equals: Key.Equal
        case Keycode.Semicolon: Key.Semicolon
        case Keycode.Apostrophe: Key.Apostrophe
        case Keycode.Slash: Key.Slash
        case Keycode.Backslash: Key.BackSlash
        case Keycode.LeftBracket: Key.LeftBracket
        case Keycode.RightBracket: Key.RightBracket
        case Keycode.Grave: Key.GraveAccent
        default: Key.Unknown
    }
}
