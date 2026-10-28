import Goo
import System
import System.Diagnostics
import System.IO
import System.Runtime.InteropServices
import System.Security.Cryptography

internal shared class Program {
    private func Main() int32 {
        if Environment.GetEnvironmentVariable("GOO_VK_SYSTEM_FONT_WEIGHT") == "1" {
            RunSystemFontWeightGate(Path.Combine(AppContext.BaseDirectory, "VendSans-VariableFont_wght.ttf"))
            return 0
        }
        if Environment.GetEnvironmentVariable("GOO_VK_DESCRIPTOR_GC") == "1" {
            DescriptorLifetimeRegression.Run()
            return 0
        }
        if Environment.GetEnvironmentVariable("GOO_VK_DAMAGE_JOURNAL") == "1" {
            return RunDamageJournalGate()
        }
        if Environment.GetEnvironmentVariable("GOO_VK_SCENE_ALLOC") == "1" {
            return RunSceneAllocationGate()
        }
        if Environment.GetEnvironmentVariable("GOO_VK_PATH_UPLOAD_GATE") == "1" {
            RunPathUploadGate()
            RunPathEvictionGate()
            return 0
        }
        DescriptorLifetimeRegression.Run()
        RunOverflowBorderGate()
        RunPortalRetentionGate()
        if Environment.GetEnvironmentVariable("GOO_VK_OVERFLOW_BORDER") == "1" {
            return 0
        }
        let fontPath = Path.Combine(AppContext.BaseDirectory, "VendSans-VariableFont_wght.ttf")
        if !File.Exists(fontPath) {
            throw FileNotFoundException("Vulkan text provider smoke font is missing", fontPath)
        }
        RunFontCacheGate(fontPath)
        RunFontRegistrationGate(fontPath)
        if OperatingSystem.IsLinux() { RunSystemFontWeightGate(fontPath) }
        RunPathMorphGate()
        RunEvenOddPathGate()
        RunPathUploadGate()
        RunPathEvictionGate()
        RunUploadRingGrowthGate()
        RunRetainedPrimitiveSpanGate()
        var font VulkanTextFont? = nil
        try {
            font = VulkanTextFont(File.ReadAllBytes(fontPath), 32u, 0u, nil)
            let provider = font
            let options = VulkanTextShapingOptions{
                Direction: 4u,
                Script: 0x4C61746Eu,
                Language: "en",
                ClusterLevel: 0u,
                Flags: 0u,
                Features: nil
            }
            let text = "office café"
            let capacityProbe = VulkanTextShapingWorkspace(0)
            let capacityResult = provider.ShapeInto(text, options, capacityProbe)
            if capacityResult.AbiVersion != VulkanTextProviderAbi.Version ||
                capacityResult.Status != VulkanTextProviderAbi.CapacityExceeded ||
                capacityResult.Required <= 0 ||
                capacityResult.Count != 0 ||
                capacityProbe.GlyphCount != 0 {
                throw InvalidOperationException("Vulkan text provider shaping capacity contract failed")
            }
            let glyphWorkspace = VulkanTextShapingWorkspace(capacityResult.Required + 2)
            let glyphBuffer = glyphWorkspace.GlyphBuffer
            glyphBuffer[capacityResult.Required] = VulkanTextGlyph{
                GlyphId: 0xDEADBEEFu,
                Cluster: 0xA11CEu,
                XAdvance: 101,
                YAdvance: 102,
                XOffset: 103,
                YOffset: 104
            }
            glyphBuffer[capacityResult.Required + 1] = VulkanTextGlyph{
                GlyphId: 0xC0FFEEu,
                Cluster: 0xBADC0DEu,
                XAdvance: 201,
                YAdvance: 202,
                XOffset: 203,
                YOffset: 204
            }
            let shapeResult = provider.ShapeInto(text, options, glyphWorkspace)
            if shapeResult.AbiVersion != VulkanTextProviderAbi.Version ||
                shapeResult.Status != VulkanTextProviderAbi.Success ||
                shapeResult.Count != capacityResult.Required ||
                shapeResult.Required != capacityResult.Required ||
                glyphWorkspace.GlyphCount != capacityResult.Required ||
                glyphBuffer[capacityResult.Required].GlyphId != 0xDEADBEEFu ||
                glyphBuffer[capacityResult.Required].Cluster != 0xA11CEu ||
                glyphBuffer[capacityResult.Required].XAdvance != 101 ||
                glyphBuffer[capacityResult.Required + 1].GlyphId != 0xC0FFEEu ||
                glyphBuffer[capacityResult.Required + 1].Cluster != 0xBADC0DEu ||
                glyphBuffer[capacityResult.Required + 1].XAdvance != 201 {
                throw InvalidOperationException("Vulkan text provider shaping output bounds contract failed")
            }
            let warmShapeResult = provider.ShapeInto(text, options, glyphWorkspace)
            if warmShapeResult.Status != VulkanTextProviderAbi.Success ||
                warmShapeResult.Count != shapeResult.Count ||
                warmShapeResult.Required != shapeResult.Required ||
                glyphBuffer[capacityResult.Required].GlyphId != 0xDEADBEEFu ||
                glyphBuffer[capacityResult.Required + 1].GlyphId != 0xC0FFEEu {
                throw InvalidOperationException("Vulkan text provider shaping workspace reuse contract failed")
            }
            let glyphId = glyphBuffer[0].GlyphId
            let byteCapacityProbe = VulkanTextProviderWorkspace(Array.Empty[uint8]())
            let byteCapacityResult = provider.EncodeGlyphInto(glyphId, byteCapacityProbe)
            if byteCapacityResult.AbiVersion != VulkanTextProviderAbi.Version ||
                byteCapacityResult.Status != VulkanTextProviderAbi.CapacityExceeded ||
                byteCapacityResult.Required <= 0 ||
                byteCapacityResult.Count != 0 ||
                byteCapacityProbe.ByteCount != 0 {
                throw InvalidOperationException("Vulkan text provider glyph capacity contract failed")
            }
            let outputBytes = [byteCapacityResult.Required + 2]uint8
            outputBytes[byteCapacityResult.Required] = uint8(0xA5)
            outputBytes[byteCapacityResult.Required + 1] = uint8(0x5A)
            let byteWorkspace = VulkanTextProviderWorkspace(outputBytes)
            let byteResult = provider.EncodeGlyphInto(glyphId, byteWorkspace)
            if byteResult.AbiVersion != VulkanTextProviderAbi.Version ||
                byteResult.Status != VulkanTextProviderAbi.Success ||
                byteResult.Count != byteCapacityResult.Required ||
                byteResult.Required != byteCapacityResult.Required ||
                byteWorkspace.ByteCount != byteCapacityResult.Required ||
                outputBytes[byteCapacityResult.Required] != uint8(0xA5) ||
                outputBytes[byteCapacityResult.Required + 1] != uint8(0x5A) {
                throw InvalidOperationException("Vulkan text provider glyph output bounds contract failed")
            }
            let warmByteResult = provider.EncodeGlyphInto(glyphId, byteWorkspace)
            if warmByteResult.Status != VulkanTextProviderAbi.Success ||
                warmByteResult.Count != byteResult.Count ||
                warmByteResult.Required != byteResult.Required ||
                outputBytes[byteCapacityResult.Required] != uint8(0xA5) ||
                outputBytes[byteCapacityResult.Required + 1] != uint8(0x5A) {
                throw InvalidOperationException("Vulkan text provider glyph workspace reuse contract failed")
            }
            provider.Dispose()
            let disposedShape = provider.ShapeInto(text, options, glyphWorkspace)
            if disposedShape.AbiVersion != VulkanTextProviderAbi.Version ||
                disposedShape.Status != VulkanTextProviderAbi.Disposed ||
                disposedShape.Count != 0 ||
                disposedShape.Required != 0 {
                throw InvalidOperationException("Vulkan text provider disposed shaping contract failed")
            }
            let disposedEncoding = provider.EncodeGlyphInto(glyphId, byteWorkspace)
            if disposedEncoding.AbiVersion != VulkanTextProviderAbi.Version ||
                disposedEncoding.Status != VulkanTextProviderAbi.Disposed ||
                disposedEncoding.Count != 0 ||
                disposedEncoding.Required != 0 {
                throw InvalidOperationException("Vulkan text provider disposed encoding contract failed")
            }
            Console.WriteLine(
                "TEXT_PROVIDER_ABI_SMOKE shapeRequired=" + capacityResult.Required.ToString() +
                    " glyphRequired=" +
                    byteCapacityResult
                    .Required
                    .ToString() + " warmReuse=1 disposed=1"
            )
            return 0
        } finally {
            font?.Dispose()
        }
    }

    private func RunSystemFontWeightGate(fontPath string) {
        let family = "GooSystemVariableWeight"
        let home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile)
        if Environment.GetEnvironmentVariable("GOO_VK_SYSTEM_FONT_WEIGHT") != "1" {
            let root = Path.Combine(home, "scratch", "goo-system-font-" + Guid.NewGuid().ToString("N"))
            let fonts = Path.Combine(root, ".fonts")
            Directory.CreateDirectory(fonts)
            try {
                File.Copy(fontPath, Path.Combine(fonts, family + ".ttf"))
                {
                    using let padded = File.OpenWrite(Path.Combine(fonts, family + ".ttf"))
                    padded.SetLength(20L * 1024L * 1024L)
                }
                let config = Path.Combine(root, "fonts.conf")
                File.WriteAllText(config, "<fontconfig><dir>" + System.Security.SecurityElement.Escape(fonts)
                    + "</dir><cachedir>" + System.Security.SecurityElement.Escape(Path.Combine(root, "cache"))
                    + "</cachedir></fontconfig>")
                let start = ProcessStartInfo(Environment.ProcessPath ?? throw InvalidOperationException("No process path"))
                start.UseShellExecute = false
                if Path.GetFileNameWithoutExtension(start.FileName) == "dotnet" {
                    start.ArgumentList.Add(Path.Combine(AppContext.BaseDirectory, "Goo.VulkanAbiSmoke.dll"))
                }
                start.Environment["HOME"] = root
                start.Environment["FONTCONFIG_FILE"] = config
                start.Environment["FONTCONFIG_PATH"] = root
                start.Environment["XDG_CACHE_HOME"] = Path.Combine(root, "cache")
                start.Environment["GOO_VK_SYSTEM_FONT_WEIGHT"] = "1"
                using let child = Process.Start(start) ?? throw InvalidOperationException("Font smoke did not start")
                child.WaitForExit()
                if child.ExitCode != 0 { throw InvalidOperationException("System variable font weight smoke failed") }
            } finally {
                Directory.Delete(root, true)
            }
            return
        }

        let resolved = SystemFontResolvers.Current().Find(family, 600, false)
        if resolved != Path.Combine(home, ".fonts", family + ".ttf") {
            throw InvalidOperationException("System variable font did not resolve to the private fixture")
        }
        using let light = TextShaping.Shape("office", family, 32f, 300, false, 0f, 1)
        using let semibold = TextShaping.Shape("office", family, 32f, 600, false, 0f, 1)
        using let below = TextShaping.Shape("office", family, 32f, 100, false, 0f, 1)
        using let maximum = TextShaping.Shape("office", family, 32f, 700, false, 0f, 1)
        using let above = TextShaping.Shape("office", family, 32f, 900, false, 0f, 1)
        using let fallback = TextShaping.Shape("office", "MissingWeightFixture, " + family, 32f, 600, false, 0f, 1)
        if light.HasMissingGlyph || semibold.HasMissingGlyph || light.Width == semibold.Width {
            throw InvalidOperationException("Requested system variable font weight did not change glyph advances")
        }
        if below.Width != light.Width || above.Width != maximum.Width || fallback.Width != semibold.Width {
            throw InvalidOperationException("System variable font axis clamp or family fallback failed")
        }
        using let source = FontSource("GooExplicitVariableWeight", 600, false, File.ReadAllBytes(fontPath),
            0u, []FontVariation{FontVariation("wght", 300f)})
        source.Register()
        using let explicitWeight = TextShaping.Shape("office", source.Family, 32f, 600, false, 0f, 1)
        if explicitWeight.Width != light.Width {
            throw InvalidOperationException("Explicit font variations were replaced by the requested weight")
        }
        for families in []string{source.Family + ", " + family, family + ", MissingPreloadFixture"} {
            for weight in []int32{400, 700} {
                TextShaping.Metrics(families, 14f, weight, false)
                TextShaping.FallbackPreloadForTests().GetAwaiter().GetResult()
            }
            let retainedPath = Path.Combine(home, ".fonts", family + ".ttf")
            File.Move(retainedPath, retainedPath + ".retained")
            try {
                for pass in 0 ... 8 {
                    for weight in []int32{400, 700} {
                        let text = "备注 页面切换输入 " + pass.ToString()
                        if TextShaping.MeasureLineUncached(text, 0, text.Length,
                            families, 14f, weight, false, 0f, 1) <= 0f {
                            throw InvalidOperationException("Mixed-weight fallback layout did not retain its font")
                        }
                    }
                }
                if TextShaping.PrimaryFaceCacheBytesForTests() > TextShaping.PrimaryFaceCacheByteBudgetForTests() {
                    throw InvalidOperationException("Mixed-weight fallback cache exceeded its byte budget")
                }
            } finally {
                File.Move(retainedPath + ".retained", retainedPath)
            }
        }
        Console.WriteLine("MIXED_WEIGHT_FALLBACK_CACHE_SMOKE backgroundPreload=1 warmFileRemoved=1"
            + " layouts=32 cacheBytes=" + TextShaping.PrimaryFaceCacheBytesForTests().ToString())
        Console.WriteLine("SYSTEM_VARIABLE_FONT_WEIGHT_SMOKE light=" + light.Width.ToString()
            + " semibold=" + semibold.Width.ToString() + " clamp=1 fallback=1 explicit=1")
    }

    private func RunFontRegistrationGate(fontPath string) {
        let bytes = File.ReadAllBytes(fontPath)
        let variations = []FontVariation{FontVariation("wght", 400f)}
        using let source = FontSource("GooAbiRegistration", 400, false, bytes, 0u, variations)
        source.Register()
        let generation = FontRegistry.Generation
        source.Register()
        using let repeated = FontSource(" gooabiregistration ", 400, false, bytes, 0u, variations)
        repeated.Register()
        repeated.Dispose()
        if !source.IsRegistered || FontRegistry.Generation != generation {
            throw InvalidOperationException("Repeated font registration changed the existing registration")
        }
        let differentBytes = [bytes.Length + 1]uint8
        Array.Copy(bytes, differentBytes, bytes.Length)
        for candidate in []FontSource{
            FontSource(source.Family, 400, false, differentBytes, 0u, variations),
            FontSource(source.Family, 400, false, bytes, 1u, variations),
            FontSource(source.Family, 400, false, bytes, 0u, []FontVariation{FontVariation("wdth", 400f)}),
            FontSource(source.Family, 400, false, bytes, 0u, []FontVariation{FontVariation("wght", 500f)}),
            FontSource(source.Family, 400, false, bytes)
        } {
            using let _ = candidate
            var rejected = false
            try {
                candidate.Register()
            } catch (InvalidOperationException) {
                rejected = true
            }
            if !rejected || candidate.IsRegistered || FontRegistry.Generation != generation {
                throw InvalidOperationException("A different font source replaced an existing registration")
            }
        }
        using let shaped = TextShaping.Shape("office", source.Family, 16f, 400, false, 0f, 1)
        if shaped.HasMissingGlyph || shaped.GlyphCount <= 0 {
            throw InvalidOperationException("Repeated registration lost the original font")
        }
        Console.WriteLine("FONT_REGISTRATION_SMOKE repeated=1 conflicting=5")
    }

    private func RunFontCacheGate(fontPath string) {
        {
            using let familyOnly = TextShaping.Shape("office", fontPath, 16f, 400, false, 0f, 1)
            if familyOnly.Runs.Count == 0 || familyOnly.Runs[0].Family != "sans-serif" {
                throw InvalidOperationException("Font family was treated as a file path")
            }
        }
        let oversizedPath = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString() + ".ttf")
        try {
            File.Copy(fontPath, oversizedPath)
            {
                using let pathSource = FontSource.FromPath(
                    "GooAbiPath",
                    400,
                    false,
                    oversizedPath,
                    0u,
                    []FontVariation{FontVariation("wght", 400f)}
                )
                File.Delete(oversizedPath)
                if pathSource.IsRegistered {
                    throw InvalidOperationException("Font path source registered eagerly")
                }
                pathSource.Register()
                using let shapedPath = TextShaping.Shape("office", "GooAbiPath", 16f, 400, false, 0f, 1)
                if shapedPath.HasMissingGlyph || shapedPath.GlyphCount <= 0 {
                    throw InvalidOperationException("Font path source did not retain its bytes")
                }
            }
            File.Copy(fontPath, oversizedPath)
            {
                using let stream = File.OpenWrite(oversizedPath)
                stream.SetLength(int64(VulkanTextFont.MaxFontBytes) + int64(1))
            }
            try {
                using let rejected = FontSource.FromPath("GooAbiRejected", 400, false, oversizedPath)
                throw InvalidOperationException("Oversized font path was accepted")
            } catch (InvalidDataException) { }
        } finally {
            File.Delete(oversizedPath)
        }
        let cacheBudget = TextShaping.PrimaryFaceCacheByteBudgetForTests()
        let callerBytes = File.ReadAllBytes(fontPath)
        let oversizedBytes = [checked(int32(cacheBudget) + 1)]uint8
        Array.Copy(callerBytes, oversizedBytes, callerBytes.Length)
        let source = FontSource("GooAbiOwned", 400, false, callerBytes)
        callerBytes[0] = uint8((int32(callerBytes[0]) ^ 0xFF))
        var shaped ShapedText? = nil
        var oversizedSource FontSource? = nil
        var oversizedShaped ShapedText? = nil
        try {
            source.Register()
            if !source.IsRegistered {
                throw InvalidOperationException("Font source did not register")
            }
            shaped = TextShaping.Shape("office café", "GooAbiOwned", 16f, 400, false, 0f, 1)
            if shaped.GlyphCount <= 0 || shaped.Width <= 0f || shaped.HasMissingGlyph {
                throw InvalidOperationException("Registered font did not produce a complete shaped run")
            }
            if shaped.Runs.Count == 0 {
                throw InvalidOperationException("Registered font did not produce a shaped run lease")
            }
            let activeProvider = shaped.Runs[0].Provider
            source.Dispose()
            if source.IsRegistered || !source.IsDisposed {
                throw InvalidOperationException("Font source did not unregister on disposal")
            }
            if shaped.GlyphCount <= 0 || shaped.Width <= 0f || shaped.HasMissingGlyph {
                throw InvalidOperationException("Active shaped run did not survive source disposal")
            }
            let activeWorkspace = VulkanTextShapingWorkspace(16)
            let activeResult = activeProvider.ShapeInto(
                "A",
                VulkanTextShapingOptions{
                    Direction: 4u,
                    Script: 0x4C61746Eu,
                    Language: "en",
                    ClusterLevel: 0u,
                    Flags: 0u,
                    Features: nil
                },
                activeWorkspace
            )
            if activeResult.Status != VulkanTextProviderAbi.Success ||
                activeResult.Count <= 0 ||
                activeWorkspace.GlyphCount != activeResult.Count {
                throw InvalidOperationException("Active shaped run lease did not retain its provider")
            }
            shaped.Dispose()
            shaped = nil
            let cacheBefore = TextShaping.PrimaryFaceCacheBytesForTests()
            let countBefore = TextShaping.PrimaryFaceCacheCountForTests()
            if cacheBefore > cacheBudget {
                throw InvalidOperationException("Font cache exceeded its byte budget before oversized entry")
            }
            oversizedSource = FontSource("GooAbiOversized", 400, false, oversizedBytes)
            oversizedSource.Register()
            oversizedShaped = TextShaping.Shape("office café", "GooAbiOversized", 16f, 400, false, 0f, 1)
            if oversizedShaped.GlyphCount <= 0 ||
                oversizedShaped.Width <= 0f ||
                oversizedShaped.HasMissingGlyph ||
                oversizedShaped
                .Runs
                .Count == 0 {
                throw InvalidOperationException("Oversized registered font did not shape")
            }
            let oversizedProvider = oversizedShaped.Runs[0].Provider
            let cacheAfterShape = TextShaping.PrimaryFaceCacheBytesForTests()
            let countAfterShape = TextShaping.PrimaryFaceCacheCountForTests()
            if cacheAfterShape > cacheBudget || cacheAfterShape != cacheBefore || countAfterShape != countBefore {
                throw InvalidOperationException("Oversized font entered the cache")
            }
            oversizedSource.Dispose()
            let oversizedWorkspace = VulkanTextShapingWorkspace(16)
            let oversizedResult = oversizedProvider.ShapeInto(
                "A",
                VulkanTextShapingOptions{
                    Direction: 4u,
                    Script: 0x4C61746Eu,
                    Language: "en",
                    ClusterLevel: 0u,
                    Flags: 0u,
                    Features: nil
                },
                oversizedWorkspace
            )
            let cacheAfterDispose = TextShaping.PrimaryFaceCacheBytesForTests()
            if oversizedResult.Status != VulkanTextProviderAbi.Success ||
                oversizedResult.Count <= 0 ||
                oversizedWorkspace.GlyphCount != oversizedResult.Count ||
                cacheAfterDispose > cacheBudget {
                throw InvalidOperationException("Oversized active lease or cache budget contract failed")
            }
            Console.WriteLine(
                "FONT_CACHE_SMOKE defensiveCopy=1 cacheBytes=" + cacheAfterDispose.ToString() +
                    " budget=" +
                    cacheBudget.ToString() + " oversizedBypass=1 activeLease=1"
            )
        } finally {
            shaped?.Dispose()
            oversizedShaped?.Dispose()
            oversizedSource?.Dispose()
            source.Dispose()
        }
    }

    private func RunPathMorphGate() {
        let owner = VectorPathNormalizedOwner(4, 1, 0.0, 0.0, 100.0, 100.0)
        let array = []PathQuadratic{
            PathGeometry.Quadratic(0f, 0f, 50f, 0f, 100f, 0f),
            PathGeometry.Quadratic(100f, 0f, 100f, 50f, 100f, 100f),
            PathGeometry.Quadratic(100f, 100f, 50f, 100f, 0f, 100f),
            PathGeometry.Quadratic(0f, 100f, 0f, 50f, 0f, 0f)
        }
        let contours = []PathContour{PathGeometry.Contour(0, 4, closed: true)}
        var path = VectorPath.CreateMutableNormalized(owner, 0.0, 0.0, 100.0, 100.0)
        if !path.UpdateNormalized(array, 4, contours, 1) {
            throw InvalidOperationException("Initial mutable path update failed")
        }
        let pathGeometry = PathGeometry.For(path)
        let pathBandEncoding = PathBandEncoder.Encode(path)
        if pathBandEncoding.CurveCount != array.Length ||
            int64(pathBandEncoding.WordCount) <= pathBandEncoding.HeaderByteCount / int64(4) {
            throw InvalidOperationException("Initial path band encoding lost geometry")
        }
        let vulkanPathIdentityRegistry = VulkanPathIdentityRegistry()
        let vulkanPathResourceIdentity = vulkanPathIdentityRegistry.Resolve(path)
        let geometryRevision = path.GeometryRevision
        let pathGeometry2 = pathGeometry
        let pathBandEncoding2 = pathBandEncoding
        array[0] = PathGeometry.Quadratic(0f, 0f, 51f, 0f, 100f, 0f)
        if !path.UpdateNormalized(array, 4, contours, 1) {
            throw InvalidOperationException("Mutable path capacity update failed")
        }
        PathGeometry.For(path)
        PathBandEncoder.Encode(path)
        GC.Collect()
        GC.WaitForPendingFinalizers()
        GC.Collect()
        let allocatedBytesForCurrentThread = GC.GetAllocatedBytesForCurrentThread()
        for var i = 2; i <= 9; i++ {
            array[0] = PathGeometry.Quadratic(0f, 0f, 50 + i, 0f, 100f, 0f)
            if !path.UpdateNormalized(array, 4, contours, 1) {
                throw InvalidOperationException("Mutable path update did not advance")
            }
            if pathGeometry2 != PathGeometry.For(path) {
                throw InvalidOperationException("Path geometry cache was replaced")
            }
            if pathBandEncoding2 != PathBandEncoder.Encode(path) {
                throw InvalidOperationException("Path band encoding cache was replaced")
            }
        }
        let allocatedBytesForCurrentThread2 = GC.GetAllocatedBytesForCurrentThread()
        let vulkanPathResourceIdentity2 = vulkanPathIdentityRegistry.Resolve(path)
        vulkanPathIdentityRegistry.Dispose()
        if allocatedBytesForCurrentThread2 != allocatedBytesForCurrentThread ||
            path.GeometryRevision <= geometryRevision ||
            vulkanPathResourceIdentity
            .PathId
            .LogicalId != vulkanPathResourceIdentity2
            .PathId
            .LogicalId ||
            vulkanPathResourceIdentity.SourceId != vulkanPathResourceIdentity2.SourceId ||
            vulkanPathResourceIdentity.GeometryRevision == vulkanPathResourceIdentity2.GeometryRevision ||
            vulkanPathResourceIdentity
            .PathId
            .Version != vulkanPathResourceIdentity.GeometryRevision ||
            vulkanPathResourceIdentity2
            .PathId
            .Version != vulkanPathResourceIdentity2.GeometryRevision ||
            vulkanPathResourceIdentity
            .PathId
            .Version == vulkanPathResourceIdentity2
            .PathId
            .Version {
            throw InvalidOperationException("Mutable path warm allocation or identity gate failed")
        }
        Console.WriteLine(
            "PATH_MORPH_GATE allocated=0 stableGeometry=1 stableEncoding=1 stableIdentity=1 versionedIdentity=1"
        )
    }

    private func RunUploadRingGrowthGate() {
        let ring = VulkanUploadRing(64uL, 1, 1uL)
        try {
            let firstId = ResourceId{Kind: SceneResourceKind.Image, LogicalId: 1uL, Version: 1uL}
            let secondId = ResourceId{Kind: SceneResourceKind.Image, LogicalId: 2uL, Version: 1uL}
            let thirdId = ResourceId{Kind: SceneResourceKind.Image, LogicalId: 3uL, Version: 1uL}
            let first = ring.Reserve(firstId, 1uL, 8uL, 1uL)
            let second = ring.Reserve(secondId, 1uL, 8uL, 1uL)
            let third = ring.Reserve(thirdId, 1uL, 8uL, 1uL)
            if !first.Succeeded ||
                !second.Succeeded ||
                !third.Succeeded ||
                ring
                .Stats
                .ActiveRanges != 3 ||
                ring
                .Stats
                .UsedBytes != 24uL {
                throw InvalidOperationException("Upload ring range metadata did not grow")
            }
            if !ring.Cancel(first) || !ring.Cancel(second) || !ring.Cancel(third) || ring.Collect(0uL) != 3 ||
                ring
                .Stats
                .ActiveRanges != 0 ||
                ring
                .Stats
                .UsedBytes != 0uL {
                throw InvalidOperationException("Upload ring grown metadata did not retire")
            }
            Console.WriteLine("UPLOAD_RING_GROWTH_GATE initialRanges=1 activeRanges=3 retired=3")
        } finally {
            ring.Dispose()
        }
    }

    private func RunPathUploadGate() {
        let owner = VectorPathNormalizedOwner(4, 1, 0.0, 0.0, 100.0, 100.0)
        let array = []PathQuadratic{
            PathGeometry.Quadratic(0f, 0f, 50f, 0f, 100f, 0f),
            PathGeometry.Quadratic(100f, 0f, 100f, 50f, 100f, 100f),
            PathGeometry.Quadratic(100f, 100f, 50f, 100f, 0f, 100f),
            PathGeometry.Quadratic(0f, 100f, 0f, 50f, 0f, 0f)
        }
        let contours = []PathContour{PathGeometry.Contour(0, 4, closed: true)}
        var path = VectorPath.CreateMutableNormalized(owner, 0.0, 0.0, 100.0, 100.0)
        if !path.UpdateNormalized(array, 4, contours, 1) {
            throw InvalidOperationException("Path upload gate initial update failed")
        }
        {
            using let growthAtlas = VulkanPathAtlas(1uL)
            {
                using let growthResources = VulkanPathResources(growthAtlas, VulkanPathIdentityRegistry())
                let growthRenderable = growthResources.Register(path, FillRule.NonZero, false)
                growthResources.PrepareUpload()
                if growthResources
                    .Stats
                    .GrowthCount != 1uL ||
                    growthResources
                    .Atlas
                    .WordCapacity < uint64(growthRenderable.WordCount) ||
                    growthResources
                    .Atlas
                    .UploadWordOffset != 0uL ||
                    growthResources
                    .Atlas
                    .UploadWordCount != uint64(growthRenderable.WordCount) {
                    throw InvalidOperationException("Path atlas did not grow transactionally")
                }
                SubmitPathUpload(growthResources, 1uL)
                growthResources.Collect(1uL)
                let publishedGrowthRenderable = growthResources.Resolve(path, FillRule.NonZero)
                if !publishedGrowthRenderable.Published || !publishedGrowthRenderable.Renderable {
                    throw InvalidOperationException("Grown path atlas did not publish")
                }
            }
        }
        using let vulkanPathAtlas = VulkanPathAtlas(4096uL)
        using let vulkanPathResources = VulkanPathResources(vulkanPathAtlas, VulkanPathIdentityRegistry())
        let vulkanPathRenderable = vulkanPathResources.Register(path, FillRule.NonZero, false)
        vulkanPathResources.PrepareUpload()
        if vulkanPathResources
            .Atlas
            .UploadWordOffset != uint64(0L) ||
            vulkanPathResources
            .Atlas
            .UploadWordCount != uint64(vulkanPathRenderable.WordCount) ||
            vulkanPathResources
            .Atlas
            .UploadWordCount > vulkanPathResources
            .Atlas
            .WordCapacity {
            throw InvalidOperationException("Initial path atlas upload range was invalid")
        }
        SubmitPathUpload(vulkanPathResources, 1uL)
        let vulkanPathRenderable2 = vulkanPathResources.Resolve(path, FillRule.NonZero)
        if vulkanPathRenderable2.Published || !vulkanPathRenderable2.Renderable {
            throw InvalidOperationException("Submitted path upload was not renderable before publication")
        }
        vulkanPathResources.Collect(1uL)
        let vulkanPathRenderable3 = vulkanPathResources.Resolve(path, FillRule.NonZero)
        if !vulkanPathRenderable3.Published || !vulkanPathRenderable3.Renderable {
            throw InvalidOperationException("Path did not publish after upload completion")
        }
        array[0] = PathGeometry.Quadratic(0f, 0f, 51f, 0f, 100f, 0f)
        if !path.UpdateNormalized(array, 4, contours, 1) {
            throw InvalidOperationException("Path upload gate append update failed")
        }
        let vulkanPathRenderable4 = vulkanPathResources.Register(path, FillRule.NonZero, false)
        vulkanPathResources.PrepareUpload()
        if vulkanPathResources
            .Atlas
            .UploadWordOffset != uint64(vulkanPathRenderable.WordCount) ||
            vulkanPathResources
            .Atlas
            .UploadWordCount != uint64(vulkanPathRenderable4.WordCount) {
            throw InvalidOperationException("Path atlas suffix upload range was invalid")
        }
        SubmitPathUpload(vulkanPathResources, 2uL)
        vulkanPathResources.Collect(2uL)
        if vulkanPathResources.Stats.FreeWordCount < vulkanPathRenderable.WordCount {
            throw InvalidOperationException("Path atlas retired range was not reclaimed")
        }
        array[0] = PathGeometry.Quadratic(0f, 0f, 52f, 0f, 100f, 0f)
        if !path.UpdateNormalized(array, 4, contours, 1) {
            throw InvalidOperationException("Path upload gate reuse update failed")
        }
        let vulkanPathRenderable5 = vulkanPathResources.Register(path, FillRule.NonZero, false)
        if vulkanPathRenderable5.BaseWord != vulkanPathRenderable.BaseWord {
            throw InvalidOperationException("Path atlas did not reuse the retired range")
        }
        vulkanPathResources.PrepareUpload()
        let uploadWordCount = vulkanPathResources.Atlas.UploadWordCount
        if vulkanPathResources
            .Atlas
            .UploadWordOffset != uint64(vulkanPathRenderable5.BaseWord) ||
            uploadWordCount != uint64(vulkanPathRenderable5.WordCount) ||
            vulkanPathResources
            .Atlas
            .UploadWordOffset +
            uploadWordCount > vulkanPathResources
            .Atlas
            .WordCapacity ||
            uploadWordCount >= vulkanPathResources
            .Atlas
            .WordCapacity {
            throw InvalidOperationException("Path atlas reused upload was not bounded")
        }
        let vulkanPathRenderable6 = vulkanPathResources.Resolve(path, FillRule.NonZero)
        if vulkanPathRenderable6.Published || vulkanPathRenderable6.Renderable {
            throw InvalidOperationException("Dirty reused path was published before completion")
        }
        if !vulkanPathResources.AbortUpload() ||
            !vulkanPathResources.UploadPending ||
            vulkanPathResources
            .Atlas
            .UploadPending {
            throw InvalidOperationException("Aborted path upload did not retain dirty work")
        }
        vulkanPathResources.PrepareUpload()
        if vulkanPathResources
            .Atlas
            .UploadWordOffset != uint64(vulkanPathRenderable5.BaseWord) ||
            vulkanPathResources
            .Atlas
            .UploadWordCount != uploadWordCount {
            throw InvalidOperationException("Retained dirty path upload range changed")
        }
        SubmitPathUpload(vulkanPathResources, 3uL)
        vulkanPathResources.Collect(3uL)
        let vulkanPathRenderable7 = vulkanPathResources.Resolve(path, FillRule.NonZero)
        if !vulkanPathRenderable7.Published || !vulkanPathRenderable7.Renderable {
            throw InvalidOperationException("Reused path did not publish after completion")
        }
        array[0] = PathGeometry.Quadratic(0f, 0f, 53f, 0f, 100f, 0f)
        path.UpdateNormalized(array, 4, contours, 1)
        vulkanPathResources.Register(path, FillRule.NonZero, false)
        vulkanPathResources.PrepareUpload()
        SubmitPathUpload(vulkanPathResources, 4uL)
        vulkanPathResources.Collect(4uL)
        array[0] = PathGeometry.Quadratic(0f, 0f, 54f, 0f, 100f, 0f)
        path.UpdateNormalized(array, 4, contours, 1)
        let allocatedBytesForCurrentThread = GC.GetAllocatedBytesForCurrentThread()
        vulkanPathResources.Register(path, FillRule.NonZero, false)
        vulkanPathResources.PrepareUpload()
        let num = GC.GetAllocatedBytesForCurrentThread() - allocatedBytesForCurrentThread
        if num != 0L {
            throw InvalidOperationException("Warm path atlas reuse allocated")
        }
        SubmitPathUpload(vulkanPathResources, 5uL)
        vulkanPathResources.Collect(5uL)
        Console.WriteLine(
            "PATH_UPLOAD_GATE atlasWords=" +
                vulkanPathResources
                .Atlas
                .WordCapacity
                .ToString() +
                " growthCount=" +
                vulkanPathResources
                .Stats
                .GrowthCount
                .ToString() +
                " reuseOffset=" +
                vulkanPathRenderable5
                .BaseWord
                .ToString() + " reuseWords=" + vulkanPathRenderable5.WordCount.ToString() +
                " warmAllocated=" +
                num.ToString() + " abortRetained=1 unpublished=1 published=1"
        )
    }

    private func RunPathEvictionGate() {
        let MakePath = (index int32) -> {
            let builder = PathBuilder(0.0, 0.0, 100.0, 100.0)
            builder.MoveTo(index, 0.0)
            builder.LineTo(index + 1, 20.0)
            builder.LineTo(index + 2, 0.0)
            builder.Close()
            return builder.Build()
        }
        let retained = [12]VectorPath
        for var index = 0; index < retained.Length; index++ {
            retained[index] = MakePath(index)
        }
        let words = uint64(PathBandEncoder.Encode(retained[0]).WordCount)
        using let resources = VulkanPathResources(VulkanPathAtlas(words * uint64(16)), VulkanPathIdentityRegistry())
        using let scene = VulkanPathScene(resources)
        var registrations = 0
        for var frame = 0; frame < 6; frame++ {
            scene.BeginCompile()
            for var marker = 0; marker < 4; marker++ {
                scene.Emit(MakePath(20 + frame * 4 + marker), FillRule.NonZero)
            }
            for path in retained {
                let before = resources.LiveWordCount
                scene.Emit(path, FillRule.NonZero)
                if frame > 0 && resources.LiveWordCount != before {
                    registrations++
                }
            }
            let _ = scene.CurrentPathCount
            resources.PrepareUpload()
            SubmitPathUpload(resources, uint64(frame) + uint64(1))
            resources.Collect(uint64(frame) + uint64(1))
        }
        if registrations != 0 {
            throw InvalidOperationException(
                "Retained paths registered again after fresh paths: " + registrations.ToString()
            )
        }
        if resources.Stats.GrowthCount != uint64(1) || resources.Stats.EvictionCount != uint64(4) {
            throw InvalidOperationException("Path pressure did not reclaim only the required paths")
        }
        if !resources.Resolve(MakePath(24), FillRule.NonZero).Published || resources.Resolve(
            MakePath(20),
            FillRule.NonZero
        )
            .Published {
            throw InvalidOperationException("Path pressure did not evict the least recently used paths")
        }
        Console.WriteLine(
            "PATH_EVICTION_GATE retained=12 frames=6 retainedRegistrations=" + registrations.ToString() +
                " growth=" +
                resources
                .Stats
                .GrowthCount
                .ToString() +
                " demandLimited=1 lru=1"
        )
    }

    private func RunEvenOddPathGate() {
        let pathBuilder = PathBuilder(0.0, 0.0, 1800.0, 1800.0)
        pathBuilder.MoveTo(20.0, 20.0).LineTo(1780.0, 20.0).LineTo(1780.0, 1780.0).LineTo(20.0, 1780.0).Close()
        for var i = 0; i < 256; i++ {
            let num = 40 + i % 32 * 54
            let num2 = 40 + i / 32 * 54
            pathBuilder
                .MoveTo(num, num2)
                .LineTo(num + 12, num2)
                .LineTo(num + 12, num2 + 12)
                .LineTo(num, num2 + 12)
                .Close()
        }
        let path = pathBuilder.Build()
        let pathGeometry = PathGeometry.For(path)
        let pathBandEncoding = PathBandEncoder.Encode(path)
        if pathGeometry.QuadraticCount != 1028 ||
            pathBandEncoding.CurveCount != 1028 ||
            pathBandEncoding.HorizontalBandCount != 32 ||
            pathBandEncoding.VerticalBandCount != 32 ||
            pathBandEncoding.WordCount != 15566 ||
            !pathBandEncoding.Supports(FillRule.EvenOdd) {
            throw InvalidOperationException("EvenOdd path encoding gate failed")
        }
        GC.Collect()
        GC.WaitForPendingFinalizers()
        GC.Collect()
        PathBandEncoder.Encode(path)
        let allocatedBytesForCurrentThread = GC.GetAllocatedBytesForCurrentThread()
        for var j = 0; j < 64; j++ {
            if pathBandEncoding != PathBandEncoder.Encode(path) {
                throw InvalidOperationException("EvenOdd path encoding cache was replaced")
            }
        }
        let num3 = GC.GetAllocatedBytesForCurrentThread() - allocatedBytesForCurrentThread
        if num3 != 0L {
            throw InvalidOperationException("EvenOdd path warm encoding allocated")
        }
        Console.WriteLine(
            "PATH_EVENODD_GATE holes=" + (256).ToString() + " curves=" + pathBandEncoding.CurveCount.ToString() +
                " words=" +
                pathBandEncoding
                .WordCount
                .ToString() + " warmAllocated=" + num3.ToString() + " warmCalls=64"
        )
        let largePath = PathBuilder(0.0, 0.0, 1024.0, 1024.0)
        for var i = 0; i < 512; i++ {
            let x = i * 37 % 1024
            let y = i * 53 % 1024
            largePath.MoveTo(x, y).QuadraticTo(x + 16, y - 16, x + 8, y).LineTo(x, y + 8).Close()
        }
        let largeEncoding = PathBandEncoder.Encode(largePath.Build())
        let bytes = MemoryMarshal.AsBytes(largeEncoding.Words.AsSpan(0, largeEncoding.WordCount))
        let hash = Convert.ToHexString(SHA256.HashData(bytes))
        if largeEncoding.WordCount != 23336 ||
            hash != "3A9A16468660B74CEC3A4E2A5FFCB31E6C089371E2AF7E8DEC6080DFAB76BF97" {
            throw InvalidOperationException("Large path encoding changed")
        }
        Console.WriteLine("PATH_LARGE_ENCODING_GATE curves=" + largeEncoding.CurveCount.ToString() + " sha256=" + hash)
        for var i = 512; i < 8192; i++ {
            let x = i * 37 % 1024
            let y = i * 53 % 1024
            largePath.MoveTo(x, y).QuadraticTo(x + 16, y - 16, x + 8, y).LineTo(x, y + 8).Close()
        }
        let adaptive = PathBandEncoder.Encode(largePath.Build())
        if adaptive.HorizontalBandCount <= 32 ||
            adaptive.VerticalBandCount <= 32 ||
            adaptive.HorizontalBandCount > 2048 ||
            adaptive.VerticalBandCount > 2048 {
            throw InvalidOperationException("Large path bands did not adapt to curve density")
        }
        Console.WriteLine(
            "PATH_ADAPTIVE_BAND_GATE curves=" + adaptive.CurveCount.ToString() +
                " horizontal=" +
                adaptive
                .HorizontalBandCount
                .ToString() + " vertical=" + adaptive.VerticalBandCount.ToString()
        )
    }

    private func SubmitPathUpload(resources VulkanPathResources, fence uint64) {
        resources.RecordUpload(1)
        if resources.FlushBeforeSubmit() != 0 {
            throw InvalidOperationException("Path atlas upload flush failed")
        }
        resources.MarkSubmitted(1, fence)
    }

    private func RunSceneAllocationGate() int32 {
        let root = Node(){
            Kind = NodeKind.Container,
            Rect = Rect{X: 0.0F, Y: 0.0F, W: 320.0F, H: 180.0F},
            BackgroundGradient = LinearGradient(135.0, Color.Rgb(24, 42, 88), Color.Rgb(214, 164, 72)),
            OverflowX = Overflow.Hidden,
            OverflowY = Overflow.Hidden
        }
        let child = Node(){
            Kind = NodeKind.Button,
            Parent = root,
            Rect = Rect{X: 20.0F, Y: 20.0F, W: 120.0F, H: 60.0F},
            BackgroundColor = Color.Rgb(42, 72, 132),
            BorderTopWidth = 2,
            BorderRightWidth = 2,
            BorderBottomWidth = 2,
            BorderLeftWidth = 2,
            BorderTopColor = Color.Rgb(220, 220, 220),
            BorderRightColor = Color.Rgb(220, 220, 220),
            BorderBottomColor = Color.Rgb(220, 220, 220),
            BorderLeftColor = Color.Rgb(220, 220, 220)
        }
        root.Children.Add(child)
        let compiler = VulkanSceneCompiler(8)
        for var warmup = 0; warmup < 9; warmup++ {
            compiler.Compile(root, Color.Transparent, 320.0F, 180.0F)
        }
        let before = GC.GetAllocatedBytesForCurrentThread()
        let result = compiler.Compile(root, Color.Transparent, 320.0F, 180.0F)
        let allocated = GC.GetAllocatedBytesForCurrentThread() - before
        if result.VisibleNodeCount != 2 || result.DrawCount == 0 || result.HasUnsupported {
            throw InvalidOperationException("Vulkan scene allocation gate produced an unsupported scene")
        }
        Console.WriteLine(
            "VULKAN_SCENE_ALLOC allocated=" + allocated.ToString() + " draws=" + result.DrawCount.ToString() +
                " visibleNodes=" +
                result
                .VisibleNodeCount
                .ToString()
        )
        return if allocated == int64(0) {
            0
        } else {
            1
        }
    }

    private func RunOverflowBorderGate() {
        for radius in[]int32{0, 8} {
            let Box = (size int32) -> Node(){
                Kind = NodeKind.Container,
                Rect = Rect{X: 0.0F, Y: 0.0F, W: size, H: size},
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
                OverflowY = Overflow.Hidden
            }
            let root = Box(100)
            let child = Box(80)
            child.Parent = root
            root.Children.Add(child)
            let compiler = VulkanSceneCompiler(8)
            compiler.Compile(root, Color.Transparent, 100.0F, 100.0F)
            var depth = 0
            var borders = 0
            var rootBorderDraw = -1
            var childPaintDraw = -1
            for var i = 0; i < compiler.Frame.DrawRefCount; i++ {
                let draw = compiler.Frame.DrawRefs[i]
                if draw.Kind == SceneDrawKind.RectClipBegin {
                    depth++
                } else if draw.Kind == SceneDrawKind.RectClipEnd {
                    depth--
                } else if draw.Kind == SceneDrawKind.PerEdgeBorder {
                    let border = compiler.Frame.PerEdgeBorders[draw.Index]
                    if borders == 0 &&
                        (
                        depth != 0 ||
                            draw.ClipChainId != 0 ||
                            border
                            .Bounds
                            .Width != float32(100.0) ||
                            border
                            .Bounds
                            .Height != float32(100.0) ||
                            border.RadiusTopLeft != float32(radius)
                    ) {
                        throw InvalidOperationException("Border clipped by its own overflow scissor")
                    }
                    if borders == 1 &&
                        (
                        border
                            .Bounds
                            .Width != float32(80.0) ||
                            border
                            .Bounds
                            .Height != float32(80.0) ||
                            depth != 1 ||
                            draw.ClipChainId != 0 ||
                            border.RadiusTopLeft != float32(radius)
                    ) {
                        throw InvalidOperationException(
                            "Child border lost its parent overflow clip: radius=" + radius.ToString() +
                                " depth=" +
                                depth.ToString() + " chain=" + draw.ClipChainId.ToString() +
                                " chainDepth=" +
                                compiler
                                .Frame
                                .ClipChains[draw.ClipChainId]
                                .Depth
                                .ToString()
                        )
                    }
                    if borders == 0 {
                        rootBorderDraw = i
                    }
                    borders++
                } else if rootBorderDraw >= 0 &&
                    childPaintDraw < 0 &&
                    draw.Kind == (
                    if radius == 0 {
                        SceneDrawKind.SolidBox
                    } else {
                        SceneDrawKind.RoundedBox
                    }
                ) {
                    let width = if radius == 0 {
                        compiler.Frame.SolidBoxes[draw.Index].Bounds.Width
                    } else {
                        compiler.Frame.RoundedBoxes[draw.Index].Bounds.Width
                    }
                    if width == float32(80.0) {
                        childPaintDraw = i
                    }
                }
            }
            if depth != 0 || borders != 2 || childPaintDraw <= rootBorderDraw {
                throw InvalidOperationException("Nested overflow border scene is incomplete")
            }
        }
        Console.WriteLine("VULKAN_OVERFLOW_BORDER PASS square and rounded nested borders")
    }

    private func RunPortalRetentionGate() {
        let root = Node(){
            Kind = NodeKind.Container,
            Rect = Rect{X: 0.0F, Y: 0.0F, W: 200.0F, H: 100.0F},
            BackgroundColor = Color.Rgb(18, 24, 36)
        }
        let source = Node(){
            Kind = NodeKind.Container,
            Parent = root,
            Rect = Rect{X: 0.0F, Y: 0.0F, W: 20.0F, H: 20.0F},
            Opacity = 0.0,
            OverflowX = Overflow.Hidden,
            OverflowY = Overflow.Hidden
        }
        let foreground = Node(){
            Kind = NodeKind.Container,
            Parent = root,
            Rect = Rect{X: 80.0F, Y: 10.0F, W: 70.0F, H: 50.0F},
            BackgroundColor = Color.Rgb(180, 40, 40)
        }
        let PortalNode = (z int32, x int32, color Color) -> {
            let portal = Node(){
                Kind = NodeKind.Container,
                IsPortal = true,
                Parent = source,
                Rect = Rect{X: x, Y: 20.0F, W: 60.0F, H: 40.0F},
                ZIndex = z
            }
            let content = Node(){
                Kind = NodeKind.Container,
                Parent = portal,
                Rect = Rect{X: x, Y: 20.0F, W: 60.0F, H: 40.0F},
                BackgroundColor = color
            }
            portal.Children.Add(content)
            source.Children.Add(portal)
            return portal
        }
        let first = PortalNode(5, 70, Color.Rgb(30, 170, 80))
        let second = PortalNode(5, 90, Color.Rgb(40, 90, 210))
        root.Children.Add(source)
        root.Children.Add(foreground)
        let overlay = Node(){
            Kind = NodeKind.Container,
            Rect = Rect{X: 0.0F, Y: 0.0F, W: 200.0F, H: 100.0F},
            HitTestSelf = false
        }
        Portals.Sync(root, overlay)
        let warm = VulkanSceneCompiler(8)
        warm.Compile(root, overlay, Color.Transparent, 200.0F, 100.0F)
        let hits = warm.RetainedLeafHitCount + warm.RetainedParentBoxHitCount
        warm.Compile(root, overlay, Color.Transparent, 200.0F, 100.0F)
        if warm.RetainedLeafHitCount + warm.RetainedParentBoxHitCount <= hits {
            throw InvalidOperationException("Portal scene did not exercise retained box reuse")
        }
        AssertPortalDrawOrder(warm.Frame, Color.Rgb(30, 170, 80), Color.Rgb(40, 90, 210))
        first.ZIndex = 10
        let warmResult = warm.Compile(root, overlay, Color.Transparent, 200.0F, 100.0F)
        let cold = VulkanSceneCompiler(8)
        let coldResult = cold.Compile(root, overlay, Color.Transparent, 200.0F, 100.0F)
        if warmResult.HasUnsupported || coldResult.HasUnsupported {
            throw InvalidOperationException("Portal comparison produced an unsupported scene")
        }
        AssertPortalDrawOrder(warm.Frame, Color.Rgb(40, 90, 210), Color.Rgb(30, 170, 80))
        AssertSemanticSceneEqual(warm.Frame, cold.Frame)
        Console.WriteLine("VULKAN_PORTAL_RETENTION PASS cold and warm semantic scenes match")
    }

    private func AssertSemanticSceneEqual(expected SceneFrame, actual SceneFrame) {
        if expected.DrawRefCount != actual.DrawRefCount {
            throw InvalidOperationException("Portal semantic draw counts differ")
        }
        for var i = 0; i < expected.DrawRefCount; i++ {
            let left = expected.DrawRefs[i]
            let right = actual.DrawRefs[i]
            if left.Kind != right.Kind || left.Flags != right.Flags || left.ClipChainId != right.ClipChainId {
                throw InvalidOperationException("Portal semantic draw order differs at " + i.ToString())
            }
            if left.Kind != SceneDrawKind.SolidBox || !expected.SolidBoxes[left.Index].Equals(
                actual.SolidBoxes[right.Index]
            ) {
                throw InvalidOperationException("Portal semantic payload differs at " + i.ToString())
            }
        }
    }

    private func AssertPortalDrawOrder(frame SceneFrame, first Color, second Color) {
        var first = first
        var second = second
        if frame.DrawRefCount != 4 {
            throw InvalidOperationException("Portal scene did not emit four boxes")
        }
        let expected = []uint32{
            Color.Rgb(18, 24, 36).ToPackedRgba(),
            Color.Rgb(180, 40, 40).ToPackedRgba(),
            first.ToPackedRgba(),
            second.ToPackedRgba()
        }
        for var i = 0; i < expected.Length; i++ {
            let draw = frame.DrawRefs[i]
            if (draw.Kind != SceneDrawKind.SolidBox || frame.SolidBoxes[draw.Index].Color != expected[i]) {
                throw InvalidOperationException("Portal draw order differs at " + i.ToString())
            }
        }
    }

    private func RunRetainedPrimitiveSpanGate() {
        let root = Node(){Kind = NodeKind.Container, Rect = Rect{X: 0.0F, Y: 0.0F, W: 320.0F, H: 180.0F}}
        let solid = Node(){
            Kind = NodeKind.Container,
            Parent = root,
            Rect = Rect{X: 10.0F, Y: 10.0F, W: 80.0F, H: 30.0F},
            BackgroundColor = Color.Rgb(32, 64, 128)
        }
        let rounded = Node(){
            Kind = NodeKind.Container,
            Parent = root,
            Rect = Rect{X: 100.0F, Y: 10.0F, W: 80.0F, H: 30.0F},
            BackgroundColor = Color.Rgb(64, 96, 160),
            BorderRadius = 5
        }
        let border = Node(){
            Kind = NodeKind.Container,
            Parent = root,
            Rect = Rect{X: 190.0F, Y: 10.0F, W: 80.0F, H: 30.0F},
            BorderTopWidth = 2,
            BorderRightWidth = 2,
            BorderBottomWidth = 2,
            BorderLeftWidth = 2,
            BorderTopColor = Color.Rgb(220, 220, 220),
            BorderRightColor = Color.Rgb(220, 220, 220),
            BorderBottomColor = Color.Rgb(220, 220, 220),
            BorderLeftColor = Color.Rgb(220, 220, 220)
        }
        root.Children.Add(solid)
        root.Children.Add(rounded)
        root.Children.Add(border)
        let compiler = VulkanSceneCompiler(8)
        compiler.Compile(root, Color.Transparent, 320.0F, 180.0F)
        var exactRebuildChunks = 0
        for var index = 0; index < compiler.Frame.ChunkCount; index++ {
            let chunk = compiler.Frame.Chunks[index]
            if chunk.RetentionState != SceneChunkRetentionState.ExactLeafRebuild {
                continue
            }
            exactRebuildChunks++
            if chunk.ContentKey == uint64(0) || chunk.TopologyKey == uint64(0) {
                throw InvalidOperationException("Exact retained leaf rebuild digest was skipped")
            }
        }
        if exactRebuildChunks != 3 {
            throw InvalidOperationException("Exact retained leaf rebuild chunks were not preserved")
        }
        var before = compiler.Frame.Counters.RecordOperations
        let stable = compiler.Compile(root, Color.Transparent, 320.0F, 180.0F)
        let stableWrites = compiler.Frame.Counters.RecordOperations - before
        if stable.DrawCount != 3 || stableWrites != uint64(0) {
            throw InvalidOperationException("Retained primitive spans were not reused")
        }
        compiler.Frame.InvalidateRetainedPrimitiveSpans()
        before = compiler.Frame.Counters.RecordOperations
        let rebuilt = compiler.Compile(root, Color.Transparent, 320.0F, 180.0F)
        let rebuiltWrites = compiler.Frame.Counters.RecordOperations - before
        if rebuilt.DrawCount != 3 || rebuiltWrites != uint64(3) {
            throw InvalidOperationException("Invalid retained primitive spans were reused")
        }
        var exactHitChunks = 0
        for var index = 0; index < compiler.Frame.ChunkCount; index++ {
            let chunk = compiler.Frame.Chunks[index]
            if chunk.RetentionState != SceneChunkRetentionState.ExactLeafHit {
                continue
            }
            exactHitChunks++
            if chunk.ContentKey != uint64(0) || chunk.TopologyKey != uint64(0) {
                throw InvalidOperationException("Exact retained leaf digest was computed")
            }
        }
        if exactHitChunks != 3 {
            throw InvalidOperationException("Exact retained leaf chunks were not preserved")
        }
        before = compiler.Frame.Counters.RecordOperations
        compiler.Compile(root, Color.Transparent, 320.0F, 180.0F)
        let recoveredWrites = compiler.Frame.Counters.RecordOperations - before
        if recoveredWrites != uint64(0) {
            throw InvalidOperationException("Retained primitive spans did not recover")
        }
        root.Children.RemoveAt(0)
        root.Children.Add(solid)
        before = compiler.Frame.Counters.RecordOperations
        compiler.Compile(root, Color.Transparent, 320.0F, 180.0F)
        let reorderedWrites = compiler.Frame.Counters.RecordOperations - before
        if reorderedWrites != uint64(3) {
            throw InvalidOperationException("Reordered retained primitive spans were reused")
        }
        before = compiler.Frame.Counters.RecordOperations
        compiler.Compile(root, Color.Transparent, 320.0F, 180.0F)
        let reorderedStableWrites = compiler.Frame.Counters.RecordOperations - before
        if reorderedStableWrites != uint64(0) {
            throw InvalidOperationException("Reordered retained primitive spans did not stabilize")
        }
        Console.WriteLine(
            "RETAINED_PRIMITIVE_SPAN_GATE stableWrites=" + stableWrites.ToString() +
                " invalidatedWrites=" +
                rebuiltWrites.ToString() + " recoveredWrites=" + recoveredWrites.ToString() +
                " reorderedWrites=" +
                reorderedWrites.ToString() + " reorderedStableWrites=" + reorderedStableWrites.ToString()
        )
    }

    private func RunDamageJournalGate() int32 {
        const width = 320u
        const height = 180u
        const scaleX = 1.0F
        const scaleY = 1.0F
        let journal = VulkanSceneDamageJournal(4)
        let oldBounds = ConservativeBounds{X: 20.0F, Y: 30.0F, Width: 40.0F, Height: 20.0F}
        let newBounds = ConservativeBounds{X: 22.0F, Y: 34.0F, Width: 60.0F, Height: 20.0F}
        journal.BeginVersion(1uL)
        journal.EndVersion()
        RequireJournalFull(journal, 0uL, 1uL, scaleX, scaleY, width, height, "first-use")
        RequireJournalNone(journal, 1uL, 1uL, scaleX, scaleY, width, height, "same-key")
        RequireJournalFull(journal, 1uL, 1uL, 2.0F, scaleY, width, height, "scale-only")
        RequireJournalFull(journal, 1uL, 1uL, 2.0F, scaleY, width * 2u, height, "extent-only")
        journal.BeginVersion(2uL)
        journal.EndVersion()
        RequireJournalFull(journal, 1uL, 2uL, scaleX, scaleY, width, height, "scale-transition")
        journal.BeginVersion(3uL)
        journal.EndVersion()
        RequireJournalNone(journal, 2uL, 3uL, scaleX, scaleY, width, height, "unchanged-key")
        journal.BeginVersion(4uL)
        journal.AddChange(oldBounds, true, newBounds, true)
        journal.EndVersion()
        RequireJournalRegion(
            journal,
            3uL,
            4uL,
            scaleX,
            scaleY,
            width,
            height,
            VulkanDamageRegion{X: 20, Y: 30, Width: 62, Height: 24},
            "unchanged-key-mutation"
        )
        let gap = VulkanSceneDamageJournal(2)
        gap.BeginVersion(1uL)
        gap.EndVersion()
        RequireJournalFull(gap, 0uL, 1uL, scaleX, scaleY, width, height, "gap-first-use")
        gap.BeginVersion(2uL)
        gap.EndVersion()
        RequireJournalNone(gap, 1uL, 2uL, scaleX, scaleY, width, height, "gap-warm")
        gap.BeginVersion(3uL)
        gap.EndVersion()
        RequireJournalFull(gap, 1uL, 3uL, scaleX, scaleY, width, height, "eviction-gap")
        journal.Reset()
        journal.BeginVersion(5uL)
        journal.EndVersion()
        RequireJournalFull(journal, 5uL, 5uL, scaleX, scaleY, width, height, "reset-first-use")
        let retry = VulkanSceneDamageJournal(2)
        retry.BeginVersion(1uL)
        retry.EndVersion()
        RequireJournalFull(retry, 0uL, 1uL, scaleX, scaleY, width, height, "retry-first-use")
        retry.BeginVersion(2uL)
        retry.AddChange(oldBounds, true, newBounds, true)
        RequireJournalFull(retry, 1uL, 2uL, scaleX, scaleY, width, height, "abandoned-version")
        retry.EndVersion()
        Console.WriteLine(
            "VULKAN_DAMAGE_JOURNAL_GATE sameKey=1 scale=1 extent=1 scaleMutation=1 scaleTransition=1 unchangedKey=1 mutationUnchanged=1 logicalBounded=1 evictionGap=1 reset=1 abandoned=1"
        )
        return 0
    }

    private func RequireJournalNone(
        journal VulkanSceneDamageJournal,
        appliedVersion uint64,
        currentVersion uint64,
        scaleX float32,
        scaleY float32,
        width uint32,
        height uint32,
        scenario string
    ) {
        let hasDamage = journal.BuildSince(
            appliedVersion,
            currentVersion,
            scaleX,
            scaleY,
            width,
            height,
            out var region,
            out var fullRedraw
        )
        if hasDamage || fullRedraw || !region.IsEmpty {
            throw InvalidOperationException("Damage journal " + scenario + " was not empty")
        }
    }

    private func RequireJournalFull(
        journal VulkanSceneDamageJournal,
        appliedVersion uint64,
        currentVersion uint64,
        scaleX float32,
        scaleY float32,
        width uint32,
        height uint32,
        scenario string
    ) {
        let hasDamage = journal.BuildSince(
            appliedVersion,
            currentVersion,
            scaleX,
            scaleY,
            width,
            height,
            out var region,
            out var fullRedraw
        )
        if !hasDamage ||
            !fullRedraw ||
            region.X != 0 ||
            region.Y != 0 ||
            region.Width != int32(width) ||
            region.Height != int32(height) {
            throw InvalidOperationException("Damage journal " + scenario + " was not full")
        }
    }

    private func RequireJournalRegion(
        journal VulkanSceneDamageJournal,
        appliedVersion uint64,
        currentVersion uint64,
        scaleX float32,
        scaleY float32,
        width uint32,
        height uint32,
        expected VulkanDamageRegion,
        scenario string
    ) {
        let hasDamage = journal.BuildSince(
            appliedVersion,
            currentVersion,
            scaleX,
            scaleY,
            width,
            height,
            out var region,
            out var fullRedraw
        )
        if !hasDamage ||
            fullRedraw ||
            region.X != expected.X ||
            region.Y != expected.Y ||
            region.Width != expected.Width ||
            region.Height != expected.Height {
            throw InvalidOperationException("Damage journal " + scenario + " was not bounded")
        }
    }
}
