using System.Runtime.InteropServices;

namespace Goo.Printing;

internal static class PortalPrinting
{
    internal static async Task<PrintResult> PrintAsync(Window owner, NativeDialogOwnerLease lease,
        IPrintDocument document, string title, CancellationToken cancellation)
    {
        if (!OperatingSystem.IsLinux())
            return new(PrintStatus.Unsupported);
        try
        {
            return await Task.Run(async () =>
            {
                cancellation.ThrowIfCancellationRequested();
                using var portal = new Connection();
                var prepared = portal.Prepare(lease.Identifier, title, cancellation);
                if (prepared.Code != 0)
                    return new PrintResult(prepared.Code == 1 ? PrintStatus.Cancelled : PrintStatus.Failed);
                var path = Path.Combine(Path.GetTempPath(), "goo-print-" + Guid.NewGuid().ToString("N") + ".pdf");
                await using var file = new FileStream(path, FileMode.CreateNew, FileAccess.ReadWrite, FileShare.Read,
                    4096, FileOptions.Asynchronous | FileOptions.DeleteOnClose);
                var exported = await Printing.ExportPdfAsync(owner, document, prepared.Settings, file, cancellation)
                    .ConfigureAwait(false);
                if (exported.Status != PrintStatus.Exported)
                    return exported;
                await file.FlushAsync(cancellation).ConfigureAwait(false);
                file.Position = 0;
                var response = portal.Print(lease.Identifier, title, file, prepared.Token, cancellation);
                return new PrintResult(response == 0 ? PrintStatus.Submitted :
                    response == 1 ? PrintStatus.Cancelled : PrintStatus.Failed);
            }).ConfigureAwait(false);
        }
        catch (DllNotFoundException) { return new(PrintStatus.Unsupported); }
        catch (EntryPointNotFoundException) { return new(PrintStatus.Unsupported); }
        catch (PortalUnsupportedException) { return new(PrintStatus.Unsupported); }
    }

    private readonly record struct Preparation(uint Code, uint Token, PrintPageSettings Settings);
    private readonly record struct Response(uint Code, Dictionary<string, object?> Values);
    private sealed class PortalUnsupportedException : IOException { }

    private sealed unsafe class Connection : IDisposable
    {
        private const string Library = "libdbus-1.so.3";
        private const string Service = "org.freedesktop.portal.Desktop";
        private const string ObjectPath = "/org/freedesktop/portal/desktop";
        private const string PrintInterface = "org.freedesktop.portal.Print";
        private const string RequestInterface = "org.freedesktop.portal.Request";
        private readonly nint connection;

        internal Connection()
        {
            dbus_threads_init_default();
            var error = new Error();
            dbus_error_init(ref error);
            try
            {
                connection = dbus_bus_get_private(0, ref error);
                if (connection == 0)
                    throw new PortalUnsupportedException();
                dbus_connection_set_exit_on_disconnect(connection, 0);
                dbus_bus_add_match(connection,
                    "type='signal',sender='org.freedesktop.portal.Desktop',interface='org.freedesktop.portal.Request',member='Response'", ref error);
                if (dbus_error_is_set(ref error) != 0)
                    throw new IOException("The print portal response subscription failed.");
                dbus_connection_flush(connection);
            }
            catch
            {
                if (connection != 0)
                {
                    dbus_connection_close(connection);
                    dbus_connection_unref(connection);
                }
                throw;
            }
            finally { dbus_error_free(ref error); }
        }

        internal Preparation Prepare(string parent, string title, CancellationToken cancellation)
        {
            var message = Method(ObjectPath, PrintInterface, "PreparePrint");
            try
            {
                var arguments = new Iter();
                dbus_message_iter_init_append(message, ref arguments);
                String(ref arguments, parent);
                String(ref arguments, title);
                EmptyDictionary(ref arguments);
                EmptyDictionary(ref arguments);
                var options = Open(ref arguments, 'a', "{sv}");
                Variant(ref options, "handle_token", "goo_print_" + Guid.NewGuid().ToString("N"));
                Variant(ref options, "modal", true);
                var entry = Open(ref options, 'e', null);
                String(ref entry, "supported_output_file_formats");
                var variant = Open(ref entry, 'v', "as");
                var formats = Open(ref variant, 'a', "s");
                String(ref formats, "pdf");
                Close(ref variant, ref formats);
                Close(ref entry, ref variant);
                Close(ref options, ref entry);
                Close(ref arguments, ref options);
                var response = AwaitResponse(Send(message), cancellation);
                if (response.Code != 0)
                    return new(response.Code, 0, default);
                if (!response.Values.TryGetValue("token", out var tokenValue) || tokenValue is not uint token ||
                    !response.Values.TryGetValue("page-setup", out var setupValue) ||
                    setupValue is not Dictionary<string, object?> setup)
                    throw new IOException("The print portal returned no page settings.");
                var width = Number(setup, "Width");
                var height = Number(setup, "Height");
                if (setup.TryGetValue("Orientation", out var orientation) &&
                    orientation is string value && value is "landscape" or "reverse-landscape")
                    (width, height) = (height, width);
                const double pointsPerMillimeter = 72.0 / 25.4;
                var settings = new PrintPageSettings(width * pointsPerMillimeter, height * pointsPerMillimeter,
                    Number(setup, "MarginLeft") * pointsPerMillimeter, Number(setup, "MarginTop") * pointsPerMillimeter,
                    Number(setup, "MarginRight") * pointsPerMillimeter, Number(setup, "MarginBottom") * pointsPerMillimeter);
                try { Printing.Validate(settings); }
                catch (ArgumentOutOfRangeException) { throw new IOException("The print portal returned invalid page dimensions."); }
                return new(0, token, settings);
            }
            finally { dbus_message_unref(message); }
        }

        internal uint Print(string parent, string title, FileStream file, uint token, CancellationToken cancellation)
        {
            if (dbus_connection_can_send_type(connection, 'h') == 0)
                throw new PortalUnsupportedException();
            var message = Method(ObjectPath, PrintInterface, "Print");
            try
            {
                var arguments = new Iter();
                dbus_message_iter_init_append(message, ref arguments);
                String(ref arguments, parent);
                String(ref arguments, title);
                var descriptor = checked((int)file.SafeFileHandle.DangerousGetHandle());
                Basic(ref arguments, 'h', &descriptor);
                var options = Open(ref arguments, 'a', "{sv}");
                Variant(ref options, "handle_token", "goo_print_" + Guid.NewGuid().ToString("N"));
                var entry = Open(ref options, 'e', null);
                String(ref entry, "token");
                var variant = Open(ref entry, 'v', "u");
                Basic(ref variant, 'u', &token);
                Close(ref entry, ref variant);
                Close(ref options, ref entry);
                Close(ref arguments, ref options);
                return AwaitResponse(Send(message), cancellation).Code;
            }
            finally { dbus_message_unref(message); }
        }

        private string Send(nint message)
        {
            var error = new Error();
            dbus_error_init(ref error);
            try
            {
                var reply = dbus_connection_send_with_reply_and_block(connection, message, -1, ref error);
                if (reply == 0)
                {
                    var name = Marshal.PtrToStringUTF8(error.Name);
                    if (name is "org.freedesktop.DBus.Error.ServiceUnknown" or "org.freedesktop.DBus.Error.NameHasNoOwner" or
                        "org.freedesktop.DBus.Error.UnknownMethod")
                        throw new PortalUnsupportedException();
                    throw new IOException("The desktop print portal rejected the request.");
                }
                try
                {
                    var arguments = new Iter();
                    if (dbus_message_iter_init(reply, ref arguments) == 0 ||
                        dbus_message_iter_get_arg_type(ref arguments) != 'o')
                        throw new IOException("The print portal returned no request handle.");
                    nint path = 0;
                    dbus_message_iter_get_basic(ref arguments, &path);
                    return Marshal.PtrToStringUTF8(path) ?? throw new IOException("The print request handle is empty.");
                }
                finally { dbus_message_unref(reply); }
            }
            finally { dbus_error_free(ref error); }
        }

        private Response AwaitResponse(string request, CancellationToken cancellation)
        {
            while (true)
            {
                if (cancellation.IsCancellationRequested)
                {
                    var close = Method(request, RequestInterface, "Close");
                    try { dbus_connection_send(connection, close, null); dbus_connection_flush(connection); }
                    finally { dbus_message_unref(close); }
                    cancellation.ThrowIfCancellationRequested();
                }
                if (dbus_connection_read_write(connection, 100) == 0)
                    throw new IOException("The session bus disconnected during printing.");
                var message = dbus_connection_pop_message(connection);
                if (message == 0)
                    continue;
                try
                {
                    if (dbus_message_is_signal(message, RequestInterface, "Response") == 0 ||
                        Marshal.PtrToStringUTF8(dbus_message_get_path(message)) != request)
                        continue;
                    var arguments = new Iter();
                    if (dbus_message_iter_init(message, ref arguments) == 0 ||
                        dbus_message_iter_get_arg_type(ref arguments) != 'u')
                        throw new IOException("The print portal returned an invalid response.");
                    uint code = 0;
                    dbus_message_iter_get_basic(ref arguments, &code);
                    if (dbus_message_iter_next(ref arguments) == 0)
                        return new(code, []);
                    var values = Read(ref arguments, 0) as Dictionary<string, object?> ?? [];
                    return new(code, values);
                }
                finally { dbus_message_unref(message); }
            }
        }

        private static object? Read(ref Iter iterator, int depth)
        {
            if (depth > 8)
                throw new IOException("The print settings exceed the nesting limit.");
            var type = dbus_message_iter_get_arg_type(ref iterator);
            if (type is 's' or 'o')
            {
                nint value = 0;
                dbus_message_iter_get_basic(ref iterator, &value);
                return Marshal.PtrToStringUTF8(value);
            }
            if (type == 'u')
            {
                uint value = 0;
                dbus_message_iter_get_basic(ref iterator, &value);
                return value;
            }
            if (type == 'd')
            {
                double value = 0;
                dbus_message_iter_get_basic(ref iterator, &value);
                return value;
            }
            if (type == 'v')
            {
                dbus_message_iter_recurse(ref iterator, out var child);
                return Read(ref child, depth + 1);
            }
            if (type == 'a' && dbus_message_iter_get_element_type(ref iterator) == 'e')
            {
                var values = new Dictionary<string, object?>(StringComparer.Ordinal);
                dbus_message_iter_recurse(ref iterator, out var entries);
                while (dbus_message_iter_get_arg_type(ref entries) == 'e')
                {
                    dbus_message_iter_recurse(ref entries, out var entry);
                    var key = Read(ref entry, depth + 1) as string;
                    if (key == null || dbus_message_iter_next(ref entry) == 0 || values.Count >= 128)
                        throw new IOException("The print settings contain an invalid dictionary.");
                    values[key] = Read(ref entry, depth + 1);
                    if (dbus_message_iter_next(ref entries) == 0)
                        break;
                }
                return values;
            }
            return null;
        }

        private static double Number(Dictionary<string, object?> values, string key) =>
            values.TryGetValue(key, out var value) && value is double number && double.IsFinite(number)
                ? number : throw new IOException("The print portal omitted " + key + ".");

        private static nint Method(string path, string interfaceName, string method) =>
            dbus_message_new_method_call(Service, path, interfaceName, method) is var message && message != 0
                ? message : throw new IOException("Cannot allocate a print portal request.");

        private static void EmptyDictionary(ref Iter arguments)
        {
            var dictionary = Open(ref arguments, 'a', "{sv}");
            Close(ref arguments, ref dictionary);
        }

        private static Iter Open(ref Iter parent, int type, string? signature)
        {
            if (dbus_message_iter_open_container(ref parent, type, signature, out var child) == 0)
                throw new IOException("Cannot build print settings.");
            return child;
        }

        private static void Close(ref Iter parent, ref Iter child)
        {
            if (dbus_message_iter_close_container(ref parent, ref child) == 0)
                throw new IOException("Cannot finish print settings.");
        }

        private static void String(ref Iter iterator, string value)
        {
            var text = Marshal.StringToCoTaskMemUTF8(value);
            try { Basic(ref iterator, 's', &text); }
            finally { Marshal.FreeCoTaskMem(text); }
        }

        private static void Basic(ref Iter iterator, int type, void* value)
        {
            if (dbus_message_iter_append_basic(ref iterator, type, value) == 0)
                throw new IOException("Cannot append print settings.");
        }

        private static void Variant(ref Iter dictionary, string key, string value)
        {
            var entry = Open(ref dictionary, 'e', null);
            String(ref entry, key);
            var variant = Open(ref entry, 'v', "s");
            String(ref variant, value);
            Close(ref entry, ref variant);
            Close(ref dictionary, ref entry);
        }

        private static void Variant(ref Iter dictionary, string key, bool value)
        {
            var entry = Open(ref dictionary, 'e', null);
            String(ref entry, key);
            var variant = Open(ref entry, 'v', "b");
            var enabled = value ? 1 : 0;
            Basic(ref variant, 'b', &enabled);
            Close(ref entry, ref variant);
            Close(ref dictionary, ref entry);
        }

        public void Dispose()
        {
            dbus_connection_close(connection);
            dbus_connection_unref(connection);
        }

        [StructLayout(LayoutKind.Sequential, Size = 128)] private struct Iter { private nint alignment; }
        [StructLayout(LayoutKind.Sequential)] private struct Error { internal nint Name, Message; private uint flags; private nint padding; }
        [DllImport(Library)] private static extern int dbus_threads_init_default();
        [DllImport(Library)] private static extern void dbus_error_init(ref Error error);
        [DllImport(Library)] private static extern int dbus_error_is_set(ref Error error);
        [DllImport(Library)] private static extern void dbus_error_free(ref Error error);
        [DllImport(Library)] private static extern nint dbus_bus_get_private(int type, ref Error error);
        [DllImport(Library)] private static extern void dbus_bus_add_match(nint connection, string rule, ref Error error);
        [DllImport(Library)] private static extern void dbus_connection_set_exit_on_disconnect(nint connection, int enabled);
        [DllImport(Library)] private static extern int dbus_connection_can_send_type(nint connection, int type);
        [DllImport(Library)] private static extern void dbus_connection_flush(nint connection);
        [DllImport(Library)] private static extern void dbus_connection_close(nint connection);
        [DllImport(Library)] private static extern void dbus_connection_unref(nint connection);
        [DllImport(Library)] private static extern nint dbus_message_new_method_call(string destination, string path, string interfaceName, string method);
        [DllImport(Library)] private static extern void dbus_message_unref(nint message);
        [DllImport(Library)] private static extern int dbus_message_is_signal(nint message, string interfaceName, string member);
        [DllImport(Library)] private static extern nint dbus_message_get_path(nint message);
        [DllImport(Library)] private static extern nint dbus_connection_send_with_reply_and_block(nint connection, nint message, int timeout, ref Error error);
        [DllImport(Library)] private static extern int dbus_connection_send(nint connection, nint message, uint* serial);
        [DllImport(Library)] private static extern int dbus_connection_read_write(nint connection, int timeout);
        [DllImport(Library)] private static extern nint dbus_connection_pop_message(nint connection);
        [DllImport(Library)] private static extern void dbus_message_iter_init_append(nint message, ref Iter iterator);
        [DllImport(Library)] private static extern int dbus_message_iter_init(nint message, ref Iter iterator);
        [DllImport(Library)] private static extern int dbus_message_iter_get_arg_type(ref Iter iterator);
        [DllImport(Library)] private static extern int dbus_message_iter_get_element_type(ref Iter iterator);
        [DllImport(Library)] private static extern int dbus_message_iter_next(ref Iter iterator);
        [DllImport(Library)] private static extern void dbus_message_iter_recurse(ref Iter iterator, out Iter child);
        [DllImport(Library)] private static extern void dbus_message_iter_get_basic(ref Iter iterator, void* value);
        [DllImport(Library)] private static extern int dbus_message_iter_open_container(ref Iter parent, int type, string? signature, out Iter child);
        [DllImport(Library)] private static extern int dbus_message_iter_close_container(ref Iter parent, ref Iter child);
        [DllImport(Library)] private static extern int dbus_message_iter_append_basic(ref Iter iterator, int type, void* value);
    }
}
