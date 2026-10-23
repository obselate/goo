# Application hosting

```gsharp
import Goo
import System

func Main() {
    Window.ConfigureApplication("Example", "1.0", "org.example.App")
    Window.ApplicationActivated += (request) -> {
        Console.WriteLine(String.Join(" | ", request.Arguments))
    }
    let arguments = Environment.GetCommandLineArgs()
    let parsed = ActivationArguments.Read(
        ArraySegment[string](arguments, 1, arguments.Length - 1), Environment.CurrentDirectory)
    if parsed.Status != ActivationReadStatus.Accepted {
        Console.Error.WriteLine(parsed.Error)
        return
    }
    let initial = parsed.Activation!!
    if Window.InitializeApplicationActivation(initial) != WindowOperationResult.Accepted {
        Console.Error.WriteLine("Initial activation exceeds its limits")
        return
    }
    let result = SingleInstance.AcquireAsync("org.example.App", initial).GetAwaiter().GetResult()
    if result.Status == SingleInstanceStatus.Forwarded { return }
    if result.Status != SingleInstanceStatus.Primary {
        Console.Error.WriteLine(result.Status.ToString() + ": " + result.Error)
        return
    }
    using let lease = result.Lease!!
    let window = Window{ Width: 320, Height: 200, Root: Cell{} }
    window.Run()
}
```

Install `Goo.AppHost` only when the app needs desktop instance ownership.
Its types use namespace `Goo`.

- Subscribe and initialize activation on the UI thread before acquisition.
- Keep the primary lease until shutdown. Dispose it before a later acquisition.
- Forwarded means the primary accepted an owned request into its queue. It does not mean the handler ran.
- A forwarded Launch becomes Arguments. All forwarded requests have IsInitial set to false.
- Argument boundaries, empty strings, Unicode and the sender's working directory are retained.
- The receiver's current directory does not change.
- `ActivationArguments.Read` excludes the executable name and owns the returned data.
- Before a window exists, block on the acquisition task as shown. An ordinary console entry point has no UI synchronization context.

## Outcomes

| Status | Meaning |
| --- | --- |
| Primary | This process owns the disposable lease. |
| Forwarded | The existing primary acknowledged queue acceptance. |
| TimedOut | No complete acknowledgement arrived before the deadline. Do not start a second primary. |
| Rejected | Request data is invalid, too large, or the primary queue cannot accept it. |
| Unsupported | The target or required user runtime context is unavailable. |
| Failed | An OS operation failed. Error contains bounded detail. |

A lost acknowledgement does not prove that the primary ignored the request.
The package does not resend an accepted or unacknowledged request.
Closing the last window still ends `Run`. The lease does not add a background application lifetime.

## Platform scope

| Platform | Instance namespace |
| --- | --- |
| Windows | Current user and Windows session. |
| macOS | Current user and login session. |
| Linux Wayland | The private `XDG_RUNTIME_DIR`. Overlapping logins can share this directory. |
| Android | Unsupported. Activity and task reuse are OS policy. |

Local pipes check the peer's user identity. There is no cross-machine forwarding.
The election lease, not a leftover endpoint file, determines ownership.
An exited process releases ownership. Empty lease files may remain in the user runtime directory.

Requests retain at most 4096 arguments and 4096 document URIs.
Text is limited to 64 KiB per UTF-8 string and 1 MiB per request.
The versioned wire frame is bounded to 2 MiB. Each connected client has three seconds to complete its exchange.

## Desktop associations

`ActivationArguments.Read` recognizes these leading flags:

| Arguments | Result |
| --- | --- |
| `--goo-open-uri <absolute-uri>` | One OpenUri request. |
| `--goo-open-documents <uri-or-path>...` | One OpenDocuments batch. Relative paths use the captured working directory. |
| `--goo-notification <private-uri>` | One Notification request. |
| Other argument values | One Launch request with the original values. |

Association input allows 64 KiB per UTF-8 string and 1 MiB total text, including the leading flag.
Malformed or oversized association data returns Rejected. It does not start a different activation route.
The OS can normalize URI text before launch. Route with URI fields, not byte-for-byte input comparisons.
Apps own document access, window selection and requests to raise a window.

Use a separate private notification scheme with this URI format:

```text
example-notify://goo-notification/activate?id=job-42&action=open&data=record-42
```

Escape each field as URI data. All three fields are required and may be empty.
Unknown or repeated notification fields return Rejected.
Register the private scheme with `--goo-notification`, not `--goo-open-uri`.

### Windows

The app's installer owns its associations. Quote the executable and each substituted argument.
Do not invoke a command shell.

| Per-user registry key under `HKCU\Software\Classes` | Value |
| --- | --- |
| `example` | Default value `URL:Example`, plus an empty `URL Protocol` string. |
| `example\shell\open\command` | `"C:\Program Files\Example\Example.exe" --goo-open-uri "%1"` |
| `.example` | Default value `Example.Document`. |
| `Example.Document\shell\open\command` | `"C:\Program Files\Example\Example.exe" --goo-open-documents "%1"` |

A cold shell launch initializes the typed request. A warm launch forwards it to the primary.
Keep user-selected default handlers under OS control.

### macOS

Declare the app's schemes in `CFBundleURLTypes`.
Declare document types and UTIs in `CFBundleDocumentTypes` and `UTExportedTypeDeclarations` as needed.
Use the stable application ID as `CFBundleIdentifier`.

LaunchServices delivers these requests directly to the shared Window event.
Goo retains cold launches and multi-document batches. Do not parse a second copy of a native request from CLI arguments.
The single-instance package initializes native activation before election on macOS.
A forced new process forwards its retained native URI requests or document batch before it exits.

### Linux Wayland

Install a normal document entry as `org.example.App.desktop`:

```ini
[Desktop Entry]
Type=Application
Name=Example
Exec=/opt/example/Example --goo-open-documents %U
Icon=org.example.App
MimeType=application/x-example-document;
Terminal=false
```

Install a separate hidden scheme handler as `org.example.App.Links.desktop`:

```ini
[Desktop Entry]
Type=Application
Name=Example links
Exec=/opt/example/Example --goo-open-uri %u
Icon=org.example.App
MimeType=x-scheme-handler/example;
NoDisplay=true
Terminal=false
```

The separate commands retain URI intent without guessing from document schemes.
Both processes use the same application ID for single-instance acquisition.
Install the app's MIME definitions and refresh the desktop and MIME databases.
Use OS settings for the user's default-handler choice.

Forwarding retains the launcher's Wayland activation token without changing the primary's environment.
Call `RequestActivation` on the selected window from the activation handler to use that token.
The compositor decides whether to grant focus.

### Android

Use GooActivity Intent activation, not desktop CLI flags.
Cold and warm VIEW or document requests use the same Window event.
Provider document URIs remain URIs and do not become filesystem paths.

