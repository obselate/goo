import System
import System.IO
import System.Linq
import System.Xml.Linq

internal partial class Host {
    private func MacMarker(name string) {
        let timer = System.Diagnostics.Stopwatch.StartNew()
        while timer.Elapsed.TotalSeconds < 45 {
            let error = Path.Combine(Root, "error.txt")
            if File.Exists(error) {
                throw InvalidOperationException(File.ReadAllText(error))
            }
            let path = Path.Combine(Root, name)
            if File.Exists(path) {
                Require(File.ReadAllText(path) == "passed", "Unexpected activation result: " + name)
                return
            }
            System.Threading.Thread.Sleep(50)
        }
        throw TimeoutException("Native activation did not complete: " + name)
    }

    internal func Macos() {
        let one = Path.Combine(Root, "one document.gooactivation")
        let two = Path.Combine(Root, "two document.gooactivation")
        File.WriteAllText(one, "one")
        File.WriteAllText(two, "two")
        try {
            Run(
                []string{
                    "open",
                    "-n",
                    "-a",
                    Program,
                    "goo-activation-smoke://cold",
                    "--args",
                    "--application-activation-smoke",
                    Root
                },
                15
            )
            MacMarker("cold.txt")
            Run([]string{"open", "-a", Program, "goo-activation-smoke://warm"}, 15)
            MacMarker("warm.txt")
            Run([]string{"open", "-a", Program, one, two}, 15)
            MacMarker("documents.txt")
            MacMarker("passed.txt")
            Console.WriteLine("macOS activation: cold URI, warm URI and document batch passed")
        } finally {
            if !File.Exists(Path.Combine(Root, "passed.txt")) {
                SignalOwned(Path.Combine(Root, "pid.txt"), Path.Combine(Program, "Contents/MacOS/Goo.PackageSmoke"), "")
            }
        }
    }

    private func SignalOwned(pidFile string, executable string, session string) {
        if !File.Exists(pidFile) {
            return
        }
        let pid = int32.Parse(File.ReadAllText(pidFile)).ToString()
        let inspect = Start([]string{"ps", "-p", pid, "-o", "command="})
        Require(inspect.Process.WaitForExit(15000), "Could not inspect activation process")
        let command = inspect.Text()
        if command.Contains(executable) && (session.Length == 0 || command.Contains(session)) {
            let signal = Start([]string{"kill", "-TERM", pid})
            Require(signal.Process.WaitForExit(15000), "Could not stop activation process")
            if signal.Process.ExitCode != 0 {
                let remaining = Start([]string{"ps", "-p", pid, "-o", "command="})
                Require(remaining.Process.WaitForExit(15000), "Could not inspect activation process")
                Require(remaining.Process.ExitCode != 0, signal.Text())
            }
        }
    }

    private func PlistValue(dictionary XElement, key string) XElement -> dictionary
        .Elements("key")
        .Single(k -> k.Value == key)
        .ElementsAfterSelf()
        .First()

    private func SetPlist(dictionary XElement, key string, value XElement) {
        PlistValue(dictionary, key).ReplaceWith(value)
    }

    internal func MacosHost() {
        let session = Path.Combine(Root, "session")
        Directory.CreateDirectory(session)
        let identity = "org.goo.host." + Guid.NewGuid().ToString("N")
        let scheme = "goo-host-" + Guid.NewGuid().ToString("N")
        let extension = "goohost" + Guid.NewGuid().ToString("N")
        let app = Path.Combine(Root, "Goo.AppHostSmoke.app")
        let plist = XDocument.Load("tests/Goo.PackageSmoke/Info.plist")
        let dictionary = plist.Root!!.Element("dict")!!
        SetPlist(dictionary, "CFBundleIdentifier", XElement("string", identity))
        SetPlist(dictionary, "CFBundleExecutable", XElement("string", "Goo.AppHostSmoke"))
        SetPlist(dictionary, "CFBundleName", XElement("string", "Goo.AppHostSmoke"))
        SetPlist(dictionary, "CFBundleDisplayName", XElement("string", "Goo AppHost Smoke"))
        SetPlist(
            dictionary,
            "CFBundleURLTypes",
            XElement(
                "array",
                XElement(
                    "dict",
                    XElement("key", "CFBundleURLName"),
                    XElement("string", identity),
                    XElement("key", "CFBundleURLSchemes"),
                    XElement("array", XElement("string", scheme))
                )
            )
        )
        let documents = PlistValue(dictionary, "CFBundleDocumentTypes").Element("dict")!!
        SetPlist(documents, "LSItemContentTypes", XElement("array", XElement("string", identity + ".document")))
        let exported = PlistValue(dictionary, "UTExportedTypeDeclarations").Element("dict")!!
        SetPlist(exported, "UTTypeIdentifier", XElement("string", identity + ".document"))
        SetPlist(
            exported,
            "UTTypeTagSpecification",
            XElement(
                "dict",
                XElement("key", "public.filename-extension"),
                XElement("array", XElement("string", extension))
            )
        )
        let plistPath = Path.Combine(Root, "Info.plist")
        if let documentType = plist.DocumentType {
            documentType.InternalSubset = nil
        }
        plist.Save(plistPath)
        Run(
            []string{
                "bash",
                ".github/scripts/stage-macos-arm64.sh",
                Program,
                app,
                Path.Combine(Root, "symbols"),
                "Goo.AppHostSmoke",
                plistPath
            },
            60
        )
        let one = Path.Combine(Root, "one document." + extension)
        let two = Path.Combine(Root, "two document." + extension)
        File.WriteAllText(one, "one")
        File.WriteAllText(two, "two")
        try {
            OpenMac(app, session, identity, []string{scheme + "://cold/route"}, true)
            Observed(session, 1, "OpenUri", true, scheme + "://cold/route", 30)
            OpenMac(app, session, identity, []string{scheme + "://warm/route"})
            Observed(session, 2, "OpenUri", false, scheme + "://warm/route", 30)
            let forwarded = System.Collections.Generic.List[string]()
            var index = 3
            for suffix in[]string{"one", "two"} {
                OpenMac(app, session, identity, []string{scheme + "://forwarded/" + suffix}, true)
                let path = WaitFile(Path.Combine(session, "$index.event"), 30, error: Path.Combine(session, "error"))
                let lines = File.ReadAllLines(path)
                Require(
                    lines.Length >= 3 && lines[0] == "OpenUri" && lines[1] == "warm",
                    "Forwarded native activation changed: " + string.Join(", ", lines)
                )
                forwarded.Add(lines[2])
                index++
            }
            Require(
                forwarded.OrderBy(s -> s).SequenceEqual(
                    []string{scheme + "://forwarded/one", scheme + "://forwarded/two"}
                ),
                "Forwarded URI batch changed"
            )
            OpenMac(app, session, identity, []string{one, two})
            MacDocuments(session, 5, false, one, two)
            Touch(Path.Combine(session, "stop"))
            WaitFile(Path.Combine(session, "exited"), 30, error: Path.Combine(session, "error"))
            for file in Directory.GetFileSystemEntries(session) {
                File.Delete(file)
            }
            OpenMac(app, session, identity, []string{one, two}, true)
            MacDocuments(session, 1, true, one, two)
            Touch(Path.Combine(session, "stop"))
            WaitFile(Path.Combine(session, "exited"), 30, error: Path.Combine(session, "error"))
            Console.WriteLine(
                "macOS app-host: cold/warm URI, forced new-instance forwarding and cold/warm document batches passed"
            )
        } finally {
            Touch(Path.Combine(session, "stop"))
            if !File.Exists(Path.Combine(session, "exited")) {
                SignalOwned(Path.Combine(session, "pid"), Path.Combine(app, "Contents/MacOS/Goo.AppHostSmoke"), session)
            }
        }
    }

    private func OpenMac(app string, session string, identity string, targets[]string, fresh bool = false) {
        let args = System.Collections.Generic.List[string]{"open"}
        if fresh {
            args.Add("-n")
        }
        args.AddRange([]string{"-a", app})
        args.AddRange(targets)
        if fresh {
            args.AddRange([]string{"--args", "activated", identity, "--output=" + session})
        }
        Run(args.ToArray(), 15)
    }

    private func MacDocuments(session string, index int32, initial bool, one string, two string) {
        Observed(session, index, "OpenDocuments", initial, one, 30)
        let file = WaitFile(Path.Combine(session, "$index.documents"), 30, error: Path.Combine(session, "error"))
        Require(
            File.ReadAllLines(file).SequenceEqual([]string{Uri(one).AbsoluteUri, Uri(two).AbsoluteUri}),
            "Native document batch changed"
        )
    }
}
