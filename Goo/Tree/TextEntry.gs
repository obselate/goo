package Goo

import System

/// Defines an editable single-line text element.
public class TextEntry : Blob {
  internal override func coreBlob() {
  }

  /// Gets the value used while unfocused, or also while focused when Controlled is true.
  public prop Value string{ get; init; }
  /// Applies Value while focused without reporting an edit. Defaults to false.
  /// Preserves an IME composition when Value matches its committed text; a replacement cancels it.
  public prop Controlled bool{ get -> ControlledEntryValue; init -> ControlledEntryValue = value }
  /// Gets the placeholder shown for an empty value.
  public prop Placeholder string{ get; init; }
  /// Reports whether the value is presented as protected text.
  public prop Password bool{ get; init; }
  /// Gets the action that receives each edited value.
  public prop OnChange Action[string]? { get; init; }
  /// Gets the action that receives the submitted value.
  public prop OnSubmit Action[string]? { get; init; }
  /// Gets the selection highlight color.
  public prop SelectionColor Color{ get; init; }

  /// Initializes an empty text entry with the default selection highlight.
  public init() {
    Value = ""
    Placeholder = ""
    SelectionColor = defaultSelectionColor()
  }
}
