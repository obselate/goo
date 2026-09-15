package GooGallery

import Goo
import System

class GalleryPosterReflowSimulation : Simulation {
    private let from float64
    private let to float64
    private let duration float64

    init(start float64, target float64, velocity float64) {
        from = start
        to = target
        duration = 0.22
    }

    /// Gets the eased reflow coordinate.
    public override func Position(elapsed float64) float64 {
        if elapsed <= 0.0 {
            return from
        }
        if elapsed >= duration {
            return to
        }
        let remaining = 1.0 - elapsed / duration
        let eased = 1.0 - remaining * remaining * remaining
        return from + (to - from) * eased
    }

    /// Gets the eased reflow velocity.
    public override func Velocity(elapsed float64) float64 {
        if elapsed <= 0.0 || elapsed >= duration {
            return 0.0
        }
        let remaining = 1.0 - elapsed / duration
        return (to - from) * 3.0 * remaining * remaining / duration
    }

    /// Gets whether the reflow has settled.
    public override func Done(elapsed float64) bool -> elapsed >= duration
}

func GalleryPosterReflowSpec(start float64, target float64, velocity float64) Simulation ->
GalleryPosterReflowSimulation(start, target, velocity)
