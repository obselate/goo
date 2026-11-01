# Platform API

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/Platform`](https://github.com/obselate/goo/tree/main/Goo/Platform)

## `ActivationPostStatus`

Source:

- [`ApplicationActivation.gs`](https://github.com/obselate/goo/blob/main/Goo/Platform/ApplicationActivation.gs)

Reports whether a process activation entered the owner-thread delivery queue.

### Values

- `Accepted`
- `NotInitialized`
- `Closed`
- `QueueFull`
- `TooLarge`

## `ApplicationActivation`

Source:

- [`ApplicationActivation.gs`](https://github.com/obselate/goo/blob/main/Goo/Platform/ApplicationActivation.gs)

Owns the data delivered by the process-wide application activation event. URI values do not grant access to documents and notification payloads are untrusted app data.

### `new`

Creates a Launch request with empty argument, document, and notification data.

### `ActionId`

Gets the notification action ID, or an empty string for its default action.

### `Arguments`

Gets argument values with their original boundaries and empty values preserved.

### `Documents`

Gets absolute document URIs without converting provider URIs to filesystem paths.

### `IsInitial`

Gets whether this request caused the process's initial activation.

### `Kind`

Gets the activation source category.

### `NotificationId`

Gets the application-defined notification ID, or an empty string.

### `Payload`
