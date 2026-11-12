package Goo

/// Identifies a captured pointer drag transition.
public enum PointerDragPhase {
    /// Reports the press or the first sample that reaches the threshold.
    Started = 0;
    /// Reports a sample after the drag starts and before it terminates.
    Moved = 1;
    /// Reports the matching primary-pointer release.
    Ended = 2;
    /// Reports cancellation, capture loss, unmount or an unavailable target.
    Canceled = 3;
}

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
        get -> Phase != PointerDragPhase.Canceled && HitInput?.PointerDragHits(
            HitRoot.Current,
            HitTarget.Current,
            WindowPosition
        ) == true
    }
    /// Gets the drag transition.
    public prop Phase PointerDragPhase {
        get;
        init;
    }
    /// Gets the position relative to the receiving element.
    public prop Position Point {
        get -> Pointer.Position
    }
    /// Gets the position in logical window units.
    public prop WindowPosition Point {
        get -> Pointer.WindowPosition
    }
    /// Gets the displacement from the press position in element-local units.
    public prop Translation Point {
        get;
        init;
    }
    /// Gets movement from the previous sample in element-local units.
    public prop Delta Point {
        get;
        init;
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
