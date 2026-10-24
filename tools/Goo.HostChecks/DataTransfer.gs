import System
import System.Collections.Generic
import System.Diagnostics
import System.IO
import System.Linq
import System.Threading

class DataTransfer {
    shared {
        public func Run(arguments[]string) {
            HostChecks.Require(arguments.Length >= 2, "expected APPLICATION OUTPUT")
            let application = Path.GetFullPath(arguments[0])
            let output = Path.GetFullPath(arguments[1])
            Directory.CreateDirectory(output)
            let peer = BuildPeer(output)
            let png = Path.Combine(Path.GetDirectoryName(application)!!, "local-rgba.png")
            HostChecks.Require(File.Exists(png), "The native PNG fixture is missing")
            for (name, role, effect, kind, reject, cancel) in[](string, string, int32, string, bool, bool){
                ("out-copy", "source", 1, "mime", false, false),
                ("out-move", "source", 2, "mime", false, false),
                ("in-copy", "target", 1, "mime", false, false),
                ("in-move", "target", 2, "mime", false, false),
                ("final-reject", "target", 2, "mime", true, false),
                ("source-close", "source", 1, "mime", false, true),
                ("legacy-files", "target", 1, "legacy", false, false),
                ("in-files-copy", "target", 1, "files", false, false),
                ("in-files-move", "target", 2, "files", false, false),
                ("out-files-copy", "source", 1, "files", false, false),
                ("out-files-move", "source", 2, "files", false, false)
            } {
                let directory = Path.Combine(output, name)
                Directory.CreateDirectory(directory)
                for index in 0 ... 2 {
                    File.WriteAllText(Path.Combine(directory, "source-$index.txt"), "native file $index")
                }
                let title = "goo-transfer-${Environment.ProcessId}-$name"
                let environment = Dictionary[string, string]()
                environment["GOO_NATIVE_TRANSFER_SMOKE"] = "1"
                environment["GOO_TRANSFER_TITLE"] = title
                environment["GOO_TRANSFER_DIRECTORY"] = directory
                environment["GOO_TRANSFER_ROLE"] = role
                environment["GOO_TRANSFER_EFFECT"] = effect.ToString()
                environment["GOO_TRANSFER_KIND"] = kind
                environment["GOO_TRANSFER_REJECT"] = if reject {
                    "1"
                } else {
                    "0"
                }
                environment["GOO_TRANSFER_CANCEL"] = if cancel {
                    "1"
                } else {
                    "0"
                }
                try {
                    using let goo = StartFixture([]string{application}, Path.Combine(directory, "goo"), environment)
                    let peerRole = if role == "source" {
                        "target"
                    } else {
                        "source"
                    }
                    using let native = StartFixture(
                        []string{peer, peerRole, "native-" + title, effect.ToString(), kind, directory, png},
                        Path.Combine(directory, "peer")
                    )
                    let sourcePid = if role == "source" {
                        goo.Process.Id
                    } else {
                        native.Process.Id
                    }
                    let targetPid = if role == "source" {
                        native.Process.Id
                    } else {
                        goo.Process.Id
                    }
                    let gesture = HostChecks.Run(
                        []string{
                            peer,
                            "input",
                            sourcePid.ToString(),
                            targetPid.ToString(),
                            if cancel {
                                "1200"
                            } else {
                                "250"
                            }
                        },
                        15,
                        required: false
                    )
                    File.WriteAllText(Path.Combine(directory, "input.stdout"), gesture.Output)
                    File.WriteAllText(Path.Combine(directory, "input.stderr"), gesture.Error)
                    HostChecks.Require(gesture.Code == 0, gesture.Output + gesture.Error)
                    if reject {
                        native.Wait(15)
                        HostChecks.Run([]string{peer, "close", goo.Process.Id.ToString()})
                    }
                    if cancel {
                        HostChecks.Run([]string{peer, "close", native.Process.Id.ToString()})
                    }
                    goo.Wait(15)
                    HostChecks.Require(goo.Process.ExitCode == 0, "A native transfer process failed")
                    native.Wait(15)
                    HostChecks.Require(native.Process.ExitCode == 0, "A native transfer process failed")
                    CheckResult(directory, role, effect, reject, cancel)
                    Console.WriteLine("native-transfer: $name passed")
                } catch {
                    for path in Directory
                        .GetFiles(directory, "*.stdout")
                        .Order(StringComparer.Ordinal)
                        .Concat(Directory.GetFiles(directory, "*.stderr").Order(StringComparer.Ordinal)) {
                        Console.Error.WriteLine(Path.GetFileName(path) + "\n" + File.ReadAllText(path))
                    }
                    rethrow
                }
            }
        }

        func BuildPeer(output string) string {
            let peer = Path.Combine(output, "macos-data-transfer-peer")
            HostChecks.Run(
                []string{
                    "nice",
                    "-n",
                    "10",
                    "clang",
                    "-fobjc-arc",
                    "-mmacosx-version-min=14.0",
                    "-Wall",
                    "-Wextra",
                    "-Werror",
                    "-Wno-deprecated-declarations",
                    "-framework",
                    "Cocoa",
                    "-framework",
                    "CoreGraphics",
                    "-framework",
                    "CoreServices",
                    Path.Combine(HostChecks.Root, "tests/NativeWindow/macos_data_transfer_peer.m"),
                    "-o",
                    peer
                }
            )
            return peer
        }

        func StartFixture(command[]string, prefix string, environment Dictionary[string, string]? = nil) LoggedProcess {
            let child = LoggedProcess(command, prefix + ".stdout", prefix + ".stderr", environment)
            try {
                let deadline = Stopwatch.StartNew()
                while deadline.Elapsed.TotalSeconds < 20 {
                    if File.ReadAllText(prefix + ".stdout").Contains("ready") {
                        return child
                    }
                    HostChecks.Require(
                        !child.Process.HasExited,
                        "Fixture exited before ready: $prefix\n" + File.ReadAllText(prefix + ".stderr")
                    )
                    Thread.Sleep(50)
                }
                throw InvalidOperationException("Fixture did not become ready: $prefix")
            } catch {
                child.Dispose()
                rethrow
            }
        }

        func CheckResult(directory string, role string, effect int32, reject bool, cancel bool) {
            let gooOutput = File.ReadAllText(Path.Combine(directory, "goo.stdout"))
            let nativeOutput = File.ReadAllText(Path.Combine(directory, "peer.stdout"))
            HostChecks.Require(gooOutput.Contains("transfer-pass"), "Goo transfer result is missing")
            if role == "target" {
                let expected = if reject {
                    "source-end 1 0 0"
                } else {
                    "source-end 0 $effect "
                }
                HostChecks.Require(nativeOutput.Contains(expected), "Native source result changed: " + nativeOutput)
            } else if !cancel {
                HostChecks.Require(nativeOutput.Contains("drop-complete $effect"), "Native target result is missing")
            }
        }
    }
}
