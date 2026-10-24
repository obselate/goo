import System
import System.Collections.Generic
import System.Diagnostics
import System.IO

const Source = "package Scratch\n\nfunc Main() {\n    var value int32 = 1\n}\n"
let linter = Path.GetFullPath(
    Path.Combine(AppContext.BaseDirectory, "../../../../Goo.Gslint/bin/Release/net10.0/Goo.Gslint.dll")
)
let options = List[string]{"--fix", "--reduce"}
for option in options {
    let scratch = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString())
    Directory.CreateDirectory(scratch)
    try {
        let root = Path.Combine(scratch, "root")
        let outside = Path.Combine(scratch, "root-outside")
        Directory.CreateDirectory(root)
        Directory.CreateDirectory(Path.Combine(outside, "nested"))
        let target = Path.Combine(outside, "target.gs")
        let nested = Path.Combine(outside, "nested/target.gs")
        File.WriteAllText(target, Source)
        File.WriteAllText(nested, Source)
        File.CreateSymbolicLink(Path.Combine(root, "file.gs"), target)
        Directory.CreateSymbolicLink(Path.Combine(root, "directory"), outside)
        let alias = Path.Combine(scratch, "alias")
        Directory.CreateSymbolicLink(alias, scratch)
        let regular = Path.Combine(root, "regular.gs")
        let paths = List[string]{Path.Combine(alias, "root"), "root"}
        for path in paths {
            File.WriteAllText(regular, Source)
            let result = Run(linter, option, path, alias)
            Require(
                File.ReadAllText(target) == Source && File.ReadAllText(nested) == Source,
                "Changed a symlink target"
            )
            Require(File.ReadAllText(regular) != Source, "Did not change the regular file")
            Require(result[0].Contains("1 file(s)"), result[0])
        }
    } finally {
        Directory.Delete(scratch, true)
    }
    let relativePaths = List[string]{"linked-dir/real.gs", "linked-dir/subdir"}
    for path in relativePaths {
        let temporary = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString())
        Directory.CreateDirectory(temporary)
        try {
            let root = Path.Combine(temporary, "root")
            let outside = Path.Combine(temporary, "outside")
            Directory.CreateDirectory(root)
            Directory.CreateDirectory(Path.Combine(outside, "subdir"))
            let target = Path.Combine(
                outside,
                if path.EndsWith("subdir") {
                    "subdir/real.gs"
                } else {
                    "real.gs"
                }
            )
            File.WriteAllText(target, Source)
            Directory.CreateSymbolicLink(Path.Combine(root, "linked-dir"), outside)
            let result = Run(linter, option, path, root)
            Require(File.ReadAllText(target) == Source, "Changed a relative symlink target")
            Require(result[1].Contains("warning") && result[1].Contains(path), result[1])
            Require(result[0].Contains("0 file(s)"), result[0])
        } finally {
            Directory.Delete(temporary, true)
        }
    }
}
Console.WriteLine("Linter symlink regressions passed")

func Require(condition bool, message string) {
    if !condition {
        throw InvalidOperationException(message)
    }
}

func Run(linter string, option string, path string, directory string) List[string] {
    let start = ProcessStartInfo("dotnet")
    start.ArgumentList.Add(linter)
    start.ArgumentList.Add(option)
    start.ArgumentList.Add(path)
    start.WorkingDirectory = directory
    start.RedirectStandardOutput = true
    start.RedirectStandardError = true
    using let process = Process.Start(start) ?? throw InvalidOperationException("Could not start linter")
    let output = process.StandardOutput.ReadToEndAsync()
    let error = process.StandardError.ReadToEndAsync()
    process.WaitForExit()
    Require(process.ExitCode == 0, output.Result + error.Result)
    return List[string]{output.Result, error.Result}
}
