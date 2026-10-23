import Goo
import System
import System.Threading
import Xunit

class ImagePublicationTests {
    @Fact
    func CompletedReplacementRequestsPaintWithoutCellRebuild() {
        using let first = ImageSource(1, 1, []uint8{255, 0, 0, 255})
        using let replacement = ImageSource(1, 1, []uint8{0, 0, 255, 255})
        let provider = ReplaceableProvider(first)
        let root = ImageRoot(provider, false)
        let window = Window{Root: root, Width: 100, Height: 100}
        try {
            window.UpdateTree()
            window.markFrameRendered()
            provider.Replace(replacement)
            Assert.True(window.UpdateTree(0.0))
            Assert.True(window.RenderPending())
            Assert.Equal([]uint8{0, 0, 255, 255}, window.Tree!!.DecodedImage!!.Pixels())
            Assert.Equal(1, root.Builds)
        } finally {
            window.Close()
        }
    }

    @Theory
    @InlineData(false, false)
    @InlineData(true, false)
    @InlineData(false, true)
    @InlineData(true, true)
    func ProviderAdvanceWhileBindingPublishesLatestVersion(background bool, duringAcquire bool) {
        using let first = ImageSource(1, 1, []uint8{255, 0, 0, 255})
        using let replacement = ImageSource(1, 1, []uint8{0, 0, 255, 255})
        let provider = AdvancingProvider(first, replacement, duringAcquire)
        let window = Window{Root: ImageRoot(provider, background), Width: 100, Height: 100}
        try {
            window.UpdateTree()
            let node = window.Tree!!
            let image = if background {
                BackgroundImageLayouts.Image(node)
            } else {
                node.DecodedImage
            }
            Assert.Equal([]uint8{0, 0, 255, 255}, image!!.Pixels())
            Assert.InRange(provider.Acquisitions, 1, 2)
        } finally {
            window.Close()
        }
        Assert.Equal(provider.Acquisitions, provider.Releases)
    }

    @Fact
    func DensityKeepsNaturalSizeAndUpdatesWithTheSameSource() {
        using let source = ImageSource(128, 64, [128 * 64 * 4]uint8)
        let root = DensityRoot(source)
        let window = Window{Root: root, Width: 300, Height: 200}
        try {
            window.UpdateTree()
            Assert.Equal(float32(64.0), window.Tree!!.ImageIntrinsicWidth)
            Assert.Equal(float32(32.0), window.Tree!!.ImageIntrinsicHeight)
            root.Density = 1.0F
            root.Rebuild()
            window.UpdateTree()
            Assert.Equal(float32(128.0), window.Tree!!.ImageIntrinsicWidth)
            Assert.Equal(float32(64.0), window.Tree!!.ImageIntrinsicHeight)
            Assert.True(window.RenderPending())
        } finally {
            window.Close()
        }
    }

    @Fact
    func UiScaleAlonePublishesUpdatedWindowMetrics() {
        using let source = ImageSource(1, 1, [4]uint8)
        let window = Window{Root: DensityRoot(source)}
        var latest = default(WindowMetrics)
        var count = 0
        window.MetricsChanged += (metrics WindowMetrics) -> {
            latest = metrics
            count++
        }
        try {
            window.UpdateTree()
            let first = count
            Assert.Equal(float32(1.0), latest.UiScale)
            window.UiScale = 1.5f
            window.UpdateTree()
            Assert.Equal(first + 1, count)
            Assert.Equal(1.5f, latest.UiScale)
        } finally {
            window.Close()
        }
    }

    @Theory
    @InlineData(0f)
    @InlineData(-1f)
    @InlineData(System.Single.NaN)
    @InlineData(System.Single.PositiveInfinity)
    func ImageRejectsInvalidDensity(density float32) -> Assert.Throws[ArgumentOutOfRangeException](
        () -> Image{PixelsPerUnit: density}
    )

    private class DensityRoot(source ImageSource) : Cell {
        var Density float32 = 2.0F
        override func Build() Blob -> Image{Source: source, PixelsPerUnit: Density}
    }

    private class ImageRoot(source ImageSourceProvider, background bool) : Cell {
        var Builds int32

        override func Build() Blob {
            Builds++
            return if background {
                cast[Blob](Container{BackgroundImageSource: source, Width: 100, Height: 100})
            } else {
                cast[Blob](Image{Source: source, Width: 100, Height: 100})
            }
        }
    }

    private open class ReplaceableProvider(source ImageSource) : ImageSourceProvider {
        private var current ImageSource = source
        private var _contentVersion uint64 = uint64(1)

        prop ContentVersion uint64 {
            get {
                return _contentVersion
            }
            private set {
                _contentVersion = value
            }
        }

        open event ContentChanged Action
        var Acquisitions int32
        var Releases int32

        open func Acquire() ImageSourceLease {
            Acquisitions++
            let lease = current.Acquire()
            lease.Released += () -> Releases++
            return lease
        }

        protected func AddContentChanged(value Action?) -> ContentChanged += value

        protected func RemoveContentChanged(value Action?) -> ContentChanged -= value

        func Replace(next ImageSource) {
            current = next
            ContentVersion++
            ContentChanged?()
        }
    }

    private class AdvancingProvider(
        first ImageSource,
        replacement ImageSource,
        duringAcquire bool
    ) : ReplaceableProvider(first) {
        private var advance bool = true

        override event ContentChanged Action {
            add {
                if advance && !duringAcquire {
                    advance = false
                    let worker = Thread(() -> Replace(replacement))
                    worker.Start()
                    worker.Join()
                }
                AddContentChanged(value)
            }
            remove {
                RemoveContentChanged(value)
            }
        }

        override func Acquire() ImageSourceLease {
            let lease = base.Acquire()
            if advance && duringAcquire {
                advance = false
                Replace(replacement)
            }
            return lease
        }
    }
}
