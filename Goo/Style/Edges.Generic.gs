package Goo

/// Specifies typed values for the top, right, bottom, and left edges.
/// @typeparam T edge value type
public struct Edges[T] {
  private var top T
  private var right T
  private var bottom T
  private var left T
  private var setTop bool
  private var setRight bool
  private var setBottom bool
  private var setLeft bool
  private var uniformValue T
  internal var Uniform bool

  /// Sets the top edge independently.
  public prop Top T {
    get -> setTop ? top : uniformValue
    init {
      top = value
      setTop = true
    }
  }
  /// Sets the right edge independently.
  public prop Right T {
    get -> setRight ? right : uniformValue
    init {
      right = value
      setRight = true
    }
  }
  /// Sets the bottom edge independently.
  public prop Bottom T {
    get -> setBottom ? bottom : uniformValue
    init {
      bottom = value
      setBottom = true
    }
  }
  /// Sets the left edge independently.
  public prop Left T {
    get -> setLeft ? left : uniformValue
    init {
      left = value
      setLeft = true
    }
  }

  internal prop HasTop bool{ get -> setTop }
  internal prop HasRight bool{ get -> setRight }
  internal prop HasBottom bool{ get -> setBottom }
  internal prop HasLeft bool{ get -> setLeft }
  internal prop UniformValue T{ get -> uniformValue }

  /// Applies one value to every edge.
  /// @param all value for every edge
  public init(all T) {
    uniformValue = all
    Uniform = true
  }

  /// Applies one value vertically and another horizontally.
  /// @param vertical top and bottom value
  /// @param horizontal right and left value
  public init(vertical T, horizontal T) {
    Top = vertical
    Right = horizontal
    Bottom = vertical
    Left = horizontal
  }

  /// Applies top, horizontal, and bottom values.
  /// @param top top value
  /// @param horizontal right and left value
  /// @param bottom bottom value
  public init(top T, horizontal T, bottom T) {
    Top = top
    Right = horizontal
    Bottom = bottom
    Left = horizontal
  }

  /// Applies values in CSS top, right, bottom, left order.
  /// @param top top value
  /// @param right right value
  /// @param bottom bottom value
  /// @param left left value
  public init(top T, right T, bottom T, left T) {
    Top = top
    Right = right
    Bottom = bottom
    Left = left
  }
}

/// Converts a color into a uniform edge value.
/// @param value color for every edge
/// @returns a uniform edge value
public func operator implicit(value Color) Edges[Color] -> Edges[Color](value)
