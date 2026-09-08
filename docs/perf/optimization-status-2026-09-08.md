# Approved optimization scope

The user retained these six changes and requested removal of the two Gallery experiments without replacement machinery.

| Retained change | Main commit |
| --- | --- |
| Correct retained text record copy bounds | `e5b6a5e` |
| Reuse equivalent button default styles | `e2c922e` |
| Skip image bookkeeping when no work is pending | `31e34d6` |
| Grow image staging from upload demand | `f46cb18` |
| Update shader parameters without rebuilding Gallery | `517dee3` |
| Grow clip atlas layers from placement demand | `2cc6358` |

## Removed

- Lazy Gallery math and shader asset creation from `d1e10d4`. Asset construction returns to its earlier eager behavior.
- All Gallery category changes from `fd104fa`, including smaller rebuild regions, retained cards, visibility coordination and revision bookkeeping.

The three affected files exactly match their versions at `2cc6358`. No core renderer file or shader-parameter update was reverted. No loading buffer, background preparation, creation queue or replacement caching policy was added.

## Verification

- All three restored source files match `2cc6358` byte for byte. The six approved changes remain intact.
- Strict lint passes for the changed files. The SDK Release build passes with zero warnings and errors. Whole-Gallery strict lint reports existing documentation warnings in other files.
- Gallery smoke passes nine showcases, two sizes, four routes, input, paging, 180 shader frames and two window closes with Khronos validation enabled. Vulkan error counters and final live object count are zero.
- No new benchmark claim is made. [Verification and logs](evidence/gallery-rollback-2026-09-08/verification.json).

## Known baseline limitation

The original Gallery implementation has an archived `ElementHandle` attachment failure after a reset/toggle/category interaction sequence. The rollback restores that original implementation. The standard Gallery smoke does not cover this entire sequence. This remains a separate correctness issue, not an accepted reason to retain the rejected optimization.

Prior allocation/residency and category reports remain historical. Their combined timings and memory results must not be presented as new measurements of the post-rollback tree.
