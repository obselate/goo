using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Diagnostics;
using System.Text;
using Goo;
using Xunit;

namespace Goo.ApiContractTests;

public sealed class WaylandDataTransferTests
{
    private static readonly string[] Types = ["text/plain;charset=utf-8", "image/png", "application/x-goo-transfer-check", "application/x-goo-empty"];
    private static readonly byte[] Png = [137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0,31,21,196,137,0,0,0,11,73,68,65,84,120,156,99,96,0,2,0,0,5,0,1,165,246,69,64,0,0,0,0,73,69,78,68,174,66,96,130];
    private static readonly TransferData Expected = CreateData();

    [Fact]
    public void NativeMimeBytesAndNegotiatedEffectsSurviveCrossProcessHandoff()
    {
        var inputPath = Environment.GetEnvironmentVariable("GOO_NATIVE_TRANSFER_INPUT");
        var peerPath = Environment.GetEnvironmentVariable("GOO_NATIVE_TRANSFER_PEER");
        if (inputPath is null || peerPath is null) return;
        Assert.True(OperatingSystem.IsLinux());
        Assert.Equal("1", Environment.GetEnvironmentVariable("GOO_HEADLESS_WAYLAND"));
        Window.ConfigureApplication("Goo native transfer checks", "1.0", "io.github.obselate.goo.transfer-checks");
        foreach (var effect in new[] { DragEffect.Copy, DragEffect.Move })
        {
            Run(false, effect, inputPath, peerPath);
            Run(true, effect, inputPath, peerPath);
        }
        Run(false, DragEffect.Copy, inputPath, peerPath, rejectFinal: true);
    }

    private static void Run(bool outgoing, DragEffect effect, string inputPath, string peerPath, bool rejectFinal = false)
    {
        var scene = new TransferScene(outgoing, effect, rejectFinal);
        var window = new Window { Title = "Goo native transfer checks", Width = 480, Height = 160, Root = scene }.Open();
        try
        {
            PumpUntil(window, () => window.IsVisible);
            Assert.True((window.NativeTransferCapabilities & NativeTransferCapabilities.DataDrop) != 0);
            window.NativeFileDropEnabled = true;
            Assert.Equal(WindowOperationResult.Accepted, window.SetNativeDataDropFormats(Types));
            using var peer = new Peer(peerPath, outgoing ? "target" : "source", ((int)effect).ToString());
            using var input = new Peer(inputPath);
            PumpUntil(window, () => input.Has("ready") && peer.Has("ready"), peer, input);
            uint serial = 0;
            void Send(string command)
            {
                input.Send(command);
                input.Send($"sync {++serial}");
                PumpUntil(window, () => input.Has($"sync {serial}"), peer, input);
                Pump(window);
            }
            uint hoverSerial = 0;
            bool PeerHovered()
            {
                peer.Send($"hover {++hoverSerial}");
                PumpUntil(window, () => peer.Has($"hover {hoverSerial}"), peer, input);
                return peer.Has($"hover {hoverSerial} 1");
            }
            (int X, int Y) Find(Func<bool> hovered)
            {
                for (int y = 40; y < 900; y += 60)
                    for (int x = 40; x < 1400; x += 80)
                    {
                        Send($"point {x} {y}");
                        var end = Stopwatch.GetTimestamp() + Stopwatch.Frequency / 50;
                        while (Stopwatch.GetTimestamp() < end && !hovered()) { Pump(window); Thread.Sleep(1); }
                        if (hovered()) { SyncDisplay(); Pump(window); if (hovered()) return (x, y); }
                    }
                throw new Xunit.Sdk.XunitException("Native transfer surface was not reached. " + peer.Output);
            }
            if (outgoing)
            {
                Find(() => GetMouseFocus() != 0);
                Send("button 1");
                Send("button 0");
                int pressed = scene.Presses;
                Send("button 1");
                PumpUntil(window, () => scene.Presses > pressed, peer, input);
                Send("point 20 20");
                Find(PeerHovered);
                Send("button 0");
                PumpUntil(window, () => peer.Has("drop-complete") && scene.End.HasValue, peer, input);
                Assert.Equal(DragEndKind.Dropped, scene.End!.Value.Kind);
                Assert.Equal(DataTransferStatus.Success, scene.End.Value.Status);
                Assert.Equal(effect, scene.End.Value.Effect);
                Assert.Equal(effect == DragEffect.Move, scene.End.Value.SourceRemovalRequired);
                Assert.Equal(1, scene.EndCount);
            }
            else
            {
                Find(PeerHovered);
                Send("button 1");
                Send("button 0");
                int pressed = peer.Count("pressed");
                Send("button 1");
                PumpUntil(window, () => peer.Count("pressed") > pressed, peer, input);
                peer.Send("start");
                PumpUntil(window, () => peer.Has("start"), peer, input);
                Assert.True(peer.Has("start 0"), peer.Output);
                Send("point 20 20");
                Find(() => scene.NativeHovered);
                Send("button 0");
                PumpUntil(window, () => peer.Has("source-end"), peer, input);
                Assert.True(peer.Has(rejectFinal ? "source-end 1 0 0" : $"source-end 0 {(int)effect} {(effect == DragEffect.Move ? 1 : 0)}"), peer.Output);
                Assert.Equal(rejectFinal ? 0 : 1, scene.DropCount);
                Assert.True(scene.Previews > 0);
                Assert.Equal(rejectFinal ? DataTransferStatus.Cancelled : DataTransferStatus.Success, window.LastNativeTransferStatus);
                Assert.Equal("", window.LastNativeTransferError);
                if (rejectFinal) Assert.Null(scene.Captured);
                else AssertData(scene.Captured!);
            }
        }
        finally
        {
            window.RequestClose();
            while (window.IsOpen) Pump(window);
        }
        if (scene.Captured is not null) AssertData(scene.Captured);
    }

    [System.Runtime.InteropServices.DllImport("SDL3", EntryPoint = "SDL_GetMouseFocus")]
    private static extern nint GetMouseFocus();

    [System.Runtime.InteropServices.DllImport("SDL3", EntryPoint = "SDL_GetGlobalProperties")]
    private static extern uint GetGlobalProperties();
    [System.Runtime.InteropServices.DllImport("SDL3", EntryPoint = "SDL_GetPointerProperty")]
    private static extern nint GetPointerProperty(uint properties, string name, nint fallback);
    [System.Runtime.InteropServices.DllImport("libwayland-client.so.0", EntryPoint = "wl_display_roundtrip")]
    private static extern int Roundtrip(nint display);

    private static void SyncDisplay() => Assert.True(Roundtrip(GetPointerProperty(GetGlobalProperties(), "SDL.video.wayland.wl_display", 0)) >= 0);

    private static void Pump(Window window)
    {
        Assert.True(window.TryPost(static () => { }));
        window.Pump(0);
    }

    private static void PumpUntil(Window window, Func<bool> ready, params Peer[] peers)
    {
        var deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 15;
        while (!ready())
        {
            foreach (var peer in peers) Assert.False(peer.Exited, peer.Output);
            Assert.True(Stopwatch.GetTimestamp() < deadline, $"Native transfer timed out: {window.LastNativeTransferStatus}: {window.LastNativeTransferError}. " + string.Join("\n", peers.Select(p => p.Output)));
            Pump(window);
            Thread.Sleep(1);
        }
    }

    private static TransferData CreateData()
    {
        var binary = new byte[1048576];
        for (int i = 0; i < binary.Length; i++) binary[i] = (byte)i;
        return new TransferData([
            new TransferRepresentation(Types[0], Encoding.UTF8.GetBytes("native MIME transfer")),
            new TransferRepresentation(Types[1], Png),
            new TransferRepresentation(Types[2], binary),
            new TransferRepresentation(Types[3], ReadOnlyMemory<byte>.Empty)
        ], []);
    }

    private static void AssertData(TransferData data)
    {
        Assert.Empty(data.Uris);
        Assert.Equal(Types.Length, data.Representations.Count);
        for (int i = 0; i < Types.Length; i++)
        {
            Assert.Equal(Types[i], data.Representations[i].ContentType);
            Assert.True(Expected.Representations[i].Bytes.Span.SequenceEqual(data.Representations[i].Bytes.Span));
        }
    }

    private sealed class TransferScene(bool outgoing, DragEffect effect, bool rejectFinal) : Cell
    {
        public bool NativeHovered;
        public int Presses;
        public int Previews;
        public int DropCount;
        public int EndCount;
        public TransferData? Captured;
        public DragEndEvent? End;

        public override Blob Build() => new Container
        {
            Width = 480, Height = 160,
            OnPointerDown = _ => Presses++,
            DragSource = outgoing ? new DragSource(_ => new DragData("native selection", DragEffect.Copy | DragEffect.Move) { NativeData = Expected },
                e => { End = e; EndCount++; }) : null,
            DropTarget = outgoing ? null : new DropTarget(e => e.Data.Value is NativeDataDrop drop && (!rejectFinal || drop.IsPreview) ? effect : DragEffect.None,
                e => {
                    if (e.Data.Value is not NativeDataDrop drop) return;
                    NativeHovered = e.Kind != DragEventKind.Leave;
                    if (drop.IsPreview) { Assert.Empty(drop.Data.Representations); Assert.Empty(drop.Data.Uris); Previews++; }
                    if (e.Kind == DragEventKind.Drop) { Assert.False(drop.IsPreview); Captured = drop.Data; DropCount++; }
                })
        };
    }

    private sealed class Peer : IDisposable
    {
        private readonly Process process;
        private readonly List<string> output = [];
        public Peer(string executable, params string[] arguments)
        {
            var start = new ProcessStartInfo(executable) { RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true };
            foreach (var argument in arguments) start.ArgumentList.Add(argument);
            process = new Process { StartInfo = start };
            process.OutputDataReceived += (_, e) => { if (e.Data is not null) lock (output) output.Add(e.Data); };
            process.ErrorDataReceived += (_, e) => { if (e.Data is not null) lock (output) output.Add("stderr: " + e.Data); };
            Assert.True(process.Start());
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
        }
        public bool Exited => process.HasExited;
        public string Output { get { lock (output) return string.Join("\n", output); } }
        public int Count(string prefix) { lock (output) return output.Count(x => x == prefix || x.StartsWith(prefix + " ", StringComparison.Ordinal)); }
        public bool Has(string prefix) => Count(prefix) > 0;
        public void Send(string command) { process.StandardInput.WriteLine(command); process.StandardInput.Flush(); }
        public void Dispose()
        {
            if (!process.HasExited) { Send("quit"); if (!process.WaitForExit(5000)) process.Kill(entireProcessTree: true); }
            process.Dispose();
        }
    }
}
