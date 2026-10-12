package Goo

import System
import System.IO
import System.Runtime.InteropServices

@DllImport("goo-harfbuzz-gpu", EntryPoint: "goo_image_decode_rgba", CallingConvention: CallingConvention.Cdecl)
internal unsafe func goo_image_decode_rgba(data * uint8, length int32, out width int32, out height int32) * uint8;

@DllImport("goo-harfbuzz-gpu", EntryPoint: "goo_image_free", CallingConvention: CallingConvention.Cdecl)
internal unsafe func goo_image_free(pixels * uint8) void;

internal unsafe sealed class NativeBytes : IDisposable {
  private var pointer * uint8
  private var capacity int32
  internal var Length int32

  internal prop Bytes ReadOnlySpan[uint8]{ get -> ReadOnlySpan[uint8](pointer, Length) }

  internal init(initialCapacity int32) {
    Reserve(Math.Max(initialCapacity, 1))
  }

  private func Reserve(size int32) {
    pointer = *uint8(Marshal.ReAllocHGlobal(nint(pointer), nint(size)))
    capacity = size
  }

  internal func Tail(maximum int32) Span[uint8] {
    if capacity == Length { Reserve(int32(Math.Min(int64(capacity) * 2, int64(Int32.MaxValue)))) }
    return Span[uint8](pointer + Length, Math.Min(capacity - Length, maximum))
  }

  internal func Append(source ReadOnlySpan[uint8]) {
    source.CopyTo(Span[uint8](pointer + Length, capacity - Length))
    Length += source.Length
  }

  internal func Stream() UnmanagedMemoryStream -> UnmanagedMemoryStream(pointer, int64(Length))

  public func Dispose() {
    Marshal.FreeHGlobal(nint(pointer))
    pointer = nil
    capacity = 0
    Length = 0
  }
}

internal unsafe sealed class NativeImage : IDisposable {
  shared {
    internal func Decode(encoded ReadOnlySpan[uint8]) NativeImage {
      var width int32
      var height int32
      fixed data * uint8 = encoded {
        let pixels = goo_image_decode_rgba(data, encoded.Length, out width, out height)
        if pixels == nil { throw InvalidDataException("Image decoder returned no image") }
        if width <= 0 || height <= 0 || int64(width) * height * 4 > Int32.MaxValue {
          goo_image_free(pixels)
          throw InvalidDataException("Image decoder returned an invalid raster")
        }
        return NativeImage(pixels, width, height)
      }
    }
  }

  private var pixels * uint8
  internal let Width int32
  internal let Height int32

  internal prop Pointer * uint8{ get -> pixels }
  internal prop Pixels Span[uint8]{ get -> Span[uint8](pixels, if pixels == nil { 0 } else { Width * Height * 4 }) }

  private init(pixels * uint8, width int32, height int32) {
    this.pixels = pixels
    Width = width
    Height = height
  }

  public func Dispose() {
    goo_image_free(pixels)
    pixels = nil
  }
}
