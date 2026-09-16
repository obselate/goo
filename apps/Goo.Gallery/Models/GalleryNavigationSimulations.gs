package GooGallery

import Goo
import System

class GalleryGooSpringSimulation : Simulation {
    private let target float64
    private let displacement float64
    private let decay float64
    private let frequency float64
    private let sineWeight float64

    public init(start float64, target float64, velocity float64) {
        this.target = target
        displacement = start - target
        decay = 6.5
        frequency = 11.0
        sineWeight = (velocity + decay * displacement) / frequency
    }

    /// Gets the spring coordinate at the specified elapsed time.
    public override func Position(elapsed float64) float64 {
        if Done(elapsed) {
            return target
        }
        let envelope = Math.Exp(-decay * elapsed)
        return target +
            envelope * (
            displacement * Math.Cos(frequency * elapsed)
            + sineWeight * Math.Sin(frequency * elapsed)
        )
    }

    /// Gets the spring velocity at the specified elapsed time.
    public override func Velocity(elapsed float64) float64 {
        if Done(elapsed) {
            return 0.0
        }
        let phase = frequency * elapsed
        let cosineWeight = -decay * displacement + frequency * sineWeight
        let nextSineWeight = -frequency * displacement - decay * sineWeight
        return Math.Exp(-decay * elapsed) * (cosineWeight * Math.Cos(phase) + nextSineWeight * Math.Sin(phase))
    }

    /// Gets whether the spring has settled.
    public override func Done(elapsed float64) bool -> elapsed >= 1.15
}

func GalleryGooSpringSpec(start float64, target float64, velocity float64) Simulation ->
GalleryGooSpringSimulation(start, target, velocity)

class GalleryGooFollowSimulation : Simulation {
    private let target float64
    private let displacement float64
    private let decay float64

    public init(start float64, target float64, velocity float64) {
        this.target = target
        displacement = start - target
        decay = 20.0
    }

    /// Gets the damped pointer-follow coordinate.
    public override func Position(elapsed float64) float64 -> if Done(elapsed) {
        target
    } else {
        target + displacement * Math.Exp(-decay * elapsed)
    }

    /// Gets the damped pointer-follow velocity.
    public override func Velocity(elapsed float64) float64 -> if Done(elapsed) {
        0.0
    } else {
        -decay * displacement * Math.Exp(-decay * elapsed)
    }

    /// Gets whether the pointer-follow motion has settled.
    public override func Done(elapsed float64) bool -> elapsed >= 0.32
}

func GalleryGooFollowSpec(start float64, target float64, velocity float64) Simulation ->
GalleryGooFollowSimulation(start, target, velocity)
