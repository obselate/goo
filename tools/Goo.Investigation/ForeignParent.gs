import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Text
import System.Text.RegularExpressions

class ForeignParent {
    shared {
        func CheckTrace(trace string) {
            let imports = Regex
                .Matches(trace, `import_toplevel\(new id zxdg_imported_v2#(\d+), "([^"]+)"\)`)
                .Cast[Match]()
                .Where(x -> x.Groups[2].Value != "invalid-foreign-parent-e2e-handle")
                .ToArray()
            Runner.Require(imports.Length >= 4, "Missing foreign-parent lifecycle imports")
            for entry in imports.Take(2) {
                let suffix = trace.Substring(entry.Index + entry.Length)
                let parent = Regex.Match(
                    suffix,
                    `zxdg_imported_v2#` + entry.Groups[1].Value + `\.set_parent_of\(wl_surface#(\d+)\)`
                )
                Runner.Require(parent.Success, "Imported parent was not applied to the child surface")
                let parentPosition = entry.Index + entry.Length + parent.Index
                let surface = parent.Groups[1].Value
                let shells = Regex.Matches(
                    trace.Substring(0, entry.Index),
                    `get_xdg_surface\(new id xdg_surface#\d+, wl_surface#` + surface + `\)`
                )
                Runner.Require(shells.Count > 0, "Child xdg surface was not created before importing")
                let shell = shells[shells.Count - 1]
                let commit = `wl_surface#` + surface + `\.commit\(\)`
                Runner.Require(
                    !Regex.IsMatch(
                        trace.Substring(shell.Index + shell.Length, parentPosition - shell.Index - shell.Length),
                        commit
                    ),
                    "Child was committed before parenting"
                )
                let mapping = Regex.Match(trace.Substring(parentPosition), commit)
                Runner.Require(mapping.Success, "Child surface was not committed")
                let modal = trace.Contains("\"xdg_wm_dialog_v1\"")
                if modal {
                    Runner.Require(
                        Regex.IsMatch(
                            trace.Substring(parentPosition, mapping.Index),
                            `xdg_dialog_v1#\d+\.set_modal\(\)`
                        ),
                        "Modal state was not applied before mapping"
                    )
                }
                if entry == imports[0] {
                    let unlink = trace.IndexOf(
                        "zxdg_imported_v2#${entry.Groups[1].Value}.destroy()",
                        parentPosition,
                        StringComparison.Ordinal
                    )
                    Runner.Require(unlink >= parentPosition, "Foreign parent was not unlinked")
                    let lifetime = trace.Substring(parentPosition, unlink - parentPosition)
                    Runner.Require(
                        Regex.IsMatch(lifetime, `xdg_toplevel#\d+\.destroy\(\)`),
                        "Foreign parent was unlinked before destroying the toplevel"
                    )
                    if modal {
                        Runner.Require(
                            Regex.IsMatch(
                                lifetime,
                                `xdg_toplevel#\d+\.destroy\(\).*xdg_dialog_v1#\d+\.destroy\(\)`,
                                RegexOptions.Singleline
                            ),
                            "Foreign modal teardown did not preserve toplevel, dialog, parent ordering"
                        )
                    }
                }
            }
        }

        public func Run(arguments[]string) {
            Runner.Require(
                arguments.Length == 2 || (arguments.Length == 3 && arguments[2] == "--xdg-only"),
                "usage: foreign-parent SDL_SOURCE SDL_LIBRARY [--xdg-only]"
            )
            let source = Path.GetFullPath(arguments[0])
            let library = Path.GetFullPath(arguments[1])
            let bin = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".local/bin")
            Directory.CreateDirectory(bin)
            let binary = Path.Combine(bin, "goo-foreign-parent-e2e-" + Guid.NewGuid().ToString("N"))
            try {
                let flags = Runner.Run([]string{"pkg-config", "--cflags", "--libs", "wayland-client"})
                let command = List[string]{
                    Environment.GetEnvironmentVariable("CC") ?? "cc",
                    "-std=c11",
                    "-Wall",
                    "-Wextra",
                    "-Werror",
                    "-I",
                    Path.Combine(source, "include"),
                    Path.Combine(Runner.Root, "tests/NativeWindow/foreign_parent_e2e.c"),
                    library,
                    "-Wl,-rpath," + Path.GetDirectoryName(library)
                }
                command.AddRange(SplitFlags(flags))
                command.AddRange([]string{"-ldl", "-o", binary})
                Runner.Run(command.ToArray())
                for libdecor in Enumerable.Range(
                    0,
                    if arguments.Length == 2 {
                        2
                    } else {
                        1
                    }
                ) {
                    let environment = Dictionary[string, string]()
                    environment["SDL_VIDEODRIVER"] = "wayland"
                    environment["WAYLAND_DEBUG"] = "client"
                    environment["LD_PRELOAD"] = library
                    environment["SDL_VIDEO_WAYLAND_ALLOW_LIBDECOR"] = libdecor.ToString()
                    environment["SDL_VIDEO_WAYLAND_PREFER_LIBDECOR"] = libdecor.ToString()
                    let log = Path.Combine(
                        Path.GetTempPath(),
                        "goo-foreign-parent-" + Guid.NewGuid().ToString("N") + ".log"
                    )
                    try {
                        Runner.Run([]string{binary}, environment: environment, seconds: 30, log: log)
                        CheckTrace(File.ReadAllText(log))
                    } finally {
                        File.Delete(log)
                    }
                    Console.WriteLine(
                        "Foreign parent E2E and protocol ordering passed (${if libdecor == 1 { "libdecor" } else { "xdg-shell" }})"
                    )
                }
            } finally {
                File.Delete(binary)
            }
        }

        func SplitFlags(text string) List[string] {
            let result = List[string]()
            let token = StringBuilder()
            var quote = '\0'
            var started = false
            var index = 0
            while index < text.Length {
                let c = text[index]
                if c == '\\' && quote != '\'' {
                    index++
                    Runner.Require(index < text.Length, "No escaped character")
                    if quote == '"' && text[index] != '"' && text[index] != '\\' {
                        token.Append('\\')
                    }
                    token.Append(text[index])
                    started = true
                } else if quote != '\0' {
                    if c == quote {
                        quote = '\0'
                    } else {
                        token.Append(c)
                    }
                } else if c == '\'' || c == '"' {
                    quote = c
                    started = true
                } else if char.IsWhiteSpace(c) {
                    if started {
                        result.Add(token.ToString())
                        token.Clear()
                        started = false
                    }
                } else {
                    token.Append(c)
                    started = true
                }
                index++
            }
            Runner.Require(quote == '\0', "No closing quotation")
            if started {
                result.Add(token.ToString())
            }
            return result
        }
    }
}
