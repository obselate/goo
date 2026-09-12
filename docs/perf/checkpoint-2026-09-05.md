# Local checkpoint, 2026-09-05

This checkpoint preserves accumulated renderer, input/platform, vector, API, Gallery, shader, and benchmark changes before the next API and organization review. It is a development checkpoint, not a release qualification.

Verification at checkpoint:

- Public API contract/documentation tests: 12 passed.
- Core behavior tests: 303 passed and 5 failed out of 308.
- Full strict project lint passes with the documented GL0005/GL0006 exclusions after two formatting-only corrections.
- `git diff --check` passes.
- Latest Gallery Release and Slang build passed with zero warnings/errors. Glass captures at 150%, real SDL mode/pointer/resize checks, ShaderEffect recovery, and scaled readback gates are recorded in the existing glass evidence.
- Prior CPU/RAM/GPU benchmark reports and raw evidence are included unchanged. No new benchmark or physical-Mac qualification was run for this checkpoint.

Known core failures requiring review:

1. `AccessibilityAllocationTests.ActiveAdapterScaleDirtyRowsStayWithinBudget`
2. `ClipPathInputTests.NestedClipPathsIntersect`
3. `ClipPathInputTests.TransformedClipPathsMapHits`
4. `PointerRoutingTests.ZIndexOrdersHitsWithinBounds`
5. `PointerRoutingTests.TransformsMapPointerInput`

The accessibility failure is a behavioral assertion before its allocation-budget assertion, so it is not evidence of an allocation regression. See [checkpoint test logs](https://github.com/obselate/goo/tree/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/checkpoint-2026-09-05).

API review policy: Goo is pre-1.0. Breaking changes are allowed when they improve the library. External consumers inform impact assessment but do not constrain Goo's design. Avoid unnecessary breaks.
