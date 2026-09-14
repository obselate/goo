package GooAsyncReadbackSmoke

import System
import System.IO
import System.Threading
import Goo

class ClipboardSmokeCell : Cell {
  public override func Build() Blob -> Container {}
}

func RunClipboardSmoke() {
  Require(Environment.GetEnvironmentVariable("GOO_CLIPBOARD_ISOLATED") == "1", "Clipboard fixture requires an isolated desktop")
  let mode = Environment.GetEnvironmentVariable("GOO_CLIPBOARD_SMOKE") ?? ""
  let expectedFile = Environment.GetEnvironmentVariable("GOO_CLIPBOARD_EXPECTED") ?? ""
  let window = Window{Title: "Goo isolated clipboard read", Width: 300, Height: 180, Root: ClipboardSmokeCell{}}.Open()
  var savedFiles ClipboardFiles?
  var savedImage ClipboardImage?
  try {
    window.RequestActivation()
    for i in 0 ... 30 {
      window.Pump(0.016)
      Thread.Sleep(10)
    }
    let formats = window.GetClipboardFormats()
    if mode == "files" {
      Require(formats.Status == ClipboardReadStatus.Success && formats.HasFiles, "Native file-list MIME discovery failed: " + formats.Error)
      let files = window.ReadClipboardFiles()
      Require(files.Status == ClipboardReadStatus.Success, "Native file-list read failed: " + files.Error)
      let expected = File.ReadAllLines(expectedFile)
      Require(files.Paths.Count == expected.Length, "Native file-list count differs")
      for i in 0 ... expected.Length { Require(files.Paths[i] == expected[i], "Native clipboard file path differs") }
      savedFiles = files
    } else if mode == "image" || mode == "bitmap" {
      Require(formats.Status == ClipboardReadStatus.Success && formats.HasImage, "Native image MIME discovery failed: " + formats.Error)
      let result = window.ReadClipboardImage()
      Require(result.Status == ClipboardReadStatus.Success, "Native image read failed: " + result.Error)
      let expected = File.ReadAllBytes(expectedFile)
      let actual = result.Bytes.ToArray()
      if mode == "image" {
        Require(actual.Length == expected.Length, "Encoded image clipboard length differs")
        for i in 0 ... expected.Length { Require(actual[i] == expected[i], "Encoded image clipboard bytes differ") }
      } else {
        Require(result.ContentType == "image/png", "Native bitmap was not normalized to PNG")
        guard let decoded = StbImageSharp.ImageResult.FromMemory(actual, StbImageSharp.ColorComponents.RedGreenBlueAlpha) else {
          throw InvalidOperationException("Normalized bitmap decode failed")
        }
        guard let pixels = decoded.Data else { throw InvalidOperationException("Normalized bitmap pixels are missing") }
        Require(decoded.Width == 2 && decoded.Height == 1, "Normalized bitmap size differs")
        Require(pixels[0] == 255 && pixels[1] == 0 && pixels[4] == 0 && pixels[5] == 255, "Normalized bitmap colors differ")
      }
      savedImage = result
    } else if mode == "invalid" {
      Require(window.ReadClipboardFiles().Status == ClipboardReadStatus.Failed, "Invalid external file URI must fail")
    } else if mode == "large" {
      Require(window.ReadClipboardFiles().Status == ClipboardReadStatus.TooLarge, "Oversized external file list must be bounded")
    } else if mode == "empty" {
      Require(window.ReadClipboardFiles().Status == ClipboardReadStatus.Empty, "Text-only clipboard must have no files")
      Require(window.ReadClipboardImage().Status == ClipboardReadStatus.Empty, "Text-only clipboard must have no image")
    } else { throw InvalidOperationException("Unknown clipboard fixture mode") }
    window.SetClipboardText("isolated replacement")
  } finally {
    window.RequestClose()
    while window.IsOpen { window.Pump(0.016) }
  }
  if let files = savedFiles { Require(files.Paths.Count > 0 && files.Paths[0].Length > 0, "Owned file-list data expired after close") }
  if let result = savedImage { Require(result.Bytes.Length > 0 && result.Bytes.Span[0] != 0, "Owned image bytes expired after close") }
  Console.WriteLine("clipboard-native: " + mode + "=pass external-provider=1 owned-after-close=1")
}
