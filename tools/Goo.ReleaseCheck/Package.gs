import System
import System.Collections.Generic
import System.IO
import System.IO.Compression
import System.Linq
import System.Reflection.PortableExecutable
import System.Text
import System.Text.Json.Nodes
import System.Text.RegularExpressions

internal shared partial class ReleaseCheck {
    private let PackageFiles[]string = []string{
        "_rels/.rels",
        "Goo.nuspec",
        "lib/net10.0/Yoga.Net.dll",
        "lib/net10.0/Goo.xml",
        "lib/net10.0/Goo.dll",
        "ref/net10.0/Goo.dll",
        "README.md",
        "CHANGELOG.md",
        "LICENSE",
        "THIRD-PARTY-NOTICES.md",
        "buildTransitive/Goo.targets",
        "buildTransitive/native/linux-x64/libSDL3.a",
        "buildTransitive/native/linux-x64/libgoo-harfbuzz.a",
        "buildTransitive/native/linux-x64/libgoo-harfbuzz-gpu.a",
        "contentFiles/any/any/Vulkan/Shaders/Authoring/goo_effect.glsl",
        "contentFiles/any/any/Vulkan/Shaders/Authoring/goo_effect.slang",
        "contentFiles/any/any/Vulkan/Runtime/HarfBuzz-COPYING.txt",
        "contentFiles/any/any/Vulkan/Shaders/harfbuzz-14.3.1.provenance.json",
        "contentFiles/any/any/Vulkan/Runtime/MoltenVK-LICENSE.txt",
        "runtimes/linux-x64/native/libSDL3.so",
        "runtimes/linux-x64/native/libgoo-harfbuzz-gpu.so",
        "runtimes/linux-x64/native/libgoo-harfbuzz.so",
        "contentFiles/any/any/Vulkan/Runtime/linux-x64/text-native-build.json",
        "runtimes/android-arm64/native/libgoo-harfbuzz.so",
        "runtimes/android-arm64/native/libgoo-harfbuzz-gpu.so",
        "contentFiles/any/any/Vulkan/Runtime/android-arm64/text-native-build.json",
        "runtimes/android-x64/native/libgoo-harfbuzz.so",
        "runtimes/android-x64/native/libgoo-harfbuzz-gpu.so",
        "contentFiles/any/any/Vulkan/Runtime/android-x64/text-native-build.json",
        "runtimes/osx-arm64/native/libMoltenVK.dylib",
        "runtimes/osx-arm64/native/libSDL3.dylib",
        "runtimes/osx-arm64/native/libgoo-harfbuzz-gpu.dylib",
        "runtimes/osx-arm64/native/libgoo-harfbuzz.dylib",
        "contentFiles/any/any/Vulkan/Runtime/osx-arm64/text-native-build.json",
        "runtimes/win-x64/native/goo-harfbuzz-gpu.dll",
        "runtimes/win-x64/native/goo-harfbuzz.dll",
        "runtimes/win-x64/native/SDL3.dll",
        "contentFiles/any/any/Vulkan/Runtime/win-x64/text-native-build.json",
        "tools/net10.0/any/Goo.ShaderEffectTool.deps.json",
        "tools/net10.0/any/Goo.ShaderEffectTool.dll",
        "tools/net10.0/any/Goo.ShaderEffectTool.runtimeconfig.json",
        "[Content_Types].xml"
    }

    private func ValidatePackage(path string) string {
        using let archive = ZipFile.OpenRead(path)
        let names = HashSet[string](archive.Entries.Select(e -> e.FullName), StringComparer.Ordinal)
        let missing = PackageFiles.Where(n -> !names.Contains(n)).OrderBy(n -> n).ToArray()
        Require(missing.Length == 0, "package is missing required assets: " + string.Join(", ", missing))
        Require(
            !names.Any(n -> n.EndsWith(".spv") || n.EndsWith("/shader-manifest.json")),
            "package contains loose runtime shaders"
        )
        Require(
            !names.Any(n -> n.StartsWith("runtimes/") && n.EndsWith("/text-native-build.json")),
            "package deploys native provenance"
        )
        let goo = ReadEntry(archive, "lib/net10.0/Goo.dll")
        let shaderManifest = JsonNode.Parse(
            File.ReadAllText(Path.Combine(Root, "Goo/Shaders/Vulkan/shader-manifest.json"))
        )!!
        let resources = List[string]{"Goo.Effects.backdrop_blur.goo-effect", "Goo.Vulkan.Shaders.shader-manifest.json"}
        for shader in shaderManifest["shaders"]!!.AsArray() {
            resources.Add("Goo.Vulkan.Shaders." + shader["output"]!!.GetValue[string]())
        }
        for resource in resources {
            Require(
                ContainsBytes(goo, Encoding.UTF8.GetBytes(resource)),
                "packaged Goo.dll is missing embedded shader resources: " + resource
            )
        }
        let sources = Dictionary[string, string]{
            ["README.md"] = "docs/nuget-readme.md",
            ["CHANGELOG.md"] = "CHANGELOG.md",
            ["LICENSE"] = "LICENSE",
            ["THIRD-PARTY-NOTICES.md"] = "THIRD-PARTY-NOTICES.md",
            ["buildTransitive/Goo.targets"] = "Goo/Goo.targets",
            ["contentFiles/any/any/Vulkan/Runtime/MoltenVK-LICENSE.txt"] = "Goo/Runtime/Vulkan/MoltenVK-LICENSE.txt"
        }
        for source in sources {
            Require(
                ReadEntry(archive, source.Key).SequenceEqual(File.ReadAllBytes(Path.Combine(Root, source.Value))),
                "package " + source.Key + " differs from the release tree"
            )
        }
        using let stream = MemoryStream(goo, false)
        using let pe = PEReader(stream)
        Require(
            DebugEntries(pe, goo.Length).Any(e -> e.Type == DebugDirectoryEntryType.EmbeddedPortablePdb),
            "packaged Goo.dll does not contain embedded debug symbols"
        )
        for name in[]string{"libSDL3.a", "libgoo-harfbuzz.a", "libgoo-harfbuzz-gpu.a"} {
            Require(
                StartsWithBytes(
                    ReadEntry(archive, "buildTransitive/native/linux-x64/" + name),
                    Encoding.ASCII.GetBytes("!<arch>\n")
                ),
                "packaged $name is not a static archive"
            )
        }
        let nuspec = Encoding.UTF8.GetString(ReadEntry(archive, "Goo.nuspec"))
        let dependency = Regex.Match(nuspec, `<dependency id="Hexa.NET.SDL3"[^>]+>`)
        Require(
            dependency.Success && dependency.Value.Contains("Native"),
            "Hexa.NET.SDL3 native assets are not excluded"
        )
        let directory = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString())
        Directory.CreateDirectory(directory)
        try {
            let sdl = ReadEntry(archive, "runtimes/linux-x64/native/libSDL3.so")
            Require(StartsWithBytes(sdl, []byte{127, 69, 76, 70}), "packaged libSDL3.so is not an ELF library")
            let target = Path.Combine(directory, "libSDL3.so")
            File.WriteAllBytes(target, sdl)
            RequireGlibc(target)
            ValidateWindowsSdl(archive, directory)
            let macos = Dictionary[string, []byte]()
            for name in[]string{
                "libMoltenVK.dylib",
                "libSDL3.dylib",
                "libgoo-harfbuzz-gpu.dylib",
                "libgoo-harfbuzz.dylib"
            } {
                macos[name] = ReadEntry(archive, "runtimes/osx-arm64/native/" + name)
            }
            macos["text-native-build.json"] = ReadEntry(
                archive,
                "contentFiles/any/any/Vulkan/Runtime/osx-arm64/text-native-build.json"
            )
            ValidateMacos(macos)
            ValidateAndroidProvenance(archive)
            Console.WriteLine("Package OK: ${FileInfo(path).Length} bytes")
            return Hash(sdl)
        } finally {
            Directory.Delete(directory, true)
        }
    }

    private func ValidateWindowsSdl(archive ZipArchive, directory string) {
        let bytes = ReadEntry(archive, "runtimes/win-x64/native/SDL3.dll")
        Require(StartsWithBytes(bytes, []byte{77, 90}), "packaged SDL3.dll is not a PE library")
        Require(
            Hash(bytes) == "2632e21625861a0dc106f2b1abb649e610d8be88534ba74c76a763abe5aefaa3",
            "packaged SDL3.dll does not match the pinned SDL release"
        )
        let target = Path.Combine(directory, "SDL3.dll")
        File.WriteAllBytes(target, bytes)
        let output = Run("objdump", []string{"-p", target}, true)
        let imports = HashSet[string](
            Regex.Matches(output, `DLL Name:\s+(\S+)`).Select(m -> m.Groups[1].Value),
            StringComparer.Ordinal
        )
        Require(
            imports.SetEquals(
                []string{
                    "ADVAPI32.dll",
                    "GDI32.dll",
                    "IMM32.dll",
                    "KERNEL32.dll",
                    "OLEAUT32.dll",
                    "SETUPAPI.dll",
                    "SHELL32.dll",
                    "USER32.dll",
                    "VERSION.dll",
                    "WINMM.dll",
                    "ole32.dll"
                }
            ),
            "unexpected SDL3.dll imports: " + string.Join(", ", imports)
        )
    }

    private func ValidateAndroidProvenance(archive ZipArchive) {
        let targets = []string{"android-arm64", "android-x64"}
        for rid in targets {
            let provenance = ReadJson(archive, "contentFiles/any/any/Vulkan/Runtime/$rid/text-native-build.json")
            Require(
                provenance["buildEvidence"]!!["target"]!!.GetValue[string]() == rid,
                "Android provenance target mismatch: " + rid
            )
            for artifact in provenance["artifacts"]!!.AsObject() {
                let name = artifact.Value["file"]!!.GetValue[string]()
                Require(
                    Hash(ReadEntry(archive, "runtimes/$rid/native/$name")) == artifact.Value["sha256"]!!.GetValue[
                        string
                    ](),
                    "Android payload hash mismatch: $rid/$name"
                )
            }
        }
    }

    private func StartsWithBytes(bytes[]byte, prefix[]byte) bool -> bytes.AsSpan().StartsWith(prefix.AsSpan())

    private func ContainsBytes(bytes[]byte, value[]byte) bool -> bytes.AsSpan().IndexOf(value.AsSpan()) >= 0
}
