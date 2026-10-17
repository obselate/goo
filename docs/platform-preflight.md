# Platform preflight and troubleshooting

Check the [platform requirements](../README.md#platforms) for Linux, Windows and
macOS. The [shipping guide](shipping.md) covers publish output and asset paths.

```sh
dotnet --info
```

For development, expect a .NET 10 SDK and the matching host architecture:
`linux-x64`, `win-x64` or `osx-arm64`.

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
```

| Check | Expected result |
| --- | --- |
| Kernel and C library | Linux 6.6 or newer, glibc 2.27 or newer. |
| Session and socket | `XDG_SESSION_TYPE=wayland`, nonempty display/runtime directory, `Wayland socket exists`. |
| Compositor | Connected report with `wl_compositor`, `xdg_wm_base` and `wl_output`. |
| Font | A sans-serif family and an existing `.ttf` or `.otf` path. |
| Vulkan | At least one device with `apiVersion` 1.3 or newer. |

The Vulkan instance version alone does not establish device or presentation support.
The final check is a Goo window that presents a frame. `env -u DISPLAY` prevents
this diagnostic from trying unrelated X11 surfaces. Goo does not support X11.

## Troubleshooting

| Symptom | Check and action |
| --- | --- |
| No window or Wayland connection failure | Launch from the logged-in Wayland session. Remote shells and containers need authorized compositor access. XWayland is not supported. |
| Vulkan loader, device or feature failure | Update the GPU vendor driver. Check device support, not just the loader version. Virtual machines and old GPUs may lack required features. |
| `No Vulkan text font file could be resolved` | Check sans-serif resolution. Install a licensed TTF/OTF font or package and register one through the [font API](api/text.md). Preserve its license. |
| Missing native DLL, `.so` or `.dylib` | Check the RID and distribute the whole publish output, not just its executable. |
| Asset fails after publish | Copy it to build and publish output and resolve it through `AppContext.BaseDirectory`. See [shipping](shipping.md). |

For a report, include package versions, `dotnet --info`, GPU and driver, session
type, launch command and complete error output. Remove private data before posting.
