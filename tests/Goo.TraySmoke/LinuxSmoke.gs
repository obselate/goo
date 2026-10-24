package GooTraySmoke

import System
import System.Threading.Tasks
import Tmds.DBus.Protocol

internal sealed class LinuxSmoke : IPathMethodHandler, IDisposable {
    private const ItemPath string = "/StatusNotifierItem"
    private const MenuPath string = ItemPath + "/Menu"
    private const ItemInterface string = "org.kde.StatusNotifierItem"
    private const MenuInterface string = "com.canonical.dbusmenu"
    private let connection DBusConnection = DBusConnection(DBusAddress.Session!!)
    private var service string = ""
    private var menuId int32
    internal let Registered TaskCompletionSource[string] = TaskCompletionSource[string](TaskCreationOptions.RunContinuationsAsynchronously)
    public prop Path string { get -> "/StatusNotifierWatcher" }
    public prop HandlesChildPaths bool { get -> false }
    internal init() {
        connection.ConnectAsync().AsTask().GetAwaiter().GetResult()
        connection.AddMethodHandler(this)
        Check(connection.TryRequestNameAsync("org.kde.StatusNotifierWatcher", RequestNameOptions.None)
            .GetAwaiter().GetResult(), "Own private SNI watcher")
    }

    public func HandleMethodAsync(context MethodContext) ValueTask {
        let request = context.Request
        if request.InterfaceAsString == "org.kde.StatusNotifierWatcher" && request.MemberAsString == "RegisterStatusNotifierItem" {
            let reader = request.GetBodyReader()
            service = reader.ReadString()
            using let writer = context.CreateReplyWriter("")
            context.Reply(writer.CreateMessage())
            Registered.TrySetResult(service)
        } else if request.InterfaceAsString == "org.freedesktop.DBus.Properties" && request.MemberAsString == "Get" {
            using let writer = context.CreateReplyWriter("v")
            writer.WriteVariantBool(true)
            context.Reply(writer.CreateMessage())
        } else { context.ReplyUnknownMethodError() }
        return ValueTask.CompletedTask
    }

    internal async func VerifyAsync(title string, activate bool) Task {
        let actual = await Property("Title")
        Check(actual.GetString() == title, "SNI title update")
        let menu = await Property("Menu")
        Check(menu.GetObjectPathAsString() == MenuPath, "SNI DBusMenu path")
        let pixels = await Property("IconPixmap")
        Check(pixels.Count == 1 && pixels.GetItem(0).GetItem(0).GetInt32() == 2 &&
            pixels.GetItem(0).GetItem(2).GetArray[uint8]()[0] == 255, "SNI ARGB pixmap")
        let layout = await Layout()
        Check(layout.GetItem(1).GetDictionary[string, VariantValue]()["label"].GetString() == "Open " + title, "DBusMenu updated label")
        Check(layout.GetItem(1).GetDictionary[string, VariantValue]()["toggle-state"].GetInt32() == 1, "DBusMenu checked state")
        let id = layout.GetItem(0).GetInt32()
        Check(menuId == 0 || menuId == id, "DBusMenu stable ID across update")
        menuId = id
        await Click(id)
        if activate { await Activate() }
        Console.WriteLine("Private SNI watcher and DBusMenu passed: $title, ID $id.")
    }

    internal func VerifyDisposedAsync() Task {
        using let writer = connection.GetMessageWriter()
        writer.WriteMethodCallHeader("org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus", "NameHasOwner", "s")
        writer.WriteString(service)
        return connection.CallMethodAsync(writer.CreateMessage(), (message Message, _ object?) -> {
            let reader = message.GetBodyReader()
            Check(!reader.ReadBool(), "SNI service removed on dispose")
            return true
        })
    }

    private func Property(name string) Task[VariantValue] {
        using let writer = connection.GetMessageWriter()
        writer.WriteMethodCallHeader(service, ItemPath, "org.freedesktop.DBus.Properties", "Get", "ss")
        writer.WriteString(ItemInterface)
        writer.WriteString(name)
        return connection.CallMethodAsync(writer.CreateMessage(), (message Message, _ object?) -> {
            let reader = message.GetBodyReader()
            return reader.ReadVariantValue()
        })
    }

    private func Layout() Task[VariantValue] {
        using let writer = connection.GetMessageWriter()
        writer.WriteMethodCallHeader(service, MenuPath, MenuInterface, "GetLayout", "iias")
        writer.WriteInt32(0)
        writer.WriteInt32(-1)
        writer.WriteArray(System.Array.Empty[string]())
        return connection.CallMethodAsync(writer.CreateMessage(), (message Message, _ object?) -> {
            let reader = message.GetBodyReader()
            Check(reader.ReadUInt32() > 0u, "DBusMenu revision")
            reader.AlignStruct()
            Check(reader.ReadInt32() == 0, "DBusMenu root")
            reader.ReadDictionaryOfStringToVariantValue()
            let children = reader.ReadArrayOfVariantValue()
            Check(children.Length == 2, "DBusMenu children")
            Check(!children[1].GetItem(1).GetDictionary[string, VariantValue]()["enabled"].GetBool(), "DBusMenu disabled item")
            return children[0]
        })
    }

    private func Click(id int32) Task {
        using let writer = connection.GetMessageWriter()
        writer.WriteMethodCallHeader(service, MenuPath, MenuInterface, "Event", "isvu")
        writer.WriteInt32(id)
        writer.WriteString("clicked")
        writer.WriteVariantInt32(0)
        writer.WriteUInt32(0u)
        return connection.CallMethodAsync(writer.CreateMessage())
    }

    private func Activate() Task {
        using let writer = connection.GetMessageWriter()
        writer.WriteMethodCallHeader(service, ItemPath, ItemInterface, "Activate", "ii")
        writer.WriteInt32(0)
        writer.WriteInt32(0)
        return connection.CallMethodAsync(writer.CreateMessage())
    }

    public func Dispose() { connection.Dispose() }
    private func Check(condition bool, message string) {
        if !condition { throw InvalidOperationException(message) }
    }
}
