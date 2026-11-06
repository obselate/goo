package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices

internal class NodeTextState {
    internal var Layouts List[TextLayout]?
    internal var Analysis TextAnalysisStore?
    internal var Presentation PassiveTextPresentation?
    internal var Shadow BoxShadowStack?
    internal var Stroke TextStrokeValue?
}

internal class NodeEditingState {
    internal var EntryShape EntryShapeState?
    internal var EntryHistory EntryUndoHistory?
    internal var EditorBinding TextEditorBinding?
    internal var EditorReadOnly bool
    internal var InputOptions TextInputOptions?
    internal var EditorCaretColor Color
    internal var EditorCurrentLineColor Color
    internal var EditorShowLineNumbers bool
    internal var EditorLineNumberColor Color
    internal var EditorOverscanLines int32
    internal var EditorOnChange Action[TextDocumentChange]?
    internal var EditorOnSubmit Action?
    internal var EditorSlotRange TextRange
    internal var EditorSlotKey string = ""
    internal var EditorSlotBlock bool
    internal var Buffer string = ""
    internal var Caret int32
    internal var Anchor int32
    internal var EditScrollX float32
    internal var BlinkT float64
    internal var PreFocus string = ""
    internal var Placeholder string = ""
    internal var PlaceholderColor Color?
    internal var SelectionColor Color
    internal var OnChange Action[string]?
    internal var OnSubmit Action[string]?
}

internal class NodeShapeState {
    internal var ClipPath ClipPathValue?
    internal var Outline OutlineValue?
    internal var Transform TransformValue?
    internal var BackgroundImage BackgroundImageValue?
    internal var ImageSource ImageSourceBinding?
    internal var ShaderEffect ShaderEffectBinding?
    internal var ShapePath VectorPath
    internal var ShapeFit ShapeFit
    internal var ShapeFillRule FillRule
    internal var ShapeUseCurrentColor bool
    internal var ShapeStrokeCap StrokeCap
    internal var ShapeStrokeJoin StrokeJoin
    internal var ShapeVectorEffect VectorEffect
    internal var MiterLimit float64 = 4.0
    internal var StrokeStart float64
    internal var StrokeEnd float64 = 1.0
    internal var ShapeCornerRadius float64
    internal var Dashes DashPattern?
    internal var ShapeStrokeInset bool = true
}

internal class NodePointerState {
    internal var Callbacks InputCallbackSet?
    internal var TextCallbacks TextInputCallbackSet?
    internal var Gestures GestureBinding?
    internal var DragDrop DragDropBinding?
    internal var Accessibility Accessibility?
    internal var AccessibilityNode RetainedAccessibilityNode?
    internal var AccessibilityButtonName AccessibilityButtonName?
    internal var Handle ElementHandle?
    internal var FocusScopes FocusScopeStack?
    internal var OnClick Action?
    internal var OnPointerDown((PointerEvent) -> void)?
    internal var OnPointerMove((PointerEvent) -> void)?
    internal var OnPointerUp((PointerEvent) -> void)?
    internal var OnPointerCancel((PointerEvent) -> void)?
    internal var OnWheel((WheelEvent) -> void)?
}

internal class NodePortalState {
    internal var Scrollbar ScrollbarNodeValues?
    internal var ScrollActivity ScrollNodeActivity?
    internal var ScrollTopology ScrollTopologyValue?
    internal var CustomLayout CustomLayoutState?
    internal var StackingOrder List[Node]?
    internal var StackingValue StackingValue?
    internal var PortalRoot Node?
    internal var PortalOverlay Node?
    internal var PortalSource PortalSource?
    internal var Virtualization VirtualNodeState?
    internal var ScrollbarParts ScrollbarPartState?
    internal var Transition LayoutTransitionState?
    internal var VulkanOwners ConditionalWeakTable[VulkanSceneCompiler, VulkanSceneOwnerId]?
    internal var PortalAnchor ElementHandle?
    internal var PortalPlacement PortalPlacement
    internal var PortalBounds PortalPlacementBounds?
    internal var PortalAnchorBounds Rect
    internal var PortalAnchorResolved bool
}
