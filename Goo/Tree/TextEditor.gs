package Goo

import System

/// Defines a retained multiline text editor.
public class TextEditor : Blob {
  private var declarationReadOnly bool
  private var declarationPlaceholder string
  private var declarationPlaceholderColor Color?
  private var declarationInputOptions TextInputOptions?
  private var declarationSelectionColor Color
  private var declarationCaretColor Color
  private var declarationShowLineNumbers bool
  private var declarationLineNumberColor Color
  private var declarationCurrentLineColor Color
  private var declarationOnChange Action[TextDocumentChange]?
  private var declarationOnSubmit Action?
  private var controller TextEditorController?
  private var layers []TextPresentationLayer
  private var overscanLines int32

  internal override func coreBlob() {
  }

  /// Gets the required per-view editing controller. Set it before mounting.
  public prop Controller TextEditorController{
    get -> controller ?? throw InvalidOperationException("TextEditor.Controller is required")
    set {
      CheckMutable()
      if value != nil { validateEditorLayers(value.Document, layers) }
      controller = value
    }
  }
  /// Gets the ordered presentation layers.
  public prop Layers []TextPresentationLayer{
    get -> copyEditorLayers(layers)
    set {
      CheckMutable()
      for layer in value {
        if layer == nil { throw ArgumentNullException("Layers") }
      }
      if let current = controller { validateEditorLayers(current.Document, value) }
      layers = copyEditorLayers(value)
    }
  }
  internal prop LayerValues []TextPresentationLayer{ get -> layers }
  /// Gets whether editing commands are disabled.
  public prop ReadOnly bool {
    get -> declarationReadOnly
    set {
      CheckMutable()
      declarationReadOnly = value
    }
  }
  /// Gets the placeholder shown for an empty document.
  public prop Placeholder string {
    get -> declarationPlaceholder
    set {
      CheckMutable()
      declarationPlaceholder = value
    }
  }
  /// Gets the placeholder color. Nil draws Color at 45% opacity.
  public prop PlaceholderColor Color? {
    get -> declarationPlaceholderColor
    set {
      CheckMutable()
      declarationPlaceholderColor = value
    }
  }
  /// Gets optional software keyboard and autofill hints.
  public prop InputOptions TextInputOptions? {
    get -> declarationInputOptions
    set {
      CheckMutable()
      declarationInputOptions = value
    }
  }
  /// Gets the selection highlight color.
  public prop SelectionColor Color {
    get -> declarationSelectionColor
    set {
      CheckMutable()
      declarationSelectionColor = value
    }
  }
  /// Gets the caret color.
  public prop CaretColor Color {
    get -> declarationCaretColor
    set {
      CheckMutable()
      declarationCaretColor = value
    }
  }
  /// Gets whether logical line numbers are shown outside the document.
  public prop ShowLineNumbers bool {
    get -> declarationShowLineNumbers
    set {
      CheckMutable()
      declarationShowLineNumbers = value
    }
  }
  /// Gets the line-number gutter color.
  public prop LineNumberColor Color {
    get -> declarationLineNumberColor
    set {
      CheckMutable()
      declarationLineNumberColor = value
    }
  }
  /// Gets the current-line highlight color.
  public prop CurrentLineColor Color {
    get -> declarationCurrentLineColor
    set {
      CheckMutable()
      declarationCurrentLineColor = value
    }
  }
  /// Gets the logical-line overscan used by viewport layout.
  public prop OverscanLines int32{
    get -> overscanLines
    set {
      CheckMutable()
      if value < 0 { throw ArgumentOutOfRangeException("OverscanLines") }
      overscanLines = value
    }
  }
  /// Gets the callback that receives committed document changes.
  public prop OnChange Action[TextDocumentChange]? {
    get -> declarationOnChange
    set {
      CheckMutable()
      declarationOnChange = value
    }
  }
  /// Gets the callback invoked by an accepted submit command.
  public prop OnSubmit Action? {
    get -> declarationOnSubmit
    set {
      CheckMutable()
      declarationOnSubmit = value
    }
  }

  /// Creates an editor. Controller must be set before mounting.
  public init() {
    layers = []TextPresentationLayer{}
    Placeholder = ""
    SelectionColor = defaultSelectionColor()
    CaretColor = Color.White
    LineNumberColor = Color.Rgb(128, 128, 128)
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
