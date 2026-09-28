internal static class EffectAbi
{
    public const string Id = "goo-shader-effect-2";

    private readonly record struct Interface(int Location, string Type);

    private readonly record struct Descriptor(
        int Set,
        int Binding,
        string Type,
        int Count,
        int? StorageStride,
        string? ImageDimension,
        bool? ImageArrayed);

    private static readonly Interface[] Inputs =
    {
        new(0, "vec2"),
        new(2, "uint"),
        new(3, "uint")
    };

    private static readonly Interface[] Outputs =
    {
        new(0, "vec4")
    };

    private static readonly Descriptor[] Descriptors =
    {
        new(0, 0, "combined-image-sampler", 1, null, "2d", false),
        new(1, 0, "combined-image-sampler", 1, null, "2d", false),
        new(2, 0, "storage-buffer", 1, 128, null, null),
        new(3, 0, "combined-image-sampler", 1, null, "2d", true),
        new(3, 1, "storage-buffer", 1, 4, null, null)
    };

    private static readonly Descriptor DataDescriptor =
        new(4, 0, "storage-buffer", 1, 4, null, null);

    private static readonly SpirvStorageMember[] PrimitiveMembers =
    {
        new(0, "vec4"),
        new(16, "vec4"),
        new(32, "vec4"),
        new(48, "vec4"),
        new(64, "vec4"),
        new(80, "vec4"),
        new(96, "uvec4"),
        new(112, "uvec4")
    };

    public static void Validate(SpirvModuleReflection reflection, bool sourceIndependent = false)
    {
        Require(reflection.Stage == "fragment", "stage", "fragment");
        Require(reflection.EntryPoint == "main", "entryPoint", "main");
        RequireCapabilities(reflection.Capabilities);
        RequireExtensions(reflection.Extensions);
        RequireInterfaces(reflection.Inputs,
            sourceIndependent && reflection.Inputs.Count == 2 ? Inputs[1..] : Inputs, "inputs");
        RequireInterfaces(reflection.Outputs, Outputs, "outputs");
        RequireDescriptors(reflection.Descriptors, sourceIndependent);
        if (!sourceIndependent || reflection.PushConstant is not null)
        {
            RequirePushConstants(reflection.PushConstant);
        }
    }

    private static void RequireInterfaces(
        IReadOnlyList<SpirvInterface> actual,
        IReadOnlyList<Interface> expected,
        string path)
    {
        Require(actual.Count == expected.Count, $"{path}.count", expected.Count.ToString());
        for (int index = 0; index < expected.Count; index++)
        {
            Require(actual[index].Location == expected[index].Location,
                $"{path}[{index}].location", expected[index].Location.ToString());
            Require(actual[index].Type == expected[index].Type,
                $"{path}[{index}].type", expected[index].Type);
        }
    }

    private static void RequireDescriptors(IReadOnlyList<SpirvDescriptor> actual,
        bool sourceIndependent)
    {
        int first = sourceIndependent ? 2 : 0;
        int expectedCount = Descriptors.Length - first;
        Require(actual.Count == expectedCount || actual.Count == expectedCount + 1,
            "descriptors.count", $"{expectedCount} or {expectedCount + 1}");
        for (int index = 0; index < expectedCount; index++)
        {
            RequireDescriptor(actual[index], Descriptors[index + first], index);
        }
        RequireStorageMembers(actual[2 - first].StorageMembers, PrimitiveMembers,
            "primitiveRecord.members");
        Require(actual[4 - first].StorageMembers.Count == 0, "clipChain.members.count", "0");
        if (actual.Count == expectedCount + 1)
        {
            RequireDescriptor(actual[expectedCount], DataDescriptor, expectedCount);
            Require(actual[expectedCount].StorageMembers.Count == 0,
                "effectData.members.count", "0");
        }
    }

    private static void RequireDescriptor(SpirvDescriptor value, Descriptor expected, int index)
    {
        string path = $"descriptors[{index}]";
        Require(value.Set == expected.Set, $"{path}.set", expected.Set.ToString());
        Require(value.Binding == expected.Binding, $"{path}.binding", expected.Binding.ToString());
        Require(value.Type == expected.Type, $"{path}.type", expected.Type);
        Require(value.Count == expected.Count, $"{path}.count", expected.Count.ToString());
        Require(value.StorageStride == expected.StorageStride,
            $"{path}.storageStride", Render(expected.StorageStride));
        Require(value.ImageDimension == expected.ImageDimension,
            $"{path}.imageDimension", Render(expected.ImageDimension));
        Require(value.ImageArrayed == expected.ImageArrayed,
            $"{path}.imageArrayed", Render(expected.ImageArrayed));
    }

    private static void RequireStorageMembers(
        IReadOnlyList<SpirvStorageMember> actual,
        IReadOnlyList<SpirvStorageMember> expected,
        string path)
    {
        Require(actual.Count == expected.Count, $"{path}.count", expected.Count.ToString());
        for (int index = 0; index < expected.Count; index++)
        {
            Require(actual[index].Offset == expected[index].Offset,
                $"{path}[{index}].offset", expected[index].Offset.ToString());
            Require(actual[index].Type == expected[index].Type,
                $"{path}[{index}].type", expected[index].Type);
        }
    }

    private static void RequirePushConstants(SpirvPushConstant? actual)
    {
        SpirvPushConstant value = actual
            ?? throw new InvalidOperationException("pushConstants must be present");
        Require(value.Size == 128, "pushConstants.size", "128");
        if (value.Members.Count == 1)
        {
            Require(value.Members[0].Offset == 0, "pushConstants.members[0].offset", "0");
            Require(value.Members[0].Type == "vec4[8]", "pushConstants.members[0].type", "vec4[8]");
            return;
        }
        Require(value.Members.Count == 8, "pushConstants.members.count", "1 or 8");
        for (int index = 0; index < value.Members.Count; index++)
        {
            Require(value.Members[index].Offset == index * 16,
                $"pushConstants.members[{index}].offset", (index * 16).ToString());
            Require(value.Members[index].Type == "vec4",
                $"pushConstants.members[{index}].type", "vec4");
        }
    }

    private static void RequireCapabilities(IReadOnlyList<uint> actual)
    {
        Require(actual.Contains(1u), "capabilities.shader", "present");
        for (int index = 0; index < actual.Count; index++)
        {
            uint capability = actual[index];
            if (capability is not (1 or 50))
            {
                throw new InvalidOperationException(
                    $"capabilities[{index}] must be Shader or ImageQuery");
            }
        }
    }

    private static void RequireExtensions(IReadOnlyList<string> actual)
    {
        for (int index = 0; index < actual.Count; index++)
        {
            if (actual[index] != "SPV_KHR_storage_buffer_storage_class")
            {
                throw new InvalidOperationException(
                    $"extensions[{index}] must be SPV_KHR_storage_buffer_storage_class");
            }
        }
    }

    private static string Render(object? value) => value?.ToString() ?? "null";

    private static void Require(bool condition, string path, string expected)
    {
        if (!condition)
        {
            throw new InvalidOperationException($"{path} must be {expected}");
        }
    }
}
