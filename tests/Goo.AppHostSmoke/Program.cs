using System.Diagnostics;
using System.IO.Pipes;
using System.Reflection;
using Goo;

internal static class Program
{
    private static readonly string[] ExpectedArguments = ["", "two words", "\"quoted\"", "λ😀", "a\\b"];
    private const string Link = "goo-instance-test://route/%CE%BB";
    private const string Document = "content://org.goo.test/document/λ";
    private const string NativeToken = "goo-instance-token-λ";

    private static int Main(string[] args)
    {
        if (args.Length < 3) throw new ArgumentException("mode, identity and output directory are required");
        string mode = args[0], identity = args[1], root = Path.GetFullPath(args[2]);
        string tag = args.Length == 4 ? args[3] : mode;
        if (mode == "activated") { RunActivated(identity, root, args[3..]); return 0; }
        if (mode == "secondary") { Send(identity, root); return 0; }
        if (mode == "closed")
        {
            Require(Acquire(identity, new()).Status == SingleInstanceStatus.Rejected, "Closed queue was accepted");
            File.WriteAllText(Path.Combine(root, "closed.done"), "passed");
            return 0;
        }
        if (mode == "timeout")
        {
            var result = SingleInstance.AcquireAsync(identity, new(), 200).GetAwaiter().GetResult();
            Require(result.Status == SingleInstanceStatus.TimedOut && result.Lease is null, "Timeout elected another primary");
            return 0;
        }
        if (mode == "unsupported")
        {
            Environment.SetEnvironmentVariable("XDG_RUNTIME_DIR", "");
            Require(Acquire(identity, new()).Status == SingleInstanceStatus.Unsupported, "Missing runtime context was accepted");
            return 0;
        }
        var initial = new ApplicationActivation { IsInitial = true, WorkingDirectory = Environment.CurrentDirectory };
        Require(Window.InitializeApplicationActivation(initial) == WindowOperationResult.Accepted, "Initialization failed");
        if (mode == "elect") WaitFor(Path.Combine(root, "start"));
        var election = Acquire(identity, initial);
        File.WriteAllText(Path.Combine(root, tag + ".status"), election.Status.ToString());
        if (election.Status == SingleInstanceStatus.Forwarded) return 0;
        Require(election.Status == SingleInstanceStatus.Primary && election.Lease is not null, election.Status + ": " + election.Error);
        using var lease = election.Lease!;
        if (mode == "stall")
        {
            var implementation = Type.GetType("Goo.InstancePipe, Goo.AppHost", throwOnError: true)!;
            var pipe = (NamedPipeServerStream)implementation.GetField("pipe", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(lease)!;
            pipe.Dispose();
        }
        File.WriteAllText(Path.Combine(root, tag + ".ready"), "ready");
        if (mode != "primary") { WaitFor(Path.Combine(root, "stop")); return 0; }
        var received = new List<ApplicationActivation>();
        int owner = Environment.CurrentManagedThreadId;
        var currentToken = typeof(Window).GetProperty("CurrentActivationToken", BindingFlags.Static | BindingFlags.NonPublic)!;
        Action<ApplicationActivation> handler = value =>
        {
            Require(Environment.CurrentManagedThreadId == owner, "Activation left the owner thread");
            Require((string?)currentToken.GetValue(null) == (!value.IsInitial && OperatingSystem.IsLinux() ? NativeToken : null),
                "Native activation token changed");
            received.Add(value);
        };
        Window.ApplicationActivated += handler;
        try
        {
            WaitFor(Path.Combine(root, "send.done"));
            typeof(Window).GetMethod("DrainApplicationActivations", BindingFlags.Static | BindingFlags.NonPublic)!.Invoke(null, null);
            Require(currentToken.GetValue(null) is null, "Native activation token escaped its callback");
            Verify(received, root);
            typeof(Window).GetMethod("CloseApplicationActivations", BindingFlags.Static | BindingFlags.NonPublic)!.Invoke(null, null);
            File.WriteAllText(Path.Combine(root, "closed.ready"), "ready");
            WaitFor(Path.Combine(root, "closed.done"));
        }
        finally { Window.ApplicationActivated -= handler; }
        File.WriteAllText(Path.Combine(root, "passed"), "passed");
        return 0;
    }

    private static SingleInstanceResult Acquire(string identity, ApplicationActivation value) =>
        SingleInstance.AcquireAsync(identity, value).GetAwaiter().GetResult();

    private static ApplicationActivation Parsed(string[] arguments, string directory)
    {
        var result = ActivationArguments.Read(arguments, directory);
        Require(result.Status == ActivationReadStatus.Accepted && result.Activation is not null, result.Error);
        return result.Activation!;
    }

    private static void Send(string identity, string root)
    {
        if (OperatingSystem.IsLinux()) Environment.SetEnvironmentVariable("XDG_ACTIVATION_TOKEN", NativeToken);
        string[] arguments = (string[])ExpectedArguments.Clone();
        string directory = Environment.CurrentDirectory;
        ApplicationActivation[] requests =
        [
            Parsed(arguments, directory),
            Parsed(["--goo-open-uri", Link], directory),
            Parsed(["--goo-open-documents", "one file.txt", Document], directory),
            Parsed(["--goo-notification", "example-private://goo-notification/activate?id=notice&action=open&data=opaque%20%CE%BB"], directory),
        ];
        foreach (var request in requests)
        {
            var result = Acquire(identity, request);
            Require(result.Status == SingleInstanceStatus.Forwarded && result.Lease is null, result.Status + ": " + result.Error);
        }
        arguments[1] = "changed after forwarding";
        var tooLarge = Acquire(identity, new() { Arguments = [new string('x', 65537)] });
        Require(tooLarge.Status == SingleInstanceStatus.Rejected, "Oversized request was accepted");
        if (OperatingSystem.IsLinux())
        {
            Environment.SetEnvironmentVariable("XDG_ACTIVATION_TOKEN", new string('x', 65516));
            Require(Acquire(identity, new()).Status == SingleInstanceStatus.Rejected, "Oversized native token was accepted");
            Environment.SetEnvironmentVariable("XDG_ACTIVATION_TOKEN", NativeToken);
        }
        foreach (string[] invalid in new string[][] {
            ["--goo-open-uri", "relative.txt"], ["--goo-open-documents"],
            ["--goo-notification", "example-private://wrong/activate?id=n&action=&data="],
            ["--goo-notification", "example-private://goo-notification/activate?id=n&id=n&action=&data="],
            [new string('x', 65537)],
        })
        {
            var rejected = ActivationArguments.Read(invalid, directory);
            Require(rejected.Status == ActivationReadStatus.Rejected && rejected.Activation is null, "Invalid startup data was accepted");
        }
        File.WriteAllText(Path.Combine(root, "send.done"), "passed");
    }

    private static void Verify(List<ApplicationActivation> received, string root)
    {
        Require(received.Count == 5, "Activation count changed");
        Require(received[0].Kind == ApplicationActivationKind.Launch && received[0].IsInitial, "Initial launch changed");
        var forwarded = received[1];
        Require(forwarded.Kind == ApplicationActivationKind.Arguments && forwarded.Arguments.SequenceEqual(ExpectedArguments), "Arguments changed");
        Require(received[2].Kind == ApplicationActivationKind.OpenUri && received[2].Target?.OriginalString == Link, "URI changed");
        var documents = received[3];
        Require(documents.Kind == ApplicationActivationKind.OpenDocuments && documents.Documents.Count == 2, "Document batch changed");
        Require(documents.Documents[0].LocalPath == Path.Combine(root, "sender cwd", "one file.txt")
            && documents.Documents[1].OriginalString == Document, "Document URI changed");
        var notification = received[4];
        Require(notification.Kind == ApplicationActivationKind.Notification && notification.NotificationId == "notice"
            && notification.ActionId == "open" && notification.Payload == "opaque λ", "Notification data changed");
        foreach (var request in received.Skip(1))
        {
            Require(!request.IsInitial && request.WorkingDirectory == Path.Combine(root, "sender cwd"), "Forwarded context changed");
        }
        Require(Environment.CurrentDirectory == Path.Combine(root, "receiver cwd"), "Receiver directory changed");
    }

    private static void RunActivated(string identity, string root, string[] arguments)
    {
        int owner = Environment.CurrentManagedThreadId, count = 0;
        bool nativeWayland = OperatingSystem.IsLinux() && Environment.GetEnvironmentVariable("GOO_ACTIVATION_NATIVE_WINDOW") == "1";
        Window? native = null;
        Action<ApplicationActivation> handler = value =>
        {
            Require(Environment.CurrentManagedThreadId == owner, "Native activation left the owner thread");
            if (native is not null && value.Kind != ApplicationActivationKind.Launch)
                Require(native.RequestActivation() == WindowOperationResult.Accepted, "Native activation request failed");
            if (nativeWayland)
                Require(Environment.GetEnvironmentVariable("XDG_ACTIVATION_TOKEN") is null, "Forwarding changed the receiver environment");
            string target = value.Kind == ApplicationActivationKind.OpenDocuments
                ? value.Documents[0].LocalPath : value.Target?.OriginalString ?? "";
            string path = Path.Combine(root, (++count) + ".event");
            if (value.Kind == ApplicationActivationKind.OpenDocuments)
                File.WriteAllLines(Path.Combine(root, count + ".documents"), value.Documents.Select(uri => uri.AbsoluteUri));
            File.WriteAllLines(path + ".new", [value.Kind.ToString(), value.IsInitial ? "initial" : "warm", target]);
            File.Move(path + ".new", path);
        };
        Window.ApplicationActivated += handler;
        try
        {
            var initial = Parsed(arguments, Environment.CurrentDirectory);
            Require(Window.InitializeApplicationActivation(initial) == WindowOperationResult.Accepted, "Native initialization failed");
            var result = Acquire(identity, initial);
            if (result.Status == SingleInstanceStatus.Forwarded) return;
            Require(result.Status == SingleInstanceStatus.Primary && result.Lease is not null, result.Status + ": " + result.Error);
            using (result.Lease!)
            {
                if (OperatingSystem.IsMacOS() || nativeWayland)
                    native = new Window { Width = 160, Height = 100, Root = new Cell() }.Open();
                File.WriteAllText(Path.Combine(root, "pid"), Environment.ProcessId.ToString());
                var drain = typeof(Window).GetMethod("DrainApplicationActivations", BindingFlags.Static | BindingFlags.NonPublic)!;
                string stop = Path.Combine(root, "stop");
                long deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 40;
                while (!File.Exists(stop) && Stopwatch.GetTimestamp() < deadline)
                {
                    if (native is null) drain.Invoke(null, null);
                    else native.Pump(0.005);
                    Thread.Sleep(5);
                }
                Require(File.Exists(stop), "Native activation did not stop");
                if (native is not null) { native.RequestClose(); native.Pump(0); }
            }
            File.WriteAllText(Path.Combine(root, "exited"), "passed");
        }
        catch (Exception error) { File.WriteAllText(Path.Combine(root, "error"), error.ToString()); throw; }
        finally { Window.ApplicationActivated -= handler; }
    }

    private static void WaitFor(string path)
    {
        long deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 20;
        while (!File.Exists(path))
        {
            if (Stopwatch.GetTimestamp() >= deadline) throw new TimeoutException(Path.GetFileName(path));
            Thread.Sleep(10);
        }
    }

    private static void Require(bool value, string message)
    {
        if (!value) throw new InvalidOperationException(message);
    }
}
