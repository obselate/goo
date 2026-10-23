# Public API

Generated from `Goo.AppHost.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo.AppHost/Public`](../../Goo.AppHost/Public)

## `SingleInstance`

Source:

- [`SingleInstance.gs`](../../Goo.AppHost/Public/SingleInstance.gs)

Elects one desktop instance and forwards typed requests to its activation queue.

### `AcquireAsync(string,ApplicationActivation,int32)`

Acquires a primary lease or forwards to the current user's existing desktop instance. Initialize Window application activation on the UI thread before calling this method. Keep the primary lease until shutdown. Forwarded confirms queue ownership, not handler completion. A timeout never elects a second primary and does not prove that an unacknowledged request was unused. Android and other non-desktop targets return Unsupported.

- `applicationId`: A stable application identity shared by both processes.
- `activation`: The request to forward. Launch becomes Arguments and IsInitial becomes false.
- `timeoutMilliseconds`: The positive connection and acknowledgement deadline in milliseconds.

Returns: A primary lease or an explicit forwarding, timeout, unsupported, rejection, or failure result.

## `SingleInstanceResult`

Source:

- [`SingleInstance.gs`](../../Goo.AppHost/Public/SingleInstance.gs)

Owns the primary lifetime or reports why a request was not forwarded.

### `Error`

Gets bounded failure detail without argument or document contents.

### `Lease`

Gets the primary's disposable lease, or nil for every other status.

### `Status`

Gets the election or forwarding outcome.

## `SingleInstanceStatus`

Source:

- [`SingleInstance.gs`](../../Goo.AppHost/Public/SingleInstance.gs)

Reports primary ownership or the outcome of forwarding to the existing instance.

### Values

- `Primary`
- `Forwarded`
- `TimedOut`
- `Unsupported`
- `Rejected`
- `Failed`
