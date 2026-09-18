package Goo

import System
import System.Collections.Generic

internal data struct DiagnosticRect {
  internal var X float64
  internal var Y float64
  internal var Width float64
  internal var Height float64
}

internal data struct DiagnosticPoint {
  internal var X float64
  internal var Y float64
}

internal class DiagnosticEndpoint {
  internal prop ProcessId int32{ get; private set; }
  internal prop ProcessName string{ get; private set; }
  internal prop Protocol string{ get; private set; }
  internal prop Version int32{ get; private set; }
  internal prop Transport string{ get; private set; }
  internal prop PipeName string{ get; private set; }
  internal prop DescriptorPath string{ get; private set; }
  internal prop CreatedUtc string{ get; private set; }
  internal prop WindowId string{ get; private set; }
  internal prop SessionId string{ get; private set; }

  internal init(processId int32, processName string, protocol string, version int32,
    transport string, pipeName string, descriptorPath string, createdUtc string, windowId string,
    sessionId string) {
      ProcessId = processId
      ProcessName = processName
      Protocol = protocol
      Version = version
      Transport = transport
      PipeName = pipeName
      DescriptorPath = descriptorPath
      CreatedUtc = createdUtc
      WindowId = windowId
      SessionId = sessionId
    }
}

internal class DiagnosticNodeSnapshot {
  internal var Id int64
  internal var Target string
  internal var ParentId int64?
  internal var ChildIndex int32
  internal var ChildIds IReadOnlyList[int64]
  internal var Kind string
  internal var Key string
  internal var Content string
  internal var OwnerType string
  internal var Bounds DiagnosticRect
  internal var BorderBox DiagnosticRect
  internal var PaddingBox DiagnosticRect
  internal var ContentBox DiagnosticRect
  internal var MarginBox DiagnosticRect
  internal var ClipBox DiagnosticRect
  internal var Visible bool
  internal var Clipped bool
  internal var ClipApproximate bool
  internal var Actionable bool
  internal var ActionStatus string
  internal var ActionPoint DiagnosticPoint?
  internal var ScrollOffset DiagnosticPoint
  internal var ContentSize DiagnosticPoint
  internal var Width string
  internal var Height string
  internal var MinWidth string
  internal var MinHeight string
  internal var MaxWidth string
  internal var MaxHeight string
  internal var Padding string
  internal var PaddingLeft string
  internal var PaddingTop string
  internal var PaddingRight string
  internal var PaddingBottom string
  internal var Margin string
  internal var MarginLeft string
  internal var MarginTop string
  internal var MarginRight string
  internal var MarginBottom string
  internal var Gap string
  internal var RowGap string
  internal var ColumnGap string
  internal var FlexBasis string
  internal var Left string
  internal var Top string
  internal var Right string
  internal var Bottom string
  internal var FlexDirection string
  internal var FlexWrap string
  internal var JustifyContent string
  internal var AlignItems string
  internal var AlignSelf string
  internal var AlignContent string
  internal var Position string
  internal var Display string
  internal var Direction string
  internal var OverflowX string
  internal var OverflowY string
  internal var FlexGrow float64
  internal var FlexShrink float64
  internal var AspectRatio float64
  internal var Opacity float64
  internal var BackgroundColor string
  internal var BorderColor string
  internal var BorderWidth string
  internal var BorderRadius string
  internal var FontFamily string
  internal var FontSize string
  internal var FontWeight float64
  internal var FontStyle string
  internal var Color string
  internal var TextAlign string
  internal var TextWrap string
  internal var TextTrimming string
  internal var Hovered bool
  internal var Pressed bool
  internal var Focused bool
  internal var Disabled bool
  internal var Focusable bool
  internal var HitTestSelf bool
  internal var HasClickHandler bool
  internal var HasPointerHandlers bool
  internal var HasKeyboardHandlers bool
  internal var AccessibilityRole string
  internal var AccessibilityId int64?
  internal var AccessibilityCustomRole string
  internal var AccessibilityName string
  internal var AccessibilityDescription string
  internal var AccessibilityValue string
  internal var AccessibilityHidden bool
  internal var AccessibilityChecked string
  internal var AccessibilitySelected bool?
  internal var AccessibilityExpanded bool?
  internal var AccessibilityReadOnly bool?
  internal var AccessibilityRequired bool?
  internal var AccessibilityInvalid bool?
  internal var AccessibilityBusy bool?
  internal var AccessibilityState string
  internal var Text string
  internal var TextLength int32
  internal var TextTruncated bool
  internal var SelectionStart int32?
  internal var SelectionLength int32?
  internal var Caret int32?
  internal var Configuration string
  internal var Computed string
  internal var State string
  internal var Events string

  internal var Fingerprint string

  internal init() {
    ChildIds = []int64{}
    Target = ""
    Kind = ""
    Key = ""
    Content = ""
    OwnerType = ""
    Width = ""
    Height = ""
    MinWidth = ""
    MinHeight = ""
    MaxWidth = ""
    MaxHeight = ""
    Padding = ""
    PaddingLeft = ""
    PaddingTop = ""
    PaddingRight = ""
    PaddingBottom = ""
    Margin = ""
    MarginLeft = ""
    MarginTop = ""
    MarginRight = ""
    MarginBottom = ""
    Gap = ""
    RowGap = ""
    ColumnGap = ""
    FlexBasis = ""
    Left = ""
    Top = ""
    Right = ""
    Bottom = ""
    FlexDirection = ""
    FlexWrap = ""
    JustifyContent = ""
    AlignItems = ""
    AlignSelf = ""
    AlignContent = ""
    Position = ""
    Display = ""
    Direction = ""
    OverflowX = ""
    OverflowY = ""
    BackgroundColor = ""
    BorderColor = ""
    BorderWidth = ""
    BorderRadius = ""
    FontFamily = ""
    FontSize = ""
    FontStyle = ""
    Color = ""
    TextAlign = ""
    TextWrap = ""
    TextTrimming = ""
    AccessibilityRole = ""
    AccessibilityCustomRole = ""
    AccessibilityName = ""
    AccessibilityDescription = ""
    AccessibilityValue = ""
    AccessibilityChecked = ""
    AccessibilityState = ""
    ActionStatus = ""
    Text = ""
    Configuration = ""
    Computed = ""
    State = ""
    Events = ""
  }
}

internal class DiagnosticSnapshot {
  internal prop Sequence int64{ get; private set; }
  internal prop IsFull bool{ get; private set; }
  internal prop HasChanges bool{ get; private set; }
  internal prop WindowId string{ get; private set; }
  internal prop RootId int64? { get; private set; }
  internal prop HoveredId int64? { get; private set; }
  internal prop SelectedId int64? { get; private set; }
  internal prop Added IReadOnlyList[DiagnosticNodeSnapshot]{ get; private set; }
  internal prop Updated IReadOnlyList[DiagnosticNodeSnapshot]{ get; private set; }
  internal prop Removed IReadOnlyList[int64]{ get; private set; }

  internal init(revisionNumber int64, isFull bool, windowId string, rootId int64?, hoveredId int64?,
    selectedId int64?, added List[DiagnosticNodeSnapshot], updated List[DiagnosticNodeSnapshot],
    removed List[int64], stateChanged bool) {
      Sequence = revisionNumber
      IsFull = isFull
      HasChanges = isFull || added.Count != 0 || updated.Count != 0 || removed.Count != 0 || stateChanged
      WindowId = windowId
      RootId = rootId
      HoveredId = hoveredId
      SelectedId = selectedId
      Added = added
      Updated = updated
      Removed = removed
    }
}

internal class DiagnosticOverlay {
  internal prop Sequence int64{ get; private set; }
  internal prop Hovered DiagnosticRect? { get; private set; }
  internal prop Selected DiagnosticRect? { get; private set; }
  internal prop HoveredNode Node? { get; private set; }
  internal prop SelectedNode Node? { get; private set; }
  internal prop TooltipText string{ get; private set; }

  internal init(revisionNumber int64, hovered DiagnosticRect?, selected DiagnosticRect?,
    hoveredNode Node?, selectedNode Node?, tooltipText string) {
      Sequence = revisionNumber
      Hovered = hovered
      Selected = selected
      HoveredNode = hoveredNode
      SelectedNode = selectedNode
      TooltipText = tooltipText
    }
}
