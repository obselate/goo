import Goo.RichText
import System
import System.Text

let latin = RichTextCodec.Read(
    "text/rtf",
    Encoding.ASCII.GetBytes("{\\rtf1\\ansi\\ansicpg1252 caf\\'e9 \\uc2\\u233??}")
)
if latin.Status != RichTextStatus.Success || latin.Fragment.Text != "café é" {
    throw InvalidOperationException("RTF byte decoding or Unicode fallback failed.")
}
let cyrillic = RichTextCodec.Read(
    "text/rtf",
    Encoding.ASCII.GetBytes(
        "{\\rtf1\\ansi\\ansicpg1252{\\fonttbl{\\f0\\fcharset204 Arial;}}\\f0 \\'cf\\'f0\\'e8\\'e2\\'e5\\'f2}"
    )
)
if cyrillic.Status != RichTextStatus.Success || cyrillic.Fragment.Text != "Привет" {
    throw InvalidOperationException("RTF font charset decoding failed.")
}
let unsupported = RichTextCodec.Read(
    "text/rtf",
    Encoding.ASCII.GetBytes("{\\rtf1{\\fonttbl{\\f0\\fcharset2 Symbol;}}\\f0 \\'41}")
)
if unsupported.Status != RichTextStatus.UnsupportedContent {
    throw InvalidOperationException("Unsupported RTF font charset was not rejected.")
}
Console.WriteLine("Trimmed RTF byte decoding passed.")
