## Added

- `State[T]` tracks reads in Cell builds and retained builders. Changed values invalidate their readers. Equal writes do nothing.
- Window state, focus, size, scale, preferences, modifiers and text-focus getters track their Cell and retained-builder readers. Changes rebuild only readers of the changed value.
