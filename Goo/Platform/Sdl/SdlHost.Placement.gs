package Goo

import System
import Hexa.NET.SDL3

internal unsafe partial class SdlHost {
    private var placementX int32
    private var placementY int32
    private var placementWidth int32
    private var placementHeight int32
    private var placementRestoredState WindowState

    private func IsNormalPlacement(flags uint64) bool ->
        (flags & uint64(SDLWindowFlags.Maximized | SDLWindowFlags.Minimized | SDLWindowFlags.Fullscreen)) == 0uL

    private func ObserveNormalPlacement() uint64 {
        let flags = SDL.GetWindowFlags(window)
        if !IsNormalPlacement(flags) { return flags }
        var x int32 = 0
        var y int32 = 0
        var width int32 = 0
        var height int32 = 0
        Require(SDL.GetWindowPosition(window, &x, &y), "SDL_GetWindowPosition")
        Require(SDL.GetWindowSize(window, &width, &height), "SDL_GetWindowSize")
        placementX = x
        placementY = y
        placementWidth = width
        placementHeight = height
        return flags
    }

    private func NativePlacementState(flags uint64) WindowState {
        if (flags & uint64(SDLWindowFlags.Minimized)) != 0uL { return WindowState.Minimized }
        if (flags & uint64(SDLWindowFlags.Fullscreen)) != 0uL { return WindowState.Fullscreen }
        return if (flags & uint64(SDLWindowFlags.Maximized)) != 0uL { WindowState.Maximized }
            else { WindowState.Normal }
    }

    public func CapturePlacement() WindowPlacementResult {
        if disposed || IsClosing { return WindowPlacementResult(WindowOperationResult.Closed) }
        try {
            let flags = ObserveNormalPlacement()
            if placementWidth <= 0 || placementHeight <= 0 {
                return WindowPlacementResult(WindowOperationResult.Failed, error: "Normal window bounds are unavailable")
            }
            let actual = NativePlacementState(flags)
            let restored = if (flags & uint64(SDLWindowFlags.Fullscreen)) != 0uL { WindowState.Fullscreen }
                else if actual == WindowState.Minimized { placementRestoredState } else { actual }
            let display = GetCurrentDisplay()
            var fields = WindowPlacementFields.NormalSize | WindowPlacementFields.State
            if CanMove { fields |= WindowPlacementFields.Position }
            if restored == WindowState.Fullscreen && display != nil { fields |= WindowPlacementFields.FullscreenDisplay }
            return WindowPlacementResult(WindowOperationResult.Accepted, WindowPlacement{
                Fields: fields,
                NormalBounds: ElementRect{ X: float64(placementX), Y: float64(placementY),
                    Width: float64(placementWidth), Height: float64(placementHeight) },
                State: restored, DisplayName: display?.Name ?? "", DisplayBounds: display?.Bounds ?? ElementRect{},
                DisplayScale: float64(display?.ContentScale ?? 0.0f),
            })
        } catch (error InvalidOperationException) {
            return WindowPlacementResult(WindowOperationResult.Failed, error: error.Message)
        }
    }

    public func ApplyPlacement(value WindowPlacement) WindowPlacementResult {
        if disposed || IsClosing { return WindowPlacementResult(WindowOperationResult.Closed) }
        var applied = WindowPlacementFields.None
        try {
            let original = NativePlacementState(SDL.GetWindowFlags(window))
            let target = if (value.Fields & WindowPlacementFields.State) != WindowPlacementFields.None { value.State }
                else { original }
            var display WindowDisplay? = nil
            if (value.Fields & WindowPlacementFields.FullscreenDisplay) != WindowPlacementFields.None {
                for candidate in GetDisplays() {
                    if String.Equals(candidate.Name, value.DisplayName, StringComparison.Ordinal)
                        && candidate.Bounds.Equals(value.DisplayBounds)
                        && (value.DisplayScale == 0.0 || float64(candidate.ContentScale) == value.DisplayScale) {
                        display = candidate
                        break
                    }
                }
                if display == nil {
                    return WindowPlacementResult(WindowOperationResult.Failed, error: "The saved fullscreen display is unavailable")
                }
            }
            let size = (value.Fields & WindowPlacementFields.NormalSize) != WindowPlacementFields.None
            let position = CanMove && (value.Fields & WindowPlacementFields.Position) != WindowPlacementFields.None
            if (size || position) && original != WindowState.Normal {
                SetState(WindowState.Normal)
                Require(SDL.SyncWindow(window), "SDL_SyncWindow")
            }
            if size {
                SetSize(int32(Math.Round(value.NormalBounds.Width)), int32(Math.Round(value.NormalBounds.Height)))
                applied |= WindowPlacementFields.NormalSize
            }
            if position {
                SetPosition(int32(Math.Round(value.NormalBounds.X)), int32(Math.Round(value.NormalBounds.Y)))
                applied |= WindowPlacementFields.Position
            }
            if size || position {
                Require(SDL.SyncWindow(window), "SDL_SyncWindow")
                ObserveNormalPlacement()
            }
            if let chosen = display {
                let result = TrySetFullscreenDisplay(chosen.Id)
                if result != WindowOperationResult.Accepted {
                    return WindowPlacementResult(result, appliedFields: applied, error: "Fullscreen display selection failed")
                }
                applied |= WindowPlacementFields.FullscreenDisplay | WindowPlacementFields.State
                Require(SDL.SyncWindow(window), "SDL_SyncWindow")
            } else if (value.Fields & WindowPlacementFields.State) != WindowPlacementFields.None
                || ((size || position) && original != WindowState.Normal) {
                if target != NativePlacementState(SDL.GetWindowFlags(window)) {
                    SetState(target)
                    Require(SDL.SyncWindow(window), "SDL_SyncWindow")
                }
                if (value.Fields & WindowPlacementFields.State) != WindowPlacementFields.None {
                    applied |= WindowPlacementFields.State
                }
            }
            return WindowPlacementResult(if applied == WindowPlacementFields.None { WindowOperationResult.Unsupported }
                else { WindowOperationResult.Accepted }, appliedFields: applied)
        } catch (error InvalidOperationException) {
            return WindowPlacementResult(WindowOperationResult.Failed, appliedFields: applied, error: error.Message)
        }
    }
}
