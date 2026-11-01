import System
import System.Collections.Generic
import System.Diagnostics
import System.IO
import System.Linq
import System.Text.Json

internal shared partial class Repo {
    private func BuildAndroid() {
        if string.IsNullOrEmpty(Environment.GetEnvironmentVariable("ANDROID_HOME")) || string.IsNullOrEmpty(
            Environment.GetEnvironmentVariable("JAVA_HOME")
        ) {
            throw InvalidOperationException(
                "Android checks need ANDROID_HOME and JAVA_HOME. Run doctor for setup commands."
            )
        }
        Run(
            "dotnet",
            []string{
                "build",
                "Goo.Android/Goo.Android.gsproj",
                "-c",
                "Release",
                "-p:TreatWarningsAsErrors=true",
                "-p:AndroidSdkDirectory=" + Environment.GetEnvironmentVariable("ANDROID_HOME"),
                "-p:JavaSdkDirectory=" + Environment.GetEnvironmentVariable("JAVA_HOME")
            }
        )
    }

    private func Docs(check bool, android bool) {
        if !android {
            Build("tools/Goo.DevTools.Cli")
            let start = ProcessStartInfo{FileName: "dotnet", WorkingDirectory: Root, RedirectStandardOutput: true}
            for argument in[]string{
                "tools/Goo.DevTools.Cli/bin/Release/net10.0/Goo.DevTools.Cli.dll",
                "--help",
                "--json"
            } {
                start.ArgumentList.Add(argument)
            }
            using let process = Process.Start(start) ?? throw IOException("Could not start the Goo CLI.")
            let output = process.StandardOutput.ReadToEnd()
            process.WaitForExit()
            if process.ExitCode != 0 {
                throw InvalidOperationException("Could not generate the CLI reference.")
            }
            using let help = JsonDocument.Parse(output)
            let reference = help.RootElement.GetProperty("reference").GetString()!!.Replace("\r\n", "\n") + "\n"
            let path = Path.Combine(Root, "docs/devtools/cli.md")
            if check {
                if !File.Exists(path) || File.ReadAllText(path) != reference {
                    throw InvalidOperationException(
                        "The CLI reference is stale. Run: dotnet run --project tools/Goo.Repo -- docs"
                    )
                }
            } else {
                File.WriteAllText(path, reference)
            }
        }
        if android {
            BuildAndroid()
        } else {
            Build("tests/Goo.ApiContractTests")
        }
        Build("tools/Goo.ApiDocs")
        let temporary = Path.Combine(Root, "artifacts", "docs-" + Guid.NewGuid().ToString("N"))
        Directory.CreateDirectory(temporary)
        try {
            let outputs = Dictionary[string, string]()
            for source in if android {
                []string{"Goo.Android"}
            } else {
                []string{"Goo", "Goo.Audio"}
            } {
                let relative = if source == "Goo" {
                    "docs/api"
                } else if source == "Goo.Audio" {
                    "docs/api-audio"
                } else {
                    "docs/api-android"
                }
                let output = Path.Combine(temporary, relative)
                let framework = if android {
                    "net10.0-android"
                } else {
                    "net10.0"
                }
                Tool(
                    "Goo.ApiDocs",
                    []string{
                        "--source",
                        source,
                        "--xml",
                        source + "/bin/Release/" + framework + "/" + source + ".xml",
                        "--output",
                        output,
                        "--link-output",
                        Path.Combine(Root, relative)
                    }
                )
                outputs[relative] = output
            }
            if !android {
                let reference = Path.Combine(temporary, "plugins/goo/reference")
                Tool("Goo.SyncDocs", []string{Root, reference, outputs["docs/api"]})
                outputs["plugins/goo/reference"] = reference
            }
            let stale = List[string]()
            for (relative, generated) in outputs {
                let destination = Path.Combine(Root, relative)
                let pattern = if relative.StartsWith("docs/") {
                    "*.md"
                } else {
                    "*"
                }
                let expected = Directory
                    .GetFiles(generated, pattern, SearchOption.AllDirectories)
                    .Select(p -> Path.GetRelativePath(generated, p))
                    .ToArray()
                let actual = if Directory.Exists(destination) {
                    Directory
                        .GetFiles(destination, pattern, SearchOption.AllDirectories)
                        .Select(p -> Path.GetRelativePath(destination, p))
                        .ToArray()
                } else {
                    []string{}
                }
                for file in expected.Union(actual).OrderBy(p -> p, StringComparer.Ordinal) {
                    let source = Path.Combine(generated, file)
                    let target = Path.Combine(destination, file)
                    if File.Exists(source) && File.Exists(target) && File.ReadAllBytes(source).SequenceEqual(
                        File.ReadAllBytes(target)
                    ) {
                        continue
                    }
                    if check {
                        stale.Add(relative + "/" + file.Replace('\\', '/'))
                        continue
                    }
                    if File.Exists(source) {
                        Directory.CreateDirectory(Path.GetDirectoryName(target)!!)
                        File.Copy(source, target, true)
                    } else {
                        File.Delete(target)
                    }
                }
            }
            if stale.Count != 0 {
                throw InvalidOperationException(
                    "Generated documentation is stale:\n" + string.Join("\n", stale) +
                        "\nRun: dotnet run --project tools/Goo.Repo -- docs" +
                        if android {
                        " --android"
                    } else {
                        ""
                    }
                )
            }
            Console.WriteLine(
                if check {
                    "Generated documentation is current. No tracked files were changed."
                } else {
                    "Generated documentation updated. Commit these files with the source change."
                }
            )
        } finally {
            Directory.Delete(temporary, true)
        }
    }
}
