package GooPackageSmoke

import Goo
import System
import System.Collections.Generic
import System.IO
import System.Threading

class ClipMaskPressureCell : Cell {
  private var Phase int32

  shared {
    let Root ElementHandle = ElementHandle{}
    let GrowingPath VectorPath = PathBuilder(0.0, 0.0, 100.0, 48.0).MoveTo(0.0, 0.0).LineTo(100.0, 0.0).LineTo(100.0, 48.0).LineTo(0.0, 48.0).Close().Build()

    func MaskPath(index int32, phase int32) VectorPath {
      let inset = float64((index + phase) % 4)
      let right = 100.0 - inset
      let bottom = 48.0 - inset
      return PathBuilder(0.0, 0.0, 100.0, 48.0).MoveTo(inset, inset).LineTo(right, inset).LineTo(right, bottom).LineTo(inset, bottom).Close().Build()
    }
  }

  init() { }

  func SetPhase(value int32) {
    Phase = value
    Rebuild()
  }

  override func Build() Blob {
    let children = List[Blob](16)
    var index int32 = 0
    while index < 16 {
      let growing = index < 4
      let phase = Phase
      let left = if growing { 8 } else { int32((index - 4) % 4) * 120 + 8 }
      let top = if growing { 8 } else { int32((index - 4) / 4) * 54 + 8 }
      let width = if growing && phase > 0 { 400 } else { 100 }
      let height = if growing && phase > 0 { 180 } else { 48 }
      let key = if growing {
        "clip-grow-" + index.ToString()
      } else {
        "clip-" + phase.ToString() + "-" + index.ToString()
      }
      children.Add(Container {Key: key,Position: PositionType.Absolute,Left: left,Top: top,Width: width,Height: height,ClipPath: if growing {
          ClipMaskPressureCell.GrowingPath
        } else {
          ClipMaskPressureCell.MaskPath(index, phase)
        },ClipPathFit: ShapeFit.Fill,
          Container{
            Width: Length.Percent(100),
            Height: Length.Percent(100),
            BackgroundColor: Color.Rgb(uint8(28 + (index * 11) % 180), 96, 196),
        },
      })
      index = index + 1
    }
    return Container{
      Width: Length.Percent(100),
      Height: Length.Percent(100),
      Handle: ClipMaskPressureCell.Root,
      Position: PositionType.Relative,
      BackgroundColor: Color.Rgb(12, 20, 32),
      Children: children,
    }
  }
}

func RunClipMaskSmoke() {
  if Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") != "1" {
    throw InvalidOperationException("GOO_VK_DIAGNOSTICS=1 is required")
  }
  let root = ClipMaskPressureCell{}
  let capturedError = StringWriter()
  let originalError = Console.Error
  Console.SetError(capturedError)
  var window Window? = nil
  try {
    let opened = Window{
      Title: "Goo Path clip mask pressure",
      Width: 520,
      Height: 220,
      VSync: false,
      Root: root,
    }
    window = opened
    opened.Open()
    opened.Pump(0.0)
    var phase int32 = 0
    while phase < 9 {
      root.SetPhase(phase)
      var pumps int32 = 0
      while pumps < 32 {
        opened.Pump(0.016)
        Thread.Yield()
        pumps = pumps + 1
      }
      phase = phase + 1
    }
    if !opened.IsOpen || !ClipMaskPressureCell.Root.IsMounted
      || ClipMaskPressureCell.Root.BorderBox.Width <= 0.0
      || ClipMaskPressureCell.Root.BorderBox.Height <= 0.0 {
        throw InvalidOperationException("Path clip mask pressure smoke did not retain visible geometry")
      }
    if !CloseWindow(opened) {
      throw InvalidOperationException("Path clip mask pressure smoke window did not close")
    }
    let diagnostics = capturedError.ToString()
    let byteBudget = DiagnosticCounterValue(diagnostics, "clipMaskAtlasByteBudget")
    let residentBytes = DiagnosticCounterValue(diagnostics, "clipMaskAtlasResidentBytes")
    let regionCount = DiagnosticCounterValue(diagnostics, "clipMaskAtlasRegionCount")
    let activeLayerCount = DiagnosticCounterValue(diagnostics, "clipMaskAtlasActiveLayerCount")
    let maximumLayerCount = DiagnosticCounterValue(diagnostics, "clipMaskAtlasMaximumLayerCount")
    let evictionCount = DiagnosticCounterValue(diagnostics, "clipMaskAtlasEvictionCount")
    let pressureEvents = DiagnosticCounterValue(diagnostics, "clipMaskAtlasPressureEventCount")
    let pressureFailures = DiagnosticCounterValue(diagnostics, "clipMaskAtlasPressureFailureCount")
    let objectCount = DiagnosticCounterValue(diagnostics, "vulkanObjectCount")
    let validationErrors = DiagnosticCounterValue(diagnostics, "validationErrorCount")
    let resultFailures = DiagnosticCounterValue(diagnostics, "resultFailureCount")
    if diagnostics.Contains("\"kind\":\"fatal\"")
      || diagnostics.Contains("\"event\":325")
      || byteBudget == 0uL || byteBudget > 67108864uL
      || activeLayerCount != 0uL || maximumLayerCount != 0uL
      || residentBytes != 0uL || regionCount != 0uL
      || pressureEvents == 0uL || evictionCount == 0uL
      || pressureFailures != 0uL || objectCount != 0uL
      || validationErrors != 0uL || resultFailures != 0uL {
        Console.SetError(originalError)
        originalError.Write(diagnostics)
        throw InvalidOperationException("Path clip mask atlas pressure did not qualify: budget="
          +byteBudget.ToString() + " resident=" + residentBytes.ToString()
          +" regions=" + regionCount.ToString() + " activeLayers=" + activeLayerCount.ToString()
          +" maximumLayers=" + maximumLayerCount.ToString() + " pressureEvents="
          +pressureEvents.ToString() + " evictionCount=" + evictionCount.ToString()
          +" pressureFailures=" + pressureFailures.ToString() + " objects=" + objectCount.ToString()
          +" validationErrors=" + validationErrors.ToString() + " resultFailures="
          +resultFailures.ToString())
      }
    Console.SetError(originalError)
    Console.WriteLine("path-clip-mask: pressureEvents=" + pressureEvents.ToString()
      +" evictionCount=" + evictionCount.ToString()
      +" pressureFailures=0 cleanup=1 close=1")
  } finally {
    Console.SetError(originalError)
    if let active = window {
      if active.IsOpen {
        CloseWindow(active)
      }
    }
  }
}
