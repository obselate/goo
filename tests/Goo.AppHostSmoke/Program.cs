using System.Diagnostics;
using System.IO.Pipes;
using System.Reflection;
using Goo;

internal static class Program
{
    private static readonly string[] ExpectedArguments = ["", "two words", "\"quoted\"", "λ😀", "a\\b"];
    private const string Link = "goo-instance-test://route/%CE%BB";
    private const string Document = "content://org.goo.test/document/λ";

    private static int Main(string[] args)
    {
        if (args.Length < 3) throw new ArgumentException("mode, identity and output directory are required");
        string mode = args[0], identity = args[1], root = Path.GetFullPath(args[2]);
        string tag = args.Length == 4 ? args[3] : mode;
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
        Action<ApplicationActivation> handler = value =>
        {
            Require(Environment.CurrentManagedThreadId == owner, "Activation left the owner thread");
            received.Add(value);
        };
        Window.ApplicationActivated += handler;
        try
        {
            WaitFor(Path.Combine(root, "send.done"));
            typeof(Window).GetMethod("DrainApplicationActivations", BindingFlags.Static | BindingFlags.NonPublic)!.Invoke(null, null);
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

    private static void Send(string identity, string root)
    {
        string[] arguments = (string[])ExpectedArguments.Clone();
        string directory = Environment.CurrentDirectory;
        ApplicationActivation[] requests =
        [
            new() { Kind = ApplicationActivationKind.Launch, IsInitial = true, Arguments = arguments, WorkingDirectory = directory },
            new() { Kind = ApplicationActivationKind.OpenUri, IsInitial = true, Target = new Uri(Link), WorkingDirectory = directory },
            new() { Kind = ApplicationActivationKind.OpenDocuments, IsInitial = true,
                Documents = [new Uri(Path.Combine(directory, "one file.txt")), new Uri(Document)], WorkingDirectory = directory },
            new() { Kind = ApplicationActivationKind.Notification, IsInitial = true,
                NotificationId = "notice", ActionId = "open", Payload = "opaque λ", WorkingDirectory = directory },
        ];
        foreach (var request in requests)
        {
            var result = Acquire(identity, request);
            Require(result.Status == SingleInstanceStatus.Forwarded && result.Lease is null, result.Status + ": " + result.Error);
        }
        arguments[1] = "changed after forwarding";
        var tooLarge = Acquire(identity, new() { Arguments = [new string('x', 65537)] });
        Require(tooLarge.Status == SingleInstanceStatus.Rejected, "Oversized request was accepted");
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
