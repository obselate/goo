package Goo

import System
import System.Collections.Generic

/// Reports a native clipboard query/read outcome independently of payload contents.
public enum ClipboardReadStatus { Success; Empty; Unsupported; TooLarge; Failed }

/// Describes the available clipboard MIME representations without reading payload bytes.
public class ClipboardFormats {
  private let status ClipboardReadStatus
  private let formats IReadOnlyList[string]
  private let error string
  /// Gets the query outcome.
  public prop Status ClipboardReadStatus{ get -> status }
  /// Gets an immutable owned list of available MIME representations.
  public prop Formats IReadOnlyList[string]{ get -> formats }
  /// Gets whether a supported file-list representation is available.
  public prop HasFiles bool{ get -> ClipboardTransfer.FileFormat(formats) != "" }
  /// Gets whether a supported image representation is available.
  public prop HasImage bool{ get -> ClipboardTransfer.ImageFormat(formats) != "" }
  /// Gets a native failure or limit explanation, or an empty string.
  public prop Error string{ get -> error }
  internal init(status ClipboardReadStatus, formats []string, error string = "") {
    this.status = status
    this.formats = Array.AsReadOnly[string](formats)
    this.error = error
  }
}

/// Contains an immutable owned file-path list copied from the native clipboard.
public class ClipboardFiles {
  private let status ClipboardReadStatus
  private let paths IReadOnlyList[string]
  private let error string
  /// Gets the read outcome; Empty differs from native failure and unsupported access.
  public prop Status ClipboardReadStatus{ get -> status }
  /// Gets absolute file paths in clipboard order, without reading any file contents.
  public prop Paths IReadOnlyList[string]{ get -> paths }
  /// Gets a native failure or limit explanation, or an empty string.
  public prop Error string{ get -> error }
  internal init(status ClipboardReadStatus, paths []string, error string = "") {
    this.status = status
    this.paths = Array.AsReadOnly[string](paths)
    this.error = error
  }
}

/// Contains encoded image bytes copied into managed ownership from the clipboard.
public class ClipboardImage {
  private let status ClipboardReadStatus
  private let contentType string
  private let bytes ReadOnlyMemory[uint8]
  private let error string
  /// Gets the read outcome.
  public prop Status ClipboardReadStatus{ get -> status }
  /// Gets the declared MIME content type; native bitmaps are normalized to image/png.
  public prop ContentType string{ get -> contentType }
  /// Gets owned encoded bytes that remain valid after clipboard changes or window close.
  public prop Bytes ReadOnlyMemory[uint8]{ get -> bytes }
  /// Gets a native failure or limit explanation, or an empty string.
  public prop Error string{ get -> error }
  internal init(status ClipboardReadStatus, contentType string = "", error string = "") {
    this.status = status
    this.contentType = contentType
    this.bytes = ReadOnlyMemory[uint8].Empty
    this.error = error
  }
  internal init(status ClipboardReadStatus, contentType string, bytes []uint8, error string = "") {
    this.status = status
    this.contentType = contentType
    this.bytes = ReadOnlyMemory[uint8](bytes)
    this.error = error
  }
}

/// Reads bounded native clipboard data on the window's owning UI thread.
public partial class Window {
  /// Queries MIME availability without reading image bytes or file contents.
  /// @returns An owned format list and explicit query status.
  public func GetClipboardFormats() ClipboardFormats {
    requireClipboardThread("Window.GetClipboardFormats")
    if embeddedHost != nil { return ClipboardFormats(ClipboardReadStatus.Unsupported, []string{}, "Embedded clipboard data is host-owned") }
    return ClipboardTransfer.Query()
  }

  /// Reads at most 4096 absolute paths and 1048576 UTF-16 path units from the current clipboard.
  /// @returns Owned paths and explicit read status; the clipboard may have changed since a format query.
  public func ReadClipboardFiles() ClipboardFiles {
    requireClipboardThread("Window.ReadClipboardFiles")
    if embeddedHost != nil { return ClipboardFiles(ClipboardReadStatus.Unsupported, []string{}, "Embedded clipboard data is host-owned") }
    return ClipboardTransfer.ReadFiles()
  }

  /// Reads at most 64 MiB of encoded image data; native bitmap conversion also limits decoded RGBA to 64 MiB.
  /// @returns Owned encoded bytes with a MIME type and explicit read status.
  public func ReadClipboardImage() ClipboardImage {
    requireClipboardThread("Window.ReadClipboardImage")
    if embeddedHost != nil { return ClipboardImage(ClipboardReadStatus.Unsupported, error: "Embedded clipboard data is host-owned") }
    return ClipboardTransfer.ReadImage()
  }

  private func requireClipboardThread(operation string) {
    requireUiThread(operation)
    if !IsOpen || host == nil || host?.IsClosing == true {
      throw InvalidOperationException("Clipboard access requires an open window")
    }
  }
}
