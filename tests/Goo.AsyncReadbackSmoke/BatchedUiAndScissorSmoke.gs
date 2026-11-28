package GooAsyncReadbackSmoke

import Goo
import GooReadbackFixture
import System
import System.Diagnostics
import System.IO
import System.Numerics
import System.Text
import System.Threading

class RotatedAnalyticScissorCell : Cell {
  private let controller TextEditorController

  init(editorController TextEditorController) {
    controller = editorController
  }

  override func Build() Blob -> Container() {
    .Width: Percent(100),
    .Height: Percent(100),
    .Position: PositionType.Relative,
    .BackgroundColor: Color.Rgb(12, 20, 32),
    Container() {
      .Position: PositionType.Absolute,
      .Left: 32,
      .Top: 24,
      .Width: 110,
      .Height: 90,
      .BorderRadius: 18,
      .BorderWidth: 2,
      .BorderColor: Color.Rgb(240, 210, 80),
      .OverflowX: Overflow.Hidden,
      .OverflowY: Overflow.Scroll,
      .BackgroundColor: Color.Rgb(28, 84, 168),
      .Transform: PanelTransform{ Rotate: 22 },
      .TransformOriginX: Percent(50),
      .TransformOriginY: Percent(50),
      Container{
        Position: PositionType.Absolute,
        Left: -20,
        Top: -20,
        Width: 160,
        Height: 240,
        BackgroundColor: Color.Rgb(228, 56, 64),
      },
    },
    TextEntry{
      Position: PositionType.Absolute,
      Left: 170,
      Top: 28,
      Width: 120,
      Height: 32,
      Value: "RotatedEntry814",
      FontSize: 16,
      Color: Color.Rgb(245, 245, 245),
      BackgroundColor: Color.Rgb(40, 90, 60),
      Transform: PanelTransform{ Rotate: -15 },
    },
    TextEditor{
      Controller: controller,
      Position: PositionType.Absolute,
      Left: 170,
      Top: 88,
      Width: 120,
      Height: 64,
      FontSize: 16,
      Color: Color.Rgb(245, 245, 245),
      BackgroundColor: Color.Rgb(64, 42, 110),
      Transform: PanelTransform{ Rotate: 12 },
    },
  }
}

class MixedUiBatchCardCell : Cell {
  shared {
    let Diamond VectorPath = PathBuilder()
      .MoveTo(0.5, 0.0)
      .LineTo(1.0, 0.5)
      .LineTo(0.5, 1.0)
      .LineTo(0.0, 0.5)
      .Close()
      .Build()
  }

  private let sampleImage ImageSource

  init(image ImageSource) {
    sampleImage = image
  }

  override func Build() Blob -> Container() {
    .Width: Percent(100),
    .Height: Percent(100),
    .Position: PositionType.Relative,
    .BackgroundColor: Color.Rgb(12, 20, 32),
    Container{
      Position: PositionType.Absolute,
      Left: 10,
      Top: 10,
      Width: 48,
      Height: 36,
      BackgroundColor: Color.Rgb(220, 52, 52),
    },
    Container{
      Position: PositionType.Absolute,
      Left: 68,
      Top: 10,
      Width: 48,
      Height: 36,
      BorderRadius: 12,
      BackgroundColor: Color.Rgb(44, 192, 92),
    },
    Container{
      Position: PositionType.Absolute,
      Left: 126,
      Top: 10,
      Width: 48,
      Height: 36,
      BackgroundColor: Color.Rgb(52, 96, 212),
      BoxShadow: BoxShadow{ OffsetX: 5, OffsetY: 5, Blur: 6, Color: Color.Rgb(240, 140, 36) },
    },
    Container{
      Position: PositionType.Absolute,
      Left: 184,
      Top: 10,
      Width: 48,
      Height: 36,
      BorderWidth: 4,
      BorderColor: Color.Rgb(240, 210, 64),
    },
    Container{
      Position: PositionType.Absolute,
      Left: 242,
      Top: 10,
      Width: 56,
      Height: 36,
      BorderRadius: 10,
      BorderWidth: 4,
      BorderStyle: BorderStyle.Dashed,
      BorderColor: Color.Rgb(196, 84, 224),
    },
    Container{
      Position: PositionType.Absolute,
      Left: 10,
      Top: 62,
      Width: 120,
      Height: 40,
      BackgroundGradient: LinearGradient(90.0, []GradientStop{
        GradientStop{ Offset: 0.0, Color: Color.Rgb(240, 40, 40) },
        GradientStop{ Offset: 0.2, Color: Color.Rgb(240, 220, 40) },
        GradientStop{ Offset: 0.4, Color: Color.Rgb(40, 220, 60) },
        GradientStop{ Offset: 0.6, Color: Color.Rgb(40, 220, 220) },
        GradientStop{ Offset: 0.8, Color: Color.Rgb(40, 80, 240) },
        GradientStop{ Offset: 1.0, Color: Color.Rgb(220, 40, 220) },
      }),
    },
    Container{
      Position: PositionType.Absolute,
      Left: 140,
      Top: 62,
      Width: 50,
      Height: 40,
      BackgroundGradient: RadialGradient(0.5, 0.5, 0.5, []GradientStop{
        GradientStop{ Offset: 0.0, Color: Color.Rgb(248, 220, 64) },
        GradientStop{ Offset: 1.0, Color: Color.Rgb(120, 40, 140) },
      }),
    },
    Container() {
      .Position: PositionType.Absolute,
      .Left: 200,
      .Top: 62,
      .Width: 56,
      .Height: 40,
      .Overflow: Overflow.Hidden,
      .BackgroundColor: Color.Rgb(24, 36, 56),
      Container{
        Position: PositionType.Absolute,
        Left: 4,
        Top: 4,
        Width: 48,
        Height: 32,
        ClipPath: MixedUiBatchCardCell.Diamond,
        ClipPathFit: ShapeFit.Fill,
        BackgroundColor: Color.Rgb(244, 168, 48),
      },
    },
    Image{
      Position: PositionType.Absolute,
      Left: 266,
      Top: 62,
      Width: 42,
      Height: 40,
      Source: sampleImage,
      Fit: ImageFit.Fill,
    },
  }
}

class ShaderEffectLruCell : Cell {
  private var activeEffects []ShaderEffect = Array.Empty[ShaderEffect]()

  internal func SetEffects(effects []ShaderEffect) {
    activeEffects = effects
    Rebuild()
  }

  override func Build() Blob {
    let tiles = [activeEffects.Length + 1]Blob
    var i int32 = 0
    while i < activeEffects.Length {
      let col = i % 8
      let row = i / 8
      tiles[i] = Container{
        Position: PositionType.Absolute,
        Left: float64(col * 18 + 4),
        Top: float64(row * 18 + 4),
        Width: 16,
        Height: 16,
        BackgroundColor: Color.White,
        ShaderEffect: activeEffects[i],
      }
      i++
    }
    tiles[activeEffects.Length] = Container{
      Position: PositionType.Absolute,
      Left: 160,
      Top: 4,
      Width: 28,
      Height: 28,
      BackdropBlur: 4,
      BackgroundColor: Color.Rgb(40, 120, 220).WithAlpha(0.35),
    }
    return Container{
      Width: Percent(100),
      Height: Percent(100),
      Position: PositionType.Relative,
      BackgroundColor: Color.Rgb(12, 20, 32),
      Children: tiles,
    }
  }
}

func ModifyShaderDebugNameIndexed(source []uint8, index int32) []uint8 {
  let clone = PipelineIdentityClone(source)
  let marker = Encoding.ASCII.GetBytes("entryPointParam_main.color")
  var offset int32
  while offset <= clone.Length - marker.Length {
    var matched = true
    var j int32
    while j < marker.Length && matched {
      matched = clone[offset + j] == marker[j]
      j++
    }
    if matched {
      let tag = "lru" + index.ToString("D3")
      let bytes = Encoding.ASCII.GetBytes(tag)
      Array.Copy(bytes, 0, clone, offset, bytes.Length)
      return clone
    }
    offset++
  }
  throw InvalidOperationException("LRU shader effect fixture could not locate SPIR-V debug name")
}

func CloseGateWindow(window Window) {
  window.RequestClose()
  WindowReadbackTestFixture.DrainWindowQueue(window, 10000)
  let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 5L
  while window.IsOpen && Stopwatch.GetTimestamp() < deadline {
    WindowReadbackTestFixture.Pump(window, 0.0)
    WindowReadbackTestFixture.PollQueueCompletion(window)
    Thread.Yield()
  }
}

func PumpOffscreenRotatedClip(window Window, root Cell, width uint32, height uint32) OffscreenRenderResult {
  let options = OffscreenRenderOptions(LayoutSize(float32(width), float32(height)),
    width, height, Color.Rgb(12, 20, 32), 16777216L)
  let pending = window.RenderOffscreenAsync(root, options, CancellationToken.None)
  let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 10L
  while !pending.IsCompleted && Stopwatch.GetTimestamp() < deadline {
    WindowReadbackTestFixture.Pump(window, 0.0)
    WindowReadbackTestFixture.PollQueueCompletion(window)
    Thread.Yield()
  }
  Require(pending.IsCompleted, "Offscreen rotated scissor render did not finish within timeout")
  return pending.GetAwaiter().GetResult()
}

func RunRotatedAnalyticScissorGate() {
  let capturedError = StringWriter()
  let originalError = Console.Error
  let document = TextDocument("RotatedEditor814\nLineTwo")
  using let controller = TextEditorController(document)
  let cell = RotatedAnalyticScissorCell(controller)
  let window = Window{
    Title: "Goo rotated analytic scissor #814",
    Size: LayoutSize(320, 220),
    VSync: false,
    Background: Color.Rgb(12, 20, 32),
    Root: cell,
  }
  try {
    Console.SetError(capturedError)
    window.Open()
    for _ in 0 ... 4 { WindowReadbackTestFixture.Pump(window, 0.0) }
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    let metrics = WindowReadbackTestFixture.Metrics(window)
    let live = ClipCaptureReadback(window, metrics)

    PrimitiveRequirePixelNear(live.Pixels, live.Width, metrics,
      87.0, 69.0, uint8(228), uint8(56), uint8(64), 16, "rotated_clip_interior_live")
    PrimitiveRequirePixelNear(live.Pixels, live.Width, metrics,
      22.0, 18.0, uint8(12), uint8(20), uint8(32), 8, "rotated_aabb_outside_tl_live")
    PrimitiveRequirePixelNear(live.Pixels, live.Width, metrics,
      148.0, 116.0, uint8(12), uint8(20), uint8(32), 8, "rotated_aabb_outside_br_live")

    let offscreenDoc = TextDocument("RotatedEditor814\nLineTwo")
    using let offscreenController = TextEditorController(offscreenDoc)
    let offscreen = PumpOffscreenRotatedClip(window, RotatedAnalyticScissorCell(offscreenController), 320u, 220u)
    Require(offscreen.Status == OffscreenRenderStatus.Success && offscreen.Capture != nil,
      "Offscreen rotated scissor render failed: " + offscreen.Status.ToString() + " " + offscreen.Error)
    let offscreenCapture = offscreen.Capture!!
    let offscreenMetrics = WindowMetrics{
      NativeWidth: 320,
      NativeHeight: 220,
      FramebufferWidth: 320,
      FramebufferHeight: 220,
      DisplayScaleX: 1.0,
      DisplayScaleY: 1.0,
      UiScale: 1.0,
    }
    PrimitiveRequirePixelNear(offscreenCapture.Pixels, offscreenCapture.Width, offscreenMetrics,
      87.0, 69.0, uint8(228), uint8(56), uint8(64), 16, "rotated_clip_interior_offscreen")
    PrimitiveRequirePixelNear(offscreenCapture.Pixels, offscreenCapture.Width, offscreenMetrics,
      22.0, 18.0, uint8(12), uint8(20), uint8(32), 8, "rotated_aabb_outside_tl_offscreen")
    PrimitiveRequirePixelNear(offscreenCapture.Pixels, offscreenCapture.Width, offscreenMetrics,
      148.0, 116.0, uint8(12), uint8(20), uint8(32), 8, "rotated_aabb_outside_br_offscreen")

    CloseGateWindow(window)
    Require(!window.IsOpen, "Rotated scissor gate window did not close")
    Require(WindowReadbackTestFixture.ResidentResourceBytes(window) == 0uL,
      "Rotated scissor gate leaked resident resources")
  } finally {
    Console.SetError(originalError)
    if window.IsOpen {
      CloseGateWindow(window)
    }
  }
  let diagnostics = capturedError.ToString()
  ReadbackValidateCommonDiagnostics(diagnostics)
  Require(!diagnostics.Contains("\"event\":325") && !diagnostics.Contains("\"event\":326"),
    "Rotated analytic clip emitted unsupported-scene diagnostics")
}

func RunPainterBatcherSingleDrawGate() {
  let capturedError = StringWriter()
  let originalError = Console.Error
  using let sampleImage = ImageSource(2, 2, []uint8{
    20, 220, 220, 255, 20, 220, 220, 255,
    20, 220, 220, 255, 20, 220, 220, 255,
  })
  let window = Window{
    Title: "Goo PainterBatcher single draw #452",
    Size: LayoutSize(320, 140),
    VSync: false,
    Background: Color.Transparent,
    Root: MixedUiBatchCardCell(sampleImage),
  }
  try {
    Console.SetError(capturedError)
    window.Open()
    for _ in 0 ... 4 { WindowReadbackTestFixture.ForceRender(window, 0.0166666666666667) }
    WindowReadbackTestFixture.DrainWindowQueue(window, 10000)

    WindowReadbackTestFixture.SetForceFullRedraw(window, true)
    let before = WindowReadbackTestFixture.DiagnosticCounters(window)
    WindowReadbackTestFixture.ForceRender(window, 0.0166666666666667)
    let after = WindowReadbackTestFixture.DiagnosticCounters(window)
    let pipelineDelta = after[VulkanCounterId.PipelineChangeCount] - before[VulkanCounterId.PipelineChangeCount]
    let drawDelta = after[VulkanCounterId.DrawCount] - before[VulkanCounterId.DrawCount]
    Require(pipelineDelta == 1uL && drawDelta == 1uL,
      "Mixed UI card did not batch into 1 pipeline and 1 draw call: pipelines="
      +pipelineDelta.ToString() + " draws=" + drawDelta.ToString())

    let metrics = WindowReadbackTestFixture.Metrics(window)
    let frame = ClipCaptureReadback(window, metrics)
    PrimitiveRequirePixelNear(frame.Pixels, frame.Width, metrics,
      34.0, 28.0, uint8(220), uint8(52), uint8(52), 8, "batched_solid")
    PrimitiveRequirePixelNear(frame.Pixels, frame.Width, metrics,
      92.0, 28.0, uint8(44), uint8(192), uint8(92), 8, "batched_rounded")
    PrimitiveRequirePixelNear(frame.Pixels, frame.Width, metrics,
      69.0, 11.0, uint8(12), uint8(20), uint8(32), 8, "batched_rounded_corner")
    PrimitiveRequirePixelDifferent(frame.Pixels, frame.Width, metrics,
      177.0, 28.0, uint8(12), uint8(20), uint8(32), 16, "batched_shadow")
    PrimitiveRequirePixelNear(frame.Pixels, frame.Width, metrics,
      186.0, 28.0, uint8(240), uint8(210), uint8(64), 16, "batched_sharp_border")
    let gradMid = PrimitiveLogicalPixel(frame.Pixels, frame.Width, metrics, 70.0, 82.0)
    Require(gradMid[1] > uint8(180) && gradMid[0] < uint8(80),
      "6-stop LinearGradient out-of-band stop records failed: " + PrimitivePixelText(gradMid))
    PrimitiveRequirePixelNear(frame.Pixels, frame.Width, metrics,
      165.0, 82.0, uint8(248), uint8(220), uint8(64), 24, "batched_radial_center")
    PrimitiveRequirePixelNear(frame.Pixels, frame.Width, metrics,
      228.0, 82.0, uint8(244), uint8(168), uint8(48), 16, "batched_clip_path_interior")
    PrimitiveRequirePixelNear(frame.Pixels, frame.Width, metrics,
      205.0, 67.0, uint8(24), uint8(36), uint8(56), 12, "batched_clip_path_corner")
    PrimitiveRequirePixelNear(frame.Pixels, frame.Width, metrics,
      287.0, 82.0, uint8(20), uint8(220), uint8(220), 8, "batched_image")

    CloseGateWindow(window)
    Require(!window.IsOpen && WindowReadbackTestFixture.ResidentResourceBytes(window) == 0uL,
      "PainterBatcher card leaked resources on close")
  } finally {
    Console.SetError(originalError)
    if window.IsOpen {
      CloseGateWindow(window)
    }
  }
  ReadbackValidateCommonDiagnostics(capturedError.ToString())
}

func RunShaderEffectLruGate() {
  let shaderPath = Path.Combine(AppContext.BaseDirectory, "control_effect.frag.goo-effect")
  Require(File.Exists(shaderPath), "LRU shader effect asset is missing")
  let baseBundle = File.ReadAllBytes(shaderPath)
  let effects = [72]ShaderEffect
  for i in 0 ... 72 {
    let fx = ShaderEffect(ShaderEffectProgram(ModifyShaderDebugNameIndexed(baseBundle, i)), true)
    fx.SetParameter(0, Vector4(0.1F, float32(i + 1) / 80.0F, 0.85F, 0.0F))
    effects[i] = fx
  }
  let initialBatch = [64]ShaderEffect
  Array.Copy(effects, 0, initialBatch, 0, 64)
  let overflowBatch = [8]ShaderEffect
  Array.Copy(effects, 64, overflowBatch, 0, 8)

  let capturedError = StringWriter()
  let originalError = Console.Error
  let cell = ShaderEffectLruCell{}
  cell.SetEffects(initialBatch)
  let window = Window{
    Title: "Goo ShaderEffect bounded LRU gate",
    Size: LayoutSize(200, 160),
    VSync: false,
    Root: cell,
  }
  var retiredWhileInFlight int32 = 0
  try {
    Console.SetError(capturedError)
    window.Open()
    WindowReadbackTestFixture.ForceRender(window, 0.0, 60.0, waitForPresentation: true)
    WindowReadbackTestFixture.WaitForPipelinePreparation(window)
    WindowReadbackTestFixture.RuntimeHoldNextQueueSubmit(window)
    WindowReadbackTestFixture.ForceRenderNonblocking(window, 0.0166666666666667)
    Require(WindowReadbackTestFixture.RuntimeWaitForHeldQueueCall(window, 5000),
      "ShaderEffect LRU fixture did not hold initial 64-effect submission")
    for fx in overflowBatch {
      let _ = WindowReadbackTestFixture.ResolveShaderEffectPipeline(window, fx)
    }
    retiredWhileInFlight = WindowReadbackTestFixture.RetiredShaderEffectPipelineCount(window)
    WindowReadbackTestFixture.RuntimeReleaseHeldQueueCall()
    WindowReadbackTestFixture.DrainWindowQueue(window, 10000)
    cell.SetEffects(overflowBatch)
    WindowReadbackTestFixture.ForceRender(window, 0.0166666666666667)

    let pinned = WindowReadbackTestFixture.PinnedShaderEffectCount(window)
    let total = WindowReadbackTestFixture.ShaderEffectPipelineEntryCount(window)
    let unpinned = total - pinned
    let retiredAfterCollect = WindowReadbackTestFixture.RetiredShaderEffectPipelineCount(window)
    Require(pinned == 2, "Pinned built-in shader effect count mismatch: " + pinned.ToString())
    Require(unpinned == 64, "Unpinned shader effect LRU count exceeded/missed 64: " + unpinned.ToString())
    Require(retiredWhileInFlight >= 8 && retiredAfterCollect == 0,
      "Fence-safe shader effect retirement failed: inFlight=" + retiredWhileInFlight.ToString()
      +" afterCollect=" + retiredAfterCollect.ToString())

    CloseGateWindow(window)
    Require(!window.IsOpen && WindowReadbackTestFixture.ResidentResourceBytes(window) == 0uL,
      "ShaderEffect LRU window leaked resources after close")
  } finally {
    WindowReadbackTestFixture.RuntimeReleaseHeldQueueCall()
    Console.SetError(originalError)
    if window.IsOpen {
      CloseGateWindow(window)
    }
  }
  ReadbackValidateCommonDiagnostics(capturedError.ToString())
  Console.WriteLine("batched-ui-scissor-gate: rotated_clip=1 offscreen=1 batched_draw=1 lru_cap=64 pinned=2 retired_deferred="
    +retiredWhileInFlight.ToString())
}

func RunBatchedUiAndScissorSmoke() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  RunRotatedAnalyticScissorGate()
  RunPainterBatcherSingleDrawGate()
  RunShaderEffectLruGate()
}
