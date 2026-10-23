package GooAsyncReadbackSmoke

import System
import System.IO
import System.Text
import Goo

func RunClipboardDataSmoke() {
    let window = Window{ Title: "Goo MIME clipboard contract", Width: 240, Height: 120, Root: ReadbackSmokeCell{} }
    let path = Path.Combine(Path.GetTempPath(), "goo-clipboard-" + Guid.NewGuid().ToString("N") + ".txt")
    File.WriteAllText(path, "clipboard reference")
    try {
        window.Open()
        WindowReadbackTestFixture.ForceRender(window, 0.0)
        let source = Encoding.UTF8.GetBytes("clipboard plain")
        let plain = TransferRepresentation("text/plain;charset=utf-8", ReadOnlyMemory[uint8](source))
        let html = TransferRepresentation("text/html", ReadOnlyMemory[uint8](Encoding.UTF8.GetBytes("<b>clipboard plain</b>")))
        let rtf = TransferRepresentation("text/rtf", ReadOnlyMemory[uint8](Encoding.UTF8.GetBytes("{\\rtf1 clipboard plain}")))
        let png = TransferRepresentation("image/png", ReadOnlyMemory[uint8](File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "local-rgba.png"))))
        let empty = TransferRepresentation("application/x-goo-empty", ReadOnlyMemory[uint8].Empty)
        let data = TransferData([]TransferRepresentation{plain, html, rtf, png, empty}, []Uri{Uri(path)})
        source[0] = uint8(120)
        let written = window.WriteClipboardAsync(data, ClipboardIntent.Cut).GetAwaiter().GetResult()
        Require(written.Status == DataTransferStatus.Success, "MIME clipboard publication failed: " + written.Error)
        let types = []string{"text/plain;charset=utf-8", "text/html", "text/rtf", "image/png", "application/x-goo-empty", "text/uri-list"}
        let read = window.ReadClipboardDataAsync(types).GetAwaiter().GetResult()
        Require(read.Status == ClipboardReadStatus.Success, "MIME clipboard read failed: " + read.Error)
        Require(read.Intent == ClipboardIntent.Cut && read.Data.Uris.Count == 1 && read.Data.Uris[0].LocalPath == path,
            "Clipboard file selection or Cut marker changed")
        Require(read.Data.Representations.Count == 5, "A MIME alternative was silently discarded")
        for i in 0 ... data.Representations.Count {
            let expected = data.Representations[i]
            let actual = read.Data.Representations[i]
            Require(actual.ContentType == expected.ContentType && actual.Bytes.Span.SequenceEqual(expected.Bytes.Span),
                "Clipboard representation changed: " + expected.ContentType)
        }
        Require(Encoding.UTF8.GetString(read.Data.Representations[0].Bytes.Span) == "clipboard plain",
            "Caller mutation changed published clipboard bytes")
        window.SetClipboardText("replacement")
        Require(Encoding.UTF8.GetString(read.Data.Representations[0].Bytes.Span) == "clipboard plain",
            "Clipboard replacement invalidated owned snapshot bytes")
        let missing = window.ReadClipboardDataAsync([]string{"application/x-goo-missing"}).GetAwaiter().GetResult()
        Require(missing.Status == ClipboardReadStatus.Empty && missing.Data.Representations.Count == 0,
            "An absent MIME type was not reported Empty")
        Console.WriteLine("Clipboard MIME alternatives, PNG, file Cut, empty representation and owned snapshot passed")
    } finally {
        if window.IsOpen { window.Close() }
        File.Delete(path)
    }
}
