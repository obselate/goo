package Goo

import System

/// Identifies the placement fields retained or accepted by a desktop host.
@Flags
public enum WindowPlacementFields {
    None = 0;
    NormalSize = 1;
    Position = 2;
    State = 4;
    FullscreenDisplay = 8;
}

/// Owns restorable desktop geometry and display matching hints, without process-local display IDs.
public class WindowPlacement {
    /// Gets the fields present in this saved placement.
    public prop Fields WindowPlacementFields { get; init; }
    /// Gets normal client geometry in SDL integer screen units, not framebuffer pixels.
    /// Position is meaningful only when Fields includes Position.
    public prop NormalBounds ElementRect { get; init; }
    /// Gets the restorable state. Capture records the last non-minimized state for a minimized window.
    public prop State WindowState { get; init; }
    /// Gets a display name hint, not a unique or permanent monitor identity.
    public prop DisplayName string { get; init; }
    /// Gets the display bounds used to match a current display after topology changes.
    public prop DisplayBounds ElementRect { get; init; }
    /// Gets the display's expected content scale, or zero when unavailable.
    public prop DisplayScale float64 { get; init; }

    /// Creates an empty placement. Set Fields and its corresponding values before applying it.
    public init() { DisplayName = "" }

    internal func IsValid() bool {
        if Fields == WindowPlacementFields.None || (int32(Fields) & ~AllFieldsMask) != 0 { return false }
        if DisplayName == nil || !Double.IsFinite(DisplayScale) || DisplayScale < 0.0 { return false }
        if (Fields & WindowPlacementFields.NormalSize) != WindowPlacementFields.None {
            if !ValidSize(NormalBounds.Width) || !ValidSize(NormalBounds.Height) { return false }
        }
        if (Fields & WindowPlacementFields.Position) != WindowPlacementFields.None {
            if !ValidCoordinate(NormalBounds.X) || !ValidCoordinate(NormalBounds.Y) { return false }
        }
        if (Fields & WindowPlacementFields.State) != WindowPlacementFields.None {
            if State != WindowState.Normal && State != WindowState.Minimized
                && State != WindowState.Maximized && State != WindowState.Fullscreen { return false }
        }
        if (Fields & WindowPlacementFields.FullscreenDisplay) != WindowPlacementFields.None {
            if (Fields & WindowPlacementFields.State) == WindowPlacementFields.None
                || State != WindowState.Fullscreen { return false }
            if !ValidCoordinate(DisplayBounds.X) || !ValidCoordinate(DisplayBounds.Y)
                || !Double.IsFinite(DisplayBounds.Width) || !Double.IsFinite(DisplayBounds.Height)
                || DisplayBounds.Width < 0.0 || DisplayBounds.Height < 0.0 { return false }
        }
        return true
    }

    shared {
        private const AllFieldsMask int32 = 15

        private func ValidCoordinate(value float64) bool ->
            Double.IsFinite(value) && value >= float64(Int32.MinValue) && value <= float64(Int32.MaxValue)

        private func ValidSize(value float64) bool ->
            Double.IsFinite(value) && value >= 1.0 && value <= float64(Int32.MaxValue)
    }
}

/// Reports captured placement or the fields accepted by an apply request.
public class WindowPlacementResult {
    /// Gets Accepted, Closed, Unsupported or Failed for this placement operation.
    public prop Status WindowOperationResult { get; }
    /// Gets captured placement, or nil for an apply request or a failed capture.
    public prop Placement WindowPlacement? { get; }
    /// Gets fields accepted for application. Capture results use None.
    public prop AppliedFields WindowPlacementFields { get; }
    /// Gets bounded failure detail, or an empty string.
    public prop Error string { get; }

    internal init(status WindowOperationResult, placement WindowPlacement? = nil,
        appliedFields WindowPlacementFields = WindowPlacementFields.None, error string = "") {
        Status = status
        Placement = placement
        AppliedFields = appliedFields
        Error = if error.Length > MaxErrorCharacters { error.Substring(0, MaxErrorCharacters) } else { error }
    }

    shared { private const MaxErrorCharacters int32 = 512 }
}
