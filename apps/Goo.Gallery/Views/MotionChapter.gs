package GooGallery

import Goo
import System
import System.Collections.Generic
import System.Numerics

class MotionChapter : Cell {
    /// Gets or sets whether this chapter uses compact single-column sizing.
    public var Compact bool
    internal prop Active bool {
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
    private var active bool

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

    public init() {
        arenaHandle = ElementHandle{}
        physicsPuckPos = Animate(Point{X: 380.0, Y: 298.0})
        physicsPuckScale = Animate(1.0)
        physicsPuckColor = Animate(GalleryTheme.Accent)
        activeSpeed = 2
        pointerDownPos = Point{X: 380.0, Y: 298.0}
        lastMovePoint = Point{X: 380.0, Y: 298.0}
        targetAnchorIndex = 2
        lastTrackedPos = Point{X: 380.0, Y: 298.0}
        lastTrackedTick = Environment.TickCount64

        switchThumbX = Animate(3.0)
        switchTrackColor = Animate(Color.Rgb(39, 39, 42))
        switchScale = Animate(1.0)
        segmentPillX = Animate(0.0)
    }

    private func updateMotionActivity() {
        if active {
            applySpeed(activeSpeed)
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
        let w = if box.Width > 50.0 {
            box.Width
        } else {
            if Compact {
                400.0
            } else {
                760.0
            }
        }
        let h = if box.Height > 50.0 {
            box.Height
        } else {
            if Compact {
                320.0
            } else {
                620.0
            }
        }
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
        return Point{X: w * leftPct, Y: h * topPct}
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
        return Point{X: Math.Clamp(p.X, 28.0, maxX), Y: Math.Clamp(p.Y, 28.0, maxY),}
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
        let target = if targetAnchorIndex >= 0 {
            anchorPoint(targetAnchorIndex)
        } else {
            nearestAnchor(physicsPuckPos.Value)
        }
        physicsPuckPos.To(target, currentSpringSpec)
        Rebuild()
    }

    private func toggleSwitch() {
        switchOn = !switchOn
        let targetX = if switchOn {
            25.0
        } else {
            3.0
        }
        let targetColor = if switchOn {
            GalleryTheme.Accent
        } else {
            Color.Rgb(39, 39, 42)
        }
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
        let offset = if current.X < w * 0.5 {
            80.0
        } else {
            -80.0
        }
        let stepTarget = clampArenaPoint(Point{X: current.X + offset, Y: current.Y})
        physicsPuckPos.To(stepTarget, currentSpringSpec)
        Rebuild()
    }

    private func fireImpulseDirection(dx float64, dy float64) {
        let current = physicsPuckPos.Value
        let (w, h) = getArenaSize()
        let target = clampArenaPoint(Point{X: current.X + dx * (w * 0.28), Y: current.Y + dy * (h * 0.28),})
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
            System
                .IO
                .File
                .AppendAllText(
                "/tmp/goo_fling.log",
                "MOVE: pos=" +
                    e
                    .Position
                    .X
                    .ToString("F1") +
                    "," +
                    e
                    .Position
                    .Y
                    .ToString("F1") +
                    " win=" +
                    e
                    .WindowPosition
                    .X
                    .ToString("F1") +
                    "," +
                    e
                    .WindowPosition
                    .Y
                    .ToString("F1") +
                    " raw=" +
                    rawVx.ToString("F1") + "," + rawVy.ToString("F1") + " fling=" + flingVx.ToString("F1") +
                    "," +
                    flingVy.ToString("F1") + "\n"
            )
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
            System
                .IO
                .File
                .AppendAllText(
                "/tmp/goo_fling.log",
                "CLICK: pos=" +
                    e
                    .Position
                    .X
                    .ToString("F1") +
                    "," +
                    e
                    .Position
                    .Y
                    .ToString("F1") +
                    " target=" +
                    target
                    .X
                    .ToString("F1") + "," + target.Y.ToString("F1") + "\n"
            )
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
            let projected = clampArenaPoint(Point{X: current.X + flingVx * 0.22, Y: current.Y + flingVy * 0.22,})
            System
                .IO
                .File
                .AppendAllText(
                "/tmp/goo_fling.log",
                "FLING: speed=" + speed.ToString("F1") + " fling=" + flingVx.ToString("F1") + "," + flingVy.ToString(
                    "F1"
                ) +
                    " curr=" +
                    current
                    .X
                    .ToString("F1") + "," + current.Y.ToString("F1") + " proj=" + projected.X.ToString("F1") +
                    "," +
                    projected
                    .Y
                    .ToString("F1") + " dt=" + elapsedSinceMove.ToString() + "\n"
            )
            physicsPuckPos.To(projected, MotionVelocity.Components(flingVx, flingVy), currentSpringSpec)
        } else {
            System
                .IO
                .File
                .AppendAllText(
                "/tmp/goo_fling.log",
                "SLOW_DROP: speed=" + speed.ToString("F1") + " dt=" + elapsedSinceMove.ToString() + "\n"
            )
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

    private func actionBtn(label string, isAct bool, onClick Action) Button -> Button{
        PaddingLeft: 8,
        PaddingRight: 8,
        Height: 24,
        BackgroundColor: if isAct {
            GalleryTheme.Accent
        } else {
            GalleryTheme.SurfaceRaised
        },
        BorderWidth: 1,
        BorderColor: if isAct {
            GalleryTheme.AccentStrong
        } else {
            GalleryTheme.Border
        },
        BorderRadius: 4,
        Cursor: Cursor.Pointer,
        Focusable: true,
        TransitionMs: 100.0,
        Hover: Style{
            BackgroundColor: if isAct {
                GalleryTheme.Accent
            } else {
                Color.Rgb(36, 36, 42)
            },
            BorderColor: if isAct {
                GalleryTheme.AccentStrong
            } else {
                GalleryTheme.BorderStrong
            },
        },
        Active: Style{Transform: PanelTransform{Scale: 0.96},},
        OnClick: onClick,
        Text{
            Content: label,
            FontSize: 11,
            FontWeight: if isAct {
                700
            } else {
                500
            },
            Color: if isAct {
                Color.Rgb(255, 255, 255)
            } else {
                GalleryTheme.Ink
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
                0.28F
            ),
            Transform: PanelTransform{TranslateX: -24.0, TranslateY: -24.0, Scale: scale},
            AlignItems: AlignItems.Center,
            JustifyContent: JustifyContent.Center,
            Cursor: Cursor.Move,
            Container{Width: 16, Height: 16, BorderRadius: 8, BackgroundColor: color,},
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
            BorderColor: if isTarget {
                GalleryTheme.Accent
            } else {
                Color.Rgb(50, 50, 56)
            },
            BackgroundColor: if isTarget {
                Color.FromNormalized(0.39F, 0.40F, 0.95F, 0.22F)
            } else {
                Color.FromNormalized(0.12F, 0.12F, 0.15F, 0.60F)
            },
            Transform: PanelTransform{TranslateX: -16.0, TranslateY: -16.0},
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
                Transform: PanelTransform{TranslateX: -16.0, TranslateY: -16.0, Scale: 1.12},
            },
            OnPointerDown: func (e PointerEvent) {
                e.StopPropagation()
                e.PreventDefault()
                movePuckToAnchor(index)
            },
            OnClick: () -> movePuckToAnchor(index),
            Text{
                Content: label,
                FontSize: 9,
                FontWeight: 700,
                Color: if isTarget {
                    GalleryTheme.AccentStrong
                } else {
                    GalleryTheme.InkSubtle
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
            OnPointerDown: func (e PointerEvent) {
                e.StopPropagation()
                e.PreventDefault()
            },
            Container{
                FlexDirection: FlexDirection.Row,
                Gap: 14,
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
                    Color: if currentSpeed > 80.0 {
                        GalleryTheme.AccentStrong
                    } else {
                        GalleryTheme.InkSubtle
                    },
                },
            },
            Container{
                PaddingLeft: 6,
                PaddingRight: 6,
                Height: 18,
                BorderRadius: 4,
                BackgroundColor: if isRunning {
                    Color.FromNormalized(0.18F, 0.45F, 0.25F, 0.35F)
                } else {
                    Color.FromNormalized(0.2F, 0.2F, 0.25F, 0.35F)
                },
                BorderWidth: 1,
                BorderColor: if isRunning {
                    Color.Rgb(87, 188, 120)
                } else {
                    GalleryTheme.Border
                },
                AlignItems: AlignItems.Center,
                JustifyContent: JustifyContent.Center,
                Text{
                    Content: if isRunning {
                        "● ACTIVE SIM"
                    } else {
                        "○ SETTLED"
                    },
                    FontSize: 9,
                    FontWeight: 700,
                    Color: if isRunning {
                        Color.Rgb(87, 188, 120)
                    } else {
                        GalleryTheme.InkSubtle
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
            Container{
                FlexDirection: FlexDirection.Row,
                AlignItems: AlignItems.Center,
                JustifyContent: JustifyContent.SpaceBetween,
                Container{
                    FlexDirection: FlexDirection.Row,
                    Gap: 6,
                    AlignItems: AlignItems.Center,
                    Text{Content: "PRESET:", FontSize: 10, FontWeight: 700, Color: GalleryTheme.InkSubtle},
                    actionBtn("Bouncy", activeProfile == 0, () -> setProfile(0)),
                    actionBtn("Snappy", activeProfile == 1, () -> setProfile(1)),
                    actionBtn("Viscous", activeProfile == 2, () -> setProfile(2)),
                    actionBtn("Stiff", activeProfile == 3, () -> setProfile(3)),
                },
                Container{
                    FlexDirection: FlexDirection.Row,
                    Gap: 6,
                    AlignItems: AlignItems.Center,
                    Text{Content: "SPEED:", FontSize: 10, FontWeight: 700, Color: GalleryTheme.InkSubtle},
                    actionBtn("0.25x", activeSpeed == 0, () -> applySpeed(0)),
                    actionBtn("0.5x", activeSpeed == 1, () -> applySpeed(1)),
                    actionBtn("1.0x", activeSpeed == 2, () -> applySpeed(2)),
                    actionBtn("1.5x", activeSpeed == 3, () -> applySpeed(3)),
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
                Container{
                    Width: Length.Percent(100),
                    Height: Length.Percent(100),
                    Position: PositionType.Relative,
                    Children: arenaChildren,
                },
                Container{Position: PositionType.Absolute, Left: 0, Right: 0, Bottom: 0, telemetryBar(),},
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
        }
    }

    private func switchBlob() Blob -> Container{
        Width: Length.Percent(100),
        Padding: 10,
        BackgroundColor: GalleryTheme.SurfaceRaised,
        BorderWidth: 1,
        BorderColor: GalleryTheme.Border,
        BorderRadius: 8,
        FlexDirection: FlexDirection.Row,
        AlignItems: AlignItems.Center,
        JustifyContent: JustifyContent.SpaceBetween,
        Container{
            FlexDirection: FlexDirection.Column,
            Gap: 2,
            Text{Content: "Spring Toggle", FontSize: 12, FontWeight: 600, Color: GalleryTheme.Ink},
            Text{Content: "Elastic overshoot & chromatic track", FontSize: 10, Color: GalleryTheme.InkMuted},
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
            Container{
                Position: PositionType.Absolute,
                Left: switchThumbX.Value,
                Top: 3,
                Width: 22,
                Height: 22,
                BorderRadius: 11,
                BackgroundColor: Color.Rgb(255, 255, 255),
                Transform: PanelTransform{Scale: switchScale.Value},
            },
        },
    }

    private func segmentedTabsBlob() Blob {
        let tabs = []string{"Physics", "Telemetry", "Retarget"}
        let tabButtons = List[Blob]()
        var i = 0
        while i < 3 {
            let idx = i
            let isSel = selectedSegment == idx
            tabButtons.Add(
                Button{
                    Width: 72,
                    Height: 26,
                    AlignItems: AlignItems.Center,
                    JustifyContent: JustifyContent.Center,
                    BackgroundColor: Color.Transparent,
                    BorderWidth: 0,
                    Cursor: Cursor.Pointer,
                    Focusable: true,
                    OnClick: () -> selectSegment(idx),
                    Text{
                        Content: tabs[idx],
                        FontSize: 11,
                        FontWeight: if isSel {
                            700
                        } else {
                            500
                        },
                        Color: if isSel {
                            GalleryTheme.Ink
                        } else {
                            GalleryTheme.InkMuted
                        },
                    },
                }
            )
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
            Container{
                FlexDirection: FlexDirection.Row,
                AlignItems: AlignItems.Center,
                JustifyContent: JustifyContent.SpaceBetween,
                Text{Content: "Segmented Indicator", FontSize: 12, FontWeight: 600, Color: GalleryTheme.Ink},
                Text{Content: "Gliding pill", FontSize: 10, Color: GalleryTheme.InkMuted},
            },
            Container{
                Position: PositionType.Relative,
                Height: 28,
                BackgroundColor: Color.Rgb(15, 15, 17),
                BorderRadius: 6,
                BorderWidth: 1,
                BorderColor: GalleryTheme.Border,
                FlexDirection: FlexDirection.Row,
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
                Container{FlexDirection: FlexDirection.Row, Children: tabButtons,},
            },
            Text{Content: segmentText, FontSize: 10, Color: GalleryTheme.InkSubtle, LineHeight: 1.3,},
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
            Container{
                FlexDirection: FlexDirection.Row,
                AlignItems: AlignItems.Center,
                JustifyContent: JustifyContent.SpaceBetween,
                Text{Content: "Harmonic Dynamics", FontSize: 12, FontWeight: 600, Color: GalleryTheme.Ink},
                actionBtn("↺ Step", false, () -> testOscillation()),
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
        }
    }

    private func impulseBlob() Blob -> Container{
        Width: Length.Percent(100),
        Padding: 8,
        BackgroundColor: GalleryTheme.SurfaceRaised,
        BorderWidth: 1,
        BorderColor: GalleryTheme.Border,
        BorderRadius: 8,
        FlexDirection: FlexDirection.Column,
        Gap: 6,
        Container{
            FlexDirection: FlexDirection.Row,
            AlignItems: AlignItems.Center,
            JustifyContent: JustifyContent.SpaceBetween,
            Text{Content: "Elastic Momentum", FontSize: 11, FontWeight: 600, Color: GalleryTheme.Ink},
            Container{
                FontFamily: GalleryTheme.GalleryFontFamily,
                FlexDirection: FlexDirection.Row,
                Gap: 4,
                actionBtn("↖", false, () -> fireImpulseDirection(-1.0, -1.0)),
                actionBtn("↗", false, () -> fireImpulseDirection(1.0, -1.0)),
                actionBtn("↙", false, () -> fireImpulseDirection(-1.0, 1.0)),
                actionBtn("↘", false, () -> fireImpulseDirection(1.0, 1.0)),
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
            TransitionMs: 80.0,
            Hover: Style{BackgroundColor: GalleryTheme.AccentStrong},
            OnClick: () -> triggerImpulse(),
            Text{
                Content: "⚡ FIRE 2D IMPULSE",
                FontSize: 11,
                FontWeight: 700,
                LetterSpacing: 0.5,
                Color: Color.Rgb(255, 255, 255),
            },
        },
    }

    private func buildCompanionControlsSection() Container {
        let panelWidth Length = 280
        let panelMinWidth Length = 0
        let width Length = if Compact {
            Length.Percent(100)
        } else {
            panelWidth
        }
        let minWidth Length = if Compact {
            panelMinWidth
        } else {
            panelWidth
        }
        return Container{
            Width: width,
            MinWidth: minWidth,
            FlexShrink: 0.0,
            FlexGrow: 1.0,
            MinHeight: 0,
            FlexDirection: FlexDirection.Column,
            Gap: 8,
            switchBlob(),
            segmentedTabsBlob(),
            harmonicProfileBlob(),
            impulseBlob(),
        }
    }

    private func buildPhysicsLabContent() Blob -> Container{
        Width: Length.Percent(100),
        Height: Length.Percent(100),
        FlexGrow: 1.0,
        FlexShrink: 1.0,
        MinHeight: 0,
        MinWidth: 0,
        FlexDirection: if Compact {
            FlexDirection.Column
        } else {
            FlexDirection.Row
        },
        Gap: 14,
        buildArenaSection(),
        buildCompanionControlsSection(),
    }

    override func Build() Blob {
        updateTelemetry()
        return GallerySpecimen(
            "Kinetic Physics & UI Dynamics",
            "Drag, fling with momentum, or tap anchors mid-flight; tune spring profiles and slow-motion.",
            buildPhysicsLabContent()
        )
    }
}
