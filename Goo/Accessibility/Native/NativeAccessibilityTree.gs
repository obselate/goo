package Goo

import System
import System.Collections.Generic
import System.Runtime.InteropServices
import System.Text

internal class NativeAccessibilityNodeCache {
  internal var Revision int64 = -1
  internal var Generation int64
  internal var TextVersion int64 = -1
  internal var ScrollX float64
  internal var ScrollY float64
  internal var ScrollMaxX float64
  internal var ScrollMaxY float64
  internal var Value string = ""
  internal let Runs List[NativeAccessibilityTextRun] = List[NativeAccessibilityTextRun]()
}

public sealed partial class NativeAccessibilityAdapter {
  private var scaleX float64 = 1.0
  private var scaleY float64 = 1.0

  private func Encode(all bool) nint {
    let metrics = owner?.CurrentWindowMetrics() ?? WindowMetrics{}
    let nextX = platform == 2 && metrics.DisplayScaleX > 0.0 ? metrics.DisplayScaleX : 1.0
    let nextY = platform == 2 && metrics.DisplayScaleY > 0.0 ? metrics.DisplayScaleY : 1.0
    let complete = all || nextX != scaleX || nextY != scaleY
    scaleX = nextX
    scaleY = nextY
    generation++
    let update = AccessKitNative.TreeUpdateNew(1uL)
    try {
      let currentRoot = tree?.Root
      let currentId = currentRoot?.Id.Value ?? -1
      let title = owner?.Title ?? "Goo"
      let width = owner?.Width ?? 0
      let height = owner?.Height ?? 0
      if complete || rootId != currentId || rootTitle != title || rootWidth != width || rootHeight != height {
        let root = AccessKitNative.NodeNew(AccessKitSchema.Window)
        try {
          SetString(root, title, 0)
          AccessKitNative.NodeSetBounds(root, NativeBounds(ElementRect{Width: float64(width), Height: float64(height)}))
          if let child = currentRoot { AccessKitNative.NodePushChild(root, NodeId(child.Id)) }
        } catch (error Exception) { AccessKitNative.NodeFree(root)
          throw error }
        AccessKitNative.TreeUpdatePushNode(update, 1uL, root)
      }
      if complete {
        let info = AccessKitNative.TreeInfoNew(1uL)
        try {
          SetString(info, "Goo", 5)
          SetString(info, typeof(Window).Assembly.GetName().Version?.ToString() ?? "", 6)
        } catch (error Exception) { AccessKitNative.TreeInfoFree(info)
          throw error }
        // The update consumes the allocation; never use info after this call.
        AccessKitNative.TreeUpdateSetTreeInfo(update, info)
      }
      var focus = 1uL
      if let root = currentRoot { EncodeNode(update, root, complete, ref focus) }
      AccessKitNative.TreeUpdateSetFocus(update, focus)
      retired.Clear()
      for pair in cache { if pair.Value.Generation != generation { retired.Add(pair.Key) } }
      for i in 0 ... retired.Count {
        let previous = cache[retired[i]]
        for r in 0 ... previous.Runs.Count { textRuns.Remove(previous.Runs[r].Id) }
        cache.Remove(retired[i])
      }
      rootId = currentId
      rootTitle = title
      rootWidth = width
      rootHeight = height
      full = false
      return update
    } catch (error Exception) { AccessKitNative.TreeUpdateFree(update)
      throw error }
  }

  private func EncodeNode(update nint, node AccessibilityNode, all bool, ref focus uint64) {
    if !cache.TryGetValue(node.Id.Value, out var retained) {
      retained = NativeAccessibilityNodeCache()
      cache.Add(node.Id.Value, retained)
    }
    retained.Generation = generation
    let revision = if let semantic = node as RetainedAccessibilityNode? { semantic.Revision } else { tree?.Version ?? 0 }
    let source = owner?.NativeAccessibilityNodeFor(node.Id)
    let scrollX = source?.EditorController?.ScrollTargetX ?? float64(source?.ScrollX ?? 0.0F)
    let scrollY = source?.EditorController?.ScrollTargetY ?? float64(source?.ScrollY ?? 0.0F)
    let scrollExtent = if let current = source { scrollRange(current) } else { Point{} }
    let scrollChanged = scrollX != retained.ScrollX || scrollY != retained.ScrollY
      || scrollExtent.X != retained.ScrollMaxX || scrollExtent.Y != retained.ScrollMaxY
    let textChanged = UpdateText(node, retained)
    UpdateTextGeometry(source, retained)
    if all || retained.Revision != revision || textChanged || scrollChanged {
      let nativeNode = AccessKitNative.NodeNew(NodeRole(node))
      try {
        if node.Role != AccessibilityRole.Text || node.Name != node.Value { SetString(nativeNode, node.Name, 0) }
        SetString(nativeNode, node.Description, 1)
        SetString(nativeNode, node.ValueText != "" ? node.ValueText : node.Value, 2)
        SetString(nativeNode, node.CustomRole, 3)
        AccessKitNative.NodeSetBounds(nativeNode, NativeBounds(node.Bounds))
        EncodeState(nativeNode, node)
        if Supports(node, AccessibilityAction.Scroll) {
          AccessKitNative.NodeSetScrollX(nativeNode, scrollX)
          AccessKitNative.NodeSetScrollXMin(nativeNode, 0.0)
          AccessKitNative.NodeSetScrollXMax(nativeNode, scrollExtent.X)
          AccessKitNative.NodeSetScrollY(nativeNode, scrollY)
          AccessKitNative.NodeSetScrollYMin(nativeNode, 0.0)
          AccessKitNative.NodeSetScrollYMax(nativeNode, scrollExtent.Y)
        }
        EncodeRelationships(nativeNode, node.Relationships)
        EncodeActions(nativeNode, node)
        for i in 0 ... node.Children.Count { AccessKitNative.NodePushChild(nativeNode, NodeId(node.Children[i].Id)) }
        for i in 0 ... retained.Runs.Count { AccessKitNative.NodePushChild(nativeNode, retained.Runs[i].Id) }
        EncodeSelection(nativeNode, node, retained)
      } catch (error Exception) { AccessKitNative.NodeFree(nativeNode)
        throw error }
      AccessKitNative.TreeUpdatePushNode(update, NodeId(node.Id), nativeNode)
      retained.Revision = revision
      retained.ScrollX = scrollX
      retained.ScrollY = scrollY
      retained.ScrollMaxX = scrollExtent.X
      retained.ScrollMaxY = scrollExtent.Y
    }
    if node.Focused { focus = NodeId(node.Id) }
    for i in 0 ... retained.Runs.Count {
      let run = retained.Runs[i]
      if all || run.Dirty {
        AccessKitNative.TreeUpdatePushNode(update, run.Id, EncodeTextRun(run))
        run.Dirty = false
      }
    }
    for i in 0 ... node.Children.Count { EncodeNode(update, node.Children[i], all, ref focus) }
  }

  private func NativeBounds(bounds ElementRect) AccessKitRect -> AccessKitRect {
    X0: bounds.X * scaleX, Y0: bounds.Y * scaleY,
    X1: (bounds.X + bounds.Width) * scaleX, Y1: (bounds.Y + bounds.Height) * scaleY,
  }

  shared {
    private func NodeId(id AccessibilityId) uint64 {
      if id.Value < 0 || uint64(id.Value) >= 9223372036854775806uL { throw InvalidOperationException("Accessibility identity exceeds the native ID scrollExtent") }
      return uint64(id.Value) + 2uL
    }

    private func NodeRole(node AccessibilityNode) uint8 {
      if node.Role == AccessibilityRole.List {
        for i in 0 ... node.Children.Count {
          if node.Children[i].Role == AccessibilityRole.ListItem && node.Children[i].Selected != nil { return uint8(87) }
        }
      }
      if node.Role == AccessibilityRole.ListItem && node.Selected != nil { return AccessKitSchema.SelectedItem }
      if node.Role == AccessibilityRole.TextInput && node.Multiline == true { return AccessKitSchema.MultiLineInput }
      return AccessKitSchema.Role(node.Role)
    }

    private func EncodeState(target nint, node AccessibilityNode) {
      if node.Disabled { AccessKitNative.NodeSetDisabled(target) }
      if node.ReadOnly == true { AccessKitNative.NodeSetReadOnly(target) }
      if node.Required == true { AccessKitNative.NodeSetRequired(target) }
      if node.Busy == true { AccessKitNative.NodeSetBusy(target) }
      if node.Modal == true { AccessKitNative.NodeSetModal(target) }
      if node.MultiSelectable == true { AccessKitNative.NodeSetMultiselectable(target) }
      if node.Atomic == true { AccessKitNative.NodeSetLiveAtomic(target) }
      if let value = node.Selected { AccessKitNative.NodeSetSelected(target, value ? uint8(1) : uint8(0)) }
      if let value = node.Expanded { AccessKitNative.NodeSetExpanded(target, value ? uint8(1) : uint8(0)) }
      if node.Invalid == true { AccessKitNative.NodeSetInvalid(target, uint8(0)) }
      if node.Checked != AccessibilityChecked.Unspecified { AccessKitNative.NodeSetToggled(target, uint8(node.Checked) - uint8(1)) }
      if node.Orientation != AccessibilityOrientation.Unspecified { AccessKitNative.NodeSetOrientation(target, uint8(node.Orientation) - uint8(1)) }
      if node.HasPopup == true { AccessKitNative.NodeSetHasPopup(target, node.Role == AccessibilityRole.ComboBox ? uint8(1) : uint8(0)) }
      AccessKitNative.NodeSetLive(target, uint8(node.Live))
      if let value = node.Level { AccessKitNative.NodeSetLevel(target, uint64(value)) }
      if let value = node.ValueNow { AccessKitNative.NodeSetNumericValue(target, value) }
      if let value = node.ValueMinimum { AccessKitNative.NodeSetMinNumericValue(target, value) }
      if let value = node.ValueMaximum { AccessKitNative.NodeSetMaxNumericValue(target, value) }
    }

    private func EncodeRelationships(target nint, values AccessibilityRelationshipIds) {
      for i in 0 ... values.LabelledBy.Count { AccessKitNative.NodePushLabelledBy(target, NodeId(values.LabelledBy[i])) }
      for i in 0 ... values.DescribedBy.Count { AccessKitNative.NodePushDescribedBy(target, NodeId(values.DescribedBy[i])) }
      for i in 0 ... values.Controls.Count { AccessKitNative.NodePushControlled(target, NodeId(values.Controls[i])) }
      for i in 0 ... values.Owns.Count { AccessKitNative.NodePushOwned(target, NodeId(values.Owns[i])) }
      for i in 0 ... values.FlowTo.Count { AccessKitNative.NodePushFlowTo(target, NodeId(values.FlowTo[i])) }
      if let active = values.ActiveDescendant { AccessKitNative.NodeSetActiveDescendant(target, NodeId(active)) }
      if values.ErrorMessage.Count > 0 {
        AccessKitNative.NodeSetErrorMessage(target, NodeId(values.ErrorMessage[0]))
        for i in 1 ... values.ErrorMessage.Count { AccessKitNative.NodePushDescribedBy(target, NodeId(values.ErrorMessage[i])) }
      }
    }

    private func SetString(target nint, text string, field int32) {
      if text.Length == 0 && field != 2 { return }
      let value = Marshal.StringToCoTaskMemUTF8(text)
      try {
        let length = uint64(Encoding.UTF8.GetByteCount(text))
        switch field {
          case 0 { AccessKitNative.NodeSetLabel(target, value, length)
          }
          case 1 { AccessKitNative.NodeSetDescription(target, value, length)
          }
          case 2 { AccessKitNative.NodeSetValue(target, value, length)
          }
          case 3 { AccessKitNative.NodeSetRoleDescription(target, value, length)
          }
          case 4 { AccessKitNative.CustomActionSetDescription(target, value, length)
          }
          case 5 { AccessKitNative.TreeInfoSetToolkitName(target, value, length)
          }
          case 6 { AccessKitNative.TreeInfoSetToolkitVersion(target, value, length)
          }
        }
      } finally { Marshal.FreeCoTaskMem(value) }
    }
  }
}
