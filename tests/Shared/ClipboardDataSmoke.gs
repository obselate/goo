package GooClipboardFixture

import System
import System.IO
import System.Text
import System.Threading
import System.Runtime.ExceptionServices
import Goo

func RunClipboardDataSmoke() {
    if OperatingSystem.IsWindows() && Thread.CurrentThread.GetApartmentState() != ApartmentState.STA {
        var failure Exception?
        let thread = Thread(() -> {
            try { RunClipboardDataSmoke() }
            catch (error Exception) { failure = error }
        })
        thread.IsBackground = true
        thread.SetApartmentState(ApartmentState.STA)
        thread.Start()
        if !thread.Join(TimeSpan.FromMinutes(2)) { throw InvalidOperationException("Windows clipboard smoke timed out") }
        if let error = failure { ExceptionDispatchInfo.Capture(error).Throw() }
        return
    }

    let window = Window{ Title: "Goo MIME clipboard contract", Width: 240, Height: 120, Root: Cell{} }
    let path = Environment.ProcessPath!!
    try {
        window.Open()
        window.Pump(0.0)
        let source = Encoding.UTF8.GetBytes("clipboard plain")
        let plain = TransferRepresentation("text/plain;charset=utf-8", ReadOnlyMemory[uint8](source))
        let html = TransferRepresentation("text/html", ReadOnlyMemory[uint8](Encoding.UTF8.GetBytes("<b>clipboard plain</b>")))
        let rtf = TransferRepresentation("text/rtf", ReadOnlyMemory[uint8](Encoding.UTF8.GetBytes("{\\rtf1 clipboard plain}")))
        let png = TransferRepresentation("image/png", ReadOnlyMemory[uint8](File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "local-rgba.png"))))
        let empty = TransferRepresentation("application/x-goo-empty", ReadOnlyMemory[uint8].Empty)
        let zero = TransferRepresentation("application/x-goo-zero", ReadOnlyMemory[uint8]([]uint8{0}))
        let secondEmpty = TransferRepresentation("application/x-goo-empty-two", ReadOnlyMemory[uint8].Empty)
        let data = TransferData([]TransferRepresentation{plain, html, rtf, png, empty, zero, secondEmpty}, []Uri{Uri(path)})
        source[0] = uint8(120)
        let written = window.WriteClipboardAsync(data, ClipboardIntent.Cut).GetAwaiter().GetResult()
        ClipboardDataRequire(written.Status == DataTransferStatus.Success, "MIME clipboard publication failed: " + written.Error)
        let types = []string{"text/plain;charset=utf-8", "text/html", "text/rtf", "image/png", "application/x-goo-empty", "application/x-goo-zero", "application/x-goo-empty-two", "text/uri-list"}
        let read = window.ReadClipboardDataAsync(types).GetAwaiter().GetResult()
        ClipboardDataRequire(read.Status == ClipboardReadStatus.Success, "MIME clipboard read failed: " + read.Error)
        ClipboardDataRequire(read.Intent == ClipboardIntent.Cut && read.Data.Uris.Count == 1 && read.Data.Uris[0].LocalPath == path,
            "Clipboard file selection or Cut marker changed")
        ClipboardDataRequire(read.Data.Representations.Count == data.Representations.Count, "A MIME alternative was silently discarded")
        for i in 0 ... data.Representations.Count {
            let expected = data.Representations[i]
            let actual = read.Data.Representations[i]
            ClipboardDataRequire(actual.ContentType == expected.ContentType && actual.Bytes.Span.SequenceEqual(expected.Bytes.Span),
                "Clipboard representation changed: " + expected.ContentType)
        }
        ClipboardDataRequire(Encoding.UTF8.GetString(read.Data.Representations[0].Bytes.Span) == "clipboard plain",
            "Caller mutation changed published clipboard bytes")
        if Environment.GetEnvironmentVariable("GOO_CLIPBOARD_PRESERVE") != "1" {
            window.SetClipboardText("replacement")
            ClipboardDataRequire(Encoding.UTF8.GetString(read.Data.Representations[0].Bytes.Span) == "clipboard plain",
                "Clipboard replacement invalidated owned snapshot bytes")
        }
        let missing = window.ReadClipboardDataAsync([]string{"application/x-goo-missing"}).GetAwaiter().GetResult()
        ClipboardDataRequire(missing.Status == ClipboardReadStatus.Empty && missing.Data.Representations.Count == 0,
            "An absent MIME type was not reported Empty")
        Console.WriteLine("Clipboard MIME alternatives, PNG, file Cut, empty representation and owned snapshot passed")
    } finally {
        if window.IsOpen {
            window.RequestClose()
            while window.IsOpen { window.Pump(0.0) }
        }
    }
}

func ClipboardDataRequire(value bool, message string) {
    if !value { throw InvalidOperationException(message) }
}
