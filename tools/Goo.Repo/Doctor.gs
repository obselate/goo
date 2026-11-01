import System
import System.Diagnostics
import System.IO
import System.Linq
import System.Text.Json.Nodes

internal shared partial class Repo {
    private func Doctor() {
        Console.WriteLine("Read-only prerequisite checks. Optional Android tools are separate from desktop docs.")
        var missing = 0
        let sdk = ReadCommand("dotnet", []string{"--list-sdks"})
        let requiredSdk = JsonNode.Parse(File.ReadAllText("global.json"))!!["sdk"]!!["version"]!!.GetValue[string]()
        missing += Report(
            ".NET SDK " + requiredSdk,
            sdk.Split('\n').Any(line -> line.StartsWith(requiredSdk + " ")),
            "mkdir -p artifacts && curl -fsSL https://dot.net/v1/dotnet-install.sh -o artifacts/dotnet-install.sh && bash artifacts/dotnet-install.sh --version " +
                requiredSdk
        )
        missing += Report(
            "G# compiler and formatter",
            File.Exists(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "formatter.path")).Trim()),
            "dotnet restore tools/Goo.Repo"
        )
        let linux = OperatingSystem.IsLinux()
        if linux {
            missing += Report(
                "Native build tools",
                []string{"cmake", "meson", "ninja", "cc", "pkg-config", "patch", "python3", "readelf"}.All(OnPath),
                "Ubuntu 24.04: sudo apt-get install -y build-essential cmake meson ninja-build pkg-config patch python3 binutils libxml2-dev libexpat1-dev libffi-dev libwayland-dev libxkbcommon-dev libdecor-0-dev libdbus-1-dev libibus-1.0-dev libgl1-mesa-dev libegl1"
            )
            missing += Report(
                "Private display",
                (OnPath("kwin_wayland") || OnPath("weston")) && OnPath("dbus-run-session"),
                "Ubuntu 24.04: sudo apt-get install -y kwin-wayland weston dbus-daemon"
            )
            missing += Report(
                "Vulkan driver",
                ReadCommand("vulkaninfo", []string{"--summary"}).Contains("deviceName"),
                "Ubuntu 24.04: sudo apt-get install -y mesa-vulkan-drivers vulkan-tools"
            )
            missing += Report(
                "Vulkan validation layer",
                Directory.Exists("/usr/share/vulkan/explicit_layer.d") && Directory.GetFiles(
                    "/usr/share/vulkan/explicit_layer.d",
                    "*validation*.json"
                )
                    .Length != 0,
                "Ubuntu 24.04: sudo apt-get install -y vulkan-validationlayers"
            )
            let font = ReadCommand("fc-match", []string{"sans-serif"})
            missing += Report(
                "Fonts",
                font.Contains(".ttf") || font.Contains(".otf"),
                "Ubuntu 24.04: sudo apt-get install -y fontconfig fonts-dejavu-core fonts-noto-color-emoji"
            )
            missing += Report(
                "Pinned Linux SDL",
                File.Exists("artifacts/native/libSDL3.so"),
                "bash .github/scripts/build-sdl-linux-x64.sh artifacts/native/libSDL3.so"
            )
        } else {
            Console.WriteLine(
                "INFO Native desktop drivers: install the current vendor Vulkan driver. Core CI checks run on Linux."
            )
        }
        Report(
            "Shader tools (Gallery)",
            OnPath("slangc") && OnPath("spirv-val"),
            "bash .github/scripts/install-shader-toolchain-linux-x64.sh artifacts/shader-toolchain && export SLANG_SDK=" +
                Path.Combine(Root, "artifacts/shader-toolchain/slang-2026.16") + " VULKAN_SDK=" + Path.Combine(
                Root,
                "artifacts/shader-toolchain/vulkan-sdk-1.4.357.0"
            )
        )
        let android = Environment.GetEnvironmentVariable("ANDROID_HOME") ?? ""
        let java = Environment.GetEnvironmentVariable("JAVA_HOME") ?? ""
        Report(
            "Android workload (optional)",
            ReadCommand("dotnet", []string{"workload", "list"}).Contains("android"),
            "dotnet workload install android"
        )
        Report(
            "Android SDK (optional)",
            android.Length != 0 && Directory.Exists(Path.Combine(android, "platforms")),
            "sdkmanager 'platform-tools' 'platforms;android-36' 'build-tools;36.0.0' && export ANDROID_HOME=~/Android/Sdk"
        )
        let javaExecutable = Path.Combine(
            java,
            "bin",
            if OperatingSystem.IsWindows() {
                "java.exe"
            } else {
                "java"
            }
        )
        Report(
            "Java 21 (optional)",
            java.Length != 0 && ReadCommand(javaExecutable, []string{"-version"}).Contains("version \"21"),
            "Ubuntu 24.04: sudo apt-get install -y openjdk-21-jdk && export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64"
        )
        Console.WriteLine(
            if missing == 0 {
                "Desktop prerequisites are ready."
            } else {
                missing.ToString() + " desktop prerequisite checks need attention."
            }
        )
        Environment.ExitCode = if missing == 0 {
            0
        } else {
            1
        }
    }

    private func Report(name string, available bool, fix string) int {
        Console.WriteLine(
            (
                if available {
                    "OK   "
                } else {
                    "MISS "
                }
            ) +
                name
        )
        if !available {
            Console.WriteLine("     Fix: " + fix)
        }
        return if available {
            0
        } else {
            1
        }
    }

    private func OnPath(name string) bool -> (Environment.GetEnvironmentVariable("PATH") ?? "").Split(
        Path.PathSeparator
    )
        .Any(directory -> File.Exists(Path.Combine(directory, name)))

    private func ReadCommand(executable string, arguments[]string) string {
        try {
            let start = ProcessStartInfo(executable)
            start.RedirectStandardOutput = true
            start.RedirectStandardError = true
            for argument in arguments {
                start.ArgumentList.Add(argument)
            }
            using let process = Process.Start(start) ?? throw IOException(executable)
            let output = process.StandardOutput.ReadToEndAsync()
            let error = process.StandardError.ReadToEndAsync()
            if !process.WaitForExit(15000) {
                process.Kill(true)
                return ""
            }
            return output.Result + error.Result
        } catch {
            return ""
        }
    }
}
