import System
import System.Buffers.Binary
import System.Collections.Generic
import System.Linq
import System.Text

internal class SpirvInterface {
    prop Location int32 {
        get;
    }

    prop Type string {
        get;
    }

    init(location int32, type string) {
        Location = location
        Type = type
    }
}

internal class SpirvPushConstantMember {
    prop Offset int32 {
        get;
    }

    prop Type string {
        get;
    }

    init(offset int32, type string) {
        Offset = offset
        Type = type
    }
}

internal class SpirvPushConstant {
    prop Size int32 {
        get;
    }

    prop Members IReadOnlyList[SpirvPushConstantMember] {
        get;
    }

    init(size int32, members IReadOnlyList[SpirvPushConstantMember]) {
        Size = size
        Members = members
    }
}

internal class SpirvStorageMember {
    prop Offset int32 {
        get;
    }

    prop Type string {
        get;
    }

    init(offset int32, type string) {
        Offset = offset
        Type = type
    }
}

internal class SpirvDescriptor {
    prop Set int32 {
        get;
    }

    prop Binding int32 {
        get;
    }

    prop Type string {
        get;
    }

    prop Count int32 {
        get;
    }

    prop StorageStride int32? {
        get;
    }

    prop StorageMembers IReadOnlyList[SpirvStorageMember] {
        get;
    }

    prop ImageDimension string? {
        get;
    }

    prop ImageArrayed bool? {
        get;
    }

    init(
        set int32,
        binding int32,
        type string,
        count int32,
        storageStride int32?,
        storageMembers IReadOnlyList[SpirvStorageMember],
        imageDimension string?,
        imageArrayed bool?
    ) {
        Set = set
        Binding = binding
        Type = type
        Count = count
        StorageStride = storageStride
        StorageMembers = storageMembers
        ImageDimension = imageDimension
        ImageArrayed = imageArrayed
    }
}

internal class SpirvModuleReflection {
    prop Stage string {
        get;
    }

    prop EntryPoint string {
        get;
    }

    prop Inputs IReadOnlyList[SpirvInterface] {
        get;
    }

    prop Outputs IReadOnlyList[SpirvInterface] {
        get;
    }

    prop PushConstant SpirvPushConstant? {
        get;
    }

    prop DescriptorCount int32 {
        get;
    }

    prop Descriptors IReadOnlyList[SpirvDescriptor] {
        get;
    }

    prop Capabilities IReadOnlyList[uint32] {
        get;
    }

    prop Extensions IReadOnlyList[string] {
        get;
    }

    init(
        stage string,
        entryPoint string,
        inputs IReadOnlyList[SpirvInterface],
        outputs IReadOnlyList[SpirvInterface],
        pushConstant SpirvPushConstant?,
        descriptorCount int32,
        descriptors IReadOnlyList[SpirvDescriptor],
        capabilities IReadOnlyList[uint32],
        extensions IReadOnlyList[string]
    ) {
        Stage = stage
        EntryPoint = entryPoint
        Inputs = inputs
        Outputs = outputs
        PushConstant = pushConstant
        DescriptorCount = descriptorCount
        Descriptors = descriptors
        Capabilities = capabilities
        Extensions = extensions
    }
}

internal shared class SpirvReflection {
    private class TypeInfo {
        prop Opcode uint32 {
            get;
        }

        prop Operands[]uint32 {
            get;
        }

        init(opcode uint32, operands[]uint32) {
            Opcode = opcode
            Operands = operands
        }
    }

    private class Decorations {
        prop Location int32?
        prop Binding int32?
        prop DescriptorSet int32?
    }

    private data struct Variable(TypeId uint32, StorageClass uint32) : IEquatable[Variable] { }

    private data struct EntryPoint(Model uint32, Name string, Interfaces[]uint32) : IEquatable[EntryPoint] { }

    private const Magic uint32 = uint32(0x07230203)
    private const Version16 uint32 = uint32(0x00010600)
    private const OpCapability uint32 = uint32(17)
    private const OpExtension uint32 = uint32(10)
    private const OpEntryPoint uint32 = uint32(15)
    private const OpDecorate uint32 = uint32(71)
    private const OpMemberDecorate uint32 = uint32(72)
    private const OpTypeInt uint32 = uint32(21)
    private const OpTypeFloat uint32 = uint32(22)
    private const OpTypeVector uint32 = uint32(23)
    private const OpTypeMatrix uint32 = uint32(24)
    private const OpTypeImage uint32 = uint32(25)
    private const OpTypeSampler uint32 = uint32(26)
    private const OpTypeArray uint32 = uint32(28)
    private const OpTypeRuntimeArray uint32 = uint32(29)
    private const OpTypeStruct uint32 = uint32(30)
    private const OpTypePointer uint32 = uint32(32)
    private const OpTypeSampledImage uint32 = uint32(27)
    private const OpConstant uint32 = uint32(43)
    private const OpVariable uint32 = uint32(59)
    private const DecorationLocation uint32 = uint32(30)
    private const DecorationBinding uint32 = uint32(33)
    private const DecorationDescriptorSet uint32 = uint32(34)
    private const DecorationOffset uint32 = uint32(35)
    private const DecorationArrayStride uint32 = uint32(6)
    private const StorageUniformConstant uint32 = uint32(0)
    private const StorageInput uint32 = uint32(1)
    private const StorageUniform uint32 = uint32(2)
    private const StorageOutput uint32 = uint32(3)
    private const StoragePushConstant uint32 = uint32(9)
    private const StorageStorageBuffer uint32 = uint32(12)
    private const DimBuffer uint32 = uint32(5)

    func Read(bytes[]uint8, allowVersion15 bool = false) SpirvModuleReflection {
        if bytes.Length < 20 || (bytes.Length & 3) != 0 {
            throw InvalidOperationException("SPIR-V byte length is invalid")
        }
        let words = [bytes.Length / 4]uint32
        for var index = 0; index < words.Length; index++ {
            words[index] = BinaryPrimitives.ReadUInt32LittleEndian(bytes.AsSpan(index * 4, 4))
        }
        if words[0] != Magic {
            throw InvalidOperationException("SPIR-V magic is invalid")
        }
        if words[1] != Version16 && !(allowVersion15 && words[1] == uint32(0x00010500)) {
            throw InvalidOperationException(
                "SPIR-V version must be ${(if allowVersion15 { "1.5 or 1.6" } else { "1.6" })}, found 0x${words[1]:x8}"
            )
        }
        let types = Dictionary[uint32, TypeInfo]()
        let variables = Dictionary[uint32, Variable]()
        let decorations = Dictionary[uint32, Decorations]()
        let memberOffsets = Dictionary[(StructId uint32, Member uint32), int32]()
        let arrayStrides = Dictionary[uint32, int32]()
        let constants = Dictionary[uint32, uint64]()
        let entryPoints = List[EntryPoint]()
        let capabilities = List[uint32]()
        let extensions = List[string]()
        var cursor = 5
        while cursor < words.Length {
            let header = words[cursor]
            let wordCount = int32((header >> 16))
            let opcode = header & uint32(0xffff)
            if wordCount <= 0 || cursor + wordCount > words.Length {
                throw InvalidOperationException("Invalid SPIR-V instruction at word $cursor")
            }
            ReadInstruction(
                words,
                cursor,
                wordCount,
                opcode,
                types,
                variables,
                decorations,
                memberOffsets,
                arrayStrides,
                constants,
                entryPoints,
                capabilities,
                extensions
            )
            cursor += wordCount
        }
        if entryPoints.Count != 1 {
            throw InvalidOperationException("SPIR-V module must contain one entry point, found ${entryPoints.Count}")
        }
        let entryPoint = entryPoints[0]
        let stage = switch entryPoint.Model {
            case 0: "vertex"
            case 4: "fragment"
            case 5: "compute"
            default: throw InvalidOperationException("Unsupported SPIR-V execution model ${entryPoint.Model}")
        }
        let entryInterfaces = HashSet[uint32](entryPoint.Interfaces)
        let inputs = List[SpirvInterface]()
        let outputs = List[SpirvInterface]()
        var pushConstant SpirvPushConstant? = nil
        let descriptors = List[SpirvDescriptor]()
        for (id, variable) in variables.OrderBy((pair KeyValuePair[uint32, Variable]) -> pair.Key) {
            if (variable.StorageClass is StorageUniformConstant or StorageUniform or StorageStorageBuffer) {
                let value = GetDecorations(decorations, id)
                if value.Binding == nil || value.DescriptorSet == nil {
                    throw InvalidOperationException("Descriptor variable %$id lacks set or binding")
                }
                let descriptor = ReflectDescriptor(
                    value.DescriptorSet!!,
                    value.Binding!!,
                    variable.TypeId,
                    variable.StorageClass,
                    types,
                    memberOffsets,
                    arrayStrides,
                    constants
                )
                descriptors.Add(descriptor)
                continue
            }
            if variable.StorageClass == StoragePushConstant {
                if pushConstant != nil {
                    throw InvalidOperationException("SPIR-V module has multiple push-constant variables")
                }
                pushConstant = ReflectPushConstant(variable.TypeId, types, memberOffsets, arrayStrides, constants)
                continue
            }
            if !entryInterfaces.Contains(id) || variable.StorageClass is not(StorageInput or StorageOutput) {
                continue
            }
            let interfaceDecorations = GetDecorations(decorations, id)
            if interfaceDecorations.Location == nil {
                continue
            }
            let type = RenderVariableType(variable.TypeId, types, constants)
            let reflected = SpirvInterface(interfaceDecorations.Location!!, type)
            if variable.StorageClass == StorageInput {
                inputs.Add(reflected)
            } else {
                outputs.Add(reflected)
            }
        }
        let orderedDescriptors = descriptors
            .OrderBy((value SpirvDescriptor) -> value.Set)
            .ThenBy((value SpirvDescriptor) -> value.Binding)
            .ToArray()
        return SpirvModuleReflection(
            stage,
            entryPoint.Name,
            inputs.OrderBy((value SpirvInterface) -> value.Location).ToArray(),
            outputs.OrderBy((value SpirvInterface) -> value.Location).ToArray(),
            pushConstant,
            orderedDescriptors.Length,
            orderedDescriptors,
            capabilities.Distinct().OrderBy((value uint32) -> value).ToArray(),
            extensions
                .Distinct(StringComparer.Ordinal)
                .OrderBy((value string) -> value, StringComparer.Ordinal)
                .ToArray()
        )
    }

    private func ReadInstruction(
        words[]uint32,
        cursor int32,
        wordCount int32,
        opcode uint32,
        types Dictionary[uint32, TypeInfo],
        variables Dictionary[uint32, Variable],
        decorations Dictionary[uint32, Decorations],
        memberOffsets Dictionary[(StructId uint32, Member uint32), int32],
        arrayStrides Dictionary[uint32, int32],
        constants Dictionary[uint32, uint64],
        entryPoints List[EntryPoint],
        capabilities List[uint32],
        extensions List[string]
    ) {
        if opcode == OpCapability {
            capabilities.Add(words[cursor + 1])
            return
        }
        if opcode == OpExtension {
            let (extension, _) = ReadString(words, cursor + 1, cursor + wordCount)
            extensions.Add(extension)
            return
        }
        if opcode == OpEntryPoint {
            let model = words[cursor + 1]
            let (name, nextWord) = ReadString(words, cursor + 3, cursor + wordCount)
            let interfaces = words[nextWord .. (cursor + wordCount)]
            entryPoints.Add(EntryPoint(model, name, interfaces))
            return
        }
        if opcode == OpDecorate {
            let target = words[cursor + 1]
            let decoration = words[cursor + 2]
            let value = GetDecorations(decorations, target)
            if decoration == DecorationLocation {
                value.Location = checked(int32(words[cursor + 3]))
            } else if decoration == DecorationBinding {
                value.Binding = checked(int32(words[cursor + 3]))
            } else if decoration == DecorationDescriptorSet {
                value.DescriptorSet = checked(int32(words[cursor + 3]))
            } else if decoration == DecorationArrayStride {
                arrayStrides[target] = checked(int32(words[cursor + 3]))
            }
            return
        }
        if opcode == OpMemberDecorate && words[cursor + 3] == DecorationOffset {
            memberOffsets[(words[cursor + 1], words[cursor + 2])] = checked(int32(words[cursor + 4]))
            return
        }
        if opcode == OpTypeInt ||
            opcode == OpTypeFloat ||
            opcode == OpTypeVector ||
            opcode == OpTypeMatrix ||
            opcode == OpTypeImage ||
            opcode == OpTypeSampler ||
            opcode == OpTypeArray ||
            opcode == OpTypeRuntimeArray ||
            opcode == OpTypeStruct ||
            opcode == OpTypePointer ||
            opcode == OpTypeSampledImage {
            let resultId = words[cursor + 1]
            types[resultId] = TypeInfo(opcode, words[(cursor + 2) .. (cursor + wordCount)])
            return
        }
        if opcode == OpConstant {
            let resultType = words[cursor + 1]
            let resultId = words[cursor + 2]
            let type = RequireType(types, resultType)
            let width = checked(int32(type.Operands[0]))
            constants[resultId] = if width <= 32 {
                uint64(words[cursor + 3])
            } else {
                uint64(words[cursor + 3]) | (uint64(words[cursor + 4]) << 32)
            }
            return
        }
        if opcode == OpVariable {
            variables[words[cursor + 2]] = Variable(words[cursor + 1], words[cursor + 3])
        }
    }

    private func ReflectDescriptor(
        set int32,
        binding int32,
        pointerTypeId uint32,
        storageClass uint32,
        types IReadOnlyDictionary[uint32, TypeInfo],
        memberOffsets IReadOnlyDictionary[(StructId uint32, Member uint32), int32],
        arrayStrides IReadOnlyDictionary[uint32, int32],
        constants IReadOnlyDictionary[uint32, uint64]
    ) SpirvDescriptor {
        let pointer = RequireType(types, pointerTypeId)
        if pointer.Opcode != OpTypePointer || pointer.Operands.Length != 2 || pointer.Operands[0] != storageClass {
            throw InvalidOperationException("Descriptor variable has an invalid pointer type")
        }
        let (descriptorType, descriptorCount) = ReflectDescriptorPointee(
            pointer.Operands[1],
            storageClass,
            types,
            constants
        )
        let (imageDimension, imageArrayed) = ReflectImageShape(pointer.Operands[1], types)
        var storageStride int32? = nil
        var storageMembers IReadOnlyList[SpirvStorageMember] = Array.Empty[SpirvStorageMember]()
        if storageClass == StorageStorageBuffer {
            storageStride,
            storageMembers = ReflectStorageRecord(pointer.Operands[1], types, memberOffsets, arrayStrides, constants)
        }
        return SpirvDescriptor(
            set,
            binding,
            descriptorType,
            descriptorCount,
            storageStride,
            storageMembers,
            imageDimension,
            imageArrayed
        )
    }

    private func ReflectImageShape(typeId uint32, types IReadOnlyDictionary[uint32, TypeInfo])(
        Dimension string?,
        Arrayed bool?
    ) {
        var type = RequireType(types, typeId)
        while type.Opcode == OpTypeArray {
            type = RequireType(types, type.Operands[0])
        }
        if type.Opcode == OpTypeSampledImage {
            type = RequireType(types, type.Operands[0])
        }
        if type.Opcode != OpTypeImage {
            return (nil, nil)
        }
        let dimension = switch type.Operands[1] {
            case 0: "1d"
            case 1: "2d"
            case 2: "3d"
            case 3: "cube"
            case 4: "rect"
            case 5: "buffer"
            case 6: "subpass-data"
            default: throw InvalidOperationException("Image type has unsupported dimension ${type.Operands[1]}")
        }
        return (dimension, type.Operands[3] != uint32(0))
    }

    private func ReflectStorageRecord(
        pointeeTypeId uint32,
        types IReadOnlyDictionary[uint32, TypeInfo],
        memberOffsets IReadOnlyDictionary[(StructId uint32, Member uint32), int32],
        arrayStrides IReadOnlyDictionary[uint32, int32],
        constants IReadOnlyDictionary[uint32, uint64]
    )(Stride int32?, Members IReadOnlyList[SpirvStorageMember]) {
        let block = RequireType(types, pointeeTypeId)
        if block.Opcode != OpTypeStruct {
            return (nil, Array.Empty[SpirvStorageMember]())
        }
        for var index uint32 = uint32(0); int64(index) < int64(block.Operands.Length); index++ {
            let memberTypeId = block.Operands[index]
            let memberType = RequireType(types, memberTypeId)
            if memberType.Opcode != OpTypeRuntimeArray {
                continue
            }
            if !arrayStrides.TryGetValue(memberTypeId, out var stride) {
                throw InvalidOperationException("Storage-buffer runtime array %$memberTypeId lacks an ArrayStride")
            }
            let elementTypeId = memberType.Operands[0]
            let elementType = RequireType(types, elementTypeId)
            if elementType.Opcode != OpTypeStruct {
                return (stride, Array.Empty[SpirvStorageMember]())
            }
            let members = List[SpirvStorageMember]()
            for var elementIndex uint32 = uint32(0);
                int64(elementIndex) < int64(elementType.Operands.Length);
                elementIndex++ {
                if !memberOffsets.TryGetValue((elementTypeId, elementIndex), out var offset) {
                    throw InvalidOperationException("Storage-buffer member $elementIndex lacks an offset")
                }
                let type = RenderType(elementType.Operands[elementIndex], types, constants)
                members.Add(SpirvStorageMember(offset, type))
            }
            return (stride, members)
        }
        return (nil, Array.Empty[SpirvStorageMember]())
    }

    private func ReflectDescriptorPointee(
        typeId uint32,
        storageClass uint32,
        types IReadOnlyDictionary[uint32, TypeInfo],
        constants IReadOnlyDictionary[uint32, uint64]
    )(Type string, Count int32) {
        let type = RequireType(types, typeId)
        if type.Opcode == OpTypeArray {
            if !constants.TryGetValue(type.Operands[1], out var length) || length > uint64(int32.MaxValue) {
                throw InvalidOperationException("Descriptor array %$typeId has an invalid length")
            }
            let (elementType, elementCount) = ReflectDescriptorPointee(type.Operands[0], storageClass, types, constants)
            return (elementType, checked(int32(length) * elementCount))
        }
        if type.Opcode == OpTypeSampledImage {
            return ("combined-image-sampler", 1)
        }
        if type.Opcode == OpTypeImage {
            if type.Operands.Length <= 5 {
                throw InvalidOperationException("Image descriptor %$typeId lacks its sampled operand")
            }
            if type.Operands[1] == DimBuffer && type.Operands[5] == uint32(1) {
                return ("uniform-texel-buffer", 1)
            }
            return switch type.Operands[5] {
                case 1: ("sampled-image", 1)
                case 2: ("storage-image", 1)
                default: throw InvalidOperationException(
                    "Image descriptor %$typeId has unsupported sampled operand ${type.Operands[5]}"
                )
            }
        }
        if type.Opcode == OpTypeSampler {
            return ("sampler", 1)
        }
        if type.Opcode == OpTypeStruct {
            return switch storageClass {
                case StorageUniform: ("uniform-buffer", 1)
                case StorageStorageBuffer: ("storage-buffer", 1)
                default: throw InvalidOperationException(
                    "Struct descriptor %$typeId has unsupported storage class $storageClass"
                )
            }
        }
        throw InvalidOperationException("Unsupported descriptor SPIR-V type opcode ${type.Opcode}")
    }

    private func ReflectPushConstant(
        pointerTypeId uint32,
        types IReadOnlyDictionary[uint32, TypeInfo],
        memberOffsets IReadOnlyDictionary[(StructId uint32, Member uint32), int32],
        arrayStrides IReadOnlyDictionary[uint32, int32],
        constants IReadOnlyDictionary[uint32, uint64]
    ) SpirvPushConstant {
        let pointer = RequireType(types, pointerTypeId)
        if pointer.Opcode != OpTypePointer ||
            pointer
            .Operands
            .Length != 2 ||
            pointer.Operands[0] != StoragePushConstant {
            throw InvalidOperationException("Push-constant variable has an invalid pointer type")
        }
        let structId = pointer.Operands[1]
        let structure = RequireType(types, structId)
        if structure.Opcode != OpTypeStruct {
            throw InvalidOperationException("Push-constant pointer does not reference a struct")
        }
        let members = List[SpirvPushConstantMember]()
        var size = 0
        for var index uint32 = uint32(0); int64(index) < int64(structure.Operands.Length); index++ {
            if !memberOffsets.TryGetValue((structId, index), out var offset) {
                throw InvalidOperationException("Push-constant member $index lacks an offset")
            }
            let memberTypeId = UnwrapPushConstantMember(
                structure.Operands[index],
                types,
                memberOffsets,
                arrayStrides,
                constants
            )
            let type = RenderType(memberTypeId, types, constants)
            let memberSize = SizeOf(memberTypeId, types, constants)
            members.Add(SpirvPushConstantMember(offset, type))
            size = Math.Max(size, checked(offset + memberSize))
        }
        return SpirvPushConstant(size, members)
    }

    private func UnwrapPushConstantMember(
        typeId uint32,
        types IReadOnlyDictionary[uint32, TypeInfo],
        memberOffsets IReadOnlyDictionary[(StructId uint32, Member uint32), int32],
        arrayStrides IReadOnlyDictionary[uint32, int32],
        constants IReadOnlyDictionary[uint32, uint64]
    ) uint32 {
        let wrapper = RequireType(types, typeId)
        if wrapper.Opcode != OpTypeStruct {
            return typeId
        }
        if wrapper.Operands.Length != 1 {
            throw InvalidOperationException("Push-constant wrapper %$typeId must contain exactly one member")
        }
        if !memberOffsets.TryGetValue((typeId, uint32(0)), out var offset) || offset != 0 {
            throw InvalidOperationException("Push-constant wrapper %$typeId member must have offset zero")
        }
        let memberTypeId = wrapper.Operands[0]
        let member = RequireType(types, memberTypeId)
        if member.Opcode != OpTypeArray || member.Operands.Length != 2 {
            throw InvalidOperationException("Push-constant wrapper %$typeId must contain one fixed array")
        }
        if !arrayStrides.TryGetValue(memberTypeId, out var stride) {
            throw InvalidOperationException("Push-constant wrapper array %$memberTypeId lacks an ArrayStride")
        }
        let elementSize = SizeOf(member.Operands[0], types, constants)
        if stride != elementSize {
            throw InvalidOperationException("Push-constant wrapper array %$memberTypeId has unsupported stride $stride")
        }
        return memberTypeId
    }

    private func RenderVariableType(
        pointerTypeId uint32,
        types IReadOnlyDictionary[uint32, TypeInfo],
        constants IReadOnlyDictionary[uint32, uint64]
    ) string {
        let pointer = RequireType(types, pointerTypeId)
        if pointer.Opcode != OpTypePointer || pointer.Operands.Length != 2 {
            throw InvalidOperationException("Interface type %$pointerTypeId is not a pointer")
        }
        return RenderType(pointer.Operands[1], types, constants)
    }

    private func RenderType(
        typeId uint32,
        types IReadOnlyDictionary[uint32, TypeInfo],
        constants IReadOnlyDictionary[uint32, uint64]
    ) string {
        let type = RequireType(types, typeId)
        if type.Opcode == OpTypeFloat {
            return if type.Operands[0] == uint32(32) {
                "float"
            } else {
                "float${type.Operands[0]}"
            }
        }
        if type.Opcode == OpTypeInt {
            let prefix = if type.Operands[1] == uint32(0) {
                "u"
            } else {
                string.Empty
            }
            return if type.Operands[0] == uint32(32) {
                prefix + "int"
            } else {
                prefix + "int" + type.Operands[0].ToString()
            }
        }
        if type.Opcode == OpTypeVector {
            let element = RenderType(type.Operands[0], types, constants)
            let prefix = if element == "float" {
                "vec"
            } else {
                (
                    if element == "int" {
                        "ivec"
                    } else {
                        (
                            if element == "uint" {
                                "uvec"
                            } else {
                                element + "vec"
                            }
                        )
                    }
                )
            }
            return prefix + type.Operands[1].ToString()
        }
        if type.Opcode == OpTypeMatrix {
            let column = RequireType(types, type.Operands[0])
            if column.Opcode == OpTypeVector && column.Operands.Length == 2 {
                let scalar = RenderType(column.Operands[0], types, constants)
                if scalar == "float" {
                    return if type.Operands[1] == column.Operands[1] {
                        "mat" + type.Operands[1].ToString()
                    } else {
                        "mat" + type.Operands[1].ToString() + "x" + column.Operands[1].ToString()
                    }
                }
            }
            throw InvalidOperationException("Unsupported matrix type %$typeId")
        }
        if type.Opcode == OpTypeArray {
            if !constants.TryGetValue(type.Operands[1], out var length) {
                throw InvalidOperationException("Array type %$typeId has an unknown length")
            }
            return RenderType(type.Operands[0], types, constants) + "[" + length.ToString() + "]"
        }
        throw InvalidOperationException("Unsupported reflected SPIR-V type opcode ${type.Opcode}")
    }

    private func SizeOf(
        typeId uint32,
        types IReadOnlyDictionary[uint32, TypeInfo],
        constants IReadOnlyDictionary[uint32, uint64]
    ) int32 {
        let type = RequireType(types, typeId)
        if (type.Opcode is OpTypeFloat or OpTypeInt) {
            return checked(int32(type.Operands[0]) / 8)
        }
        if (type.Opcode is OpTypeVector or OpTypeMatrix) {
            return checked(SizeOf(type.Operands[0], types, constants) * int32(type.Operands[1]))
        }
        if type.Opcode == OpTypeArray {
            if !constants.TryGetValue(type.Operands[1], out var length) {
                throw InvalidOperationException("Array type %$typeId has an unknown length")
            }
            return checked(SizeOf(type.Operands[0], types, constants) * int32(length))
        }
        throw InvalidOperationException("Unsupported SPIR-V size opcode ${type.Opcode}")
    }

    private func RequireType(types IReadOnlyDictionary[uint32, TypeInfo], id uint32) TypeInfo {
        if types.TryGetValue(id, out var type) {
            return type
        }
        throw InvalidOperationException("SPIR-V type %$id is missing")
    }

    private func GetDecorations(values Dictionary[uint32, Decorations], id uint32) Decorations {
        if !values.TryGetValue(id, out var value) {
            value = Decorations()
            values.Add(id, value)
        }
        return value
    }

    private func ReadString(words[]uint32, start int32, end int32)(Value string, NextWord int32) {
        let bytes = List[uint8]()
        var cursor = start
        var terminated = false
        while cursor < end && !terminated {
            let word = words[cursor++]
            for var shift = 0; shift < 32; shift += 8 {
                let value = uint8((word >> shift))
                if value == uint8(0) {
                    terminated = true
                    break
                }
                bytes.Add(value)
            }
        }
        if !terminated {
            throw InvalidOperationException("SPIR-V string is unterminated")
        }
        return (Encoding.UTF8.GetString(bytes.ToArray()), cursor)
    }
}
