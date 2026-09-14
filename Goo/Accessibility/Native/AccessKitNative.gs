package Goo

import System
import System.Runtime.InteropServices

// AccessKit C 0.23.0 uses a 64-bit ABI in the shipped x64/arm64 runtimes.
@StructLayout(LayoutKind.Sequential)
internal struct AccessKitRect {
  public var X0 float64
  public var Y0 float64
  public var X1 float64
  public var Y1 float64
}
@StructLayout(LayoutKind.Sequential)
internal struct AccessKitTextPosition {
  public var Node uint64
  public var CharacterIndex uint64
}
@StructLayout(LayoutKind.Sequential)
internal struct AccessKitTextSelection {
  public var Anchor AccessKitTextPosition
  public var Focus AccessKitTextPosition
}
@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate AccessKitActivation(data nint) nint;
@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate AccessKitAction(request nint, data nint);
@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate AccessKitDeactivation(data nint);

internal class AccessKitNative {
  shared {
    internal const Library string = "goo-accesskit-0.23"
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_set_scroll_x", CallingConvention: CallingConvention.Cdecl)
    internal func NodeSetScrollX(node nint, value float64);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_set_scroll_x_min", CallingConvention: CallingConvention.Cdecl)
    internal func NodeSetScrollXMin(node nint, value float64);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_set_scroll_x_max", CallingConvention: CallingConvention.Cdecl)
    internal func NodeSetScrollXMax(node nint, value float64);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_set_scroll_y", CallingConvention: CallingConvention.Cdecl)
    internal func NodeSetScrollY(node nint, value float64);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_set_scroll_y_min", CallingConvention: CallingConvention.Cdecl)
    internal func NodeSetScrollYMin(node nint, value float64);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_set_scroll_y_max", CallingConvention: CallingConvention.Cdecl)
    internal func NodeSetScrollYMax(node nint, value float64);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_new", CallingConvention: CallingConvention.Cdecl)
    internal func NodeNew(role uint8) nint;
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_free", CallingConvention: CallingConvention.Cdecl)
    internal func NodeFree(node nint);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_add_action", CallingConvention: CallingConvention.Cdecl)
    internal func NodeAddAction(node nint, action uint8);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_push_child", CallingConvention: CallingConvention.Cdecl)
    internal func NodePushChild(node nint, id uint64);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_push_labelled_by", CallingConvention: CallingConvention.Cdecl)
    internal func NodePushLabelledBy(node nint, id uint64);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_push_described_by", CallingConvention: CallingConvention.Cdecl)
    internal func NodePushDescribedBy(node nint, id uint64);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_push_controlled", CallingConvention: CallingConvention.Cdecl)
    internal func NodePushControlled(node nint, id uint64);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_push_owned", CallingConvention: CallingConvention.Cdecl)
    internal func NodePushOwned(node nint, id uint64);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_push_flow_to", CallingConvention: CallingConvention.Cdecl)
    internal func NodePushFlowTo(node nint, id uint64);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_set_active_descendant", CallingConvention: CallingConvention.Cdecl)
    internal func NodeSetActiveDescendant(node nint, id uint64);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_set_error_message", CallingConvention: CallingConvention.Cdecl)
    internal func NodeSetErrorMessage(node nint, id uint64);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_set_label_with_length", CallingConvention: CallingConvention.Cdecl)
    internal func NodeSetLabel(node nint, value nint, length uint64);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_set_description_with_length", CallingConvention: CallingConvention.Cdecl)
    internal func NodeSetDescription(node nint, value nint, length uint64);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_set_value_with_length", CallingConvention: CallingConvention.Cdecl)
    internal func NodeSetValue(node nint, value nint, length uint64);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_set_role_description_with_length", CallingConvention: CallingConvention.Cdecl)
    internal func NodeSetRoleDescription(node nint, value nint, length uint64);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_set_disabled", CallingConvention: CallingConvention.Cdecl)
    internal func NodeSetDisabled(node nint);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_set_read_only", CallingConvention: CallingConvention.Cdecl)
    internal func NodeSetReadOnly(node nint);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_set_required", CallingConvention: CallingConvention.Cdecl)
    internal func NodeSetRequired(node nint);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_set_busy", CallingConvention: CallingConvention.Cdecl)
    internal func NodeSetBusy(node nint);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_set_modal", CallingConvention: CallingConvention.Cdecl)
    internal func NodeSetModal(node nint);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_set_multiselectable", CallingConvention: CallingConvention.Cdecl)
    internal func NodeSetMultiselectable(node nint);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_set_live_atomic", CallingConvention: CallingConvention.Cdecl)
    internal func NodeSetLiveAtomic(node nint);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_set_clips_children", CallingConvention: CallingConvention.Cdecl)
    internal func NodeSetClipsChildren(node nint);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_set_selected", CallingConvention: CallingConvention.Cdecl)
    internal func NodeSetSelected(node nint, value uint8);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_set_expanded", CallingConvention: CallingConvention.Cdecl)
    internal func NodeSetExpanded(node nint, value uint8);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_set_invalid", CallingConvention: CallingConvention.Cdecl)
    internal func NodeSetInvalid(node nint, value uint8);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_set_toggled", CallingConvention: CallingConvention.Cdecl)
    internal func NodeSetToggled(node nint, value uint8);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_set_live", CallingConvention: CallingConvention.Cdecl)
    internal func NodeSetLive(node nint, value uint8);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_set_orientation", CallingConvention: CallingConvention.Cdecl)
    internal func NodeSetOrientation(node nint, value uint8);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_set_has_popup", CallingConvention: CallingConvention.Cdecl)
    internal func NodeSetHasPopup(node nint, value uint8);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_set_text_direction", CallingConvention: CallingConvention.Cdecl)
    internal func NodeSetTextDirection(node nint, value uint8);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_set_numeric_value", CallingConvention: CallingConvention.Cdecl)
    internal func NodeSetNumericValue(node nint, value float64);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_set_min_numeric_value", CallingConvention: CallingConvention.Cdecl)
    internal func NodeSetMinNumericValue(node nint, value float64);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_set_max_numeric_value", CallingConvention: CallingConvention.Cdecl)
    internal func NodeSetMaxNumericValue(node nint, value float64);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_set_level", CallingConvention: CallingConvention.Cdecl)
    internal func NodeSetLevel(node nint, value uint64);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_set_bounds", CallingConvention: CallingConvention.Cdecl)
    internal func NodeSetBounds(node nint, value AccessKitRect);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_set_text_selection", CallingConvention: CallingConvention.Cdecl)
    internal func NodeSetTextSelection(node nint, value AccessKitTextSelection);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_set_character_lengths", CallingConvention: CallingConvention.Cdecl)
    internal func NodeSetCharacterLengths(node nint, length uint64, values nint);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_set_word_starts", CallingConvention: CallingConvention.Cdecl)
    internal func NodeSetWordStarts(node nint, length uint64, values nint);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_set_character_positions", CallingConvention: CallingConvention.Cdecl)
    internal func NodeSetCharacterPositions(node nint, length uint64, values nint);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_set_character_widths", CallingConvention: CallingConvention.Cdecl)
    internal func NodeSetCharacterWidths(node nint, length uint64, values nint);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_custom_action_new", CallingConvention: CallingConvention.Cdecl)
    internal func CustomActionNew(id int32) nint;
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_custom_action_free", CallingConvention: CallingConvention.Cdecl)
    internal func CustomActionFree(action nint);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_custom_action_set_description_with_length", CallingConvention: CallingConvention.Cdecl)
    internal func CustomActionSetDescription(action nint, value nint, length uint64);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_node_push_custom_action", CallingConvention: CallingConvention.Cdecl)
    internal func NodePushCustomAction(node nint, action nint);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_tree_info_new", CallingConvention: CallingConvention.Cdecl)
    internal func TreeInfoNew(root uint64) nint;
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_tree_info_free", CallingConvention: CallingConvention.Cdecl)
    internal func TreeInfoFree(info nint);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_tree_info_set_toolkit_name_with_length", CallingConvention: CallingConvention.Cdecl)
    internal func TreeInfoSetToolkitName(info nint, value nint, length uint64);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_tree_info_set_toolkit_version_with_length", CallingConvention: CallingConvention.Cdecl)
    internal func TreeInfoSetToolkitVersion(info nint, value nint, length uint64);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_tree_update_with_focus", CallingConvention: CallingConvention.Cdecl)
    internal func TreeUpdateNew(focus uint64) nint;
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_tree_update_free", CallingConvention: CallingConvention.Cdecl)
    internal func TreeUpdateFree(update nint);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_tree_update_push_node", CallingConvention: CallingConvention.Cdecl)
    internal func TreeUpdatePushNode(update nint, id uint64, node nint);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_tree_update_set_tree_info", CallingConvention: CallingConvention.Cdecl)
    internal func TreeUpdateSetTreeInfo(update nint, info nint);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_tree_update_set_focus", CallingConvention: CallingConvention.Cdecl)
    internal func TreeUpdateSetFocus(update nint, focus uint64);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_tree_update_debug", CallingConvention: CallingConvention.Cdecl)
    internal func TreeUpdateDebug(update nint) nint;
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_action_request_free", CallingConvention: CallingConvention.Cdecl)
    internal func ActionRequestFree(request nint);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_string_free", CallingConvention: CallingConvention.Cdecl)
    internal func StringFree(value nint);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_unix_adapter_new", CallingConvention: CallingConvention.Cdecl)
    internal func UnixNew(activation nint, activationData nint, action nint, actionData nint, deactivation nint, deactivationData nint) nint;
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_unix_adapter_free", CallingConvention: CallingConvention.Cdecl)
    internal func UnixFree(adapter nint);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_unix_adapter_update_if_active", CallingConvention: CallingConvention.Cdecl)
    internal func UnixUpdate(adapter nint, factory nint, data nint);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_unix_adapter_update_window_focus_state", CallingConvention: CallingConvention.Cdecl)
    internal func UnixFocus(adapter nint, focused uint8);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_macos_subclassing_adapter_for_window", CallingConvention: CallingConvention.Cdecl)
    internal func MacNew(window nint, activation nint, activationData nint, action nint, actionData nint) nint;
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_macos_subclassing_adapter_free", CallingConvention: CallingConvention.Cdecl)
    internal func MacFree(adapter nint);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_macos_subclassing_adapter_update_if_active", CallingConvention: CallingConvention.Cdecl)
    internal func MacUpdate(adapter nint, factory nint, data nint) nint;
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_macos_subclassing_adapter_update_view_focus_state", CallingConvention: CallingConvention.Cdecl)
    internal func MacFocus(adapter nint, focused uint8) nint;
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_macos_queued_events_raise", CallingConvention: CallingConvention.Cdecl)
    internal func MacRaise(events nint);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_macos_add_focus_forwarder_to_window_class_with_length", CallingConvention: CallingConvention.Cdecl)
    internal func MacFocusForwarder(name nint, length uint64);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_windows_subclassing_adapter_new", CallingConvention: CallingConvention.Cdecl)
    internal func WindowsNew(window nint, activation nint, activationData nint, action nint, actionData nint) nint;
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_windows_subclassing_adapter_free", CallingConvention: CallingConvention.Cdecl)
    internal func WindowsFree(adapter nint);
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_windows_subclassing_adapter_update_if_active", CallingConvention: CallingConvention.Cdecl)
    internal func WindowsUpdate(adapter nint, factory nint, data nint) nint;
    @DllImport("goo-accesskit-0.23", EntryPoint: "accesskit_windows_queued_events_raise", CallingConvention: CallingConvention.Cdecl)
    internal func WindowsRaise(events nint);
  }
}
