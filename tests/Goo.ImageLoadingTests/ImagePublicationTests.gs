import Goo
import System
import System.Threading
import System.IO
import System.Threading.Tasks
import Xunit

class ImagePublicationTests {
    @Theory
    @InlineData(false)
    @InlineData(true)
    func AsyncCompletionUpdatesContentWithoutCellRebuild(failed bool) {
        let completion = TaskCompletionSource[ImageSource](TaskCreationOptions.RunContinuationsAsynchronously)
        using let source = AsyncImageSource(token -> completion.Task)
        let root = DeferredImageRoot(source)
        let window = Window{Root: root, Size: LayoutSize(100, 100)}
        try {
            window.UpdateTree()
            using let probe = source.Acquire()
            using let ready = ManualResetEventSlim()
            using let registration = probe.OnCompleted(() -> ready.Set())
            Assert.Equal(Color.Rgb(255, 0, 0), window.Tree!!.Children[0].Children[0].BackgroundColor)
            if failed { completion.SetException(InvalidOperationException("load failed")) }
            else { completion.SetResult(ImageSource(1, 1, []uint8{0, 0, 255, 255})) }
            Assert.True(ready.Wait(5000))
            window.markFrameRendered()
            window.drainPostedActions()
            window.UpdateTree()
            Assert.True(window.RenderPending())
            Assert.Equal(1, root.Builds)
            if failed {
                Assert.True(window.Tree!!.ImageLease!!.IsFailed)
                Assert.Equal(Color.Rgb(0, 0, 255), window.Tree!!.Children[0].Children[0].BackgroundColor)
            } else {
                Assert.Empty(window.Tree!!.Children)
                Assert.Equal([]uint8{0, 0, 255, 255}, window.Tree!!.DecodedImage!!.Pixels())
            }
        } finally { window.Close() }
    }

    @Theory
    @InlineData(false)
    @InlineData(true)
    func PendingLoadCancelsWhenUnmountedOrReplaced(replace bool) {
        let completion = TaskCompletionSource[ImageSource](TaskCreationOptions.RunContinuationsAsynchronously)
        using let started = ManualResetEventSlim()
        using let cancelled = ManualResetEventSlim()
        using let source = AsyncImageSource(token -> {
            token.Register(() -> cancelled.Set())
            started.Set()
            return completion.Task
        })
        using let replacement = ImageSource(1, 1, []uint8{0, 255, 0, 255})
        let root = DeferredImageRoot(source)
        let window = Window{Root: root, Size: LayoutSize(100, 100)}
        try {
            window.UpdateTree()
            Assert.True(started.Wait(5000))
            if replace {
                root.Source = replacement
                root.Rebuild()
                window.UpdateTree()
            } else { window.Close() }
            Assert.True(cancelled.Wait(5000))
            using let released = ManualResetEventSlim()
            let late = ImageSource.Transfer(1, 1, []uint8{255, 0, 0, 255}, () -> released.Set())
            completion.SetResult(late)
            Assert.True(released.Wait(5000))
            if replace {
                window.UpdateTree()
                Assert.Equal([]uint8{0, 255, 0, 255}, window.Tree!!.DecodedImage!!.Pixels())
            }
        } finally { window.Close() }
    }

    @Fact
    func AsyncSourceSharesSuccessAndRetriesFailure() {
        var calls int32 = 0
        using let source = AsyncImageSource(token -> {
            if Interlocked.Increment(ref calls) == 1 {
                return Task.FromException[ImageSource](InvalidOperationException("first load"))
            }
            return Task.FromResult(ImageSource(1, 1, [4]uint8))
        })
        using let failed = source.Acquire()
        using let ready = ManualResetEventSlim()
        using let registration = failed.OnCompleted(() -> ready.Set())
        Assert.True(ready.Wait(5000))
        Assert.True(failed.IsFailed)
        using let success = source.Acquire()
        using let loaded = ManualResetEventSlim()
        using let successRegistration = success.OnCompleted(() -> loaded.Set())
        Assert.True(loaded.Wait(5000))
        using let shared = source.Acquire()
        Assert.True(shared.IsComplete)
        Assert.False(shared.IsFailed)
        Assert.Equal(2, calls)
        source.Dispose()
        Assert.True(shared.Result()!!.IsValid)
    }

    @Fact
    func AssetsResolveExactResourcesBeforeFiles() {
        let assembly = typeof(ImagePublicationTests).Assembly
        let name = "Assets/local-rgb.jpg"
        let expected = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, name))
        Assert.Equal(expected, Assets.ReadAllBytes(assembly, name))
        using let resource = assembly.GetManifestResourceStream("embedded-image")
        Assert.NotNull(resource)
        using let resolved = Assets.Open(assembly, "embedded-image")
        Assert.Equal(resource!!.Length, resolved.Length)
        let error = Assert.Throws[FileNotFoundException](() -> Assets.Open(assembly, "missing-image"))
        Assert.Contains(assembly.FullName!!, error.Message)
        Assert.Contains(Path.Combine(AppContext.BaseDirectory, "missing-image"), error.Message)
    }

    private class DeferredImageRoot(source ImageSourceProvider) : Cell {
        var Source ImageSourceProvider = source
        var Builds int32
        override func Build() Blob {
            Builds++
            return Image{Source: Source, Width: 80, Height: 40,
                Placeholder: Container{BackgroundColor: Color.Rgb(255, 0, 0)},
                Fallback: Container{BackgroundColor: Color.Rgb(0, 0, 255)}}
        }
    }

    @Fact
    func PlaceholderDoesNotChangeExplicitImageSize() {
        let completion = TaskCompletionSource[ImageSource](TaskCreationOptions.RunContinuationsAsynchronously)
        using let source = AsyncImageSource(token -> completion.Task)
        let window = Window{Root: ExplicitImageRoot(source), Size: LayoutSize(300, 200)}
        try {
            window.UpdateTree()
            Assert.Equal(80.0F, window.Tree!!.Children[0].Rect.W)
            Assert.Equal(40.0F, window.Tree!!.Children[0].Rect.H)
            Assert.Equal(80.0F, window.Tree!!.Children[0].Children[0].Rect.W)
            Assert.Equal(40.0F, window.Tree!!.Children[0].Children[0].Rect.H)
        } finally {
            window.Close()
            completion.TrySetCanceled()
        }
    }

    private class ExplicitImageRoot(source ImageSourceProvider) : Cell {
        override func Build() Blob -> Container{AlignItems: AlignItems.FlexStart,
            Image{Source: source, Width: 80, Height: 40, Placeholder: Container{Width: 500, Height: 500}}
        }
    }

    @Fact
    func ImageIdentityRegistryGrowsAndPreservesLiveIdentities() {
        using let registry = VulkanImageIdentityRegistry(2)
        using let first = ImageSource(1, 1, [4]uint8)
        using let second = ImageSource(1, 1, [4]uint8)
        using let third = ImageSource(1, 1, [4]uint8)
        using let fourth = ImageSource(1, 1, [4]uint8)
        using let fifth = ImageSource(1, 1, [4]uint8)
        let providers = []ImageSource{first, second, third, fourth, fifth}
        let identities = [providers.Length]VulkanImageResourceIdentity
        let format = VkConstants.VK_FORMAT_R8G8B8A8_UNORM

        for index in 0 ... providers.Length {
            let identity = registry.ResolveImage(providers[index], 1uL, 1uL, format)
            Assert.True(identity.IsValid)
            for previous in 0 ... index {
                Assert.NotEqual(identities[previous].ImageId.LogicalId, identity.ImageId.LogicalId)
            }
            identities[index] = identity
        }

        Assert.Equal(providers.Length, registry.Stats.LiveCount)
        Assert.Equal(providers.Length, registry.Stats.ProviderRecordCount)
        for index in 0 ... providers.Length {
            Assert.Equal(identities[index], registry.ResolveImage(providers[index], 1uL, 1uL, format))
        }
        Assert.Equal(providers.Length, registry.Stats.LiveCount)
    }

    @Fact
    func CompletedReplacementRequestsPaintWithoutCellRebuild() {
        using let first = ImageSource(1, 1, []uint8{255, 0, 0, 255})
        using let replacement = ImageSource(1, 1, []uint8{0, 0, 255, 255})
        let provider = ReplaceableProvider(first)
        let root = ImageRoot(provider, false)
        let window = Window{Root: root, Size: LayoutSize(100, 100), }
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
        let window = Window{Root: ImageRoot(provider, background), Size: LayoutSize(100, 100), }
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
        let window = Window{Root: root, Size: LayoutSize(300, 200), }
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
    @InlineData(0.0)
    @InlineData(-1.0)
    @InlineData(System.Double.NaN)
    @InlineData(System.Double.PositiveInfinity)
    func ImageRejectsInvalidDensity(density float64) -> Assert.Throws[ArgumentOutOfRangeException](
        () -> Image{PixelsPerUnit: density}
    )

    private class DensityRoot(source ImageSource) : Cell {
        var Density float64 = 2.0
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
        protected event handlers Action?

        prop ContentVersion uint64 {
            get {
                return _contentVersion
            }
            private set {
                _contentVersion = value
            }
        }

        open event ContentChanged Action? {
            add { handlers += value }
            remove { handlers -= value }
        }
        var Acquisitions int32
        var Releases int32

        open func Acquire() ImageSourceLease {
            Acquisitions++
            let lease = current.Acquire()
            lease.Released += () -> Releases++
            return lease
        }

        func Replace(next ImageSource) {
            current = next
            ContentVersion++
            handlers?()
        }
    }

    private class AdvancingProvider(
        first ImageSource,
        replacement ImageSource,
        duringAcquire bool
    ) : ReplaceableProvider(first) {
        private var advance bool = true

        override event ContentChanged Action? {
            add {
                if advance && !duringAcquire {
                    advance = false
                    let worker = Thread(() -> Replace(replacement))
                    worker.Start()
                    worker.Join()
                }
                handlers += value
            }
            remove {
                handlers -= value
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
