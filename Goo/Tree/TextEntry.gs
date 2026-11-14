package Goo

import System

/// Defines an editable single-line text element.
public class TextEntry : Blob {
  private var declarationReadOnly bool
  private var declarationPlaceholder string
  private var declarationPlaceholderColor Color?
  private var declarationPassword bool
  private var declarationInputOptions TextInputOptions?
  private var declarationOnChange Action[string]?
  private var declarationOnSubmit Action[string]?
  private var declarationSelectionColor Color
  private var declarationValue string
  internal override func coreBlob() {
  }

  /// Gets the value used while unfocused, or also while focused when Controlled is true.
  public prop Value string {
    get -> declarationValue
    set {
      CheckMutable()
      declarationValue = value
    }
  }
  /// Applies Value while focused without reporting an edit. Defaults to false.
  /// Preserves an IME composition when Value matches its committed text; a replacement cancels it.
  public prop Controlled bool{
    get -> ControlledEntryValue;
    set {
      CheckMutable()
      ControlledEntryValue = value
    }
  }
  /// Gets whether editing commands are disabled.
  public prop ReadOnly bool {
    get -> declarationReadOnly
    set {
      CheckMutable()
      declarationReadOnly = value
    }
  }
  /// Gets the placeholder shown for an empty value.
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
  /// Reports whether the value is presented as protected text.
  public prop Password bool {
    get -> declarationPassword
    set {
      CheckMutable()
      declarationPassword = value
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
  /// Gets the action that receives each edited value.
  public prop OnChange Action[string]? {
    get -> declarationOnChange
    set {
      CheckMutable()
      declarationOnChange = value
    }
  }
  /// Gets the action that receives the submitted value.
  public prop OnSubmit Action[string]? {
    get -> declarationOnSubmit
    set {
      CheckMutable()
      declarationOnSubmit = value
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

  /// Initializes an empty text entry with the default selection highlight.
  public init() {
    Value = ""
    Placeholder = ""
    SelectionColor = defaultSelectionColor()
    Focusable = true
  }
}
