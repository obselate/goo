package Goo.ApiContractTests

import System
import System.Collections.Generic
import System.Diagnostics
import System.Linq
import System.Runtime.InteropServices
import System.Text
import System.Threading
import Goo
import Xunit

public sealed class WaylandDataTransferTests {
    @Fact
    public func NativeMimeBytesAndNegotiatedEffectsSurviveCrossProcessHandoff() {
        let inputPath = Environment.GetEnvironmentVariable("GOO_NATIVE_TRANSFER_INPUT")
        let peerPath = Environment.GetEnvironmentVariable("GOO_NATIVE_TRANSFER_PEER")
        if inputPath == nil || peerPath == nil { return }
        Assert.True(OperatingSystem.IsLinux())
        Assert.Equal("1", Environment.GetEnvironmentVariable("GOO_HEADLESS_WAYLAND"))
        Window.ConfigureApplication("Goo native transfer checks", "1.0", "io.github.obselate.goo.transfer-checks")
        for effect in []DragEffect{DragEffect.Copy, DragEffect.Move} {
            Run(false, effect, inputPath, peerPath)
            Run(true, effect, inputPath, peerPath)
        }
        Run(false, DragEffect.Copy, inputPath, peerPath, rejectFinal: true)
    }

    shared {
        private let Types []string = []string{"text/plain;charset=utf-8", "image/png",
            "application/x-goo-transfer-check", "application/x-goo-empty"}
        private let Png []uint8 = []uint8{137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,
            8,6,0,0,0,31,21,196,137,0,0,0,11,73,68,65,84,120,156,99,96,0,2,0,0,5,0,1,
            165,246,69,64,0,0,0,0,73,69,78,68,174,66,96,130}
        private let Expected TransferData = CreateData()

        private func Run(outgoing bool, effect DragEffect, inputPath string, peerPath string,
            rejectFinal bool = false) {
            let scene = TransferScene(outgoing, effect, rejectFinal)
            let window = Window{Title: "Goo native transfer checks", Width: 480, Height: 160, Root: scene}.Open()
            try {
                PumpUntil(window, () -> window.IsVisible)
                Assert.True((window.NativeTransferCapabilities & NativeTransferCapabilities.DataDrop)
                    != NativeTransferCapabilities.None)
                window.NativeFileDropEnabled = true
                Assert.Equal(WindowOperationResult.Accepted, window.SetNativeDataDropFormats(Types))
                using let peer = Peer(peerPath, if outgoing { "target" } else { "source" }, int32(effect).ToString())
                using let input = Peer(inputPath)
                PumpUntil(window, () -> input.Has("ready") && peer.Has("ready"), peer, input)
                var serial uint32
                let send = (command string) -> {
                    input.Send(command)
                    serial++
                    input.Send("sync $serial")
                    PumpUntil(window, () -> input.Has("sync $serial"), peer, input)
                    Pump(window)
                }
                var hoverSerial uint32
                let peerHovered = () -> {
                    hoverSerial++
                    peer.Send("hover $hoverSerial")
                    PumpUntil(window, () -> peer.Has("hover $hoverSerial"), peer, input)
                    return peer.Has("hover $hoverSerial 1")
                }
                let find = (hovered Func[bool]) -> {
                    for var y = 40; y < 900; y += 60 {
                        for var x = 40; x < 1400; x += 80 {
                            send("point $x $y")
                            let end = Stopwatch.GetTimestamp() + Stopwatch.Frequency / 50
                            while Stopwatch.GetTimestamp() < end && !hovered() {
                                Pump(window)
                                Thread.Sleep(1)
                            }
                            if hovered() {
                                SyncDisplay()
                                Pump(window)
                                if hovered() { return }
                            }
                        }
                    }
                    throw Xunit.Sdk.XunitException("Native transfer surface was not reached. " + peer.Output)
                }
                if outgoing {
                    find(() -> GetMouseFocus() != nint(0))
                    send("button 1")
                    send("button 0")
                    let pressed = scene.Presses
                    send("button 1")
                    PumpUntil(window, () -> scene.Presses > pressed, peer, input)
                    send("point 20 20")
                    find(peerHovered)
                    send("button 0")
                    PumpUntil(window, () -> peer.Has("drop-complete") && scene.End != nil, peer, input)
                    let finished = scene.End!!
                    Assert.Equal(DragEndKind.Dropped, finished.Kind)
                    Assert.Equal(DataTransferStatus.Success, finished.Status)
                    Assert.Equal(effect, finished.Effect)
                    Assert.Equal(effect == DragEffect.Move, finished.SourceRemovalRequired)
                    Assert.Equal(1, scene.EndCount)
                } else {
                    find(peerHovered)
                    send("button 1")
                    send("button 0")
                    let pressed = peer.Count("pressed")
                    send("button 1")
                    PumpUntil(window, () -> peer.Count("pressed") > pressed, peer, input)
                    peer.Send("start")
                    PumpUntil(window, () -> peer.Has("start"), peer, input)
                    Assert.True(peer.Has("start 0"), peer.Output)
                    send("point 20 20")
                    find(() -> scene.NativeHovered)
                    send("button 0")
                    PumpUntil(window, () -> peer.Has("source-end"), peer, input)
                    let expectedEnd = if rejectFinal { "source-end 1 0 0" }
                        else { "source-end 0 ${int32(effect)} ${if effect == DragEffect.Move { 1 } else { 0 }}" }
                    Assert.True(peer.Has(expectedEnd), peer.Output)
                    Assert.Equal(if rejectFinal { 0 } else { 1 }, scene.DropCount)
                    Assert.True(scene.Previews > 0)
                    Assert.Equal(if rejectFinal { DataTransferStatus.Cancelled } else { DataTransferStatus.Success },
                        window.LastNativeTransferStatus)
                    Assert.Equal("", window.LastNativeTransferError)
                    if rejectFinal { Assert.Null(scene.Captured) }
                    else { AssertData(scene.Captured!!) }
                }
            } finally {
                window.RequestClose()
                while window.IsOpen { Pump(window) }
            }
            if let captured = scene.Captured { AssertData(captured) }
        }

        @DllImport("SDL3", EntryPoint: "SDL_GetMouseFocus")
        private func GetMouseFocus() nint;

        @DllImport("SDL3", EntryPoint: "SDL_GetGlobalProperties")
        private func GetGlobalProperties() uint32;

        @DllImport("SDL3", EntryPoint: "SDL_GetPointerProperty")
        private func GetPointerProperty(properties uint32, name string, fallback nint) nint;

        @DllImport("libwayland-client.so.0", EntryPoint: "wl_display_roundtrip")
        private func Roundtrip(display nint) int32;

        private func SyncDisplay() -> Assert.True(Roundtrip(GetPointerProperty(GetGlobalProperties(),
            "SDL.video.wayland.wl_display", nint(0))) >= 0)

        private func Pump(window Window) {
            Assert.True(window.TryPost(() -> {}))
            window.Pump(0)
        }

        private func PumpUntil(window Window, ready Func[bool], peers ...Peer) {
            let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 15
            while !ready() {
                for peer in peers { Assert.False(peer.Exited, peer.Output) }
                Assert.True(Stopwatch.GetTimestamp() < deadline,
                    "Native transfer timed out: ${window.LastNativeTransferStatus}: ${window.LastNativeTransferError}. "
                    + string.Join(Environment.NewLine, peers.Select(p -> p.Output)))
                Pump(window)
                Thread.Sleep(1)
            }
        }

        private func CreateData() TransferData {
            let binary = [1048576]uint8
            for i in 0 ... binary.Length { binary[i] = uint8(i) }
            return TransferData([]TransferRepresentation{
                TransferRepresentation(Types[0], Encoding.UTF8.GetBytes("native MIME transfer")),
                TransferRepresentation(Types[1], Png),
                TransferRepresentation(Types[2], binary),
                TransferRepresentation(Types[3], ReadOnlyMemory[uint8].Empty)
            }, Array.Empty[Uri]())
        }

        private func AssertData(data TransferData) {
            Assert.Empty(data.Uris)
            Assert.Equal(Types.Length, data.Representations.Count)
            for i in 0 ... Types.Length {
                Assert.Equal(Types[i], data.Representations[i].ContentType)
                Assert.True(Expected.Representations[i].Bytes.Span.SequenceEqual(data.Representations[i].Bytes.Span))
            }
        }
    }

    private sealed class TransferScene : Cell {
        public var NativeHovered bool
        public var Presses int32
        public var Previews int32
        public var DropCount int32
        public var EndCount int32
        public var Captured TransferData?
        public var End DragEndEvent?
        private let outgoing bool
        private let effect DragEffect
        private let rejectFinal bool

        public init(outgoing bool, effect DragEffect, rejectFinal bool) {
            this.outgoing = outgoing
            this.effect = effect
            this.rejectFinal = rejectFinal
        }

        override func Build() Blob -> Container{
            Width: 480, Height: 160,
            OnPointerDown: _ -> { Presses++ },
            DragSource: if outgoing {
                DragSource(_ -> DragData("native selection", DragEffect.Copy | DragEffect.Move){
                    NativeData = WaylandDataTransferTests.Expected},
                    e -> {
                        End = e
                        EndCount++
                    })
            } else { nil },
            DropTarget: if outgoing { nil } else {
                DropTarget(e -> {
                    if let drop = e.Data.Value as NativeDataDrop {
                        return if !rejectFinal || drop.IsPreview { effect } else { DragEffect.None }
                    }
                    return DragEffect.None
                }, e -> {
                    guard let drop = e.Data.Value as NativeDataDrop else { return }
                    NativeHovered = e.Kind != DragEventKind.Leave
                    if drop.IsPreview {
                        Assert.Empty(drop.Data.Representations)
                        Assert.Empty(drop.Data.Uris)
                        Previews++
                    }
                    if e.Kind == DragEventKind.Drop {
                        Assert.False(drop.IsPreview)
                        Captured = drop.Data
                        DropCount++
                    }
                })
            }
        }
    }

    private sealed class Peer : IDisposable {
        private let process Process
        private let output List[string] = List[string]()

        public init(executable string, arguments ...string) {
            let start = ProcessStartInfo(executable)
            start.RedirectStandardInput = true
            start.RedirectStandardOutput = true
            start.RedirectStandardError = true
            for argument in arguments { start.ArgumentList.Add(argument) }
            process = Process()
            process.StartInfo = start
            process.OutputDataReceived += (_, e) -> {
                if let line = e.Data { lock (output) { output.Add(line) } }
            }
            process.ErrorDataReceived += (_, e) -> {
                if let line = e.Data { lock (output) { output.Add("stderr: " + line) } }
            }
            Assert.True(process.Start())
            process.BeginOutputReadLine()
            process.BeginErrorReadLine()
        }

        public prop Exited bool -> process.HasExited

        public prop Output string {
            get { lock (output) { return string.Join(Environment.NewLine, output) } }
        }

        public func Count(prefix string) int32 {
            lock (output) {
                return output.Count(x -> x == prefix || x.StartsWith(prefix + " ", StringComparison.Ordinal))
            }
        }

        public func Has(prefix string) bool -> Count(prefix) > 0

        public func Send(command string) {
            process.StandardInput.WriteLine(command)
            process.StandardInput.Flush()
        }

        public func Dispose() {
            if !process.HasExited {
                Send("quit")
                if !process.WaitForExit(5000) { process.Kill(entireProcessTree: true) }
            }
            process.Dispose()
        }
    }
}
