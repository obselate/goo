using Android.Content;
using Android.Views;
using Android.Views.Accessibility;
using NativeAction = Android.Views.Accessibility.AccessibilityNodeInfo.AccessibilityAction;
using NativeManager = Android.Views.Accessibility.AccessibilityManager;

namespace Goo.Android;

internal sealed partial class GooAccessibilityProvider : AccessibilityNodeProvider, AccessibilityAdapter
{
    private const string RoleDescriptionKey = "AccessibilityNodeInfo.roleDescription";
    private readonly GooView view;
    private readonly NativeManager manager;
    private readonly Dictionary<int, NodeRecord> nodes = new();
    private readonly Dictionary<long, int> ids = new();
    private int nextId;
    private int rootId = HostViewId;
    private long generation;
    private long version = -1;
    private bool disposed;
    private int accessibilityFocus = HostViewId;

    internal GooAccessibilityProvider(GooView view)
    {
        this.view = view;
        manager = (NativeManager)view.Context!.GetSystemService(Context.AccessibilityService)!;
        flushEvents = new Java.Lang.Runnable(FlushEvents);
    }

    private bool Available => !disposed && presentationReady && version >= 0 && manager.IsEnabled
        && view.IsAttachedToWindow && view.IsShown && view.Window.IsOpen && view.WindowVisibility == ViewStates.Visible;

    public void Update(AccessibilityTree tree)
    {
        if (disposed || version == tree.Version)
            return;
        generation++;
        rootId = tree.Root is { } root ? Collect(root, HostViewId) : HostViewId;
        foreach (var pair in ids)
            if (!nodes.TryGetValue(pair.Value, out var record) || record.Generation != generation)
            {
                var id = pair.Value;
                if (accessibilityFocus == id) SetAccessibilityFocus(HostViewId);
                if (hovered == id) SetHover(HostViewId);
                if (pendingFocus == id) pendingFocus = HostViewId;
                record?.Words?.Dispose();
                ids.Remove(pair.Key);
                nodes.Remove(id);
            }
        version = tree.Version;
        CompletePendingFocus();
        ScheduleEvents();
    }

    private int Collect(AccessibilityNode node, int parent)
    {
        if (!ids.TryGetValue(node.Id.Value, out var id))
        {
            id = checked(++nextId);
            ids.Add(node.Id.Value, id);
        }
        if (!nodes.TryGetValue(id, out var record))
        {
            record = new NodeRecord(node);
            nodes.Add(id, record);
        }
        record.Node = node;
        record.Parent = parent;
        record.Generation = generation;
        record.Children.Clear();
        foreach (var child in node.Children)
            record.Children.Add(Collect(child, id));
        return id;
    }

    public override AccessibilityNodeInfo? CreateAccessibilityNodeInfo(int virtualViewId)
    {
        if (disposed)
            return null;
        if (virtualViewId == HostViewId)
        {
            var host = new AccessibilityNodeInfo(view);
            view.OnInitializeAccessibilityNodeInfo(host);
            host.ClassName = "android.view.View";
            host.Clickable = false;
            host.Focusable = false;
            host.Focused = false;
            host.AccessibilityFocused = false;
            host.ScreenReaderFocusable = false;
            host.RemoveAction(NativeAction.ActionClick!);
            host.RemoveAction(NativeAction.ActionFocus!);
            host.RemoveAction(NativeAction.ActionClearFocus!);
            host.RemoveAction(NativeAction.ActionAccessibilityFocus!);
            host.RemoveAction(NativeAction.ActionClearAccessibilityFocus!);
            if (Available && rootId != HostViewId)
                host.AddChild(view, rootId);
            return host;
        }
        if (!Available || !nodes.TryGetValue(virtualViewId, out var record))
            return null;
        var node = record.Node;
        var info = new AccessibilityNodeInfo(view, virtualViewId);
        if (record.Parent == HostViewId)
            info.SetParent(view);
        else
            info.SetParent(view, record.Parent);
        foreach (var child in record.Children)
            info.AddChild(view, child);
        info.PackageName = view.Context!.PackageName;
        info.ClassName = ClassName(node);
        info.Enabled = !node.Disabled;
        info.Focusable = Supports(node, AccessibilityAction.Focus);
        info.Focused = node.Focused;
        info.AccessibilityFocused = accessibilityFocus == virtualViewId;
        info.ImportantForAccessibility = true;
        info.Password = node.IsPassword;
        info.Editable = IsEditor(node) && node.ReadOnly != true && Supports(node, AccessibilityAction.SetValue);
        info.MultiLine = node.Multiline == true;
        info.ContentInvalid = node.Invalid == true;
        info.SetCanOpenPopup(node.HasPopup == true);
        info.Heading = node.Role is AccessibilityRole.Heading or AccessibilityRole.ColumnHeader or AccessibilityRole.RowHeader;
        info.Selected = node.Selected == true;
        info.Checkable = node.Checked != AccessibilityChecked.Unspecified;
        if (OperatingSystem.IsAndroidVersionAtLeast(36))
        {
            info.CheckedState = node.Checked == AccessibilityChecked.Mixed ? CheckedState.Partial
                : node.Checked == AccessibilityChecked.True ? CheckedState.True : CheckedState.False;
            if (node.Expanded is { } expanded)
                info.ExpandedState = expanded ? ExpandedState.Full : ExpandedState.Collapsed;
        }
        else
            info.Checked = node.Checked == AccessibilityChecked.True;
        info.LiveRegion = (AccessibilityLiveRegion)(int)node.Live;
        PopulateText(info, node);
        PopulateRelations(info, node);
        PopulateBounds(info, node);
        PopulateActions(info, node, virtualViewId);
        info.ScreenReaderFocusable = info.Focusable || info.Clickable || node.Name.Length > 0
            || (IsTextual(node) ? Text(node).Length > 0 : node.Role is not (AccessibilityRole.Generic
                or AccessibilityRole.Group or AccessibilityRole.List or AccessibilityRole.Grid or AccessibilityRole.Tree
                or AccessibilityRole.TabList or AccessibilityRole.Menu or AccessibilityRole.Row or AccessibilityRole.Dialog));
        return info;
    }

    private void PopulateText(AccessibilityNodeInfo info, AccessibilityNode node)
    {
        var text = Text(node);
        if (IsTextual(node))
        {
            info.Text = text;
            if (node.Name.Length > 0 && node.Relationships.LabelledBy.Count == 0)
            {
                info.HintText = node.Name;
                info.ShowingHintText = text.Length == 0;
            }
            info.TextSelectable = Supports(node, AccessibilityAction.SetSelection);
            if (node.SelectionStart is { } start && node.SelectionLength is { } length)
            {
                var caret = node.Caret ?? start + length;
                info.SetTextSelection(caret == start ? start + length : start, caret);
            }
            if (text.Length > 0)
                info.MovementGranularities = MovementGranularity.Character
                    | (node.IsPassword ? 0 : MovementGranularity.Word | MovementGranularity.Paragraph);
        }
        else
            info.ContentDescription = node.Name;
        var description = Description(node);
        if (OperatingSystem.IsAndroidVersionAtLeast(36))
            info.SupplementalDescription = description;
        else if (description.Length > 0)
        {
            if (IsEditor(node))
                info.HintText = node.Name.Length == 0 ? description : $"{node.Name}, {description}";
            else
            {
                var label = node.Name.Length > 0 ? node.Name : text;
                info.ContentDescription = label.Length == 0 ? description : $"{label}, {description}";
            }
        }
        info.StateDescription = StateDescription(node);
        if (node.Role == AccessibilityRole.Custom)
            info.Extras!.PutString(RoleDescriptionKey, node.CustomRole);
        else if (RoleResource(node.Role) is var role && role != 0)
            info.Extras!.PutString(RoleDescriptionKey, view.Context!.GetString(role));
        if (node.ValueNow is { } current && node.ValueMinimum is { } minimum && node.ValueMaximum is { } maximum
            && current >= -float.MaxValue && current <= float.MaxValue
            && minimum >= -float.MaxValue && maximum <= float.MaxValue)
            info.SetRangeInfo(new AccessibilityNodeInfo.RangeInfo((int)RangeType.Float, (float)minimum, (float)maximum, (float)current));
        if (node.Role == AccessibilityRole.List && node.SizeOfSet is { } count)
            info.SetCollectionInfo(new AccessibilityNodeInfo.CollectionInfo(count, 1, false,
                (int)(node.MultiSelectable == true ? SelectionMode.Multiple : SelectionMode.Single)));
        if (node.Role == AccessibilityRole.ListItem && node.PositionInSet is { } position)
            info.SetCollectionItemInfo(new AccessibilityNodeInfo.CollectionItemInfo(position, 1, 0, 1, false, node.Selected == true));
    }

    private void PopulateRelations(AccessibilityNodeInfo info, AccessibilityNode node)
    {
        foreach (var label in node.Relationships.LabelledBy)
        {
            if (!ids.TryGetValue(label.Value, out var id))
                continue;
            if (OperatingSystem.IsAndroidVersionAtLeast(36))
                info.AddLabeledBy(view, id);
            else
            {
                info.SetLabeledBy(view, id);
                break;
            }
        }
        foreach (var target in node.Relationships.FlowTo)
            if (ids.TryGetValue(target.Value, out var id) && !TraversalCycle(node.Id, nodes[id].Node))
            {
                info.SetTraversalBefore(view, id);
                break;
            }
        if (node.Invalid == true && node.Relationships.ErrorMessage.Count > 0)
            info.Error = RelationText(node.Relationships.ErrorMessage);
        if (node.Role == AccessibilityRole.Dialog && node.Name.Length > 0)
            info.PaneTitle = node.Name;
    }

    private bool TraversalCycle(AccessibilityId source, AccessibilityNode target)
    {
        for (var count = 0; count < nodes.Count; count++)
        {
            if (target.Id == source) return true;
            var next = HostViewId;
            foreach (var relation in target.Relationships.FlowTo)
                if (ids.TryGetValue(relation.Value, out next))
                    break;
            if (next == HostViewId || !nodes.TryGetValue(next, out var record)) return false;
            target = record.Node;
        }
        return true;
    }

    private void PopulateBounds(AccessibilityNodeInfo info, AccessibilityNode node)
    {
        screenMatrix.Reset();
        view.TransformMatrixToGlobal(screenMatrix);
        if (node.Id.Value == 0)
            mappedBounds.Set(0, 0, view.Width, view.Height);
        else
        {
            var scale = PixelScale;
            var bounds = node.VisibleBounds ?? node.Bounds;
            mappedBounds.Set((float)bounds.X * scale.X, (float)bounds.Y * scale.Y,
                (float)(bounds.X + bounds.Width) * scale.X, (float)(bounds.Y + bounds.Height) * scale.Y);
        }
        screenMatrix.MapRect(mappedBounds);
        screenBounds.Set((int)Math.Floor(mappedBounds.Left), (int)Math.Floor(mappedBounds.Top),
            (int)Math.Ceiling(mappedBounds.Right), (int)Math.Ceiling(mappedBounds.Bottom));
        var visible = (node.Id.Value == 0 || node.VisibleBounds is not null) && view.GetLocalVisibleRect(clipBounds);
        if (visible)
        {
            mappedBounds.Set(clipBounds);
            screenMatrix.MapRect(mappedBounds);
            clipBounds.Set((int)Math.Floor(mappedBounds.Left), (int)Math.Floor(mappedBounds.Top),
                (int)Math.Ceiling(mappedBounds.Right), (int)Math.Ceiling(mappedBounds.Bottom));
            visible = clipBounds.Intersect(screenBounds);
        }
        info.SetBoundsInScreen(visible ? clipBounds : screenBounds);
        info.VisibleToUser = visible;
    }

    public override AccessibilityNodeInfo? FindFocus(NodeFocus focus)
    {
        if (focus == NodeFocus.Accessibility)
            return accessibilityFocus == HostViewId ? null : CreateAccessibilityNodeInfo(accessibilityFocus);
        foreach (var pair in nodes)
            if (pair.Value.Node.Focused)
                return CreateAccessibilityNodeInfo(pair.Key);
        return null;
    }

    public override IList<AccessibilityNodeInfo>? FindAccessibilityNodeInfosByText(string? text, int virtualViewId)
    {
        var result = new List<AccessibilityNodeInfo>();
        if (!Available || string.IsNullOrEmpty(text))
            return result;
        Search(virtualViewId == HostViewId ? rootId : virtualViewId, text, result);
        return result;
    }

    private void Search(int id, string text, List<AccessibilityNodeInfo> result)
    {
        if (!nodes.TryGetValue(id, out var record))
            return;
        var node = record.Node;
        if (!node.IsPassword && (node.Name.Contains(text, StringComparison.OrdinalIgnoreCase)
            || Text(node).Contains(text, StringComparison.OrdinalIgnoreCase))
            && CreateAccessibilityNodeInfo(id) is { } info)
            result.Add(info);
        foreach (var child in record.Children)
            Search(child, text, result);
    }

    private string RelationText(IReadOnlyList<AccessibilityId> relations)
    {
        if (relations.Count == 0) return "";
        var values = new List<string>();
        foreach (var relation in relations)
            if (ids.TryGetValue(relation.Value, out var id) && !nodes[id].Node.IsPassword)
            {
                var node = nodes[id].Node;
                var value = node.Name.Length > 0 ? node.Name : Text(node);
                if (value.Length > 0)
                    values.Add(value);
            }
        return string.Join(", ", values);
    }

    private string Description(AccessibilityNode node)
    {
        var related = RelationText(node.Relationships.DescribedBy);
        return related.Length == 0 ? node.Description : node.Description.Length == 0 ? related : $"{node.Description}, {related}";
    }

    private static bool IsEditor(AccessibilityNode node) => node.Role is AccessibilityRole.TextInput
        or AccessibilityRole.TextEditor or AccessibilityRole.SearchBox;

    private static bool IsTextual(AccessibilityNode node) => IsEditor(node) || node.Role is AccessibilityRole.Text
        or AccessibilityRole.Heading or AccessibilityRole.Link or AccessibilityRole.Status or AccessibilityRole.Alert;

    private string Text(AccessibilityNode node)
    {
        if (node.TextSnapshot is not { } snapshot) return node.Value;
        var record = nodes[ids[node.Id.Value]];
        if (!ReferenceEquals(record.Snapshot, snapshot))
        {
            record.Snapshot = snapshot;
            record.DocumentText = snapshot.GetText();
        }
        return record.DocumentText;
    }

    private static bool Supports(AccessibilityNode node, AccessibilityAction action)
    {
        foreach (var supported in node.Actions)
            if (supported == action)
                return true;
        return false;
    }

    private static string ClassName(AccessibilityNode node) => node.Role switch
    {
        AccessibilityRole.Button => "android.widget.Button",
        AccessibilityRole.TextInput or AccessibilityRole.TextEditor or AccessibilityRole.SearchBox => "android.widget.EditText",
        AccessibilityRole.Text or AccessibilityRole.Heading or AccessibilityRole.Link => "android.widget.TextView",
        AccessibilityRole.Image => "android.widget.ImageView",
        AccessibilityRole.Checkbox => "android.widget.CheckBox",
        AccessibilityRole.Radio => "android.widget.RadioButton",
        AccessibilityRole.Switch => "android.widget.Switch",
        AccessibilityRole.Slider => "android.widget.SeekBar",
        AccessibilityRole.ProgressBar => "android.widget.ProgressBar",
        AccessibilityRole.List => "android.widget.ListView",
        AccessibilityRole.Grid => "android.widget.GridView",
        AccessibilityRole.ComboBox => "android.widget.Spinner",
        _ => "android.view.View"
    };

    private string StateDescription(AccessibilityNode node)
    {
        var legacy = !OperatingSystem.IsAndroidVersionAtLeast(36);
        var value = node.ValueText.Length > 0 ? node.ValueText
            : !IsTextual(node) && node.Value != node.Name ? node.Value : "";
        if (node.Required != true && node.ReadOnly != true && node.Busy != true && node.Level is null
            && (!legacy || node.Checked != AccessibilityChecked.Mixed && node.Expanded is null))
            return value;
        var states = new List<string>(6);
        if (legacy)
        {
            if (node.Checked == AccessibilityChecked.Mixed) states.Add(view.Context!.GetString(Resource.String.goo_accessibility_mixed));
            if (node.Expanded is { } expanded) states.Add(view.Context!.GetString(expanded
                ? Resource.String.goo_accessibility_expanded : Resource.String.goo_accessibility_collapsed));
        }
        if (node.Required == true) states.Add(view.Context!.GetString(Resource.String.goo_accessibility_required));
        if (node.ReadOnly == true) states.Add(view.Context!.GetString(Resource.String.goo_accessibility_read_only));
        if (node.Busy == true) states.Add(view.Context!.GetString(Resource.String.goo_accessibility_busy));
        if (node.Level is { } level) states.Add(string.Format(System.Globalization.CultureInfo.CurrentCulture,
            view.Context!.GetString(Resource.String.goo_accessibility_level), level));
        if (value.Length > 0) states.Add(value);
        return string.Join(", ", states);
    }

    private static int RoleResource(AccessibilityRole role) => role switch
    {
        AccessibilityRole.SpinButton => Resource.String.goo_accessibility_spin_button,
        AccessibilityRole.ScrollBar => Resource.String.goo_accessibility_scroll_bar,
        AccessibilityRole.Menu => Resource.String.goo_accessibility_menu,
        AccessibilityRole.MenuItem => Resource.String.goo_accessibility_menu_item,
        AccessibilityRole.TabList => Resource.String.goo_accessibility_tab_list,
        AccessibilityRole.Tab => Resource.String.goo_accessibility_tab,
        AccessibilityRole.Link => Resource.String.goo_accessibility_link,
        AccessibilityRole.Tree => Resource.String.goo_accessibility_tree,
        AccessibilityRole.TreeItem => Resource.String.goo_accessibility_tree_item,
        AccessibilityRole.GridCell => Resource.String.goo_accessibility_grid_cell,
        AccessibilityRole.Row => Resource.String.goo_accessibility_row,
        AccessibilityRole.ColumnHeader => Resource.String.goo_accessibility_column_header,
        AccessibilityRole.RowHeader => Resource.String.goo_accessibility_row_header,
        AccessibilityRole.SearchBox => Resource.String.goo_accessibility_search,
        AccessibilityRole.Alert => Resource.String.goo_accessibility_alert,
        AccessibilityRole.Status => Resource.String.goo_accessibility_status,
        _ => 0
    };

    protected override void Dispose(bool disposing)
    {
        if (disposing && !disposed)
        {
            Detach();
            disposed = true;
            ids.Clear();
            flushEvents.Dispose();
            screenMatrix.Dispose();
            mappedBounds.Dispose();
            screenBounds.Dispose();
            clipBounds.Dispose();
        }
        base.Dispose(disposing);
    }

    private sealed class NodeRecord(AccessibilityNode node)
    {
        internal AccessibilityNode Node = node;
        internal int Parent;
        internal long Generation;
        internal int ReadingCursor;
        internal TextSnapshot? Snapshot;
        internal string DocumentText = "";
        internal global::Android.Icu.Text.BreakIterator? Words;
        internal string? WordText;
        internal string? BoundaryText;
        internal int[] Boundaries = Array.Empty<int>();
        internal readonly List<int> Children = new();
        internal readonly List<int> PublishedChildren = new();
        internal bool Published;
        internal long PublishedRevision;
        internal string PublishedText = "";
        internal NodeState State;
        internal int? PublishedSelectionStart;
        internal int? PublishedSelectionLength;
        internal int? PublishedCaret;
        internal bool PublishedFocused;
        internal AccessibilityScrollInfo? PublishedScroll;
        internal ElementRect PublishedBounds;
        internal ElementRect? PublishedVisibleBounds;
    }
}
