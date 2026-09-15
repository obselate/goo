package Goo

import System
import System.Collections.Generic
import System.IO
import System.Runtime.InteropServices
import System.Text
import Hexa.NET.SDL3

internal unsafe partial class ClipboardTransfer {
  shared {
    internal const MaxImageBytes int32 = 67108864
    internal const MaxFileListBytes int32 = 1048576
    private let utf8 UTF8Encoding = UTF8Encoding(false, true)
    private let imageTypes []string = []string{"image/png", "image/jpeg", "image/gif", "image/bmp", "image/tiff"}

    internal func FileFormat(formats IReadOnlyList[string]) string {
      for format in formats { if format == "text/uri-list" { return format } }
      for format in formats { if format == "x-special/gnome-copied-files" { return format } }
      return ""
    }

    internal func ImageFormat(formats IReadOnlyList[string]) string {
      for preferred in imageTypes {
        if preferred == "image/tiff" && !OperatingSystem.IsMacOS() { continue }
        for format in formats { if format == preferred { return format } }
      }
      return ""
    }

    internal func Query() ClipboardFormats {
      if !Supported() { return ClipboardFormats(ClipboardReadStatus.Unsupported, []string{}) }
      SDL.ClearError()
      var count nuint
      let native = SDL.GetClipboardMimeTypes(&count)
      try {
        if native == nil && (SDL.GetErrorS() ?? "") != "" { return ClipboardFormats(ClipboardReadStatus.Failed, []string{}, (SDL.GetErrorS() ?? "")) }
        if count > nuint(128) { return ClipboardFormats(ClipboardReadStatus.TooLarge, []string{}, "Clipboard exceeds 128 MIME types") }
        let formats = List[string](int32(count) + 1)
        for i in 0 ... int32(count) {
          let value = BoundedUtf8(Marshal.ReadIntPtr(nint(native), i * nint.Size), 256)
          if !formats.Contains(value) { formats.Add(value) }
        }
        let nativeFiles = (OperatingSystem.IsWindows() && WindowsHasFiles()) || (OperatingSystem.IsMacOS() && MacHasFiles())
        if nativeFiles && !formats.Contains("text/uri-list") { formats.Add("text/uri-list") }
        return ClipboardFormats(if formats.Count == 0 { ClipboardReadStatus.Empty } else { ClipboardReadStatus.Success }, formats.ToArray())
      } catch (error ClipboardLimitException) { return ClipboardFormats(ClipboardReadStatus.TooLarge, []string{}, error.Message) }
      catch (error Exception) { return ClipboardFormats(ClipboardReadStatus.Failed, []string{}, error.Message) }
      finally { SDL.Free(native) }
    }

    internal func ReadFiles() ClipboardFiles {
      if !Supported() { return ClipboardFiles(ClipboardReadStatus.Unsupported, []string{}) }
      try {
        if OperatingSystem.IsWindows() && WindowsHasFiles() { return WindowsReadFiles() }
        if OperatingSystem.IsMacOS() && MacHasFiles() { return MacReadFiles() }
        let formats = Query()
        if formats.Status != ClipboardReadStatus.Success { return ClipboardFiles(formats.Status, []string{}, formats.Error) }
        let formatType = FileFormat(formats.Formats)
        if formatType == "" { return ClipboardFiles(ClipboardReadStatus.Empty, []string{}) }
        let data = ReadData(formatType, MaxFileListBytes)
        return ParseFiles(utf8.GetString(data), formatType == "x-special/gnome-copied-files")
      } catch (error NativePathLimitException) { return ClipboardFiles(ClipboardReadStatus.TooLarge, []string{}, "Clipboard: " + error.Message) }
      catch (error ClipboardLimitException) { return ClipboardFiles(ClipboardReadStatus.TooLarge, []string{}, error.Message) }
      catch (error Exception) { return ClipboardFiles(ClipboardReadStatus.Failed, []string{}, error.Message) }
    }

    internal func ParseFiles(value string, gnome bool) ClipboardFiles {
      let paths = List[string]()
      var units = 0
      using let lines = StringReader(value.TrimEnd(char(0)))
      if gnome {
        let operation = lines.ReadLine()
        if operation != "copy" && operation != "cut" { throw InvalidDataException("Invalid GNOME file-list operation") }
      }
      while let line = lines.ReadLine() {
        if line.Length == 0 || line[0] == '#' { continue }
        if !line.StartsWith("file:", StringComparison.OrdinalIgnoreCase)
          || !Uri.TryCreate(line, UriKind.Absolute, out var uri) || !uri.IsFile || uri.Query != "" || uri.Fragment != ""
          || (uri.Host != "" && !String.Equals(uri.Host, "localhost", StringComparison.OrdinalIgnoreCase)) {
            throw InvalidDataException("Clipboard file lists must contain local file URIs")
          }
        let local = if uri.Host == "" { uri } else { Uri("file://" + uri.AbsolutePath) }
        NativeFilePaths.Add(paths, local.LocalPath, ref units)
      }
      return ClipboardFiles(if paths.Count == 0 { ClipboardReadStatus.Empty } else { ClipboardReadStatus.Success }, paths.ToArray())
    }

    internal func ReadImage() ClipboardImage {
      if !Supported() { return ClipboardImage(ClipboardReadStatus.Unsupported) }
      try {
        let formats = Query()
        if formats.Status != ClipboardReadStatus.Success { return ClipboardImage(formats.Status, error: formats.Error) }
        let formatType = ImageFormat(formats.Formats)
        if formatType == "" { return ClipboardImage(ClipboardReadStatus.Empty) }
        let data = ReadData(formatType, MaxImageBytes)
        if data.Length == 0 { return ClipboardImage(ClipboardReadStatus.Empty, formatType) }
        if formatType == "image/bmp" { return ClipboardImage(ClipboardReadStatus.Success, "image/png", ClipboardBitmap.ToPng(data)) }
        if formatType == "image/tiff" { return ClipboardImage(ClipboardReadStatus.Success, "image/png", MacImageToPng(data)) }
        return ClipboardImage(ClipboardReadStatus.Success, formatType, data)
      } catch (error ClipboardLimitException) { return ClipboardImage(ClipboardReadStatus.TooLarge, error: error.Message) }
      catch (error Exception) { return ClipboardImage(ClipboardReadStatus.Failed, error: error.Message) }
    }

    private func ReadData(formatType string, limit int32) []uint8 {
      if OperatingSystem.IsWindows() && (formatType == "image/png" || formatType == "image/bmp") { return WindowsReadImageData(formatType, limit) }
      SDL.ClearError()
      var size nuint
      let native = SDL.GetClipboardData(formatType, &size)
      if native == nil { throw IOException("Native clipboard read failed: " + (SDL.GetErrorS() ?? "")) }
      try {
        if size > nuint(limit) { throw ClipboardLimitException("Clipboard payload exceeds its byte budget") }
        let bytes = [int32(size)]uint8
        Marshal.Copy(nint(native), bytes, 0, bytes.Length)
        return bytes
      } finally { SDL.Free(native) }
    }

    private func BoundedUtf8(value nint, limit int32) string {
      if value == nint(0) { return "" }
      var length int32
      while length <= limit && Marshal.ReadByte(value, length) != 0 { length++ }
      if length > limit { throw ClipboardLimitException("Native clipboard string exceeds its limit") }
      return Marshal.PtrToStringUTF8(value, length)
    }

    private func Supported() bool -> OperatingSystem.IsWindows() || OperatingSystem.IsMacOS() || OperatingSystem.IsLinux()
  }
}

internal class ClipboardLimitException : Exception {
  internal init(message string): base(message) { }
}
