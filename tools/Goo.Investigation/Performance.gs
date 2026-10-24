import System
import System.Collections.Generic
import System.Diagnostics
import System.Globalization
import System.IO
import System.IO.Compression
import System.Linq
import System.Runtime.InteropServices
import System.Security.Cryptography
import System.Text.Json
import System.Text.Json.Nodes
import System.Threading.Tasks
import System.Xml.Linq

partial class Performance {
    const PublicFeed string = "https://api.nuget.org/v3/index.json"
    const FontPath string = "../../tests/Goo.VulkanProof/Assets/Text/VendSans-VariableFont_wght.ttf"
    const LicensePath string = "../../tests/Goo.VulkanProof/Assets/Text/VendSans-OFL.txt"
    const FontHash string = "71ffd45fe736c7d26eeae2d7cb9e62e09b80901ad3df9a564b3662876c717666"
    const LicenseHash string = "699a9438baec27664f784dd36c51b128fb3632622ffd2537d69475d2e44eded0"
    let modes[]string = []string{"nativeaot", "trimmed-jit"}
    let controlled[]string = []string{
        "GOO_CONSUMER_READY_DELAY_MS",
        "GOO_CONSUMER_RUN_MS",
        "GOO_CONSUMER_STARTUP_DEADLINE_MS",
        "GOO_DEVTOOLS",
        "GOO_DEVTOOLS_DIR",
        "GOO_DEVTOOLS_INPUT",
        "GOO_FRAME_PROFILE",
        "GOO_TEXT_ATLAS_SMOKE",
        "GOO_VK_DIAGNOSTICS",
        "GOO_VK_DISABLE_SWAPCHAIN_MAINTENANCE",
        "GOO_VK_PIPELINE_CACHE",
        "GOO_VK_PIPELINE_CACHE_DIR",
        "GOO_VK_TEXT_ATLAS_BYTES"
    }
    let recorded[]string = []string{
        "WAYLAND_DISPLAY",
        "DISPLAY",
        "XDG_SESSION_TYPE",
        "XDG_CURRENT_DESKTOP",
        "SDL_VIDEODRIVER",
        "VK_DRIVER_FILES",
        "VK_ICD_FILENAMES",
        "VK_INSTANCE_LAYERS",
        "VK_LAYER_PATH",
        "LIBGL_ALWAYS_SOFTWARE",
        "DOTNET_ROOT",
        "DOTNET_gcServer",
        "DOTNET_GCHeapCount",
        "DOTNET_GCConserveMemory",
        "DOTNET_ReadyToRun",
        "DOTNET_TieredCompilation",
        "DOTNET_EnableDiagnostics",
        "COMPlus_gcServer",
        "COMPlus_GCHeapCount",
        "COMPlus_ReadyToRun",
        "COMPlus_TieredCompilation"
    }
    let options Dictionary[string, string]
    let root string = Path.Combine(Runner.Root, "tools/Goo.ConsumerPerformance")
    let output string
    let cache string
    let config string
    let source string
    let sourceKind string
    let environment Dictionary[string, string] = Dictionary[string, string]()
    let commands JsonArray = JsonArray()
    let samples List[JsonObject] = List[JsonObject]()
    let failures JsonArray = JsonArray()

    init(values Dictionary[string, string]) {
        options = values
        for name in[]string{"--output", "--rid", "--package-version"} {
            Runner.Require(values.ContainsKey(name), "required argument: " + name)
        }
        for name in[]string{"--warm-runs", "--idle-runs"} {
            Runner.Require(
                int32.Parse(values.GetValueOrDefault(name, "5"), CultureInfo.InvariantCulture) >= 1,
                "--warm-runs and --idle-runs must be at least 1"
            )
        }
        for name in[]string{"startup-timeout", "startup-hold", "readiness-delay", "idle-settle", "idle"} {
            Runner.Require(Seconds(name) > 0, "--" + name + "-seconds must be positive")
        }
        let selected = values.GetValueOrDefault("--package-source", PublicFeed)
        let parsed = Uri(selected, UriKind.RelativeOrAbsolute)
        if parsed.IsAbsoluteUri && (parsed.Scheme == "http" || parsed.Scheme == "https") {
            Runner.Require(
                parsed.UserInfo == "" && parsed.Query == "" && parsed.Fragment == "",
                "package source URLs must not contain credentials, a query, or a fragment"
            )
            source = selected
            sourceKind = "url"
        } else {
            Runner.Require(
                !parsed.IsAbsoluteUri || parsed.Scheme.Length == 1 || Path.IsPathRooted(selected),
                "unsupported package source scheme"
            )
            source = Expand(selected)
            Runner.Require(Directory.Exists(source), "package source is not a directory: " + source)
            sourceKind = "directory"
        }
        output = Expand(values["--output"])
        Runner.Require(!Directory.Exists(output) && !File.Exists(output), "output path already exists: " + output)
        Directory.CreateDirectory(output)
        Directory.CreateDirectory(Path.Combine(output, "raw"))
        cache = Path.Combine(output, "nuget-packages")
        Directory.CreateDirectory(cache)
        Directory.CreateDirectory(Path.Combine(output, "nuget-http-cache"))
        config = Path.Combine(output, "settings/NuGet.Config")
        Directory.CreateDirectory(Path.GetDirectoryName(config)!!)
        WriteConfig()
        if !OperatingSystem.IsWindows() {
            File.SetUnixFileMode(config, UnixFileMode.UserRead | UnixFileMode.UserWrite)
        }
        environment["NUGET_PACKAGES"] = cache
        environment["NUGET_HTTP_CACHE_PATH"] = Path.Combine(output, "nuget-http-cache")
        environment["DOTNET_CLI_TELEMETRY_OPTOUT"] = "1"
        environment["DOTNET_NOLOGO"] = "1"
        environment["DOTNET_SKIP_FIRST_TIME_EXPERIENCE"] = "1"
    }

    func Seconds(name string) double {
        let fallback = if name == "startup-hold" {
            "1.5"
        } else if name == "readiness-delay" {
            "0.75"
        } else {
            "30"
        }
        return double.Parse(options.GetValueOrDefault("--" + name + "-seconds", fallback), CultureInfo.InvariantCulture)
    }

    func WriteConfig() {
        let sources = XElement("packageSources", XElement("clear"))
        let document = XElement("configuration", sources)
        if sourceKind == "url" && source.TrimEnd('/') == PublicFeed.TrimEnd('/') {
            sources.Add(
                XElement(
                    "add",
                    XAttribute("key", "nuget.org"),
                    XAttribute("value", source),
                    XAttribute("protocolVersion", "3")
                )
            )
        } else {
            sources.Add(XElement("add", XAttribute("key", "goo-selected"), XAttribute("value", source)))
            sources.Add(
                XElement(
                    "add",
                    XAttribute("key", "nuget.org"),
                    XAttribute("value", PublicFeed),
                    XAttribute("protocolVersion", "3")
                )
            )
            document.Add(
                XElement(
                    "packageSourceMapping",
                    XElement(
                        "packageSource",
                        XAttribute("key", "goo-selected"),
                        XElement("package", XAttribute("pattern", "Goo"))
                    ),
                    XElement(
                        "packageSource",
                        XAttribute("key", "nuget.org"),
                        XElement("package", XAttribute("pattern", "*"))
                    )
                )
            )
        }
        XDocument(document).Save(config)
    }

    func Start(command[]string, directory string, extra Dictionary[string, string]? = nil) Process {
        let info = ProcessStartInfo{
            FileName: command[0],
            WorkingDirectory: directory,
            UseShellExecute: false,
            RedirectStandardOutput: true,
            RedirectStandardError: true
        }
        for argument in command.Skip(1) {
            info.ArgumentList.Add(argument)
        }
        for name in controlled {
            info.Environment.Remove(name)
        }
        for entry in environment {
            info.Environment[entry.Key] = entry.Value
        }
        if extra != nil {
            for entry in extra {
                info.Environment[entry.Key] = entry.Value
            }
        }
        return Runner.Own(Process.Start(info)!!)
    }

    func Command(name string, command[]string, seconds int32) string {
        let stdoutPath = Path.Combine(output, "raw/" + name + ".stdout.log")
        let stderrPath = Path.Combine(output, "raw/" + name + ".stderr.log")
        let started = Now()
        using let process = Start(command, root)
        let stdout = process.StandardOutput.ReadToEndAsync()
        let stderr = process.StandardError.ReadToEndAsync()
        let timedOut = !process.WaitForExit(seconds * 1000)
        if timedOut {
            Runner.Stop(process)
        }
        Task.WaitAll(stdout, stderr)
        let ended = Now()
        File.WriteAllText(stdoutPath, stdout.Result)
        File.WriteAllText(stderrPath, stderr.Result)
        commands.Add(
            JsonObject(){
                ["name"] = name,
                ["command"] = JsonSerializer.SerializeToNode(command),
                ["cwd"] = root,
                ["startedMonotonicNs"] = started,
                ["endedMonotonicNs"] = ended,
                ["elapsedSeconds"] = (ended - started) / 1000000000.0,
                ["returncode"] = if timedOut {
                    nil
                } else {
                    JsonValue.Create(process.ExitCode)
                },
                ["timedOut"] = timedOut,
                ["stdout"] = stdoutPath,
                ["stderr"] = stderrPath
            }
        )
        Runner.Save(Path.Combine(output, "commands.json"), commands)
        Runner.Require(!timedOut, "$name timed out after $seconds seconds")
        Runner.Require(process.ExitCode == 0, "$name failed with exit code ${process.ExitCode}")
        return stdout.Result
    }

    func Publish() JsonObject {
        let sizes = JsonObject()
        for mode in modes {
            let publish = Path.Combine(output, "publish", mode)
            let command = List[string]{
                "dotnet",
                "publish",
                Path.Combine(root, "Goo.ConsumerPerformance.gsproj"),
                "-c",
                "Release",
                "-m:4",
                "-r",
                options["--rid"],
                "--self-contained",
                "true",
                "--artifacts-path",
                Path.Combine(output, "build", mode),
                "--configfile",
                config,
                "-p:GooReleaseVersion=" + options["--package-version"],
                "-p:TreatWarningsAsErrors=true",
                "-o",
                publish
            }
            if !OperatingSystem.IsWindows() {
                command.InsertRange(0, []string{"nice", "-n", "10"})
            }
            command.AddRange(
                if mode == "nativeaot" {
                    []string{"-p:PublishAot=true", "-p:StripSymbols=true"}
                } else {
                    []string{"-p:PublishTrimmed=true", "-p:TrimMode=partial"}
                }
            )
            Command("publish-" + mode, command.ToArray(), 900)
            let stage = Stage(publish, Path.Combine(output, "stage", mode))
            sizes[mode] = stage
            Runner.Save(Path.Combine(output, "reports/stage-" + mode + ".json"), stage)
        }
        return sizes
    }

    func Package(id string, version string) JsonObject {
        let packageRoot = Path.Combine(cache, id.ToLowerInvariant(), version.ToLowerInvariant())
        let packages = Directory.GetFiles(packageRoot, "*.nupkg").Order(StringComparer.Ordinal).ToArray()
        Runner.Require(packages.Length == 1, "expected one restored $id $version package")
        let path = packages[0]
        using let zip = ZipFile.OpenRead(path)
        let nuspecs = zip
            .Entries
            .Where(x -> x.FullName.EndsWith(".nuspec", StringComparison.OrdinalIgnoreCase))
            .ToArray()
        var repository JsonObject? = nil
        if nuspecs.Length == 1 {
            using let stream = nuspecs[0].Open()
            let element = XDocument
                .Load(stream)
                .Descendants()
                .FirstOrDefault(x -> x.Name.LocalName.EndsWith("repository"))
            if element != nil {
                repository = JsonObject()
                for key in[]string{"type", "url", "commit"} {
                    repository[key] = JsonValue.Create(element.Attribute(key)?.Value)
                }
            }
        }
        return JsonObject(){
            ["id"] = id,
            ["version"] = version,
            ["path"] = path,
            ["sha256"] = Hash(path),
            ["bytes"] = FileInfo(path).Length,
            ["repository"] = repository
        }
    }

    shared {
        func Expand(path string) string -> Path.GetFullPath(
            if path == "~" {
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile)
            } else if path.StartsWith("~/") {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), path.Substring(2))
            } else {
                path
            }
        )

        func Now() int64 -> if Stopwatch.Frequency == 1000000000 {
            Stopwatch.GetTimestamp()
        } else {
            int64(Stopwatch.GetTimestamp() * (1000000000.0 / Stopwatch.Frequency))
        }

        func Hash(path string) string {
            using let stream = File.OpenRead(path)
            return Convert.ToHexStringLower(SHA256.HashData(stream))
        }

        func Files(root string)[]string -> Entries(root)
            .Where(path -> Target(path).Exists)
            .Order(StringComparer.Ordinal)
            .ToArray()

        func Target(path string) FileInfo {
            let file = FileInfo(path)
            return if file.LinkTarget == nil {
                file
            } else {
                file.ResolveLinkTarget(true) as FileInfo ?? file
            }
        }

        func Entries(root string) IEnumerable[string] {
            for path in Directory.EnumerateFileSystemEntries(root) {
                let attributes = File.GetAttributes(path)
                if (attributes & FileAttributes.Directory) != 0 && (attributes & FileAttributes.ReparsePoint) == 0 {
                    for child in Entries(path) {
                        yield child
                    }
                } else {
                    yield path
                }
            }
        }

        func Size(root string) JsonObject {
            let files = Files(root)
            return JsonObject(){["bytes"] = files.Sum(x -> Target(x).Length), ["files"] = files.Length}
        }

        func Stage(publish string, destination string) JsonObject {
            let runtime = Path.Combine(destination, "runtime")
            let symbols = Path.Combine(destination, "symbols")
            Runner.Require(
                !Directory.Exists(runtime) && !Directory.Exists(symbols),
                "staging destination already exists"
            )
            Directory.CreateDirectory(runtime)
            Directory.CreateDirectory(symbols)
            for file in Entries(publish).Order(StringComparer.Ordinal) {
                let relative = Path.GetRelativePath(publish, file)
                let symbol = relative.Split(Path.DirectorySeparatorChar).Any(x -> x.EndsWith(".dSYM")) ||
                    []string{".pdb", ".dbg", ".debug"}.Contains(Path.GetExtension(relative).ToLowerInvariant())
                let target = Path.Combine(
                    if symbol {
                        symbols
                    } else {
                        runtime
                    },
                    relative
                )
                Directory.CreateDirectory(Path.GetDirectoryName(target)!!)
                let link = FileInfo(file).LinkTarget
                if link != nil {
                    File.CreateSymbolicLink(target, link)
                } else {
                    File.Copy(file, target)
                }
            }
            let runtimeFiles = Records(runtime)
            let notices = JsonArray()
            for file in runtimeFiles {
                let name = Path.GetFileName(file["path"]!!.GetValue[string]()).ToUpperInvariant()
                if []string{"LICENSE", "COPYING", "NOTICE", "OFL"}.Any(x -> name.Contains(x)) {
                    notices.Add(file.DeepClone())
                }
            }
            return JsonObject(){
                ["rawPublish"] = Size(publish),
                ["runtime"] = Size(runtime),
                ["symbols"] = Size(symbols),
                ["runtimeFiles"] = runtimeFiles,
                ["symbolFiles"] = Records(symbols),
                ["noticesInRuntime"] = notices
            }
        }

        func Records(root string) JsonArray {
            let result = JsonArray()
            for path in Files(root) {
                result.Add(
                    JsonObject(){
                        ["path"] = Path.GetRelativePath(root, path).Replace('\\', '/'),
                        ["bytes"] = Target(path).Length,
                        ["sha256"] = Hash(path)
                    }
                )
            }
            return result
        }
    }
}
