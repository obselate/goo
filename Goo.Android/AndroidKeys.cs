using Android.Views;

namespace Goo.Android;

internal static class AndroidKeys
{
    internal static Key Map(Keycode key) => key switch
    {
        >= Keycode.A and <= Keycode.Z => Key.A + (key - Keycode.A),
        >= Keycode.Num0 and <= Keycode.Num9 => Key.Number0 + (key - Keycode.Num0),
        >= Keycode.F1 and <= Keycode.F12 => Key.F1 + (key - Keycode.F1),
        Keycode.Enter or Keycode.NumpadEnter => Key.Enter,
        Keycode.Del => Key.Backspace,
        Keycode.ForwardDel => Key.Delete,
        Keycode.Tab => Key.Tab,
        Keycode.Escape or Keycode.Back => Key.Escape,
        Keycode.DpadLeft => Key.Left,
        Keycode.DpadRight => Key.Right,
        Keycode.DpadUp => Key.Up,
        Keycode.DpadDown => Key.Down,
        Keycode.MoveHome => Key.Home,
        Keycode.MoveEnd => Key.End,
        Keycode.PageUp => Key.PageUp,
        Keycode.PageDown => Key.PageDown,
        Keycode.Space => Key.Space,
        Keycode.Comma => Key.Comma,
        Keycode.Period => Key.Period,
        Keycode.Minus => Key.Minus,
        Keycode.Equals => Key.Equal,
        Keycode.Semicolon => Key.Semicolon,
        Keycode.Apostrophe => Key.Apostrophe,
        Keycode.Slash => Key.Slash,
        Keycode.Backslash => Key.BackSlash,
        Keycode.LeftBracket => Key.LeftBracket,
        Keycode.RightBracket => Key.RightBracket,
        Keycode.Grave => Key.GraveAccent,
        _ => Key.Unknown,
    };
}
