// Adapted from Sandbox.Layout (1e551e0), Layout/MeasurementCache.cs and Layout/Baseline.cs.
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
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
package Goo

import System
import System.Threading

internal partial class FlexLayoutEngine {
    shared {
        internal let Shared FlexLayoutEngine = FlexLayoutEngine()
        private var frames int64
        private var nextEngineId int32
        private let entryMetrics TextMetrics = TextMetrics()

        internal func Invalidate(node Node) {
            var current Node? = node
            while let item = current {
                let hadCache = item.FlexMeasures.HasCommitted || item.FlexMeasures.HasProbes
                item.FlexMeasures.Clear()
                item.LogicalLayout.RectSynced = false
                if item.IsPortal || (!hadCache && item != node) {
                    break
                }
                let parent = item.Parent
                if let owner = parent {
                    if let custom = CustomLayouts.State(owner) {
                        custom.ChildInvalidated()
                    }
                    if let editor = owner.EditorState {
                        editor.ClearParagraphs()
                        editor.Dirty = true
                        editor.Layout = nil
                    }
                    if owner.RetainedSizedState != nil {
                        break
                    }
                }
                current = parent
            }
        }

        private func IsMeasured(node Node) bool -> node.Kind == NodeKind.Text || node.Kind == NodeKind.Entry
        ||
            node.Kind == NodeKind.Editor ||
            node.Kind == NodeKind.Image ||
            node.HasCustomLayout ||
            node.RetainedSizedState != nil
    }

    internal let EngineId uint32 = uint32(Interlocked.Increment(ref nextEngineId))

    internal func ProbeCount(node Node) int32 -> FlexThreadState.Current().Probes.Count(node, EngineId)
    internal func RootRequest(width float32, height float32, density float32, direction Direction) FlexRequest ->
    FlexRequest{
        Width: FlexConstraint.Cap(width),
        Height: FlexConstraint.Cap(height),
        OwnerWidth: width,
        OwnerHeight: height,
        Density: density,
        Direction: direction,
        Root: true,
        Override: FlexOverride.Viewport
    }

    internal var MeasureContent((Node, FlexConstraint, FlexConstraint) -> FlexSize)?
    internal var MeasureBaseline((Node, float32, float32) -> float32)?

    internal func MeasureSubtree(node Node, request FlexRequest) FlexSize {
        var key = Normalize(request)
        let state = FlexThreadState.Current()
        let savedTop = state.Arena.Top
        try {
            return Solve(node, ref key, false, uint64(Interlocked.Increment(ref frames)), state)
        } finally {
            state.Arena.Release(savedTop)
        }
    }

    internal func MeasureIntrinsic(node Node, horizontal bool, minimum bool, request FlexRequest) float32 {
        let state = FlexThreadState.Current()
        let savedTop = state.Arena.Top
        try {
            return MeasureIntrinsicWithState(
                node,
                horizontal,
                minimum,
                request,
                horizontal ? FlexOverride.WidthIntrinsic : FlexOverride.HeightIntrinsic,
                uint64(Interlocked.Increment(ref frames)),
                state
            )
        } finally {
            state.Arena.Release(savedTop)
        }
    }

    internal func MeasureIntrinsicWithState(
        node Node,
        horizontal bool,
        minimum bool,
        request FlexRequest,
        overrideMode FlexOverride,
        frame uint64,
        state FlexThreadState
    ) float32 {
        var key = Normalize(request)
        let mode = minimum ? FlexConstraint.Minimum() : FlexConstraint{}
        if horizontal {
            key.Width = mode
        } else {
            key.Height = mode
        }
        key.Override = overrideMode
        key.Baseline = false
        let result = Solve(node, ref key, false, frame, state)
        return horizontal ? result.Width : result.Height
    }

    internal func ArrangeSubtree(node Node, request FlexRequest, x float32 = 0.0F, y float32 = 0.0F) FlexSize {
        var key = Normalize(request)
        let frame = uint64(Interlocked.Increment(ref frames))
        let state = FlexThreadState.Current()
        let savedTop = state.Arena.Top
        try {
            return ArrangeSubtreeWithState(node, ref key, frame, state, x, y)
        } finally {
            state.Arena.Release(savedTop)
        }
    }

    internal func ArrangeSubtreeWithState(
        node Node,
        ref request FlexRequest,
        frame uint64,
        state FlexThreadState,
        x float32 = 0.0F,
        y float32 = 0.0F
    ) FlexSize {
        let result = Solve(node, ref request, true, frame, state)
        if node.LogicalLayout.Valid {
            let margin = node.LogicalLayout.Margin
            let newX = x + margin.Left + RelativeOffset(node, true, request.OwnerWidth, request.Direction)
            let newY = y + margin.Top + RelativeOffset(node, false, request.OwnerHeight, request.Direction)
            if node.LogicalLayout.Raw.X != newX || node.LogicalLayout.Raw.Y != newY {
                node.LogicalLayout.Raw.X = newX
                node.LogicalLayout.Raw.Y = newY
                node.LogicalLayout.RawMoved = true
            }
            FinalizeGeometry(node, 0.0, 0.0, 0.0, 0.0, request.Density, frame, AbsoluteBlock{}, state, true, true)
        }
        return result
    }

    private func Normalize(request FlexRequest) FlexRequest {
        var key = request
        key.OwnerWidth = Known(key.OwnerWidth) ? Zero(key.OwnerWidth) + 0.0F : Single.NaN
        key.OwnerHeight = Known(key.OwnerHeight) ? Zero(key.OwnerHeight) + 0.0F : Single.NaN
        return key
    }

    private func Hide(node Node, frame uint64) {
        if !node.LogicalLayout.Valid && node.LogicalLayout.Generation != 0uL && !node.FlexMeasures.HasProbes {
            return
        }
        node.LogicalLayout = LayoutResult{Generation: frame}
        node.FlexMeasures.Clear()
        if IsMeasured(node) {
            return
        }
        for index in 0 ... node.Children.Count {
            let child = node.Children[index]
            if !child.IsPortal {
                Hide(child, frame)
            }
        }
    }

    private func ChildRequest(in parent FlexRequest, w float32, h float32, direction Direction) FlexRequest ->
    FlexRequest{OwnerWidth: w, OwnerHeight: h, Density: parent.Density, Direction: direction}

    private func Transfer(box FlexBox, value float32, horizontal bool, replaced bool) float32 {
        if !replaced {
            return horizontal ? value * box.Ratio : value / box.Ratio
        }
        let content = MathF.Max(0.0F, value - box.Decorations(!horizontal))
        return box.Decorations(horizontal) + (horizontal ? content * box.Ratio : content / box.Ratio)
    }

    private func Preferred(box FlexBox, constraint FlexConstraint, horizontal bool, viewport bool) float32 {
        if constraint.Mode == FlexMeasureMode.Exactly {
            return box.Clamp(constraint.Size, horizontal)
        }
        let style = horizontal ? box.Width : box.Height
        if Known(style) {
            return box.Clamp(style, horizontal)
        }
        let minimum = horizontal ? box.MinWidth : box.MinHeight
        let maximum = horizontal ? box.MaxWidth : box.MaxHeight
        if minimum == maximum {
            return box.Clamp(minimum, horizontal)
        }
        return viewport && constraint.Mode == FlexMeasureMode.AtMost && !Known(maximum)
        ? box.Clamp(constraint.Size - box.Margin.Sum(horizontal), horizontal) : Single.NaN
    }

    private func Used(value float32, constraint FlexConstraint, box FlexBox, horizontal bool) float32 {
        let limited = constraint.Mode == FlexMeasureMode.AtMost ? MathF.Min(value, constraint.Size) : value
        return box.Clamp(limited, horizontal)
    }

    private func ContentConstraint(
        constraint FlexConstraint,
        definite float32,
        maximum float32,
        decorations float32
    ) FlexConstraint {
        if Known(definite) {
            return FlexConstraint.Exact(definite - decorations)
        }
        if constraint.Mode == FlexMeasureMode.MinContent {
            return FlexConstraint.Minimum()
        }
        let limit = constraint.Mode == FlexMeasureMode.AtMost ? MathF.Min(constraint.Size, maximum) : maximum
        return FlexConstraint.Cap(limit - decorations)
    }

    private func DependsOnOwner(length NodeLength) bool -> length.Unit == LengthUnit.Percent ||
        length.Unit >= LengthUnit.Relative

    private func OwnerIndependent(node Node) bool {
        if node.FlexMeasures.OwnerIndependent != 0 {
            return node.FlexMeasures.OwnerIndependent == 1
        }
        let independent = node.Kind != NodeKind.Editor && !node.HasCustomLayout
        && !DependsOnOwner(node.Width) && !DependsOnOwner(node.Height)
        && !DependsOnOwner(node.MinWidth) && !DependsOnOwner(node.MinHeight)
        && !DependsOnOwner(node.MaxWidth) && !DependsOnOwner(node.MaxHeight)
        && !DependsOnOwner(node.MarginLeft) && !DependsOnOwner(node.MarginTop)
        && !DependsOnOwner(node.MarginRight) && !DependsOnOwner(node.MarginBottom)
        && !DependsOnOwner(node.PaddingLeft) && !DependsOnOwner(node.PaddingTop)
        && !DependsOnOwner(node.PaddingRight) && !DependsOnOwner(node.PaddingBottom)
        node.FlexMeasures.OwnerIndependent = independent ? uint8(1) : uint8(2)
        return independent
    }

    private func Solve(node Node, ref request FlexRequest, arrange bool, frame uint64, state FlexThreadState, contentMain int32 = 0) FlexSize {
        if node.Display == Display.None {
            if arrange {
                Hide(node, frame)
            }
            return FlexSize{}
        }
        var key = request.CacheKey(OwnerIndependent(node))
        key.Flags |= contentMain << 11
        if node.FlexMeasures.HasCommitted && node.FlexMeasures.Committed.Matches(in key) {
            return FlexSize{
                Width: node.LogicalLayout.Raw.W,
                Height: node.LogicalLayout.Raw.H,
                Baseline: node.LogicalLayout.Baseline,
                TextBaseline: node.LogicalLayout.TextBaseline,
                ContentAxes: node.LogicalLayout.ContentAxes
            }
        }
        if !arrange && node.FlexMeasures.HasProbes && state.Probes.TryMeasure(node, EngineId, in key, out var cached) {
            return cached
        }
        var box = ResolveBox(node, in request)
        if node.HasRelativeLengths {
            ResolveIntrinsicBox(ref box, node, in request, frame, state)
        }
        let direction = EffectiveDirection(node, request.Direction)
        let viewport = request.Override == FlexOverride.Viewport
        var width = Preferred(box, request.Width, true, viewport)
        var height = Preferred(box, request.Height, false, viewport)
        if box.Ratio > 0.0F {
            if !Known(width) && Known(height) && request.Override != FlexOverride.WidthIntrinsic
                && request.Override != FlexOverride.BothIntrinsic {
                width = Used(Transfer(box, height, true, node.Kind == NodeKind.Image), request.Width, box, true)
            } else if !Known(height) && Known(width) && request.Override != FlexOverride.HeightIntrinsic
                && request.Override != FlexOverride.BothIntrinsic {
                height = Used(Transfer(box, width, false, node.Kind == NodeKind.Image), request.Height, box, false)
            }
        }
        let measuredLeaf = IsMeasured(node)
        let result = if measuredLeaf {
            if arrange && node.FlexMeasures.HasProbes && state.Probes.TryMeasure(node, EngineId, in key, out var measured) {
                measured
            } else {
                MeasureLeaf(node, in request, box, width, height)
            }
        } else if !arrange && !request.Baseline && Known(width) && Known(height) {
            FlexSize{Width: width, Height: height, Baseline: height}
        } else if node.Children.Count == 0 {
            let w = Known(width) ? width : box.Clamp(0.0F, true)
            let h = Known(height) ? height : box.Clamp(0.0F, false)
            FlexSize{Width: w, Height: h, Baseline: h}
        } else {
            SolveFlex(node, ref request, box, direction, width, height, arrange, frame, state)
        }
        if arrange {
            node.LogicalLayout.Raw.W = result.Width
            node.LogicalLayout.Raw.H = result.Height
            node.LogicalLayout.Margin = box.Margin
            node.LogicalLayout.Padding = box.Padding
            node.LogicalLayout.Border = box.Border
            node.LogicalLayout.Direction = direction
            node.LogicalLayout.Density = request.Density
            node.LogicalLayout.Baseline = result.Baseline
            node.LogicalLayout.TextBaseline = result.TextBaseline
            node.LogicalLayout.ContentAxes = uint8(result.ContentAxes | contentMain)
            node.LogicalLayout.Valid = true
            node.LogicalLayout.Finalized = false
            node.LogicalLayout.RectSynced = false
            node.LogicalLayout.Generation = frame
            node.FlexMeasures.Committed = key
            node.FlexMeasures.HasCommitted = true
        } else {
            state.Probes.Store(node, EngineId, in key, result)
        }
        return result
    }

    private func MeasureLeaf(node Node, in request FlexRequest, box FlexBox, width float32, height float32) FlexSize {
        let horizontal = box.Decorations(true)
        let vertical = box.Decorations(false)
        let w = ContentConstraint(request.Width, width, box.MaxWidth, horizontal)
        let h = ContentConstraint(request.Height, height, box.MaxHeight, vertical)
        var size FlexSize
        if !Known(width) || !Known(height) {
            let measured = if let callback = MeasureContent {
                callback(node, w, h)
            } else {
                DefaultMeasure(node, w, h)
            }
            size.Width = Known(width) ? width : Used(
                MathF.Max(0.0F, Zero(measured.Width)) + horizontal,
                request.Width,
                box,
                true
            )
            size.Height = Known(height) ? height : Used(
                MathF.Max(0.0F, Zero(measured.Height)) + vertical,
                request.Height,
                box,
                false
            )
        } else {
            size.Width = width
            size.Height = height
        }
        let baseline = if request.Baseline {
            let contentWidth = MathF.Max(0.0F, size.Width - horizontal)
            let contentHeight = MathF.Max(0.0F, size.Height - vertical)
            if let callback = MeasureBaseline {
                callback(node, contentWidth, contentHeight)
            } else {
                DefaultBaseline(node, contentWidth, contentHeight)
            }
        } else {
            Single.NaN
        }
        size.TextBaseline = Known(baseline)
        size.Baseline = size.TextBaseline ? box.Border.Top + box.Padding.Top + baseline : size.Height
        return size
    }

    private func TextConstraint(constraint FlexConstraint) float32 ->
    constraint.Mode == FlexMeasureMode.Unbounded ? -1.0F : constraint.Size

    private func CustomConstraint(constraint FlexConstraint) float64 ->
    constraint.Mode == FlexMeasureMode.Unbounded ? Double.PositiveInfinity : float64(constraint.Size)

    private func DefaultMeasure(node Node, width FlexConstraint, height FlexConstraint) FlexSize {
        if let custom = CustomLayouts.State(node) {
            let blockLimit = height.Mode == FlexMeasureMode.MinContent ? Double.PositiveInfinity : CustomConstraint(
                height
            )
            let measured = custom.Measure(LayoutSize(CustomConstraint(width), blockLimit))
            return FlexSize{Width: float32(measured.Width), Height: float32(measured.Height)}
        }
        if node.RetainedSizedState != nil {
            return FlexSize{}
        }
        switch node.Kind {
            case NodeKind.Text {
                let text = TextLayouts.For(node, TextConstraint(width), measuring: true)
                let w = width.Mode == FlexMeasureMode.MinContent ? text.MinWidth : text.Width
                return FlexSize{Width: w, Height: text.Height}
            }
            case NodeKind.Entry {
                return FlexSize{Height: TextLayouts.resolvedLineHeight(node)}
            }
            case NodeKind.Editor {
                let editor = TextEditorLayouts.For(
                    node,
                    TextConstraint(width),
                    height.Mode == FlexMeasureMode.Exactly ? height.Size : -1.0F,
                    true
                )
                return FlexSize{Width: editor.Width, Height: editor.Height}
            }
            case NodeKind.Image {
                var w = node.ImageIntrinsicWidth
                var h = node.ImageIntrinsicHeight
                if w > 0.0F && h > 0.0F {
                    var scale = 1.0F
                    if width.Mode == FlexMeasureMode.AtMost {
                        scale = MathF.Min(scale, width.Size / w)
                    }
                    if height.Mode == FlexMeasureMode.AtMost {
                        scale = MathF.Min(scale, height.Size / h)
                    }
                    w *= scale
                    h *= scale
                }
                return FlexSize{Width: w, Height: h}
            }
            case _ {
                return FlexSize{}
            }
        }
    }

    private func DefaultBaseline(node Node, width float32, height float32) float32 {
        if node.Kind == NodeKind.Text {
            let text = TextLayouts.For(node, width, measuring: true)
            if let rich = text.Rich {
                if rich.Lines.Count > 0 {
                    let first = rich.Lines[0]
                    return (first.Height - (first.Descent - first.Ascent)) * 0.5F - first.Ascent
                }
            }
            if text.Lines.Count == 0 {
                return Single.NaN
            }
            return (TextLayouts.resolvedLineHeight(node) - (text.Descent - text.Ascent)) * 0.5F - text.Ascent
        }
        if node.Kind == NodeKind.Entry {
            let shape = entryMetrics.BufferShape(node)
            return (height - (shape.Descent - shape.Ascent)) * 0.5F - shape.Ascent
        }
        if node.Kind == NodeKind.Editor {
            let editor = TextEditorLayouts.For(node, width, height, true)
            if editor.Lines.Count > 0 {
                let first = editor.Lines[0]
                return first.Top + (first.Height - (first.Descent - first.Ascent)) * 0.5F - first.Ascent
            }
        }
        return Single.NaN
    }
}
