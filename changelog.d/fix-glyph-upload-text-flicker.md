## Fixed

- Draw text with newly rasterized glyphs in the same frame that uploads them. A frame no longer waits for a separate glyph upload submission before it presents changed text, and a frame whose glyphs are still uploading from an earlier submission waits for that upload instead of presenting without the text. (#439)
