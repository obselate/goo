# Goo.Accessibility

Optional AccessKit C 0.23.0 native runtimes for Goo's `NativeAccessibilityAdapter`.
Add this package alongside Goo, then assign the adapter before opening a window:

```gsharp
let window = Window{
    Title: "My app",
    AccessibilityAdapter: NativeAccessibilityAdapter(),
    Root: MyApp{},
}.Open()
```

The native runtime is only loaded when queried or attached. `IsAvailable` reports
whether the versioned library can load. The adapter binds one window, releases
native objects on close or replacement, and can be disposed on the owner thread.
Embedded hosts keep their own adapters. Native actions are copied before being
posted to Goo's UI thread; stale or unsupported actions are rejected by the
retained semantic tree. Custom `AccessibilityAdapter` implementations remain supported.

Payloads: Linux x64 (glibc 2.27 baseline), Windows x64/arm64, and macOS x64/arm64.
Linux is built from the pinned source with `.github/scripts/build-accesskit-linux-x64.sh`;
other payloads come from the upstream checksum-pinned release. `native-build.json`
records source and binary hashes. AccessKit is MIT OR Apache-2.0 licensed.

The Linux payload applies `atspi-cache-signal-arguments.patch`: AT-SPI cache
notifications carry one struct argument instead of flattening it into separate
D-Bus arguments. This keeps native client caches consistent on node insertion
and removal. The native inspector test validates both wire signatures.
