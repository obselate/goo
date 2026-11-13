package Goo

import System

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
