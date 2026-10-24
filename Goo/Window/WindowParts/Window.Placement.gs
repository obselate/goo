package Goo

import System

/// Captures supported desktop placement and applies explicit geometry requests.
public partial class Window {
    /// Captures normal client bounds and restorable state from the open native window.
    /// Maximized, fullscreen and minimized sizes do not replace normal bounds.
    /// Display hints are not permanent monitor IDs. Android and embedded hosts return Unsupported.
    /// @returns Accepted with owned placement, Closed without an open window, or an explicit host failure.
    /// @exception InvalidOperationException when called off the bound owner thread.
    public func CapturePlacement() WindowPlacementResult {
        requireUiThread("Window.CapturePlacement")
        if embeddedHost != nil || OperatingSystem.IsAndroid() {
            return WindowPlacementResult(WindowOperationResult.Unsupported)
        }
        guard let native = host else { return WindowPlacementResult(WindowOperationResult.Closed) }
        if !IsOpen || native.IsClosing { return WindowPlacementResult(WindowOperationResult.Closed) }
        return native.CapturePlacement()
    }

    /// Applies supported fields on the owner thread, or stages normal size, position and state before Open.
    /// Geometry rounds to SDL integer screen units. Wayland never applies global position.
    /// Fullscreen display selection requires an open window. Unsupported fields remain absent from AppliedFields.
    /// Accepted means the request was accepted, not that the compositor granted its final geometry or state.
    /// Applying normal geometry can wait for a finite native window transition.
    /// Capture again after native configure to observe the result. Android and embedded hosts return Unsupported.
    /// @param value Saved normal geometry, state and display matching hints.
    /// @returns Applied fields with Accepted, Unsupported, Closed, or Failed for invalid data or native failure.
    /// @exception ArgumentNullException when value is nil.
    /// @exception InvalidOperationException when called off the bound owner thread.
    public func ApplyPlacement(value WindowPlacement) WindowPlacementResult {
        if value == nil { throw ArgumentNullException("value") }
        requireUiThread("Window.ApplyPlacement")
        if !value.IsValid() {
            return WindowPlacementResult(WindowOperationResult.Failed, error: "Placement data is invalid")
        }
        if embeddedHost != nil || OperatingSystem.IsAndroid() {
            return WindowPlacementResult(WindowOperationResult.Unsupported)
        }
        if let native = host {
            if !IsOpen || native.IsClosing { return WindowPlacementResult(WindowOperationResult.Closed) }
            return native.ApplyPlacement(value)
        }
        if !OperatingSystem.IsWindows() && !OperatingSystem.IsMacOS() && !OperatingSystem.IsLinux() {
            return WindowPlacementResult(WindowOperationResult.Unsupported)
        }
        var applied = WindowPlacementFields.None
        if (value.Fields & WindowPlacementFields.NormalSize) != WindowPlacementFields.None {
            width = int32(Math.Round(value.NormalBounds.Width))
            height = int32(Math.Round(value.NormalBounds.Height))
            constrainSize()
            MetricSubscriptions.MarkWindowDirty(this)
            requestRender()
            applied |= WindowPlacementFields.NormalSize
        }
        if (value.Fields & WindowPlacementFields.Position) != WindowPlacementFields.None && !OperatingSystem.IsLinux() {
            x = int32(Math.Round(value.NormalBounds.X))
            y = int32(Math.Round(value.NormalBounds.Y))
            positionSet = true
            applied |= WindowPlacementFields.Position
        }
        if (value.Fields & WindowPlacementFields.State) != WindowPlacementFields.None {
            state = value.State
            applied |= WindowPlacementFields.State
        }
        return WindowPlacementResult(if applied == WindowPlacementFields.None { WindowOperationResult.Unsupported }
            else { WindowOperationResult.Accepted }, appliedFields: applied)
    }
}
