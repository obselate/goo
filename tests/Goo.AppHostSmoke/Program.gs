package GooAppHostSmoke

import Goo
import System
import System.Collections.Generic
import System.Diagnostics
import System.IO
import System.IO.Pipes
import System.Linq
import System.Reflection
import System.Runtime.CompilerServices
import System.Text.Json
import System.Threading

internal class Program {
    shared {
        private let ExpectedArguments []string = []string{"", "two words", "\"quoted\"", "λ😀", "a\\b"}
        private const Link string = "goo-instance-test://route/%CE%BB"
        private const Document string = "content://org.goo.test/document/λ"
        private const NativeToken string = "goo-instance-token-λ"

        internal func Run(args []string) int32 {
            if args.Length < 3 || !args[2].StartsWith("--output=", StringComparison.Ordinal) {
                throw ArgumentException("mode, identity and --output=directory are required")
            }
            let mode = args[0]
            let identity = args[1]
            let root = Path.GetFullPath(args[2].Substring("--output=".Length))
            let tag = if args.Length == 4 { args[3] } else { mode }
            if mode == "placement" {
                RunPlacement(root, tag)
                return 0
            }
            if mode == "activated" {
                RunActivated(identity, root, args.Skip(3).ToArray())
                return 0
            }
            if mode == "secondary" {
                Send(identity, root)
                return 0
            }
            if mode == "closed" {
                Require(Acquire(identity, ApplicationActivation{}).Status == SingleInstanceStatus.Rejected, "Closed queue was accepted")
                File.WriteAllText(Path.Combine(root, "closed.done"), "passed")
                return 0
            }
            if mode == "timeout" {
                let result = SingleInstance.AcquireAsync(identity, ApplicationActivation{}, 200).GetAwaiter().GetResult()
                Require(result.Status == SingleInstanceStatus.TimedOut && result.Lease == nil, "Timeout elected another primary")
                return 0
            }
            if mode == "unsupported" {
                Environment.SetEnvironmentVariable("XDG_RUNTIME_DIR", "")
                Require(Acquire(identity, ApplicationActivation{}).Status == SingleInstanceStatus.Unsupported, "Missing runtime context was accepted")
                return 0
            }
            let initial = ApplicationActivation{ IsInitial: true, WorkingDirectory: Environment.CurrentDirectory }
            Require(Window.InitializeApplicationActivation(initial) == WindowOperationResult.Accepted, "Initialization failed")
            if mode == "elect" { WaitFor(Path.Combine(root, "start")) }
            let election = Acquire(identity, initial)
            File.WriteAllText(Path.Combine(root, tag + ".status"), election.Status.ToString())
            if election.Status == SingleInstanceStatus.Forwarded { return 0 }
            Require(election.Status == SingleInstanceStatus.Primary && election.Lease != nil, "${election.Status}: ${election.Error}")
            using let lease = election.Lease!!
            if mode == "stall" {
                let implementation = Type.GetType("Goo.InstancePipe, Goo.AppHost", throwOnError: true)!!
                let pipe = implementation.GetField("pipe", BindingFlags.Instance | BindingFlags.NonPublic)!!.GetValue(lease) as NamedPipeServerStream
                pipe!!.Dispose()
            }
            File.WriteAllText(Path.Combine(root, tag + ".ready"), "ready")
            if mode != "primary" {
                WaitFor(Path.Combine(root, "stop"))
                return 0
            }
            let received = List[ApplicationActivation]()
            let owner = Environment.CurrentManagedThreadId
            let currentToken = typeof(Window).GetProperty("CurrentActivationToken", BindingFlags.Static | BindingFlags.NonPublic)!!
            let handler Action[ApplicationActivation] = value -> {
                Require(Environment.CurrentManagedThreadId == owner, "Activation left the owner thread")
                var expectedToken string? = nil
                if !value.IsInitial && OperatingSystem.IsLinux() { expectedToken = NativeToken }
                Require((currentToken.GetValue(nil) as string?) == expectedToken, "Native activation token changed")
                received.Add(value)
            }
            Window.ApplicationActivated += handler
            try {
                WaitFor(Path.Combine(root, "send.done"))
                typeof(Window).GetMethod("DrainApplicationActivations", BindingFlags.Static | BindingFlags.NonPublic)!!.Invoke(nil, nil)
                Require(currentToken.GetValue(nil) == nil, "Native activation token escaped its callback")
                Verify(received, root)
                typeof(Window).GetMethod("CloseApplicationActivations", BindingFlags.Static | BindingFlags.NonPublic)!!.Invoke(nil, nil)
                File.WriteAllText(Path.Combine(root, "closed.ready"), "ready")
                WaitFor(Path.Combine(root, "closed.done"))
            } finally { Window.ApplicationActivated -= handler }
            File.WriteAllText(Path.Combine(root, "passed"), "passed")
            return 0
        }

        private func Acquire(identity string, value ApplicationActivation) SingleInstanceResult ->
            SingleInstance.AcquireAsync(identity, value).GetAwaiter().GetResult()

        private func Parsed(arguments []string, directory string) ApplicationActivation {
            let result = ActivationArguments.Read(arguments, directory)
            Require(result.Status == ActivationReadStatus.Accepted && result.Activation != nil, result.Error)
            return result.Activation!!
        }

        private func Send(identity string, root string) {
            if OperatingSystem.IsLinux() { Environment.SetEnvironmentVariable("XDG_ACTIVATION_TOKEN", NativeToken) }
            let arguments = (ExpectedArguments.Clone() as []string)!!
            let directory = Environment.CurrentDirectory
            let requests = []ApplicationActivation{
                Parsed(arguments, directory),
                Parsed([]string{"--goo-open-uri", Link}, directory),
                Parsed([]string{"--goo-open-documents", "one file.txt", Document}, directory),
                Parsed([]string{"--goo-notification", "example-private://goo-notification/activate?id=notice&action=open&data=opaque%20%CE%BB"}, directory),
            }
            for request in requests {
                let result = Acquire(identity, request)
                Require(result.Status == SingleInstanceStatus.Forwarded && result.Lease == nil, "${result.Status}: ${result.Error}")
            }
            arguments[1] = "changed after forwarding"
            let tooLarge = Acquire(identity, ApplicationActivation{ Arguments: []string{String('x', 65537)} })
            Require(tooLarge.Status == SingleInstanceStatus.Rejected, "Oversized request was accepted")
            if OperatingSystem.IsLinux() {
                Environment.SetEnvironmentVariable("XDG_ACTIVATION_TOKEN", String('x', 65516))
                Require(Acquire(identity, ApplicationActivation{}).Status == SingleInstanceStatus.Rejected, "Oversized native token was accepted")
                Environment.SetEnvironmentVariable("XDG_ACTIVATION_TOKEN", NativeToken)
            }
            let invalidArguments = [][]string{
                []string{"--goo-open-uri", "relative.txt"}, []string{"--goo-open-documents"},
                []string{"--goo-notification", "example-private://wrong/activate?id=n&action=&data="},
                []string{"--goo-notification", "example-private://goo-notification/activate?id=n&id=n&action=&data="},
                []string{String('x', 65537)},
            }
            for invalid in invalidArguments {
                let rejected = ActivationArguments.Read(invalid, directory)
                Require(rejected.Status == ActivationReadStatus.Rejected && rejected.Activation == nil, "Invalid startup data was accepted")
            }
            File.WriteAllText(Path.Combine(root, "send.done"), "passed")
        }

        private func Verify(received List[ApplicationActivation], root string) {
            Require(received.Count == 5, "Activation count changed")
            Require(received[0].Kind == ApplicationActivationKind.Launch && received[0].IsInitial,
                "Initial launch changed: ${received[0].Kind}, initial=${received[0].IsInitial}, target=${received[0].Target}")
            let forwarded = received[1]
            Require(forwarded.Kind == ApplicationActivationKind.Arguments && forwarded.Arguments.SequenceEqual(ExpectedArguments), "Arguments changed")
            Require(received[2].Kind == ApplicationActivationKind.OpenUri && received[2].Target?.OriginalString == Link, "URI changed")
            let documents = received[3]
            Require(documents.Kind == ApplicationActivationKind.OpenDocuments && documents.Documents.Count == 2, "Document batch changed")
            Require(documents.Documents[0].LocalPath == Path.Combine(root, "sender cwd", "one file.txt")
                && documents.Documents[1].OriginalString == Document, "Document URI changed")
            let notification = received[4]
            Require(notification.Kind == ApplicationActivationKind.Notification && notification.NotificationId == "notice"
                && notification.ActionId == "open" && notification.Payload == "opaque λ", "Notification data changed")
            for request in received.Skip(1) {
                Require(!request.IsInitial && request.WorkingDirectory == Path.Combine(root, "sender cwd"), "Forwarded context changed")
            }
            Require(Environment.CurrentDirectory == Path.Combine(root, "receiver cwd"), "Receiver directory changed")
        }

        private func RunActivated(identity string, root string, arguments []string) {
            let owner = Environment.CurrentManagedThreadId
            var count = 0
            let nativeWayland = OperatingSystem.IsLinux() && Environment.GetEnvironmentVariable("GOO_ACTIVATION_NATIVE_WINDOW") == "1"
            var native Window? = nil
            let handler Action[ApplicationActivation] = value -> {
                Require(Environment.CurrentManagedThreadId == owner, "Native activation left the owner thread")
                if native != nil && value.Kind != ApplicationActivationKind.Launch {
                    Require(native.RequestActivation() == WindowOperationResult.Accepted, "Native activation request failed")
                }
                if nativeWayland {
                    Require(Environment.GetEnvironmentVariable("XDG_ACTIVATION_TOKEN") == nil, "Forwarding changed the receiver environment")
                }
                let target = if value.Kind == ApplicationActivationKind.OpenDocuments {
                    value.Documents[0].LocalPath
                } else { value.Target?.OriginalString ?? "" }
                count++
                let path = Path.Combine(root, count.ToString() + ".event")
                if value.Kind == ApplicationActivationKind.OpenDocuments {
                    File.WriteAllLines(Path.Combine(root, count.ToString() + ".documents"), value.Documents.Select(uri -> uri.AbsoluteUri))
                }
                File.WriteAllLines(path + ".new", []string{value.Kind.ToString(), if value.IsInitial { "initial" } else { "warm" }, target})
                File.Move(path + ".new", path)
            }
            Window.ApplicationActivated += handler
            try {
                let initial = Parsed(arguments, Environment.CurrentDirectory)
                Require(Window.InitializeApplicationActivation(initial) == WindowOperationResult.Accepted, "Native initialization failed")
                let result = Acquire(identity, initial)
                if result.Status == SingleInstanceStatus.Forwarded { return }
                Require(result.Status == SingleInstanceStatus.Primary && result.Lease != nil, "${result.Status}: ${result.Error}")
                {
                    using let lease = result.Lease!!
                    if OperatingSystem.IsMacOS() || nativeWayland {
                        native = Window{ Width: 160, Height: 100, Root: Cell() }.Open()
                    }
                    File.WriteAllText(Path.Combine(root, "pid"), Environment.ProcessId.ToString())
                    let drain = typeof(Window).GetMethod("DrainApplicationActivations", BindingFlags.Static | BindingFlags.NonPublic)!!
                    let stop = Path.Combine(root, "stop")
                    let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 40
                    while !File.Exists(stop) && Stopwatch.GetTimestamp() < deadline {
                        if native == nil { drain.Invoke(nil, nil) } else { native.Pump(0.005) }
                        Thread.Sleep(5)
                    }
                    Require(File.Exists(stop), "Native activation did not stop")
                    if native != nil {
                        native.RequestClose()
                        native.Pump(0)
                    }
                }
                File.WriteAllText(Path.Combine(root, "exited"), "passed")
            } catch (error Exception) {
                File.WriteAllText(Path.Combine(root, "error"), error.ToString())
                throw error
            } finally { Window.ApplicationActivated -= handler }
        }

        private func RunPlacement(root string, mode string) {
            Directory.CreateDirectory(root)
            let state = switch mode {
                case "max": WindowState.Maximized
                case "full": WindowState.Fullscreen
                case _: WindowState.Normal
            }
            var window = Window{ InitiallyVisible: false, Root: Cell() }
            Require(window.CapturePlacement().Status == WindowOperationResult.Closed, "Closed placement capture changed")
            let staged = window.ApplyPlacement(WindowPlacement{
                Fields: WindowPlacementFields.NormalSize | WindowPlacementFields.Position | WindowPlacementFields.State,
                NormalBounds: ElementRect{ X: 64, Y: 70, Width: 360, Height: 240 }, State: state,
            })
            Require(staged.Status == WindowOperationResult.Accepted, staged.Error)
            Require(staged.AppliedFields.HasFlag(WindowPlacementFields.Position) == !OperatingSystem.IsLinux(), "Staged position mask changed")
            window.Open()
            try {
                Require(window.Show() == WindowOperationResult.Accepted, "Placement window did not show")
                PumpUntil(window, () -> window.IsVisible
                    && ((state == WindowState.Normal && window.Width == 360 && window.Height == 240)
                        || (state != WindowState.Normal && window.Width > 360 && window.Height > 240)))
                let captured = window.CapturePlacement()
                Require(captured.Status == WindowOperationResult.Accepted && captured.Placement != nil, captured.Error)
                let saved = captured.Placement!!
                Require(saved.State == state && saved.NormalBounds.Width == 360 && saved.NormalBounds.Height == 240,
                    "Cold ${mode} lost normal bounds: ${saved.NormalBounds} ${saved.State}")
                Require(saved.Fields.HasFlag(WindowPlacementFields.Position) == !OperatingSystem.IsLinux(), "Captured position mask changed")
                let restored = Persist(saved, Path.Combine(root, mode + ".json"))
                window.State = WindowState.Normal
                PumpUntil(window, () -> window.Width == 360 && window.Height == 240)
                window.State = WindowState.Maximized
                PumpUntil(window, () -> window.Width > 360 && window.Height > 240)
                window.State = WindowState.Minimized
                for i in 0 ... 20 {
                    window.Pump(0.005)
                    Thread.Sleep(5)
                }
                let minimized = window.CapturePlacement().Placement!!
                Require(minimized.State == WindowState.Maximized && minimized.NormalBounds.Width == 360,
                    "Minimize replaced restorable state or normal size")
                let applied = Placement.Restore(window, restored)
                Require(applied.Status == WindowOperationResult.Accepted, "${applied.Status}: ${applied.Error}")
                window.RequestClose()
                window.Pump(0)
                window = Window{ InitiallyVisible: false, Root: Cell() }.Open()
                let cold = Placement.Restore(window, restored)
                Require(cold.Status == WindowOperationResult.Accepted, "${cold.Status}: ${cold.Error}")
                Require(window.Show() == WindowOperationResult.Accepted, "Restored placement window did not show")
                PumpUntil(window, () -> window.CapturePlacement().Placement?.State == state
                    && ((state == WindowState.Normal && window.Width == 360 && window.Height == 240)
                        || (state != WindowState.Normal && window.Width > 360 && window.Height > 240)))
                Require(window.CapturePlacement().Placement!!.NormalBounds.Width == 360, "Cold restore replaced normal size")
                window.MinWidth = 100
                window.MinHeight = 100
                window.MaxWidth = 500
                window.MaxHeight = 400
                let moved = Placement.Restore(window, WindowPlacement{
                    Fields: WindowPlacementFields.NormalSize | WindowPlacementFields.Position | WindowPlacementFields.State,
                    NormalBounds: ElementRect{ X: 100064, Y: 100070, Width: 100000, Height: 100000 },
                    State: WindowState.Minimized, DisplayName: "removed display",
                    DisplayBounds: ElementRect{ X: 100000, Y: 100000, Width: 1920, Height: 1080 },
                    DisplayScale: Math.Max(1, saved.DisplayScale * 2),
                })
                Require(moved.Status == WindowOperationResult.Accepted, "${moved.Status}: ${moved.Error}")
                Require(moved.AppliedFields.HasFlag(WindowPlacementFields.Position) == !OperatingSystem.IsLinux(), "Restored position mask changed")
                PumpUntil(window, () -> window.Width == 500 && window.Height == 400)
                Require(window.CapturePlacement().Placement!!.State == WindowState.Normal, "Saved minimized state was restored")
                let invalid = window.ApplyPlacement(WindowPlacement{
                    Fields: WindowPlacementFields.NormalSize,
                    NormalBounds: ElementRect{ Width: Double.NaN, Height: 240 },
                })
                Require(invalid.Status == WindowOperationResult.Failed && window.Width == 500, "Invalid placement changed geometry")
                let stateOnly = window.ApplyPlacement(WindowPlacement{ Fields: WindowPlacementFields.State, State: WindowState.Normal })
                Require(stateOnly.Status == WindowOperationResult.Accepted && stateOnly.AppliedFields == WindowPlacementFields.State,
                    "State-only placement changed its applied mask")
                Console.WriteLine("placement: cold ${mode}, JSON persistence, normal bounds, minimize, display/scale change and masks passed")
            } finally {
                window.RequestClose()
                window.Pump(0)
            }
        }

        private func WriteBounds(writer Utf8JsonWriter, name string, bounds ElementRect) {
            writer.WriteStartObject(name)
            writer.WriteNumber("X", bounds.X)
            writer.WriteNumber("Y", bounds.Y)
            writer.WriteNumber("Width", bounds.Width)
            writer.WriteNumber("Height", bounds.Height)
            writer.WriteEndObject()
        }

        private func ReadBounds(value JsonElement) ElementRect -> ElementRect{
            X: value.GetProperty("X").GetDouble(), Y: value.GetProperty("Y").GetDouble(),
            Width: value.GetProperty("Width").GetDouble(), Height: value.GetProperty("Height").GetDouble(),
        }

        private func Persist(saved WindowPlacement, path string) WindowPlacement {
            using let bytes = MemoryStream()
            using let writer = Utf8JsonWriter(bytes)
            writer.WriteStartObject()
            writer.WriteNumber("Fields", int32(saved.Fields))
            WriteBounds(writer, "NormalBounds", saved.NormalBounds)
            writer.WriteNumber("State", int32(saved.State))
            writer.WriteString("DisplayName", saved.DisplayName)
            WriteBounds(writer, "DisplayBounds", saved.DisplayBounds)
            writer.WriteNumber("DisplayScale", saved.DisplayScale)
            writer.WriteEndObject()
            writer.Flush()
            File.WriteAllBytes(path, bytes.ToArray())
            using let json = JsonDocument.Parse(File.ReadAllBytes(path))
            let value = json.RootElement
            return WindowPlacement{
                Fields: WindowPlacementFields(value.GetProperty("Fields").GetInt32()),
                NormalBounds: ReadBounds(value.GetProperty("NormalBounds")),
                State: WindowState(value.GetProperty("State").GetInt32()),
                DisplayName: value.GetProperty("DisplayName").GetString()!!,
                DisplayBounds: ReadBounds(value.GetProperty("DisplayBounds")),
                DisplayScale: value.GetProperty("DisplayScale").GetDouble(),
            }
        }

        private func PumpUntil(window Window, ready Func[bool], @CallerArgumentExpression("ready") condition string? = nil) {
            let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 15
            while true {
                window.Pump(0.005)
                if ready() { return }
                Thread.Sleep(5)
                if Stopwatch.GetTimestamp() >= deadline { break }
            }
            throw TimeoutException("Native placement did not reach ${condition}: ${window.Width}x${window.Height}, ${window.CapturePlacement().Placement?.State}")
        }

        private func WaitFor(path string) {
            let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 20
            while !File.Exists(path) {
                if Stopwatch.GetTimestamp() >= deadline { throw TimeoutException(Path.GetFileName(path)) }
                Thread.Sleep(10)
            }
        }

        private func Require(value bool, message string) {
            if !value { throw InvalidOperationException(message) }
        }
    }
}

Environment.ExitCode = Program.Run(Environment.GetCommandLineArgs().Skip(1).ToArray())
