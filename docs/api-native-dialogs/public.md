# Public API

Generated from `Goo.NativeDialogs.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo.NativeDialogs/Public`](../../Goo.NativeDialogs/Public)

## `MessageBoxButton`

Source:

- [`NativeDialogs.gs`](../../Goo.NativeDialogs/Public/NativeDialogs.gs)

Describes one native message-box button.

### `new`

Creates an empty button.

### `Cancel`

Gets whether Escape selects this button on desktop. Selection is still Success.

### `Default`

Gets whether Return selects this button on desktop.

### `Id`

Gets the unique nonnegative application identifier.

### `Text`

Gets the native button label.

## `MessageBoxIcon`

Source:

- [`NativeDialogs.gs`](../../Goo.NativeDialogs/Public/NativeDialogs.gs)

Selects the native message severity.

### Values

- `Information`
- `Warning`
- `Error`

## `MessageBoxOptions`

Source:

- [`NativeDialogs.gs`](../../Goo.NativeDialogs/Public/NativeDialogs.gs)

Supplies native message-box content, copied when accepted.

### `new`

Creates options with empty content and no buttons.

### `Buttons`

Gets one to eight buttons with unique nonnegative identifiers.

### `Icon`

Gets the native severity.

### `Message`

Gets the plain-text message.

### `Title`

Gets the native title.

## `MessageBoxResult`

Source:

- [`NativeDialogs.gs`](../../Goo.NativeDialogs/Public/NativeDialogs.gs)

Contains a native message-box outcome.

### `ButtonId`

Gets the selected identifier, or -1 outside Success.

### `Error`

Gets copied failure detail, or an empty string.

### `Status`

Gets the explicit outcome.

## `MessageBoxStatus`

Source:

- [`NativeDialogs.gs`](../../Goo.NativeDialogs/Public/NativeDialogs.gs)

Distinguishes selection, dismissal, platform limits, owner conflicts and native failure.

### Values

- `Success`
- `Cancelled`
- `Unsupported`
- `Busy`
- `OwnerClosed`
- `Failed`

## `NativeDialogs`

Source:

- [`NativeDialogs.gs`](../../Goo.NativeDialogs/Public/NativeDialogs.gs)

Shows owned native dialogs without a managed fallback.

### `ShowMessageBoxAsync(Window,MessageBoxOptions)`

Queues an owned native message box from the open owner's UI thread. Desktop SDL display blocks Goo rendering, timers and posted actions until dismissal. Wayland returns Unsupported. Android supports up to three buttons without Return/Escape defaults.

- `owner`: The open owner whose input and lifetime remain leased until native completion.
- `options`: Content copied before native launch.

Returns: A task with a selected button or an explicit nonselection result.
