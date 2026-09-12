using System;
using System.Threading;
using Goo;
using Xunit;

public sealed class EmbeddedWindowLifecycleTests
{
    private sealed class Host : EmbeddedWindowHost
    {
        public int Wakes;
        protected override void RequestFrame() => Interlocked.Increment(ref Wakes);
        protected override bool LoadVulkanLibrary() => false;
        protected override nint GetVulkanGetInstanceProcAddr() => 0;
        protected override void UnloadVulkanLibrary() { }
        protected override string[] GetVulkanInstanceExtensions() => [];
        protected override bool CreateVulkanSurface(nint instance, out ulong surface)
        {
            surface = 0;
            return false;
        }
        protected override void DestroyVulkanSurface(nint instance, ulong surface) { }
    }

    private sealed class Root : Cell, IDisposable
    {
        public int Builds;
        public int Disposals;
        public int Value;
        public ShaderEffect? Effect;
        public override Blob Build()
        {
            Builds++;
            return new Container { ShaderEffect = Effect };
        }
        public void Dispose() => Disposals++;
    }

    [Fact]
    public void ActivationRequiresOwnerThreadAndDoesNotInventEmbeddedFocus()
    {
        var window = new Window { Root = new Root() };
        Assert.Equal(WindowActivationResult.Closed, window.RequestActivation());
        using var host = new Host();
        window.Attach(host);
        host.RenderFrame(0);
        var notifications = 0;
        window.FocusChanged += _ => notifications++;
        Assert.Equal(WindowActivationResult.Unsupported, window.RequestActivation());
        Assert.False(window.IsFocused);
        Assert.Equal(0, notifications);
        host.SetFocused(true);
        Assert.Equal(WindowActivationResult.Unsupported, window.RequestActivation());
        Assert.True(window.IsFocused);
        Assert.Equal(1, notifications);

        Exception? failure = null;
        var worker = new Thread(() =>
        {
            try { window.RequestActivation(); }
            catch (Exception error) { failure = error; }
        });
        worker.Start();
        worker.Join();
        Assert.IsType<InvalidOperationException>(failure);
        host.Dispose();
        Assert.Equal(WindowActivationResult.Closed, window.RequestActivation());
    }

    [Fact]
    public void HostLifecyclePreservesMountedStateAndDispatchUntilFinalClose()
    {
        using var host = new Host();
        host.Resize(80, 60, 160, 120);
        var effect = new ShaderEffect(new ShaderEffectProgram(new byte[]
        {
            71, 69, 70, 70, 1, 0, 0, 0, 1, 0, 0, 0, 86, 83, 80, 86, 20, 0, 0, 0,
            3, 2, 35, 7, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0
        }));
        using var data = new ShaderEffectData(new byte[] { 1, 2, 3, 4 });
        effect.SetData(0, data);
        var root = new Root { Effect = effect };
        var window = new Window { Root = root };
        window.Attach(host);
        host.RenderFrame(0);
        Assert.Equal(1, root.Builds);
        Assert.Equal(80, window.Width);
        Assert.Equal(60, window.Height);
        Assert.True(double.IsPositiveInfinity(host.NextFrameDelaySeconds));
        var wakesBeforePublication = host.Wakes;
        data.Publish(new byte[] { 5, 6, 7, 8 });
        Assert.True(host.Wakes > wakesBeforePublication);
        Assert.Equal(0, host.NextFrameDelaySeconds);
        host.RenderFrame(0);
        Assert.Equal(1, root.Builds);
        Assert.Throws<InvalidOperationException>(() => host.AttachPresentation());
        Assert.True(window.IsOpen);
        Assert.False(host.IsPresentationAttached);
        Assert.Equal(1, root.Builds);

        Assert.Throws<InvalidOperationException>(() => new Window().Attach(host));
        Exception? workerFailure = null;
        var worker = new Thread(() =>
        {
            try
            {
                Assert.Throws<InvalidOperationException>(() => host.Resize(1, 1, 1, 1));
                Assert.Throws<InvalidOperationException>(() => new Window().Attach(new Host()));
                window.Post(() => { root.Value = 7; root.Rebuild(); });
            }
            catch (Exception error) { workerFailure = error; }
        });
        worker.Start();
        worker.Join();
        Assert.Null(workerFailure);
        Assert.Equal(0, host.NextFrameDelaySeconds);
        host.Suspend();
        host.RenderFrame(10);
        Assert.Equal(7, root.Value);
        Assert.Equal(2, root.Builds);
        Assert.Equal(0, root.Disposals);
        Assert.True(double.IsPositiveInfinity(host.NextFrameDelaySeconds));
        host.DetachPresentation();
        host.Resume();
        host.Resize(60, 40, 180, 120);
        host.RenderFrame(10);
        Assert.Equal(60, window.Width);
        Assert.Equal(40, window.Height);
        Assert.Equal(2, root.Builds);
        Assert.True(double.IsPositiveInfinity(host.NextFrameDelaySeconds));

        window.OnClosing = () => false;
        window.RequestClose();
        host.RenderFrame(0);
        Assert.True(window.IsOpen);
        window.OnClosing = () => true;
        window.RequestClose();
        host.RenderFrame(0);
        Assert.False(window.IsOpen);
        Assert.Null(host.Window);
        Assert.Equal(1, root.Disposals);
        Assert.False(window.TryPost(() => { }));
        host.Dispose();
        Assert.Equal(1, root.Disposals);

        using var emptyHost = new Host();
        new Window().Attach(emptyHost);
        emptyHost.RenderFrame(0);
        Assert.True(double.IsPositiveInfinity(emptyHost.NextFrameDelaySeconds));
    }
}
