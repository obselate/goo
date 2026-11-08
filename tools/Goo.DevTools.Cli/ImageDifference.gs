package Goo.DevTools.Cli

import Goo
import System
import System.IO

internal shared class ImageDifference {
    func Run(command CommandLine) int32 {
        if command.Positionals.Count != 2 {
            throw CliException("Usage: goo diff a.png b.png [--tolerance 0..255] [--out diff.png]")
        }
        if !Int32.TryParse(command.Get("tolerance") ?? "0", out var tolerance) || tolerance < 0 || tolerance > 255 {
            throw CliException("--tolerance must be an integer from 0 to 255.")
        }
        using let first = Decode(command.Positionals[0])
        using let second = Decode(command.Positionals[1])
        let firstPixels = first.Pixels
        let secondPixels = second.Pixels
        let width = Math.Max(first.Width, second.Width)
        let height = Math.Max(first.Height, second.Height)
        let output = if command.Has("out") {
            [checked(width * height * 4)]uint8
        } else {
            Array.Empty[uint8]()
        }
        var changed = 0
        var left = width
        var top = height
        var right = -1
        var bottom = -1
        for y in 0 ... height {
            for x in 0 ... width {
                let outside = x >= first.Width || y >= first.Height || x >= second.Width || y >= second.Height
                var different = outside
                if !outside {
                    let a = (y * first.Width + x) * 4
                    let b = (y * second.Width + x) * 4
                    for channel in 0 ... 4 {
                        if Math.Abs(int32(firstPixels[a + channel]) - int32(secondPixels[b + channel])) > tolerance {
                            different = true
                            break
                        }
                    }
                }
                if different {
                    changed++
                    left = Math.Min(left, x)
                    top = Math.Min(top, y)
                    right = Math.Max(right, x)
                    bottom = Math.Max(bottom, y)
                }
                if output.Length != 0 {
                    let offset = (y * width + x) * 4
                    output[offset] = if different {
                        uint8(255)
                    } else {
                        uint8(0)
                    }
                    output[offset + 2] = if different {
                        uint8(255)
                    } else {
                        uint8(0)
                    }
                    output[offset + 3] = 255
                }
            }
        }
        if let path = command.Get("out") {
            Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!!)
            File.WriteAllBytes(path, PngEncoder.Encode(output, width, height, width * 4))
        }
        let bounds = if changed == 0 {
            "none"
        } else {
            "$left,$top ${right - left + 1}x${bottom - top + 1}"
        }
        Console.WriteLine("changed pixels: $changed, bounds: $bounds")
        return if changed == 0 {
            0
        } else {
            1
        }
    }

    private func Decode(path string) NativeImage {
        let bytes = File.ReadAllBytes(path)
        if bytes.Length < 8 || !bytes.AsSpan(0, 8).SequenceEqual([]uint8{137, 80, 78, 71, 13, 10, 26, 10}) {
            throw CliException("Not a PNG: $path")
        }
        return NativeImage.Decode(bytes)
    }
}
