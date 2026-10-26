# Platform API

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/Platform`](https://github.com/obselate/goo/tree/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/Platform)

## `ActivationPostStatus`

Source:

- [`ApplicationActivation.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/Platform/ApplicationActivation.gs)

Reports whether a process activation entered the owner-thread delivery queue.

### Values

- `Accepted`
- `NotInitialized`
- `Closed`
- `QueueFull`
- `TooLarge`

## `ApplicationActivation`

Source:

- [`ApplicationActivation.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/Platform/ApplicationActivation.gs)

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

Gets bounded opaque notification data which the application must validate before use.

### `Target`

Gets the absolute target URI for an OpenUri request, or nil for other requests.

### `WorkingDirectory`

Gets the sender's working directory without changing the receiving process's directory.

## `ApplicationActivationKind`

Source:

- [`ApplicationActivation.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/Platform/ApplicationActivation.gs)

Identifies a process launch, forwarded request, URI, documents, or notification response.

### Values

- `Launch`
- `Arguments`
- `OpenUri`
- `OpenDocuments`
- `Notification`

## `EmbeddedWindowHost`

Source:

- [`EmbeddedWindowHost.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/Platform/EmbeddedWindowHost.gs)

Connects a host-owned viewport and frame loop to an ordinary Goo window. All calls except RequestFrame run on the thread that attaches the window.

### `AllowInheritedCompositeAlpha`

Allows inherited Vulkan alpha when the native compositor has configured premultiplied transparency.

### `AttachPresentation`

Creates presentation resources for the current native surface without remounting Cells.

### `CreateVulkanSurface(System.IntPtr,System.UInt64@)`

Creates a Vulkan surface owned by Goo for the supplied instance.

### `DestroyVulkanSurface(System.IntPtr,System.UInt64)`

Destroys a Vulkan surface previously created for the supplied instance.

### `DetachPresentation`

Releases presentation resources and waits for submitted GPU work to finish. The retained tree remains mounted and may be attached to a replacement surface.

### `Dispose`

Closes the attached window and releases its retained and presentation resources.

### `GetClipboardText`

Gets plain text from the platform clipboard.

### `GetNativeHandle`

Returns the native viewport handle used for diagnostics.

### `GetVulkanGetInstanceProcAddr`

Returns the Vulkan global procedure lookup address.

### `GetVulkanInstanceExtensions`

Returns the Vulkan instance extensions needed by this native surface.

### `LoadVulkanLibrary`

Loads or retains the platform Vulkan loader.

### `PreferRequestedFramebufferExtent`

Uses the requested framebuffer extent when the native WSI permits scaling.

### `RenderFrame(float64)`

Processes queued work and one externally timed frame without polling native events.

### `RequestFrame`

Schedules frame service on the owner thread. The framework may call this from any thread.

### `Resize(int32,int32,int32,int32)`

Reports content size in logical units and the corresponding framebuffer pixels.

### `Resume`

Resumes frame service without applying elapsed background time to animations.

### `ServicePendingSubmission`

Advances a completed graphics submission into presentation without simulating, rendering, or consuming presentation completion. Returns true when a completed submission was consumed.

### `SetClipboardText(string)`

Stores plain text in the platform clipboard.

### `SetCursor(Cursor)`

Updates the pointer cursor when the platform supports one.

### `SetFocused(bool)`

Reports whether the viewport has native input focus.

### `SetImeArea(int32,int32,int32,int32,int32)`

Updates the text caret area in logical viewport units.

### `StartTextInput`

Starts the platform text input session and reports whether it is active.

### `StopTextInput`

Stops the platform text input session.

### `Suspend`

Pauses simulation and presentation and cancels transient input state.

### `UnloadVulkanLibrary`

Releases the loader reference acquired by LoadVulkanLibrary.

### `UpdatePreferences(PlatformPreferences)`

Updates platform preferences on the owner thread, before or after attaching a window.

### `IsPresentationAttached`

Reports whether a Vulkan presentation surface is attached.

### `IsSuspended`

Reports whether frame simulation and presentation are suspended.

### `NextFrameDelaySeconds`

Gets seconds until frame service is needed, or positive infinity while idle.

### `Preferences`

Gets the most recent preference snapshot supplied by this host.

### `Window`

Gets the attached Goo window, or nil after disposal.

## `MessageBoxButton`

Source:

- [`NativeDialogs.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/Platform/NativeDialogs/NativeDialogs.gs)

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

- [`NativeDialogs.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/Platform/NativeDialogs/NativeDialogs.gs)

Selects the native message severity.

### Values

- `Information`
- `Warning`
- `Error`

## `MessageBoxOptions`

Source:

- [`NativeDialogs.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/Platform/NativeDialogs/NativeDialogs.gs)

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

- [`NativeDialogs.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/Platform/NativeDialogs/NativeDialogs.gs)

Contains a native message-box outcome.

### `ButtonId`

Gets the selected identifier, or -1 outside Success.

### `Error`

Gets copied failure detail, or an empty string.

### `Status`

Gets the explicit outcome.

## `MessageBoxStatus`

Source:

- [`NativeDialogs.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/Platform/NativeDialogs/NativeDialogs.gs)

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

- [`NativeDialogs.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/Platform/NativeDialogs/NativeDialogs.gs)

Shows owned native dialogs without a managed fallback.

### `ShowMessageBoxAsync(Window,MessageBoxOptions)`

Queues an owned native message box from the open owner's UI thread. Desktop SDL display blocks Goo rendering, timers and posted actions until dismissal. Wayland returns Unsupported. Android supports up to three buttons without Return/Escape defaults.

- `owner`: The open owner whose input and lifetime remain leased until native completion.
- `options`: Content copied before native launch.

Returns: A task with a selected button or an explicit nonselection result.

## `NativeMenuBar`

Source:

- [`NativeMenus.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/Platform/NativeMenus/NativeMenus.gs)

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

- [`NativeMenus.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/Platform/NativeMenus/NativeMenus.gs)

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

- [`NativeMenus.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/Platform/NativeMenus/NativeMenus.gs)

Contains an explicit native menu outcome.

### `Error`

Gets copied native failure details, or an empty string.

### `ItemId`

Gets the selected context-menu identifier, or an empty string for all other outcomes.

### `Status`

Gets the operation status.

## `NativeMenuShortcut`

Source:

- [`NativeMenus.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/Platform/NativeMenus/NativeMenus.gs)

Describes one logical printable key and its exact modifiers.

### `Key`

Gets the single printable Unicode scalar used as the native key equivalent.

### `Modifiers`

Gets the modifiers. Super means Command on macOS.

## `NativeMenuStatus`

Source:

- [`NativeMenus.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/Platform/NativeMenus/NativeMenus.gs)

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

- [`NativeMenus.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/Platform/NativeMenus/NativeMenus.gs)

Opens operating-system context menus. No managed-widget fallback is implicit.

### `new`

Creates a native menu service.

### `ShowContextMenuAsync(Window,Point,System.Collections.Generic.IReadOnlyList{NativeMenuItem})`

Queues native tracking on the owner thread. Desktop tracking blocks the Goo scheduler.

- `owner`: The open owner on its UI thread.
- `point`: The anchor in owner-content Goo layout coordinates.
- `items`: The complete menu model, copied before native launch.

Returns: Selection or cancellation through the task only, never a bar activation event.

## `NotificationActivationSupport`

Source:

- [`Notifications.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/Platform/Notifications/Notifications.gs)

Reports the configured default-click route, not a guarantee that the user will activate it.

### Values

- `None`
- `WarmOnly`
- `WarmAndCold`

### `None`

No supported activation route is available.

### `WarmAndCold`

The click can reach a running process or start the installed application.

### `WarmOnly`

The click can reach the running process only.

## `NotificationDelivery`

Source:

- [`Notifications.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/Platform/Notifications/Notifications.gs)

Reports submission or current native notification state, not whether the user read it.

### Values

- `Unknown`
- `Accepted`
- `PresentInCenter`
- `Removed`
- `Failed`

### `Accepted`

The native service accepted submission. It may suppress or defer presentation.

### `Failed`

The native service rejected submission or reported a delivery failure.

### `PresentInCenter`

A native query found the notification in the current notification center.

### `Removed`

The native service accepted removal or reported that the notification closed.

### `Unknown`

The platform cannot report the notification's current presence.

## `NotificationMessage`

Source:

- [`Notifications.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/Platform/Notifications/Notifications.gs)

Describes plain notification text and opaque application data for its default click.

### `new`

Creates an empty message. Set Id before submission.

### `Body`

Gets the plain body. The operating system controls wrapping and truncation.

### `Id`

Gets the stable replacement identity, containing 1 to 64 UTF-16 units and no NUL.

### `Payload`

Gets opaque data delivered through ApplicationActivation.Payload after a default click.

### `Title`

Gets the plain title. The operating system controls wrapping and truncation.

## `NotificationOptions`

Source:

- [`Notifications.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/Platform/Notifications/Notifications.gs)

Configures the platform's notification identity and channel without requesting permission.

### `new`

Creates empty options. Set the fields required by the target platform.

### `ActivationScheme`

Gets the installer-registered private Windows protocol used with --goo-notification.

### `ChannelId`

Gets the stable Android notification channel ID. Other platforms ignore this value.

### `ChannelName`

Gets the user-visible Android channel name. Other platforms ignore this value.

### `SmallIconResource`

Gets an Android drawable resource name for the required small icon. Other platforms ignore it.

## `NotificationPermission`

Source:

- [`Notifications.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/Platform/Notifications/Notifications.gs)

Reports the operating system's notification permission or setting.

### Values

- `NotDetermined`
- `Granted`
- `Denied`
- `Disabled`
- `Unknown`
- `Unsupported`

### `Denied`

The user denied notification permission.

### `Disabled`

Application, channel or system settings disable notifications.

### `Granted`

The operating system allows notification submission. Banner presentation is not guaranteed.

### `NotDetermined`

The user has not made a permission choice.

### `Unknown`

The platform cannot report a reliable permission state.

### `Unsupported`

The platform does not support this notification service.

## `NotificationResult`

Source:

- [`Notifications.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/Platform/Notifications/Notifications.gs)

Reports native permission, delivery and activation support for one operation.

### `ActivationSupport`

Gets the configured default-click route.

### `Delivery`

Gets submission or native presence state. Accepted does not mean displayed.

### `Error`

Gets bounded native failure detail, or an empty string.

### `Id`

Gets the original application notification ID, or an empty string for permission queries.

### `Permission`

Gets the current permission or Unknown when the OS cannot report it.

### `Status`

Gets the operation status.

## `NotificationService`

Source:

- [`Notifications.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/Platform/Notifications/Notifications.gs)

Owns a native notification service. Clicks use Window.ApplicationActivated with Kind Notification.

### `GetPermissionAsync`

Queries native permission or returns Unknown where the platform has no query.

Returns: The current setting and configured activation support.

### `GetStatusAsync(string)`

Queries current native presence when available, otherwise returns Unknown.

- `id`: The original notification identity.

Returns: Native presence or the platform's reporting limit.

### `RemoveAsync(string)`

Asks the operating system to remove the application's notification.

- `id`: The original notification identity.

Returns: Removed after native acceptance, or an explicit platform failure.

### `RequestPermissionAsync`

Requests permission only when the native platform has a permission prompt.

Returns: The user's native decision, or the current setting on platforms without a prompt.

### `ShowAsync(NotificationMessage)`

Submits or replaces a notification. It never requests permission implicitly.

- `message`: Plain text and bounded opaque default-click data.

Returns: Accepted after native submission, or an explicit permission, identity or platform failure.

## `NotificationServiceResult`

Source:

- [`Notifications.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/Platform/Notifications/Notifications.gs)

Reports service creation. Only Success supplies an owned Service.

### `Error`

Gets bounded native failure detail, or an empty string.

### `Service`

Gets the owned native service on Success, otherwise nil.

### `Status`

Gets service creation status.

## `NotificationStatus`

Source:

- [`Notifications.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/Platform/Notifications/Notifications.gs)

Reports a notification operation without throwing for expected platform failures.

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

The native service accepted the request.

### `Denied`

The user denied permission.

### `Disabled`

Native application, channel or system settings disable submission.

### `Failed`

The native operation failed.

### `MissingIdentity`

The required installed application identity or activation registration is missing.

### `PermissionRequired`

The application must request permission before it can submit.

### `Success`

The query or configuration operation succeeded.

### `Unsupported`

The platform or requested native operation is not supported.

## `Notifications`

Source:

- [`Notifications.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/Platform/Notifications/Notifications.gs)

Opens optional desktop notifications without changing application lifetime or requesting permission.

### `Open(NotificationOptions)`

Uses the configured desktop application ID and installed native activation route.

- `options`: Platform identity and channel configuration.

Returns: An owned native service, or an explicit unsupported, identity or native failure.

## `PlatformPreferences`

Source:

- [`PlatformPreferences.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/Platform/PlatformPreferences.gs)

Holds platform preferences independently of framebuffer density. Nil values mean the host cannot report that preference.

### `AccentColor`

Gets the system accent color, or nil when unavailable.

### `EventSoundsEnabled`

Gets whether UI and event sounds are enabled, or nil when unavailable.

### `HighContrast`

Gets whether increased contrast is requested, or nil when unavailable.

### `PreferredLocales`

Gets an immutable, ordered list of preferred BCP-47 language tags, or nil when unavailable.

### `ReducedMotion`

Gets whether nonessential motion should be reduced, or nil when unavailable.

### `TextScaleFactor`

Gets the positive user text scale, independently of display density, or nil when unavailable.

### `Theme`

Gets the preferred theme, or Unknown when unavailable.

## `SystemTheme`

Source:

- [`PlatformPreferences.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/Platform/PlatformPreferences.gs)

Identifies the platform's preferred application color theme.

### Values

- `Unknown`
- `Light`
- `Dark`

## `TrayIcon`

Source:

- [`Tray.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/Platform/Tray/Tray.gs)

Owns a native tray icon on an open desktop Window's UI thread.

### `Activated`

Occurs on the owner UI thread after native primary activation. A menu can consume this gesture.

### `CommandActivated`

Occurs on the owner UI thread after a native menu selects a stable item ID.

### `StatusChanged`

Occurs on the owner UI thread when registration changes.

### `Create(Window,TrayOptions)`

Creates an icon for an open desktop owner. Native failures return a typed result.

- `owner`: The open desktop window that owns the icon and its callbacks.
- `options`: The icon identity, pixels, tooltip and menu.

Returns: A typed registration result with an owned icon when the host can be observed.

### `Dispose`

Unregisters the icon on its owner UI thread. Repeated calls have no effect.

### `Update(TrayOptions)`

Replaces icon pixels, tooltip and menu. Id must remain unchanged.

- `options`: The replacement pixels, tooltip and menu.

Returns: The native update status.

### `Status`

Gets the current registration status on the owner UI thread.

## `TrayOptions`

Source:

- [`Tray.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/Platform/Tray/Tray.gs)

Describes a tray icon. Create and Update copy the pixels and menu before returning.

### `new`

Creates empty options. Set Id, Width, Height and Rgba before use.

### `Height`

Gets the pixel height, from 1 to 512.

### `Id`

Gets the stable icon identity. Use a globally unique name of at most 255 UTF-16 units.

### `Menu`

Gets the native menu. Include an Open command because some hosts consume primary clicks.

### `Rgba`

Gets Width * Height * 4 straight-alpha sRGB bytes in red, green, blue, alpha order.

### `Tooltip`

Gets the tooltip, with at most 127 UTF-16 units and no NUL characters. Hosts may hide it.

### `Width`

Gets the pixel width, from 1 to 512.

## `TrayResult`

Source:

- [`Tray.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/Platform/Tray/Tray.gs)

Reports tray creation. NoHost can return a live Icon that observes host availability.

### `Error`

Gets bounded native failure detail, or an empty string.

### `Icon`

Gets the owned icon for Registered or NoHost, otherwise nil.

### `Status`

Gets the creation status.

## `TrayStatus`

Source:

- [`Tray.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/Platform/Tray/Tray.gs)

Reports native tray registration, not whether the user can see the icon.

### Values

- `Registered`
- `NoHost`
- `Unsupported`
- `Closed`
- `Failed`

### `Closed`

The icon or its owner is closed.

### `Failed`

The native operation failed.

### `NoHost`

No tray host is available. The live icon registers when a host appears.

### `Registered`

The native host accepted the icon.

### `Unsupported`

The platform or requested menu feature is not supported.
