## Changed

- **Windows Consolas font resolution (`#1036`)**: Extended `FileSystemFontResolver` to resolve `consola.ttf`, `consolab.ttf`, `consolai.ttf`, and `consolaz.ttf` stems for `"Consolas"` (weights `400`/`700`, regular/italic/bold-italic) and `"monospace"`, with unit tests in `SystemFontResolverTests`.
- **Vulkan runtime hygiene & teardown cleanup**: Removed multithread-unsafe `setenv`/`unsetenv` mutations from `VulkanDiagnostics.StartupReport`, deleted dead `PresentationLatency`, `fatalExtensions`, dead `LiveObjectCount`, and write-only retention counters (preserving live `RetainedText*Count` metrics), disposed retained path identities on `MarkTeardownFailed`, and removed `VulkanSharedLease` forwarding boilerplate.
- **Indexed Vulkan diagnostic counters**: Replaced 136 duplicated diagnostic counter fields, mutators, snapshot properties, and JSON interpolations with a `VulkanCounterId`-indexed table.
- **Pruned Vulkan ABI & typed `Vk*` handles**: Pruned 531 dead `VK_*` constants and 25 dead type aliases from `Vulkan.Abi`, and replaced all 27 live `Vk*` handle aliases with `@StructLayout(LayoutKind.Sequential)` strongly typed handle structs.
