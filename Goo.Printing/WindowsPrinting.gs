package Goo.Printing

import Goo
import System
import System.ComponentModel
import System.Globalization
import System.IO
import System.Runtime.InteropServices
import System.Runtime.Versioning
import System.Threading
import System.Threading.Tasks

internal unsafe shared class WindowsPrinting {
    @StructLayout(LayoutKind.Sequential)
    private struct PrintDialog {
        internal var Size uint32
        internal var Owner nint
        internal var DeviceMode nint
        internal var DeviceNames nint
        internal var Dc nint
        internal var Flags uint32
        internal var Flags2 uint32
        internal var ExclusionFlags uint32
        internal var PageRangeCount uint32
        internal var MaxPageRanges uint32
        internal var PageRanges nint
        internal var MinPage uint32
        internal var MaxPage uint32
        internal var Copies uint32
        internal var Instance nint
        internal var TemplateName nint
        internal var Callback nint
        internal var PropertyPages uint32
        internal var PropertyPageHandles nint
        internal var StartPage uint32
        internal var ResultAction uint32
    }

    @StructLayout(LayoutKind.Sequential)
    private struct PageRange {
        internal var From uint32
        internal var To uint32
    }

    @StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)
    private struct DocumentInfo {
        internal var Size int32

        @MarshalAs(UnmanagedType.LPWStr)
        internal var Name string

        @MarshalAs(UnmanagedType.LPWStr)
        internal var Output string?

        internal var DataType nint
        internal var Type uint32
    }

    @StructLayout(LayoutKind.Sequential)
    private struct BitmapInfo {
        internal var Size uint32
        internal var Width int32
        internal var Height int32
        internal var Planes uint16
        internal var Bits uint16
        internal var Compression uint32
        internal var ImageSize uint32
        internal var XResolution int32
        internal var YResolution int32
        internal var ColorsUsed uint32
        internal var ColorsImportant uint32
    }

    private const ReturnDc uint32 = uint32(0x100)
    private const DriverCopies uint32 = uint32(0x40000)
    private const NoSelection uint32 = uint32(4)
    private const NoCurrentPage uint32 = uint32(0x800000)
    private const PageNumbers uint32 = uint32(2)
    private const PrintToFile uint32 = uint32(0x20)
    private const PrintAction uint32 = uint32(1)
    private const MaxRanges int32 = 32
    private const DpiX int32 = 88
    private const DpiY int32 = 90
    private const PhysicalWidth int32 = 110
    private const PhysicalHeight int32 = 111
    private const OffsetX int32 = 112
    private const OffsetY int32 = 113
    private const PrintableWidth int32 = 8
    private const PrintableHeight int32 = 10
    private const SourceCopy uint32 = uint32(0x00CC0020)
    private const OwnerWindow uint32 = uint32(4)
    private const CloseMessage uint32 = uint32(0x0010)

    internal func PrintAsync(
        owner Window,
        lease NativeDialogOwnerLease,
        document IPrintDocument,
        title string,
        cancellation CancellationToken
    ) Task[PrintResult] {
        if !OperatingSystem.IsWindows() {
            return Task.FromResult(PrintResult(PrintStatus.Unsupported))
        }
        return StartThread(owner, lease, document, title, cancellation)
    }

    @SupportedOSPlatform("windows")
    private func StartThread(
        owner Window,
        lease NativeDialogOwnerLease,
        document IPrintDocument,
        title string,
        cancellation CancellationToken
    ) Task[PrintResult] {
        let completion = TaskCompletionSource[PrintResult](TaskCreationOptions.RunContinuationsAsynchronously)
        let thread = Thread(
            () -> {
                try {
                    completion.TrySetResult(Print(owner, lease, document, title, cancellation))
                } catch (OperationCanceledException) {
                    completion.TrySetResult(PrintResult(PrintStatus.Cancelled))
                } catch (error Exception) {
                    completion.TrySetResult(PrintResult(PrintStatus.Failed, Error: Printing.Detail(error.Message)))
                }
            }
        ){IsBackground = true, Name = "Goo print dialog"}
        thread.SetApartmentState(ApartmentState.STA)
        thread.Start()
        return completion.Task
    }

    private func Print(
        owner Window,
        lease NativeDialogOwnerLease,
        document IPrintDocument,
        title string,
        cancellation CancellationToken
    ) PrintResult {
        let initialized = CoInitializeEx(0, 2) >= 0
        let ranges = Marshal.AllocHGlobal(MaxRanges * Marshal.SizeOf[PageRange]())
        var dialog = PrintDialog{
            Size: uint32(Marshal.SizeOf[PrintDialog]()),
            Owner: lease.Handle,
            Flags: ReturnDc | DriverCopies | NoSelection | NoCurrentPage,
            MaxPageRanges: uint32(MaxRanges),
            PageRanges: ranges,
            MinPage: 1,
            MaxPage: uint32.MaxValue,
            Copies: 1,
            StartPage: uint32.MaxValue
        }
        let threadId = GetCurrentThreadId()
        using let dismiss = Timer(
            (_ object?) -> EnumThreadWindows(threadId, DismissDialog, lease.Handle),
            nil,
            Timeout.Infinite,
            Timeout.Infinite
        )
        using let cancelDialog = cancellation.Register(() -> dismiss.Change(0, 50))
        var started = false
        let abort WindowsPrinting_AbortCallback = (_ nint, _ int32) -> if cancellation.IsCancellationRequested {
            0
        } else {
            1
        }
        try {
            cancellation.ThrowIfCancellationRequested()
            let result = PrintDlgExW(&dialog)
            if cancellation.IsCancellationRequested || result >= 0 && dialog.ResultAction != PrintAction {
                return PrintResult(PrintStatus.Cancelled)
            }
            if result < 0 || dialog.Dc == 0 {
                return PrintResult(PrintStatus.Failed, Error: "PrintDlgEx failed (0x${result:X8}).")
            }
            let settings = ReadSettings(dialog.Dc)
            let layout = Printing
                .OnOwnerAsync(owner, () -> document.Paginate(settings), cancellation)
                .GetAwaiter()
                .GetResult()
            if layout.Status != PrintLayoutStatus.Ready || layout.PageCount <= 0 {
                return Printing.LayoutFailure(layout)
            }
            if SetAbortProc(dialog.Dc, abort) <= 0 {
                return Failure("SetAbortProc")
            }
            var info = DocumentInfo{
                Size: Marshal.SizeOf[DocumentInfo](),
                Name: title,
                Output: if (dialog.Flags & PrintToFile) != uint32(0) {
                    "FILE:"
                } else {
                    default(string?)
                }
            }
            let job = StartDocW(dialog.Dc, &info)
            if job <= 0 {
                return if cancellation.IsCancellationRequested {
                    PrintResult(PrintStatus.Cancelled)
                } else {
                    Failure("StartDoc")
                }
            }
            started = true
            var reusable WindowCapture? = nil
            var pageWritten = false
            for var index = 0; index < layout.PageCount; index++ {
                if !Selected(index + 1, dialog) {
                    continue
                }
                cancellation.ThrowIfCancellationRequested()
                var rendered = Printing
                    .RenderPageAsync(owner, document, index, settings, reusable, cancellation)
                    .GetAwaiter()
                    .GetResult()
                if rendered.Status != OffscreenRenderStatus.Success || rendered.Capture == nil {
                    return Printing.RenderFailure(rendered)
                }
                reusable = rendered.Capture
                if StartPage(dialog.Dc) <= 0 {
                    return Failure("StartPage")
                }
                if !DrawPage(dialog.Dc, reusable!!) {
                    return Failure("StretchDIBits")
                }
                if EndPage(dialog.Dc) <= 0 {
                    return Failure("EndPage")
                }
                pageWritten = true
            }
            if !pageWritten {
                return PrintResult(PrintStatus.Failed, Error: "No selected page exists in the document.")
            }
            cancellation.ThrowIfCancellationRequested()
            if EndDoc(dialog.Dc) <= 0 {
                return Failure("EndDoc")
            }
            started = false
            return PrintResult(PrintStatus.Submitted, job.ToString(CultureInfo.InvariantCulture))
        } finally {
            if started {
                AbortDoc(dialog.Dc)
            }
            if dialog.Dc != 0 {
                DeleteDC(dialog.Dc)
            }
            if dialog.DeviceMode != 0 {
                GlobalFree(dialog.DeviceMode)
            }
            if dialog.DeviceNames != 0 {
                GlobalFree(dialog.DeviceNames)
            }
            Marshal.FreeHGlobal(ranges)
            GC.KeepAlive(abort)
            if initialized {
                CoUninitialize()
            }
        }
    }

    private func ReadSettings(dc nint) PrintPageSettings {
        let x = GetDeviceCaps(dc, DpiX)
        let y = GetDeviceCaps(dc, DpiY)
        if x <= 0 || y <= 0 {
            throw IOException("The printer has no raster resolution.")
        }
        let width = GetDeviceCaps(dc, PhysicalWidth)
        let height = GetDeviceCaps(dc, PhysicalHeight)
        let left = GetDeviceCaps(dc, OffsetX)
        let top = GetDeviceCaps(dc, OffsetY)
        return PrintPageSettings(
            float64(width) * 72.0 / float64(x),
            float64(height) * 72.0 / float64(y),
            float64(left) * 72.0 / float64(x),
            float64(top) * 72.0 / float64(y),
            float64((width - left - GetDeviceCaps(dc, PrintableWidth))) * 72.0 / float64(x),
            float64((height - top - GetDeviceCaps(dc, PrintableHeight))) * 72.0 / float64(y),
            Math.Min(x, 300),
            Math.Min(y, 300)
        )
    }

    private func Selected(page int32, dialog PrintDialog) bool {
        if (dialog.Flags & PageNumbers) == uint32(0) {
            return true
        }
        if dialog.PageRangeCount > uint32(MaxRanges) {
            return false
        }
        for var index = 0; int64(index) < int64(dialog.PageRangeCount); index++ {
            let range_ = Marshal.PtrToStructure[PageRange](dialog.PageRanges + index * Marshal.SizeOf[PageRange]())
            if int64(page) >= int64(range_.From) && int64(page) <= int64(range_.To) {
                return true
            }
        }
        return false
    }

    private func DrawPage(dc nint, capture WindowCapture) bool {
        unsafe {
            let pixels []uint8 = capture.Pixels
            for var index = 0; index < pixels.Length; index += 4 {
                pixels[index], pixels[index + 2] = pixels[index + 2], pixels[index]
            }
            var bitmap = BitmapInfo{
                Size: uint32(Marshal.SizeOf[BitmapInfo]()),
                Width: checked(int32(capture.Width)),
                Height: -checked(int32(capture.Height)),
                Planes: 1,
                Bits: 32
            }
            fixed data *uint8 = pixels {
                return StretchDIBits(
                    dc,
                    -GetDeviceCaps(dc, OffsetX),
                    -GetDeviceCaps(dc, OffsetY),
                    GetDeviceCaps(dc, PhysicalWidth),
                    GetDeviceCaps(dc, PhysicalHeight),
                    0,
                    0,
                    bitmap.Width,
                    -bitmap.Height,
                    data,
                    &bitmap,
                    0,
                    SourceCopy
                ) > 0
            }
        }
    }

    private func DismissDialog(window nint, owner nint) bool {
        for var parent = GetWindow(window, OwnerWindow); parent != 0; parent = GetWindow(parent, OwnerWindow) {
            if parent != owner {
                continue
            }
            PostMessageW(window, CloseMessage, 0, 0)
            break
        }
        return true
    }

    private func Failure(operation string) PrintResult -> PrintResult(
        PrintStatus.Failed,
        Error: Printing.Detail(operation + ": " + Win32Exception(Marshal.GetLastWin32Error()).Message)
    )

    @DllImport("comdlg32.dll", CharSet = CharSet.Unicode)
    private func PrintDlgExW(ref dialog PrintDialog) int32;

    @DllImport("ole32.dll")
    private func CoInitializeEx(reserved nint, flags uint32) int32;

    @DllImport("ole32.dll")
    private func CoUninitialize();

    @DllImport("kernel32.dll")
    private func GetCurrentThreadId() uint32;

    @DllImport("kernel32.dll")
    private func GlobalFree(memory nint) nint;

    @DllImport("user32.dll")
    private func EnumThreadWindows(thread uint32, callback WindowsPrinting_WindowCallback, data nint) bool;

    @DllImport("user32.dll")
    private func GetWindow(window nint, command uint32) nint;

    @DllImport("user32.dll")
    private func PostMessageW(window nint, message uint32, wparam nuint, lparam nint) bool;

    @DllImport("gdi32.dll")
    private func GetDeviceCaps(dc nint, index int32) int32;

    @DllImport("gdi32.dll", SetLastError = true)
    private func SetAbortProc(dc nint, callback WindowsPrinting_AbortCallback) int32;

    @DllImport("gdi32.dll", CharSet = CharSet.Unicode, SetLastError = true)
    private func StartDocW(dc nint, ref info DocumentInfo) int32;

    @DllImport("gdi32.dll", SetLastError = true)
    private func StartPage(dc nint) int32;

    @DllImport("gdi32.dll", SetLastError = true)
    private func EndPage(dc nint) int32;

    @DllImport("gdi32.dll", SetLastError = true)
    private func EndDoc(dc nint) int32;

    @DllImport("gdi32.dll")
    private func AbortDoc(dc nint) int32;

    @DllImport("gdi32.dll")
    private func DeleteDC(dc nint) bool;

    @DllImport("gdi32.dll", SetLastError = true)
    private func StretchDIBits(
        dc nint,
        x int32,
        y int32,
        width int32,
        height int32,
        sourceX int32,
        sourceY int32,
        sourceWidth int32,
        sourceHeight int32,
        pixels *uint8,
        ref info BitmapInfo,
        usage uint32,
        operation uint32
    ) int32;
}

@UnmanagedFunctionPointer(CallingConvention.Winapi)
internal delegate WindowsPrinting_AbortCallback(dc nint, error int32) int32;

@UnmanagedFunctionPointer(CallingConvention.Winapi)
internal delegate WindowsPrinting_WindowCallback(window nint, data nint) bool;
