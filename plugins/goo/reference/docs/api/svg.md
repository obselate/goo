# Svg API

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/Svg`](https://github.com/obselate/goo/tree/4a2e1ee93e7a97f720f6f504d3777a20b15389d8/Goo/Svg)

## `Svg`

Source:

- [`Svg.gs`](https://github.com/obselate/goo/blob/4a2e1ee93e7a97f720f6f504d3777a20b15389d8/Goo/Svg/Svg.gs)

Loads SVG sources as reusable vector assets.

### `Load(System.IO.Stream)`

Loads SVG from the current stream position and leaves the stream open.

- `stream`: The readable SVG source.

Returns: The reusable vector asset.

### `Load(string)`

Loads an SVG file into a vector asset.

- `path`: The SVG file path.

Returns: The reusable vector asset.

### `Parse(string)`

Parses SVG text into a vector asset.

- `source`: The SVG document text.

Returns: The reusable vector asset.

## `SvgParseException`

Source:

- [`Svg.gs`](https://github.com/obselate/goo/blob/4a2e1ee93e7a97f720f6f504d3777a20b15389d8/Goo/Svg/Svg.gs)

Reports invalid or unsupported SVG content.

### `new(string,System.Exception)`

Creates an SVG parse failure with an optional inner exception.

- `message`: The parse failure description.
- `innerException`: The optional underlying failure.
