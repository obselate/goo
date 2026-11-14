package Goo

/// Describes a primary-pointer drag in element-local and window coordinates.
public struct PointerDragEvent {
    internal prop Pointer PointerEvent {
        get;
        init;
    }
    internal prop HitInput PointerInput? {
        get;
        init;
    }
    internal prop HitRoot NodeMount {
        get;
        init;
    }
    internal prop HitTarget NodeMount {
        get;
        init;
    }
    /// Reports whether normal hit testing at the sample position includes this element.
    /// Evaluated when read. Canceled events report false.
    public prop IsOverTarget bool {
        get -> Phase != GesturePhase.Canceled && HitInput?.PointerDragHits(
            HitRoot.Current,
            HitTarget.Current,
            WindowPosition
        ) == true
    }
    /// Gets the drag transition.
    public prop Phase GesturePhase {
        get;
        internal init;
    }
    /// Gets why the drag was canceled, or None for other transitions.
    public prop Reason GestureCancelReason {
        get;
        internal init;
    }
    /// Gets the current sample position relative to the receiving element.
    /// Started reports the threshold-crossing sample, not the press position.
    public prop Position Point {
        get -> Pointer.Position
    }
    /// Gets the position in layout units.
    public prop WindowPosition Point {
        get -> Pointer.WindowPosition
    }
    /// Gets the displacement from the press position in element-local units.
    /// The press position is Position minus Translation, including on Started.
    public prop Translation Point {
        get;
        internal init;
    }
    /// Gets movement from the previous sample in element-local units.
    /// Started excludes movement before the threshold-crossing sample. Use Translation for total movement from the press.
    public prop Delta Point {
        get;
        internal init;
    }
    /// Gets the keyboard modifiers at this sample.
    public prop Modifiers KeyModifiers {
        get -> Pointer.Modifiers
    }
    /// Gets the pointer device.
    public prop Device PointerDevice {
        get -> Pointer.Device
    }
    /// Gets the stable pointer identifier.
    public prop PointerId int64 {
        get -> Pointer.PointerId
    }
    /// Stops further routing of this input sample.
    public func StopPropagation() -> Pointer.StopPropagation()

    /// Prevents the default behavior for this input sample.
    public func PreventDefault() -> Pointer.PreventDefault()
}
