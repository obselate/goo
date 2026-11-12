package Goo

import System
import System.Collections.Generic
import System.Reflection
import System.Threading

/// Configures process identity, activation delivery and the desktop event loop.
public shared class Application {
    private var applicationName string = ""
    private var applicationVersion string = ""
    private var applicationIdentifier string = ""
    private var nativeIdentityBound bool
    internal prop Identifier string { get -> applicationIdentifier }

    internal prop HasOpenedWindow bool {
        get;
        set;
    }

    /// Configures application identity before native initialization.
    /// @param name The human-readable product name.
    /// @param version The application version.
    /// @param identifier The stable reverse-domain application identifier.
    public func Configure(name string, version string, identifier string) {
        if String.IsNullOrWhiteSpace(name) { throw ArgumentException("name") }
        if String.IsNullOrWhiteSpace(version) { throw ArgumentException("version") }
        if String.IsNullOrWhiteSpace(identifier) { throw ArgumentException("identifier") }
        lock activationGate {
            if applicationIdentifier.Length != 0 {
                if applicationName == name && applicationVersion == version && applicationIdentifier == identifier { return }
                throw InvalidOperationException("Goo application metadata is already configured with different values.")
            }
            if nativeIdentityBound {
                throw InvalidOperationException("Goo application metadata must be configured before native initialization.")
            }
            applicationName = name
            applicationVersion = version
            applicationIdentifier = identifier
        }
    }

    internal func ApplyNativeIdentity() {
        lock activationGate {
            nativeIdentityBound = true
            if applicationIdentifier.Length != 0 {
                SdlRuntime.ApplyApplicationIdentity(applicationName, applicationVersion, applicationIdentifier)
            }
        }
    }

    /// Configures identity from Product, InformationalVersion and GooApplicationId assembly metadata.
    /// @param assembly The application assembly.
    /// @exception InvalidOperationException when required assembly metadata is missing.
    public func Configure(assembly Assembly) {
        if assembly == nil {
            throw ArgumentNullException("assembly")
        }
        let name = assembly.GetCustomAttribute[AssemblyProductAttribute]()?.Product
        let version = assembly.GetCustomAttribute[AssemblyInformationalVersionAttribute]()?.InformationalVersion
        var identifier string? = nil
        for metadata in assembly.GetCustomAttributes[AssemblyMetadataAttribute]() {
            if metadata.Key == "GooApplicationId" {
                identifier = metadata.Value
            }
        }
        if String.IsNullOrWhiteSpace(name) {
            throw InvalidOperationException("Set the MSBuild Product property")
        }
        if String.IsNullOrWhiteSpace(version) {
            throw InvalidOperationException("Set the MSBuild InformationalVersion property")
        }
        if String.IsNullOrWhiteSpace(identifier) {
            throw InvalidOperationException("Set the MSBuild GooPackageId property")
        }
        Configure(name, version.Split('+')[0], identifier)
    }

    /// Initializes activation and elects a primary instance before the first window opens.
    /// Keep the returned primary lease until shutdown. Forwarded confirms queue ownership only.
    /// @param arguments The startup arguments, without the executable name.
    /// @param timeoutMs The positive connection and acknowledgement deadline in milliseconds.
    /// @returns A primary lease or the explicit forwarding or failure result.
    public func AcquireSingleInstance(arguments[]string, timeoutMs float64 = 3000.0) SingleInstanceResult {
        if !Double.IsFinite(timeoutMs) || timeoutMs <= 0.0 || timeoutMs > float64(Int32.MaxValue) {
            throw ArgumentOutOfRangeException("timeoutMs")
        }
        let identifier = Identifier
        if HasOpenedWindow {
            throw InvalidOperationException("Acquire a single instance before opening the first window")
        }
        if identifier.Length == 0 {
            throw InvalidOperationException("Call Application.Configure before acquiring a single instance")
        }
        let parsed = ActivationArguments.Read(arguments, Environment.CurrentDirectory)
        if parsed.Activation == nil {
            return SingleInstanceResult(SingleInstanceStatus.Rejected, error: parsed.Error)
        }
        let initial = parsed.Activation!!
        EnsureActivation(initial)
        return InstancePipe.AcquireAsync(identifier, initial, int32(Math.Ceiling(timeoutMs))).GetAwaiter().GetResult()
    }

    /// Opens the window and runs the UI event loop until all Goo windows close.
    /// @param window The first window, which may already be open.
    public func Run(window Window) {
        if window == nil {
            throw ArgumentNullException("window")
        }
        EnsureActivation()
        window.RunApplication()
    }

    private const MaxPendingActivations int32 = 1024
    private let activationGate object = Object()
    private let pendingActivations Queue[ApplicationActivation] = Queue[ApplicationActivation](MaxPendingActivations)
    private var activationOwnerThreadId int32
    private var pendingActivationCount int32
    private var activationClosed bool
    private var activationDelivered bool
    private var deliveringActivation bool
    private var applicationActivated Action[ApplicationActivation]?
    internal prop CurrentActivationToken string? {
        get;
        set;
    }
    private var nativeActivationHeld bool

    internal func PrepareNativeApplicationActivation(out initial[]ApplicationActivation) WindowOperationResult {
        initial = Array.Empty[ApplicationActivation]()
        RequireActivationThread()
        if activationOwnerThreadId == 0 || activationClosed {
            return WindowOperationResult.Accepted
        }
        SdlRuntime.RequireMainThread("Application.AcquireSingleInstance")
        if !nativeActivationHeld {
            try {
                SdlRuntime.Acquire()
            } catch (_ InvalidOperationException) {
                return WindowOperationResult.Failed
            }
            nativeActivationHeld = true
        }
        SdlRuntime.PollEvents()
        lock activationGate {
            var count int32 = 0
            for value in pendingActivations {
                if value.IsInitial && value.Kind != ApplicationActivationKind.Launch {
                    count++
                }
            }
            if count == 0 {
                return WindowOperationResult.Accepted
            }
            initial = [count]ApplicationActivation
            count = 0
            for value in pendingActivations {
                if value.IsInitial && value.Kind != ApplicationActivationKind.Launch {
                    initial[count] = value
                    count++
                }
            }
        }
        return WindowOperationResult.Accepted
    }

    private func ReleaseNativeApplicationActivation() {
        if !nativeActivationHeld {
            return
        }
        nativeActivationHeld = false
        SdlRuntime.Release()
    }

    /// Occurs once per application activation on the process UI thread, not once per open window.
    /// Subscribe before initializing activation. Handlers own validation and window selection.
    /// The queue retains 1024 requests, with 4096 arguments or documents per request.
    /// Text is limited to 64 KiB per UTF-8 string and 1 MiB per request.
    /// Native requests outside these limits, or received before initialization or after close, are dropped.
    public event Activated Action[ApplicationActivation] {
        add {
            RequireActivationThread()
            applicationActivated += value
            Window.WakeForApplicationActivations()
        }
        remove {
            RequireActivationThread()
            applicationActivated -= value
        }
    }

    internal func InitializeActivation(initial ApplicationActivation) WindowOperationResult {
        if initial == nil {
            throw ArgumentNullException("initial")
        }
        RequireActivationThread()
        if !initial.TrySnapshot(out var owned) {
            return WindowOperationResult.Failed
        }
        lock activationGate {
            if activationOwnerThreadId != 0 && !activationClosed {
                throw InvalidOperationException("Application activation is already initialized")
            }
            activationOwnerThreadId = Environment.CurrentManagedThreadId
            activationClosed = false
            activationDelivered = false
            pendingActivations.Enqueue(owned!!)
            Volatile.Write(ref pendingActivationCount, pendingActivations.Count)
        }
        Window.WakeForApplicationActivations()
        return WindowOperationResult.Accepted
    }

    /// Copies and queues a request from any thread for the process-wide activation event.
    /// Accepted confirms queue ownership, not handler completion, document access, or focus.
    /// Requests allow 4096 arguments and documents each, 64 KiB per UTF-8 string and 1 MiB total text.
    /// @param value The owned request data to copy. Relative URIs and null values are invalid arguments.
    /// @returns Accepted, NotInitialized, Closed, QueueFull at 1024 pending requests, or TooLarge.
    public func PostActivation(value ApplicationActivation) ActivationPostStatus {
        if value == nil {
            throw ArgumentNullException("value")
        }
        lock activationGate {
            let status = ActivationQueueStatus()
            if status != ActivationPostStatus.Accepted {
                return status
            }
        }
        if !value.TrySnapshot(out var owned) {
            return ActivationPostStatus.TooLarge
        }
        lock activationGate {
            let status = ActivationQueueStatus()
            if status != ActivationPostStatus.Accepted {
                return status
            }
            if !activationDelivered && value.IsInitial && pendingActivations.Count == 1
            && pendingActivations.Peek().Kind == ApplicationActivationKind.Launch {
                pendingActivations.Dequeue()
            }
            pendingActivations.Enqueue(owned!!)
            Volatile.Write(ref pendingActivationCount, pendingActivations.Count)
        }
        Window.WakeForApplicationActivations()
        return ActivationPostStatus.Accepted
    }

    private func ActivationQueueStatus() ActivationPostStatus {
        if activationOwnerThreadId == 0 {
            return ActivationPostStatus.NotInitialized
        }
        if activationClosed {
            return ActivationPostStatus.Closed
        }
        return if pendingActivations.Count >= MaxPendingActivations {
            ActivationPostStatus.QueueFull
        } else {
            ActivationPostStatus.Accepted
        }
    }

    private func RequireActivationThread() {
        let owner = Volatile.Read(ref activationOwnerThreadId)
        if owner != 0 && owner != Environment.CurrentManagedThreadId {
            throw InvalidOperationException("Application activation belongs to the process UI thread")
        }
    }

    internal func EnsureActivation(initial ApplicationActivation? = nil) {
        RequireActivationThread()
        if activationOwnerThreadId == 0 || activationClosed {
            let startup = initial ?? ActivationArguments.Read(
                Environment.GetCommandLineArgs()[1 ..],
                Environment.CurrentDirectory
            )
                .Activation
            if startup == nil {
                throw ArgumentException("Invalid application activation arguments")
            }
            InitializeActivation(startup)
        }
    }

    internal prop HasPendingActivation bool {
        get -> applicationActivated != nil && Volatile.Read(ref pendingActivationCount) != 0
    }

    internal prop IsInitialActivation bool {
        get -> activationOwnerThreadId != 0 && !activationClosed && !activationDelivered
    }

    internal func DrainActivations() {
        if !HasPendingActivation || deliveringActivation {
            return
        }
        RequireActivationThread()
        var count int32
        lock activationGate {
            count = pendingActivations.Count
        }
        deliveringActivation = true
        try {
            for i in 0 ... count {
                var value ApplicationActivation
                lock activationGate {
                    if pendingActivations.Count == 0 {
                        return
                    }
                    value = pendingActivations.Dequeue()
                    activationDelivered = true
                    Volatile.Write(ref pendingActivationCount, pendingActivations.Count)
                }
                CurrentActivationToken = value.NativeActivationToken
                try {
                    applicationActivated?.Invoke(value)
                } finally {
                    CurrentActivationToken = nil
                }
            }
        } finally {
            deliveringActivation = false
        }
    }

    internal func CloseActivations() {
        lock activationGate {
            activationClosed = true
            pendingActivations.Clear()
            Volatile.Write(ref pendingActivationCount, 0)
        }
        ReleaseNativeApplicationActivation()
    }
}
