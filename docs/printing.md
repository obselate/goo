# Printing

```csharp
using Goo;
using Goo.Printing;

var result = await Printing.ShowDialogAsync(window, new Report("Hello"), "Report");

sealed class Report(string text) : IPrintDocument
{
    public PrintLayoutResult Paginate(PrintPageSettings settings) =>
        new(PrintLayoutStatus.Ready, 1);

    public Cell CreatePage(int index, PrintPageSettings settings) =>
        new Page(text, settings);
}

sealed class Page(string text, PrintPageSettings settings) : Cell
{
    public override Blob Build()
    {
        var root = new Container
        {
            Padding = new Edges(settings.TopPoints * 96 / 72,
                settings.RightPoints * 96 / 72, settings.BottomPoints * 96 / 72,
                settings.LeftPoints * 96 / 72)
        };
        root.Add(new Text { Content = text, FontSize = 16 });
        return root;
    }
}
```

Reference `Goo`. Keep the `Goo.Printing` namespace import. Call from the window thread and keep pumping Goo while awaiting the result.

| Platform | Print dialog |
| --- | --- |
| Windows | Windows print dialog and GDI spooler |
| macOS | System print panel and PDFKit |
| Linux Wayland | XDG desktop print portal and system `libdbus-1.so.3` |
| Android | `Goo.Android` and `PrintManager` |

## PDF export

```csharp
using var file = File.Create("report.pdf");
var paper = new PrintPageSettings(595.28, 841.89, 36, 36, 36, 36);
var result = await Printing.ExportPdfAsync(window, new Report("Hello"), paper, file);
```

The stream must be writable and empty. The caller owns it. Cancellation or failure can leave a partial file.

## Page contract

- Capture a fixed document snapshot before printing.
- Paper sizes and margins use points. Page cells use 96 logical units per inch.
- `Paginate` computes page breaks for the accepted settings. Native UI can call it again.
- `CreatePage` returns a fresh full-paper cell, including margins. Page indexes start at zero.
- Load images before printing. Each page uses the existing Vulkan renderer without resizing the visible window.
- Output is raster PDF or a raster spooler page. Text is not selectable. Fonts need no PDF embedding.
- Output pixels and new GPU allocations have a 128 MiB limit per page. One CPU page buffer is reused.
- `Submitted` means the native print service accepted the job. It does not mean paper left the printer.
- Closing the owner cancels the operation. Native submission can already be complete.

## Android

```csharp
var printing = new AndroidPrinting(activity);
var result = await printing.ShowDialogAsync(window, new Report("Hello"), "Report");
```

Call from the Activity main thread. Android controls paper, page ranges and the destination.
Keep the Activity and Goo window alive until completion. Pages render through an independent session while the Activity is paused.
