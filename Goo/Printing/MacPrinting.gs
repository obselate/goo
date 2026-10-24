package Goo.Printing

import Goo
import System
import System.IO
import System.Runtime.CompilerServices
import System.Runtime.InteropServices
import System.Threading
import System.Threading.Tasks

internal unsafe shared class MacPrinting {
    private class Job : IDisposable {
        private let owner Window
        private let lease NativeDialogOwnerLease
        private let title string
        private let cancellation CancellationToken
        private let context GCHandle
        private let registration CancellationTokenRegistration
        private var nativeDelegate nint
        private var printInfo nint
        private var panel nint
        private var pdf nint
        private var operation nint
        internal let Settings TaskCompletionSource[bool] = TaskCompletionSource[bool](
            TaskCreationOptions.RunContinuationsAsynchronously
        )
        internal let Printed TaskCompletionSource[PrintResult] = TaskCompletionSource[PrintResult](
            TaskCreationOptions.RunContinuationsAsynchronously
        )
        internal var PageSettings PrintPageSettings

        private init(owner Window, lease NativeDialogOwnerLease, title string, cancellation CancellationToken) {
            this.owner = owner
            this.lease = lease
            this.title = title
            this.cancellation = cancellation
            context = GCHandle.Alloc(this)
            nativeDelegate = MacPrinting.Send(
                MacPrinting.Send(MacPrinting.delegateClass, MacPrinting.Selector("alloc")),
                MacPrinting.Selector("init")
            )
            printInfo = MacPrinting.Send(
                MacPrinting.Send(MacPrinting.objc_getClass("NSPrintInfo"), MacPrinting.Selector("sharedPrintInfo")),
                MacPrinting.Selector("copy")
            )
            panel = MacPrinting.Send(
                MacPrinting.Send(MacPrinting.objc_getClass("NSPrintPanel"), MacPrinting.Selector("printPanel")),
                MacPrinting.Selector("retain")
            )
            registration = cancellation.Register(() -> owner.TryPost(CancelSheet))
        }

        internal func Submit(path string) {
            cancellation.ThrowIfCancellationRequested()
            let pool = MacPrinting.objc_autoreleasePoolPush()
            try {
                let url = MacPrinting.SendArgument(
                    MacPrinting.objc_getClass("NSURL"),
                    MacPrinting.Selector("fileURLWithPath:"),
                    MacPrinting.NativeString(path)
                )
                pdf = MacPrinting.SendArgument(
                    MacPrinting.Send(MacPrinting.objc_getClass("PDFDocument"), MacPrinting.Selector("alloc")),
                    MacPrinting.Selector("initWithURL:"),
                    url
                )
                if pdf == 0 {
                    Printed.TrySetResult(
                        PrintResult(PrintStatus.Failed, Error: "PDFKit could not open the rendered document.")
                    )
                    return
                }
                operation = MacPrinting.Send(
                    MacPrinting.SendPrintOperation(
                        pdf,
                        MacPrinting.Selector("printOperationForPrintInfo:scalingMode:autoRotate:"),
                        printInfo,
                        0,
                        0
                    ),
                    MacPrinting.Selector("retain")
                )
                if operation == 0 {
                    Printed.TrySetResult(
                        PrintResult(PrintStatus.Failed, Error: "PDFKit could not create the print operation.")
                    )
                    return
                }
                MacPrinting.SendBoolean(operation, MacPrinting.Selector("setShowsPrintPanel:"), 0)
                MacPrinting.SendBoolean(operation, MacPrinting.Selector("setCanSpawnSeparateThread:"), 1)
                MacPrinting.SendArgument(
                    operation,
                    MacPrinting.Selector("setJobTitle:"),
                    MacPrinting.NativeString(title)
                )
                MacPrinting.RunOperation(
                    operation,
                    MacPrinting.Selector("runOperationModalForWindow:delegate:didRunSelector:contextInfo:"),
                    lease.Handle,
                    nativeDelegate,
                    MacPrinting.Selector("gooPrintOperation:didRun:context:"),
                    GCHandle.ToIntPtr(context)
                )
            } finally {
                MacPrinting.objc_autoreleasePoolPop(pool)
            }
        }

        private func AcceptSettings(result nint) {
            if result != 1 || cancellation.IsCancellationRequested {
                Settings.TrySetResult(false)
                return
            }
            let size = MacPrinting.SendSize(printInfo, MacPrinting.Selector("paperSize"))
            let bounds = MacPrinting.GetRect(printInfo, MacPrinting.Selector("imageablePageBounds"))
            PageSettings = PrintPageSettings(
                size.Width,
                size.Height,
                bounds.X,
                size.Height - bounds.Y - bounds.Height,
                size.Width - bounds.X - bounds.Width,
                bounds.Y
            )
            Printing.Validate(PageSettings)
            Settings.TrySetResult(true)
        }

        private func CancelSheet() {
            let sheet = MacPrinting.Send(lease.Handle, MacPrinting.Selector("attachedSheet"))
            if sheet != 0 {
                MacPrinting.EndSheet(lease.Handle, MacPrinting.Selector("endSheet:returnCode:"), sheet, 0)
            }
        }

        func Dispose() {
            registration.Dispose()
            MacPrinting.Release(operation)
            MacPrinting.Release(pdf)
            MacPrinting.Release(panel)
            MacPrinting.Release(printInfo)
            MacPrinting.Release(nativeDelegate)
            operation = (pdf = (panel = (printInfo = (nativeDelegate = 0))))
            context.Free()
            GC.KeepAlive(owner)
        }

        shared {
            internal func Create(
                owner Window,
                lease NativeDialogOwnerLease,
                title string,
                cancellation CancellationToken
            ) Job? {
                if !MacPrinting.LoadFrameworks() {
                    return nil
                }
                let pool = MacPrinting.objc_autoreleasePoolPush()
                try {
                    MacPrinting.EnsureDelegateClass()
                    let job = Job(owner, lease, title, cancellation)
                    MacPrinting.BeginSheet(
                        job.panel,
                        MacPrinting.Selector(
                            "beginSheetWithPrintInfo:modalForWindow:delegate:didEndSelector:contextInfo:"
                        ),
                        job.printInfo,
                        lease.Handle,
                        job.nativeDelegate,
                        MacPrinting.Selector("gooPrintPanel:didEnd:context:"),
                        GCHandle.ToIntPtr(job.context)
                    )
                    return job
                } finally {
                    MacPrinting.objc_autoreleasePoolPop(pool)
                }
            }

            internal func CompletePanel(context nint, result nint) {
                let job = cast[Job?](GCHandle.FromIntPtr(context).Target)
                try {
                    job?.AcceptSettings(result)
                } catch (error Exception) {
                    job?.Settings.TrySetException(
                        IOException("The macOS print panel failed: " + Printing.Detail(error.Message))
                    )
                }
            }

            internal func CompleteOperation(context nint, succeeded bool) {
                let job Job? = cast[Job?](GCHandle.FromIntPtr(context).Target)
                if job != nil {
                    job.Printed.TrySetResult(
                        PrintResult(
                            if succeeded {
                                PrintStatus.Submitted
                            } else {
                                (
                                    if job.cancellation.IsCancellationRequested {
                                        PrintStatus.Cancelled
                                    } else {
                                        PrintStatus.Failed
                                    }
                                )
                            }
                        )
                    )
                }
            }
        }
    }

    @StructLayout(LayoutKind.Sequential)
    private struct Size {
        internal var Width float64
        internal var Height float64
    }

    @StructLayout(LayoutKind.Sequential)
    private struct Rect {
        internal var X float64
        internal var Y float64
        internal var Width float64
        internal var Height float64
    }

    private const ObjectiveC string = "/usr/lib/libobjc.A.dylib"
    private var delegateClass nint
    private var appKit nint
    private var pdfKit nint

    internal async func PrintAsync(
        owner Window,
        lease NativeDialogOwnerLease,
        document IPrintDocument,
        title string,
        cancellation CancellationToken
    ) PrintResult {
        var job Job? = nil
        try {
            job = await Printing.OnOwnerAsync(owner, () -> Job.Create(owner, lease, title, cancellation), cancellation)
                .ConfigureAwait(false)
            if job == nil {
                return PrintResult(PrintStatus.Unsupported)
            }
            let accepted = await job.Settings.Task.ConfigureAwait(false)
            if !accepted {
                return PrintResult(PrintStatus.Cancelled)
            }
            let path = Path.Combine(Path.GetTempPath(), "goo-print-" + Guid.NewGuid().ToString("N") + ".pdf")
            await using let file = FileStream(
                path,
                FileMode.CreateNew,
                FileAccess.ReadWrite,
                FileShare.Read,
                4096,
                FileOptions.Asynchronous | FileOptions.DeleteOnClose
            )
            let exported = await Printing.ExportPdfAsync(owner, document, job.PageSettings, file, cancellation)
                .ConfigureAwait(false)
            if exported.Status != PrintStatus.Exported {
                return exported
            }
            await file.FlushAsync(cancellation).ConfigureAwait(false)
            await Printing.OnOwnerAsync(
                owner,
                () -> {
                    job!!.Submit(path)
                    return true
                },
                cancellation
            )
                .ConfigureAwait(false)
            return await job.Printed.Task.ConfigureAwait(false)
        } finally {
            if job != nil {
                await Printing.OnOwnerAsync(
                    owner,
                    () -> {
                        job!!.Dispose()
                        return true
                    },
                    CancellationToken.None
                )
                    .ConfigureAwait(false)
            }
        }
    }

    private func LoadFrameworks() bool {
        if appKit == 0 && !NativeLibrary.TryLoad("/System/Library/Frameworks/AppKit.framework/AppKit", out appKit) {
            return false
        }
        return pdfKit != 0 || NativeLibrary.TryLoad("/System/Library/Frameworks/PDFKit.framework/PDFKit", out pdfKit)
    }

    private func EnsureDelegateClass() {
        unsafe {
            if delegateClass != 0 {
                return
            }
            let created = objc_allocateClassPair(objc_getClass("NSObject"), "GooNativePrintDelegate", 0)
            if created == 0 {
                throw IOException("Cannot create the native print callback class.")
            }
            let panelCompleted = cast[unmanaged[Cdecl](nint, nint, nint, nint, nint) -> void](&PanelCompleted)
            let operationCompleted = cast[unmanaged[Cdecl](nint, nint, nint, uint8, nint) -> void](&OperationCompleted)
            if class_addMethod(
                created,
                Selector("gooPrintPanel:didEnd:context:"),
                nint(panelCompleted),
                "v@:@q^v"
            ) == uint8(0) ||
                class_addMethod(
                created,
                Selector("gooPrintOperation:didRun:context:"),
                nint(operationCompleted),
                "v@:@c^v"
            ) == uint8(0) {
                objc_disposeClassPair(created)
                throw IOException("Cannot register the native print callbacks.")
            }
            objc_registerClassPair(created)
            delegateClass = created
        }
    }

    @UnmanagedCallersOnly(CallConvs = []Type{typeof(CallConvCdecl)})
    private func PanelCompleted(self nint, selector nint, panel nint, result nint, context nint) -> Job.CompletePanel(
        context,
        result
    )

    @UnmanagedCallersOnly(CallConvs = []Type{typeof(CallConvCdecl)})
    private func OperationCompleted(
        self nint,
        selector nint,
        operation nint,
        succeeded uint8,
        context nint
    ) -> Job.CompleteOperation(context, succeeded != uint8(0))

    private func NativeString(value string) nint {
        unsafe {
            fixed characters *char = value {
                return Send(
                    CreateString(
                        Send(objc_getClass("NSString"), Selector("alloc")),
                        Selector("initWithCharacters:length:"),
                        characters,
                        nuint(value.Length)
                    ),
                    Selector("autorelease")
                )
            }
        }
    }

    private func Release(value nint) {
        if value != 0 {
            Send(value, Selector("release"))
        }
    }

    private func Selector(name string) nint -> sel_registerName(name)

    private func GetRect(receiver nint, selector nint) MacPrinting.Rect {
        if RuntimeInformation.ProcessArchitecture != Architecture.X64 {
            return SendRect(receiver, selector)
        }
        SendRectX64(out var result, receiver, selector)
        return result
    }

    @DllImport("/usr/lib/libobjc.A.dylib")
    private func objc_getClass(name string) nint;

    @DllImport("/usr/lib/libobjc.A.dylib")
    private func sel_registerName(name string) nint;

    @DllImport("/usr/lib/libobjc.A.dylib")
    private func objc_allocateClassPair(parent nint, name string, extraBytes nuint) nint;

    @DllImport("/usr/lib/libobjc.A.dylib")
    private func objc_registerClassPair(type nint);

    @DllImport("/usr/lib/libobjc.A.dylib")
    private func objc_disposeClassPair(type nint);

    @DllImport("/usr/lib/libobjc.A.dylib")
    private func class_addMethod(type nint, selector nint, implementation nint, signature string) uint8;

    @DllImport("/usr/lib/libobjc.A.dylib")
    private func objc_autoreleasePoolPush() nint;

    @DllImport("/usr/lib/libobjc.A.dylib")
    private func objc_autoreleasePoolPop(pool nint);

    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint = "objc_msgSend")
    private func Send(receiver nint, selector nint) nint;

    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint = "objc_msgSend")
    private func SendArgument(receiver nint, selector nint, value nint) nint;

    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint = "objc_msgSend")
    private func SendBoolean(receiver nint, selector nint, value uint8);

    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint = "objc_msgSend")
    private func CreateString(receiver nint, selector nint, value *char, length nuint) nint;

    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint = "objc_msgSend")
    private func SendSize(receiver nint, selector nint) Size;

    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint = "objc_msgSend")
    private func SendRect(receiver nint, selector nint) MacPrinting.Rect;

    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint = "objc_msgSend_stret")
    private func SendRectX64(out result MacPrinting.Rect, receiver nint, selector nint);

    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint = "objc_msgSend")
    private func BeginSheet(
        panel nint,
        selector nint,
        info nint,
        owner nint,
        callback nint,
        completed nint,
        context nint
    );

    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint = "objc_msgSend")
    private func EndSheet(owner nint, selector nint, sheet nint, code nint);

    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint = "objc_msgSend")
    private func SendPrintOperation(document nint, selector nint, info nint, scale nint, rotate uint8) nint;

    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint = "objc_msgSend")
    private func RunOperation(operation nint, selector nint, owner nint, callback nint, completed nint, context nint);
}
