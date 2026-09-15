package GooGallery

import Goo
import System

class GalleryBoundedSimulation : Simulation {
    private let from float64
    private let to float64
    private let duration float64

    init(start float64, target float64, seconds float64) {
        from = start
        to = target
        duration = Math.Max(seconds * Math.Abs(target - start), 0.001)
    }

    /// Gets the eased coordinate at the specified elapsed time.
    public override func Position(elapsed float64) float64 {
        if elapsed <= 0.0 {
            return from
        }
        if elapsed >= duration {
            return to
        }
        let progress = elapsed / duration
        let eased = progress * progress * (3.0 - 2.0 * progress)
        return from + (to - from) * eased
    }

    /// Gets the eased velocity at the specified elapsed time.
    public override func Velocity(elapsed float64) float64 {
        if elapsed <= 0.0 || elapsed >= duration {
            return 0.0
        }
        let progress = elapsed / duration
        return (to - from) * 6.0 * progress * (1.0 - progress) / duration
    }

    /// Gets whether the bounded transition has completed.
    public override func Done(elapsed float64) bool -> elapsed >= duration
}

func GalleryActTransitionSpec(start float64, target float64, velocity float64) Simulation ->
GalleryBoundedSimulation(start, target, 0.25)

func GalleryRestoreSpec(start float64, target float64, velocity float64) Simulation ->
GalleryBoundedSimulation(start, target, 2.2)

func GalleryPerformanceSpec(start float64, target float64, velocity float64) Simulation ->
GalleryBoundedSimulation(start, target, 8.0)
