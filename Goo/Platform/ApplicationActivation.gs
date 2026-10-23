package Goo

import System
import System.Collections.Generic
import System.Text

/// Identifies a process launch, forwarded request, URI, documents, or notification response.
public enum ApplicationActivationKind { Launch; Arguments; OpenUri; OpenDocuments; Notification }

/// Reports whether a process activation entered the owner-thread delivery queue.
public enum ActivationPostStatus { Accepted; NotInitialized; Closed; QueueFull; TooLarge }

/// Owns the data delivered by the process-wide application activation event.
/// URI values do not grant access to documents and notification payloads are untrusted app data.
public class ApplicationActivation {
    /// Gets the activation source category.
    public prop Kind ApplicationActivationKind { get; init; }
    /// Gets whether this request caused the process's initial activation.
    public prop IsInitial bool { get; init; }
    /// Gets the absolute target URI for an OpenUri request, or nil for other requests.
    public prop Target Uri? { get; init; }
    /// Gets absolute document URIs without converting provider URIs to filesystem paths.
    public prop Documents IReadOnlyList[Uri] { get; init; }
    /// Gets argument values with their original boundaries and empty values preserved.
    public prop Arguments IReadOnlyList[string] { get; init; }
    /// Gets the sender's working directory without changing the receiving process's directory.
    public prop WorkingDirectory string { get; init; }
    /// Gets the application-defined notification ID, or an empty string.
    public prop NotificationId string { get; init; }
    /// Gets the notification action ID, or an empty string for its default action.
    public prop ActionId string { get; init; }
    /// Gets bounded opaque notification data which the application must validate before use.
    public prop Payload string { get; init; }

    /// Creates a Launch request with empty argument, document, and notification data.
    public init() {
        Documents = Array.Empty[Uri]()
        Arguments = Array.Empty[string]()
        WorkingDirectory = ""
        NotificationId = ""
        ActionId = ""
        Payload = ""
    }

    internal func TrySnapshot(out owned ApplicationActivation?) bool {
        owned = nil
        if Kind < ApplicationActivationKind.Launch || Kind > ApplicationActivationKind.Notification {
            throw ArgumentOutOfRangeException("Kind")
        }
        if Documents == nil || Arguments == nil { throw ArgumentNullException("Documents or Arguments") }
        if Documents.Count > MaxItems || Arguments.Count > MaxItems { return false }
        var bytes int32 = 0
        if !IncludeString(WorkingDirectory, ref bytes) || !IncludeString(NotificationId, ref bytes)
            || !IncludeString(ActionId, ref bytes) || !IncludeString(Payload, ref bytes) { return false }
        if let target = Target {
            if !IncludeUri(target, ref bytes) { return false }
        }
        if Kind == ApplicationActivationKind.OpenUri && Target == nil { throw ArgumentException("OpenUri requires Target") }
        let documents = if Documents.Count == 0 { Array.Empty[Uri]() } else { [Documents.Count]Uri }
        for i in 0 ... documents.Length {
            let value = Documents[i]
            if !IncludeUri(value, ref bytes) { return false }
            documents[i] = value
        }
        let arguments = if Arguments.Count == 0 { Array.Empty[string]() } else { [Arguments.Count]string }
        for i in 0 ... arguments.Length {
            let value = Arguments[i]
            if !IncludeString(value, ref bytes) { return false }
            arguments[i] = value
        }
        owned = ApplicationActivation{
            Kind: Kind, IsInitial: IsInitial, Target: Target,
            Documents: if documents.Length == 0 { documents } else { Array.AsReadOnly[Uri](documents) },
            Arguments: if arguments.Length == 0 { arguments } else { Array.AsReadOnly[string](arguments) },
            WorkingDirectory: WorkingDirectory, NotificationId: NotificationId, ActionId: ActionId, Payload: Payload,
        }
        return true
    }

    shared {
        private const MaxItems int32 = 256
        private const MaxStringBytes int32 = 65536
        private const MaxRequestBytes int32 = 1048576

        private func IncludeUri(value Uri, ref bytes int32) bool {
            if value == nil { throw ArgumentNullException("URI") }
            if !value.IsAbsoluteUri { throw ArgumentException("Activation URIs must be absolute") }
            return IncludeString(value.OriginalString, ref bytes)
        }

        private func IncludeString(value string, ref bytes int32) bool {
            if value == nil { throw ArgumentNullException("Activation text") }
            if value.Length > MaxStringBytes { return false }
            let count = Encoding.UTF8.GetByteCount(value)
            if count > MaxStringBytes || count > MaxRequestBytes - bytes { return false }
            bytes += count
            return true
        }
    }
}
