# Printing API

Generated from `Goo.Android.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo.Android/Printing`](../../Goo.Android/Printing)

## `AndroidPrinting`

Source:

- [`AndroidPrinting.gs`](../../Goo.Android/Printing/AndroidPrinting.gs)

Shows Android's print UI from an Activity and writes requested pages as raster PDF.

### `new(Android.App.Activity)`

Creates an optional adapter for the Activity that owns the Goo view.

### `ShowDialogAsync(Window,Printing.IPrintDocument,string,System.Threading.CancellationToken)`

Starts printing on the Android main thread. Keep the Activity and Goo owner alive until completion.
