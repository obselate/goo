package Goo

import System
import System.Collections.Generic
import System.IO
import System.Threading
import System.Threading.Tasks

/// Loads local PNG assets outside painting and shares immutable decoded pixels.
/// Each result is an independently disposable owner. Mounted leases survive both
/// result and cache disposal. Paths are snapshots; create a new cache to reload.
public class ImageSourceCache : IDisposable {
  private let gate object = Object()
  private let serial SemaphoreSlim = SemaphoreSlim(1, 1)
  private let shutdown CancellationTokenSource = CancellationTokenSource()
  private let stopping CancellationToken
  private let sources Dictionary[string, ImageSource]
  private let maxBytes int32
  private let maxEntries int32
  private var usedBytes int32
  private var disposed bool

  /// Creates a cache bounded by decoded RGBA bytes and unique paths.
  /// Limits must be positive; the default budget is 64 MiB and 128 paths.
  public init(maxDecodedBytes int32 = 67108864, maxEntries int32 = 128) {
    if maxDecodedBytes <= 0 { throw ArgumentOutOfRangeException("maxDecodedBytes") }
    if maxEntries <= 0 { throw ArgumentOutOfRangeException("maxEntries") }
    maxBytes = maxDecodedBytes
    this.maxEntries = maxEntries
    stopping = shutdown.Token
    sources = Dictionary[string, ImageSource](OperatingSystem.IsWindows()
      ? StringComparer.OrdinalIgnoreCase : StringComparer.Ordinal)
  }

  /// Loads a local PNG and returns an owned source for Image.Source.
  /// File, decoding, unsupported-format, and capacity errors fault the task.
  public func LoadAsync(path string) Task[ImageSource] -> LoadAsync(path, CancellationToken.None)

  /// Loads a local PNG with cancellation before reading, during validation, and
  /// before publication. Cancellation affects only this caller. Concurrent loads
  /// serialize decoding and reuse completed paths; failed loads can be retried.
  public async func LoadAsync(path string, cancellationToken CancellationToken) ImageSource {
    if String.IsNullOrWhiteSpace(path) { throw ArgumentException("A local image path is required", "path") }
    let canonical = System.IO.Path.GetFullPath(path)
    using let linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, stopping)
    await serial.WaitAsync(linked.Token).ConfigureAwait(false)
    try {
      return await Task.Run[ImageSource](() -> Load(canonical, linked.Token), linked.Token).ConfigureAwait(false)
    } finally { serial.Release() }
  }

  private func Load(path string, token CancellationToken) ImageSource {
    token.ThrowIfCancellationRequested()
    lock gate {
      if disposed { throw ObjectDisposedException("ImageSourceCache") }
      if sources.TryGetValue(path, out var existing) { return existing.RetainSource() }
      if sources.Count >= maxEntries { throw InvalidOperationException("Image cache path budget is full") }
    }
    let decoded = PngImageDecoder.Load(path, token)
    var accepted = false
    try {
      token.ThrowIfCancellationRequested()
      lock gate {
        if disposed { throw ObjectDisposedException("ImageSourceCache") }
        let bytes = decoded.Width * decoded.Height * 4
        if bytes > maxBytes - usedBytes { throw InvalidOperationException("Image cache decoded byte budget is full") }
        sources.Add(path, decoded)
        usedBytes += bytes
        accepted = true
        return decoded.RetainSource()
      }
    } finally { if !accepted { decoded.Dispose() } }
  }

  /// Cancels queued/in-flight loads and releases cached owners. Existing returned
  /// sources and mounted leases remain valid. Repeated disposal is harmless.
  public func Dispose() {
    lock gate {
      if disposed { return }
      disposed = true
      for source in sources.Values { source.Dispose() }
      sources.Clear()
      usedBytes = 0
    }
    shutdown.Cancel()
    shutdown.Dispose()
  }
}
