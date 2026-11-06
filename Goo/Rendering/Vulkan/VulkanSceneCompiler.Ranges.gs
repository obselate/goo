package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices

internal struct VulkanSceneRangeCounters {
    internal var Visible int32
    internal var Emitted int32
    internal var Skipped int32
    internal var Scroll int32
    internal var Clips int32
    internal var PathClips int32
    internal var ExactCandidates int32
    internal var ExactCulls int32
    internal var CachedCulls int32
    internal var UnsupportedNodes int32
    internal var UnsupportedPrimitives int32
}

internal enum VulkanSceneRangeBoundary {
    Node;
    Content;
}

internal struct VulkanSceneRangeCompilation {
    internal var ParentSlot int32
    internal var Counters VulkanSceneRangeCounters
}

internal struct VulkanSceneRangeEntry {
    internal var Owner WeakReference[VulkanSceneOwnerId]?
    internal var OwnerId uint64
    internal var ParentSlot int32
    internal var ParentOwnerId uint64
    internal var Boundary VulkanSceneRangeBoundary
    internal var ContentSlot int32
    internal var Version uint64
    internal var Start VulkanSceneRangePosition
    internal var End VulkanSceneRangePosition
    internal var Context VulkanSceneTraversalContext
    internal var ParentTransform PrimitiveTransform
    internal var RoundedOwnerId uint64
    internal var FirstSlot int32
    internal var EndSlot int32
    internal var ActiveClip int32
    internal var ActiveTransform int32
    internal var Counters VulkanSceneRangeCounters
    internal var Valid bool
    internal var PreservesExternalBackdrop bool
}

internal partial class VulkanSceneCompiler {
    private const RangeByteLimit int64 = 16L * 1024L * 1024L
    private const RangeSlotLimit int32 = 4096
    private let rangeData VulkanRetainedSceneData = VulkanRetainedSceneData()
    private var rangeEntries[]VulkanSceneRangeEntry = Array.Empty[VulkanSceneRangeEntry]()
    private var rangeOrder[]int32 = Array.Empty[int32]()
    private var rangePriorOrder[]int32 = Array.Empty[int32]()
    private var rangeFreeSlots[]int32 = Array.Empty[int32]()
    private var rangeFreeCount int32
    private var rangeUsedSlots int32
    private var rangeOrderCount int32
    private var rangePriorOrderCount int32
    private var rangeEvictionIndex int32
    private var rangeActiveSlot int32 = -1
    private var rangeSnapshotVersion uint64
    private var rangeProofVersion uint64
    private var rangeFontGeneration uint64
    private var rangeAtlasGeneration uint64
    private var rangePixelScale float64
    private var rangeExactCullEnabled bool
    private var rangeReady bool
    private var rangeForceCompile bool
    private var rangeCompileCount int32
    private var rangeHitCount int32
    private var rangePeakBytes int64
    private let rangeRoot WeakReference[Node] = WeakReference[Node](nil)
    private let rangeOverlayRoot WeakReference[Node] = WeakReference[Node](nil)

    internal prop RetainedOwnerCount int32 {
        get {
            let retained = HashSet[VulkanSceneOwnerId]()
            if rangeRoot.TryGetTarget(out var root) {
                CollectRetainedOwners(root, retained)
            }
            if rangeOverlayRoot.TryGetTarget(out var overlays) {
                CollectRetainedOwners(overlays, retained)
            }
            for entry in owners {
                retained.Add(entry.Value)
            }
            return retained.Count
        }
    }

    private func CollectRetainedOwners(node Node, retained HashSet[VulkanSceneOwnerId]) {
        if node.Retired {
            return
        }
        if Object.ReferenceEquals(node.VulkanOwnerToken, ownerToken) {
            if let owner = node.VulkanOwner {
                retained.Add(owner)
            }
        }
        for child in node.Children {
            CollectRetainedOwners(child, retained)
        }
        for child in ScrollbarParts.ActiveChildren(node) {
            CollectRetainedOwners(child, retained)
        }
    }

    internal prop RangeCompileCount int32 {
        get -> rangeCompileCount
    }
    internal prop RangeHitCount int32 {
        get -> rangeHitCount
    }
    internal prop RangeRetainedBytes int64 {
        get -> RangeMetadataBytes(rangeEntries.Length)
        + rangeData.CapacityBytes(VulkanSceneRangePosition{})
    }
    internal prop RangePeakBytes int64 {
        get -> rangePeakBytes
    }

    private func RangeMetadataBytes(capacity int32) int64 -> 4096L + 256L
    + int64(capacity) * (int64(Unsafe.SizeOf[VulkanSceneRangeEntry]()) + 64L + 12L)

    private func ObserveRangeBytes(bytes int64) {
        if bytes > RangeByteLimit {
            throw InvalidOperationException("Retained scene byte limit exceeded")
        }
        rangePeakBytes = Math.Max(rangePeakBytes, bytes)
    }

    private func InvalidateRanges() {
        rangeReady = false
    }

    private func BeginRangeFrame(root Node?, overlayRoot Node?) {
        rangeActiveSlot = -1
        rangeOrderCount = 0
        rangeCompileCount = 0
        rangeHitCount = 0
        rangeForceCompile = root?.SceneResourcesDirty == true || overlayRoot?.SceneResourcesDirty == true
        || rangeFontGeneration != FontRegistry.Generation
        || rangeAtlasGeneration != (textScene?.ResourceGeneration ?? 0uL)
        || rangePixelScale != float64(textScene?.PixelScale ?? 1.0F)
        || rangeExactCullEnabled != exactTextClipCullEnabled
        if let node = root {
            node.SceneResourcesDirty = false
            rangeRoot.SetTarget(node)
        } else {
            rangeRoot.SetTarget(nil)
        }
        if let node = overlayRoot {
            node.SceneResourcesDirty = false
            rangeOverlayRoot.SetTarget(node)
        } else {
            rangeOverlayRoot.SetTarget(nil)
        }
        if frameVersion == 1uL && rangeSnapshotVersion != 0uL {
            rangeReady = false
        }
    }

    private func FinishRangeFrame() {
        if textScene?.RedrawRequired == true || imageScene?.RedrawRequired == true
        || pathScene?.RedrawRequired == true || pathScene?.ResourceDeferred == true {
            rangeReady = false
            return
        }
        let extent = frame.RangePosition()
        let metadata = RangeMetadataBytes(rangeEntries.Length)
        var bytes = rangeData.CapacityBytes(extent)
        if metadata + bytes > RangeByteLimit {
            rangeData.Release()
            bytes = rangeData.CapacityBytes(extent)
            rangeReady = false
        }
        if metadata + bytes > RangeByteLimit || rangeOrderCount == 0 {
            rangeData.Release()
            rangeReady = false
            return
        }
        let previous = rangeData.CapacityBytes(VulkanSceneRangePosition{})
        if bytes > previous && metadata + previous + bytes > RangeByteLimit {
            rangeData.Release()
            bytes = rangeData.CapacityBytes(extent)
        } else if bytes > previous {
            ObserveRangeBytes(metadata + previous + bytes)
        }
        ObserveRangeBytes(metadata + bytes)
        rangeData.Capture(frame)
        let prior = rangePriorOrder
        rangePriorOrder = rangeOrder
        rangeOrder = prior
        rangeSnapshotVersion = frameVersion
        rangePriorOrderCount = rangeOrderCount
        rangeFontGeneration = FontRegistry.Generation
        rangeAtlasGeneration = textScene?.ResourceGeneration ?? 0uL
        rangePixelScale = float64(textScene?.PixelScale ?? 1.0F)
        rangeExactCullEnabled = exactTextClipCullEnabled
        rangeReady = true
    }

    private func GrowRangeSlots() bool {
        if rangeEntries.Length >= RangeSlotLimit {
            return false
        }
        let capacity = Math.Min(RangeSlotLimit, Math.Max(32, rangeEntries.Length * 2))
        var peak = RangeMetadataBytes(rangeEntries.Length) + RangeMetadataBytes(capacity)
        + rangeData.CapacityBytes(VulkanSceneRangePosition{})
        if peak > RangeByteLimit {
            rangeData.Release()
            rangeReady = false
            peak = RangeMetadataBytes(rangeEntries.Length) + RangeMetadataBytes(capacity)
            + rangeData.CapacityBytes(VulkanSceneRangePosition{})
        }
        ObserveRangeBytes(peak)
        let entries = [capacity]VulkanSceneRangeEntry
        let order = [capacity]int32
        let priorOrder = [capacity]int32
        let freeSlots = [capacity]int32
        Array.Copy(rangeEntries, entries, rangeUsedSlots)
        Array.Copy(rangeOrder, order, rangeOrderCount)
        Array.Copy(rangePriorOrder, priorOrder, rangePriorOrderCount)
        Array.Copy(rangeFreeSlots, freeSlots, rangeFreeCount)
        rangeEntries = entries
        rangeOrder = order
        rangePriorOrder = priorOrder
        rangeFreeSlots = freeSlots
        return true
    }

    private func InvalidateRangeAncestors(slot int32) {
        var current = slot
        var remaining = rangeEntries.Length
        while current >= 0 && remaining > 0 {
            var entry = rangeEntries[current]
            entry.Valid = false
            rangeEntries[current] = entry
            let parent = entry.ParentSlot
            if parent < 0 || rangeEntries[parent].OwnerId != entry.ParentOwnerId {
                return
            }
            current = parent
            remaining--
        }
    }

    private func InvalidateRange(owner VulkanSceneOwnerId) {
        let slot = owner.RangeSlot
        if slot >= 0 && slot < rangeEntries.Length && rangeEntries[slot].OwnerId == owner.Value {
            InvalidateRangeAncestors(slot)
        }
    }

    private func ForgetRange(owner VulkanSceneOwnerId) {
        let slot = owner.RangeSlot
        owner.RangeSlot = -1
        ForgetRangeSlot(slot, owner.Value)
    }

    private func ForgetRangeSlot(slot int32, ownerId uint64) {
        if slot < 0 || slot >= rangeEntries.Length || rangeEntries[slot].OwnerId != ownerId {
            return
        }
        InvalidateRangeAncestors(slot)
        let content = rangeEntries[slot].ContentSlot
        ForgetRangeSlot(content, ownerId)
        rangeEntries[slot].Owner?.SetTarget(nil)
        rangeEntries[slot].OwnerId = 0uL
        rangeFreeSlots[rangeFreeCount] = slot
        rangeFreeCount++
    }

    private func RangeSlot(
        owner VulkanSceneOwnerId,
        boundary VulkanSceneRangeBoundary = VulkanSceneRangeBoundary.Node
    ) int32 {
        let parent = owner.RangeSlot
        var cached = parent
        if boundary != VulkanSceneRangeBoundary.Node {
            if parent < 0 || parent >= rangeEntries.Length || rangeEntries[parent].OwnerId != owner.Value {
                return -1
            }
            cached = rangeEntries[parent].ContentSlot
        }
        if cached >= 0 && cached < rangeEntries.Length && rangeEntries[cached].OwnerId == owner.Value
        && rangeEntries[cached].Boundary == boundary {
            return cached
        }
        var slot int32 = -1
        if rangeFreeCount > 0 {
            rangeFreeCount--
            slot = rangeFreeSlots[rangeFreeCount]
        } else if rangeUsedSlots < rangeEntries.Length || GrowRangeSlots() {
            slot = rangeUsedSlots
            rangeUsedSlots++
        } else {
            for attempt in 0 ... rangeUsedSlots {
                let index = rangeEvictionIndex
                rangeEvictionIndex = (rangeEvictionIndex + 1) % rangeUsedSlots
                if rangeEntries[index].Version != frameVersion {
                    slot = index
                    break
                }
            }
            if slot < 0 {
                return -1
            }
            InvalidateRangeAncestors(slot)
            if let weak = rangeEntries[slot].Owner {
                if rangeEntries[slot].Boundary == VulkanSceneRangeBoundary.Node && weak.TryGetTarget(out var prior) {
                    prior.RangeSlot = -1
                }
            }
        }
        let weak = if let existing = rangeEntries[slot].Owner {
            existing
        } else {
            WeakReference[VulkanSceneOwnerId](owner)
        }
        weak.SetTarget(owner)
        rangeEntries[slot] = VulkanSceneRangeEntry{
            Owner: weak,
            OwnerId: owner.Value,
            ParentSlot: -1,
            Boundary: boundary,
            ContentSlot: -1,
        }
        if boundary == VulkanSceneRangeBoundary.Node {
            owner.RangeSlot = slot
        } else {
            rangeEntries[parent].ContentSlot = slot
        }
        return slot
    }

    private func RangeCounters() VulkanSceneRangeCounters -> VulkanSceneRangeCounters{
        Visible: visibleNodeCount,
        Emitted: emittedNodeCount,
        Skipped: skippedNodeCount,
        Scroll: scrollNodeCount,
        Clips: clipCount,
        PathClips: pathClipCount,
        ExactCandidates: exactTextClipCandidateCount,
        ExactCulls: exactTextClipCullCount,
        CachedCulls: cachedTextPaintCullCount,
        UnsupportedNodes: unsupportedNodeCount,
        UnsupportedPrimitives: unsupportedPrimitiveCount,
    }

    private func RangeCounterDifference(
        before VulkanSceneRangeCounters
    ) VulkanSceneRangeCounters -> VulkanSceneRangeCounters{
        Visible: visibleNodeCount - before.Visible,
        Emitted: emittedNodeCount - before.Emitted,
        Skipped: skippedNodeCount - before.Skipped,
        Scroll: scrollNodeCount - before.Scroll,
        Clips: clipCount - before.Clips,
        PathClips: pathClipCount - before.PathClips,
        ExactCandidates: exactTextClipCandidateCount - before.ExactCandidates,
        ExactCulls: exactTextClipCullCount - before.ExactCulls,
        CachedCulls: cachedTextPaintCullCount - before.CachedCulls,
        UnsupportedNodes: unsupportedNodeCount - before.UnsupportedNodes,
        UnsupportedPrimitives: unsupportedPrimitiveCount - before.UnsupportedPrimitives,
    }

    private func AddRangeCounters(value VulkanSceneRangeCounters) {
        visibleNodeCount += value.Visible
        emittedNodeCount += value.Emitted
        skippedNodeCount += value.Skipped
        scrollNodeCount += value.Scroll
        clipCount += value.Clips
        pathClipCount += value.PathClips
        exactTextClipCandidateCount += value.ExactCandidates
        exactTextClipCullCount += value.ExactCulls
        cachedTextPaintCullCount += value.CachedCulls
        clipMaskCount = frame.ClipMaskCount
        clipChainCount = frame.ClipChainCount - 1
    }

    private func BeginRangeCompilation(slot int32, context VulkanSceneTraversalContext) VulkanSceneRangeCompilation {
        if slot < 0 {
            return VulkanSceneRangeCompilation{}
        }
        let state = VulkanSceneRangeCompilation{ParentSlot: rangeActiveSlot, Counters: RangeCounters()}
        if slot >= 0 {
            var entry = rangeEntries[slot]
            entry.Valid = false
            entry.PreservesExternalBackdrop = false
            entry.ParentSlot = state.ParentSlot
            entry.ParentOwnerId = state.ParentSlot >= 0 ? rangeEntries[state.ParentSlot].OwnerId: 0uL
            entry.Version = frameVersion
            entry.Start = frame.RangePosition()
            entry.Context = context
            entry.Context.RoundedOverflowOwner = nil
            entry.ParentTransform = ResolveCompilerFrameTransform(context.ParentTransformIndex)
            entry.RoundedOwnerId = if let rounded = context.RoundedOverflowOwner {
                OwnerId(rounded)
            } else {
                0uL
            }
            entry.FirstSlot = rangeOrderCount
            rangeEntries[slot] = entry
            rangeOrder[rangeOrderCount] = slot
            rangeOrderCount++
            rangeActiveSlot = slot
        }
        return state
    }

    private func StaticRangeEffects(start int32, end int32) bool {
        for index in start ... end {
            if frame.ShaderEffects[index].Program?.PlaybackActive == true {
                return false
            }
        }
        return true
    }

    private func EndRangeCompilation(slot int32, state VulkanSceneRangeCompilation, completed bool) {
        if slot < 0 {
            return
        }
        rangeActiveSlot = state.ParentSlot
        if slot >= 0 {
            var entry = rangeEntries[slot]
            entry.End = frame.RangePosition()
            entry.EndSlot = rangeOrderCount
            entry.ActiveClip = frame.ActiveClipChainId
            entry.ActiveTransform = frame.RangeActiveTransformIndex
            entry.Counters = RangeCounterDifference(state.Counters)
            entry.Valid = completed && StaticRangeEffects(entry.Start.Effects, entry.End.Effects)
            && entry.Counters.UnsupportedNodes == 0 && entry.Counters.UnsupportedPrimitives == 0
            rangeEntries[slot] = entry
        }
    }

    private func CompileNode(node Node, context VulkanSceneTraversalContext) {
        let owner = Owner(node)
        let boundary = node.Parent == nil || node.Children.Count != 0 || node.Fiber != nil
        || node.IsPortal || ScrollsContent(node)
        let slot = boundary ? RangeSlot(owner): -1
        if slot >= 0 && !node.SceneSubtreeDirty && !node.Retired
        && TryAppendRange(slot, context) {
            return
        }
        rangeCompileCount++
        let contentDirty = node.SceneContentDirty
        node.SceneSubtreeDirty = false
        node.SceneContentDirty = false
        if slot < 0 {
            CompileNodeCore(node, context, owner, contentDirty)
            return
        }
        let state = BeginRangeCompilation(slot, context)
        var completed = false
        try {
            CompileNodeCore(node, context, owner, contentDirty)
            completed = !node.SceneSubtreeDirty
        } finally {
            EndRangeCompilation(slot, state, completed)
        }
    }

    private func TryAppendRange(slot int32, context VulkanSceneTraversalContext) bool {
        let root = rangeEntries[slot]
        if !rangeReady || rangeForceCompile || !root.Valid || root.Version != rangeSnapshotVersion
        || root.EndSlot - root.FirstSlot > rangeOrder.Length - rangeOrderCount {
            return false
        }
        if !RangeContextMatches(root, context) {
            return false
        }
        if !ProtectRangeResources(root.Start, root.End) {
            return false
        }
        let binding = VulkanSceneRangeBinding{
            Start: root.Start,
            End: root.End,
            Destination: frame.RangePosition(),
            PreviousContext: root.Context,
            Context: context,
        }
        frame.SetLayerCoverageNodeLimit(Math.Max(lastResult.VisibleNodeCount, visibleNodeCount + root.Counters.Visible))
        frame.SetTransformNodeLimit(Math.Max(lastResult.VisibleNodeCount, visibleNodeCount + root.Counters.Visible))
        if !frame.AppendRange(
            rangeData,
            binding,
            root.ActiveClip,
            root.ActiveTransform,
            frameVersion,
            rangeProofVersion == rangeSnapshotVersion && retentionProofs?.Ready == true
        ) {
            return false
        }
        if root.PreservesExternalBackdrop {
            PreserveAncestorBackdropLayers(context.RoundedOverflowLayerId)
        }
        let orderDelta = rangeOrderCount - root.FirstSlot
        for index in root.FirstSlot ... root.EndSlot {
            let childSlot = rangePriorOrder[index]
            var entry = rangeEntries[childSlot]
            entry.Start = binding.Position(entry.Start)
            entry.End = binding.Position(entry.End)
            entry.Context = binding.Traversal(entry.Context)
            entry.ActiveClip = binding.ClipChain(entry.ActiveClip)
            entry.ActiveTransform = binding.Transform(entry.ActiveTransform)
            entry.FirstSlot += orderDelta
            entry.EndSlot += orderDelta
            entry.Version = frameVersion
            if childSlot == slot {
                entry.ParentSlot = rangeActiveSlot
                entry.ParentOwnerId = rangeActiveSlot >= 0 ? rangeEntries[rangeActiveSlot].OwnerId: 0uL
            }
            rangeEntries[childSlot] = entry
            rangeOrder[rangeOrderCount] = childSlot
            rangeOrderCount++
        }
        AddRangeCounters(root.Counters)
        rangeHitCount++
        return true
    }

    private func RecordRangeBackdropDependency(layerId int32) {
        var slot = rangeActiveSlot
        while slot >= 0 {
            var entry = rangeEntries[slot]
            if layerId > 0 && layerId - 1 < entry.Start.Layers {
                entry.PreservesExternalBackdrop = true
                rangeEntries[slot] = entry
            }
            slot = entry.ParentSlot
        }
    }

    private func PreserveAncestorBackdropLayers(firstLayer int32) {
        var layerId = firstLayer
        while layerId != 0 {
            RecordRangeBackdropDependency(layerId)
            var layer = frame.Layers[layerId - 1]
            if (layer.Flags & uint32(LayerRecordFlags.PreservesBackdrop)) != 0u {
                return
            }
            layer.Flags |= uint32(LayerRecordFlags.PreservesBackdrop)
            frame.Layers[layerId - 1] = layer
            layerId = layer.ParentClipLayerId
        }
    }
}
