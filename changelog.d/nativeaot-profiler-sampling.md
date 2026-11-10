## Fixed

- The NativeAOT profiler smoke enables the runtime events required by its allocation assertions. The disabled build verifies an explicit unavailable result. Profiler protocol documentation explains the app opt-in and unavailable Types row.
- Allocation samples retain aggregate counts and sampled bytes when the runtime omits type names. DevTools reports the type breakdown as unavailable instead of showing `NULL` as a type.
