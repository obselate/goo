package Goo

import System
import System.Collections.Generic
import System.Threading

/// Delivers process activation independently of window focus and document routing policy.
public partial class Window {
    shared {
        private const MaxPendingActivations int32 = 1024
        private let activationGate object = Object()
        private let pendingActivations Queue[ApplicationActivation] = Queue[ApplicationActivation](MaxPendingActivations)
        private var activationOwnerThreadId int32
        private var pendingActivationCount int32
        private var activationClosed bool
        private var activationDelivered bool
        private var deliveringActivation bool
        private var applicationActivated Action[ApplicationActivation]?
        internal prop CurrentActivationToken string? { get; private set; }

        /// Occurs once per application activation on the process UI thread, not once per open window.
        /// Subscribe before initializing activation. Handlers own validation and window selection.
        /// The queue retains 1024 requests, with 4096 arguments or documents per request.
        /// Text is limited to 64 KiB per UTF-8 string and 1 MiB per request.
        /// Native requests outside these limits, or received before initialization or after close, are dropped.
        public event ApplicationActivated Action[ApplicationActivation] {
            add {
                RequireActivationThread()
                applicationActivated += value
            }
            remove {
                RequireActivationThread()
                applicationActivated -= value
            }
        }

        /// Binds activation to the current UI thread and retains the initial request until a window pumps.
        /// Call before opening the first desktop window or from the embedded host's owner thread.
        /// After all windows close, the same owner thread may initialize a new delivery lifetime.
        /// @param initial The initial request, copied with its IsInitial value unchanged.
        /// @returns Accepted when retained, or Failed when the request exceeds the activation data limits.
        /// @exception InvalidOperationException when already initialized or called from another owner thread.
        public func InitializeApplicationActivation(initial ApplicationActivation) WindowOperationResult {
            if initial == nil { throw ArgumentNullException("initial") }
            RequireActivationThread()
            if !initial.TrySnapshot(out var owned) { return WindowOperationResult.Failed }
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
            scheduler.WakeForApplicationActivation()
            return WindowOperationResult.Accepted
        }

        /// Copies and queues a request from any thread for the process-wide activation event.
        /// Accepted confirms queue ownership, not handler completion, document access, or focus.
        /// Requests allow 4096 arguments and documents each, 64 KiB per UTF-8 string and 1 MiB total text.
        /// @param value The owned request data to copy. Relative URIs and null values are invalid arguments.
        /// @returns Accepted, NotInitialized, Closed, QueueFull at 1024 pending requests, or TooLarge.
        public func PostApplicationActivation(value ApplicationActivation) ActivationPostStatus {
            if value == nil { throw ArgumentNullException("value") }
            lock activationGate {
                let status = ActivationQueueStatus()
                if status != ActivationPostStatus.Accepted { return status }
            }
            if !value.TrySnapshot(out var owned) { return ActivationPostStatus.TooLarge }
            lock activationGate {
                let status = ActivationQueueStatus()
                if status != ActivationPostStatus.Accepted { return status }
                if !activationDelivered && value.IsInitial && pendingActivations.Count == 1
                    && pendingActivations.Peek().Kind == ApplicationActivationKind.Launch {
                    pendingActivations.Dequeue()
                }
                pendingActivations.Enqueue(owned!!)
                Volatile.Write(ref pendingActivationCount, pendingActivations.Count)
            }
            scheduler.WakeForApplicationActivation()
            return ActivationPostStatus.Accepted
        }

        private func ActivationQueueStatus() ActivationPostStatus {
            if activationOwnerThreadId == 0 { return ActivationPostStatus.NotInitialized }
            if activationClosed { return ActivationPostStatus.Closed }
            return if pendingActivations.Count >= MaxPendingActivations { ActivationPostStatus.QueueFull }
                else { ActivationPostStatus.Accepted }
        }

        private func RequireActivationThread() {
            let owner = Volatile.Read(ref activationOwnerThreadId)
            if owner != 0 && owner != Environment.CurrentManagedThreadId {
                throw InvalidOperationException("Application activation belongs to the process UI thread")
            }
        }

        internal prop HasPendingApplicationActivation bool { get -> Volatile.Read(ref pendingActivationCount) != 0 }

        internal prop IsInitialApplicationActivation bool {
            get -> activationOwnerThreadId != 0 && !activationClosed && !activationDelivered
        }

        internal func DrainApplicationActivations() {
            if !HasPendingApplicationActivation || deliveringActivation { return }
            RequireActivationThread()
            var count int32
            lock activationGate { count = pendingActivations.Count }
            deliveringActivation = true
            try {
                for i in 0 ... count {
                    var value ApplicationActivation
                    lock activationGate {
                        if pendingActivations.Count == 0 { return }
                        value = pendingActivations.Dequeue()
                        activationDelivered = true
                        Volatile.Write(ref pendingActivationCount, pendingActivations.Count)
                    }
                    CurrentActivationToken = value.NativeActivationToken
                    try { applicationActivated?.Invoke(value) }
                    finally { CurrentActivationToken = nil }
                }
            } finally { deliveringActivation = false }
        }

        internal func CloseApplicationActivations() {
            lock activationGate {
                activationClosed = true
                pendingActivations.Clear()
                Volatile.Write(ref pendingActivationCount, 0)
            }
            ReleaseNativeApplicationActivation()
        }
    }

    internal func WakeForApplicationActivation() { host?.Wake() }
}
