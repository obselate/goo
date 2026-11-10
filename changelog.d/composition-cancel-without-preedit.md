## Fixed

- A TextEditor no longer runs a `CancelComposition` command, and no longer calls `OnCommand` interceptors, when the platform clears a preedit that was never active. Wayland text input sends an empty preedit on focus changes, which intercepted clipboard commands could observe as spurious commands.
