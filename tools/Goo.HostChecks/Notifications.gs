import System
import System.Collections.Generic
import System.Diagnostics
import System.IO
import System.Linq
import System.Threading
import System.Xml.Linq

class Notifications {
    shared {
        const Executable string = "Goo.Notifications.Smoke"

        public func MacOs(arguments[]string) {
            HostChecks.Require(arguments.Length >= 2, "expected PUBLISH OUTPUT")
            let publish = Path.GetFullPath(arguments[0])
            let root = Path.GetFullPath(arguments[1])
            HostChecks.Require(Directory.Exists(publish), "publish directory does not exist: " + publish)
            HostChecks.Require(!Directory.Exists(root) && !File.Exists(root), "output already exists: " + root)
            Directory.CreateDirectory(root)
            HostChecks.Run([]string{Path.Combine(publish, Executable), "missing"}, 40)
            let plist = XDocument.Load(Path.Combine(HostChecks.Root, "tests/Goo.PackageSmoke/Info.plist"))
            let dictionary = plist.Root!!.Element("dict")!!
            for key in[]string{"CFBundleURLTypes", "CFBundleDocumentTypes", "UTExportedTypeDeclarations"} {
                let item = dictionary.Elements("key").FirstOrDefault(x -> x.Value == key)
                if item != nil {
                    item.ElementsAfterSelf().First().Remove()
                    item.Remove()
                }
            }
            let values = Dictionary[string, string]()
            values["CFBundleIdentifier"] = "org.goo.notifications.smoke"
            values["CFBundleExecutable"] = Executable
            values["CFBundleName"] = Executable
            values["CFBundleDisplayName"] = "Goo notification smoke"
            for entry in values {
                let item = dictionary.Elements("key").FirstOrDefault(x -> x.Value == entry.Key)
                if item != nil {
                    item.ElementsAfterSelf().First().ReplaceWith(XElement("string", entry.Value))
                } else {
                    dictionary.Add(XElement("key", entry.Key), XElement("string", entry.Value))
                }
            }
            let path = Path.Combine(root, "Info.plist")
            plist.Save(path)
            let app = Path.Combine(root, Executable + ".app")
            HostChecks.Run(
                []string{
                    "bash",
                    ".github/scripts/stage-macos-arm64.sh",
                    publish,
                    app,
                    Path.Combine(root, "symbols"),
                    Executable,
                    path
                },
                60
            )
            HostChecks.Run([]string{Path.Combine(app, "Contents/MacOS", Executable), "macos"}, 100)
            Console.WriteLine(
                "macOS notifications: missing identity and native permission, completion, presence and removal checks passed"
            )
        }

        public func Wayland(arguments[]string) {
            HostChecks.Require(arguments.Length >= 2, "expected PROGRAM OUTPUT")
            let program = Path.GetFullPath(arguments[0])
            let root = Path.GetFullPath(arguments[1])
            HostChecks.Require(File.Exists(program), "program does not exist: " + program)
            HostChecks.Require(!Directory.Exists(root) && !File.Exists(root), "output already exists: " + root)
            Directory.CreateDirectory(root)
            let environment = Dictionary[string, string]()
            for entry in[]string{"XDG_CACHE_HOME:cache", "XDG_CONFIG_HOME:config", "XDG_DATA_HOME:data"} {
                let fields = entry.Split(':')
                let path = Path.Combine(root, fields[1])
                Directory.CreateDirectory(path)
                environment[fields[0]] = path
            }
            let command = if Path.GetExtension(program) == ".dll" {
                []string{"dotnet", program}
            } else {
                []string{program}
            }
            using let daemon = LoggedProcess(
                []string{"mako", "--config", "/dev/null"},
                Path.Combine(root, "mako.log"),
                environment: environment
            )
            try {
                let deadline = Stopwatch.StartNew()
                while true {
                    HostChecks.Require(!daemon.Process.HasExited, "The native Wayland notification daemon exited")
                    if HostChecks.Run([]string{"makoctl", "list"}, 3, environment, false).Code == 0 {
                        break
                    }
                    HostChecks.Require(
                        deadline.Elapsed.TotalSeconds < 15,
                        "The native notification daemon did not acquire its D-Bus service"
                    )
                    Thread.Sleep(50)
                }
                using let child = LoggedProcess(
                    command.Concat([]string{"linux", root}).ToArray(),
                    Path.Combine(root, "smoke.log"),
                    environment: environment
                )
                deadline.Restart()
                while !File.Exists(Path.Combine(root, "ready")) {
                    if child.Process.HasExited {
                        throw InvalidOperationException("Notification proof exited ${child.Process.ExitCode}")
                    }
                    HostChecks.Require(deadline.Elapsed.TotalSeconds < 40, "Native notification submission timed out")
                    Thread.Sleep(20)
                }
                HostChecks.Run([]string{"makoctl", "invoke", "default"}, 10, environment)
                child.Wait(40)
                HostChecks.Require(child.Process.ExitCode == 0, "Notification proof exited ${child.Process.ExitCode}")
                Console.WriteLine(File.ReadAllText(Path.Combine(root, "smoke.log")))
                Console.WriteLine(
                    "Wayland notifications: native replacement, action, UI-thread activation and removal passed"
                )
            } catch {
                Console.Error.WriteLine(File.ReadAllText(Path.Combine(root, "mako.log")))
                let log = Path.Combine(root, "smoke.log")
                if File.Exists(log) {
                    Console.Error.WriteLine(File.ReadAllText(log))
                }
                rethrow
            } finally {
                if !daemon.Process.HasExited {
                    HostChecks.Run([]string{"kill", "-TERM", daemon.Process.Id.ToString()}, required: false)
                    if !daemon.Process.WaitForExit(10000) {
                        HostChecks.Stop(daemon.Process)
                    }
                }
            }
        }
    }
}
