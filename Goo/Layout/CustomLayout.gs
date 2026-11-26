package Goo

import System

/// Describes a logical Width and Height, with positive infinity on unbounded axes.
public data struct LayoutSize(Width float64, Height float64)

/// Selects how a custom layout constrains a child along one axis.
public enum LayoutMeasureMode {
  /// Allows the child to take its unconstrained natural size.
  Unbounded;
  /// Caps the child to at most the specified size.
  AtMost;
  /// Forces the child to exactly the specified size.
  Exactly;
  /// Measures the child's minimum intrinsic content size.
  MinContent
}

/// Specifies a single-axis measurement constraint for LayoutContext.MeasureChild.
public data struct LayoutConstraint {
  private var mode LayoutMeasureMode
  private var size float64

  /// Gets the constraint mode.
  public prop Mode LayoutMeasureMode { get -> mode; init -> mode = value }
  /// Gets the constraint size in layout units when Mode is AtMost or Exactly.
  public prop Size float64 { get -> size; init -> size = value }

  shared {
    /// Returns an unconstrained measurement constraint.
    public prop Unbounded LayoutConstraint { get -> LayoutConstraint{ Mode: LayoutMeasureMode.Unbounded, Size: Double.PositiveInfinity } }
    /// Returns a minimum-content intrinsic measurement constraint.
    public prop MinContent LayoutConstraint { get -> LayoutConstraint{ Mode: LayoutMeasureMode.MinContent, Size: 0.0 } }

    /// Returns a constraint that caps the child to at most the given finite, nonnegative size.
    /// @param size Maximum size in layout units, or positive infinity for Unbounded.
    /// @returns A LayoutConstraint for the axis.
    public func AtMost(size float64) LayoutConstraint {
      if Double.IsPositiveInfinity(size) { return Unbounded }
      if !Double.IsFinite(size) || size < 0.0 || size > float64(Single.MaxValue) {
        throw ArgumentOutOfRangeException("size")
      }
      return LayoutConstraint{ Mode: LayoutMeasureMode.AtMost, Size: size }
    }

    /// Returns a constraint that forces the child to the exact finite, nonnegative size.
    /// @param size Exact size in layout units.
    /// @returns A LayoutConstraint for the axis.
    public func Exactly(size float64) LayoutConstraint {
      if !Double.IsFinite(size) || size < 0.0 || size > float64(Single.MaxValue) {
        throw ArgumentOutOfRangeException("size")
      }
      return LayoutConstraint{ Mode: LayoutMeasureMode.Exactly, Size: size }
    }
  }
}

/// Measures and arranges the non-Portal children of a Container. Implementations must be immutable and must not mutate UI state during layout.
public interface LayoutAlgorithm {
  /// Returns the desired content size under the available constraints, excluding the container's padding and border.
  /// @param context The retained children available only during this callback.
  /// @param available The maximum content size, with positive infinity on an unbounded axis.
  /// @returns A finite, nonnegative desired content size, clamped by the parent constraints.
  func Measure(context LayoutContext, available LayoutSize) LayoutSize;
  /// Places every non-Portal child in the final content area. Indices follow Container.Children order with Portals excluded.
  /// @param context The retained children available only during this callback.
  /// @param finalSize The finite content size after the surrounding layout resolves the container.
  func Arrange(context LayoutContext, finalSize LayoutSize);
}

/// Selects a horizontal or vertical length reference.
public enum LayoutAxis {
  /// Uses the available content width.
  Horizontal;
  /// Uses the available content height.
  Vertical
}

/// Provides bounded access to retained non-Portal children during custom measure and arrange callbacks.
public class LayoutContext {
  private let state CustomLayoutState
  internal init(state CustomLayoutState) { this.state = state }
  /// Gets the number of retained direct children, excluding Portals. Access outside a layout callback throws.
  public prop ChildCount int32{ get -> state.ChildCount() }
  /// Gets the effective reading direction of the container during the current callback.
  public prop Direction Goo.Direction { get -> state.EffectiveDirection() }
  /// Gets the pixel density used for layout rounding during the current callback.
  public prop PixelDensity float64 { get -> state.EffectiveDensity() }
  /// Gets the Display mode of a retained child. Access outside a layout callback throws.
  /// @param index The zero-based child index, excluding Portals.
  /// @returns The child's Display value.
  public func ChildDisplay(index int32) Display -> state.ChildDisplay(index)
  /// Tries to read a typed layout trait attached to a retained child.
  /// @typeparam T The trait value type.
  /// @param index The zero-based child index, excluding Portals.
  /// @param key The trait key.
  /// @param value Receives the attached value, or the key default when absent.
  /// @returns True when the child declared the trait.
  public func TryGetChildTrait[T any](index int32, key LayoutKey[T], out value T) bool -> state.TryGetChildTrait(index, key, out value)
  /// Reads a typed layout trait attached to a retained child, or returns the key's default value when absent.
  /// @typeparam T The trait value type.
  /// @param index The zero-based child index, excluding Portals.
  /// @param key The trait key.
  /// @returns The attached trait value or the key default.
  public func ChildTrait[T any](index int32, key LayoutKey[T]) T -> state.ChildTrait(index, key)
  /// Measures a retained child subtree without rebuilding it. Root margins are included in the returned size.
  /// @param index The zero-based child index, excluding Portals.
  /// @param available Maximum width and height; positive infinity means unconstrained.
  /// @returns The child's desired margin-box size under these constraints.
  public func MeasureChild(index int32, available LayoutSize) LayoutSize -> state.MeasureChild(index, available)
  /// Measures a retained child subtree with explicit per-axis constraints. Root margins are included in the returned size.
  /// @param index The zero-based child index, excluding Portals.
  /// @param width Horizontal measurement constraint.
  /// @param height Vertical measurement constraint.
  /// @returns The child's desired margin-box size under these constraints.
  public func MeasureChild(index int32, width LayoutConstraint, height LayoutConstraint) LayoutSize -> state.MeasureChild(index, width, height)
  /// Measures a retained child subtree and returns its first text baseline offset from its margin box top, when available.
  /// @param index The zero-based child index, excluding Portals.
  /// @param width Horizontal measurement constraint.
  /// @param height Vertical measurement constraint.
  /// @returns Baseline offset from margin-box top, or nil when the child has no text baseline.
  public func MeasureChildBaseline(index int32, width LayoutConstraint, height LayoutConstraint) float64? -> state.MeasureChildBaseline(index, width, height)
  /// Resolves a length to layout units during the current callback.
  /// Em uses this container's font size. Percent uses the available size of the current callback.
  /// @param value The pixel or relative length.
  /// @param axis The available content axis for percentages.
  /// @returns Layout units, or nil for automatic or intrinsic values, or a nonzero percentage part without a finite basis.
  public func ResolveLength(value Length, axis LayoutAxis) float64? -> state.ResolveLength(value, axis)
  /// Places a child margin box relative to the container's content origin. Every non-Portal child must be placed exactly once per arrange callback.
  /// @param index The zero-based child index, excluding Portals.
  /// @param bounds A finite, nonnegative-size margin box; offsets may be negative.
  public func ArrangeChild(index int32, bounds ElementRect) { state.ArrangeChild(index, bounds) }
}
