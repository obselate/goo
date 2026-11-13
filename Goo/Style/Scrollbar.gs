package Goo

import System

/// Controls one built-in scrollbar axis.
public enum ScrollbarVisibility {
    Auto;
    Always;
    Hidden
}

/// Describes the presentation and interaction of one built-in scrollbar axis.
public sealed class Scrollbar {
  private var frozenOwner Type?

  internal func Freeze(owner Type, depth int32) {
    if frozenOwner != nil { return }
    frozenOwner = owner
    Track?.Freeze(true, depth + 1)
    Thumb?.Freeze(true, depth + 1)
  }

  private func CheckMutable() {
    if let owner = frozenOwner {
      throw InvalidOperationException(owner.Name + " modified after it was returned to Goo")
    }
  }
    private var thickness float64
    private var hitThickness float64
    private var inset float64
    private var minThumbLength float64
    private var hideDelayMs float64
    private var fadeMs float64
    private var reserveSpace bool
    private var track Container?
    private var thumb Container?

    /// Gets the track thickness.
    public prop Thickness float64 {
        get -> thickness
        set {
          CheckMutable()
          thickness = checkedScrollbarValue(value, "Thickness", true)
        }
    }
    /// Gets the pointer hit thickness.
    public prop HitThickness float64 {
        get -> hitThickness
        set {
          CheckMutable()
          hitThickness = checkedScrollbarValue(value, "HitThickness", false)
        }
    }
    /// Gets the inset from the content edge.
    public prop Inset float64 {
        get -> inset
        set {
          CheckMutable()
          inset = checkedScrollbarValue(value, "Inset", false)
        }
    }
    /// Gets the minimum thumb length.
    public prop MinThumbLength float64 {
        get -> minThumbLength
        set {
          CheckMutable()
          minThumbLength = checkedScrollbarValue(value, "MinThumbLength", true)
        }
    }
    /// Gets the delay before automatic hiding.
    public prop HideDelayMs float64 {
        get -> hideDelayMs
        set {
          CheckMutable()
          hideDelayMs = checkedScrollbarValue(value, "HideDelayMs", false)
        }
    }
    /// Gets the fade duration after automatic hiding starts.
    public prop FadeMs float64 {
        get -> fadeMs
        set {
          CheckMutable()
          fadeMs = checkedScrollbarValue(value, "FadeMs", false)
        }
    }
    /// Gets whether the overflowing content reserves a gutter.
    public prop ReserveSpace bool {
        get -> reserveSpace;
        set {
          CheckMutable()
          reserveSpace = value
        }
    }
    /// Gets the optional track element. It gets `Hover` while the pointer is over the scrollbar.
    public prop Track Container? {
        get -> track;
        set {
          CheckMutable()
          track = value
        }
    }
    /// Gets the optional thumb element. It gets `Hover` while the pointer is over the scrollbar.
    /// Set `Width` on a vertical thumb or `Height` on a horizontal thumb to make it thinner than the track.
    /// The thumb stays centered in the track.
    public prop Thumb Container? {
        get -> thumb;
        set {
          CheckMutable()
          thumb = value
        }
    }

    /// Creates a scrollbar descriptor with overlay geometry and no visual parts.
    public init() {
        thickness = 4.0
        hitThickness = 10.0
        inset = 2.0
        minThumbLength = 24.0
        hideDelayMs = 1000.0
        fadeMs = 250.0
        reserveSpace = false
        track = nil
        thumb = nil
    }
}

internal class ScrollbarNodeValues {
    internal var X Scrollbar?
    internal var Y Scrollbar?
    internal var VisibilityX ScrollbarVisibility
    internal var VisibilityY ScrollbarVisibility
}

internal class ScrollbarStyles {
    shared {
        internal func Remove(n Node) {
            n.ScrollbarStyleState = nil
        }

        internal func GetX(n Node) Scrollbar? -> n.ScrollbarStyleState?.X

        internal func GetY(n Node) Scrollbar? -> n.ScrollbarStyleState?.Y

        internal func GetVisibilityX(n Node) ScrollbarVisibility ->
        if let value = n.ScrollbarStyleState {
            value.VisibilityX
        } else {
            ScrollbarVisibility.Auto
        }

        internal func GetVisibilityY(n Node) ScrollbarVisibility ->
        if let value = n.ScrollbarStyleState {
            value.VisibilityY
        } else {
            ScrollbarVisibility.Auto
        }

        internal func SetVisibilityX(n Node, value ScrollbarVisibility) {
            if let existing = n.ScrollbarStyleState {
                existing.VisibilityX = value
                if existing.X == nil && existing.Y == nil
                && existing.VisibilityX == ScrollbarVisibility.Auto
                && existing.VisibilityY == ScrollbarVisibility.Auto {
                    n.ScrollbarStyleState = nil
                }
            } else if value != ScrollbarVisibility.Auto {
                n.ScrollbarStyleState = ScrollbarNodeValues{VisibilityX: value}
            }
        }

        internal func SetVisibilityY(n Node, value ScrollbarVisibility) {
            if let existing = n.ScrollbarStyleState {
                existing.VisibilityY = value
                if existing.X == nil && existing.Y == nil
                && existing.VisibilityX == ScrollbarVisibility.Auto
                && existing.VisibilityY == ScrollbarVisibility.Auto {
                    n.ScrollbarStyleState = nil
                }
            } else if value != ScrollbarVisibility.Auto {
                n.ScrollbarStyleState = ScrollbarNodeValues{VisibilityY: value}
            }
        }

        internal func SetX(n Node, value Scrollbar?) {
            if let existing = n.ScrollbarStyleState {
                existing.X = value
                if existing.X == nil && existing.Y == nil
                && existing.VisibilityX == ScrollbarVisibility.Auto
                && existing.VisibilityY == ScrollbarVisibility.Auto {
                    n.ScrollbarStyleState = nil
                }
            } else if let next = value {
                n.ScrollbarStyleState = ScrollbarNodeValues{X: next}
            }
        }

        internal func SetY(n Node, value Scrollbar?) {
            if let existing = n.ScrollbarStyleState {
                existing.Y = value
                if existing.X == nil && existing.Y == nil
                && existing.VisibilityX == ScrollbarVisibility.Auto
                && existing.VisibilityY == ScrollbarVisibility.Auto {
                    n.ScrollbarStyleState = nil
                }
            } else if let next = value {
                n.ScrollbarStyleState = ScrollbarNodeValues{Y: next}
            }
        }
    }
}

internal func checkedScrollbarValue(value float64, name string, positive bool) float64 {
    if Double.IsNaN(value) || Double.IsInfinity(value) || value > float64(Single.MaxValue)
    || value < 0.0 || (positive && value == 0.0) {
        throw ArgumentOutOfRangeException(name)
    }
    return value
}

internal func sameScrollbar(left Scrollbar?, right Scrollbar?) bool {
    if Object.ReferenceEquals(left, right) {
        return true
    }
    guard let a = left, let b = right else {
        return false
    }
    return a.Thickness == b.Thickness
    && a.HitThickness == b.HitThickness
    && a.Inset == b.Inset
    && a.MinThumbLength == b.MinThumbLength
    && a.HideDelayMs == b.HideDelayMs
    && a.FadeMs == b.FadeMs
    && a.ReserveSpace == b.ReserveSpace
    && Object.ReferenceEquals(a.Track, b.Track)
    && Object.ReferenceEquals(a.Thumb, b.Thumb)
}
