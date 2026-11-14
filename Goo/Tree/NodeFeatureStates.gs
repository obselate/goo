package Goo

import System

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
    internal var OnClick Action?
    internal var OnPointerDown((PointerEvent) -> void)?
    internal var OnPointerMove((PointerEvent) -> void)?
    internal var OnPointerUp((PointerEvent) -> void)?
    internal var OnPointerCancel((PointerEvent) -> void)?
    internal var OnPointerDrag((PointerDragEvent) -> void)?
    internal var PointerDragThreshold float64
    internal var PointerDragAxis LayoutAxis?
    internal var OnWheel((WheelEvent) -> void)?
}

internal class NodePortalState {
    internal var PortalAnchor ElementHandle?
    internal var PortalPlacement PortalPlacement
    internal var PortalBounds PortalPlacementBounds?
    internal var PortalAnchorBounds Rect
    internal var PortalAnchorResolved bool
}
