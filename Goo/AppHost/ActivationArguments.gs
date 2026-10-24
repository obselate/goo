package Goo

import System
import System.Collections.Generic
import System.IO
import System.Text

/// Reports whether desktop startup arguments form an owned activation request.
public enum ActivationReadStatus { Accepted; Rejected }

/// Contains owned startup data or an explicit rejection.
public class ActivationReadResult {
    /// Gets whether the arguments formed a valid bounded request.
    public prop Status ActivationReadStatus { get; }
    /// Gets the owned request when Accepted, or nil when Rejected.
    public prop Activation ApplicationActivation? { get; }
    /// Gets a bounded explanation without argument or document contents.
    public prop Error string { get; }

    internal init(activation ApplicationActivation?, error string = "") {
        Status = if activation == nil { ActivationReadStatus.Rejected } else { ActivationReadStatus.Accepted }
        Activation = activation
        Error = error
    }
}

/// Converts explicit desktop association arguments without changing the current directory.
public class ActivationArguments {
    private init() {}

    shared {
        /// Reads arguments without the executable name and copies the resulting request.
        /// Ordinary arguments produce Launch. Reserved leading flags select URI, documents or notification activation.
        /// --goo-open-uri requires one absolute URI. --goo-open-documents accepts URI or path values.
        /// Relative document paths resolve against workingDirectory. URI values do not grant document access.
        /// @param arguments Argument values with their original boundaries, excluding the executable name.
        /// @param workingDirectory The sender's captured working directory.
        /// @returns An owned initial activation, or Rejected for malformed or oversized association data.
        /// @exception ArgumentNullException when arguments or workingDirectory is nil.
        public func Read(arguments IReadOnlyList[string], workingDirectory string) ActivationReadResult {
            if arguments == nil { throw ArgumentNullException("arguments") }
            if workingDirectory == nil { throw ArgumentNullException("workingDirectory") }
            try {
                if arguments.Count > ApplicationActivation.MaxItems + 1
                    || workingDirectory.Length > ApplicationActivation.MaxStringBytes { return Rejected() }
                var inputBytes = Encoding.UTF8.GetByteCount(workingDirectory)
                if inputBytes > ApplicationActivation.MaxStringBytes { return Rejected() }
                for i in 0 ... arguments.Count {
                    let text = arguments[i]
                    if text == nil || text.Length > ApplicationActivation.MaxStringBytes { return Rejected() }
                    let count = Encoding.UTF8.GetByteCount(text)
                    if count > ApplicationActivation.MaxStringBytes
                        || count > ApplicationActivation.MaxRequestBytes - inputBytes { return Rejected() }
                    inputBytes += count
                }
                var value = ApplicationActivation{ IsInitial: true, Arguments: arguments, WorkingDirectory: workingDirectory }
                if arguments.Count != 0 {
                    let flag = arguments[0]
                    if flag == "--goo-open-uri" {
                        if arguments.Count != 2 { return Rejected() }
                        value = ApplicationActivation{
                            Kind: ApplicationActivationKind.OpenUri, IsInitial: true,
                            Target: AbsoluteUri(arguments[1]), WorkingDirectory: workingDirectory,
                        }
                    } else if flag == "--goo-open-documents" {
                        if arguments.Count < 2 || arguments.Count - 1 > ApplicationActivation.MaxItems { return Rejected() }
                        let documents = [arguments.Count - 1]Uri
                        for i in 0 ... documents.Length { documents[i] = DocumentUri(arguments[i + 1], workingDirectory) }
                        value = ApplicationActivation{
                            Kind: ApplicationActivationKind.OpenDocuments, IsInitial: true,
                            Documents: documents, WorkingDirectory: workingDirectory,
                        }
                    } else if flag == "--goo-notification" {
                        if arguments.Count != 2 { return Rejected() }
                        value = NotificationUri(AbsoluteUri(arguments[1]), workingDirectory)
                    }
                }
                if !value.TrySnapshot(out var owned) { return Rejected() }
                return ActivationReadResult(owned)
            } catch (error Exception) {
                if error is not ArgumentException && error is not UriFormatException && error is not IOException { rethrow }
                return Rejected()
            }
        }

        private func Rejected() ActivationReadResult ->
            ActivationReadResult(nil, "Activation arguments are invalid or exceed their limits")

        private func AbsoluteUri(value string) Uri {
            if !Uri.TryCreate(value, UriKind.Absolute, out var target) || target == nil {
                throw ArgumentException("An absolute activation URI is required")
            }
            return target
        }

        private func DocumentUri(value string, directory string) Uri {
            if Uri.TryCreate(value, UriKind.Absolute, out var target) && target != nil { return target }
            return Uri(Path.GetFullPath(value, directory))
        }

        internal func NotificationUri(value Uri, directory string) ApplicationActivation {
            if !value.Host.Equals("goo-notification", StringComparison.OrdinalIgnoreCase)
                || value.AbsolutePath != "/activate" || value.Fragment.Length != 0 {
                throw ArgumentException("Unknown notification activation URI")
            }
            var notification string? = nil
            var action string? = nil
            var data string? = nil
            for part in value.Query.TrimStart('?').Split('&') {
                let separator = part.IndexOf('=')
                if separator < 0 { throw ArgumentException("Incomplete notification activation") }
                let key = part.Substring(0, separator)
                let text = Uri.UnescapeDataString(part.Substring(separator + 1))
                if key == "id" && notification == nil { notification = text }
                else if key == "action" && action == nil { action = text }
                else if key == "data" && data == nil { data = text }
                else { throw ArgumentException("Unknown or repeated notification activation field") }
            }
            if notification == nil || action == nil || data == nil {
                throw ArgumentException("Incomplete notification activation")
            }
            return ApplicationActivation{
                Kind: ApplicationActivationKind.Notification, IsInitial: true,
                NotificationId: notification, ActionId: action, Payload: data, WorkingDirectory: directory,
            }
        }
    }
}
