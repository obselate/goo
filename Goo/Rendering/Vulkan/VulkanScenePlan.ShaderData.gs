package Goo

import System
import System.Collections.Generic

internal data struct ShaderEffectDataPack {
  internal var WordOffset uint32
  internal var ByteCount int32
}

internal data struct ShaderEffectDataSignature {
  internal var Identity uint64
  internal var Version uint64
  internal var ByteLength int32
  internal var ByteOffset int32
}

internal data struct ShaderEffectDataKey {
  internal var Identity uint64
  internal var Version uint64
  internal var ByteLength int32
}

internal data struct ShaderEffectDataPackKey {
  internal var Data0 ShaderEffectDataKey
  internal var Data1 ShaderEffectDataKey
  internal var Data2 ShaderEffectDataKey
  internal var Data3 ShaderEffectDataKey
}

internal partial class SceneFrame {
  private const ShaderEffectDataHeaderBytes int32 = 32
  private const ShaderEffectDataBudgetBytes int32 = 67108864
  private var shaderEffectData []uint8
  private var shaderEffectDataCount int32
  private var previousShaderEffectDataByteCount int32
  private var shaderEffectDataSignatures []ShaderEffectDataSignature
  private var shaderEffectDataSignatureCount int32
  private var previousShaderEffectDataSignatureCount int32
  private var shaderEffectDataVersion uint64
  private var shaderEffectDataChanged bool
  private var shaderEffectDataVersionFinalized bool
  private let shaderEffectDataPacks Dictionary[ShaderEffectDataPackKey, ShaderEffectDataPack] =
  Dictionary[ShaderEffectDataPackKey, ShaderEffectDataPack]()

  internal prop ShaderEffectDataBytes []uint8{ get -> shaderEffectData }
  internal prop ShaderEffectDataByteCount int32{ get -> shaderEffectDataCount }
  internal prop ShaderEffectDataVersion uint64{
    get {
      FinalizeShaderEffectDataVersion()
      return shaderEffectDataVersion
    }
  }

  private func InitializeShaderEffectData() {
    shaderEffectData = [256]uint8
    shaderEffectDataSignatures = [16]ShaderEffectDataSignature
    shaderEffectDataVersionFinalized = true
  }

  private func ResetShaderEffectData() {
    FinalizeShaderEffectDataVersion()
    previousShaderEffectDataSignatureCount = shaderEffectDataSignatureCount
    previousShaderEffectDataByteCount = shaderEffectDataCount
    shaderEffectDataSignatureCount = 0
    shaderEffectDataCount = 0
    shaderEffectDataPacks.Clear()
    shaderEffectDataChanged = false
    shaderEffectDataVersionFinalized = false
  }

  private func ReleaseShaderEffectDataCaptures(value ShaderEffectSnapshot) {
    value.Data0.Release()
    value.Data1.Release()
    value.Data2.Release()
    value.Data3.Release()
  }

  private func PackShaderEffectData(value ShaderEffectSnapshot) ShaderEffectDataPack {
    try {
      let key = ShaderEffectDataPackKey{
        Data0: ShaderDataKey(value.Data0),
        Data1: ShaderDataKey(value.Data1),
        Data2: ShaderDataKey(value.Data2),
        Data3: ShaderDataKey(value.Data3),
      }
      if shaderEffectDataPacks.TryGetValue(key, out var existing) {
        return existing
      }
      let required = ShaderEffectDataHeaderBytes
      +AlignedBytes(value.Data0.ByteLength)
      +AlignedBytes(value.Data1.ByteLength)
      +AlignedBytes(value.Data2.ByteLength)
      +AlignedBytes(value.Data3.ByteLength)
      if required > ShaderEffectDataBudgetBytes - shaderEffectDataCount {
        throw InvalidOperationException("ShaderEffect retained data budget exceeded")
      }
      let segmentOffset = shaderEffectDataCount
      let end = segmentOffset + required
      EnsureShaderEffectDataCapacity(end)
      var cursor = segmentOffset + ShaderEffectDataHeaderBytes
      cursor = WriteShaderEffectDataCapture(value.Data0, 0, segmentOffset, cursor)
      cursor = WriteShaderEffectDataCapture(value.Data1, 1, segmentOffset, cursor)
      cursor = WriteShaderEffectDataCapture(value.Data2, 2, segmentOffset, cursor)
      cursor = WriteShaderEffectDataCapture(value.Data3, 3, segmentOffset, cursor)
      shaderEffectDataCount = cursor
      let packed = ShaderEffectDataPack{
        WordOffset: uint32(segmentOffset / 4),
        ByteCount: cursor - segmentOffset,
      }
      shaderEffectDataPacks.Add(key, packed)
      return packed
    } finally {
      ReleaseShaderEffectDataCaptures(value)
    }
  }

  private func ShaderDataKey(value ShaderEffectDataCapture) ShaderEffectDataKey ->
  ShaderEffectDataKey{Identity: value.Identity, Version: value.Version, ByteLength: value.ByteLength}

  private func WriteShaderEffectDataCapture(value ShaderEffectDataCapture, slot int32,
    segmentOffset int32, cursor int32) int32{
      let headerOffset = segmentOffset + slot * 8
      let byteOffset = if value.ByteLength > 0 { cursor } else { 0 }
      let unchanged = TrackShaderEffectData(value, byteOffset)
      if value.ByteLength <= 0 {
        WriteShaderEffectDataWord(headerOffset, 0u)
        WriteShaderEffectDataWord(headerOffset + 4, 0u)
        return cursor
      }
      let wordOffset = uint32((cursor - segmentOffset) / 4)
      WriteShaderEffectDataWord(headerOffset, wordOffset)
      WriteShaderEffectDataWord(headerOffset + 4, uint32(value.ByteLength))
      if !unchanged { value.CopyTo(shaderEffectData, cursor) }
      let next = cursor + AlignedBytes(value.ByteLength)
      var padding = cursor + value.ByteLength
      while padding < next {
        shaderEffectData[padding] = uint8(0)
        padding++
      }
      return next
    }

  private func WriteShaderEffectDataWord(offset int32, value uint32) {
    shaderEffectData[offset] = uint8(value & 255u)
    shaderEffectData[offset + 1] = uint8((value >> 8) & 255u)
    shaderEffectData[offset + 2] = uint8((value >> 16) & 255u)
    shaderEffectData[offset + 3] = uint8(value >> 24)
  }

  private func TrackShaderEffectData(value ShaderEffectDataCapture, byteOffset int32) bool {
    let index = shaderEffectDataSignatureCount
    let unchanged = index < previousShaderEffectDataSignatureCount
      && shaderEffectDataSignatures[index].Identity == value.Identity
      && shaderEffectDataSignatures[index].Version == value.Version
      && shaderEffectDataSignatures[index].ByteLength == value.ByteLength
      && shaderEffectDataSignatures[index].ByteOffset == byteOffset
    EnsureShaderEffectDataSignatureCapacity(index + 1)
    shaderEffectDataSignatures[index] = ShaderEffectDataSignature{
      Identity: value.Identity,
      Version: value.Version,
      ByteLength: value.ByteLength,
      ByteOffset: byteOffset,
    }
    shaderEffectDataSignatureCount++
    if !unchanged { shaderEffectDataChanged = true }
    return unchanged
  }

  private func EnsureShaderEffectDataSignatureCapacity(required int32) {
    if required <= shaderEffectDataSignatures.Length { return }
    var next = shaderEffectDataSignatures.Length * 2
    if next < required { next = required }
    let expanded = [next]ShaderEffectDataSignature
    Array.Copy(shaderEffectDataSignatures, expanded, shaderEffectDataSignatures.Length)
    shaderEffectDataSignatures = expanded
    growthOperations++
  }

  private func FinalizeShaderEffectDataVersion() {
    if shaderEffectDataVersionFinalized { return }
    if shaderEffectDataSignatureCount != previousShaderEffectDataSignatureCount {
      shaderEffectDataChanged = true
    }
    if shaderEffectDataChanged {
      shaderEffectDataVersion = nextVulkanSceneVersion(shaderEffectDataVersion)
    }
    shaderEffectDataVersionFinalized = true
  }

  private func EnsureShaderEffectDataCapacity(required int32) {
    if required <= shaderEffectData.Length { return }
    var next = shaderEffectData.Length
    while next < required {
      if next > ShaderEffectDataBudgetBytes / 2 {
        next = required
        break
      }
      next = next * 2
    }
    let expanded = [next]uint8
    let retainedByteCount = Math.Max(shaderEffectDataCount, previousShaderEffectDataByteCount)
    Array.Copy(shaderEffectData, expanded, retainedByteCount)
    shaderEffectData = expanded
    growthOperations++
  }

  private func AlignedBytes(value int32) int32 -> ((value + 3) / 4) * 4
}
