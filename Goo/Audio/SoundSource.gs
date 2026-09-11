package Goo

import System
import System.IO

/// Owns immutable interleaved mono or stereo PCM for a short UI cue.
/// Prepare sources outside input/render callbacks. Sources are limited to
/// 30 seconds, 16 MiB of float PCM, and sample rates from 8000 to 192000 Hz.
public class SoundSource {
  internal let Samples []float32

  /// Copies finite normalized samples in the range -1 through 1.
  public init(sampleRate int32, channels int32, samples []float32) {
    if Object.ReferenceEquals(samples, nil) { throw ArgumentNullException("samples") }
    Validate(sampleRate, channels, samples.Length)
    let copy = [samples.Length]float32
    for i in 0 ... samples.Length {
      let value = samples[i]
      if !Single.IsFinite(value) || value < -1.0F || value > 1.0F {
        throw ArgumentOutOfRangeException("samples", "PCM samples must be finite and normalized")
      }
      copy[i] = value
    }
    Samples = copy
    SampleRate = sampleRate
    Channels = channels
  }

  /// Gets the number of sample frames per second.
  public prop SampleRate int32{ get; private set; }
  /// Gets the channel count: one for mono or two for stereo.
  public prop Channels int32{ get; private set; }
  /// Gets the cue duration in seconds.
  public prop DurationSeconds float64{ get -> float64(Samples.Length) / float64(Channels) / float64(SampleRate) }

  shared {
    private const MaxBytes int32 = 16777216

    private func Validate(sampleRate int32, channels int32, sampleCount int32) {
      if sampleRate < 8000 || sampleRate > 192000 { throw ArgumentOutOfRangeException("sampleRate") }
      if channels != 1 && channels != 2 { throw ArgumentOutOfRangeException("channels") }
      if sampleCount <= 0 || sampleCount % channels != 0 || sampleCount > MaxBytes / 4
        || int64(sampleCount) > int64(sampleRate) * channels * 30 {
          throw ArgumentOutOfRangeException("samples", "PCM must contain complete frames within the cue size and duration limits")
        }
    }

    /// Reads a bounded PCM WAV from a caller-owned stream, which remains open.
    /// Supports unsigned 8-bit and signed 16-bit little-endian mono/stereo PCM.
    /// Throws for malformed, oversized, truncated, or unsupported input.
    public func LoadWav(stream Stream) SoundSource {
      if Object.ReferenceEquals(stream, nil) { throw ArgumentNullException("stream") }
      using let bytes = MemoryStream()
      let buffer = [65536]uint8
      while true {
        let count = stream.Read(buffer, 0, buffer.Length)
        if count == 0 { break }
        if bytes.Length + count > MaxBytes { throw InvalidDataException("WAV exceeds 16 MiB") }
        bytes.Write(buffer, 0, count)
      }
      return FromWav(bytes.ToArray())
    }

    /// Decodes a bounded PCM WAV buffer into an immutable reusable cue.
    /// Supports unsigned 8-bit and signed 16-bit little-endian mono/stereo PCM.
    public func FromWav(encoded []uint8) SoundSource {
      if Object.ReferenceEquals(encoded, nil) { throw ArgumentNullException("encoded") }
      if encoded.Length < 12 || encoded.Length > MaxBytes
        || U32(encoded, 0) != 0x46464952u || U32(encoded, 8) != 0x45564157u {
          throw InvalidDataException("Expected a RIFF/WAVE file within 16 MiB")
        }
      let end = int64(U32(encoded, 4)) + 8
      if end != encoded.Length { throw InvalidDataException("WAV RIFF length does not match the input") }
      var offset = 12
      var sampleRate = 0
      var channels = 0
      var bits = 0
      var dataOffset = -1
      var dataLength = 0
      while offset < encoded.Length {
        if encoded.Length - offset < 8 { throw InvalidDataException("Truncated WAV chunk header") }
        let kind = U32(encoded, offset)
        let length = int64(U32(encoded, offset + 4))
        offset += 8
        let next = int64(offset) + length + (length & 1)
        if next > end { throw InvalidDataException("Truncated WAV chunk") }
        if kind == 0x20746d66u {
          if sampleRate != 0 || length < 16 { throw InvalidDataException("Invalid WAV format chunk") }
          if U16(encoded, offset) != 1 { throw NotSupportedException("Only uncompressed PCM WAV is supported") }
          channels = U16(encoded, offset + 2)
          let rate = U32(encoded, offset + 4)
          if rate < 8000u || rate > 192000u { throw InvalidDataException("Unsupported WAV sample rate") }
          sampleRate = int32(rate)
          bits = U16(encoded, offset + 14)
          if (channels != 1 && channels != 2) || (bits != 8 && bits != 16) {
            throw NotSupportedException("WAV must be 8-bit or 16-bit mono or stereo PCM")
          }
          let alignment = channels * bits / 8
          if U16(encoded, offset + 12) != alignment
            || U32(encoded, offset + 8) != rate * uint32(alignment) {
              throw InvalidDataException("WAV frame alignment or byte rate is invalid")
            }
        } else if kind == 0x61746164u {
          if dataOffset >= 0 { throw InvalidDataException("Multiple WAV data chunks are unsupported") }
          dataOffset = offset
          dataLength = int32(length)
        }
        offset = int32(next)
      }
      if sampleRate == 0 || dataOffset < 0 || dataLength % (channels * bits / 8) != 0 {
        throw InvalidDataException("WAV is missing complete PCM frames or its format")
      }
      let count = dataLength / (bits / 8)
      Validate(sampleRate, channels, count)
      let samples = [count]float32
      for i in 0 ... count {
        if bits == 8 {
          samples[i] = float32(int32(encoded[dataOffset + i]) - 128) / 128.0F
        } else {
          var value = U16(encoded, dataOffset + i * 2)
          if value >= 32768 { value -= 65536 }
          samples[i] = float32(value) / 32768.0F
        }
      }
      return SoundSource(sampleRate, channels, samples)
    }

    private func U16(bytes []uint8, offset int32) int32 ->
    int32(bytes[offset]) | (int32(bytes[offset + 1]) << 8)

    private func U32(bytes []uint8, offset int32) uint32 ->
    uint32(bytes[offset]) | (uint32(bytes[offset + 1]) << 8)
    | (uint32(bytes[offset + 2]) << 16) | (uint32(bytes[offset + 3]) << 24)
  }
}
