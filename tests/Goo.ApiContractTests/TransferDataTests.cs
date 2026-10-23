using System;
using Goo;
using Xunit;

public sealed class TransferDataTests
{
    [Fact]
    public void CapturesCallerBytesAndSelectionLists()
    {
        byte[] bytes = [1, 2, 3];
        var representation = new TransferRepresentation("application/x-goo-test", bytes);
        TransferRepresentation[] alternatives = [representation];
        Uri[] references = [new("file:///tmp/goo-transfer")];
        var data = new TransferData(alternatives, references);
        bytes[0] = 9;
        alternatives[0] = new TransferRepresentation("application/x-other", ReadOnlyMemory<byte>.Empty);
        references[0] = new Uri("content://other/document");
        Assert.Same(representation, data.Representations[0]);
        Assert.Equal(new byte[] { 1, 2, 3 }, data.Representations[0].Bytes.ToArray());
        Assert.Equal("file:///tmp/goo-transfer", data.Uris[0].AbsoluteUri);
    }

    [Fact]
    public void RejectsConflictingRepresentationsAndInvalidUris()
    {
        var text = new TransferRepresentation("text/plain", ReadOnlyMemory<byte>.Empty);
        Assert.Throws<ArgumentException>(() => new TransferData([text, text], []));
        var uriList = new TransferRepresentation("text/uri-list", ReadOnlyMemory<byte>.Empty);
        Assert.Throws<ArgumentException>(() => new TransferData([uriList], [new Uri("file:///tmp/goo-transfer")]));
        Assert.Throws<ArgumentException>(() => new TransferData([], [new Uri("relative", UriKind.Relative)]));
        Assert.Throws<ArgumentException>(() => new TransferRepresentation("text/plain\nother", ReadOnlyMemory<byte>.Empty));
    }
}
