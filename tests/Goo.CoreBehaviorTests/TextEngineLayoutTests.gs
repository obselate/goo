import Goo
import System
import System.Diagnostics
import Xunit

class TextEngineLayoutTests {
    @Fact
    func HandledTextSharesCacheWithoutEagerGeometryAndAnswersQueries() {
        let beforeLayoutStats = TextLayouts.CacheStats()
        let h1 = ElementHandle()
        let h2 = ElementHandle()
        let content = "Handled shared layout specimen for caret, hit test, and selection range queries"
        let reconciler = Reconciler{Res: Resolver{}}
        let root = reconciler.Mount(Container{
            Width: 260,
            Height: 300,
            Text{Key: "t1", Content: content, FontSize: 16, Handle: h1},
            Text{Key: "t2", Content: content, FontSize: 16, Handle: h2},
            Text{Key: "plain", Content: content, FontSize: 16},
        })
        try {
            Layout{}.Calculate(root, 260.0F, 300.0F)
            let n1 = root.Children[0]
            let n2 = root.Children[1]
            let nPlain = root.Children[2]
            Assert.True(n1.HasElementHandle)
            Assert.True(n2.HasElementHandle)
            Assert.False(nPlain.HasElementHandle)

            let l1 = TextLayouts.For(n1, 260.0F)
            let l2 = TextLayouts.For(n2, 260.0F)
            let lPlain = TextLayouts.For(nPlain, 260.0F)

            // ElementHandle must not block shared cache or wipe layout upon attach/detach!
            Assert.Same(l1, l2)
            Assert.Same(l1, lPlain)
            Assert.True(l1.Lines.Count > 1)
            for li in 0 ... l1.Lines.Count {
                Assert.True(l1.Lines[li].DisplayEnd >= l1.Lines[li].DisplayStart)
                Assert.Equal(l1.Lines[li].Content.Length, l1.Lines[li].DisplayEnd - l1.Lines[li].DisplayStart)
            }

            let afterStats = TextLayouts.CacheStats()
            Assert.True(afterStats.Hits >= beforeLayoutStats.Hits + 2L)

            // Binding and detaching another ElementHandle must NOT invalidate n1's layout!
            let hReplacement = ElementHandle()
            ElementHandles.Bind(n1, hReplacement, nil)
            Assert.Same(l1, n1.TextLayout)
            ElementHandles.Bind(n1, h1, nil)
            Assert.Same(l1, n1.TextLayout)

            // Lazy geometry must still answer TryGetTextCaretRect, TryGetTextPositionAt, TryCopyTextRangeRects accurately
            Assert.True(h1.TryGetTextCaretRect(TextPosition(0, TextAffinity.Downstream), TextCoordinateSpace.Element, out var startRect))
            Assert.True(h1.TryGetTextCaretRect(TextPosition(10, TextAffinity.Downstream), TextCoordinateSpace.Element, out var midRect))
            Assert.True(midRect.X > startRect.X)

            let hitPoint = Point{X: midRect.X + 0.5, Y: midRect.Y + midRect.Height * 0.5}
            Assert.True(h1.TryGetTextPositionAt(hitPoint, TextCoordinateSpace.Element, out var hitPos))
            Assert.InRange(hitPos.Offset, 9, 11)

            let rects = [16]ElementRect
            Assert.True(h1.TryCopyTextRangeRects(TextRange(0, content.Length), TextCoordinateSpace.Element, rects, out var required))
            Assert.Equal(l1.Lines.Count, required)
            for rIdx in 0 ... required {
                Assert.True(rects[rIdx].Width > 0.0)
                Assert.True(rects[rIdx].Height > 0.0)
            }
        } finally {
            NodeLifecycle.DisposeTree(root)
        }
    }

    @Fact
    func SharedLayoutAndRunShapeCachesAdmitPlainLongStyledAndIntervalResizes() {
        let longText = "LongParagraph " + String('m', 1200) + " tail words for wrapping cache admission"
        let reconciler = Reconciler{Res: Resolver{}}
        let r1 = TextStyleRange(TextRange(0, 5), Style{Color: Color.Rgb(255, 0, 0)})
        let r2 = TextStyleRange(TextRange(6, 5), Style{Color: Color.Rgb(0, 128, 255), TextDecoration: TextDecoration.Underline})
        let richRanges = []TextStyleRange{r1, r2}

        let root = reconciler.Mount(Container{
            Width: 640,
            Height: 800,
            // Long >1024 plain pair
            Text{Key: "long1", Content: longText, FontSize: 15},
            Text{Key: "long2", Content: longText, FontSize: 15},
            // Styled rich pair with handle
            Text{Key: "rich1", Content: "alpha beta gamma", FontSize: 16, StyleRanges: richRanges, Handle: ElementHandle()},
            Text{Key: "rich2", Content: "alpha beta gamma", FontSize: 16, StyleRanges: richRanges},
            // Wrapped text for interval resize hits
            Text{Key: "wrap", Content: "one two three four five six seven eight", FontSize: 16},
        })
        let richSibling = reconciler.Mount(Text{
            Key: "rich3", Content: "alpha beta gamma", FontSize: 16, StyleRanges: richRanges, Handle: ElementHandle(),
        })
        try {
            let resolver = Resolver{}
            resolver.FlushEffects()
            Layout{}.Calculate(root, 640.0F, 800.0F)

            let long1 = TextLayouts.For(root.Children[0], 300.0F)
            let long2 = TextLayouts.For(root.Children[1], 300.0F)
            Assert.Same(long1, long2)
            Assert.True(long1.Lines.Count > 1)

            // Coalescing check: rich1/rich2 have paint-only spans (color + underline) with identical font,
            // so rich1/rich2 share the same TextLayout and do not retain duplicate line.Shape!
            let richNode1 = root.Children[2]
            let richNode2 = root.Children[3]
            let rl1 = TextLayouts.For(richNode1, 300.0F)
            let rl2 = TextLayouts.For(richNode2, 300.0F)
            Assert.Same(rl1, rl2)
            Assert.NotNull(rl1.Rich)
            Assert.Null(rl1.Lines[0].Shape)
            Assert.Equal(4, rl1.Rich!!.Lines[0].Runs.Count)

            // Fresh sibling with ElementHandle hits the shared layout cache directly!
            let beforeRichHits = TextLayouts.CacheStats()
            let rl3 = TextLayouts.For(richSibling, 300.0F)
            Assert.Same(rl1, rl3)
            let afterRichStats = TextLayouts.CacheStats()
            Assert.True(afterRichStats.Hits > beforeRichHits.Hits)
            Assert.True(afterRichStats.Bytes > 0L)
            Assert.True(afterRichStats.Entries > 0)

            // Interval-width cache hit for wrapped text when resizing within [CacheMinWidth, CacheMaxWidth)
            let wrapNode = root.Children[4]
            let wrappedInitial = TextLayouts.For(wrapNode, 180.0F)
            Assert.True(wrappedInitial.Lines.Count > 1)
            let safeResize = (wrappedInitial.CacheMinWidth + MathF.Min(wrappedInitial.CacheMaxWidth, wrappedInitial.CacheMinWidth + 5.0F)) * 0.5F
            if safeResize >= wrappedInitial.CacheMinWidth && safeResize < wrappedInitial.CacheMaxWidth {
                let wrappedHit = TextLayouts.For(wrapNode, safeResize)
                Assert.Same(wrappedInitial, wrappedHit)
            }
            // Crossing a break threshold misses and re-wraps accurately
            let crossBreak = TextLayouts.For(wrapNode, wrappedInitial.CacheMaxWidth + 40.0F)
            Assert.False(Object.ReferenceEquals(wrappedInitial, crossBreak))

            // Run shape cache hits for repeated identical isolated words/tokens
            let beforeRun = TextShaping.RunShapeCacheStats()
            let _ = TextShaping.Shape("repeated_token", "sans-serif", 16.0F, 400, false, 0.0F, 1)
            let _ = TextShaping.Shape("repeated_token", "sans-serif", 16.0F, 400, false, 0.0F, 1)
            let afterRun = TextShaping.RunShapeCacheStats()
            Assert.True(afterRun.Hits > beforeRun.Hits)
            Assert.True(afterRun.Bytes > 0L)
            Assert.True(afterRun.Entries > 0)
        } finally {
            NodeLifecycle.DisposeTree(richSibling)
            NodeLifecycle.DisposeTree(root)
        }
    }

    @Fact
    func BidiRichTextSharesLayoutAndAnswersHandleQueries() {
        let h1 = ElementHandle()
        let content = "Shape  مرحبا بالعالم"
        let r1 = TextStyleRange(TextRange(0, 3), Style{Color: Color.Rgb(255, 0, 0)})
        let r2 = TextStyleRange(TextRange(7, 12), Style{Color: Color.Rgb(0, 200, 0), TextDecoration: TextDecoration.Underline})
        let richRanges = []TextStyleRange{r1, r2}

        let reconciler = Reconciler{Res: Resolver{}}
        let root = reconciler.Mount(Container{
            Width: 640,
            Height: 160,
            Text{Key: "bidi1", Content: content, FontSize: 28, StyleRanges: richRanges, Handle: h1},
            Text{Key: "bidi2", Content: content, FontSize: 28, StyleRanges: richRanges},
        })
        try {
            Layout{}.Calculate(root, 640.0F, 160.0F)
            let l1 = TextLayouts.For(root.Children[0], 640.0F)
            let l2 = TextLayouts.For(root.Children[1], 640.0F)
            Assert.Same(l1, l2)
            Assert.NotNull(l1.Rich)
            let runs = l1.Rich!!.Lines[0].Runs
            Assert.Equal(4, runs.Count)
            // Visual placement for Arabic runs must stay non-negative and keep run[3] to the left of run[2].
            Assert.True(runs[3].X >= runs[1].X + 40.0F)
            Assert.True(runs[2].X >= runs[3].X)

            Assert.True(h1.TryGetTextCaretRect(TextPosition(10, TextAffinity.Downstream), TextCoordinateSpace.Element, out var arabicCaret))
            Assert.True(arabicCaret.X > 0.0)
            let hitPt = Point{X: arabicCaret.X - 1.0, Y: arabicCaret.Y + arabicCaret.Height * 0.5}
            Assert.True(h1.TryGetTextPositionAt(hitPt, TextCoordinateSpace.Element, out var hitPos))
            Assert.InRange(hitPos.Offset, 0, content.Length)

            let rects = [8]ElementRect
            Assert.True(h1.TryCopyTextRangeRects(TextRange(0, content.Length), TextCoordinateSpace.Element, rects, out var req))
            Assert.Equal(4, req)
            var totalW = 0.0
            for idx in 0 ... req {
                Assert.True(rects[idx].Width > 0.0)
                Assert.True(rects[idx].X >= 0.0)
                totalW = totalW + rects[idx].Width
            }
            Assert.True(totalW > 250.0)
        } finally {
            NodeLifecycle.DisposeTree(root)
        }
    }

    @Fact
    func WrappedLayoutReshapesSafelyAcrossKerningBreak() {
        using let font = FontSource.FromPath(
            "FlexConfUnitWrap",
            400,
            false,
            System.IO.Path.Combine(AppContext.BaseDirectory, "Layout/VendSans-VariableFont_wght.ttf"),
            0u,
            []FontVariation{FontVariation("wght", 400.0F)}
        )
        font.Register()
        let reconciler = Reconciler{Res: Resolver{}}
        let root = reconciler.Mount(Container{
            Width: 64,
            Height: 200,
            Text{
                Key: "wrapKerning",
                Content: "Flex box",
                FontFamily: "FlexConfUnitWrap",
                FontSize: 12,
                LineHeight: 1.2,
                MinWidth: 0,
                TextWrap: TextWrap.Wrap,
            },
        })
        try {
            let textNode = root.Children[0]
            let layout908 = TextLayouts.For(textNode, 9.08F)
            Assert.Equal(7, layout908.Lines.Count)
            Assert.Equal("F", layout908.Lines[0].Content)
            Assert.Equal("l", layout908.Lines[1].Content)
            Assert.True(layout908.CacheMaxWidth < 9.5F)

            let layout906 = TextLayouts.For(textNode, 9.0625F)
            Assert.Same(layout908, layout906)

            let layoutWider = TextLayouts.For(textNode, 10.5F)
            Assert.False(Object.ReferenceEquals(layout908, layoutWider))
            Assert.Equal("Fl", layoutWider.Lines[0].Content)
        } finally {
            NodeLifecycle.DisposeTree(root)
        }
    }
}
