package Goo

internal struct TextFontMetrics {
  internal prop Ascent float32{ get; set; }
  internal prop Descent float32{ get; set; }

  internal init(ascent float32, descent float32) {
    Ascent = ascent
    Descent = descent
  }
}
