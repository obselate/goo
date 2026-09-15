package GooAsyncReadbackSmoke

import Goo
import System
import System.Collections.Generic

data struct PerformanceSmallAnimationStaticCardInput {
  internal var Index int32
  internal var Left float64
  internal var Top float64
  internal var Tint Color
  internal var Root PerformanceSmallAnimationRoot
}

data struct PerformanceSmallAnimationAnimatedCardInput {
  internal var Frame int32
  internal var Left float64
  internal var Top float64
  internal var Opacity float64
  internal var Root PerformanceSmallAnimationRoot
}

class PerformanceSmallAnimationRoot : Cell {
  shared {
    const StaticCardCount int32 = 200
    const AnimatedCardCount int32 = 1
    const GridColumns int32 = 20
    const GridRows int32 = 10
    const ViewportWidth int32 = 1280
    const ViewportHeight int32 = 720
    const CardWidth float64 = 64.0
    const CardHeight float64 = 72.0
    const AnimatedCardWidth float64 = 48.0
    const AnimatedCardHeight float64 = 48.0
    const FixedDeltaSeconds float64 = 0.016666666666666666
    const AnimationPeriodFrames int32 = 120
    const MinimumOpacity float64 = 0.35
    const MaximumOpacity float64 = 0.95
  }

  private let seed uint64
  private let staticInputs []PerformanceSmallAnimationStaticCardInput
  private let staticKeys []string
  private var animatedInput PerformanceSmallAnimationAnimatedCardInput
  private var staticMounted []bool
  private var staticMountedCount int32
  private var staticBuildCount int32
  private var animatedBuildCount int32
  private var animatedInitialBuildCount int32
  private var advanceCount int32

  prop LogicalCount int64 { get -> int64(StaticCardCount + AnimatedCardCount) }
  prop LogicalEdges int32 { get -> 0 }
  prop VisibleCount int32 { get -> StaticCardCount + AnimatedCardCount }
  prop MountedCount int32 { get -> StaticCardCount + AnimatedCardCount }
  prop MountedBound int32 { get -> StaticCardCount + AnimatedCardCount }
  prop Width int32 { get -> ViewportWidth }
  prop Height int32 { get -> ViewportHeight }
  prop MutationCount int32 { get -> AnimatedCardCount }
  internal prop StaticBuildCount int32{ get -> staticBuildCount }
  internal prop AnimatedBuildCount int32{ get -> animatedBuildCount }
  internal prop StaticMountedCount int32{ get -> staticMountedCount }
  internal prop CurrentLeft float64{ get -> animatedInput.Left }
  internal prop CurrentTop float64{ get -> animatedInput.Top }
  internal prop CurrentOpacity float64{ get -> animatedInput.Opacity }

  init(initialSeed uint64) {
    seed = initialSeed
    staticInputs = [StaticCardCount]PerformanceSmallAnimationStaticCardInput
    staticKeys = [StaticCardCount]string
    staticMounted = [StaticCardCount]bool
    var index int32 = 0
    while index < StaticCardCount {
      let row = index / GridColumns
      let column = index % GridColumns
      staticKeys[index] = "perf-small-animation-static-" + index.ToString()
      staticInputs[index] = PerformanceSmallAnimationStaticCardInput{
        Index: index,
        Left: float64(column) * CardWidth,
        Top: float64(row) * CardHeight,
        Tint: StaticTint(index),
        Root: this,
      }
      staticMounted[index] = false
      index = index + 1
    }
    animatedInput = PerformanceSmallAnimationAnimatedCardInput{
      Frame: 0,
      Left: 0.0,
      Top: 0.0,
      Opacity: MaximumOpacity,
      Root: this,
    }
    staticMountedCount = 0
    staticBuildCount = 0
    animatedBuildCount = 0
    animatedInitialBuildCount = 0
    advanceCount = 0
  }

  private func StaticTint(index int32) Color {
    let phase = int32((uint64(index) * 37uL + seed % 193uL) % 160uL)
    return Color.Rgb(24 + phase / 4, 42 + (index % 5) * 12, 92 + phase % 96)
  }

  private func TriangleWave(frame int32, offset int32) float64 {
    var phase = frame % AnimationPeriodFrames
    if phase < 0 {
      phase = phase + AnimationPeriodFrames
    }
    phase = phase + offset
    phase = phase % AnimationPeriodFrames
    let periodSeconds = float64(AnimationPeriodFrames) * FixedDeltaSeconds
    let halfPeriodSeconds = periodSeconds * 0.5
    let phaseSeconds = float64(phase) * FixedDeltaSeconds
    if phaseSeconds <= halfPeriodSeconds {
      return phaseSeconds / halfPeriodSeconds
    }
    return (periodSeconds - phaseSeconds) / halfPeriodSeconds
  }

  func Advance(frame int32) {
    let xWave = TriangleWave(frame, 0)
    let yWave = TriangleWave(frame, 30)
    let opacityWave = TriangleWave(frame, 60)
    let maxLeft = float64(ViewportWidth) - AnimatedCardWidth
    let maxTop = float64(ViewportHeight) - AnimatedCardHeight
    animatedInput = PerformanceSmallAnimationAnimatedCardInput{
      Frame: frame,
      Left: xWave * maxLeft,
      Top: yWave * maxTop,
      Opacity: MinimumOpacity + opacityWave * (MaximumOpacity - MinimumOpacity),
      Root: this,
    }
    advanceCount = advanceCount + 1
  }

  internal func RecordStaticBuild(index int32) {
    staticBuildCount = staticBuildCount + 1
    if index >= 0 && index < staticMounted.Length && !staticMounted[index] {
      staticMounted[index] = true
      staticMountedCount = staticMountedCount + 1
    }
  }

  internal func RecordAnimatedBuild() {
    animatedBuildCount = animatedBuildCount + 1
    if animatedInitialBuildCount == 0 {
      animatedInitialBuildCount = animatedBuildCount
    }
  }

  override func Build() Blob {
    let children = List[Blob](StaticCardCount + AnimatedCardCount)
    var index int32 = 0
    while index < StaticCardCount {
      children.Add(Cell.Mount[PerformanceSmallAnimationStaticCardInput,
        PerformanceSmallAnimationStaticCardCell](staticKeys[index], staticInputs[index]))
      index = index + 1
    }
    children.Add(Cell.Mount[PerformanceSmallAnimationAnimatedCardInput,
      PerformanceSmallAnimationAnimatedCardCell](
        "perf-small-animation-animated", animatedInput))
    return Container{
      Width: ViewportWidth,
      Height: ViewportHeight,
      Position: PositionType.Relative,
      OverflowX: Overflow.Hidden,
      OverflowY: Overflow.Hidden,
      BackgroundColor: Color.Rgb(8, 13, 22),
      Children: children,
    }
  }

  func Invariant() bool {
    let positionBounded = animatedInput.Left >= 0.0
      && animatedInput.Left <= float64(ViewportWidth) - AnimatedCardWidth
      && animatedInput.Top >= 0.0
      && animatedInput.Top <= float64(ViewportHeight) - AnimatedCardHeight
    let opacityBounded = animatedInput.Opacity >= MinimumOpacity
      && animatedInput.Opacity <= MaximumOpacity
    let preMount = staticMountedCount == 0 && staticBuildCount == 0
      && animatedBuildCount == 0
    if preMount {
      return positionBounded && opacityBounded
    }
    return staticMountedCount == StaticCardCount
      && staticBuildCount == StaticCardCount
      && animatedBuildCount >= animatedInitialBuildCount
      && (advanceCount == 0 || animatedBuildCount > animatedInitialBuildCount)
      && positionBounded
      && opacityBounded
  }
}

open class PerformanceSmallAnimationStaticCardCell : Cell[PerformanceSmallAnimationStaticCardInput] {
  protected override func Build(input PerformanceSmallAnimationStaticCardInput) Blob {
    input.Root.RecordStaticBuild(input.Index)
    return Container{
      Position: PositionType.Absolute,
      Left: input.Left,
      Top: input.Top,
      Width: PerformanceSmallAnimationRoot.CardWidth,
      Height: PerformanceSmallAnimationRoot.CardHeight,
      BorderRadius: 4.0,
      BackgroundColor: input.Tint,
    }
  }
}

open class PerformanceSmallAnimationAnimatedCardCell : Cell[PerformanceSmallAnimationAnimatedCardInput] {
  protected override func Build(input PerformanceSmallAnimationAnimatedCardInput) Blob {
    input.Root.RecordAnimatedBuild()
    return Container{
      Position: PositionType.Absolute,
      Left: input.Left,
      Top: input.Top,
      Width: PerformanceSmallAnimationRoot.AnimatedCardWidth,
      Height: PerformanceSmallAnimationRoot.AnimatedCardHeight,
      BorderRadius: 8.0,
      Opacity: input.Opacity,
      BackgroundColor: Color.Rgb(248, 188, 62),
    }
  }
}
