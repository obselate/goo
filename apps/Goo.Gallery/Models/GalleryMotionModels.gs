package GooGallery

import Goo
import System

class GallerySpringSimulation : Simulation {
    private let target float64
    private let displacement float64
    private let decay float64
    private let frequency float64
    private let sineWeight float64
    private let settleTime float64

    public init(start float64, target float64, velocity float64, decay float64, frequency float64) {
        this.target = target
        displacement = start - target
        this.decay = decay
        this.frequency = Math.Max(frequency, 0.1)
        sineWeight = (velocity + decay * displacement) / this.frequency
        settleTime = Math.Max(8.0 / Math.Max(decay, 0.5), 0.5)
    }

    /// Gets the spring coordinate at the specified elapsed time.
    public override func Position(elapsed float64) float64 {
        if Done(elapsed) {
            return target
        }
        let envelope = Math.Exp(-decay * elapsed)
        let phase = frequency * elapsed
        return target +
            envelope * (
            displacement * Math.Cos(phase)
            + sineWeight * Math.Sin(phase)
        )
    }

    /// Gets the spring velocity at the specified elapsed time.
    public override func Velocity(elapsed float64) float64 {
        if Done(elapsed) {
            return 0.0
        }
        let envelope = Math.Exp(-decay * elapsed)
        let phase = frequency * elapsed
        let cosTerm = -decay * displacement + frequency * sineWeight
        let sinTerm = -frequency * displacement - decay * sineWeight
        return envelope * (cosTerm * Math.Cos(phase) + sinTerm * Math.Sin(phase))
    }

    /// Gets whether the spring simulation has settled.
    public override func Done(elapsed float64) bool -> elapsed >= settleTime
}

func GalleryBouncySpringSpec(start float64, target float64, velocity float64) Simulation ->
GallerySpringSimulation(start, target, velocity, 5.0, 13.0)

func GallerySnappySpringSpec(start float64, target float64, velocity float64) Simulation ->
GallerySpringSimulation(start, target, velocity, 14.0, 12.0)

func GalleryViscousSpringSpec(start float64, target float64, velocity float64) Simulation ->
GallerySpringSimulation(start, target, velocity, 12.0, 4.0)

func GalleryStiffSpringSpec(start float64, target float64, velocity float64) Simulation ->
GallerySpringSimulation(start, target, velocity, 12.0, 28.0)
