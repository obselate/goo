## Added

- Check flex border boxes against a committed Chromium reference table in the core tests. Regenerate with `python3 tests/Goo.CoreBehaviorTests/Layout/generate-flex-conformance.py`. The generator requires Chromium and uses the committed VendSans font at weight 400. CI uses neither Chromium nor the generator.
