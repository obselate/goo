# Text API

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/Text`](https://github.com/obselate/goo/tree/main/Goo/Text)

## `FontSource`

Source:

- [`FontSource.gs`](https://github.com/obselate/goo/blob/main/Goo/Text/FontSource.gs)

Owns one font face and its registration state.

### `new(string,int32,bool,System.Byte[])`

Creates a font source for the default face and variation set.

### `new(string,int32,bool,System.Byte[],System.UInt32,FontVariation[])`

Creates a font source for a face and variation set.

### `Dispose`

Releases the source and unregisters it when necessary.

### `FromPath(string,int32,bool,string)`

Creates an unregistered font source by reading a file of at most 64 MiB. The source owns the bytes and does not retain an open file.

### `FromPath(string,int32,bool,string,System.UInt32,FontVariation[])`

Creates an unregistered file-backed font source for a face and variation set. Reads at most 64 MiB and owns the bytes independently of the file.

### `Register`

Registers the source with Goo's font registry.

### `FaceIndex`

Gets the face index in the font bytes.

### `Family`

Gets the canonical family name.

### `IsDisposed`

Gets whether the source has been disposed.

### `IsRegistered`

Gets whether the source is registered and usable.

### `Italic`

Gets whether the font is italic.

### `Variations`
