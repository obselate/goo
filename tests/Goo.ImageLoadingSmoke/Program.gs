package GooImageLoadingSmoke

import System
import System.IO
import System.Threading
import Goo

let path = Path.Combine(AppContext.BaseDirectory, "Assets", "local-rgba.png")
using let cache = ImageSourceCache()
using let first = cache.LoadAsync(path).GetAwaiter().GetResult()
using let second = cache.LoadAsync(path).GetAwaiter().GetResult()
if first.Width != 2 || first.Height != 2 { throw InvalidOperationException("Packaged PNG dimensions are wrong") }
using let cancellation = CancellationTokenSource()
cancellation.Cancel()
var cancelled = false
try {
  using let unexpected = cache.LoadAsync(path, cancellation.Token).GetAwaiter().GetResult()
} catch (error OperationCanceledException) { cancelled = true }
if !cancelled { throw InvalidOperationException("PNG loading ignored cancellation") }
first.Dispose()
cache.Dispose()
using let retained = second.Acquire()
if retained.IsFailed { throw InvalidOperationException("Cache disposal invalidated an owned source") }
Console.WriteLine("image-loading: packaged_png=2x2 cancellation=verified owners=verified leases=verified")
