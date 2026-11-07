## Fixed

- Fit the whole profiler trace after Stop. The view showed the last 2 s, which was usually empty.
- Explain how to record in the empty profiler and Types views, and disable profiler view tools until a trace exists.
- Show element keys in the DevTools tree and highlight the inspected root on first open.
- Start the style override field empty with an example placeholder, and apply overrides to the inspected element.
- Disable Pick element and Capture while disconnected, and show an empty state for captures.
- Show scroll offset and content size as numbers instead of raw JSON.
- Remove the console entry for every received snapshot, and match the profiler toolbar to the Elements toolbar.
- Show the inspected element as a box diagram plus the values the app set, grouped into Layout, Style and Interaction, with defaults on request.
- Replace the profiler frame chart with a timing view: frame times against a 60 Hz budget line, nested scope tracks for the UI thread, GPU and present and DevTools, and per-frame work and allocation strips. Open the Timers table by default. Scope nesting runs off the UI thread.
- Update Goo.Widgets to 0.19.8 and use the default SplitPane pointer target, so the details divider is a 1 px line with an 8 px grab area.
