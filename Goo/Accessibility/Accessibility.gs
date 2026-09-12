package Goo

import System
import System.Collections.Generic

/// Selects the semantic role exposed to an accessibility adapter.
public enum AccessibilityRole {
  Auto; None; Generic; Text; Button; TextInput; TextEditor; Image; Checkbox; Radio; Switch;
  Slider; SpinButton; ScrollBar; ProgressBar; Group; List; ListItem; Menu; MenuItem;
  TabList; Tab; Dialog; Alert; Heading; Link; Tree; TreeItem; Grid; GridCell; Row;
  ColumnHeader; RowHeader; ComboBox; SearchBox; Status; Custom;
}

/// Describes a checkable widget state.
public enum AccessibilityChecked { Unspecified; False; True; Mixed }

/// Selects a widget orientation.
public enum AccessibilityOrientation { Unspecified; Horizontal; Vertical }

/// Selects the announcement priority for a live region.
public enum AccessibilityLive { Off; Polite; Assertive }

/// Selects a command routed from an accessibility adapter.
public enum AccessibilityAction {
  Focus; Activate; SetValue; SetSelection; Increment; Decrement; Select; Deselect; Expand;
  Collapse; Scroll;
}

/// Identifies one semantic node by its stable Value for one mounted Window lifetime.
public data struct AccessibilityId(Value int64) { }

/// Describes one range value exposed by a semantic widget.
public class AccessibilityValue {
  private var now float64?
  private var minimum float64?
  private var maximum float64?
  private var text string

  /// Gets the current numeric value, when one exists.
  public prop Now float64? { get -> now init -> now = validateOptionalNumber(value, "Now") }
  /// Gets the minimum numeric value, when one exists.
  public prop Minimum float64? { get -> minimum init -> minimum = validateOptionalNumber(value, "Minimum") }
  /// Gets the maximum numeric value, when one exists.
  public prop Maximum float64? { get -> maximum init -> maximum = validateOptionalNumber(value, "Maximum") }
  /// Gets the localized value text, when one exists.
  public prop Text string{ get -> text init -> text = requireString(value, "Text") }

  /// Initializes an empty range value.
  public init() { text = "" }

  internal func Validate() {
    if let low = minimum {
      if let high = maximum {
        if low > high { throw ArgumentException("Minimum cannot exceed Maximum") }
      }
    }
    if let current = now {
      if let low = minimum {
        if current < low { throw ArgumentException("Now is below Minimum") }
      }
      if let high = maximum {
        if current > high { throw ArgumentException("Now is above Maximum") }
      }
    }
  }
}

/// Defines stable mounted-element relationships for one semantic declaration.
public class AccessibilityRelationships {
  private var labelledBy []ElementHandle
  private var describedBy []ElementHandle
  private var controls []ElementHandle
  private var owns []ElementHandle
  private var flowTo []ElementHandle
  private var errorMessage []ElementHandle
  private var activeDescendant ElementHandle?

  /// Gets or sets the elements that label this element.
  public prop LabelledBy []ElementHandle{
    get -> copyValues(labelledBy)
    init -> labelledBy = cloneHandles(value, "LabelledBy")
  }
  /// Gets or sets the elements that describe this element.
  public prop DescribedBy []ElementHandle{
    get -> copyValues(describedBy)
    init -> describedBy = cloneHandles(value, "DescribedBy")
  }
  /// Gets or sets the elements controlled by this element.
  public prop Controls []ElementHandle{
    get -> copyValues(controls)
    init -> controls = cloneHandles(value, "Controls")
  }
  /// Gets or sets the elements owned by this element.
  public prop Owns []ElementHandle{
    get -> copyValues(owns)
    init -> owns = cloneHandles(value, "Owns")
  }
  /// Gets or sets the next logical reading targets for this element.
  public prop FlowTo []ElementHandle{
    get -> copyValues(flowTo)
    init -> flowTo = cloneHandles(value, "FlowTo")
  }
  /// Gets or sets the elements that describe a current error.
  public prop ErrorMessage []ElementHandle{
    get -> copyValues(errorMessage)
    init -> errorMessage = cloneHandles(value, "ErrorMessage")
  }
  /// Gets or sets the active descendant, when one is mounted.
  public prop ActiveDescendant ElementHandle? { get -> activeDescendant init -> activeDescendant = value }

  internal prop RawLabelledBy []ElementHandle{ get -> labelledBy }
  internal prop RawDescribedBy []ElementHandle{ get -> describedBy }
  internal prop RawControls []ElementHandle{ get -> controls }
  internal prop RawOwns []ElementHandle{ get -> owns }
  internal prop RawFlowTo []ElementHandle{ get -> flowTo }
  internal prop RawErrorMessage []ElementHandle{ get -> errorMessage }

  internal func Validate() {
    validateHandles(labelledBy, "LabelledBy")
    validateHandles(describedBy, "DescribedBy")
    validateHandles(controls, "Controls")
    validateHandles(owns, "Owns")
    validateHandles(flowTo, "FlowTo")
    validateHandles(errorMessage, "ErrorMessage")
  }

  /// Initializes an empty relationship declaration.
  public init() {
    labelledBy = AccessibilityEmpty.Handles
    describedBy = AccessibilityEmpty.Handles
    controls = AccessibilityEmpty.Handles
    owns = AccessibilityEmpty.Handles
    flowTo = AccessibilityEmpty.Handles
    errorMessage = AccessibilityEmpty.Handles
  }
}

/// Defines accessibility data for a Blob without selecting a platform backend.
public class Accessibility {
  private var actions []AccessibilityAction
  private var customRole string
  private var name string
  private var description string
  private var value string

  /// Gets the role. Auto selects a neutral primitive default when one exists.
  public prop Role AccessibilityRole{ get; init; }
  /// Gets the platform-specific custom role name for AccessibilityRole.Custom.
  public prop CustomRole string{ get -> customRole init -> customRole = requireString(value, "CustomRole") }
  /// Gets the accessible name.
  public prop Name string{ get -> name init -> name = requireString(value, "Name") }
  /// Gets the accessible description.
  public prop Description string{ get -> description init -> description = requireString(value, "Description") }
  /// Gets the string value.
  public prop Value string{ get -> value init -> this.value = requireString(value, "Value") }
  /// Gets the optional numeric value metadata.
  public prop Range AccessibilityValue? { get; init; }
  /// Gets the check state.
  public prop Checked AccessibilityChecked{ get; init; }
  /// Gets whether the item is selected when explicitly specified.
  public prop Selected bool? { get; init; }
  /// Gets whether the item is expanded when explicitly specified.
  public prop Expanded bool? { get; init; }
  /// Gets whether the item is read-only when explicitly specified.
  public prop ReadOnly bool? { get; init; }
  /// Gets whether the item is required when explicitly specified.
  public prop Required bool? { get; init; }
  /// Gets whether the item is invalid when explicitly specified.
  public prop Invalid bool? { get; init; }
  /// Gets whether the item is busy when explicitly specified.
  public prop Busy bool? { get; init; }
  /// Gets the heading level when explicitly specified.
  public prop Level int32? { get; init; }
  /// Gets the orientation when explicitly specified.
  public prop Orientation AccessibilityOrientation{ get; init; }
  /// Gets whether the item is modal when explicitly specified.
  public prop Modal bool? { get; init; }
  /// Gets whether the item is multiline when explicitly specified.
  public prop Multiline bool? { get; init; }
  /// Gets whether the item permits multiple selection when explicitly specified.
  public prop MultiSelectable bool? { get; init; }
  /// Gets whether the item opens a popup when explicitly specified.
  public prop HasPopup bool? { get; init; }
  /// Gets live-region announcement behavior.
  public prop Live AccessibilityLive{ get; init; }
  /// Gets whether a live-region update is atomic when explicitly specified.
  public prop Atomic bool? { get; init; }
  /// Gets semantic relationships based on mounted ElementHandle identity.
  public prop Relationships AccessibilityRelationships? { get; init; }
  /// Gets whether this element and its descendants are excluded from the semantic tree.
  public prop Hidden bool{ get; init; }
  /// Gets or sets actions advertised by a composed control.
  public prop Actions []AccessibilityAction{
    get -> copyValues(actions)
    init -> actions = cloneActions(value)
  }
  /// Gets the handler for advertised composed-control actions.
  public prop OnAction((AccessibilityActionRequest) -> bool)? { get; init; }

  internal prop RawActions []AccessibilityAction{ get -> actions }

  /// Initializes a neutral semantic declaration.
  public init() {
    Role = AccessibilityRole.Auto
    customRole = ""
    name = ""
    value = ""
    description = ""
    Checked = AccessibilityChecked.Unspecified
    Orientation = AccessibilityOrientation.Unspecified
    Live = AccessibilityLive.Off
    actions = AccessibilityEmpty.Actions
  }

  internal func Validate() {
    validateRole(Role)
    validateChecked(Checked)
    validateOrientation(Orientation)
    validateLive(Live)
    if Role == AccessibilityRole.Custom && CustomRole == "" {
      throw ArgumentException("CustomRole is required for AccessibilityRole.Custom")
    }
    if let heading = Level {
      if heading <= 0 { throw ArgumentOutOfRangeException("Level") }
    }
    Range?.Validate()
    Relationships?.Validate()
    if actions.Length != 0 && OnAction == nil {
      throw ArgumentException("OnAction is required when Actions is specified")
    }
    if actions.Length == 0 && OnAction != nil {
      throw ArgumentException("Actions is required when OnAction is specified")
    }
  }
}

/// Carries optional data for one accessibility action request.
public class AccessibilityActionRequest {
  private var action AccessibilityAction
  private var value string
  private var selectionStart int32
  private var selectionLength int32
  private var scrollX float64
  private var scrollY float64

  /// Gets the requested operation.
  public prop Action AccessibilityAction{ get -> action }
  /// Gets text supplied for SetValue.
  public prop Value string{ get -> value }
  /// Gets the UTF-16 selection start in the exposed semantic value supplied for SetSelection.
  public prop SelectionStart int32{
    get -> selectionStart
  }
  /// Gets the UTF-16 selection length in the exposed semantic value supplied for SetSelection.
  public prop SelectionLength int32{
    get -> selectionLength
  }
  /// Gets the horizontal logical target supplied for Scroll.
  public prop ScrollX float64{ get -> scrollX }
  /// Gets the vertical logical target supplied for Scroll.
  public prop ScrollY float64{ get -> scrollY }

  /// Initializes an action request with neutral optional data.
  /// @param action The requested operation.
  public init(action AccessibilityAction) {
    this.action = validateNeutralAction(action)
    value = ""
  }

  shared {
    /// Creates a value-change request.
    /// @param value The text to apply.
    public func SetValue(value string) AccessibilityActionRequest {
      let request = AccessibilityActionRequest(AccessibilityAction.Focus)
      request.action = AccessibilityAction.SetValue
      request.value = requireString(value, "value")
      return request
    }

    /// Creates a selection-change request.
    /// @param start The nonnegative UTF-16 start in the exposed semantic value.
    /// @param length The nonnegative UTF-16 length in the exposed semantic value.
    public func SetSelection(start int32, length int32) AccessibilityActionRequest {
      if start < 0 { throw ArgumentOutOfRangeException("start") }
      if length < 0 { throw ArgumentOutOfRangeException("length") }
      if start > Int32.MaxValue - length { throw ArgumentOutOfRangeException("length") }
      let request = AccessibilityActionRequest(AccessibilityAction.Focus)
      request.action = AccessibilityAction.SetSelection
      request.selectionStart = start
      request.selectionLength = length
      return request
    }

    /// Creates a scroll request.
    /// @param x The finite nonnegative horizontal logical target.
    /// @param y The finite nonnegative vertical logical target.
    public func Scroll(x float64, y float64) AccessibilityActionRequest {
      let request = AccessibilityActionRequest(AccessibilityAction.Focus)
      request.action = AccessibilityAction.Scroll
      request.scrollX = validateScroll(x, "x")
      request.scrollY = validateScroll(y, "y")
      return request
    }
  }
}

/// Receives retained semantic-tree updates from a Window.
public interface AccessibilityAdapter {
  /// Receives the current mutable retained semantic tree on the UI thread.
  /// @param tree The current retained semantic tree.
  func Update(tree AccessibilityTree);
}

/// Reports resolved relationship IDs for one retained semantic node.
public interface AccessibilityRelationshipIds {
  /// Gets labeling targets in declaration order.
  prop LabelledBy IReadOnlyList[AccessibilityId] { get; }
  /// Gets description targets in declaration order.
  prop DescribedBy IReadOnlyList[AccessibilityId] { get; }
  /// Gets controlled targets in declaration order.
  prop Controls IReadOnlyList[AccessibilityId] { get; }
  /// Gets owned targets in declaration order.
  prop Owns IReadOnlyList[AccessibilityId] { get; }
  /// Gets flow targets in declaration order.
  prop FlowTo IReadOnlyList[AccessibilityId] { get; }
  /// Gets error-message targets in declaration order.
  prop ErrorMessage IReadOnlyList[AccessibilityId] { get; }
  /// Gets the active descendant target, when published.
  prop ActiveDescendant AccessibilityId? { get; }
}

internal class RetainedAccessibilityRelationshipIds : AccessibilityRelationshipIds {
  private var labelledBy []AccessibilityId
  private var describedBy []AccessibilityId
  private var controls []AccessibilityId
  private var owns []AccessibilityId
  private var flowTo []AccessibilityId
  private var errorMessage []AccessibilityId
  private var activeDescendant AccessibilityId?

  public prop LabelledBy IReadOnlyList[AccessibilityId]{ get -> labelledBy }
  public prop DescribedBy IReadOnlyList[AccessibilityId]{ get -> describedBy }
  public prop Controls IReadOnlyList[AccessibilityId]{ get -> controls }
  public prop Owns IReadOnlyList[AccessibilityId]{ get -> owns }
  public prop FlowTo IReadOnlyList[AccessibilityId]{ get -> flowTo }
  public prop ErrorMessage IReadOnlyList[AccessibilityId]{ get -> errorMessage }
  public prop ActiveDescendant AccessibilityId? { get -> activeDescendant }

  internal init() {
    labelledBy = AccessibilityEmpty.Ids
    describedBy = AccessibilityEmpty.Ids
    controls = AccessibilityEmpty.Ids
    owns = AccessibilityEmpty.Ids
    flowTo = AccessibilityEmpty.Ids
    errorMessage = AccessibilityEmpty.Ids
  }

  internal func Apply(labelledBy []AccessibilityId, describedBy []AccessibilityId,
    controls []AccessibilityId, owns []AccessibilityId, flowTo []AccessibilityId,
    errorMessage []AccessibilityId, activeDescendant AccessibilityId?) bool{
      if sameArray(this.labelledBy, labelledBy) && sameArray(this.describedBy, describedBy)
        && sameArray(this.controls, controls) && sameArray(this.owns, owns)
        && sameArray(this.flowTo, flowTo) && sameArray(this.errorMessage, errorMessage)
        && sameOptionalId(this.activeDescendant, activeDescendant) {
          return false
        }
      this.labelledBy = labelledBy
      this.describedBy = describedBy
      this.controls = controls
      this.owns = owns
      this.flowTo = flowTo
      this.errorMessage = errorMessage
      this.activeDescendant = activeDescendant
      return true
    }

  internal func Matches(manager AccessibilityManager, labelledBy []ElementHandle,
    describedBy []ElementHandle, controls []ElementHandle, owns []ElementHandle,
    flowTo []ElementHandle, errorMessage []ElementHandle, activeDescendant ElementHandle?) bool -> matches(manager, this.labelledBy, labelledBy) && matches(manager, this.describedBy,
      describedBy) && matches(manager, this.controls, controls) && matches(manager, this.owns, owns)
    && matches(manager, this.flowTo, flowTo) && matches(manager, this.errorMessage, errorMessage)
    && sameOptionalId(this.activeDescendant, manager.IdFor(activeDescendant))

  private func matches(manager AccessibilityManager, current []AccessibilityId,
    handles []ElementHandle) bool{
      var index int32
      for handle in handles {
        if let id = manager.IdFor(handle) {
          if index >= current.Length || current[index] != id { return false }
          index++
        }
      }
      return index == current.Length
    }
}

/// Represents one retained semantic node. Adapters may retain this mutable view.
public interface AccessibilityNode {
  /// Gets the stable public semantic identifier.
  prop Id AccessibilityId { get; }
  /// Gets the resolved role.
  prop Role AccessibilityRole { get; }
  /// Gets the custom role text when Role is Custom.
  prop CustomRole string { get; }
  /// Gets the resolved name.
  prop Name string { get; }
  /// Gets the resolved description.
  prop Description string { get; }
  /// Gets the resolved string value.
  prop Value string { get; }
  /// Gets the resolved localized value text.
  prop ValueText string { get; }
  /// Gets the resolved numeric value.
  prop ValueNow float64? { get; }
  /// Gets the resolved numeric minimum.
  prop ValueMinimum float64? { get; }
  /// Gets the resolved numeric maximum.
  prop ValueMaximum float64? { get; }
  /// Gets the resolved check state.
  prop Checked AccessibilityChecked { get; }
  /// Gets the resolved selected state.
  prop Selected bool? { get; }
  /// Gets the resolved expanded state.
  prop Expanded bool? { get; }
  /// Gets the inherited disabled state.
  prop Disabled bool { get; }
  /// Gets the resolved read-only state.
  prop ReadOnly bool? { get; }
  /// Gets the resolved required state.
  prop Required bool? { get; }
  /// Gets the resolved invalid state.
  prop Invalid bool? { get; }
  /// Gets the resolved busy state.
  prop Busy bool? { get; }
  /// Gets the resolved heading level.
  prop Level int32? { get; }
  /// Gets the resolved orientation.
  prop Orientation AccessibilityOrientation { get; }
  /// Gets the resolved modal state.
  prop Modal bool? { get; }
  /// Gets the resolved multiline state.
  prop Multiline bool? { get; }
  /// Gets the resolved multiselectable state.
  prop MultiSelectable bool? { get; }
  /// Gets the resolved popup state.
  prop HasPopup bool? { get; }
  /// Gets the resolved live-region behavior.
  prop Live AccessibilityLive { get; }
  /// Gets the resolved atomic live-region state.
  prop Atomic bool? { get; }
  /// Gets whether this node owns keyboard focus.
  prop Focused bool { get; }
  /// Gets the transformed border bounds in window logical coordinates.
  prop Bounds ElementRect { get; }
  /// Gets the immutable editor text snapshot, when this node is a text editor.
  prop TextSnapshot TextSnapshot? { get; }
  /// Gets the UTF-16 selection start in the exposed semantic value, when this node has editable text.
  prop SelectionStart int32? { get; }
  /// Gets the UTF-16 selection length in the exposed semantic value, when this node has editable text.
  prop SelectionLength int32? { get; }
  /// Gets the UTF-16 active caret offset in the exposed semantic value, when this node has editable text.
  prop Caret int32? { get; }
  /// Gets supported actions in deterministic order.
  prop Actions IReadOnlyList[AccessibilityAction] { get; }
  /// Gets published semantic children in deterministic source order.
  prop Children IReadOnlyList[AccessibilityNode] { get; }
  /// Gets resolved public-ID relationships.
  prop Relationships AccessibilityRelationshipIds { get; }
}

internal class RetainedAccessibilityNode : AccessibilityNode {
  private var id AccessibilityId
  private var role AccessibilityRole
  private var customRole string
  private var name string
  private var description string
  private var value string
  private var valueText string
  private var valueNow float64?
  private var valueMinimum float64?
  private var valueMaximum float64?
  private var checked AccessibilityChecked
  private var selected bool?
  private var expanded bool?
  private var disabled bool
  private var readOnly bool?
  private var required bool?
  private var invalid bool?
  private var busy bool?
  private var level int32?
  private var orientation AccessibilityOrientation
  private var modal bool?
  private var multiline bool?
  private var multiSelectable bool?
  private var hasPopup bool?
  private var live AccessibilityLive
  private var atomic bool?
  private var focused bool
  private var bounds ElementRect
  private var textSnapshot TextSnapshot?
  private var selectionStart int32?
  private var selectionLength int32?
  private var caret int32?
  private var actions List[AccessibilityAction]?
  private var children List[AccessibilityNode]?
  private var relationships RetainedAccessibilityRelationshipIds?

  public prop Id AccessibilityId{ get -> id }
  public prop Role AccessibilityRole{ get -> role }
  public prop CustomRole string{ get -> customRole }
  public prop Name string{ get -> name }
  public prop Description string{ get -> description }
  public prop Value string{ get -> value }
  public prop ValueText string{ get -> valueText }
  public prop ValueNow float64? { get -> valueNow }
  public prop ValueMinimum float64? { get -> valueMinimum }
  public prop ValueMaximum float64? { get -> valueMaximum }
  public prop Checked AccessibilityChecked{ get -> checked }
  public prop Selected bool? { get -> selected }
  public prop Expanded bool? { get -> expanded }
  public prop Disabled bool{ get -> disabled }
  public prop ReadOnly bool? { get -> readOnly }
  public prop Required bool? { get -> required }
  public prop Invalid bool? { get -> invalid }
  public prop Busy bool? { get -> busy }
  public prop Level int32? { get -> level }
  public prop Orientation AccessibilityOrientation{ get -> orientation }
  public prop Modal bool? { get -> modal }
  public prop Multiline bool? { get -> multiline }
  public prop MultiSelectable bool? { get -> multiSelectable }
  public prop HasPopup bool? { get -> hasPopup }
  public prop Live AccessibilityLive{ get -> live }
  public prop Atomic bool? { get -> atomic }
  public prop Focused bool{ get -> focused }
  public prop Bounds ElementRect{ get -> bounds }
  public prop TextSnapshot TextSnapshot? { get -> textSnapshot }
  public prop SelectionStart int32? { get -> selectionStart }
  public prop SelectionLength int32? { get -> selectionLength }
  public prop Caret int32? { get -> caret }
  public prop Actions IReadOnlyList[AccessibilityAction]{
    get -> if let values = actions { values } else { AccessibilityEmpty.Actions }
  }
  public prop Children IReadOnlyList[AccessibilityNode]{
    get -> if let values = children { values } else { AccessibilityEmpty.Nodes }
  }
  public prop Relationships AccessibilityRelationshipIds{
    get -> if let value = relationships { value } else { AccessibilityEmpty.RelationshipIds }
  }

  internal init(id AccessibilityId) {
    this.id = id
    customRole = ""
    name = ""
    description = ""
    value = ""
    valueText = ""
  }

  internal func Apply(role AccessibilityRole, customRole string, name string, description string,
    value string, valueText string, valueNow float64?, valueMinimum float64?, valueMaximum float64?,
    textDocument TextDocument?, selectionStart int32?, selectionLength int32?, caret int32?,
    checked AccessibilityChecked, selected bool?, expanded bool?, disabled bool, readOnly bool?,
    required bool?, invalid bool?, busy bool?, level int32?, orientation AccessibilityOrientation,
    modal bool?, multiline bool?, multiSelectable bool?, hasPopup bool?, live AccessibilityLive,
    atomic bool?, focused bool, bounds ElementRect, actionMask int32) bool{
      let changed = this.role != role || this.customRole != customRole || this.name != name
        || this.description != description || this.value != value || this.valueText != valueText
        || this.valueNow != valueNow || this.valueMinimum != valueMinimum
        || this.valueMaximum != valueMaximum || this.selectionStart != selectionStart
        || this.selectionLength != selectionLength || this.caret != caret
        || !snapshotMatches(textDocument)
        || this.checked != checked || this.selected != selected
        || this.expanded != expanded || this.disabled != disabled || this.readOnly != readOnly
        || this.required != required || this.invalid != invalid || this.busy != busy
        || this.level != level || this.orientation != orientation || this.modal != modal
        || this.multiline != multiline || this.multiSelectable != multiSelectable
        || this.hasPopup != hasPopup || this.live != live || this.atomic != atomic
        || this.focused != focused || !sameAccessibilityRect(this.bounds, bounds) || !sameActionMask(actionMask)
      if !changed { return false }
      this.role = role
      this.customRole = customRole
      this.name = name
      this.description = description
      this.value = value
      this.valueText = valueText
      this.valueNow = valueNow
      this.valueMinimum = valueMinimum
      this.valueMaximum = valueMaximum
      updateTextSnapshot(textDocument)
      this.selectionStart = selectionStart
      this.selectionLength = selectionLength
      this.caret = caret
      this.checked = checked
      this.selected = selected
      this.expanded = expanded
      this.disabled = disabled
      this.readOnly = readOnly
      this.required = required
      this.invalid = invalid
      this.busy = busy
      this.level = level
      this.orientation = orientation
      this.modal = modal
      this.multiline = multiline
      this.multiSelectable = multiSelectable
      this.hasPopup = hasPopup
      this.live = live
      this.atomic = atomic
      this.focused = focused
      this.bounds = bounds
      setActions(actionMask)
      return true
    }

  private func updateTextSnapshot(document TextDocument?) {
    if document == nil {
      textSnapshot = nil
      return
    }
    if textSnapshot == nil || textSnapshot!!.Version != document.Version {
      textSnapshot = document.Snapshot()
    }
  }

  private func snapshotMatches(document TextDocument?) bool {
    if document == nil { return textSnapshot == nil }
    return textSnapshot != nil && textSnapshot!!.Version == document.Version
  }

  internal func SetChildren(values List[AccessibilityNode]) bool {
    if sameAccessibilityNodes(children, values) { return false }
    if values.Count == 0 {
      children = nil
      return true
    }
    if children == nil { children = List[AccessibilityNode]() }
    children!!.Clear()
    children!!.AddRange(values)
    return true
  }

  internal func ApplyRelationships(labelledBy []AccessibilityId, describedBy []AccessibilityId,
    controls []AccessibilityId, owns []AccessibilityId, flowTo []AccessibilityId,
    errorMessage []AccessibilityId, activeDescendant AccessibilityId?) bool{
      if labelledBy.Length == 0 && describedBy.Length == 0 && controls.Length == 0 && owns.Length == 0
        && flowTo.Length == 0 && errorMessage.Length == 0 && activeDescendant == nil {
          if relationships == nil { return false }
          relationships = nil
          return true
        }
      if relationships == nil { relationships = RetainedAccessibilityRelationshipIds() }
      return relationships!!.Apply(labelledBy, describedBy, controls, owns, flowTo, errorMessage,
        activeDescendant)
    }

  internal func RelationshipsMatch(manager AccessibilityManager,
    declaration AccessibilityRelationships) bool{
      if let current = relationships {
        return current.Matches(manager, declaration.RawLabelledBy, declaration.RawDescribedBy,
          declaration.RawControls, declaration.RawOwns, declaration.RawFlowTo,
          declaration.RawErrorMessage, declaration.ActiveDescendant)
      }
      return !manager.HasResolved(declaration.RawLabelledBy)
        && !manager.HasResolved(declaration.RawDescribedBy)
        && !manager.HasResolved(declaration.RawControls) && !manager.HasResolved(declaration.RawOwns)
        && !manager.HasResolved(declaration.RawFlowTo) && !manager.HasResolved(declaration.RawErrorMessage)
        && manager.IdFor(declaration.ActiveDescendant) == nil
    }

  internal func Supports(action AccessibilityAction) bool {
    guard let values = actions else { return false }
    return values.Contains(action)
  }

  private func sameActionMask(mask int32) bool {
    var count int32
    for value in int32(AccessibilityAction.Focus) ... int32(AccessibilityAction.Scroll) + 1 {
      let action = AccessibilityAction(value)
      if (mask & actionBit(action)) != 0 { count++ }
    }
    if actions == nil { return count == 0 }
    if actions!!.Count != count { return false }
    for action in actions!! {
      if (mask & actionBit(action)) == 0 { return false }
    }
    return true
  }

  private func setActions(mask int32) {
    if mask == 0 {
      actions = nil
      return
    }
    if actions == nil { actions = List[AccessibilityAction]() }
    actions!!.Clear()
    for value in int32(AccessibilityAction.Focus) ... int32(AccessibilityAction.Scroll) + 1 {
      let action = AccessibilityAction(value)
      if (mask & actionBit(action)) != 0 { actions!!.Add(action) }
    }
  }
}

/// Represents the retained semantic tree delivered to an AccessibilityAdapter.
public interface AccessibilityTree {
  /// Gets the published root, or nil when no visible semantic node exists.
  prop Root AccessibilityNode? { get; }
  /// Gets the monotonic version for retained-tree mutations.
  prop Version int64 { get; }
}

internal class RetainedAccessibilityTree : AccessibilityTree {
  private var root AccessibilityNode?
  private var version int64

  public prop Root AccessibilityNode? { get -> root }
  public prop Version int64{ get -> version }

  internal init() {
  }

  internal func SetRoot(root AccessibilityNode?) bool {
    if this.root == root { return false }
    this.root = root
    return true
  }

  internal func MarkChanged() {
    version++
  }
}

internal class AccessibilityEmpty {
  shared {
    internal let Handles []ElementHandle = []ElementHandle{}
    internal let Actions []AccessibilityAction = []AccessibilityAction{}
    internal let Ids []AccessibilityId = []AccessibilityId{}
    internal let Nodes []AccessibilityNode = []AccessibilityNode{}
    internal let RelationshipIds RetainedAccessibilityRelationshipIds = RetainedAccessibilityRelationshipIds()
  }
}

private func cloneHandles(values [] ? ElementHandle, name string) []ElementHandle {
  guard let source = values else { throw ArgumentNullException(name) }
  let result = copyValues(source)
  for handle in result {
    if handle == nil { throw ArgumentNullException(name) }
  }
  return result
}

private func validateHandles(values []ElementHandle, name string) {
  for value in values {
    if value == nil { throw ArgumentNullException(name) }
  }
  requireUnique(values, name)
}

private func cloneActions(values [] ? AccessibilityAction) []AccessibilityAction {
  guard let source = values else { throw ArgumentNullException("Actions") }
  let result = copyValues(source)
  for action in result {
    validateAction(action)
  }
  requireUnique(result, "Actions")
  return result
}

private func copyValues[T](values []T) []T {
  let result = [values.Length]T
  Array.Copy(values, result, values.Length)
  return result
}

private func requireUnique[T](values []T, name string) {
  let comparer = EqualityComparer[T].Default
  for value in values {
    var count int32
    for candidate in values {
      if comparer.Equals(candidate, value) { count++ }
    }
    if count != 1 { throw ArgumentException(name + " cannot contain duplicates") }
  }
}

private func validateAction(value AccessibilityAction) AccessibilityAction {
  if int32(value) < int32(AccessibilityAction.Focus) || int32(value) > int32(AccessibilityAction.Scroll) {
    throw ArgumentOutOfRangeException("Action")
  }
  return value
}

private func validateNeutralAction(value AccessibilityAction) AccessibilityAction {
  validateAction(value)
  if value == AccessibilityAction.SetValue || value == AccessibilityAction.SetSelection
    || value == AccessibilityAction.Scroll{
      throw ArgumentException("Use the matching AccessibilityActionRequest factory")
    }
  return value
}

private func validateOptionalNumber(value float64?, name string) float64? {
  if let number = value {
    if Double.IsNaN(number) || Double.IsInfinity(number) {
      throw ArgumentOutOfRangeException(name)
    }
  }
  return value
}

private func requireString(value string, name string) string {
  if value == nil { throw ArgumentNullException(name) }
  return value
}

private func validateScroll(value float64, name string) float64 {
  if Double.IsNaN(value) || Double.IsInfinity(value) || value < 0.0 {
    throw ArgumentOutOfRangeException(name)
  }
  return value
}

private func validateRole(value AccessibilityRole) {
  if int32(value) < int32(AccessibilityRole.Auto) || int32(value) > int32(AccessibilityRole.Custom) {
    throw ArgumentOutOfRangeException("Role")
  }
}

private func validateChecked(value AccessibilityChecked) {
  if int32(value) < int32(AccessibilityChecked.Unspecified)
    || int32(value) > int32(AccessibilityChecked.Mixed) {
      throw ArgumentOutOfRangeException("Checked")
    }
}

private func validateOrientation(value AccessibilityOrientation) {
  if int32(value) < int32(AccessibilityOrientation.Unspecified)
    || int32(value) > int32(AccessibilityOrientation.Vertical) {
      throw ArgumentOutOfRangeException("Orientation")
    }
}

private func validateLive(value AccessibilityLive) {
  if int32(value) < int32(AccessibilityLive.Off) || int32(value) > int32(AccessibilityLive.Assertive) {
    throw ArgumentOutOfRangeException("Live")
  }
}

internal func actionBit(action AccessibilityAction) int32 -> int32(1) << int32(action)

internal func sameArray[T](left []T, right []T) bool {
  if left.Length != right.Length { return false }
  let comparer = EqualityComparer[T].Default
  for i in 0 ... left.Length {
    if !comparer.Equals(left[i], right[i]) { return false }
  }
  return true
}

private func sameOptionalId(left AccessibilityId?, right AccessibilityId?) bool {
  if left == nil || right == nil { return left == nil && right == nil }
  return left.Value == right.Value
}

private func sameAccessibilityRect(left ElementRect, right ElementRect) bool -> left.X == right.X && left.Y == right.Y && left.Width == right.Width
  && left.Height == right.Height

private func sameAccessibilityNodes(left List[AccessibilityNode]?, right List[AccessibilityNode]) bool {
  if left == nil { return right.Count == 0 }
  if left.Count != right.Count { return false }
  for i in 0 ... right.Count {
    if left[i] != right[i] { return false }
  }
  return true
}
