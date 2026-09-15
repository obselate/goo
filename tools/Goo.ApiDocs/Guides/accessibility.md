## Use accessibility semantics

Set `Blob.Accessibility` to declare role, name, description, value, state, relationships, and composed-control actions. The model is backend-neutral. An `AccessibilityAdapter` maps the retained tree to a platform API.

Native primitives publish defaults: text, button, text entry, editor, and image. `Role.None` removes only its own node and keeps semantic descendants. `Hidden` removes the complete subtree. Display and visibility exclusion also remove a subtree.

Semantic IDs are stable for the mounted window lifetime. Adapters receive mutable retained node and tree views. Read each view again after an update. Call the adapter and route actions only on Goo's UI thread.

`AccessibilityTree` exposes `Root` and monotonic `Version`. Each `AccessibilityNode` exposes ID, role, name, value, state, bounds, actions, children, relationships, and editor `TextSnapshot`, selection, and caret. `AccessibilityRelationshipIds` exposes ordered ID lists plus an active descendant.

Replacing an adapter delivers the current retained tree to the replacement. A failed delivery retries once on a later UI update and exposes `Window.LastAccessibilityError`.

Use `ElementHandle` relationships only for mounted nodes in the same window. Hidden, flattened, detached, and foreign targets are omitted.

Route neutral actions with `new AccessibilityActionRequest(action)`. Use `SetValue`, `SetSelection`, and `Scroll` factories for payload actions. `Window.PerformAccessibilityAction` checks the advertised capability before routing built-in or declared actions.

Protected `TextEntry` nodes expose one bullet per extended grapheme cluster. Their value, selection, and caret use this masked semantic coordinate space. Copy and cut do not expose or remove protected text, while paste and `SetValue` remain available.

Text editors expose `TextSnapshot`, selection, and caret metadata. The snapshot is versioned and avoids a full document copy.

## Native desktop accessibility

Add the optional `Goo.Accessibility` package alongside `Goo`. Assign one adapter
per window before `Open`:

```gsharp
let window = Window{
  Title: "Messages",
  Root: Messages{},
  AccessibilityAdapter: NativeAccessibilityAdapter(),
}.Open()
```

`NativeAccessibilityAdapter.IsAvailable` checks whether the pinned native runtime
can load. `Open` reports a missing runtime or unavailable desktop platform with
`PlatformNotSupportedException`. The companion ships AccessKit C 0.23.0 for Linux
x64 (glibc 2.27), Windows x64/arm64, and macOS x64/arm64. The host platform must
also be supported by Goo's desktop renderer. Linux uses AT-SPI; Windows uses UI
Automation; macOS uses native Accessibility.

The adapter registers before the native window is shown. Close releases native
objects; reopening the same window creates a new native binding. Replacing the
adapter detaches it. A native replacement must be assigned while the window is
closed. `Dispose` detaches and permanently disables the adapter. After the window
has opened, these operations and `Update` require its owner UI thread. Embedded
hosts supply their own adapter. Existing custom adapters remain supported.

Native callbacks copy action data and post to the window. Removed nodes, stale
text ranges, unsupported actions, disabled controls, and modal-blocked windows
cannot receive those actions. Native node IDs remain stable until the Goo node
is removed. Updates emit only changed nodes, their text runs, and changed parent
child lists. The bridge creates no native objects or per-frame work when unused.
The native runtime remains loaded for the process lifetime because macOS installs
focus forwarding on the host window class.

Names, roles, states, live regions, relations, focus, numeric values, scroll
ranges, text, selection, and caret map from the retained tree. Selected list
items map to native list-box options. Selection and expansion use native click
semantics where the platform uses a toggle action. AccessKit's Linux bridge does
not expose generic custom-action menu entries; Windows and macOS can use those
entries for separate Select/Deselect commands. AccessKit supports one error-message
relation; additional error-message targets become descriptions. Use `ElementHandle.BeginFocusScope` with `FocusScopeOptions.Modal = true` to
contain input and background semantics for a mounted overlay. The accessibility
`Modal` metadata alone describes a scope without changing input policy.

Text offsets translate between Goo UTF-16 positions and AccessKit character
positions, including emoji and combining sequences. Protected entries expose
only their masked value. `SetSelection(start, length, caret)` preserves either
active endpoint; the two-argument overload continues to place the caret at the
end. Text geometry is supplied where Goo exposes a contiguous visual run;
wrapped or mixed-direction runs retain their text and selection when optional
character geometry is unavailable. Wayland does not expose global window
positions, so clients should use window-relative geometry.
