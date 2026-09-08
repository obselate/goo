package GooGallery

import System
import System.Collections.Generic
import System.Numerics
import Goo

class MotionChapter : Cell {
  /// Gets or sets the pre-generated mathematical vector and image assets.
  public var Assets GalleryMathAssets?
  /// Gets or sets the compiled shader program suite.
  public var Programs GalleryShaderPrograms?
  /// Gets or sets whether this chapter uses compact single-column sizing.
  public var Compact bool
  internal prop Active bool{
    get -> active
    set {
      if active == value {
        return
      }
      active = value
      updateMotionActivity()
      Rebuild()
    }
  }
  internal prop Showcase int32{
    get -> showcase
    set {
      if showcase == value {
        return
      }
      showcase = value
      updateMotionActivity()
      Rebuild()
    }
  }

  private var active bool
  private var showcase int32

  // --- Exhibit 0: Kinetic Physics & UI Dynamics ---
  private let physicsPuckPos Anim[Point]
  private let physicsPuckScale Anim[float64]
  private let physicsPuckColor Anim[Color]
  private var activeProfile int32
  private var activeSpeed int32
  private var isPointerDown bool
  private var pointerDownPos Point
  private var dragInitiated bool
  private var puckDragging bool
  private var lastMovePoint Point
  private var lastMoveTick int64
  private var flingVx float64
  private var flingVy float64
  private var targetAnchorIndex int32
  private var lastTrackedPos Point
  private var lastTrackedTick int64
  private var currentVx float64
  private var currentVy float64
  private var currentSpeed float64
  private let arenaHandle ElementHandle

  // Companion UI controls in Exhibit 0
  private var switchOn bool
  private let switchThumbX Anim[float64]
  private let switchTrackColor Anim[Color]
  private let switchScale Anim[float64]

  private var selectedSegment int32
  private let segmentPillX Anim[float64]

  private var impulseStep int32
  private let impulseScale Anim[float64]

  // --- Exhibit 1: UI Component Gallery ---
  private let compSliderTrackHandle ElementHandle
  private var sliderDragging bool
  private var compCategory int32
  private var inputHandleText string
  private var searchFilterText string
  private var stepperCount int32
  private var switchAutosave bool
  private var switchHardware bool
  private var switchTelemetry bool
  private let switchAutosaveThumbX Anim[float64]
  private let switchAutosaveTrackColor Anim[Color]
  private let switchHardwareThumbX Anim[float64]
  private let switchHardwareTrackColor Anim[Color]
  private let switchTelemetryThumbX Anim[float64]
  private let switchTelemetryTrackColor Anim[Color]
  private var checkDigest bool
  private var check2Fa bool
  private var selectedRadioTier int32
  private var selectedViewMode int32
  private var sliderValue float64
  private var progressValue float64
  private var isFollowingUser bool
  private var showAlertBanner bool
  private var isAccordionOpen bool
  private var feedbackToastText string

  public init() {
    Compact = false
    Assets = nil
    Programs = nil
    active = false
    showcase = 0

    // Exhibit 0
    arenaHandle = ElementHandle{}
    physicsPuckPos = Animate(Point{ X: 380.0, Y: 298.0 })
    physicsPuckScale = Animate(1.0)
    physicsPuckColor = Animate(GalleryTheme.Accent)
    activeProfile = 0
    activeSpeed = 2
    isPointerDown = false
    pointerDownPos = Point{ X: 380.0, Y: 298.0 }
    dragInitiated = false
    puckDragging = false
    lastMovePoint = Point{ X: 380.0, Y: 298.0 }
    lastMoveTick = 0
    flingVx = 0.0
    flingVy = 0.0
    targetAnchorIndex = 2
    lastTrackedPos = Point{ X: 380.0, Y: 298.0 }
    lastTrackedTick = Environment.TickCount64
    currentVx = 0.0
    currentVy = 0.0
    currentSpeed = 0.0

    switchOn = false
    switchThumbX = Animate(3.0)
    switchTrackColor = Animate(Color.Rgb(39, 39, 42))
    switchScale = Animate(1.0)

    selectedSegment = 0
    segmentPillX = Animate(0.0)

    impulseStep = 0
    impulseScale = Animate(1.0)

    // Exhibit 1: UI Component Gallery
    compSliderTrackHandle = ElementHandle{}
    sliderDragging = false
    compCategory = 0
    inputHandleText = "@goo_developer"
    searchFilterText = "Vulkan Pipeline"
    stepperCount = 4
    switchAutosave = true
    switchHardware = true
    switchTelemetry = false
    switchAutosaveThumbX = Animate(23.0)
    switchAutosaveTrackColor = Animate(GalleryTheme.Accent)
    switchHardwareThumbX = Animate(23.0)
    switchHardwareTrackColor = Animate(GalleryTheme.Accent)
    switchTelemetryThumbX = Animate(3.0)
    switchTelemetryTrackColor = Animate(Color.Rgb(39, 39, 42))
    checkDigest = true
    check2Fa = true
    selectedRadioTier = 1
    selectedViewMode = 0
    sliderValue = 75.0
    progressValue = 68.0
    isFollowingUser = false
    showAlertBanner = true
    isAccordionOpen = false
    feedbackToastText = "Ready"
  }

  private func updateMotionActivity() {
    if active {
      if showcase == 0 {
        applySpeed(activeSpeed)
      } else {
        Motion.TimeScale = 1.0
      }
    } else {
      Motion.TimeScale = 1.0
      physicsPuckPos.Set(physicsPuckPos.Value)
      physicsPuckScale.Set(physicsPuckScale.Value)
    }
  }

  private func applySpeed(index int32) {
    activeSpeed = index
    let speed = switch index {
      case 0: 0.25
      case 1: 0.50
      case 2: 1.00
      default: 1.50
    }
    Motion.TimeScale = speed
    Rebuild()
  }

  private func profileColor(profile int32) Color -> switch profile {
    case 0: Color.Rgb(99, 102, 241)
    case 1: Color.Rgb(87, 177, 188)
    case 2: Color.Rgb(226, 100, 98)
    default: Color.Rgb(251, 215, 116)
  }

  private func currentSpringSpec(start float64, target float64, velocity float64) Simulation -> switch activeProfile {
    case 0: GalleryBouncySpringSpec(start, target, velocity)
    case 1: GallerySnappySpringSpec(start, target, velocity)
    case 2: GalleryViscousSpringSpec(start, target, velocity)
    default: GalleryStiffSpringSpec(start, target, velocity)
  }

  private func getArenaSize()(float64, float64) {
    let box = arenaHandle.BorderBox
    let w = if box.Width > 50.0 { box.Width } else { if Compact { 400.0 } else { 760.0 } }
    let h = if box.Height > 50.0 { box.Height } else { if Compact { 320.0 } else { 620.0 } }
    return (w, h)
  }

  private func anchorPoint(index int32) Point {
    let (w, h) = getArenaSize()
    let leftPct = switch index {
      case 0: 0.14
      case 1: 0.86
      case 2: 0.50
      case 3: 0.14
      default: 0.86
    }
    let topPct = switch index {
      case 0: 0.18
      case 1: 0.18
      case 2: 0.48
      case 3: 0.78
      default: 0.78
    }
    return Point{ X: w * leftPct, Y: h * topPct }
  }

  private func nearestAnchor(p Point) Point {
    var bestIndex = 2
    var bestDist = Double.MaxValue
    var i = 0
    while i < 5 {
      let a = anchorPoint(i)
      let dx = a.X - p.X
      let dy = a.Y - p.Y
      let dist = dx * dx + dy * dy
      if dist < bestDist {
        bestDist = dist
        bestIndex = i
      }
      i = i + 1
    }
    targetAnchorIndex = bestIndex
    return anchorPoint(bestIndex)
  }

  private func clampArenaPoint(p Point) Point {
    let (w, h) = getArenaSize()
    let maxX = Math.Max(w - 28.0, 32.0)
    let maxY = Math.Max(h - 40.0, 32.0)
    return Point{
      X: Math.Clamp(p.X, 28.0, maxX),
      Y: Math.Clamp(p.Y, 28.0, maxY),
    }
  }

  private func movePuckToAnchor(index int32) {
    targetAnchorIndex = index
    let target = anchorPoint(index)
    physicsPuckPos.To(target, currentSpringSpec)
    physicsPuckScale.To(1.14, GallerySnappySpringSpec)
    Rebuild()
  }

  private func setProfile(profile int32) {
    activeProfile = profile
    physicsPuckColor.To(profileColor(profile), GallerySnappySpringSpec)
    let target = if targetAnchorIndex >= 0 { anchorPoint(targetAnchorIndex) } else { nearestAnchor(physicsPuckPos.Value) }
    physicsPuckPos.To(target, currentSpringSpec)
    Rebuild()
  }

  private func toggleSwitch() {
    switchOn = !switchOn
    let targetX = if switchOn { 25.0 } else { 3.0 }
    let targetColor = if switchOn { GalleryTheme.Accent } else { Color.Rgb(39, 39, 42) }
    switchThumbX.To(targetX, GalleryBouncySpringSpec)
    switchTrackColor.To(targetColor, GallerySnappySpringSpec)
    switchScale.To(1.22, GalleryBouncySpringSpec)
    Rebuild()
  }

  private func selectSegment(index int32) {
    selectedSegment = index
    let targetX = float64(index) * 72.0
    segmentPillX.To(targetX, GalleryBouncySpringSpec)
    Rebuild()
  }

  private func testOscillation() {
    let current = physicsPuckPos.Value
    let (w, _) = getArenaSize()
    let offset = if current.X < w * 0.5 { 80.0 } else { -80.0 }
    let stepTarget = clampArenaPoint(Point{ X: current.X + offset, Y: current.Y })
    physicsPuckPos.To(stepTarget, currentSpringSpec)
    Rebuild()
  }

  private func fireImpulseDirection(dx float64, dy float64) {
    impulseScale.To(0.85, GallerySnappySpringSpec)
    let current = physicsPuckPos.Value
    let (w, h) = getArenaSize()
    let target = clampArenaPoint(Point{
      X: current.X + dx * (w * 0.28),
      Y: current.Y + dy * (h * 0.28),
    })
    targetAnchorIndex = -1
    let vx = dx * 650.0
    let vy = dy * 650.0
    physicsPuckPos.To(target, MotionVelocity.Components(vx, vy), currentSpringSpec)
    Rebuild()
  }

  private func triggerImpulse() {
    impulseStep = (impulseStep + 1) % 4
    let (dx, dy) = switch impulseStep {
      case 0: (1.0, -1.0)
      case 1: (-1.0, 1.0)
      case 2: (-1.0, -1.0)
      default: (1.0, 1.0)
    }
    fireImpulseDirection(dx, dy)
  }

  private func handleArenaPointerDown(e PointerEvent) {
    e.Capture()
    e.PreventDefault()
    isPointerDown = true
    pointerDownPos = e.Position
    dragInitiated = false
    lastMovePoint = e.Position
    lastMoveTick = Environment.TickCount64
    flingVx = 0.0
    flingVy = 0.0
  }

  private func handleArenaPointerMove(e PointerEvent) {
    if !isPointerDown {
      return
    }
    let dx = e.Position.X - pointerDownPos.X
    let dy = e.Position.Y - pointerDownPos.Y
    if !dragInitiated {
      if dx * dx + dy * dy > 36.0 {
        dragInitiated = true
        puckDragging = true
        targetAnchorIndex = -1
        physicsPuckScale.To(1.18, GallerySnappySpringSpec)
      }
    }
    if dragInitiated {
      let now = Environment.TickCount64
      let dt = Math.Max(float64(now - lastMoveTick) / 1000.0, 0.004)
      let rawVx = (e.Position.X - lastMovePoint.X) / dt
      let rawVy = (e.Position.Y - lastMovePoint.Y) / dt
      flingVx = rawVx * 0.7 + flingVx * 0.3
      flingVy = rawVy * 0.7 + flingVy * 0.3
      System.IO.File.AppendAllText("/tmp/goo_fling.log", "MOVE: pos=" + e.Position.X.ToString("F1") + "," + e.Position.Y.ToString("F1") + " win=" + e.WindowPosition.X.ToString("F1") + "," + e.WindowPosition.Y.ToString("F1") + " raw=" + rawVx.ToString("F1") + "," + rawVy.ToString("F1") + " fling=" + flingVx.ToString("F1") + "," + flingVy.ToString("F1") + "\n")
      lastMovePoint = e.Position
      lastMoveTick = now
      physicsPuckPos.Set(clampArenaPoint(e.Position))
      Rebuild()
    }
  }

  private func handleArenaPointerUp(e PointerEvent) {
    if !isPointerDown {
      return
    }
    e.ReleaseCapture()
    isPointerDown = false

    if !dragInitiated {
      // Single click --> smoothly goes to the exact clicked spot!
      targetAnchorIndex = -1
      let target = clampArenaPoint(e.Position)
      System.IO.File.AppendAllText("/tmp/goo_fling.log", "CLICK: pos=" + e.Position.X.ToString("F1") + "," + e.Position.Y.ToString("F1") + " target=" + target.X.ToString("F1") + "," + target.Y.ToString("F1") + "\n")
      physicsPuckPos.To(target, currentSpringSpec)
      physicsPuckScale.To(1.0, GalleryBouncySpringSpec)
      Rebuild()
      return
    }

    // Hold click and throw around with fling momentum!
    puckDragging = false
    dragInitiated = false
    physicsPuckScale.To(1.0, GalleryBouncySpringSpec)

    let now = Environment.TickCount64
    let elapsedSinceMove = now - lastMoveTick
    if elapsedSinceMove > 50 {
      flingVx = 0.0
      flingVy = 0.0
    }

    let speed = Math.Sqrt(flingVx * flingVx + flingVy * flingVy)
    if speed > 140.0 {
      let current = physicsPuckPos.Value
      let projected = clampArenaPoint(Point{
        X: current.X + flingVx * 0.22,
        Y: current.Y + flingVy * 0.22,
      })
      System.IO.File.AppendAllText("/tmp/goo_fling.log", "FLING: speed=" + speed.ToString("F1") + " fling=" + flingVx.ToString("F1") + "," + flingVy.ToString("F1") + " curr=" + current.X.ToString("F1") + "," + current.Y.ToString("F1") + " proj=" + projected.X.ToString("F1") + "," + projected.Y.ToString("F1") + " dt=" + elapsedSinceMove.ToString() + "\n")
      physicsPuckPos.To(projected, MotionVelocity.Components(flingVx, flingVy), currentSpringSpec)
    } else {
      System.IO.File.AppendAllText("/tmp/goo_fling.log", "SLOW_DROP: speed=" + speed.ToString("F1") + " dt=" + elapsedSinceMove.ToString() + "\n")
      var snapped = false
      var i = 0
      while i < 5 {
        let a = anchorPoint(i)
        let dx = a.X - physicsPuckPos.Value.X
        let dy = a.Y - physicsPuckPos.Value.Y
        if dx * dx + dy * dy < 36.0 * 36.0 {
          targetAnchorIndex = i
          physicsPuckPos.To(a, currentSpringSpec)
          snapped = true
          break
        }
        i = i + 1
      }
      if !snapped {
        targetAnchorIndex = -1
        physicsPuckPos.To(physicsPuckPos.Value, currentSpringSpec)
      }
    }
    flingVx = 0.0
    flingVy = 0.0
    Rebuild()
  }

  private func updateTelemetry() {
    let now = Environment.TickCount64
    let dt = float64(now - lastTrackedTick) / 1000.0
    if dt > 0.005 && dt < 0.25 {
      currentVx = (physicsPuckPos.Value.X - lastTrackedPos.X) / dt
      currentVy = (physicsPuckPos.Value.Y - lastTrackedPos.Y) / dt
      currentSpeed = Math.Sqrt(currentVx * currentVx + currentVy * currentVy)
    } else if !physicsPuckPos.Running && !puckDragging {
      currentVx = 0.0
      currentVy = 0.0
      currentSpeed = 0.0
    }
    lastTrackedPos = physicsPuckPos.Value
    lastTrackedTick = now
  }

  private func actionBtn(label string, isAct bool, onClick Action) Button -> Button {
    PaddingLeft: 8,
    PaddingRight: 8,
    Height: 24,
    BackgroundColor: if isAct { GalleryTheme.Accent } else { GalleryTheme.SurfaceRaised },
    BorderWidth: 1,
    BorderColor: if isAct { GalleryTheme.AccentStrong } else { GalleryTheme.Border },
    BorderRadius: 4,
    Cursor: Cursor.Pointer,
    Focusable: true,
    TransitionMs: 100.0,
    Hover: Style{
      BackgroundColor: if isAct { GalleryTheme.Accent } else { Color.Rgb(36, 36, 42) },
      BorderColor: if isAct { GalleryTheme.AccentStrong } else { GalleryTheme.BorderStrong },
    },
    Active: Style{
      Transform: PanelTransform{ Scale: 0.96 },
    },
    OnClick: onClick,
    Children: {
      Text{
        Content: label,
        FontSize: 11,
        FontWeight: if isAct { 700 } else { 500 },
        Color: if isAct { Color.Rgb(255, 255, 255) } else { GalleryTheme.Ink },
      },
    },
  }

  private func puckBlob() Blob {
    let p = physicsPuckPos.Value
    let scale = physicsPuckScale.Value
    let color = physicsPuckColor.Value
    return Container{
      Key: "physics-puck",
      Position: PositionType.Absolute,
      Left: p.X,
      Top: p.Y,
      Width: 48,
      Height: 48,
      BorderRadius: 24,
      BorderWidth: 2,
      BorderColor: color,
      BackgroundColor: Color.FromNormalized(
        float32(color.R) / 255.0F,
        float32(color.G) / 255.0F,
        float32(color.B) / 255.0F,
        0.28F),
      Transform: PanelTransform{ TranslateX: -24.0, TranslateY: -24.0, Scale: scale },
      AlignItems: AlignItems.Center,
      JustifyContent: JustifyContent.Center,
      Cursor: Cursor.Move,
      Children: {
        Container{
          Width: 16,
          Height: 16,
          BorderRadius: 8,
          BackgroundColor: color,
        },
      },
    }
  }

  private func anchorBlob(index int32, label string) Blob {
    let isTarget = targetAnchorIndex == index
    let leftPct = switch index {
      case 0: 14.0
      case 1: 86.0
      case 2: 50.0
      case 3: 14.0
      default: 86.0
    }
    let topPct = switch index {
      case 0: 18.0
      case 1: 18.0
      case 2: 48.0
      case 3: 78.0
      default: 78.0
    }
    return Container{
      Key: "anchor-" + index.ToString(),
      Position: PositionType.Absolute,
      Left: Length.Percent(leftPct),
      Top: Length.Percent(topPct),
      Width: 32,
      Height: 32,
      BorderRadius: 16,
      BorderWidth: 1,
      BorderColor: if isTarget { GalleryTheme.Accent } else { Color.Rgb(50, 50, 56) },
      BackgroundColor: if isTarget { Color.FromNormalized(0.39F, 0.40F, 0.95F, 0.22F) } else { Color.FromNormalized(0.12F, 0.12F, 0.15F, 0.60F) },
      Transform: PanelTransform{ TranslateX: -16.0, TranslateY: -16.0 },
      AlignItems: AlignItems.Center,
      JustifyContent: JustifyContent.Center,
      Cursor: Cursor.Pointer,
      Focusable: true,
      TransitionMs: 120.0,
      TransitionProperties: []TransitionProperty{
        TransitionProperty.Transform,
        TransitionProperty.BorderColor,
        TransitionProperty.BackgroundColor,
      },
      Hover: Style{
        BorderColor: GalleryTheme.AccentStrong,
        Transform: PanelTransform{ TranslateX: -16.0, TranslateY: -16.0, Scale: 1.12 },
      },
      OnPointerDown: func(e PointerEvent) {
        e.StopPropagation()
        e.PreventDefault()
        movePuckToAnchor(index)
      },
      OnClick: () -> movePuckToAnchor(index),
      Children: {
        Text{
          Content: label,
          FontSize: 9,
          FontWeight: 700,
          Color: if isTarget { GalleryTheme.AccentStrong } else { GalleryTheme.InkSubtle },
        },
      },
    }
  }

  private func telemetryBar() Container {
    let p = physicsPuckPos.Value
    let isRunning = physicsPuckPos.Running || puckDragging
    return Container{
      Width: Length.Percent(100),
      Height: 30,
      PaddingLeft: 12,
      PaddingRight: 12,
      BackgroundColor: Color.FromNormalized(0.06F, 0.07F, 0.09F, 0.90F),
      BorderTopWidth: 1,
      BorderColor: GalleryTheme.Border,
      FlexDirection: FlexDirection.Row,
      AlignItems: AlignItems.Center,
      JustifyContent: JustifyContent.SpaceBetween,
      Cursor: Cursor.Default,
      OnPointerDown: func(e PointerEvent) {
        e.StopPropagation()
        e.PreventDefault()
      },
      Children: {
        Container{
          FlexDirection: FlexDirection.Row,
          Gap: 14,
          Children: {
            Text{
              Content: "POS: " + p.X.ToString("F0") + ", " + p.Y.ToString("F0"),
              FontSize: 10,
              FontWeight: 600,
              Color: GalleryTheme.InkMuted,
            },
            Text{
              Content: "VEL: " + currentVx.ToString("F0") + ", " + currentVy.ToString("F0") + " px/s",
              FontSize: 10,
              FontWeight: 600,
              Color: GalleryTheme.InkMuted,
            },
            Text{
              Content: "|V|: " + currentSpeed.ToString("F0") + " px/s",
              FontSize: 10,
              FontWeight: 700,
              Color: if currentSpeed > 80.0 { GalleryTheme.AccentStrong } else { GalleryTheme.InkSubtle },
            },
          },
        },
        Container{
          PaddingLeft: 6,
          PaddingRight: 6,
          Height: 18,
          BorderRadius: 4,
          BackgroundColor: if isRunning { Color.FromNormalized(0.18F, 0.45F, 0.25F, 0.35F) } else { Color.FromNormalized(0.2F, 0.2F, 0.25F, 0.35F) },
          BorderWidth: 1,
          BorderColor: if isRunning { Color.Rgb(87, 188, 120) } else { GalleryTheme.Border },
          AlignItems: AlignItems.Center,
          JustifyContent: JustifyContent.Center,
          Children: {
            Text{
              Content: if isRunning { "● ACTIVE SIM" } else { "○ SETTLED" },
              FontSize: 9,
              FontWeight: 700,
              Color: if isRunning { Color.Rgb(87, 188, 120) } else { GalleryTheme.InkSubtle },
            },
          },
        },
      },
    }
  }

  private func buildArenaSection() Container {
    let arenaChildren = List[Blob]()
    arenaChildren.Add(anchorBlob(0, "NW"))
    arenaChildren.Add(anchorBlob(1, "NE"))
    arenaChildren.Add(anchorBlob(2, "CTR"))
    arenaChildren.Add(anchorBlob(3, "SW"))
    arenaChildren.Add(anchorBlob(4, "SE"))
    arenaChildren.Add(puckBlob())

    return Container{
      Height: Length.Percent(100),
      FlexGrow: 1.0,
      FlexShrink: 1.0,
      MinWidth: 0,
      MinHeight: 0,
      FlexDirection: FlexDirection.Column,
      Gap: 8,
      Children: {
        Container{
          FlexDirection: FlexDirection.Row,
          AlignItems: AlignItems.Center,
          JustifyContent: JustifyContent.SpaceBetween,
          Children: {
            Container{
              FlexDirection: FlexDirection.Row,
              Gap: 6,
              AlignItems: AlignItems.Center,
              Children: {
                Text{ Content: "PRESET:", FontSize: 10, FontWeight: 700, Color: GalleryTheme.InkSubtle },
                actionBtn("Bouncy", activeProfile == 0, () -> setProfile(0)),
                actionBtn("Snappy", activeProfile == 1, () -> setProfile(1)),
                actionBtn("Viscous", activeProfile == 2, () -> setProfile(2)),
                actionBtn("Stiff", activeProfile == 3, () -> setProfile(3)),
              },
            },
            Container{
              FlexDirection: FlexDirection.Row,
              Gap: 6,
              AlignItems: AlignItems.Center,
              Children: {
                Text{ Content: "SPEED:", FontSize: 10, FontWeight: 700, Color: GalleryTheme.InkSubtle },
                actionBtn("0.25x", activeSpeed == 0, () -> applySpeed(0)),
                actionBtn("0.5x", activeSpeed == 1, () -> applySpeed(1)),
                actionBtn("1.0x", activeSpeed == 2, () -> applySpeed(2)),
                actionBtn("1.5x", activeSpeed == 3, () -> applySpeed(3)),
              },
            },
          },
        },
        Container{
          Handle: arenaHandle,
          FlexGrow: 1.0,
          FlexShrink: 1.0,
          MinWidth: 0,
          MinHeight: 0,
          Position: PositionType.Relative,
          BackgroundColor: Color.Rgb(15, 17, 21),
          BorderRadius: 8,
          OverflowX: Overflow.Hidden,
          OverflowY: Overflow.Hidden,
          Cursor: Cursor.Crosshair,
          OnPointerDown: (e PointerEvent) -> handleArenaPointerDown(e),
          OnPointerMove: (e PointerEvent) -> handleArenaPointerMove(e),
          OnPointerUp: (e PointerEvent) -> handleArenaPointerUp(e),
          OnPointerCancel: (e PointerEvent) -> handleArenaPointerUp(e),
          Children: {
            Container{
              Width: Length.Percent(100),
              Height: Length.Percent(100),
              Position: PositionType.Relative,
              Children: arenaChildren,
            },
            Container{
              Position: PositionType.Absolute,
              Left: 0,
              Right: 0,
              Bottom: 0,
              Children: { telemetryBar() },
            },
            Container{
              Position: PositionType.Absolute,
              Left: 1,
              Top: 1,
              Right: 1,
              Bottom: 1,
              BorderWidth: 1,
              BorderColor: GalleryTheme.Border,
              BorderRadius: 7,
              HitTestSelf: false,
            },
          },
        },
      },
    }
  }

  private func switchBlob() Blob -> Container {
    Width: Length.Percent(100),
    Padding: 10,
    BackgroundColor: GalleryTheme.SurfaceRaised,
    BorderWidth: 1,
    BorderColor: GalleryTheme.Border,
    BorderRadius: 8,
    FlexDirection: FlexDirection.Row,
    AlignItems: AlignItems.Center,
    JustifyContent: JustifyContent.SpaceBetween,
    Children: {
      Container{
        FlexDirection: FlexDirection.Column,
        Gap: 2,
        Children: {
          Text{ Content: "Spring Toggle", FontSize: 12, FontWeight: 600, Color: GalleryTheme.Ink },
          Text{ Content: "Elastic overshoot & chromatic track", FontSize: 10, Color: GalleryTheme.InkMuted },
        },
      },
      Container{
        Width: 52,
        Height: 28,
        BorderRadius: 14,
        BackgroundColor: switchTrackColor.Value,
        Position: PositionType.Relative,
        Cursor: Cursor.Pointer,
        Focusable: true,
        OnClick: () -> toggleSwitch(),
        Children: {
          Container{
            Position: PositionType.Absolute,
            Left: switchThumbX.Value,
            Top: 3,
            Width: 22,
            Height: 22,
            BorderRadius: 11,
            BackgroundColor: Color.Rgb(255, 255, 255),
            Transform: PanelTransform{ Scale: switchScale.Value },
          },
        },
      },
    },
  }

  private func segmentedTabsBlob() Blob {
    let tabs = []string{ "Physics", "Telemetry", "Retarget" }
    let tabButtons = List[Blob]()
    var i = 0
    while i < 3 {
      let idx = i
      let isSel = selectedSegment == idx
      tabButtons.Add(Button{
        Width: 72,
        Height: 26,
        AlignItems: AlignItems.Center,
        JustifyContent: JustifyContent.Center,
        BackgroundColor: Color.Transparent,
        BorderWidth: 0,
        Cursor: Cursor.Pointer,
        Focusable: true,
        OnClick: () -> selectSegment(idx),
        Children: {
          Text{
            Content: tabs[idx],
            FontSize: 11,
            FontWeight: if isSel { 700 } else { 500 },
            Color: if isSel { GalleryTheme.Ink } else { GalleryTheme.InkMuted },
          },
        },
      })
      i = i + 1
    }
    let segmentText = switch selectedSegment {
      case 0: "Closed-form damped harmonic oscillator with initial velocity integration."
      case 1: "Real-time coordinate, velocity vector, and settling state telemetry."
      default: "Click or toss mid-flight: instantaneous momentum is seamlessly carried over."
    }
    return Container{
      Width: Length.Percent(100),
      Padding: 10,
      BackgroundColor: GalleryTheme.SurfaceRaised,
      BorderWidth: 1,
      BorderColor: GalleryTheme.Border,
      BorderRadius: 8,
      FlexDirection: FlexDirection.Column,
      Gap: 8,
      Children: {
        Container{
          FlexDirection: FlexDirection.Row,
          AlignItems: AlignItems.Center,
          JustifyContent: JustifyContent.SpaceBetween,
          Children: {
            Text{ Content: "Segmented Indicator", FontSize: 12, FontWeight: 600, Color: GalleryTheme.Ink },
            Text{ Content: "Gliding pill", FontSize: 10, Color: GalleryTheme.InkMuted },
          },
        },
        Container{
          Position: PositionType.Relative,
          Height: 28,
          BackgroundColor: Color.Rgb(15, 15, 17),
          BorderRadius: 6,
          BorderWidth: 1,
          BorderColor: GalleryTheme.Border,
          FlexDirection: FlexDirection.Row,
          Children: {
            Container{
              Position: PositionType.Absolute,
              Left: segmentPillX.Value,
              Top: 1,
              Width: 72,
              Height: 24,
              BorderRadius: 5,
              BackgroundColor: GalleryTheme.AccentMuted,
              BorderWidth: 1,
              BorderColor: GalleryTheme.Accent,
            },
            Container{
              FlexDirection: FlexDirection.Row,
              Children: tabButtons,
            },
          },
        },
        Text{
          Content: segmentText,
          FontSize: 10,
          Color: GalleryTheme.InkSubtle,
          LineHeight: 1.3,
        },
      },
    }
  }

  private func harmonicProfileBlob() Blob {
    let (gammaText, omegaText, dampingText) = switch activeProfile {
      case 0: ("γ = 5.8 /s", "ω = 16.5 rad/s", "Underdamped (Bouncy)")
      case 1: ("γ = 11.2 /s", "ω = 24.0 rad/s", "Critically Damped")
      case 2: ("γ = 15.0 /s", "ω = 9.0 rad/s", "Overdamped (Viscous)")
      default: ("γ = 18.0 /s", "ω = 32.0 rad/s", "High Frequency (Stiff)")
    }
    return Container{
      Width: Length.Percent(100),
      Padding: 10,
      BackgroundColor: GalleryTheme.SurfaceRaised,
      BorderWidth: 1,
      BorderColor: GalleryTheme.Border,
      BorderRadius: 8,
      FlexDirection: FlexDirection.Column,
      Gap: 6,
      Children: {
        Container{
          FlexDirection: FlexDirection.Row,
          AlignItems: AlignItems.Center,
          JustifyContent: JustifyContent.SpaceBetween,
          Children: {
            Text{ Content: "Harmonic Dynamics", FontSize: 12, FontWeight: 600, Color: GalleryTheme.Ink },
            actionBtn("↺ Step", false, () -> testOscillation()),
          },
        },
        Text{
          Content: dampingText + " · " + gammaText + " · " + omegaText,
          FontSize: 10,
          FontWeight: 600,
          Color: GalleryTheme.AccentStrong,
        },
        Text{
          Content: "x(t) = target + e^(-γt) [A·cos(ωt) + B·sin(ωt)]",
          FontSize: 9,
          FontWeight: 500,
          Color: GalleryTheme.InkSubtle,
        },
      },
    }
  }

  private func impulseBlob() Blob -> Container {
    Width: Length.Percent(100),
    Padding: 8,
    BackgroundColor: GalleryTheme.SurfaceRaised,
    BorderWidth: 1,
    BorderColor: GalleryTheme.Border,
    BorderRadius: 8,
    FlexDirection: FlexDirection.Column,
    Gap: 6,
    Children: {
      Container{
        FlexDirection: FlexDirection.Row,
        AlignItems: AlignItems.Center,
        JustifyContent: JustifyContent.SpaceBetween,
        Children: {
          Text{ Content: "Elastic Momentum", FontSize: 11, FontWeight: 600, Color: GalleryTheme.Ink },
          Container{
            FlexDirection: FlexDirection.Row,
            Gap: 4,
            Children: {
              actionBtn("↖", false, () -> fireImpulseDirection(-1.0, -1.0)),
              actionBtn("↗", false, () -> fireImpulseDirection(1.0, -1.0)),
              actionBtn("↙", false, () -> fireImpulseDirection(-1.0, 1.0)),
              actionBtn("↘", false, () -> fireImpulseDirection(1.0, 1.0)),
            },
          },
        },
      },
      Button{
        Width: Length.Percent(100),
        Height: 28,
        BackgroundColor: GalleryTheme.Accent,
        BorderWidth: 1,
        BorderColor: GalleryTheme.AccentStrong,
        BorderRadius: 6,
        AlignItems: AlignItems.Center,
        JustifyContent: JustifyContent.Center,
        Cursor: Cursor.Pointer,
        Focusable: true,
        Transform: PanelTransform{ Scale: Math.Max(impulseScale.Value, 0.5) },
        TransitionMs: 80.0,
        Hover: Style{ BackgroundColor: GalleryTheme.AccentStrong },
        OnClick: () -> triggerImpulse(),
        Children: {
          Text{
            Content: "⚡ FIRE 2D IMPULSE",
            FontSize: 11,
            FontWeight: 700,
            LetterSpacing: 0.5,
            Color: Color.Rgb(255, 255, 255),
          },
        },
      },
    },
  }

  private func buildCompanionControlsSection() Container {
    let panelWidth Length = 280
    let panelMinWidth Length = 0
    let width Length = if Compact { Length.Percent(100) } else { panelWidth }
    let minWidth Length = if Compact { panelMinWidth } else { panelWidth }
    return Container{
      Width: width,
      MinWidth: minWidth,
      FlexShrink: 0.0,
      FlexGrow: 1.0,
      MinHeight: 0,
      FlexDirection: FlexDirection.Column,
      Gap: 8,
      Children: {
        switchBlob(),
        segmentedTabsBlob(),
        harmonicProfileBlob(),
        impulseBlob(),
      },
    }
  }

  private func buildPhysicsLabContent() Blob -> Container {
    Width: Length.Percent(100),
    Height: Length.Percent(100),
    FlexGrow: 1.0,
    FlexShrink: 1.0,
    MinHeight: 0,
    MinWidth: 0,
    FlexDirection: if Compact { FlexDirection.Column } else { FlexDirection.Row },
    Gap: 14,
    Children: {
      buildArenaSection(),
      buildCompanionControlsSection(),
    },
  }

  // --- Exhibit 1: UI Component Gallery ---

  private func resetComponentGalleryDefaults() {
    compCategory = 0
    inputHandleText = "@goo_developer"
    searchFilterText = "Vulkan Pipeline"
    stepperCount = 4
    switchAutosave = true
    switchHardware = true
    switchTelemetry = false
    switchAutosaveThumbX.To(23.0, GalleryPosterReflowSpec)
    switchAutosaveTrackColor.To(GalleryTheme.Accent, GalleryPosterReflowSpec)
    switchHardwareThumbX.To(23.0, GalleryPosterReflowSpec)
    switchHardwareTrackColor.To(GalleryTheme.Accent, GalleryPosterReflowSpec)
    switchTelemetryThumbX.To(3.0, GalleryPosterReflowSpec)
    switchTelemetryTrackColor.To(Color.Rgb(39, 39, 42), GalleryPosterReflowSpec)
    checkDigest = true
    check2Fa = true
    selectedRadioTier = 1
    selectedViewMode = 0
    sliderValue = 75.0
    progressValue = 68.0
    isFollowingUser = false
    showAlertBanner = true
    isAccordionOpen = false
    feedbackToastText = "Reset to defaults"
    Rebuild()
  }

  private func handleInputHandleChanged(val string) {
    inputHandleText = val
    feedbackToastText = "Typed: " + val
    Rebuild()
  }

  private func handleSearchFilterChanged(val string) {
    searchFilterText = val
    feedbackToastText = "Filter: " + val
    Rebuild()
  }

  private func clearInputHandle() {
    inputHandleText = ""
    feedbackToastText = "Cleared handle"
    Rebuild()
  }

  private func setInputHandle(val string) {
    inputHandleText = val
    feedbackToastText = "Selected " + val
    Rebuild()
  }

  private func clearSearchFilter() {
    searchFilterText = ""
    feedbackToastText = "Cleared search"
    Rebuild()
  }

  private func setSearchFilter(val string) {
    searchFilterText = val
    feedbackToastText = "Filter: " + val
    Rebuild()
  }

  private func decrementStepper() {
    if stepperCount > 1 {
      stepperCount = stepperCount - 1
      feedbackToastText = "Count: " + stepperCount.ToString()
      Rebuild()
    }
  }

  private func incrementStepper() {
    if stepperCount < 99 {
      stepperCount = stepperCount + 1
      feedbackToastText = "Count: " + stepperCount.ToString()
      Rebuild()
    }
  }

  private func toggleSwitchAutosave() {
    switchAutosave = !switchAutosave
    switchAutosaveThumbX.To(if switchAutosave { 23.0 } else { 3.0 }, GalleryPosterReflowSpec)
    switchAutosaveTrackColor.To(if switchAutosave { GalleryTheme.Accent } else { Color.Rgb(39, 39, 42) }, GalleryPosterReflowSpec)
    feedbackToastText = "Auto-save: " + if switchAutosave { "ON" } else { "OFF" }
    Rebuild()
  }

  private func toggleSwitchHardware() {
    switchHardware = !switchHardware
    switchHardwareThumbX.To(if switchHardware { 23.0 } else { 3.0 }, GalleryPosterReflowSpec)
    switchHardwareTrackColor.To(if switchHardware { GalleryTheme.Accent } else { Color.Rgb(39, 39, 42) }, GalleryPosterReflowSpec)
    feedbackToastText = "Hardware Accel: " + if switchHardware { "ON" } else { "OFF" }
    Rebuild()
  }

  private func toggleSwitchTelemetry() {
    switchTelemetry = !switchTelemetry
    switchTelemetryThumbX.To(if switchTelemetry { 23.0 } else { 3.0 }, GalleryPosterReflowSpec)
    switchTelemetryTrackColor.To(if switchTelemetry { GalleryTheme.Accent } else { Color.Rgb(39, 39, 42) }, GalleryPosterReflowSpec)
    feedbackToastText = "Telemetry: " + if switchTelemetry { "ON" } else { "OFF" }
    Rebuild()
  }

  private func toggleCheckDigest() {
    checkDigest = !checkDigest
    feedbackToastText = "Email digest: " + checkDigest.ToString()
    Rebuild()
  }

  private func toggleCheck2Fa() {
    check2Fa = !check2Fa
    feedbackToastText = "2FA: " + check2Fa.ToString()
    Rebuild()
  }

  private func selectTier(tier int32) {
    selectedRadioTier = tier
    feedbackToastText = "Selected tier: " + tier.ToString()
    Rebuild()
  }

  private func selectViewMode(mode int32) {
    selectedViewMode = mode
    feedbackToastText = "View mode: " + mode.ToString()
    Rebuild()
  }

  private func updateCompSliderFromPointer(e PointerEvent) {
    let width = compSliderTrackHandle.BorderBox.Width
    if width > 0.0 {
      let part = Math.Clamp(e.Position.X / width, 0.0, 1.0)
      sliderValue = Math.Round(part * 100.0)
      feedbackToastText = "Scale set to " + sliderValue.ToString("F0") + "%"
      Rebuild()
    }
  }

  private func setSliderScale(v float64) {
    sliderValue = v
    feedbackToastText = "Scale set to " + v.ToString("F0") + "%"
    Rebuild()
  }

  private func advanceProgress() {
    progressValue = if progressValue >= 100.0 { 15.0 } else { progressValue + 15.0 }
    feedbackToastText = "Progress: " + progressValue.ToString("F0") + "%"
    Rebuild()
  }

  private func clickPrimaryAction() {
    feedbackToastText = "Clicked Primary Action"
    Rebuild()
  }

  private func clickSecondaryAction() {
    feedbackToastText = "Clicked Secondary Action"
    Rebuild()
  }

  private func clickOutlineAction() {
    feedbackToastText = "Clicked Outline Action"
    Rebuild()
  }

  private func clickDestructiveAction() {
    feedbackToastText = "Clicked Destructive Action"
    Rebuild()
  }

  private func toggleUserFollow() {
    isFollowingUser = !isFollowingUser
    feedbackToastText = if isFollowingUser { "Now following Alex Vance" } else { "Unfollowed Alex Vance" }
    Rebuild()
  }

  private func toggleAlertBanner() {
    showAlertBanner = !showAlertBanner
    feedbackToastText = if showAlertBanner { "Restored banner" } else { "Dismissed banner" }
    Rebuild()
  }

  private func toggleAccordion() {
    isAccordionOpen = !isAccordionOpen
    feedbackToastText = if isAccordionOpen { "Expanded disclosure" } else { "Collapsed disclosure" }
    Rebuild()
  }

  private func compCategoryBtn(label string, cat int32) Button {
    let isSel = compCategory == cat
    return Button{
      PaddingLeft: 10,
      PaddingRight: 10,
      Height: 26,
      BorderRadius: 2,
      BackgroundColor: if isSel { GalleryTheme.Accent } else { GalleryTheme.SurfaceRaised },
      BorderWidth: 1,
      BorderColor: if isSel { GalleryTheme.AccentStrong } else { GalleryTheme.Border },
      Cursor: Cursor.Pointer,
      Focusable: true,
      TransitionMs: 120.0,
      Hover: Style{
        BackgroundColor: if isSel { GalleryTheme.Accent } else { Color.Rgb(36, 36, 42) },
        BorderColor: if isSel { GalleryTheme.AccentStrong } else { GalleryTheme.BorderStrong },
      },
      Focus: Style{ OutlineWidth: 1, OutlineColor: GalleryTheme.AccentStrong },
      OnClick: () -> {
        compCategory = cat
        Rebuild()
      },
      Children: {
        Text{
          Content: label,
          FontSize: 11,
          FontWeight: if isSel { 700 } else { 500 },
          Color: if isSel { Color.Rgb(255, 255, 255) } else { GalleryTheme.InkMuted },
        },
      },
    }
  }

  private func compCard(title string, children List[Blob]) Container -> Container {
    FlexGrow: 1.0,
    FlexShrink: 0.0,
    FlexBasis: Length.Percent(48),
    MinWidth: 340,
    Padding: 16,
    BorderRadius: 6,
    BorderWidth: 1,
    BorderColor: GalleryTheme.Border,
    BackgroundColor: GalleryTheme.SurfaceRaised,
    FlexDirection: FlexDirection.Column,
    Gap: 12,
    Children: {
      Container{
        FlexDirection: FlexDirection.Row,
        AlignItems: AlignItems.Center,
        Children: {
          Text{
            Content: title,
            FontSize: 12,
            FontWeight: 700,
            Color: GalleryTheme.Ink,
          },
        },
      },
      Container{
        FlexDirection: FlexDirection.Column,
        Gap: 10,
        Children: children,
      },
    },
  }

  private func compSwitch(label string, subtitle string, thumbX float64, trackColor Color, onToggle Action) Container -> Container {
    FlexDirection: FlexDirection.Row,
    AlignItems: AlignItems.Center,
    JustifyContent: JustifyContent.SpaceBetween,
    Children: {
      Container{
        FlexDirection: FlexDirection.Column,
        Gap: 2,
        Children: {
          Text{ Content: label, FontSize: 11, FontWeight: 600, Color: GalleryTheme.Ink },
          Text{ Content: subtitle, FontSize: 9, Color: GalleryTheme.InkSubtle },
        },
      },
      Container{
        Width: 44,
        Height: 24,
        BorderRadius: 4,
        BackgroundColor: trackColor,
        BorderWidth: 1,
        BorderColor: trackColor,
        Position: PositionType.Relative,
        Cursor: Cursor.Pointer,
        Focusable: true,
        OnClick: onToggle,
        Children: {
          Container{
            Position: PositionType.Absolute,
            Left: thumbX,
            Top: 3.0,
            Width: 16,
            Height: 16,
            BorderRadius: 2,
            BackgroundColor: Color.Rgb(255, 255, 255),
          },
        },
      },
    },
  }

  private func compCheckbox(label string, isChecked bool, onToggle Action) Button -> Button {
    FlexDirection: FlexDirection.Row,
    AlignItems: AlignItems.Center,
    Gap: 8,
    Cursor: Cursor.Pointer,
    Focusable: true,
    BackgroundColor: Color.Transparent,
    BorderRadius: 3,
    Padding: 4,
    TransitionMs: 100.0,
    Hover: Style{ BackgroundColor: Color.Rgb(31, 31, 35) },
    Focus: Style{ OutlineWidth: 1, OutlineColor: GalleryTheme.AccentStrong },
    OnClick: onToggle,
    Children: {
      Container{
        Width: 18,
        Height: 18,
        BorderRadius: 4,
        BorderWidth: 1,
        BorderColor: if isChecked { GalleryTheme.Accent } else { GalleryTheme.BorderStrong },
        BackgroundColor: if isChecked { GalleryTheme.Accent } else { Color.FromNormalized(0.12F, 0.12F, 0.15F, 0.8F) },
        AlignItems: AlignItems.Center,
        JustifyContent: JustifyContent.Center,
        Children: {
          if isChecked {
            Container{
              Children: {
                GalleryTheme.Icon(GalleryTheme.IconCheck, 13, Color.Rgb(255, 255, 255)),
              },
            }
          } else {
            Container{}
          },
        },
      },
      Text{
        Content: label,
        FontSize: 11,
        FontWeight: if isChecked { 600 } else { 450 },
        Color: if isChecked { GalleryTheme.Ink } else { GalleryTheme.InkMuted },
      },
    },
  }

  private func compRadio(label string, desc string, isSelected bool, onSelect Action) Button -> Button {
    Width: Length.Percent(100),
    FlexDirection: FlexDirection.Row,
    AlignItems: AlignItems.Center,
    Padding: 8,
    BorderRadius: 3,
    BorderWidth: 1,
    BorderColor: if isSelected { GalleryTheme.AccentStrong } else { GalleryTheme.Border },
    Cursor: Cursor.Pointer,
    Focusable: true,
    BackgroundColor: if isSelected { GalleryTheme.AccentMuted } else { Color.Transparent },
    TransitionMs: 100.0,
    Hover: Style{
      BackgroundColor: if isSelected { GalleryTheme.AccentMuted } else { Color.Rgb(31, 31, 35) },
      BorderColor: if isSelected { GalleryTheme.AccentStrong } else { GalleryTheme.BorderStrong },
    },
    Focus: Style{ OutlineWidth: 1, OutlineColor: GalleryTheme.AccentStrong },
    OnClick: onSelect,
    Children: {
      Container{
        FlexDirection: FlexDirection.Column,
        Gap: 1,
        Children: {
          Text{ Content: label, FontSize: 11, FontWeight: if isSelected { 700 } else { 500 }, Color: if isSelected { GalleryTheme.Ink } else { GalleryTheme.InkMuted } },
          Text{ Content: desc, FontSize: 9, Color: GalleryTheme.InkSubtle },
        },
      },
    },
  }

  private func compSmallPresetBtn(label string, onClick Action) Button -> Button {
    PaddingLeft: 6,
    PaddingRight: 6,
    Height: 18,
    BorderRadius: 2,
    BackgroundColor: Color.FromNormalized(0.16F, 0.16F, 0.20F, 0.8F),
    BorderWidth: 1,
    BorderColor: GalleryTheme.Border,
    Cursor: Cursor.Pointer,
    Focusable: true,
    AlignItems: AlignItems.Center,
    JustifyContent: JustifyContent.Center,
    TransitionMs: 100.0,
    Hover: Style{ BackgroundColor: Color.Rgb(36, 36, 42), BorderColor: GalleryTheme.BorderStrong },
    Focus: Style{ OutlineWidth: 1, OutlineColor: GalleryTheme.AccentStrong },
    OnClick: onClick,
    Children: {
      Text{ Content: label, FontSize: 9, FontWeight: 600, Color: GalleryTheme.InkMuted },
    },
  }

  private func compTextInput(
    key string,
    label string,
    value string,
    placeholder string,
    onType Action[string],
    onClear Action,
    onPreset0 Action,
    onPreset1 Action,
    onPreset2 Action) Container -> Container{
      FlexDirection: FlexDirection.Column,
      Gap: 4,
      Children: {
        Container{
          FlexDirection: FlexDirection.Row,
          JustifyContent: JustifyContent.SpaceBetween,
          Children: {
            Text{ Content: label, FontSize: 10, FontWeight: 600, Color: GalleryTheme.InkSubtle },
            Text{ Content: value.Length.ToString() + " chars", FontSize: 9, Color: GalleryTheme.InkSubtle },
          },
        },
        Container{
          FlexDirection: FlexDirection.Row,
          AlignItems: AlignItems.Center,
          Gap: 6,
          Children: {
            TextEntry{
              Key: key,
              Value: value,
              Placeholder: placeholder,
              FlexGrow: 1.0,
              FlexShrink: 1.0,
              Height: 32,
              PaddingLeft: 10,
              PaddingRight: 10,
              FontSize: 11,
              FontWeight: 500,
              Color: GalleryTheme.Ink,
              BackgroundColor: Color.FromNormalized(0.08F, 0.08F, 0.10F, 0.9F),
              BorderRadius: 4,
              BorderWidth: 1,
              BorderColor: GalleryTheme.BorderStrong,
              SelectionColor: GalleryTheme.Accent,
              TransitionMs: 100.0,
              Focus: Style{ BorderColor: GalleryTheme.AccentStrong },
              OnChange: onType,
            },
            if value.Length > 0 {
              Container{
                Key: key + "-clear-slot",
                Children: {
                  Button{
                    Width: 28,
                    Height: 32,
                    BorderRadius: 4,
                    BackgroundColor: Color.FromNormalized(0.14F, 0.14F, 0.18F, 0.8F),
                    BorderWidth: 1,
                    BorderColor: GalleryTheme.BorderStrong,
                    Cursor: Cursor.Pointer,
                    Focusable: true,
                    AlignItems: AlignItems.Center,
                    JustifyContent: JustifyContent.Center,
                    TransitionMs: 100.0,
                    Hover: Style{ BackgroundColor: Color.Rgb(36, 36, 42) },
                    Focus: Style{ OutlineWidth: 1, OutlineColor: GalleryTheme.AccentStrong },
                    OnClick: onClear,
                    Children: {
                      GalleryTheme.Icon(GalleryTheme.IconClose, 15, GalleryTheme.InkSubtle),
                    },
                  },
                },
              }
            } else {
              Container{
                Key: key + "-clear-slot",
              }
            },
          },
        },
        Container{
          FlexDirection: FlexDirection.Row,
          Gap: 4,
          AlignItems: AlignItems.Center,
          Children: {
            Text{ Content: "Presets:", FontSize: 9, Color: GalleryTheme.InkSubtle },
            compSmallPresetBtn("@dev", onPreset0),
            compSmallPresetBtn("@wayland", onPreset1),
            compSmallPresetBtn("@gsharp", onPreset2),
          },
        },
      },
    }

  private func compStepper(label string, count int32, onDec Action, onInc Action) Container -> Container {
    FlexDirection: FlexDirection.Row,
    AlignItems: AlignItems.Center,
    JustifyContent: JustifyContent.SpaceBetween,
    Children: {
      Text{ Content: label, FontSize: 11, FontWeight: 600, Color: GalleryTheme.Ink },
      Container{
        FlexDirection: FlexDirection.Row,
        AlignItems: AlignItems.Center,
        BorderRadius: 4,
        BorderWidth: 1,
        BorderColor: GalleryTheme.BorderStrong,
        BackgroundColor: Color.FromNormalized(0.08F, 0.08F, 0.10F, 0.9F),
        Children: {
          Button{
            Width: 28,
            Height: 26,
            BackgroundColor: Color.Transparent,
            Cursor: Cursor.Pointer,
            Focusable: true,
            AlignItems: AlignItems.Center,
            JustifyContent: JustifyContent.Center,
            TransitionMs: 100.0,
            Hover: Style{ BackgroundColor: Color.Rgb(36, 36, 42) },
            Focus: Style{ OutlineWidth: 1, OutlineColor: GalleryTheme.AccentStrong },
            OnClick: onDec,
            Children: { Text{ Content: "-", FontSize: 14, FontWeight: 700, Color: GalleryTheme.Ink } },
          },
          Container{
            Width: 32,
            Height: 26,
            BorderLeftWidth: 1,
            BorderRightWidth: 1,
            BorderColor: GalleryTheme.Border,
            AlignItems: AlignItems.Center,
            JustifyContent: JustifyContent.Center,
            Children: { Text{ Content: count.ToString(), FontSize: 11, FontWeight: 700, Color: GalleryTheme.AccentStrong } },
          },
          Button{
            Width: 28,
            Height: 26,
            BackgroundColor: Color.Transparent,
            Cursor: Cursor.Pointer,
            Focusable: true,
            AlignItems: AlignItems.Center,
            JustifyContent: JustifyContent.Center,
            TransitionMs: 100.0,
            Hover: Style{ BackgroundColor: Color.Rgb(36, 36, 42) },
            Focus: Style{ OutlineWidth: 1, OutlineColor: GalleryTheme.AccentStrong },
            OnClick: onInc,
            Children: { Text{ Content: "+", FontSize: 14, FontWeight: 700, Color: GalleryTheme.Ink } },
          },
        },
      },
    },
  }

  private func compSlider(label string, value float64) Container {
    let pct = Math.Clamp(value, 0.0, 100.0)
    return Container{
      FlexDirection: FlexDirection.Column,
      Gap: 6,
      Children: {
        Container{
          FlexDirection: FlexDirection.Row,
          JustifyContent: JustifyContent.SpaceBetween,
          Children: {
            Text{ Content: label, FontSize: 11, FontWeight: 600, Color: GalleryTheme.Ink },
            Text{ Content: pct.ToString("F0") + "%", FontSize: 11, FontWeight: 700, Color: GalleryTheme.AccentStrong },
          },
        },
        Container{
          Handle: compSliderTrackHandle,
          Focusable: true,
          Cursor: Cursor.Pointer,
          Height: 28,
          Position: PositionType.Relative,
          JustifyContent: JustifyContent.Center,
          OnPointerDown: func(e PointerEvent) {
            e.Capture()
            e.PreventDefault()
            sliderDragging = true
            updateCompSliderFromPointer(e)
          },
          OnPointerMove: func(e PointerEvent) {
            if sliderDragging {
              updateCompSliderFromPointer(e)
            }
          },
          OnPointerUp: func(e PointerEvent) {
            e.ReleaseCapture()
            sliderDragging = false
          },
          OnPointerCancel: func(e PointerEvent) {
            e.ReleaseCapture()
            sliderDragging = false
          },
          Children: {
            Container{
              Width: Length.Percent(100),
              Height: 6,
              BorderRadius: 2,
              BackgroundColor: Color.FromNormalized(0.18F, 0.18F, 0.22F, 0.9F),
              Position: PositionType.Relative,
              Children: {
                Container{
                  Width: Length.Percent(pct),
                  Height: 6,
                  BorderRadius: 2,
                  BackgroundColor: GalleryTheme.Accent,
                },
              },
            },
            Container{
              Position: PositionType.Absolute,
              Left: Length.Percent(pct),
              Top: 0.0,
              Width: 28,
              Height: 28,
              BackgroundColor: Color.Transparent,
              Transform: PanelTransform{ TranslateX: -14.0 },
              AlignItems: AlignItems.Center,
              JustifyContent: JustifyContent.Center,
              Children: {
                Container{
                  Width: 16,
                  Height: 16,
                  BorderRadius: 4,
                  BackgroundColor: GalleryTheme.Accent,
                  AlignItems: AlignItems.Center,
                  JustifyContent: JustifyContent.Center,
                  Children: {
                    Container{
                      Width: 14,
                      Height: 14,
                      BorderRadius: 3,
                      BackgroundColor: Color.Rgb(255, 255, 255),
                    },
                  },
                },
              },
            },
          },
        },
        Container{
          FlexDirection: FlexDirection.Row,
          JustifyContent: JustifyContent.SpaceBetween,
          Children: {
            compSmallPresetBtn("25%", () -> setSliderScale(25.0)),
            compSmallPresetBtn("50%", () -> setSliderScale(50.0)),
            compSmallPresetBtn("75%", () -> setSliderScale(75.0)),
            compSmallPresetBtn("100%", () -> setSliderScale(100.0)),
          },
        },
      },
    }
  }

  private func compProgressBar(label string, progress float64, onStep Action) Container {
    let pct = Math.Clamp(progress, 0.0, 100.0)
    return Container{
      FlexDirection: FlexDirection.Column,
      Gap: 6,
      Children: {
        Container{
          FlexDirection: FlexDirection.Row,
          JustifyContent: JustifyContent.SpaceBetween,
          AlignItems: AlignItems.Center,
          Children: {
            Text{ Content: label, FontSize: 11, FontWeight: 600, Color: GalleryTheme.Ink },
            Text{ Content: pct.ToString("F0") + "% Complete", FontSize: 10, FontWeight: 700, Color: Color.Rgb(140, 210, 240) },
          },
        },
        Container{
          Width: Length.Percent(100),
          Height: 8,
          BorderRadius: 2,
          BackgroundColor: Color.FromNormalized(0.15F, 0.15F, 0.18F, 0.9F),
          Children: {
            Container{
              Width: Length.Percent(pct),
              Height: 8,
              BorderRadius: 2,
              BackgroundColor: Color.Rgb(56, 189, 248),
            },
          },
        },
        Button{
          Height: 24,
          BorderRadius: 4,
          BackgroundColor: Color.FromNormalized(0.18F, 0.20F, 0.28F, 0.8F),
          BorderWidth: 1,
          BorderColor: GalleryTheme.BorderStrong,
          Cursor: Cursor.Pointer,
          Focusable: true,
          AlignItems: AlignItems.Center,
          JustifyContent: JustifyContent.Center,
          TransitionMs: 100.0,
          Hover: Style{ BackgroundColor: Color.Rgb(40, 42, 54), BorderColor: GalleryTheme.AccentStrong },
          Focus: Style{ OutlineWidth: 1, OutlineColor: GalleryTheme.AccentStrong },
          OnClick: onStep,
          Children: {
            Container{
              FlexDirection: FlexDirection.Row,
              Gap: 5,
              AlignItems: AlignItems.Center,
              Children: {
                GalleryTheme.Icon(GalleryTheme.IconBolt, 14, GalleryTheme.Ink),
                Text{ Content: "Advance progress (+15%)", FontSize: 10, FontWeight: 600, Color: GalleryTheme.Ink },
              },
            },
          },
        },
      },
    }
  }

  private func compAvatarCard(name string, handle string, isFollowing bool, onToggle Action) Container -> Container {
    FlexDirection: FlexDirection.Row,
    AlignItems: AlignItems.Center,
    JustifyContent: JustifyContent.SpaceBetween,
    Padding: 10,
    BorderRadius: 6,
    BackgroundColor: Color.FromNormalized(0.10F, 0.10F, 0.13F, 0.8F),
    BorderWidth: 1,
    BorderColor: GalleryTheme.Border,
    Children: {
      Container{
        FlexDirection: FlexDirection.Row,
        AlignItems: AlignItems.Center,
        Gap: 10,
        Children: {
          Container{
            Width: 36,
            Height: 36,
            BorderRadius: 18,
            BackgroundColor: GalleryTheme.Accent,
            Position: PositionType.Relative,
            AlignItems: AlignItems.Center,
            JustifyContent: JustifyContent.Center,
            Children: {
              Text{ Content: "AV", FontSize: 12, FontWeight: 700, Color: Color.Rgb(255, 255, 255) },
            },
          },
          Container{
            FlexDirection: FlexDirection.Column,
            Children: {
              Text{ Content: name, FontSize: 11, FontWeight: 700, Color: GalleryTheme.Ink },
              Text{ Content: handle, FontSize: 9, Color: GalleryTheme.InkSubtle },
            },
          },
        },
      },
      Button{
        PaddingLeft: 10,
        PaddingRight: 10,
        Height: 24,
        BorderRadius: 4,
        BackgroundColor: if isFollowing { GalleryTheme.SurfaceRaised } else { GalleryTheme.Accent },
        BorderWidth: 1,
        BorderColor: if isFollowing { GalleryTheme.BorderStrong } else { GalleryTheme.AccentStrong },
        Cursor: Cursor.Pointer,
        Focusable: true,
        AlignItems: AlignItems.Center,
        JustifyContent: JustifyContent.Center,
        TransitionMs: 100.0,
        Hover: Style{ BackgroundColor: if isFollowing { Color.Rgb(36, 36, 42) } else { GalleryTheme.AccentStrong } },
        Focus: Style{ OutlineWidth: 1, OutlineColor: GalleryTheme.AccentStrong },
        OnClick: onToggle,
        Children: {
          Container{
            FlexDirection: FlexDirection.Row,
            Gap: 4,
            AlignItems: AlignItems.Center,
            Children: {
              Text{
                Content: if isFollowing { "Following" } else { "Follow" },
                FontSize: 10,
                FontWeight: 700,
                Color: if isFollowing { GalleryTheme.InkMuted } else { Color.Rgb(255, 255, 255) },
              },
              Container{
                Display: if isFollowing { Display.Flex } else { Display.None },
                Children: {
                  GalleryTheme.Icon(GalleryTheme.IconCheck, 13, GalleryTheme.InkMuted),
                },
              },
            },
          },
        },
      },
    },
  }

  private func compAlertBanner(message string, isVisible bool, onDismiss Action) Blob {
    if !isVisible {
      return Container{
        Padding: 8,
        BorderRadius: 6,
        BorderWidth: 1,
        BorderColor: GalleryTheme.Border,
        BackgroundColor: Color.FromNormalized(0.10F, 0.10F, 0.13F, 0.5F),
        FlexDirection: FlexDirection.Row,
        AlignItems: AlignItems.Center,
        JustifyContent: JustifyContent.SpaceBetween,
        Children: {
          Text{ Content: "Alert dismissed.", FontSize: 10, Color: GalleryTheme.InkSubtle },
          Button{
            BackgroundColor: Color.Transparent,
            Cursor: Cursor.Pointer,
            Focusable: true,
            TransitionMs: 100.0,
            Hover: Style{ BackgroundColor: Color.Rgb(31, 31, 35) },
            Focus: Style{ OutlineWidth: 1, OutlineColor: GalleryTheme.AccentStrong },
            OnClick: onDismiss,
            Children: { Text{ Content: "Undo / Restore", FontSize: 10, FontWeight: 600, Color: GalleryTheme.AccentStrong } },
          },
        },
      }
    }
    return Container{
      Padding: 10,
      BorderRadius: 6,
      BorderWidth: 1,
      BorderColor: Color.FromNormalized(0.25F, 0.40F, 0.85F, 0.6F),
      BackgroundColor: Color.FromNormalized(0.12F, 0.18F, 0.35F, 0.45F),
      FlexDirection: FlexDirection.Row,
      AlignItems: AlignItems.Center,
      JustifyContent: JustifyContent.SpaceBetween,
      Children: {
        Container{
          FlexDirection: FlexDirection.Row,
          AlignItems: AlignItems.Center,
          Gap: 8,
          Children: {
            GalleryTheme.Icon(GalleryTheme.IconInfo, 16, Color.Rgb(140, 210, 255)),
            Text{ Content: message, FontSize: 10, FontWeight: 500, Color: GalleryTheme.Ink },
          },
        },
        Button{
          Width: 20,
          Height: 20,
          BorderRadius: 2,
          BackgroundColor: Color.Transparent,
          Cursor: Cursor.Pointer,
          Focusable: true,
          AlignItems: AlignItems.Center,
          JustifyContent: JustifyContent.Center,
          TransitionMs: 100.0,
          Hover: Style{ BackgroundColor: Color.Rgb(36, 36, 42) },
          Focus: Style{ OutlineWidth: 1, OutlineColor: GalleryTheme.AccentStrong },
          OnClick: onDismiss,
          Children: { GalleryTheme.Icon(GalleryTheme.IconClose, 15, GalleryTheme.InkMuted) },
        },
      },
    }
  }

  private func compAccordion(title string, isOpen bool, onToggle Action) Container -> Container {
    BorderRadius: 6,
    BorderWidth: 1,
    BorderColor: GalleryTheme.Border,
    BackgroundColor: Color.FromNormalized(0.10F, 0.10F, 0.13F, 0.8F),
    FlexDirection: FlexDirection.Column,
    Children: {
      Button{
        Padding: 10,
        BackgroundColor: Color.Transparent,
        Cursor: Cursor.Pointer,
        Focusable: true,
        FlexDirection: FlexDirection.Row,
        AlignItems: AlignItems.Center,
        JustifyContent: JustifyContent.SpaceBetween,
        TransitionMs: 100.0,
        Hover: Style{ BackgroundColor: Color.Rgb(31, 31, 35) },
        Focus: Style{ OutlineWidth: 1, OutlineColor: GalleryTheme.AccentStrong },
        OnClick: onToggle,
        Children: {
          Text{ Content: title, FontSize: 11, FontWeight: 600, Color: GalleryTheme.Ink },
          Container{
            FlexDirection: FlexDirection.Row,
            Gap: 4,
            AlignItems: AlignItems.Center,
            Children: {
              GalleryTheme.Icon(
                if isOpen { GalleryTheme.IconExpandLess } else { GalleryTheme.IconExpandMore },
                15,
                GalleryTheme.AccentStrong),
              Text{ Content: if isOpen { "Hide" } else { "Expand" }, FontSize: 10, FontWeight: 600, Color: GalleryTheme.AccentStrong },
            },
          },
        },
      },
      if isOpen {
        Container{
          Padding: 10,
          BorderTopWidth: 1,
          BorderColor: GalleryTheme.Border,
          BackgroundColor: Color.FromNormalized(0.07F, 0.07F, 0.09F, 0.9F),
          FlexDirection: FlexDirection.Column,
          Gap: 4,
          Children: {
            Text{ Content: "Architecture: Goo Declarative Retained Layout System", FontSize: 10, Color: GalleryTheme.InkMuted },
            Text{ Content: "Layout Engine: Yoga Flexbox C# Binding (Auto-Reflow)", FontSize: 10, Color: GalleryTheme.InkMuted },
            Text{ Content: "Rasterizer: Vulkan Native Shader Pipelines", FontSize: 10, Color: GalleryTheme.InkMuted },
            Text{ Content: "Component Paradigm: Single-pass declarative Blob tree reconciler", FontSize: 10, Color: GalleryTheme.AccentStrong },
          },
        }
      } else {
        Container{}
      },
    },
  }

  private func compSegmentBtn(icon string, label string, isSel bool, onClick Action) Button -> Button {
    PaddingLeft: 10,
    PaddingRight: 10,
    Height: 24,
    BorderRadius: 2,
    BackgroundColor: if isSel { GalleryTheme.Accent } else { Color.Transparent },
    Cursor: Cursor.Pointer,
    Focusable: true,
    AlignItems: AlignItems.Center,
    JustifyContent: JustifyContent.Center,
    TransitionMs: 100.0,
    Hover: Style{ BackgroundColor: if isSel { GalleryTheme.Accent } else { Color.Rgb(36, 36, 42) } },
    Focus: Style{ OutlineWidth: 1, OutlineColor: GalleryTheme.AccentStrong },
    OnClick: onClick,
    Children: {
      Container{
        FlexDirection: FlexDirection.Row,
        Gap: 4,
        AlignItems: AlignItems.Center,
        Children: {
          GalleryTheme.Icon(icon, 14, if isSel { Color.Rgb(255, 255, 255) } else { GalleryTheme.InkMuted }),
          Text{ Content: label, FontSize: 10, FontWeight: if isSel { 700 } else { 500 }, Color: if isSel { Color.Rgb(255, 255, 255) } else { GalleryTheme.InkMuted } },
        },
      },
    },
  }

  private func compOutlineBtn(label string, onClick Action) Button -> Button {
    PaddingLeft: 8,
    PaddingRight: 8,
    Height: 24,
    BorderRadius: 4,
    BackgroundColor: Color.Transparent,
    BorderWidth: 1,
    BorderColor: GalleryTheme.Accent,
    Cursor: Cursor.Pointer,
    Focusable: true,
    AlignItems: AlignItems.Center,
    JustifyContent: JustifyContent.Center,
    TransitionMs: 100.0,
    Hover: Style{ BackgroundColor: GalleryTheme.AccentMuted, BorderColor: GalleryTheme.AccentStrong },
    Focus: Style{ OutlineWidth: 1, OutlineColor: GalleryTheme.AccentStrong },
    OnClick: onClick,
    Children: {
      Text{ Content: label, FontSize: 10, FontWeight: 600, Color: GalleryTheme.AccentStrong },
    },
  }

  private func compDangerBtn(label string, onClick Action) Button -> Button {
    PaddingLeft: 8,
    PaddingRight: 8,
    Height: 24,
    BorderRadius: 4,
    BackgroundColor: Color.FromNormalized(0.25F, 0.08F, 0.08F, 0.5F),
    BorderWidth: 1,
    BorderColor: Color.Rgb(239, 68, 68),
    Cursor: Cursor.Pointer,
    Focusable: true,
    AlignItems: AlignItems.Center,
    JustifyContent: JustifyContent.Center,
    TransitionMs: 100.0,
    Hover: Style{ BackgroundColor: Color.FromNormalized(0.38F, 0.10F, 0.10F, 0.65F) },
    Focus: Style{ OutlineWidth: 1, OutlineColor: Color.Rgb(248, 113, 113) },
    OnClick: onClick,
    Children: {
      Text{ Content: label, FontSize: 10, FontWeight: 600, Color: Color.Rgb(248, 113, 113) },
    },
  }

  private func buildComponentGalleryContent() Blob {
    let cards = List[Blob]()

    // Group 1: Inputs & Forms
    if compCategory == 0 || compCategory == 1 {
      let formChildren = List[Blob]()
      formChildren.Add(compTextInput(
        "comp-handle-entry",
        "User Handle",
        inputHandleText,
        "Enter handle...",
        (val string) -> handleInputHandleChanged(val),
        () -> clearInputHandle(),
        () -> setInputHandle("@dev"),
        () -> setInputHandle("@wayland"),
        () -> setInputHandle("@gsharp")))
      formChildren.Add(compTextInput(
        "comp-filter-entry",
        "Filter Query",
        searchFilterText,
        "Search components...",
        (val string) -> handleSearchFilterChanged(val),
        () -> clearSearchFilter(),
        () -> setSearchFilter("Button"),
        () -> setSearchFilter("Input"),
        () -> setSearchFilter("Modal")))
      formChildren.Add(compStepper(
        "Batch Instance Count",
        stepperCount,
        () -> decrementStepper(),
        () -> incrementStepper()))
      cards.Add(compCard("Text Inputs & Steppers", formChildren))
    }

    // Group 2: Selection & Toggles
    if compCategory == 0 || compCategory == 2 {
      let selectChildren = List[Blob]()
      selectChildren.Add(compSwitch("Auto-save revisions", "Persist changes instantly", switchAutosaveThumbX.Value, switchAutosaveTrackColor.Value, () -> toggleSwitchAutosave()))
      selectChildren.Add(compSwitch("Hardware acceleration", "Vulkan pipeline rasterization", switchHardwareThumbX.Value, switchHardwareTrackColor.Value, () -> toggleSwitchHardware()))
      selectChildren.Add(compSwitch("Telemetry diagnostics", "Anonymous performance traces", switchTelemetryThumbX.Value, switchTelemetryTrackColor.Value, () -> toggleSwitchTelemetry()))
      selectChildren.Add(compCheckbox("Email digest updates", checkDigest, () -> toggleCheckDigest()))
      selectChildren.Add(compCheckbox("Require two-factor auth", check2Fa, () -> toggleCheck2Fa()))
      selectChildren.Add(compRadio("Standard Plan (Free)", "Community access, 5 projects", selectedRadioTier == 0, () -> selectTier(0)))
      selectChildren.Add(compRadio("Pro Developer ($19/mo)", "Unlimited pipelines, priority SLA", selectedRadioTier == 1, () -> selectTier(1)))
      selectChildren.Add(compRadio("Enterprise Dedicated ($99/mo)", "Custom hardware, air-gapped nodes", selectedRadioTier == 2, () -> selectTier(2)))
      cards.Add(compCard("Switches, checks & radios", selectChildren))
    }

    // Group 3: Buttons & Actions
    if compCategory == 0 || compCategory == 3 {
      let btnChildren = List[Blob]()
      btnChildren.Add(Container{
        FlexDirection: FlexDirection.Row,
        BorderRadius: 6,
        Padding: 3,
        BackgroundColor: Color.FromNormalized(0.08F, 0.08F, 0.10F, 0.9F),
        BorderWidth: 1,
        BorderColor: GalleryTheme.BorderStrong,
        Children: {
          compSegmentBtn(GalleryTheme.IconGridView, "Grid", selectedViewMode == 0, () -> selectViewMode(0)),
          compSegmentBtn(GalleryTheme.IconViewList, "List", selectedViewMode == 1, () -> selectViewMode(1)),
          compSegmentBtn(GalleryTheme.IconVerticalSplit, "Split", selectedViewMode == 2, () -> selectViewMode(2)),
        },
      })
      btnChildren.Add(Container{
        FlexDirection: FlexDirection.Row,
        Gap: 6,
        FlexWrap: FlexWrap.Wrap,
        Children: {
          actionBtn("Primary Action", true, () -> clickPrimaryAction()),
          actionBtn("Secondary", false, () -> clickSecondaryAction()),
          compOutlineBtn("Outline", () -> clickOutlineAction()),
          compDangerBtn("Destructive", () -> clickDestructiveAction()),
        },
      })
      btnChildren.Add(compAvatarCard("Alex Vance", "@avantgarde", isFollowingUser, () -> toggleUserFollow()))
      cards.Add(compCard("Buttons, actions & identity", btnChildren))
    }

    // Group 4: Sliders, Progress & Feedback
    if compCategory == 0 || compCategory == 4 {
      let displayChildren = List[Blob]()
      displayChildren.Add(compSlider("Render Viewport Scale", sliderValue))
      displayChildren.Add(compProgressBar("Sync Asset Cache", progressValue, () -> advanceProgress()))
      displayChildren.Add(compAlertBanner(
        "Vulkan swapchain initialized at 144 Hz with zero mailbox latency.",
        showAlertBanner,
        () -> toggleAlertBanner()))
      displayChildren.Add(compAccordion("System Architecture & Pipeline", isAccordionOpen, () -> toggleAccordion()))
      cards.Add(compCard("Range, progress & feedback", displayChildren))
    }

    return Container{
      Width: Length.Percent(100),
      FlexGrow: 1.0,
      FlexShrink: 1.0,
      MinHeight: 0,
      MinWidth: 0,
      FlexDirection: FlexDirection.Column,
      Gap: 10,
      Children: {
        Container{
          FlexDirection: FlexDirection.Row,
          AlignItems: AlignItems.Center,
          JustifyContent: JustifyContent.SpaceBetween,
          Children: {
            Container{
              FlexDirection: FlexDirection.Row,
              Gap: 6,
              AlignItems: AlignItems.Center,
              Children: {
                Text{ Content: "Filter", FontSize: 10, FontWeight: 600, Color: GalleryTheme.InkSubtle },
                compCategoryBtn("All Categories", 0),
                compCategoryBtn("Forms & Inputs", 1),
                compCategoryBtn("Selection", 2),
                compCategoryBtn("Buttons", 3),
                compCategoryBtn("Display & Feedback", 4),
              },
            },
            Button{
              PaddingLeft: 8,
              PaddingRight: 8,
              Height: 24,
              BorderRadius: 4,
              BackgroundColor: GalleryTheme.SurfaceRaised,
              BorderWidth: 1,
              BorderColor: GalleryTheme.Border,
              Cursor: Cursor.Pointer,
              FlexDirection: FlexDirection.Row,
              Gap: 5,
              AlignItems: AlignItems.Center,
              JustifyContent: JustifyContent.Center,
              Accessibility: Accessibility{ Name: "Reset defaults" },
              OnClick: () -> resetComponentGalleryDefaults(),
              Children: {
                GalleryTheme.Icon(GalleryTheme.IconRestart, 15, GalleryTheme.InkMuted),
                Text{ Content: "Reset defaults", FontSize: 10, FontWeight: 600, Color: GalleryTheme.InkMuted },
              },
            },
          },
        },
        Container{
          FlexGrow: 1.0,
          FlexShrink: 1.0,
          MinHeight: 0,
          BorderWidth: 1,
          BorderColor: GalleryTheme.Border,
          BorderRadius: 8,
          BackgroundColor: Color.Rgb(12, 14, 18),
          Padding: 14,
          OverflowY: Overflow.Scroll,
          Children: {
            Container{
              Width: Length.Percent(100),
              FlexDirection: FlexDirection.Row,
              FlexWrap: FlexWrap.Wrap,
              Gap: 12,
              AlignItems: AlignItems.Stretch,
              Children: cards,
            },
          },
        },
        Container{
          Width: Length.Percent(100),
          Height: 26,
          PaddingLeft: 12,
          PaddingRight: 12,
          BackgroundColor: Color.FromNormalized(0.06F, 0.07F, 0.09F, 0.90F),
          BorderRadius: 4,
          BorderWidth: 1,
          BorderColor: GalleryTheme.Border,
          FlexDirection: FlexDirection.Row,
          AlignItems: AlignItems.Center,
          JustifyContent: JustifyContent.SpaceBetween,
          Children: {
            Text{
              Content: "Text input · switches · selection · stepper · range · progress · disclosure",
              FontSize: 10,
              FontWeight: 600,
              Color: GalleryTheme.InkMuted,
            },
            Text{
              Content: feedbackToastText,
              FontSize: 10,
              FontWeight: 700,
              Color: GalleryTheme.AccentStrong,
            },
          },
        },
      },
    }
  }

  override func Build() Blob {
    updateTelemetry()
    if Showcase == 0 {
      return GallerySpecimen(
        "Kinetic Physics & UI Dynamics",
        "Drag, fling with momentum, or tap anchors mid-flight; tune spring profiles and slow-motion; interact with spring UI components.",
        buildPhysicsLabContent())
    }
    return GallerySpecimen(
      "UI Component Gallery",
      "Interactive design system controls: text fields, steppers, animated switches, selection, sliders, progress, alerts, and disclosure.",
      buildComponentGalleryContent())
  }
}
