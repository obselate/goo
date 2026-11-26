// Adapted from Sandbox.Layout (1e551e0), LayoutResults.cs and Layout/MeasurementCache.cs.
// Copyright (c) 2025 Facepunch Studios Ltd
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
package Goo

import System

internal enum FlexMeasureMode {
    Unbounded;
    Exactly;
    AtMost;
    MinContent
}

internal enum FlexOverride {
    None;
    WidthIntrinsic;
    HeightIntrinsic;
    AssignedBox;
    Viewport;
    Capped;
    BothIntrinsic
}

internal struct FlexConstraint {
    internal var Mode FlexMeasureMode
    internal var Size float32

    shared {
        internal func Exact(size float32) FlexConstraint -> FlexConstraint{
            Mode: FlexMeasureMode.Exactly,
            Size: MathF.Max(0.0F, size)
        }

        internal func Cap(size float32) FlexConstraint -> Single.IsFinite(size)
        ? FlexConstraint{Mode: FlexMeasureMode.AtMost, Size: MathF.Max(0.0F, size)} : FlexConstraint{}

        internal func Minimum() FlexConstraint -> FlexConstraint{Mode: FlexMeasureMode.MinContent}
    }
}

internal struct FlexRequest {
    internal var Width FlexConstraint
    internal var Height FlexConstraint
    internal var OwnerWidth float32 = Single.NaN
    internal var OwnerHeight float32 = Single.NaN
    internal var Direction Direction
    internal var Density float32
    internal var Override FlexOverride
    internal var Root bool
    internal var Baseline bool

    internal func CacheKey(ownerIndependent bool) FlexKey -> FlexKey{
        Width: Width.Size,
        Height: Height.Size,
        Density: Density,
        OwnerWidth: ownerIndependent ? Single.NaN : OwnerWidth,
        OwnerHeight: ownerIndependent ? Single.NaN : OwnerHeight,
        Flags: int32(Width.Mode) | (int32(Height.Mode) << 2) | (int32(Direction) << 4)
        | (int32(Override) << 6) | (Root ? 512 : 0) | (Baseline ? 1024 : 0)
    }
}

internal struct FlexKey {
    internal var Width float32
    internal var Height float32
    internal var OwnerWidth float32
    internal var OwnerHeight float32
    internal var Density float32
    internal var Flags int32

    internal func Matches(in other FlexKey) bool -> Flags == other.Flags && Width.Equals(other.Width)
    && Height.Equals(other.Height) && Density == other.Density
    && OwnerWidth.Equals(other.OwnerWidth) && OwnerHeight.Equals(other.OwnerHeight)
}

internal struct FlexSize {
    internal var Width float32
    internal var Height float32
    internal var Baseline float32
    internal var TextBaseline bool
    internal var ContentAxes uint8
}

internal struct FlexInsets {
    internal var Left float32
    internal var Top float32
    internal var Right float32
    internal var Bottom float32

    internal func Get(edge PhysicalEdge) float32 -> switch edge {
        case PhysicalEdge.Left: Left
        case PhysicalEdge.Top: Top
        case PhysicalEdge.Right: Right
        case _: Bottom
    }

    internal func Sum(horizontal bool) float32 -> horizontal ? Left + Right : Top + Bottom

    internal func Start(axis FlexAxis) float32 -> axis.Horizontal
    ? (axis.Reversed ? Right : Left) : (axis.Reversed ? Bottom : Top)
}

internal struct LayoutResult {
    internal var Raw Rect
    internal var Snapped Rect
    internal var Margin FlexInsets
    internal var Padding FlexInsets
    internal var Border FlexInsets
    internal var Baseline float32
    internal var Density float32
    internal var Generation uint64
    private var flags uint16

    internal prop Direction Direction {
        get -> Direction(int32(flags & uint16(3)))
        set -> flags = (flags & ~uint16(3)) | (uint16(int32(value)) & uint16(3))
    }

    internal prop Valid bool {
        get -> (flags & uint16(4)) != uint16(0)
        set -> flags = value ? flags | uint16(4) : flags & ~uint16(4)
    }

    internal prop TextBaseline bool {
        get -> (flags & uint16(8)) != uint16(0)
        set -> flags = value ? flags | uint16(8) : flags & ~uint16(8)
    }

    internal prop ContentAxes uint8 {
        get -> uint8((flags >> 4) & uint16(3))
        set -> flags = (flags & ~uint16(48)) | ((uint16(value) & uint16(3)) << 4)
    }

    internal prop Finalized bool {
        get -> (flags & uint16(64)) != uint16(0)
        set -> flags = value ? flags | uint16(64) : flags & ~uint16(64)
    }

    internal prop RawMoved bool {
        get -> (flags & uint16(128)) != uint16(0)
        set -> flags = value ? flags | uint16(128) : flags & ~uint16(128)
    }

    internal prop HasAbsoluteDescendant bool {
        get -> (flags & uint16(256)) != uint16(0)
        set -> flags = value ? flags | uint16(256) : flags & ~uint16(256)
    }

    internal prop RectSynced bool {
        get -> (flags & uint16(512)) != uint16(0)
        set -> flags = value ? flags | uint16(512) : flags & ~uint16(512)
    }
}

internal struct FlexProbe {
    internal var Key FlexKey
    internal var Size FlexSize
}

internal struct FlexCache {
    internal var Committed FlexKey
    internal var ProbeEpoch uint64
    internal var ProbeSlot int32
    private var flags uint8

    internal prop HasCommitted bool {
        get -> (flags & uint8(1)) != uint8(0)
        set -> flags = value ? flags | uint8(1) : flags & ~uint8(1)
    }

    internal prop HasProbes bool { get -> ProbeSlot != 0 }

    internal prop OwnerIndependent uint8 {
        get -> (flags >> 1) & uint8(3)
        set -> flags = (flags & ~uint8(6)) | ((value & uint8(3)) << 1)
    }

    internal func Clear() {
        ProbeSlot = 0
        ProbeEpoch = 0uL
        flags = uint8(0)
    }
}

internal struct FlexProbeBucket {
    internal var Epoch uint64
    internal var EngineId uint32
    internal var Count uint8
    internal var Next uint8
    internal var P0 FlexProbe
    internal var P1 FlexProbe
    internal var P2 FlexProbe
    internal var P3 FlexProbe
}

internal sealed class FlexProbeStore {
    shared {
        private const InitialCapacity int32 = 256
        private const MaxCapacity int32 = 16384
    }

    private var buckets []FlexProbeBucket = [InitialCapacity]FlexProbeBucket
    private var nextSlot int32
    private var nextEpoch uint64 = 1uL

    private func TryMatch(in bucket FlexProbeBucket, engineId uint32, epoch uint64, in key FlexKey, out size FlexSize) bool {
        if bucket.Epoch != epoch || bucket.EngineId != engineId {
            size = FlexSize{}
            return false
        }
        let count = int32(bucket.Count)
        if count > 0 && bucket.P0.Key.Matches(in key) {
            size = bucket.P0.Size
            return true
        }
        if count > 1 && bucket.P1.Key.Matches(in key) {
            size = bucket.P1.Size
            return true
        }
        if count > 2 && bucket.P2.Key.Matches(in key) {
            size = bucket.P2.Size
            return true
        }
        if count > 3 && bucket.P3.Key.Matches(in key) {
            size = bucket.P3.Size
            return true
        }
        size = FlexSize{}
        return false
    }

    private func AppendProbe(ref bucket FlexProbeBucket, value FlexProbe) {
        let next = int32(bucket.Next)
        switch next {
            case 0 { bucket.P0 = value }
            case 1 { bucket.P1 = value }
            case 2 { bucket.P2 = value }
            case _ { bucket.P3 = value }
        }
        bucket.Next = uint8((next + 1) & 3)
        if bucket.Count < uint8(4) {
            bucket.Count = uint8(int32(bucket.Count) + 1)
        }
    }

    internal func TryMeasure(node Node, engineId uint32, in key FlexKey, out size FlexSize) bool {
        let slot = node.FlexMeasures.ProbeSlot
        if slot <= 0 || slot > buckets.Length {
            size = FlexSize{}
            return false
        }
        return TryMatch(in buckets[slot - 1], engineId, node.FlexMeasures.ProbeEpoch, in key, out size)
    }

    internal func Store(node Node, engineId uint32, in key FlexKey, size FlexSize) {
        let value = FlexProbe{Key: key, Size: size}
        let slot = node.FlexMeasures.ProbeSlot
        if slot > 0 && slot <= buckets.Length {
            let index = slot - 1
            if buckets[index].Epoch == node.FlexMeasures.ProbeEpoch && buckets[index].EngineId == engineId {
                AppendProbe(ref buckets[index], value)
                return
            }
        }
        if nextSlot >= buckets.Length && buckets.Length < MaxCapacity {
            let next = [buckets.Length * 2]FlexProbeBucket
            Array.Copy(buckets, next, buckets.Length)
            buckets = next
        }
        let index = nextSlot & (buckets.Length - 1)
        if buckets.Length == MaxCapacity {
            nextSlot = (nextSlot + 1) & (MaxCapacity - 1)
        } else {
            nextSlot++
        }
        let epoch = nextEpoch
        nextEpoch++
        if nextEpoch == 0uL { nextEpoch = 1uL }
        buckets[index] = FlexProbeBucket{
            EngineId: engineId,
            Epoch: epoch,
            Count: uint8(1),
            Next: uint8(1),
            P0: value
        }
        node.FlexMeasures.ProbeSlot = index + 1
        node.FlexMeasures.ProbeEpoch = epoch
    }

    internal func Count(node Node, engineId uint32) int32 {
        let slot = node.FlexMeasures.ProbeSlot
        if slot <= 0 || slot > buckets.Length { return 0 }
        let index = slot - 1
        if buckets[index].Epoch != node.FlexMeasures.ProbeEpoch || buckets[index].EngineId != engineId {
            return 0
        }
        return int32(buckets[index].Count)
    }
}

internal struct FlexItem {
    internal var ChildIndex int32
    internal var Base float32
    internal var Decoration float32
    internal var Hypothetical float32
    internal var Minimum float32
    internal var Maximum float32
    internal var PolicyMinimum float32
    internal var Main float32
    internal var CrossRequest FlexConstraint
    internal var Margin FlexInsets
    internal var AutoMargins int32
    internal var Align AlignSelf
    internal var Stretch bool
    internal var Frozen bool
    internal var IntrinsicBasis bool
    internal var NeedsAutoMin bool
    internal var AutoMinCap float32
    internal var Violation int32
    internal var End int32
    internal var Occupied float32
    internal var LineCross float32
    internal var Ascent float32
}

internal sealed class FlexScratchArena {
    internal var Items []FlexItem = [256]FlexItem
    internal var Top int32

    internal func Reserve(count int32) int32 {
        let start = Top
        let needed = start + count
        if needed > Items.Length {
            var cap = Items.Length * 2
            while cap < needed { cap *= 2 }
            let next = [cap]FlexItem
            if start > 0 { Array.Copy(Items, next, start) }
            Items = next
        }
        Top = needed
        return start
    }

    internal func Release(savedTop int32) {
        Top = savedTop
    }
}

internal sealed class FlexThreadState {
    shared {
        @ThreadStatic
        private var current FlexThreadState?

        internal func Current() FlexThreadState {
            current ??= FlexThreadState()
            return current!!
        }
    }

    internal let Probes FlexProbeStore = FlexProbeStore()
    internal let Arena FlexScratchArena = FlexScratchArena()
}
