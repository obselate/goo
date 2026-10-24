package Goo

import System
import System.Collections.Generic

/// Restores app-owned placement against the current desktop display inventory.
public class Placement {
    private init() {}

    shared {
        /// Matches display hints and clamps normal geometry to current usable bounds and size constraints.
        /// Open the window hidden first. Restore does not read or write application settings.
        /// Saved Minimized becomes Normal. Native capture already retains the last non-minimized state.
        /// Wayland does not apply position. Fullscreen, focus and final geometry remain OS decisions.
        /// @param window The open window on its owner thread.
        /// @param saved App-owned saved geometry, state and display hints.
        /// @returns Accepted with the applied mask, Closed, Unsupported, or Failed for invalid data or host failure.
        /// @exception ArgumentNullException when window or saved is nil.
        /// @exception InvalidOperationException when called off the window's bound owner thread.
        public func Restore(window Window, saved WindowPlacement) WindowPlacementResult {
            if window == nil { throw ArgumentNullException("window") }
            if saved == nil { throw ArgumentNullException("saved") }
            if !saved.IsValid() {
                return WindowPlacementResult(WindowOperationResult.Failed, error: "Placement data is invalid")
            }
            if !window.IsOpen { return WindowPlacementResult(WindowOperationResult.Closed) }
            let displays = window.GetDisplays()
            if displays.Count == 0 { return WindowPlacementResult(WindowOperationResult.Unsupported) }
            let display = MatchDisplay(displays, saved)
            let area = display.UsableBounds ?? display.Bounds
            if area.Width <= 0.0 || area.Height <= 0.0 {
                return WindowPlacementResult(WindowOperationResult.Failed, error: "The current display has no usable bounds")
            }
            let size = (saved.Fields & WindowPlacementFields.NormalSize) != WindowPlacementFields.None
            let position = (saved.Fields & WindowPlacementFields.Position) != WindowPlacementFields.None
            var bounds = saved.NormalBounds
            if position && !size {
                let captured = window.CapturePlacement()
                if captured.Status != WindowOperationResult.Accepted { return captured }
                let normal = captured.Placement!!.NormalBounds
                bounds = ElementRect{ X: bounds.X, Y: bounds.Y, Width: normal.Width, Height: normal.Height }
            }
            var width = bounds.Width
            var height = bounds.Height
            if size {
                let scale = float64(window.UiScale)
                width = ClampSize(width, window.MinWidth, window.MaxWidth, area.Width, scale)
                height = ClampSize(height, window.MinHeight, window.MaxHeight, area.Height, scale)
            }
            var x = bounds.X
            var y = bounds.Y
            if position {
                if saved.DisplayBounds.Width > 0.0 && saved.DisplayBounds.Height > 0.0 {
                    x += display.Bounds.X - saved.DisplayBounds.X
                    y += display.Bounds.Y - saved.DisplayBounds.Y
                }
                x = Math.Clamp(x, area.X, Math.Max(area.X, area.X + area.Width - width))
                y = Math.Clamp(y, area.Y, Math.Max(area.Y, area.Y + area.Height - height))
            }
            return window.ApplyPlacement(WindowPlacement{
                Fields: saved.Fields,
                NormalBounds: ElementRect{ X: x, Y: y, Width: width, Height: height },
                State: if saved.State == WindowState.Minimized { WindowState.Normal } else { saved.State },
                DisplayName: display.Name, DisplayBounds: display.Bounds, DisplayScale: float64(display.ContentScale),
            })
        }

        private func ClampSize(value float64, minimum int32, maximum int32, available float64, scale float64) float64 {
            let lower = Math.Min(available, Math.Max(1.0, Math.Ceiling(float64(minimum) * scale)))
            let upper = if maximum == 0 { available } else { Math.Min(available, Math.Ceiling(float64(maximum) * scale)) }
            return Math.Clamp(value, Math.Min(lower, upper), upper)
        }

        private func MatchDisplay(displays IReadOnlyList[WindowDisplay], saved WindowPlacement) WindowDisplay {
            var selected = displays[0]
            var matchedName = false
            var bestDistance = Double.PositiveInfinity
            var bestScale = Double.PositiveInfinity
            for display in displays {
                let sameName = saved.DisplayName.Length != 0
                    && String.Equals(display.Name, saved.DisplayName, StringComparison.Ordinal)
                let x = display.Bounds.X + display.Bounds.Width / 2.0 - saved.DisplayBounds.X - saved.DisplayBounds.Width / 2.0
                let y = display.Bounds.Y + display.Bounds.Height / 2.0 - saved.DisplayBounds.Y - saved.DisplayBounds.Height / 2.0
                let distance = if saved.DisplayBounds.Width > 0.0 && saved.DisplayBounds.Height > 0.0 { x * x + y * y }
                    else { 0.0 }
                let scale = if saved.DisplayScale > 0.0 { Math.Abs(float64(display.ContentScale) - saved.DisplayScale) }
                    else { 0.0 }
                if (sameName && !matchedName) || (sameName == matchedName
                    && (distance < bestDistance || (distance == bestDistance && scale < bestScale))) {
                    selected = display
                    matchedName = sameName
                    bestDistance = distance
                    bestScale = scale
                }
            }
            return selected
        }
    }
}
