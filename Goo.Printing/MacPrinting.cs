using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

namespace Goo.Printing;

internal static class MacPrinting
{
    private const string ObjectiveC = "/usr/lib/libobjc.A.dylib";
    private static nint delegateClass;
    private static nint appKit;
    private static nint pdfKit;

    internal static async Task<PrintResult> PrintAsync(Window owner, NativeDialogOwnerLease lease,
        IPrintDocument document, string title, CancellationToken cancellation)
    {
        Job? job = null;
        try
        {
            job = await Printing.OnOwnerAsync(owner, () => Job.Create(owner, lease, title, cancellation), cancellation)
                .ConfigureAwait(false);
            if (job == null)
                return new(PrintStatus.Unsupported);
            var accepted = await job.Settings.Task.ConfigureAwait(false);
            if (!accepted)
                return new(PrintStatus.Cancelled);
            var path = Path.Combine(Path.GetTempPath(), "goo-print-" + Guid.NewGuid().ToString("N") + ".pdf");
            await using var file = new FileStream(path, FileMode.CreateNew, FileAccess.ReadWrite, FileShare.Read,
                4096, FileOptions.Asynchronous | FileOptions.DeleteOnClose);
            var exported = await Printing.ExportPdfAsync(owner, document, job.PageSettings, file, cancellation)
                .ConfigureAwait(false);
            if (exported.Status != PrintStatus.Exported)
                return exported;
            await file.FlushAsync(cancellation).ConfigureAwait(false);
            await Printing.OnOwnerAsync(owner, () => { job.Submit(path); return true; }, cancellation).ConfigureAwait(false);
            return await job.Printed.Task.ConfigureAwait(false);
        }
        finally
        {
            if (job != null)
                await Printing.OnOwnerAsync(owner, () => { job.Dispose(); return true; }, CancellationToken.None)
                    .ConfigureAwait(false);
        }
    }

    private sealed class Job : IDisposable
    {
        private readonly Window owner;
        private readonly NativeDialogOwnerLease lease;
        private readonly string title;
        private readonly CancellationToken cancellation;
        private readonly GCHandle context;
        private readonly CancellationTokenRegistration registration;
        private nint nativeDelegate;
        private nint printInfo;
        private nint panel;
        private nint pdf;
        private nint operation;
        internal readonly TaskCompletionSource<bool> Settings = new(TaskCreationOptions.RunContinuationsAsynchronously);
        internal readonly TaskCompletionSource<PrintResult> Printed = new(TaskCreationOptions.RunContinuationsAsynchronously);
        internal PrintPageSettings PageSettings;

        private Job(Window owner, NativeDialogOwnerLease lease, string title, CancellationToken cancellation)
        {
            this.owner = owner;
            this.lease = lease;
            this.title = title;
            this.cancellation = cancellation;
            context = GCHandle.Alloc(this);
            nativeDelegate = Send(Send(delegateClass, Selector("alloc")), Selector("init"));
            printInfo = Send(Send(objc_getClass("NSPrintInfo"), Selector("sharedPrintInfo")), Selector("copy"));
            panel = Send(Send(objc_getClass("NSPrintPanel"), Selector("printPanel")), Selector("retain"));
            registration = cancellation.Register(() => owner.TryPost(CancelSheet));
        }

        internal static Job? Create(Window owner, NativeDialogOwnerLease lease, string title, CancellationToken cancellation)
        {
            if (!LoadFrameworks())
                return null;
            var pool = objc_autoreleasePoolPush();
            try
            {
                EnsureDelegateClass();
                var job = new Job(owner, lease, title, cancellation);
                BeginSheet(job.panel, Selector("beginSheetWithPrintInfo:modalForWindow:delegate:didEndSelector:contextInfo:"),
                    job.printInfo, lease.Handle, job.nativeDelegate, Selector("gooPrintPanel:didEnd:context:"),
                    GCHandle.ToIntPtr(job.context));
                return job;
            }
            finally { objc_autoreleasePoolPop(pool); }
        }

        internal void Submit(string path)
        {
            cancellation.ThrowIfCancellationRequested();
            var pool = objc_autoreleasePoolPush();
            try
            {
                var url = SendArgument(objc_getClass("NSURL"), Selector("fileURLWithPath:"), NativeString(path));
                pdf = SendArgument(Send(objc_getClass("PDFDocument"), Selector("alloc")), Selector("initWithURL:"), url);
                if (pdf == 0)
                {
                    Printed.TrySetResult(new(PrintStatus.Failed, Error: "PDFKit could not open the rendered document."));
                    return;
                }
                operation = Send(SendPrintOperation(pdf, Selector("printOperationForPrintInfo:scalingMode:autoRotate:"),
                    printInfo, 0, 0), Selector("retain"));
                if (operation == 0)
                {
                    Printed.TrySetResult(new(PrintStatus.Failed, Error: "PDFKit could not create the print operation."));
                    return;
                }
                SendBoolean(operation, Selector("setShowsPrintPanel:"), 0);
                SendBoolean(operation, Selector("setCanSpawnSeparateThread:"), 1);
                SendArgument(operation, Selector("setJobTitle:"), NativeString(title));
                RunOperation(operation, Selector("runOperationModalForWindow:delegate:didRunSelector:contextInfo:"),
                    lease.Handle, nativeDelegate, Selector("gooPrintOperation:didRun:context:"), GCHandle.ToIntPtr(context));
            }
            finally { objc_autoreleasePoolPop(pool); }
        }

        private void AcceptSettings(nint result)
        {
            if (result != 1 || cancellation.IsCancellationRequested)
            {
                Settings.TrySetResult(false);
                return;
            }
            var size = SendSize(printInfo, Selector("paperSize"));
            var bounds = GetRect(printInfo, Selector("imageablePageBounds"));
            PageSettings = new PrintPageSettings(size.Width, size.Height, bounds.X,
                size.Height - bounds.Y - bounds.Height, size.Width - bounds.X - bounds.Width, bounds.Y);
            Printing.Validate(PageSettings);
            Settings.TrySetResult(true);
        }

        private void CancelSheet()
        {
            var sheet = Send(lease.Handle, Selector("attachedSheet"));
            if (sheet != 0)
                EndSheet(lease.Handle, Selector("endSheet:returnCode:"), sheet, 0);
        }

        public void Dispose()
        {
            registration.Dispose();
            Release(operation);
            Release(pdf);
            Release(panel);
            Release(printInfo);
            Release(nativeDelegate);
            operation = pdf = panel = printInfo = nativeDelegate = 0;
            context.Free();
            GC.KeepAlive(owner);
        }

        internal static void CompletePanel(nint context, nint result)
        {
            var job = (Job?)GCHandle.FromIntPtr(context).Target;
            try { job?.AcceptSettings(result); }
            catch (Exception error)
            {
                job?.Settings.TrySetException(new IOException("The macOS print panel failed: " + Printing.Detail(error.Message)));
            }
        }

        internal static void CompleteOperation(nint context, bool succeeded)
        {
            var job = (Job?)GCHandle.FromIntPtr(context).Target;
            if (job != null)
                job.Printed.TrySetResult(new(succeeded ? PrintStatus.Submitted :
                    job.cancellation.IsCancellationRequested ? PrintStatus.Cancelled : PrintStatus.Failed));
        }
    }

    private static bool LoadFrameworks()
    {
        if (appKit == 0 && !NativeLibrary.TryLoad("/System/Library/Frameworks/AppKit.framework/AppKit", out appKit))
            return false;
        return pdfKit != 0 || NativeLibrary.TryLoad("/System/Library/Frameworks/PDFKit.framework/PDFKit", out pdfKit);
    }

    private static unsafe void EnsureDelegateClass()
    {
        if (delegateClass != 0)
            return;
        var created = objc_allocateClassPair(objc_getClass("NSObject"), "GooNativePrintDelegate", 0);
        if (created == 0)
            throw new IOException("Cannot create the native print callback class.");
        if (class_addMethod(created, Selector("gooPrintPanel:didEnd:context:"),
                (nint)(delegate* unmanaged[Cdecl]<nint, nint, nint, nint, nint, void>)&PanelCompleted, "v@:@q^v") == 0 ||
            class_addMethod(created, Selector("gooPrintOperation:didRun:context:"),
                (nint)(delegate* unmanaged[Cdecl]<nint, nint, nint, byte, nint, void>)&OperationCompleted, "v@:@c^v") == 0)
        {
            objc_disposeClassPair(created);
            throw new IOException("Cannot register the native print callbacks.");
        }
        objc_registerClassPair(created);
        delegateClass = created;
    }

    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvCdecl)])]
    private static void PanelCompleted(nint self, nint selector, nint panel, nint result, nint context) =>
        Job.CompletePanel(context, result);

    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvCdecl)])]
    private static void OperationCompleted(nint self, nint selector, nint operation, byte succeeded, nint context) =>
        Job.CompleteOperation(context, succeeded != 0);

    private static unsafe nint NativeString(string value)
    {
        fixed (char* characters = value)
            return Send(CreateString(Send(objc_getClass("NSString"), Selector("alloc")),
                Selector("initWithCharacters:length:"), characters, (nuint)value.Length), Selector("autorelease"));
    }

    private static void Release(nint value) { if (value != 0) Send(value, Selector("release")); }
    private static nint Selector(string name) => sel_registerName(name);

    private static Rect GetRect(nint receiver, nint selector)
    {
        if (RuntimeInformation.ProcessArchitecture != Architecture.X64)
            return SendRect(receiver, selector);
        SendRectX64(out var result, receiver, selector);
        return result;
    }

    [StructLayout(LayoutKind.Sequential)] private struct Size { internal double Width, Height; }
    [StructLayout(LayoutKind.Sequential)] private struct Rect { internal double X, Y, Width, Height; }
    [DllImport(ObjectiveC)] private static extern nint objc_getClass(string name);
    [DllImport(ObjectiveC)] private static extern nint sel_registerName(string name);
    [DllImport(ObjectiveC)] private static extern nint objc_allocateClassPair(nint parent, string name, nuint extraBytes);
    [DllImport(ObjectiveC)] private static extern void objc_registerClassPair(nint type);
    [DllImport(ObjectiveC)] private static extern void objc_disposeClassPair(nint type);
    [DllImport(ObjectiveC)] private static extern byte class_addMethod(nint type, nint selector, nint implementation, string signature);
    [DllImport(ObjectiveC)] private static extern nint objc_autoreleasePoolPush();
    [DllImport(ObjectiveC)] private static extern void objc_autoreleasePoolPop(nint pool);
    [DllImport(ObjectiveC, EntryPoint = "objc_msgSend")] private static extern nint Send(nint receiver, nint selector);
    [DllImport(ObjectiveC, EntryPoint = "objc_msgSend")] private static extern nint SendArgument(nint receiver, nint selector, nint value);
    [DllImport(ObjectiveC, EntryPoint = "objc_msgSend")] private static extern void SendBoolean(nint receiver, nint selector, byte value);
    [DllImport(ObjectiveC, EntryPoint = "objc_msgSend")] private static extern unsafe nint CreateString(nint receiver, nint selector, char* value, nuint length);
    [DllImport(ObjectiveC, EntryPoint = "objc_msgSend")] private static extern Size SendSize(nint receiver, nint selector);
    [DllImport(ObjectiveC, EntryPoint = "objc_msgSend")] private static extern Rect SendRect(nint receiver, nint selector);
    [DllImport(ObjectiveC, EntryPoint = "objc_msgSend_stret")] private static extern void SendRectX64(out Rect result, nint receiver, nint selector);
    [DllImport(ObjectiveC, EntryPoint = "objc_msgSend")] private static extern void BeginSheet(nint panel, nint selector, nint info, nint owner, nint callback, nint completed, nint context);
    [DllImport(ObjectiveC, EntryPoint = "objc_msgSend")] private static extern void EndSheet(nint owner, nint selector, nint sheet, nint code);
    [DllImport(ObjectiveC, EntryPoint = "objc_msgSend")] private static extern nint SendPrintOperation(nint document, nint selector, nint info, nint scale, byte rotate);
    [DllImport(ObjectiveC, EntryPoint = "objc_msgSend")] private static extern void RunOperation(nint operation, nint selector, nint owner, nint callback, nint completed, nint context);
}
