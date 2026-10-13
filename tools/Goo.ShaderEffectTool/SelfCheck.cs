using System.Buffers.Binary;

internal static class SelfCheck
{
    private const uint OpExtension = 10;
    private const uint OpEntryPoint = 15;
    private const uint OpCapability = 17;
    private const uint OpTypeImage = 25;
    private const uint OpTypeStruct = 30;
    private const uint OpTypePointer = 32;
    private const uint OpVariable = 59;
    private const uint OpDecorate = 71;
    private const uint OpMemberDecorate = 72;
    private const uint DecorationLocation = 30;
    private const uint DecorationArrayStride = 6;
    private const uint DecorationBinding = 33;
    private const uint DecorationDescriptorSet = 34;
    private const uint DecorationOffset = 35;
    private const uint StoragePushConstant = 9;

    public static void Run(string input, SpirvValidator validator)
    {
        Program.ValidateArtifact(input, validator);
        byte[] valid = File.ReadAllBytes(input);
        uint firstSet = (uint)SpirvReflection.Read(valid).Descriptors[0].Set;
        string directory = Path.Combine(Path.GetTempPath(),
            $"goo-shader-effect-selfcheck-{Guid.NewGuid():N}");
        Directory.CreateDirectory(directory);
        int rejectionCount = 9;
        try
        {
            ExpectRejected(directory, "wrong-stage", MutateInstruction(valid, OpEntryPoint,
                (_, words, cursor) => words[cursor + 1] = 0), validator);
            ExpectRejected(directory, "wrong-location", MutateDecoration(valid,
                DecorationLocation, 0, 1), validator);
            ExpectRejected(directory, "wrong-set", MutateDecoration(valid,
                DecorationDescriptorSet, firstSet, 9), validator);
            ExpectRejected(directory, "wrong-binding", MutateDecoration(valid,
                DecorationBinding, 0, 9), validator);
            ExpectRejected(directory, "wrong-push-layout", MutatePushOffset(valid), validator);
            ExpectRejected(directory, "wrong-image-shape", MutateInstruction(valid, OpTypeImage,
                (_, words, cursor) => words[cursor + 5] = words[cursor + 5] == 0 ? 1u : 0u), validator);
            ExpectRejected(directory, "extra-capability", InsertInstruction(valid,
                new uint[] { (2u << 16) | OpCapability, 10u }), validator);
            ExpectRejected(directory, "extra-extension", InsertInstruction(valid,
                EncodeStringInstruction(OpExtension, "SPV_KHR_non_semantic_info")), validator);
            ExpectRejected(directory, "malformed", valid[..^4], validator);
            byte[]? nestedOffset = MutateNestedPushLayout(valid, false);
            if (nestedOffset is not null)
            {
                ExpectRejected(directory, "wrong-nested-push-offset", nestedOffset, validator);
                rejectionCount++;
            }
            byte[]? nestedStride = MutateNestedPushLayout(valid, true);
            if (nestedStride is not null)
            {
                ExpectRejected(directory, "wrong-nested-push-stride", nestedStride, validator);
                rejectionCount++;
            }
        }
        finally
        {
            Directory.Delete(directory, true);
        }
        Console.WriteLine(
            $"ShaderEffect validator self-check passed with {rejectionCount} rejected variants");
    }

    private static void ExpectRejected(
        string directory,
        string name,
        byte[] bytes,
        SpirvValidator validator)
    {
        string path = Path.Combine(directory, name + ".spv");
        File.WriteAllBytes(path, bytes);
        bool rejected = false;
        try
        {
            Program.ValidateArtifact(path, validator);
        }
        catch (Exception)
        {
            rejected = true;
        }
        if (!rejected)
        {
            throw new InvalidOperationException($"Self-check variant was accepted: {name}");
        }
    }

    private static byte[] MutateDecoration(
        byte[] source,
        uint decoration,
        uint current,
        uint replacement)
    {
        return MutateInstruction(source, OpDecorate, (wordCount, words, cursor) =>
        {
            if (wordCount >= 4 && words[cursor + 2] == decoration
                && words[cursor + 3] == current)
            {
                words[cursor + 3] = replacement;
                return;
            }
            throw new SkipInstructionException();
        });
    }

    private static byte[] MutatePushOffset(byte[] source)
    {
        uint[] words = ReadWords(source);
        uint pointerType = 0;
        Walk(words, (wordCount, opcode, cursor) =>
        {
            if (opcode == OpVariable && wordCount >= 4
                && words[cursor + 3] == StoragePushConstant)
            {
                pointerType = words[cursor + 1];
                return false;
            }
            return true;
        });
        if (pointerType == 0)
        {
            throw new InvalidOperationException("Self-check could not find the push-constant variable");
        }
        uint structure = 0;
        Walk(words, (wordCount, opcode, cursor) =>
        {
            if (opcode == OpTypePointer && wordCount >= 4 && words[cursor + 1] == pointerType)
            {
                structure = words[cursor + 3];
                return false;
            }
            return true;
        });
        bool changed = false;
        Walk(words, (wordCount, opcode, cursor) =>
        {
            if (opcode == OpMemberDecorate && wordCount >= 5
                && words[cursor + 1] == structure && words[cursor + 2] == 0
                && words[cursor + 3] == DecorationOffset)
            {
                words[cursor + 4] = 16;
                changed = true;
                return false;
            }
            return true;
        });
        if (!changed)
        {
            throw new InvalidOperationException("Self-check could not find the push-constant offset");
        }
        return WriteWords(words);
    }

    private static byte[]? MutateNestedPushLayout(byte[] source, bool stride)
    {
        uint[] words = ReadWords(source);
        uint pointerType = 0;
        Walk(words, (wordCount, opcode, cursor) =>
        {
            if (opcode == OpVariable && wordCount >= 4
                && words[cursor + 3] == StoragePushConstant)
            {
                pointerType = words[cursor + 1];
                return false;
            }
            return true;
        });
        uint structure = 0;
        Walk(words, (wordCount, opcode, cursor) =>
        {
            if (opcode == OpTypePointer && wordCount >= 4 && words[cursor + 1] == pointerType)
            {
                structure = words[cursor + 3];
                return false;
            }
            return true;
        });
        uint wrapper = 0;
        Walk(words, (wordCount, opcode, cursor) =>
        {
            if (opcode == OpTypeStruct && wordCount == 3 && words[cursor + 1] == structure)
            {
                wrapper = words[cursor + 2];
                return false;
            }
            return true;
        });
        uint array = 0;
        Walk(words, (wordCount, opcode, cursor) =>
        {
            if (opcode == OpTypeStruct && wordCount == 3 && words[cursor + 1] == wrapper)
            {
                array = words[cursor + 2];
                return false;
            }
            return true;
        });
        if (array == 0)
        {
            return null;
        }
        bool changed = false;
        Walk(words, (wordCount, opcode, cursor) =>
        {
            if (!stride && opcode == OpMemberDecorate && wordCount >= 5
                && words[cursor + 1] == wrapper && words[cursor + 2] == 0
                && words[cursor + 3] == DecorationOffset)
            {
                words[cursor + 4] = 16;
                changed = true;
                return false;
            }
            if (stride && opcode == OpDecorate && wordCount >= 4
                && words[cursor + 1] == array
                && words[cursor + 2] == DecorationArrayStride)
            {
                words[cursor + 3] *= 2;
                changed = true;
                return false;
            }
            return true;
        });
        return changed ? WriteWords(words) : null;
    }

    private static byte[] MutateInstruction(
        byte[] source,
        uint expectedOpcode,
        Action<int, uint[], int> mutation)
    {
        uint[] words = ReadWords(source);
        bool changed = false;
        Walk(words, (wordCount, opcode, cursor) =>
        {
            if (opcode != expectedOpcode)
            {
                return true;
            }
            try
            {
                mutation(wordCount, words, cursor);
                changed = true;
                return false;
            }
            catch (SkipInstructionException)
            {
                return true;
            }
        });
        if (!changed)
        {
            throw new InvalidOperationException(
                $"Self-check could not mutate SPIR-V opcode {expectedOpcode}");
        }
        return WriteWords(words);
    }

    private static byte[] InsertInstruction(byte[] source, IReadOnlyList<uint> instruction)
    {
        uint[] words = ReadWords(source);
        uint[] expanded = new uint[words.Length + instruction.Count];
        Array.Copy(words, 0, expanded, 0, 5);
        for (int index = 0; index < instruction.Count; index++)
        {
            expanded[5 + index] = instruction[index];
        }
        Array.Copy(words, 5, expanded, 5 + instruction.Count, words.Length - 5);
        return WriteWords(expanded);
    }

    private static uint[] EncodeStringInstruction(uint opcode, string value)
    {
        byte[] text = System.Text.Encoding.UTF8.GetBytes(value + "\0");
        int textWords = (text.Length + 3) / 4;
        uint[] instruction = new uint[textWords + 1];
        instruction[0] = ((uint)instruction.Length << 16) | opcode;
        for (int index = 0; index < text.Length; index++)
        {
            instruction[1 + index / 4] |= (uint)text[index] << ((index % 4) * 8);
        }
        return instruction;
    }

    private static uint[] ReadWords(byte[] source)
    {
        if ((source.Length & 3) != 0)
        {
            throw new InvalidOperationException("Self-check SPIR-V is not word aligned");
        }
        uint[] words = new uint[source.Length / 4];
        for (int index = 0; index < words.Length; index++)
        {
            words[index] = BinaryPrimitives.ReadUInt32LittleEndian(source.AsSpan(index * 4, 4));
        }
        return words;
    }

    private static byte[] WriteWords(uint[] words)
    {
        byte[] bytes = new byte[words.Length * 4];
        for (int index = 0; index < words.Length; index++)
        {
            BinaryPrimitives.WriteUInt32LittleEndian(bytes.AsSpan(index * 4, 4), words[index]);
        }
        return bytes;
    }

    private static void Walk(uint[] words, Func<int, uint, int, bool> visitor)
    {
        int cursor = 5;
        while (cursor < words.Length)
        {
            uint instruction = words[cursor];
            int wordCount = checked((int)(instruction >> 16));
            uint opcode = instruction & 0xffff;
            if (wordCount <= 0 || cursor + wordCount > words.Length)
            {
                throw new InvalidOperationException($"Invalid SPIR-V instruction at word {cursor}");
            }
            if (!visitor(wordCount, opcode, cursor))
            {
                return;
            }
            cursor += wordCount;
        }
    }

    private sealed class SkipInstructionException : Exception;
}
