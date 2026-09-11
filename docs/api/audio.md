# Audio API

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/Audio`](../../Goo/Audio)

## `SoundPlayback`

Source:

- [`SoundPlayer.gs`](../../Goo/Audio/SoundPlayer.gs)

Controls one queued cue. Native device buffering can outlast a stop briefly.

### `Dispose`

Stops this cue and releases its stream.

### `Stop`

Stops this cue and releases its stream. Safe after completion or owner disposal.

### `IsPlaying`

Reports whether PCM remains queued; this is not an exact audible-completion clock.

## `SoundPlayer`

Source:

- [`SoundPlayer.gs`](../../Goo/Audio/SoundPlayer.gs)

Owns an application's UI cues using a process-shared default audio device. Open and dispose on the UI thread after ConfigureApplication, if used. Playback and stop calls are thread-safe and do not depend on window frames.

### `Dispose`

Stops this owner's cues and releases its device reference on the UI thread. The last owner closes the shared device. Repeated disposal is harmless.

### `Play(SoundSource,float32)`

Queues a prepared cue with gain from zero through one, without waiting for playback. Cues overlap. Returns nil if the shared 16-voice/32-MiB queue budget is full or the native stream cannot be queued. Throws after disposal or for invalid input. Completed streams are reclaimed on the next play, status query, stop, or disposal.

### `StopAll`

Stops all cues belonging to this owner, leaving other owners' playback intact.

### `TryOpen`

Opens an audio owner, or returns nil if desktop audio/device initialization fails. Multiple owners share one device; missing audio does not affect Goo windows.

## `SoundSource`

Source:

- [`SoundSource.gs`](../../Goo/Audio/SoundSource.gs)

Owns immutable interleaved mono or stereo PCM for a short UI cue. Prepare sources outside input/render callbacks. Sources are limited to 30 seconds, 16 MiB of float PCM, and sample rates from 8000 to 192000 Hz.

### `new(int32,int32,float32[])`

Copies finite normalized samples in the range -1 through 1.

### `FromWav(System.Byte[])`

Decodes a bounded PCM WAV buffer into an immutable reusable cue. Supports unsigned 8-bit and signed 16-bit little-endian mono/stereo PCM.

### `LoadWav(System.IO.Stream)`

Reads a bounded PCM WAV from a caller-owned stream, which remains open. Supports unsigned 8-bit and signed 16-bit little-endian mono/stereo PCM. Throws for malformed, oversized, truncated, or unsupported input.

### `Channels`

Gets the channel count: one for mono or two for stereo.

### `DurationSeconds`

Gets the cue duration in seconds.

### `SampleRate`

Gets the number of sample frames per second.
