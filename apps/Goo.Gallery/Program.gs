package GooGallery

import System
import System.Diagnostics
import System.IO
import Goo

func Main() {
  Window.ConfigureApplication("Goo Gallery", "0.5.1", "io.github.obselate.goo.gallery")
  let iconPath = Path.Combine(AppContext.BaseDirectory, "MaterialSymbolsRounded.ttf")
  using let iconFont = FontSource(
    GalleryTheme.IconFamily,
    400,
    false,
    File.ReadAllBytes(iconPath))
  iconFont.Register()
  let galleryFontBytes = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "SpaceGrotesk-Variable.ttf"))
  using let galleryFontRegular = FontSource(
    GalleryTheme.GalleryFontFamily,
    400,
    false,
    galleryFontBytes,
    0u,
    []FontVariation{ FontVariation("wght", 400.0F) })
  using let galleryFontBold = FontSource(
    GalleryTheme.GalleryFontFamily,
    700,
    false,
    galleryFontBytes,
    0u,
    []FontVariation{ FontVariation("wght", 700.0F) })
  galleryFontRegular.Register()
  galleryFontBold.Register()
  let elementFontBytes = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "VendSans-VariableFont_wght.ttf"))
  using let elementFontRegular = FontSource(
    GalleryTheme.ElementFontFamily,
    400,
    false,
    elementFontBytes,
    0u,
    []FontVariation{ FontVariation("wght", 400.0F) })
  using let elementFontBold = FontSource(
    GalleryTheme.ElementFontFamily,
    700,
    false,
    elementFontBytes,
    0u,
    []FontVariation{ FontVariation("wght", 700.0F) })
  elementFontRegular.Register()
  elementFontBold.Register()
  let smoke = Environment.GetEnvironmentVariable("GOO_GALLERY_SMOKE") == "1"
  let bench = Environment.GetEnvironmentVariable("GOO_GALLERY_BENCH") == "1"
  if smoke {
    RunSmoke()
    return
  }
  if bench {
    RunBench()
    return
  }
  if Environment.GetEnvironmentVariable("GOO_GLASS_LAB") == "1"
    || (Environment.GetCommandLineArgs().Length > 1 && Environment.GetCommandLineArgs()[1] == "--glass-lab") {
      GlassMaterialWindow.Run()
      return
    }
  let glassWindow = Environment.GetEnvironmentVariable("GOO_GLASS_WINDOW") == "1"
    || (Environment.GetCommandLineArgs().Length > 1 && Environment.GetCommandLineArgs()[1] == "--glass")
  if glassWindow {
    GlassTerminalWindow.Run()
    return
  }
  let section = Environment.GetEnvironmentVariable("GOO_GALLERY_SECTION")
  let showcase = Environment.GetEnvironmentVariable("GOO_GALLERY_SHOWCASE")
  let root = GalleryCell{}
  let window = Window{
    Title: "Goo UI gallery",
    Width: 1440,
    Height: 900,
    Decorated: false,
    Transparent: true,
    Resizable: true,
    ResizeBand: 8.0F,
    VSync: true,
    Background: Color.Transparent,
    Root: root,
  }
  root.AttachWindow(window)
  window.Open()
  PumpFrames(window, 8)
  if let name = section {
    root.OpenSection(name)
  }
  if let indexText = showcase {
    if !Int32.TryParse(indexText, out var index) || !root.OpenShowcase(index) {
      throw ArgumentOutOfRangeException("GOO_GALLERY_SHOWCASE")
    }
  }
  window.Run()
}

func PumpFrames(window Window, count int32) {
  var index int32 = 0
  while index < count {
    window.Pump(1.0 / 60.0)
    index = index + 1
  }
}

func CloseCleanly(window Window) {
  window.RequestClose()
  var attempts int32 = 0
  while window.IsOpen && attempts < 600 {
    window.Pump(1.0 / 60.0)
    attempts = attempts + 1
  }
  if window.IsOpen {
    throw InvalidOperationException("Goo Gallery window did not close")
  }
}

func RunSmoke() {
  let root = GalleryCell{}
  let accessibility = GallerySmokeAccessibility{}
  let window = Window{
    Title: "Goo Gallery",
    Width: 1440,
    Height: 900,
    Decorated: false,
    Transparent: true,
    Resizable: true,
    ResizeBand: 8.0F,
    VSync: false,
    Background: Color.Transparent,
    Root: root,
  }
  root.AttachWindow(window)
  window.AccessibilityAdapter = accessibility
  window.Open()
  PumpFrames(window, 8)

  if root.ShowcaseCount() != 9 {
    throw InvalidOperationException("Goo Gallery showcase count changed")
  }
  let sizes = []int32{ 1440, 900, 960, 720 }
  var sizeIndex int32 = 0
  while sizeIndex < 4 {
    window.Width = sizes[sizeIndex]
    window.Height = sizes[sizeIndex + 1]
    PumpFrames(window, 12)
    let rootView = root.RootView()
    let showcase = root.ShowcaseView()
    let rootBox = rootView.BorderBox
    let showcaseBox = showcase.BorderBox
    let expectedWidth = float64(sizes[sizeIndex])
    let expectedHeight = float64(sizes[sizeIndex + 1])
    if !rootView.IsMounted || rootBox.Width < expectedWidth - 2.0
      || rootBox.Height < expectedHeight - 2.0 {
        throw InvalidOperationException("Goo Gallery root does not fit window "
          +sizes[sizeIndex].ToString())
      }
    if !showcase.IsMounted || showcaseBox.Width < rootBox.Width - 2.0
      || showcaseBox.Height <= 0.0
      || showcaseBox.Y < rootBox.Y
      || showcaseBox.Y + showcaseBox.Height > rootBox.Y + rootBox.Height + 1.0 {
        throw InvalidOperationException("Goo Gallery showcase does not fit at "
          +sizes[sizeIndex].ToString())
      }
    sizeIndex = sizeIndex + 2
  }

  window.Width = 1440
  window.Height = 900
  PumpFrames(window, 8)
  let windowId = GallerySdlWindowId()
  guard let composeButton = accessibility.FindExact("Compose") else {
    throw InvalidOperationException("Goo Gallery input smoke could not find the Compose button")
  }
  GalleryPushClick(windowId, composeButton.Bounds)
  PumpFrames(window, 4)
  if root.CurrentShowcase() != 1 {
    throw InvalidOperationException("Goo Gallery drag region blocked top-bar input")
  }
  root.OpenShowcase(5)
  PumpFrames(window, 8)
  guard let world = accessibility.FindContaining("3D World") else {
    throw InvalidOperationException("Goo Gallery input smoke could not find the 3D World rail item")
  }
  GalleryPushClick(windowId, world.Bounds)
  PumpFrames(window, 4)
  if root.CurrentShowcase() != 6 {
    throw InvalidOperationException("Goo Gallery frame overlay blocked rail input")
  }

  root.OpenShowcase(0)
  var index int32 = 0
  while index < root.ShowcaseCount() {
    if root.CurrentShowcase() != index {
      throw InvalidOperationException("Goo Gallery pager skipped showcase "
        +index.ToString())
    }
    PumpFrames(window, 24)
    if index == 1 && !accessibility.Contains("Orientation:") {
      throw InvalidOperationException("Goo Gallery pager did not render the first Compose showcase")
    }
    if index == 2 && !accessibility.Contains("Poster width") {
      throw InvalidOperationException("Goo Gallery pager did not render the next Compose showcase")
    }
    if index == 3 && !accessibility.Contains("Letter S") {
      throw InvalidOperationException("Goo Gallery did not render the retained phrase surface")
    }
    if index + 1 < root.ShowcaseCount() && !root.NextShowcase() {
      throw InvalidOperationException("Goo Gallery pager cannot move forward")
    }
    index = index + 1
  }
  index = root.ShowcaseCount() - 1
  while index > 0 {
    if !root.PreviousShowcase() {
      throw InvalidOperationException("Goo Gallery pager cannot move backward")
    }
    PumpFrames(window, 2)
    index = index - 1
  }
  if root.CurrentShowcase() != 0 {
    throw InvalidOperationException("Goo Gallery pager did not return to opening")
  }

  let names = []string{ "compose", "surfaces", "motion", "shaders" }
  let starts = []int32{ 1, 3, 4, 6 }
  var chapter int32 = 0
  while chapter < names.Length {
    if !root.OpenSection(names[chapter]) || root.CurrentShowcase() != starts[chapter] {
      throw InvalidOperationException("Goo Gallery cannot route chapter " + names[chapter])
    }
    PumpFrames(window, 8)
    chapter = chapter + 1
  }

  index = 6
  while index < 9 {
    root.OpenShowcase(index)
    PumpFrames(window, 60)
    index = index + 1
  }

  CloseCleanly(window)

  let glassWindow = GlassTerminalWindow.CreateWindow()
  glassWindow.Open()
  PumpFrames(glassWindow, 16)
  CloseCleanly(glassWindow)
  GlassTerminalWindow.VerifyGlassPipeline()

  Console.WriteLine("gallery-smoke: sizes=2 layout=fit input=topbar+rail showcases=9 pager=forward-back routes=4 shaderFrames=180 glassWindow=1 close=2")
}

func RunBench() {
  let root = GalleryCell{}
  let window = Window{
    Title: "Goo Gallery",
    Width: 1440,
    Height: 900,
    Resizable: true,
    VSync: false,
    Background: GalleryTheme.Background,
    Root: root,
  }
  window.Open()
  PumpFrames(window, 8)

  let samples = [600]float64{}
  var failures int32 = 0

  root.OpenShowcase(6)
  PumpFrames(window, 24)
  failures = failures + MeasureRun(window, samples, "shader-3d-world")

  root.OpenShowcase(7)
  PumpFrames(window, 24)
  failures = failures + MeasureRun(window, samples, "shader-radial-light")

  root.OpenShowcase(8)
  PumpFrames(window, 24)
  failures = failures + MeasureRun(window, samples, "shader-dither")

  CloseCleanly(window)
  if failures > 0 {
    Console.WriteLine("gallery-bench: failed=" + failures.ToString())
    Environment.Exit(1)
  }
  Console.WriteLine("gallery-bench: passed=3")
}

func MeasureRun(window Window, samples[600]float64, spot string) int32 {
  PumpFrames(window, 120)
  let clock = Stopwatch()
  var index int32 = 0
  while index < 600 {
    clock.Restart()
    window.Pump(1.0 / 60.0)
    samples[index] = float64(clock.ElapsedTicks) * 1000.0
    / float64(Stopwatch.Frequency)
    index = index + 1
  }
  Array.Sort(samples)
  let median = samples[300]
  let p95 = samples[569]
  Console.WriteLine("gallery-bench " + spot + ": median="
    +median.ToString("F2") + "ms p95=" + p95.ToString("F2") + "ms")
  if median > 17.5 || p95 > 20.0 {
    return 1
  }
  return 0
}
