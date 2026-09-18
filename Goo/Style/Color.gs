package Goo

import System

/// Specifies an immutable normalized RGBA color.
public data struct Color {
  private var r float32
  private var g float32
  private var b float32
  private var a float32

  /// Gets the normalized red channel.
  public prop R float32{ get -> r }
  /// Gets the normalized green channel.
  public prop G float32{ get -> g }
  /// Gets the normalized blue channel.
  public prop B float32{ get -> b }
  /// Gets the normalized alpha channel.
  public prop A float32{ get -> a }

  /// Returns this color with a normalized alpha channel.
  /// @param alpha The alpha channel from 0 through 1.
  /// @returns A color with the specified alpha channel.
  public func WithAlpha(alpha float64) Color -> Color { r: r, g: g, b: b, a: normalizeAlpha(alpha) }

  internal func ToPackedRgba() uint32 {
    let alpha = uint32(clamp255(a))
    let red = uint32(clamp255(r))
    let green = uint32(clamp255(g))
    let blue = uint32(clamp255(b))
    return (red << 24) | (green << 16) | (blue << 8) | alpha
  }

  shared {
    /// Creates an opaque color from 8-bit channels.
    /// @param r The red channel from 0 through 255.
    /// @param g The green channel from 0 through 255.
    /// @param b The blue channel from 0 through 255.
    /// @returns A normalized opaque color.
    public func Rgb(r int32, g int32, b int32) Color -> Rgba(r, g, b, 255)

    /// Creates a color from 8-bit channels.
    /// @param r The red channel from 0 through 255.
    /// @param g The green channel from 0 through 255.
    /// @param b The blue channel from 0 through 255.
    /// @param a The alpha channel from 0 through 255.
    /// @returns A normalized color.
    public func Rgba(r int32, g int32, b int32, a int32) Color -> Color {
      r: float32(clampByte(r)) / 255.0F,
      g: float32(clampByte(g)) / 255.0F,
      b: float32(clampByte(b)) / 255.0F,
      a: float32(clampByte(a)) / 255.0F,
    }

    /// Creates a color from normalized (0-1) channels, clamping out-of-range
    /// values and rejecting NaN. Unlike `Rgba`, this does not round-trip
    /// through 8-bit, so it is the precise constructor for interpolated colors.
    /// @param r The red channel from 0 through 1.
    /// @param g The green channel from 0 through 1.
    /// @param b The blue channel from 0 through 1.
    /// @param a The alpha channel from 0 through 1.
    /// @returns A normalized color.
    public func FromNormalized(r float32, g float32, b float32, a float32) Color -> Color {
      r: normalizeChannel(r, "r"),
      g: normalizeChannel(g, "g"),
      b: normalizeChannel(b, "b"),
      a: normalizeChannel(a, "a"),
    }

    /// Parses a CSS hexadecimal or named color.
    /// @param value The CSS color string to parse.
    /// @returns The parsed color.
    public func Parse(value string) Color {
      guard let color = TryParse(value) else {
        throw FormatException("Invalid CSS color: " + value)
      }
      return color
    }

    /// Parses a CSS hexadecimal or named color, or returns nil.
    /// @param value The CSS color string to parse.
    /// @returns The parsed color, or nil when the value is invalid.
    public func TryParse(value string) Color? {
      if value.Length == 0 {
        return nil
      }
      return if value[0] == '#' { parseHexColor(value) } else { parseNamedColor(value.ToLowerInvariant()) }
    }

    /// Gets opaque white.
    public prop White Color{ get -> Rgb(255, 255, 255) }
    /// Gets opaque black.
    public prop Black Color{ get -> Rgb(0, 0, 0) }
    /// Gets transparent black.
    public prop Transparent Color{ get -> Rgba(0, 0, 0, 0) }
  }
}

/// Converts a CSS color string to Color.
/// @param value The CSS color string to convert.
/// @returns The parsed color.
public func operator implicit (value string) Color -> Color.Parse (value)

internal func clampByte(value int32) int32 {
  if value < 0 { return 0 }
  return if value > 255 { 255 } else { value }
}

internal func normalizeAlpha(value float64) float32 {
  if Double.IsNaN(value) {
    throw ArgumentOutOfRangeException("alpha")
  }
  if value <= 0.0 { return 0.0F }
  return if value >= 1.0 { 1.0F } else { float32(value) }
}

internal func normalizeChannel(value float32, name string) float32 {
  if Single.IsNaN(value) {
    throw ArgumentOutOfRangeException(name)
  }
  if value <= 0.0F { return 0.0F }
  return if value >= 1.0F { 1.0F } else { value }
}

internal func clamp255(value float32) int32 {
  let normalized = int32(value * 255.0F + 0.5F)
  return clampByte(normalized)
}

internal func transparent(value Color) bool -> value.R == 0.0F && value.G == 0.0F && value.B == 0.0F && value.A == 0.0F

internal func defaultSelectionColor() Color -> Color.FromNormalized(0.25F, 0.45F, 1.0F, 0.35F)

internal func parseHexColor(value string) Color? {
  switch value.Length {
    case 4 {
      let r = hexValue(value[1])
      let g = hexValue(value[2])
      let b = hexValue(value[3])
      return if r < 0 || g < 0 || b < 0 { nil } else { Color.Rgba(r * 17, g * 17, b * 17, 255) }
    }
    case 5 {
      let r = hexValue(value[1])
      let g = hexValue(value[2])
      let b = hexValue(value[3])
      let a = hexValue(value[4])
      return if r < 0 || g < 0 || b < 0 || a < 0 { nil } else { Color.Rgba(r * 17, g * 17, b * 17, a * 17) }
    }
    case 7 {
      let r = hexByte(value, 1)
      let g = hexByte(value, 3)
      let b = hexByte(value, 5)
      return if r < 0 || g < 0 || b < 0 { nil } else { Color.Rgba(r, g, b, 255) }
    }
    case 9 {
      let r = hexByte(value, 1)
      let g = hexByte(value, 3)
      let b = hexByte(value, 5)
      let a = hexByte(value, 7)
      return if r < 0 || g < 0 || b < 0 || a < 0 { nil } else { Color.Rgba(r, g, b, a) }
    }
    case _ { return nil }
  }
  return nil
}

internal func hexByte(value string, index int32) int32 {
  let high = hexValue(value[index])
  let low = hexValue(value[index + 1])
  return if high < 0 || low < 0 { -1 } else { high * 16 + low }
}

internal func hexValue(value char) int32 {
  if value >= '0' && value <= '9' { return int32(value) - int32('0') }
  if value >= 'a' && value <= 'f' { return int32(value) - int32('a') + 10 }
  return if value >= 'A' && value <= 'F' { int32(value) - int32('A') + 10 } else { -1 }
}

internal func parseNamedColor(value string) Color? {
  switch value {
    case "aliceblue" { return Color.Rgb(240, 248, 255) }
    case "antiquewhite" { return Color.Rgb(250, 235, 215) }
    case "aqua" { return Color.Rgb(0, 255, 255) }
    case "aquamarine" { return Color.Rgb(127, 255, 212) }
    case "azure" { return Color.Rgb(240, 255, 255) }
    case "beige" { return Color.Rgb(245, 245, 220) }
    case "bisque" { return Color.Rgb(255, 228, 196) }
    case "black" { return Color.Black }
    case "blanchedalmond" { return Color.Rgb(255, 235, 205) }
    case "blue" { return Color.Rgb(0, 0, 255) }
    case "blueviolet" { return Color.Rgb(138, 43, 226) }
    case "brown" { return Color.Rgb(165, 42, 42) }
    case "burlywood" { return Color.Rgb(222, 184, 135) }
    case "cadetblue" { return Color.Rgb(95, 158, 160) }
    case "chartreuse" { return Color.Rgb(127, 255, 0) }
    case "chocolate" { return Color.Rgb(210, 105, 30) }
    case "coral" { return Color.Rgb(255, 127, 80) }
    case "cornflowerblue" { return Color.Rgb(100, 149, 237) }
    case "cornsilk" { return Color.Rgb(255, 248, 220) }
    case "crimson" { return Color.Rgb(220, 20, 60) }
    case "cyan" { return Color.Rgb(0, 255, 255) }
    case "darkblue" { return Color.Rgb(0, 0, 139) }
    case "darkcyan" { return Color.Rgb(0, 139, 139) }
    case "darkgoldenrod" { return Color.Rgb(184, 134, 11) }
    case "darkgray" { return Color.Rgb(169, 169, 169) }
    case "darkgrey" { return Color.Rgb(169, 169, 169) }
    case "darkgreen" { return Color.Rgb(0, 100, 0) }
    case "darkkhaki" { return Color.Rgb(189, 183, 107) }
    case "darkmagenta" { return Color.Rgb(139, 0, 139) }
    case "darkolivegreen" { return Color.Rgb(85, 107, 47) }
    case "darkorange" { return Color.Rgb(255, 140, 0) }
    case "darkorchid" { return Color.Rgb(153, 50, 204) }
    case "darkred" { return Color.Rgb(139, 0, 0) }
    case "darksalmon" { return Color.Rgb(233, 150, 122) }
    case "darkseagreen" { return Color.Rgb(143, 188, 143) }
    case "darkslateblue" { return Color.Rgb(72, 61, 139) }
    case "darkslategray" { return Color.Rgb(47, 79, 79) }
    case "darkslategrey" { return Color.Rgb(47, 79, 79) }
    case "darkturquoise" { return Color.Rgb(0, 206, 209) }
    case "darkviolet" { return Color.Rgb(148, 0, 211) }
    case "deeppink" { return Color.Rgb(255, 20, 147) }
    case "deepskyblue" { return Color.Rgb(0, 191, 255) }
    case "dimgray" { return Color.Rgb(105, 105, 105) }
    case "dimgrey" { return Color.Rgb(105, 105, 105) }
    case "dodgerblue" { return Color.Rgb(30, 144, 255) }
    case "firebrick" { return Color.Rgb(178, 34, 34) }
    case "floralwhite" { return Color.Rgb(255, 250, 240) }
    case "forestgreen" { return Color.Rgb(34, 139, 34) }
    case "fuchsia" { return Color.Rgb(255, 0, 255) }
    case "gainsboro" { return Color.Rgb(220, 220, 220) }
    case "ghostwhite" { return Color.Rgb(248, 248, 255) }
    case "gold" { return Color.Rgb(255, 215, 0) }
    case "goldenrod" { return Color.Rgb(218, 165, 32) }
    case "gray" { return Color.Rgb(128, 128, 128) }
    case "grey" { return Color.Rgb(128, 128, 128) }
    case "green" { return Color.Rgb(0, 128, 0) }
    case "greenyellow" { return Color.Rgb(173, 255, 47) }
    case "honeydew" { return Color.Rgb(240, 255, 240) }
    case "hotpink" { return Color.Rgb(255, 105, 180) }
    case "indianred" { return Color.Rgb(205, 92, 92) }
    case "indigo" { return Color.Rgb(75, 0, 130) }
    case "ivory" { return Color.Rgb(255, 255, 240) }
    case "khaki" { return Color.Rgb(240, 230, 140) }
    case "lavender" { return Color.Rgb(230, 230, 250) }
    case "lavenderblush" { return Color.Rgb(255, 240, 245) }
    case "lawngreen" { return Color.Rgb(124, 252, 0) }
    case "lemonchiffon" { return Color.Rgb(255, 250, 205) }
    case "lightblue" { return Color.Rgb(173, 216, 230) }
    case "lightcoral" { return Color.Rgb(240, 128, 128) }
    case "lightcyan" { return Color.Rgb(224, 255, 255) }
    case "lightgoldenrodyellow" { return Color.Rgb(250, 250, 210) }
    case "lightgray" { return Color.Rgb(211, 211, 211) }
    case "lightgrey" { return Color.Rgb(211, 211, 211) }
    case "lightgreen" { return Color.Rgb(144, 238, 144) }
    case "lightpink" { return Color.Rgb(255, 182, 193) }
    case "lightsalmon" { return Color.Rgb(255, 160, 122) }
    case "lightseagreen" { return Color.Rgb(32, 178, 170) }
    case "lightskyblue" { return Color.Rgb(135, 206, 250) }
    case "lightslategray" { return Color.Rgb(119, 136, 153) }
    case "lightslategrey" { return Color.Rgb(119, 136, 153) }
    case "lightsteelblue" { return Color.Rgb(176, 196, 222) }
    case "lightyellow" { return Color.Rgb(255, 255, 224) }
    case "lime" { return Color.Rgb(0, 255, 0) }
    case "limegreen" { return Color.Rgb(50, 205, 50) }
    case "linen" { return Color.Rgb(250, 240, 230) }
    case "magenta" { return Color.Rgb(255, 0, 255) }
    case "maroon" { return Color.Rgb(128, 0, 0) }
    case "mediumaquamarine" { return Color.Rgb(102, 205, 170) }
    case "mediumblue" { return Color.Rgb(0, 0, 205) }
    case "mediumorchid" { return Color.Rgb(186, 85, 211) }
    case "mediumpurple" { return Color.Rgb(147, 112, 219) }
    case "mediumseagreen" { return Color.Rgb(60, 179, 113) }
    case "mediumslateblue" { return Color.Rgb(123, 104, 238) }
    case "mediumspringgreen" { return Color.Rgb(0, 250, 154) }
    case "mediumturquoise" { return Color.Rgb(72, 209, 204) }
    case "mediumvioletred" { return Color.Rgb(199, 21, 133) }
    case "midnightblue" { return Color.Rgb(25, 25, 112) }
    case "mintcream" { return Color.Rgb(245, 255, 250) }
    case "mistyrose" { return Color.Rgb(255, 228, 225) }
    case "moccasin" { return Color.Rgb(255, 228, 181) }
    case "navajowhite" { return Color.Rgb(255, 222, 173) }
    case "navy" { return Color.Rgb(0, 0, 128) }
    case "oldlace" { return Color.Rgb(253, 245, 230) }
    case "olive" { return Color.Rgb(128, 128, 0) }
    case "olivedrab" { return Color.Rgb(107, 142, 35) }
    case "orange" { return Color.Rgb(255, 165, 0) }
    case "orangered" { return Color.Rgb(255, 69, 0) }
    case "orchid" { return Color.Rgb(218, 112, 214) }
    case "palegoldenrod" { return Color.Rgb(238, 232, 170) }
    case "palegreen" { return Color.Rgb(152, 251, 152) }
    case "paleturquoise" { return Color.Rgb(175, 238, 238) }
    case "palevioletred" { return Color.Rgb(219, 112, 147) }
    case "papayawhip" { return Color.Rgb(255, 239, 213) }
    case "peachpuff" { return Color.Rgb(255, 218, 185) }
    case "peru" { return Color.Rgb(205, 133, 63) }
    case "pink" { return Color.Rgb(255, 192, 203) }
    case "plum" { return Color.Rgb(221, 160, 221) }
    case "powderblue" { return Color.Rgb(176, 224, 230) }
    case "purple" { return Color.Rgb(128, 0, 128) }
    case "rebeccapurple" { return Color.Rgb(102, 51, 153) }
    case "red" { return Color.Rgb(255, 0, 0) }
    case "rosybrown" { return Color.Rgb(188, 143, 143) }
    case "royalblue" { return Color.Rgb(65, 105, 225) }
    case "saddlebrown" { return Color.Rgb(139, 69, 19) }
    case "salmon" { return Color.Rgb(250, 128, 114) }
    case "sandybrown" { return Color.Rgb(244, 164, 96) }
    case "seagreen" { return Color.Rgb(46, 139, 87) }
    case "seashell" { return Color.Rgb(255, 245, 238) }
    case "sienna" { return Color.Rgb(160, 82, 45) }
    case "silver" { return Color.Rgb(192, 192, 192) }
    case "skyblue" { return Color.Rgb(135, 206, 235) }
    case "slateblue" { return Color.Rgb(106, 90, 205) }
    case "slategray" { return Color.Rgb(112, 128, 144) }
    case "slategrey" { return Color.Rgb(112, 128, 144) }
    case "snow" { return Color.Rgb(255, 250, 250) }
    case "springgreen" { return Color.Rgb(0, 255, 127) }
    case "steelblue" { return Color.Rgb(70, 130, 180) }
    case "tan" { return Color.Rgb(210, 180, 140) }
    case "teal" { return Color.Rgb(0, 128, 128) }
    case "thistle" { return Color.Rgb(216, 191, 216) }
    case "tomato" { return Color.Rgb(255, 99, 71) }
    case "transparent" { return Color.Transparent }
    case "turquoise" { return Color.Rgb(64, 224, 208) }
    case "violet" { return Color.Rgb(238, 130, 238) }
    case "wheat" { return Color.Rgb(245, 222, 179) }
    case "white" { return Color.White }
    case "whitesmoke" { return Color.Rgb(245, 245, 245) }
    case "yellow" { return Color.Rgb(255, 255, 0) }
    case "yellowgreen" { return Color.Rgb(154, 205, 50) }
    case _ { return nil }
  }
  return nil
}
