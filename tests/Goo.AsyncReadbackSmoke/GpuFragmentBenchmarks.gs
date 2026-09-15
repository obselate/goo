package GooAsyncReadbackSmoke

import Goo
import System
import System.IO
import System.Numerics

class GpuPathBenchmarkRoot : Cell {
  private let path VectorPath
  private let width int32
  private let height int32

  internal prop Path VectorPath{ get -> path }

  init(contours int32, logicalWidth int32, logicalHeight int32) {
    width = logicalWidth
    height = logicalHeight
    let builder = PathBuilder(0.0, 0.0, float64(width), float64(height))
    var contour int32 = 0
    while contour < contours {
      let inset = 8.25 + float64(contour) * 0.003
      builder.MoveTo(inset, inset).LineTo(float64(width) - inset, inset).LineTo(float64(width) - inset, float64(height) - inset).LineTo(inset, float64(height) - inset).Close()
      contour++
    }
    path = builder.Build()
  }

  override func Build() Blob -> Container() {.Width: width,.Height: height,.Position: PositionType.Relative,.BackgroundColor: Color.Rgb(8, 14, 24),
    Shape{
        Position: PositionType.Absolute,
        Left: 0,
        Top: 0,
        Width: width,
        Height: height,
        Path: path,
        Fit: ShapeFit.Fill,
        FillRule: FillRule.EvenOdd,
        BackgroundColor: Color.Rgb(52, 214, 168),
      },
    }
}

class GpuGlassBenchmarkRoot : Cell {
  private let effect ShaderEffect
  private let width int32
  private let height int32

  init(value ShaderEffect, logicalWidth int32, logicalHeight int32) {
    effect = value
    width = logicalWidth
    height = logicalHeight
  }

  override func Build() Blob {
    let background = Container() {.Position: PositionType.Absolute,.Left: 0,.Top: 0,.Width: width,.Height: height,.BackgroundColor: Color.Rgb(226, 239, 235),
    }
    let stripeWidth = float64(width) / 8.0
    var stripe int32 = 0
    while stripe < 8 {
      background.Children.Add(Container{
        Position: PositionType.Absolute,
        Left: float64(stripe) * stripeWidth,
        Top: 0,
        Width: stripeWidth + 1.0,
        Height: height,
        BackgroundColor: if (stripe & 1) == 0 {
          Color.Rgb(224, 72, 68)
        } else {
          Color.Rgb(42, 104, 204)
        },
      })
      stripe++
    }
    return Container() {.Width: width,.Height: height,.Position: PositionType.Relative,.BackgroundColor: Color.Rgb(226, 239, 235),
      background,
        Container{
          Position: PositionType.Absolute,
          Left: 24,
          Top: 24,
          Width: width - 48,
          Height: height - 48,
          BorderRadius: 24,
          BackgroundColor: Color.Rgba(248, 252, 250, 48),
          ShaderEffect: effect,
      },
    }
  }
}

func GpuFragmentRequireDimension(name string, fallback int32, maximum int32) int32 {
  let value = EnvironmentCount(name, fallback, maximum)
  Require(value >= 128, name + " must be at least 128")
  return value
}

func GpuFragmentRequirePixelDifference(first []uint8, second []uint8,
  minimumDifference int32, message string) {
    let difference = Math.Abs(int32(first[0]) - int32(second[0]))
    +Math.Abs(int32(first[1]) - int32(second[1]))
    +Math.Abs(int32(first[2]) - int32(second[2]))
    Require(difference >= minimumDifference, message + ": difference=" + difference.ToString())
  }

data struct GpuFragmentMeasurement {
  internal var MainP50 int64
  internal var MainP95 int64
  internal var MainP99 int64
  internal var MainWorst int64
  internal var EffectsP50 int64
  internal var EffectsP95 int64
  internal var EffectsP99 int64
  internal var EffectsWorst int64
  internal var MainCount int32
  internal var EffectsCount int32
}

data struct GpuPathPackedProof {
  internal var EncodingCurveCount int32
  internal var HorizontalBandCount int32
  internal var SelectedBand int32
  internal var SelectedBandCandidates int32
  internal var FractionalRoots int32
  internal var SamplePhysicalX int32
  internal var SamplePhysicalY int32
  internal var SamplePathX float64
  internal var SamplePathY float64
  internal var MinimumX float32
  internal var MaximumX float32
}

func GpuPathPackedRootProof(path VectorPath, contours int32,
  width int32, height int32, metrics WindowMetrics) GpuPathPackedProof{
    let encoding = PathBandEncoder.Encode(path)
    Require(encoding.CurveCount == contours * 4,
      "GPU path encoded curve count is incorrect")
    Require(Math.Abs(float64(encoding.MinimumX) - 8.25) < 0.001
        && Math.Abs(float64(encoding.MaximumX) - (float64(width) - 8.25)) < 0.001,
      "GPU path encoded bounds do not preserve the Fill identity mapping")
    let scaleX = metrics.DisplayScaleX
    let scaleY = metrics.DisplayScaleY
    let physicalX = int32(Math.Floor(8.0 * scaleX))
    let physicalY = int32(Math.Floor(float64(height) * 0.5 * scaleY))
    let sampleX = (float64(physicalX) + 0.5) / scaleX
    let sampleY = (float64(physicalY) + 0.5) / scaleY
    var bandIndex int32 = 0
    while bandIndex + 1 < encoding.HorizontalBandCount
      && float64(encoding.HorizontalBands[bandIndex].Maximum) < sampleY{
        bandIndex++
      }
    let band = encoding.HorizontalBands[bandIndex]
    Require(sampleY >= float64(band.Minimum) && sampleY <= float64(band.Maximum),
      "GPU path sample is outside its selected horizontal band")
    Require(sampleX < float64(band.Split),
      "GPU path sample did not select the forward right ray")
    Require(int32(band.ForwardCount) >= contours * 2
        && int32(band.ForwardCount) <= contours * 4
        && band.ForwardCount == band.ReverseCount,
      "GPU path selected band candidate count is incorrect: forward="
      +band.ForwardCount.ToString() + " reverse=" + band.ReverseCount.ToString()
      +" minimum_expected=" + (contours * 2).ToString()
      +" band=" + bandIndex.ToString()
      +" minimum=" + band.Minimum.ToString("0.######")
      +" maximum=" + band.Maximum.ToString("0.######"))
    var roots int32 = 0
    var index uint32 = 0u
    while index < band.ForwardCount {
      let encodedIndex = int32(band.ForwardStart + index)
      let curveIndex = int32(encoding.HorizontalCurveIndices[encodedIndex])
      let curve = encoding.Curves[curveIndex]
      let vertical = Math.Abs(float64(curve.X0 - curve.CX)) < 0.000001
        && Math.Abs(float64(curve.CX - curve.X1)) < 0.000001
      let lowY = Math.Min(float64(curve.Y0), float64(curve.Y1))
      let highY = Math.Max(float64(curve.Y0), float64(curve.Y1))
      if vertical && sampleY > lowY && sampleY <= highY {
        let distancePixels = (float64(curve.X0) - sampleX) * scaleX
        if distancePixels >= -0.5 && distancePixels < 0.5 {
          roots++
        }
      }
      index++
    }
    Require(roots == contours,
      "GPU path packed fractional-root count is incorrect")
    return GpuPathPackedProof{
      EncodingCurveCount: encoding.CurveCount,
      HorizontalBandCount: encoding.HorizontalBandCount,
      SelectedBand: bandIndex,
      SelectedBandCandidates: int32(band.ForwardCount),
      FractionalRoots: roots,
      SamplePhysicalX: physicalX,
      SamplePhysicalY: physicalY,
      SamplePathX: sampleX,
      SamplePathY: sampleY,
      MinimumX: encoding.MinimumX,
      MaximumX: encoding.MaximumX,
    }
  }

func GpuFragmentMeasure(window Window, warmup int32, samples int32,
  expectEffects bool, capturePath string) GpuFragmentMeasurement{
    let expectedFrames = [samples]uint64
    let mainNs = [samples]int64
    let effectsNs = [samples]int64
    let timestamps = AllBlobTimestampCapture(samples)
    WindowReadbackTestFixture.SetAllTimestampSink(window,
      (snapshot VulkanDiagnosticTimestampSnapshot) -> timestamps.Accept(snapshot))
    var warmIndex int32 = 0
    while warmIndex < warmup {
      WindowReadbackTestFixture.PumpNativeEvents()
      WindowReadbackTestFixture.ForceRender(window, 0.0166666666666667)
      warmIndex++
    }
    Require(WindowReadbackTestFixture.TimestampSupported(window),
      "GPU fragment timestamps are unsupported")
    let metrics = WindowReadbackTestFixture.Metrics(window)
    let raster = PrimitiveReadback(window, metrics)
    if capturePath != "" {
      VectorQualityWriteImage(raster, capturePath)
    }
    timestamps.Start()
    var sampleIndex int32 = 0
    while sampleIndex < samples {
      WindowReadbackTestFixture.PumpNativeEvents()
      let before = WindowReadbackTestFixture.DiagnosticCounters(window)
      WindowReadbackTestFixture.ForceRender(window, 0.0166666666666667)
      WindowReadbackTestFixture.DrainWindowQueue(window, 2000)
      let after = WindowReadbackTestFixture.DiagnosticCounters(window)
      Require(after.submitCount == before.submitCount + 1uL,
        "GPU fragment frame did not submit exactly once")
      Require(after.presentCount == before.presentCount + 1uL,
        "GPU fragment frame did not present exactly once")
      expectedFrames[sampleIndex] = WindowReadbackTestFixture.DiagnosticFrameId(window)
      if sampleIndex > 0 {
        Require(expectedFrames[sampleIndex] > expectedFrames[sampleIndex - 1],
          "GPU fragment frame ids are not strictly ordered")
      }
      sampleIndex++
    }
    var resolveIndex int32 = 0
    while resolveIndex < 8 {
      WindowReadbackTestFixture.PumpNativeEvents()
      WindowReadbackTestFixture.ForceRender(window, 0.0166666666666667)
      resolveIndex++
    }
    timestamps.Stop()
    WindowReadbackTestFixture.SetAllTimestampSink(window, nil)
    Require(!timestamps.Overflow && timestamps.DroppedScopeCount == 0,
      "GPU fragment timestamp capture overflowed or dropped a scope")
    let mainCount = timestamps.Resolve(1, expectedFrames, mainNs)
    let effectsCount = timestamps.Resolve(2, expectedFrames, effectsNs)
    Require(mainCount == samples,
      "GPU fragment benchmark did not resolve every Main sample")
    if expectEffects {
      Require(effectsCount == samples,
        "GPU glass benchmark did not resolve every Effects sample")
    } else {
      Require(effectsCount == 0,
        "GPU path benchmark unexpectedly recorded Effects samples")
    }
    let main = PerformanceGpuStats(mainNs, mainCount)
    let effects = PerformanceGpuStats(effectsNs, effectsCount)
    if let rawPath = Environment.GetEnvironmentVariable("GOO_GPU_FRAGMENT_RAW") {
      let raw = StringWriter()
      raw.WriteLine("frame,main_ns,effects_ns")
      var rawIndex int32 = 0
      while rawIndex < samples {
        raw.WriteLine(expectedFrames[rawIndex].ToString() + ","
          +mainNs[rawIndex].ToString() + ","
          +(expectEffects ? effectsNs[rawIndex].ToString() : "0"))
        rawIndex++
      }
      File.WriteAllText(rawPath, raw.ToString())
    }
    return GpuFragmentMeasurement{
      MainP50: main.P50,
      MainP95: main.P95,
      MainP99: main.P99,
      MainWorst: main.Worst,
      EffectsP50: effects.P50,
      EffectsP95: effects.P95,
      EffectsP99: effects.P99,
      EffectsWorst: effects.Worst,
      MainCount: mainCount,
      EffectsCount: effectsCount,
    }
  }

func RunGpuPathBenchmark() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let width = GpuFragmentRequireDimension("GOO_GPU_FRAGMENT_WIDTH", 512, 1920)
  let height = GpuFragmentRequireDimension("GOO_GPU_FRAGMENT_HEIGHT", 512, 1080)
  let contours = EnvironmentCount("GOO_GPU_PATH_CONTOURS", 33, 65)
  Require(contours > 0 && (contours & 1) == 1,
    "GOO_GPU_PATH_CONTOURS must be an odd positive integer")
  let warmup = EnvironmentCount("GOO_GPU_FRAGMENT_WARMUP", 300, 1000)
  let samples = EnvironmentCount("GOO_GPU_FRAGMENT_SAMPLES", 1000, 4000)
  Require(samples > 0, "GOO_GPU_FRAGMENT_SAMPLES must be positive")
  let root = GpuPathBenchmarkRoot(contours, width, height)
  let capturePath = Environment.GetEnvironmentVariable("GOO_GPU_FRAGMENT_CAPTURE") ?? ""
  let capturedError = StringWriter()
  let originalError = Console.Error
  var window Window? = nil
  var mainP50 int64
  var mainP95 int64
  var mainP99 int64
  var mainWorst int64
  var mainCount int32
  var displayScaleX float64
  var displayScaleY float64
  var proof GpuPathPackedProof
  try {
    let opened = Window{
      Title: "Goo dense path GPU benchmark",
      Width: width,
      Height: height,
      VSync: false,
      Root: root,
    }
    window = opened
    Console.SetError(capturedError)
    opened.Open()
    WindowReadbackTestFixture.ForceRender(opened, 0.0, 30.0)
    let metrics = WindowReadbackTestFixture.Metrics(opened)
    Require(metrics.LogicalWidth == width && metrics.LogicalHeight == height,
      "GPU path logical window size is incorrect")
    displayScaleX = metrics.DisplayScaleX
    displayScaleY = metrics.DisplayScaleY
    let packedSpanX = float64(contours - 1) * 0.003 * displayScaleX
    let packedSpanY = float64(contours - 1) * 0.003 * displayScaleY
    Require(packedSpanX < 0.5 && packedSpanY < 0.5,
      "GPU path roots do not fit within one fractional pixel")
    let raster = PrimitiveReadback(opened, metrics)
    proof = GpuPathPackedRootProof(root.Path, contours, width, height, metrics)
    let center = PrimitiveLogicalPixel(raster.Pixels, raster.Width, metrics,
      float64(width) * 0.5, float64(height) * 0.5)
    let outside = PrimitiveLogicalPixel(raster.Pixels, raster.Width, metrics, 3.0, 3.0)
    let edge = PrimitiveLogicalPixel(raster.Pixels, raster.Width, metrics,
      proof.SamplePathX, proof.SamplePathY)
    Require(int32(center[1]) > int32(center[0]) + 90
        && int32(center[1]) > int32(center[2]) + 20,
      "GPU path center fill is not visible: " + PrimitivePixelText(center))
    Require(int32(outside[0]) < 24 && int32(outside[1]) < 30
        && int32(outside[2]) < 40,
      "GPU path outside background is incorrect: " + PrimitivePixelText(outside))
    GpuFragmentRequirePixelDifference(edge, outside, 12,
      "GPU path fractional edge is indistinguishable from the background")
    GpuFragmentRequirePixelDifference(edge, center, 12,
      "GPU path fractional edge is indistinguishable from the full fill")
    let measurement = GpuFragmentMeasure(opened, warmup, samples, false, capturePath)
    mainP50 = measurement.MainP50
    mainP95 = measurement.MainP95
    mainP99 = measurement.MainP99
    mainWorst = measurement.MainWorst
    mainCount = measurement.MainCount
    opened.RequestClose()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    Require(!opened.IsOpen, "GPU path benchmark window did not close")
  } finally {
    try {
      if let active = window {
        WindowReadbackTestFixture.SetAllTimestampSink(active, nil)
        if active.IsOpen {
          active.RequestClose()
          WindowReadbackTestFixture.ForceRender(active, 0.0)
        }
      }
    } finally {
      Console.SetError(originalError)
    }
  }
  ReadbackValidateCommonDiagnostics(capturedError.ToString())
  let overflow = contours > 32
  let coveredWidth = width - 17
  let coveredHeight = height - 17
  Console.WriteLine("gpu-path-benchmark: contours=" + contours.ToString()
    +" curves=" + proof.EncodingCurveCount.ToString()
    +" bands=" + proof.HorizontalBandCount.ToString()
    +" selected_band=" + proof.SelectedBand.ToString()
    +" selected_band_candidates=" + proof.SelectedBandCandidates.ToString()
    +" sample_physical_x=" + proof.SamplePhysicalX.ToString()
    +" sample_physical_y=" + proof.SamplePhysicalY.ToString()
    +" sample_path_x=" + proof.SamplePathX.ToString("0.######")
    +" sample_path_y=" + proof.SamplePathY.ToString("0.######")
    +" encoded_min_x=" + proof.MinimumX.ToString("0.######")
    +" encoded_max_x=" + proof.MaximumX.ToString("0.######")
    +" fractional_roots_at_sample=" + proof.FractionalRoots.ToString()
    +" overflow=" + (overflow ? "1" : "0")
    +" width=" + width.ToString()
    +" height=" + height.ToString()
    +" covered_width=" + coveredWidth.ToString()
    +" covered_height=" + coveredHeight.ToString()
    +" covered_pixels=" + (int64(coveredWidth) * int64(coveredHeight)).ToString()
    +" display_scale_x=" + displayScaleX.ToString("0.###")
    +" display_scale_y=" + displayScaleY.ToString("0.###")
    +" warmup=" + warmup.ToString()
    +" samples=" + samples.ToString()
    +" gpu_main_samples=" + mainCount.ToString()
    +" gpu_main_p50_ns=" + mainP50.ToString()
    +" gpu_main_p95_ns=" + mainP95.ToString()
    +" gpu_main_p99_ns=" + mainP99.ToString()
    +" gpu_main_worst_ns=" + mainWorst.ToString()
    +" gpu_dropped_scope_count=0 raster_valid=1 path_valid=1 close=1")
}

func RunGpuGlassBenchmark() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let material = Environment.GetEnvironmentVariable("GOO_GPU_GLASS_MATERIAL") ?? "liquid"
  Require(material == "liquid" || material == "terminal",
    "GOO_GPU_GLASS_MATERIAL must be liquid or terminal")
  let width = GpuFragmentRequireDimension("GOO_GPU_FRAGMENT_WIDTH", 1120, 1920)
  let height = GpuFragmentRequireDimension("GOO_GPU_FRAGMENT_HEIGHT", 760, 1080)
  let warmup = EnvironmentCount("GOO_GPU_FRAGMENT_WARMUP", 300, 1000)
  let samples = EnvironmentCount("GOO_GPU_FRAGMENT_SAMPLES", 1000, 4000)
  Require(samples > 0, "GOO_GPU_FRAGMENT_SAMPLES must be positive")
  guard let shaderDirectory = Environment.GetEnvironmentVariable(
    "GOO_GPU_FRAGMENT_SHADER_DIR") else {
      throw InvalidOperationException("GOO_GPU_FRAGMENT_SHADER_DIR is required")
    }
  let shaderPath = Path.Combine(shaderDirectory, material + "_glass.goo-effect")
  Require(File.Exists(shaderPath), "GPU glass shader bundle is missing")
  let effect = ShaderEffect(ShaderEffectProgram.Load(shaderPath), true, 24.0F)
  if material == "liquid" {
    effect.SetParameter(1, Vector4(0.5F, 0.5F, 0.0F, 0.0F))
    effect.SetParameter(2, Vector4(0.18F, 0.10F, 0.0F, 30.0F))
    effect.SetParameter(3, Vector4(0.94F, 0.97F, 1.0F, 1.0F))
    effect.SetParameter(4, Vector4(1.2F, 1.0F, 0.0F, 1.0F))
  } else {
    effect.SetParameter(1, Vector4(0.5F, 0.5F, 0.0F, 0.0F))
    effect.SetParameter(2, Vector4(0.24F, 0.58F, 0.05F, 18.0F))
    effect.SetParameter(3, Vector4(0.018F, 0.045F, 0.072F, 1.0F))
    effect.SetParameter(4, Vector4(0.34F, 1.0F, 0.0F, 1.0F))
  }
  let root = GpuGlassBenchmarkRoot(effect, width, height)
  let capturePath = Environment.GetEnvironmentVariable("GOO_GPU_FRAGMENT_CAPTURE") ?? ""
  let artifactLabel = Environment.GetEnvironmentVariable("GOO_GPU_FRAGMENT_ARTIFACT")
  ?? "unspecified"
  let capturedError = StringWriter()
  let originalError = Console.Error
  var window Window? = nil
  var mainP50 int64
  var mainP95 int64
  var effectsP50 int64
  var effectsP95 int64
  var mainP99 int64
  var mainWorst int64
  var effectsP99 int64
  var effectsWorst int64
  var mainCount int32
  var effectsCount int32
  var displayScaleX float64
  var displayScaleY float64
  try {
    let opened = Window{
      Title: "Goo " + material + " glass GPU benchmark",
      Width: width,
      Height: height,
      VSync: false,
      Root: root,
    }
    window = opened
    Console.SetError(capturedError)
    opened.Open()
    WindowReadbackTestFixture.ForceRender(opened, 0.0, 30.0)
    let metrics = WindowReadbackTestFixture.Metrics(opened)
    Require(metrics.LogicalWidth == width && metrics.LogicalHeight == height,
      "GPU glass logical window size is incorrect")
    displayScaleX = metrics.DisplayScaleX
    displayScaleY = metrics.DisplayScaleY
    let raster = PrimitiveReadback(opened, metrics)
    let outside = PrimitiveLogicalPixel(raster.Pixels, raster.Width, metrics, 8.0, 8.0)
    let inside = PrimitiveLogicalPixel(raster.Pixels, raster.Width, metrics,
      float64(width) * 0.5, float64(height) * 0.5)
    GpuFragmentRequirePixelDifference(inside, outside, 24,
      "GPU glass effect did not produce visible raster variation")
    let measurement = GpuFragmentMeasure(opened, warmup, samples, true, capturePath)
    mainP50 = measurement.MainP50
    mainP95 = measurement.MainP95
    mainP99 = measurement.MainP99
    mainWorst = measurement.MainWorst
    effectsP50 = measurement.EffectsP50
    effectsP95 = measurement.EffectsP95
    effectsP99 = measurement.EffectsP99
    effectsWorst = measurement.EffectsWorst
    mainCount = measurement.MainCount
    effectsCount = measurement.EffectsCount
    opened.RequestClose()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    Require(!opened.IsOpen, "GPU glass benchmark window did not close")
  } finally {
    try {
      if let active = window {
        WindowReadbackTestFixture.SetAllTimestampSink(active, nil)
        if active.IsOpen {
          active.RequestClose()
          WindowReadbackTestFixture.ForceRender(active, 0.0)
        }
      }
    } finally {
      Console.SetError(originalError)
    }
  }
  ReadbackValidateCommonDiagnostics(capturedError.ToString())
  let coveredWidth = width - 48
  let coveredHeight = height - 48
  Console.WriteLine("gpu-glass-benchmark: material=" + material
    +" artifact=" + artifactLabel
    +" width=" + width.ToString()
    +" height=" + height.ToString()
    +" covered_width=" + coveredWidth.ToString()
    +" covered_height=" + coveredHeight.ToString()
    +" covered_pixels=" + (int64(coveredWidth) * int64(coveredHeight)).ToString()
    +" display_scale_x=" + displayScaleX.ToString("0.###")
    +" display_scale_y=" + displayScaleY.ToString("0.###")
    +" warmup=" + warmup.ToString()
    +" samples=" + samples.ToString()
    +" gpu_main_samples=" + mainCount.ToString()
    +" gpu_main_p50_ns=" + mainP50.ToString()
    +" gpu_main_p95_ns=" + mainP95.ToString()
    +" gpu_main_p99_ns=" + mainP99.ToString()
    +" gpu_main_worst_ns=" + mainWorst.ToString()
    +" gpu_effects_samples=" + effectsCount.ToString()
    +" gpu_effects_p50_ns=" + effectsP50.ToString()
    +" gpu_effects_p95_ns=" + effectsP95.ToString()
    +" gpu_effects_p99_ns=" + effectsP99.ToString()
    +" gpu_effects_worst_ns=" + effectsWorst.ToString()
    +" gpu_dropped_scope_count=0 raster_valid=1 close=1")
}
