package Goo.Wasm

import Goo
import Goo.Wasm.Interop
import System
import System.IO
import System.Threading.Tasks

/// Hosts one Goo window in a WebGPU canvas with browser-owned frame pacing.
public sealed class BrowserWindowHost : EmbeddedWindowHost {
  private var handle int32
  private var lastTimestamp float64
  private var inFrame bool
  private var ready bool

  private init() { }

  shared {
    /// Routes Application.Run to the canvas without changing application source.
    public func Configure(canvasId string = "goo") {
      Application.RunHost = (window Window) -> { Start(window, canvasId) }
    }

    private async func Start(window Window, canvasId string) void {
      try {
        await AttachAsync(window, canvasId)
        Console.WriteLine("GOO_BROWSER_READY")
      } catch (error Exception) {
        Console.Error.WriteLine(error.ToString())
        rethrow
      }
    }

    /// Initializes WebGPU asynchronously, then attaches the window without SDL.
    public async func AttachAsync(window Window, canvasId string) Task[BrowserWindowHost] {
      if !OperatingSystem.IsBrowser() { throw PlatformNotSupportedException("The browser host requires browser-wasm") }
      let host = BrowserWindowHost()
      host.handle = await BrowserInterop.Initialize(canvasId, Shader("analytic.vert"),
        Shader("analytic_solid.frag"), Shader("analytic_border.frag"),
        Shader("browser_text.vert"), Shader("browser_text.frag"),
        host.Frame, host.Metrics, host.Pointer, host.Visibility)
      try {
        window.Attach(host)
        host.AttachPresentation()
        host.ready = true
        host.RequestFrame()
        return host
      } catch {
        BrowserInterop.Dispose(host.handle)
        host.Dispose()
        rethrow
      }
    }

    private func Shader(name string) string {
      using let stream = typeof(BrowserWindowHost).Assembly.GetManifestResourceStream("Goo.Wasm.Shaders.$name.wgsl")
        ?? throw InvalidOperationException("Missing browser shader: $name")
      using let reader = StreamReader(stream)
      return reader.ReadToEnd()
    }
  }

  private func Frame(timestamp float64) {
    if !ready || IsSuspended { return }
    let dt = if lastTimestamp == 0.0 { 0.0 } else { Math.Max(0.0, (timestamp - lastTimestamp) / 1000.0) }
    lastTimestamp = timestamp
    inFrame = true
    try { RenderFrame(dt) } finally { inFrame = false }
    BrowserInterop.Schedule(handle, NextFrameDelaySeconds)
  }

  private func Metrics(width float64, height float64, scale float64) {
    Resize(int32(width), int32(height), int32(Math.Round(width * scale)), int32(Math.Round(height * scale)))
  }

  private func Pointer(kind float64, x float64, y float64) {
    guard let window = Window else { return }
    let input = window.PlatformInput
    if kind == 0.0 {
      input.PointerMove(1L, PointerDevice.Mouse, float32(x), float32(y), KeyModifiers.None, 0.0F)
    } else if kind == 1.0 {
      input.PointerPress(1L, PointerDevice.Mouse, float32(x), float32(y), PointerButton.Primary, KeyModifiers.None, 1.0F)
    } else if kind == 2.0 {
      input.PointerRelease(1L, PointerDevice.Mouse, float32(x), float32(y), PointerButton.Primary, KeyModifiers.None, 0.0F)
    } else {
      input.PointerCancel(1L, PointerDevice.Mouse)
    }
    RequestFrame()
  }

  private func Visibility(visible bool) {
    if visible {
      lastTimestamp = 0.0
      Resume()
    } else {
      Suspend()
    }
    if ready { BrowserInterop.Schedule(handle, if visible { 0.0 } else { Double.PositiveInfinity }) }
  }

  protected override func RequestFrame() {
    if ready && !inFrame && !IsSuspended { BrowserInterop.Schedule(handle, 0.0) }
  }

  internal override func CreateRenderTarget(bridge EmbeddedWindowBridge) WindowRenderTarget ->
    WebGpuWindowTarget(handle)
  internal override async func DrainCloseCallbacks(window Window) void {
    ready = false
    while window.IsOpen {
      await Task.Delay(1)
      window.Close()
    }
  }

  protected override func LoadVulkanLibrary() bool -> throw PlatformNotSupportedException("Browser presentation uses WebGPU")
  protected override func GetVulkanGetInstanceProcAddr() nint -> throw PlatformNotSupportedException("Browser presentation uses WebGPU")
  protected override func UnloadVulkanLibrary() { throw PlatformNotSupportedException("Browser presentation uses WebGPU") }
  protected override func GetVulkanInstanceExtensions() []string -> throw PlatformNotSupportedException("Browser presentation uses WebGPU")
  protected override func CreateVulkanSurface(instance nint, out surface uint64) bool {
    surface = 0uL
    throw PlatformNotSupportedException("Browser presentation uses WebGPU")
  }
  protected override func DestroyVulkanSurface(instance nint, surface uint64) { throw PlatformNotSupportedException("Browser presentation uses WebGPU") }
}
