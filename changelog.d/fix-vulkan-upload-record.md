## Fixed

- Keep Vulkan frame submissions from failing when another window has image uploads that are queued but not recorded.
- Keep closing or hiding a window with a deferred frame from failing while another window has recorded image uploads in flight.
