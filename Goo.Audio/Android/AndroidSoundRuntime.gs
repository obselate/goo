package Goo

import System
import System.Collections.Generic
import System.Runtime.InteropServices

import System.Threading

internal class AndroidSoundVoice {
    internal let Gate object = Object()
    internal var Stream nint
    internal let Bytes int32
    internal var Level float32
    internal var Progress SoundPlaybackStatus = SoundPlaybackStatus.Playing
    internal var EndFrame int64 = -1
    internal let Worker Thread
    private let channels int32
    private let samples([]float32)?
    private let read Func[[]float32, int32, int32]?
    private let buffer[]float32
    private var position int32

    internal init(channels int32, samples([]float32)?, read Func[[]float32, int32, int32]?, gain float32) {
        this.channels = channels
        this.samples = samples
        this.read = read
        Level = gain
        buffer = [SoundRuntime.StreamFrames * channels]float32
        Bytes = if let pcm = samples { pcm.Length * 4 } else { buffer.Length * 4 }
        Worker = Thread(() -> { Pull() })
        Worker.IsBackground = true
    }

    private func Pull() {
        let pin = GCHandle.Alloc(buffer, GCHandleType.Pinned)
        var remaining = 0
        var offset = 0
        try {
            while true {
                lock Gate {
                    if Stream == nint(0) {
                        return
                    }
                    if Progress == SoundPlaybackStatus.Playing && EndFrame < 0 {
                        if remaining == 0 {
                            if let pcm = samples {
                                remaining = Math.Min(SoundRuntime.StreamFrames, (pcm.Length - position) / channels)
                                Array.Copy(pcm, position, buffer, 0, remaining * channels)
                                position += remaining * channels
                            } else if let reader = read {
                                remaining = reader(buffer, SoundRuntime.StreamFrames)
                                if remaining < 0 || remaining > SoundRuntime.StreamFrames {
                                    throw ArgumentOutOfRangeException("frames")
                                }
                            }
                            for i in 0 ... remaining * channels {
                                buffer[i] = SoundSource.Clamp(buffer[i]) * Level
                            }
                            offset = 0
                            if remaining == 0 {
                                EndFrame = AndroidSoundRuntime.FramesWritten(Stream)
                            }
                        }
                        if remaining > 0 {
                            let written = AndroidSoundRuntime.WriteStream(Stream,
                                pin.AddrOfPinnedObject() + nint(offset * channels * 4), remaining, 1000000L)
                            if written < 0 {
                                Progress = SoundPlaybackStatus.NativeFailure
                                return
                            }
                            remaining -= written
                            offset += written
                        }
                    }
                }
                Thread.Sleep(1)
            }
        } catch (error Exception) {
            lock Gate {
                Progress = SoundPlaybackStatus.SourceFailure
            }
        } finally {
            pin.Free()
        }
    }
}

internal unsafe class AndroidSoundRuntime : SoundBackend {
    private let gate object = Object()
    private let voices List[SoundPlayback] = List[SoundPlayback]()
    private var references int32 = 1
    private var queuedBytes int32

    shared {
        private const MaxVoices int32 = 16
        private const MaxQueueBytes int32 = 33554432
        private let sharedGate object = Object()
        private var sharedRuntime AndroidSoundRuntime?

        internal func Open() SoundOpenResult {
            lock sharedGate {
                if let current = sharedRuntime {
                    current.references++
                    return SoundOpenResult(SoundOpenStatus.Opened, SoundPlayer(current))
                }
                try {
                    var builder nint
                    if CreateBuilder(&builder) != 0 {
                        return SoundOpenResult(SoundOpenStatus.SubsystemUnavailable)
                    }
                    var stream nint
                    try {
                        if OpenStream(builder, &stream) != 0 {
                            return SoundOpenResult(SoundOpenStatus.DeviceUnavailable)
                        }
                        CloseStream(stream)
                    } finally {
                        DeleteBuilder(builder)
                    }
                    let runtime = AndroidSoundRuntime()
                    sharedRuntime = runtime
                    return SoundOpenResult(SoundOpenStatus.Opened, SoundPlayer(runtime))
                } catch (error DllNotFoundException) {
                    return SoundOpenResult(SoundOpenStatus.Unsupported)
                } catch (error EntryPointNotFoundException) {
                    return SoundOpenResult(SoundOpenStatus.Unsupported)
                }
            }
        }

        private func ValidateGain(gain float32) {
            if !Single.IsFinite(gain) || gain < 0.0F || gain > 1.0F {
                throw ArgumentOutOfRangeException("gain")
            }
        }

        @DllImport("libaaudio.so", EntryPoint: "AAudio_createStreamBuilder")
        private func CreateBuilder(builder *nint) int32;

        @DllImport("libaaudio.so", EntryPoint: "AAudioStreamBuilder_delete")
        private func DeleteBuilder(builder nint) int32;

        @DllImport("libaaudio.so", EntryPoint: "AAudioStreamBuilder_setSampleRate")
        private func SetSampleRate(builder nint, rate int32);

        @DllImport("libaaudio.so", EntryPoint: "AAudioStreamBuilder_setChannelCount")
        private func SetChannels(builder nint, channels int32);

        @DllImport("libaaudio.so", EntryPoint: "AAudioStreamBuilder_setFormat")
        private func SetFormat(builder nint, format int32);

        @DllImport("libaaudio.so", EntryPoint: "AAudioStream_write")
        internal func WriteStream(stream nint, buffer nint, frames int32, timeoutNanoseconds int64) int32;

        @DllImport("libaaudio.so", EntryPoint: "AAudioStreamBuilder_openStream")
        private func OpenStream(builder nint, stream *nint) int32;

        @DllImport("libaaudio.so", EntryPoint: "AAudioStream_close")
        private func CloseStream(stream nint) int32;

        @DllImport("libaaudio.so", EntryPoint: "AAudioStream_requestStart")
        private func StartStream(stream nint) int32;

        @DllImport("libaaudio.so", EntryPoint: "AAudioStream_setStartThresholdInFrames")
        private func SetStartThreshold(stream nint, frames int32) int32;

        @DllImport("libaaudio.so", EntryPoint: "AAudioStream_requestPause")
        private func PauseStream(stream nint) int32;

        @DllImport("libaaudio.so", EntryPoint: "AAudioStream_getState")
        private func StreamState(stream nint) int32;

        @DllImport("libaaudio.so", EntryPoint: "AAudioStream_getFramesWritten")
        internal func FramesWritten(stream nint) int64;

        @DllImport("libaaudio.so", EntryPoint: "AAudioStream_getFramesRead")
        private func FramesRead(stream nint) int64;
    }

    public func Play(owner SoundPlayer, sampleRate int32, channels int32, samples([]float32)?,
        read Func[[]float32, int32, int32]?, gain float32) SoundPlayResult {
        ValidateGain(gain)
        lock gate {
            if owner.Disposed {
                throw ObjectDisposedException("SoundPlayer")
            }
            var index = voices.Count - 1
            while index >= 0 {
                Status(voices[index])
                index--
            }
            let bytes = if let pcm = samples { pcm.Length * 4 } else { SoundRuntime.StreamFrames * channels * 4 }
            if voices.Count >= MaxVoices {
                return SoundPlayResult(SoundPlayStatus.VoiceLimit)
            }
            if bytes > MaxQueueBytes - queuedBytes {
                return SoundPlayResult(SoundPlayStatus.QueueBudget)
            }
            var builder nint
            if CreateBuilder(&builder) != 0 {
                return SoundPlayResult(SoundPlayStatus.NativeFailure)
            }
            let state = AndroidSoundVoice(channels, samples, read, gain)
            try {
                SetSampleRate(builder, sampleRate)
                SetChannels(builder, channels)
                SetFormat(builder, 2)
                var stream nint
                if OpenStream(builder, &stream) != 0 {
                    return SoundPlayResult(SoundPlayStatus.NativeFailure)
                }
                state.Stream = stream
                if SetStartThreshold(stream, 1) < 0 || StartStream(stream) != 0 {
                    CloseStream(stream)
                    return SoundPlayResult(SoundPlayStatus.NativeFailure)
                }
            } finally {
                DeleteBuilder(builder)
            }
            let playback = SoundPlayback(owner, state)
            voices.Add(playback)
            queuedBytes += bytes
            state.Worker.Start()
            return SoundPlayResult(SoundPlayStatus.Queued, playback)
        }
    }

    public func Status(playback SoundPlayback) SoundPlaybackStatus {
        lock gate {
            let state = AndroidSoundVoice(playback.State)
            var progress SoundPlaybackStatus
            lock state.Gate {
                progress = state.Progress
                if state.Stream != nint(0) {
                    if StreamState(state.Stream) == 13 {
                        progress = SoundPlaybackStatus.NativeFailure
                    } else if progress == SoundPlaybackStatus.Playing && state.EndFrame >= 0
                        && FramesRead(state.Stream) >= state.EndFrame {
                        progress = SoundPlaybackStatus.Completed
                    }
                }
            }
            if progress != SoundPlaybackStatus.Playing && progress != SoundPlaybackStatus.Paused {
                StopVoice(playback, progress)
            }
            return progress
        }
    }

    public func Gain(playback SoundPlayback) float32 {
        let state = AndroidSoundVoice(playback.State)
        lock state.Gate {
            return state.Level
        }
    }

    public func SetGain(playback SoundPlayback, gain float32) {
        ValidateGain(gain)
        let state = AndroidSoundVoice(playback.State)
        lock state.Gate {
            if state.Stream != nint(0) {
                state.Level = gain
            }
        }
    }

    public func Pause(playback SoundPlayback, paused bool) {
        lock gate {
            let state = AndroidSoundVoice(playback.State)
            var failed = false
            lock state.Gate {
                if state.Stream == nint(0) {
                    return
                }
                if paused && state.Progress == SoundPlaybackStatus.Playing {
                    failed = PauseStream(state.Stream) != 0
                    state.Progress = SoundPlaybackStatus.Paused
                } else if !paused && state.Progress == SoundPlaybackStatus.Paused {
                    failed = StartStream(state.Stream) != 0
                    state.Progress = SoundPlaybackStatus.Playing
                }
            }
            if failed {
                StopVoice(playback, SoundPlaybackStatus.NativeFailure)
            }
        }
    }

    public func Stop(playback SoundPlayback) {
        lock gate {
            StopVoice(playback, SoundPlaybackStatus.Stopped)
        }
    }

    public func StopAll(owner SoundPlayer) {
        lock gate {
            var index = voices.Count - 1
            while index >= 0 {
                if Object.ReferenceEquals(voices[index].Owner, owner) {
                    StopVoice(voices[index], SoundPlaybackStatus.Stopped)
                }
                index--
            }
        }
    }

    public func Release(owner SoundPlayer) {
        lock sharedGate {
            lock gate {
                if owner.Disposed {
                    return
                }
                owner.Disposed = true
                StopAll(owner)
                references--
                if references == 0 {
                    sharedRuntime = nil
                }
            }
        }
    }

    private func StopVoice(playback SoundPlayback, progress SoundPlaybackStatus) {
        let state = AndroidSoundVoice(playback.State)
        var stream nint
        lock state.Gate {
            stream = state.Stream
            if stream == nint(0) {
                return
            }
            state.Stream = nint(0)
            state.Progress = progress
        }
        state.Worker.Join()
        CloseStream(stream)
        queuedBytes -= state.Bytes
        voices.Remove(playback)
    }
}
