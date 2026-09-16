package Goo

import System

internal class MotionFixtures {
  internal let pump MotionPump

  init() {
    pump = MotionPump()
  }

  func TweenFactoryContract() bool {
    let tween = Motion.Tween(2.0, Easing.EaseInOut)
    let simulation = tween(2.0, 10.0, 99.0)
    let instantTween = Motion.Tween(0.0)
    let instant = instantTween(2.0, 10.0, 99.0)
    return Math.Abs(simulation.Position(0.5) - 3.0) < 1e-9
      && Math.Abs(simulation.Velocity(0.5) - 4.0) < 1e-9
      && Math.Abs(simulation.Position(1.5) - 9.0) < 1e-9
      && Math.Abs(simulation.Velocity(1.5) - 4.0) < 1e-9
      && !simulation.Done(1.999)
      && simulation.Done(2.0)
      && simulation.Position(2.0) == 10.0
      && simulation.Velocity(2.0) == 0.0
      && instant.Done(0.0)
      && instant.Position(0.0) == 10.0
      && instant.Velocity(0.0) == 0.0
  }

  func CallbackAnimationContract() bool {
    let cell = MotionFixtureCell{}
    cell.BindPump(pump)
    var calls = 0
    var latest = -1.0
    let anim = cell.Animate(0.0, (value float64) -> {
      calls++
      latest = value
    })
    try {
      anim.Set(2.0)
      if calls != 1 || latest != 2.0 || cell.HasDirty() {
        return false
      }
      anim.To(10.0, Motion.Tween(1.0, Easing.EaseIn))
      pump.Sweep(0.5)
      if calls != 2 || latest != 4.0 || cell.HasDirty() {
        return false
      }
      pump.Sweep(0.5)
      if calls != 3 || latest != 10.0 || anim.Running || cell.HasDirty() {
        return false
      }
      cell.DisposeMounted()
      anim.To(20.0, Motion.Tween(1.0))
      pump.Sweep(1.0)
      return calls == 3
    } finally {
      cell.DisposeMounted()
    }
  }

  func RetargetPreservesVelocityContract() bool {
    let cell = MotionFixtureCell{}
    cell.BindPump(pump)
    let anim = cell.Animate(0.0)
    try {
      anim.To(10.0, clockEchoSpec)
      pump.Sweep(3.0)
      var captured = -1.0
      let captureSpec(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> {
        captured = velocity
        return ClockEchoSimulation()
      }
      anim.To(20.0, captureSpec)
      return anim.Running && captured == 3.0
    } finally {
      cell.DisposeMounted()
    }
  }

  func RetargetAcrossDifferentSpanPreservesRealVelocityContract() bool {
    let cell = MotionFixtureCell{}
    cell.BindPump(pump)
    let anim = cell.Animate(0.0)
    try {
      let startSpec(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> LinearTimed(1.0, from, to)
      anim.To(100.0, startSpec)
      pump.Sweep(0.5)
      let valueBefore = anim.Value
      var captured = -1.0
      let captureSpec(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> {
        captured = velocity
        return LinearTimed(1.0, from, to)
      }
      anim.To(valueBefore + 1.0, captureSpec)
      return Math.Abs(captured - 100.0) < 1e-9
    } finally {
      cell.DisposeMounted()
    }
  }

  func LandsAtSimResultNotTargetContract() bool {
    let cell = MotionFixtureCell{}
    cell.BindPump(pump)
    let anim = cell.Animate(0.0)
    try {
      anim.To(100.0, restsShortOfTargetSpec)
      pump.Sweep(0.001)
      return !anim.Running && anim.Value == 3.0
    } finally {
      cell.DisposeMounted()
    }
  }

  func ExplicitVelocitySeedsFreshSimContract() bool {
    let cell = MotionFixtureCell{}
    cell.BindPump(pump)
    let anim = cell.Animate(5.0)
    try {
      var captured = -1.0
      anim.To(5.0, MotionVelocity.Uniform(42.0), (from float64, to float64, velocity float64) -> {
        captured = velocity
        return ClockEchoSimulation()
      })
      return captured == 42.0 && anim.Running
    } finally {
      cell.DisposeMounted()
    }
  }

  func FinishLandsExactlyOnTargetContract() bool {
    let cell = CountingMotionFixtureCell{}
    let anim = cell.anim
    let window = Window{ Width: 100, Height: 100, Root: cell }
    try {
      window.UpdateTree()
      anim.To(100.0)
      window.UpdateTree(0.1)
      if !anim.Running || cell.Builds != 2 {
        return false
      }
      window.UpdateTree(0.08)
      if anim.Running || anim.Value != 100.0 || cell.Builds != 3 {
        return false
      }
      window.UpdateTree(0.1)
      return cell.Builds == 3
    } finally {
      cell.DisposeMounted()
    }
  }

  func DisposedCellDeregistersContract() bool {
    let cell = MotionFixtureCell{}
    cell.BindPump(pump)
    let anim = cell.Animate(0.0)
    try {
      anim.To(1.0, clockEchoSpec)
      if !anim.Running {
        return false
      }
      cell.DisposeMounted()
      if anim.Running {
        return false
      }
      anim.To(5.0, clockEchoSpec)
      return !anim.Running
    } finally {
      cell.DisposeMounted()
    }
  }

  func TimeScaleZeroCompletesInstantlyContract() bool {
    let originalScale = Motion.TimeScale
    let cell = MotionFixtureCell{}
    cell.BindPump(pump)
    let anim = cell.Animate(0.0)
    try {
      Motion.TimeScale = 1.0
      anim.To(50.0, clockEchoSpec)
      pump.Sweep(0.01)
      if !anim.Running {
        return false
      }
      Motion.TimeScale = 0.0
      pump.Sweep(0.01)
      return !anim.Running && anim.Value == 50.0
    } finally {
      Motion.TimeScale = originalScale
      cell.DisposeMounted()
    }
  }

  func PointRetargetCarriesIndependentVelocityContract() bool {
    let cell = MotionFixtureCell{}
    cell.BindPump(pump)
    let anim = cell.Animate(Point{ X: 0.0, Y: 0.0 })
    try {
      var initialCalls = 0
      let initialSpec(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> {
        initialCalls = initialCalls + 1
        return ConstantVelocitySimulation(from, initialCalls == 1 ? 3.0 : -4.0)
      }
      anim.To(Point{ X: 20.0, Y: 40.0 }, initialSpec)
      pump.Sweep(0.5)
      var retargetCalls = 0
      var xVelocity = 0.0
      var yVelocity = 0.0
      let captureSpec(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> {
        retargetCalls = retargetCalls + 1
        if retargetCalls == 1 {
          xVelocity = velocity
        } else {
          yVelocity = velocity
        }
        return ClockEchoSimulation()
      }
      anim.To(Point{ X: 60.0, Y: 80.0 }, captureSpec)
      return xVelocity == 3.0 && yVelocity == -4.0
    } finally {
      cell.DisposeMounted()
    }
  }

  func PointSpecRoutingContract() bool {
    let cell = MotionFixtureCell{}
    cell.BindPump(pump)
    let anim = cell.Animate(Point{ X: 1.0, Y: 2.0 })
    try {
      var uniformCalls = 0
      let uniformSpec(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> {
        uniformCalls = uniformCalls + 1
        return ClockEchoSimulation()
      }
      anim.To(Point{ X: 3.0, Y: 5.0 }, uniformSpec)
      anim.Set(Point{ X: 1.0, Y: 2.0 })
      var xCalled = false
      var yCalled = false
      let xSpec(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> {
        xCalled = from == 1.0 && to == 3.0
        return ClockEchoSimulation()
      }
      let ySpec(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> {
        yCalled = from == 2.0 && to == 5.0
        return ClockEchoSimulation()
      }
      anim.To(
        Point{ X: 3.0, Y: 5.0 },
        xSpec,
        ySpec)
      return uniformCalls == 2 && xCalled && yCalled
    } finally {
      cell.DisposeMounted()
    }
  }

  func MotionVelocityRoutingContract() bool {
    let cell = MotionFixtureCell{}
    cell.BindPump(pump)
    let anim = cell.Animate(Point{ X: 0.0, Y: 0.0 })
    try {
      var calls = 0
      var first = 0.0
      var second = 0.0
      let uniformSpec(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> {
        calls = calls + 1
        if calls == 1 {
          first = velocity
        } else {
          second = velocity
        }
        return ClockEchoSimulation()
      }
      anim.To(Point{ X: 1.0, Y: 1.0 }, MotionVelocity.Uniform(7.0), uniformSpec)
      if first != 7.0 || second != 7.0 {
        return false
      }
      anim.Set(Point{ X: 0.0, Y: 0.0 })
      calls = 0
      first = 0.0
      second = 0.0
      let componentSpec(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> {
        calls = calls + 1
        if calls == 1 {
          first = velocity
        } else {
          second = velocity
        }
        return ClockEchoSimulation()
      }
      anim.To(Point{ X: 1.0, Y: 1.0 }, MotionVelocity.Components(2.0, -3.0), componentSpec)
      return first == 2.0 && second == -3.0
    } finally {
      cell.DisposeMounted()
    }
  }

  func InvalidVelocityAndSpecLeaveStateUntouchedContract() bool {
    let cell = MotionFixtureCell{}
    cell.BindPump(pump)
    let scalar = cell.Animate(4.0)
    let point = cell.Animate(Point{ X: 1.0, Y: 2.0 })
    try {
      let defaultVelocityFails = throws(() -> scalar.To(6.0, MotionVelocity{}, clockEchoSpec))
      let componentVelocityFails = throws(() -> scalar.To(6.0, MotionVelocity.Components(1.0, 2.0), clockEchoSpec))
      let specCountFails = throws(() -> point.To(Point{ X: 3.0, Y: 4.0 }, clockEchoSpec, clockEchoSpec, clockEchoSpec))
      let nonFiniteUniformFails = throws(() -> {
        let ignored = MotionVelocity.Uniform(Double.NaN)
      })
      let nonFiniteComponentsFail = throws(() -> {
        let ignored = MotionVelocity.Components(Double.PositiveInfinity)
      })
      let emptyComponentsFail = throws(() -> {
        let ignored = MotionVelocity.Components()
      })
      return defaultVelocityFails && componentVelocityFails && specCountFails
        && nonFiniteUniformFails && nonFiniteComponentsFail && emptyComponentsFail
        && scalar.Value == 4.0 && scalar.Target == 4.0 && !scalar.Running
        && point.Value.X == 1.0 && point.Value.Y == 2.0
        && point.Target.X == 1.0 && point.Target.Y == 2.0 && !point.Running
    } finally {
      cell.DisposeMounted()
    }
  }

  func ThrowingSpecLeavesAnimReusableContract() bool {
    let cell = MotionFixtureCell{}
    cell.BindPump(pump)
    let anim = cell.Animate(Point{ X: 1.0, Y: 2.0 })
    try {
      let failed = throws(() -> anim.To(Point{ X: 3.0, Y: 4.0 }, clockEchoSpec, throwingMotionSpec))
      if !failed || anim.Running || anim.Target.X != 1.0 || anim.Target.Y != 2.0 {
        return false
      }
      anim.To(Point{ X: 3.0, Y: 4.0 }, clockEchoSpec)
      return anim.Running
    } finally {
      cell.DisposeMounted()
    }
  }

  func TypedColorAnimationContract() bool {
    let cell = MotionFixtureCell{}
    cell.BindPump(pump)
    let anim = cell.Animate(Color.Black)
    try {
      anim.To(Color.White)
      pump.Sweep(0.09)
      let midpoint = anim.Value
      if !anim.Running || Math.Abs(float64(midpoint.R) - 0.5) > 0.001 {
        return false
      }
      pump.Sweep(0.09)
      return !anim.Running && anim.Value == Color.White
    } finally {
      cell.DisposeMounted()
    }
  }

  func LengthValidationContract() bool {
    let cell = MotionFixtureCell{}
    cell.BindPump(pump)
    let pixels Length = 10.0
    let anim = cell.Animate(pixels)
    try {
      let targetFails = throws(() -> anim.To(Length.Percent(25.0), clockEchoSpec))
      let setFails = throws(() -> anim.Set(Length.Percent(25.0)))
      let autoFails = throws(() -> {
        let ignored = cell.Animate(Length.Auto)
      })
      return targetFails && setFails && autoFails
        && anim.Value.Magnitude == 10.0 && anim.Target.Magnitude == 10.0 && !anim.Running
    } finally {
      cell.DisposeMounted()
    }
  }

  func SetDuringBuildLeavesAnimUnchangedContract() bool {
    let cell = SetDuringBuildFixtureCell{}
    guard let anim = cell.anim else {
      return false
    }
    let threw = throws(() -> {
      let ignored = cell.Render()
    })
    cell.DisposeMounted()
    return threw && anim.Value == 0.0 && anim.Target == 0.0 && !anim.Running
  }

  func VelocityGetterReportsLiveAndRestingVelocityContract() bool {
    let cell = MotionFixtureCell{}
    cell.BindPump(pump)
    let anim = cell.Animate(0.0)
    try {
      let velocity = [1]float64
      anim.Velocity.CopyInto(velocity)
      if velocity[0] != 0.0 {
        return false
      }
      let spec(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> LinearTimed(1.0, from, to)
      anim.To(10.0, spec)
      pump.Sweep(0.25)
      anim.Velocity.CopyInto(velocity)
      if Math.Abs(velocity[0] - 10.0) > 1e-9 {
        return false
      }
      pump.Sweep(2.0)
      anim.Velocity.CopyInto(velocity)
      return !anim.Running && velocity[0] == 0.0
    } finally {
      cell.DisposeMounted()
    }
  }

  func VelocityGetterMatchesRetargetSeedContract() bool {
    let cell = MotionFixtureCell{}
    cell.BindPump(pump)
    let anim = cell.Animate(0.0)
    try {
      anim.To(10.0, clockEchoSpec)
      pump.Sweep(3.0)
      let observed = [1]float64
      anim.Velocity.CopyInto(observed)
      var captured = -1.0
      let captureSpec(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> {
        captured = velocity
        return ClockEchoSimulation()
      }
      anim.To(20.0, captureSpec)
      return observed[0] == captured
    } finally {
      cell.DisposeMounted()
    }
  }

  func VelocityGetterReportsPerDimensionPointVelocityContract() bool {
    let cell = MotionFixtureCell{}
    cell.BindPump(pump)
    let anim = cell.Animate(Point{ X: 0.0, Y: 0.0 })
    try {
      let fast(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> LinearTimed(1.0, from, to)
      let slow(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> LinearTimed(2.0, from, to)
      anim.To(Point{ X: 10.0, Y: 10.0 }, fast, slow)
      pump.Sweep(0.25)
      let velocity = [2]float64
      anim.Velocity.CopyInto(velocity)
      return Math.Abs(velocity[0] - 10.0) < 1e-9 && Math.Abs(velocity[1] - 5.0) < 1e-9
    } finally {
      cell.DisposeMounted()
    }
  }

  func VelocityGetterPreservesRawColorComponentsContract() bool {
    let cell = MotionFixtureCell{}
    cell.BindPump(pump)
    let anim = cell.Animate(Color.Black)
    try {
      let r(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> ConstantVelocitySimulation(from, -2.0)
      let g(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> ConstantVelocitySimulation(from, 3.0)
      let b(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> ConstantVelocitySimulation(from, -4.0)
      let a(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> ConstantVelocitySimulation(from, 5.0)
      anim.To(Color.White, r, g, b, a)
      pump.Sweep(0.25)
      let velocity = [4]float64
      anim.Velocity.CopyInto(velocity)
      return velocity[0] == -2.0 && velocity[1] == 3.0
        && velocity[2] == -4.0 && velocity[3] == 5.0
    } finally {
      cell.DisposeMounted()
    }
  }

  func MotionVelocityAdditionPreservesShapeContract() bool {
    let mixed = [2]float64
    MotionVelocity.Components(-2.0, 3.0).Add(MotionVelocity.Uniform(0.5)).CopyInto(mixed)
    let uniform = [3]float64
    MotionVelocity.Uniform(1.5).Add(MotionVelocity.Uniform(-0.5)).CopyInto(uniform)
    let paired = [2]float64
    MotionVelocity.Components(1.0, 2.0).Add(MotionVelocity.Components(3.0, -5.0)).CopyInto(paired)
    let invalidFails = throws(() -> {
      let ignored = MotionVelocity{}.Add(MotionVelocity.Uniform(1.0))
    })
    let mismatchFails = throws(() -> {
      let ignored = MotionVelocity.Components(1.0).Add(MotionVelocity.Components(1.0, 2.0))
    })
    return mixed[0] == -1.5 && mixed[1] == 3.5
      && uniform[0] == 1.0 && uniform[1] == 1.0 && uniform[2] == 1.0
      && paired[0] == 4.0 && paired[1] == -3.0
      && invalidFails && mismatchFails
  }

  func SnapDuringBuildAppliesValueContract() bool {
    let cell = SnapDuringBuildFixtureCell{}
    cell.BindPump(pump)
    guard let anim = cell.anim else {
      return false
    }
    let threw = throws(() -> {
      let ignored = cell.Render()
    })
    cell.DisposeMounted()
    return !threw && anim.Value == 1.0 && anim.Target == 1.0 && !anim.Running
  }

  func SnapStopsRunningAnimationWithoutInvalidateContract() bool {
    let cell = MotionFixtureCell{}
    cell.BindPump(pump)
    let anim = cell.Animate(0.0)
    try {
      let spec(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> LinearTimed(1.0, from, to)
      anim.To(10.0, spec)
      pump.Sweep(0.25)
      cell.ClearDirty()
      anim.Snap(4.0)
      if cell.HasDirty() {
        return false
      }
      let velocity = [1]float64
      anim.Velocity.CopyInto(velocity)
      if anim.Running || anim.Value != 4.0 || anim.Target != 4.0 || velocity[0] != 0.0 {
        return false
      }
      pump.Sweep(1.0)
      return anim.Value == 4.0
    } finally {
      cell.DisposeMounted()
    }
  }

  func InvalidConverterFailsBeforeRegistrationContract() bool {
    let cell = MotionFixtureCell{}
    cell.BindPump(pump)
    try {
      let invalidDimensions = throws(() -> {
        let ignored = MotionConverter[float64](0, readFloatMotion, writeFloatMotion)
      })
      let invalidInitial = throws(() -> {
        let ignored = cell.Animate(Double.NaN)
      })
      let rejectedInitial = throws(() -> {
        let rejectedConverter = MotionConverter[float64](1, rejectInitialMotion, writeFloatMotion)
        let ignored = cell.Animate(0.0, rejectedConverter)
      })
      let valid = cell.Animate(0.0)
      valid.To(1.0, clockEchoSpec)
      return invalidDimensions && invalidInitial && rejectedInitial && valid.Running
    } finally {
      cell.DisposeMounted()
    }
  }

  func SameClockScaleChangeRecomputesValueContract() bool {
    let originalScale = Motion.TimeScale
    let cell = MotionFixtureCell{}
    cell.BindPump(pump)
    let anim = cell.Animate(0.0)
    let simulation = CountingPositionSimulation()
    try {
      Motion.TimeScale = 1.0
      let spec(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> simulation
      anim.To(1.0, spec)
      pump.Sweep(0.1)
      let first = anim.Value
      Motion.TimeScale = 2.0
      let second = anim.Value
      return first == 0.1 && second == 0.2 && simulation.PositionCalls == 2
    } finally {
      Motion.TimeScale = originalScale
      cell.DisposeMounted()
    }
  }

  func ForcedCompletionSeedsNextRetargetFromTargetContract() bool {
    let originalScale = Motion.TimeScale
    let cell = MotionFixtureCell{}
    cell.BindPump(pump)
    let anim = cell.Animate(0.0)
    try {
      Motion.TimeScale = 1.0
      anim.To(10.0, clockEchoSpec)
      pump.Sweep(0.1)
      Motion.TimeScale = 0.0
      pump.Sweep(0.1)
      Motion.TimeScale = 1.0
      var capturedFrom = -1.0
      let captureSpec(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> {
        capturedFrom = from
        return ClockEchoSimulation()
      }
      anim.To(20.0, captureSpec)
      return capturedFrom == 10.0
    } finally {
      Motion.TimeScale = originalScale
      cell.DisposeMounted()
    }
  }

  func DisposeRetainsPartialProgressContract() bool {
    let cell = MotionFixtureCell{}
    cell.BindPump(pump)
    let anim = cell.Animate(0.0)
    let spec(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> LinearTimed(1.0, from, to)
    anim.To(100.0, spec)
    pump.Sweep(0.5)
    cell.DisposeMounted()
    return !anim.Running && anim.Value == 50.0 && anim.Target == 100.0
  }

  func WindowOwnsMotionClockContract() bool {
    let firstCell = MotionFixtureCell{}
    let secondCell = MotionFixtureCell{}
    let firstWindow = Window{ Width: 100, Height: 100, Root: firstCell }
    let secondWindow = Window{ Width: 100, Height: 100, Root: secondCell }
    let first = firstCell.Animate(0.0)
    let second = secondCell.Animate(0.0)
    try {
      firstWindow.UpdateTree()
      secondWindow.UpdateTree()
      first.To(1.0, clockEchoSpec)
      second.To(1.0, clockEchoSpec)
      firstWindow.UpdateTree(0.1)
      return first.Value == 0.1 && second.Value == 0.0
    } finally {
      firstWindow.Close()
      secondWindow.Close()
    }
  }

  func CloseIsolatesWindowPumpContract() bool {
    let firstCell = MotionFixtureCell{}
    let secondCell = MotionFixtureCell{}
    let firstWindow = Window{ Width: 100, Height: 100, Root: firstCell }
    let secondWindow = Window{ Width: 100, Height: 100, Root: secondCell }
    let first = firstCell.Animate(0.0)
    let second = secondCell.Animate(0.0)
    try {
      firstWindow.UpdateTree()
      secondWindow.UpdateTree()
      first.To(1.0, clockEchoSpec)
      second.To(1.0, clockEchoSpec)
      firstWindow.Close()
      secondWindow.UpdateTree(0.1)
      return !first.Running && second.Running && second.Value == 0.1
    } finally {
      firstWindow.Close()
      secondWindow.Close()
    }
  }

  func WindowCloseContinuesAfterAnimationFailureContract() bool {
    let cell = MotionFixtureCell{}
    let window = Window{ Width: 100, Height: 100, Root: cell }
    let first = cell.Animate(0.0)
    let second = cell.Animate(0.0)
    let firstSimulation = ThrowingPositionSimulation()
    let secondCounter = PumpCounter()
    let firstSpec(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> firstSimulation
    let secondSpec(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> PumpFixtureSimulation(secondCounter, false)
    window.UpdateTree()
    first.To(1.0, firstSpec)
    second.To(1.0, secondSpec)
    var threw = false
    try {
      window.Close()
    } catch (error Exception) {
      threw = true
    }
    let result = threw && window.Tree == nil && firstSimulation.PositionCalls == 1
      && !first.Running && !second.Running
    window.Close()
    return result
  }

  func WindowCloseTraversesSiblingCellsContract() bool {
    WindowSiblingRetainedCell.Disposals = 0
    let parent = WindowSiblingParent{}
    let window = Window{ Width: 100, Height: 100, Root: parent }
    window.UpdateTree()
    guard let first = parent.First, let later = parent.Later else {
      window.Close()
      return false
    }
    let firstSimulation = ThrowingPositionSimulation()
    let laterCounter = PumpCounter()
    let firstSpec(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> firstSimulation
    let laterSpec(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> PumpFixtureSimulation(laterCounter, false)
    first.Animation.To(1.0, firstSpec)
    later.Animation.To(1.0, laterSpec)
    var threw = false
    try {
      window.Close()
    } catch (error Exception) {
      threw = true
    }
    later.Value = 1
    let result = threw && window.Tree == nil && firstSimulation.PositionCalls == 1
      && !first.Animation.Running && !later.Animation.Running
      && WindowSiblingRetainedCell.Disposals == 1
      && laterCounter.DoneCalls == 0
    window.Close()
    return result
  }

  func PreMountAnimationWaitsForWindowContract() bool {
    let unattached = MotionFixtureCell{}
    let other = MotionFixtureCell{}
    let anim = unattached.Animate(0.0)
    let otherWindow = Window{ Width: 100, Height: 100, Root: other }
    let attachingWindow = Window{ Width: 100, Height: 100, Root: unattached }
    try {
      anim.To(1.0, clockEchoSpec)
      otherWindow.UpdateTree()
      otherWindow.UpdateTree(0.5)
      if anim.Value != 0.0 {
        return false
      }
      attachingWindow.UpdateTree()
      if anim.Value != 0.0 {
        return false
      }
      attachingWindow.UpdateTree(0.25)
      return anim.Value == 0.25
    } finally {
      otherWindow.Close()

      attachingWindow.Close()
    }
  }

  func PumpThrowingTickRemainsRegisteredContract() bool {
    let cell = MotionFixtureCell{}
    cell.BindPump(pump)
    let anim = cell.Animate(0.0)
    let simulation = ThrowingDoneSimulation()
    let spec(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> simulation
    try {
      anim.To(1.0, spec)
      let threw = throws(() -> pump.Sweep(0.1))
      simulation.Throw = false
      pump.Sweep(0.1)
      if !threw || simulation.DoneCalls != 2 || !anim.Running {
        return false
      }
      simulation.Complete = true
      pump.Sweep(0.1)
      if anim.Running || pump.Active {
        return false
      }
      simulation.Complete = false
      anim.To(2.0, spec)
      pump.Sweep(0.1)
      return anim.Running && simulation.DoneCalls == 4
    } finally {
      cell.DisposeMounted()
    }
  }

  func PumpRejectsReentrantSweepContract() bool {
    let firstCell = MotionFixtureCell{}
    let secondCell = MotionFixtureCell{}
    firstCell.BindPump(pump)
    secondCell.BindPump(pump)
    let first = firstCell.Animate(0.0)
    let second = secondCell.Animate(0.0)
    let secondCounter = PumpCounter()
    let secondSpec(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> {
      return PumpFixtureSimulation(secondCounter, false)
    }
    var attempted = false
    var rejected = false
    let firstSimulation = PumpCallbackSimulation(() -> {
      if !attempted {
        attempted = true
        try {
          pump.Sweep(0.1)
        } catch (error InvalidOperationException) {
          rejected = true
        }
      }
    }, false)
    let firstSpec(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> firstSimulation
    try {
      first.To(1.0, firstSpec)
      second.To(1.0, secondSpec)
      pump.Sweep(0.1)
      if !rejected || firstSimulation.DoneCalls != 1 || secondCounter.DoneCalls != 1
        || !first.Running || !second.Running || !pump.Active{
          return false
        }
      pump.Sweep(0.1)
      return firstSimulation.DoneCalls == 2 && secondCounter.DoneCalls == 2
        && first.Running && second.Running
    } finally {
      firstCell.DisposeMounted()
      secondCell.DisposeMounted()
    }
  }

  func PumpExceptionPreservesDeferredRegistrationContract() bool {
    let firstCell = MotionFixtureCell{}
    let throwingCell = MotionFixtureCell{}
    let deferredCell = MotionFixtureCell{}
    firstCell.BindPump(pump)
    throwingCell.BindPump(pump)
    deferredCell.BindPump(pump)
    let first = firstCell.Animate(0.0)
    let throwing = throwingCell.Animate(0.0)
    let deferred = deferredCell.Animate(0.0)
    let deferredCounter = PumpCounter()
    let deferredSpec(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> {
      return PumpFixtureSimulation(deferredCounter, false)
    }
    var added = false
    let firstSimulation = PumpCallbackSimulation(() -> {
      if !added {
        added = true
        deferred.To(1.0, deferredSpec)
      }
    }, false)
    let throwingSimulation = ThrowingDoneSimulation()
    let firstSpec(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> firstSimulation
    let throwingSpec(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> throwingSimulation
    try {
      first.To(1.0, firstSpec)
      throwing.To(1.0, throwingSpec)
      let threw = throws(() -> pump.Sweep(0.1))
      if !threw || !added || firstSimulation.DoneCalls != 1
        || throwingSimulation.DoneCalls != 1 || deferredCounter.DoneCalls != 0 {
          return false
        }
      throwingSimulation.Throw = false
      pump.Sweep(0.1)
      return firstSimulation.DoneCalls == 2 && throwingSimulation.DoneCalls == 2
        && deferredCounter.DoneCalls == 1 && first.Running && throwing.Running
        && deferred.Running && pump.Active
    } finally {
      firstCell.DisposeMounted()
      throwingCell.DisposeMounted()
      deferredCell.DisposeMounted()
    }
  }

  func PumpDefersReentrantRegistrationContract() bool {
    let firstCell = MotionFixtureCell{}
    let secondCell = MotionFixtureCell{}
    firstCell.BindPump(pump)
    secondCell.BindPump(pump)
    let first = firstCell.Animate(0.0)
    let second = secondCell.Animate(0.0)
    let secondCounter = PumpCounter()
    let secondSpec(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> {
      return PumpFixtureSimulation(secondCounter, false)
    }
    var added = false
    let firstSimulation = PumpCallbackSimulation(() -> {
      if !added {
        added = true
        second.To(1.0, secondSpec)
      }
    }, false)
    let firstSpec(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> firstSimulation
    try {
      first.To(1.0, firstSpec)
      pump.Sweep(0.1)
      if !added || firstSimulation.DoneCalls != 1 || secondCounter.DoneCalls != 0 {
        return false
      }
      pump.Sweep(0.1)
      return secondCounter.DoneCalls == 1
    } finally {
      firstCell.DisposeMounted()
      secondCell.DisposeMounted()
    }
  }

  func PumpDeregisterStopsLaterParticleContract() bool {
    let firstCell = MotionFixtureCell{}
    let laterCell = MotionFixtureCell{}
    let thirdCell = MotionFixtureCell{}
    firstCell.BindPump(pump)
    laterCell.BindPump(pump)
    thirdCell.BindPump(pump)
    let first = firstCell.Animate(0.0)
    let later = laterCell.Animate(0.0)
    let third = thirdCell.Animate(0.0)
    let laterCounter = PumpCounter()
    let thirdCounter = PumpCounter()
    let laterSpec(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> {
      return PumpFixtureSimulation(laterCounter, false)
    }
    let thirdSpec(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> {
      return PumpFixtureSimulation(thirdCounter, false)
    }
    let firstSimulation = PumpCallbackSimulation(() -> {
      later.Set(0.0)
    }, false)
    let firstSpec(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> firstSimulation
    try {
      first.To(1.0, firstSpec)
      later.To(1.0, laterSpec)
      third.To(1.0, thirdSpec)
      pump.Sweep(0.1)
      if firstSimulation.DoneCalls != 1 || laterCounter.DoneCalls != 0 || thirdCounter.DoneCalls != 1 {
        return false
      }
      pump.Sweep(0.1)
      return laterCounter.DoneCalls == 0 && thirdCounter.DoneCalls == 2
    } finally {
      firstCell.DisposeMounted()
      laterCell.DisposeMounted()
      thirdCell.DisposeMounted()
    }
  }

  func PumpWakesOnlyOnFirstRegistrationContract() bool {
    var wakes = 0
    pump.Wake = func() {
      wakes++
    }
    let firstCell = MotionFixtureCell{}
    let secondCell = MotionFixtureCell{}
    firstCell.BindPump(pump)
    secondCell.BindPump(pump)
    let first = firstCell.Animate(0.0)
    let second = secondCell.Animate(0.0)
    try {
      first.To(1.0, clockEchoSpec)
      second.To(1.0, clockEchoSpec)
      if wakes != 1 {
        return false
      }
      first.Set(0.0)
      second.Set(0.0)
      if pump.Active {
        return false
      }
      first.To(1.0, clockEchoSpec)
      return wakes == 2
    } finally {
      firstCell.DisposeMounted()
      secondCell.DisposeMounted()
    }
  }

  func SetStopsAndAllowsReuseContract() bool {
    let cell = MotionFixtureCell{}
    cell.BindPump(pump)
    let anim = cell.Animate(0.0)
    try {
      anim.To(1.0, clockEchoSpec)
      pump.Sweep(0.1)
      anim.Set(7.0)
      if anim.Running || anim.Value != 7.0 {
        return false
      }
      anim.To(9.0, clockEchoSpec)
      pump.Sweep(0.1)
      return anim.Running
    } finally {
      cell.DisposeMounted()
    }
  }

  func CellDisposeContinuesAfterPositionFailureContract() bool {
    let cell = MotionFixtureCell{}
    cell.BindPump(pump)
    let first = cell.Animate(0.0)
    let second = cell.Animate(0.0)
    let firstSimulation = ThrowingPositionSimulation()
    let secondCounter = PumpCounter()
    let firstSpec(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> firstSimulation
    let secondSpec(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> PumpFixtureSimulation(secondCounter, false)
    first.To(1.0, firstSpec)
    second.To(1.0, secondSpec)
    var threw = false
    try {
      cell.DisposeMounted()
    } catch (error Exception) {
      threw = true
    }
    if !threw || firstSimulation.PositionCalls != 1 || first.Running || second.Running || pump.Active {
      return false
    }
    let reuseCell = MotionFixtureCell{}
    reuseCell.BindPump(pump)
    let reuse = reuseCell.Animate(0.0)
    let reuseCounter = PumpCounter()
    let reuseSpec(float64, float64, float64) -> Simulation = (from float64, to float64, velocity float64) -> PumpFixtureSimulation(reuseCounter, false)
    try {
      reuse.To(1.0, reuseSpec)
      pump.Sweep(0.1)
      return reuse.Running && reuseCounter.DoneCalls == 1 && pump.Active
    } finally {
      reuseCell.DisposeMounted()
    }
  }
}

internal class MotionFixtureCell : Cell {
}

internal class WindowSiblingParent : Cell {
  internal var First WindowSiblingThrowingCell?
  internal var Later WindowSiblingRetainedCell?

  override func Build() Blob -> Container() {
    Cell.Mount[WindowSiblingThrowingCell]("first", (child WindowSiblingThrowingCell) -> { First = child }),
    Cell.Mount[WindowSiblingRetainedCell]("later", (child WindowSiblingRetainedCell) -> { Later = child })
  }
}

internal class WindowSiblingThrowingCell : Cell {
  internal let Animation Anim[float64]

  init() {
    Animation = Animate(0.0)
  }

  override func Build() Blob -> Text { Content: "first" }
}

internal class WindowSiblingRetainedCell : Cell, IDisposable {
  shared { internal var Disposals int32 }
  internal let Animation Anim[float64]
  internal var Value int32

  init() {
    Animation = Animate(0.0)
  }

  func Dispose() {
    Disposals = Disposals + 1
  }

  override func Build() Blob -> Text { Content: "${Value}" }
}

internal class CountingMotionFixtureCell : Cell {
  internal let anim Anim[float64]
  internal var Builds int32

  init() {
    anim = Animate(0.0)
  }

  override func Build() Blob {
    Builds = Builds + 1
    return Container{}
  }
}

internal class SetDuringBuildFixtureCell : Cell {
  internal var anim Anim[float64]?

  init() {
    anim = Animate(0.0)
  }

  public override func Build() Blob {
    if let value = anim {
      value.Set(1.0)
    }
    return Container{}
  }
}

internal class SnapDuringBuildFixtureCell : Cell {
  internal var anim Anim[float64]?

  init() {
    anim = Animate(0.0)
  }

  public override func Build() Blob {
    if let value = anim {
      value.Snap(1.0)
    }
    return Container{}
  }
}

internal class ClockEchoSimulation : Simulation {
  public override func Position(elapsed float64) float64 -> elapsed

  public override func Velocity(elapsed float64) float64 -> elapsed

  public override func Done(elapsed float64) bool -> false
}
internal class ThrowingPositionSimulation : Simulation {
  internal var PositionCalls int32

  public override func Position(elapsed float64) float64 {
    PositionCalls = PositionCalls + 1
    throw InvalidOperationException("dispose position failed")
  }

  public override func Velocity(elapsed float64) float64 -> 0.0

  public override func Done(elapsed float64) bool -> false
}

internal func clockEchoSpec(from float64, to float64, velocity float64) Simulation -> ClockEchoSimulation()

internal class ConstantVelocitySimulation : Simulation {
  private let from float64
  private let velocity float64

  internal init(from float64, velocity float64) {
    this.from = from
    this.velocity = velocity
  }

  public override func Position(elapsed float64) float64 -> from + velocity * elapsed

  public override func Velocity(elapsed float64) float64 -> velocity

  public override func Done(elapsed float64) bool -> false
}

internal class RestsShortOfTargetSimulation : Simulation {
  private let restingAt float64

  internal init(startedFrom float64) {
    restingAt = startedFrom + 3.0
  }

  public override func Position(elapsed float64) float64 -> restingAt

  public override func Velocity(elapsed float64) float64 -> 0.0

  public override func Done(elapsed float64) bool -> true
}

internal func restsShortOfTargetSpec(from float64, to float64, velocity float64) Simulation -> RestsShortOfTargetSimulation(from)

internal func throwingMotionSpec(from float64, to float64, velocity float64) Simulation {
  throw InvalidOperationException("motion spec failed")
}

internal class CountingPositionSimulation : Simulation {
  internal var PositionCalls int32

  public override func Position(elapsed float64) float64 {
    PositionCalls = PositionCalls + 1
    return elapsed
  }

  public override func Velocity(elapsed float64) float64 -> 0.0

  public override func Done(elapsed float64) bool -> false
}

internal class PumpCounter {
  internal var DoneCalls int32
}

internal class ThrowingDoneSimulation : Simulation {
  internal var Throw bool
  internal var Complete bool
  internal var DoneCalls int32

  init() {
    Throw = true
  }

  public override func Position(elapsed float64) float64 -> elapsed

  public override func Velocity(elapsed float64) float64 -> 0.0

  public override func Done(elapsed float64) bool {
    DoneCalls = DoneCalls + 1
    if Throw {
      throw InvalidOperationException("tick failed")
    }
    return Complete
  }
}

internal class PumpCallbackSimulation : Simulation {
  private let callback Action
  private let done bool
  internal var DoneCalls int32

  internal init(callback Action, done bool) {
    this.callback = callback
    this.done = done
  }

  public override func Position(elapsed float64) float64 -> elapsed

  public override func Velocity(elapsed float64) float64 -> 0.0

  public override func Done(elapsed float64) bool {
    DoneCalls = DoneCalls + 1
    callback()
    return done
  }
}

internal class PumpFixtureSimulation : Simulation {
  private let counter PumpCounter
  private let done bool

  internal init(counter PumpCounter, done bool) {
    this.counter = counter
    this.done = done
  }

  public override func Position(elapsed float64) float64 -> elapsed

  public override func Velocity(elapsed float64) float64 -> 0.0

  public override func Done(elapsed float64) bool {
    counter.DoneCalls = counter.DoneCalls + 1
    return done
  }
}

internal func readFloatMotion(value float64, into []float64) {
}

internal func rejectInitialMotion(value float64, into []float64) {
  throw ArgumentException("initial value rejected")
}

internal func writeFloatMotion(dims []float64) float64 -> dims[0]

internal func throws(action Action) bool {
  try {
    action()
  } catch (error Exception) {
    return true
  }
  return false
}
