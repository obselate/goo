using Android.Views.Accessibility;
using System.Text;

namespace Goo.Android;

internal sealed partial class GooAccessibilityProvider
{
    private readonly Dictionary<int, (ContentChangeTypes Types, bool Live, bool Atomic)> contentChanges = new();
    private readonly List<NodeUpdate> updates = new();
    private readonly StringBuilder liveText = new();
    private readonly Java.Lang.Runnable flushEvents;
    private bool eventsPosted;
    private bool fullRefresh = true;
    private bool publishedAvailable;
    private int publishedRoot = HostViewId;

    private void ScheduleEvents()
    {
        if (disposed || eventsPosted) return;
        eventsPosted = view.Post(flushEvents);
    }

    private void RequestFullRefresh()
    {
        fullRefresh = true;
        ScheduleEvents();
    }

    private void CancelEvents()
    {
        view.RemoveCallbacks(flushEvents);
        eventsPosted = false;
        fullRefresh = true;
        publishedAvailable = false;
        contentChanges.Clear();
        updates.Clear();
    }

    private void FlushEvents()
    {
        eventsPosted = false;
        if (disposed) return;
        try
        {
            PublishEvents();
        }
        catch (Exception error)
        {
            fullRefresh = true;
            publishedAvailable = false;
            view.Window.ReportNativeAccessibilityError(error);
        }
        finally
        {
            updates.Clear();
            contentChanges.Clear();
        }
    }

    private void PublishEvents()
    {
        var available = Available;
        var incremental = available && publishedAvailable;
        var refresh = fullRefresh || publishedRoot != rootId;
        fullRefresh = false;
        contentChanges.Clear();
        foreach (var pair in nodes)
        {
            var id = pair.Key;
            var record = pair.Value;
            var node = record.Node;
            var revision = node is RetainedAccessibilityNode retained ? retained.Revision : version;
            var structure = !record.PublishedChildren.SequenceEqual(record.Children);
            var relationsChanged = RelatedTextChanged(node.Relationships.DescribedBy)
                || RelatedTextChanged(node.Relationships.ErrorMessage);
            if (record.Published && revision == record.PublishedRevision && !structure && !relationsChanged)
                continue;
            var text = Text(node);
            var state = ReadState(node);
            if (incremental)
            {
                if (!record.Published)
                    QueueContent(id, ContentChangeTypes.Subtree);
                else
                    DiffNode(id, record, text, state, structure);
            }
            updates.Add(new NodeUpdate(record, text, state, revision, structure));
        }
        foreach (var update in updates)
        {
            var record = update.Record;
            var node = record.Node;
            record.PublishedText = update.Text;
            record.State = update.State;
            record.PublishedRevision = update.Revision;
            record.Published = true;
            record.PublishedSelectionStart = node.SelectionStart;
            record.PublishedSelectionLength = node.SelectionLength;
            record.PublishedCaret = node.Caret;
            record.PublishedFocused = node.Focused;
            record.PublishedScroll = node.ScrollInfo;
            record.PublishedBounds = node.Bounds;
            record.PublishedVisibleBounds = node.VisibleBounds;
            if (update.Structure)
            {
                record.PublishedChildren.Clear();
                record.PublishedChildren.AddRange(record.Children);
            }
        }
        if (refresh)
            Send(HostViewId, EventTypes.WindowContentChanged, ContentChangeTypes.Subtree);
        foreach (var pair in contentChanges)
        {
            if (HasSubtreeEventAncestor(pair.Key)) continue;
            using var e = CreateEvent(pair.Key, EventTypes.WindowContentChanged, pair.Value.Types);
            if (e is null) continue;
            if (pair.Value.Atomic && nodes.TryGetValue(pair.Key, out var record))
            {
                liveText.Clear();
                AppendLiveText(record);
                e.Text!.Clear();
                using var text = new Java.Lang.String(liveText.ToString());
                e.Text.Add(text);
            }
            view.Parent?.RequestSendAccessibilityEvent(view, e);
        }
        publishedRoot = rootId;
        publishedAvailable = available;
    }

    private void DiffNode(int id, NodeRecord record, string text, NodeState state, bool structure)
    {
        var node = record.Node;
        if (structure)
            QueueContent(id, ContentChangeTypes.Subtree);
        else if (record.PublishedBounds != node.Bounds || record.PublishedVisibleBounds != node.VisibleBounds)
            QueueContent(id, ContentChangeTypes.Subtree, live: false);
        if (record.State != state)
        {
            var changes = record.State.Name != state.Name || record.State.Description != state.Description
                ? ContentChangeTypes.ContentDescription : record.State.DescriptionText != state.DescriptionText
                ? ContentChangeTypes.StateDescription : ContentChangeTypes.Undefined;
            QueueContent(id, changes);
            if (state.Selected == true && record.State.Selected != true)
                Send(id, EventTypes.ViewSelected);
        }
        if (record.PublishedText != text)
        {
            record.ReadingCursor = 0;
            if (IsEditor(node))
            {
                SendTextChange(id, record.PublishedText, text);
                var region = LiveRegion(id);
                if (nodes.TryGetValue(region, out var live) && live.Node.Atomic == true)
                    QueueContent(region, ContentChangeTypes.Text);
            }
            else QueueContent(id, ContentChangeTypes.Text);
        }
        if (node.SelectionStart != record.PublishedSelectionStart || node.SelectionLength != record.PublishedSelectionLength
            || node.Caret != record.PublishedCaret)
            SendSelectionChange(id, node, text.Length);
        if (node.Focused && !record.PublishedFocused)
            Send(id, EventTypes.ViewFocused);
        if (node.ScrollInfo is { } scroll && (record.PublishedScroll is not { } old
            || scroll.X != old.X || scroll.Y != old.Y || scroll.MaximumX != old.MaximumX || scroll.MaximumY != old.MaximumY))
            SendScrollChange(id, record, scroll);
    }

    private void QueueContent(int id, ContentChangeTypes changes, bool live = true)
    {
        if (!live)
        {
            var ancestor = id;
            while (nodes.TryGetValue(ancestor, out var item))
            {
                if (item.Node.Live != AccessibilityLive.Off) id = item.Parent;
                ancestor = item.Parent;
            }
        }
        var region = live ? LiveRegion(id) : HostViewId;
        var atomic = nodes.TryGetValue(region, out var record) && record.Node.Atomic == true;
        if (atomic) id = region;
        var previous = contentChanges.GetValueOrDefault(id);
        contentChanges[id] = (previous.Types | changes, previous.Live || region != HostViewId, previous.Atomic || atomic);
    }

    private int LiveRegion(int id)
    {
        while (nodes.TryGetValue(id, out var record))
        {
            if (record.Node.Live != AccessibilityLive.Off) return id;
            id = record.Parent;
        }
        return HostViewId;
    }

    private bool HasSubtreeEventAncestor(int id)
    {
        if (contentChanges[id].Live) return false;
        while (nodes.TryGetValue(id, out var record))
        {
            id = record.Parent;
            if (contentChanges.TryGetValue(id, out var changes) && (changes.Types & ContentChangeTypes.Subtree) != 0)
                return true;
        }
        return false;
    }

    private void AppendLiveText(NodeRecord record)
    {
        var node = record.Node;
        var text = Text(node);
        if (node.Name.Length > 0)
        {
            if (liveText.Length > 0) liveText.Append(' ');
            liveText.Append(node.Name);
        }
        if (text.Length > 0 && text != node.Name)
        {
            if (liveText.Length > 0) liveText.Append(' ');
            liveText.Append(text);
        }
        foreach (var child in record.Children)
            AppendLiveText(nodes[child]);
    }

    private bool RelatedTextChanged(IReadOnlyList<AccessibilityId> relations)
    {
        foreach (var relation in relations)
        {
            if (!ids.TryGetValue(relation.Value, out var id)) continue;
            var target = nodes[id];
            if (!target.Published) return true;
            var current = target.Node.Name.Length > 0 ? target.Node.Name : Text(target.Node);
            var previous = target.State.Name.Length > 0 ? target.State.Name : target.PublishedText;
            if (current != previous) return true;
        }
        return false;
    }

    private NodeState ReadState(AccessibilityNode node)
    {
        var flags = (node.Disabled ? 1 : 0) | (node.ReadOnly == true ? 1 << 1 : 0)
            | (node.Required == true ? 1 << 2 : 0) | (node.Invalid == true ? 1 << 3 : 0)
            | (node.Busy == true ? 1 << 4 : 0) | (node.Modal == true ? 1 << 5 : 0)
            | (node.Multiline == true ? 1 << 6 : 0) | (node.MultiSelectable == true ? 1 << 7 : 0)
            | (node.HasPopup == true ? 1 << 8 : 0) | (node.IsPassword ? 1 << 9 : 0)
            | (node.Atomic == true ? 1 << 10 : 0);
        var actions = 0;
        foreach (var action in node.Actions) actions |= 1 << (int)action;
        return new NodeState(node.Role, node.Name, Description(node), StateDescription(node), node.CustomRole,
            RelationText(node.Relationships.ErrorMessage), flags, actions, node.Checked, node.Selected, node.Expanded,
            node.ValueNow, node.ValueMinimum, node.ValueMaximum, node.PositionInSet, node.SizeOfSet,
            node.Relationships.LabelledBy, node.Relationships.FlowTo, node.Live, node.Orientation);
    }

    private void SendTextChange(int id, string previous, string text)
    {
        using var e = CreateEvent(id, EventTypes.ViewTextChanged);
        if (e is null) return;
        var start = 0;
        while (start < previous.Length && start < text.Length && previous[start] == text[start]) start++;
        if (start > 0 && start < text.Length && char.IsLowSurrogate(text[start]) && char.IsHighSurrogate(text[start - 1])) start--;
        var oldEnd = previous.Length;
        var newEnd = text.Length;
        while (oldEnd > start && newEnd > start && previous[oldEnd - 1] == text[newEnd - 1])
        {
            oldEnd--;
            newEnd--;
        }
        if (oldEnd < previous.Length && oldEnd > start && char.IsLowSurrogate(previous[oldEnd])
            && char.IsHighSurrogate(previous[oldEnd - 1]))
        {
            oldEnd++;
            newEnd++;
        }
        e.BeforeText = previous;
        e.FromIndex = start;
        e.RemovedCount = oldEnd - start;
        e.AddedCount = newEnd - start;
        view.Parent?.RequestSendAccessibilityEvent(view, e);
    }

    private void SendSelectionChange(int id, AccessibilityNode node, int length)
    {
        if (node.SelectionStart is not { } start || node.SelectionLength is not { } count) return;
        using var e = CreateEvent(id, EventTypes.ViewTextSelectionChanged);
        if (e is null) return;
        var caret = node.Caret ?? start + count;
        e.FromIndex = caret == start ? start + count : start;
        e.ToIndex = caret;
        e.ItemCount = length;
        view.Parent?.RequestSendAccessibilityEvent(view, e);
    }

    private void SendScrollChange(int id, NodeRecord record, AccessibilityScrollInfo scroll)
    {
        using var e = CreateEvent(id, EventTypes.ViewScrolled);
        if (e is null) return;
        var scale = PixelScale;
        e.ScrollX = PixelOffset(scroll.X, scale.X);
        e.ScrollY = PixelOffset(scroll.Y, scale.Y);
        e.MaxScrollX = PixelOffset(scroll.MaximumX, scale.X);
        e.MaxScrollY = PixelOffset(scroll.MaximumY, scale.Y);
        e.ItemCount = record.Node.SizeOfSet ?? -1;
        e.FromIndex = -1;
        e.ToIndex = -1;
        foreach (var child in record.Children)
            if (nodes[child].Node is { VisibleBounds: not null, PositionInSet: { } position })
            {
                e.FromIndex = e.FromIndex < 0 ? position : Math.Min(e.FromIndex, position);
                e.ToIndex = Math.Max(e.ToIndex, position);
            }
        view.Parent?.RequestSendAccessibilityEvent(view, e);
    }

    private static int PixelOffset(double value, float scale) => (int)Math.Clamp(Math.Round(value * scale), 0, int.MaxValue);

    private readonly record struct NodeUpdate(NodeRecord Record, string Text, NodeState State, long Revision, bool Structure);

    private readonly record struct NodeState(AccessibilityRole Role, string Name, string Description,
        string DescriptionText, string CustomRole, string Error, int Flags, int Actions,
        AccessibilityChecked Checked, bool? Selected, bool? Expanded, double? Now, double? Minimum, double? Maximum,
        int? Position, int? Size, IReadOnlyList<AccessibilityId> Labels, IReadOnlyList<AccessibilityId> Flow,
        AccessibilityLive Live, AccessibilityOrientation Orientation);
}
