# Goo.Android API

Generated from `Goo.Android.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo.Android`](../../Goo.Android)

## `AndroidDocuments`

Source:

- [`AndroidDocuments.gs`](../../Goo.Android/AndroidDocuments.gs)

<summary>Owns the Activity's SAF picker, content URI streams and explicit persisted grants.</summary>

### `OpenReadAsync(System.Uri,System.Threading.CancellationToken)`

<summary>Opens a caller-owned content stream off the UI thread. A tree root has no byte stream.</summary> <param name="uri">The content URI to read. No path conversion occurs.</param> <param name="cancellation">Cancels before opening or discards a stream opened after cancellation.</param> <returns>An explicit result and, on success, a caller-owned stream.</returns>

### `OpenWriteAsync(System.Uri,System.Threading.CancellationToken)`

<summary>Opens whole-document replacement with truncation off the UI thread.</summary> <param name="uri">The writable content URI. A tree root has no byte stream.</param> <param name="cancellation">Cancels before opening or discards a stream opened after cancellation.</param> <returns>An explicit result and, on success, a caller-owned stream.</returns>

### `PersistAccess(System.Uri,Android.DocumentAccess)`

<summary>Explicitly persists URI access that the provider granted as persistable.</summary> <param name="uri">The granted content URI.</param> <param name="access">The returned Read and Write bits to retain.</param> <returns>Success or an explicit grant failure. No persistence is automatic.</returns>

### `ReleaseAccess(System.Uri,Android.DocumentAccess)`

<summary>Releases the specified persisted URI access without deleting the document.</summary> <param name="uri">The persisted content URI.</param> <param name="access">The persisted Read and Write bits to release.</param> <returns>Success or an explicit grant failure.</returns>

### `ShowPickerAsync(FileDialogKind,Android.DocumentPickerOptions,System.Threading.CancellationToken)`

<summary>Launches the system document picker on the Activity's main thread.</summary> <param name="kind">OpenFile, SaveFile or Folder. SaveFile creates a new document.</param> <param name="options">MIME filters, content URI location and requested access.</param> <param name="cancellation">Cancels this request without persisting its URI grants.</param> <returns>Owned URI references and the access flags actually returned by Android.</returns>

## `DocumentAccess`

Source:

- [`AndroidDocuments.gs`](../../Goo.Android/AndroidDocuments.gs)

<summary>Access requested or granted for an Android document URI.</summary>

### Values

- `None`
- `Read`
- `Write`

### `None`

<summary>No document access.</summary>

### `Read`

<summary>Read document contents.</summary>

### `Write`

<summary>Replace document contents.</summary>

## `DocumentOperationResult`

Source:

- [`AndroidDocuments.gs`](../../Goo.Android/AndroidDocuments.gs)

<summary>The outcome of an explicit document grant change.</summary>

### `Error`

<summary>Gets a bounded failure reason or an empty string.</summary>

### `Status`

<summary>Gets the grant-change outcome.</summary>

## `DocumentPickerOptions`

Source:

- [`AndroidDocuments.gs`](../../Goo.Android/AndroidDocuments.gs)

<summary>Hints for the Android system document picker.</summary>

### `new`

<summary>Creates default document picker hints.</summary>

### `Access`

<summary>Gets requested access. The default is Read.</summary>

### `InitialUri`

<summary>Gets an optional content URI for the initial location.</summary>

### `MimeTypes`

<summary>Gets MIME filters. The default accepts all document types.</summary>

### `Multiple`

<summary>Gets whether an open picker may return multiple documents.</summary>

### `SuggestedName`

<summary>Gets the suggested display name for a newly created document.</summary>

## `DocumentPickerResult`

Source:

- [`AndroidDocuments.gs`](../../Goo.Android/AndroidDocuments.gs)

<summary>An owned URI selection and the access flags returned by the picker.</summary>

### `CanPersist`

<summary>Gets whether the returned grant supports explicit persistence.</summary>

### `Error`

<summary>Gets a bounded failure reason or an empty string.</summary>

### `GrantedAccess`

<summary>Gets returned read and write grant flags, not requested flags.</summary>

### `Status`

<summary>Gets the picker outcome.</summary>

### `Uris`

<summary>Gets immutable content URI references. No filesystem paths are returned.</summary>

## `DocumentStatus`

Source:

- [`AndroidDocuments.gs`](../../Goo.Android/AndroidDocuments.gs)

<summary>The outcome of document stream or grant access.</summary>

### Values

- `Success`
- `Cancelled`
- `Unsupported`
- `Denied`
- `NotFound`
- `Failed`

### `Cancelled`

<summary>The operation was cancelled.</summary>

### `Denied`

<summary>The provider denied access.</summary>

### `Failed`

<summary>The provider operation failed.</summary>

### `NotFound`

<summary>The document was not found.</summary>

### `Success`

<summary>The operation completed.</summary>

### `Unsupported`

<summary>The URI or operation is not supported.</summary>

## `DocumentStreamResult`

Source:

- [`AndroidDocuments.gs`](../../Goo.Android/AndroidDocuments.gs)

<summary>A caller-owned document stream or an explicit access failure.</summary>

### `Error`

<summary>Gets a bounded failure reason or an empty string.</summary>

### `Status`

<summary>Gets the stream-open outcome.</summary>

### `Stream`

<summary>Gets the caller-owned stream only when Status is Success.</summary>

## `GooActivity`

Source:

- [`GooActivity.gs`](../../Goo.Android/GooActivity.gs)

Hosts a Goo window and forwards Android activity lifecycle and activation events.

### `_lastActivationStatus`

Gets the result of forwarding the most recent Android activation.

### `OnContextMenuClosed(Android.Views.IMenu)`

Completes the active native context menu after Android closes it.

### `OnRequestPermissionsResult(int32,string[],Android.Content.PM.Permission[])`

Receives native permission results and forwards pending Goo requests.

- `requestCode`: The native permission request code.
- `permissions`: The requested Android permission names.
- `grantResults`: The native result for each permission.

### `Documents`

<summary>Gets the Activity-owned system document picker and content URI stream service.</summary>

### `SavedInstanceState`

Gets the saved activity state passed to CreateWindow, or null for a fresh activity.

## `GooView`

Source:

- [`GooView.gs`](../../Goo.Android/GooView.gs)

Presents a Goo window on an Android surface and forwards input and accessibility events.

### `FrameDemandChanged`

Reports changes in immediate frame demand on the Android UI thread.

### `_dismissKeyboardOnSubmit`

Gets or sets whether the Done editor action hides the software keyboard.

### `HasFrameDemand`

Gets whether a frame is pending or another immediate frame is needed.

## `Resource`


Android Resource Designer class. Exposes the Android Resource designer assembly into the project Namespace.
