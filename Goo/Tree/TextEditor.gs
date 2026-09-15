package Goo

import System

/// Defines a retained multiline text editor.
public class TextEditor : Blob {
  private let controller TextEditorController
  private var layers []TextPresentationLayer
  private var overscanLines int32

  internal override func coreBlob() {
  }

  /// Gets the per-view editing controller.
  public prop Controller TextEditorController{ get -> controller }
  /// Gets the ordered presentation layers.
  public prop Layers []TextPresentationLayer{
    get -> copyEditorLayers(layers)
    init{
      validateEditorLayers(controller.Document, value)
      layers = copyEditorLayers(value)
    }
  }
  internal prop LayerValues []TextPresentationLayer{ get -> layers }
  /// Gets whether editing commands are disabled.
  public prop ReadOnly bool{ get; init; }
  /// Gets the placeholder shown for an empty document.
  public prop Placeholder string{ get; init; }
  /// Gets the selection highlight color.
  public prop SelectionColor Color{ get; init; }
  /// Gets the caret color.
  public prop CaretColor Color{ get; init; }
  /// Gets the current-line highlight color.
  public prop CurrentLineColor Color{ get; init; }
  /// Gets the logical-line overscan used by viewport layout.
  public prop OverscanLines int32{
    get -> overscanLines
    init{
      if value < 0 { throw ArgumentOutOfRangeException("OverscanLines") }
      overscanLines = value
    }
  }
  /// Gets the callback that receives committed document changes.
  public prop OnChange Action[TextDocumentChange]? { get; init; }
  /// Gets the callback invoked by an accepted submit command.
  public prop OnSubmit Action? { get; init; }

  /// Creates an editor without presentation layers.
  /// @param controller The per-view controller that owns the edited document.
  public convenience init(controller TextEditorController) {
    init(controller, []TextPresentationLayer{})
  }

  /// Creates an editor with ordered presentation layers.
  /// @param controller The per-view controller that owns the edited document.
  /// @param layers The ordered presentation layers.
  public init(controller TextEditorController, layers []TextPresentationLayer) {
    if controller == nil { throw ArgumentNullException("controller") }
    this.controller = controller
    validateEditorLayers(controller.Document, layers)
    this.layers = copyEditorLayers(layers)
    Placeholder = ""
    SelectionColor = defaultSelectionColor()
    CaretColor = Color.White
    CurrentLineColor = Color.Transparent
    overscanLines = 3
    Focusable = true
  }
}

internal func copyEditorLayers(values []TextPresentationLayer) []TextPresentationLayer {
  let result = [values.Length]TextPresentationLayer
  Array.Copy(values, result, values.Length)
  return result
}

internal func validateEditorLayers(document TextDocument, values []TextPresentationLayer) {
  for i in 0 ... values.Length {
    if values[i] == nil { throw ArgumentNullException("layers") }
    if values[i].Document != document {
      throw ArgumentException("Every presentation layer must use the editor document", "layers")
    }
  }
}

internal func validateEditorLayerOverlaps(values []TextPresentationLayer) {
  for i in 0 ... values.Length {
    for projection in values[i].ReadProjections() {
      for priorLayer in 0 ... i {
        for prior in values[priorLayer].ReadProjections() {
          if rangesEditorOverlap(projection.Range, prior.Range) {
            throw ArgumentException("Layout-affecting projections cannot overlap", "layers")
          }
        }
      }
    }
  }
}

internal func rangesEditorOverlap(left TextRange, right TextRange) bool {
  if left.Length == 0 || right.Length == 0 { return false }
  return left.Start < right.Start + right.Length && right.Start < left.Start + left.Length
}
