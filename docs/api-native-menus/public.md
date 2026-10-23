# Public API

Generated from `Goo.NativeMenus.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo.NativeMenus/Public`](../../Goo.NativeMenus/Public)

## `NativeMenuBar`

Source:

- [`NativeMenus.gs`](../../Goo.NativeMenus/Public/NativeMenus.gs)

Owns one native bar for an open Window. Operations are owner-thread-affine.

### `Activated`

Reports a selected bar identifier on the owner's Goo queue after native dispatch.

### `new(Window)`

Binds a bar to an open owner. Unsupported platforms report Unsupported from SetItems.

- `owner`: The open owner window on its UI thread.

### `Dispose`

Detaches this bar and releases its native handles on the owner thread.

### `SetItems(System.Collections.Generic.IReadOnlyList{NativeMenuItem})`

Replaces the complete snapshot. Duplicate identifiers and shortcuts are argument errors.

- `items`: The complete menu model. Use an empty list to remove document menus.

Returns: Success with an empty ItemId, or an explicit platform or lifetime status.

## `NativeMenuItem`

Source:

- [`NativeMenus.gs`](../../Goo.NativeMenus/Public/NativeMenus.gs)

Describes one immutable native menu row. Publishing copies the complete model.

### `new`

Creates an enabled row with empty text, identifier and children.

### `Checked`

Gets whether the native checked indicator is present.

### `Enabled`

Gets whether the row can be selected. The default is true.

### `Id`

Gets the unique action identifier. Separators have an empty identifier.

### `Items`

Gets the child rows. The default is empty.

### `Separator`

Gets whether this row is a separator with no action or children.

### `Shortcut`

Gets the executable native accelerator, or no accelerator.

### `Text`

Gets the native row title.

## `NativeMenuResult`

Source:

- [`NativeMenus.gs`](../../Goo.NativeMenus/Public/NativeMenus.gs)

Contains an explicit native menu outcome.

### `Error`

Gets copied native failure details, or an empty string.

### `ItemId`

Gets the selected context-menu identifier, or an empty string for all other outcomes.

### `Status`

Gets the operation status.

## `NativeMenuShortcut`

Source:

- [`NativeMenus.gs`](../../Goo.NativeMenus/Public/NativeMenus.gs)

Describes one logical printable key and its exact modifiers.

### `Key`

Gets the single printable Unicode scalar used as the native key equivalent.

### `Modifiers`

Gets the modifiers. Super means Command on macOS.

## `NativeMenuStatus`

Source:

- [`NativeMenus.gs`](../../Goo.NativeMenus/Public/NativeMenus.gs)

Reports the outcome of a native menu operation.

### Values

- `Success`
- `Cancelled`
- `Unsupported`
- `Busy`
- `OwnerClosed`
- `Failed`

## `NativeMenus`

Source:

- [`NativeMenus.gs`](../../Goo.NativeMenus/Public/NativeMenus.gs)

Opens operating-system context menus. No managed-widget fallback is implicit.

### `ShowContextMenuAsync(Window,Point,System.Collections.Generic.IReadOnlyList{NativeMenuItem})`

Queues native tracking on the owner thread. Desktop tracking blocks the Goo scheduler.

- `owner`: The open owner on its UI thread.
- `point`: The anchor in owner-content Goo layout coordinates.
- `items`: The complete menu model, copied before native launch.

Returns: Selection or cancellation through the task only, never a bar activation event.
