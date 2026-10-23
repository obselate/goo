using System;
using System.Threading;
using Goo;
using Xunit;

public sealed class ImagePublicationTests
{
    [Fact]
    public void CompletedReplacementRequestsPaintWithoutCellRebuild()
    {
        using var first = new ImageSource(1, 1, new byte[] { 255, 0, 0, 255 });
        using var replacement = new ImageSource(1, 1, new byte[] { 0, 0, 255, 255 });
        var provider = new ReplaceableProvider(first);
        var root = new ImageRoot(provider, false);
        var window = new Window { Root = root, Width = 100, Height = 100 };
        try
        {
            window.UpdateTree();
            window.markFrameRendered();
            provider.Replace(replacement);

            Assert.True(window.UpdateTree(0.0));
            Assert.True(window.RenderPending());
            Assert.Equal(new byte[] { 0, 0, 255, 255 }, window.Tree!.DecodedImage!.Pixels());
            Assert.Equal(1, root.Builds);
        }
        finally { window.Close(); }
    }

    [Theory]
    [InlineData(false, false)]
    [InlineData(true, false)]
    [InlineData(false, true)]
    [InlineData(true, true)]
    public void ProviderAdvanceWhileBindingPublishesLatestVersion(bool background, bool duringAcquire)
    {
        using var first = new ImageSource(1, 1, new byte[] { 255, 0, 0, 255 });
        using var replacement = new ImageSource(1, 1, new byte[] { 0, 0, 255, 255 });
        var provider = new AdvancingProvider(first, replacement, duringAcquire);
        var window = new Window { Root = new ImageRoot(provider, background), Width = 100, Height = 100 };
        try
        {
            window.UpdateTree();
            var node = window.Tree!;
            var image = background ? BackgroundImageLayouts.Image(node) : node.DecodedImage;
            Assert.Equal(new byte[] { 0, 0, 255, 255 }, image!.Pixels());
            Assert.InRange(provider.Acquisitions, 1, 2);
        }
        finally { window.Close(); }
        Assert.Equal(provider.Acquisitions, provider.Releases);
    }

    [Fact]
    public void DensityKeepsNaturalSizeAndUpdatesWithTheSameSource()
    {
        using var source = new ImageSource(128, 64, new byte[128 * 64 * 4]);
        var root = new DensityRoot(source);
        var window = new Window { Root = root, Width = 300, Height = 200 };
        try
        {
            window.UpdateTree();
            Assert.Equal(64, window.Tree!.ImageIntrinsicWidth);
            Assert.Equal(32, window.Tree!.ImageIntrinsicHeight);
            root.Density = 1;
            root.Rebuild();
            window.UpdateTree();
            Assert.Equal(128, window.Tree!.ImageIntrinsicWidth);
            Assert.Equal(64, window.Tree!.ImageIntrinsicHeight);
            Assert.True(window.RenderPending());
        }
        finally { window.Close(); }
    }

    [Fact]
    public void UiScaleAlonePublishesUpdatedWindowMetrics()
    {
        using var source = new ImageSource(1, 1, new byte[4]);
        var window = new Window { Root = new DensityRoot(source) };
        WindowMetrics latest = default;
        var count = 0;
        window.MetricsChanged += metrics => { latest = metrics; count++; };
        try
        {
            window.UpdateTree();
            var first = count;
            Assert.Equal(1, latest.UiScale);
            window.UiScale = 1.5f;
            window.UpdateTree();
            Assert.Equal(first + 1, count);
            Assert.Equal(1.5f, latest.UiScale);
        }
        finally { window.Close(); }
    }

    [Theory]
    [InlineData(0f)]
    [InlineData(-1f)]
    [InlineData(float.NaN)]
    [InlineData(float.PositiveInfinity)]
    public void ImageRejectsInvalidDensity(float density) =>
        Assert.Throws<ArgumentOutOfRangeException>(() => new Image { PixelsPerUnit = density });

    private sealed class DensityRoot(ImageSource source) : Cell
    {
        public float Density = 2;
        public override Blob Build() => new Image { Source = source, PixelsPerUnit = Density };
    }

    private sealed class ImageRoot(ImageSourceProvider source, bool background) : Cell
    {
        public int Builds;

        public override Blob Build()
        {
            Builds++;
            return background
                ? new Container { BackgroundImageSource = source, Width = 100, Height = 100 }
                : new Image { Source = source, Width = 100, Height = 100 };
        }
    }

    private class ReplaceableProvider(ImageSource source) : ImageSourceProvider
    {
        private ImageSource current = source;
        public ulong ContentVersion { get; private set; } = 1;
        public virtual event Action? ContentChanged;
        public int Acquisitions;
        public int Releases;

        public virtual ImageSourceLease Acquire()
        {
            Acquisitions++;
            var lease = current.Acquire();
            lease.Released += () => Releases++;
            return lease;
        }

        public void Replace(ImageSource next)
        {
            current = next;
            ContentVersion++;
            ContentChanged?.Invoke();
        }
    }

    private sealed class AdvancingProvider(ImageSource first, ImageSource replacement, bool duringAcquire)
        : ReplaceableProvider(first)
    {
        private bool advance = true;

        public override event Action? ContentChanged
        {
            add
            {
                if (advance && !duringAcquire)
                {
                    advance = false;
                    var worker = new Thread(() => Replace(replacement));
                    worker.Start();
                    worker.Join();
                }
                base.ContentChanged += value;
            }
            remove => base.ContentChanged -= value;
        }

        public override ImageSourceLease Acquire()
        {
            var lease = base.Acquire();
            if (advance && duringAcquire)
            {
                advance = false;
                Replace(replacement);
            }
            return lease;
        }
    }
}
