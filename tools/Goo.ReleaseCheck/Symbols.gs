import System
import System.Collections.Generic
import System.Collections.Immutable
import System.IO
import System.IO.Compression
import System.Linq
import System.Reflection.Metadata
import System.Reflection.PortableExecutable
import System.Security.Cryptography
import System.Text

internal shared partial class ReleaseCheck {
    private func ValidateSymbols(packagePath string, symbolsPath string) {
        using let archive = ZipFile.OpenRead(packagePath)
        using let symbols = ZipFile.OpenRead(symbolsPath)
        let names = HashSet[string](symbols.Entries.Select(e -> e.FullName), StringComparer.Ordinal)
        let expected = HashSet[string](
            []string{"_rels/.rels", "Goo.nuspec", "[Content_Types].xml", "lib/net10.0/Yoga.Net.pdb"},
            StringComparer.Ordinal
        )
        let variable = names.Where(
            n -> n.StartsWith("package/services/metadata/core-properties/") && n.EndsWith(".psmdcp")
        )
            .ToArray()
        Require(
            variable.Length == 1 && names.Except(variable).ToHashSet().SetEquals(expected),
            "symbol package allowlist mismatch"
        )
        for name in names.Where(n -> n.EndsWith(".pdb")).OrderBy(n -> n) {
            let dll = name.Substring(0, name.Length - 4) + ".dll"
            Require(archive.GetEntry(dll) != nil, "symbol package has no matching assembly: " + name)
            let bytes = ReadEntry(symbols, name)
            using let pdbStream = MemoryStream(bytes, false)
            using let provider = MetadataReaderProvider.FromPortablePdbStream(pdbStream)
            let reader = provider.GetMetadataReader()
            let identity = reader.DebugMetadataHeader!!.Id.ToArray()
            Require(identity.Length == 20, "portable PDB has no valid #Pdb stream")
            let canonical = CanonicalPdb(bytes)
            let assembly = ReadEntry(archive, dll)
            using let dllStream = MemoryStream(assembly, false)
            using let pe = PEReader(dllStream)
            let entries = DebugEntries(pe, assembly.Length)
            let codeview = entries.Where(e -> e.Type == DebugDirectoryEntryType.CodeView).ToArray()
            let checksums = entries.Where(e -> e.Type == DebugDirectoryEntryType.PdbChecksum).ToArray()
            Require(codeview.Length == 1 && checksums.Length == 1, "assembly debug records are incomplete: " + dll)
            let data = pe.ReadCodeViewDebugDirectoryData(codeview[0])
            Require(
                identity.Take(16).SequenceEqual(data.Guid.ToByteArray()) && UInt32(identity, 16) == codeview[0].Stamp,
                "PDB identity does not match assembly: " + name
            )
            let checksum = pe.ReadPdbChecksumDebugDirectoryData(checksums[0])
            Require(
                checksum.AlgorithmName == "SHA256" && checksum.Checksum.SequenceEqual(SHA256.HashData(canonical)),
                "PDB checksum does not match assembly: " + name
            )
        }
        Console.WriteLine("Symbols OK: ${FileInfo(symbolsPath).Length} bytes")
    }

    private func DebugEntries(pe PEReader, size int32) ImmutableArray[DebugDirectoryEntry] {
        let entries = pe.ReadDebugDirectory()
        for entry in entries {
            Require(
                entry.DataSize == 0 ||
                    (entry.DataPointer >= 0 && entry.DataSize > 0 && entry.DataPointer <= size - entry.DataSize),
                "managed assembly has invalid debug data"
            )
        }
        return entries
    }

    private func CanonicalPdb(bytes[]byte)[]byte {
        Require(
            bytes.Length >= 24 && StartsWithBytes(bytes, Encoding.ASCII.GetBytes("BSJB")),
            "symbol file is not a portable PDB"
        )
        let versionLength = UInt32(bytes, 12)
        Require(versionLength <= uint32(bytes.Length - 16), "portable PDB has an invalid metadata header")
        var position = (16 + int32(versionLength) + 3) & ~3
        Require(position <= bytes.Length - 4, "portable PDB has an invalid metadata header")
        let count = System.Buffers.Binary.BinaryPrimitives.ReadUInt16LittleEndian(bytes.AsSpan(position + 2, 2))
        position += 4
        var pdbOffset = -1
        var index = 0
        while index < count {
            Require(position <= bytes.Length - 8, "portable PDB has an invalid stream table")
            let offset = UInt32(bytes, position)
            let size = UInt32(bytes, position + 4)
            position += 8
            let end = Array.IndexOf[byte](bytes, 0, position)
            Require(end >= 0, "portable PDB has an unterminated stream name")
            let name = UTF8Encoding(false, true).GetString(bytes, position, end - position)
            position = (end + 4) & ~3
            Require(uint64(offset) + uint64(size) <= uint64(bytes.Length), "portable PDB stream exceeds the file")
            if name == "#Pdb" {
                pdbOffset = int32(offset)
            }
            index += 1
        }
        Require(pdbOffset >= 0 && pdbOffset <= bytes.Length - 20, "portable PDB has no valid #Pdb stream")
        Array.Clear(bytes, pdbOffset, 20)
        return bytes
    }
}
