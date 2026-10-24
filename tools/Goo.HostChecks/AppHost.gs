import System
import System.IO
import System.Linq

internal partial class Host {
    private func Case(name string) string {
        let output = Path.Combine(Root, name)
        Directory.CreateDirectory(output)
        return output
    }

    private func Launch(mode string, identity string, output string, tag string = "", directory string = "") Child {
        var arguments = []string{mode, identity, "--output=" + output}
        if tag != "" {
            arguments = arguments.Concat([]string{tag}).ToArray()
        }
        let child = Child(
            Command(arguments),
            if directory == "" {
                output
            } else {
                directory
            },
            EnvironmentValues
        )
        Children.Add(child)
        return child
    }

    internal func AppHost() {
        Runtime()
        let output = Case("forward")
        let identity = "org.goo.tests." + Guid.NewGuid().ToString("N")
        let sender = Path.Combine(output, "sender cwd")
        let receiver = Path.Combine(output, "receiver cwd")
        Directory.CreateDirectory(sender)
        Directory.CreateDirectory(receiver)
        let primary = Launch("primary", identity, output, directory: receiver)
        WaitFile(Path.Combine(output, "primary.ready"), 25, primary, interval: 10)
        Launch("secondary", identity, output, directory: sender).Complete(30)
        WaitFile(Path.Combine(output, "closed.ready"), 25, primary, interval: 10)
        Launch("closed", identity, output, directory: sender).Complete(30)
        primary.Complete(30)
        HostChecks.Require(File.Exists(Path.Combine(output, "passed")), "Activation checks did not finish")
        Console.WriteLine(
            "single-instance: arguments, URI, documents, notification, UI thread and queue rejection passed"
        )
        Election()
        let timeout = Case("timeout")
        let timeoutIdentity = "org.goo.tests." + Guid.NewGuid().ToString("N")
        let stalled = Launch("stall", timeoutIdentity, timeout)
        WaitFile(Path.Combine(timeout, "stall.ready"), 25, stalled, interval: 10)
        Launch("timeout", timeoutIdentity, timeout).Complete(30)
        Touch(Path.Combine(timeout, "stop"))
        stalled.Complete(30)
        Console.WriteLine("single-instance: missing endpoint timed out without another primary")
        let restart = Case("restart")
        let restartIdentity = "org.goo.tests." + Guid.NewGuid().ToString("N")
        let first = Launch("hold", restartIdentity, restart, "first")
        WaitFile(Path.Combine(restart, "first.ready"), 25, first, interval: 10)
        HostChecks.Stop(first.Process, 10)
        let second = Launch("hold", restartIdentity, restart, "second")
        WaitFile(Path.Combine(restart, "second.ready"), 25, second, interval: 10)
        Touch(Path.Combine(restart, "stop"))
        second.Complete(30)
        Console.WriteLine("single-instance: exited owner and stale endpoint recovered")
        if OperatingSystem.IsLinux() {
            let unsupported = Case("unsupported")
            Launch("unsupported", "org.goo.tests." + Guid.NewGuid().ToString("N"), unsupported).Complete(30)
            Console.WriteLine("single-instance: missing runtime context returned Unsupported")
        }
    }

    private func Election() {
        let output = Case("election")
        let identity = "org.goo.tests." + Guid.NewGuid().ToString("N")
        let first = Launch("elect", identity, output, "one")
        let second = Launch("elect", identity, output, "two")
        Touch(Path.Combine(output, "start"))
        WaitFile(Path.Combine(output, "one.status"), 25, first, interval: 10)
        WaitFile(Path.Combine(output, "two.status"), 25, second, interval: 10)
        let statuses = []string{
            File.ReadAllText(Path.Combine(output, "one.status")),
            File.ReadAllText(Path.Combine(output, "two.status"))
        }
            .OrderBy(s -> s).ToArray()
        HostChecks.Require(
            statuses.SequenceEqual([]string{"Forwarded", "Primary"}),
            "Concurrent ownership changed: " + string.Join(", ", statuses)
        )
        Touch(Path.Combine(output, "stop"))
        first.Complete(30)
        second.Complete(30)
        Console.WriteLine("single-instance: concurrent launches elected one primary")
    }

    internal func Placement() {
        let states = []string{"normal", "max", "full"}
        for state in states {
            HostChecks.Run(Command([]string{"placement", "native", "--output=" + Root, state}), 60)
        }
    }
}
