import Goo
import Xunit

class TextEditorGutterEndToEndTests {
    @Fact
    func LineNumbersRemainOutsideInputAcrossRebuilds() -> Assert.True(
        TextEditorInputFixtures().LineNumbersRemainOutsideInputAcrossRebuilds()
    )

    @Fact
    func WrappedPreviewResizeAtEndDoesNotInventHorizontalScrollbar() -> Assert.True(
        TextEditorInputFixtures().WrappedPreviewResizeAtEndDoesNotInventHorizontalScrollbar()
    )

    @Fact
    func LineNumberWidthUpdatesForOffscreenDigitBoundary() -> Assert.True(
        TextEditorInputFixtures().LineNumberWidthUpdatesForOffscreenDigitBoundary()
    )
}
