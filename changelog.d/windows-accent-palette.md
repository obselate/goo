## Changed

- On Windows, `PlatformPreferences.AccentColor` is the system accent palette base. `AccentLight1`, `AccentLight2`, `AccentLight3`, `AccentDark1`, `AccentDark2` and `AccentDark3` expose its shades and are nil on other platforms.
- Breaking: `PlatformPreferences` deconstruction now has 13 outputs, with the six accent shades inserted before `PreferredLocales`. Update positional deconstruction.
