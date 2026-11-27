package WebView2Spike

import System
import System.IO
import System.Runtime.InteropServices

data struct PixelCount(Sampled int32, Matched int32) {
    prop Ratio float64 {
        get -> Sampled == 0 ? 0.0 : float64(Matched) / float64(Sampled)
    }
}

data struct ColorMean(R float64, G float64, B float64) { }

data struct ScreenSample(Inner PixelCount, Panel PixelCount, Border PixelCount, Margin ColorMean) { }

shared class ScreenCapture {
    private const Tolerance int32 = 48

    // Reads the composed desktop, so DWM layers such as DirectComposition visuals are included.
    func Capture(area PixelRect, path string)[]uint8 {
        Native.Check(Native.DwmFlush(), "DwmFlush")
        let pixels = Read(area)
        Save(path, area.Width, area.Height, pixels)
        return pixels
    }

    func Sample(
        area PixelRect,
        region PixelRect,
        border int32,
        margin int32,
        inner uint32,
        panel uint32,
        frame uint32,
        path string
    ) ScreenSample {
        let pixels = Capture(area, path)
        let local = region.Offset(-area.Left, -area.Top)
        let middle = border / 2
        let edge = local.Inset(-middle - 1)
        var ring = Count(pixels, area.Width, PixelRect(local.Left, edge.Top, local.Right, edge.Top + 1), frame)
        ring = Add(
            ring,
            Count(pixels, area.Width, PixelRect(local.Left, edge.Bottom - 1, local.Right, edge.Bottom), frame)
        )
        ring = Add(ring, Count(pixels, area.Width, PixelRect(edge.Left, local.Top, edge.Left + 1, local.Bottom), frame))
        ring = Add(
            ring,
            Count(pixels, area.Width, PixelRect(edge.Right - 1, local.Top, edge.Right, local.Bottom), frame)
        )
        let outside = local.Left - border
        return ScreenSample{
            Inner: Count(pixels, area.Width, local.Inset(4), inner),
            Panel: Count(pixels, area.Width, PixelRect(outside - 48, local.Top, outside - 8, local.Bottom), panel),
            Border: ring,
            Margin: Mean(pixels, area.Width, area.Height, margin),
        }
    }

    private func Mean(pixels[]uint8, width int32, height int32, margin int32) ColorMean {
        var count int64
        var red int64
        var green int64
        var blue int64
        for y in 2 ... height - 2 {
            for x in 2 ... width - 2 {
                if x >= margin - 1 && x < width - margin + 1 && y >= margin - 1 && y < height - margin + 1 {
                    continue
                }
                let offset = (y * width + x) * 4
                red += int64(pixels[offset + 2])
                green += int64(pixels[offset + 1])
                blue += int64(pixels[offset])
                count++
            }
        }
        let divisor = float64(Math.Max(count, 1L))
        return ColorMean{R: float64(red) / divisor, G: float64(green) / divisor, B: float64(blue) / divisor}
    }

    private func Add(a PixelCount, b PixelCount) PixelCount -> PixelCount{
        Sampled: a.Sampled + b.Sampled,
        Matched: a.Matched + b.Matched
    }

    func Count(pixels[]uint8, width int32, rect PixelRect, rgb uint32) PixelCount {
        let height = pixels.Length / (width * 4)
        var sampled int32
        var matched int32
        for y in Math.Max(rect.Top, 0) ... Math.Min(rect.Bottom, height) {
            for x in Math.Max(rect.Left, 0) ... Math.Min(rect.Right, width) {
                let offset = (y * width + x) * 4
                sampled++
                if Math.Abs(int32(pixels[offset + 2]) - int32((rgb >> 16) & 0xFFu)) <= Tolerance
                && Math.Abs(int32(pixels[offset + 1]) - int32((rgb >> 8) & 0xFFu)) <= Tolerance
                && Math.Abs(int32(pixels[offset]) - int32(rgb & 0xFFu)) <= Tolerance {
                    matched++
                }
            }
        }
        return PixelCount{Sampled: sampled, Matched: matched}
    }

    private func Read(area PixelRect)[]uint8 {
        let screen = Native.GetDC(nint(0))
        Native.Require(screen != nint(0), "GetDC(screen)")
        let memory = Native.CreateCompatibleDC(screen)
        var header = BitmapHeader{
            Size: 40u,
            Width: area.Width,
            Height: -area.Height,
            Planes: uint16(1),
            BitCount: uint16(32)
        }
        let bitmap = Native.CreateDIBSection(memory, ref header, 0u, out var bits, nint(0), 0u)
        try {
            Native.Require(memory != nint(0) && bitmap != nint(0), "CreateDIBSection")
            let previous = Native.SelectObject(memory, bitmap)
            // SRCCOPY | CAPTUREBLT
            let copied = Native.BitBlt(memory, 0, 0, area.Width, area.Height, screen, area.Left, area.Top, 0x40CC0020u)
            Native.SelectObject(memory, previous)
            Native.Require(copied != 0, "BitBlt")
            let pixels = [area.Width * area.Height * 4]uint8
            Marshal.Copy(bits, pixels, 0, pixels.Length)
            return pixels
        } finally {
            if bitmap != nint(0) {
                Native.DeleteObject(bitmap)
            }
            if memory != nint(0) {
                Native.DeleteDC(memory)
            }
            Native.ReleaseDC(nint(0), screen)
        }
    }

    private func Save(path string, width int32, height int32, pixels[]uint8) {
        using let writer = BinaryWriter(File.Create(path))
        writer.Write(uint16(0x4D42u))
        writer.Write(54 + pixels.Length)
        writer.Write(0)
        writer.Write(54)
        writer.Write(40)
        writer.Write(width)
        writer.Write(-height)
        writer.Write(uint16(1u))
        writer.Write(uint16(32u))
        writer.Write(0)
        writer.Write(pixels.Length)
        writer.Write(0)
        writer.Write(0)
        writer.Write(0)
        writer.Write(0)
        writer.Write(pixels)
    }
}
