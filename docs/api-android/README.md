# Goo.Android API

Source: [`Goo.Android`](../../Goo.Android)

## `AndroidDocuments`


Owns the Activity's SAF picker, content URI streams and explicit persisted grants.

### `OpenReadAsync(System.Uri,System.Threading.CancellationToken)`

Opens a caller-owned content stream off the UI thread. A tree root has no byte stream.

- `uri`: The content URI to read. No path conversion occurs.
- `cancellation`: Cancels before opening or discards a stream opened after cancellation.

Returns: An explicit result and, on success, a caller-owned stream.

### `OpenWriteAsync(System.Uri,System.Threading.CancellationToken)`

Opens whole-document replacement with truncation off the UI thread.

- `uri`: The writable content URI. A tree root has no byte stream.
- `cancellation`: Cancels before opening or discards a stream opened after cancellation.

Returns: An explicit result and, on success, a caller-owned stream.

### `PersistAccess(System.Uri,Android.DocumentAccess)`

Explicitly persists URI access that the provider granted as persistable.

- `uri`: The granted content URI.
- `access`: The returned Read and Write bits to retain.

Returns: Success or an explicit grant failure. No persistence is automatic.

### `ReleaseAccess(System.Uri,Android.DocumentAccess)`

Releases the specified persisted URI access without deleting the document.

- `uri`: The persisted content URI.
- `access`: The persisted Read and Write bits to release.

Returns: Success or an explicit grant failure.

### `ShowPickerAsync(FileDialogKind,Android.DocumentPickerOptions,System.Threading.CancellationToken)`

Launches the system document picker on the Activity's main thread.

- `kind`: OpenFile, SaveFile or Folder. SaveFile creates a new document.
- `options`: MIME filters, content URI location and requested access.
- `cancellation`: Cancels this request without persisting its URI grants.

Returns: Owned URI references and the access flags actually returned by Android.

## `DocumentAccess`


Access requested or granted for an Android document URI.

### `None`

No document access.

### `Read`

Read document contents.

### `Write`

Replace document contents.

## `DocumentOperationResult`


The outcome of an explicit document grant change.

### `Error`

Gets a bounded failure reason or an empty string.

### `Status`

Gets the grant-change outcome.

## `DocumentPickerOptions`


Hints for the Android system document picker.

### `new`

Creates default document picker hints.

### `Access`

Gets requested access. The default is Read.

### `InitialUri`

Gets an optional content URI for the initial location.

### `MimeTypes`

Gets MIME filters. The default accepts all document types.

### `Multiple`

Gets whether an open picker may return multiple documents.

### `SuggestedName`

Gets the suggested display name for a newly created document.

## `DocumentPickerResult`


An owned URI selection and the access flags returned by the picker.

### `CanPersist`

Gets whether the returned grant supports explicit persistence.

### `Error`

Gets a bounded failure reason or an empty string.

### `GrantedAccess`

Gets returned read and write grant flags, not requested flags.

### `Status`

Gets the picker outcome.

### `Uris`

Gets immutable content URI references. No filesystem paths are returned.

## `DocumentStatus`


The outcome of document stream or grant access.

### `Cancelled`

The operation was cancelled.

### `Denied`

The provider denied access.

### `Failed`

The provider operation failed.

### `NotFound`

The document was not found.

### `Success`

The operation completed.

### `Unsupported`

The URI or operation is not supported.

## `DocumentStreamResult`


A caller-owned document stream or an explicit access failure.

### `Error`

Gets a bounded failure reason or an empty string.

### `Status`

Gets the stream-open outcome.

### `Stream`

Gets the caller-owned stream only when Status is Success.

## `GooActivity`


Hosts a Goo window and forwards Android activity lifecycle and activation events.

### `OnContextMenuClosed(Android.Views.IMenu)`

Completes the active native context menu after Android closes it.

### `OnRequestPermissionsResult(int32,string[],Android.Content.PM.Permission[])`

Receives native permission results and forwards pending Goo requests.

- `requestCode`: The native permission request code.
- `permissions`: The requested Android permission names.
- `grantResults`: The native result for each permission.

### `Documents`

Gets the Activity-owned system document picker and content URI stream service.

### `LastActivationStatus`

Gets the result of forwarding the most recent Android activation.

### `SavedInstanceState`

Gets the saved activity state passed to CreateWindow, or null for a fresh activity.

## `GooView`


Presents a Goo window on an Android surface and forwards input and accessibility events.

### `FrameDemandChanged`

Reports changes in immediate frame demand on the Android UI thread.

### `DismissKeyboardOnSubmit`

Gets or sets whether the Done editor action hides the software keyboard.

### `HasFrameDemand`

Gets whether a frame is pending or another immediate frame is needed.

## `Resource`


Android Resource Designer class. Exposes the Android Resource designer assembly into the project Namespace.

## `AndroidNotifications`


Opens Android notifications. Calls must run on the activity's UI thread.

### `Open(Android.GooActivity,NotificationOptions)`

Creates the channel and a service bound to the activity, without requesting permission.

- `owner`: The Goo activity that receives permission results and notification taps.
- `options`: The channel ID, channel name and installed drawable small-icon resource name.

Returns: An owned service on Success, or an identity or native failure.

## `AndroidPrinting`


Shows Android's print UI from an Activity and writes requested pages as raster PDF.

### `new(Android.App.Activity)`

Creates an optional adapter for the Activity that owns the Goo view.

### `ShowDialogAsync(Window,Printing.IPrintDocument,string,System.Threading.CancellationToken)`

Starts printing on the Android main thread. Keep the Activity and Goo owner alive until completion.

## `AndroidSpellingService`


Uses the user-enabled Android spell service. Submit only text that the app permits the service to read.

### `new(Android.Content.Context)`

Creates an adapter using the application context. Requests must start on the Android main thread.

### `CheckAsync(TextSnapshot,TextRange,string,System.Threading.CancellationToken)`

Checks a snapshot with an explicit locale and absolute UTF-16 result ranges.

### `SuggestAsync(TextSnapshot,TextRange,string,System.Threading.CancellationToken)`

Gets suggestions for the supplied word through the same sentence-suggestion API.
