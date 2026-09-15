package GooGallery

import Goo
import System

class GalleryRange : Cell {
    /// Gets or sets the descriptive label for this slider.
    public var Label string
    /// Gets or sets the minimum value for this slider.
    public var MinValue float64
    /// Gets or sets the maximum value for this slider.
    public var MaxValue float64
    /// Gets or sets the current value for this slider.
    public var Value float64
    /// Gets or sets the quantization step size for this slider.
    public var Step float64
    /// Gets or sets the callback invoked when the slider value changes.
    public var OnChange Action[float64]?
    private var dragging bool
    private let Track ElementHandle

    public init() {
        Label = ""
        MinValue = 0.0
        MaxValue = 1.0
        Value = 0.5
        Step = 0.0
        OnChange = nil
        dragging = false
        Track = ElementHandle{}
    }

    /// Sets the current value clamped to the valid range and quantized by step size.
    public func SetValue(value float64) {
        let bounded = Math.Clamp(quantized(value), MinValue, MaxValue)
        if bounded != Value {
            Value = bounded
            if let callback = OnChange {
                callback(bounded)
            }
        }
    }

    private func quantized(value float64) float64 {
        if Step <= 0.0 {
            return value
        }
        let steps = Math.Floor((value - MinValue) / Step + 0.5)
        return MinValue + steps * Step
    }

    private func fraction() float64 {
        if MaxValue <= MinValue {
            return 0.0
        }
        return Math.Clamp((Value - MinValue) / (MaxValue - MinValue), 0.0, 1.0)
    }

    private func valueFromFraction(part float64) float64 -> MinValue + Math.Clamp(part, 0.0, 1.0) * (
        MaxValue - MinValue
    )

    private func stride() float64 {
        if Step > 0.0 {
            return Step
        }
        return (MaxValue - MinValue) / 50.0
    }

    private func valueText() string {
        let scale = 1.0 / Math.Max(Step, 0.000001)
        let digits = if scale >= 100.0 {
            2
        } else {
            if scale >= 10.0 {
                1
            } else {
                0
            }
        }
        let power = Math.Pow(10.0, float64(digits))
        let rounded = Math.Round(Value * power) / power
        let format = if digits == 2 {
            "F2"
        } else {
            if digits == 1 {
                "F1"
            } else {
                "F0"
            }
        }
        return rounded.ToString(format)
    }

    private func valueFromPointer(e PointerEvent) float64 {
        let width = Track.BorderBox.Width
        if width <= 0.0 {
            return Value
        }
        return valueFromFraction(e.Position.X / width)
    }

    private func applyKeys(e KeyEvent) {
        if e.Key == Key.Left {
            e.PreventDefault()
            SetValue(Value - stride())
        } else {
            if e.Key == Key.Right {
                e.PreventDefault()
                SetValue(Value + stride())
            } else {
                if e.Key == Key.Home {
                    e.PreventDefault()
                    SetValue(MinValue)
                } else {
                    if e.Key == Key.End {
                        e.PreventDefault()
                        SetValue(MaxValue)
                    }
                }
            }
        }
    }

    private func handleAction(request AccessibilityActionRequest) bool {
        if request.Action == AccessibilityAction.Increment {
            SetValue(Value + stride())
            Rebuild()
            return true
        }
        if request.Action == AccessibilityAction.Decrement {
            SetValue(Value - stride())
            Rebuild()
            return true
        }
        if request.Action == AccessibilityAction.SetValue {
            if Double.TryParse(request.Value, out var parsed) {
                SetValue(parsed)
                Rebuild()
                return true
            }
            return false
        }
        return false
    }

    override func Build() Blob {
        let percent = fraction() * 100.0
        return Container{
            FlexDirection: FlexDirection.Column,
            Gap: 8,
            Container{
                Key: "head",
                FlexDirection: FlexDirection.Row,
                JustifyContent: JustifyContent.SpaceBetween,
                Text{
                    Key: "label",
                    Content: Label,
                    FontSize: 12,
                    FontWeight: 600,
                    LetterSpacing: 0.3,
                    TextTransform: TextTransform.Uppercase,
                    Color: GalleryTheme.InkSubtle,
                },
                Text{Key: "value", Content: valueText(), FontSize: 12, Color: GalleryTheme.InkMuted,},
            },
            Container{
                Key: "track",
                Handle: Track,
                Focusable: true,
                Cursor: Cursor.Pointer,
                Height: 24,
                MinWidth: 120,
                FlexDirection: FlexDirection.Row,
                AlignItems: AlignItems.Center,
                TransitionMs: 100.0,
                Hover: Style{Opacity: 0.9},
                Focus: Style{OutlineWidth: 1, OutlineColor: GalleryTheme.BorderStrong, OutlineOffset: 2,},
                Accessibility: Accessibility{
                    Role: AccessibilityRole.Slider,
                    Name: Label,
                    Orientation: AccessibilityOrientation.Horizontal,
                    Range: AccessibilityValue{Minimum: MinValue, Maximum: MaxValue, Now: Value, Text: valueText(),},
                    Actions: []AccessibilityAction{
                        AccessibilityAction.Increment,
                        AccessibilityAction.Decrement,
                        AccessibilityAction.SetValue,
                    },
                    OnAction: (request AccessibilityActionRequest) -> handleAction(request),
                },
                OnKeyDown: func (e KeyEvent) {
                    applyKeys(e)
                },
                OnPointerDown: func (e PointerEvent) {
                    e.Capture()
                    e.PreventDefault()
                    dragging = true
                    SetValue(valueFromPointer(e))
                },
                OnPointerMove: func (e PointerEvent) {
                    if dragging {
                        SetValue(valueFromPointer(e))
                    }
                },
                OnPointerUp: func (e PointerEvent) {
                    e.ReleaseCapture()
                    dragging = false
                },
                OnPointerCancel: func (e PointerEvent) {
                    e.ReleaseCapture()
                    dragging = false
                },
                OnWheel: func (e WheelEvent) {
                    e.PreventDefault()
                    SetValue(Value - stride() * float64(Math.Sign(e.Delta.Y)))
                },
                Container{
                    Key: "bar",
                    FlexGrow: 1.0,
                    FlexShrink: 1.0,
                    MinWidth: 0,
                    Height: 4,
                    BorderRadius: 2,
                    BackgroundColor: GalleryTheme.Border,
                    Position: PositionType.Relative,
                    Container{
                        Key: "fill",
                        Position: PositionType.Absolute,
                        Left: 0,
                        Top: 0,
                        Width: Length.Percent(percent),
                        Height: 4,
                        BorderRadius: 2,
                        BackgroundColor: GalleryTheme.InkMuted,
                    },
                    Container{
                        Key: "thumb",
                        Position: PositionType.Absolute,
                        Left: Length.Percent(percent),
                        Top: -4,
                        Width: 12,
                        Height: 12,
                        BorderRadius: 6,
                        BackgroundColor: GalleryTheme.Ink,
                        Transform: PanelTransform{TranslateX: -6.0},
                    },
                },
            },
        }
    }
}
