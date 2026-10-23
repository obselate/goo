package Goo

import System
import System.IO

/// Owns immutable interleaved mono or stereo PCM for a short UI cue.
/// Prepare outside input/render callbacks. Limits: 30 seconds, 16 MiB of float PCM, 8000 through 192000 Hz.
public class SoundSource {
    internal let Samples[]float32

    /// Copies finite samples and clamps them to -1 through 1. Non-finite input throws.
    public init(sampleRate int32, channels int32, samples[]float32) {
        if Object.ReferenceEquals(samples, nil) {
            throw ArgumentNullException("samples")
        }
        Validate(sampleRate, channels, samples.Length)
        let copy = [samples.Length]float32
        for i in 0 ... samples.Length {
            copy[i] = Clamp(samples[i])
        }
        Samples = copy
        SampleRate = sampleRate
        Channels = channels
    }

    private init(samples[]float32, sampleRate int32, channels int32) {
        Samples = samples
        SampleRate = sampleRate
        Channels = channels
    }

    /// Gets sample frames per second.
    public prop SampleRate int32 {
        get;
        private set;
    }

    /// Gets one for mono or two for stereo.
    public prop Channels int32 {
        get;
        private set;
    }

    /// Gets cue duration in seconds.
    public prop DurationSeconds float64 {
        get -> float64(Samples.Length) / Channels / SampleRate
    }

    shared {
        private const MaxBytes int32 = 16777216

        internal func ValidateFormat(sampleRate int32, channels int32) {
            if sampleRate < 8000 || sampleRate > 192000 {
                throw ArgumentOutOfRangeException("sampleRate")
            }
            if channels != 1 && channels != 2 {
                throw ArgumentOutOfRangeException("channels")
            }
        }

        internal func Clamp(value float32) float32 {
            if !Single.IsFinite(value) {
                throw ArgumentOutOfRangeException("samples", "PCM must be finite")
            }
            return Math.Clamp(value, -1.0F, 1.0F)
        }

        private func Validate(sampleRate int32, channels int32, count int32) {
            ValidateFormat(sampleRate, channels)
            if count <= 0 || count % channels != 0 || count > MaxBytes / 4
            || int64(count) > int64(sampleRate) * channels * 30 {
                throw ArgumentOutOfRangeException("samples", "PCM exceeds cue size or duration limits")
            }
        }

        /// Reads a RIFF WAV, leaving the caller's stream open. Checks the 16 MiB limit before allocation.
        /// Supports 8/16/24-bit PCM and 32-bit float, including WAVE_FORMAT_EXTENSIBLE.
        /// Throws for malformed, oversized, truncated or unsupported input.
        public func LoadWav(stream Stream) SoundSource {
            if Object.ReferenceEquals(stream, nil) {
                throw ArgumentNullException("stream")
            }
            let header = [12]uint8
            stream.ReadExactly(header, 0, header.Length)
            let length = int64(U32(header, 4)) + 8
            if U32(header, 0) != 0x46464952u || U32(header, 8) != 0x45564157u
            || length < 12 || length > MaxBytes {
                throw InvalidDataException("Expected RIFF/WAVE within 16 MiB")
            }
            let encoded = [int32(length)]uint8
            Array.Copy(header, encoded, header.Length)
            stream.ReadExactly(encoded, 12, encoded.Length - 12)
            if stream.ReadByte() != -1 {
                throw InvalidDataException("WAV has trailing data")
            }
            return FromWav(encoded)
        }

        /// Decodes 8/16/24-bit PCM or 32-bit float RIFF WAV, including EXTENSIBLE, within 16 MiB.
        /// Finite samples are clamped. Non-finite float samples throw.
        public func FromWav(encoded[]uint8) SoundSource {
            if Object.ReferenceEquals(encoded, nil) {
                throw ArgumentNullException("encoded")
            }
            if encoded.Length < 12 || encoded.Length > MaxBytes
            || U32(encoded, 0) != 0x46464952u || U32(encoded, 8) != 0x45564157u {
                throw InvalidDataException("Expected RIFF/WAVE within 16 MiB")
            }
            let end = int64(U32(encoded, 4)) + 8
            if end != encoded.Length {
                throw InvalidDataException("WAV RIFF length does not match input")
            }
            var offset = 12
            var sampleRate = 0
            var channels = 0
            var bits = 0
            var format = 0
            var dataOffset = -1
            var dataLength = 0
            while offset < encoded.Length {
                if encoded.Length - offset < 8 {
                    throw InvalidDataException("Truncated WAV chunk header")
                }
                let kind = U32(encoded, offset)
                let length = int64(U32(encoded, offset + 4))
                offset += 8
                let next = int64(offset) + length + (length & 1)
                if next > end {
                    throw InvalidDataException("Truncated WAV chunk")
                }
                if kind == 0x20746d66u {
                    if sampleRate != 0 || length < 16 {
                        throw InvalidDataException("Invalid WAV format chunk")
                    }
                    format = ReadFormat(encoded, offset, int32(length))
                    channels = U16(encoded, offset + 2)
                    let rate = U32(encoded, offset + 4)
                    if rate < 8000u || rate > 192000u {
                        throw InvalidDataException("Invalid WAV sample rate")
                    }
                    sampleRate = int32(rate)
                    bits = U16(encoded, offset + 14)
                    if (channels != 1 && channels != 2)
                    || (format == 1 && bits != 8 && bits != 16 && bits != 24)
                    || (format == 3 && bits != 32) {
                        throw NotSupportedException("Expected mono/stereo 8/16/24-bit PCM or 32-bit float")
                    }
                    let alignment = channels * bits / 8
                    if U16(encoded, offset + 12) != alignment
                    || U32(encoded, offset + 8) != rate * uint32(alignment) {
                        throw InvalidDataException("Invalid WAV alignment or byte rate")
                    }
                } else if kind == 0x61746164u {
                    if dataOffset >= 0 {
                        throw InvalidDataException("Multiple WAV data chunks")
                    }
                    dataOffset = offset
                    dataLength = int32(length)
                }
                offset = int32(next)
            }
            if sampleRate == 0 || dataOffset < 0 || dataLength % (channels * bits / 8) != 0 {
                throw InvalidDataException("WAV is missing complete frames or its format")
            }
            let count = dataLength / (bits / 8)
            Validate(sampleRate, channels, count)
            let samples = [count]float32
            for i in 0 ... count {
                let start = dataOffset + i * (bits / 8)
                samples[i] = DecodeSample(encoded, start, bits, format)
            }
            return SoundSource(samples, sampleRate, channels)
        }

        private func ReadFormat(bytes[]uint8, offset int32, length int32) int32 {
            var format = U16(bytes, offset)
            if format == 0xFFFE {
                if length < 40 || U16(bytes, offset + 16) < 22
                || U16(bytes, offset + 16) > length - 18 {
                    throw NotSupportedException("Unsupported WAV extensible format")
                }
                format = int32(U32(bytes, offset + 24))
                let validBits = U16(bytes, offset + 18)
                let bits = U16(bytes, offset + 14)
                if validBits <= 0 || validBits > bits || (format == 3 && validBits != 32) {
                    throw InvalidDataException("Invalid WAV valid-bit count")
                }
                if U32(bytes, offset + 28) != 0x00100000u
                || U32(bytes, offset + 32) != 0xAA000080u || U32(bytes, offset + 36) != 0x719B3800u {
                    throw NotSupportedException("Unsupported WAV subformat")
                }
                let mask = U32(bytes, offset + 20)
                let channels = U16(bytes, offset + 2)
                if mask != 0u && !(channels == 1 && mask == 4u) && !(channels == 2 && mask == 3u) {
                    throw NotSupportedException("Unsupported WAV channel layout")
                }
            }
            if format != 1 && format != 3 {
                throw NotSupportedException("Compressed WAV is not supported")
            }
            return format
        }

        private func DecodeSample(bytes[]uint8, start int32, bits int32, format int32) float32 {
            if format == 3 {
                return Clamp(BitConverter.Int32BitsToSingle(int32(U32(bytes, start))))
            }
            if bits == 8 {
                return float32(int32(bytes[start]) - 128) / 128.0F
            }
            var value = U16(bytes, start)
            if bits == 16 {
                if value >= 32768 {
                    value -= 65536
                }
                return float32(value) / 32768.0F
            }
            value |= int32(bytes[start + 2]) << 16
            if value >= 8388608 {
                value -= 16777216
            }
            return float32(value) / 8388608.0F
        }

        private func U16(bytes[]uint8, offset int32) int32 ->
        int32(bytes[offset]) | (int32(bytes[offset + 1]) << 8)

        private func U32(bytes[]uint8, offset int32) uint32 ->
        uint32(bytes[offset]) | (uint32(bytes[offset + 1]) << 8)
        | (uint32(bytes[offset + 2]) << 16) | (uint32(bytes[offset + 3]) << 24)
    }
}
