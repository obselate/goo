import Goo
import Goo.Svg
import System
import System.Diagnostics
import System.IO
import System.Linq
import System.Text
import System.Threading

func Main(args[]string) {
    let target = Environment.GetEnvironmentVariable("INPUT_TARGET") ??
        throw InvalidOperationException("INPUT_TARGET is required")
    let current = Environment.GetEnvironmentVariable("INPUT_CURRENT") ??
        throw InvalidOperationException("INPUT_CURRENT is required")
    if target is not("svg" or "raster" or "wav") {
        throw ArgumentException("Unknown managed input target")
    }
    let seeds = Directory.GetFiles(args[0]).Select(File.ReadAllBytes).ToArray()
    if seeds.Length == 0 {
        throw InvalidOperationException("No seed fixtures")
    }
    let random = Random(0)
    let clock = Stopwatch.StartNew()
    var count int64 = 0
    for seed in seeds {
        Check(seed, target, current)
    }
    while clock.Elapsed < TimeSpan.FromMinutes(10) {
        let seed = seeds[random.Next(seeds.Length)]
        var input[]uint8
        switch random.Next(3) {
            case 0 {
                input = cast[[]uint8](seed.Clone())
                if input.Length != 0 {
                    input[random.Next(input.Length)] ^= uint8(random.Next(1, 256))
                }
            }
            case 1 {
                input = seed.AsSpan(0, random.Next(seed.Length + 1)).ToArray()
            }
            case _ {
                let other = seeds[random.Next(seeds.Length)]
                let split = random.Next(seed.Length + 1)
                let start = random.Next(other.Length + 1)
                input = [split + other.Length - start]uint8
                seed.AsSpan(0, split).CopyTo(input)
                other.AsSpan(start).CopyTo(input.AsSpan(split))
            }
        }
        Check(input, target, current)
        count++
    }
    Console.WriteLine("Completed $count generated $target inputs in ${clock.Elapsed}.")
}

func Check(input[]uint8, target string, current string) {
    try {
        switch target {
            case "svg" {
                try {
                    Svg.Parse(Encoding.UTF8.GetString(input))
                } catch (_ SvgParseException) { }
            }
            case "raster" {
                try {
                    using let image = ImageSource.Decode(input, ImageDecodeLimits.Default, CancellationToken.None)
                } catch (_ InvalidDataException) { } catch (_ NotSupportedException) { } catch (
                    _ ImageLimitException
                ) { }
            }
            case "wav" {
                try {
                    SoundSource.FromWav(input)
                } catch (_ InvalidDataException) { } catch (_ NotSupportedException) { } catch (
                    _ ArgumentOutOfRangeException
                ) { }
            }
        }
    } catch {
        File.WriteAllBytes(current, input)
        rethrow
    }
}
