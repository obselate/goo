package Goo.Android

import Android.AccessibilityServices
import Android.Icu.Text
import Android.OS
import Android.Views
import Android.Views.Accessibility
import Goo
import Java.Lang
import NativeAction = Android.Views.Accessibility.AccessibilityNodeInfo.AccessibilityAction
import NodeAction = Android.Views.Accessibility.Action
import System
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
    private func PopulateActions(info AccessibilityNodeInfo, node AccessibilityNode, id int32) {
        if node.Id.Value != int64(0) {
            info.AddAction(
                if accessibilityFocus == id {
                    NativeAction.ActionClearAccessibilityFocus
                } else {
                    NativeAction.ActionAccessibilityFocus
                }
            )
        }
        info.Clickable = PrimaryAction(node) != nil
        if info.Clickable {
            info.AddAction(NativeAction.ActionClick!!)
        }
        for action in node.Actions {
            let native AccessibilityNodeInfo.AccessibilityAction? = switch action {
                case AccessibilityAction.Focus when !node.Focused: NativeAction.ActionFocus
                case AccessibilityAction.Blur: NativeAction.ActionClearFocus
                case AccessibilityAction.SetSelection: NativeAction.ActionSetSelection
                case AccessibilityAction.Select: NativeAction.ActionSelect
                case AccessibilityAction.Deselect: NativeAction.ActionClearSelection
                case AccessibilityAction.Expand: NativeAction.ActionExpand
                case AccessibilityAction.Collapse: NativeAction.ActionCollapse
                case AccessibilityAction.ScrollIntoView: NativeAction.ActionShowOnScreen
                case AccessibilityAction.SetValue: if IsEditor(node) {
                    NativeAction.ActionSetText
                } else {
                    (
                        if (node.ValueNow != nil) && (node.ValueMinimum != nil) && (node.ValueMaximum != nil) {
                            NativeAction.ActionSetProgress
                        } else {
                            default(AccessibilityNodeInfo.AccessibilityAction?)
                        }
                    )
                }
                default: default(AccessibilityNodeInfo.AccessibilityAction?)
            }
            if native != nil {
                info.AddAction(native)
            }
        }
        if info.MovementGranularities != 0 {
            info.AddAction(NativeAction.ActionNextAtMovementGranularity!!)
            info.AddAction(NativeAction.ActionPreviousAtMovementGranularity!!)
        }
        let __spill0 = node.ScrollInfo
        var scroll AccessibilityScrollInfo
        if __spill0 != nil && {
            scroll = __spill0!!
            true
        } && Supports(node, AccessibilityAction.Scroll) {
            info.Scrollable = scroll.MaximumX > float64(0.0) || scroll.MaximumY > float64(0.0)
            if scroll.TargetY > float64(0.0) {
                info.AddAction(NativeAction.ActionScrollUp!!)
            }
            if scroll.TargetY < scroll.MaximumY {
                info.AddAction(NativeAction.ActionScrollDown!!)
            }
            if scroll.TargetX > float64(0.0) {
                info.AddAction(NativeAction.ActionScrollLeft!!)
            }
            if scroll.TargetX < scroll.MaximumX {
                info.AddAction(NativeAction.ActionScrollRight!!)
            }
            let rtl = view.LayoutDirection == LayoutDirection.Rtl
            if scroll.TargetY > float64(0.0) ||
                (
                if rtl {
                    scroll.TargetX < scroll.MaximumX
                } else {
                    scroll.TargetX > float64(0.0)
                }
            ) {
                info.AddAction(NativeAction.ActionScrollBackward!!)
            }
            if scroll.TargetY < scroll.MaximumY ||
                (
                if rtl {
                    scroll.TargetX > float64(0.0)
                } else {
                    scroll.TargetX < scroll.MaximumX
                }
            ) {
                info.AddAction(NativeAction.ActionScrollForward!!)
            }
        }
        for action in node.Actions {
            if !((action == AccessibilityAction.Increment || action == AccessibilityAction.Decrement)) {
                continue
            }
            let increase = action == AccessibilityAction.Increment
            if node.ScrollInfo == nil {
                info.AddAction(
                    if increase {
                        NativeAction.ActionScrollForward
                    } else {
                        NativeAction.ActionScrollBackward
                    }
                )
            } else {
                info.AddAction(
                    AccessibilityNodeInfo.AccessibilityAction(
                        if increase {
                            _Microsoft.Android.Resource.Designer.Resource.Id.goo_accessibility_increase
                        } else {
                            _Microsoft.Android.Resource.Designer.Resource.Id.goo_accessibility_decrease
                        },
                        view.Context!!.GetString(
                            if increase {
                                _Microsoft.Android.Resource.Designer.Resource.String.goo_accessibility_increase
                            } else {
                                _Microsoft.Android.Resource.Designer.Resource.String.goo_accessibility_decrease
                            }
                        )
                    )
                )
            }
        }
    }

    override func PerformAction(virtualViewId int32, action NodeAction, arguments Bundle?) bool {
        if !Available || !nodes.TryGetValue(virtualViewId, out var record) {
            return false
        }
        let node = record.Node
        if action == NodeAction.AccessibilityFocus {
            if !manager.IsEnabled || accessibilityFocus == virtualViewId || pendingFocus == virtualViewId {
                return false
            }
            if node.VisibleBounds == nil {
                if !CanReveal(record) || !view.Window.PerformAccessibilityAction(
                    node.Id,
                    AccessibilityActionRequest(AccessibilityAction.ScrollIntoView)
                ) {
                    return false
                }
                pendingFocus = virtualViewId
            } else {
                SetAccessibilityFocus(virtualViewId)
            }
            return true
        }
        if action == NodeAction.ClearAccessibilityFocus {
            if pendingFocus == virtualViewId {
                pendingFocus = AccessibilityNodeProvider.HostViewId
                return true
            }
            if accessibilityFocus != virtualViewId {
                return false
            }
            SetAccessibilityFocus(AccessibilityNodeProvider.HostViewId)
            return true
        }
        if action == NodeAction.NextAtMovementGranularity || action == NodeAction.PreviousAtMovementGranularity {
            return MoveText(record, virtualViewId, action, arguments)
        }
        let refocusEditor = action == NodeAction.Click && IsEditor(node) && node.Focused && node.ReadOnly != true
        let request AccessibilityActionRequest? = Request(node, action, arguments)
        if request == nil || !view.Window.PerformAccessibilityAction(node.Id, request) {
            return false
        }
        if refocusEditor {
            view.RequestFocus()
            view.ShowTextInput()
        }
        if action == NodeAction.Click {
            Send(virtualViewId, EventTypes.ViewClicked)
        }
        return true
    }

    private func Request(node AccessibilityNode, action NodeAction, args Bundle?) AccessibilityActionRequest? {
        if action == NodeAction.SetText {
            if !IsEditor(node) || args?.ContainsKey(AccessibilityNodeInfo.ActionArgumentSetTextCharsequence) != true {
                return nil
            }
            return AccessibilityActionRequest.SetValue(
                args!!.GetCharSequence(AccessibilityNodeInfo.ActionArgumentSetTextCharsequence)?.ToString() ?? ""
            )
        }
        if action == NodeAction.SetSelection {
            if args?.ContainsKey(AccessibilityNodeInfo.ActionArgumentSelectionStartInt) != true || !args!!.ContainsKey(
                AccessibilityNodeInfo.ActionArgumentSelectionEndInt
            ) {
                return nil
            }
            let start = args!!.GetInt(AccessibilityNodeInfo.ActionArgumentSelectionStartInt)
            let end = args!!.GetInt(AccessibilityNodeInfo.ActionArgumentSelectionEndInt)
            let length = Text(node).Length
            return if start < 0 || end < 0 || start > length || end > length {
                default(AccessibilityActionRequest?)
            } else {
                AccessibilityActionRequest.SetSelection(SystemMath.Min(start, end), SystemMath.Abs(end - start), end)
            }
        }
        if int32(action) == NativeAction.ActionSetProgress!!.Id {
            if args?.ContainsKey(AccessibilityNodeInfo.ActionArgumentProgressValue) != true {
                return nil
            }
            let value = args!!.GetFloat(AccessibilityNodeInfo.ActionArgumentProgressValue)
            return if !float32.IsFinite(value) ||
                node.ValueNow == nil ||
                node.ValueMinimum is not{} minimum ||
                node.ValueMaximum is not{} maximum ||
                float64(value) < minimum ||
                float64(value) > maximum {
                default(AccessibilityActionRequest?)
            } else {
                AccessibilityActionRequest.SetValue(value.ToString(CultureInfo.InvariantCulture))
            }
        }
        if TryScroll(node, int32(action)) is {} scroll {
            return scroll
        }
        let neutral = switch action {
            case NodeAction.Focus: AccessibilityAction.Focus
            case NodeAction.ClearFocus: AccessibilityAction.Blur
            case NodeAction.Click: PrimaryAction(node)
            case NodeAction.Select: AccessibilityAction.Select
            case NodeAction.ClearSelection: AccessibilityAction.Deselect
            case NodeAction.Expand: AccessibilityAction.Expand
            case NodeAction.Collapse: AccessibilityAction.Collapse
            default: if int32(action) == NativeAction.ActionShowOnScreen!!.Id {
                AccessibilityAction.ScrollIntoView
            } else {
                (
                    if int32(action) == _Microsoft.Android.Resource.Designer.Resource.Id.goo_accessibility_increase {
                        AccessibilityAction.Increment
                    } else {
                        (
                            if int32(action) == _Microsoft
                                .Android
                                .Resource
                                .Designer
                                .Resource
                                .Id
                                .goo_accessibility_decrease {
                                AccessibilityAction.Decrement
                            } else {
                                (
                                    if node.ScrollInfo == nil && action == NodeAction.ScrollForward {
                                        AccessibilityAction.Increment
                                    } else {
                                        (
                                            if node.ScrollInfo == nil && action == NodeAction.ScrollBackward {
                                                AccessibilityAction.Decrement
                                            } else {
                                                default(AccessibilityAction?)
                                            }
                                        )
                                    }
                                )
                            }
                        )
                    }
                )
            }
        }
        return if neutral is {} valueAction {
            AccessibilityActionRequest(valueAction)
        } else {
            default(AccessibilityActionRequest?)
        }
    }

    private func TryScroll(node AccessibilityNode, action int32) AccessibilityActionRequest? {
        if !Supports(node, AccessibilityAction.Scroll) {
            return nil
        }
        let scroll AccessibilityScrollInfo? = node.ScrollInfo
        if scroll == nil {
            return nil
        }
        var x = scroll.TargetX
        var y = scroll.TargetY
        let rtl = view.LayoutDirection == LayoutDirection.Rtl
        if action == NativeAction.ActionScrollUp!!.Id {
            y -= scroll.ViewportHeight
        } else if action == NativeAction.ActionScrollDown!!.Id {
            y += scroll.ViewportHeight
        } else if action == NativeAction.ActionScrollLeft!!.Id {
            x -= scroll.ViewportWidth
        } else if action == NativeAction.ActionScrollRight!!.Id {
            x += scroll.ViewportWidth
        } else if action == int32(NodeAction.ScrollForward) {
            let horizontal = node.Orientation == AccessibilityOrientation.Horizontal &&
                (
                if rtl {
                    x > float64(0.0)
                } else {
                    x < scroll.MaximumX
                }
            )
            if !horizontal && y < scroll.MaximumY {
                y += scroll.ViewportHeight
            } else {
                x += if rtl {
                    -scroll.ViewportWidth
                } else {
                    scroll.ViewportWidth
                }
            }
        } else if action == int32(NodeAction.ScrollBackward) {
            let horizontal = node.Orientation == AccessibilityOrientation.Horizontal &&
                (
                if rtl {
                    x < scroll.MaximumX
                } else {
                    x > float64(0.0)
                }
            )
            if !horizontal && y > float64(0.0) {
                y -= scroll.ViewportHeight
            } else {
                x += if rtl {
                    scroll.ViewportWidth
                } else {
                    -scroll.ViewportWidth
                }
            }
        } else {
            return nil
        }
        x = SystemMath.Clamp(x, 0.0, scroll.MaximumX)
        y = SystemMath.Clamp(y, 0.0, scroll.MaximumY)
        return if x == scroll.TargetX && y == scroll.TargetY {
            default(AccessibilityActionRequest?)
        } else {
            AccessibilityActionRequest.Scroll(x, y)
        }
    }

    private func MoveText(record NodeRecord, id int32, action NodeAction, args Bundle?) bool {
        let granularity = args?.GetInt(AccessibilityNodeInfo.ActionArgumentMovementGranularityInt) ?? 0
        let text = Text(record.Node)
        if text.Length == 0 ||
            !((granularity == 1 || granularity == 2 || granularity == 8)) ||
            record
            .Node
            .IsPassword &&
            granularity != 1 {
            return false
        }
        let forward = action == NodeAction.NextAtMovementGranularity
        let from = SystemMath.Clamp(record.Node.Caret ?? record.ReadingCursor, 0, text.Length)
        var segment = if granularity == 2 {
            MoveWord(record, text, from, forward)
        } else {
            default((Start int32, End int32))
        }
        let to = if granularity == 2 {
            (
                if forward {
                    segment.End
                } else {
                    segment.Start
                }
            )
        } else {
            (
                if granularity == 8 {
                    Paragraph(text, from, forward)
                } else {
                    MoveCharacter(record, text, from, forward)
                }
            )
        }
        if to < 0 || to == from {
            return false
        }
        if granularity != 2 {
            segment = (SystemMath.Min(from, to), SystemMath.Max(from, to))
        }
        if Supports(record.Node, AccessibilityAction.SetSelection) {
            var anchor = from
            if args?.GetBoolean(AccessibilityNodeInfo.ActionArgumentExtendSelectionBoolean) == true &&
                record
                .Node
                .SelectionStart is {} start &&
                record
                .Node
                .SelectionLength is {} length {
                anchor = if from == start {
                    start + length
                } else {
                    start
                }
            }
            let request = AccessibilityActionRequest.SetSelection(
                SystemMath.Min(anchor, to),
                SystemMath.Abs(to - anchor),
                to
            )
            if !view.Window.PerformAccessibilityAction(record.Node.Id, request) {
                return false
            }
        }
        record.ReadingCursor = to
        using let e AccessibilityEvent? = CreateEvent(id, EventTypes.ViewTextTraversedAtMovementGranularity)
        if e != nil {
            e.FromIndex = segment.Start
            e.ToIndex = segment.End
            e.SetAction(GlobalAction(int32(action)))
            e.MovementGranularity = MovementGranularity(granularity)
            view.Parent?.RequestSendAccessibilityEvent(view, e)
        }
        return true
    }

    private func SetAccessibilityFocus(id int32) {
        if accessibilityFocus == id {
            return
        }
        let previous = accessibilityFocus
        accessibilityFocus = id
        if previous != AccessibilityNodeProvider.HostViewId {
            Send(previous, EventTypes.ViewAccessibilityFocusCleared)
        }
        if id != AccessibilityNodeProvider.HostViewId {
            Send(id, EventTypes.ViewAccessibilityFocused)
        }
        view.Invalidate()
    }

    private func Send(id int32, type EventTypes, changes ContentChangeTypes = ContentChangeTypes.Undefined) {
        using let e AccessibilityEvent? = CreateEvent(id, type, changes)
        if e != nil {
            view.Parent?.RequestSendAccessibilityEvent(view, e)
        }
    }

    private func CreateEvent(
        id int32,
        type EventTypes,
        changes ContentChangeTypes = ContentChangeTypes.Undefined
    ) AccessibilityEvent? {
        if disposed ||
            view.Parent == nil ||
            !Available &&
            (
            id != AccessibilityNodeProvider.HostViewId &&
                !((type == EventTypes.ViewAccessibilityFocusCleared || type == EventTypes.ViewHoverExit)) ||
                !view.IsAttachedToWindow ||
                !manager.IsEnabled
        ) {
            return nil
        }
        let e = AccessibilityEvent(int32(type))
        e.SetSource(view, id)
        e.PackageName = view.Context!!.PackageName
        e.ClassName = "android.view.View"
        if nodes.TryGetValue(id, out var record) {
            let node = record.Node
            e.ClassName = ClassName(node)
            e.Enabled = !node.Disabled
            e.Password = node.IsPassword
            e.Checked = node.Checked == AccessibilityChecked.True
            if Text(node) is {Length: > 0} value {
                using let text = Java.Lang.String(value)
                e.Text!!.Add(text)
            }
            e.ContentDescription = node.Name
        }
        e.ContentChangeTypes = changes
        return e
    }

    shared {
        private func PrimaryAction(node AccessibilityNode) AccessibilityAction? {
            if Supports(node, AccessibilityAction.Activate) {
                return AccessibilityAction.Activate
            }
            if IsEditor(node) && Supports(node, AccessibilityAction.Focus) {
                return AccessibilityAction.Focus
            }
            if node.Selected == true && Supports(node, AccessibilityAction.Deselect) {
                return AccessibilityAction.Deselect
            }
            if Supports(node, AccessibilityAction.Select) {
                return AccessibilityAction.Select
            }
            if node.Expanded == true && Supports(node, AccessibilityAction.Collapse) {
                return AccessibilityAction.Collapse
            }
            return if Supports(node, AccessibilityAction.Expand) {
                AccessibilityAction.Expand
            } else {
                nil
            }
        }

        private func MoveCharacter(record NodeRecord, text string, from int32, forward bool) int32 {
            if !object.ReferenceEquals(record.BoundaryText, text) {
                record.BoundaryText = text
                record.Boundaries = StringInfo.ParseCombiningCharacters(text)
            }
            var index = Array.BinarySearch(record.Boundaries, from)
            index = if index >= 0 {
                (
                    if forward {
                        index + 1
                    } else {
                        index - 1
                    }
                )
            } else {
                (
                    if forward {
                        ~index
                    } else {
                        ~index - 1
                    }
                )
            }
            return if index < 0 {
                -1
            } else {
                (
                    if index < record.Boundaries.Length {
                        record.Boundaries[index]
                    } else {
                        text.Length
                    }
                )
            }
        }

        private func MoveWord(record NodeRecord, text string, from int32, forward bool)(Start int32, End int32) {
            let iterator = {
                let __spill1 = record.Words
                (
                    if __spill1 == nil {
                        (record.Words = BreakIterator.WordInstance!!)
                    } else {
                        __spill1
                    }
                )!!
            }
            if !object.ReferenceEquals(record.WordText, text) {
                iterator.SetText(text)
                record.WordText = text
            }
            var to = if forward {
                iterator.Following(from)
            } else {
                iterator.Preceding(from)
            }
            while to >= 0 {
                if !forward {
                    iterator.Following(to)
                }
                if iterator.RuleStatus >= int32(BreakWord.NoneLimit) {
                    return if forward {
                        (iterator.Previous(), to)
                    } else {
                        (to, iterator.Current())
                    }
                }
                to = if forward {
                    iterator.Next()
                } else {
                    iterator.Preceding(to)
                }
            }
            return (-1, -1)
        }

        private func Paragraph(text string, from int32, forward bool) int32 {
            if forward {
                let next = text.IndexOf('\n', from)
                return if next < 0 {
                    text.Length
                } else {
                    next + 1
                }
            }
            return if from <= 1 {
                0
            } else {
                text.LastIndexOf('\n', from - 2) + 1
            }
        }
    }
}
