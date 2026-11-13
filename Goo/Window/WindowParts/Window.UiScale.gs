package Goo

import System
import System.Numerics

/// Scales a window's retained layout and device-resolution rendering.
public partial class Window {
  private var uiScale float64 = 1.0
  private var uiScaleSet bool

  /// Gets or sets the layout and rendering scale, clamped to 0.5 through 3. The default is 1, or the owner's scale when not explicitly set.
  /// Size and its limits use layout units. NativeWidth and NativeHeight report the unscaled native logical size.
  public prop UiScale float64 {
    get -> if uiScaleSet { uiScale } else { Owner?.UiScale ?? 1.0 }
    set(value) {
      requireUiThread("Window.UiScale")
      if !Double.IsFinite(value) { throw ArgumentOutOfRangeException("value") }
      let previous = UiScale
      uiScale = Math.Clamp(value, 0.5, 3.0)
      uiScaleSet = true
      if previous != UiScale { invalidateUiScale() }
    }
  }

  /// Gets the display scale multiplied by UiScale, the factor used to snap layout positions and translation-only transforms to device pixels on both axes.
  public prop PixelScale float64 { get -> float64(dpi.X) * UiScale }

  internal prop LayoutWidth float32 { get -> offscreenViewport?.X ?? float32(float64(NativeWidth) / UiScale) }
  internal prop LayoutHeight float32 { get -> offscreenViewport?.Y ?? float32(float64(NativeHeight) / UiScale) }
  internal prop RenderScale Vector2 { get -> dpi * float32(UiScale) }

  private func invalidateUiScale() {
    input.ChangeUiScale(node, resolver, float32(UiScale))
    pendingReconcileEffects = combineEffects(pendingReconcileEffects,
      ReconcileEffects.Layout | ReconcileEffects.Paint | ReconcileEffects.Input | ReconcileEffects.Accessibility)
    accessibility?.MarkDirty()
    MetricSubscriptions.MarkWindowDirty(this)
    MetricSubscriptions.MarkElementsDirty(this)
    if embeddedHost == nil {
      applyMinimumSize(minWidth, minHeight)
      host?.SetMaximumSize(scaledSize(maxWidth), scaledSize(maxHeight))
      pushSize()
    }
    if let children = family?.Children {
      for child in children {
        if !child.uiScaleSet { child.invalidateUiScale() }
      }
    }
    requestRender()
    host?.Wake()
  }

  private func scaledSize(value float64) int32 -> int32(Math.Min(float64(Int32.MaxValue), Math.Round(value * float64(UiScale))))
}
