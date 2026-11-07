## Fixed

- Allocate extra text atlas pages when active glyphs exceed the cache budget. After cache pressure, release pages unused for two frames once their GPU work is complete. Text batches keep each page's resource identity.
