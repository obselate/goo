# UI sounds

Load each cue once while preparing application assets. Share the immutable
`SoundSource` across windows. `LoadWav` accepts an ordinary file or embedded
resource stream and leaves the stream open. It supports unsigned 8-bit and
signed 16-bit PCM WAV, in mono or stereo. A consumer decoder can instead pass
normalized interleaved float samples to the `SoundSource` constructor.

```gsharp
using let file = File.OpenRead("notification.wav")
let cue = SoundSource.LoadWav(file)
using let audio = SoundPlayer.TryOpen()
// In an application callback, after checking its mute/notification policy:
audio?.Play(cue, 0.5F)
```

Prepare sources outside input callbacks and `Cell.Build`. WAV input and decoded
float PCM are each limited to 16 MiB; cues are limited to 30 seconds and sample
rates from 8000 to 192000 Hz. Invalid/truncated WAV, unsupported encodings,
incomplete PCM frames, nonfinite samples, and samples outside -1 through 1 are
rejected before playback.

Open and dispose `SoundPlayer` on the UI thread. If application metadata is
configured with `Window.ConfigureApplication`, do that first. Keep the player
at application scope and share it across windows. Multiple players also share
one default output device; the last player's disposal closes it. Opening audio
is optional: `TryOpen` returns nil when the audio subsystem/default device is
unavailable, and on unsupported targets such as Android. Window creation does
not depend on audio initialization.

`Play` copies the prepared PCM into a native queue and returns immediately
without waiting for playback. The audio thread converts/mixes it independently
of window frames. Cues overlap, with a process-wide limit of 16 queued streams
and 32 MiB of queued PCM. `Play` returns nil if this budget is full or a native
stream cannot be queued. Completed streams are reclaimed by the next play,
status query, stop, or owner disposal; they never accumulate beyond that limit.

Use the returned `SoundPlayback.Stop()` or `Dispose()` to stop one cue.
`SoundPlayer.StopAll()` and player disposal stop only that player's cues.
`IsPlaying` describes queued data rather than an exact audible completion time;
the device can briefly retain already-buffered sound after a stop. Play, stop,
and status calls are thread-safe. Gain is per playback and ranges from zero
through one. Applications choose their own mute, volume, and notification policy.

The implementation uses Goo's existing SDL desktop payload and .NET PCM decoder,
with no additional native dependency. The pinned Linux and macOS SDL builds
enable audio; Linux loads PulseAudio or ALSA dynamically. The native smoke runs
under SDL's dummy audio backend, including Linux and macOS NativeAOT builds.
It verifies shared lifetime,
overlap limits, stop, progress with no frame pump, and device reopening; it does
not establish speaker output quality.
