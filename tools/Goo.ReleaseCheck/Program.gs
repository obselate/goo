import System
import System.Collections.Generic
import System.Diagnostics
import System.IO
import System.IO.Compression
import System.Linq
import System.Security.Cryptography
import System.Text.Json.Nodes
import System.Text.RegularExpressions
import System.Xml.Linq

try {
    ReleaseCheck.Execute(Environment.GetCommandLineArgs().Skip(1).ToArray())
} catch (error Exception) {
    Console.Error.WriteLine(error.Message)
    Environment.ExitCode = 1
}

internal shared partial class ReleaseCheck {
    private let Root string = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../.."))

    internal func Execute(arguments[]string) {
        let values = Dictionary[string, string](StringComparer.Ordinal)
        var index = 0
        while index < arguments.Length {
            Require(
                index + 1 < arguments.Length && !values.ContainsKey(arguments[index]),
                "Expected unique option and path pairs"
            )
            values.Add(arguments[index], arguments[index + 1])
            index += 2
        }
        if values.ContainsKey("--manifests") {
            Require(
                values.Count == 2 && values.ContainsKey("--version"),
                "Expected --manifests DIRECTORY --version VERSION"
            )
            ValidateManifests(values["--manifests"], values["--version"])
            return
        }
        Require(
            values.Count == 3 && values.ContainsKey("--package") && values.ContainsKey("--symbols") &&
                values.ContainsKey("--bundle"),
            "Expected --package, --symbols and --bundle"
        )
        let digest = ValidatePackage(values["--package"])
        ValidateSymbols(values["--package"], values["--symbols"])
        ValidateBundle(values["--bundle"], digest)
    }

    private func Require(condition bool, message string) {
        if !condition {
            throw InvalidDataException(message)
        }
    }

    private func Hash(bytes[]byte) string -> Convert.ToHexStringLower(SHA256.HashData(bytes))

    private func ReadEntry(archive ZipArchive, name string)[]byte {
        using let stream = (
            archive.GetEntry(name) ?? throw InvalidDataException("Missing archive entry: " + name)
        ).Open()
        using let output = MemoryStream()
        stream.CopyTo(output)
        return output.ToArray()
    }

    private func ReadJson(archive ZipArchive, name string) JsonNode -> JsonNode.Parse(ReadEntry(archive, name)) ??
        throw InvalidDataException("Missing JSON: " + name)

    private func Run(executable string, arguments[]string, required bool) string {
        let start = ProcessStartInfo(executable)
        start.RedirectStandardOutput = true
        start.RedirectStandardError = true
        for argument in arguments {
            start.ArgumentList.Add(argument)
        }
        using let process = Process.Start(start) ?? throw IOException("Could not start " + executable)
        let output = process.StandardOutput.ReadToEndAsync()
        let error = process.StandardError.ReadToEndAsync()
        process.WaitForExit()
        if process.ExitCode != 0 {
            Require(!required, "could not inspect native payload: " + string.Join(" ", arguments))
            return ""
        }
        return output.Result
    }

    private func RequireGlibc(path string) {
        let output = Run("readelf", []string{"--version-info", path}, false)
        for match in Regex.Matches(output, `GLIBC_(\d+\.\d+)`) {
            let version = Version.Parse(match.Groups[1].Value)
            Require(version.CompareTo(Version(2, 27)) <= 0, "$path requires GLIBC_$version, maximum is GLIBC_2.27")
        }
    }

    private func ValidateManifests(directory string, version string) {
        let packages = Dictionary[string, string]{
            ["Goo.DevTools"] = "DotnetTool",
            ["Goo.DevTools.App"] = "DotnetTool",
            ["Goo.Templates"] = "Template"
        }
        for item in packages {
            let path = Path.Combine(directory, item.Key + ".$version.nupkg")
            using let archive = ZipFile.OpenRead(path)
            let nuspecs = archive.Entries.Where(e -> e.FullName.EndsWith(".nuspec")).ToArray()
            Require(nuspecs.Length == 1, "$path: expected one nuspec")
            using let stream = nuspecs[0].Open()
            let document = XDocument.Load(stream)
            Require(
                document.Descendants().Any(e -> e.Name.LocalName == "id" && e.Value == item.Key),
                "$path: package id is missing"
            )
            Require(
                document.Descendants().Any(
                    e -> e.Name.LocalName == "packageType" && e.Attribute("name")?.Value == item.Value
                ),
                "$path: package type is missing"
            )
        }
    }
}
