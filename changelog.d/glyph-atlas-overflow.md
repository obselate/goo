## Fixed

- Allocate extra text atlas pages when active glyphs exceed the cache budget. Unused pages remain eligible for reuse. Text batches keep each page's resource identity.
