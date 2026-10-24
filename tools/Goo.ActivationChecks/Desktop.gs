import Microsoft.Win32
import System
import System.Collections.Generic
import System.Diagnostics
import System.IO
import System.Linq
import System.Text

internal partial class Host {
    internal func Desktop() {
        Runtime()
        let session = Path.Combine(Root, "s")
        Directory.CreateDirectory(session)
        let identity = "org.goo.activation." + Guid.NewGuid().ToString("N")
        let scheme = "goo-activation-" + Guid.NewGuid().ToString("N")
        let extension = ".gooactivation" + Guid.NewGuid().ToString("N")
        let prefix = Command([]string{"activated", identity, "--output=" + session})
        let document = Path.Combine(session, "one document" + extension)
        File.WriteAllText(document, "activation document")
        let keys = List[string]()
        try {
            if OperatingSystem.IsWindows() {
                let schemeKey = "Software\\Classes\\" + scheme
                let documentKey = "Software\\Classes\\Goo." + Guid.NewGuid().ToString("N")
                let extensionKey = "Software\\Classes\\" + extension
                keys.AddRange([]string{extensionKey, documentKey, schemeKey})
                RegistryValue(schemeKey, "", "URL:Goo activation qualification")
                RegistryValue(schemeKey, "URL Protocol", "")
                RegistryValue(
                    schemeKey + "\\shell\\open\\command",
                    "",
                    string.Join(" ", prefix.Concat([]string{"--goo-open-uri"}).Select(WindowsArgument)) + " \"%1\""
                )
                RegistryValue(extensionKey, "", documentKey.Substring("Software\\Classes\\".Length))
                RegistryValue(
                    documentKey + "\\shell\\open\\command",
                    "",
                    string.Join(" ", prefix.Concat([]string{"--goo-open-documents"}).Select(WindowsArgument)) +
                        " \"%1\""
                )
            } else {
                Require(
                    OperatingSystem.IsLinux(),
                    "This driver qualifies Windows and Linux. macOS uses the signed-bundle driver."
                )
                Executable("gio")
                DesktopFile("links", prefix.Concat([]string{"--goo-open-uri"}).ToArray(), "%u")
                DesktopFile("documents", prefix.Concat([]string{"--goo-open-documents"}).ToArray(), "%U")
            }
            try {
                let cold = scheme + "://cold/%CE%BB"
                let warm = scheme + "://warm/route"
                OpenDesktop("links", cold)
                Observed(session, 1, "OpenUri", true, cold)
                OpenDesktop("links", warm)
                Observed(session, 2, "OpenUri", false, warm)
                OpenDesktop("documents", document)
                Observed(session, 3, "OpenDocuments", false, document)
                Touch(Path.Combine(session, "stop"))
                WaitFile(Path.Combine(session, "exited"), 25, error: Path.Combine(session, "error"), interval: 10)
                for name in[]string{"stop", "exited", "pid", "1.event", "2.event", "3.event"} {
                    File.Delete(Path.Combine(session, name))
                }
                OpenDesktop("documents", document)
                Observed(session, 1, "OpenDocuments", true, document)
                Touch(Path.Combine(session, "stop"))
                WaitFile(Path.Combine(session, "exited"), 25, error: Path.Combine(session, "error"), interval: 10)
                Console.WriteLine(
                    "desktop-activation: native cold/warm URI, cold/warm document and owner-thread delivery passed"
                )
            } finally {
                Touch(Path.Combine(session, "stop"))
                if File.Exists(Path.Combine(session, "pid")) && !File.Exists(Path.Combine(session, "error")) {
                    WaitFile(Path.Combine(session, "exited"), 45, interval: 10)
                }
            }
        } finally {
            if OperatingSystem.IsWindows() {
                for key in keys {
                    Registry.CurrentUser.DeleteSubKeyTree(key, false)
                }
            }
        }
    }

    private func DesktopFile(name string, command[]string, field string) {
        let executable = string.Join(" ", command.Select(DesktopArgument))
        File.WriteAllText(
            Path.Combine(Root, name + ".desktop"),
            "[Desktop Entry]\nType=Application\nName=Goo activation qualification\nTerminal=false\nNoDisplay=true\nExec=" +
                executable +
                " " +
                field +
                "\n"
        )
    }

    private func OpenDesktop(name string, target string) {
        if OperatingSystem.IsWindows() {
            let info = ProcessStartInfo(target)
            info.UseShellExecute = true
            info.Verb = "open"
            using let process = Process.Start(info)
        } else {
            let value = if name == "documents" {
                Uri(target).AbsoluteUri
            } else {
                target
            }
            Run([]string{Executable("gio"), "launch", Path.Combine(Root, name + ".desktop"), value}, 10)
        }
    }

    private func RegistryValue(key string, name string, value string) {
        using let handle = Registry.CurrentUser.CreateSubKey(key, true)
        handle.SetValue(name, value, RegistryValueKind.String)
    }

    private func DesktopArgument(value string) string -> "\"" +
        value
        .Replace("\\", "\\\\")
        .Replace("\"", "\\\"")
        .Replace("$", "\\$")
        .Replace("`", "\\`")
        .Replace("%", "%%") +
        "\""

    private func WindowsArgument(value string) string {
        let quote = value.Length == 0 || value.Contains(' ') || value.Contains('\t')
        let text = StringBuilder()
        if quote {
            text.Append('"')
        }
        var slashes = 0
        for character in value {
            if character == '\\' {
                slashes++
            } else {
                if character == '"' {
                    text.Append('\\', slashes * 2 + 1)
                } else {
                    text.Append('\\', slashes)
                }
                text.Append(character)
                slashes = 0
            }
        }
        text.Append(
            '\\',
            slashes * (
                if quote {
                    2
                } else {
                    1
                }
            )
        )
        if quote {
            text.Append('"')
        }
        return text.ToString()
    }
}
