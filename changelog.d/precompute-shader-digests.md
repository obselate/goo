## Changed

- Precompute embedded shader digests during the build so basic applications do not initialize cryptographic libraries just to name the pipeline cache or prepare built-in effects. Existing shader and cache identities are unchanged.
