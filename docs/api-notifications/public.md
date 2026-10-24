# Public API

Generated from `Goo.Notifications.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo.Notifications/Public`](../../Goo.Notifications/Public)

## `NotificationActivationSupport`

Source:

- [`Notifications.gs`](../../Goo.Notifications/Public/Notifications.gs)

<summary>Reports the configured default-click route, not a guarantee that the user will activate it.</summary>

### Values

- `None`
- `WarmOnly`
- `WarmAndCold`

### `None`

<summary>No supported activation route is available.</summary>

### `WarmAndCold`

<summary>The click can reach a running process or start the installed application.</summary>

### `WarmOnly`

<summary>The click can reach the running process only.</summary>

## `NotificationDelivery`

Source:

- [`Notifications.gs`](../../Goo.Notifications/Public/Notifications.gs)

<summary>Reports submission or current native notification state, not whether the user read it.</summary>

### Values

- `Unknown`
- `Accepted`
- `PresentInCenter`
- `Removed`
- `Failed`

### `Accepted`

<summary>The native service accepted submission. It may suppress or defer presentation.</summary>

### `Failed`

<summary>The native service rejected submission or reported a delivery failure.</summary>

### `PresentInCenter`

<summary>A native query found the notification in the current notification center.</summary>

### `Removed`

<summary>The native service accepted removal or reported that the notification closed.</summary>

### `Unknown`

<summary>The platform cannot report the notification's current presence.</summary>

## `NotificationMessage`

Source:

- [`Notifications.gs`](../../Goo.Notifications/Public/Notifications.gs)

<summary>Describes plain notification text and opaque application data for its default click.</summary>

### `new`

<summary>Creates an empty message. Set Id before submission.</summary>

### `Body`

<summary>Gets the plain body. The operating system controls wrapping and truncation.</summary>

### `Id`

<summary>Gets the stable replacement identity, containing 1 to 64 UTF-16 units and no NUL.</summary>

### `Payload`

<summary>Gets opaque data delivered through ApplicationActivation.Payload after a default click.</summary>

### `Title`

<summary>Gets the plain title. The operating system controls wrapping and truncation.</summary>

## `NotificationOptions`

Source:

- [`Notifications.gs`](../../Goo.Notifications/Public/Notifications.gs)

<summary>Configures the platform's notification identity and channel without requesting permission.</summary>

### `new`

<summary>Creates empty options. Set the fields required by the target platform.</summary>

### `ActivationScheme`

<summary>Gets the installer-registered private Windows protocol used with --goo-notification.</summary>

### `ChannelId`

<summary>Gets the stable Android notification channel ID. Other platforms ignore this value.</summary>

### `ChannelName`

<summary>Gets the user-visible Android channel name. Other platforms ignore this value.</summary>

### `SmallIconResource`

<summary>Gets an Android drawable resource name for the required small icon. Other platforms ignore it.</summary>

## `NotificationPermission`

Source:

- [`Notifications.gs`](../../Goo.Notifications/Public/Notifications.gs)

<summary>Reports the operating system's notification permission or setting.</summary>

### Values

- `NotDetermined`
- `Granted`
- `Denied`
- `Disabled`
- `Unknown`
- `Unsupported`

### `Denied`

<summary>The user denied notification permission.</summary>

### `Disabled`

<summary>Application, channel or system settings disable notifications.</summary>

### `Granted`

<summary>The operating system allows notification submission. Banner presentation is not guaranteed.</summary>

### `NotDetermined`

<summary>The user has not made a permission choice.</summary>

### `Unknown`

<summary>The platform cannot report a reliable permission state.</summary>

### `Unsupported`

<summary>The platform does not support this notification service.</summary>

## `NotificationResult`

Source:

- [`Notifications.gs`](../../Goo.Notifications/Public/Notifications.gs)

<summary>Reports native permission, delivery and activation support for one operation.</summary>

### `ActivationSupport`

<summary>Gets the configured default-click route.</summary>

### `Delivery`

<summary>Gets submission or native presence state. Accepted does not mean displayed.</summary>

### `Error`

<summary>Gets bounded native failure detail, or an empty string.</summary>

### `Id`

<summary>Gets the original application notification ID, or an empty string for permission queries.</summary>

### `Permission`

<summary>Gets the current permission or Unknown when the OS cannot report it.</summary>

### `Status`

<summary>Gets the operation status.</summary>

## `NotificationService`

Source:

- [`Notifications.gs`](../../Goo.Notifications/Public/Notifications.gs)

<summary>Owns a native notification service. Clicks use Window.ApplicationActivated with Kind Notification.</summary>

### `GetPermissionAsync`

<summary>Queries native permission or returns Unknown where the platform has no query.</summary> <returns>The current setting and configured activation support.</returns>

### `GetStatusAsync(string)`

<summary>Queries current native presence when available, otherwise returns Unknown.</summary> <param name="id">The original notification identity.</param> <returns>Native presence or the platform's reporting limit.</returns>

### `RemoveAsync(string)`

<summary>Asks the operating system to remove the application's notification.</summary> <param name="id">The original notification identity.</param> <returns>Removed after native acceptance, or an explicit platform failure.</returns>

### `RequestPermissionAsync`

<summary>Requests permission only when the native platform has a permission prompt.</summary> <returns>The user's native decision, or the current setting on platforms without a prompt.</returns>

### `ShowAsync(NotificationMessage)`

<summary>Submits or replaces a notification. It never requests permission implicitly.</summary> <param name="message">Plain text and bounded opaque default-click data.</param> <returns>Accepted after native submission, or an explicit permission, identity or platform failure.</returns>

## `NotificationServiceResult`

Source:

- [`Notifications.gs`](../../Goo.Notifications/Public/Notifications.gs)

<summary>Reports service creation. Only Success supplies an owned Service.</summary>

### `Error`

<summary>Gets bounded native failure detail, or an empty string.</summary>

### `Service`

<summary>Gets the owned native service on Success, otherwise nil.</summary>

### `Status`

<summary>Gets service creation status.</summary>

## `NotificationStatus`

Source:

- [`Notifications.gs`](../../Goo.Notifications/Public/Notifications.gs)

<summary>Reports a notification operation without throwing for expected platform failures.</summary>

### Values

- `Success`
- `Accepted`
- `PermissionRequired`
- `Denied`
- `Disabled`
- `MissingIdentity`
- `Unsupported`
- `Failed`

### `Accepted`

<summary>The native service accepted the request.</summary>

### `Denied`

<summary>The user denied permission.</summary>

### `Disabled`

<summary>Native application, channel or system settings disable submission.</summary>

### `Failed`

<summary>The native operation failed.</summary>

### `MissingIdentity`

<summary>The required installed application identity or activation registration is missing.</summary>

### `PermissionRequired`

<summary>The application must request permission before it can submit.</summary>

### `Success`

<summary>The query or configuration operation succeeded.</summary>

### `Unsupported`

<summary>The platform or requested native operation is not supported.</summary>

## `Notifications`

Source:

- [`Notifications.gs`](../../Goo.Notifications/Public/Notifications.gs)

<summary>Opens optional desktop notifications without changing application lifetime or requesting permission.</summary>

### `Open(NotificationOptions)`

<summary>Uses the configured desktop application ID and installed native activation route.</summary> <param name="options">Platform identity and channel configuration.</param> <returns>An owned native service, or an explicit unsupported, identity or native failure.</returns> <remarks> Subscribe and initialize application activation first. On macOS, open before the first Window opens. Windows needs its installed AUMID shortcut and private protocol. Android uses AndroidNotifications.Open. Disposing a service does not erase notifications that the OS already accepted. </remarks>
