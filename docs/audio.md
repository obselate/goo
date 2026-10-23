# Optional audio

Add `Goo.Audio` 0.7.54 alongside `Goo`. Types remain in namespace `Goo`.
Core Goo has no sound API. The package uses Goo's desktop SDL runtime.

```gsharp
using let file = File.OpenRead("notification.wav")
let cue = SoundSource.LoadWav(file)
let opened = SoundPlayer.TryOpen()
let audio = opened.Player
let queued = audio?.TryPlay(cue, 0.5F)
```

Keep the player at application scope. Open and dispose on the UI thread,
after `Window.ConfigureApplication` if used. Owners share the default device.
Other operations are thread-safe. `TryOpen().Status` reports `Opened`,
`Unsupported`, `SubsystemUnavailable` or `DeviceUnavailable`.
`TryPlay().Status` reports `Queued`, `VoiceLimit`, `QueueBudget` or `NativeFailure`.
Only success carries a player or playback. Argument and disposed-owner errors throw.

Immutable cues accept mono/stereo float PCM at 8000 through 192000 Hz,
up to 30 seconds and 16 MiB. Finite samples clamp to [-1, 1]. Non-finite input
throws. WAV supports unsigned 8-bit, signed 16/24-bit PCM, 32-bit float and
WAVE_FORMAT_EXTENSIBLE carrying these formats. The 16 MiB encoded limit is
checked before allocation. Caller-owned input streams stay open.
No compressed decoders are included.

`SoundPlayback.Gain` changes live gain in [0, 1]. `Pause()` retains queued data,
`Resume()` continues it, and `Stop()` releases it. `Status` distinguishes
`Playing`, `Paused`, `Completed`, `Stopped`, `SourceFailure` and `NativeFailure`.
Querying status reclaims finished streams. Device buffering can briefly outlast
control changes. Completion means the queue drained, not an exact audible clock.
`StopAll()` and disposal affect only the owner's playback.

`SoundStreamSource(sampleRate, channels, read)` lets a consumer decoder fill
interleaved float frames on the audio thread. The reader receives a reusable
1024-frame buffer and the requested frame count. Return the frames written,
or zero for permanent end. Short reads continue on the next request.
Do not retain the buffer, block, call playback controls or access UI state.
Invalid counts, non-finite samples and reader exceptions become `SourceFailure`.
Consumer code owns decoder synchronization, looping, seek and stereo pan.
There is no duration limit for streams. The shared budget is 16 voices and
32 MiB of queued cue data or reserved stream buffers.

Applications own mute and notification policy. There are no built-in media
controls, system sounds, output-device selection or Android backend.
