import System
import System.Collections.Generic
import System.Linq

internal shared class EffectAbi {
    private data struct Interface(Location int32, Type string) : IEquatable[Interface] { }

    private data struct Descriptor(
        Set int32,
        Binding int32,
        Type string,
        Count int32,
        StorageStride int32?,
        ImageDimension string?,
        ImageArrayed bool?
    ) : IEquatable[Descriptor] { }

    const Id string = "goo-shader-effect-3"
    private let Outputs[]Interface = []Interface{Interface(0, "vec4")}
    private let Descriptors[]Descriptor = []Descriptor{
        Descriptor(0, 0, "combined-image-sampler", 1, nil, "2d", false),
        Descriptor(1, 0, "combined-image-sampler", 1, nil, "2d", false),
        Descriptor(2, 0, "storage-buffer", 1, 128, nil, nil),
        Descriptor(3, 0, "combined-image-sampler", 1, nil, "2d", true),
        Descriptor(3, 1, "storage-buffer", 1, 4, nil, nil)
    }
    private let DataDescriptor Descriptor = Descriptor(4, 0, "storage-buffer", 1, 4, nil, nil)
    private let PrimitiveMembers[]SpirvStorageMember = []SpirvStorageMember{
        SpirvStorageMember(0, "vec4"),
        SpirvStorageMember(16, "vec4"),
        SpirvStorageMember(32, "vec4"),
        SpirvStorageMember(48, "vec4"),
        SpirvStorageMember(64, "vec4"),
        SpirvStorageMember(80, "vec4"),
        SpirvStorageMember(96, "uvec4"),
        SpirvStorageMember(112, "uvec4")
    }

    func Validate(reflection SpirvModuleReflection, sourceIndependent bool = false) {
        Require(reflection.Stage == "fragment", "stage", "fragment")
        Require(reflection.EntryPoint == "main", "entryPoint", "main")
        RequireCapabilities(reflection.Capabilities)
        RequireExtensions(reflection.Extensions)
        var previousLocation = -1
        var inputMask = 0
        for input in reflection.Inputs {
            let type = if input.Location == 0 {
                "vec2"
            } else {
                "uint"
            }
            Require(
                ((input.Location is 0 or 2 or 3)) && input.Location > previousLocation,
                "inputs.location",
                "supported, strictly increasing location"
            )
            Require(input.Type == type, "inputs.type", type)
            inputMask |= 1 << input.Location
            previousLocation = input.Location
        }
        Require((inputMask & 8) != 0, "inputs.primitive", "present")
        Require(sourceIndependent || (inputMask & 1) != 0, "inputs.uv", "present")
        RequireInterfaces(reflection.Outputs, Outputs, "outputs")
        RequireDescriptors(reflection.Descriptors, sourceIndependent)
        if !sourceIndependent || reflection.PushConstant != nil {
            RequirePushConstants(reflection.PushConstant)
        }
    }

    private func RequireInterfaces(
        actual IReadOnlyList[SpirvInterface],
        expected IReadOnlyList[Interface],
        path string
    ) {
        Require(actual.Count == expected.Count, "$path.count", expected.Count.ToString())
        for var index = 0; index < expected.Count; index++ {
            Require(
                actual[index].Location == expected[index].Location,
                "$path[$index].location",
                expected[index].Location.ToString()
            )
            Require(actual[index].Type == expected[index].Type, "$path[$index].type", expected[index].Type)
        }
    }

    private func RequireDescriptors(actual IReadOnlyList[SpirvDescriptor], sourceIndependent bool) {
        var primitiveFound = false
        var previousSet = -1
        var previousBinding = -1
        for var index = 0; index < actual.Count; index++ {
            let value = actual[index]
            Require(
                value.Set > previousSet || value.Set == previousSet && value.Binding > previousBinding,
                "descriptors[$index].order",
                "strictly increasing"
            )
            var expected = if value.Set == 4 {
                DataDescriptor
            } else {
                default(Descriptor)
            }
            for candidate in Descriptors {
                if candidate.Set == value.Set && candidate.Binding == value.Binding {
                    expected = candidate
                    break
                }
            }
            Require(
                expected.Count != 0 && (!sourceIndependent || value.Set >= 2),
                "descriptors[$index]",
                "supported binding"
            )
            RequireDescriptor(value, expected, index)
            if value.Set == 2 {
                RequireStorageMembers(value.StorageMembers, PrimitiveMembers, "primitiveRecord.members")
                primitiveFound = true
            } else if value.Type == "storage-buffer" {
                Require(value.StorageMembers.Count == 0, "descriptors[$index].members.count", "0")
            }
            previousSet = value.Set
            previousBinding = value.Binding
        }
        Require(primitiveFound, "descriptors.primitiveRecord", "present")
    }

    private func RequireDescriptor(value SpirvDescriptor, expected Descriptor, index int32) {
        let path = "descriptors[$index]"
        Require(value.Set == expected.Set, "$path.set", expected.Set.ToString())
        Require(value.Binding == expected.Binding, "$path.binding", expected.Binding.ToString())
        Require(value.Type == expected.Type, "$path.type", expected.Type)
        Require(value.Count == expected.Count, "$path.count", expected.Count.ToString())
        Require(value.StorageStride == expected.StorageStride, "$path.storageStride", Render(expected.StorageStride))
        Require(
            value.ImageDimension == expected.ImageDimension,
            "$path.imageDimension",
            Render(expected.ImageDimension)
        )
        Require(value.ImageArrayed == expected.ImageArrayed, "$path.imageArrayed", Render(expected.ImageArrayed))
    }

    private func RequireStorageMembers(
        actual IReadOnlyList[SpirvStorageMember],
        expected IReadOnlyList[SpirvStorageMember],
        path string
    ) {
        Require(actual.Count == expected.Count, "$path.count", expected.Count.ToString())
        for var index = 0; index < expected.Count; index++ {
            Require(
                actual[index].Offset == expected[index].Offset,
                "$path[$index].offset",
                expected[index].Offset.ToString()
            )
            Require(actual[index].Type == expected[index].Type, "$path[$index].type", expected[index].Type)
        }
    }

    private func RequirePushConstants(actual SpirvPushConstant?) {
        let value = actual ?? throw InvalidOperationException("pushConstants must be present")
        Require(value.Size == 128, "pushConstants.size", "128")
        if value.Members.Count == 1 {
            Require(value.Members[0].Offset == 0, "pushConstants.members[0].offset", "0")
            Require(value.Members[0].Type == "vec4[8]", "pushConstants.members[0].type", "vec4[8]")
            return
        }
        Require(value.Members.Count == 8, "pushConstants.members.count", "1 or 8")
        for var index = 0; index < value.Members.Count; index++ {
            Require(
                value.Members[index].Offset == index * 16,
                "pushConstants.members[$index].offset",
                (index * 16).ToString()
            )
            Require(value.Members[index].Type == "vec4", "pushConstants.members[$index].type", "vec4")
        }
    }

    private func RequireCapabilities(actual IReadOnlyList[uint32]) {
        Require(actual.Contains(1u), "capabilities.shader", "present")
        for var index = 0; index < actual.Count; index++ {
            let capability = actual[index]
            if !((capability == uint32(1) || capability == uint32(50))) {
                throw InvalidOperationException("capabilities[$index] must be Shader or ImageQuery")
            }
        }
    }

    private func RequireExtensions(actual IReadOnlyList[string]) {
        for var index = 0; index < actual.Count; index++ {
            if actual[index] != "SPV_KHR_storage_buffer_storage_class" {
                throw InvalidOperationException("extensions[$index] must be SPV_KHR_storage_buffer_storage_class")
            }
        }
    }

    private func Render(value object?) string -> value?.ToString() ?? "null"

    private func Require(condition bool, path string, expected string) {
        if !condition {
            throw InvalidOperationException("$path must be $expected")
        }
    }
}
