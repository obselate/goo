using Tmds.DBus.Protocol;

internal sealed class LinuxSmoke : IPathMethodHandler, IDisposable
{
    private const string ItemPath = "/StatusNotifierItem";
    private const string MenuPath = ItemPath + "/Menu";
    private const string ItemInterface = "org.kde.StatusNotifierItem";
    private const string MenuInterface = "com.canonical.dbusmenu";
    private readonly DBusConnection connection = new(DBusAddress.Session!);
    private string service = "";
    private int menuId;
    internal TaskCompletionSource<string> Registered { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
    public string Path => "/StatusNotifierWatcher";
    public bool HandlesChildPaths => false;

    internal LinuxSmoke()
    {
        connection.ConnectAsync().GetAwaiter().GetResult();
        connection.AddMethodHandler(this);
        Check(connection.TryRequestNameAsync("org.kde.StatusNotifierWatcher", RequestNameOptions.None)
            .GetAwaiter().GetResult(), "Own private SNI watcher");
    }

    public ValueTask HandleMethodAsync(MethodContext context)
    {
        var request = context.Request;
        if (request.InterfaceAsString == "org.kde.StatusNotifierWatcher" &&
            request.MemberAsString == "RegisterStatusNotifierItem")
        {
            var reader = request.GetBodyReader();
            service = reader.ReadString();
            using var writer = context.CreateReplyWriter("");
            context.Reply(writer.CreateMessage());
            Registered.TrySetResult(service);
        }
        else if (request.InterfaceAsString == "org.freedesktop.DBus.Properties" && request.MemberAsString == "Get")
        {
            using var writer = context.CreateReplyWriter("v");
            writer.WriteVariantBool(true);
            context.Reply(writer.CreateMessage());
        }
        else context.ReplyUnknownMethodError();
        return ValueTask.CompletedTask;
    }

    internal async Task VerifyAsync(string title, bool activate)
    {
        var actual = await Property("Title");
        Check(actual.GetString() == title, "SNI title update");
        var menu = await Property("Menu");
        Check(menu.GetObjectPathAsString() == MenuPath, "SNI DBusMenu path");
        var pixels = await Property("IconPixmap");
        Check(pixels.Count == 1 && pixels.GetItem(0).GetItem(0).GetInt32() == 2 &&
            pixels.GetItem(0).GetItem(2).GetArray<byte>()[0] == 255, "SNI ARGB pixmap");
        var layout = await Layout();
        Check(layout.GetItem(1).GetDictionary<string, VariantValue>()["label"].GetString() == "Open " + title,
            "DBusMenu updated label");
        Check(layout.GetItem(1).GetDictionary<string, VariantValue>()["toggle-state"].GetInt32() == 1,
            "DBusMenu checked state");
        var id = layout.GetItem(0).GetInt32();
        Check(menuId == 0 || menuId == id, "DBusMenu stable ID across update");
        menuId = id;
        await Click(id);
        if (activate) await Activate();
        Console.WriteLine($"Private SNI watcher and DBusMenu passed: {title}, ID {id}.");
    }

    internal Task VerifyDisposedAsync()
    {
        using var writer = connection.GetMessageWriter();
        writer.WriteMethodCallHeader("org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus",
            "NameHasOwner", "s");
        writer.WriteString(service);
        return connection.CallMethodAsync(writer.CreateMessage(), (message, _) =>
        {
            var reader = message.GetBodyReader();
            Check(!reader.ReadBool(), "SNI service removed on dispose");
            return true;
        });
    }

    private Task<VariantValue> Property(string name)
    {
        using var writer = connection.GetMessageWriter();
        writer.WriteMethodCallHeader(service, ItemPath, "org.freedesktop.DBus.Properties", "Get", "ss");
        writer.WriteString(ItemInterface);
        writer.WriteString(name);
        return connection.CallMethodAsync(writer.CreateMessage(),
            (message, _) => { var reader = message.GetBodyReader(); return reader.ReadVariantValue(); });
    }

    private Task<VariantValue> Layout()
    {
        using var writer = connection.GetMessageWriter();
        writer.WriteMethodCallHeader(service, MenuPath, MenuInterface, "GetLayout", "iias");
        writer.WriteInt32(0);
        writer.WriteInt32(-1);
        writer.WriteArray(Array.Empty<string>());
        return connection.CallMethodAsync(writer.CreateMessage(), (message, _) =>
        {
            var reader = message.GetBodyReader();
            Check(reader.ReadUInt32() > 0, "DBusMenu revision");
            reader.AlignStruct();
            Check(reader.ReadInt32() == 0, "DBusMenu root");
            reader.ReadDictionaryOfStringToVariantValue();
            var children = reader.ReadArrayOfVariantValue();
            Check(children.Length == 2, "DBusMenu children");
            Check(!children[1].GetItem(1).GetDictionary<string, VariantValue>()["enabled"].GetBool(),
                "DBusMenu disabled item");
            return children[0];
        });
    }

    private Task Click(int id)
    {
        using var writer = connection.GetMessageWriter();
        writer.WriteMethodCallHeader(service, MenuPath, MenuInterface, "Event", "isvu");
        writer.WriteInt32(id);
        writer.WriteString("clicked");
        writer.WriteVariantInt32(0);
        writer.WriteUInt32(0);
        return connection.CallMethodAsync(writer.CreateMessage());
    }

    private Task Activate()
    {
        using var writer = connection.GetMessageWriter();
        writer.WriteMethodCallHeader(service, ItemPath, ItemInterface, "Activate", "ii");
        writer.WriteInt32(0);
        writer.WriteInt32(0);
        return connection.CallMethodAsync(writer.CreateMessage());
    }

    public void Dispose() => connection.Dispose();
    private static void Check(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException(message);
    }
}
