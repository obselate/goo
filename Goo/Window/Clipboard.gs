package Goo

import System
import System.Collections.Generic
import System.Threading.Tasks

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

/// Reports a plain-text clipboard read outcome.
public enum ClipboardTextStatus { Success; Empty; Unsupported; TooLarge; Failed }

/// Contains owned clipboard text and an explicit native outcome.
public sealed class ClipboardTextResult {
  /// Gets the read outcome.
  public prop Status ClipboardTextStatus { get; }
  /// Gets the copied text, or an empty string outside Success.
  public prop Text string { get; }
  /// Gets native failure detail, or an empty string.
  public prop Error string { get; }
  internal init(status ClipboardTextStatus, text string = "", error string = "") {
    Status = status
    Text = text
    Error = error
  }
}

/// Reads and writes clipboard data on an open window's UI thread.
public sealed class WindowClipboard {
  private let owner Window
  internal init(owner Window) { this.owner = owner }

  /// Reads bounded plain text with an explicit native outcome.
  /// @returns Owned text and status. Native failures do not throw.
  public func ReadText() ClipboardTextResult {
    owner.RequireClipboardThread("WindowClipboard.ReadText")
    return owner.ClipboardHost.GetClipboardText()
  }

  /// Publishes plain text without throwing for native failures.
  /// @param value The text to publish.
  /// @returns The native publication outcome.
  public func WriteText(value string) ClipboardWriteResult {
    owner.RequireClipboardThread("WindowClipboard.WriteText")
    if value == nil { throw ArgumentNullException("value") }
    return owner.ClipboardHost.SetClipboardText(value)
  }

  /// Queries MIME availability without reading image bytes or file contents.
  /// @returns An owned format list and explicit query status.
  public func GetFormats() ClipboardFormats {
    owner.RequireClipboardThread("WindowClipboard.GetFormats")
    if let embedded = owner.ClipboardEmbeddedHost { return embedded.QueryClipboardFormats() }
    return ClipboardTransfer.Query()
  }

  /// Reads at most 4096 absolute paths and 1048576 UTF-16 path units from the current clipboard.
  /// @returns Owned paths and explicit read status; the clipboard may have changed since a format query.
  public func ReadFiles() ClipboardFiles {
    owner.RequireClipboardThread("WindowClipboard.ReadFiles")
    if owner.ClipboardEmbeddedHost != nil { return ClipboardFiles(ClipboardReadStatus.Unsupported, []string{}, "Embedded clipboard data is host-owned") }
    return ClipboardTransfer.ReadFiles()
  }

  /// Reads at most 64 MiB of encoded image data; native bitmap conversion also limits decoded RGBA to 64 MiB.
  /// @returns Owned encoded bytes with a MIME type and explicit read status.
  public func ReadImage() ClipboardImage {
    owner.RequireClipboardThread("WindowClipboard.ReadImage")
    if owner.ClipboardEmbeddedHost != nil { return ClipboardImage(ClipboardReadStatus.Unsupported, error: "Embedded clipboard data is host-owned") }
    return ClipboardTransfer.ReadImage()
  }

  /// Copies requested available MIME alternatives and URI references from one native clipboard offer.
  /// @param contentTypes Exact MIME types to read, including text/uri-list for document references.
  /// @returns Owned data and explicit status, with no partial payload on a native read failure.
  public func ReadDataAsync(contentTypes IReadOnlyList[string]) Task[ClipboardDataResult] {
    owner.RequireClipboardThread("WindowClipboard.ReadDataAsync")
    let types = ClipboardTransfer.ValidateTypes(contentTypes)
    if let embedded = owner.ClipboardEmbeddedHost { return embedded.ReadClipboardDataAsync(types).WaitAsync(owner.Closed) }
    return Task.FromResult(ClipboardTransfer.ReadTransfer(types))
  }

  /// Publishes every MIME alternative and URI reference in one native clipboard publication.
  /// @param data The immutable selection to publish without opening referenced documents.
  /// @param intent Copy or a supported deferred file-cut hint, never an instruction to delete source files.
  /// @returns Explicit publication status. Success does not confirm that a paste occurred.
  public func WriteAsync(data TransferData, intent ClipboardIntent = ClipboardIntent.Copy) Task[ClipboardWriteResult] {
    owner.RequireClipboardThread("WindowClipboard.WriteAsync")
    if data == nil { throw ArgumentNullException("data") }
    if intent != ClipboardIntent.Copy && intent != ClipboardIntent.Cut { throw ArgumentOutOfRangeException("intent") }
    if intent == ClipboardIntent.Cut && data.Uris.Count == 0 { throw ArgumentException("Cut requires document references", "intent") }
    if data.Representations.Count == 0 && data.Uris.Count == 0 { throw ArgumentException("Clipboard publication requires data", "data") }
    if let embedded = owner.ClipboardEmbeddedHost { return embedded.WriteClipboardAsync(data, intent).WaitAsync(owner.Closed) }
    return Task.FromResult(ClipboardTransfer.WriteTransfer(data, intent))
  }

}

/// Provides clipboard services on the window's owning UI thread.
public partial class Window {
  internal prop ClipboardHost WindowHost { get -> host!! }
  internal prop ClipboardEmbeddedHost EmbeddedWindowHost? { get -> embeddedHost }
  internal func RequireClipboardThread(operation string) {
    requireUiThread(operation)
    if !IsOpen || host == nil || host?.IsClosing == true {
      throw InvalidOperationException("Clipboard access requires an open window")
    }
  }
}
