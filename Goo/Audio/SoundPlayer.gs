package Goo

import System
import Hexa.NET.SDL3

/// Owns an application's UI cues using a process-shared default audio device.
/// Open and dispose on the UI thread after ConfigureApplication, if used.
/// Playback and stop calls are thread-safe and do not depend on window frames.
public class SoundPlayer : IDisposable {
  internal let Runtime SoundRuntime
  internal var Disposed bool

  private init(runtime SoundRuntime) { Runtime = runtime }

  shared {
    /// Opens an audio owner, or returns nil if desktop audio/device initialization fails.
    /// Multiple owners share one device; missing audio does not affect Goo windows.
    public func TryOpen() SoundPlayer? {
      let runtime = SoundRuntime.Acquire()
      return if let current = runtime { SoundPlayer(current) } else { nil }
    }
  }

  /// Queues a prepared cue with gain from zero through one, without waiting for playback.
  /// Cues overlap. Returns nil if the shared 16-voice/32-MiB queue budget is full
  /// or the native stream cannot be queued. Throws after disposal or for invalid input.
  /// Completed streams are reclaimed on the next play, status query, stop, or disposal.
  public func Play(source SoundSource, volume float32 = 1.0F) SoundPlayback ? -> Runtime.Play(this, source, volume)

  /// Stops all cues belonging to this owner, leaving other owners' playback intact.
  public func StopAll() { Runtime.StopAll(this) }

  /// Stops this owner's cues and releases its device reference on the UI thread.
  /// The last owner closes the shared device. Repeated disposal is harmless.
  public func Dispose() { SoundRuntime.Release(this) }
}

/// Controls one queued cue. Native device buffering can outlast a stop briefly.
public class SoundPlayback : IDisposable {
  internal let Owner SoundPlayer
  internal let ByteCount int32
  internal var StreamHandle SDLAudioStreamPtr

  internal init(owner SoundPlayer, stream SDLAudioStreamPtr, byteCount int32) {
    Owner = owner
    StreamHandle = stream
    ByteCount = byteCount
  }

  /// Reports whether PCM remains queued; this is not an exact audible-completion clock.
  public prop IsPlaying bool{ get -> Owner.Runtime.IsPlaying(this) }

  /// Stops this cue and releases its stream. Safe after completion or owner disposal.
  public func Stop() { Owner.Runtime.Stop(this) }

  /// Stops this cue and releases its stream.
  public func Dispose() { Stop() }
}
