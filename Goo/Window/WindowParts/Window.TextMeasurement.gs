package Goo

import Facebook.Yoga

/// Measures text without mounting nodes.
public partial class Window {
  /// Measures single-line Text width in layout units on the window's UI thread.
  /// Applies text scale and pixel-grid rounding. Line breaks are ignored.
  /// Reads FontFamily, Language, FontSize, FontWeight, FontStyle, LetterSpacing, TextTransform and Direction.
  /// Unset fields use Goo defaults, not parent inheritance.
  /// @param text The text to measure.
  /// @param style The text declarations. A Text blob is also a Style.
  /// @returns The width in layout pixels.
  public func MeasureText(text string, style Style) float64 {
    requireUiThread("Window.MeasureText")
    var family = StyleFields.Default(StyleField.FontFamily)
    var language = StyleFields.Default(StyleField.Language)
    var size = StyleFields.Default(StyleField.FontSize)
    var weight = StyleFields.Default(StyleField.FontWeight)
    var fontStyle = StyleFields.Default(StyleField.FontStyle)
    var spacing = StyleFields.Default(StyleField.LetterSpacing)
    var transform = StyleFields.Default(StyleField.TextTransform)
    var direction = StyleFields.Default(StyleField.Direction)
    if let values = style.Entries() {
      var cursor = values.Cursor()
      while cursor.MoveNext() {
        let entry = cursor.Current
        switch entry.Field {
          case StyleField.FontFamily { family = entry }
          case StyleField.Language { language = entry }
          case StyleField.FontSize { size = entry }
          case StyleField.FontWeight { weight = entry }
          case StyleField.FontStyle { fontStyle = entry }
          case StyleField.LetterSpacing { spacing = entry }
          case StyleField.TextTransform { transform = entry }
          case StyleField.Direction { direction = entry }
          case _ { }
        }
      }
    }
    let fontSize = if let declaration = size.Payload as LengthDeclaration {
      declaration.Value.Value + declaration.Value.EmPart * 16.0F +
        declaration.Value.RemPart * (node?.FontSize.Px ?? 16.0F)
    } else { Length{Unit: LengthUnit(int32(size.B)), Value: size.A}.Px }
    let display = TextLayouts.transformText(text, TextTransform(int32(transform.A)))
    let width = TextShaping.MeasureLineUncached(display, 0, display.Length, entryText(family) ?? "",
      fontSize * (preferences.TextScaleFactor ?? 1.0F),
      int32(weight.A), FontStyle(int32(fontStyle.A)) == FontStyle.Italic,
      Length{ Unit: LengthUnit(int32(spacing.B)), Value: spacing.A }.Px, int32(direction.A),
      entryText(language) ?? "")
    return float64(PixelGrid.RoundValueToPixelGrid(width, RenderScale.X, true, false))
  }
}
