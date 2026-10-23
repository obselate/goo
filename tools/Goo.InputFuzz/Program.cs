using System.Text;
using Goo;
using Goo.Svg;
using SharpFuzz;

var target = Environment.GetEnvironmentVariable("INPUT_TARGET") ?? throw new InvalidOperationException("INPUT_TARGET is required");
var current = Environment.GetEnvironmentVariable("INPUT_CURRENT") ?? throw new InvalidOperationException("INPUT_CURRENT is required");
if (target is not ("svg" or "raster" or "wav"))
    throw new ArgumentException("Unknown managed input target");

Fuzzer.LibFuzzer.Run(input =>
{
    File.WriteAllBytes(current, input.ToArray());
    switch (target)
    {
        case "svg":
            try { Svg.Parse(Encoding.UTF8.GetString(input)); }
            catch (SvgParseException) { }
            break;
        case "raster":
            try
            {
                using var image = ImageSource.Decode(input.ToArray(), ImageDecodeLimits.Default, CancellationToken.None);
            }
            catch (InvalidDataException) { }
            catch (NotSupportedException) { }
            catch (ImageLimitException) { }
            break;
        case "wav":
            try { SoundSource.FromWav(input.ToArray()); }
            catch (InvalidDataException) { }
            catch (NotSupportedException) { }
            break;
    }
});
