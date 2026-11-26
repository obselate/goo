import System.Collections.Immutable
import System.Reflection.PortableExecutable

internal shared partial class ReleaseCheck {
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
}
