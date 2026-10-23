package Goo

import System
import System.IO
import System.Threading

internal class BoundedInput {
  shared {
    internal func ReadFile(path string, limitBytes int32, what string) []uint8 {
      using let stream = File.OpenRead(path)
      return ReadAll(stream, limitBytes, what)
    }

    internal func ReadAll(stream Stream, limitBytes int32, what string) []uint8 ->
    ReadAll(stream, limitBytes, what, Array.Empty[uint8]())

    internal func ReadAll(stream Stream, limitBytes int32, what string, prefix []uint8) []uint8 {
      if limitBytes < 0 { throw ArgumentOutOfRangeException("limitBytes") }
      if prefix.Length > limitBytes { throw InvalidDataException("$what exceeds $limitBytes bytes") }
      var capacity = Math.Max(prefix.Length, Math.Min(65536, limitBytes))
      if stream.CanSeek {
        let remaining = stream.Length - stream.Position
        if remaining > limitBytes - prefix.Length { throw InvalidDataException("$what exceeds $limitBytes bytes") }
        capacity = int32(Math.Max(0L, remaining)) + prefix.Length
      }
      var bytes = [capacity]uint8
      if prefix.Length != 0 { Array.Copy(prefix, bytes, prefix.Length) }
      var length = prefix.Length
      while true {
        if length == bytes.Length {
          let next = stream.ReadByte()
          if next < 0 { break }
          if length == limitBytes { throw InvalidDataException("$what exceeds $limitBytes bytes") }
          let size = int32(Math.Min(int64(limitBytes), Math.Max(int64(length) + 1, int64(length) * 2)))
          Array.Resize[uint8](ref bytes, size)
          bytes[length] = uint8(next)
          length++
        } else {
          let count = stream.Read(bytes, length, Math.Min(65536, bytes.Length - length))
          if count == 0 { break }
          length += count
        }
      }
      if length != bytes.Length { Array.Resize[uint8](ref bytes, length) }
      return bytes
    }

    internal func ReadAll(stream Stream, limitBytes int32, what string, token CancellationToken) NativeBytes {
      if limitBytes < 0 { throw ArgumentOutOfRangeException("limitBytes") }
      token.ThrowIfCancellationRequested()
      var capacity = Math.Max(1, Math.Min(65536, limitBytes))
      if stream.CanSeek {
        let remaining = stream.Length - stream.Position
        if remaining > limitBytes { throw InvalidDataException("$what exceeds $limitBytes bytes") }
        capacity = int32(Math.Max(1L, remaining))
      }
      let bytes = NativeBytes(capacity)
      try {
        while true {
          token.ThrowIfCancellationRequested()
          if bytes.Length == limitBytes {
            if stream.ReadByte() >= 0 { throw InvalidDataException("$what exceeds $limitBytes bytes") }
            break
          }
          if bytes.Length == capacity {
            let next = stream.ReadByte()
            if next < 0 { break }
            let tail = bytes.Tail(1, limitBytes)
            tail[0] = uint8(next)
            bytes.Length++
            capacity = int32(Math.Min(int64(capacity) * 2, int64(limitBytes)))
            continue
          }
          let count = stream.Read(bytes.Tail(Math.Min(65536, limitBytes - bytes.Length), limitBytes))
          if count == 0 { break }
          bytes.Length += count
        }
        return bytes
      } catch {
        bytes.Dispose()
        rethrow
      }
    }
  }
}
