package Goo

import System
import System.Collections.Generic
import System.Runtime.InteropServices
import Hexa.NET.SDL3

internal class SoundRuntime {
  private let gate object = Object()
  private let voices List[SoundPlayback] = List[SoundPlayback]()
  private let device uint32
  private var references int32
  private var queuedBytes int32

  private init(device uint32) { this.device = device }

  shared {
    private const DefaultPlaybackDevice uint32 = 0xFFFFFFFFu
    private let sharedGate object = Object()
    private var sharedRuntime SoundRuntime?

    internal func Acquire() SoundRuntime? {
      if OperatingSystem.IsAndroid() { return nil }
      if !OperatingSystem.IsWindows() && !OperatingSystem.IsLinux() && !OperatingSystem.IsMacOS() {
        return nil
      }
      SdlRuntime.RequireMainThread("SoundPlayer.TryOpen")
      lock sharedGate {
        if let current = sharedRuntime {
          current.references++
          return current
        }
        if !SDL.InitSubSystem(uint32(SDLInitFlags.Audio)) { return nil }
        let device = SDL.OpenAudioDevice(DefaultPlaybackDevice, SDLAudioSpecPtr.Null)
        if device == 0u {
          SDL.QuitSubSystem(uint32(SDLInitFlags.Audio))
          return nil
        }
        if !SDL.ResumeAudioDevice(device) {
          SDL.CloseAudioDevice(device)
          SDL.QuitSubSystem(uint32(SDLInitFlags.Audio))
          return nil
        }
        let runtime = SoundRuntime(device)
        runtime.references = 1
        sharedRuntime = runtime
        return runtime
      }
    }

    internal func Release(owner SoundPlayer) {
      SdlRuntime.RequireMainThread("SoundPlayer.Dispose")
      lock sharedGate {
        let runtime = owner.Runtime
        lock runtime.gate {
          if owner.Disposed { return }
          owner.Disposed = true
          runtime.StopOwner(owner)
          runtime.references--
          if runtime.references == 0 {
            SDL.CloseAudioDevice(runtime.device)
            SDL.QuitSubSystem(uint32(SDLInitFlags.Audio))
            sharedRuntime = nil
          }
        }
      }
    }
  }

  internal func Play(owner SoundPlayer, source SoundSource, volume float32) SoundPlayback? {
    if Object.ReferenceEquals(source, nil) { throw ArgumentNullException("source") }
    if !Single.IsFinite(volume) || volume < 0.0F || volume > 1.0F {
      throw ArgumentOutOfRangeException("volume")
    }
    lock gate {
      if owner.Disposed { throw ObjectDisposedException("SoundPlayer") }
      CollectCompleted()
      let bytes = source.Samples.Length * 4
      if voices.Count >= 16 || bytes > 33554432 - queuedBytes { return nil }
      var spec = SDLAudioSpec{
        Format: BitConverter.IsLittleEndian ? SDLAudioFormat.F32Le : SDLAudioFormat.F32Be,
        Channels: source.Channels, Freq: source.SampleRate,
      }
      let stream = SDL.CreateAudioStream(ref spec, SDLAudioSpecPtr.Null)
      if stream.IsNull { return nil }
      var accepted = false
      try {
        if !SDL.SetAudioStreamGain(stream, volume) || !SDL.BindAudioStream(device, stream) { return nil }
        let pin = GCHandle.Alloc(source.Samples, GCHandleType.Pinned)
        try {
          if !SDL.PutAudioStreamData(stream, pin.AddrOfPinnedObject(), bytes) { return nil }
        } finally { pin.Free() }
        if !SDL.FlushAudioStream(stream) { return nil }
        let playback = SoundPlayback(owner, stream, bytes)
        voices.Add(playback)
        queuedBytes += bytes
        accepted = true
        return playback
      } finally {
        if !accepted { SDL.DestroyAudioStream(stream) }
      }
    }
  }

  internal func IsPlaying(playback SoundPlayback) bool {
    lock gate {
      if playback.StreamHandle.IsNull { return false }
      let stream = playback.StreamHandle
      if SDL.GetAudioStreamQueued(stream) > 0 || SDL.GetAudioStreamAvailable(stream) > 0 { return true }
      StopVoice(playback)
      return false
    }
  }

  internal func Stop(playback SoundPlayback) {
    lock gate { StopVoice(playback) }
  }

  internal func StopAll(owner SoundPlayer) {
    lock gate { StopOwner(owner) }
  }

  private func StopOwner(owner SoundPlayer) {
    var index = voices.Count - 1
    while index >= 0 {
      let voice = voices[index]
      if Object.ReferenceEquals(voice.Owner, owner) { StopVoice(voice) }
      index--
    }
  }

  private func CollectCompleted() {
    var index = voices.Count - 1
    while index >= 0 {
      IsPlaying(voices[index])
      index--
    }
  }

  private func StopVoice(playback SoundPlayback) {
    if playback.StreamHandle.IsNull { return }
    SDL.DestroyAudioStream(playback.StreamHandle)
    playback.StreamHandle = SDLAudioStreamPtr.Null
    queuedBytes -= playback.ByteCount
    voices.Remove(playback)
  }
}
