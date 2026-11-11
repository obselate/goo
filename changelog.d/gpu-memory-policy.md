## Changed

- GPU caches follow the driver memory budget. Without budget support, Goo uses half of each heap for cache growth.
- Goo evicts unused GPU resources and retries failed allocations once. Images that do not fit are skipped. Repeated frame allocation failures wait for new work instead of keeping the render loop busy.
- GPU diagnostics add `heapHeadroom`, `memoryEvictionCount`, `memoryAllocationRetryCount`, `memoryPressureCount` and `textAtlasPressureFailureCount`. They remove `imageByteBudget`, `textAtlasByteBudget`, `textAtlasPeakByteBudget` and `layerPoolByteBudget`.
