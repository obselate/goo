package GooAudioSmoke

import System
import System.Collections.Generic
import System.Diagnostics
import System.Threading
import Goo

func Require(value bool, message string) {
  if !value { throw InvalidOperationException(message) }
}

let opened = SoundPlayer.TryOpen()
if Environment.GetEnvironmentVariable("GOO_AUDIO_UNAVAILABLE_SMOKE") == "1" {
  Require(opened == nil, "Unavailable audio unexpectedly opened")
  Console.WriteLine("audio-unavailable: optional_device=verified")
  return
}
guard let first = opened else { throw InvalidOperationException("First audio owner did not open") }
using let firstOwner = first
guard let second = SoundPlayer.TryOpen() else { throw InvalidOperationException("Second audio owner did not open") }
using let secondOwner = second
let cue = SoundSource(8000, 1, [80000]float32)
guard let firstCue = first.Play(cue), let secondCue = second.Play(cue) else {
  throw InvalidOperationException("Overlapping playback did not queue")
}
first.Dispose()
Require(!firstCue.IsPlaying && secondCue.IsPlaying, "Disposing one owner affected another owner")
let remaining = List[SoundPlayback]()
for i in 0 ... 15 {
  guard let voice = second.Play(cue) else { throw InvalidOperationException("Voice budget was exhausted early") }
  remaining.Add(voice)
}
Require(second.Play(cue) == nil, "Voice budget was not enforced")
second.StopAll()
Require(!secondCue.IsPlaying, "StopAll did not stop the first overlapping cue")
for voice in remaining { Require(!voice.IsPlaying, "StopAll left an overlapping cue queued") }
guard let shortCue = second.Play(SoundSource(8000, 1, [160]float32)) else {
  throw InvalidOperationException("Stopped voice budget was not reclaimed")
}
let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 3
while shortCue.IsPlaying && Stopwatch.GetTimestamp() < deadline { Thread.Sleep(5) }
Require(!shortCue.IsPlaying, "Audio did not progress independently of window frames")
second.Dispose()
shortCue.Stop()
using let reopened = SoundPlayer.TryOpen()
Require(reopened != nil, "Audio device did not reopen after the last owner disposed")
Console.WriteLine("audio: shared_owners=2 overlap=16 budget=verified stop=verified idle_progress=verified reopen=verified")
