using System;
using System.IO;
using Goo;

internal static class Program
{
    private static int Main()
    {
        if (Environment.GetEnvironmentVariable("GOO_VK_DAMAGE_JOURNAL") == "1")
            return RunDamageJournalGate();

        if (Environment.GetEnvironmentVariable("GOO_VK_SCENE_ALLOC") == "1")
            return RunSceneAllocationGate();
        if (Environment.GetEnvironmentVariable("GOO_VK_PATH_UPLOAD_GATE") == "1")
        {
            RunPathUploadGate();
            return 0;
        }


        RunOverflowBorderGate();
        if (Environment.GetEnvironmentVariable("GOO_VK_OVERFLOW_BORDER") == "1")
            return 0;

        var fontPath = Path.Combine(AppContext.BaseDirectory, "VendSans-VariableFont_wght.ttf");
        if (!File.Exists(fontPath))
        {
            throw new FileNotFoundException("Vulkan text provider smoke font is missing", fontPath);
        }

        RunFontCacheGate(fontPath);
        RunPathMorphGate();
        RunEvenOddPathGate();
        RunPathUploadGate();
        RunUploadRingGrowthGate();
        RunRetainedPrimitiveSpanGate();

        VulkanTextFont? font = null;
        try
        {
            font = new VulkanTextFont(File.ReadAllBytes(fontPath), 32u, 0u, null);
            var provider = font;
            var options = new VulkanTextShapingOptions
            {
                Direction = 4u,
                Script = 0x4C61746Eu,
                Language = "en",
                ClusterLevel = 0u,
                Flags = 0u,
                Features = null
            };
            var text = "office café";
            var capacityProbe = new VulkanTextShapingWorkspace(0);
            var capacityResult = provider.ShapeInto(text, options, capacityProbe);
            if (capacityResult.AbiVersion != VulkanTextProviderAbi.Version
                || capacityResult.Status != VulkanTextProviderAbi.CapacityExceeded
                || capacityResult.Required <= 0
                || capacityResult.Count != 0
                || capacityProbe.GlyphCount != 0)
            {
                throw new InvalidOperationException("Vulkan text provider shaping capacity contract failed");
            }

            var glyphWorkspace = new VulkanTextShapingWorkspace(capacityResult.Required + 2);
            var glyphBuffer = glyphWorkspace.GlyphBuffer;
            glyphBuffer[capacityResult.Required] = new VulkanTextGlyph
            {
                GlyphId = 0xDEADBEEFu,
                Cluster = 0xA11CEu,
                XAdvance = 101,
                YAdvance = 102,
                XOffset = 103,
                YOffset = 104
            };
            glyphBuffer[capacityResult.Required + 1] = new VulkanTextGlyph
            {
                GlyphId = 0xC0FFEEu,
                Cluster = 0xBADC0DEu,
                XAdvance = 201,
                YAdvance = 202,
                XOffset = 203,
                YOffset = 204
            };
            var shapeResult = provider.ShapeInto(text, options, glyphWorkspace);
            if (shapeResult.AbiVersion != VulkanTextProviderAbi.Version
                || shapeResult.Status != VulkanTextProviderAbi.Success
                || shapeResult.Count != capacityResult.Required
                || shapeResult.Required != capacityResult.Required
                || glyphWorkspace.GlyphCount != capacityResult.Required
                || glyphBuffer[capacityResult.Required].GlyphId != 0xDEADBEEFu
                || glyphBuffer[capacityResult.Required].Cluster != 0xA11CEu
                || glyphBuffer[capacityResult.Required].XAdvance != 101
                || glyphBuffer[capacityResult.Required + 1].GlyphId != 0xC0FFEEu
                || glyphBuffer[capacityResult.Required + 1].Cluster != 0xBADC0DEu
                || glyphBuffer[capacityResult.Required + 1].XAdvance != 201)
            {
                throw new InvalidOperationException("Vulkan text provider shaping output bounds contract failed");
            }

            var warmShapeResult = provider.ShapeInto(text, options, glyphWorkspace);
            if (warmShapeResult.Status != VulkanTextProviderAbi.Success
                || warmShapeResult.Count != shapeResult.Count
                || warmShapeResult.Required != shapeResult.Required
                || glyphBuffer[capacityResult.Required].GlyphId != 0xDEADBEEFu
                || glyphBuffer[capacityResult.Required + 1].GlyphId != 0xC0FFEEu)
            {
                throw new InvalidOperationException("Vulkan text provider shaping workspace reuse contract failed");
            }

            var glyphId = glyphBuffer[0].GlyphId;
            var byteCapacityProbe = new VulkanTextProviderWorkspace(Array.Empty<byte>());
            var byteCapacityResult = provider.EncodeGlyphInto(glyphId, byteCapacityProbe);
            if (byteCapacityResult.AbiVersion != VulkanTextProviderAbi.Version
                || byteCapacityResult.Status != VulkanTextProviderAbi.CapacityExceeded
                || byteCapacityResult.Required <= 0
                || byteCapacityResult.Count != 0
                || byteCapacityProbe.ByteCount != 0)
            {
                throw new InvalidOperationException("Vulkan text provider glyph capacity contract failed");
            }

            var outputBytes = new byte[byteCapacityResult.Required + 2];
            outputBytes[byteCapacityResult.Required] = 0xA5;
            outputBytes[byteCapacityResult.Required + 1] = 0x5A;
            var byteWorkspace = new VulkanTextProviderWorkspace(outputBytes);
            var byteResult = provider.EncodeGlyphInto(glyphId, byteWorkspace);
            if (byteResult.AbiVersion != VulkanTextProviderAbi.Version
                || byteResult.Status != VulkanTextProviderAbi.Success
                || byteResult.Count != byteCapacityResult.Required
                || byteResult.Required != byteCapacityResult.Required
                || byteWorkspace.ByteCount != byteCapacityResult.Required
                || outputBytes[byteCapacityResult.Required] != 0xA5
                || outputBytes[byteCapacityResult.Required + 1] != 0x5A)
            {
                throw new InvalidOperationException("Vulkan text provider glyph output bounds contract failed");
            }

            var warmByteResult = provider.EncodeGlyphInto(glyphId, byteWorkspace);
            if (warmByteResult.Status != VulkanTextProviderAbi.Success
                || warmByteResult.Count != byteResult.Count
                || warmByteResult.Required != byteResult.Required
                || outputBytes[byteCapacityResult.Required] != 0xA5
                || outputBytes[byteCapacityResult.Required + 1] != 0x5A)
            {
                throw new InvalidOperationException("Vulkan text provider glyph workspace reuse contract failed");
            }

            provider.Dispose();
            var disposedShape = provider.ShapeInto(text, options, glyphWorkspace);
            if (disposedShape.AbiVersion != VulkanTextProviderAbi.Version
                || disposedShape.Status != VulkanTextProviderAbi.Disposed
                || disposedShape.Count != 0
                || disposedShape.Required != 0)
            {
                throw new InvalidOperationException("Vulkan text provider disposed shaping contract failed");
            }

            var disposedEncoding = provider.EncodeGlyphInto(glyphId, byteWorkspace);
            if (disposedEncoding.AbiVersion != VulkanTextProviderAbi.Version
                || disposedEncoding.Status != VulkanTextProviderAbi.Disposed
                || disposedEncoding.Count != 0
                || disposedEncoding.Required != 0)
            {
                throw new InvalidOperationException("Vulkan text provider disposed encoding contract failed");
            }

            Console.WriteLine("TEXT_PROVIDER_ABI_SMOKE shapeRequired=" + capacityResult.Required
                + " glyphRequired=" + byteCapacityResult.Required + " warmReuse=1 disposed=1");
            return 0;
        }
        finally
        {
            font?.Dispose();
        }
    }

    private static void RunFontCacheGate(string fontPath)
    {
        var cacheBudget = TextShaping.PrimaryFaceCacheByteBudgetForTests();
        var callerBytes = File.ReadAllBytes(fontPath);
        var oversizedBytes = new byte[checked((int)cacheBudget + 1)];
        Array.Copy(callerBytes, oversizedBytes, callerBytes.Length);
        var source = new FontSource("GooAbiOwned", 400, false, callerBytes);
        callerBytes[0] = (byte)(callerBytes[0] ^ 0xFF);
        ShapedText? shaped = null;
        FontSource? oversizedSource = null;
        ShapedText? oversizedShaped = null;
        try
        {
            source.Register();
            if (!source.IsRegistered)
                throw new InvalidOperationException("Font source did not register");

            shaped = TextShaping.Shape("office café", "GooAbiOwned", 16f, 400, false, 0f, 1);
            if (shaped.GlyphCount <= 0 || shaped.Width <= 0f || shaped.HasMissingGlyph)
                throw new InvalidOperationException("Registered font did not produce a complete shaped run");
            if (shaped.Runs.Count == 0)
                throw new InvalidOperationException("Registered font did not produce a shaped run lease");
            var activeProvider = shaped.Runs[0].Provider;

            source.Dispose();
            if (source.IsRegistered || !source.IsDisposed)
                throw new InvalidOperationException("Font source did not unregister on disposal");
            if (shaped.GlyphCount <= 0 || shaped.Width <= 0f || shaped.HasMissingGlyph)
                throw new InvalidOperationException("Active shaped run did not survive source disposal");
            var activeWorkspace = new VulkanTextShapingWorkspace(16);
            var activeResult = activeProvider.ShapeInto("A", new VulkanTextShapingOptions
            {
                Direction = 4u,
                Script = 0x4C61746Eu,
                Language = "en",
                ClusterLevel = 0u,
                Flags = 0u,
                Features = null,
            }, activeWorkspace);
            if (activeResult.Status != VulkanTextProviderAbi.Success
                || activeResult.Count <= 0
                || activeWorkspace.GlyphCount != activeResult.Count)
                throw new InvalidOperationException("Active shaped run lease did not retain its provider");

            shaped.Dispose();
            shaped = null;

            var cacheBefore = TextShaping.PrimaryFaceCacheBytesForTests();
            var countBefore = TextShaping.PrimaryFaceCacheCountForTests();
            if (cacheBefore > cacheBudget)
                throw new InvalidOperationException("Font cache exceeded its byte budget before oversized entry");
            oversizedSource = new FontSource("GooAbiOversized", 400, false, oversizedBytes);
            oversizedSource.Register();
            oversizedShaped = TextShaping.Shape("office café", "GooAbiOversized", 16f, 400, false, 0f, 1);
            if (oversizedShaped.GlyphCount <= 0 || oversizedShaped.Width <= 0f
                || oversizedShaped.HasMissingGlyph || oversizedShaped.Runs.Count == 0)
                throw new InvalidOperationException("Oversized registered font did not shape");
            var oversizedProvider = oversizedShaped.Runs[0].Provider;
            var cacheAfterShape = TextShaping.PrimaryFaceCacheBytesForTests();
            var countAfterShape = TextShaping.PrimaryFaceCacheCountForTests();
            if (cacheAfterShape > cacheBudget || cacheAfterShape != cacheBefore
                || countAfterShape != countBefore)
                throw new InvalidOperationException("Oversized font entered the cache");

            oversizedSource.Dispose();
            var oversizedWorkspace = new VulkanTextShapingWorkspace(16);
            var oversizedResult = oversizedProvider.ShapeInto("A", new VulkanTextShapingOptions
            {
                Direction = 4u,
                Script = 0x4C61746Eu,
                Language = "en",
                ClusterLevel = 0u,
                Flags = 0u,
                Features = null,
            }, oversizedWorkspace);
            var cacheAfterDispose = TextShaping.PrimaryFaceCacheBytesForTests();
            if (oversizedResult.Status != VulkanTextProviderAbi.Success
                || oversizedResult.Count <= 0
                || oversizedWorkspace.GlyphCount != oversizedResult.Count
                || cacheAfterDispose > cacheBudget)
                throw new InvalidOperationException("Oversized active lease or cache budget contract failed");

            Console.WriteLine("FONT_CACHE_SMOKE defensiveCopy=1 cacheBytes=" + cacheAfterDispose
                + " budget=" + cacheBudget + " oversizedBypass=1 activeLease=1");
        }
        finally
        {
            shaped?.Dispose();
            oversizedShaped?.Dispose();
            oversizedSource?.Dispose();
            source.Dispose();
        }
    }

    private static void RunPathMorphGate()
    {
        VectorPathNormalizedOwner owner = new VectorPathNormalizedOwner(4, 1, 0.0, 0.0, 100.0, 100.0);
        PathQuadratic[] array = new PathQuadratic[4]
        {
            PathGeometry.Quadratic(0f, 0f, 50f, 0f, 100f, 0f),
            PathGeometry.Quadratic(100f, 0f, 100f, 50f, 100f, 100f),
            PathGeometry.Quadratic(100f, 100f, 50f, 100f, 0f, 100f),
            PathGeometry.Quadratic(0f, 100f, 0f, 50f, 0f, 0f)
        };
        PathContour[] contours = new PathContour[1] { PathGeometry.Contour(0, 4, closed: true) };
        VectorPath path = VectorPath.CreateMutableNormalized(owner, 0.0, 0.0, 100.0, 100.0);
        if (!path.UpdateNormalized(array, 4, contours, 1))
        {
            throw new InvalidOperationException("Initial mutable path update failed");
        }
        PathGeometry pathGeometry = PathGeometry.For(path);
        PathBandEncoding pathBandEncoding = PathBandEncoder.Encode(path);
        if (pathBandEncoding.CurveCount != array.Length || pathBandEncoding.WordCount <= pathBandEncoding.HeaderByteCount / 4)
        {
            throw new InvalidOperationException("Initial path band encoding lost geometry");
        }
        VulkanPathIdentityRegistry vulkanPathIdentityRegistry = new VulkanPathIdentityRegistry();
        VulkanPathResourceIdentity vulkanPathResourceIdentity = vulkanPathIdentityRegistry.Resolve(path);
        ulong geometryRevision = path.GeometryRevision;
        PathGeometry pathGeometry2 = pathGeometry;
        PathBandEncoding pathBandEncoding2 = pathBandEncoding;
        array[0] = PathGeometry.Quadratic(0f, 0f, 51f, 0f, 100f, 0f);
        if (!path.UpdateNormalized(array, 4, contours, 1))
        {
            throw new InvalidOperationException("Mutable path capacity update failed");
        }
        PathGeometry.For(path);
        PathBandEncoder.Encode(path);
        GC.Collect();
        GC.WaitForPendingFinalizers();
        GC.Collect();
        long allocatedBytesForCurrentThread = GC.GetAllocatedBytesForCurrentThread();
        for (int i = 2; i <= 9; i++)
        {
            array[0] = PathGeometry.Quadratic(0f, 0f, 50 + i, 0f, 100f, 0f);
            if (!path.UpdateNormalized(array, 4, contours, 1))
            {
                throw new InvalidOperationException("Mutable path update did not advance");
            }
            if (pathGeometry2 != PathGeometry.For(path))
            {
                throw new InvalidOperationException("Path geometry cache was replaced");
            }
            if (pathBandEncoding2 != PathBandEncoder.Encode(path))
            {
                throw new InvalidOperationException("Path band encoding cache was replaced");
            }
        }
        long allocatedBytesForCurrentThread2 = GC.GetAllocatedBytesForCurrentThread();
        VulkanPathResourceIdentity vulkanPathResourceIdentity2 = vulkanPathIdentityRegistry.Resolve(path);
        vulkanPathIdentityRegistry.Dispose();
        if (allocatedBytesForCurrentThread2 != allocatedBytesForCurrentThread || path.GeometryRevision <= geometryRevision || vulkanPathResourceIdentity.PathId.LogicalId != vulkanPathResourceIdentity2.PathId.LogicalId || vulkanPathResourceIdentity.SourceId != vulkanPathResourceIdentity2.SourceId || vulkanPathResourceIdentity.GeometryRevision == vulkanPathResourceIdentity2.GeometryRevision || vulkanPathResourceIdentity.PathId.Version != vulkanPathResourceIdentity.GeometryRevision || vulkanPathResourceIdentity2.PathId.Version != vulkanPathResourceIdentity2.GeometryRevision || vulkanPathResourceIdentity.PathId.Version == vulkanPathResourceIdentity2.PathId.Version)
        {
            throw new InvalidOperationException("Mutable path warm allocation or identity gate failed");
        }
        Console.WriteLine("PATH_MORPH_GATE allocated=0 stableGeometry=1 stableEncoding=1 stableIdentity=1 versionedIdentity=1");
    }

    private static void RunUploadRingGrowthGate()
    {
        var ring = new VulkanUploadRing(64uL, 1, 1uL);
        try
        {
            var firstId = new ResourceId { Kind = SceneResourceKind.Image, LogicalId = 1uL, Version = 1uL };
            var secondId = new ResourceId { Kind = SceneResourceKind.Image, LogicalId = 2uL, Version = 1uL };
            var thirdId = new ResourceId { Kind = SceneResourceKind.Image, LogicalId = 3uL, Version = 1uL };
            var first = ring.Reserve(firstId, 1uL, 8uL, 1uL);
            var second = ring.Reserve(secondId, 1uL, 8uL, 1uL);
            var third = ring.Reserve(thirdId, 1uL, 8uL, 1uL);
            if (!first.Succeeded || !second.Succeeded || !third.Succeeded
                || ring.Stats.ActiveRanges != 3 || ring.Stats.UsedBytes != 24uL)
            {
                throw new InvalidOperationException("Upload ring range metadata did not grow");
            }
            if (!ring.Cancel(first) || !ring.Cancel(second) || !ring.Cancel(third)
                || ring.Collect(0uL) != 3 || ring.Stats.ActiveRanges != 0
                || ring.Stats.UsedBytes != 0uL)
            {
                throw new InvalidOperationException("Upload ring grown metadata did not retire");
            }
            Console.WriteLine("UPLOAD_RING_GROWTH_GATE initialRanges=1 activeRanges=3 retired=3");
        }
        finally
        {
            ring.Dispose();
        }
    }


    private static void RunPathUploadGate()
    {
        VectorPathNormalizedOwner owner = new VectorPathNormalizedOwner(4, 1, 0.0, 0.0, 100.0, 100.0);
        PathQuadratic[] array = new PathQuadratic[4]
        {
            PathGeometry.Quadratic(0f, 0f, 50f, 0f, 100f, 0f),
            PathGeometry.Quadratic(100f, 0f, 100f, 50f, 100f, 100f),
            PathGeometry.Quadratic(100f, 100f, 50f, 100f, 0f, 100f),
            PathGeometry.Quadratic(0f, 100f, 0f, 50f, 0f, 0f)
        };
        PathContour[] contours = new PathContour[1] { PathGeometry.Contour(0, 4, closed: true) };
        VectorPath path = VectorPath.CreateMutableNormalized(owner, 0.0, 0.0, 100.0, 100.0);
        if (!path.UpdateNormalized(array, 4, contours, 1))
        {
            throw new InvalidOperationException("Path upload gate initial update failed");
        }
        using (VulkanPathAtlas growthAtlas = new VulkanPathAtlas(1uL))
        using (VulkanPathResources growthResources = new VulkanPathResources(growthAtlas, new VulkanPathIdentityRegistry()))
        {
            VulkanPathRenderable growthRenderable = growthResources.Register(path, FillRule.NonZero, false);
            growthResources.PrepareUpload();
            if (growthResources.Stats.GrowthCount != 1uL
                || growthResources.Atlas.WordCapacity < growthRenderable.WordCount
                || growthResources.Atlas.UploadWordOffset != 0uL
                || growthResources.Atlas.UploadWordCount != growthRenderable.WordCount)
            {
                throw new InvalidOperationException("Path atlas did not grow transactionally");
            }
            SubmitPathUpload(growthResources, 1uL);
            growthResources.Collect(1uL);
            VulkanPathRenderable publishedGrowthRenderable = growthResources.Resolve(path, FillRule.NonZero);
            if (!publishedGrowthRenderable.Published || !publishedGrowthRenderable.Renderable)
            {
                throw new InvalidOperationException("Grown path atlas did not publish");
            }
        }
        using VulkanPathAtlas vulkanPathAtlas = new VulkanPathAtlas(4096uL);
        using VulkanPathResources vulkanPathResources = new VulkanPathResources(vulkanPathAtlas, new VulkanPathIdentityRegistry());
        VulkanPathRenderable vulkanPathRenderable = vulkanPathResources.Register(path, FillRule.NonZero, false);
        vulkanPathResources.PrepareUpload();
        if (vulkanPathResources.Atlas.UploadWordOffset != 0L || vulkanPathResources.Atlas.UploadWordCount != vulkanPathRenderable.WordCount || vulkanPathResources.Atlas.UploadWordCount > vulkanPathResources.Atlas.WordCapacity)
        {
            throw new InvalidOperationException("Initial path atlas upload range was invalid");
        }
        SubmitPathUpload(vulkanPathResources, 1uL);
        VulkanPathRenderable vulkanPathRenderable2 = vulkanPathResources.Resolve(path, FillRule.NonZero);
        if (vulkanPathRenderable2.Published || !vulkanPathRenderable2.Renderable)
        {
            throw new InvalidOperationException("Submitted path upload was not renderable before publication");
        }
        vulkanPathResources.Collect(1uL);
        VulkanPathRenderable vulkanPathRenderable3 = vulkanPathResources.Resolve(path, FillRule.NonZero);
        if (!vulkanPathRenderable3.Published || !vulkanPathRenderable3.Renderable)
        {
            throw new InvalidOperationException("Path did not publish after upload completion");
        }
        array[0] = PathGeometry.Quadratic(0f, 0f, 51f, 0f, 100f, 0f);
        if (!path.UpdateNormalized(array, 4, contours, 1))
        {
            throw new InvalidOperationException("Path upload gate append update failed");
        }
        VulkanPathRenderable vulkanPathRenderable4 = vulkanPathResources.Register(path, FillRule.NonZero, false);
        vulkanPathResources.PrepareUpload();
        if (vulkanPathResources.Atlas.UploadWordOffset != vulkanPathRenderable.WordCount || vulkanPathResources.Atlas.UploadWordCount != vulkanPathRenderable4.WordCount)
        {
            throw new InvalidOperationException("Path atlas suffix upload range was invalid");
        }
        SubmitPathUpload(vulkanPathResources, 2uL);
        vulkanPathResources.Collect(2uL);
        if (vulkanPathResources.Stats.FreeWordCount < vulkanPathRenderable.WordCount)
        {
            throw new InvalidOperationException("Path atlas retired range was not reclaimed");
        }
        array[0] = PathGeometry.Quadratic(0f, 0f, 52f, 0f, 100f, 0f);
        if (!path.UpdateNormalized(array, 4, contours, 1))
        {
            throw new InvalidOperationException("Path upload gate reuse update failed");
        }
        VulkanPathRenderable vulkanPathRenderable5 = vulkanPathResources.Register(path, FillRule.NonZero, false);
        if (vulkanPathRenderable5.BaseWord != vulkanPathRenderable.BaseWord)
        {
            throw new InvalidOperationException("Path atlas did not reuse the retired range");
        }
        vulkanPathResources.PrepareUpload();
        ulong uploadWordCount = vulkanPathResources.Atlas.UploadWordCount;
        if (vulkanPathResources.Atlas.UploadWordOffset != vulkanPathRenderable5.BaseWord || uploadWordCount != vulkanPathRenderable5.WordCount || vulkanPathResources.Atlas.UploadWordOffset + uploadWordCount > vulkanPathResources.Atlas.WordCapacity || uploadWordCount >= vulkanPathResources.Atlas.WordCapacity)
        {
            throw new InvalidOperationException("Path atlas reused upload was not bounded");
        }
        VulkanPathRenderable vulkanPathRenderable6 = vulkanPathResources.Resolve(path, FillRule.NonZero);
        if (vulkanPathRenderable6.Published || vulkanPathRenderable6.Renderable)
        {
            throw new InvalidOperationException("Dirty reused path was published before completion");
        }
        if (!vulkanPathResources.AbortUpload() || !vulkanPathResources.UploadPending || vulkanPathResources.Atlas.UploadPending)
        {
            throw new InvalidOperationException("Aborted path upload did not retain dirty work");
        }
        vulkanPathResources.PrepareUpload();
        if (vulkanPathResources.Atlas.UploadWordOffset != vulkanPathRenderable5.BaseWord || vulkanPathResources.Atlas.UploadWordCount != uploadWordCount)
        {
            throw new InvalidOperationException("Retained dirty path upload range changed");
        }
        SubmitPathUpload(vulkanPathResources, 3uL);
        vulkanPathResources.Collect(3uL);
        VulkanPathRenderable vulkanPathRenderable7 = vulkanPathResources.Resolve(path, FillRule.NonZero);
        if (!vulkanPathRenderable7.Published || !vulkanPathRenderable7.Renderable)
        {
            throw new InvalidOperationException("Reused path did not publish after completion");
        }
        array[0] = PathGeometry.Quadratic(0f, 0f, 53f, 0f, 100f, 0f);
        path.UpdateNormalized(array, 4, contours, 1);
        vulkanPathResources.Register(path, FillRule.NonZero, false);
        vulkanPathResources.PrepareUpload();
        SubmitPathUpload(vulkanPathResources, 4uL);
        vulkanPathResources.Collect(4uL);
        array[0] = PathGeometry.Quadratic(0f, 0f, 54f, 0f, 100f, 0f);
        path.UpdateNormalized(array, 4, contours, 1);
        long allocatedBytesForCurrentThread = GC.GetAllocatedBytesForCurrentThread();
        vulkanPathResources.Register(path, FillRule.NonZero, false);
        vulkanPathResources.PrepareUpload();
        long num = GC.GetAllocatedBytesForCurrentThread() - allocatedBytesForCurrentThread;
        if (num != 0L)
        {
            throw new InvalidOperationException("Warm path atlas reuse allocated");
        }
        SubmitPathUpload(vulkanPathResources, 5uL);
        vulkanPathResources.Collect(5uL);
        Console.WriteLine("PATH_UPLOAD_GATE atlasWords=" + vulkanPathResources.Atlas.WordCapacity + " growthCount=" + vulkanPathResources.Stats.GrowthCount + " reuseOffset=" + vulkanPathRenderable5.BaseWord + " reuseWords=" + vulkanPathRenderable5.WordCount + " warmAllocated=" + num + " abortRetained=1 unpublished=1 published=1");
    }

    private static void RunEvenOddPathGate()
    {
        PathBuilder pathBuilder = new PathBuilder(0.0, 0.0, 1800.0, 1800.0);
        pathBuilder.MoveTo(20.0, 20.0).LineTo(1780.0, 20.0).LineTo(1780.0, 1780.0)
            .LineTo(20.0, 1780.0)
            .Close();
        for (int i = 0; i < 256; i++)
        {
            int num = 40 + i % 32 * 54;
            int num2 = 40 + i / 32 * 54;
            pathBuilder.MoveTo(num, num2).LineTo(num + 12, num2).LineTo(num + 12, num2 + 12)
                .LineTo(num, num2 + 12)
                .Close();
        }
        VectorPath path = pathBuilder.Build();
        PathGeometry pathGeometry = PathGeometry.For(path);
        PathBandEncoding pathBandEncoding = PathBandEncoder.Encode(path);
        if (pathGeometry.QuadraticCount != 1028 || pathBandEncoding.CurveCount != 1028 || pathBandEncoding.HorizontalBandCount != 32 || pathBandEncoding.VerticalBandCount != 32 || pathBandEncoding.WordCount != 13508 || !pathBandEncoding.Supports(FillRule.EvenOdd))
        {
            throw new InvalidOperationException("EvenOdd path encoding gate failed");
        }
        GC.Collect();
        GC.WaitForPendingFinalizers();
        GC.Collect();
        PathBandEncoder.Encode(path);
        long allocatedBytesForCurrentThread = GC.GetAllocatedBytesForCurrentThread();
        for (int j = 0; j < 64; j++)
        {
            if (pathBandEncoding != PathBandEncoder.Encode(path))
            {
                throw new InvalidOperationException("EvenOdd path encoding cache was replaced");
            }
        }
        long num3 = GC.GetAllocatedBytesForCurrentThread() - allocatedBytesForCurrentThread;
        if (num3 != 0L)
        {
            throw new InvalidOperationException("EvenOdd path warm encoding allocated");
        }
        Console.WriteLine("PATH_EVENODD_GATE holes=" + 256 + " curves=" + pathBandEncoding.CurveCount + " words=" + pathBandEncoding.WordCount + " warmAllocated=" + num3 + " warmCalls=64");
    }

    private static void SubmitPathUpload(VulkanPathResources resources, ulong fence)
    {
        resources.RecordUpload(1);
        if (resources.FlushBeforeSubmit() != 0)
        {
            throw new InvalidOperationException("Path atlas upload flush failed");
        }
        resources.MarkSubmitted(1, fence);
    }

    private static int RunSceneAllocationGate()
    {
        var root = new Node
        {
            Kind = NodeKind.Container,
            Rect = new Rect { X = 0, Y = 0, W = 320, H = 180 },
            BackgroundGradient = new LinearGradient(
                135.0, Color.Rgb(24, 42, 88), Color.Rgb(214, 164, 72)),
            OverflowX = Overflow.Hidden,
            OverflowY = Overflow.Hidden,
        };
        var child = new Node
        {
            Kind = NodeKind.Button,
            Parent = root,
            Rect = new Rect { X = 20, Y = 20, W = 120, H = 60 },
            BackgroundColor = Color.Rgb(42, 72, 132),
            BorderTopWidth = 2,
            BorderRightWidth = 2,
            BorderBottomWidth = 2,
            BorderLeftWidth = 2,
            BorderTopColor = Color.Rgb(220, 220, 220),
            BorderRightColor = Color.Rgb(220, 220, 220),
            BorderBottomColor = Color.Rgb(220, 220, 220),
            BorderLeftColor = Color.Rgb(220, 220, 220),
        };
        root.Children.Add(child);

        var compiler = new VulkanSceneCompiler(8);
        for (var warmup = 0; warmup < 9; warmup++)
            compiler.Compile(root, Color.Transparent, 320, 180);

        var before = GC.GetAllocatedBytesForCurrentThread();
        var result = compiler.Compile(root, Color.Transparent, 320, 180);
        var allocated = GC.GetAllocatedBytesForCurrentThread() - before;
        if (result.VisibleNodeCount != 2 || result.DrawCount == 0 || result.HasUnsupported)
            throw new InvalidOperationException("Vulkan scene allocation gate produced an unsupported scene");

        Console.WriteLine("VULKAN_SCENE_ALLOC allocated=" + allocated
            + " draws=" + result.DrawCount + " visibleNodes=" + result.VisibleNodeCount);
        return allocated == 0 ? 0 : 1;
    }

    private static void RunOverflowBorderGate()
    {
        foreach (var radius in new[] { 0, 8 })
        {
            Node Box(int size) => new Node
            {
                Kind = NodeKind.Container,
                Rect = new Rect { X = 0, Y = 0, W = size, H = size },
                BackgroundColor = Color.Rgb(30, 30, 34),
                BorderRadius = radius,
                BorderTopWidth = 1,
                BorderRightWidth = 1,
                BorderBottomWidth = 1,
                BorderLeftWidth = 1,
                BorderTopColor = Color.White,
                BorderRightColor = Color.White,
                BorderBottomColor = Color.White,
                BorderLeftColor = Color.White,
                OverflowX = Overflow.Hidden,
                OverflowY = Overflow.Hidden,
            };
            var root = Box(100);
            var child = Box(80);
            child.Parent = root;
            root.Children.Add(child);
            var compiler = new VulkanSceneCompiler(8);
            compiler.Compile(root, Color.Transparent, 100, 100);
            var depth = 0;
            var borders = 0;
            for (var i = 0; i < compiler.Frame.DrawRefCount; i++)
            {
                var draw = compiler.Frame.DrawRefs[i];
                if (draw.Kind == SceneDrawKind.RectClipBegin)
                    depth++;
                else if (draw.Kind == SceneDrawKind.RectClipEnd)
                    depth--;
                else if (draw.Kind == SceneDrawKind.PerEdgeBorder)
                {
                    if (depth != 1 - borders)
                        throw new InvalidOperationException("Border clipped by its own overflow scissor");
                    borders++;
                }
            }
            if (depth != 0 || borders != 2)
                throw new InvalidOperationException("Nested overflow border scene is incomplete");
        }
        Console.WriteLine("VULKAN_OVERFLOW_BORDER PASS square and rounded nested borders");
    }

    private static void RunRetainedPrimitiveSpanGate()
    {
        var root = new Node
        {
            Kind = NodeKind.Container,
            Rect = new Rect { X = 0, Y = 0, W = 320, H = 180 },
        };
        var solid = new Node
        {
            Kind = NodeKind.Container,
            Parent = root,
            Rect = new Rect { X = 10, Y = 10, W = 80, H = 30 },
            BackgroundColor = Color.Rgb(32, 64, 128),
        };
        var rounded = new Node
        {
            Kind = NodeKind.Container,
            Parent = root,
            Rect = new Rect { X = 100, Y = 10, W = 80, H = 30 },
            BackgroundColor = Color.Rgb(64, 96, 160),
            BorderRadius = 5,
        };
        var border = new Node
        {
            Kind = NodeKind.Container,
            Parent = root,
            Rect = new Rect { X = 190, Y = 10, W = 80, H = 30 },
            BorderTopWidth = 2,
            BorderRightWidth = 2,
            BorderBottomWidth = 2,
            BorderLeftWidth = 2,
            BorderTopColor = Color.Rgb(220, 220, 220),
            BorderRightColor = Color.Rgb(220, 220, 220),
            BorderBottomColor = Color.Rgb(220, 220, 220),
            BorderLeftColor = Color.Rgb(220, 220, 220),
        };
        root.Children.Add(solid);
        root.Children.Add(rounded);
        root.Children.Add(border);

        var compiler = new VulkanSceneCompiler(8);
        compiler.Compile(root, Color.Transparent, 320, 180);
        var exactRebuildChunks = 0;
        for (var index = 0; index < compiler.Frame.ChunkCount; index++)
        {
            var chunk = compiler.Frame.Chunks[index];
            if (chunk.RetentionState != SceneChunkRetentionState.ExactLeafRebuild)
                continue;
            exactRebuildChunks++;
            if (chunk.ContentKey == 0 || chunk.TopologyKey == 0)
                throw new InvalidOperationException("Exact retained leaf rebuild digest was skipped");
        }
        if (exactRebuildChunks != 3)
            throw new InvalidOperationException("Exact retained leaf rebuild chunks were not preserved");

        var before = compiler.Frame.Counters.RecordOperations;
        var stable = compiler.Compile(root, Color.Transparent, 320, 180);
        var stableWrites = compiler.Frame.Counters.RecordOperations - before;
        if (stable.DrawCount != 3 || stableWrites != 0)
            throw new InvalidOperationException("Retained primitive spans were not reused");

        compiler.Frame.InvalidateRetainedPrimitiveSpans();
        before = compiler.Frame.Counters.RecordOperations;
        var rebuilt = compiler.Compile(root, Color.Transparent, 320, 180);
        var rebuiltWrites = compiler.Frame.Counters.RecordOperations - before;
        if (rebuilt.DrawCount != 3 || rebuiltWrites != 3)
            throw new InvalidOperationException("Invalid retained primitive spans were reused");
        var exactHitChunks = 0;
        for (var index = 0; index < compiler.Frame.ChunkCount; index++)
        {
            var chunk = compiler.Frame.Chunks[index];
            if (chunk.RetentionState != SceneChunkRetentionState.ExactLeafHit)
                continue;
            exactHitChunks++;
            if (chunk.ContentKey != 0 || chunk.TopologyKey != 0)
                throw new InvalidOperationException("Exact retained leaf digest was computed");
        }
        if (exactHitChunks != 3)
            throw new InvalidOperationException("Exact retained leaf chunks were not preserved");

        before = compiler.Frame.Counters.RecordOperations;
        compiler.Compile(root, Color.Transparent, 320, 180);
        var recoveredWrites = compiler.Frame.Counters.RecordOperations - before;
        if (recoveredWrites != 0)
            throw new InvalidOperationException("Retained primitive spans did not recover");

        root.Children.RemoveAt(0);
        root.Children.Add(solid);
        before = compiler.Frame.Counters.RecordOperations;
        compiler.Compile(root, Color.Transparent, 320, 180);
        var reorderedWrites = compiler.Frame.Counters.RecordOperations - before;
        if (reorderedWrites != 3)
            throw new InvalidOperationException("Reordered retained primitive spans were reused");

        before = compiler.Frame.Counters.RecordOperations;
        compiler.Compile(root, Color.Transparent, 320, 180);
        var reorderedStableWrites = compiler.Frame.Counters.RecordOperations - before;
        if (reorderedStableWrites != 0)
            throw new InvalidOperationException("Reordered retained primitive spans did not stabilize");

        Console.WriteLine("RETAINED_PRIMITIVE_SPAN_GATE stableWrites=" + stableWrites
            + " invalidatedWrites=" + rebuiltWrites + " recoveredWrites=" + recoveredWrites
            + " reorderedWrites=" + reorderedWrites
            + " reorderedStableWrites=" + reorderedStableWrites);
    }

    private static int RunDamageJournalGate()
    {
        const uint width = 320u;
        const uint height = 180u;
        const float scaleX = 1.0F;
        const float scaleY = 1.0F;
        var journal = new VulkanSceneDamageJournal(4);
        var oldBounds = new ConservativeBounds { X = 20, Y = 30, Width = 40, Height = 20 };
        var newBounds = new ConservativeBounds { X = 22, Y = 34, Width = 60, Height = 20 };

        journal.BeginVersion(1uL);
        journal.EndVersion();
        RequireJournalFull(journal, 0uL, 1uL, scaleX, scaleY, width, height, "first-use");
        RequireJournalNone(journal, 1uL, 1uL, scaleX, scaleY, width, height, "same-key");
        RequireJournalFull(journal, 1uL, 1uL, 2.0F, scaleY, width, height, "scale-only");
        RequireJournalFull(journal, 1uL, 1uL, 2.0F, scaleY, width * 2u, height, "extent-only");

        journal.BeginVersion(2uL);
        journal.EndVersion();
        RequireJournalFull(journal, 1uL, 2uL, scaleX, scaleY, width, height, "scale-transition");

        journal.BeginVersion(3uL);
        journal.EndVersion();
        RequireJournalNone(journal, 2uL, 3uL, scaleX, scaleY, width, height, "unchanged-key");

        journal.BeginVersion(4uL);
        journal.AddChange(oldBounds, true, newBounds, true);
        journal.EndVersion();
        RequireJournalRegion(journal, 3uL, 4uL, scaleX, scaleY, width, height,
            new VulkanDamageRegion { X = 20, Y = 30, Width = 62, Height = 24 },
            "unchanged-key-mutation");

        var gap = new VulkanSceneDamageJournal(2);
        gap.BeginVersion(1uL);
        gap.EndVersion();
        RequireJournalFull(gap, 0uL, 1uL, scaleX, scaleY, width, height, "gap-first-use");
        gap.BeginVersion(2uL);
        gap.EndVersion();
        RequireJournalNone(gap, 1uL, 2uL, scaleX, scaleY, width, height, "gap-warm");
        gap.BeginVersion(3uL);
        gap.EndVersion();
        RequireJournalFull(gap, 1uL, 3uL, scaleX, scaleY, width, height, "eviction-gap");

        journal.Reset();
        journal.BeginVersion(5uL);
        journal.EndVersion();
        RequireJournalFull(journal, 5uL, 5uL, scaleX, scaleY, width, height, "reset-first-use");

        var retry = new VulkanSceneDamageJournal(2);
        retry.BeginVersion(1uL);
        retry.EndVersion();
        RequireJournalFull(retry, 0uL, 1uL, scaleX, scaleY, width, height, "retry-first-use");
        retry.BeginVersion(2uL);
        retry.AddChange(oldBounds, true, newBounds, true);
        RequireJournalFull(retry, 1uL, 2uL, scaleX, scaleY, width, height, "abandoned-version");
        retry.EndVersion();

        Console.WriteLine("VULKAN_DAMAGE_JOURNAL_GATE sameKey=1 scale=1 extent=1 scaleMutation=1 scaleTransition=1 unchangedKey=1 mutationUnchanged=1 logicalBounded=1 evictionGap=1 reset=1 abandoned=1");
        return 0;
    }

    private static void RequireJournalNone(VulkanSceneDamageJournal journal,
        ulong appliedVersion, ulong currentVersion, float scaleX, float scaleY,
        uint width, uint height, string scenario)
    {
        var hasDamage = journal.BuildSince(appliedVersion, currentVersion, scaleX, scaleY,
            width, height, out var region, out var fullRedraw);
        if (hasDamage || fullRedraw || !region.IsEmpty)
            throw new InvalidOperationException("Damage journal " + scenario + " was not empty");
    }

    private static void RequireJournalFull(VulkanSceneDamageJournal journal,
        ulong appliedVersion, ulong currentVersion, float scaleX, float scaleY,
        uint width, uint height, string scenario)
    {
        var hasDamage = journal.BuildSince(appliedVersion, currentVersion, scaleX, scaleY,
            width, height, out var region, out var fullRedraw);
        if (!hasDamage || !fullRedraw || region.X != 0 || region.Y != 0
            || region.Width != (int)width || region.Height != (int)height)
            throw new InvalidOperationException("Damage journal " + scenario + " was not full");
    }

    private static void RequireJournalRegion(VulkanSceneDamageJournal journal,
        ulong appliedVersion, ulong currentVersion, float scaleX, float scaleY,
        uint width, uint height, VulkanDamageRegion expected, string scenario)
    {
        var hasDamage = journal.BuildSince(appliedVersion, currentVersion, scaleX, scaleY,
            width, height, out var region, out var fullRedraw);
        if (!hasDamage || fullRedraw || region.X != expected.X || region.Y != expected.Y
            || region.Width != expected.Width || region.Height != expected.Height)
            throw new InvalidOperationException("Damage journal " + scenario + " was not bounded");
    }

}
