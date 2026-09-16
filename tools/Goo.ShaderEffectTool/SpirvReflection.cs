using System.Buffers.Binary;
using System.Text;

internal sealed class SpirvInterface
{
    public int Location { get; }
    public string Type { get; }

    public SpirvInterface(int location, string type)
    {
        Location = location;
        Type = type;
    }
}

internal sealed class SpirvPushConstantMember
{
    public int Offset { get; }
    public string Type { get; }

    public SpirvPushConstantMember(int offset, string type)
    {
        Offset = offset;
        Type = type;
    }
}

internal sealed class SpirvPushConstant
{
    public int Size { get; }
    public IReadOnlyList<SpirvPushConstantMember> Members { get; }

    public SpirvPushConstant(int size, IReadOnlyList<SpirvPushConstantMember> members)
    {
        Size = size;
        Members = members;
    }
}

internal sealed class SpirvStorageMember
{
    public int Offset { get; }
    public string Type { get; }

    public SpirvStorageMember(int offset, string type)
    {
        Offset = offset;
        Type = type;
    }
}

internal sealed class SpirvDescriptor
{
    public int Set { get; }
    public int Binding { get; }
    public string Type { get; }
    public int Count { get; }
    public int? StorageStride { get; }
    public IReadOnlyList<SpirvStorageMember> StorageMembers { get; }
    public string? ImageDimension { get; }
    public bool? ImageArrayed { get; }

    public SpirvDescriptor(
        int set,
        int binding,
        string type,
        int count,
        int? storageStride,
        IReadOnlyList<SpirvStorageMember> storageMembers,
        string? imageDimension,
        bool? imageArrayed)
    {
        Set = set;
        Binding = binding;
        Type = type;
        Count = count;
        StorageStride = storageStride;
        StorageMembers = storageMembers;
        ImageDimension = imageDimension;
        ImageArrayed = imageArrayed;
    }
}

internal sealed class SpirvModuleReflection
{
    public string Stage { get; }
    public string EntryPoint { get; }
    public IReadOnlyList<SpirvInterface> Inputs { get; }
    public IReadOnlyList<SpirvInterface> Outputs { get; }
    public SpirvPushConstant? PushConstant { get; }
    public int DescriptorCount { get; }
    public IReadOnlyList<SpirvDescriptor> Descriptors { get; }
    public IReadOnlyList<uint> Capabilities { get; }
    public IReadOnlyList<string> Extensions { get; }

    public SpirvModuleReflection(
        string stage,
        string entryPoint,
        IReadOnlyList<SpirvInterface> inputs,
        IReadOnlyList<SpirvInterface> outputs,
        SpirvPushConstant? pushConstant,
        int descriptorCount,
        IReadOnlyList<SpirvDescriptor> descriptors,
        IReadOnlyList<uint> capabilities,
        IReadOnlyList<string> extensions)
    {
        Stage = stage;
        EntryPoint = entryPoint;
        Inputs = inputs;
        Outputs = outputs;
        PushConstant = pushConstant;
        DescriptorCount = descriptorCount;
        Descriptors = descriptors;
        Capabilities = capabilities;
        Extensions = extensions;
    }
}

internal static class SpirvReflection
{
    private sealed class TypeInfo
    {
        public uint Opcode { get; }
        public uint[] Operands { get; }

        public TypeInfo(uint opcode, uint[] operands)
        {
            Opcode = opcode;
            Operands = operands;
        }
    }

    private sealed class Decorations
    {
        public int? Location { get; set; }
        public int? Binding { get; set; }
        public int? DescriptorSet { get; set; }
    }

    private readonly record struct Variable(uint TypeId, uint StorageClass);
    private readonly record struct EntryPoint(uint Model, string Name, uint[] Interfaces);

    private const uint Magic = 0x07230203;
    private const uint Version16 = 0x00010600;
    private const uint OpCapability = 17;
    private const uint OpExtension = 10;
    private const uint OpEntryPoint = 15;
    private const uint OpDecorate = 71;
    private const uint OpMemberDecorate = 72;
    private const uint OpTypeInt = 21;
    private const uint OpTypeFloat = 22;
    private const uint OpTypeVector = 23;
    private const uint OpTypeMatrix = 24;
    private const uint OpTypeImage = 25;
    private const uint OpTypeSampler = 26;
    private const uint OpTypeArray = 28;
    private const uint OpTypeRuntimeArray = 29;
    private const uint OpTypeStruct = 30;
    private const uint OpTypePointer = 32;
    private const uint OpTypeSampledImage = 27;
    private const uint OpConstant = 43;
    private const uint OpVariable = 59;
    private const uint DecorationLocation = 30;
    private const uint DecorationBinding = 33;
    private const uint DecorationDescriptorSet = 34;
    private const uint DecorationOffset = 35;
    private const uint DecorationArrayStride = 6;
    private const uint StorageUniformConstant = 0;
    private const uint StorageInput = 1;
    private const uint StorageUniform = 2;
    private const uint StorageOutput = 3;
    private const uint StoragePushConstant = 9;
    private const uint StorageStorageBuffer = 12;
    private const uint DimBuffer = 5;

    public static SpirvModuleReflection Read(byte[] bytes)
    {
        if (bytes.Length < 20 || (bytes.Length & 3) != 0)
        {
            throw new InvalidOperationException("SPIR-V byte length is invalid");
        }

        uint[] words = new uint[bytes.Length / 4];
        for (int index = 0; index < words.Length; index++)
        {
            words[index] = BinaryPrimitives.ReadUInt32LittleEndian(bytes.AsSpan(index * 4, 4));
        }
        if (words[0] != Magic)
        {
            throw new InvalidOperationException("SPIR-V magic is invalid");
        }
        if (words[1] != Version16)
        {
            throw new InvalidOperationException($"SPIR-V version must be 1.6, found 0x{words[1]:x8}");
        }

        Dictionary<uint, TypeInfo> types = new();
        Dictionary<uint, Variable> variables = new();
        Dictionary<uint, Decorations> decorations = new();
        Dictionary<(uint StructId, uint Member), int> memberOffsets = new();
        Dictionary<uint, int> arrayStrides = new();
        Dictionary<uint, ulong> constants = new();
        List<EntryPoint> entryPoints = new();
        List<uint> capabilities = new();
        List<string> extensions = new();

        int cursor = 5;
        while (cursor < words.Length)
        {
            uint header = words[cursor];
            int wordCount = (int)(header >> 16);
            uint opcode = header & 0xffff;
            if (wordCount <= 0 || cursor + wordCount > words.Length)
            {
                throw new InvalidOperationException($"Invalid SPIR-V instruction at word {cursor}");
            }
            ReadInstruction(words, cursor, wordCount, opcode, types, variables, decorations, memberOffsets, arrayStrides, constants, entryPoints, capabilities, extensions);
            cursor += wordCount;
        }

        if (entryPoints.Count != 1)
        {
            throw new InvalidOperationException($"SPIR-V module must contain one entry point, found {entryPoints.Count}");
        }
        EntryPoint entryPoint = entryPoints[0];
        string stage = entryPoint.Model switch
        {
            0 => "vertex",
            4 => "fragment",
            5 => "compute",
            _ => throw new InvalidOperationException($"Unsupported SPIR-V execution model {entryPoint.Model}")
        };

        HashSet<uint> entryInterfaces = new(entryPoint.Interfaces);
        List<SpirvInterface> inputs = new();
        List<SpirvInterface> outputs = new();
        SpirvPushConstant? pushConstant = null;
        List<SpirvDescriptor> descriptors = new();

        foreach ((uint id, Variable variable) in variables.OrderBy(pair => pair.Key))
        {
            if (variable.StorageClass is StorageUniformConstant or StorageUniform or StorageStorageBuffer)
            {
                Decorations value = GetDecorations(decorations, id);
                if (value.Binding is null || value.DescriptorSet is null)
                {
                    throw new InvalidOperationException($"Descriptor variable %{id} lacks set or binding");
                }
                SpirvDescriptor descriptor = ReflectDescriptor(value.DescriptorSet.Value, value.Binding.Value,
                    variable.TypeId, variable.StorageClass, types, memberOffsets, arrayStrides, constants);
                descriptors.Add(descriptor);
                continue;
            }
            if (variable.StorageClass == StoragePushConstant)
            {
                if (pushConstant is not null)
                {
                    throw new InvalidOperationException("SPIR-V module has multiple push-constant variables");
                }
                pushConstant = ReflectPushConstant(variable.TypeId, types, memberOffsets,
                    arrayStrides, constants);
                continue;
            }
            if (!entryInterfaces.Contains(id) || variable.StorageClass is not (StorageInput or StorageOutput))
            {
                continue;
            }
            Decorations interfaceDecorations = GetDecorations(decorations, id);
            if (interfaceDecorations.Location is null)
            {
                continue;
            }
            string type = RenderVariableType(variable.TypeId, types, constants);
            SpirvInterface reflected = new(interfaceDecorations.Location.Value, type);
            if (variable.StorageClass == StorageInput)
            {
                inputs.Add(reflected);
            }
            else
            {
                outputs.Add(reflected);
            }
        }

        SpirvDescriptor[] orderedDescriptors = descriptors.OrderBy(value => value.Set).ThenBy(value => value.Binding).ToArray();
        return new SpirvModuleReflection(
            stage,
            entryPoint.Name,
            inputs.OrderBy(value => value.Location).ToArray(),
            outputs.OrderBy(value => value.Location).ToArray(),
            pushConstant,
            orderedDescriptors.Length,
            orderedDescriptors,
            capabilities.Distinct().OrderBy(value => value).ToArray(),
            extensions.Distinct(StringComparer.Ordinal).OrderBy(value => value, StringComparer.Ordinal).ToArray());
    }

    private static void ReadInstruction(
        uint[] words,
        int cursor,
        int wordCount,
        uint opcode,
        Dictionary<uint, TypeInfo> types,
        Dictionary<uint, Variable> variables,
        Dictionary<uint, Decorations> decorations,
        Dictionary<(uint StructId, uint Member), int> memberOffsets,
        Dictionary<uint, int> arrayStrides,
        Dictionary<uint, ulong> constants,
        List<EntryPoint> entryPoints,
        List<uint> capabilities,
        List<string> extensions)
    {
        if (opcode == OpCapability)
        {
            capabilities.Add(words[cursor + 1]);
            return;
        }
        if (opcode == OpExtension)
        {
            (string extension, _) = ReadString(words, cursor + 1, cursor + wordCount);
            extensions.Add(extension);
            return;
        }
        if (opcode == OpEntryPoint)
        {
            uint model = words[cursor + 1];
            (string name, int nextWord) = ReadString(words, cursor + 3, cursor + wordCount);
            uint[] interfaces = words[nextWord..(cursor + wordCount)];
            entryPoints.Add(new EntryPoint(model, name, interfaces));
            return;
        }
        if (opcode == OpDecorate)
        {
            uint target = words[cursor + 1];
            uint decoration = words[cursor + 2];
            Decorations value = GetDecorations(decorations, target);
            if (decoration == DecorationLocation)
            {
                value.Location = checked((int)words[cursor + 3]);
            }
            else if (decoration == DecorationBinding)
            {
                value.Binding = checked((int)words[cursor + 3]);
            }
            else if (decoration == DecorationDescriptorSet)
            {
                value.DescriptorSet = checked((int)words[cursor + 3]);
            }
            else if (decoration == DecorationArrayStride)
            {
                arrayStrides[target] = checked((int)words[cursor + 3]);
            }
            return;
        }
        if (opcode == OpMemberDecorate && words[cursor + 3] == DecorationOffset)
        {
            memberOffsets[(words[cursor + 1], words[cursor + 2])] = checked((int)words[cursor + 4]);
            return;
        }
        if (opcode is OpTypeInt or OpTypeFloat or OpTypeVector or OpTypeMatrix or OpTypeImage or OpTypeSampler or OpTypeArray or OpTypeRuntimeArray or OpTypeStruct or OpTypePointer or OpTypeSampledImage)
        {
            uint resultId = words[cursor + 1];
            types[resultId] = new TypeInfo(opcode, words[(cursor + 2)..(cursor + wordCount)]);
            return;
        }
        if (opcode == OpConstant)
        {
            uint resultType = words[cursor + 1];
            uint resultId = words[cursor + 2];
            TypeInfo type = RequireType(types, resultType);
            int width = checked((int)type.Operands[0]);
            constants[resultId] = width <= 32
                ? words[cursor + 3]
                : words[cursor + 3] | ((ulong)words[cursor + 4] << 32);
            return;
        }
        if (opcode == OpVariable)
        {
            variables[words[cursor + 2]] = new Variable(words[cursor + 1], words[cursor + 3]);
        }
    }

    private static SpirvDescriptor ReflectDescriptor(
        int set,
        int binding,
        uint pointerTypeId,
        uint storageClass,
        IReadOnlyDictionary<uint, TypeInfo> types,
        IReadOnlyDictionary<(uint StructId, uint Member), int> memberOffsets,
        IReadOnlyDictionary<uint, int> arrayStrides,
        IReadOnlyDictionary<uint, ulong> constants)
    {
        TypeInfo pointer = RequireType(types, pointerTypeId);
        if (pointer.Opcode != OpTypePointer || pointer.Operands.Length != 2 || pointer.Operands[0] != storageClass)
        {
            throw new InvalidOperationException("Descriptor variable has an invalid pointer type");
        }
        (string descriptorType, int descriptorCount) = ReflectDescriptorPointee(pointer.Operands[1], storageClass, types, constants);
        (string? imageDimension, bool? imageArrayed) = ReflectImageShape(pointer.Operands[1], types);
        int? storageStride = null;
        IReadOnlyList<SpirvStorageMember> storageMembers = Array.Empty<SpirvStorageMember>();
        if (storageClass == StorageStorageBuffer)
        {
            (storageStride, storageMembers) = ReflectStorageRecord(pointer.Operands[1], types, memberOffsets, arrayStrides, constants);
        }
        return new SpirvDescriptor(set, binding, descriptorType, descriptorCount, storageStride,
            storageMembers, imageDimension, imageArrayed);
    }

    private static (string? Dimension, bool? Arrayed) ReflectImageShape(
        uint typeId,
        IReadOnlyDictionary<uint, TypeInfo> types)
    {
        TypeInfo type = RequireType(types, typeId);
        while (type.Opcode == OpTypeArray)
        {
            type = RequireType(types, type.Operands[0]);
        }
        if (type.Opcode == OpTypeSampledImage)
        {
            type = RequireType(types, type.Operands[0]);
        }
        if (type.Opcode != OpTypeImage)
        {
            return (null, null);
        }
        string dimension = type.Operands[1] switch
        {
            0 => "1d",
            1 => "2d",
            2 => "3d",
            3 => "cube",
            4 => "rect",
            5 => "buffer",
            6 => "subpass-data",
            _ => throw new InvalidOperationException($"Image type has unsupported dimension {type.Operands[1]}")
        };
        return (dimension, type.Operands[3] != 0);
    }

    private static (int? Stride, IReadOnlyList<SpirvStorageMember> Members) ReflectStorageRecord(
        uint pointeeTypeId,
        IReadOnlyDictionary<uint, TypeInfo> types,
        IReadOnlyDictionary<(uint StructId, uint Member), int> memberOffsets,
        IReadOnlyDictionary<uint, int> arrayStrides,
        IReadOnlyDictionary<uint, ulong> constants)
    {
        TypeInfo block = RequireType(types, pointeeTypeId);
        if (block.Opcode != OpTypeStruct)
        {
            return (null, Array.Empty<SpirvStorageMember>());
        }
        for (uint index = 0; index < block.Operands.Length; index++)
        {
            uint memberTypeId = block.Operands[index];
            TypeInfo memberType = RequireType(types, memberTypeId);
            if (memberType.Opcode != OpTypeRuntimeArray)
            {
                continue;
            }
            if (!arrayStrides.TryGetValue(memberTypeId, out int stride))
            {
                throw new InvalidOperationException($"Storage-buffer runtime array %{memberTypeId} lacks an ArrayStride");
            }
            uint elementTypeId = memberType.Operands[0];
            TypeInfo elementType = RequireType(types, elementTypeId);
            if (elementType.Opcode != OpTypeStruct)
            {
                return (stride, Array.Empty<SpirvStorageMember>());
            }
            List<SpirvStorageMember> members = new();
            for (uint elementIndex = 0; elementIndex < elementType.Operands.Length; elementIndex++)
            {
                if (!memberOffsets.TryGetValue((elementTypeId, elementIndex), out int offset))
                {
                    throw new InvalidOperationException($"Storage-buffer member {elementIndex} lacks an offset");
                }
                string type = RenderType(elementType.Operands[elementIndex], types, constants);
                members.Add(new SpirvStorageMember(offset, type));
            }
            return (stride, members);
        }
        return (null, Array.Empty<SpirvStorageMember>());
    }

    private static (string Type, int Count) ReflectDescriptorPointee(
        uint typeId,
        uint storageClass,
        IReadOnlyDictionary<uint, TypeInfo> types,
        IReadOnlyDictionary<uint, ulong> constants)
    {
        TypeInfo type = RequireType(types, typeId);
        if (type.Opcode == OpTypeArray)
        {
            if (!constants.TryGetValue(type.Operands[1], out ulong length) || length > int.MaxValue)
            {
                throw new InvalidOperationException($"Descriptor array %{typeId} has an invalid length");
            }
            (string elementType, int elementCount) = ReflectDescriptorPointee(type.Operands[0], storageClass, types, constants);
            return (elementType, checked((int)length * elementCount));
        }
        if (type.Opcode == OpTypeSampledImage)
        {
            return ("combined-image-sampler", 1);
        }
        if (type.Opcode == OpTypeImage)
        {
            if (type.Operands.Length <= 5)
            {
                throw new InvalidOperationException($"Image descriptor %{typeId} lacks its sampled operand");
            }
            if (type.Operands[1] == DimBuffer && type.Operands[5] == 1)
            {
                return ("uniform-texel-buffer", 1);
            }
            return type.Operands[5] switch
            {
                1 => ("sampled-image", 1),
                2 => ("storage-image", 1),
                _ => throw new InvalidOperationException($"Image descriptor %{typeId} has unsupported sampled operand {type.Operands[5]}")
            };
        }
        if (type.Opcode == OpTypeSampler)
        {
            return ("sampler", 1);
        }
        if (type.Opcode == OpTypeStruct)
        {
            return storageClass switch
            {
                StorageUniform => ("uniform-buffer", 1),
                StorageStorageBuffer => ("storage-buffer", 1),
                _ => throw new InvalidOperationException($"Struct descriptor %{typeId} has unsupported storage class {storageClass}")
            };
        }
        throw new InvalidOperationException($"Unsupported descriptor SPIR-V type opcode {type.Opcode}");
    }

    private static SpirvPushConstant ReflectPushConstant(
        uint pointerTypeId,
        IReadOnlyDictionary<uint, TypeInfo> types,
        IReadOnlyDictionary<(uint StructId, uint Member), int> memberOffsets,
        IReadOnlyDictionary<uint, int> arrayStrides,
        IReadOnlyDictionary<uint, ulong> constants)
    {
        TypeInfo pointer = RequireType(types, pointerTypeId);
        if (pointer.Opcode != OpTypePointer || pointer.Operands.Length != 2 || pointer.Operands[0] != StoragePushConstant)
        {
            throw new InvalidOperationException("Push-constant variable has an invalid pointer type");
        }
        uint structId = pointer.Operands[1];
        TypeInfo structure = RequireType(types, structId);
        if (structure.Opcode != OpTypeStruct)
        {
            throw new InvalidOperationException("Push-constant pointer does not reference a struct");
        }
        List<SpirvPushConstantMember> members = new();
        int size = 0;
        for (uint index = 0; index < structure.Operands.Length; index++)
        {
            if (!memberOffsets.TryGetValue((structId, index), out int offset))
            {
                throw new InvalidOperationException($"Push-constant member {index} lacks an offset");
            }
            uint memberTypeId = UnwrapPushConstantMember(structure.Operands[index], types,
                memberOffsets, arrayStrides, constants);
            string type = RenderType(memberTypeId, types, constants);
            int memberSize = SizeOf(memberTypeId, types, constants);
            members.Add(new SpirvPushConstantMember(offset, type));
            size = Math.Max(size, checked(offset + memberSize));
        }
        return new SpirvPushConstant(size, members);
    }

    private static uint UnwrapPushConstantMember(
        uint typeId,
        IReadOnlyDictionary<uint, TypeInfo> types,
        IReadOnlyDictionary<(uint StructId, uint Member), int> memberOffsets,
        IReadOnlyDictionary<uint, int> arrayStrides,
        IReadOnlyDictionary<uint, ulong> constants)
    {
        TypeInfo wrapper = RequireType(types, typeId);
        if (wrapper.Opcode != OpTypeStruct)
        {
            return typeId;
        }
        if (wrapper.Operands.Length != 1)
        {
            throw new InvalidOperationException(
                $"Push-constant wrapper %{typeId} must contain exactly one member");
        }
        if (!memberOffsets.TryGetValue((typeId, 0), out int offset) || offset != 0)
        {
            throw new InvalidOperationException(
                $"Push-constant wrapper %{typeId} member must have offset zero");
        }
        uint memberTypeId = wrapper.Operands[0];
        TypeInfo member = RequireType(types, memberTypeId);
        if (member.Opcode != OpTypeArray || member.Operands.Length != 2)
        {
            throw new InvalidOperationException(
                $"Push-constant wrapper %{typeId} must contain one fixed array");
        }
        if (!arrayStrides.TryGetValue(memberTypeId, out int stride))
        {
            throw new InvalidOperationException(
                $"Push-constant wrapper array %{memberTypeId} lacks an ArrayStride");
        }
        int elementSize = SizeOf(member.Operands[0], types, constants);
        if (stride != elementSize)
        {
            throw new InvalidOperationException(
                $"Push-constant wrapper array %{memberTypeId} has unsupported stride {stride}");
        }
        return memberTypeId;
    }

    private static string RenderVariableType(uint pointerTypeId, IReadOnlyDictionary<uint, TypeInfo> types, IReadOnlyDictionary<uint, ulong> constants)
    {
        TypeInfo pointer = RequireType(types, pointerTypeId);
        if (pointer.Opcode != OpTypePointer || pointer.Operands.Length != 2)
        {
            throw new InvalidOperationException($"Interface type %{pointerTypeId} is not a pointer");
        }
        return RenderType(pointer.Operands[1], types, constants);
    }

    private static string RenderType(uint typeId, IReadOnlyDictionary<uint, TypeInfo> types, IReadOnlyDictionary<uint, ulong> constants)
    {
        TypeInfo type = RequireType(types, typeId);
        if (type.Opcode == OpTypeFloat)
        {
            return type.Operands[0] == 32 ? "float" : $"float{type.Operands[0]}";
        }
        if (type.Opcode == OpTypeInt)
        {
            string prefix = type.Operands[1] == 0 ? "u" : string.Empty;
            return type.Operands[0] == 32 ? prefix + "int" : prefix + "int" + type.Operands[0];
        }
        if (type.Opcode == OpTypeVector)
        {
            string element = RenderType(type.Operands[0], types, constants);
            string prefix = element == "float" ? "vec" : element == "int" ? "ivec" : element == "uint" ? "uvec" : element + "vec";
            return prefix + type.Operands[1];
        }
        if (type.Opcode == OpTypeMatrix)
        {
            TypeInfo column = RequireType(types, type.Operands[0]);
            if (column.Opcode == OpTypeVector && column.Operands.Length == 2)
            {
                string scalar = RenderType(column.Operands[0], types, constants);
                if (scalar == "float")
                {
                    return type.Operands[1] == column.Operands[1]
                        ? "mat" + type.Operands[1]
                        : "mat" + type.Operands[1] + "x" + column.Operands[1];
                }
            }
            throw new InvalidOperationException($"Unsupported matrix type %{typeId}");
        }
        if (type.Opcode == OpTypeArray)
        {
            if (!constants.TryGetValue(type.Operands[1], out ulong length))
            {
                throw new InvalidOperationException($"Array type %{typeId} has an unknown length");
            }
            return RenderType(type.Operands[0], types, constants) + "[" + length + "]";
        }
        throw new InvalidOperationException($"Unsupported reflected SPIR-V type opcode {type.Opcode}");
    }

    private static int SizeOf(uint typeId, IReadOnlyDictionary<uint, TypeInfo> types, IReadOnlyDictionary<uint, ulong> constants)
    {
        TypeInfo type = RequireType(types, typeId);
        if (type.Opcode is OpTypeFloat or OpTypeInt)
        {
            return checked((int)type.Operands[0] / 8);
        }
        if (type.Opcode is OpTypeVector or OpTypeMatrix)
        {
            return checked(SizeOf(type.Operands[0], types, constants) * (int)type.Operands[1]);
        }
        if (type.Opcode == OpTypeArray)
        {
            if (!constants.TryGetValue(type.Operands[1], out ulong length))
            {
                throw new InvalidOperationException($"Array type %{typeId} has an unknown length");
            }
            return checked(SizeOf(type.Operands[0], types, constants) * (int)length);
        }
        throw new InvalidOperationException($"Unsupported SPIR-V size opcode {type.Opcode}");
    }

    private static TypeInfo RequireType(IReadOnlyDictionary<uint, TypeInfo> types, uint id)
    {
        return types.TryGetValue(id, out TypeInfo? type)
            ? type
            : throw new InvalidOperationException($"SPIR-V type %{id} is missing");
    }

    private static Decorations GetDecorations(Dictionary<uint, Decorations> values, uint id)
    {
        if (!values.TryGetValue(id, out Decorations? value))
        {
            value = new Decorations();
            values.Add(id, value);
        }
        return value;
    }

    private static (string Value, int NextWord) ReadString(uint[] words, int start, int end)
    {
        List<byte> bytes = new();
        int cursor = start;
        bool terminated = false;
        while (cursor < end && !terminated)
        {
            uint word = words[cursor++];
            for (int shift = 0; shift < 32; shift += 8)
            {
                byte value = (byte)(word >> shift);
                if (value == 0)
                {
                    terminated = true;
                    break;
                }
                bytes.Add(value);
            }
        }
        if (!terminated)
        {
            throw new InvalidOperationException("SPIR-V string is unterminated");
        }
        return (Encoding.UTF8.GetString(bytes.ToArray()), cursor);
    }
}
