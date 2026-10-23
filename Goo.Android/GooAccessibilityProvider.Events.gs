package Goo.Android

import Android.Views
import Android.Views.Accessibility
import Goo
import Java.Lang
import System
import System.Collections.Generic
import System.Linq
import System.Text
import SystemException_2 = System.Exception
import SystemMath = System.Math
import TextStringBuilder = System.Text.StringBuilder

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
    private let contentChanges Dictionary[int32, (Types ContentChangeTypes, Live bool, Atomic bool)] = Dictionary[
        int32,
        (Types ContentChangeTypes, Live bool, Atomic bool)
    ]()
    private let updates List[NodeUpdate] = List[NodeUpdate]()
    private let liveText TextStringBuilder = TextStringBuilder()
    private let flushEvents Runnable
    private var eventsPosted bool
    private var fullRefresh bool = true
    private var publishedAvailable bool
    private var publishedRoot int32 = AccessibilityNodeProvider.HostViewId

    private func ScheduleEvents() {
        if disposed || eventsPosted {
            return
        }
        eventsPosted = view.Post(flushEvents)
    }

    private func RequestFullRefresh() {
        fullRefresh = true
        ScheduleEvents()
    }

    private func CancelEvents() {
        view.RemoveCallbacks(flushEvents)
        eventsPosted = false
        fullRefresh = true
        publishedAvailable = false
        contentChanges.Clear()
        updates.Clear()
    }

    private func FlushEvents() {
        eventsPosted = false
        if disposed {
            return
        }
        try {
            PublishEvents()
        } catch (error SystemException_2) {
            fullRefresh = true
            publishedAvailable = false
            view.Window.ReportNativeAccessibilityError(error)
        } finally {
            updates.Clear()
            contentChanges.Clear()
        }
    }

    private func PublishEvents() {
        let available = Available
        let incremental = available && publishedAvailable
        let refresh = fullRefresh || publishedRoot != rootId
        fullRefresh = false
        contentChanges.Clear()
        for pair in nodes {
            let id = pair.Key
            let record = pair.Value
            let node = record.Node
            let revision = if node is RetainedAccessibilityNode retained {
                retained.Revision
            } else {
                version
            }
            let structure = !record.PublishedChildren.SequenceEqual(record.Children)
            let relationsChanged = RelatedTextChanged(node.Relationships.DescribedBy) ||
                RelatedTextChanged(node.Relationships.ErrorMessage)
            if record.Published && revision == record.PublishedRevision && !structure && !relationsChanged {
                continue
            }
            let text = Text(node)
            let state = ReadState(node)
            if incremental {
                if !record.Published {
                    QueueContent(id, ContentChangeTypes.Subtree)
                } else {
                    DiffNode(id, record, text, state, structure)
                }
            }
            updates.Add(NodeUpdate(record, text, state, revision, structure))
        }
        for update in updates {
            let record = update.Record
            let node = record.Node
            record.PublishedText = update.Text
            record.State = update.State
            record.PublishedRevision = update.Revision
            record.Published = true
            record.PublishedSelectionStart = node.SelectionStart
            record.PublishedSelectionLength = node.SelectionLength
            record.PublishedCaret = node.Caret
            record.PublishedFocused = node.Focused
            record.PublishedScroll = node.ScrollInfo
            record.PublishedBounds = node.Bounds
            record.PublishedVisibleBounds = node.VisibleBounds
            if update.Structure {
                record.PublishedChildren.Clear()
                record.PublishedChildren.AddRange(record.Children)
            }
        }
        if refresh {
            Send(AccessibilityNodeProvider.HostViewId, EventTypes.WindowContentChanged, ContentChangeTypes.Subtree)
        }
        for pair in contentChanges {
            if HasSubtreeEventAncestor(pair.Key) {
                continue
            }
            using let e AccessibilityEvent? = CreateEvent(pair.Key, EventTypes.WindowContentChanged, pair.Value.Types)
            if e == nil {
                continue
            }
            if pair.Value.Atomic && nodes.TryGetValue(pair.Key, out var record) {
                liveText.Clear()
                AppendLiveText(record)
                e.Text!!.Clear()
                using let text = Java.Lang.String(liveText.ToString())
                e.Text!!.Add(text)
            }
            view.Parent?.RequestSendAccessibilityEvent(view, e)
        }
        publishedRoot = rootId
        publishedAvailable = available
    }

    private func DiffNode(id int32, record NodeRecord, text string, state NodeState, structure bool) {
        let node = record.Node
        if structure {
            QueueContent(id, ContentChangeTypes.Subtree)
        } else if record.PublishedBounds != node.Bounds || record.PublishedVisibleBounds != node.VisibleBounds {
            QueueContent(id, ContentChangeTypes.Subtree, live: false)
        }
        if record.State != state {
            let changes = if record.State.Name != state.Name || record.State.Description != state.Description {
                ContentChangeTypes.ContentDescription
            } else {
                (
                    if record.State.DescriptionText != state.DescriptionText {
                        ContentChangeTypes.StateDescription
                    } else {
                        ContentChangeTypes.Undefined
                    }
                )
            }
            QueueContent(id, changes)
            if state.Selected == true && record.State.Selected != true {
                Send(id, EventTypes.ViewSelected)
            }
        }
        if record.PublishedText != text {
            record.ReadingCursor = 0
            if IsEditor(node) {
                SendTextChange(id, record.PublishedText, text)
                let region = LiveRegion(id)
                if nodes.TryGetValue(region, out var live) && live.Node.Atomic == true {
                    QueueContent(region, ContentChangeTypes.Text)
                }
            } else {
                QueueContent(id, ContentChangeTypes.Text)
            }
        }
        if node.SelectionStart != record.PublishedSelectionStart ||
            node.SelectionLength != record.PublishedSelectionLength ||
            node.Caret != record.PublishedCaret {
            SendSelectionChange(id, node, text.Length)
        }
        if node.Focused && !record.PublishedFocused {
            Send(id, EventTypes.ViewFocused)
        }
        let __spill2 = node.ScrollInfo
        var scroll AccessibilityScrollInfo
        var __spill3 AccessibilityScrollInfo?
        var old AccessibilityScrollInfo
        if __spill2 != nil && {
            scroll = __spill2!!
            true
        } && {
            __spill3 = record.PublishedScroll
            (
                __spill3 == nil || {
                    old = __spill3!!
                    false
                } ||
                    scroll.X != old.X ||
                    scroll.Y != old.Y ||
                    scroll.MaximumX != old.MaximumX ||
                    scroll.MaximumY != old.MaximumY
            )
        } {
            SendScrollChange(id, record, scroll)
        }
    }

    private func QueueContent(id int32, changes ContentChangeTypes, live bool = true) {
        var id = id
        if !live {
            var ancestor = id
            while nodes.TryGetValue(ancestor, out var item) {
                if item.Node.Live != AccessibilityLive.Off {
                    id = item.Parent
                }
                ancestor = item.Parent
            }
        }
        let region = if live {
            LiveRegion(id)
        } else {
            AccessibilityNodeProvider.HostViewId
        }
        let atomic = nodes.TryGetValue(region, out var record) && record.Node.Atomic == true
        if atomic {
            id = region
        }
        let previous = contentChanges.GetValueOrDefault(id)
        contentChanges[id] = (
            previous.Types | changes,
            previous.Live || region != AccessibilityNodeProvider.HostViewId,
            previous.Atomic || atomic
        )
    }

    private func LiveRegion(id int32) int32 {
        var id = id
        while nodes.TryGetValue(id, out var record) {
            if record.Node.Live != AccessibilityLive.Off {
                return id
            }
            id = record.Parent
        }
        return AccessibilityNodeProvider.HostViewId
    }

    private func HasSubtreeEventAncestor(id int32) bool {
        var id = id
        if contentChanges[id].Live {
            return false
        }
        while nodes.TryGetValue(id, out var record) {
            id = record.Parent
            if contentChanges.TryGetValue(id, out var changes) && (changes.Types & ContentChangeTypes.Subtree) != 0 {
                return true
            }
        }
        return false
    }

    private func AppendLiveText(record NodeRecord) {
        let node = record.Node
        let text = Text(node)
        if node.Name.Length > 0 {
            if liveText.Length > 0 {
                liveText.Append(' ')
            }
            liveText.Append(node.Name)
        }
        if text.Length > 0 && text != node.Name {
            if liveText.Length > 0 {
                liveText.Append(' ')
            }
            liveText.Append(text)
        }
        for child in record.Children {
            AppendLiveText(nodes[child])
        }
    }

    private func RelatedTextChanged(relations IReadOnlyList[AccessibilityId]) bool {
        for relation in relations {
            if !ids.TryGetValue(relation.Value, out var id) {
                continue
            }
            let target = nodes[id]
            if !target.Published {
                return true
            }
            let current = if target.Node.Name.Length > 0 {
                target.Node.Name
            } else {
                Text(target.Node)
            }
            let previous = if target.State.Name.Length > 0 {
                target.State.Name
            } else {
                target.PublishedText
            }
            if current != previous {
                return true
            }
        }
        return false
    }

    private func ReadState(node AccessibilityNode) NodeState {
        let flags = (
            if node.Disabled {
                1
            } else {
                0
            }
        ) | (
            if node.ReadOnly == true {
                1 << 1
            } else {
                0
            }
        ) | (
            if node.Required == true {
                1 << 2
            } else {
                0
            }
        ) | (
            if node.Invalid == true {
                1 << 3
            } else {
                0
            }
        ) | (
            if node.Busy == true {
                1 << 4
            } else {
                0
            }
        ) | (
            if node.Modal == true {
                1 << 5
            } else {
                0
            }
        ) | (
            if node.Multiline == true {
                1 << 6
            } else {
                0
            }
        ) | (
            if node.MultiSelectable == true {
                1 << 7
            } else {
                0
            }
        ) | (
            if node.HasPopup == true {
                1 << 8
            } else {
                0
            }
        ) | (
            if node.IsPassword {
                1 << 9
            } else {
                0
            }
        ) | (
            if node.Atomic == true {
                1 << 10
            } else {
                0
            }
        )
        var actions = 0
        for action in node.Actions {
            actions |= 1 << int32(action)
        }
        return NodeState(
            node.Role,
            node.Name,
            Description(node),
            StateDescription(node),
            node.CustomRole,
            RelationText(node.Relationships.ErrorMessage),
            flags,
            actions,
            node.Checked,
            node.Selected,
            node.Expanded,
            node.ValueNow,
            node.ValueMinimum,
            node.ValueMaximum,
            node.PositionInSet,
            node.SizeOfSet,
            node.Relationships.LabelledBy,
            node.Relationships.FlowTo,
            node.Live,
            node.Orientation
        )
    }

    private func SendTextChange(id int32, previous string, text string) {
        using let e AccessibilityEvent? = CreateEvent(id, EventTypes.ViewTextChanged)
        if e == nil {
            return
        }
        var start = 0
        while (start < previous.Length && start < text.Length && previous[start] == text[start]) {
            start++
        }
        if start > 0 && start < text.Length && char.IsLowSurrogate(text[start]) && char.IsHighSurrogate(
            text[start - 1]
        ) {
            start--
        }
        var oldEnd = previous.Length
        var newEnd = text.Length
        while (oldEnd > start && newEnd > start && previous[oldEnd - 1] == text[newEnd - 1]) {
            oldEnd--
            newEnd--
        }
        if oldEnd < previous.Length && oldEnd > start && char.IsLowSurrogate(previous[oldEnd]) && char.IsHighSurrogate(
            previous[oldEnd - 1]
        ) {
            oldEnd++
            newEnd++
        }
        e.BeforeText = previous
        e.FromIndex = start
        e.RemovedCount = oldEnd - start
        e.AddedCount = newEnd - start
        view.Parent?.RequestSendAccessibilityEvent(view, e)
    }

    private func SendSelectionChange(id int32, node AccessibilityNode, length int32) {
        if node.SelectionStart is not{} start || node.SelectionLength is not{} count {
            return
        }
        using let e AccessibilityEvent? = CreateEvent(id, EventTypes.ViewTextSelectionChanged)
        if e == nil {
            return
        }
        let caret = node.Caret ?? start + count
        e.FromIndex = if caret == start {
            start + count
        } else {
            start
        }
        e.ToIndex = caret
        e.ItemCount = length
        view.Parent?.RequestSendAccessibilityEvent(view, e)
    }

    private func SendScrollChange(id int32, record NodeRecord, scroll AccessibilityScrollInfo) {
        let scroll = scroll
        using let e AccessibilityEvent? = CreateEvent(id, EventTypes.ViewScrolled)
        if e == nil {
            return
        }
        let scale = PixelScale
        e.ScrollX = PixelOffset(scroll.X, scale.X)
        e.ScrollY = PixelOffset(scroll.Y, scale.Y)
        e.MaxScrollX = PixelOffset(scroll.MaximumX, scale.X)
        e.MaxScrollY = PixelOffset(scroll.MaximumY, scale.Y)
        e.ItemCount = record.Node.SizeOfSet ?? -1
        e.FromIndex = -1
        e.ToIndex = -1
        for child in record.Children {
            if nodes[child].Node is {VisibleBounds: not nil, PositionInSet: {} position} {
                e.FromIndex = if e.FromIndex < 0 {
                    position
                } else {
                    SystemMath.Min(e.FromIndex, position)
                }
                e.ToIndex = SystemMath.Max(e.ToIndex, position)
            }
        }
        view.Parent?.RequestSendAccessibilityEvent(view, e)
    }

    private data struct NodeUpdate(
        Record NodeRecord,
        Text string,
        State NodeState,
        Revision int64,
        Structure bool
    ) : IEquatable[NodeUpdate] { }

    private data struct NodeState(
        Role AccessibilityRole,
        Name string,
        Description string,
        DescriptionText string,
        CustomRole string,
        Error string,
        Flags int32,
        Actions int32,
        Checked AccessibilityChecked,
        Selected bool?,
        Expanded bool?,
        Now float64?,
        Minimum float64?,
        Maximum float64?,
        Position int32?,
        Size int32?,
        Labels IReadOnlyList[AccessibilityId],
        Flow IReadOnlyList[AccessibilityId],
        Live AccessibilityLive,
        Orientation AccessibilityOrientation
    ) : IEquatable[NodeState] { }

    shared {
        private func PixelOffset(value float64, scale float32) int32 -> int32(
            SystemMath.Clamp(SystemMath.Round(value * float64(scale)), 0.0, int32.MaxValue)
        )
    }
}
