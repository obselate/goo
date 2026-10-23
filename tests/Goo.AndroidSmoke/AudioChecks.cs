using Android.App;
using Android.OS;
using System.Diagnostics;
using Goo;
using Environment = System.Environment;

namespace GooAndroidSmokeApp;

[Instrumentation(Name = "org.goo.androidsmoke.AudioChecks", TargetPackage = "org.goo.androidsmoke")]
public sealed class AudioChecks : Instrumentation
{
    public AudioChecks() { }

    public AudioChecks(IntPtr handle, global::Android.Runtime.JniHandleOwnership ownership) : base(handle, ownership) { }

    public override void OnCreate(Bundle? arguments)
    {
        base.OnCreate(arguments);
        Start();
    }

    public override void OnStart()
    {
        var result = new Bundle();
        try
        {
            Run();
            result.PutString("stream", "GOO_AUDIO_PASS: AAudio cue stream gain pause stop owners budgets source-failure reopen\n");
            Finish(Result.Ok, result);
        }
        catch (Exception error)
        {
            result.PutString("stream", "GOO_AUDIO_FAIL: " + error + "\n");
            Finish(Result.Canceled, result);
        }
    }

    private static void Run()
    {
        Require(SystemSounds.TryPlay(SystemSound.Alert) == SystemSoundStatus.Unsupported, "Android system sound status");
        using var outputs = SoundPlayer.EnumerateOutputDevices();
        Require(outputs.Status == SoundDeviceStatus.Unsupported && outputs.Devices.Count == 0,
            "Android output selection status");
        using var first = Open();
        using var second = Open();
        var cue = new SoundSource(8000, 1, new float[80000]);
        var owned = Play(first, cue);
        var other = Play(second, cue);
        first.Dispose();
        Require(owned.Status == SoundPlaybackStatus.Stopped && other.Status == SoundPlaybackStatus.Playing,
            "Owner disposal changed another owner");
        other.Gain = 0.25f;
        other.Pause();
        Thread.Sleep(80);
        Require(other.Status == SoundPlaybackStatus.Paused && other.Gain == 0.25f, "Pause or gain failed");
        other.Gain = 0.75f;
        other.Resume();
        Require(other.Status == SoundPlaybackStatus.Playing && other.Gain == 0.75f, "Resume failed");
        for (var i = 0; i < 15; i++)
            Play(second, cue).Pause();
        Require(second.TryPlay(cue).Status == SoundPlayStatus.VoiceLimit, "Voice limit failed");
        second.StopAll();
        Require(other.Status == SoundPlaybackStatus.Stopped, "StopAll failed");
        var large = new SoundSource(192000, 2, new float[4000000]);
        Play(second, large).Pause();
        Play(second, large).Pause();
        Require(second.TryPlay(large).Status == SoundPlayStatus.QueueBudget, "Queue budget failed");
        second.StopAll();
        Finish(Play(second, new SoundSource(8000, 1, new float[160])), SoundPlaybackStatus.Completed);
        var paused = Play(second, new SoundSource(8000, 1, new float[8000]));
        paused.Pause();
        Thread.Sleep(1100);
        Require(paused.Status == SoundPlaybackStatus.Paused, "Paused cue completed");
        paused.Resume();
        Finish(paused, SoundPlaybackStatus.Completed);
        var reads = 0;
        var caller = Environment.CurrentManagedThreadId;
        var readerThread = caller;
        var source = new SoundStreamSource(8000, 2, (buffer, frames) =>
        {
            readerThread = Environment.CurrentManagedThreadId;
            Require(buffer.Length == 2048 && frames > 0 && frames <= 1024, "Unbounded pull");
            if (++reads > 3)
                return 0;
            var count = Math.Min(80, frames);
            for (var i = 0; i < count * 2; i++)
                buffer[i] = i % 2 == 0 ? -2 : 2;
            return count;
        });
        Finish(second.TryPlay(source).Playback ?? throw new InvalidOperationException("Stream not queued"),
            SoundPlaybackStatus.Completed);
        Require(reads == 4 && caller != readerThread, "Pull did not run to end on audio thread");
        foreach (var invalid in new[] { -1, 1025, 0 })
        {
            var broken = new SoundStreamSource(8000, 1, (buffer, frames) =>
            {
                if (invalid == 0)
                {
                    buffer[0] = float.NaN;
                    return 1;
                }
                return invalid;
            });
            Finish(second.TryPlay(broken).Playback ?? throw new InvalidOperationException("Broken source not queued"),
                SoundPlaybackStatus.SourceFailure);
        }
        var throws = new SoundStreamSource(8000, 1, (_, _) => throw new InvalidOperationException("Reader failed"));
        Finish(second.TryPlay(throws).Playback ?? throw new InvalidOperationException("Throwing source not queued"),
            SoundPlaybackStatus.SourceFailure);
        second.Dispose();
        using var reopened = Open();
    }

    private static SoundPlayer Open()
    {
        var result = SoundPlayer.TryOpen();
        Require(result.Status == SoundOpenStatus.Opened, "Open failed: " + result.Status);
        return result.Player ?? throw new InvalidOperationException("Opened player missing");
    }

    private static SoundPlayback Play(SoundPlayer player, SoundSource source)
    {
        var result = player.TryPlay(source);
        Require(result.Status == SoundPlayStatus.Queued, "Play failed: " + result.Status);
        return result.Playback ?? throw new InvalidOperationException("Queued playback missing");
    }

    private static void Finish(SoundPlayback playback, SoundPlaybackStatus expected)
    {
        var deadline = Stopwatch.StartNew();
        while (playback.Status == SoundPlaybackStatus.Playing && deadline.Elapsed < TimeSpan.FromSeconds(8))
            Thread.Sleep(5);
        Require(playback.Status == expected, "Expected " + expected + ", got " + playback.Status);
    }

    private static void Require(bool value, string message)
    {
        if (!value)
            throw new InvalidOperationException(message);
    }
}
