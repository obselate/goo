package Goo

import System
import System.Globalization
import System.Runtime.InteropServices

internal class NativeAccessibilityRequest {
  internal var Action uint8
  internal var Target uint64
  internal var Tag int32 = -1
  internal var Value string = ""
  internal var Number float64
  internal var X float64
  internal var Y float64
  internal var Custom int32
  internal var AnchorNode uint64
  internal var AnchorIndex uint64
  internal var FocusNode uint64
  internal var FocusIndex uint64
}

public sealed partial class NativeAccessibilityAdapter {
  private func DispatchAction(expected int64, nativeRequest NativeAccessibilityRequest) {
    if binding != expected || native == nint(0) { return }
    guard let window = owner else { return }
    try {
      let target = nativeRequest.Target
      var id AccessibilityId
      if target >= 9223372036854775808uL {
        if !textRuns.TryGetValue(target, out var run) { return }
        id = run.Owner
      } else {
        if target < 2uL { return }
        id = AccessibilityId(int64(target - 2uL))
      }
      guard let source = window.NativeAccessibilityNodeFor(id) else { return }
      guard let semantic = AccessibilityNodeStates.Get(source) else { return }
      let request = ConvertAction(nativeRequest, semantic, source)
      if let value = request { window.PerformAccessibilityAction(id, value) }
    } catch (error Exception) { window.ReportNativeAccessibilityError(error) }
  }

  private func ConvertAction(request NativeAccessibilityRequest, node AccessibilityNode, source Node) AccessibilityActionRequest? {
    switch int32(request.Action) {
      case 0 {
        if node.Selected == true && Supports(node, AccessibilityAction.Deselect) { return AccessibilityActionRequest(AccessibilityAction.Deselect) }
        if Supports(node, AccessibilityAction.Select) { return AccessibilityActionRequest(AccessibilityAction.Select) }
        if Supports(node, AccessibilityAction.Activate) { return AccessibilityActionRequest(AccessibilityAction.Activate) }
        if node.Expanded == true && Supports(node, AccessibilityAction.Collapse) { return AccessibilityActionRequest(AccessibilityAction.Collapse) }
        if Supports(node, AccessibilityAction.Expand) { return AccessibilityActionRequest(AccessibilityAction.Expand) }
      }
      case 1 { return AccessibilityActionRequest(AccessibilityAction.Focus)
      }
      case 3 { return AccessibilityActionRequest(AccessibilityAction.Collapse)
      }
      case 4 { return AccessibilityActionRequest(AccessibilityAction.Expand)
      }
      case 5 {
        if request.Tag == 0 && request.Custom == 100 + int32(AccessibilityAction.Select) { return AccessibilityActionRequest(AccessibilityAction.Select) }
        if request.Tag == 0 && request.Custom == 100 + int32(AccessibilityAction.Deselect) { return AccessibilityActionRequest(AccessibilityAction.Deselect) }
      }
      case 6 { return AccessibilityActionRequest(AccessibilityAction.Decrement)
      }
      case 7 { return AccessibilityActionRequest(AccessibilityAction.Increment)
      }
      case 11, 12, 13, 14 {
        let page = request.Tag == 3 && request.Custom == 1
        let dx = page ? float64(source.Rect.W) : 40.0
        let dy = page ? float64(source.Rect.H) : 40.0
        let x = (source.EditorController?.ScrollTargetX ?? float64(source.ScrollTargetX)) + (request.Action == uint8(12) ? -dx : request.Action == uint8(13) ? dx : 0.0)
        let y = (source.EditorController?.ScrollTargetY ?? float64(source.ScrollTargetY)) + (request.Action == uint8(14) ? -dy : request.Action == uint8(11) ? dy : 0.0)
        return AccessibilityActionRequest.Scroll(Math.Max(0.0, x), Math.Max(0.0, y))
      }
      case 17 {
        if request.Tag == 6 && Double.IsFinite(request.X) && Double.IsFinite(request.Y) {
          return AccessibilityActionRequest.Scroll(Math.Max(0.0, request.X), Math.Max(0.0, request.Y))
        }
      }
      case 18 {
        if request.Tag != 7 { return nil }
        if !TryTextOffset(node.Id, request.AnchorNode, request.AnchorIndex, out var anchor)
          || !TryTextOffset(node.Id, request.FocusNode, request.FocusIndex, out var focus) { return nil }
        return AccessibilityActionRequest.SetSelection(Math.Min(anchor, focus), Math.Abs(anchor - focus), focus)
      }
      case 20 {
        if request.Tag == 1 { return AccessibilityActionRequest.SetValue(request.Value) }
        if request.Tag == 2 && Double.IsFinite(request.Number) { return AccessibilityActionRequest.SetValue(request.Number.ToString(CultureInfo.InvariantCulture)) }
      }
    }
    return nil
  }

  private func TryTextOffset(ownerId AccessibilityId, id uint64, index uint64, out offset int32) bool {
    offset = 0
    if !textRuns.TryGetValue(id, out var run) || run.Owner != ownerId || index >= uint64(run.Starts.Length) { return false }
    offset = run.Start + run.Starts[int32(index)]
    return true
  }

  shared {
    private func Action(request nint, data nint) {
      try {
        guard let adapter = Find(data), let window = adapter.owner else { return }
        let owned = ReadAction(request)
        let expected = int64(data)
        window.TryPost(() -> adapter.DispatchAction(expected, owned))
      } catch (error Exception) {
        ReportActionError(data, error)
      } finally { AccessKitNative.ActionRequestFree(request) }
    }

    private func ReportActionError(data nint, error Exception) {
      guard let adapter = Find(data), let window = adapter.owner else { return }
      window.TryPost(() -> window.ReportNativeAccessibilityError(error))
    }

    internal func ReadAction(request nint) NativeAccessibilityRequest {
      if request == nint(0) { throw ArgumentNullException("request") }
      // Pinned accesskit_action_request: action@0, tree UUID@1, node@24,
      // optional flag@32, data tag@40, payload union@48; sizeof=80 on x64/arm64.
      let result = NativeAccessibilityRequest()
      result.Action = Marshal.ReadByte(request, 0)
      result.Target = uint64(Marshal.ReadInt64(request, 24))
      if Marshal.ReadByte(request, 32) == 0 { return result }
      result.Tag = Marshal.ReadInt32(request, 40)
      switch result.Tag {
        case 0 { result.Custom = Marshal.ReadInt32(request, 48)
        }
        case 1 { result.Value = Marshal.PtrToStringUTF8(Marshal.ReadIntPtr(request, 48)) ?? ""
        }
        case 2 { result.Number = BitConverter.Int64BitsToDouble(Marshal.ReadInt64(request, 48))
        }
        case 3 { result.Custom = int32(Marshal.ReadByte(request, 48))
        }
        case 5, 6 {
          result.X = BitConverter.Int64BitsToDouble(Marshal.ReadInt64(request, 48))
          result.Y = BitConverter.Int64BitsToDouble(Marshal.ReadInt64(request, 56))
        }
        case 7 {
          result.AnchorNode = uint64(Marshal.ReadInt64(request, 48))
          result.AnchorIndex = uint64(Marshal.ReadInt64(request, 56))
          result.FocusNode = uint64(Marshal.ReadInt64(request, 64))
          result.FocusIndex = uint64(Marshal.ReadInt64(request, 72))
        }
      }
      return result
    }

    private func Supports(node AccessibilityNode, action AccessibilityAction) bool {
      for i in 0 ... node.Actions.Count { if node.Actions[i] == action { return true } }
      return false
    }

    private func EncodeActions(target nint, node AccessibilityNode) {
      if node.Disabled { return }
      if Supports(node, AccessibilityAction.Select) || Supports(node, AccessibilityAction.Deselect)
        || Supports(node, AccessibilityAction.Expand) || Supports(node, AccessibilityAction.Collapse) { AccessKitNative.NodeAddAction(target, uint8(0)) }
      for i in 0 ... node.Actions.Count {
        let action = node.Actions[i]
        switch action {
          case AccessibilityAction.Focus { AccessKitNative.NodeAddAction(target, uint8(1))
          }
          case AccessibilityAction.Activate { AccessKitNative.NodeAddAction(target, uint8(0))
          }
          case AccessibilityAction.SetValue { AccessKitNative.NodeAddAction(target, uint8(20))
          }
          case AccessibilityAction.SetSelection { AccessKitNative.NodeAddAction(target, uint8(18))
          }
          case AccessibilityAction.Increment { AccessKitNative.NodeAddAction(target, uint8(7))
          }
          case AccessibilityAction.Decrement { AccessKitNative.NodeAddAction(target, uint8(6))
          }
          case AccessibilityAction.Expand { AccessKitNative.NodeAddAction(target, uint8(4))
          }
          case AccessibilityAction.Collapse { AccessKitNative.NodeAddAction(target, uint8(3))
          }
          case AccessibilityAction.Scroll {
            AccessKitNative.NodeAddAction(target, uint8(17))
            for direction in 11 ... 15 { AccessKitNative.NodeAddAction(target, uint8(direction)) }
          }
          case AccessibilityAction.Select, AccessibilityAction.Deselect {
            if action == AccessibilityAction.Select && !Supports(node, AccessibilityAction.Activate) { AccessKitNative.NodeAddAction(target, uint8(0)) }
            AccessKitNative.NodeAddAction(target, uint8(5))
            let custom = AccessKitNative.CustomActionNew(100 + int32(action))
            try { SetString(custom, action == AccessibilityAction.Select ? "Select" : "Deselect", 4) }
            catch (error Exception) { AccessKitNative.CustomActionFree(custom)
              throw error }
            AccessKitNative.NodePushCustomAction(target, custom)
          }
        }
      }
    }
  }
}
