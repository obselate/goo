package Goo

import System
import System.Collections.Generic
import System.Threading

internal class ApplicationActivationFixtures {
    func ProcessQueueOwnsStartupAndForwardedData() bool {
        let owner = Environment.CurrentManagedThreadId
        let received = List[ApplicationActivation]()
        var wrongThread = false
        var nestedPost ActivationPostStatus = ActivationPostStatus.NotInitialized
        let callback Action[ApplicationActivation] = value -> {
            if Environment.CurrentManagedThreadId != owner { wrongThread = true }
            received.Add(value)
            if value.NotificationId == "message-7" {
                nestedPost = Window.PostApplicationActivation(ApplicationActivation{ Payload: "next batch" })
                Window.DrainApplicationActivations()
            }
        }
        Window.ApplicationActivated += callback
        try {
            if Window.PostApplicationActivation(ApplicationActivation{}) != ActivationPostStatus.NotInitialized { return false }
            if Window.InitializeApplicationActivation(ApplicationActivation{ IsInitial: true }) != WindowOperationResult.Accepted { return false }
            let documents = []Uri{ Uri("content://provider/document/42") }
            let arguments = []string{ "", "two words", "\u03bb" }
            let request = ApplicationActivation{
                Kind: ApplicationActivationKind.OpenDocuments, IsInitial: true,
                Documents: documents, Arguments: arguments, WorkingDirectory: "/sender",
            }
            if Window.PostApplicationActivation(request) != ActivationPostStatus.Accepted { return false }
            documents[0] = Uri("file:///changed")
            arguments[1] = "changed"
            if received.Count != 0 { return false }
            Window.DrainApplicationActivations()
            if received.Count != 1 || wrongThread { return false }
            let first = received[0]
            if !first.IsInitial || first.Kind != ApplicationActivationKind.OpenDocuments
                || first.Documents[0].OriginalString != "content://provider/document/42"
                || first.Arguments[0] != "" || first.Arguments[1] != "two words"
                || first.Arguments[2] != "\u03bb" || first.WorkingDirectory != "/sender" { return false }
            var posted ActivationPostStatus = ActivationPostStatus.NotInitialized
            var rejectedThread = false
            let worker = Thread(() -> {
                posted = Window.PostApplicationActivation(ApplicationActivation{
                    Kind: ApplicationActivationKind.Notification, NotificationId: "message-7", Payload: "opaque",
                })
                try { Window.DrainApplicationActivations() }
                catch (_ InvalidOperationException) { rejectedThread = true }
            })
            worker.Start()
            worker.Join()
            if posted != ActivationPostStatus.Accepted || !rejectedThread || received.Count != 1 { return false }
            Window.DrainApplicationActivations()
            if received.Count != 2 || wrongThread || received[1].NotificationId != "message-7"
                || received[1].Payload != "opaque" { return false }
            if nestedPost != ActivationPostStatus.Accepted { return false }
            Window.DrainApplicationActivations()
            if received.Count != 3 || received[2].Payload != "next batch" { return false }
            let large = ApplicationActivation{ Payload: String('x', 65537) }
            if Window.PostApplicationActivation(large) != ActivationPostStatus.TooLarge { return false }
            for i in 0 ... 64 {
                if Window.PostApplicationActivation(ApplicationActivation{}) != ActivationPostStatus.Accepted { return false }
            }
            if Window.PostApplicationActivation(ApplicationActivation{}) != ActivationPostStatus.QueueFull { return false }
            Window.CloseApplicationActivations()
            if Window.PostApplicationActivation(ApplicationActivation{}) != ActivationPostStatus.Closed { return false }
            Window.DrainApplicationActivations()
            if received.Count != 3 { return false }
            if Window.InitializeApplicationActivation(ApplicationActivation{ Kind: ApplicationActivationKind.Arguments })
                != WindowOperationResult.Accepted { return false }
            Window.DrainApplicationActivations()
            return received.Count == 4 && !received[3].IsInitial && !wrongThread
        } finally {
            Window.CloseApplicationActivations()
            Window.ApplicationActivated -= callback
        }
    }
}
