package GooTraySmoke

import Goo
import System
import System.Diagnostics
import System.Reflection
import System.Threading
import System.Threading.Tasks

internal class Program {
    shared {
        private var owner Window?

        func Main() {
            using let watcher = if OperatingSystem.IsLinux() { LinuxSmoke() } else { nil }
            owner = Window{ Title: "Goo tray smoke", Width: 240, Height: 160 }.Open()
            try {
                owner!!.Pump(0)
                let result = TrayIcon.Create(owner!!, Options("Initial"))
                Check(result.Icon != nil, "Create: ${result.Status}: ${result.Error}")
                using let icon = result.Icon!!
                Check(result.Status == TrayStatus.Registered || OperatingSystem.IsWindows() && result.Status == TrayStatus.NoHost,
                    "Native registration: ${result.Status}")
                var activations = 0
                var commands = 0
                let thread = Environment.CurrentManagedThreadId
                icon.Activated += () -> {
                    Check(Environment.CurrentManagedThreadId == thread, "Activation owner thread")
                    activations++
                }
                icon.CommandActivated += (id string) -> {
                    Check(Environment.CurrentManagedThreadId == thread && id == "open", "Command owner thread and stable ID")
                    commands++
                }
                let backend = Field(icon, "backend")
                if watcher != nil {
                    Wait(watcher.Registered.Task)
                    Wait(watcher.VerifyAsync("Initial", true))
                }
                Check(icon.Update(Options("Updated")) == result.Status, "Native update")
                if watcher != nil { Wait(watcher.VerifyAsync("Updated", false)) }
                else if OperatingSystem.IsMacOS() { MacSmoke.Invoke(backend) }
                else { WindowsSmoke.Invoke(owner!!, backend) }
                Until(() -> commands == (if watcher != nil { 2 } else { 1 }) && (OperatingSystem.IsMacOS() || activations == 1))
                icon.Dispose()
                icon.Dispose()
                Check(icon.Status == TrayStatus.Closed && icon.Update(Options("Closed")) == TrayStatus.Closed, "Idempotent disposal")
                if watcher != nil { Wait(watcher.VerifyDisposedAsync()) }
                else if OperatingSystem.IsMacOS() { Check(nint(Field(backend, "item")) == nint(0), "Status item released") }
                else { Check(nint(Field(backend, "image")) == nint(0), "Native icon released") }
                using let closing = TrayIcon.Create(owner!!, Options("Owner close")).Icon!!
                owner!!.RequestClose()
                Until(() -> !owner!!.IsOpen)
                Check(closing.Status == TrayStatus.Closed, "Owner closes tray")
                Console.WriteLine("Tray smoke passed: ${result.Status}, create, update, menu invocation, dispose, owner close.")
            } finally {
                if owner!!.IsOpen {
                    owner!!.RequestClose()
                    owner!!.Run()
                }
            }
        }

        private func Options(tooltip string) TrayOptions -> TrayOptions{
            Id: "org.goo.TraySmoke", Width: 2, Height: 2,
            Rgba: []uint8{255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 128},
            Tooltip: tooltip,
            Menu: []NativeMenuItem{NativeMenuItem{ Id: "open", Text: "Open " + tooltip, Checked: true },
                NativeMenuItem{ Id: "disabled", Text: "Disabled", Enabled: false }}
        }

        private func Wait(task Task) {
            Until(() -> task.IsCompleted)
            task.GetAwaiter().GetResult()
        }
        private func Until(ready Func[bool]) {
            let clock = Stopwatch.StartNew()
            while !ready() {
                Check(clock.Elapsed < TimeSpan.FromSeconds(15), "Native callback timeout")
                owner!!.Pump(0)
                Thread.Sleep(5)
            }
        }

        private func Field(value object, name string) object -> value.GetType().GetField(name,
            BindingFlags.Instance | BindingFlags.NonPublic)!!.GetValue(value)!!
        private func Check(condition bool, message string) {
            if !condition { throw InvalidOperationException(message) }
        }
    }
}
