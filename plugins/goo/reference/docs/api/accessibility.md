# Accessibility API

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/Accessibility`](../../Goo/Accessibility)

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

## `Accessibility`

Source:

- [`Accessibility.gs`](../../Goo/Accessibility/Accessibility.gs)

Defines accessibility data for a Blob without selecting a platform backend.

### `new`

Initializes a neutral semantic declaration.

### `Actions`

Gets or sets actions advertised by a composed control.

### `Atomic`

Gets whether a live-region update is atomic when explicitly specified.

### `Busy`

Gets whether the item is busy when explicitly specified.

### `Checked`

Gets the check state.

### `CustomRole`

Gets the platform-specific custom role name for AccessibilityRole.Custom.

### `Description`

Gets the accessible description.

### `Expanded`

Gets whether the item is expanded when explicitly specified.

### `HasPopup`

Gets whether the item opens a popup when explicitly specified.

### `Hidden`

Gets whether this element and its descendants are excluded from the semantic tree.

### `Invalid`

Gets whether the item is invalid when explicitly specified.

### `Level`

Gets the heading level when explicitly specified.

### `Live`

Gets live-region announcement behavior.

### `Modal`

Gets whether the item is modal when explicitly specified.

### `MultiSelectable`

Gets whether the item permits multiple selection when explicitly specified.

### `Multiline`

Gets whether the item is multiline when explicitly specified.

### `Name`

Gets the accessible name.

### `OnAction`

Gets the handler for advertised composed-control actions.

### `Orientation`

Gets the orientation when explicitly specified.

### `Range`

Gets the optional numeric value metadata.

### `ReadOnly`

Gets whether the item is read-only when explicitly specified.

### `Relationships`

Gets semantic relationships based on mounted ElementHandle identity.

### `Required`

Gets whether the item is required when explicitly specified.

### `Role`

Gets the role. Auto selects a neutral primitive default when one exists.

### `Selected`

Gets whether the item is selected when explicitly specified.

### `Value`

Gets the string value.

## `AccessibilityAction`

Source:

- [`Accessibility.gs`](../../Goo/Accessibility/Accessibility.gs)

Selects a command routed from an accessibility adapter.

### Values

- `Focus`
- `Activate`
- `SetValue`
- `SetSelection`
- `Increment`
- `Decrement`
- `Select`
- `Deselect`
- `Expand`
- `Collapse`
- `Scroll`

## `AccessibilityActionRequest`

Source:

- [`Accessibility.gs`](../../Goo/Accessibility/Accessibility.gs)

Carries optional data for one accessibility action request.

### `new(AccessibilityAction)`

Initializes an action request with neutral optional data.

- `action`: The requested operation.

### `Scroll(float64,float64)`

Creates a scroll request.

- `x`: The finite nonnegative horizontal logical target.
- `y`: The finite nonnegative vertical logical target.

### `SetSelection(int32,int32)`

Creates a selection-change request.

- `start`: The nonnegative UTF-16 start in the exposed semantic value.
- `length`: The nonnegative UTF-16 length in the exposed semantic value.

### `SetValue(string)`

Creates a value-change request.

- `value`: The text to apply.

### `Action`

Gets the requested operation.

### `ScrollX`

Gets the horizontal logical target supplied for Scroll.

### `ScrollY`

Gets the vertical logical target supplied for Scroll.

### `SelectionLength`

Gets the UTF-16 selection length in the exposed semantic value supplied for SetSelection.

### `SelectionStart`

Gets the UTF-16 selection start in the exposed semantic value supplied for SetSelection.

### `Value`

Gets text supplied for SetValue.

## `AccessibilityAdapter`

Source:

- [`Accessibility.gs`](../../Goo/Accessibility/Accessibility.gs)

Receives retained semantic-tree updates from a Window.

### `Update(AccessibilityTree)`

Receives the current mutable retained semantic tree on the UI thread.

- `tree`: The current retained semantic tree.

## `AccessibilityChecked`

Source:

- [`Accessibility.gs`](../../Goo/Accessibility/Accessibility.gs)

Describes a checkable widget state.

### Values

- `Unspecified`
- `False`
- `True`
- `Mixed`

## `AccessibilityId`

Source:

- [`Accessibility.gs`](../../Goo/Accessibility/Accessibility.gs)

Identifies one semantic node by its stable Value for one mounted Window lifetime.

## `AccessibilityLive`

Source:

- [`Accessibility.gs`](../../Goo/Accessibility/Accessibility.gs)

Selects the announcement priority for a live region.

### Values

- `Off`
- `Polite`
- `Assertive`

## `AccessibilityNode`

Source:

- [`Accessibility.gs`](../../Goo/Accessibility/Accessibility.gs)

Represents one retained semantic node. Adapters may retain this mutable view.

### `Actions`

Gets supported actions in deterministic order.

### `Atomic`

Gets the resolved atomic live-region state.

### `Bounds`

Gets the transformed border bounds in window logical coordinates.

### `Busy`

Gets the resolved busy state.

### `Caret`

Gets the UTF-16 active caret offset in the exposed semantic value, when this node has editable text.

### `Checked`

Gets the resolved check state.

### `Children`

Gets published semantic children in deterministic source order.

### `CustomRole`

Gets the custom role text when Role is Custom.

### `Description`

Gets the resolved description.

### `Disabled`

Gets the inherited disabled state.

### `Expanded`

Gets the resolved expanded state.

### `Focused`

Gets whether this node owns keyboard focus.

### `HasPopup`

Gets the resolved popup state.

### `Id`

Gets the stable public semantic identifier.

### `Invalid`

Gets the resolved invalid state.

### `Level`

Gets the resolved heading level.

### `Live`

Gets the resolved live-region behavior.

### `Modal`

Gets the resolved modal state.

### `MultiSelectable`

Gets the resolved multiselectable state.

### `Multiline`

Gets the resolved multiline state.

### `Name`

Gets the resolved name.

### `Orientation`

Gets the resolved orientation.

### `ReadOnly`

Gets the resolved read-only state.

### `Relationships`

Gets resolved public-ID relationships.

### `Required`

Gets the resolved required state.

### `Role`

Gets the resolved role.

### `Selected`

Gets the resolved selected state.

### `SelectionLength`

Gets the UTF-16 selection length in the exposed semantic value, when this node has editable text.

### `SelectionStart`

Gets the UTF-16 selection start in the exposed semantic value, when this node has editable text.

### `TextSnapshot`

Gets the immutable editor text snapshot, when this node is a text editor.

### `Value`

Gets the resolved string value.

### `ValueMaximum`

Gets the resolved numeric maximum.

### `ValueMinimum`

Gets the resolved numeric minimum.

### `ValueNow`

Gets the resolved numeric value.

### `ValueText`

Gets the resolved localized value text.

## `AccessibilityOrientation`

Source:

- [`Accessibility.gs`](../../Goo/Accessibility/Accessibility.gs)

Selects a widget orientation.

### Values

- `Unspecified`
- `Horizontal`
- `Vertical`

## `AccessibilityRelationshipIds`

Source:

- [`Accessibility.gs`](../../Goo/Accessibility/Accessibility.gs)

Reports resolved relationship IDs for one retained semantic node.

### `ActiveDescendant`

Gets the active descendant target, when published.

### `Controls`

Gets controlled targets in declaration order.

### `DescribedBy`

Gets description targets in declaration order.

### `ErrorMessage`

Gets error-message targets in declaration order.

### `FlowTo`

Gets flow targets in declaration order.

### `LabelledBy`

Gets labeling targets in declaration order.

### `Owns`

Gets owned targets in declaration order.

## `AccessibilityRelationships`

Source:

- [`Accessibility.gs`](../../Goo/Accessibility/Accessibility.gs)

Defines stable mounted-element relationships for one semantic declaration.

### `new`

Initializes an empty relationship declaration.

### `ActiveDescendant`

Gets or sets the active descendant, when one is mounted.

### `Controls`

Gets or sets the elements controlled by this element.

### `DescribedBy`

Gets or sets the elements that describe this element.

### `ErrorMessage`

Gets or sets the elements that describe a current error.

### `FlowTo`

Gets or sets the next logical reading targets for this element.

### `LabelledBy`

Gets or sets the elements that label this element.

### `Owns`

Gets or sets the elements owned by this element.

## `AccessibilityRole`

Source:

- [`Accessibility.gs`](../../Goo/Accessibility/Accessibility.gs)

Selects the semantic role exposed to an accessibility adapter.

### Values

- `Auto`
- `None`
- `Generic`
- `Text`
- `Button`
- `TextInput`
- `TextEditor`
- `Image`
- `Checkbox`
- `Radio`
- `Switch`
- `Slider`
- `SpinButton`
- `ScrollBar`
- `ProgressBar`
- `Group`
- `List`
- `ListItem`
- `Menu`
- `MenuItem`
- `TabList`
- `Tab`
- `Dialog`
- `Alert`
- `Heading`
- `Link`
- `Tree`
- `TreeItem`
- `Grid`
- `GridCell`
- `Row`
- `ColumnHeader`
- `RowHeader`
- `ComboBox`
- `SearchBox`
- `Status`
- `Custom`

## `AccessibilityTree`

Source:

- [`Accessibility.gs`](../../Goo/Accessibility/Accessibility.gs)

Represents the retained semantic tree delivered to an AccessibilityAdapter.

### `Root`

Gets the published root, or nil when no visible semantic node exists.

### `Version`

Gets the monotonic version for retained-tree mutations.

## `AccessibilityValue`

Source:

- [`Accessibility.gs`](../../Goo/Accessibility/Accessibility.gs)

Describes one range value exposed by a semantic widget.

### `new`

Initializes an empty range value.

### `Maximum`

Gets the maximum numeric value, when one exists.

### `Minimum`

Gets the minimum numeric value, when one exists.

### `Now`

Gets the current numeric value, when one exists.

### `Text`

Gets the localized value text, when one exists.
