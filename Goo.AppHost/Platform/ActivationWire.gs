package Goo

import System
import System.Buffers.Binary
import System.IO
import System.Text

internal class ActivationWire {
    shared {
        internal const MaxBytes int32 = 2 * ApplicationActivation.MaxRequestBytes
        private const Magic int32 = 0x314F4F47
        private let utf8 UTF8Encoding = UTF8Encoding(false, true)

        internal func Encode(value ApplicationActivation) MemoryStream {
            let stream = MemoryStream()
            try {
                using let writer = BinaryWriter(stream, utf8, true)
                if value.Kind < ApplicationActivationKind.Launch || value.Kind > ApplicationActivationKind.Notification {
                    throw ArgumentException("Unknown activation kind")
                }
                if value.Documents == nil || value.Arguments == nil
                    || value.Documents.Count > ApplicationActivation.MaxItems
                    || value.Arguments.Count > ApplicationActivation.MaxItems {
                    throw ArgumentException("Activation collections exceed their limits")
                }
                if value.Kind == ApplicationActivationKind.OpenUri && value.Target == nil {
                    throw ArgumentException("OpenUri requires a target")
                }
                var bytes int32 = 0
                writer.Write(Magic)
                writer.Write(int32(value.Kind))
                if let target = value.Target { WriteUri(writer, target, ref bytes) }
                else { WriteText(writer, "", ref bytes) }
                writer.Write(value.Documents.Count)
                for i in 0 ... value.Documents.Count { WriteUri(writer, value.Documents[i], ref bytes) }
                writer.Write(value.Arguments.Count)
                for i in 0 ... value.Arguments.Count { WriteText(writer, value.Arguments[i], ref bytes) }
                WriteText(writer, value.WorkingDirectory, ref bytes)
                WriteText(writer, value.NotificationId, ref bytes)
                WriteText(writer, value.ActionId, ref bytes)
                WriteText(writer, value.Payload, ref bytes)
                writer.Flush()
                return stream
            } catch (_ Exception) {
                stream.Dispose()
                rethrow
            }
        }

        internal func Decode(data []uint8, length int32) ApplicationActivation {
            var offset int32 = 0
            if ReadInt32(data, length, ref offset) != Magic { throw InvalidDataException("Unknown activation format") }
            let kind = ReadInt32(data, length, ref offset)
            if kind < int32(ApplicationActivationKind.Launch) || kind > int32(ApplicationActivationKind.Notification) {
                throw InvalidDataException("Unknown activation kind")
            }
            let targetText = ReadText(data, length, ref offset)
            let target Uri? = if targetText.Length == 0 { nil } else { ReadUri(targetText) }
            let documentCount = ReadInt32(data, length, ref offset)
            if documentCount < 0 || documentCount > ApplicationActivation.MaxItems {
                throw InvalidDataException("Too many documents")
            }
            let documents = if documentCount == 0 { Array.Empty[Uri]() } else { [documentCount]Uri }
            for i in 0 ... documentCount { documents[i] = ReadUri(ReadText(data, length, ref offset)) }
            let argumentCount = ReadInt32(data, length, ref offset)
            if argumentCount < 0 || argumentCount > ApplicationActivation.MaxItems {
                throw InvalidDataException("Too many arguments")
            }
            let arguments = if argumentCount == 0 { Array.Empty[string]() } else { [argumentCount]string }
            for i in 0 ... argumentCount { arguments[i] = ReadText(data, length, ref offset) }
            let directory = ReadText(data, length, ref offset)
            let notification = ReadText(data, length, ref offset)
            let action = ReadText(data, length, ref offset)
            let dataValue = ReadText(data, length, ref offset)
            if offset != length { throw InvalidDataException("Unexpected activation fields") }
            return ApplicationActivation{
                Kind: if kind == int32(ApplicationActivationKind.Launch) { ApplicationActivationKind.Arguments }
                    else { ApplicationActivationKind(kind) },
                IsInitial: false, Target: target, Documents: documents, Arguments: arguments,
                WorkingDirectory: directory, NotificationId: notification, ActionId: action, Payload: dataValue,
            }
        }

        private func WriteUri(writer BinaryWriter, value Uri, ref bytes int32) {
            if value == nil || !value.IsAbsoluteUri { throw ArgumentException("Activation URIs must be absolute") }
            WriteText(writer, value.OriginalString, ref bytes)
        }

        private func WriteText(writer BinaryWriter, value string, ref bytes int32) {
            if value == nil || value.Length > ApplicationActivation.MaxStringBytes {
                throw ArgumentException("Activation text exceeds its limit")
            }
            let count = utf8.GetByteCount(value)
            if count > ApplicationActivation.MaxStringBytes || count > ApplicationActivation.MaxRequestBytes - bytes {
                throw ArgumentException("Activation text exceeds its limit")
            }
            bytes += count
            writer.Write(value)
        }

        private func ReadInt32(data []uint8, length int32, ref offset int32) int32 {
            if length - offset < 4 { throw InvalidDataException("Incomplete activation") }
            let value = BinaryPrimitives.ReadInt32LittleEndian(data.AsSpan(offset, 4))
            offset += 4
            return value
        }

        private func ReadText(data []uint8, length int32, ref offset int32) string {
            var count int32 = 0
            for shift in 0 ... 3 {
                if offset >= length { throw InvalidDataException("Incomplete activation text") }
                let next = data[offset]
                offset++
                count |= int32(next & 127) << (shift * 7)
                if (next & 128) != 0 { continue }
                if count > ApplicationActivation.MaxStringBytes || count > length - offset {
                    throw InvalidDataException("Activation text exceeds its limit")
                }
                let value = utf8.GetString(data, offset, count)
                offset += count
                return value
            }
            throw InvalidDataException("Invalid activation text length")
        }

        private func ReadUri(value string) Uri {
            if !Uri.TryCreate(value, UriKind.Absolute, out var target) || target == nil {
                throw InvalidDataException("Activation URIs must be absolute")
            }
            return target
        }
    }
}
