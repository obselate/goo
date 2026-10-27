package GooPackageSmoke

import Goo
import Hexa.NET.SDL3
import System
import System.Diagnostics

internal unsafe func RunApplicationQuitSmoke() {
    let first = Window{Title: "Quit guard", Width: 320, Height: 200, Root: Cell{}}
    let second = Window{Title: "Quit sibling", Width: 320, Height: 200, Root: Cell{}}
    var vetoes int32
    first.OnClosing = () -> {
        vetoes++
        return false
    }
    second.OnClosing = () -> {
        vetoes++
        return false
    }
    try {
        first.Open()
        second.Open()
        first.RequestClose()
        first.Pump(0.0)
        if !first.IsOpen || vetoes != 1 {
            throw InvalidOperationException("Window close did not honor its veto")
        }
        var quit = SDLEvent{Type: uint32(SDLEventType.Quit)}
        if !SDL.PushEvent(&quit) {
            throw InvalidOperationException("Cannot queue application quit: " + SDL.GetErrorS())
        }
        first.Pump(0.0)
        second.Pump(0.0)
        if !first.IsOpen || !second.IsOpen || vetoes != 3 {
            throw InvalidOperationException("User-requested quit did not honor window vetoes")
        }
        quit.Type = uint32(SDLEventType.Terminating)
        if !SDL.PushEvent(&quit) {
            throw InvalidOperationException("Cannot queue termination: " + SDL.GetErrorS())
        }
        let timer = Stopwatch.StartNew()
        while (first.IsOpen || second.IsOpen) && timer.Elapsed.TotalSeconds < 5 {
            if first.IsOpen {
                first.Pump(0.0)
            }
            if second.IsOpen {
                second.Pump(0.0)
            }
        }
        if first.IsOpen || second.IsOpen || vetoes != 3 {
            throw InvalidOperationException("Termination was vetoed or left a window open")
        }
    } finally {
        first.OnClosing = nil
        second.OnClosing = nil
        CloseWindow(first)
        CloseWindow(second)
    }
    Console.WriteLine("application-quit: user veto retained, termination closes all windows")
}
