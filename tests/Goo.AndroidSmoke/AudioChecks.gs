package GooAndroidSmokeApp

import Android.App
import Android.OS
import Android.Runtime
import Environment = System.Environment
import Goo
import System
import System.Diagnostics
import System.Threading

@Instrumentation(Name = "org.goo.androidsmoke.AudioChecks", TargetPackage = "org.goo.androidsmoke")
class AudioChecks : Instrumentation {
    init() { }

    init(handle nint, ownership JniHandleOwnership) : base(handle, ownership) { }

    override func OnCreate(arguments Bundle?) {
        base.OnCreate(arguments)
        Start()
    }

    override func OnStart() {
        let result = Bundle()
        try {
            Run()
            result.PutString(
                "stream",
                "GOO_AUDIO_PASS: AAudio cue stream gain pause stop owners budgets source-failure reopen\n"
            )
            base.Finish(Result.Ok, result)
        } catch (error Exception) {
            result.PutString("stream", "GOO_AUDIO_FAIL: " + error.ToString() + "\n")
            base.Finish(Result.Canceled, result)
        }
    }

    shared {
        private func Run() {
            Require(
                SystemSounds.TryPlay(SystemSound.Alert) == SystemSoundStatus.Unsupported,
                "Android system sound status"
            )
            using let outputs = SoundPlayer.EnumerateOutputDevices()
            Require(
                outputs.Status == SoundDeviceStatus.Unsupported && outputs.Devices.Count == 0,
                "Android output selection status"
            )
            using let first = Open()
            using let second = Open()
            let cue = SoundSource(8000, 1, [80000]float32)
            let owned = Play(first, cue)
            let other = Play(second, cue)
            first.Dispose()
            Require(
                owned.Status == SoundPlaybackStatus.Stopped && other.Status == SoundPlaybackStatus.Playing,
                "Owner disposal changed another owner"
            )
            other.Gain = 0.25f
            other.Pause()
            Thread.Sleep(80)
            Require(other.Status == SoundPlaybackStatus.Paused && other.Gain == 0.25f, "Pause or gain failed")
            other.Gain = 0.75f
            other.Resume()
            Require(other.Status == SoundPlaybackStatus.Playing && other.Gain == 0.75f, "Resume failed")
            for var i = 0; i < 15; i++ {
                Play(second, cue).Pause()
            }
            Require(second.TryPlay(cue).Status == SoundPlayStatus.VoiceLimit, "Voice limit failed")
            second.StopAll()
            Require(other.Status == SoundPlaybackStatus.Stopped, "StopAll failed")
            let large = SoundSource(192000, 2, [4000000]float32)
            Play(second, large).Pause()
            Play(second, large).Pause()
            Require(second.TryPlay(large).Status == SoundPlayStatus.QueueBudget, "Queue budget failed")
            second.StopAll()
            Finish(Play(second, SoundSource(8000, 1, [160]float32)), SoundPlaybackStatus.Completed)
            let paused = Play(second, SoundSource(8000, 1, [8000]float32))
            paused.Pause()
            Thread.Sleep(1100)
            Require(paused.Status == SoundPlaybackStatus.Paused, "Paused cue completed")
            paused.Resume()
            Finish(paused, SoundPlaybackStatus.Completed)
            var reads = 0
            let caller = Environment.CurrentManagedThreadId
            var readerThread = caller
            let reader Func[[]float32, int32, int32] = (buffer[]float32, frames int32) -> {
                readerThread = Environment.CurrentManagedThreadId
                Require(buffer.Length == 2048 && frames > 0 && frames <= 1024, "Unbounded pull")
                if (reads += 1) > 3 {
                    return 0
                }
                let count = Math.Min(80, frames)
                for var i = 0; i < count * 2; i++ {
                    buffer[i] = if i % 2 == 0 {
                        -2.0f
                    } else {
                        2.0f
                    }
                }
                return count
            }
            let source = SoundStreamSource(8000, 2, reader)
            Finish(
                second.TryPlay(source).Playback ?? throw InvalidOperationException("Stream not queued"),
                SoundPlaybackStatus.Completed
            )
            Require(reads == 4 && caller != readerThread, "Pull did not run to end on audio thread")
            for invalid in[]int32{-1, 1025, 0} {
                let brokenReader Func[[]float32, int32, int32] = (buffer[]float32, frames int32) -> {
                    if invalid == 0 {
                        buffer[0] = float32.NaN
                        return 1
                    }
                    return invalid
                }
                let broken = SoundStreamSource(8000, 1, brokenReader)
                Finish(
                    second.TryPlay(broken).Playback ?? throw InvalidOperationException("Broken source not queued"),
                    SoundPlaybackStatus.SourceFailure
                )
            }
            let throws = SoundStreamSource(
                8000,
                1,
                (_[]float32, _ int32) -> throw InvalidOperationException("Reader failed")
            )
            Finish(
                second.TryPlay(throws).Playback ?? throw InvalidOperationException("Throwing source not queued"),
                SoundPlaybackStatus.SourceFailure
            )
            second.Dispose()
            using let reopened = Open()
        }

        private func Open() SoundPlayer {
            let result = SoundPlayer.TryOpen()
            Require(result.Status == SoundOpenStatus.Opened, "Open failed: " + result.Status.ToString())
            return result.Player ?? throw InvalidOperationException("Opened player missing")
        }

        private func Play(player SoundPlayer, source SoundSource) SoundPlayback {
            let result = player.TryPlay(source)
            Require(result.Status == SoundPlayStatus.Queued, "Play failed: " + result.Status.ToString())
            return result.Playback ?? throw InvalidOperationException("Queued playback missing")
        }

        private func Finish(playback SoundPlayback, expected SoundPlaybackStatus) {
            let deadline = Stopwatch.StartNew()
            while playback.Status == SoundPlaybackStatus.Playing && deadline.Elapsed < TimeSpan.FromSeconds(8) {
                Thread.Sleep(5)
            }
            Require(
                playback.Status == expected,
                "Expected " + expected.ToString() + ", got " + playback.Status.ToString()
            )
        }

        private func Require(value bool, message string) {
            if !value {
                throw InvalidOperationException(message)
            }
        }
    }
}
