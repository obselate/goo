# Goo 0.5.0 release preparation

The candidate includes the [post-checkpoint fixes](post-checkpoint-2026-09-05.md) and [non-UAT implementation](non-uat-followup-2026-09-05.md). Versioned packages, templates, tools, and onboarding text use 0.5.0. The changelog records API migration details and measured performance limits.

## Release corrections

- Linux CI now invokes sampled-image readback, liquid-glass alpha, and shader-effect replacement/recovery gates.
- Image readback uses expected pixel regions instead of a GPU-specific golden hash. Nearest and linear sampling must differ within a run, and linear output must survive resource rehydration unchanged. The old broken sampled-image shader fails the portable region assertions.
- macOS SDL and text-native builds explicitly target 14.0, matching the existing minimum-version promise. The package validator checks Mach-O architecture, minimum OS, install names, dependency policy, and current text-native provenance. The cached macOS candidate requires 15.0 and is rejected.
- The final review merged the published 0.4.2 macOS fixes. Gallery compiles shaders natively with the pinned macOS arm64 Slang compiler. The temporary cross-host artifact path was removed because upstream native compilation already provides this capability.

## Verification and release boundary

Local 0.5.0 verification passes 317 Core tests, 12 API/documentation tests, 10 SVG tests, and the three new native CI gates on lavapipe with Khronos validation. The portable image assertion rejects the old shader as a negative control.

The initial evidence includes a precompiled Gallery artifact experiment. That path was removed during the final review after fetching the native macOS compiler support in 0.4.2. Those archived checks describe the earlier candidate, not the final release path. API regeneration, strict G# lint, canonical ShaderGen checks, workflow shell syntax, and the dependency-vulnerability gate passed on that candidate. Current verification is recorded in the [final review](final-release-review-2026-09-05.md).

The [verification summary](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/release-0.5.0/verification.json), [file hashes](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/release-0.5.0/files.json), and [raw evidence archive](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/release-0.5.0/verification.tar.gz) preserve local results. Extract the archive into a temporary directory. The expected old-shader failure is recorded separately from successful gates.

These local checks do not qualify a complete release package. A fresh hosted macOS build must produce the corrected native payloads. The existing dependent Linux CI job must then pack and validate all six packages, install and build the generated template, install the developer tools, publish managed and NativeAOT package consumers, and validate native dependencies, symbols, checksums, and bundle size.

Tag only after those jobs pass on the candidate commit. Physical-Mac UAT remains deferred. No new hardware support or broad performance claim is introduced by release preparation.
