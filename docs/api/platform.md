# Platform API

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/Platform`](../../Goo/Platform)

## `ActivationPostStatus`

Source:

- [`ApplicationActivation.gs`](../../Goo/Platform/ApplicationActivation.gs)

Reports whether a process activation entered the owner-thread delivery queue.

### Values

- `Accepted`
- `NotInitialized`
- `Closed`
- `QueueFull`
- `TooLarge`

## `ApplicationActivation`

Source:

- [`ApplicationActivation.gs`](../../Goo/Platform/ApplicationActivation.gs)

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

- [`ApplicationActivation.gs`](../../Goo/Platform/ApplicationActivation.gs)

Identifies a process launch, forwarded request, URI, documents, or notification response.

### Values

- `Launch`
- `Arguments`
- `OpenUri`
- `OpenDocuments`
- `Notification`

## `EmbeddedWindowHost`

Source:

- [`EmbeddedWindowHost.gs`](../../Goo/Platform/EmbeddedWindowHost.gs)

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

## `PlatformPreferences`

Source:

- [`PlatformPreferences.gs`](../../Goo/Platform/PlatformPreferences.gs)

Holds platform preferences independently of framebuffer density. Nil values mean the host cannot report that preference.

### `HighContrast`

Gets whether increased contrast is requested, or nil when unavailable.

### `ReducedMotion`

Gets whether nonessential motion should be reduced, or nil when unavailable.

### `TextScaleFactor`

Gets the positive user text scale, independently of display density, or nil when unavailable.

### `Theme`

Gets the preferred theme, or Unknown when unavailable.

## `SystemTheme`

Source:

- [`PlatformPreferences.gs`](../../Goo/Platform/PlatformPreferences.gs)

Identifies the platform's preferred application color theme.

### Values

- `Unknown`
- `Light`
- `Dark`
