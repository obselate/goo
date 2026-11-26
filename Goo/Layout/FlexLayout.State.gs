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
    Capped
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
    internal var Direction Direction
    internal var Baseline float32
    internal var TextBaseline bool
    internal var Line int32
    internal var Valid bool
    internal var ContentAxes uint8
    internal var Density float32
    internal var Generation uint64
}

internal struct FlexProbe {
    internal var Key FlexKey
    internal var Size FlexSize
}

internal struct FlexCache {
    internal var Committed FlexKey
    internal var HasCommitted bool
    internal var Count int32
    internal var OwnerIndependent uint8
    private var next int32
    private var probe0 FlexProbe
    private var probe1 FlexProbe
    private var probe2 FlexProbe
    private var probe3 FlexProbe

    internal func TryMeasure(in key FlexKey, out size FlexSize) bool {
        if Count > 0 && probe0.Key.Matches(in key) {
            size = probe0.Size
            return true
        }
        if Count > 1 && probe1.Key.Matches(in key) {
            size = probe1.Size
            return true
        }
        if Count > 2 && probe2.Key.Matches(in key) {
            size = probe2.Size
            return true
        }
        if Count > 3 && probe3.Key.Matches(in key) {
            size = probe3.Size
            return true
        }
        size = FlexSize{}
        return false
    }

    internal func Store(in key FlexKey, size FlexSize) {
        let value = FlexProbe{Key: key, Size: size}
        switch next {
            case 0 {
                probe0 = value
            }
            case 1 {
                probe1 = value
            }
            case 2 {
                probe2 = value
            }
            case _ {
                probe3 = value
            }
        }
        next = (next + 1) & 3
        if Count < 4 {
            Count++
        }
    }

    internal func Clear() {
        HasCommitted = false
        Count = 0
        next = 0
        OwnerIndependent = 0
    }
}

// Only the owning parent writes an item's scratch, including its line record.
internal struct FlexItem {
    internal var Frame uint64
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
    internal var Violation int32
    internal var End int32
    internal var Count int32
    internal var Occupied float32
    internal var LineCross float32
    internal var Ascent float32
}
