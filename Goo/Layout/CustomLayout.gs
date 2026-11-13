package Goo

import System

/// Describes a logical Width and Height, with positive infinity on unbounded axes.
public data struct LayoutSize(Width float64, Height float64)

/// Measures and arranges the existing children of a Container. Implementations must be immutable and must not mutate UI state during layout.
public interface LayoutAlgorithm {
  /// Returns the desired content size under the available constraints, excluding the container's padding and border.
  /// @param context The retained children available only during this callback.
  /// @param available The maximum content size, with positive infinity on an unbounded axis.
  /// @returns A finite, nonnegative desired content size, clamped by the parent constraints.
  func Measure(context LayoutContext, available LayoutSize) LayoutSize;
  /// Places every child in the final content area; child indices and mounted identity match Container.Children.
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

/// Provides bounded access to retained children during custom measure and arrange callbacks.
public class LayoutContext {
  private let state CustomLayoutState
  internal init(state CustomLayoutState) { this.state = state }
  /// Gets the number of retained direct children. Access outside a layout callback throws.
  public prop ChildCount int32{ get -> state.ChildCount() }
  /// Measures a retained child subtree without rebuilding it. Root margins are included in the returned size.
  /// @param index The zero-based child index.
  /// @param available Maximum width and height; positive infinity means unconstrained.
  /// @returns The child's desired margin-box size under these constraints.
  public func MeasureChild(index int32, available LayoutSize) LayoutSize -> state.MeasureChild(index, available)
  /// Resolves a length to layout pixels during the current callback.
  /// @param value The pixel or relative length.
  /// @param axis The available content axis for percentages.
  /// @returns Layout pixels, or nil for automatic and intrinsic values.
  public func ResolveLength(value Length, axis LayoutAxis) float64? -> state.ResolveLength(value, axis)
  /// Places a child margin box relative to the container's content origin. Every child must be placed exactly once per arrange callback.
  /// @param index The zero-based child index.
  /// @param bounds A finite, nonnegative-size margin box; offsets may be negative.
  public func ArrangeChild(index int32, bounds ElementRect) { state.ArrangeChild(index, bounds) }
}
