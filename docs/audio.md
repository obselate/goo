# Optional audio

```gsharp
using let file = File.OpenRead("notification.wav")
let cue = SoundSource.LoadWav(file)
let opened = SoundPlayer.TryOpen()
let audio = opened.Player
let queued = audio?.TryPlay(cue, 0.5F)
```

Add `Goo.Audio` 0.7.54 alongside `Goo`. Types use namespace `Goo`.
Keep the player at application scope.

| Operation | Contract |
| --- | --- |
| Open and dispose | Use the UI thread, after `Window.ConfigureApplication` if used. Owners share the default platform output. |
| `TryOpen().Status` | `Opened`, `Unsupported`, `SubsystemUnavailable`, or `DeviceUnavailable`. Only `Opened` carries a player. |
| `TryPlay().Status` | `Queued`, `VoiceLimit`, `QueueBudget`, or `NativeFailure`. Only `Queued` carries playback. |
| `SoundPlayback.Gain` | Set live gain in [0, 1]. Non-finite or out-of-range gain throws. |
| `Pause()` / `Resume()` | Retain queued frames while paused, then continue. |
| `Status` | `Playing`, `Paused`, `Completed`, `Stopped`, `SourceFailure`, or `NativeFailure`. A query reclaims finished streams. |
| `Stop()` | Release one stream. Device buffering can briefly outlast control changes. |
| `StopAll()` / player disposal | Stop only this owner's playback. |

All operations except open and dispose are thread-safe. Invalid arguments and
disposed-owner play calls throw. Completion means drained queues, not exact audible timing.

## Sources

| Source | Limits and formats |
| --- | --- |
| Immutable `SoundSource` | Mono/stereo float PCM, 8000 through 192000 Hz, up to 30 seconds and 16 MiB. |
| `LoadWav` / `FromWav` | Unsigned 8-bit PCM, signed 16/24-bit PCM, 32-bit float, and WAVE_FORMAT_EXTENSIBLE carrying these formats. |
| WAV input | Check the 16 MiB encoded limit before allocation. Caller-owned streams stay open. |
| Samples | Clamp finite values to [-1, 1]. Non-finite input throws. |
| `SoundStreamSource(sampleRate, channels, read)` | Pull interleaved float frames on the audio thread. Streams have no duration limit. |
| Shared queue | 16 voices and 32 MiB of cue data or reserved stream buffers. |

- The reader gets a reusable 1024-frame buffer and a requested frame count.
- Return frames written. Zero means permanent end. Short reads continue on the next request.
- Do not retain the buffer, block, call playback controls, or access UI state.
- Invalid counts, non-finite samples, and reader exceptions become `SourceFailure`.
- Consumer code owns compressed decoders, decoder synchronization, looping, seek, and stereo pan.
- Android uses AAudio without SDL. Desktop uses SDL.
- Applications own mute and notification policy. System sounds and output-device selection are not included.
