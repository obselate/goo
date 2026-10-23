using Android.Icu.Text;
using Android.OS;
using Android.Views.Accessibility;
using System.Globalization;
using NativeAction = Android.Views.Accessibility.AccessibilityNodeInfo.AccessibilityAction;
using NodeAction = Android.Views.Accessibility.Action;

namespace Goo.Android;

internal sealed partial class GooAccessibilityProvider
{
    private void PopulateActions(AccessibilityNodeInfo info, AccessibilityNode node, int id)
    {
        if (node.Id.Value != 0)
            info.AddAction(accessibilityFocus == id ? NativeAction.ActionClearAccessibilityFocus! : NativeAction.ActionAccessibilityFocus!);
        info.Clickable = PrimaryAction(node) is not null;
        if (info.Clickable) info.AddAction(NativeAction.ActionClick!);
        foreach (var action in node.Actions)
        {
            var native = action switch
            {
                AccessibilityAction.Focus when !node.Focused => NativeAction.ActionFocus,
                AccessibilityAction.Blur => NativeAction.ActionClearFocus,
                AccessibilityAction.SetSelection => NativeAction.ActionSetSelection,
                AccessibilityAction.Select => NativeAction.ActionSelect,
                AccessibilityAction.Deselect => NativeAction.ActionClearSelection,
                AccessibilityAction.Expand => NativeAction.ActionExpand,
                AccessibilityAction.Collapse => NativeAction.ActionCollapse,
                AccessibilityAction.ScrollIntoView => NativeAction.ActionShowOnScreen,
                AccessibilityAction.SetValue => IsEditor(node) ? NativeAction.ActionSetText
                    : node.ValueNow.HasValue && node.ValueMinimum.HasValue && node.ValueMaximum.HasValue ? NativeAction.ActionSetProgress : null,
                _ => null
            };
            if (native is not null) info.AddAction(native);
        }
        if (info.MovementGranularities != 0)
        {
            info.AddAction(NativeAction.ActionNextAtMovementGranularity!);
            info.AddAction(NativeAction.ActionPreviousAtMovementGranularity!);
        }
        if (node.ScrollInfo is { } scroll && Supports(node, AccessibilityAction.Scroll))
        {
            info.Scrollable = scroll.MaximumX > 0 || scroll.MaximumY > 0;
            if (scroll.TargetY > 0) info.AddAction(NativeAction.ActionScrollUp!);
            if (scroll.TargetY < scroll.MaximumY) info.AddAction(NativeAction.ActionScrollDown!);
            if (scroll.TargetX > 0) info.AddAction(NativeAction.ActionScrollLeft!);
            if (scroll.TargetX < scroll.MaximumX) info.AddAction(NativeAction.ActionScrollRight!);
            var rtl = view.LayoutDirection == global::Android.Views.LayoutDirection.Rtl;
            if (scroll.TargetY > 0 || (rtl ? scroll.TargetX < scroll.MaximumX : scroll.TargetX > 0))
                info.AddAction(NativeAction.ActionScrollBackward!);
            if (scroll.TargetY < scroll.MaximumY || (rtl ? scroll.TargetX > 0 : scroll.TargetX < scroll.MaximumX))
                info.AddAction(NativeAction.ActionScrollForward!);
        }
        foreach (var action in node.Actions)
        {
            if (action is not (AccessibilityAction.Increment or AccessibilityAction.Decrement)) continue;
            var increase = action == AccessibilityAction.Increment;
            if (node.ScrollInfo is null)
                info.AddAction(increase ? NativeAction.ActionScrollForward! : NativeAction.ActionScrollBackward!);
            else
                info.AddAction(new NativeAction(increase ? Resource.Id.goo_accessibility_increase : Resource.Id.goo_accessibility_decrease,
                    view.Context!.GetString(increase ? Resource.String.goo_accessibility_increase : Resource.String.goo_accessibility_decrease)));
        }
    }

    public override bool PerformAction(int virtualViewId, NodeAction action, Bundle? arguments)
    {
        if (!Available || !nodes.TryGetValue(virtualViewId, out var record))
            return false;
        var node = record.Node;
        if (action == NodeAction.AccessibilityFocus)
        {
            if (!manager.IsEnabled || accessibilityFocus == virtualViewId || pendingFocus == virtualViewId) return false;
            if (node.VisibleBounds is null)
            {
                if (!CanReveal(record) || !view.Window.PerformAccessibilityAction(node.Id,
                    new AccessibilityActionRequest(AccessibilityAction.ScrollIntoView))) return false;
                pendingFocus = virtualViewId;
            }
            else
                SetAccessibilityFocus(virtualViewId);
            return true;
        }
        if (action == NodeAction.ClearAccessibilityFocus)
        {
            if (pendingFocus == virtualViewId)
            {
                pendingFocus = HostViewId;
                return true;
            }
            if (accessibilityFocus != virtualViewId) return false;
            SetAccessibilityFocus(HostViewId);
            return true;
        }
        if (action is NodeAction.NextAtMovementGranularity or NodeAction.PreviousAtMovementGranularity)
            return MoveText(record, virtualViewId, action, arguments);
        var refocusEditor = action == NodeAction.Click && IsEditor(node) && node.Focused && node.ReadOnly != true;
        var request = Request(node, action, arguments);
        if (request is null || !view.Window.PerformAccessibilityAction(node.Id, request))
            return false;
        if (refocusEditor)
        {
            view.RequestFocus();
            view.ShowTextInput();
        }
        if (action == NodeAction.Click)
            Send(virtualViewId, EventTypes.ViewClicked);
        return true;
    }

    private static AccessibilityAction? PrimaryAction(AccessibilityNode node)
    {
        if (Supports(node, AccessibilityAction.Activate)) return AccessibilityAction.Activate;
        if (IsEditor(node) && Supports(node, AccessibilityAction.Focus)) return AccessibilityAction.Focus;
        if (node.Selected == true && Supports(node, AccessibilityAction.Deselect)) return AccessibilityAction.Deselect;
        if (Supports(node, AccessibilityAction.Select)) return AccessibilityAction.Select;
        if (node.Expanded == true && Supports(node, AccessibilityAction.Collapse)) return AccessibilityAction.Collapse;
        return Supports(node, AccessibilityAction.Expand) ? AccessibilityAction.Expand : null;
    }

    private AccessibilityActionRequest? Request(AccessibilityNode node, NodeAction action, Bundle? args)
    {
        if (action == NodeAction.SetText)
        {
            if (!IsEditor(node) || args?.ContainsKey(AccessibilityNodeInfo.ActionArgumentSetTextCharsequence) != true) return null;
            return AccessibilityActionRequest.SetValue(args.GetCharSequence(AccessibilityNodeInfo.ActionArgumentSetTextCharsequence)?.ToString() ?? "");
        }
        if (action == NodeAction.SetSelection)
        {
            if (args?.ContainsKey(AccessibilityNodeInfo.ActionArgumentSelectionStartInt) != true
                || !args.ContainsKey(AccessibilityNodeInfo.ActionArgumentSelectionEndInt)) return null;
            var start = args.GetInt(AccessibilityNodeInfo.ActionArgumentSelectionStartInt);
            var end = args.GetInt(AccessibilityNodeInfo.ActionArgumentSelectionEndInt);
            var length = Text(node).Length;
            return start < 0 || end < 0 || start > length || end > length ? null
                : AccessibilityActionRequest.SetSelection(Math.Min(start, end), Math.Abs(end - start), end);
        }
        if ((int)action == NativeAction.ActionSetProgress!.Id)
        {
            if (args?.ContainsKey(AccessibilityNodeInfo.ActionArgumentProgressValue) != true) return null;
            var value = args.GetFloat(AccessibilityNodeInfo.ActionArgumentProgressValue);
            return !float.IsFinite(value) || node.ValueNow is null || node.ValueMinimum is not { } minimum || node.ValueMaximum is not { } maximum
                || value < minimum || value > maximum ? null : AccessibilityActionRequest.SetValue(value.ToString(CultureInfo.InvariantCulture));
        }
        if (TryScroll(node, (int)action) is { } scroll) return scroll;
        var neutral = action switch
        {
            NodeAction.Focus => AccessibilityAction.Focus,
            NodeAction.ClearFocus => AccessibilityAction.Blur,
            NodeAction.Click => PrimaryAction(node),
            NodeAction.Select => AccessibilityAction.Select,
            NodeAction.ClearSelection => AccessibilityAction.Deselect,
            NodeAction.Expand => AccessibilityAction.Expand,
            NodeAction.Collapse => AccessibilityAction.Collapse,
            _ => (int)action == NativeAction.ActionShowOnScreen!.Id ? AccessibilityAction.ScrollIntoView
                : (int)action == Resource.Id.goo_accessibility_increase ? AccessibilityAction.Increment
                : (int)action == Resource.Id.goo_accessibility_decrease ? AccessibilityAction.Decrement
                : node.ScrollInfo is null && action == NodeAction.ScrollForward ? AccessibilityAction.Increment
                : node.ScrollInfo is null && action == NodeAction.ScrollBackward ? AccessibilityAction.Decrement : (AccessibilityAction?)null
        };
        return neutral is { } valueAction ? new AccessibilityActionRequest(valueAction) : null;
    }

    private AccessibilityActionRequest? TryScroll(AccessibilityNode node, int action)
    {
        if (!Supports(node, AccessibilityAction.Scroll) || node.ScrollInfo is not { } scroll) return null;
        var x = scroll.TargetX;
        var y = scroll.TargetY;
        var rtl = view.LayoutDirection == global::Android.Views.LayoutDirection.Rtl;
        if (action == NativeAction.ActionScrollUp!.Id) y -= scroll.ViewportHeight;
        else if (action == NativeAction.ActionScrollDown!.Id) y += scroll.ViewportHeight;
        else if (action == NativeAction.ActionScrollLeft!.Id) x -= scroll.ViewportWidth;
        else if (action == NativeAction.ActionScrollRight!.Id) x += scroll.ViewportWidth;
        else if (action == (int)NodeAction.ScrollForward)
        {
            var horizontal = node.Orientation == AccessibilityOrientation.Horizontal && (rtl ? x > 0 : x < scroll.MaximumX);
            if (!horizontal && y < scroll.MaximumY) y += scroll.ViewportHeight;
            else x += rtl ? -scroll.ViewportWidth : scroll.ViewportWidth;
        }
        else if (action == (int)NodeAction.ScrollBackward)
        {
            var horizontal = node.Orientation == AccessibilityOrientation.Horizontal && (rtl ? x < scroll.MaximumX : x > 0);
            if (!horizontal && y > 0) y -= scroll.ViewportHeight;
            else x += rtl ? scroll.ViewportWidth : -scroll.ViewportWidth;
        }
        else return null;
        x = Math.Clamp(x, 0, scroll.MaximumX);
        y = Math.Clamp(y, 0, scroll.MaximumY);
        return x == scroll.TargetX && y == scroll.TargetY ? null : AccessibilityActionRequest.Scroll(x, y);
    }

    private bool MoveText(NodeRecord record, int id, NodeAction action, Bundle? args)
    {
        var granularity = args?.GetInt(AccessibilityNodeInfo.ActionArgumentMovementGranularityInt) ?? 0;
        var text = Text(record.Node);
        if (text.Length == 0 || granularity is not (1 or 2 or 8)
            || record.Node.IsPassword && granularity != 1) return false;
        var forward = action == NodeAction.NextAtMovementGranularity;
        var from = Math.Clamp(record.Node.Caret ?? record.ReadingCursor, 0, text.Length);
        var segment = granularity == 2 ? MoveWord(record, text, from, forward) : default;
        var to = granularity == 2 ? forward ? segment.End : segment.Start
            : granularity == 8 ? Paragraph(text, from, forward) : MoveCharacter(record, text, from, forward);
        if (to < 0 || to == from) return false;
        if (granularity != 2) segment = (Math.Min(from, to), Math.Max(from, to));
        if (Supports(record.Node, AccessibilityAction.SetSelection))
        {
            var anchor = from;
            if (args?.GetBoolean(AccessibilityNodeInfo.ActionArgumentExtendSelectionBoolean) == true
                && record.Node.SelectionStart is { } start && record.Node.SelectionLength is { } length)
                anchor = from == start ? start + length : start;
            var request = AccessibilityActionRequest.SetSelection(Math.Min(anchor, to), Math.Abs(to - anchor), to);
            if (!view.Window.PerformAccessibilityAction(record.Node.Id, request)) return false;
        }
        record.ReadingCursor = to;
        using var e = CreateEvent(id, EventTypes.ViewTextTraversedAtMovementGranularity);
        if (e is not null)
        {
            e.FromIndex = segment.Start;
            e.ToIndex = segment.End;
            e.SetAction((global::Android.AccessibilityServices.GlobalAction)(int)action);
            e.MovementGranularity = (MovementGranularity)granularity;
            view.Parent?.RequestSendAccessibilityEvent(view, e);
        }
        return true;
    }

    private static int MoveCharacter(NodeRecord record, string text, int from, bool forward)
    {
        if (!ReferenceEquals(record.BoundaryText, text))
        {
            record.BoundaryText = text;
            record.Boundaries = StringInfo.ParseCombiningCharacters(text);
        }
        var index = Array.BinarySearch(record.Boundaries, from);
        index = index >= 0 ? forward ? index + 1 : index - 1 : forward ? ~index : ~index - 1;
        return index < 0 ? -1 : index < record.Boundaries.Length ? record.Boundaries[index] : text.Length;
    }

    private static (int Start, int End) MoveWord(NodeRecord record, string text, int from, bool forward)
    {
        var iterator = record.Words ??= BreakIterator.WordInstance!;
        if (!ReferenceEquals(record.WordText, text))
        {
            iterator.SetText(text);
            record.WordText = text;
        }
        var to = forward ? iterator.Following(from) : iterator.Preceding(from);
        while (to >= 0)
        {
            if (!forward) iterator.Following(to);
            if (iterator.RuleStatus >= (int)BreakWord.NoneLimit)
                return forward ? (iterator.Previous(), to) : (to, iterator.Current());
            to = forward ? iterator.Next() : iterator.Preceding(to);
        }
        return (-1, -1);
    }

    private static int Paragraph(string text, int from, bool forward)
    {
        if (forward)
        {
            var next = text.IndexOf('\n', from);
            return next < 0 ? text.Length : next + 1;
        }
        return from <= 1 ? 0 : text.LastIndexOf('\n', from - 2) + 1;
    }

    private void SetAccessibilityFocus(int id)
    {
        if (accessibilityFocus == id) return;
        var previous = accessibilityFocus;
        accessibilityFocus = id;
        if (previous != HostViewId) Send(previous, EventTypes.ViewAccessibilityFocusCleared);
        if (id != HostViewId) Send(id, EventTypes.ViewAccessibilityFocused);
        view.Invalidate();
    }

    private void Send(int id, EventTypes type, ContentChangeTypes changes = 0)
    {
        using var e = CreateEvent(id, type, changes);
        if (e is not null) view.Parent?.RequestSendAccessibilityEvent(view, e);
    }

    private AccessibilityEvent? CreateEvent(int id, EventTypes type, ContentChangeTypes changes = 0)
    {
        if (disposed || view.Parent is null || !Available
            && (id != HostViewId && type is not (EventTypes.ViewAccessibilityFocusCleared or EventTypes.ViewHoverExit)
                || !view.IsAttachedToWindow || !manager.IsEnabled)) return null;
        var e = new AccessibilityEvent((int)type);
        e.SetSource(view, id);
        e.PackageName = view.Context!.PackageName;
        e.ClassName = "android.view.View";
        if (nodes.TryGetValue(id, out var record))
        {
            var node = record.Node;
            e.ClassName = ClassName(node);
            e.Enabled = !node.Disabled;
            e.Password = node.IsPassword;
            e.Checked = node.Checked == AccessibilityChecked.True;
            if (Text(node) is { Length: > 0 } value)
            {
                using var text = new Java.Lang.String(value);
                e.Text!.Add(text);
            }
            e.ContentDescription = node.Name;
        }
        e.ContentChangeTypes = changes;
        return e;
    }
}
