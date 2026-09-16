package GooGallery

import Goo
import System

class GalleryPosterReflowItem {
    private let handle ElementHandle
    private let offset Anim[Point]
    private var layout Point
    private var initialized bool

    internal init(animatedOffset Anim[Point]) {
        handle = ElementHandle{}
        offset = animatedOffset
        layout = Point{}
        handle.MetricsChanged += trackMetrics
    }

    internal prop Handle ElementHandle {
        get -> handle
    }

    internal prop Offset Point {
        get -> offset.Value
    }

    internal func Dispose() {
        handle.MetricsChanged -= trackMetrics
    }

    private func trackMetrics(metrics ElementMetrics) {
        if !metrics.IsMounted {
            initialized = false
            return
        }
        let current = offset.Value
        let next = Point{X: metrics.BorderBox.X - current.X, Y: metrics.BorderBox.Y - current.Y,}
        if !initialized {
            layout = next
            initialized = true
            return
        }
        let delta = Point{X: layout.X - next.X, Y: layout.Y - next.Y,}
        layout = next
        if Math.Abs(delta.X) < 0.01 && Math.Abs(delta.Y) < 0.01 {
            return
        }
        offset.Snap(Point{X: current.X + delta.X, Y: current.Y + delta.Y,})
        offset.To(Point{}, GalleryPosterReflowSpec)
    }
}
