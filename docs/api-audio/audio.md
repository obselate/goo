# Audio API

Generated from `Goo.Audio.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo.Audio/Audio`](../../Goo.Audio/Audio)

## `SoundDeviceStatus`

Source:

- [`SoundOutputDevices.gs`](../../Goo.Audio/Audio/SoundOutputDevices.gs)

Describes output-device enumeration on the current platform.

### Values

- `Enumerated`
- `Unsupported`
- `SubsystemUnavailable`
- `NativeFailure`

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

Describes whether the optional audio output opened.

### Values

- `Opened`
- `Unsupported`
- `SubsystemUnavailable`
- `DeviceUnavailable`

## `SoundOutputDevice`

Source:

- [`SoundOutputDevices.gs`](../../Goo.Audio/Audio/SoundOutputDevices.gs)

Identifies one connected output within an undisposed device list.

### `Name`

Gets the platform display name. Different outputs can have the same name.

## `SoundOutputDevices`

Source:

- [`SoundOutputDevices.gs`](../../Goo.Audio/Audio/SoundOutputDevices.gs)

Owns an output snapshot and its SDL subsystem reference. Dispose on the UI thread. Open a chosen device before disposing this list. Open players keep their own device reference.

### `Dispose`

Releases this snapshot's native subsystem reference. Existing players are not stopped.

### `Devices`

Gets the output snapshot. Device entries cannot be retained for opening after this list is disposed.

### `Status`

Gets the enumeration outcome. Only Enumerated can carry devices.

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

Owns cues and streams on a process-shared output device. Open and dispose on the UI thread. Configure application metadata before opening audio. Other operations are thread-safe.

### `Dispose`

Stops owned playback and releases the shared device on the UI thread. Repeated disposal is harmless.

### `EnumerateOutputDevices`

Enumerates desktop SDL outputs on the UI thread. Dispose the returned list after opening a choice. Unsupported platforms return Unsupported with an empty list.

### `StopAll`

Stops only this owner's playback.

### `TryOpen`

Opens an optional platform audio device with an explicit failure reason.

### `TryOpen(SoundOutputDevice)`

Opens an output from an undisposed enumeration on the UI thread. An unplugged device returns DeviceUnavailable. Nil or disposed-list arguments throw.

### `TryPlay(SoundSource,float32)`

Queues an immutable cue with initial gain from zero through one. Each shared output budget is 16 voices and 32 MiB. Throws for invalid arguments or a disposed owner.

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

## `SystemSound`

Source:

- [`SystemSounds.gs`](../../Goo.Audio/Audio/SystemSounds.gs)

Identifies a platform UI sound, not an application audio cue.

### Values

- `Click`
- `Alert`

## `SystemSoundStatus`

Source:

- [`SystemSounds.gs`](../../Goo.Audio/Audio/SystemSounds.gs)

Describes whether the platform accepted a system sound request.

### Values

- `Queued`
- `Unsupported`
- `NativeFailure`

## `SystemSounds`

Source:

- [`SystemSounds.gs`](../../Goo.Audio/Audio/SystemSounds.gs)

Plays optional UI feedback through platform sound APIs without opening a SoundPlayer.

### `TryPlay(SystemSound)`

Requests a platform click or alert. Queued does not guarantee audible output. Android and unavailable platform APIs return Unsupported. Invalid sound values throw.
