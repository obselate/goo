package Goo

import System
import System.Collections.Generic
import System.Threading
import System.Threading.Tasks

/// Shares a deferred image across mounted leases. Keep this source in a field or model.
public class AsyncImageSource : ImageSourceProvider, IDisposable {
  private let gate object = Object()
  private let load (CancellationToken) -> Task[ImageSource]
  private let leases List[ImageSourceLease] = List[ImageSourceLease]()
  private var pending CancellationTokenSource?
  private var result ImageSource?
  private var disposed bool

  /// Creates a source whose Task-returning loader runs off the UI thread.
  /// The source owns the returned image. The last pending lease cancels the load.
  public init(load (CancellationToken) -> Task[ImageSource]) {
    if Object.ReferenceEquals(load, nil) { throw ArgumentNullException("load") }
    this.load = load
  }

  /// Gets the fixed version of this source.
  public prop ContentVersion uint64 { get -> 1uL }
  /// Never raised. Completion is delivered through each lease.
  public event ContentChanged Action

  /// Acquires the shared result or starts a load. Failed loads can be retried.
  public func Acquire() ImageSourceLease {
    var start CancellationTokenSource?
    var lease ImageSourceLease
    lock gate {
      if disposed { throw ObjectDisposedException("AsyncImageSource") }
      if let image = result { return image.Acquire() }
      lease = ImageSourceLease()
      leases.Add(lease)
      lease.Released += () -> release(lease)
      if pending == nil {
        start = CancellationTokenSource()
        pending = start
      }
    }
    if let cancellation = start { Task.Run(Func[Task](() -> run(cancellation))) }
    return lease
  }

  private func release(lease ImageSourceLease) {
    var cancellation CancellationTokenSource?
    lock gate {
      leases.Remove(lease)
      if leases.Count == 0 {
        cancellation = pending
        pending = nil
      }
    }
    try { cancellation?.Cancel() } catch (error ObjectDisposedException) { }
  }

  private async func run(cancellation CancellationTokenSource) Task {
    var image ImageSource?
    try {
      image = await load(cancellation.Token).ConfigureAwait(false)
      if image == nil { throw InvalidOperationException("The image loader returned no source") }
    } catch (error Exception) {
    }
    var waiting []ImageSourceLease = Array.Empty[ImageSourceLease]()
    var completion ImageSource?
    lock gate {
      if Object.ReferenceEquals(pending, cancellation) && !disposed {
        pending = nil
        waiting = leases.ToArray()
        leases.Clear()
        if !cancellation.IsCancellationRequested {
          result = image
          completion = image?.RetainSource()
          image = nil
        }
      }
      cancellation.Dispose()
    }
    image?.Dispose()
    try {
      for lease in waiting {
        if let loaded = completion { lease.Complete(loaded) } else { lease.Fail() }
      }
    } finally { completion?.Dispose() }
  }

  /// Cancels pending work and releases the cached image. Existing completed leases stay valid.
  public func Dispose() {
    var image ImageSource?
    var cancellation CancellationTokenSource?
    var waiting []ImageSourceLease
    lock gate {
      if disposed { return }
      disposed = true
      cancellation = pending
      pending = nil
      image = result
      result = nil
      waiting = leases.ToArray()
      leases.Clear()
    }
    try { cancellation?.Cancel() } catch (error ObjectDisposedException) { }
    for lease in waiting { lease.Fail() }
    image?.Dispose()
  }
}
