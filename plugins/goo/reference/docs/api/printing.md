# Printing API

Source: [`Goo/Printing`](https://github.com/obselate/goo/tree/main/Goo/Printing)

## `IPrintDocument`


Supplies fresh page cells from a fixed document snapshot on the Goo owner thread.

### `CreatePage(int32,Printing.PrintPageSettings)`

Creates a full-paper page, including its margins. Index is zero-based and pages can be requested again.

### `Paginate(Printing.PrintPageSettings)`

Recomputes page breaks for paper settings. Page count must be positive on Ready.

## `PrintLayoutResult`


Pagination Status, PageCount and optional Error detail for the chosen paper settings.

## `PrintLayoutStatus`


Reports document pagination independently of export or spooler results.

### `Cancelled`

The app cancelled pagination.

### `Failed`

The app could not paginate the document.

### `Ready`

The document can create the stated pages.

## `PrintPageSettings`


Physical WidthPoints and HeightPoints, margins LeftPoints, TopPoints, RightPoints and BottomPoints, and raster resolution DpiX and DpiY in dots per inch.

## `PrintResult`


A print Status with an optional native JobId and bounded Error detail.

## `PrintStatus`


Reports export completion or native submission. Submission does not mean physical printing finished.

### `BudgetExceeded`

A page exceeds the memory limit.

### `Busy`

The owner or renderer is serving another operation.

### `Cancelled`

The user or caller cancelled the operation.

### `DeviceLost`

The rendering device was lost.

### `Exported`

The complete PDF was written to the supplied stream.

### `Failed`

Rendering, export or submission failed.

### `NotReady`

The owner or renderer is not ready.

### `Submitted`

The native print service accepted the document.

### `Unsupported`

The platform print service or requested rendering is unavailable.

## `Printing`


Exports raster PDF pages or submits them through the platform print dialog.

### `ExportPdfAsync(Window,Printing.IPrintDocument,Printing.PrintPageSettings,System.IO.Stream,System.Threading.CancellationToken)`

Writes a complete raster PDF to an empty writable stream. The caller owns the stream.

### `ShowDialogAsync(Window,Printing.IPrintDocument,string,System.Threading.CancellationToken)`

Shows the OS print dialog. Keep the Goo owner pumping until native work completes.
