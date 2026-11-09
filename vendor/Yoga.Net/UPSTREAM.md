# Yoga.Net provenance

- Upstream: https://github.com/chenrensong/Yoga.Net
- Pinned commit: `baf14fcd6cbf21d8930a297e32ef3b76674c37bd`
- Yoga.Net version: 3.2.3
- Meta Yoga behavior baseline: v3.2.1

## Goo-local patches

- Skip event payload construction when no subscriber exists.
- Intern `StyleLength` values in `StyleValuePool`.
- Reuse bounded, recursion-safe flex scratch lists.
- Track whether a style contains percentage lengths and invalidate cached layout
  when its owner width or height changes.
- Keep a positive node size at least one device pixel after pixel-grid rounding.

The vendored tree contains only the source needed to build Goo. Focused Goo tests
cover the local behavior changes; upstream Yoga tests remain in the upstream
repository at the pinned revision.
