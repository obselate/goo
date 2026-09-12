using System;
using System.IO;
using System.Text;
using Goo;
using Xunit;

public sealed class SoundSourceTests
{
    [Fact]
    public void PcmSourceCopiesSamplesAndReportsFrameDuration()
    {
        float[] samples = [-1, 1, 0.25f, -0.25f];
        var source = new SoundSource(8000, 2, samples);
        samples[0] = 0;
        Assert.Equal(-1, source.Samples[0]);
        Assert.Equal(2.0 / 8000, source.DurationSeconds);
        Assert.Equal(2, source.Channels);
        Assert.Equal(8000, source.SampleRate);
    }

    [Theory]
    [InlineData(float.NaN)]
    [InlineData(float.PositiveInfinity)]
    [InlineData(-1.01f)]
    [InlineData(1.01f)]
    public void PcmRejectsNonNormalizedSamples(float value) =>
        Assert.Throws<ArgumentOutOfRangeException>(() => new SoundSource(8000, 1, [value]));

    [Fact]
    public void PcmRejectsInvalidFormatsPartialFramesAndExcessiveDuration()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => new SoundSource(0, 1, [0]));
        Assert.Throws<ArgumentOutOfRangeException>(() => new SoundSource(8000, 3, [0, 0, 0]));
        Assert.Throws<ArgumentOutOfRangeException>(() => new SoundSource(8000, 2, [0]));
        Assert.Throws<ArgumentOutOfRangeException>(() => new SoundSource(8000, 1, []));
        Assert.Throws<ArgumentOutOfRangeException>(() => new SoundSource(8000, 1, new float[240001]));
    }

    [Fact]
    public void WavDecodesUnsignedEightBitWithOddChunkPadding()
    {
        using var stream = new MemoryStream(Wav(8, 1, [0, 128, 255]));
        var source = SoundSource.LoadWav(stream);
        Assert.True(stream.CanRead);
        Assert.Equal(new float[] { -1, 0, 127f / 128 }, source.Samples);
    }

    [Fact]
    public void WavDecodesSignedSixteenBitStereo()
    {
        var source = SoundSource.FromWav(Wav(16, 2, [0, 128, 255, 127, 0, 0, 0, 192]));
        Assert.Equal(new float[] { -1, 32767f / 32768, 0, -0.5f }, source.Samples);
        Assert.Equal(2, source.Channels);
    }

    [Fact]
    public void WavRejectsTruncationInvalidAlignmentAndUnsupportedEncoding()
    {
        var wav = Wav(16, 1, [0, 0]);
        Assert.Throws<InvalidDataException>(() => SoundSource.FromWav(wav[..^1]));
        wav[32] = 1;
        Assert.Throws<InvalidDataException>(() => SoundSource.FromWav(wav));
        wav = Wav(16, 1, [0, 0]);
        wav[20] = 3;
        Assert.Throws<NotSupportedException>(() => SoundSource.FromWav(wav));
        Assert.Throws<InvalidDataException>(() => SoundSource.FromWav(Wav(16, 2, [0, 0])));
    }

    [Fact]
    public void WavRejectsOversizedChunkClaimsBeforeAllocatingPcm()
    {
        var wav = Wav(8, 1, [128]);
        Array.Fill(wav, (byte)255, 40, 4);
        Assert.Throws<InvalidDataException>(() => SoundSource.FromWav(wav));
    }

    private static byte[] Wav(ushort bits, ushort channels, byte[] pcm)
    {
        using var stream = new MemoryStream();
        using var writer = new BinaryWriter(stream, Encoding.UTF8, leaveOpen: true);
        writer.Write("RIFF"u8);
        writer.Write(36 + pcm.Length + pcm.Length % 2);
        writer.Write("WAVEfmt "u8);
        writer.Write(16);
        writer.Write((ushort)1);
        writer.Write(channels);
        writer.Write(8000);
        writer.Write(8000 * channels * bits / 8);
        writer.Write((ushort)(channels * bits / 8));
        writer.Write(bits);
        writer.Write("data"u8);
        writer.Write(pcm.Length);
        writer.Write(pcm);
        if (pcm.Length % 2 != 0) writer.Write((byte)0);
        return stream.ToArray();
    }
}
