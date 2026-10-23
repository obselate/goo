# Audio API

Generated from `Goo.Audio.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo.Audio/Audio`](../../Goo.Audio/Audio)

## `SoundOpenResult`

Source:

- [`SoundPlayer.gs`](../../Goo.Audio/Audio/SoundPlayer.gs)

Contains an open outcome and a player only when Opened.

### `Player`

Gets the owner when audio opened.

### `Status`

Gets the device-open outcome.

## `SoundOpenStatus`

Source:

- [`SoundPlayer.gs`](../../Goo.Audio/Audio/SoundPlayer.gs)

Describes whether the optional default audio device opened.

### Values

- `Opened`
- `Unsupported`
- `SubsystemUnavailable`
- `DeviceUnavailable`

## `SoundPlayResult`

Source:

- [`SoundPlayer.gs`](../../Goo.Audio/Audio/SoundPlayer.gs)

Contains a queue outcome and playback only when Queued.

### `Playback`

Gets the queued playback.

### `Status`

Gets the queue outcome.

## `SoundPlayStatus`

Source:

- [`SoundPlayer.gs`](../../Goo.Audio/Audio/SoundPlayer.gs)

Describes whether a playback entered the bounded queue.

### Values

- `Queued`
- `VoiceLimit`
- `QueueBudget`
- `NativeFailure`

## `SoundPlayback`

Source:

- [`SoundPlayer.gs`](../../Goo.Audio/Audio/SoundPlayer.gs)

Controls one playback. Device buffering can briefly outlast a stop or control change.

### `Dispose`

Stops playback and releases its stream.

### `Pause`

Pauses consumption without discarding queued frames. Safe after completion or stop.

### `Resume`

Resumes paused consumption. Safe after completion or stop.

### `Stop`

Stops playback and releases its stream. Safe after owner disposal.

### `Gain`

Gets or sets live gain from zero through one. Non-finite or out-of-range gain throws. Setting gain after completion or stop has no effect.

### `Status`

Gets progress and reclaims finished playback. Paused is not completion.

## `SoundPlaybackStatus`

Source:

- [`SoundPlayer.gs`](../../Goo.Audio/Audio/SoundPlayer.gs)

Describes playback progress, including terminal source and native failures.

### Values

- `Playing`
- `Paused`
- `Completed`
- `Stopped`
- `SourceFailure`
- `NativeFailure`

## `SoundPlayer`

Source:

- [`SoundPlayer.gs`](../../Goo.Audio/Audio/SoundPlayer.gs)

Owns cues and streams on a process-shared default device. Open and dispose on the UI thread. Configure application metadata before opening audio. Other operations are thread-safe.

### `Dispose`

Stops owned playback and releases the shared device on the UI thread. Repeated disposal is harmless.

### `StopAll`

Stops only this owner's playback.

### `TryOpen`

Opens an optional desktop device with an explicit failure reason.

### `TryPlay(SoundSource,float32)`

Queues an immutable cue with initial gain from zero through one. The shared budget is 16 voices and 32 MiB. Throws for invalid arguments or a disposed owner.

### `TryPlay(SoundStreamSource,float32)`

Pulls interleaved frames on the audio thread using a bounded 1024-frame buffer. Each playback has its own buffer. The consumer owns decoder state and synchronization.

## `SoundSource`

Source:

- [`SoundSource.gs`](../../Goo.Audio/Audio/SoundSource.gs)

Owns immutable interleaved mono or stereo PCM for a short UI cue. Prepare outside input/render callbacks. Limits: 30 seconds, 16 MiB of float PCM, 8000 through 192000 Hz.

### `new(int32,int32,float32[])`

Copies finite samples and clamps them to -1 through 1. Non-finite input throws.

### `FromWav(System.Byte[])`

Decodes 8/16/24-bit PCM or 32-bit float RIFF WAV, including EXTENSIBLE, within 16 MiB. Finite samples are clamped. Non-finite float samples throw.

### `LoadWav(System.IO.Stream)`

Reads a RIFF WAV, leaving the caller's stream open. Checks the 16 MiB limit before allocation. Supports 8/16/24-bit PCM and 32-bit float, including WAVE_FORMAT_EXTENSIBLE. Throws for malformed, oversized, truncated or unsupported input.

### `Channels`

Gets one for mono or two for stereo.

### `DurationSeconds`

Gets cue duration in seconds.

### `SampleRate`

Gets sample frames per second.

## `SoundStreamSource`

Source:

- [`SoundPlayer.gs`](../../Goo.Audio/Audio/SoundPlayer.gs)

Supplies mono or stereo frames for consumer decoders, synthesis, looping, seeking or channel mixing.

### `new(int32,int32,System.Func{float32[],int32,int32})`

Retains a reader called on the audio thread with a reusable buffer and requested frame count. Return the frames written, zero for permanent end. Short reads continue on the next request. Write only the requested interleaved frames. Do not retain the buffer, block, call playback controls, or perform UI work. Exceptions, invalid counts and non-finite samples end playback with SourceFailure. Finite samples are clamped. Coordinate decoder changes outside the callback without blocking it.

### `Channels`

Gets the interleaved channel count, one or two.

### `SampleRate`

Gets frames per second, from 8000 through 192000.
