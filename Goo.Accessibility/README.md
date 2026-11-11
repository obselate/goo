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

See the [native accessibility API](https://github.com/obselate/goo/blob/main/docs/api/accessibility.md) for adapter lifetime and owner-thread rules.

Payloads: Linux x64 (glibc 2.27 baseline), Windows x64/arm64, and macOS x64/arm64.
Linux is built from the pinned source with `.github/scripts/build-accesskit-linux-x64.sh`;
other payloads come from the upstream checksum-pinned release. `native-build.json`
records source and binary hashes. AccessKit is MIT OR Apache-2.0 licensed.

Copyright 2023 The AccessKit Authors. All rights reserved.
Derived portions: Copyright (c) 2021 Jacob Hoffman-Andrews.
The package includes `LICENSE-MIT` and `LICENSE-APACHE`.
See [native-build.json](https://github.com/obselate/goo/blob/main/Goo.Accessibility/native-build.json) for pinned source and payload hashes.
