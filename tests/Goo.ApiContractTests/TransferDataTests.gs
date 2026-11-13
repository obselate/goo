import System
import System.Threading
import System.Threading.Tasks
import Goo
import Xunit

public sealed class TransferDataTests {
    @Fact
    public async func PlatformOpenRejectsRelativePathsAndHonorsCancellation() Task {
        Assert.Throws[ArgumentNullException](() -> Platform.OpenAsync(nil))
        Assert.Throws[ArgumentException](() -> Platform.OpenAsync("relative/file.txt"))
        Assert.Throws[ArgumentException](() -> Platform.OpenAsync(""))
        using let cancellation = CancellationTokenSource()
        cancellation.Cancel()
        await Assert.ThrowsAnyAsync[OperationCanceledException](() -> Platform.OpenAsync("https://example.invalid/", cancellation.Token))
    }

    @Fact
    public func ErrorBoxRejectsInvalidNativeTextBeforeLaunch() {
        Assert.Throws[ArgumentException](() -> NativeDialogs.ShowError(nil, "message"))
        if OperatingSystem.IsLinux() {
            Assert.Equal(MessageBoxStatus.Unsupported, NativeDialogs.ShowError("title", "message"))
        }
        Assert.Throws[ArgumentException](() -> NativeDialogs.ShowError("title", "bad" + char(0)))
    }

    @Fact
    public func CapturesCallerBytesAndSelectionLists() {
        let bytes = []uint8{1, 2, 3}
        let representation = TransferRepresentation("application/x-goo-test", bytes)
        let alternatives = []TransferRepresentation{representation}
        let references = []Uri{Uri("file:///tmp/goo-transfer")}
        let data = TransferData(alternatives, references)
        bytes[0] = 9
        alternatives[0] = TransferRepresentation("application/x-other", ReadOnlyMemory[uint8].Empty)
        references[0] = Uri("content://other/document")
        Assert.Same(representation, data.Representations[0])
        Assert.Equal[uint8]([]uint8{1, 2, 3}, data.Representations[0].Bytes.ToArray())
        Assert.Equal("file:///tmp/goo-transfer", data.Uris[0].AbsoluteUri)
    }

    @Fact
    public func RejectsConflictingRepresentationsAndInvalidUris() {
        let text = TransferRepresentation("text/plain", ReadOnlyMemory[uint8].Empty)
        Assert.Throws[ArgumentException](() -> TransferData([]TransferRepresentation{text, text}, Array.Empty[Uri]()))
        let uriList = TransferRepresentation("text/uri-list", ReadOnlyMemory[uint8].Empty)
        Assert.Throws[ArgumentException](() -> TransferData([]TransferRepresentation{uriList},
            []Uri{Uri("file:///tmp/goo-transfer")}))
        Assert.Throws[ArgumentException](() -> TransferData(Array.Empty[TransferRepresentation](),
            []Uri{Uri("relative", UriKind.Relative)}))
        Assert.Throws[ArgumentException](() -> TransferRepresentation("text/plain" + char(10) + "other",
            ReadOnlyMemory[uint8].Empty))
    }
}
