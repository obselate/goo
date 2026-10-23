package Goo.Android

import Android.Content
import Android.Graphics
import Android.Icu.Text
import Android.Views
import Android.Views.Accessibility
import Goo
import Java.Lang
import NativeAction = Android.Views.Accessibility.AccessibilityNodeInfo.AccessibilityAction
import NativeManager = Android.Views.Accessibility.AccessibilityManager
import System
import System.Collections.Generic
import System.Globalization
import SystemMath = System.Math
import _Microsoft.Android.Resource.Designer

internal partial class GooAccessibilityProvider : AccessibilityNodeProvider,
AccessibilityAdapter,
Android
    .Views
    .Accessibility
    .AccessibilityManager
    .IAccessibilityStateChangeListener,
Android
    .Views
    .Accessibility
    .AccessibilityManager
    .ITouchExplorationStateChangeListener,
ViewTreeObserver.IOnGlobalLayoutListener,
ViewTreeObserver
    .IOnPreDrawListener {
    private let view GooView
    private let manager NativeManager
    private let nodes Dictionary[int32, NodeRecord] = Dictionary[int32, NodeRecord]()
    private let ids Dictionary[int64, int32] = Dictionary[int64, int32]()
    private var nextId int32
    private var rootId int32 = AccessibilityNodeProvider.HostViewId
    private var generation int64
    private var version int64 = -1
    private var disposed bool
    private var accessibilityFocus int32 = AccessibilityNodeProvider.HostViewId

    internal init(view GooView) {
        this.view = view
        manager = cast[NativeManager](view.Context!!.GetSystemService(Context.AccessibilityService)!!)
        flushEvents = Runnable(FlushEvents)
    }

    private prop Available bool -> !disposed &&
        presentationReady &&
        version >= int64(0) &&
        manager.IsEnabled &&
        view.IsAttachedToWindow &&
        view.IsShown &&
        view
        .Window
        .IsOpen &&
        view.WindowVisibility == ViewStates.Visible

    func Update(tree AccessibilityTree) {
        if disposed || version == tree.Version {
            return
        }
        generation++
        rootId = if tree.Root is {} root {
            Collect(root, AccessibilityNodeProvider.HostViewId)
        } else {
            AccessibilityNodeProvider.HostViewId
        }
        for pair in ids {
            if !nodes.TryGetValue(pair.Value, out var record) || record.Generation != generation {
                let id = pair.Value
                if accessibilityFocus == id {
                    SetAccessibilityFocus(AccessibilityNodeProvider.HostViewId)
                }
                if hovered == id {
                    SetHover(AccessibilityNodeProvider.HostViewId)
                }
                if pendingFocus == id {
                    pendingFocus = AccessibilityNodeProvider.HostViewId
                }
                record?.Words?.Dispose()
                ids.Remove(pair.Key)
                nodes.Remove(id)
            }
        }
        version = tree.Version
        CompletePendingFocus()
        ScheduleEvents()
    }

    private func Collect(node AccessibilityNode, parent int32) int32 {
        if !ids.TryGetValue(node.Id.Value, out var id) {
            id = checked((nextId += 1))
            ids.Add(node.Id.Value, id)
        }
        if !nodes.TryGetValue(id, out var record) {
            record = NodeRecord(node)
            nodes.Add(id, record)
        }
        record.Node = node
        record.Parent = parent
        record.Generation = generation
        record.Children.Clear()
        for child in node.Children {
            record.Children.Add(Collect(child, id))
        }
        return id
    }

    override func CreateAccessibilityNodeInfo(virtualViewId int32) AccessibilityNodeInfo? {
        if disposed {
            return nil
        }
        if virtualViewId == AccessibilityNodeProvider.HostViewId {
            let host = AccessibilityNodeInfo(view)
            view.OnInitializeAccessibilityNodeInfo(host)
            host.ClassName = "android.view.View"
            host.Clickable = false
            host.Focusable = false
            host.Focused = false
            host.AccessibilityFocused = false
            host.ScreenReaderFocusable = false
            host.RemoveAction(NativeAction.ActionClick!!)
            host.RemoveAction(NativeAction.ActionFocus!!)
            host.RemoveAction(NativeAction.ActionClearFocus!!)
            host.RemoveAction(NativeAction.ActionAccessibilityFocus!!)
            host.RemoveAction(NativeAction.ActionClearAccessibilityFocus!!)
            if Available && rootId != AccessibilityNodeProvider.HostViewId {
                host.AddChild(view, rootId)
            }
            return host
        }
        if !Available || !nodes.TryGetValue(virtualViewId, out var record) {
            return nil
        }
        let node = record.Node
        let info = AccessibilityNodeInfo(view, virtualViewId)
        if record.Parent == AccessibilityNodeProvider.HostViewId {
            info.SetParent(view)
        } else {
            info.SetParent(view, record.Parent)
        }
        for child in record.Children {
            info.AddChild(view, child)
        }
        info.PackageName = view.Context!!.PackageName
        info.ClassName = ClassName(node)
        info.Enabled = !node.Disabled
        info.Focusable = Supports(node, AccessibilityAction.Focus)
        info.Focused = node.Focused
        info.AccessibilityFocused = accessibilityFocus == virtualViewId
        info.ImportantForAccessibility = true
        info.Password = node.IsPassword
        info.Editable = IsEditor(node) && node.ReadOnly != true && Supports(node, AccessibilityAction.SetValue)
        info.MultiLine = node.Multiline == true
        info.ContentInvalid = node.Invalid == true
        info.SetCanOpenPopup(node.HasPopup == true)
        info.Heading = (
            node.Role is AccessibilityRole.Heading or AccessibilityRole.ColumnHeader or AccessibilityRole.RowHeader
        )
        info.Selected = node.Selected == true
        info.Checkable = node.Checked != AccessibilityChecked.Unspecified
        if OperatingSystem.IsAndroidVersionAtLeast(36) {
            info.CheckedState = if node.Checked == AccessibilityChecked.Mixed {
                CheckedState.Partial
            } else {
                (
                    if node.Checked == AccessibilityChecked.True {
                        CheckedState.True
                    } else {
                        CheckedState.False
                    }
                )
            }
            if node.Expanded is {} expanded {
                info.ExpandedState = if expanded {
                    ExpandedState.Full
                } else {
                    ExpandedState.Collapsed
                }
            }
        } else {
            info.Checked = node.Checked == AccessibilityChecked.True
        }
        info.LiveRegion = AccessibilityLiveRegion(int32(node.Live))
        PopulateText(info, node)
        PopulateRelations(info, node)
        PopulateBounds(info, node)
        PopulateActions(info, node, virtualViewId)
        info.ScreenReaderFocusable = info.Focusable ||
            info.Clickable ||
            node
            .Name
            .Length > 0 ||
            (
            if IsTextual(node) {
                Text(node).Length > 0
            } else {
                node.Role != AccessibilityRole.Generic &&
                    node.Role != AccessibilityRole.Group &&
                    node.Role != AccessibilityRole.List &&
                    node.Role != AccessibilityRole.Grid &&
                    node.Role != AccessibilityRole.Tree &&
                    node.Role != AccessibilityRole.TabList &&
                    node.Role != AccessibilityRole.Menu &&
                    node.Role != AccessibilityRole.Row &&
                    node.Role != AccessibilityRole.Dialog
            }
        )
        return info
    }

    private func PopulateText(info AccessibilityNodeInfo, node AccessibilityNode) {
        let text = Text(node)
        if IsTextual(node) {
            info.Text = text
            if node.Name.Length > 0 && node.Relationships.LabelledBy.Count == 0 {
                info.HintText = node.Name
                info.ShowingHintText = text.Length == 0
            }
            info.TextSelectable = Supports(node, AccessibilityAction.SetSelection)
            if node.SelectionStart is {} start && node.SelectionLength is {} length {
                let caret = node.Caret ?? start + length
                info.SetTextSelection(
                    if caret == start {
                        start + length
                    } else {
                        start
                    },
                    caret
                )
            }
            if text.Length > 0 {
                info.MovementGranularities = MovementGranularity.Character | (
                    if node.IsPassword {
                        MovementGranularity(0)
                    } else {
                        MovementGranularity.Word | MovementGranularity.Paragraph
                    }
                )
            }
        } else {
            info.ContentDescription = node.Name
        }
        let description = Description(node)
        if OperatingSystem.IsAndroidVersionAtLeast(36) {
            info.SupplementalDescription = description
        } else if description.Length > 0 {
            if IsEditor(node) {
                info.HintText = if node.Name.Length == 0 {
                    description
                } else {
                    "${node.Name}, $description"
                }
            } else {
                let label = if node.Name.Length > 0 {
                    node.Name
                } else {
                    text
                }
                info.ContentDescription = if label.Length == 0 {
                    description
                } else {
                    "$label, $description"
                }
            }
        }
        info.StateDescription = StateDescription(node)
        if node.Role == AccessibilityRole.Custom {
            info.Extras!!.PutString(RoleDescriptionKey, node.CustomRole)
        } else if RoleResource(node.Role) is var role && role != 0 {
            info.Extras!!.PutString(RoleDescriptionKey, view.Context!!.GetString(role))
        }
        if node.ValueNow is {} current &&
            node.ValueMinimum is {} minimum &&
            node.ValueMaximum is {} maximum &&
            current >= float64(-float32.MaxValue) &&
            current <= float64(float32.MaxValue) &&
            minimum >= float64(-float32.MaxValue) &&
            maximum <= float64(float32.MaxValue) {
            info.SetRangeInfo(
                AccessibilityNodeInfo.RangeInfo(
                    int32(RangeType.Float),
                    float32(minimum),
                    float32(maximum),
                    float32(current)
                )
            )
        }
        if node.Role == AccessibilityRole.List && node.SizeOfSet is {} count {
            info.SetCollectionInfo(
                AccessibilityNodeInfo.CollectionInfo(
                    count,
                    1,
                    false,
                    int32(
                        (
                            if node.MultiSelectable == true {
                                SelectionMode.Multiple
                            } else {
                                SelectionMode.Single
                            }
                        )
                    )
                )
            )
        }
        if node.Role == AccessibilityRole.ListItem && node.PositionInSet is {} position {
            info.SetCollectionItemInfo(
                AccessibilityNodeInfo.CollectionItemInfo(position, 1, 0, 1, false, node.Selected == true)
            )
        }
    }

    private func PopulateRelations(info AccessibilityNodeInfo, node AccessibilityNode) {
        for label in node.Relationships.LabelledBy {
            if !ids.TryGetValue(label.Value, out var id) {
                continue
            }
            if OperatingSystem.IsAndroidVersionAtLeast(36) {
                info.AddLabeledBy(view, id)
            } else {
                info.SetLabeledBy(view, id)
                break
            }
        }
        for target in node.Relationships.FlowTo {
            if ids.TryGetValue(target.Value, out var id) && !TraversalCycle(node.Id, nodes[id].Node) {
                info.SetTraversalBefore(view, id)
                break
            }
        }
        if node.Invalid == true && node.Relationships.ErrorMessage.Count > 0 {
            info.Error = RelationText(node.Relationships.ErrorMessage)
        }
        if node.Role == AccessibilityRole.Dialog && node.Name.Length > 0 {
            info.PaneTitle = node.Name
        }
    }

    private func TraversalCycle(source AccessibilityId, target AccessibilityNode) bool {
        var target = target
        for var count = 0; count < nodes.Count; count++ {
            if target.Id == source {
                return true
            }
            var next = AccessibilityNodeProvider.HostViewId
            for relation in target.Relationships.FlowTo {
                if ids.TryGetValue(relation.Value, out next) {
                    break
                }
            }
            if next == AccessibilityNodeProvider.HostViewId || !nodes.TryGetValue(next, out var record) {
                return false
            }
            target = record.Node
        }
        return true
    }

    private func PopulateBounds(info AccessibilityNodeInfo, node AccessibilityNode) {
        screenMatrix.Reset()
        view.TransformMatrixToGlobal(screenMatrix)
        if node.Id.Value == int64(0) {
            mappedBounds.Set(0.0f, 0.0f, float32(view.Width), float32(view.Height))
        } else {
            let scale = PixelScale
            var bounds = node.VisibleBounds ?? node.Bounds
            mappedBounds.Set(
                float32(bounds.X) * scale.X,
                float32(bounds.Y) * scale.Y,
                float32((bounds.X + bounds.Width)) * scale.X,
                float32((bounds.Y + bounds.Height)) * scale.Y
            )
        }
        screenMatrix.MapRect(mappedBounds)
        screenBounds.Set(
            int32(SystemMath.Floor(mappedBounds.Left)),
            int32(SystemMath.Floor(mappedBounds.Top)),
            int32(SystemMath.Ceiling(mappedBounds.Right)),
            int32(SystemMath.Ceiling(mappedBounds.Bottom))
        )
        var visible = (node.Id.Value == int64(0) || node.VisibleBounds != nil) && view.GetLocalVisibleRect(clipBounds)
        if visible {
            mappedBounds.Set(clipBounds)
            screenMatrix.MapRect(mappedBounds)
            clipBounds.Set(
                int32(SystemMath.Floor(mappedBounds.Left)),
                int32(SystemMath.Floor(mappedBounds.Top)),
                int32(SystemMath.Ceiling(mappedBounds.Right)),
                int32(SystemMath.Ceiling(mappedBounds.Bottom))
            )
            visible = clipBounds.Intersect(screenBounds)
        }
        info.SetBoundsInScreen(
            if visible {
                clipBounds
            } else {
                screenBounds
            }
        )
        info.VisibleToUser = visible
    }

    override func FindFocus(focus NodeFocus) AccessibilityNodeInfo? {
        if focus == NodeFocus.Accessibility {
            return if accessibilityFocus == AccessibilityNodeProvider.HostViewId {
                default(AccessibilityNodeInfo?)
            } else {
                CreateAccessibilityNodeInfo(accessibilityFocus)
            }
        }
        for pair in nodes {
            if pair.Value.Node.Focused {
                return CreateAccessibilityNodeInfo(pair.Key)
            }
        }
        return nil
    }

    override func FindAccessibilityNodeInfosByText(text string?, virtualViewId int32) IList[AccessibilityNodeInfo]? {
        let result = List[AccessibilityNodeInfo]()
        if !Available || string.IsNullOrEmpty(text) {
            return result
        }
        Search(
            if virtualViewId == AccessibilityNodeProvider.HostViewId {
                rootId
            } else {
                virtualViewId
            },
            text!!,
            result
        )
        return result
    }

    private func Search(id int32, text string, result List[AccessibilityNodeInfo]) {
        if !nodes.TryGetValue(id, out var record) {
            return
        }
        let node = record.Node
        if !node.IsPassword &&
            (
            node.Name.Contains(text, StringComparison.OrdinalIgnoreCase) || Text(node).Contains(
                text,
                StringComparison.OrdinalIgnoreCase
            )
        ) &&
            CreateAccessibilityNodeInfo(id) is {} info {
            result.Add(info)
        }
        for child in record.Children {
            Search(child, text, result)
        }
    }

    private func RelationText(relations IReadOnlyList[AccessibilityId]) string {
        if relations.Count == 0 {
            return ""
        }
        let values = List[string]()
        for relation in relations {
            if ids.TryGetValue(relation.Value, out var id) && !nodes[id].Node.IsPassword {
                let node = nodes[id].Node
                let value = if node.Name.Length > 0 {
                    node.Name
                } else {
                    Text(node)
                }
                if value.Length > 0 {
                    values.Add(value)
                }
            }
        }
        return string.Join(", ", values)
    }

    private func Description(node AccessibilityNode) string {
        let related = RelationText(node.Relationships.DescribedBy)
        return if related.Length == 0 {
            node.Description
        } else {
            (
                if node.Description.Length == 0 {
                    related
                } else {
                    "${node.Description}, $related"
                }
            )
        }
    }

    private func Text(node AccessibilityNode) string {
        if node.TextSnapshot is not{} snapshot {
            return node.Value
        }
        let record = nodes[ids[node.Id.Value]]
        if !object.ReferenceEquals(record.Snapshot, snapshot) {
            record.Snapshot = snapshot
            record.DocumentText = snapshot.GetText()
        }
        return record.DocumentText
    }

    private func StateDescription(node AccessibilityNode) string {
        let legacy = !OperatingSystem.IsAndroidVersionAtLeast(36)
        let value = if node.ValueText.Length > 0 {
            node.ValueText
        } else {
            (
                if !IsTextual(node) && node.Value != node.Name {
                    node.Value
                } else {
                    ""
                }
            )
        }
        if node.Required != true &&
            node.ReadOnly != true &&
            node.Busy != true &&
            node.Level == nil &&
            (!legacy || node.Checked != AccessibilityChecked.Mixed && node.Expanded == nil) {
            return value
        }
        let states = List[string](6)
        if legacy {
            if node.Checked == AccessibilityChecked.Mixed {
                states.Add(
                    view.Context!!.GetString(
                        _Microsoft.Android.Resource.Designer.Resource.String.goo_accessibility_mixed
                    )
                )
            }
            if node.Expanded is {} expanded {
                states.Add(
                    view.Context!!.GetString(
                        if expanded {
                            _Microsoft.Android.Resource.Designer.Resource.String.goo_accessibility_expanded
                        } else {
                            _Microsoft.Android.Resource.Designer.Resource.String.goo_accessibility_collapsed
                        }
                    )
                )
            }
        }
        if node.Required == true {
            states.Add(
                view.Context!!.GetString(
                    _Microsoft.Android.Resource.Designer.Resource.String.goo_accessibility_required
                )
            )
        }
        if node.ReadOnly == true {
            states.Add(
                view.Context!!.GetString(
                    _Microsoft.Android.Resource.Designer.Resource.String.goo_accessibility_read_only
                )
            )
        }
        if node.Busy == true {
            states.Add(
                view.Context!!.GetString(_Microsoft.Android.Resource.Designer.Resource.String.goo_accessibility_busy)
            )
        }
        if node.Level is {} level {
            states.Add(
                string.Format(
                    CultureInfo.CurrentCulture,
                    view.Context!!.GetString(
                        _Microsoft.Android.Resource.Designer.Resource.String.goo_accessibility_level
                    ),
                    level
                )
            )
        }
        if value.Length > 0 {
            states.Add(value)
        }
        return string.Join(", ", states)
    }

    protected override func Dispose(disposing bool) {
        if disposing && !disposed {
            Detach()
            disposed = true
            ids.Clear()
            flushEvents.Dispose()
            screenMatrix.Dispose()
            mappedBounds.Dispose()
            screenBounds.Dispose()
            clipBounds.Dispose()
        }
        base.Dispose(disposing)
    }

    private class NodeRecord(node AccessibilityNode) {
        internal var Node AccessibilityNode = node
        internal var Parent int32
        internal var Generation int64
        internal var ReadingCursor int32
        internal var Snapshot TextSnapshot?
        internal var DocumentText string = ""
        internal var Words BreakIterator?
        internal var WordText string?
        internal var BoundaryText string?
        internal var Boundaries[]int32 = Array.Empty[int32]()
        internal let Children List[int32] = List[int32]()
        internal let PublishedChildren List[int32] = List[int32]()
        internal var Published bool
        internal var PublishedRevision int64
        internal var PublishedText string = ""
        internal var State NodeState
        internal var PublishedSelectionStart int32?
        internal var PublishedSelectionLength int32?
        internal var PublishedCaret int32?
        internal var PublishedFocused bool
        internal var PublishedScroll AccessibilityScrollInfo?
        internal var PublishedBounds ElementRect
        internal var PublishedVisibleBounds ElementRect?
    }

    shared {
        private const RoleDescriptionKey string = "AccessibilityNodeInfo.roleDescription"
        private func IsEditor(node AccessibilityNode) bool ->
        node.Role == AccessibilityRole.TextInput ||
            node.Role == AccessibilityRole.TextEditor ||
            node.Role == AccessibilityRole.SearchBox

        private func IsTextual(node AccessibilityNode) bool ->
        IsEditor(node) ||
            node.Role == AccessibilityRole.Text ||
            node.Role == AccessibilityRole.Heading ||
            node.Role == AccessibilityRole.Link ||
            node.Role == AccessibilityRole.Status ||
            node.Role == AccessibilityRole.Alert

        private func Supports(node AccessibilityNode, action AccessibilityAction) bool {
            for supported in node.Actions {
                if supported == action {
                    return true
                }
            }
            return false
        }

        private func ClassName(node AccessibilityNode) string -> switch node.Role {
            case AccessibilityRole.Button: "android.widget.Button"
            case AccessibilityRole.TextInput or
                AccessibilityRole.TextEditor or
                AccessibilityRole.SearchBox: "android.widget.EditText"
            case AccessibilityRole.Text or
                AccessibilityRole.Heading or
                AccessibilityRole.Link: "android.widget.TextView"
            case AccessibilityRole.Image: "android.widget.ImageView"
            case AccessibilityRole.Checkbox: "android.widget.CheckBox"
            case AccessibilityRole.Radio: "android.widget.RadioButton"
            case AccessibilityRole.Switch: "android.widget.Switch"
            case AccessibilityRole.Slider: "android.widget.SeekBar"
            case AccessibilityRole.ProgressBar: "android.widget.ProgressBar"
            case AccessibilityRole.List: "android.widget.ListView"
            case AccessibilityRole.Grid: "android.widget.GridView"
            case AccessibilityRole.ComboBox: "android.widget.Spinner"
            default: "android.view.View"
        }

        private func RoleResource(role AccessibilityRole) int32 -> switch role {
            case AccessibilityRole.SpinButton: _Microsoft
                .Android
                .Resource
                .Designer
                .Resource
                .String
                .goo_accessibility_spin_button
            case AccessibilityRole.ScrollBar: _Microsoft
                .Android
                .Resource
                .Designer
                .Resource
                .String
                .goo_accessibility_scroll_bar
            case AccessibilityRole.Menu: _Microsoft.Android.Resource.Designer.Resource.String.goo_accessibility_menu
            case AccessibilityRole.MenuItem: _Microsoft
                .Android
                .Resource
                .Designer
                .Resource
                .String
                .goo_accessibility_menu_item
            case AccessibilityRole.TabList: _Microsoft
                .Android
                .Resource
                .Designer
                .Resource
                .String
                .goo_accessibility_tab_list
            case AccessibilityRole.Tab: _Microsoft.Android.Resource.Designer.Resource.String.goo_accessibility_tab
            case AccessibilityRole.Link: _Microsoft.Android.Resource.Designer.Resource.String.goo_accessibility_link
            case AccessibilityRole.Tree: _Microsoft.Android.Resource.Designer.Resource.String.goo_accessibility_tree
            case AccessibilityRole.TreeItem: _Microsoft
                .Android
                .Resource
                .Designer
                .Resource
                .String
                .goo_accessibility_tree_item
            case AccessibilityRole.GridCell: _Microsoft
                .Android
                .Resource
                .Designer
                .Resource
                .String
                .goo_accessibility_grid_cell
            case AccessibilityRole.Row: _Microsoft.Android.Resource.Designer.Resource.String.goo_accessibility_row
            case AccessibilityRole.ColumnHeader: _Microsoft
                .Android
                .Resource
                .Designer
                .Resource
                .String
                .goo_accessibility_column_header
            case AccessibilityRole.RowHeader: _Microsoft
                .Android
                .Resource
                .Designer
                .Resource
                .String
                .goo_accessibility_row_header
            case AccessibilityRole.SearchBox: _Microsoft
                .Android
                .Resource
                .Designer
                .Resource
                .String
                .goo_accessibility_search
            case AccessibilityRole.Alert: _Microsoft.Android.Resource.Designer.Resource.String.goo_accessibility_alert
            case AccessibilityRole.Status: _Microsoft.Android.Resource.Designer.Resource.String.goo_accessibility_status
            default: 0
        }
    }
}
