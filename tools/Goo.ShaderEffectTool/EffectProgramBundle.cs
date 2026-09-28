using System.Buffers.Binary;

internal static class EffectProgramBundle
{
    private const uint Magic = 0x46464547;
    private const uint Schema = 1;
    private const uint VulkanSpirv = 0x56505356;
    private const uint VulkanGeneratorSpirv = 0x47505356;
    private const int HeaderBytes = 12;
    private const int RecordBytes = 8;

    public static byte[] Create(byte[] spirv, bool sourceIndependent = false)
    {
        byte[] result = new byte[checked(HeaderBytes + RecordBytes + spirv.Length)];
        BinaryPrimitives.WriteUInt32LittleEndian(result.AsSpan(0, 4), Magic);
        BinaryPrimitives.WriteUInt32LittleEndian(result.AsSpan(4, 4), Schema);
        BinaryPrimitives.WriteUInt32LittleEndian(result.AsSpan(8, 4), 1);
        BinaryPrimitives.WriteUInt32LittleEndian(result.AsSpan(12, 4),
            sourceIndependent ? VulkanGeneratorSpirv : VulkanSpirv);
        BinaryPrimitives.WriteUInt32LittleEndian(result.AsSpan(16, 4), checked((uint)spirv.Length));
        spirv.CopyTo(result, HeaderBytes + RecordBytes);
        return result;
    }

    public static byte[] ReadVulkanSpirv(byte[] bundle)
    {
        if (bundle.Length < HeaderBytes
            || BinaryPrimitives.ReadUInt32LittleEndian(bundle.AsSpan(0, 4)) != Magic
            || BinaryPrimitives.ReadUInt32LittleEndian(bundle.AsSpan(4, 4)) != Schema)
        {
            throw new InvalidDataException("ShaderEffect program header is invalid");
        }
        uint count = BinaryPrimitives.ReadUInt32LittleEndian(bundle.AsSpan(8, 4));
        int cursor = HeaderBytes;
        for (uint index = 0; index < count; index++)
        {
            if (cursor > bundle.Length - RecordBytes)
            {
                throw new InvalidDataException("ShaderEffect program artifact table is truncated");
            }
            uint kind = BinaryPrimitives.ReadUInt32LittleEndian(bundle.AsSpan(cursor, 4));
            uint byteCount = BinaryPrimitives.ReadUInt32LittleEndian(bundle.AsSpan(cursor + 4, 4));
            cursor += RecordBytes;
            if (byteCount > int.MaxValue || cursor > bundle.Length - (int)byteCount)
            {
                throw new InvalidDataException("ShaderEffect program artifact is truncated");
            }
            if (kind == VulkanSpirv || kind == VulkanGeneratorSpirv)
            {
                return bundle.AsSpan(cursor, (int)byteCount).ToArray();
            }
            cursor += (int)byteCount;
        }
        throw new InvalidDataException("ShaderEffect program has no Vulkan SPIR-V artifact");
    }
}
