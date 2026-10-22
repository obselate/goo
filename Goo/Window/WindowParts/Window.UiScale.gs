package Goo

import System
import System.Numerics

/// Scales a window's retained layout and device-resolution rendering.
public partial class Window {
  private var uiScale float32 = 1.0F
  private var uiScaleSet bool

  /// Gets or sets the layout and rendering scale, clamped to 0.5 through 3. The default is 1, or the owner's scale when not explicitly set.
  /// Width and Height remain native logical sizes. Layout uses those sizes divided by UiScale, and rendering multiplies the display scale by UiScale.
  public prop UiScale float32 {
    get -> if uiScaleSet { uiScale } else { Owner?.UiScale ?? 1.0F }
    set(value) {
      requireUiThread("Window.UiScale")
      if !Single.IsFinite(value) { throw ArgumentOutOfRangeException("value") }
      let previous = UiScale
      uiScale = Math.Clamp(value, 0.5F, 3.0F)
      uiScaleSet = true
      if previous != UiScale { invalidateUiScale() }
    }
  }

  internal prop LayoutWidth float32 { get -> float32(Width) / UiScale }
  internal prop LayoutHeight float32 { get -> float32(Height) / UiScale }
  private prop RenderScale Vector2 { get -> dpi * UiScale }

  private func invalidateUiScale() {
    input.ChangeUiScale(node, resolver, UiScale)
    pendingReconcileEffects = combineEffects(pendingReconcileEffects,
      ReconcileEffects.Layout | ReconcileEffects.Paint | ReconcileEffects.Input | ReconcileEffects.Accessibility)
    accessibility?.MarkDirty()
    MetricSubscriptions.MarkWindowDirty(this)
    MetricSubscriptions.MarkElementsDirty(this)
    if embeddedHost == nil {
      host?.SetMinimumSize(scaledSize(minWidth), scaledSize(minHeight))
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

  private func scaledSize(value int32) int32 -> int32(Math.Min(float64(Int32.MaxValue), Math.Ceiling(float64(value) * float64(UiScale))))
}
