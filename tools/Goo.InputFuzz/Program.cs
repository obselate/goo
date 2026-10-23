using System.Diagnostics;
using System.Text;
using Goo;
using Goo.Svg;

var target = Environment.GetEnvironmentVariable("INPUT_TARGET") ?? throw new InvalidOperationException("INPUT_TARGET is required");
var current = Environment.GetEnvironmentVariable("INPUT_CURRENT") ?? throw new InvalidOperationException("INPUT_CURRENT is required");
if (target is not ("svg" or "raster" or "wav"))
    throw new ArgumentException("Unknown managed input target");
var seeds = Directory.GetFiles(args[0]).Select(File.ReadAllBytes).ToArray();
if (seeds.Length == 0)
    throw new InvalidOperationException("No seed fixtures");
var random = new Random(0);
var clock = Stopwatch.StartNew();
long count = 0;
foreach (var seed in seeds)
    Check(seed);
while (clock.Elapsed < TimeSpan.FromMinutes(10))
{
    var seed = seeds[random.Next(seeds.Length)];
    byte[] input;
    switch (random.Next(3))
    {
        case 0:
            input = (byte[])seed.Clone();
            if (input.Length != 0)
                input[random.Next(input.Length)] ^= (byte)random.Next(1, 256);
            break;
        case 1:
            input = seed.AsSpan(0, random.Next(seed.Length + 1)).ToArray();
            break;
        default:
            var other = seeds[random.Next(seeds.Length)];
            var split = random.Next(seed.Length + 1);
            var start = random.Next(other.Length + 1);
            input = new byte[split + other.Length - start];
            seed.AsSpan(0, split).CopyTo(input);
            other.AsSpan(start).CopyTo(input.AsSpan(split));
            break;
    }
    Check(input);
    count++;
}
Console.WriteLine($"Completed {count} generated {target} inputs in {clock.Elapsed}.");

void Check(byte[] input)
{
    try
    {
        switch (target)
        {
            case "svg":
                try { Svg.Parse(Encoding.UTF8.GetString(input)); }
                catch (SvgParseException) { }
                break;
            case "raster":
                try
                {
                    using var image = ImageSource.Decode(input, ImageDecodeLimits.Default, CancellationToken.None);
                }
                catch (InvalidDataException) { }
                catch (NotSupportedException) { }
                catch (ImageLimitException) { }
                break;
            case "wav":
                try { SoundSource.FromWav(input); }
                catch (InvalidDataException) { }
                catch (NotSupportedException) { }
                catch (ArgumentOutOfRangeException) { }
                break;
        }
    }
    catch
    {
        File.WriteAllBytes(current, input);
        throw;
    }
}
