package Goo

import System

/// Describes whether the optional default audio device opened.
public enum SoundOpenStatus {
    Opened,
    Unsupported,
    SubsystemUnavailable,
    DeviceUnavailable
}

/// Describes whether a playback entered the bounded queue.
public enum SoundPlayStatus {
    Queued,
    VoiceLimit,
    QueueBudget,
    NativeFailure
}

/// Describes playback progress, including terminal source and native failures.
public enum SoundPlaybackStatus {
    Playing,
    Paused,
    Completed,
    Stopped,
    SourceFailure,
    NativeFailure
}

/// Contains an open outcome and a player only when Opened.
public class SoundOpenResult {
    internal init(status SoundOpenStatus, player SoundPlayer? = nil) {
        Status = status
        Player = player
    }

    /// Gets the device-open outcome.
    public prop Status SoundOpenStatus {
        get;
        private set;
    }

    /// Gets the owner when audio opened.
    public prop Player SoundPlayer? {
        get;
        private set;
    }
}

/// Contains a queue outcome and playback only when Queued.
public class SoundPlayResult {
    internal init(status SoundPlayStatus, playback SoundPlayback? = nil) {
        Status = status
        Playback = playback
    }

    /// Gets the queue outcome.
    public prop Status SoundPlayStatus {
        get;
        private set;
    }

    /// Gets the queued playback.
    public prop Playback SoundPlayback? {
        get;
        private set;
    }
}

/// Owns cues and streams on a process-shared default device. Open and dispose on the UI thread.
/// Configure application metadata before opening audio. Other operations are thread-safe.
public class SoundPlayer : IDisposable {
    internal let Backend SoundBackend
    internal var Disposed bool

    internal init(backend SoundBackend) {
        Backend = backend
    }

    shared {
        /// Opens an optional platform audio device with an explicit failure reason.
        public func TryOpen() SoundOpenResult -> if OperatingSystem.IsAndroid() {
            AndroidSoundRuntime.Open()
        } else {
            SoundRuntime.Open()
        }
    }

    /// Queues an immutable cue with initial gain from zero through one.
    /// The shared budget is 16 voices and 32 MiB. Throws for invalid arguments or a disposed owner.
    public func TryPlay(source SoundSource, gain float32 = 1.0F) SoundPlayResult {
        if Object.ReferenceEquals(source, nil) {
            throw ArgumentNullException("source")
        }
        return Backend.Play(this, source.SampleRate, source.Channels, source.Samples, nil, gain)
    }

    /// Pulls interleaved frames on the audio thread using a bounded 1024-frame buffer.
    /// Each playback has its own buffer. The consumer owns decoder state and synchronization.
    public func TryPlay(source SoundStreamSource, gain float32 = 1.0F) SoundPlayResult {
        if Object.ReferenceEquals(source, nil) {
            throw ArgumentNullException("source")
        }
        return Backend.Play(this, source.SampleRate, source.Channels, nil, source.Read, gain)
    }

    /// Stops only this owner's playback.
    public func StopAll() {
        Backend.StopAll(this)
    }

    /// Stops owned playback and releases the shared device on the UI thread. Repeated disposal is harmless.
    public func Dispose() {
        Backend.Release(this)
    }
}

/// Controls one playback. Device buffering can briefly outlast a stop or control change.
public class SoundPlayback : IDisposable {
    internal let Owner SoundPlayer
    internal let State object

    internal init(owner SoundPlayer, state object) {
        Owner = owner
        State = state
    }

    /// Gets progress and reclaims finished playback. Paused is not completion.
    public prop Status SoundPlaybackStatus {
        get -> Owner.Backend.Status(this)
    }

    /// Gets or sets live gain from zero through one. Non-finite or out-of-range gain throws.
    /// Setting gain after completion or stop has no effect.
    public prop Gain float32 {
        get -> Owner.Backend.Gain(this)
        set -> Owner.Backend.SetGain(this, value)
    }

    /// Pauses consumption without discarding queued frames. Safe after completion or stop.
    public func Pause() {
        Owner.Backend.Pause(this, true)
    }

    /// Resumes paused consumption. Safe after completion or stop.
    public func Resume() {
        Owner.Backend.Pause(this, false)
    }

    /// Stops playback and releases its stream. Safe after owner disposal.
    public func Stop() {
        Owner.Backend.Stop(this)
    }

    /// Stops playback and releases its stream.
    public func Dispose() {
        Stop()
    }
}

internal interface SoundBackend {
    func Play(
        owner SoundPlayer,
        sampleRate int32,
        channels int32,
        samples([]float32)?,
        read Func[[]float32, int32, int32]?,
        gain float32
    ) SoundPlayResult;

    func Status(playback SoundPlayback) SoundPlaybackStatus;

    func Gain(playback SoundPlayback) float32;

    func SetGain(playback SoundPlayback, gain float32);

    func Pause(playback SoundPlayback, paused bool);

    func Stop(playback SoundPlayback);

    func StopAll(owner SoundPlayer);

    func Release(owner SoundPlayer);
}

/// Supplies mono or stereo frames for consumer decoders, synthesis, looping, seeking or channel mixing.
public class SoundStreamSource {
    internal let Read Func[[]float32, int32, int32]

    /// Retains a reader called on the audio thread with a reusable buffer and requested frame count.
    /// Return the frames written, zero for permanent end. Short reads continue on the next request.
    /// Write only the requested interleaved frames. Do not retain the buffer, block, call playback controls,
    /// or perform UI work. Exceptions, invalid counts and non-finite samples end playback with SourceFailure.
    /// Finite samples are clamped. Coordinate decoder changes outside the callback without blocking it.
    public init(sampleRate int32, channels int32, read Func[[]float32, int32, int32]) {
        SoundSource.ValidateFormat(sampleRate, channels)
        if Object.ReferenceEquals(read, nil) {
            throw ArgumentNullException("read")
        }
        SampleRate = sampleRate
        Channels = channels
        Read = read
    }

    /// Gets frames per second, from 8000 through 192000.
    public prop SampleRate int32 {
        get;
        private set;
    }

    /// Gets the interleaved channel count, one or two.
    public prop Channels int32 {
        get;
        private set;
    }
}
