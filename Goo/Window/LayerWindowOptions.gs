package Goo

import System

/// Selects the compositor layer for a Wayland layer-shell window.
public enum WindowLayer { Background; Bottom; Top; Overlay }

/// Selects the output edges to which a layer-shell window is anchored.
@Flags
public enum LayerWindowAnchor { None = 0; Top = 1; Bottom = 2; Left = 4; Right = 8 }

/// Controls keyboard focus for a layer-shell window.
public enum LayerWindowKeyboardInteractivity { None; Exclusive; OnDemand }

/// Configures a Wayland layer-shell surface before Window.Open.
/// Sizes and margins use compositor logical units. Zero sizes require opposite anchors.
public sealed class LayerWindowOptions {
  private var layer WindowLayer = WindowLayer.Top
  private var width int32 = 640
  private var height int32 = 480
  private var namespaceName string = "goo"

  /// Creates layer-shell options with a 640 by 480 top-layer surface.
  public init() { }

  /// Gets the compositor layer. The default is Top.
  public prop Layer WindowLayer { get -> layer init -> layer = value }
  /// Gets the output anchor edges.
  public prop Anchors LayerWindowAnchor { get; init; }
  /// Gets the requested width. Zero fills the horizontal anchors.
  public prop Width int32 { get -> width init -> width = value }
  /// Gets the requested height. Zero fills the vertical anchors.
  public prop Height int32 { get -> height init -> height = value }
  /// Gets the reserved edge distance. Zero avoids reserved areas. Minus one ignores them.
  public prop ExclusiveZone int32 { get; init; }
  /// Gets the top margin.
  public prop MarginTop int32 { get; init; }
  /// Gets the right margin.
  public prop MarginRight int32 { get; init; }
  /// Gets the bottom margin.
  public prop MarginBottom int32 { get; init; }
  /// Gets the left margin.
  public prop MarginLeft int32 { get; init; }
  /// Gets the keyboard focus policy.
  public prop KeyboardInteractivity LayerWindowKeyboardInteractivity { get; init; }
  /// Gets the target display. Null lets the compositor choose.
  public prop Output WindowDisplayId? { get; init; }
  /// Gets the compositor namespace. The default is goo.
  public prop Namespace string { get -> namespaceName init -> namespaceName = value }

  internal func Validate() {
    if uint32(Layer) > 3u || uint32(KeyboardInteractivity) > 2u || (uint32(Anchors) & ~15u) != 0u {
      throw ArgumentOutOfRangeException("LayerShell", "Invalid layer-shell enum value")
    }
    if Width < 0 || Height < 0 || ExclusiveZone < -1 || String.IsNullOrWhiteSpace(Namespace)
      || Namespace.Contains('\0') {
      throw ArgumentException("Invalid layer-shell size, exclusive zone or namespace", "LayerShell")
    }
    let horizontal = LayerWindowAnchor.Left | LayerWindowAnchor.Right
    let vertical = LayerWindowAnchor.Top | LayerWindowAnchor.Bottom
    if (Width == 0 && (Anchors & horizontal) != horizontal)
      || (Height == 0 && (Anchors & vertical) != vertical) {
      throw ArgumentException("A zero layer-shell dimension requires both opposite anchors", "LayerShell")
    }
  }
}
