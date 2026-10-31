import System
import System.Buffers.Binary
import System.IO

internal shared class EffectProgramBundle {
    private const Magic uint32 = uint32(0x46464547)
    private const Schema uint32 = uint32(2)
    private const VulkanSpirv uint32 = uint32(0x56505356)
    private const VulkanGeneratorSpirv uint32 = uint32(0x47505356)
    private const HeaderBytes int32 = 12
    private const RecordBytes int32 = 8

    func Create(spirv[]uint8, sourceIndependent bool = false)[]uint8 {
        let result = [checked(HeaderBytes + RecordBytes + spirv.Length)]uint8
        BinaryPrimitives.WriteUInt32LittleEndian(result.AsSpan(0, 4), Magic)
        BinaryPrimitives.WriteUInt32LittleEndian(result.AsSpan(4, 4), Schema)
        BinaryPrimitives.WriteUInt32LittleEndian(result.AsSpan(8, 4), 1)
        BinaryPrimitives.WriteUInt32LittleEndian(
            result.AsSpan(12, 4),
            if sourceIndependent {
                VulkanGeneratorSpirv
            } else {
                VulkanSpirv
            }
        )
        BinaryPrimitives.WriteUInt32LittleEndian(result.AsSpan(16, 4), checked(uint32(spirv.Length)))
        spirv.CopyTo(result, HeaderBytes + RecordBytes)
        return result
    }

    func ReadVulkanSpirv(bundle[]uint8)[]uint8 {
        if bundle.Length < HeaderBytes || BinaryPrimitives.ReadUInt32LittleEndian(bundle.AsSpan(0, 4)) != Magic ||
            BinaryPrimitives.ReadUInt32LittleEndian(bundle.AsSpan(4, 4)) != Schema {
            throw InvalidDataException("ShaderEffect program header is invalid")
        }
        let count = BinaryPrimitives.ReadUInt32LittleEndian(bundle.AsSpan(8, 4))
        var cursor = HeaderBytes
        for var index uint32 = uint32(0); index < count; index++ {
            if cursor > bundle.Length - RecordBytes {
                throw InvalidDataException("ShaderEffect program artifact table is truncated")
            }
            let kind = BinaryPrimitives.ReadUInt32LittleEndian(bundle.AsSpan(cursor, 4))
            let byteCount = BinaryPrimitives.ReadUInt32LittleEndian(bundle.AsSpan(cursor + 4, 4))
            cursor += RecordBytes
            if byteCount > uint32(int32.MaxValue) || cursor > bundle.Length - int32(byteCount) {
                throw InvalidDataException("ShaderEffect program artifact is truncated")
            }
            if kind == VulkanSpirv || kind == VulkanGeneratorSpirv {
                return bundle.AsSpan(cursor, int32(byteCount)).ToArray()
            }
            cursor += int32(byteCount)
        }
        throw InvalidDataException("ShaderEffect program has no Vulkan SPIR-V artifact")
    }
}
