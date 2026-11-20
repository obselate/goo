import Goo
import System
import System.Diagnostics
import System.IO
import System.Text
import System.Threading.Tasks
import Tmds.DBus.Protocol

internal class LinuxFileDialogSmoke : IPathMethodHandler, IDisposable {
    private let connection DBusConnection = DBusConnection(DBusAddress.Session!!)
    private var received int32
    private var errorName string = ""
    public prop Path string { get -> "/org/freedesktop/portal/desktop" }
    public prop HandlesChildPaths bool { get -> true }

    public init() {
        connection.ConnectAsync().AsTask().GetAwaiter().GetResult()
        connection.AddMethodHandler(this)
        if !connection.TryRequestNameAsync("org.freedesktop.portal.Desktop", RequestNameOptions.None).GetAwaiter().GetResult() {
            throw InvalidOperationException("The private portal name is occupied")
        }
    }

    public func HandleMethodAsync(context MethodContext) ValueTask {
        let request = context.Request
        if request.InterfaceAsString == "org.freedesktop.DBus.Introspectable" {
            using let writer = context.CreateReplyWriter("s")
            writer.WriteString("<node><interface name='org.freedesktop.portal.FileChooser'/></node>")
            context.Reply(writer.CreateMessage())
        } else if request.InterfaceAsString == "org.freedesktop.portal.FileChooser" {
            if errorName != "" {
                context.ReplyError(errorName, "Portal regression error")
                return ValueTask.CompletedTask
            }
            let reader = request.GetBodyReader()
            reader.ReadString()
            reader.ReadString()
            let options = reader.ReadDictionaryOfStringToVariantValue()
            if request.MemberAsString == "OpenFile" {
                let folder = Encoding.UTF8.GetString(options["current_folder"].GetArray[uint8]()).TrimEnd(char(0))
                if !Directory.Exists(folder) { throw InvalidOperationException("current_folder is not a directory: " + folder) }
            }
            if request.MemberAsString == "SaveFile" {
                if options["current_name"].GetString() != "goo-dialog-regression.txt" {
                    throw InvalidOperationException("SaveFile lost current_name")
                }
                let file = Encoding.UTF8.GetString(options["current_file"].GetArray[uint8]()).TrimEnd(char(0))
                if !File.Exists(file) { throw InvalidOperationException("SaveFile lost current_file") }
            }
            received++
            context.ReplyError("org.freedesktop.portal.Error.Cancelled", "Regression probe completed")
        } else { context.ReplyUnknownMethodError() }
        return ValueTask.CompletedTask
    }

    public func Run(window Window) {
        let file = System.IO.Path.Combine(Environment.CurrentDirectory, "goo-dialog-regression.txt")
        File.WriteAllText(file, "regression")
        try {
            for kind in []FileDialogKind{FileDialogKind.OpenFile, FileDialogKind.SaveFile} {
                let pending = window.ShowFileDialogAsync(kind, FileDialogOptions{InitialPath: file})
                let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 10
                while !pending.IsCompleted && Stopwatch.GetTimestamp() < deadline { window.Pump(0.01) }
                if !pending.IsCompleted { throw TimeoutException("Portal chooser did not complete") }
                pending.GetAwaiter().GetResult()
            }
            if received != 2 { throw InvalidOperationException("Both chooser methods must reach the portal") }
            Console.WriteLine("PASS portal OpenFile folder and SaveFile current_file/current_name")
            for name in []string{"UnknownMethod", "UnknownInterface", "NotSupported", "ServiceUnknown", "NameHasNoOwner", "Failed"} {
                errorName = "org.freedesktop.DBus.Error." + name
                let pending = window.ShowFileDialogAsync(FileDialogKind.OpenFile)
                let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 10
                while !pending.IsCompleted && Stopwatch.GetTimestamp() < deadline { window.Pump(0.01) }
                if !pending.IsCompleted { throw TimeoutException("Portal error did not complete") }
                let result = pending.GetAwaiter().GetResult()
                let expected = if name == "Failed" { FileDialogStatus.Failed } else { FileDialogStatus.Unsupported }
                if result.Status != expected { throw InvalidOperationException("$name returned ${result.Status}, expected $expected") }
            }
            Console.WriteLine("PASS portal capability errors return Unsupported and execution errors remain Failed")
        } finally { File.Delete(file) }
    }

    public func Dispose() { connection.Dispose() }
}
