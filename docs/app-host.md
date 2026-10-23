# Application hosting

```gsharp
import Goo
import System

func Main() {
    Window.ConfigureApplication("Example", "1.0", "org.example.App")
    Window.ApplicationActivated += (request) -> {
        Console.WriteLine(String.Join(" | ", request.Arguments))
    }
    let initial = ApplicationActivation{
        IsInitial: true,
        Arguments: Environment.GetCommandLineArgs(),
        WorkingDirectory: Environment.CurrentDirectory,
    }
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
- `Environment.GetCommandLineArgs()` includes the executable. Pass only the values the app wants to forward.
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
