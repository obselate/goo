package Goo

import System
import System.Threading.Tasks

/// Reports primary ownership or the outcome of forwarding to the existing instance.
public enum SingleInstanceStatus {
    Primary;
    Forwarded;
    TimedOut;
    Unsupported;
    Rejected;
    Failed;
}

/// Owns the primary lifetime or reports why a request was not forwarded.
public class SingleInstanceResult {
    /// Gets the election or forwarding outcome.
    public prop Status SingleInstanceStatus { get; }
    /// Gets the primary's disposable lease, or nil for every other status.
    public prop Lease IDisposable? { get; }
    /// Gets bounded failure detail without argument or document contents.
    public prop Error string { get; }

    internal init(status SingleInstanceStatus, lease IDisposable? = nil, error string = "") {
        Status = status
        Lease = lease
        Error = if error.Length > 512 { error.Substring(0, 512) } else { error }
    }
}

/// Elects one desktop instance and forwards typed requests to its activation queue.
public class SingleInstance {
    private init() {}

    shared {
        /// Acquires a primary lease or forwards to the current user's existing desktop instance.
        /// Initialize Window application activation on the UI thread before calling this method.
        /// macOS captures native launch requests before election and forwards each retained request.
        /// On Wayland, RequestActivation inside the receiving handler uses the forwarded activation token.
        /// Keep the primary lease until shutdown. Forwarded confirms queue ownership, not handler completion.
        /// A timeout never elects a second primary and does not prove that an unacknowledged request was unused.
        /// Android and other non-desktop targets return Unsupported.
        /// @param applicationId A stable application identity shared by both processes.
        /// @param activation The request to forward. Launch becomes Arguments and IsInitial becomes false.
        /// @param timeoutMilliseconds The positive connection and acknowledgement deadline in milliseconds.
        /// @returns A primary lease or an explicit forwarding, timeout, unsupported, rejection, or failure result.
        /// @exception ArgumentException when the identity is empty or exceeds 255 UTF-8 bytes.
        /// @exception ArgumentNullException when activation is nil.
        /// @exception ArgumentOutOfRangeException when the timeout is not positive.
        /// @exception InvalidOperationException on macOS when initialized activation belongs to another UI thread.
        public func AcquireAsync(applicationId string, activation ApplicationActivation,
            timeoutMilliseconds int32 = 3000) Task[SingleInstanceResult] ->
            InstancePipe.AcquireAsync(applicationId, activation, timeoutMilliseconds)
    }
}
