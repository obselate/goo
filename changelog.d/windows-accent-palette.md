## Changed

- `PlatformPreferences.AccentColor` on Windows is now the system accent palette base (the shell `AccentPalette`), not the DWM window colorization color. New nullable `AccentLight1`, `AccentLight2`, `AccentLight3`, `AccentDark1`, `AccentDark2` and `AccentDark3` expose the remaining palette shades on Windows; they are nil on other platforms.
