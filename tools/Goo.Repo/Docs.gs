import System
import System.Collections.Generic
import System.IO
import System.Linq

internal shared partial class Repo {
    private func Docs(check bool, android bool) {
        if android {
            if string.IsNullOrEmpty(Environment.GetEnvironmentVariable("ANDROID_HOME")) || string.IsNullOrEmpty(
                Environment.GetEnvironmentVariable("JAVA_HOME")
            ) {
                throw InvalidOperationException(
                    "Android docs need ANDROID_HOME and JAVA_HOME. Run doctor for setup commands."
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
