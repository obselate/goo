import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Text.RegularExpressions

internal partial class Host {
    internal func Wayland() {
        let identity = "org.goo.token." + Guid.NewGuid().ToString("N")
        EnvironmentValues["XDG_ACTIVATION_TOKEN"] = nil
        EnvironmentValues["GOO_ACTIVATION_NATIVE_WINDOW"] = "1"
        EnvironmentValues["WAYLAND_DEBUG"] = "client"
        let log = Path.Combine(Root, "native.log")
        let primary = Start(Command([]string{"activated", identity, "--output=" + Root}))
        var failed = true
        try {
            WaitFile(Path.Combine(Root, "1.event"), 30, primary, Path.Combine(Root, "error"))
            let tokens = []string{"goo-native-token-one", "goo-native-token-two"}
            var index = 2
            for token in tokens {
                let environment = Dictionary[string, string?](EnvironmentValues)
                environment["XDG_ACTIVATION_TOKEN"] = token
                Run(
                    Command(
                        []string{
                            "activated",
                            identity,
                            "--output=" + Root,
                            "--goo-open-uri",
                            "goo-token-test://route/$index"
                        }
                    ),
                    15,
                    environment,
                    capture: true
                )
                let path = WaitFile(Path.Combine(Root, "$index.event"), 30, primary, Path.Combine(Root, "error"))
                let lines = File.ReadAllLines(path)
                Require(
                    lines.SequenceEqual([]string{"OpenUri", "warm", "goo-token-test://route/$index"}),
                    "Native token activation changed: " + string.Join(", ", lines)
                )
                index++
            }
            Touch(Path.Combine(Root, "stop"))
            primary.Complete(15)
            failed = false
        } finally {
            primary.Stop()
            let text = string.Concat(Children.Select(child -> child.Text()))
            File.WriteAllText(log, text)
            if failed {
                Console.Error.WriteLine(text)
            }
        }
        let trace = File.ReadAllText(log)
        for token in[]string{"goo-native-token-one", "goo-native-token-two"} {
            if !Regex.IsMatch(trace, `xdg_activation_v1[#@]\d+\.activate\("` + token + `", wl_surface[#@]\d+\)`) {
                Console.Error.WriteLine(trace)
                throw InvalidOperationException("Wayland did not receive token $token. See $log")
            }
        }
        Console.WriteLine("Wayland activation: forwarded tokens reached the compositor on the owner-selected window")
    }
}
