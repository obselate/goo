using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using Goo;
using Hexa.NET.SDL3;
using Xunit;

public sealed class NativeFileDropTests
{
    [Fact]
    public void PreviewMoveAndCompleteDeliverOneOwnedFileListWithCopyOnly()
    {
        using var scene = new Scene();
        scene.Start();
        scene.Send(SDLEventType.DropPosition, x: 60, y: 45);
        scene.File("/tmp/first file.txt");
        scene.File("/tmp/日本語.png");
        scene.Send(SDLEventType.DropComplete);
        Assert.Equal(new[] { DragEventKind.Enter, DragEventKind.Move, DragEventKind.Drop }, scene.Events.Select(e => e.Kind));
        Assert.True(((NativeFileDrop)scene.Events[0].Data.Value).IsPreview);
        var drop = scene.Events[^1];
        var files = Assert.IsType<NativeFileDrop>(drop.Data.Value);
        Assert.False(files.IsPreview);
        Assert.Equal(new[] { "/tmp/first file.txt", "/tmp/日本語.png" }, files.Paths);
        Assert.Equal(DragEffect.Copy, drop.Effect);
        Assert.Equal(DragEffect.Copy, drop.AllowedEffects);
        Assert.Equal(-1, drop.PointerId);
        Assert.Equal(60, drop.WindowPosition.X);
        Assert.Equal(45, drop.WindowPosition.Y);
        Assert.Throws<NotSupportedException>(() => ((IList<string>)files.Paths)[0] = "changed");
        scene.State.Unbind();
        Assert.Equal("/tmp/first file.txt", files.Paths[0]);
    }

    [Fact]
    public void EmptyCompletionAndDisablingCancelThePreviewExactlyOnce()
    {
        using var scene = new Scene();
        scene.Start();
        scene.Send(SDLEventType.DropComplete);
        scene.Send(SDLEventType.DropComplete);
        Assert.Equal(new[] { DragEventKind.Enter, DragEventKind.Leave }, scene.Events.Select(e => e.Kind));
        scene.Events.Clear();
        scene.Start();
        scene.State.Unbind();
        scene.File("/tmp/stale.txt");
        scene.Send(SDLEventType.DropComplete);
        Assert.Equal(new[] { DragEventKind.Enter, DragEventKind.Leave }, scene.Events.Select(e => e.Kind));
    }

    [Fact]
    public void ARejectedPathRejectsTheWholeOfferAndDoesNotDeliverAPartialList()
    {
        using var scene = new Scene();
        scene.Start();
        scene.File("/tmp/valid.txt");
        scene.File("relative.txt");
        scene.Send(SDLEventType.DropComplete);
        Assert.DoesNotContain(scene.Events, e => e.Kind == DragEventKind.Drop);
        Assert.Single(scene.Events, e => e.Kind == DragEventKind.Leave);
        Assert.Contains("absolute", scene.State.LastError);
        scene.Start();
        Assert.Null(scene.State.LastError);
        scene.File("/tmp/new.txt");
        scene.Send(SDLEventType.DropComplete);
        Assert.Single(scene.Events, e => e.Kind == DragEventKind.Drop);
    }

    [Fact]
    public void PathCountAndTextOffersAreRejectedBeforeDelivery()
    {
        using var scene = new Scene();
        scene.Start();
        var path = Marshal.StringToCoTaskMemUTF8("/tmp/a");
        try { for (var i = 0; i <= 4096; i++) scene.Send(SDLEventType.DropFile, path); }
        finally { Marshal.FreeCoTaskMem(path); }
        scene.Send(SDLEventType.DropComplete);
        Assert.Contains("budget", scene.State.LastError);
        Assert.DoesNotContain(scene.Events, e => e.Kind == DragEventKind.Drop);
        scene.Events.Clear();
        scene.Start();
        scene.Send(SDLEventType.DropText);
        scene.Send(SDLEventType.DropComplete);
        Assert.Contains("Text offers", scene.State.LastError);
        Assert.Equal(new[] { DragEventKind.Enter, DragEventKind.Leave }, scene.Events.Select(e => e.Kind));
    }

    [Fact]
    public void MissingPositionAndMalformedUtf8CannotTargetAControl()
    {
        using var scene = new Scene();
        scene.Send(SDLEventType.DropBegin);
        scene.File("/tmp/no-position");
        scene.Send(SDLEventType.DropComplete);
        Assert.Empty(scene.Events);
        scene.Start();
        var data = Marshal.AllocCoTaskMem(4);
        try
        {
            Marshal.Copy(new byte[] { 47, 255, 1, 0 }, 0, data, 4);
            scene.Send(SDLEventType.DropFile, data);
        }
        finally { Marshal.FreeCoTaskMem(data); }
        scene.Send(SDLEventType.DropComplete);
        Assert.Contains("UTF-8", scene.State.LastError);
        Assert.DoesNotContain(scene.Events, e => e.Kind == DragEventKind.Drop);
    }

    [Fact]
    public void DisabledTargetsRejectAndCopyNegotiationFallsBackToTheParent()
    {
        var outer = new List<DragEventKind>();
        var inner = new List<DragEventKind>();
        var root = new Reconciler { Res = new Resolver() }.Mount(new Container
        {
            Width = 200, Height = 160,
            DropTarget = new DropTarget(e => DragEffect.Copy, e => outer.Add(e.Kind)),
            Children = { new Container { Width = 100, Height = 100, DropTarget = new DropTarget(e => DragEffect.Move, e => inner.Add(e.Kind)) } }
        });
        new Layout().Calculate(root, 200, 160);
        var router = new NativeDropRouter(() => root, () => true, () => { });
        var data = new DragData(new NativeFileDrop(Array.Empty<string>(), true), DragEffect.Copy);
        try
        {
            router.Begin(data, 10, 10, default);
            Assert.Equal(new[] { DragEventKind.Enter }, outer);
            Assert.Empty(inner);
            router.Move(300, 300, default);
            Assert.Equal(new[] { DragEventKind.Enter, DragEventKind.Leave }, outer);
            root.Disabled = true;
            router.Move(10, 10, default);
            Assert.Equal(2, outer.Count);
        }
        finally { router.Cancel(); TextLayouts.DisposeTree(root); }
    }

    [Fact]
    public void ClosingAndRemovedTargetsCannotReceiveLateDropCallbacks()
    {
        using var scene = new Scene();
        scene.Start();
        scene.Available = false;
        scene.State.Validate();
        scene.File("/tmp/late.txt");
        scene.Send(SDLEventType.DropComplete);
        Assert.Equal(new[] { DragEventKind.Enter, DragEventKind.Leave }, scene.Events.Select(e => e.Kind));
        scene.Available = true;
        scene.Events.Clear();
        scene.Start();
        TextLayouts.DisposeTree(scene.Root);
        scene.State.Validate();
        scene.File("/tmp/removed.txt");
        scene.Send(SDLEventType.DropComplete);
        Assert.Equal(new[] { DragEventKind.Enter }, scene.Events.Select(e => e.Kind));
    }

    [Fact]
    public void ConsumerExceptionsCancelStateAndPreserveTheOriginalFailure()
    {
        var fail = true;
        using var scene = new Scene(e =>
        {
            if (fail && e.Kind == DragEventKind.Enter) throw new ArgumentException("application failure");
        });
        var error = Assert.Throws<ArgumentException>(() => scene.Start());
        Assert.Equal("application failure", error.Message);
        Assert.Null(scene.State.LastError);
        fail = false;
        scene.Start();
        scene.File("/tmp/after-failure.txt");
        scene.Send(SDLEventType.DropComplete);
        Assert.Single(scene.Events, e => e.Kind == DragEventKind.Drop);
    }

    [Fact]
    public void ReentrantCancellationDuringQueryCannotDeliverAnEnterOrDrop()
    {
        NativeDropRouter? router = null;
        var events = new List<DragEventKind>();
        var root = new Reconciler { Res = new Resolver() }.Mount(new Container
        {
            Width = 100, Height = 100,
            DropTarget = new DropTarget(e => { router!.Cancel(); return DragEffect.Copy; }, e => events.Add(e.Kind))
        });
        new Layout().Calculate(root, 100, 100);
        router = new NativeDropRouter(() => root, () => true, () => { });
        var data = new DragData(new NativeFileDrop(Array.Empty<string>(), true), DragEffect.Copy);
        try { router.Begin(data, 20, 20, default); router.Complete(data, 20, 20, default); Assert.Empty(events); }
        finally { TextLayouts.DisposeTree(root); }
    }

    [Fact]
    public void NativeDropConfigurationIsOptInAndRejectsEmbeddedHosts()
    {
        var window = new Window();
        Assert.False(window.NativeFileDropEnabled);
        Assert.Equal(NativeTransferCapabilities.None, window.NativeTransferCapabilities);
        window.NativeFileDropEnabled = true;
        Assert.True(window.NativeFileDropEnabled);
        Assert.Throws<NotSupportedException>(() => window.Attach(new Embedded()));
        window.NativeFileDropEnabled = false;
        Assert.False(window.NativeFileDropEnabled);
    }

    private sealed class Embedded : EmbeddedWindowHost
    {
        protected override void RequestFrame() { }
        protected override bool LoadVulkanLibrary() => false;
        protected override void UnloadVulkanLibrary() { }
        protected override nint GetVulkanGetInstanceProcAddr() => 0;
        protected override string[] GetVulkanInstanceExtensions() => Array.Empty<string>();
        protected override bool CreateVulkanSurface(nint instance, out ulong surface) { surface = 0; return false; }
        protected override void DestroyVulkanSurface(nint instance, ulong surface) { }
    }
    private sealed class Scene : IDisposable
    {
        public readonly Node Root;
        public readonly NativeDropState State;
        public readonly List<DragEvent> Events = new();
        public bool Available = true;
        public Scene(Action<DragEvent>? callback = null)
        {
            Root = new Reconciler { Res = new Resolver() }.Mount(new Container
            {
                Width = 200, Height = 100,
                DropTarget = new DropTarget(e => DragEffect.Copy, e => { Events.Add(e); callback?.Invoke(e); })
            });
            new Layout().Calculate(Root, 200, 100);
            State = new NativeDropState(() => Root, () => Available, () => { });
        }
        public void Start() { Send(SDLEventType.DropBegin); Send(SDLEventType.DropPosition, x: 30, y: 25); }
        public void Send(SDLEventType kind, nint data = 0, float x = 0, float y = 0) => State.Receive(kind, data, x, y, default);
        public void File(string value)
        {
            var path = Marshal.StringToCoTaskMemUTF8(value);
            try { Send(SDLEventType.DropFile, path); }
            finally { Marshal.FreeCoTaskMem(path); }
        }
        public void Dispose() { State.Unbind(); if (!Root.Retired) TextLayouts.DisposeTree(Root); }
    }
}
