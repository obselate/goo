package Goo

import System
import System.Collections.Generic
import System.IO
import System.Runtime.InteropServices

internal shared class FontScrollGate {
    internal func Run(fontPath string) {
        let requireReuse = Environment.GetEnvironmentVariable("GOO_FONT_SCROLL_REQUIRE_REUSE") != "0"
        let resolver = SystemFontResolvers.Current()
        let cjkPath = resolver.Find("NotoSansCJK-Regular", 400, false)
            ?? throw InvalidOperationException("CJK fixture font is missing")
        let emojiPath = resolver.Find("NotoColorEmoji", 400, false)
            ?? throw InvalidOperationException("Emoji fixture font is missing")
        using let opens = FontFileOpenCounter(cjkPath, emojiPath)
        let heapBytes = TextShaping.PrimaryFaceCacheBytesForTests()
        using let eviction = FontSource("GooFontScrollEviction", 400, false, File.ReadAllBytes(fontPath))
        eviction.Register()
        let cell = FontScrollCell()
        let window = Window{Root: cell, Size: LayoutSize(384, 72), }
        window.SmoothScrolling = false
        let retained = List[ShapedText]()
        try {
            for weight in 400 ... 408 {
                let shaped = TextShaping.Shape("备注 😀", "NotoSansCJK-Regular, NotoColorEmoji",
                    16f, weight, false, 0f, 1)
                if shaped.HasMissingGlyph || shaped.Runs.Count < 2 {
                    shaped.Dispose()
                    throw InvalidOperationException("CJK and emoji fallback did not shape")
                }
                retained.Add(shaped)
                TextShaping.FallbackPreloadForTests().GetAwaiter().GetResult()
                opens.Drain()
            }
            if requireReuse && TextShaping.PrimaryFaceCacheBytesForTests() != heapBytes {
                throw InvalidOperationException("Mapped font bytes were charged to the heap cache")
            }
            window.UpdateTree()
            for index in []int32{3, 6, 9, 0, 3, 0} {
                if !cell.Handle.ScrollToItem(index.ToString()) {
                    throw InvalidOperationException("Font fixture did not scroll")
                }
                window.UpdateTree()
                opens.Drain()
                if cell.Handle.ScrollOffset.Y != float64(index) * 24.0 {
                    throw InvalidOperationException("Font fixture scroll offset differs")
                }
            }
            TextShaping.FallbackPreloadForTests().GetAwaiter().GetResult()
            for weight in 1 ... 66 { TextShaping.Metrics(eviction.Family, 16f, weight, false) }
            var reused = 0
            for index in 0 ... retained.Count {
                using let shaped = TextShaping.Shape("备注 😀", "NotoSansCJK-Regular, NotoColorEmoji",
                    16f, 400 + index, false, 0f, 1)
                if shaped.HasMissingGlyph || shaped.Width != retained[index].Width
                    || shaped.Runs.Count != retained[index].Runs.Count {
                    throw InvalidOperationException("Scrolled text changed after typeface eviction")
                }
                for runIndex in 0 ... shaped.Runs.Count {
                    if Object.ReferenceEquals(shaped.Runs[runIndex].Provider, retained[index].Runs[runIndex].Provider) {
                        reused++
                    } else if requireReuse {
                        throw InvalidOperationException("Leased fallback typeface was not reused")
                    }
                }
                opens.Drain()
            }
            using let generation = FontSource.FromPath("GooFontScrollGeneration", 400, false, cjkPath)
            generation.Register()
            for weight in 400 ... 408 {
                using let shaped = TextShaping.Shape("备注 😀", "NotoSansCJK-Regular, NotoColorEmoji",
                    16f, weight, false, 0f, 1)
                if shaped.HasMissingGlyph { throw InvalidOperationException("Registry change lost fallback glyphs") }
                TextShaping.FallbackPreloadForTests().GetAwaiter().GetResult()
                opens.Drain()
            }
            if requireReuse && (opens.CjkOpens != 1 || opens.EmojiOpens != 1) {
                throw InvalidOperationException("Font fallback reopened a live file backing")
            }
            Console.WriteLine("FONT_SCROLL rows=24 viewports=7 weights=8 reused=" + reused.ToString()
                + " heapCacheBytes=" + TextShaping.PrimaryFaceCacheBytesForTests().ToString()
                + " cjkOpens=" + opens.CjkOpens.ToString() + " emojiOpens=" + opens.EmojiOpens.ToString()
                + " allocatedBytes=" + GC.GetTotalAllocatedBytes(false).ToString())
        } finally {
            window.Close()
            for shaped in retained { shaped.Dispose() }
        }
    }
}

internal class FontScrollCell : Cell {
    internal let Handle ElementHandle = ElementHandle{}
    private let source FontScrollSource = FontScrollSource()
    override func Build() Blob -> Virtual(){Source = source, Handle = Handle, Width = 384, Height = 72}
}

internal class FontScrollSource : VirtualSource {
    private let state FontScrollState = FontScrollState()
    public func State(current VirtualState?) VirtualState -> state
}

internal class FontScrollState : VirtualState {
    private var first int32 = -1
    private var pending int32
    public override func Realize(viewport VirtualViewport, output VirtualOutput) {
        pending = int32(viewport.ScrollOffset.Y / 24.0)
        for index in pending ... Math.Min(pending + 3, 24) {
            output.Add(VirtualItem{Key: index.ToString(), Index: index, Y: float64(index) * 24.0,
                Width: 384, Height: 24, Content: Text{Content: "备注 😀 " + index.ToString(),
                    FontFamily: "NotoSansCJK-Regular, NotoColorEmoji", FontSize: 16, FontWeight: 400 + index % 8}})
        }
        output.ContentSize = LayoutSize(384, 576)
        output.ItemCount = 24
    }
    public override func NeedsRealize(viewport VirtualViewport) bool -> int32(viewport.ScrollOffset.Y / 24.0) != first
    public override func OffsetOf(viewport VirtualViewport, key string) Point? ->
        Int32.TryParse(key, out var index) && index >= 0 && index < 24 ? Point{X: 0, Y: float64(index) * 24.0}: nil
    public override func Commit() { first = pending }
}

internal unsafe sealed class FontFileOpenCounter : IDisposable {
    private let descriptor int32
    private let cjkWatch int32
    private let emojiWatch int32
    internal var CjkOpens int32
    internal var EmojiOpens int32

    internal init(cjkPath string, emojiPath string) {
        descriptor = Initialize(0x80800)
        if descriptor < 0 { throw IOException("Cannot watch font opens") }
        cjkWatch = Watch(descriptor, cjkPath, 0x30u)
        emojiWatch = Watch(descriptor, emojiPath, 0x30u)
        if cjkWatch < 0 || emojiWatch < 0 {
            Dispose()
            throw IOException("Cannot watch fixture font files")
        }
    }

    internal func Drain() {
        let events * uint32 = stackalloc[1024]uint32
        var length = int32(Read(descriptor, nint(events), nuint(4096)))
        while length > 0 {
            var index = 0
            while index * 4 < length {
                if (events[index + 1] & 0x20u) != 0u {
                    if int32(events[index]) == cjkWatch { CjkOpens++ }
                    if int32(events[index]) == emojiWatch { EmojiOpens++ }
                }
                index = index + 4 + int32(events[index + 3] / 4u)
            }
            length = int32(Read(descriptor, nint(events), nuint(4096)))
        }
    }

    public func Dispose() { Close(descriptor) }

    shared {
        @DllImport("libc", EntryPoint: "inotify_init1")
        private func Initialize(flags int32) int32;
        @DllImport("libc", EntryPoint: "inotify_add_watch", CharSet: CharSet.Ansi)
        private func Watch(descriptor int32, path string, mask uint32) int32;
        @DllImport("libc", EntryPoint: "read")
        private func Read(descriptor int32, buffer nint, length nuint) nint;
        @DllImport("libc", EntryPoint: "close")
        private func Close(descriptor int32) int32;
    }
}
