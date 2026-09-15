package GooImageLoadingSmoke

import Goo
import System
import System.IO
import System.Threading

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

for name in []string {"local-rgb.jpg", "local-progressive.jpg", "local-cmyk.jpg", "local-transparent.gif", "local-animated.gif"} {
  using let formats = ImageSourceCache()
  using let image = formats.LoadAsync(Path.Combine(AppContext.BaseDirectory, "Assets", name)).GetAwaiter().GetResult()
  using let owner = formats.LoadAsync(Path.Combine(AppContext.BaseDirectory, "Assets", name)).GetAwaiter().GetResult()
  if image.Width != 3 || image.Height != 2 { throw InvalidOperationException("Packaged image dimensions are wrong: " + name) }
  image.Dispose()
  formats.Dispose()
  using let lease = owner.Acquire()
  if lease.IsFailed { throw InvalidOperationException("Image ownership failed: " + name) }
}
Console.WriteLine("image-loading: jpeg_baseline/progressive/cmyk=3x2 gif_transparent/first_frame=3x2 owners=verified")
