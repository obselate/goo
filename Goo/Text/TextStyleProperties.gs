package Goo

/// Holds explicit FontFamily, FontSize in pixels, FontWeight, FontStyle, Color and TextDecoration declarations.
public data struct TextStyleProperties(
  FontFamily string?,
  FontSize float64?,
  FontWeight float64?,
  FontStyle FontStyle?,
  Color Color?,
  TextDecoration TextDecoration?) { }
