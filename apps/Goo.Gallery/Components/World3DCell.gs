package GooGallery

import Goo
import System
import System.Collections.Generic
import System.Numerics

class World3DCell : Cell {
    private let Canvas ElementHandle
    private let clock Anim[float64]
    private let state World3DState
    private let simulation World3DSimulation
    private var lastTime float64
    private var keyW bool
    private var keyA bool
    private var keyS bool
    private var keyD bool
    private var focused bool
    private var dragging bool
    private var pointerX float64
    private var pointerY float64
    private var pointerPressure float64
    private var pointerDown bool

    internal var Effect ShaderEffect?
    internal var Fov float64
    internal var Contrast float64
    internal var Fog float64
    internal var Playing bool

    public init() {
        Canvas = ElementHandle{}
        clock = Animate(0.0)
        state = World3DState()
        simulation = World3DSimulation(state)
        clock.To(
            1000000000.0,
            (start float64, target float64, velocity float64) -> {
                return GalleryClockSimulation(0.0)
            }
        )
        lastTime = 0.0
        keyW = false
        keyA = false
        keyS = false
        keyD = false
        focused = false
        dragging = false
        pointerX = 0.5
        pointerY = 0.5
        pointerPressure = 0.0
        pointerDown = false
        Effect = nil
        Fov = 1.0
        Contrast = 1.0
        Fog = 0.35
        Playing = true
    }

    private func keyHandled(key Key) bool -> key == Key.W || key == Key.A || key == Key.S || key == Key.D
    || key == Key.Up || key == Key.Down || key == Key.Left || key == Key.Right || key == Key.R

    private func setKey(key Key, value bool) {
        if key == Key.W || key == Key.Up {
            keyW = value
        } else if key == Key.A || key == Key.Left {
            keyA = value
        } else if key == Key.S || key == Key.Down {
            keyS = value
        } else if key == Key.D || key == Key.Right {
            keyD = value
        }
    }

    private func forwardInput() float64 {
        var value float64 = 0.0
        if keyW {
            value = value + 1.0
        }
        if keyS {
            value = value - 1.0
        }
        return value
    }

    private func strafeInput() float64 {
        var value float64 = 0.0
        if keyA {
            value = value + 1.0
        }
        if keyD {
            value = value - 1.0
        }
        return value
    }

    private func statusFlags() float64 {
        var flags int32 = 0
        if state.Dead {
            flags = flags | 1
        }
        if state.Won {
            flags = flags | 2
        }
        if state.ReloadTimer > 0.0 {
            flags = flags | 4
        }
        if state.HitFlash > 0.0 {
            flags = flags | 8
        }
        if state.DryFlash > 0.0 {
            flags = flags | 16
        }
        if state.MuzzleTimer > 0.0 || pointerDown {
            flags = flags | 32
        }
        if state.DamageFlash > 0.0 {
            flags = flags | 64
        }
        let reloadProgress = if state.ReloadTimer > 0.0 {
            1.0 - state.ReloadTimer / 1.15
        } else {
            0.0
        }
        return float64(flags) + Math.Clamp(reloadProgress, 0.0, 0.99)
    }

    private func syncParameters(time float64) {
        guard let effect = Effect else {
            return
        }
        let bounds = Canvas.BorderBox
        let playing = if Playing {
            1.0F
        } else {
            0.0F
        }
        effect.SetParameter(0, Vector4(float32(time), float32(bounds.Width), float32(bounds.Height), playing))
        effect.SetParameter(
            1,
            Vector4(
                float32(pointerX),
                float32(pointerY),
                float32(pointerPressure),
                if pointerDown {
                    1.0F
                } else {
                    0.0F
                }
            )
        )
        effect.SetParameter(
            2,
            Vector4(
                float32(state.CameraX),
                float32(state.CameraY),
                float32(Math.Cos(state.CameraAngle)),
                float32(Math.Sin(state.CameraAngle))
            )
        )
        effect.SetParameter(3, Vector4(float32(Fov), float32(Contrast), float32(Fog), float32(state.DefeatedMask)))
        effect.SetParameter(
            4,
            Vector4(
                float32(Math.Clamp(state.Health / 100.0, 0.0, 1.0)),
                float32(state.Ammo),
                float32(state.ReserveAmmo),
                float32(statusFlags())
            )
        )
        effect.SetParameter(
            5,
            Vector4(
                float32(state.EnemyX[0]),
                float32(state.EnemyY[0]),
                float32(state.EnemyX[1]),
                float32(state.EnemyY[1])
            )
        )
        effect.SetParameter(
            6,
            Vector4(
                float32(state.EnemyX[2]),
                float32(state.EnemyY[2]),
                float32(state.EnemyX[3]),
                float32(state.EnemyY[3])
            )
        )
        effect.SetParameter(
            7,
            Vector4(
                float32(state.EnemyX[4]),
                float32(state.EnemyY[4]),
                float32(state.EnemyX[5]),
                float32(state.EnemyY[5])
            )
        )
    }

    override func Build() Blob {
        let time = clock.Value
        let dt = Math.Clamp(time - lastTime, 0.0, 0.1)
        lastTime = time
        let stepDt = if Playing {
            dt
        } else {
            0.0
        }
        simulation.Step(stepDt, forwardInput(), strafeInput())
        syncParameters(time)

        let overlayChildren = List[Blob]()
        if state.Dead {
            overlayChildren.Add(
                Container{
                    Position: PositionType.Absolute,
                    Left: Length.Percent(0),
                    Top: Length.Percent(0),
                    Width: Length.Percent(100),
                    Height: Length.Percent(100),
                    BackgroundColor: Color.Rgba(36, 0, 0, 180),
                    AlignItems: AlignItems.Center,
                    JustifyContent: JustifyContent.Center,
                    FlexDirection: FlexDirection.Column,
                    Text{
                        Content: "YOU DIED",
                        FontSize: 56,
                        FontWeight: 900,
                        LetterSpacing: 4.0,
                        Color: Color.Rgb(255, 36, 24),
                    },
                    Text{
                        Content: "PRESS R OR CLICK TO RESPAWN",
                        FontSize: 16,
                        FontWeight: 600,
                        LetterSpacing: 1.5,
                        Color: Color.Rgb(220, 220, 220),
                        Margin: Edges{Top: 14},
                    },
                }
            )
        } else if state.Won {
            overlayChildren.Add(
                Container{
                    Position: PositionType.Absolute,
                    Left: Length.Percent(0),
                    Top: Length.Percent(0),
                    Width: Length.Percent(100),
                    Height: Length.Percent(100),
                    BackgroundColor: Color.Rgba(0, 36, 12, 180),
                    AlignItems: AlignItems.Center,
                    JustifyContent: JustifyContent.Center,
                    FlexDirection: FlexDirection.Column,
                    Text{
                        Content: "SECTOR CLEARED",
                        FontSize: 56,
                        FontWeight: 900,
                        LetterSpacing: 4.0,
                        Color: Color.Rgb(48, 240, 96),
                    },
                    Text{
                        Content: "ALL DEMONS PURGED · PRESS R OR CLICK TO RESTART",
                        FontSize: 16,
                        FontWeight: 600,
                        LetterSpacing: 1.5,
                        Color: Color.Rgb(200, 240, 210),
                        Margin: Edges{Top: 14},
                    },
                }
            )
        }

        return Container{
            Width: Length.Percent(100),
            AspectRatio: 16.0 / 9.0,
            Children: overlayChildren,
            Handle: Canvas,
            BackgroundColor: GalleryTheme.SurfaceRaised,
            ShaderEffect: Effect,
            Focusable: true,
            OnFocus: func (e FocusEvent) {
                focused = true
            },
            OnBlur: func (e FocusEvent) {
                focused = false
                keyW = false
                keyA = false
                keyS = false
                keyD = false
                dragging = false
                pointerDown = false
            },
            OnPointerDown: func (e PointerEvent) {
                focused = true
                Canvas.Focus()
                e.Capture()
                e.PreventDefault()
                dragging = true
                let bounds = Canvas.BorderBox
                pointerX = Math.Clamp(e.Position.X / Math.Max(bounds.Width, 1.0), 0.0, 1.0)
                pointerY = Math.Clamp(e.Position.Y / Math.Max(bounds.Height, 1.0), 0.0, 1.0)
                pointerPressure = e.Pressure
                pointerDown = e.Button == PointerButton.Primary
                if pointerDown {
                    if state.IsTerminal() {
                        simulation.Reset()
                        pointerDown = false
                    } else {
                        simulation.TryFire()
                    }
                }
                Rebuild()
            },
            OnPointerMove: func (e PointerEvent) {
                if dragging && !state.IsTerminal() {
                    state.CameraAngle = state.CameraAngle + e.Delta.X * 0.008
                }
                let bounds = Canvas.BorderBox
                pointerX = Math.Clamp(e.Position.X / Math.Max(bounds.Width, 1.0), 0.0, 1.0)
                pointerY = Math.Clamp(e.Position.Y / Math.Max(bounds.Height, 1.0), 0.0, 1.0)
                pointerPressure = e.Pressure
                Rebuild()
            },
            OnPointerUp: func (e PointerEvent) {
                dragging = false
                pointerDown = false
                pointerPressure = 0.0
                e.ReleaseCapture()
                Rebuild()
            },
            OnPointerCancel: func (e PointerEvent) {
                dragging = false
                pointerDown = false
                pointerPressure = 0.0
                e.ReleaseCapture()
                Rebuild()
            },
            OnKeyDown: func (e KeyEvent) {
                if keyHandled(e.Key) {
                    e.PreventDefault()
                    if e.Key == Key.R {
                        if state.IsTerminal() {
                            simulation.Reset()
                        } else {
                            simulation.Reload()
                        }
                    } else {
                        setKey(e.Key, true)
                    }
                    Rebuild()
                }
            },
            OnKeyUp: func (e KeyEvent) {
                if keyHandled(e.Key) {
                    e.PreventDefault()
                    if e.Key != Key.R {
                        setKey(e.Key, false)
                    }
                }
            },
        }
    }
}
