# AppHost API

Source: [`Goo/AppHost`](../../Goo/AppHost)

## `ActivationArguments`


Converts explicit desktop association arguments without changing the current directory.

### `Read(System.Collections.Generic.IReadOnlyList{string},string)`

Reads arguments without the executable name and copies the resulting request. Ordinary arguments produce Launch. Reserved leading flags select URI, documents or notification activation. --goo-open-uri requires one absolute URI. --goo-open-documents accepts URI or path values. Relative document paths resolve against workingDirectory. URI values do not grant document access.

- `arguments`: Argument values with their original boundaries, excluding the executable name.
- `workingDirectory`: The sender's captured working directory.

Returns: An owned initial activation, or Rejected for malformed or oversized association data.

## `ActivationReadResult`


Contains owned startup data or an explicit rejection.

### `Activation`

Gets the owned request when Accepted, or nil when Rejected.

### `Error`

Gets a bounded explanation without argument or document contents.

### `Status`

Gets whether the arguments formed a valid bounded request.

## `ActivationReadStatus`


Reports whether desktop startup arguments form an owned activation request.

### Values

- `Accepted`
- `Rejected`

## `Application`


Configures process identity, activation delivery and the desktop event loop.

### `Activated`

Occurs once per application activation on the process UI thread, not once per open window. Subscribe before <see cref="AcquireSingleInstance"/> or <see cref="Run"/>. Handlers own validation and window selection. The queue retains 1024 requests, with 4096 arguments or documents per request. Text is limited to 64 KiB per UTF-8 string and 1 MiB per request. Native requests outside these limits, or received before initialization or after close, are dropped.

### `AcquireSingleInstance(string[],float64)`

Initializes activation and elects a primary instance before the first window opens. Keep the returned primary lease until shutdown. Forwarded confirms queue ownership only.

- `arguments`: The startup arguments, without the executable name.
- `timeoutMs`: The positive connection and acknowledgement deadline in milliseconds.

Returns: A primary lease or the explicit forwarding or failure result.

### `Configure(System.Reflection.Assembly)`

Configures identity from Product, InformationalVersion and GooApplicationId assembly metadata.

- `assembly`: The application assembly.

### `Configure(string,string,string)`

Configures application identity before native initialization.

- `name`: The human-readable product name.
- `version`: The application version.
- `identifier`: The stable reverse-domain application identifier.

### `PostActivation(ApplicationActivation)`

Copies and queues a request from any thread for the process-wide activation event. Accepted confirms queue ownership, not handler completion, document access, or focus. Requests allow 4096 arguments and documents each, 64 KiB per UTF-8 string and 1 MiB total text.

- `value`: The owned request data to copy. Relative URIs and null values are invalid arguments.

Returns: Accepted, NotInitialized, Closed, QueueFull at 1024 pending requests, or TooLarge.

### `Run(Window)`

Opens the window and runs the UI event loop until all Goo windows close.

- `window`: The first window, which may already be open.

### `VerifyState`

Gets or sets tracked-state verification. Nil selects automatic verification. Automatic verification is enabled with an attached debugger or a registered DevTools session.

## `GraphicsUnavailableException`


Reports that a window has no usable Vulkan device, surface or required graphics feature.

### `new(string)`

Creates a graphics startup failure with its native detail.

- `message`: The graphics failure detail.

### `new(string,System.Exception)`

Creates a graphics startup failure that retains the underlying error.

- `message`: The graphics failure detail.
- `innerException`: The underlying renderer initialization error.

## `Placement`


Restores app-owned placement against the current desktop display inventory.

### `Restore(Window,WindowPlacement)`

Matches display hints and clamps normal geometry to current usable bounds and size constraints. Open the window hidden first. Restore does not read or write application settings. Saved Minimized becomes Normal. Native capture already retains the last non-minimized state. Wayland does not apply position. Fullscreen, focus and final geometry remain OS decisions.

- `window`: The open window on its owner thread.
- `saved`: App-owned saved geometry, state and display hints.

Returns: Accepted with the applied mask, Closed, Unsupported, or Failed for invalid data or host failure.

## `SingleInstanceResult`


Owns the primary lifetime or reports why a request was not forwarded.

### `Error`

Gets bounded failure detail without argument or document contents.

### `Lease`

Gets the primary's disposable lease, or nil for every other status.

### `Status`

Gets the election or forwarding outcome.

## `SingleInstanceStatus`


Reports primary ownership or the outcome of forwarding to the existing instance.

### Values

- `Primary`
- `Forwarded`
- `TimedOut`
- `Unsupported`
- `Rejected`
- `Failed`
