package Goo

import System
import System.Reflection

internal class PaintBindingFixtures {
  func PaintSlotsTickWithoutBuildOrLayoutContract() bool {
    for lane in 0 ... 2 {
      for field in 0 ... 4 {
        for repeat in 0 ... 2 {
          let cell = PaintSlotCell(lane, field)
          let window = Window{ Root: cell, Width: 320, Height: 240 }
          let sink = PaintSlotProfile()
          let profiler = cast[FrameProfiler](typeof(Window).GetField("profiler", BindingFlags.Instance | BindingFlags.NonPublic)!!.GetValue(window))
          profiler.Sink = sink
          let compiler = VulkanSceneCompiler(64)
          try {
            window.UpdateTree()
            paint(window, compiler)
            cell.Start()
            window.UpdateTree(2.0)
            paint(window, compiler)
            cell.Number.Snap(1.0)
            cell.Colour.Snap(Color.Black)
            cell.Translation.Snap(Point{})
            cell.Start()
            window.UpdateTree()
            paint(window, compiler)
            let builds = cell.Builds
            let layouts = sink.Layouts
            var paints = 0
            let before = GC.GetAllocatedBytesForCurrentThread()
            for tick in 0 ... 120 {
              window.UpdateTree(1.0 / 64.0)
              if paint(window, compiler) { paints++ }
            }
            let bytes = GC.GetAllocatedBytesForCurrentThread() - before
            let n = cell.Handle.AttachedNode()!!
            let reached = switch field {
              case 0: Math.Abs(n.Opacity - 0.25F) < 0.00001F
              case 1: n.BackgroundColor.G == 1.0F && n.BackgroundColor.R == 0.0F
              case 2: Transforming.TranslateX(n).Value == 100.0F && Transforming.TranslateY(n).Value == 50.0F
              case _: Transforming.Scale(n) == 2.0F
            }
            if !reached || sink.Layouts != layouts || paints != 120 { return false }
            if lane == 1 && cell.Builds != builds { return false }
            if repeat == 1 {
              Console.WriteLine("paint-slot lane=${lane} field=${field} ticks=120 builds=${cell.Builds - builds} layouts=${sink.Layouts - layouts} paints=${paints} bytes=${bytes}")
            }
            if repeat == 1 && lane == 1 && field < 2 && bytes != 0 { return false }
          } finally {
            window.Close()
          }
        }
      }
    }
    return true
  }

  func PaintSlotsPrecedenceAndRemovalContract() bool {
    let cell = PaintSlotCell(1, 0)
    cell.Duration = 1000.0
    let window = Window{ Root: cell, Width: 320, Height: 240 }
    try {
      window.UpdateTree()
      let n = cell.Handle.AttachedNode()!!
      cell.Number.Set(0.4)
      window.UpdateTree()
      let binding = n.PaintBindings!![0]
      cell.Declared = 0.2
      cell.Rebuild()
      window.UpdateTree()
      if Math.Abs(n.Opacity - 0.4F) > 0.00001F || n.PaintBindings!![0] != binding
        || n.Transitions?.Count > 0 { return false }
      let other = cell.AnimateValue(0.8)
      cell.Replacement = other
      cell.Rebuild()
      window.UpdateTree()
      if Math.Abs(n.Opacity - 0.8F) > 0.00001F { return false }
      cell.Number.Set(0.1)
      window.UpdateTree()
      if Math.Abs(n.Opacity - 0.8F) > 0.00001F { return false }
      cell.Bound = false
      cell.Rebuild()
      window.UpdateTree()
      if Math.Abs(n.Opacity - 0.8F) > 0.00001F || n.PaintBindings != nil { return false }
      window.UpdateTree(0.5)
      if Math.Abs(n.Opacity - 0.5F) > 0.00001F { return false }
      window.UpdateTree(0.5)
      if Math.Abs(n.Opacity - 0.2F) > 0.00001F { return false }
      cell.Duration = 0.0
      cell.Bound = true
      cell.Rebuild()
      window.UpdateTree()
      cell.Bound = false
      cell.Rebuild()
      window.UpdateTree()
      return Math.Abs(n.Opacity - 0.2F) < 0.00001F
    } finally {
      window.Close()
    }
  }

  func PaintSlotsWakeDisposeAndRetireContract() bool {
    let cell = PaintSlotCell(1, 0)
    let window = Window{ Root: cell, Width: 320, Height: 240 }
    var wakes = 0
    try {
      window.UpdateTree()
      let n = cell.Handle.AttachedNode()!!
      let wake = window.PaintMotionPump.PaintWake
      window.PaintMotionPump.PaintWake = () -> {
        wakes++
        wake?.Invoke()
      }
      cell.Number.Set(0.4)
      if wakes != 1 || cast[int32](typeof(Window).GetField("pendingRetainedInvalidation",
        BindingFlags.Instance | BindingFlags.NonPublic)!!.GetValue(window)) != 1 { return false }
      window.UpdateTree()
      if Math.Abs(n.Opacity - 0.4F) > 0.00001F || cell.Builds != 1 { return false }
      cell.Number.Snap(0.3)
      if wakes != 2 { return false }
      window.UpdateTree()
      cell.Number.To(0.8, Motion.Tween(1000.0))
      window.PaintMotionPump.ReducedMotion = true
      window.UpdateTree()
      if cell.Number.Running || Math.Abs(n.Opacity - 0.8F) > 0.00001F { return false }
      cell.DisposeMounted()
      window.UpdateTree()
      if n.PaintBindings != nil || n.Opacity != 1.0F { return false }
    } finally {
      window.Close()
    }
    let source = MotionFixtureCell{}
    let target = PaintSlotCell(1, 0)
    let host = Window{ Root: target, Width: 320, Height: 240 }
    try {
      source.BindPump(host.PaintMotionPump)
      let anim = source.AnimateValue(0.5)
      target.Replacement = anim
      host.UpdateTree()
      let retired = target.Handle.AttachedNode()!!
      NodeLifecycle.DisposeTree(retired)
      if retired.PaintBindings != nil { return false }
      var retiredWakes = 0
      host.PaintMotionPump.PaintWake = () -> { retiredWakes++ }
      anim.Set(0.7)
      host.UpdateTree()
      return retiredWakes == 0 && retired.Opacity == 0.5F
    } finally {
      source.DisposeMounted()
      host.Close()
    }
  }

  func PaintSlotsRejectOtherWindowsAndPropagateColorContract() bool {
    let source = PaintSlotCell(1, 0)
    let first = Window{ Root: source, Width: 320, Height: 240 }
    let target = PaintSlotCell(1, 0)
    let second = Window{ Root: target, Width: 320, Height: 240 }
    try {
      first.UpdateTree()
      target.Replacement = source.Number
      var rejected = false
      try { second.UpdateTree() } catch (_ InvalidOperationException) { rejected = true }
      if !rejected { return false }
    } finally {
      second.Close()
      first.Close()
    }
    let cell = PaintSlotCell(1, 1)
    cell.InheritColor = true
    let window = Window{ Root: cell, Width: 320, Height: 240 }
    try {
      window.UpdateTree()
      cell.Colour.Set(Color.White)
      window.UpdateTree()
      let n = cell.Handle.AttachedNode()!!
      let style = Style{ ColorAnim: cell.Colour }
      if style.TryGetTextStyle(out var properties) { return false }
      return n.Color == Color.White && n.Children[0].Color == Color.White
        && n.Children[1].Color == Color.Black && cell.Builds == 1
    } finally {
      window.Close()
    }
  }

  func PaintSlotsAcceptCustomSimulationContract() bool {
    let cell = PaintSlotCell(1, 0)
    let window = Window{ Root: cell, Width: 320, Height: 240 }
    try {
      window.UpdateTree()
      cell.Number.To(0.25, (from float64, to float64, velocity float64) -> PaintSlotSpring(from, to, velocity))
      for tick in 0 ... 120 { window.UpdateTree(1.0 / 64.0) }
      return cell.Builds == 1 && cell.Number.Value == 0.25
        && cell.Handle.AttachedNode()!!.Opacity == 0.25F
    } finally {
      window.Close()
    }
  }

  private func paint(window Window, compiler VulkanSceneCompiler) bool {
    if !window.RenderPending() { return false }
    compiler.Compile(window.Tree!!, Color.White, 320.0F, 240.0F)
    window.markFrameRendered()
    return true
  }
}

internal class PaintSlotCell : Cell {
  internal let Lane int32
  internal let Field int32
  internal let Handle ElementHandle = ElementHandle()
  internal let Number Anim[float64]
  internal let Colour Anim[Color]
  internal let Translation Anim[Point]
  internal var Replacement Anim[float64]?
  internal var Builds int32
  internal var Bound bool = true
  internal var Declared float64 = 1.0
  internal var Duration float64
  internal var InheritColor bool

  internal init(lane int32, field int32) {
    Lane = lane
    Field = field
    Number = if lane == 0 { Animate(1.0) } else { AnimateValue(1.0) }
    Colour = if lane == 0 { Animate(Color.Black) } else { AnimateValue(Color.Black) }
    Translation = if lane == 0 { Animate(Point{}) } else { AnimateValue(Point{}) }
  }

  internal func Start() {
    let tween = Motion.Tween(1875.0)
    switch Field {
      case 0 { Number.To(0.25, tween) }
      case 1 { Colour.To(Color.FromNormalized(0.0F, 1.0F, 0.0F, 1.0F), tween) }
      case 2 { Translation.To(Point{ X: 100.0, Y: 50.0 }, tween) }
      case _ { Number.To(2.0, tween) }
    }
  }

  override func Build() Blob {
    Builds++
    let bound = Lane == 1 && Bound
    return Container{
      Width: 320, Height: 240,
      Container{
        Handle: Handle, Width: 40, Height: 30,
        Opacity: if Lane == 0 && Field == 0 { Number.Value } else { Declared },
        OpacityAnim: if bound && Field == 0 { Replacement ?? Number } else { nil },
        BackgroundColor: if Lane == 0 && Field == 1 { Colour.Value } else { Color.Black },
        BackgroundColorAnim: if bound && Field == 1 { Colour } else { nil },
        ColorAnim: if InheritColor { Colour } else { nil },
        Transform: PanelTransform{
          TranslateX: if Lane == 0 && Field == 2 { Translation.Value.X } else { 0.0 },
          TranslateY: if Lane == 0 && Field == 2 { Translation.Value.Y } else { 0.0 },
          Scale: if Lane == 0 && Field == 3 { Number.Value } else { 1.0 },
        },
        TranslateAnim: if bound && Field == 2 { Translation } else { nil },
        ScaleAnim: if bound && Field == 3 { Number } else { nil },
        TransitionMs: Duration, TransitionEasing: Easing.Linear,
        Container{}, Container{ Color: Color.Black },
      },
    }
  }
}

internal class PaintSlotProfile : FrameProfileSink {
  internal var Layouts int32
  public prop Active bool { get -> true }
  public func BeginPump(recorder FrameRecorder, context FrameTraceContext) { }
  public func Describe() FrameTraceRecord -> FrameTraceRecord{}
  public func Sample(recorder FrameRecorder, force bool, includeShared bool) { }
  public func Record(stage FrameProfileStage, start FrameProfilePoint, end FrameProfilePoint, result int32) {
    if stage == FrameProfileStage.Layout { Layouts++ }
  }
  public func RecordDerived(stage FrameProfileStage, ticks int64, bytes int64) { }
}

internal class PaintSlotSpring : Simulation {
  private let from float64
  private let to float64
  private let velocity float64

  internal init(from float64, to float64, velocity float64) {
    this.from = from
    this.to = to
    this.velocity = velocity
  }

  public override func Position(elapsed float64) float64 -> if Done(elapsed) { to }
    else { to + ((from - to) * (1.0 + 12.0 * elapsed) + velocity * elapsed) * Math.Exp(-12.0 * elapsed) }
  public override func Velocity(elapsed float64) float64 -> if Done(elapsed) { 0.0 }
    else { (velocity - 12.0 * ((from - to) * 12.0 + velocity) * elapsed) * Math.Exp(-12.0 * elapsed) }
  public override func Done(elapsed float64) bool -> elapsed >= 1.875
}
