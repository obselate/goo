# Goo code conventions

These rules apply to maintained source, tests, examples, templates and repository tools.

## General

- Write the smallest readable change. No hacks or minification.
- Add no helper, abstraction, file or dependency unless the change needs it.
- Use comments only for generated API documentation.
- Keep owned methods in their type. Avoid unnecessary allocation, copying and computation.
- Use [native authoring](docs/native-authoring.md) for Goo construction and spread rules.
- Use [contributing](CONTRIBUTING.md) for setup, verification and release workflow.

## Layout and spacing

- Use the upstream formatter pinned by `bootstrap.sh`, not a system formatter.
- Use four-space indentation and a 120-column budget in formatted source.
- Keep existing core layout. Do not run a bulk formatter over core source.
- Put one blank line between type members, including members in a `shared` block. Keep related fields together.
- Put one blank line between function steps: setup, validation, loops or branches, effects and the result.
- Do not put a blank line after `{` or before `}`. Do not use consecutive blank lines.
- The column budget is not a function-length limit.

## Function size

- Keep functions at 120 lines or fewer.
- Split long functions at real steps. Use private functions named for those steps.
- Preserve behavior and effect order. Formatting does not resolve long functions.

## Ownership and permitted references

Folders are not assembly boundaries. Classify shared values and contracts separately from operations. Partial declarations keep the ownership of their type.

| Layer, lower first | Owns | May reference |
| --- | --- | --- |
| Values/contracts in Style, Shapes, Text, Input, Audio, Platform | Geometry, styles, document positions, events, sound data, host contracts | Other shared values/contracts. No concrete renderer, SDL or diagnostics implementation. |
| Tree/Cell | Retained nodes, declarations, identity, reconciliation | Values and explicit lifecycle contracts. No concrete Vulkan or SDL state. |
| Layout, Style resolution, Motion | Measure, arrange, style application, animation scheduling | Retained model, shared geometry, neutral shaping. |
| Rendering/Text | Unicode, CPU shaping, fonts/typefaces, visual text geometry | Text contracts and neutral font lookup. No Vulkan device/surface or GPU encoding ownership. |
| Input and semantic Accessibility | Hit tests, focus, editing, semantic snapshots | Retained model, Layout, shared visual geometry. No concrete Vulkan or SDL hosts. |
| Rendering and Vulkan | Paint planning, GPU resources, submission, readback, draw/paint encoding | Retained/resolved state, shared geometry, neutral shaping/render contracts. |
| Platform/Sdl and native accessibility adapters | OS/SDL lifecycle, devices, input delivery, AccessKit | Host contracts and required native dependencies. Native adapters may reference native hosts. |
| Window/WindowParts | Composition, concrete creation/bootstrap, lifecycle | All systems through contracts. Keep concrete creation in bootstrap/host parts. |
| Diagnostics/DevTools | Inspection, request parsing/transport, overlays | Owner-provided inspection/override hooks. Inspected systems must not call diagnostics parsing/transport. |

- `Rendering/TransformGeometry.gs` is shared geometry. Input may use it without a GPU dependency.
- `DiagnosticOverlay` is a rendering feature contract. WindowHost and Vulkan may use it without a diagnostics transport dependency.
- Native AccessKit adapters may use SdlHost. SDL audio adapters may use audio contracts.
- Keep SDL host operations in Platform/Sdl, Window lifecycle in WindowParts and native accessibility translation in its adapter.
- Shared neutral contract cycles are permitted. Do not infer forbidden calls from folder names or identifier counts.
- Review ownership manually. This table does not claim that existing code has no violations. Do not add assemblies or forwarding interfaces to enforce it.

## Data and formats

- Give each stored or exchanged format one typed record and one parser.
- State required fields and optional defaults. Reject missing or invalid required fields at parse time with a domain-owned typed failure.
- Read typed properties, not repeated field-name strings.
- Preserve stored and wire bytes when compatibility requires them. Existing data must still load.
- Use data types only when SDK 0.5.26 and the actual serializer and NativeAOT path support them.

## Errors and delivery

- Return expected operation and environment failures as domain-owned typed results with stable status or code and bounded detail.
- Reuse `WindowOperationResult` and `FileDialogStatus`/`FileDialogResult` where they fit. Do not add a universal result type.
- Return failures and progress through existing contracts, callbacks or events. Core does not print, prompt or interpret CLI flags.
- Window and host composition route failures. Consumer apps and tools own presentation.
- Keep documented argument, disposed-object and owner-thread misuse exceptions. Do not replace them with `false` or `nil`.
- Use plain `Exception` only for internal invariant bugs. Catch specific exception types.
- Use a catch-all only at a terminal callback or application boundary that must prevent unmanaged escape. Record a typed failure and do required cleanup.
- Do not suppress lower-layer failures or report failed work as success.

## Constants

- Use `const` for compile-time values. Use a shared `let` only when `const` is not possible.
- Name limits, durations, sizes, protocol identifiers, reference prefixes, URLs and values used in two or more places.
- Keep obvious local literals inline, including `0`, `1`, index offsets and single-use unit conversions.
- Put each constant in the type that owns its rule. Do not add a global constants file.
- Include meaning and units in names, for example `TimeoutMilliseconds` or `MaxImageBytes`.

## G# idioms

Use only forms supported by `Gsharp.NET.Sdk` 0.5.26. Authority order: pinned compiler and tests, language spec, accepted ADRs, conformance samples, then authoring prose.

| Use | Instead of |
| --- | --- |
| `func F() T -> expr` | A body with only `return expr` |
| `let` | A `var` that is not reassigned or mutated by reference |
| `const` | A compile-time value in a `let` or a repeated literal |
| `(x) -> expr`, `x -> expr`, `(a, b) -> { ... }` | Older lambda forms |
| `f(name: value)` | `f(name = value)` |
| `for x in xs`, `for i in a ... b` | Index-heavy loops |
| `nil`, `T?`, `??`, `??=`, `if let`, `guard let` | Manual null checks |
| `if value is T { ... }`, `case v is T:` | A cast after a type test |
| `if` and `switch` expressions | A temporary assigned in each branch |
| `List[T].Add` or a pre-sized array | Slice `append` in a loop |
| `map[K, V]{...}` | Mixed map construction forms |
| A direct CLR call | A wrapper that only forwards to .NET |
| `int32`, `int64` in signatures | Width-free aliases |
| `chan`, `go`, `select`, `scope`, `lock` | CLR threading primitives where ownership and thread semantics permit replacement |

- Use `operator implicit(value)` and `operator explicit(value)`. Keep a space before symbolic operator parameter lists.
- The compiler rejects retired `len`, `cap`, `append`, `delete` and `close` built-ins. Use their member replacements.
- Keep internal delegate fields for observer hooks while the pinned compiler emits `internal event` accessors as public metadata.
- Do not rewrite native callbacks, locks or thread ownership to satisfy a syntax preference.

## Verification and public API

- Run the [focused managed checks](CONTRIBUTING.md#verification) and a Release build with warnings as errors for code changes.
- Run the affected behavior checks and required native, renderer, package or NativeAOT checks. Formatting alone does not verify behavior.
- Add a test only for a deterministic end-to-end regression path.
- Strict `Goo.Gslint` enforces GL0002/3/4/7/8/10/11. GL0001 checks formatting for samples and templates, not core or tests.
- Review GL0005 manually. API contract tests enforce product documentation, not public test-fixture documentation under GL0006.
- Review function size, comments, ownership, error semantics and constant meaning manually. The linter does not enforce these rules.
- Use the pinned `gsfmt --check` for G# tools.
- For public API changes, update `tests/Goo.ApiContractTests/PublicApi.approved.txt` and source XML documentation. Do not commit regenerated API pages or the plugin reference bundle in PRs, because `main` syncs them after merge.
- Internal file moves must leave the approved public surface unchanged. Do not add compatibility aliases for internal moves.

## User files and native assets

- Never delete ignored files automatically or run `git clean -X` on a user checkout.
- Show a cleanup preview with sizes and get confirmation before deletion.
- Keep native build inputs, version pins and test fixtures out of user paths. Use pinned native payloads for qualification.
