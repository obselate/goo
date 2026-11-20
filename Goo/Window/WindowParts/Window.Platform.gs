package Goo

import System

/// Hosts a Goo tree in a native window.
public partial class Window {
  private var nativePointer Point?

  internal func NativeResizable() bool -> if let native = host { native.NativeResizable } else { false }

  internal func queueNativeMetrics(logicalWidth int32, logicalHeight int32,
    nativeWidth int32, nativeHeight int32) {
      pendingLogicalWidth = logicalWidth
      pendingLogicalHeight = logicalHeight
      pendingFramebufferWidth = nativeWidth
      pendingFramebufferHeight = nativeHeight
      pendingMetrics = true
      MetricSubscriptions.ReportWindowMetrics(this,
        ResolveWindowMetrics(logicalWidth, logicalHeight, nativeWidth, nativeHeight,
          host?.DisplayScale ?? 0.0F))
    }

  internal func hitTest(x int32, y int32) WindowHitResult {
    let fullSizeContent = decorated && contentUnderTitlebar && OperatingSystem.IsMacOS()
    if (decorated && !fullSizeContent) || IsInputBlocked {
      return WindowHitResult.Normal
    }

    guard let n = node else {
      return WindowHitResult.Normal
    }
    let px = float32(x)
    let py = float32(y)
    if fullSizeContent {
      if let controls = TitlebarControlsRect {
        if px >= controls.X && px < controls.X + controls.Width && py < controls.Height {
          return WindowHitResult.Normal
        }
      }
    }
    let layoutX = float32(float64(px) / UiScale)
    let layoutY = float32(float64(py) / UiScale)
    let info = input.HitInfo(n, layoutX, layoutY)
    if !decorated && resizable && state == WindowState.Normal {
      let displayScale = float64(host?.DisplayScale ?? 0.0F)
      let scale = UiScale * (displayScale > 0.0 ? displayScale / float64(dpi.X) : 1.0)
      let band = host?.OutsideResizeBorder == true ? 0.0 : resizeBand * scale
      let corner = Math.Max(2.0 * resizeBand, 16.0) * scale
      let width = float32(NativeWidth)
      let height = float32(NativeHeight)
      let left = px < band
      let right = px >= width - band
      let top = py < band
      let bottom = py >= height - band
      let nearLeft = px < corner
      let nearRight = px >= width - corner
      let nearTop = py < corner
      let nearBottom = py >= height - corner

      if (top && nearLeft) || (left && nearTop) {
        return WindowHitResult.TopLeft
      }
      if (top && nearRight) || (right && nearTop) {
        return WindowHitResult.TopRight
      }
      if (bottom && nearLeft) || (left && nearBottom) {
        return WindowHitResult.BottomLeft
      }
      if (bottom && nearRight) || (right && nearBottom) {
        return WindowHitResult.BottomRight
      }
      if (top || bottom || left || right) && !info.HasContent && !input.ScrollbarAt(n, layoutX, layoutY) {
        if top {
          return WindowHitResult.Top
        }
        if bottom {
          return WindowHitResult.Bottom
        }
        return left ? WindowHitResult.Left : WindowHitResult.Right
      }
    }
    if info.HasContent {
      return WindowHitResult.Normal
    }
    let titlebarHeight = TitlebarControlsRect?.Height ?? 0.0
    return info.DragsWindow || (fullSizeContent && py < titlebarHeight)
      ? WindowHitResult.Draggable : WindowHitResult.Normal
  }
}
