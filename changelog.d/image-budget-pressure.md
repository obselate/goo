## Fixed

- Showing more images than the GPU image budget holds no longer crashes with `Vulkan image current reference is not registered`. Images drawn in a frame stay resident for that frame. Images that do not fit are skipped until space frees, and diagnostics report each refusal as `imagePressureFailureCount`.
