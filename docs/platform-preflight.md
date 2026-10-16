# Platform preflight and troubleshooting

Reviewed against Goo 0.7.35 on 2026-10-16. Commands were run on Linux x64 with
.NET SDK 10.0.401. Windows and macOS requirements below are the package contract,
not a claim that this guide was executed on those systems.

## All desktop platforms

```sh
dotnet --info
```

For development, expect a .NET 10 SDK. Check `RID` and host architecture: `linux-x64`,
`win-x64`, or `osx-arm64` for the corresponding platform. A self-contained release
includes the CLR and does not require the SDK or an installed .NET runtime.
It still needs supported graphics, fonts and OS libraries.

| Platform | Required environment |
| --- | --- |
| Linux x64 | Linux 6.6 or newer, glibc 2.27 or newer, native Wayland 1.18 or newer, Vulkan 1.3 feature support, and a TrueType or OpenType sans-serif font. No X11 or XWayland fallback. |
| Windows x64 | Tested on Windows 11 with current GPU-vendor Vulkan drivers. An established minimum Windows version is not yet available. Use the x64 package and keep all packaged native DLLs. |
| macOS arm64 | macOS 14 or newer on Apple silicon. Goo bundles MoltenVK 1.4.2 and uses installed Apple system fonts. No Vulkan SDK is needed for an ordinary app. Keep packaged dylibs. Signing and notarization are separate distribution steps. |

The [shipping guide](shipping.md) provides a complete startup check.
For Android, use [Android integration](android.md), not the desktop template.

## Linux checks

Run these from a terminal in your native Wayland desktop session. Diagnostic tools
are optional OS packages, not Goo runtime dependencies. If a tool is missing,
use your distribution's supported package or driver documentation.

```sh
uname -r
getconf GNU_LIBC_VERSION
printf 'XDG_SESSION_TYPE=%s\nWAYLAND_DISPLAY=%s\nXDG_RUNTIME_DIR=%s\n' "$XDG_SESSION_TYPE" "$WAYLAND_DISPLAY" "$XDG_RUNTIME_DIR"
test -S "$XDG_RUNTIME_DIR/$WAYLAND_DISPLAY" && printf 'Wayland socket exists\n'
wayland-info
fc-match -f '%{family}\n%{file}\n' sans-serif
env -u DISPLAY vulkaninfo --summary
```

| Check | Expected result | Observed on the validation host |
| --- | --- | --- |
| Kernel | Version at least 6.6 | `7.2.9-1-cachyos` |
| C library | `glibc` version at least 2.27 | `glibc 2.44` |
| Session | `XDG_SESSION_TYPE=wayland`, nonempty Wayland display and runtime directory | `wayland`, `wayland-0`, `/run/user/1000` |
| Socket | `Wayland socket exists`, exit 0 | Passed |
| Compositor | Connected protocol report with `wl_compositor`, `xdg_wm_base` and `wl_output` | Versions 6, 6 and 4 respectively |
| Font | A sans-serif family and an existing `.ttf` or `.otf` path | `Noto Sans`, `/usr/share/fonts/noto/NotoSans-Regular.ttf` |
| Vulkan | At least one device with `apiVersion` 1.3 or newer | NVIDIA GeForce RTX 3080, `1.4.351` |

`vulkaninfo`'s instance version alone does not establish device support or the
ability to present to Wayland. Goo also requires timeline semaphores,
synchronization2, dynamic rendering and the text buffer format used by its renderer.
Swapchain maintenance is enabled only when the corresponding extensions and feature
are available.
The final check is a Goo window that presents a frame. `env -u DISPLAY` prevents
this diagnostic from trying unrelated X11 surfaces. It does not change Goo's
Wayland-only contract. This host's Vulkan summary printed display-extension
warnings but completed successfully. A plain summary with its inaccessible X11
display failed, so it is not the command recommended here.

## Troubleshooting

| Symptom | Check and action |
| --- | --- |
| `dotnet` not found or no matching SDK | Install the .NET 10 SDK for the host architecture. The template pins its G# SDK. Do not substitute a global G# compiler. |
| No window, missing Wayland socket, or connection failure | Start from the logged-in Wayland session. Do not invent a socket path or point at another user's runtime directory. An X11-only session cannot run Goo. A remote shell or container must have authorized access to a real Wayland compositor. |
| Vulkan loader/device/feature failure | Update the GPU vendor driver. Check a physical device, not just the loader version. Old integrated GPUs and virtual machines may not expose the required features. Do not force a device that lacks them. |
| `No Vulkan text font file could be resolved` | Check sans-serif resolution. Install a licensed TTF/OTF font or package and register an app-owned font through the [font API](api/text.md). Preserve font license files. |
| Missing native DLL, `.so` or `.dylib` | Confirm the RID and distribute the whole publish output. A copied executable alone is not the self-contained directory. Standard package consumers need no manual native loader shim. |
| Asset works in the project but fails after publish | Copy it to both build and publish output. Resolve paths through `AppContext.BaseDirectory`, not the working directory. See [asset recipes](build-recipes.md#copy-files-next-to-the-app). |
| Shader compiler missing or wrong version | Tools are required only for custom `GooShaderEffect` items. Use the [pinned shader tool versions](../README.md#custom-shaders). They are build tools, not end-user prerequisites. |
| macOS launch rejected | Check architecture, OS version, native sidecars and signing/notarization. A raw publish folder is not an installed application bundle. Do not disable system security to label the app supported. |
| Windows graphics failure | Check Windows x64, the vendor's Vulkan driver and the complete native DLL payload. macOS MoltenVK is not a Windows driver replacement. |

For a report, include the package versions, the `dotnet --info` output, OS and
architecture, GPU and driver, session type, exact launch command and complete
error output. Remove private paths or tokens before posting.
