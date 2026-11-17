package Goo.Printing

import Goo
import System
import System.Collections.Generic
import System.IO
import System.Runtime.InteropServices
import System.Threading
import System.Threading.Tasks

internal shared class PortalPrinting {
    private data struct Preparation(Code uint32, Token uint32, Settings PrintPageSettings) : IEquatable[Preparation] { }

    private data struct Response(Code uint32, Values Dictionary[string, object?]) : IEquatable[Response] { }

    private class PortalUnsupportedException : IOException { }

    private unsafe class Connection : IDisposable {
        private let connection nint

        internal init() {
            dbus_threads_init_default()
            var error = Error{}
            // https://github.com/DavidObando/gsharp/issues/6086
            dbus_error_init(ref error)
            try {
                // https://github.com/DavidObando/gsharp/issues/6086
                connection = dbus_bus_get_private(0, ref error)
                if connection == 0 {
                    throw PortalUnsupportedException()
                }
                dbus_connection_set_exit_on_disconnect(connection, 0)
                dbus_bus_add_match(
                    connection,
                    "type='signal',sender='org.freedesktop.portal.Desktop',interface='org.freedesktop.portal.Request',member='Response'",
                    // https://github.com/DavidObando/gsharp/issues/6086
                    ref error
                )
                // https://github.com/DavidObando/gsharp/issues/6086
                if dbus_error_is_set(ref error) != 0 {
                    throw IOException("The print portal response subscription failed.")
                }
                dbus_connection_flush(connection)
            } catch {
                if connection != 0 {
                    dbus_connection_close(connection)
                    dbus_connection_unref(connection)
                }
                rethrow
            } finally {
                // https://github.com/DavidObando/gsharp/issues/6086
                dbus_error_free(ref error)
            }
        }

        internal func Prepare(parent string, title string, cancellation CancellationToken) Preparation {
            let message = Method(ObjectPath, PrintInterface, "PreparePrint")
            try {
                var arguments = Iter{}
                // https://github.com/DavidObando/gsharp/issues/6086
                dbus_message_iter_init_append(message, ref arguments)
                // https://github.com/DavidObando/gsharp/issues/6086
                Connection.String(ref arguments, parent)
                // https://github.com/DavidObando/gsharp/issues/6086
                Connection.String(ref arguments, title)
                // https://github.com/DavidObando/gsharp/issues/6086
                EmptyDictionary(ref arguments)
                // https://github.com/DavidObando/gsharp/issues/6086
                EmptyDictionary(ref arguments)
                // https://github.com/DavidObando/gsharp/issues/6086
                var options = Open(ref arguments, 'a', "{sv}")
                // https://github.com/DavidObando/gsharp/issues/6086
                Variant(ref options, "handle_token", "goo_print_" + Guid.NewGuid().ToString("N"))
                // https://github.com/DavidObando/gsharp/issues/6086
                Variant(ref options, "modal", true)
                // https://github.com/DavidObando/gsharp/issues/6086
                var entry = Open(ref options, 'e', nil)
                // https://github.com/DavidObando/gsharp/issues/6086
                Connection.String(ref entry, "supported_output_file_formats")
                // https://github.com/DavidObando/gsharp/issues/6086
                var variant = Open(ref entry, 'v', "as")
                // https://github.com/DavidObando/gsharp/issues/6086
                var formats = Open(ref variant, 'a', "s")
                // https://github.com/DavidObando/gsharp/issues/6086
                Connection.String(ref formats, "pdf")
                // https://github.com/DavidObando/gsharp/issues/6086
                Close(ref variant, ref formats)
                // https://github.com/DavidObando/gsharp/issues/6086
                Close(ref entry, ref variant)
                // https://github.com/DavidObando/gsharp/issues/6086
                Close(ref options, ref entry)
                // https://github.com/DavidObando/gsharp/issues/6086
                Close(ref arguments, ref options)
                let response = AwaitResponse(Send(message), cancellation)
                if response.Code != uint32(0) {
                    return Preparation(response.Code, 0, default(PrintPageSettings))
                }
                if !response.Values.TryGetValue("token", out var tokenValue) ||
                    tokenValue is not uint32 token ||
                    !response
                    .Values
                    .TryGetValue("page-setup", out var setupValue) ||
                    setupValue is not Dictionary[string, object?]setup {
                    throw IOException("The print portal returned no page settings.")
                }
                var width = Number(setup, "Width")
                var height = Number(setup, "Height")
                if setup.TryGetValue("Orientation", out var orientation) &&
                    orientation is string value &&
                    (value == "landscape" || value == "reverse-landscape") {
                    width, height = height, width
                }
                const pointsPerMillimeter = 72.0 / 25.4
                let settings = PrintPageSettings(
                    width * pointsPerMillimeter,
                    height * pointsPerMillimeter,
                    Number(setup, "MarginLeft") * pointsPerMillimeter,
                    Number(setup, "MarginTop") * pointsPerMillimeter,
                    Number(setup, "MarginRight") * pointsPerMillimeter,
                    Number(setup, "MarginBottom") * pointsPerMillimeter
                )
                try {
                    Printing.Validate(settings)
                } catch (ArgumentOutOfRangeException) {
                    throw IOException("The print portal returned invalid page dimensions.")
                }
                return Preparation(0, token, settings)
            } finally {
                dbus_message_unref(message)
            }
        }

        internal func Print(
            parent string,
            title string,
            file FileStream,
            token uint32,
            cancellation CancellationToken
        ) uint32 {
            var token = token
            if dbus_connection_can_send_type(connection, 'h') == 0 {
                throw PortalUnsupportedException()
            }
            let message = Method(ObjectPath, PrintInterface, "Print")
            try {
                var arguments = Iter{}
                // https://github.com/DavidObando/gsharp/issues/6086
                dbus_message_iter_init_append(message, ref arguments)
                // https://github.com/DavidObando/gsharp/issues/6086
                Connection.String(ref arguments, parent)
                // https://github.com/DavidObando/gsharp/issues/6086
                Connection.String(ref arguments, title)
                var descriptor = checked(int32(file.SafeFileHandle.DangerousGetHandle()))
                // https://github.com/DavidObando/gsharp/issues/6086
                Basic(ref arguments, 'h', *void(&descriptor))
                // https://github.com/DavidObando/gsharp/issues/6086
                var options = Open(ref arguments, 'a', "{sv}")
                // https://github.com/DavidObando/gsharp/issues/6086
                Variant(ref options, "handle_token", "goo_print_" + Guid.NewGuid().ToString("N"))
                // https://github.com/DavidObando/gsharp/issues/6086
                var entry = Open(ref options, 'e', nil)
                // https://github.com/DavidObando/gsharp/issues/6086
                Connection.String(ref entry, "token")
                // https://github.com/DavidObando/gsharp/issues/6086
                var variant = Open(ref entry, 'v', "u")
                // https://github.com/DavidObando/gsharp/issues/6086
                Basic(ref variant, 'u', *void(&token))
                // https://github.com/DavidObando/gsharp/issues/6086
                Close(ref entry, ref variant)
                // https://github.com/DavidObando/gsharp/issues/6086
                Close(ref options, ref entry)
                // https://github.com/DavidObando/gsharp/issues/6086
                Close(ref arguments, ref options)
                return AwaitResponse(Send(message), cancellation).Code
            } finally {
                dbus_message_unref(message)
            }
        }

        private func Send(message nint) string {
            var error = Error{}
            // https://github.com/DavidObando/gsharp/issues/6086
            dbus_error_init(ref error)
            try {
                // https://github.com/DavidObando/gsharp/issues/6086
                let reply = dbus_connection_send_with_reply_and_block(connection, message, -1, ref error)
                if reply == 0 {
                    let name = Marshal.PtrToStringUTF8(error.Name)
                    if (
                        name is "org.freedesktop.DBus.Error.ServiceUnknown" or
                            "org.freedesktop.DBus.Error.NameHasNoOwner" or
                            "org.freedesktop.DBus.Error.UnknownMethod"
                    ) {
                        throw PortalUnsupportedException()
                    }
                    throw IOException("The desktop print portal rejected the request.")
                }
                try {
                    var arguments = Iter{}
                    // https://github.com/DavidObando/gsharp/issues/6086
                    if dbus_message_iter_init(reply, ref arguments) == 0 ||
                        // https://github.com/DavidObando/gsharp/issues/6086
                        dbus_message_iter_get_arg_type(ref arguments) != int32('o') {
                        throw IOException("The print portal returned no request handle.")
                    }
                    var path nint = 0
                    // https://github.com/DavidObando/gsharp/issues/6086
                    dbus_message_iter_get_basic(ref arguments, *void(&path))
                    return Marshal.PtrToStringUTF8(path) ?? throw IOException("The print request handle is empty.")
                } finally {
                    dbus_message_unref(reply)
                }
            } finally {
                // https://github.com/DavidObando/gsharp/issues/6086
                dbus_error_free(ref error)
            }
        }

        private func AwaitResponse(request string, cancellation CancellationToken) Response {
            while true {
                if cancellation.IsCancellationRequested {
                    let close = Method(request, RequestInterface, "Close")
                    try {
                        dbus_connection_send(connection, close, nil)
                        dbus_connection_flush(connection)
                    } finally {
                        dbus_message_unref(close)
                    }
                    cancellation.ThrowIfCancellationRequested()
                }
                if dbus_connection_read_write(connection, 100) == 0 {
                    throw IOException("The session bus disconnected during printing.")
                }
                let message = dbus_connection_pop_message(connection)
                if message == 0 {
                    continue
                }
                try {
                    if dbus_message_is_signal(message, RequestInterface, "Response") == 0 || Marshal.PtrToStringUTF8(
                        dbus_message_get_path(message)
                    ) != request {
                        continue
                    }
                    var arguments = Iter{}
                    // https://github.com/DavidObando/gsharp/issues/6086
                    if dbus_message_iter_init(message, ref arguments) == 0 ||
                        // https://github.com/DavidObando/gsharp/issues/6086
                        dbus_message_iter_get_arg_type(ref arguments) != int32('u') {
                        throw IOException("The print portal returned an invalid response.")
                    }
                    var code uint32 = uint32(0)
                    // https://github.com/DavidObando/gsharp/issues/6086
                    dbus_message_iter_get_basic(ref arguments, *void(&code))
                    // https://github.com/DavidObando/gsharp/issues/6086
                    if dbus_message_iter_next(ref arguments) == 0 {
                        return Response(code, Dictionary[string, object?]())
                    }
                    // https://github.com/DavidObando/gsharp/issues/6086
                    let values = Read(ref arguments, 0) as Dictionary[string, object?] ?? Dictionary[string, object?]()
                    return Response(code, values)
                } finally {
                    dbus_message_unref(message)
                }
            }
        }

        func Dispose() {
            dbus_connection_close(connection)
            dbus_connection_unref(connection)
        }

        @StructLayout(LayoutKind.Sequential, Size = int32(128))
        private struct Iter {
            private var alignment nint
        }

        @StructLayout(LayoutKind.Sequential)
        private struct Error {
            internal var Name nint
            internal var Message nint
            private var flags uint32
            private var padding nint
        }

        shared {
            private const Library string = "libdbus-1.so.3"
            private const Service string = "org.freedesktop.portal.Desktop"
            private const ObjectPath string = "/org/freedesktop/portal/desktop"
            private const PrintInterface string = "org.freedesktop.portal.Print"
            private const RequestInterface string = "org.freedesktop.portal.Request"

            private func Read(ref iterator Iter, depth int32) object? {
                if depth > 8 {
                    throw IOException("The print settings exceed the nesting limit.")
                }
                // https://github.com/DavidObando/gsharp/issues/6086
                let type = dbus_message_iter_get_arg_type(ref iterator)
                if type == int32('s') || type == int32('o') {
                    var value nint = 0
                    // https://github.com/DavidObando/gsharp/issues/6086
                    dbus_message_iter_get_basic(ref iterator, *void(&value))
                    return Marshal.PtrToStringUTF8(value)
                }
                if type == int32('u') {
                    var value uint32 = uint32(0)
                    // https://github.com/DavidObando/gsharp/issues/6086
                    dbus_message_iter_get_basic(ref iterator, *void(&value))
                    return value
                }
                if type == int32('d') {
                    var value float64 = 0.0
                    // https://github.com/DavidObando/gsharp/issues/6086
                    dbus_message_iter_get_basic(ref iterator, *void(&value))
                    return value
                }
                if type == int32('v') {
                    // https://github.com/DavidObando/gsharp/issues/6086
                    dbus_message_iter_recurse(ref iterator, out var child)
                    // https://github.com/DavidObando/gsharp/issues/6086
                    return Read(ref child, depth + 1)
                }
                // https://github.com/DavidObando/gsharp/issues/6086
                if type == int32('a') && dbus_message_iter_get_element_type(ref iterator) == int32('e') {
                    let values = Dictionary[string, object?](StringComparer.Ordinal)
                    // https://github.com/DavidObando/gsharp/issues/6086
                    dbus_message_iter_recurse(ref iterator, out var entries)
                    // https://github.com/DavidObando/gsharp/issues/6086
                    while dbus_message_iter_get_arg_type(ref entries) == int32('e') {
                        // https://github.com/DavidObando/gsharp/issues/6086
                        dbus_message_iter_recurse(ref entries, out var entry)
                        // https://github.com/DavidObando/gsharp/issues/6086
                        let key string? = Read(ref entry, depth + 1) as string
                        // https://github.com/DavidObando/gsharp/issues/6086
                        if key == nil || dbus_message_iter_next(ref entry) == 0 || values.Count >= 128 {
                            throw IOException("The print settings contain an invalid dictionary.")
                        }
                        // https://github.com/DavidObando/gsharp/issues/6086
                        values[key] = Read(ref entry, depth + 1)
                        // https://github.com/DavidObando/gsharp/issues/6086
                        if dbus_message_iter_next(ref entries) == 0 {
                            break
                        }
                    }
                    return values
                }
                return nil
            }

            private func Number(values Dictionary[string, object?], key string) float64 -> if values.TryGetValue(
                key,
                out var value
            ) &&
                value is float64 number &&
                float64.IsFinite(number) {
                number
            } else {
                throw IOException("The print portal omitted " + key + ".")
                default(float64)
            }

            private func Method(
                path string,
                interfaceName string,
                method string
            ) nint -> if dbus_message_new_method_call(Service, path, interfaceName, method) is var message &&
                message != 0 {
                message
            } else {
                throw IOException("Cannot allocate a print portal request.")
                default(nint)
            }

            private func EmptyDictionary(ref arguments Iter) {
                // https://github.com/DavidObando/gsharp/issues/6086
                var dictionary = Open(ref arguments, 'a', "{sv}")
                // https://github.com/DavidObando/gsharp/issues/6086
                Close(ref arguments, ref dictionary)
            }

            private func Open(ref parent Iter, type int32, signature string?) Iter {
                var child Iter
                let opened = if let value = signature {
                    // https://github.com/DavidObando/gsharp/issues/6086
                    dbus_message_iter_open_container(ref parent, type, value, out child)
                } else {
                    // https://github.com/DavidObando/gsharp/issues/6086
                    dbus_message_iter_open_container(ref parent, type, nint(0), out child)
                }
                if opened == 0 { throw IOException("Cannot build print settings.") }
                return child
            }

            private func Close(ref parent Iter, ref child Iter) {
                // https://github.com/DavidObando/gsharp/issues/6086
                if dbus_message_iter_close_container(ref parent, ref child) == 0 {
                    throw IOException("Cannot finish print settings.")
                }
            }

            private func String(ref iterator Iter, value string) {
                var text = Marshal.StringToCoTaskMemUTF8(value)
                try {
                    // https://github.com/DavidObando/gsharp/issues/6086
                    Basic(ref iterator, 's', *void(&text))
                } finally {
                    Marshal.FreeCoTaskMem(text)
                }
            }

            private func Basic(ref iterator Iter, type int32, value *void) {
                // https://github.com/DavidObando/gsharp/issues/6086
                if dbus_message_iter_append_basic(ref iterator, type, value) == 0 {
                    throw IOException("Cannot append print settings.")
                }
            }

            private func Variant(ref dictionary Iter, key string, value string) {
                // https://github.com/DavidObando/gsharp/issues/6086
                var entry = Open(ref dictionary, 'e', nil)
                // https://github.com/DavidObando/gsharp/issues/6086
                Connection.String(ref entry, key)
                // https://github.com/DavidObando/gsharp/issues/6086
                var variant = Open(ref entry, 'v', "s")
                // https://github.com/DavidObando/gsharp/issues/6086
                Connection.String(ref variant, value)
                // https://github.com/DavidObando/gsharp/issues/6086
                Close(ref entry, ref variant)
                // https://github.com/DavidObando/gsharp/issues/6086
                Close(ref dictionary, ref entry)
            }

            private func Variant(ref dictionary Iter, key string, value bool) {
                // https://github.com/DavidObando/gsharp/issues/6086
                var entry = Open(ref dictionary, 'e', nil)
                // https://github.com/DavidObando/gsharp/issues/6086
                Connection.String(ref entry, key)
                // https://github.com/DavidObando/gsharp/issues/6086
                var variant = Open(ref entry, 'v', "b")
                var enabled = if value {
                    1
                } else {
                    0
                }
                // https://github.com/DavidObando/gsharp/issues/6086
                Basic(ref variant, 'b', *void(&enabled))
                // https://github.com/DavidObando/gsharp/issues/6086
                Close(ref entry, ref variant)
                // https://github.com/DavidObando/gsharp/issues/6086
                Close(ref dictionary, ref entry)
            }

            @DllImport("libdbus-1.so.3")
            private func dbus_threads_init_default() int32;

            @DllImport("libdbus-1.so.3")
            private func dbus_error_init(ref error Error);

            @DllImport("libdbus-1.so.3")
            private func dbus_error_is_set(ref error Error) int32;

            @DllImport("libdbus-1.so.3")
            private func dbus_error_free(ref error Error);

            @DllImport("libdbus-1.so.3")
            private func dbus_bus_get_private(type int32, ref error Error) nint;

            @DllImport("libdbus-1.so.3")
            private func dbus_bus_add_match(connection nint, rule string, ref error Error);

            @DllImport("libdbus-1.so.3")
            private func dbus_connection_set_exit_on_disconnect(connection nint, enabled int32);

            @DllImport("libdbus-1.so.3")
            private func dbus_connection_can_send_type(connection nint, type int32) int32;

            @DllImport("libdbus-1.so.3")
            private func dbus_connection_flush(connection nint);

            @DllImport("libdbus-1.so.3")
            private func dbus_connection_close(connection nint);

            @DllImport("libdbus-1.so.3")
            private func dbus_connection_unref(connection nint);

            @DllImport("libdbus-1.so.3")
            private func dbus_message_new_method_call(
                destination string,
                path string,
                interfaceName string,
                method string
            ) nint;

            @DllImport("libdbus-1.so.3")
            private func dbus_message_unref(message nint);

            @DllImport("libdbus-1.so.3")
            private func dbus_message_is_signal(message nint, interfaceName string, member string) int32;

            @DllImport("libdbus-1.so.3")
            private func dbus_message_get_path(message nint) nint;

            @DllImport("libdbus-1.so.3")
            private func dbus_connection_send_with_reply_and_block(
                connection nint,
                message nint,
                timeout int32,
                ref error Error
            ) nint;

            @DllImport("libdbus-1.so.3")
            private func dbus_connection_send(connection nint, message nint, serial *uint32) int32;

            @DllImport("libdbus-1.so.3")
            private func dbus_connection_read_write(connection nint, timeout int32) int32;

            @DllImport("libdbus-1.so.3")
            private func dbus_connection_pop_message(connection nint) nint;

            @DllImport("libdbus-1.so.3")
            private func dbus_message_iter_init_append(message nint, ref iterator Iter);

            @DllImport("libdbus-1.so.3")
            private func dbus_message_iter_init(message nint, ref iterator Iter) int32;

            @DllImport("libdbus-1.so.3")
            private func dbus_message_iter_get_arg_type(ref iterator Iter) int32;

            @DllImport("libdbus-1.so.3")
            private func dbus_message_iter_get_element_type(ref iterator Iter) int32;

            @DllImport("libdbus-1.so.3")
            private func dbus_message_iter_next(ref iterator Iter) int32;

            @DllImport("libdbus-1.so.3")
            private func dbus_message_iter_recurse(ref iterator Iter, out child Iter);

            @DllImport("libdbus-1.so.3")
            private func dbus_message_iter_get_basic(ref iterator Iter, value *void);

            @DllImport("libdbus-1.so.3")
            private func dbus_message_iter_open_container(
                ref parent Iter,
                type int32,
                signature nint,
                out child Iter
            ) int32;

            @DllImport("libdbus-1.so.3")
            private func dbus_message_iter_open_container(ref parent Iter, type int32, signature string, out child Iter) int32;

            @DllImport("libdbus-1.so.3")
            private func dbus_message_iter_close_container(ref parent Iter, ref child Iter) int32;

            @DllImport("libdbus-1.so.3")
            private func dbus_message_iter_append_basic(ref iterator Iter, type int32, value *void) int32;
        }
    }

    internal async func PrintAsync(
        owner Window,
        lease NativeDialogOwnerLease,
        document IPrintDocument,
        title string,
        cancellation CancellationToken
    ) PrintResult {
        if !OperatingSystem.IsLinux() {
            return PrintResult(PrintStatus.Unsupported)
        }
        try {
            return await Task.Run[PrintResult](
                async () -> {
                    cancellation.ThrowIfCancellationRequested()
                    using let portal = Connection()
                    let prepared = portal.Prepare(lease.Identifier, title, cancellation)
                    if prepared.Code != uint32(0) {
                        return PrintResult(
                            if prepared.Code == uint32(1) {
                                PrintStatus.Cancelled
                            } else {
                                PrintStatus.Failed
                            }
                        )
                    }
                    let path = Path.Combine(Path.GetTempPath(), "goo-print-" + Guid.NewGuid().ToString("N") + ".pdf")
                    await using let file = FileStream(
                        path,
                        FileMode.CreateNew,
                        FileAccess.ReadWrite,
                        FileShare.Read,
                        4096,
                        FileOptions.Asynchronous | FileOptions.DeleteOnClose
                    )
                    let exported = await Printing.ExportPdfAsync(owner, document, prepared.Settings, file, cancellation)
                        .ConfigureAwait(false)
                    if exported.Status != PrintStatus.Exported {
                        return exported
                    }
                    await file.FlushAsync(cancellation).ConfigureAwait(false)
                    file.Position = 0
                    let response = portal.Print(lease.Identifier, title, file, prepared.Token, cancellation)
                    return PrintResult(
                        if response == uint32(0) {
                            PrintStatus.Submitted
                        } else {
                            (
                                if response == uint32(1) {
                                    PrintStatus.Cancelled
                                } else {
                                    PrintStatus.Failed
                                }
                            )
                        }
                    )
                }
            )
                .ConfigureAwait(false)
        } catch (DllNotFoundException) {
            return PrintResult(PrintStatus.Unsupported)
        } catch (EntryPointNotFoundException) {
            return PrintResult(PrintStatus.Unsupported)
        } catch (PortalUnsupportedException) {
            return PrintResult(PrintStatus.Unsupported)
        }
    }
}
