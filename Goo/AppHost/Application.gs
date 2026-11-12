package Goo

import System
import System.Reflection

/// Configures process identity, activation delivery and the desktop event loop.
public shared partial class Application {
    internal prop HasOpenedWindow bool {
        get;
        set;
    }

    /// Configures application identity before native initialization.
    /// @param name The human-readable product name.
    /// @param version The application version.
    /// @param identifier The stable reverse-domain application identifier.
    public func Configure(name string, version string, identifier string) ->
    SdlRuntime.ConfigureApplication(name, version, identifier)

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
        let identifier = SdlRuntime.ApplicationIdentifier
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
}
