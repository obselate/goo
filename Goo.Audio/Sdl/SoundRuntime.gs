package Goo

import Hexa.NET.SDL3
import System
import System.Collections.Generic
import System.Runtime.InteropServices

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate SoundPull(userData nint, stream nint, additional int32, total int32);

internal unsafe class SoundVoice {
    internal var Stream SDLAudioStreamPtr
    internal let Bytes int32
    internal var Level float32
    internal var Progress SoundPlaybackStatus = SoundPlaybackStatus.Playing
    internal var Ended bool
    private let channels int32
    private let read Func[[]float32, int32, int32]?
    private let buffer[]float32
    private var pin GCHandle
    private let callback SoundPull?

    internal init(
        stream SDLAudioStreamPtr,
        bytes int32,
        gain float32,
        channels int32,
        read Func[[]float32, int32, int32]?
    ) {
        Stream = stream
        Bytes = bytes
        Level = gain
        this.channels = channels
        this.read = read
        buffer = if read != nil {
            [SoundRuntime.StreamFrames * channels]float32
        } else {
            Array.Empty[float32]()
        }
        if read != nil {
            callback = Pull
            pin = GCHandle.Alloc(buffer, GCHandleType.Pinned)
        }
    }

    internal func Attach() bool {
        guard let current = callback else {
            return false
        }
        return SetCallback(nint(Stream.Handle), Marshal.GetFunctionPointerForDelegate(current), nint(0)) != 0
    }

    internal func Destroy() {
        SDL.DestroyAudioStream(Stream)
        Stream = SDLAudioStreamPtr.Null
        if pin.IsAllocated {
            pin.Free()
        }
    }

    private func Pull(userData nint, stream nint, additional int32, total int32) {
        if Ended || additional <= 0 {
            return
        }
        try {
            guard let reader = read else {
                return
            }
            let frames = Math.Min(SoundRuntime.StreamFrames, (additional - 1) / (channels * 4) + 1)
            let count = reader(buffer, frames)
            if count < 0 || count > frames {
                throw ArgumentOutOfRangeException("frames")
            }
            if count == 0 {
                Ended = true
                if !SDL.FlushAudioStream(Stream) {
                    Progress = SoundPlaybackStatus.NativeFailure
                }
                return
            }
            for i in 0 ... count * channels {
                buffer[i] = SoundSource.Clamp(buffer[i])
            }
            if !SDL.PutAudioStreamData(Stream, pin.AddrOfPinnedObject(), count * channels * 4) {
                Progress = SoundPlaybackStatus.NativeFailure
                Ended = true
            }
        } catch (error Exception) {
            Progress = SoundPlaybackStatus.SourceFailure
            Ended = true
        }
    }

    shared {
        @DllImport("SDL3", EntryPoint: "SDL_SetAudioStreamGetCallback", CallingConvention: CallingConvention.Cdecl)
        private func SetCallback(stream nint, callback nint, userData nint) uint8;
    }
}

internal class SoundRuntime : SoundBackend {
    private let gate object = Object()
    private let voices List[SoundPlayback] = List[SoundPlayback]()
    private let device uint32
    private var references int32 = 1
    private var queuedBytes int32

    private init(device uint32) {
        this.device = device
    }

    shared {
        internal const StreamFrames int32 = 1024
        private const MaxVoices int32 = 16
        private const MaxQueueBytes int32 = 33554432
        private const DefaultPlaybackDevice uint32 = 0xFFFFFFFFu
        private let sharedGate object = Object()
        private var sharedRuntime SoundRuntime?

        internal func Open() SoundOpenResult {
            if OperatingSystem.IsAndroid()
            || (!OperatingSystem.IsWindows() && !OperatingSystem.IsLinux() && !OperatingSystem.IsMacOS()) {
                return SoundOpenResult(SoundOpenStatus.Unsupported)
            }
            try {
                SdlRuntime.RequireMainThread("SoundPlayer.TryOpen")
                lock sharedGate {
                    if let current = sharedRuntime {
                        current.references++
                        return SoundOpenResult(SoundOpenStatus.Opened, SoundPlayer(current))
                    }
                    if !SDL.InitSubSystem(uint32(SDLInitFlags.Audio)) {
                        return SoundOpenResult(SoundOpenStatus.SubsystemUnavailable)
                    }
                    let device = SDL.OpenAudioDevice(DefaultPlaybackDevice, SDLAudioSpecPtr.Null)
                    if device == 0u {
                        SDL.QuitSubSystem(uint32(SDLInitFlags.Audio))
                        return SoundOpenResult(SoundOpenStatus.DeviceUnavailable)
                    }
                    if !SDL.ResumeAudioDevice(device) {
                        SDL.CloseAudioDevice(device)
                        SDL.QuitSubSystem(uint32(SDLInitFlags.Audio))
                        return SoundOpenResult(SoundOpenStatus.DeviceUnavailable)
                    }
                    let runtime = SoundRuntime(device)
                    sharedRuntime = runtime
                    return SoundOpenResult(SoundOpenStatus.Opened, SoundPlayer(runtime))
                }
            } catch (error DllNotFoundException) {
                return SoundOpenResult(SoundOpenStatus.Unsupported)
            } catch (error EntryPointNotFoundException) {
                return SoundOpenResult(SoundOpenStatus.Unsupported)
            }
        }

        private func ValidateGain(gain float32) {
            if !Single.IsFinite(gain) || gain < 0.0F || gain > 1.0F {
                throw ArgumentOutOfRangeException("gain")
            }
        }
    }

    public func Release(owner SoundPlayer) {
        SdlRuntime.RequireMainThread("SoundPlayer.Dispose")
        lock sharedGate {
            lock gate {
                if owner.Disposed {
                    return
                }
                owner.Disposed = true
                StopOwner(owner)
                references--
                if references == 0 {
                    SDL.CloseAudioDevice(device)
                    SDL.QuitSubSystem(uint32(SDLInitFlags.Audio))
                    sharedRuntime = nil
                }
            }
        }
    }

    public func Play(
        owner SoundPlayer,
        sampleRate int32,
        channels int32,
        samples([]float32)?,
        read Func[[]float32, int32, int32]?,
        gain float32
    ) SoundPlayResult {
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
            let bytes = if let pcm = samples {
                pcm.Length * 4
            } else {
                StreamFrames * channels * 4
            }
            if voices.Count >= MaxVoices {
                return SoundPlayResult(SoundPlayStatus.VoiceLimit)
            }
            if bytes > MaxQueueBytes - queuedBytes {
                return SoundPlayResult(SoundPlayStatus.QueueBudget)
            }
            var spec = SDLAudioSpec{
                Format: BitConverter.IsLittleEndian ? SDLAudioFormat.F32Le: SDLAudioFormat.F32Be,
                Channels: channels,
                Freq: sampleRate,
            }
            let stream = SDL.CreateAudioStream(ref spec, SDLAudioSpecPtr.Null)
            if stream.IsNull {
                return SoundPlayResult(SoundPlayStatus.NativeFailure)
            }
            let state = SoundVoice(stream, bytes, gain, channels, read)
            var accepted = false
            try {
                if !SDL.SetAudioStreamGain(stream, gain) || !SDL.BindAudioStream(device, stream) {
                    return SoundPlayResult(SoundPlayStatus.NativeFailure)
                }
                if let pcm = samples {
                    let pin = GCHandle.Alloc(pcm, GCHandleType.Pinned)
                    try {
                        if !SDL.PutAudioStreamData(stream, pin.AddrOfPinnedObject(), bytes) {
                            return SoundPlayResult(SoundPlayStatus.NativeFailure)
                        }
                    } finally {
                        pin.Free()
                    }
                    state.Ended = true
                    if !SDL.FlushAudioStream(stream) {
                        return SoundPlayResult(SoundPlayStatus.NativeFailure)
                    }
                } else if !state.Attach() {
                    return SoundPlayResult(SoundPlayStatus.NativeFailure)
                }
                let playback = SoundPlayback(owner, state)
                voices.Add(playback)
                queuedBytes += bytes
                accepted = true
                return SoundPlayResult(SoundPlayStatus.Queued, playback)
            } finally {
                if !accepted {
                    state.Destroy()
                }
            }
        }
    }

    public func Status(playback SoundPlayback) SoundPlaybackStatus {
        lock gate {
            let state = SoundVoice(playback.State)
            if state.Stream.IsNull {
                return state.Progress
            }
            if !SDL.LockAudioStream(state.Stream) {
                StopVoice(playback, SoundPlaybackStatus.NativeFailure)
                return state.Progress
            }
            var progress = state.Progress
            try {
                if progress == SoundPlaybackStatus.Playing || progress == SoundPlaybackStatus.Paused {
                    let queued = SDL.GetAudioStreamQueued(state.Stream)
                    let available = SDL.GetAudioStreamAvailable(state.Stream)
                    if queued < 0 || available < 0 {
                        progress = SoundPlaybackStatus.NativeFailure
                    } else if state.Ended && queued == 0 && available == 0 {
                        progress = SoundPlaybackStatus.Completed
                    }
                }
            } finally {
                SDL.UnlockAudioStream(state.Stream)
            }
            if progress != SoundPlaybackStatus.Playing && progress != SoundPlaybackStatus.Paused {
                StopVoice(playback, progress)
            }
            return progress
        }
    }

    public func Gain(playback SoundPlayback) float32 {
        lock gate {
            return SoundVoice(playback.State).Level
        }
    }

    public func SetGain(playback SoundPlayback, gain float32) {
        ValidateGain(gain)
        lock gate {
            let state = SoundVoice(playback.State)
            if state.Stream.IsNull {
                return
            }
            if SDL.SetAudioStreamGain(state.Stream, gain) {
                state.Level = gain
            } else {
                StopVoice(playback, SoundPlaybackStatus.NativeFailure)
            }
        }
    }

    public func Pause(playback SoundPlayback, paused bool) {
        lock gate {
            let state = SoundVoice(playback.State)
            if state.Stream.IsNull {
                return
            }
            if paused {
                SDL.UnbindAudioStream(state.Stream)
            }
            if !SDL.LockAudioStream(state.Stream) {
                StopVoice(playback, SoundPlaybackStatus.NativeFailure)
                return
            }
            var resume = false
            try {
                if paused && state.Progress == SoundPlaybackStatus.Playing {
                    state.Progress = SoundPlaybackStatus.Paused
                } else if !paused && state.Progress == SoundPlaybackStatus.Paused {
                    state.Progress = SoundPlaybackStatus.Playing
                    resume = true
                }
            } finally {
                SDL.UnlockAudioStream(state.Stream)
            }
            if resume && !SDL.BindAudioStream(device, state.Stream) {
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
            StopOwner(owner)
        }
    }

    private func StopOwner(owner SoundPlayer) {
        var index = voices.Count - 1
        while index >= 0 {
            let voice = voices[index]
            if Object.ReferenceEquals(voice.Owner, owner) {
                StopVoice(voice, SoundPlaybackStatus.Stopped)
            }
            index--
        }
    }

    private func StopVoice(playback SoundPlayback, progress SoundPlaybackStatus) {
        let state = SoundVoice(playback.State)
        if state.Stream.IsNull {
            return
        }
        state.Destroy()
        state.Progress = progress
        queuedBytes -= state.Bytes
        voices.Remove(playback)
    }
}
