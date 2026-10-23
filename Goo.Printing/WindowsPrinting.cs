using System.ComponentModel;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;

namespace Goo.Printing;

internal static class WindowsPrinting
{
    private const uint ReturnDc = 0x100;
    private const uint DriverCopies = 0x40000;
    private const uint NoSelection = 4;
    private const uint NoCurrentPage = 0x800000;
    private const uint PageNumbers = 2;
    private const uint PrintToFile = 0x20;
    private const uint PrintAction = 1;
    private const int MaxRanges = 32;
    private const int DpiX = 88, DpiY = 90, PhysicalWidth = 110, PhysicalHeight = 111;
    private const int OffsetX = 112, OffsetY = 113, PrintableWidth = 8, PrintableHeight = 10;
    private const uint SourceCopy = 0x00CC0020;
    private const uint OwnerWindow = 4;
    private const uint CloseMessage = 0x0010;

    internal static Task<PrintResult> PrintAsync(Window owner, NativeDialogOwnerLease lease, IPrintDocument document,
        string title, CancellationToken cancellation)
    {
        if (!OperatingSystem.IsWindows())
            return Task.FromResult(new PrintResult(PrintStatus.Unsupported));
        return StartThread(owner, lease, document, title, cancellation);
    }

    [SupportedOSPlatform("windows")]
    private static Task<PrintResult> StartThread(Window owner, NativeDialogOwnerLease lease, IPrintDocument document,
        string title, CancellationToken cancellation)
    {
        var completion = new TaskCompletionSource<PrintResult>(TaskCreationOptions.RunContinuationsAsynchronously);
        var thread = new Thread(() =>
        {
            try { completion.TrySetResult(Print(owner, lease, document, title, cancellation)); }
            catch (OperationCanceledException) { completion.TrySetResult(new(PrintStatus.Cancelled)); }
            catch (Exception error) { completion.TrySetResult(new(PrintStatus.Failed, Error: Printing.Detail(error.Message))); }
        })
        { IsBackground = true, Name = "Goo print dialog" };
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        return completion.Task;
    }

    private static PrintResult Print(Window owner, NativeDialogOwnerLease lease, IPrintDocument document,
        string title, CancellationToken cancellation)
    {
        var initialized = CoInitializeEx(0, 2) >= 0;
        var ranges = Marshal.AllocHGlobal(MaxRanges * Marshal.SizeOf<PageRange>());
        var dialog = new PrintDialog
        {
            Size = (uint)Marshal.SizeOf<PrintDialog>(),
            Owner = lease.Handle,
            Flags = ReturnDc | DriverCopies | NoSelection | NoCurrentPage,
            MaxPageRanges = MaxRanges,
            PageRanges = ranges,
            MinPage = 1,
            MaxPage = uint.MaxValue,
            Copies = 1,
            StartPage = uint.MaxValue
        };
        var threadId = GetCurrentThreadId();
        using var dismiss = new Timer(_ => EnumThreadWindows(threadId, DismissDialog, lease.Handle),
            null, Timeout.Infinite, Timeout.Infinite);
        using var cancelDialog = cancellation.Register(() => dismiss.Change(0, 50));
        var started = false;
        AbortCallback abort = (_, _) => cancellation.IsCancellationRequested ? 0 : 1;
        try
        {
            cancellation.ThrowIfCancellationRequested();
            var result = PrintDlgExW(ref dialog);
            if (cancellation.IsCancellationRequested || result >= 0 && dialog.ResultAction != PrintAction)
                return new(PrintStatus.Cancelled);
            if (result < 0 || dialog.Dc == 0)
                return new(PrintStatus.Failed, Error: $"PrintDlgEx failed (0x{result:X8}).");
            var settings = ReadSettings(dialog.Dc);
            var layout = Printing.OnOwnerAsync(owner, () => document.Paginate(settings), cancellation)
                .GetAwaiter().GetResult();
            if (layout.Status != PrintLayoutStatus.Ready || layout.PageCount <= 0)
                return Printing.LayoutFailure(layout);
            if (SetAbortProc(dialog.Dc, abort) <= 0)
                return Failure("SetAbortProc");
            var info = new DocumentInfo
            {
                Size = Marshal.SizeOf<DocumentInfo>(),
                Name = title,
                Output = (dialog.Flags & PrintToFile) != 0 ? "FILE:" : null
            };
            var job = StartDocW(dialog.Dc, ref info);
            if (job <= 0)
                return cancellation.IsCancellationRequested ? new(PrintStatus.Cancelled) : Failure("StartDoc");
            started = true;
            WindowCapture? reusable = null;
            var pageWritten = false;
            for (var index = 0; index < layout.PageCount; index++)
            {
                if (!Selected(index + 1, dialog))
                    continue;
                cancellation.ThrowIfCancellationRequested();
                var rendered = Printing.RenderPageAsync(owner, document, index, settings, reusable, cancellation)
                    .GetAwaiter().GetResult();
                if (rendered.Status != OffscreenRenderStatus.Success || rendered.Capture == null)
                    return Printing.RenderFailure(rendered);
                reusable = rendered.Capture;
                if (StartPage(dialog.Dc) <= 0)
                    return Failure("StartPage");
                if (!DrawPage(dialog.Dc, reusable))
                    return Failure("StretchDIBits");
                if (EndPage(dialog.Dc) <= 0)
                    return Failure("EndPage");
                pageWritten = true;
            }
            if (!pageWritten)
                return new(PrintStatus.Failed, Error: "No selected page exists in the document.");
            cancellation.ThrowIfCancellationRequested();
            if (EndDoc(dialog.Dc) <= 0)
                return Failure("EndDoc");
            started = false;
            return new(PrintStatus.Submitted, job.ToString(CultureInfo.InvariantCulture));
        }
        finally
        {
            if (started)
                AbortDoc(dialog.Dc);
            if (dialog.Dc != 0)
                DeleteDC(dialog.Dc);
            if (dialog.DeviceMode != 0)
                GlobalFree(dialog.DeviceMode);
            if (dialog.DeviceNames != 0)
                GlobalFree(dialog.DeviceNames);
            Marshal.FreeHGlobal(ranges);
            GC.KeepAlive(abort);
            if (initialized)
                CoUninitialize();
        }
    }

    private static PrintPageSettings ReadSettings(nint dc)
    {
        var x = GetDeviceCaps(dc, DpiX);
        var y = GetDeviceCaps(dc, DpiY);
        if (x <= 0 || y <= 0)
            throw new IOException("The printer has no raster resolution.");
        var width = GetDeviceCaps(dc, PhysicalWidth);
        var height = GetDeviceCaps(dc, PhysicalHeight);
        var left = GetDeviceCaps(dc, OffsetX);
        var top = GetDeviceCaps(dc, OffsetY);
        return new(width * 72.0 / x, height * 72.0 / y, left * 72.0 / x, top * 72.0 / y,
            (width - left - GetDeviceCaps(dc, PrintableWidth)) * 72.0 / x,
            (height - top - GetDeviceCaps(dc, PrintableHeight)) * 72.0 / y, Math.Min(x, 300), Math.Min(y, 300));
    }

    private static bool Selected(int page, PrintDialog dialog)
    {
        if ((dialog.Flags & PageNumbers) == 0)
            return true;
        if (dialog.PageRangeCount > MaxRanges)
            return false;
        for (var index = 0; index < dialog.PageRangeCount; index++)
        {
            var range = Marshal.PtrToStructure<PageRange>(dialog.PageRanges + index * Marshal.SizeOf<PageRange>());
            if (page >= range.From && page <= range.To)
                return true;
        }
        return false;
    }

    private static unsafe bool DrawPage(nint dc, WindowCapture capture)
    {
        var pixels = capture.Pixels;
        for (var index = 0; index < pixels.Length; index += 4)
            (pixels[index], pixels[index + 2]) = (pixels[index + 2], pixels[index]);
        var bitmap = new BitmapInfo
        {
            Size = (uint)Marshal.SizeOf<BitmapInfo>(),
            Width = checked((int)capture.Width),
            Height = -checked((int)capture.Height),
            Planes = 1,
            Bits = 32
        };
        fixed (byte* data = pixels)
            return StretchDIBits(dc, -GetDeviceCaps(dc, OffsetX), -GetDeviceCaps(dc, OffsetY),
                GetDeviceCaps(dc, PhysicalWidth), GetDeviceCaps(dc, PhysicalHeight), 0, 0,
                bitmap.Width, -bitmap.Height, data, ref bitmap, 0, SourceCopy) > 0;
    }

    private static bool DismissDialog(nint window, nint owner)
    {
        for (var parent = GetWindow(window, OwnerWindow); parent != 0; parent = GetWindow(parent, OwnerWindow))
        {
            if (parent != owner)
                continue;
            PostMessageW(window, CloseMessage, 0, 0);
            break;
        }
        return true;
    }

    private static PrintResult Failure(string operation) => new(PrintStatus.Failed,
        Error: Printing.Detail(operation + ": " + new Win32Exception(Marshal.GetLastWin32Error()).Message));

    [StructLayout(LayoutKind.Sequential)]
    private struct PrintDialog
    {
        internal uint Size;
        internal nint Owner, DeviceMode, DeviceNames, Dc;
        internal uint Flags, Flags2, ExclusionFlags, PageRangeCount, MaxPageRanges;
        internal nint PageRanges;
        internal uint MinPage, MaxPage, Copies;
        internal nint Instance, TemplateName, Callback;
        internal uint PropertyPages;
        internal nint PropertyPageHandles;
        internal uint StartPage, ResultAction;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct PageRange { internal uint From, To; }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct DocumentInfo
    {
        internal int Size;
        [MarshalAs(UnmanagedType.LPWStr)] internal string Name;
        [MarshalAs(UnmanagedType.LPWStr)] internal string? Output;
        internal nint DataType;
        internal uint Type;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct BitmapInfo
    {
        internal uint Size;
        internal int Width, Height;
        internal ushort Planes, Bits;
        internal uint Compression, ImageSize;
        internal int XResolution, YResolution;
        internal uint ColorsUsed, ColorsImportant;
    }

    [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate int AbortCallback(nint dc, int error);
    [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate bool WindowCallback(nint window, nint data);
    [DllImport("comdlg32.dll", CharSet = CharSet.Unicode)] private static extern int PrintDlgExW(ref PrintDialog dialog);
    [DllImport("ole32.dll")] private static extern int CoInitializeEx(nint reserved, uint flags);
    [DllImport("ole32.dll")] private static extern void CoUninitialize();
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
    [DllImport("kernel32.dll")] private static extern nint GlobalFree(nint memory);
    [DllImport("user32.dll")] private static extern bool EnumThreadWindows(uint thread, WindowCallback callback, nint data);
    [DllImport("user32.dll")] private static extern nint GetWindow(nint window, uint command);
    [DllImport("user32.dll")] private static extern bool PostMessageW(nint window, uint message, nuint wparam, nint lparam);
    [DllImport("gdi32.dll")] private static extern int GetDeviceCaps(nint dc, int index);
    [DllImport("gdi32.dll", SetLastError = true)] private static extern int SetAbortProc(nint dc, AbortCallback callback);
    [DllImport("gdi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern int StartDocW(nint dc, ref DocumentInfo info);
    [DllImport("gdi32.dll", SetLastError = true)] private static extern int StartPage(nint dc);
    [DllImport("gdi32.dll", SetLastError = true)] private static extern int EndPage(nint dc);
    [DllImport("gdi32.dll", SetLastError = true)] private static extern int EndDoc(nint dc);
    [DllImport("gdi32.dll")] private static extern int AbortDoc(nint dc);
    [DllImport("gdi32.dll")] private static extern bool DeleteDC(nint dc);
    [DllImport("gdi32.dll", SetLastError = true)]
    private static extern unsafe int StretchDIBits(nint dc,
        int x, int y, int width, int height, int sourceX, int sourceY, int sourceWidth, int sourceHeight,
        byte* pixels, ref BitmapInfo info, uint usage, uint operation);
}
