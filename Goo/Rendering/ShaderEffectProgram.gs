package Goo

import System
import System.Collections.Generic
import System.IO
import System.Security.Cryptography
import System.Threading

internal data struct ShaderEffectProgramArtifact(Kind uint32, Bytes []uint8) { }

public sealed class ShaderEffectProgram {
  private const Magic uint32 = 0x46464547u
  private const Schema uint32 = 1u
  private const VulkanSpirvKind uint32 = 0x56505356u
  private const VulkanGeneratorSpirvKind uint32 = 0x47505356u
  private const HeaderBytes int32 = 12
  private const RecordBytes int32 = 8
  private const MaximumArtifactCount int32 = 8
  private const MaximumArtifactByteCount int32 = 4194304
  private const MaximumProgramByteCount int32 = 8388608
  private let artifacts []ShaderEffectProgramArtifact
  private let vulkanSpirv([]uint8)?
  private let vulkanSpirvDigest([]uint8)?
  private let programId uint64
  private let sourceIndependent bool

  shared {
    private var nextProgramId int64

    private func allocateProgramId() uint64 {
      let value = Interlocked.Increment(ref nextProgramId)
      if value <= 0L { throw OverflowException("Shader effect program identity overflow") }
      return uint64(value)
    }

    public func Load(path string) ShaderEffectProgram ->
    ShaderEffectProgram(File.ReadAllBytes(path))
  }

  public init(program []uint8) {
    if Object.ReferenceEquals(program, nil) { throw ArgumentNullException("program") }
    if program.Length < HeaderBytes || program.Length > MaximumProgramByteCount
      || readWord(program, 0) != Magic || readWord(program, 4) != Schema{
        throw ArgumentException("Shader effect program header is invalid", "program")
      }
    let countWord = readWord(program, 8)
    if countWord == 0u || countWord > uint32(MaximumArtifactCount) {
      throw ArgumentException("Shader effect program artifact count is invalid", "program")
    }
    let values = List[ShaderEffectProgramArtifact](int32(countWord))
    var cursor = HeaderBytes
    var index int32
    while index < int32(countWord) {
      if cursor > program.Length - RecordBytes {
        throw ArgumentException("Shader effect program artifact table is truncated", "program")
      }
      let kind = readWord(program, cursor)
      let byteCountWord = readWord(program, cursor + 4)
      cursor = cursor + RecordBytes
      if kind == 0u || byteCountWord == 0u
        || byteCountWord > uint32(MaximumArtifactByteCount)
        || cursor > program.Length - int32(byteCountWord) {
          throw ArgumentException("Shader effect program artifact is invalid", "program")
        }
      for value in values {
        if value.Kind == kind {
          throw ArgumentException("Shader effect program contains a duplicate artifact", "program")
        }
      }
      let bytes = [int32(byteCountWord)]uint8
      Array.Copy(program, cursor, bytes, 0, bytes.Length)
      if kind == VulkanSpirvKind || kind == VulkanGeneratorSpirvKind {
        validateVulkanSpirv(bytes)
      }
      values.Add(ShaderEffectProgramArtifact(kind, bytes))
      cursor = cursor + bytes.Length
      index++
    }
    if cursor != program.Length {
      throw ArgumentException("Shader effect program has trailing data", "program")
    }
    artifacts = values.ToArray()
    var selectedVulkanSpirv([]uint8)?
    var generator bool
    for artifact in artifacts {
      if artifact.Kind == VulkanSpirvKind || artifact.Kind == VulkanGeneratorSpirvKind {
        selectedVulkanSpirv = artifact.Bytes
        generator = artifact.Kind == VulkanGeneratorSpirvKind
        break
      }
    }
    vulkanSpirv = selectedVulkanSpirv
    sourceIndependent = generator
    vulkanSpirvDigest = if let bytes = selectedVulkanSpirv {
      SHA256.HashData(bytes)
    } else {
      nil
    }
    programId = allocateProgramId()
  }

  internal prop ProgramId uint64{ get -> programId }
  internal prop SourceIndependent bool{ get -> sourceIndependent }

  internal prop VulkanSpirv []uint8{
    get {
      if let bytes = vulkanSpirv { return bytes }
      throw NotSupportedException("Shader effect program has no Vulkan SPIR-V artifact")
    }
  }

  internal prop VulkanSpirvDigest []uint8{
    get {
      if let digest = vulkanSpirvDigest { return digest }
      throw NotSupportedException("Shader effect program has no Vulkan SPIR-V artifact")
    }
  }

  private func readWord(bytes []uint8, offset int32) uint32 -> uint32(bytes[offset])
  | (uint32(bytes[offset + 1]) << 8)
  | (uint32(bytes[offset + 2]) << 16)
  | (uint32(bytes[offset + 3]) << 24)

  private func validateVulkanSpirv(bytes []uint8) {
    if bytes.Length < 20 || (bytes.Length & 3) != 0 || readWord(bytes, 0) != 0x07230203u {
      throw ArgumentException("Shader effect Vulkan SPIR-V artifact is invalid", "program")
    }
    let version = readWord(bytes, 4)
    if version < 0x00010000u || version > 0x00010600u
      || readWord(bytes, 12) == 0u || readWord(bytes, 16) != 0u {
        throw ArgumentException("Shader effect Vulkan SPIR-V header is invalid", "program")
      }
  }
}
