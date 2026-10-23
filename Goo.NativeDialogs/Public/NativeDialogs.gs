package Goo

import System
import System.Collections.Generic
import System.Threading.Tasks

/// Selects the native message severity.
public enum MessageBoxIcon { Information; Warning; Error }

/// Distinguishes selection, dismissal, platform limits, owner conflicts and native failure.
public enum MessageBoxStatus { Success; Cancelled; Unsupported; Busy; OwnerClosed; Failed }

/// Describes one native message-box button.
public sealed class MessageBoxButton {
    /// Gets the unique nonnegative application identifier.
    public prop Id int32 { get; init; }
    /// Gets the native button label.
    public prop Text string { get; init; }
    /// Gets whether Return selects this button on desktop.
    public prop Default bool { get; init; }
    /// Gets whether Escape selects this button on desktop. Selection is still Success.
    public prop Cancel bool { get; init; }
    /// Creates an empty button.
    public init() { Text = "" }
}

/// Supplies native message-box content, copied when accepted.
public sealed class MessageBoxOptions {
    /// Gets the native title.
    public prop Title string { get; init; }
    /// Gets the plain-text message.
    public prop Message string { get; init; }
    /// Gets the native severity.
    public prop Icon MessageBoxIcon { get; init; }
    /// Gets one to eight buttons with unique nonnegative identifiers.
    public prop Buttons IReadOnlyList[MessageBoxButton] { get; init; }
    /// Creates options with empty content and no buttons.
    public init() {
        Title = ""
        Message = ""
        Buttons = Array.Empty[MessageBoxButton]()
    }
}

/// Contains a native message-box outcome.
public sealed class MessageBoxResult {
    /// Gets the explicit outcome.
    public prop Status MessageBoxStatus { get; }
    /// Gets the selected identifier, or -1 outside Success.
    public prop ButtonId int32 { get; }
    /// Gets copied failure detail, or an empty string.
    public prop Error string { get; }
    internal init(status MessageBoxStatus, buttonId int32 = -1, error string = "") {
        Status = status
        ButtonId = buttonId
        Error = error
    }
}

/// Shows owned native dialogs without a managed fallback.
public sealed class NativeDialogs {
    shared {
        /// Queues an owned native message box from the open owner's UI thread.
        /// Desktop SDL display blocks Goo rendering, timers and posted actions until dismissal.
        /// Wayland returns Unsupported. Android supports up to three buttons without Return/Escape defaults.
        /// @param owner The open owner whose input and lifetime remain leased until native completion.
        /// @param options Content copied before native launch.
        /// @returns A task with a selected button or an explicit nonselection result.
        public func ShowMessageBoxAsync(owner Window, options MessageBoxOptions) Task[MessageBoxResult] {
            if owner == nil { throw ArgumentNullException("owner") }
            owner.RequireNativeServiceThread()
            if !owner.IsOpen { throw InvalidOperationException("A message box requires an open owner") }
            let snapshot = Copy(options)
            if OperatingSystem.IsLinux() || (!OperatingSystem.IsWindows() && !OperatingSystem.IsMacOS() && !OperatingSystem.IsAndroid()) {
                return Task.FromResult(MessageBoxResult(MessageBoxStatus.Unsupported))
            }
            if OperatingSystem.IsAndroid() && (snapshot.Buttons.Count > 3 || HasDefaults(snapshot)) {
                return Task.FromResult(MessageBoxResult(MessageBoxStatus.Unsupported))
            }
            var status NativeModalStatus
            guard let lease = owner.BeginNativeModal(&status) else {
                return Task.FromResult(MessageBoxResult(if status == NativeModalStatus.Busy { MessageBoxStatus.Busy } else { MessageBoxStatus.OwnerClosed }))
            }
            let request = MessageBoxRequest(owner, lease, snapshot)
            request.Post()
            return request.Task
        }

        private func HasDefaults(options MessageBoxOptions) bool {
            for button in options.Buttons {
                if button.Default || button.Cancel { return true }
            }
            return false
        }

        private func Copy(options MessageBoxOptions) MessageBoxOptions {
            if options == nil { throw ArgumentNullException("options") }
            if options.Icon < MessageBoxIcon.Information || options.Icon > MessageBoxIcon.Error { throw ArgumentOutOfRangeException("Icon") }
            ValidateText(options.Title, "Title")
            ValidateText(options.Message, "Message")
            if options.Buttons == nil || options.Buttons.Count < 1 || options.Buttons.Count > 8 {
                throw ArgumentException("Message boxes require one to eight buttons", "options")
            }
            let buttons = [options.Buttons.Count]MessageBoxButton
            let ids = HashSet[int32]()
            var defaults = 0
            var cancels = 0
            for i in 0 ... buttons.Length {
                let button = options.Buttons[i]
                if button == nil || button.Id < 0 || !ids.Add(button.Id) { throw ArgumentException("Buttons require unique nonnegative identifiers", "options") }
                ValidateText(button.Text, "Button.Text")
                if button.Default { defaults++ }
                if button.Cancel { cancels++ }
                buttons[i] = MessageBoxButton{ Id: button.Id, Text: button.Text, Default: button.Default, Cancel: button.Cancel }
            }
            if defaults > 1 || cancels > 1 { throw ArgumentException("Only one Return and one Escape default are allowed", "options") }
            return MessageBoxOptions{ Title: options.Title, Message: options.Message, Icon: options.Icon, Buttons: Array.AsReadOnly[MessageBoxButton](buttons) }
        }

        private func ValidateText(text string, name string) {
            if text == nil || text.IndexOf('\0') >= 0 { throw ArgumentException("Native text must be non-null and contain no NUL", name) }
        }
    }
}
