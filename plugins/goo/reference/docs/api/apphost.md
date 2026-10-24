# AppHost API

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/AppHost`](https://github.com/obselate/goo/tree/fe7b66e8ed581f921e8a7c2543e61e87607f0b9c/Goo/AppHost)

## `ActivationArguments`

Source:

- [`ActivationArguments.gs`](https://github.com/obselate/goo/blob/fe7b66e8ed581f921e8a7c2543e61e87607f0b9c/Goo/AppHost/ActivationArguments.gs)

Converts explicit desktop association arguments without changing the current directory.

### `Read(System.Collections.Generic.IReadOnlyList{string},string)`

Reads arguments without the executable name and copies the resulting request. Ordinary arguments produce Launch. Reserved leading flags select URI, documents or notification activation. --goo-open-uri requires one absolute URI. --goo-open-documents accepts URI or path values. Relative document paths resolve against workingDirectory. URI values do not grant document access.

- `arguments`: Argument values with their original boundaries, excluding the executable name.
- `workingDirectory`: The sender's captured working directory.

Returns: An owned initial activation, or Rejected for malformed or oversized association data.

## `ActivationReadResult`

Source:

- [`ActivationArguments.gs`](https://github.com/obselate/goo/blob/fe7b66e8ed581f921e8a7c2543e61e87607f0b9c/Goo/AppHost/ActivationArguments.gs)

Contains owned startup data or an explicit rejection.

### `Activation`

Gets the owned request when Accepted, or nil when Rejected.

### `Error`

Gets a bounded explanation without argument or document contents.

### `Status`

Gets whether the arguments formed a valid bounded request.

## `ActivationReadStatus`

Source:

- [`ActivationArguments.gs`](https://github.com/obselate/goo/blob/fe7b66e8ed581f921e8a7c2543e61e87607f0b9c/Goo/AppHost/ActivationArguments.gs)

Reports whether desktop startup arguments form an owned activation request.

### Values

- `Accepted`
- `Rejected`

## `Placement`

Source:

- [`Placement.gs`](https://github.com/obselate/goo/blob/fe7b66e8ed581f921e8a7c2543e61e87607f0b9c/Goo/AppHost/Placement.gs)

Restores app-owned placement against the current desktop display inventory.

### `Restore(Window,WindowPlacement)`

Matches display hints and clamps normal geometry to current usable bounds and size constraints. Open the window hidden first. Restore does not read or write application settings. Saved Minimized becomes Normal. Native capture already retains the last non-minimized state. Wayland does not apply position. Fullscreen, focus and final geometry remain OS decisions.

- `window`: The open window on its owner thread.
- `saved`: App-owned saved geometry, state and display hints.

Returns: Accepted with the applied mask, Closed, Unsupported, or Failed for invalid data or host failure.

## `SingleInstance`

Source:

- [`SingleInstance.gs`](https://github.com/obselate/goo/blob/fe7b66e8ed581f921e8a7c2543e61e87607f0b9c/Goo/AppHost/SingleInstance.gs)

Elects one desktop instance and forwards typed requests to its activation queue.

### `AcquireAsync(string,ApplicationActivation,int32)`

Acquires a primary lease or forwards to the current user's existing desktop instance. Initialize Window application activation on the UI thread before calling this method. macOS captures native launch requests before election and forwards each retained request. On Wayland, RequestActivation inside the receiving handler uses the forwarded activation token. Keep the primary lease until shutdown. Forwarded confirms queue ownership, not handler completion. A timeout never elects a second primary and does not prove that an unacknowledged request was unused. Android and other non-desktop targets return Unsupported.

- `applicationId`: A stable application identity shared by both processes.
- `activation`: The request to forward. Launch becomes Arguments and IsInitial becomes false.
- `timeoutMilliseconds`: The positive connection and acknowledgement deadline in milliseconds.

Returns: A primary lease or an explicit forwarding, timeout, unsupported, rejection, or failure result.

## `SingleInstanceResult`

Source:

- [`SingleInstance.gs`](https://github.com/obselate/goo/blob/fe7b66e8ed581f921e8a7c2543e61e87607f0b9c/Goo/AppHost/SingleInstance.gs)

Owns the primary lifetime or reports why a request was not forwarded.

### `Error`

Gets bounded failure detail without argument or document contents.

### `Lease`

Gets the primary's disposable lease, or nil for every other status.

### `Status`

Gets the election or forwarding outcome.

## `SingleInstanceStatus`

Source:

- [`SingleInstance.gs`](https://github.com/obselate/goo/blob/fe7b66e8ed581f921e8a7c2543e61e87607f0b9c/Goo/AppHost/SingleInstance.gs)

Reports primary ownership or the outcome of forwarding to the existing instance.

### Values

- `Primary`
- `Forwarded`
- `TimedOut`
- `Unsupported`
- `Rejected`
- `Failed`
