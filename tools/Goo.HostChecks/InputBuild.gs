import System
import System.Collections.Generic
import System.Formats.Tar
import System.IO
import System.Linq
import System.Net.Http
import System.Security.Cryptography
import System.Text
import System.Text.Json.Nodes
import System.Threading

class InputBuild {
    shared {
        public func Run(arguments[]string) {
            HostChecks.Require(arguments.Length >= 1, "expected TARGET")
            let target = arguments[0]
            let root = HostChecks.Root
            let work = Path.Combine(root, "artifacts/input-fuzz")
            Directory.CreateDirectory(work)
            let manifestPath = Path.Combine(root, "tools/Goo.TextNative/manifest.json")
            let corpus = Path.Combine(work, "corpus", target)
            Directory.CreateDirectory(corpus)
            Seed(target, corpus)
            HostChecks.Require(Directory.EnumerateFileSystemEntries(corpus).Any(), "No seed fixtures for $target")
            if target == "native-image" {
                HostChecks.Run(
                    []string{
                        "python3",
                        "tools/Goo.TextNative/add-image-sources.py",
                        "--manifest", manifestPath,
                        "--source-root", Path.Combine(work, "image-source"),
                        "--fuzz-output", Path.Combine(work, target)
                    }
                )
            } else if target == "font" {
                let manifest = JsonNode.Parse(File.ReadAllText(manifestPath))!!.AsObject()
                BuildFont(work, manifest)
            } else {
                HostChecks.Run(
                    []string{
                        "dotnet",
                        "publish",
                        "tools/Goo.InputFuzz/Goo.InputFuzz.gsproj",
                        "-c",
                        "Release",
                        "-m:4",
                        "-o",
                        Path.Combine(work, "managed-target")
                    }
                )
            }
        }

        func Seed(target string, corpus string) {
            let patterns = Dictionary[string, []string]()
            patterns["svg"] = []string{"tests/Goo.CoreBehaviorTests/Assets/*.svg"}
            let raster = []string{
                "tests/Shared/Assets/local-*.png",
                "tests/Shared/Assets/local-*.jpg",
                "tests/Shared/Assets/local-*.gif",
                "tests/Shared/Assets/local-*.webp"
            }
            patterns["raster"] = raster
            patterns["native-image"] = raster
            patterns["font"] = []string{
                "tests/Goo.VulkanProof/Assets/Text/*.ttf",
                "tests/Goo.VulkanProof/Assets/Text/*.otf",
                "tests/Goo.VulkanProof/Assets/Text/*.ttc",
                "tests/Goo.VulkanProof/Assets/Text/*.otc"
            }
            patterns["wav"] = []string{"tests/**/*.wav"}
            if !patterns.ContainsKey(target) {
                let random = Random(0)
                for index in 0 ... 8 {
                    let input = [random.Next(16, 1024)]uint8
                    random.NextBytes(input)
                    File.WriteAllBytes(Path.Combine(corpus, "random-$index.bin"), input)
                }
                return
            }
            for pattern in patterns[target] {
                let recursive = pattern.Contains("**/")
                let directory = Path.Combine(HostChecks.Root, Path.GetDirectoryName(pattern.Replace("**/", ""))!!)
                if !Directory.Exists(directory) {
                    continue
                }
                for path in Directory.EnumerateFiles(
                    directory,
                    Path.GetFileName(pattern),
                    if recursive {
                        SearchOption.AllDirectories
                    } else {
                        SearchOption.TopDirectoryOnly
                    }
                ) {
                    File.Copy(path, Path.Combine(corpus, Path.GetFileName(path)), overwrite: true)
                }
            }
            if target == "wav" && !Directory.EnumerateFileSystemEntries(corpus).Any() {
                for channels in[]int32{1, 2} {
                    for width in[]int32{1, 2} {
                        Wave(Path.Combine(corpus, "pcm-$channels-$width.wav"), channels, width)
                    }
                }
            }
        }

        func BuildFont(work string, manifest JsonObject) {
            let harfbuzz = manifest["source"]!!["harfbuzz"]!!
            let archive = Path.Combine(work, "harfbuzz.tar.xz")
            Fetch(harfbuzz["archiveUrl"]!!.GetValue[string](), harfbuzz["archiveSha256"]!!.GetValue[string](), archive)
            using let unpack = HostChecks.Start([]string{"xz", "-dc", archive})
            let error = unpack.StandardError.ReadToEndAsync()
            try {
                TarFile.ExtractToDirectory(unpack.StandardOutput.BaseStream, work, overwriteFiles: true)
                unpack.WaitForExit()
                HostChecks.Require(unpack.ExitCode == 0, error.GetAwaiter().GetResult())
            } finally {
                HostChecks.Stop(unpack)
            }
            let source = Path.Combine(work, "harfbuzz-" + harfbuzz["version"]!!.GetValue[string]())
            HostChecks.Run(
                []string{
                    "clang++", "-std=c++17", "-O1", "-g", "-fno-omit-frame-pointer",
                    "-fsanitize=fuzzer,address,undefined", "-fno-sanitize-recover=all",
                    "-I" + Path.Combine(source, "src"),
                    Path.Combine(source, "src/harfbuzz.cc"),
                    "tools/Goo.InputFuzz/font.cc",
                    "-o", Path.Combine(work, "font")
                }
            )
        }

        func Fetch(url string, digest string, path string) {
            using let client = HttpClient(){Timeout = Timeout.InfiniteTimeSpan}
            let data = client.GetByteArrayAsync(url).GetAwaiter().GetResult()
            HostChecks.Require(Convert.ToHexStringLower(SHA256.HashData(data)) == digest, "SHA-256 mismatch: " + url)
            File.WriteAllBytes(path, data)
        }

        func Wave(path string, channels int32, width int32) {
            using let writer = BinaryWriter(File.Create(path))
            let length = channels * width * 32
            writer.Write(Encoding.ASCII.GetBytes("RIFF"))
            writer.Write(36 + length)
            writer.Write(Encoding.ASCII.GetBytes("WAVEfmt "))
            writer.Write(16)
            writer.Write(int16(1))
            writer.Write(int16(channels))
            writer.Write(8000)
            writer.Write(8000 * channels * width)
            writer.Write(int16(channels * width))
            writer.Write(int16(width * 8))
            writer.Write(Encoding.ASCII.GetBytes("data"))
            writer.Write(length)
            for index in 0 ... length {
                writer.Write(
                    byte(
                        if width == 1 {
                            128
                        } else {
                            0
                        }
                    )
                )
            }
        }
    }
}
