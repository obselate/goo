using Goo;
using Xunit;

public sealed class TextEditorGutterEndToEndTests
{
    [Fact]
    public void LineNumbersRemainOutsideInputAcrossRebuilds() =>
        Assert.True(new TextEditorInputFixtures().LineNumbersRemainOutsideInputAcrossRebuilds());

    [Fact]
    public void WrappedPreviewResizeAtEndDoesNotInventHorizontalScrollbar() =>
        Assert.True(new TextEditorInputFixtures().WrappedPreviewResizeAtEndDoesNotInventHorizontalScrollbar());

    [Fact]
    public void LineNumberWidthUpdatesForOffscreenDigitBoundary() =>
        Assert.True(new TextEditorInputFixtures().LineNumberWidthUpdatesForOffscreenDigitBoundary());
}
