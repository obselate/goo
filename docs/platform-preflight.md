# Platform preflight and troubleshooting

Check [platform requirements](../README.md#platforms).
For publish output and asset paths, see [shipping](shipping.md).

```sh
dotnet --info
```

Development requires a .NET 10 SDK matching the host:
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
| Asset fails after publish | Follow [asset copying and lookup](shipping.md#ship-a-desktop-app). |

Include package versions, `dotnet --info`, GPU, driver, session type, launch command
and full error output in reports. Remove private data before posting.
