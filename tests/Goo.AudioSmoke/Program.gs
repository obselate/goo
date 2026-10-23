package GooAudioSmoke

import Goo
import Hexa.NET.SDL3
import System
import System.Collections.Generic
import System.Diagnostics
import System.IO
import System.Threading

internal class Reader {
    internal var Reads int32
    internal var ThreadId int32

    internal func Read(buffer[]float32, frames int32) int32 {
        Interlocked.Exchange(&ThreadId, Environment.CurrentManagedThreadId)
        Require(buffer.Length == 2048 && frames > 0 && frames <= 1024, "Streaming buffer is not bounded")
        if Interlocked.Increment(&Reads) > 3 {
            return 0
        }
        let written = Math.Min(frames, 80)
        for i in 0 ... written * 2 {
            buffer[i] = if i % 2 == 0 {
                -2.0F
            } else {
                2.0F
            }
        }
        return written
    }
}

func Require(value bool, message string) {
    if !value {
        throw InvalidOperationException(message)
    }
}

func Play(player SoundPlayer, source SoundSource) SoundPlayback {
    let result = player.TryPlay(source)
    Require(
        result.Status == SoundPlayStatus.Queued,
        "Cue did not queue: " + result.Status.ToString() + " " + SDL.GetErrorS()
    )
    guard let playback = result.Playback else {
        throw InvalidOperationException("Queued result has no playback")
    }
    return playback
}

func Finish(playback SoundPlayback, expected SoundPlaybackStatus) {
    let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 5
    while playback.Status == SoundPlaybackStatus.Playing && Stopwatch.GetTimestamp() < deadline {
        Thread.Sleep(5)
    }
    Require(playback.Status == expected, "Playback did not reach expected terminal status")
}

func Wav(bits int32, floating bool, extensible bool)[]uint8 {
    using let bytes = MemoryStream()
    using let writer = BinaryWriter(bytes)
    let formatSize = if extensible {
        40
    } else {
        16
    }
    let dataSize = bits / 8 * 2
    writer.Write(0x46464952u)
    writer.Write(uint32(20 + formatSize + dataSize))
    writer.Write(0x45564157u)
    writer.Write(0x20746d66u)
    writer.Write(uint32(formatSize))
    writer.Write(
        uint16(
            if extensible {
                65534
            } else if floating {
                3
            } else {
                1
            }
        )
    )
    writer.Write(uint16(1))
    writer.Write(8000u)
    writer.Write(uint32(8000 * bits / 8))
    writer.Write(uint16(bits / 8))
    writer.Write(uint16(bits))
    if extensible {
        writer.Write(uint16(22))
        writer.Write(uint16(bits))
        writer.Write(4u)
        writer.Write(
            if floating {
                3u
            } else {
                1u
            }
        )
        writer.Write(0x00100000u)
        writer.Write(0xAA000080u)
        writer.Write(0x719B3800u)
    }
    writer.Write(0x61746164u)
    writer.Write(uint32(dataSize))
    if floating {
        writer.Write(-2.0F)
        writer.Write(2.0F)
    } else if bits == 8 {
        writer.Write(uint8(0))
        writer.Write(uint8(255))
    } else if bits == 16 {
        writer.Write(int16(-32768))
        writer.Write(int16(32767))
    } else {
        writer.Write([]uint8{0, 0, 128, 255, 255, 127})
    }
    return bytes.ToArray()
}

if Environment.GetEnvironmentVariable("GOO_SYSTEM_SOUND_SMOKE") == "1" {
    let expected = Enum.Parse[SystemSoundStatus](Environment.GetEnvironmentVariable("GOO_SYSTEM_SOUND_EXPECT") ?? "Queued")
    for sound in []SystemSound{SystemSound.Click, SystemSound.Alert} {
        let status = SystemSounds.TryPlay(sound)
        Require(status == expected, "System sound status: " + status.ToString())
    }
    var rejected = false
    try {
        SystemSounds.TryPlay(SystemSound(-1))
    } catch (error ArgumentOutOfRangeException) {
        rejected = true
    }
    Require(rejected, "Invalid system sound was accepted")
    Console.WriteLine("system-sounds: platform status=" + expected.ToString() + " invalid-value rejected")
    return
}

let opened = SoundPlayer.TryOpen()
if Environment.GetEnvironmentVariable("GOO_AUDIO_UNAVAILABLE_SMOKE") == "1" {
    Require(
        opened.Status == SoundOpenStatus.SubsystemUnavailable && opened.Player == nil,
        "Unavailable driver did not report subsystem failure"
    )
    Console.WriteLine("audio-unavailable: status=SubsystemUnavailable player=nil")
    return
}
Require(opened.Status == SoundOpenStatus.Opened, "First audio owner did not open")
guard let first = opened.Player else {
    throw InvalidOperationException("Opened result has no player")
}
using let firstOwner = first
let next = SoundPlayer.TryOpen()
Require(next.Status == SoundOpenStatus.Opened, "Second audio owner did not open")
guard let second = next.Player else {
    throw InvalidOperationException("Second opened result has no player")
}
using let secondOwner = second

let clamped = SoundSource(8000, 1, []float32{-2.0F, 2.0F})
Require(clamped.Samples[0] == -1.0F && clamped.Samples[1] == 1.0F, "PCM was not clamped")
var rejected = false
try {
    SoundSource(8000, 1, []float32{Single.NaN})
} catch (error ArgumentOutOfRangeException) {
    rejected = true
}
Require(rejected, "Non-finite PCM was accepted")
for bits in[]int32{8, 16, 24, 32} {
    for extensible in[]bool{false, true} {
        let encoded = Wav(bits, bits == 32, extensible)
        using let file = MemoryStream(encoded)
        let cue = SoundSource.LoadWav(file)
        Require(
            file.CanRead && cue.SampleRate == 8000 && cue.Channels == 1,
            "WAV load changed stream ownership or format"
        )
        let maximum = if bits == 32 {
            1.0F
        } else {
            1.0F - MathF.Pow(2.0F, float32(1 - bits))
        }
        Require(cue.Samples[0] == -1.0F && cue.Samples[1] == maximum, "WAV samples decoded incorrectly")
        Finish(Play(second, cue), SoundPlaybackStatus.Completed)
    }
}
let oversized = Wav(16, false, false)
oversized[4] = 255
oversized[5] = 255
oversized[6] = 255
oversized[7] = 127
rejected = false
try {
    using let file = MemoryStream(oversized)
    SoundSource.LoadWav(file)
} catch (error InvalidDataException) {
    rejected = true
}
Require(rejected, "Oversized WAV header was not rejected before reading its body")
using let trailing = MemoryStream()
trailing.Write(Wav(16, false, false))
trailing.WriteByte(0)
trailing.Position = 0
rejected = false
try {
    SoundSource.LoadWav(trailing)
} catch (error InvalidDataException) {
    rejected = true
}
Require(rejected && trailing.CanRead, "WAV trailing bytes were accepted or the caller stream was closed")
let nonfinite = Wav(32, true, true)
Array.Copy(BitConverter.GetBytes(Single.PositiveInfinity), 0, nonfinite, 68, 4)
rejected = false
try {
    SoundSource.FromWav(nonfinite)
} catch (error ArgumentOutOfRangeException) {
    rejected = true
}
Require(rejected, "Non-finite float WAV was accepted")

let cue = SoundSource(8000, 1, [80000]float32)
let firstCue = Play(first, cue)
let secondCue = Play(second, cue)
first.Dispose()
Require(
    firstCue.Status == SoundPlaybackStatus.Stopped && secondCue.Status == SoundPlaybackStatus.Playing,
    "Disposing one owner affected another owner"
)
secondCue.Gain = 0.25F
Require(secondCue.Gain == 0.25F, "Live gain did not change while playing")
secondCue.Pause()
Thread.Sleep(50)
Require(secondCue.Status == SoundPlaybackStatus.Paused, "Pause discarded playback")
secondCue.Gain = 0.75F
secondCue.Resume()
Require(
    secondCue.Status == SoundPlaybackStatus.Playing && secondCue.Gain == 0.75F,
    "Resume did not preserve gain and queued data"
)
let remaining = List[SoundPlayback]()
for i in 0 ... 15 {
    remaining.Add(Play(second, cue))
}
let limited = second.TryPlay(cue)
Require(limited.Status == SoundPlayStatus.VoiceLimit && limited.Playback == nil, "Voice budget was not reported")
second.StopAll()
Require(secondCue.Status == SoundPlaybackStatus.Stopped, "StopAll did not stop the overlapping cue")
for voice in remaining {
    Require(voice.Status == SoundPlaybackStatus.Stopped, "StopAll left a voice queued")
}
let large = SoundSource(192000, 2, [4000000]float32)
Play(second, large).Pause()
Play(second, large).Pause()
let budget = second.TryPlay(large)
Require(budget.Status == SoundPlayStatus.QueueBudget && budget.Playback == nil, "Queue budget was not reported")
second.StopAll()
Finish(Play(second, SoundSource(8000, 1, [160]float32)), SoundPlaybackStatus.Completed)
let paused = Play(second, SoundSource(8000, 1, [8000]float32))
paused.Pause()
Thread.Sleep(1100)
Require(paused.Status == SoundPlaybackStatus.Paused, "Paused frames were consumed")
paused.Resume()
Finish(paused, SoundPlaybackStatus.Completed)

let reader = Reader()
let mainThread = Environment.CurrentManagedThreadId
let source = SoundStreamSource(8000, 2, reader.Read)
let streamed = second.TryPlay(source)
Require(streamed.Status == SoundPlayStatus.Queued, "Streaming source did not queue")
guard let stream = streamed.Playback else {
    throw InvalidOperationException("Stream result has no playback")
}
Finish(stream, SoundPlaybackStatus.Completed)
Require(
    reader.Reads == 4 && reader.ThreadId != mainThread,
    "Streaming source was not pulled to end on the audio thread"
)
let broken = SoundStreamSource(
    8000,
    1,
    (buffer[]float32, frames int32) -> {
        throw InvalidOperationException("Consumer decoder failure")
        return 0
    }
)
guard let failed = second.TryPlay(broken).Playback else {
    throw InvalidOperationException("Failed source did not queue")
}
Finish(failed, SoundPlaybackStatus.SourceFailure)
second.Dispose()
stream.Stop()
using let outputs = SoundPlayer.EnumerateOutputDevices()
Require(outputs.Status == SoundDeviceStatus.Enumerated && outputs.Devices.Count > 0, "Output enumeration failed")
let output = outputs.Devices[0]
Require(output.Name.Length > 0, "Output has no name")
guard let selected = SoundPlayer.TryOpen(output).Player else {
    throw InvalidOperationException("Selected output did not open")
}
using let selectedOwner = selected
guard let sameOutput = SoundPlayer.TryOpen(output).Player else {
    throw InvalidOperationException("Selected output did not share")
}
Require(Object.ReferenceEquals(selected.Backend, sameOutput.Backend), "Selected output owners did not share a device")
sameOutput.Dispose()
outputs.Dispose()
Finish(Play(selected, SoundSource(8000, 1, [160]float32)), SoundPlaybackStatus.Completed)
rejected = false
try {
    SoundPlayer.TryOpen(output)
} catch (error ObjectDisposedException) {
    rejected = true
}
Require(rejected, "A disposed output list still accepted opens")
selected.Dispose()
let reopened = SoundPlayer.TryOpen()
Require(reopened.Status == SoundOpenStatus.Opened, "Device did not reopen after last owner disposed")
reopened.Player?.Dispose()
Console.WriteLine(
    "audio: statuses clamping wav gain pause overlap budgets stream-end source-failure reopen output-selection verified"
)
