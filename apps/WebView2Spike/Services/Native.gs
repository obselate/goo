package WebView2Spike

import System
import System.Runtime.InteropServices

@StructLayout(LayoutKind.Sequential)
struct PixelRect {
    var Left int32
    var Top int32
    var Right int32
    var Bottom int32

    init(left int32, top int32, right int32, bottom int32) {
        Left = left
        Top = top
        Right = right
        Bottom = bottom
    }

    prop Width int32 {
        get -> Right - Left
    }
    prop Height int32 {
        get -> Bottom - Top
    }

    func Offset(x int32, y int32) PixelRect -> PixelRect(Left + x, Top + y, Right + x, Bottom + y)

    func Inset(value int32) PixelRect -> PixelRect(Left + value, Top + value, Right - value, Bottom - value)

    func Coordinates()[]int32 -> []int32{Left, Top, Right, Bottom}
}

@StructLayout(LayoutKind.Sequential)
struct BitmapHeader {
    var Size uint32
    var Width int32
    var Height int32
    var Planes uint16
    var BitCount uint16
    var Compression uint32
    var ImageSize uint32
    var XPelsPerMeter int32
    var YPelsPerMeter int32
    var ColorsUsed uint32
    var ColorsImportant uint32
}

@UnmanagedFunctionPointer(CallingConvention.Winapi)
delegate SubclassProcedure(window nint, message uint32, wparam nuint, lparam nint, id nuint, data nuint) nint;

shared class Native {
    let TopmostWindow nint = nint(-1)
    const NoSize uint32 = 0x0001u
    const NoMove uint32 = 0x0002u
    const NoZOrder uint32 = 0x0004u
    const NoActivate uint32 = 0x0010u
    const MoveMessage uint32 = 0x0003u

    func Check(result int32, operation string) {
        if result < 0 {
            throw COMException(operation + " failed: 0x" + result.ToString("X8"), result)
        }
    }

    func Require(condition bool, operation string) {
        if !condition {
            throw InvalidOperationException(operation + " failed")
        }
    }

    func Method(instance nint, index int32) nint -> Marshal.ReadIntPtr(Marshal.ReadIntPtr(instance), index * nint.Size)

    func ClientRect(window nint) PixelRect {
        Require(GetClientRect(window, out var rect) != 0, "GetClientRect")
        MapWindowPoints(window, nint(0), ref rect, 2u)
        return rect
    }

    @DllImport("user32.dll")
    private func GetClientRect(window nint, out rect PixelRect) int32;

    @DllImport("user32.dll")
    private func MapWindowPoints(from nint, to nint, ref rect PixelRect, count uint32) int32;

    @DllImport("user32.dll")
    func SetProcessDpiAwarenessContext(context nint) int32;

    @DllImport("user32.dll")
    func GetDpiForWindow(window nint) uint32;

    @DllImport("user32.dll")
    func GetWindowRect(window nint, out rect PixelRect) int32;

    @DllImport("user32.dll")
    func SetForegroundWindow(window nint) int32;

    @DllImport("user32.dll")
    func GetForegroundWindow() nint;

    @DllImport("user32.dll")
    func SetWindowPos(window nint, after nint, x int32, y int32, width int32, height int32, flags uint32) int32;

    @DllImport("user32.dll")
    func GetDC(window nint) nint;

    @DllImport("user32.dll")
    func ReleaseDC(window nint, dc nint) int32;

    @DllImport("gdi32.dll")
    func CreateCompatibleDC(dc nint) nint;

    @DllImport("gdi32.dll")
    func DeleteDC(dc nint) int32;

    @DllImport("gdi32.dll")
    func CreateDIBSection(
        dc nint,
        ref header BitmapHeader,
        usage uint32,
        out bits nint,
        section nint,
        offset uint32
    ) nint;

    @DllImport("gdi32.dll")
    func SelectObject(dc nint, value nint) nint;

    @DllImport("gdi32.dll")
    func DeleteObject(value nint) int32;

    @DllImport("gdi32.dll")
    func BitBlt(
        target nint,
        x int32,
        y int32,
        width int32,
        height int32,
        source nint,
        left int32,
        top int32,
        operation uint32
    ) int32;

    @DllImport("dwmapi.dll")
    func DwmFlush() int32;

    @DllImport("comctl32.dll")
    func SetWindowSubclass(window nint, callback SubclassProcedure, id nuint, data nuint) int32;

    @DllImport("comctl32.dll")
    func DefSubclassProc(window nint, message uint32, wparam nuint, lparam nint) nint;

    @DllImport("d3d11.dll")
    func D3D11CreateDevice(
        adapter nint,
        driverType int32,
        software nint,
        flags uint32,
        levels nint,
        levelCount uint32,
        sdkVersion uint32,
        out device nint,
        out level int32,
        out context nint
    ) int32;

    @DllImport("dcomp.dll")
    func DCompositionCreateDevice(device nint, ref identifier Guid, out composition nint) int32;
}
