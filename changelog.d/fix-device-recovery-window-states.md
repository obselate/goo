## Fixed

- Keep unshown Wayland windows alive during device recovery and drain startup work before clearing Vulkan state.
- Defer swapchain recreation for zero surface extents and resume presentation when the extent becomes non-zero.
