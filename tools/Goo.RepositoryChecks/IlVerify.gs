import System
import System.Collections.Generic
import System.Diagnostics
import System.IO
import System.Linq
import System.Runtime.InteropServices
import System.Text.Json.Nodes
import System.Text.RegularExpressions

internal shared partial class Checks {
    private func VerifyIl(arguments[]string) {
        let assemblies = List[string]()
        var assetsOverride = ""
        for var index = 0; index < arguments.Length; index++ {
            if arguments[index] == "--assets" {
                index++
                Require(index < arguments.Length && assetsOverride.Length == 0, "Expected one --assets path")
                assetsOverride = Path.GetFullPath(arguments[index])
            } else {
                assemblies.Add(Path.GetFullPath(arguments[index]))
            }
        }
        Require(assemblies.Count > 0, "Expected at least one assembly")
        let baseline = HashSet[string](
            File.ReadAllLines(Path.Combine(Root, "tools/Goo.RepositoryChecks/ilverify-baseline.txt")),
            StringComparer.Ordinal
        )
        let started = Stopwatch.StartNew()
        var newDiagnostics = 0
        for assembly in assemblies {
            Require(File.Exists(assembly), "Assembly not found: " + assembly)
            let outputDirectory = Path.GetDirectoryName(assembly)!!
            var project = DirectoryInfo(outputDirectory)
            while assetsOverride.Length == 0 && !File.Exists(
                Path.Combine(project.FullName, "obj/project.assets.json")
            ) {
                project = project.Parent ?? throw InvalidDataException("No project.assets.json for " + assembly)
            }
            let assetsPath = if assetsOverride.Length != 0 {
                assetsOverride
            } else {
                Path.Combine(project.FullName, "obj/project.assets.json")
            }
            let assets = JsonNode.Parse(File.ReadAllText(assetsPath))!!
            let references = Dictionary[string, string](StringComparer.OrdinalIgnoreCase)
            for file in Directory.GetFiles(outputDirectory, "*.dll") {
                references.TryAdd(Path.GetFileNameWithoutExtension(file), file)
            }
            for file in Directory.GetFiles(RuntimeEnvironment.GetRuntimeDirectory(), "*.dll") {
                references.TryAdd(Path.GetFileNameWithoutExtension(file), file)
            }
            for target in assets["targets"]!!.AsObject() {
                for library in target.Value.AsObject() {
                    let metadata = assets["libraries"]!![library.Key]!!
                    if metadata["type"]!!.GetValue[string]() != "package" {
                        continue
                    }
                    for section in[]string{"runtime", "runtimeTargets", "compile"} {
                        if library.Value[section] == nil {
                            continue
                        }
                        for asset in library.Value[section]!!.AsObject() {
                            if !asset.Key.EndsWith(".dll", StringComparison.OrdinalIgnoreCase) {
                                continue
                            }
                            if section == "runtimeTargets" &&
                                asset.Value["assetType"]!!.GetValue[string]() != "runtime" {
                                continue
                            }
                            let name = Path.GetFileNameWithoutExtension(asset.Key)
                            if references.ContainsKey(name) {
                                continue
                            }
                            var resolved = false
                            for folder in assets["packageFolders"]!!.AsObject() {
                                let file = Path.Combine(folder.Key, metadata["path"]!!.GetValue[string](), asset.Key)
                                if File.Exists(file) {
                                    references.Add(name, file)
                                    resolved = true
                                    break
                                }
                            }
                            Require(resolved, "Reference asset not found: " + library.Key + "/" + asset.Key)
                        }
                    }
                }
            }
            if assembly.EndsWith("Goo.Android.dll", StringComparison.Ordinal) {
                let resolved = JsonNode.Parse(
                    Run(
                        "dotnet",
                        []string{
                            "msbuild",
                            Path.Combine(project.FullName, "Goo.Android.gsproj"),
                            "-nologo",
                            "-target:ResolveFrameworkReferences",
                            "-getItem:ResolvedTargetingPack"
                        }
                    )
                )!!
                let pack = resolved["Items"]!!["ResolvedTargetingPack"]!!.AsArray().Single(
                    p -> p["Identity"]!!.GetValue[string]() == "Microsoft.Android"
                )
                let directory = Path.Combine(pack["Path"]!!.GetValue[string](), "ref/net10.0")
                for file in Directory.GetFiles(directory, "*.dll") {
                    references.TryAdd(Path.GetFileNameWithoutExtension(file), file)
                }
                let designer = Path.Combine(
                    Path.GetDirectoryName(assetsPath)!!,
                    "Release",
                    Path.GetFileName(outputDirectory),
                    "_Microsoft.Android.Resource.Designer.dll"
                )
                Require(File.Exists(designer), "Android resource designer not found: " + designer)
                references["_Microsoft.Android.Resource.Designer"] = designer
            }
            let start = ProcessStartInfo("dotnet")
            start.WorkingDirectory = Root
            start.RedirectStandardOutput = true
            start.RedirectStandardError = true
            for argument in[]string{
                "tool",
                "run",
                "ilverify",
                "--",
                assembly,
                "-s",
                "System.Private.CoreLib",
                "--statistics"
            } {
                start.ArgumentList.Add(argument)
            }
            for reference in references.Values {
                start.ArgumentList.Add("-r")
                start.ArgumentList.Add(reference)
            }
            using let process = Process.Start(start) ?? throw IOException("Could not start ILVerify")
            let stdout = process.StandardOutput.ReadToEndAsync()
            let stderr = process.StandardError.ReadToEndAsync()
            process.WaitForExit()
            let output = stdout.Result + stderr.Result
            let found = Regex.Match(output, `(?m)^Methods found: (\d+)\s*$`)
            let verified = Regex.Match(output, `(?m)^Methods verified: (\d+)\s*$`)
            var diagnosticCount = 0
            for raw in output.Split('\n') {
                let line = raw.TrimEnd('\r')
                if line.StartsWith("[IL]: Error [", StringComparison.Ordinal) {
                    let prefix = "[" + assembly + " : "
                    Require(line.Contains(prefix), "Unrecognized ILVerify diagnostic: " + line)
                    let diagnostic = line.Replace(prefix, "[" + Path.GetFileName(assembly) + " : ")
                    diagnosticCount++
                    if !baseline.Contains(diagnostic) {
                        Console.Error.WriteLine(diagnostic)
                        newDiagnostics++
                    }
                } else if line.Length != 0 && !Regex.IsMatch(
                    line,
                    `^(All Classes and Methods in .+ Verified\.|\d+ Error\(s\) Verifying .+|Types found: \d+|Types verified: \d+|Methods found: \d+|Methods verified: \d+)$`
                ) {
                    throw InvalidDataException("Unexpected ILVerify output for " + assembly + ":\n" + output)
                }
            }
            Require(
                (process.ExitCode == 0 && diagnosticCount == 0 || process.ExitCode == 2 && diagnosticCount > 0) &&
                    found.Success &&
                    verified.Success &&
                    found
                    .Groups[1]
                    .Value == verified
                    .Groups[1]
                    .Value,
                "ILVerify failed or did not verify every method in " + assembly + ":\n" + output
            )
            Console.WriteLine(
                Path.GetFileName(assembly) +
                    ": " +
                    verified
                    .Groups[1]
                    .Value +
                    "/" +
                    found
                    .Groups[1]
                    .Value +
                    " methods verified, " +
                    diagnosticCount.ToString() + " diagnostics"
            )
        }
        Console.WriteLine(
            assemblies.Count.ToString() + " assemblies, " + newDiagnostics.ToString() +
                " new diagnostics, " +
                started
                .Elapsed
                .TotalSeconds
                .ToString("F3") +
                " seconds"
        )
        Require(newDiagnostics == 0, "IL verification found new diagnostics")
    }
}
