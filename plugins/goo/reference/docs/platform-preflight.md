# Platform preflight and troubleshooting

For publish output and asset paths, see [shipping](shipping.md).

```sh
dotnet --info
dotnet --list-sdks
```

Development requires .NET SDK 10.0.403 or a later 10.0 SDK matching the host:
`linux-x64`, `win-x64` or `osx-arm64`. The renderer requires Vulkan 1.3 with
timeline semaphores, synchronization2 and dynamic rendering.

## Platforms

Goo ships Windows x64, Linux x64, macOS arm64, Android ARM64 and Android x64 assets.

- Windows x64 is tested on Windows 11 with current vendor Vulkan drivers. The minimum supported Windows version is not yet established.
- Linux x64 requires Linux 6.6+, glibc 2.27+, native Wayland 1.18+ and a TrueType or OpenType sans-serif font. X11 and XWayland are unsupported.
- macOS arm64 requires macOS 14+ on Apple silicon. Goo bundles MoltenVK 1.4.2 and uses Apple system fonts. No Vulkan SDK is needed.
- Android requires API 33+ and Vulkan 1.3 with identity presentation support. See [Android integration](https://github.com/obselate/goo/blob/main/docs/android.md).

## Custom shaders

Only projects with `<GooShaderEffect>` items need these tools:

| Platform | Slang 2026.16 | Vulkan SDK 1.4.357.0 with `spirv-val` |
| --- | --- | --- |
| Linux x64 | [Download `.tar.gz`](https://github.com/shader-slang/slang/releases/download/v2026.16/slang-2026.16-linux-x86_64-glibc-2.27.tar.gz) | [Download `.tar.xz`](https://sdk.lunarg.com/sdk/download/1.4.357.0/linux/vulkan_sdk.tar.xz) |
| Windows x64 | [Download `.zip`](https://github.com/shader-slang/slang/releases/download/v2026.16/slang-2026.16-windows-x86_64.zip) | [Download installer](https://sdk.lunarg.com/sdk/download/1.4.357.0/windows/vulkan_sdk.exe) |
| macOS arm64 | [Download `.tar.gz`](https://github.com/shader-slang/slang/releases/download/v2026.16/slang-2026.16-macos-aarch64.tar.gz) | [Download `.zip`](https://sdk.lunarg.com/sdk/download/1.4.357.0/mac/vulkan_sdk.zip) |

Set `SLANG_SDK` and `VULKAN_SDK` to the SDK roots, or put `slangc` and `spirv-val` on `PATH`.


## Linux runtime packages

Use a native Wayland desktop session. Install the runtime libraries and a font.
These examples use Mesa for AMD or Intel GPUs.

### Arch Linux

```sh
sudo pacman -S vulkan-icd-loader wayland libxkbcommon fontconfig ttf-dejavu
sudo pacman -S vulkan-radeon
```

For Intel, use `vulkan-intel` instead of `vulkan-radeon`.

### Debian and Ubuntu

```sh
sudo apt install libvulkan1 mesa-vulkan-drivers libwayland-client0 libwayland-cursor0 libwayland-egl1 libxkbcommon0 fontconfig fonts-dejavu-core
```

### Fedora

```sh
sudo dnf install vulkan-loader mesa-vulkan-drivers wayland-libs libxkbcommon fontconfig dejavu-sans-fonts
```

For NVIDIA, install the distribution's supported NVIDIA driver with Vulkan support
instead of the Mesa driver. These packages do not install a Wayland desktop.
No shader SDK is needed to run the starter. Install
[shader tools](#custom-shaders) only for custom shader source.

## Linux checks

Run from a terminal in the native Wayland desktop session. Diagnostic tools are
optional OS packages, not Goo runtime dependencies.

```sh
uname -r
getconf GNU_LIBC_VERSION
printf 'XDG_SESSION_TYPE=%s\nWAYLAND_DISPLAY=%s\nXDG_RUNTIME_DIR=%s\n' "$XDG_SESSION_TYPE" "$WAYLAND_DISPLAY" "$XDG_RUNTIME_DIR"
test -S "$XDG_RUNTIME_DIR/$WAYLAND_DISPLAY" && printf 'Wayland socket exists\n'
wayland-info
fc-match -f '%{family}\n%{file}\n' sans-serif
env -u DISPLAY vulkaninfo --summary
env -u DISPLAY vulkaninfo | grep -E 'apiVersion|timelineSemaphore|synchronization2|dynamicRendering'
```

| Check | Expected result |
| --- | --- |
| Kernel and C library | Linux 6.6 or newer, glibc 2.27 or newer. |
| Session and socket | `XDG_SESSION_TYPE=wayland`, nonempty display/runtime directory, `Wayland socket exists`. |
| Compositor | Connected report with `wl_compositor`, `xdg_wm_base` and `wl_output`. |
| Font | A sans-serif family and an existing `.ttf` or `.otf` path. |
| Vulkan | A device with `apiVersion` 1.3 or newer and `timelineSemaphore`, `synchronization2` and `dynamicRendering` all `true`. |

Check device support, not only the Vulkan instance version. Then present a Goo frame.
`env -u DISPLAY` excludes unrelated X11 surfaces from the diagnostic.
Goo does not support X11.

## Troubleshooting

| Symptom | Check and action |
| --- | --- |
| No window or Wayland connection failure | Use the logged-in Wayland session. Remote shells and containers need authorized compositor access. XWayland is unsupported. |
| Vulkan loader, device or feature failure | Update the GPU vendor driver. Check the device, not only the loader. Virtual machines and old GPUs can lack required features. |
| `No Vulkan text font file could be resolved` | Check sans-serif resolution. Install a licensed TTF/OTF font or register one through the [font API](api/text.md). Preserve its license. |
| Missing native DLL, `.so` or `.dylib` | Check the RID. Distribute the whole publish output. |
| Asset fails after publish | Follow [asset copying and lookup](shipping.md#optional-assets). |

Include package versions, `dotnet --info`, GPU, driver, session type, launch command
and full error output in reports. Remove private data before posting.
