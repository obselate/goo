package GooGallery

import System
import Goo

class GalleryMathAssets : IDisposable {
  /// Gets the generated Mandelbrot image source.
  public let Mandelbrot ImageSource
  /// Gets the harmonograph curve vector path.
  public let Harmonograph VectorPath

  public init() {
    Mandelbrot = buildMandelbrot()
    Harmonograph = buildHarmonograph()
  }

  /// Releases owned image and math resources.
  public func Dispose() {
    Mandelbrot.Dispose()
  }

  private func buildMandelbrot() ImageSource {
    let width int32 = 640
    let height int32 = 360
    let maxIterations int32 = 200
    let escapeSquared float64 = 16.0
    let logTwo = Math.Log(2.0)
    let pixels = [640 * 360 * 4]uint8{}
    var offset int32 = 0
    var y int32 = 0
    while y < height {
      let cy = -1.12 + float64(y) * 2.24 / float64(height - 1)
      var x int32 = 0
      while x < width {
        let cx = -2.45 + float64(x) * 3.45 / float64(width - 1)
        var zr float64 = 0.0
        var zi float64 = 0.0
        var magnitudeSquared float64 = 0.0
        var iteration int32 = 0
        while iteration < maxIterations && magnitudeSquared <= escapeSquared {
          let nextReal = zr * zr - zi * zi + cx
          let nextImaginary = 2.0 * zr * zi + cy
          zr = nextReal
          zi = nextImaginary
          magnitudeSquared = zr * zr + zi * zi
          iteration = iteration + 1
        }
        let escaped = magnitudeSquared > escapeSquared
        let normalized = if escaped {
          let magnitude = Math.Sqrt(magnitudeSquared)
          let innerLog = Math.Log(magnitude) / logTwo
          let smooth = float64(iteration) + 1.0 - Math.Log(innerLog) / logTwo
          Math.Clamp(smooth / float64(maxIterations), 0.0, 1.0)
        } else {
          0.0
        }
        let cosine = 0.5 - 0.5 * Math.Cos(normalized * Math.PI * 6.0)
        let warm = normalized * normalized
        let linearRed = Math.Clamp(0.0015 + 0.035 * cosine
          +0.400 * warm * warm, 0.0, 1.0)
        let linearGreen = Math.Clamp(0.002 + 0.015 * cosine
          +0.100 * warm, 0.0, 1.0)
        let linearBlue = Math.Clamp(0.003 + 0.042 * (1.0 - cosine)
          +0.012 * cosine + 0.012 * warm, 0.0, 1.0)
        pixels[offset] = gammaByte(linearRed)
        pixels[offset + 1] = gammaByte(linearGreen)
        pixels[offset + 2] = gammaByte(linearBlue)
        pixels[offset + 3] = uint8(255)
        offset = offset + 4
        x = x + 1
      }
      y = y + 1
    }
    return ImageSource(640, 360, pixels)
  }

  private func gammaByte(linear float64) uint8 {
    let bounded = Math.Clamp(linear, 0.0, 1.0)
    let encoded = if bounded <= 0.0031308 {
      bounded * 12.92
    } else {
      1.055 * Math.Pow(bounded, 1.0 / 2.4) - 0.055
    }
    return uint8(Math.Round(Math.Clamp(encoded * 255.0, 0.0, 255.0)))
  }

  private func buildHarmonograph() VectorPath {
    let count int32 = 28
    let points = [28]Point{}
    let lastIndex = count - 1
    let frequencyX = 1.17
    let frequencyY = 0.93
    let dampingX = 0.065
    let dampingY = 0.082
    var minX float64 = 0.0
    var maxX float64 = 0.0
    var minY float64 = 0.0
    var maxY float64 = 0.0
    var index int32 = 0
    while index < count {
      let t = 7.0 * float64(index) / float64(lastIndex)
      let rawX = Math.Sin(3.0 * frequencyX * t + 0.35) * Math.Exp(-dampingX * t)
      let rawY = Math.Sin(4.0 * frequencyY * t + 1.10) * Math.Exp(-dampingY * t)
      points[index] = Point{ X: rawX, Y: rawY }
      if index == 0 {
        minX = rawX
        maxX = rawX
        minY = rawY
        maxY = rawY
      } else {
        minX = Math.Min(minX, rawX)
        maxX = Math.Max(maxX, rawX)
        minY = Math.Min(minY, rawY)
        maxY = Math.Max(maxY, rawY)
      }
      index = index + 1
    }
    var spanX = maxX - minX
    var spanY = maxY - minY
    if spanX < 0.000001 {
      spanX = 1.0
    }
    if spanY < 0.000001 {
      spanY = 1.0
    }
    index = 0
    while index < count {
      let normalizedX = 8.0 + (points[index].X - minX) / spanX * 84.0
      let normalizedY = 8.0 + (points[index].Y - minY) / spanY * 84.0
      points[index] = Point{ X: normalizedX, Y: normalizedY }
      index = index + 1
    }
    return buildPolyline(points, count, false)
  }

  private func buildPolyline(points []Point, count int32, close bool) VectorPath {
    let builder = PathBuilder(0.0, 0.0, 100.0, 100.0)
    builder.MoveTo(points[0].X, points[0].Y)
    var index int32 = 1
    while index < count {
      builder.LineTo(points[index].X, points[index].Y)
      index = index + 1
    }
    if close {
      builder.Close()
    }
    return builder.Build()
  }
}
