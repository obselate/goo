package Goo

import System.Text

/// Defines displayed Text and an optional inline Style for one text part.
public data struct TextSpan(Text string, Style Style?)

/// Converts plain text to an unstyled text span.
/// @param value The displayed text.
/// @returns An unstyled text span.
public func operator implicit(value string) TextSpan -> TextSpan(value, nil)

/// Defines a text element.
public class Text : Blob {
  private var declarationContent string
  private var declarationSelectable bool
  private var selectionColor Color = defaultSelectionColor()

  internal override func coreBlob() {
  }

  /// Gets the displayed text.
  public prop Content string {
    get -> declarationContent
    set {
      CheckMutable()
      declarationContent = value
    }
  }
  /// Gets whether the text supports selection and copy without editing or a caret.
  public prop Selectable bool {
    get -> declarationSelectable
    set {
      CheckMutable()
      declarationSelectable = value
    }
  }
  /// Gets the selection highlight color.
  public prop SelectionColor Color {
    get -> selectionColor
    set {
      CheckMutable()
      selectionColor = value
    }
  }
  /// Gets ordered passive inline styles in UTF-16 source offsets.
  /// A cluster uses the style at its logical start. Later ranges override earlier fields.
  public prop StyleRanges []TextStyleRange{
    get -> PassiveTextRangeBlobs.Read(this)
    set {
      CheckMutable()
      PassiveTextRangeBlobs.Write(this, value)
    }
  }
  internal prop StyleRangeValues [] ? TextStyleRange{
    get -> HasPassiveTextRanges ? PassiveTextRangeBlobs.Values(this) : nil
  }

  /// Initializes a text element with empty content.
  public init() {
    Content = ""
  }

  /// Initializes a text element with the displayed content.
  /// @param content The displayed text.
  public init(content string) {
    Content = content
  }

  /// Initializes text by concatenating plain and styled spans.
  /// @param spans The ordered text parts.
  public init(spans ...TextSpan) {
    let content = StringBuilder()
    var count = 0
    for span in spans {
      content.Append(span.Text)
      if span.Style != nil { count++ }
    }
    Content = content.ToString()
    if count == 0 { return }
    let ranges = [count]TextStyleRange
    var index = 0
    var offset = 0
    for span in spans {
      if let style = span.Style {
        ranges[index] = TextStyleRange(TextRange(offset, span.Text.Length), style)
        index++
      }
      offset += span.Text.Length
    }
    StyleRanges = ranges
  }
}
