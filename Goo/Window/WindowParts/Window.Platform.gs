package Goo

import System

/// Hosts a Goo tree in a native window.
public partial class Window {
  internal func NativeResizable() bool -> if let native = host { native.NativeResizable } else { false }

  internal func queueNativeMetrics(logicalWidth int32, logicalHeight int32,
    nativeWidth int32, nativeHeight int32) {
      pendingLogicalWidth = logicalWidth
      pendingLogicalHeight = logicalHeight
      pendingFramebufferWidth = nativeWidth
      pendingFramebufferHeight = nativeHeight
      pendingMetrics = true
      MetricSubscriptions.ReportWindowMetrics(this, logicalWidth, logicalHeight, nativeWidth, nativeHeight)
    }

  // Custom chrome hit routing: only undecorated windows own their edges and
  // drag regions; the system chrome handles both otherwise.
  internal func hitTest(x int32, y int32) WindowHitResult {
    if decorated || IsInputBlocked {
      return WindowHitResult.Normal
    }

    guard let n = node else {
      return WindowHitResult.Normal
    }
    let px = float32(x)
    let py = float32(y)
    let info = input.HitInfo(n, px, py)
    if info.HasContent {
      return WindowHitResult.Normal
    }

    if resizable {
      let band = resizeBand
      let logicalWidth = float32(Width)
      let logicalHeight = float32(Height)
      let left = px < band
      let right = px > logicalWidth - band
      let top = py < band
      let bottom = py > logicalHeight - band

      if top && left {
        return WindowHitResult.TopLeft
      }
      if top && right {
        return WindowHitResult.TopRight
      }
      if bottom && left {
        return WindowHitResult.BottomLeft
      }
      if bottom && right {
        return WindowHitResult.BottomRight
      }
      if top {
        return WindowHitResult.Top
      }
      if bottom {
        return WindowHitResult.Bottom
      }
      if left {
        return WindowHitResult.Left
      }
      if right {
        return WindowHitResult.Right
      }
    }
    return info.DragsWindow
    ? WindowHitResult.Draggable : WindowHitResult.Normal
  }
}
