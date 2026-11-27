import Goo
import System
import System.IO
import Xunit

class TextEngineRetentionTests {
    @Fact
    func WrappedAndRichTextRetainCachedSegmentsAndInvalidateOnLayoutOrStyleChanges() {
        using let font = FontSource.FromPath(
            "TextEngineRetainFont",
            400,
            false,
            Path.Combine(AppContext.BaseDirectory, "Layout/VendSans-VariableFont_wght.ttf"),
            0u,
            []FontVariation{FontVariation("wght", 400.0F)}
        )
        font.Register()
        let richPlain = []TextStyleRange{
            TextStyleRange(TextRange(0, 5), Style{Color: Color.Rgb(220, 40, 40)}),
            TextStyleRange(TextRange(6, 4), Style{Color: Color.Rgb(40, 120, 240)}),
        }
        let richUnderlined = []TextStyleRange{
            TextStyleRange(TextRange(0, 5), Style{Color: Color.Rgb(220, 40, 40), TextDecoration: TextDecoration.Underline}),
        }
        let create = (wrapWidth float64, align TextAlign, rich []TextStyleRange, decorated []TextStyleRange, siblingTick Color) -> Container{
            Width: 320,
            Height: 320,
            Container{ Key: "tick", Width: 8, Height: 8, BackgroundColor: siblingTick },
            Text{
                Key: "wrapped",
                Content: "Alpha beta gamma delta epsilon zeta",
                FontFamily: "TextEngineRetainFont",
                FontSize: 16,
                LineHeight: 1.25,
                Width: Length(wrapWidth),
                Height: 120,
                TextWrap: TextWrap.Wrap,
                TextAlign: align,
            },
            Text{
                Key: "richPlain",
                Content: "Hello Rich World",
                FontFamily: "TextEngineRetainFont",
                FontSize: 16,
                LineHeight: 1.25,
                Width: 200,
                Height: 60,
                TextWrap: TextWrap.Wrap,
                StyleRanges: rich,
            },
            Text{
                Key: "richDecorated",
                Content: "Underlined Rich",
                FontFamily: "TextEngineRetainFont",
                FontSize: 16,
                LineHeight: 1.25,
                Width: 200,
                Height: 40,
                TextWrap: TextWrap.Wrap,
                StyleRanges: decorated,
            },
        }
        using let atlasSet = VulkanTextAtlasSet(262144uL)
        let textScene = VulkanTextScene(atlasSet)
        let resolver = Resolver{}
        let reconciler = Reconciler{Res: resolver}
        let root = reconciler.Mount(create(96.0, TextAlign.Start, richPlain, richUnderlined, Color.Rgb(1, 2, 3)))
        let compiler = VulkanSceneCompiler(64)
        compiler.SetTextScene(textScene)
        try {
            let layoutEngine = Layout()
            layoutEngine.Calculate(root, 320.0F, 320.0F)

            // Wrapped node must lay out onto multiple lines.
            let wrappedNode = root.Children[1]
            let wrappedLayout = TextLayouts.For(wrappedNode, BoxGeometry.ContentWidth(wrappedNode))
            Assert.True(wrappedLayout.Lines.Count > 1)

            // Frame 1: builds retained snapshots for wrapped plain + undecorated rich text, excluding decorated rich text.
            compiler.Compile(root, Color.Transparent, 320.0F, 320.0F)
            Assert.Equal(2uL, compiler.RetainedTextRebuildCount)
            Assert.Equal(0uL, compiler.RetainedTextHitCount)
            Assert.Equal(1uL, compiler.RetainedTextFallbackCount)
            Assert.True(compiler.Frame.CachedTextSegmentCount >= wrappedLayout.Lines.Count + 1)

            // Verify zero per-glyph ResourceRefs amplification across all emitted segments in frame.
            var totalRuns int32 = 0
            for idx in 0 ... compiler.Frame.CachedTextSegmentCount {
                let seg = compiler.Frame.CachedTextSegments[idx].Segment!!
                totalRuns = totalRuns + seg.RunCount
            }
            Assert.Equal(totalRuns, compiler.Frame.ResourceRefCount)

            // Frame 2: untouched tree hits root range cache (ProtectRangeResources with slotHint + 1 ResourceId per run).
            compiler.Compile(root, Color.Transparent, 320.0F, 320.0F)
            Assert.Equal(1, compiler.RangeHitCount)

            // Frame 3: dirty sibling forces root recompile -> unchanged wrapped & rich text nodes must hit TryAppendRetainedText!
            reconciler.Diff(root, create(96.0, TextAlign.Start, richPlain, richUnderlined, Color.Rgb(9, 8, 7)))
            resolver.FlushEffects()
            compiler.Compile(root, Color.Transparent, 320.0F, 320.0F)
            Assert.Equal(2uL, compiler.RetainedTextHitCount)
            Assert.Equal(2uL, compiler.RetainedTextRebuildCount)

            // Frame 4: change wrap width and rich span color -> invalidates and rebuilds accurately.
            let updatedRich = []TextStyleRange{
                TextStyleRange(TextRange(0, 5), Style{Color: Color.Rgb(30, 180, 90)}),
                TextStyleRange(TextRange(6, 4), Style{Color: Color.Rgb(40, 120, 240)}),
            }
            reconciler.Diff(root, create(180.0, TextAlign.Center, updatedRich, richUnderlined, Color.Rgb(9, 8, 7)))
            resolver.FlushEffects()
            layoutEngine.Calculate(root, 320.0F, 320.0F)
            compiler.Compile(root, Color.Transparent, 320.0F, 320.0F)
            Assert.True(compiler.RetainedTextInvalidationCount >= 2uL)
            Assert.Equal(4uL, compiler.RetainedTextRebuildCount)

            // Frame 5: dirty sibling again -> hits retained snapshots at updated layout/styles.
            reconciler.Diff(root, create(180.0, TextAlign.Center, updatedRich, richUnderlined, Color.Rgb(12, 13, 14)))
            resolver.FlushEffects()
            compiler.Compile(root, Color.Transparent, 320.0F, 320.0F)
            Assert.Equal(4uL, compiler.RetainedTextHitCount)

            // Unmount tree -> ForgetOwner recycles segments into pool; mounting a fresh text reuses a pooled segment instance.
            let retiredSegment = compiler.Frame.CachedTextSegments[0].Segment!!
            let retiredRecordCapacity = retiredSegment.Records.Length
            NodeLifecycle.DisposeTree(root)

            let replacement = reconciler.Mount(Container{
                Width: 320,
                Height: 160,
                Text{
                    Key: "freshWrapped",
                    Content: "Alpha beta gamma delta",
                    FontFamily: "TextEngineRetainFont",
                    FontSize: 16,
                    LineHeight: 1.25,
                    Width: 180,
                    Height: 120,
                    TextWrap: TextWrap.Wrap,
                },
            })
            try {
                layoutEngine.Calculate(replacement, 320.0F, 160.0F)
                compiler.Compile(replacement, Color.Transparent, 320.0F, 160.0F)
                Assert.True(compiler.Frame.CachedTextSegmentCount >= 1)
                var reusedAny = false
                for segIdx in 0 ... compiler.Frame.CachedTextSegmentCount {
                    if Object.ReferenceEquals(retiredSegment, compiler.Frame.CachedTextSegments[segIdx].Segment) {
                        reusedAny = true
                    }
                }
                Assert.True(reusedAny || retiredRecordCapacity > 4096)
            } finally {
                NodeLifecycle.DisposeTree(replacement)
            }
        } finally {
            if root.MountGeneration > 0uL {
                NodeLifecycle.DisposeTree(root)
            }
        }
    }

    @Fact
    func TextHintingAt12PxPreservesVisibleGlyphExtentsAndAtlasEncoding() {
        let fontPath = Path.Combine(AppContext.BaseDirectory, "Layout/VendSans-VariableFont_wght.ttf")
        using let fontData = FontData.FromPath(fontPath)
        using let font = VulkanTextFont(fontData, 12u, 0u, nil)
        Assert.True(font.OutlineHintingAvailable)
        let options = VulkanTextShapingOptions{
            Direction: 4u,
            Script: 0x4C61746Eu,
            Language: "en",
            ClusterLevel: 0u,
            Flags: 0u,
            Features: nil,
        }
        let shapingWorkspace = VulkanTextShapingWorkspace(32)
        let shaped = font.ShapeInto("Ag", options, shapingWorkspace)
        Assert.Equal(VulkanTextProviderAbi.Success, shaped.Status)
        Assert.True(shapingWorkspace.GlyphCount >= 2)

        let workspace12 = VulkanTextProviderWorkspace([4096]uint8)
        let res12 = font.EncodeGlyphInto(shapingWorkspace.GlyphBuffer[0].GlyphId, workspace12, 12)
        Assert.Equal(VulkanTextProviderAbi.Success, res12.Status)
        Assert.True(res12.Count > 0)
        Assert.True(workspace12.GlyphExtents.Width > 0)
        Assert.True(workspace12.GlyphExtents.Height < 0)

        let workspace40 = VulkanTextProviderWorkspace([4096]uint8)
        let res40 = font.EncodeGlyphInto(shapingWorkspace.GlyphBuffer[0].GlyphId, workspace40, 0)
        Assert.Equal(VulkanTextProviderAbi.Success, res40.Status)
        Assert.True(res40.Count > 0)
        Assert.True(workspace40.GlyphExtents.Width > 0)
        Assert.True(workspace40.GlyphExtents.Height < 0)

        // Ensure 12px hinted extents didn't collapse by 64x compared to design units.
        let ratio = float64(Math.Abs(workspace12.GlyphExtents.Height)) / float64(Math.Abs(workspace40.GlyphExtents.Height))
        Assert.InRange(ratio, 0.5, 1.5)
    }

    @Fact
    func TextFrameSlotResidentRangePreservationMatchesAppendAndSwap() {
        let historyIds = []uint64{ 1uL, 2uL, 0uL, 0uL }
        let historyVersions = []uint64{ 1uL, 1uL, 0uL, 0uL }
        let historyFirsts = []int32{ 0, 5, 0, 0 }
        let historyCounts = []int32{ 5, 7, 0, 0 }
        let historyClips = []int32{ 0, 0, 0, 0 }

        // Append C(id=3, v=1, 12..16, clip=0): A and B reuse resident ranges, C is dirty.
        let candIds = []uint64{ 1uL, 2uL, 3uL }
        let candVersions = []uint64{ 1uL, 1uL, 1uL }
        let candFirsts = []int32{ 0, 5, 12 }
        let candCounts = []int32{ 5, 7, 4 }
        let candClips = []int32{ 0, 0, 0 }

        var historyCursor int32 = 0
        Assert.True(VulkanTextResidentRangeMatcher.MatchesCandidate(
            historyIds, historyVersions, historyFirsts, historyCounts, historyClips, 2,
            candIds[0], candVersions[0], candFirsts[0], candCounts[0], candClips[0], ref historyCursor
        ))
        Assert.True(VulkanTextResidentRangeMatcher.MatchesCandidate(
            historyIds, historyVersions, historyFirsts, historyCounts, historyClips, 2,
            candIds[1], candVersions[1], candFirsts[1], candCounts[1], candClips[1], ref historyCursor
        ))
        Assert.False(VulkanTextResidentRangeMatcher.MatchesCandidate(
            historyIds, historyVersions, historyFirsts, historyCounts, historyClips, 2,
            candIds[2], candVersions[2], candFirsts[2], candCounts[2], candClips[2], ref historyCursor
        ))

        // Commit [A, B, C] to history, then swap B -> B'(v=2, same size 5..12) and change clip on A:
        historyIds[2] = 3uL
        historyVersions[2] = 1uL
        historyFirsts[2] = 12
        historyCounts[2] = 4
        historyClips[2] = 0
        candClips[0] = 1
        candVersions[1] = 2uL

        historyCursor = 0
        Assert.False(VulkanTextResidentRangeMatcher.MatchesCandidate(
            historyIds, historyVersions, historyFirsts, historyCounts, historyClips, 3,
            candIds[0], candVersions[0], candFirsts[0], candCounts[0], candClips[0], ref historyCursor
        ))
        Assert.False(VulkanTextResidentRangeMatcher.MatchesCandidate(
            historyIds, historyVersions, historyFirsts, historyCounts, historyClips, 3,
            candIds[1], candVersions[1], candFirsts[1], candCounts[1], candClips[1], ref historyCursor
        ))
        Assert.True(VulkanTextResidentRangeMatcher.MatchesCandidate(
            historyIds, historyVersions, historyFirsts, historyCounts, historyClips, 3,
            candIds[2], candVersions[2], candFirsts[2], candCounts[2], candClips[2], ref historyCursor
        ))
    }
}
