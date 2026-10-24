import System
import System.Buffers.Binary
import System.Collections.Generic
import System.IO
import System.Text

internal shared class SelfCheck {
    private class SkipInstructionException : Exception { }

    private const OpExtension uint32 = uint32(10)
    private const OpEntryPoint uint32 = uint32(15)
    private const OpCapability uint32 = uint32(17)
    private const OpTypeImage uint32 = uint32(25)
    private const OpTypeStruct uint32 = uint32(30)
    private const OpTypePointer uint32 = uint32(32)
    private const OpVariable uint32 = uint32(59)
    private const OpDecorate uint32 = uint32(71)
    private const OpMemberDecorate uint32 = uint32(72)
    private const DecorationLocation uint32 = uint32(30)
    private const DecorationArrayStride uint32 = uint32(6)
    private const DecorationBinding uint32 = uint32(33)
    private const DecorationDescriptorSet uint32 = uint32(34)
    private const DecorationOffset uint32 = uint32(35)
    private const StoragePushConstant uint32 = uint32(9)

    func Run(input string, validator SpirvValidator) {
        Program.ValidateArtifact(input, validator)
        let valid = File.ReadAllBytes(input)
        let firstSet = uint32(SpirvReflection.Read(valid, true).Descriptors[0].Set)
        let directory = Path.Combine(Path.GetTempPath(), "goo-shader-effect-selfcheck-${Guid.NewGuid():N}")
        Directory.CreateDirectory(directory)
        var rejectionCount = 9
        try {
            ExpectRejected(
                directory,
                "wrong-stage",
                MutateInstruction(
                    valid,
                    OpEntryPoint,
                    (_ int32, words[]uint32, cursor int32) -> {
                        words[cursor + 1] = uint32(0)
                    }
                ),
                validator
            )
            ExpectRejected(directory, "wrong-location", MutateDecoration(valid, DecorationLocation, 0, 1), validator)
            ExpectRejected(
                directory,
                "wrong-set",
                MutateDecoration(valid, DecorationDescriptorSet, firstSet, 9),
                validator
            )
            ExpectRejected(directory, "wrong-binding", MutateDecoration(valid, DecorationBinding, 0, 9), validator)
            ExpectRejected(directory, "wrong-push-layout", MutatePushOffset(valid), validator)
            ExpectRejected(
                directory,
                "wrong-image-shape",
                MutateInstruction(
                    valid,
                    OpTypeImage,
                    (_ int32, words[]uint32, cursor int32) -> {
                        words[cursor + 5] = if words[cursor + 5] == uint32(0) {
                            1u
                        } else {
                            0u
                        }
                    }
                ),
                validator
            )
            ExpectRejected(
                directory,
                "extra-capability",
                InsertInstruction(valid, []uint32{(2u << 16) | OpCapability, 10u}),
                validator
            )
            ExpectRejected(
                directory,
                "extra-extension",
                InsertInstruction(valid, EncodeStringInstruction(OpExtension, "SPV_KHR_non_semantic_info")),
                validator
            )
            ExpectRejected(directory, "malformed", valid[.. ^4], validator)
            let nestedOffset[]?uint8 = MutateNestedPushLayout(valid, false)
            if nestedOffset != nil {
                ExpectRejected(directory, "wrong-nested-push-offset", nestedOffset, validator)
                rejectionCount++
            }
            let nestedStride[]?uint8 = MutateNestedPushLayout(valid, true)
            if nestedStride != nil {
                ExpectRejected(directory, "wrong-nested-push-stride", nestedStride, validator)
                rejectionCount++
            }
        } finally {
            Directory.Delete(directory, true)
        }
        Console.WriteLine("ShaderEffect validator self-check passed with $rejectionCount rejected variants")
    }

    private func ExpectRejected(directory string, name string, bytes[]uint8, validator SpirvValidator) {
        let path = Path.Combine(directory, name + ".spv")
        File.WriteAllBytes(path, bytes)
        var rejected = false
        try {
            Program.ValidateArtifact(path, validator)
        } catch (Exception) {
            rejected = true
        }
        if !rejected {
            throw InvalidOperationException("Self-check variant was accepted: $name")
        }
    }

    private func MutateDecoration(
        source[]uint8,
        decoration uint32,
        current uint32,
        replacement uint32
    )[]uint8 -> MutateInstruction(
        source,
        OpDecorate,
        (wordCount int32, words[]uint32, cursor int32) -> {
            if wordCount >= 4 && words[cursor + 2] == decoration && words[cursor + 3] == current {
                words[cursor + 3] = replacement
                return
            }
            throw SkipInstructionException()
        }
    )

    private func MutatePushOffset(source[]uint8)[]uint8 {
        let words = ReadWords(source)
        var pointerType uint32 = uint32(0)
        Walk(
            words,
            (wordCount int32, opcode uint32, cursor int32) -> {
                if opcode == OpVariable && wordCount >= 4 && words[cursor + 3] == StoragePushConstant {
                    pointerType = words[cursor + 1]
                    return false
                }
                return true
            }
        )
        if pointerType == uint32(0) {
            throw InvalidOperationException("Self-check could not find the push-constant variable")
        }
        var structure uint32 = uint32(0)
        Walk(
            words,
            (wordCount int32, opcode uint32, cursor int32) -> {
                if opcode == OpTypePointer && wordCount >= 4 && words[cursor + 1] == pointerType {
                    structure = words[cursor + 3]
                    return false
                }
                return true
            }
        )
        var changed = false
        Walk(
            words,
            (wordCount int32, opcode uint32, cursor int32) -> {
                if opcode == OpMemberDecorate &&
                    wordCount >= 5 &&
                    words[cursor + 1] == structure &&
                    words[cursor + 2] == uint32(0) &&
                    words[cursor + 3] == DecorationOffset {
                    words[cursor + 4] = uint32(16)
                    changed = true
                    return false
                }
                return true
            }
        )
        if !changed {
            throw InvalidOperationException("Self-check could not find the push-constant offset")
        }
        return WriteWords(words)
    }

    private func MutateNestedPushLayout(source[]uint8, stride bool)[]?uint8 {
        let words = ReadWords(source)
        var pointerType uint32 = uint32(0)
        Walk(
            words,
            (wordCount int32, opcode uint32, cursor int32) -> {
                if opcode == OpVariable && wordCount >= 4 && words[cursor + 3] == StoragePushConstant {
                    pointerType = words[cursor + 1]
                    return false
                }
                return true
            }
        )
        var structure uint32 = uint32(0)
        Walk(
            words,
            (wordCount int32, opcode uint32, cursor int32) -> {
                if opcode == OpTypePointer && wordCount >= 4 && words[cursor + 1] == pointerType {
                    structure = words[cursor + 3]
                    return false
                }
                return true
            }
        )
        var wrapper uint32 = uint32(0)
        Walk(
            words,
            (wordCount int32, opcode uint32, cursor int32) -> {
                if opcode == OpTypeStruct && wordCount == 3 && words[cursor + 1] == structure {
                    wrapper = words[cursor + 2]
                    return false
                }
                return true
            }
        )
        var array uint32 = uint32(0)
        Walk(
            words,
            (wordCount int32, opcode uint32, cursor int32) -> {
                if opcode == OpTypeStruct && wordCount == 3 && words[cursor + 1] == wrapper {
                    array = words[cursor + 2]
                    return false
                }
                return true
            }
        )
        if array == uint32(0) {
            return nil
        }
        var changed = false
        Walk(
            words,
            (wordCount int32, opcode uint32, cursor int32) -> {
                if !stride &&
                    opcode == OpMemberDecorate &&
                    wordCount >= 5 &&
                    words[cursor + 1] == wrapper &&
                    words[cursor + 2] == uint32(0) &&
                    words[cursor + 3] == DecorationOffset {
                    words[cursor + 4] = uint32(16)
                    changed = true
                    return false
                }
                if stride &&
                    opcode == OpDecorate &&
                    wordCount >= 4 &&
                    words[cursor + 1] == array &&
                    words[cursor + 2] == DecorationArrayStride {
                    words[cursor + 3] *= uint32(uint32(2))
                    changed = true
                    return false
                }
                return true
            }
        )
        return if changed {
            WriteWords(words)
        } else {
            default([]?uint8)
        }
    }

    private func MutateInstruction(
        source[]uint8,
        expectedOpcode uint32,
        mutation(int32, []uint32, int32) -> void
    )[]uint8 {
        let words = ReadWords(source)
        var changed = false
        Walk(
            words,
            (wordCount int32, opcode uint32, cursor int32) -> {
                if opcode != expectedOpcode {
                    return true
                }
                try {
                    mutation(wordCount, words, cursor)
                    changed = true
                    return false
                } catch (SkipInstructionException) {
                    return true
                }
            }
        )
        if !changed {
            throw InvalidOperationException("Self-check could not mutate SPIR-V opcode $expectedOpcode")
        }
        return WriteWords(words)
    }

    private func InsertInstruction(source[]uint8, instruction IReadOnlyList[uint32])[]uint8 {
        let words = ReadWords(source)
        let expanded = [words.Length + instruction.Count]uint32
        Array.Copy(words, 0, expanded, 0, 5)
        for var index = 0; index < instruction.Count; index++ {
            expanded[5 + index] = instruction[index]
        }
        Array.Copy(words, 5, expanded, 5 + instruction.Count, words.Length - 5)
        return WriteWords(expanded)
    }

    private func EncodeStringInstruction(opcode uint32, value string)[]uint32 {
        let text = Encoding.UTF8.GetBytes(value + "\u0000")
        let textWords = (text.Length + 3) / 4
        let instruction = [textWords + 1]uint32
        instruction[0] = (uint32(instruction.Length) << 16) | opcode
        for var index = 0; index < text.Length; index++ {
            instruction[1 + index / 4] |= uint32(text[index]) << ((index % 4) * 8)
        }
        return instruction
    }

    private func ReadWords(source[]uint8)[]uint32 {
        if (source.Length & 3) != 0 {
            throw InvalidOperationException("Self-check SPIR-V is not word aligned")
        }
        let words = [source.Length / 4]uint32
        for var index = 0; index < words.Length; index++ {
            words[index] = BinaryPrimitives.ReadUInt32LittleEndian(source.AsSpan(index * 4, 4))
        }
        return words
    }

    private func WriteWords(words[]uint32)[]uint8 {
        let bytes = [words.Length * 4]uint8
        for var index = 0; index < words.Length; index++ {
            BinaryPrimitives.WriteUInt32LittleEndian(bytes.AsSpan(index * 4, 4), words[index])
        }
        return bytes
    }

    private func Walk(words[]uint32, visitor(int32, uint32, int32) -> bool) {
        var cursor = 5
        while cursor < words.Length {
            let instruction = words[cursor]
            let wordCount = checked(int32((instruction >> 16)))
            let opcode = instruction & uint32(0xffff)
            if wordCount <= 0 || cursor + wordCount > words.Length {
                throw InvalidOperationException("Invalid SPIR-V instruction at word $cursor")
            }
            if !visitor(wordCount, opcode, cursor) {
                return
            }
            cursor += wordCount
        }
    }
}
