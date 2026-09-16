package GooGallery

import Goo

class GalleryClockSimulation : Simulation {
    private let offset float64

    /// Creates a clock simulation that starts at the specified offset.
    /// @param offset initial scalar value for the clock.
    public init(offset float64) {
        this.offset = offset
    }

    /// Gets the scalar coordinate at the specified elapsed time.
    public override func Position(elapsed float64) float64 -> offset + elapsed

    /// Gets the rate of change of progress at the specified elapsed time.
    public override func Velocity(elapsed float64) float64 -> 1.0

    /// Gets whether the simulation has settled at the specified elapsed time.
    public override func Done(elapsed float64) bool -> false
}
