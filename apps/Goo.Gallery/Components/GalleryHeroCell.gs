package GooGallery

import Goo
import System
import System.Numerics

class HeroCell : Cell {
    /// Gets or sets the compiled shader program suite.
    public var Programs GalleryShaderPrograms?
    /// Gets or sets whether the hero renders in compact layout.
    public var Compact bool
    internal prop Active bool {
        get -> active
        set {
            if active != value {
                active = value
                Rebuild()
            }
        }
    }

    private let hostHandle ElementHandle
    private let gPosition Anim[Point]
    private let firstOPosition Anim[Point]
    private let secondOPosition Anim[Point]
    private var active bool
    private var layoutMode int32
    private var pointerX float64
    private var pointerY float64
    private var pressure float64
    private var pointerDown bool
    private var draggingAnchor int32
    private var previousGPosition Point
    private var previousFirstOPosition Point
    private var previousSecondOPosition Point
    private var gVelocity Point
    private var firstOVelocity Point
    private var secondOVelocity Point
    private var velocityTick int64

    public init() {
        Programs = nil
        Compact = false
        active = false
        hostHandle = ElementHandle{}
        gPosition = Animate(Point{X: 0.35, Y: 0.5})
        firstOPosition = Animate(Point{X: 0.50, Y: 0.5})
        secondOPosition = Animate(Point{X: 0.65, Y: 0.5})
        previousGPosition = Point{X: 0.35, Y: 0.5}
        previousFirstOPosition = Point{X: 0.50, Y: 0.5}
        previousSecondOPosition = Point{X: 0.65, Y: 0.5}
        gVelocity = Point{X: 0.0, Y: 0.0}
        firstOVelocity = Point{X: 0.0, Y: 0.0}
        secondOVelocity = Point{X: 0.0, Y: 0.0}
        velocityTick = Environment.TickCount64
        layoutMode = 0
        pointerX = 0.5
        pointerY = 0.5
        pressure = 0.0
        pointerDown = false
        draggingAnchor = -1
    }

    private func restPosition(index int32) Point {
        if layoutMode == 1 {
            if index == 0 {
                return Point{X: 0.50, Y: 0.26}
            }
            if index == 1 {
                return Point{X: 0.50, Y: 0.50}
            }
            return Point{X: 0.50, Y: 0.74}
        }
        if layoutMode == 2 {
            if index == 0 {
                return Point{X: 0.50, Y: 0.32}
            }
            if index == 1 {
                return Point{X: 0.40, Y: 0.62}
            }
            return Point{X: 0.60, Y: 0.62}
        }
        if layoutMode == 3 {
            if index == 0 {
                return Point{X: 0.44, Y: 0.44}
            }
            if index == 1 {
                return Point{X: 0.56, Y: 0.44}
            }
            return Point{X: 0.50, Y: 0.60}
        }
        if index == 0 {
            return Point{X: 0.35, Y: 0.50}
        }
        if index == 1 {
            return Point{X: 0.50, Y: 0.50}
        }
        return Point{X: 0.65, Y: 0.50}
    }

    private func trackedVelocity(current Point, previous Point, prior Point, seconds float64, running bool) Point {
        let safeSeconds = Math.Max(seconds, 0.001)
        let rawX = Math.Clamp((current.X - previous.X) / safeSeconds, -3.0, 3.0)
        let rawY = Math.Clamp((current.Y - previous.Y) / safeSeconds, -3.0, 3.0)
        let targetX = if running {
            rawX
        } else {
            0.0
        }
        let targetY = if running {
            rawY
        } else {
            0.0
        }
        let smoothing = 1.0 - Math.Exp(-seconds * 12.0)
        return Point{X: prior.X + (targetX - prior.X) * smoothing, Y: prior.Y + (targetY - prior.Y) * smoothing,}
    }

    private func updateCellVelocities(g Point, firstO Point, secondO Point) {
        let tick = Environment.TickCount64
        let elapsed = tick - velocityTick
        if elapsed <= 0 {
            return
        }
        let seconds = Math.Clamp(float64(elapsed) / 1000.0, 1.0 / 240.0, 0.05)
        gVelocity = trackedVelocity(g, previousGPosition, gVelocity, seconds, gPosition.Running)
        firstOVelocity = trackedVelocity(
            firstO,
            previousFirstOPosition,
            firstOVelocity,
            seconds,
            firstOPosition.Running
        )
        secondOVelocity = trackedVelocity(
            secondO,
            previousSecondOPosition,
            secondOVelocity,
            seconds,
            secondOPosition.Running
        )
        previousGPosition = g
        previousFirstOPosition = firstO
        previousSecondOPosition = secondO
        velocityTick = tick
    }

    private func currentPosition(index int32) Point {
        if index == 0 {
            return gPosition.Value
        }
        if index == 1 {
            return firstOPosition.Value
        }
        return secondOPosition.Value
    }

    private func moveAnchor(index int32, target Point) {
        if index == 0 {
            gPosition.To(target, GalleryGooSpringSpec)
        } else if index == 1 {
            firstOPosition.To(target, GalleryGooSpringSpec)
        } else {
            secondOPosition.To(target, GalleryGooSpringSpec)
        }
    }

    private func followAnchor(index int32, target Point) {
        if index == 0 {
            gPosition.To(target, GalleryGooFollowSpec)
        } else if index == 1 {
            firstOPosition.To(target, GalleryGooFollowSpec)
        } else {
            secondOPosition.To(target, GalleryGooFollowSpec)
        }
    }

    private func returnToFrame() {
        for index in 0 ... 3 {
            moveAnchor(index, restPosition(index))
        }
    }

    private func setLayout(next int32) {
        layoutMode = next
        pointerDown = false
        draggingAnchor = -1
        returnToFrame()
        Rebuild()
    }

    private func layoutButtonLabel(index int32, name string) string {
        if layoutMode == index {
            return "• " + name
        }
        return name
    }

    private func updatePointer(e PointerEvent) {
        let bounds = hostHandle.BorderBox
        let width = if bounds.Width > 0.0 {
            bounds.Width
        } else {
            1.0
        }
        let height = if bounds.Height > 0.0 {
            bounds.Height
        } else {
            1.0
        }
        pointerX = Math.Clamp(e.Position.X / width, 0.0, 1.0)
        pointerY = Math.Clamp(e.Position.Y / height, 0.0, 1.0)
        pressure = if pointerDown {
            Math.Max(e.Pressure, 0.55)
        } else {
            e.Pressure
        }
    }

    private func anchorAtPointer() int32 {
        let bounds = hostHandle.BorderBox
        if bounds.Width <= 0.0 || bounds.Height <= 0.0 {
            return -1
        }
        let hitRadius = if Compact {
            46.0
        } else {
            64.0
        }
        let hitRadiusSquared = hitRadius * hitRadius
        var hit int32 = -1
        var hitDistance = Double.MaxValue
        for index in 0 ... 3 {
            let point = currentPosition(index)
            let dx = point.X * bounds.Width - pointerX * bounds.Width
            let dy = point.Y * bounds.Height - pointerY * bounds.Height
            let distance = dx * dx + dy * dy
            if distance <= hitRadiusSquared && distance < hitDistance {
                hit = index
                hitDistance = distance
            }
        }
        return hit
    }

    private func pullMaterial() {
        if draggingAnchor < 0 {
            return
        }
        let target = Point{X: Math.Clamp(pointerX, 0.08, 0.92), Y: Math.Clamp(pointerY, 0.1, 0.9),}
        let origin = restPosition(draggingAnchor)
        let deltaX = target.X - origin.X
        let deltaY = target.Y - origin.Y
        for index in 0 ... 3 {
            if index == draggingAnchor {
                followAnchor(index, target)
            } else {
                let rest = restPosition(index)
                followAnchor(index, Point{X: rest.X + deltaX * 0.15, Y: rest.Y + deltaY * 0.15,})
            }
        }
    }

    private func letter(key string, content string, index int32, size float64) Blob {
        let point = currentPosition(index)
        return Container(){
            .Key: key,
            .Position: PositionType.Absolute,
            .Left: Length.Percent(point.X * 100.0),
            .Top: Length.Percent(point.Y * 100.0),
            .Width: size,
            .Height: size,
            .Transform: PanelTransform{TranslateX: -size * 0.5, TranslateY: -size * 0.5,},
            .JustifyContent: JustifyContent.Center,
            .AlignItems: AlignItems.Center,
            Text{
                Content: content,
                FontSize: if index == 0 {
                    size * 0.70
                } else {
                    size * 0.76
                },
                FontWeight: 850,
                LetterSpacing: -3,
                Color: GalleryTheme.Ink,
                TextAlign: TextAlign.Center,
            },
        }
    }

    override func Build() Blob {
        guard let programs = Programs else {
            return Container{
                Width: Length.Percent(100),
                Height: Length.Percent(100),
                BackgroundColor: GalleryTheme.Background,
            }
        }
        let effect = programs.Hero
        var liveEffect ShaderEffect? = nil
        let bounds = hostHandle.BorderBox
        let letterSize = if Compact {
            80.0
        } else {
            108.0
        }
        let radius = 0.135
        let g = gPosition.Value
        let firstO = firstOPosition.Value
        let secondO = secondOPosition.Value
        updateCellVelocities(g, firstO, secondO)
        if Active {
            liveEffect = effect
            effect.SetParameter(0, Vector4(0.0F, 960.0F, 540.0F, 1.0F))
            effect.SetParameter(
                1,
                Vector4(
                    float32(pointerX),
                    float32(pointerY),
                    float32(pressure),
                    if pointerDown {
                        1.0F
                    } else {
                        0.0F
                    }
                )
            )
            effect.SetParameter(2, Vector4(float32(g.X), float32(g.Y), float32(radius), 1.0F))
            effect.SetParameter(3, Vector4(float32(firstO.X), float32(firstO.Y), float32(radius), 1.0F))
            effect.SetParameter(4, Vector4(float32(secondO.X), float32(secondO.Y), float32(radius), 1.0F))
            effect.SetParameter(5, Vector4(float32(layoutMode), 0.0F, float32(draggingAnchor), 0.0F))
            effect.SetParameter(
                6,
                Vector4(
                    float32(gVelocity.X),
                    float32(gVelocity.Y),
                    float32(firstOVelocity.X),
                    float32(firstOVelocity.Y)
                )
            )
            effect.SetParameter(7, Vector4(float32(secondOVelocity.X), float32(secondOVelocity.Y), 0.0F, 0.0F))
        }
        let content = Container(){
            .Width: Length.Percent(100),
            .Height: Length.Percent(100),
            .FlexGrow: 1.0,
            .FlexShrink: 1.0,
            .MinHeight: 0,
            .FlexDirection: FlexDirection.Column,
            .Gap: 10,
            Container(){
                .Key: "goo-memory-surface",
                .Handle: hostHandle,
                .Width: Length.Percent(100),
                .MinHeight: 0,
                .FlexGrow: 1.0,
                .FlexShrink: 1.0,
                .Position: PositionType.Relative,
                .BackgroundColor: Color.Rgb(9, 11, 16),
                .BorderRadius: 8,
                .BorderWidth: 1,
                .BorderColor: GalleryTheme.BorderStrong,
                .ShaderEffect: liveEffect,
                .Cursor: if pointerDown {
                    Cursor.Move
                } else if anchorAtPointer() >= 0 {
                    Cursor.Pointer
                } else {
                    Cursor.Default
                },
                .Focusable: true,
                .Accessibility: Accessibility{
                    Role: AccessibilityRole.Generic,
                    Name: "Goo has shape memory. Grab a letter and release to reform.",
                },
                .OnPointerDown: (e PointerEvent) -> {
                    updatePointer(e)
                    let hit = anchorAtPointer()
                    if hit >= 0 {
                        e.Capture()
                        e.PreventDefault()
                        pointerDown = true
                        draggingAnchor = hit
                        pullMaterial()
                        Rebuild()
                    }
                },
                .OnPointerMove: (e PointerEvent) -> {
                    updatePointer(e)
                    if pointerDown {
                        pullMaterial()
                    }
                    Rebuild()
                },
                .OnPointerUp: (e PointerEvent) -> {
                    if pointerDown {
                        e.ReleaseCapture()
                        updatePointer(e)
                        pointerDown = false
                        pressure = 0.0
                        draggingAnchor = -1
                        returnToFrame()
                        Rebuild()
                    }
                },
                .OnPointerCancel: (e PointerEvent) -> {
                    if pointerDown {
                        e.ReleaseCapture()
                        pointerDown = false
                        pressure = 0.0
                        draggingAnchor = -1
                        returnToFrame()
                        Rebuild()
                    }
                },
                Text{
                    Key: "goo-memory-heading",
                    Position: PositionType.Absolute,
                    Left: 18,
                    Top: 16,
                    Content: "GOO HAS SHAPE MEMORY",
                    FontSize: 11,
                    FontWeight: 750,
                    LetterSpacing: 1.5,
                    Color: GalleryTheme.InkMuted,
                },
                letter("goo-letter-g", "G", 0, letterSize),
                letter("goo-letter-o1", "o", 1, letterSize),
                letter("goo-letter-o2", "o", 2, letterSize),
            },
            Container(){
                .Key: "goo-memory-controls",
                .Width: Length.Percent(100),
                .FlexDirection: FlexDirection.Row,
                .FlexWrap: FlexWrap.Wrap,
                .Gap: 8,
                GalleryTheme.GhostButton(layoutButtonLabel(0, "Wordmark"), () -> setLayout(0)),
                GalleryTheme.GhostButton(layoutButtonLabel(1, "Stack"), () -> setLayout(1)),
                GalleryTheme.GhostButton(layoutButtonLabel(2, "Orbit"), () -> setLayout(2)),
                GalleryTheme.GhostButton(layoutButtonLabel(3, "Knot"), () -> setLayout(3)),
            },
        }
        return GallerySpecimen("Goo Shape Memory", "Pull it apart. It remembers where it belongs.", content)
    }
}
