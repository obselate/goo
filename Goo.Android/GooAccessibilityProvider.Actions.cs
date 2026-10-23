using Android.Graphics;
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
        info.AddAction(accessibilityFocus == id ? NativeAction.ActionClearAccessibilityFocus! : NativeAction.ActionAccessibilityFocus!);
        info.Clickable = PrimaryAction(node) is not null;
        if (info.Clickable) info.AddAction(NativeAction.ActionClick!);
        foreach (var action in node.Actions)
        {
            var native = action switch
            {
                AccessibilityAction.Focus => NativeAction.ActionFocus,
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
            if (scroll.TargetY > 0 || scroll.TargetX > 0) info.AddAction(NativeAction.ActionScrollBackward!);
            if (scroll.TargetY < scroll.MaximumY || scroll.TargetX < scroll.MaximumX) info.AddAction(NativeAction.ActionScrollForward!);
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
            if (!manager.IsEnabled || accessibilityFocus == virtualViewId) return false;
            view.Window.PerformAccessibilityAction(node.Id, new AccessibilityActionRequest(AccessibilityAction.ScrollIntoView));
            SetAccessibilityFocus(virtualViewId);
            return true;
        }
        if (action == NodeAction.ClearAccessibilityFocus)
        {
            if (accessibilityFocus != virtualViewId) return false;
            SetAccessibilityFocus(HostViewId);
            return true;
        }
        if (action is NodeAction.NextAtMovementGranularity or NodeAction.PreviousAtMovementGranularity)
            return MoveText(record, virtualViewId, action, arguments);
        var request = Request(node, action, arguments);
        if (request is null || !view.Window.PerformAccessibilityAction(node.Id, request))
            return false;
        if (request.Action == AccessibilityAction.Activate)
            Send(virtualViewId, EventTypes.ViewClicked);
        return true;
    }

    private static AccessibilityAction? PrimaryAction(AccessibilityNode node)
    {
        if (Supports(node, AccessibilityAction.Activate)) return AccessibilityAction.Activate;
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

    private static AccessibilityActionRequest? TryScroll(AccessibilityNode node, int action)
    {
        if (!Supports(node, AccessibilityAction.Scroll) || node.ScrollInfo is not { } scroll) return null;
        var x = scroll.TargetX;
        var y = scroll.TargetY;
        if (action == NativeAction.ActionScrollUp!.Id) y -= scroll.ViewportHeight;
        else if (action == NativeAction.ActionScrollDown!.Id) y += scroll.ViewportHeight;
        else if (action == NativeAction.ActionScrollLeft!.Id) x -= scroll.ViewportWidth;
        else if (action == NativeAction.ActionScrollRight!.Id) x += scroll.ViewportWidth;
        else if (action == (int)NodeAction.ScrollForward)
        {
            if (y < scroll.MaximumY) y += scroll.ViewportHeight;
            else x += scroll.ViewportWidth;
        }
        else if (action == (int)NodeAction.ScrollBackward)
        {
            if (y > 0) y -= scroll.ViewportHeight;
            else x -= scroll.ViewportWidth;
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
        if (text.Length == 0 || granularity is not (1 or 2 or 8)) return false;
        var forward = action == NodeAction.NextAtMovementGranularity;
        var from = Math.Clamp(record.Node.Caret ?? record.ReadingCursor, 0, text.Length);
        using var iterator = granularity == 2 ? BreakIterator.WordInstance : BreakIterator.CharacterInstance;
        iterator!.SetText(text);
        var to = granularity == 8 ? Paragraph(text, from, forward)
            : forward ? iterator.Following(from) : iterator.Preceding(from);
        if (to < 0 || to == from) return false;
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
        Send(id, EventTypes.ViewTextTraversedAtMovementGranularity, configure: e =>
        {
            e.FromIndex = from;
            e.ToIndex = to;
            e.SetAction((global::Android.AccessibilityServices.GlobalAction)(int)action);
            e.MovementGranularity = (MovementGranularity)granularity;
        });
        return true;
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

    private void Send(int id, EventTypes type, ContentChangeTypes changes = 0,
        Action<AccessibilityEvent>? configure = null)
    {
        if (!Available || !manager.IsEnabled || view.Parent is not { } parent) return;
        using var e = new AccessibilityEvent((int)type);
        e.SetSource(view, id);
        e.PackageName = view.Context!.PackageName;
        if (nodes.TryGetValue(id, out var record))
        {
            var node = record.Node;
            e.ClassName = ClassName(node);
            e.Enabled = !node.Disabled;
            e.Password = node.IsPassword;
            e.Checked = node.Checked == AccessibilityChecked.True;
            if (Text(node) is { Length: > 0 } text) e.Text!.Add(new Java.Lang.String(text));
            e.ContentDescription = node.Name;
        }
        e.ContentChangeTypes = changes;
        configure?.Invoke(e);
        parent.RequestSendAccessibilityEvent(view, e);
    }
}
