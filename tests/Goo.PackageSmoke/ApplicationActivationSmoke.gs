package GooPackageSmoke

import Goo
import System
import System.Diagnostics
import System.IO
import System.Threading

func ActivationSmokeRequire(value bool, message string) {
    if !value { throw InvalidOperationException(message) }
}

func RunApplicationActivationSmoke(results string) {
    let owner = Environment.CurrentManagedThreadId
    let window = Window{ Width: 180, Height: 100, Root: Cell{} }
    let one = Path.Combine(results, "one document.gooactivation")
    let two = Path.Combine(results, "two document.gooactivation")
    var cold = false
    var warm = false
    var documents = false
    let callback Action[ApplicationActivation] = activation -> {
        ActivationSmokeRequire(Environment.CurrentManagedThreadId == owner, "Activation left the UI thread")
        if activation.Kind == ApplicationActivationKind.OpenUri {
            let uri = activation.Target!!.OriginalString
            if uri == "goo-activation-smoke://cold" {
                ActivationSmokeRequire(activation.IsInitial && !cold, "Cold URI was not one initial activation")
                cold = true
                File.WriteAllText(Path.Combine(results, "cold.txt"), "passed")
            } else if uri == "goo-activation-smoke://warm" {
                ActivationSmokeRequire(cold && !activation.IsInitial && !warm, "Warm URI activation was repeated or initial")
                warm = true
                File.WriteAllText(Path.Combine(results, "warm.txt"), "passed")
            } else { throw InvalidOperationException("Unexpected activation URI") }
        } else if activation.Kind == ApplicationActivationKind.OpenDocuments {
            ActivationSmokeRequire(warm && !documents && !activation.IsInitial, "Document batch was repeated or initial")
            ActivationSmokeRequire(activation.Documents.Count == 2, "Native document batch was split")
            let first = activation.Documents[0].LocalPath
            let second = activation.Documents[1].LocalPath
            ActivationSmokeRequire((first == one && second == two) || (first == two && second == one),
                "Native document paths changed")
            documents = true
            File.WriteAllText(Path.Combine(results, "documents.txt"), "passed")
        }
    }
    Directory.CreateDirectory(results)
    File.WriteAllText(Path.Combine(results, "pid.txt"), Environment.ProcessId.ToString())
    Window.ApplicationActivated += callback
    ActivationSmokeRequire(Window.InitializeApplicationActivation(ApplicationActivation{ IsInitial: true })
        == WindowOperationResult.Accepted, "Activation initialization failed")
    try {
        window.Open()
        let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 30
        while window.IsOpen && !documents && Stopwatch.GetTimestamp() < deadline {
            window.Pump(0.0)
            Thread.Sleep(1)
        }
        ActivationSmokeRequire(cold && warm && documents, "Activation smoke timed out")
    } catch (error Exception) {
        File.WriteAllText(Path.Combine(results, "error.txt"), error.ToString())
        throw error
    } finally {
        Window.ApplicationActivated -= callback
        ActivationSmokeRequire(CloseWindow(window), "Activation smoke window did not close")
    }
    File.WriteAllText(Path.Combine(results, "passed.txt"), "passed")
}
