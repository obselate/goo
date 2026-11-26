// Adapted from Sandbox.Layout (1e551e0), Layout/Flex/FlexLayout.cs and Flex/FlexLine.cs.
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

internal partial class FlexLayoutEngine {
    shared {
        private const chromeAutomaticMinimum bool = false
        internal prop UsesChromiumAutomaticMinimum bool {
            get -> chromeAutomaticMinimum
        }
    }

    private func InFlow(node Node) bool -> !node.IsPortal &&
        node.Display != Display.None &&
        node.Position != PositionType.Absolute

    private func SetAxis(ref request FlexRequest, horizontal bool, constraint FlexConstraint) {
        if horizontal {
            request.Width = constraint
        } else {
            request.Height = constraint
        }
    }

    private func PrepareItem(
        parent Node,
        child Node,
        in request FlexRequest,
        axis FlexAxis,
        crossAxis FlexAxis,
        crossSize float32,
        crossLimit float32,
        intrinsic FlexMeasureMode,
        crossMode FlexMeasureMode,
        frame uint64
    ) {
        let box = ResolveBox(child, in request)
        let horizontal = axis.Horizontal
        let mainBasis = axis.Select(request.OwnerWidth, request.OwnerHeight)
        let preferred = axis.Select(box.Width, box.Height)
        let cross = crossAxis.Select(box.Width, box.Height)
        let align = Alignment(parent, child, axis)
        let stretch = align == AlignSelf.Stretch && !Known(cross)
        && !crossAxis.AutoStart(box.AutoMargins) && !crossAxis.AutoEnd(box.AutoMargins)
        let crossRequest = if stretch && parent.FlexWrap == FlexWrap.NoWrap && Known(crossSize) {
            FlexConstraint.Exact(crossSize - box.Margin.Sum(!horizontal))
        } else if !Known(cross) && crossMode == FlexMeasureMode.MinContent {
            FlexConstraint.Minimum()
        } else if !horizontal && !Known(cross) {
            FlexConstraint.Cap(crossLimit - box.Margin.Sum(true))
        } else {
            FlexConstraint{}
        }
        let decorations = box.Decorations(horizontal)
        let replaced = child.Kind == NodeKind.Image
        let definiteCross = Known(cross) ? cross : (
            crossRequest.Mode == FlexMeasureMode.Exactly ? crossRequest.Size : Single.NaN
        )
        let transfer = box.Ratio > 0.0F && Known(definiteCross)
        ? Transfer(box, box.Clamp(definiteCross, !horizontal), horizontal, replaced) : Single.NaN
        let minimum = horizontal ? box.MinWidth : box.MinHeight
        let maximum = horizontal ? box.MaxWidth : box.MaxHeight
        var basis = ProjectedValue(child.FlexBasis, StyleField.FlexBasis, LengthDeclarations.Get(child), mainBasis)
        var intrinsicBasis = false
        if !Known(basis) {
            basis = Known(preferred) ? preferred : transfer
            if !Known(basis) {
                var probe = request
                SetAxis(ref probe, !horizontal, crossRequest)
                SetAxis(
                    ref probe,
                    horizontal,
                    intrinsic == FlexMeasureMode.MinContent ? FlexConstraint.Minimum() : FlexConstraint{}
                )
                probe.Override = horizontal ? FlexOverride.WidthIntrinsic : FlexOverride.HeightIntrinsic
                let size = Solve(child, ref probe, false, frame)
                basis = axis.Select(size.Width, size.Height)
                intrinsicBasis = (size.ContentAxes & (horizontal ? 1 : 2)) != 0
            }
        }
        var usedMin = MathF.Max(decorations, minimum)
        var policyMin = 0.0F
        let mainMin = horizontal ? child.MinWidth : child.MinHeight
        if (mainMin.Unit == LengthUnit.Unset || mainMin.Unit == LengthUnit.Auto)
        && child.OverflowX == Overflow.Visible && child.OverflowY == Overflow.Visible
        && !(horizontal && child.Kind == NodeKind.Text && child.TextTrimming == TextTrimming.Ellipsis) {
            if !chromeAutomaticMinimum && mainMin.Unit == LengthUnit.Unset && Known(preferred) {
                policyMin = MathF.Min(preferred, maximum)
            }
            if !Known(preferred) || basis < MathF.Min(preferred, maximum)
            || policyMin < MathF.Min(preferred, maximum) && child.FlexShrink != 0.0F {
                var content = decorations
                if child.HasCustomLayout && Known(preferred) {
                    content = preferred
                } else if child.Children.Count > 0 || IsMeasured(child) {
                    var probe = request
                    SetAxis(ref probe, !horizontal, replaced && stretch ? FlexConstraint{} : crossRequest)
                    SetAxis(ref probe, horizontal, FlexConstraint.Minimum())
                    probe.Override = horizontal ? FlexOverride.WidthIntrinsic : FlexOverride.HeightIntrinsic
                    let size = Solve(child, ref probe, false, frame)
                    content = axis.Select(size.Width, size.Height)
                }
                if box.Ratio > 0.0F {
                    let crossMin = !horizontal ? box.MinWidth : box.MinHeight
                    let crossMax = !horizontal ? box.MaxWidth : box.MaxHeight
                    if Known(crossMax) {
                        content = MathF.Min(content, Transfer(box, crossMax, horizontal, replaced))
                    }
                    if crossMin > 0.0F {
                        content = MathF.Max(content, Transfer(box, crossMin, horizontal, replaced))
                    }
                    if Known(transfer) {
                        content = replaced ? MathF.Min(content, transfer) : MathF.Max(content, transfer)
                    }
                }
                if Known(preferred) {
                    content = MathF.Min(content, preferred)
                }
                usedMin = MathF.Max(usedMin, MathF.Min(content, maximum))
            }
        }
        child.FlexScratch = FlexItem{
            Frame: frame,
            Base: basis,
            Decoration: decorations,
            Hypothetical: MathF.Max(usedMin, MathF.Min(basis, maximum)),
            Minimum: usedMin,
            Maximum: maximum,
            PolicyMinimum: policyMin,
            Margin: box.Margin,
            AutoMargins: box.AutoMargins,
            Align: align,
            Stretch: stretch,
            IntrinsicBasis: intrinsicBasis,
            CrossRequest: crossRequest
        }
    }

    private func CloseLine(first Node, end int32, count int32, occupied float32) {
        first.FlexScratch.End = end
        first.FlexScratch.Count = count
        first.FlexScratch.Occupied = occupied
    }

    private func NextItem(node Node, start int32) int32 {
        var index = start
        while index < node.Children.Count && !InFlow(node.Children[index]) {
            index++
        }
        return index
    }

    private func SolveFlex(
        node Node,
        ref request FlexRequest,
        box FlexBox,
        direction Direction,
        width float32,
        height float32,
        arrange bool,
        frame uint64
    ) FlexSize {
        let main = MainAxis(node, direction)
        let cross = CrossAxis(node, main, direction)
        let horizontal = main.Horizontal
        let ownMain = main.Select(width, height)
        let ownCross = cross.Select(width, height)
        let mainDecorations = box.Decorations(horizontal)
        let crossDecorations = box.Decorations(!horizontal)
        let innerWidth = Inner(width, box.Decorations(true))
        let innerHeight = Inner(height, box.Decorations(false))
        let innerMain = main.Select(innerWidth, innerHeight)
        let innerCross = cross.Select(innerWidth, innerHeight)
        let mainConstraint = horizontal ? request.Width : request.Height
        let crossConstraint = horizontal ? request.Height : request.Width
        let maxMain = horizontal ? box.MaxWidth : box.MaxHeight
        let maxCross = horizontal ? box.MaxHeight : box.MaxWidth
        let mainGap = Gap(node, horizontal, innerMain)
        let crossGap = Gap(node, !horizontal, innerCross)
        let wraps = node.FlexWrap != FlexWrap.NoWrap
        let lineLimit = if Known(innerMain) {
            innerMain
        } else if mainConstraint.Mode == FlexMeasureMode.MinContent {
            0.0F
        } else {
            Inner(
                mainConstraint.Mode == FlexMeasureMode.AtMost ? MathF.Min(maxMain, mainConstraint.Size) : maxMain,
                mainDecorations
            )
        }
        let crossLimit = Known(innerCross) ? innerCross
        : Inner(
            crossConstraint.Mode == FlexMeasureMode.AtMost ? MathF.Min(maxCross, crossConstraint.Size) : maxCross,
            crossDecorations
        )
        var childRequest = ChildRequest(in request, innerWidth, innerHeight, direction)
        let firstIndex = NextItem(node, 0)
        var lineFirst = firstIndex
        var count = 0
        var lines = 0
        var occupied = 0.0F
        var widest = 0.0F
        for index in firstIndex ... node.Children.Count {
            let child = node.Children[index]
            if !InFlow(child) {
                continue
            }
            PrepareItem(
                node,
                child,
                in childRequest,
                main,
                cross,
                innerCross,
                crossLimit,
                mainConstraint.Mode,
                crossConstraint.Mode,
                frame
            )
            let outer = child.FlexScratch.Hypothetical + child.FlexScratch.Margin.Sum(horizontal)
            if wraps && count > 0 && Known(lineLimit) && occupied + mainGap + outer > lineLimit {
                CloseLine(node.Children[lineFirst], index, count, occupied)
                widest = MathF.Max(widest, occupied)
                lines++
                count = 0
                occupied = 0.0F
                lineFirst = index
            }
            occupied += count == 0 ? outer : mainGap + outer
            count++
        }
        if count > 0 {
            CloseLine(node.Children[lineFirst], node.Children.Count, count, occupied)
            widest = MathF.Max(widest, occupied)
            lines++
        }
        let mainAxis = uint8(horizontal ? 1 : 2)
        var contentAxes uint8
        let usedMain = if Known(ownMain) {
            ownMain
        } else {
            let content = widest + mainDecorations
            let capped = mainConstraint.Mode == FlexMeasureMode.AtMost ? MathF.Min(content, mainConstraint.Size) : content
            let used = box.Clamp(capped, horizontal)
            if used == capped { contentAxes = mainAxis }
            used
        }
        let availableMain = Inner(usedMain, mainDecorations)
        var totalCross = 0.0F
        var baselineIndex = firstIndex
        var index = firstIndex
        while index < node.Children.Count {
            let first = node.Children[index]
            let end = first.FlexScratch.End
            ResolveFlexibleLengths(node, index, end, main, availableMain, mainGap, frame)
            var lineCross = 0.0F
            var ascent = 0.0F
            var descent = 0.0F
            for childIndex in index ... end {
                let child = node.Children[childIndex]
                if child.FlexScratch.Frame != frame {
                    continue
                }
                let baselineAlign = child.FlexScratch.Align == AlignSelf.Baseline
                && !cross.AutoStart(child.FlexScratch.AutoMargins) && !cross.AutoEnd(child.FlexScratch.AutoMargins)
                if index == firstIndex && baselineIndex == firstIndex && baselineAlign
                && first.FlexScratch.Align != AlignSelf.Baseline {
                    baselineIndex = childIndex
                }
                if !wraps && Known(ownCross) && !baselineAlign {
                    continue
                }
                SetAxis(ref childRequest, horizontal, FlexConstraint.Exact(child.FlexScratch.Main))
                SetAxis(ref childRequest, !horizontal, child.FlexScratch.CrossRequest)
                childRequest.Baseline = baselineAlign || (request.Baseline && childIndex == firstIndex)
                let measured = Solve(child, ref childRequest, false, frame)
                let crossSize = cross.Select(measured.Width, measured.Height)
                let margins = child.FlexScratch.Margin
                lineCross = MathF.Max(lineCross, crossSize + margins.Sum(!horizontal))
                if baselineAlign {
                    let logicalBaseline = cross.Reversed ? crossSize - measured.Baseline : measured.Baseline
                    let start = margins.Start(cross) + logicalBaseline
                    ascent = MathF.Max(ascent, start)
                    descent = MathF.Max(descent, crossSize + margins.Sum(!horizontal) - start)
                }
            }
            first.FlexScratch.Ascent = ascent
            first.FlexScratch.LineCross = MathF.Max(lineCross, ascent + descent)
            totalCross += first.FlexScratch.LineCross
            index = end
        }
        totalCross += crossGap * Math.Max(0, lines - 1)
        let usedCross = if Known(ownCross) {
            ownCross
        } else {
            let content = totalCross + crossDecorations
            let capped = crossConstraint.Mode == FlexMeasureMode.AtMost ? MathF.Min(content, crossConstraint.Size) : content
            let used = box.Clamp(capped, !horizontal)
            if used == capped { contentAxes |= uint8(3 ^ mainAxis) }
            used
        }
        var size = FlexSize{
            Width: horizontal ? usedMain : usedCross,
            Height: horizontal ? usedCross : usedMain,
            ContentAxes: contentAxes
        }
        size.Baseline = size.Height
        if arrange || request.Baseline {
            PlaceLines(
                node,
                ref childRequest,
                box,
                main,
                cross,
                firstIndex,
                lines,
                baselineIndex,
                mainGap,
                crossGap,
                totalCross,
                arrange,
                request.Baseline,
                frame,
                ref size
            )
        }
        return size
    }

    private func ResolveFlexibleLengths(
        node Node,
        start int32,
        end int32,
        axis FlexAxis,
        available float32,
        gap float32,
        frame uint64
    ) {
        let first = node.Children[start]
        let grow = first.FlexScratch.Occupied < available
        let gaps = gap * (first.FlexScratch.Count - 1)
        var initial = float64(available - gaps)
        var remaining = 0
        for index in start ... end {
            let child = node.Children[index]
            if child.FlexScratch.Frame != frame {
                continue
            }
            let basis = child.FlexScratch.Base
            if !grow {
                child.FlexScratch.Minimum = MathF.Max(child.FlexScratch.Minimum, child.FlexScratch.PolicyMinimum)
                child.FlexScratch.Hypothetical = MathF.Max(child.FlexScratch.Minimum, child.FlexScratch.Hypothetical)
            }
            let hypothetical = child.FlexScratch.Hypothetical
            let factor = grow ? child.FlexGrow : child.FlexShrink
            let frozen = factor == 0.0 || (grow ? basis > hypothetical : basis < hypothetical)
            child.FlexScratch.Frozen = frozen
            child.FlexScratch.Main = frozen ? hypothetical : basis
            initial -= float64(child.FlexScratch.Main) + child.FlexScratch.Margin.Sum(axis.Horizontal)
            if !frozen {
                remaining++
            }
        }
        while remaining > 0 {
            var free = float64(available - gaps)
            var factors = 0.0
            var weights = 0.0
            for index in start ... end {
                let child = node.Children[index]
                if child.FlexScratch.Frame != frame {
                    continue
                }
                free -= child.FlexScratch.Margin.Sum(axis.Horizontal)
                if child.FlexScratch.Frozen {
                    free -= child.FlexScratch.Main
                } else {
                    let factor = grow ? child.FlexGrow : child.FlexShrink
                    factors += factor
                    weights += grow ? factor : factor * MathF.Max(
                        0.0F,
                        child.FlexScratch.Base - child.FlexScratch.Decoration
                    )
                    free -= child.FlexScratch.Base
                }
            }
            if factors < 1.0 && Math.Abs(initial * factors) < Math.Abs(free) {
                free = initial * factors
            }
            free = grow ? Math.Max(0.0, free) : Math.Min(0.0, free)
            var violation = 0.0
            for index in start ... end {
                let child = node.Children[index]
                if child.FlexScratch.Frame != frame || child.FlexScratch.Frozen {
                    continue
                }
                let basis = child.FlexScratch.Base
                let weight = grow ? child.FlexGrow : child.FlexShrink * MathF.Max(
                    0.0F,
                    basis - child.FlexScratch.Decoration
                )
                let target = basis + (weights > 0.0 ? free * weight / weights : 0.0)
                let clamped = Math.Max(child.FlexScratch.Minimum, Math.Min(child.FlexScratch.Maximum, target))
                child.FlexScratch.Main = float32(clamped)
                let delta = clamped - target
                child.FlexScratch.Violation = delta > 0.0 ? 1 : (delta < 0.0 ? -1 : 0)
                violation += delta
            }
            for index in start ... end {
                let child = node.Children[index]
                if child.FlexScratch.Frame != frame || child.FlexScratch.Frozen {
                    continue
                }
                if violation == 0.0 || (violation > 0.0 && child.FlexScratch.Violation > 0)
                || (violation < 0.0 && child.FlexScratch.Violation < 0) {
                    child.FlexScratch.Frozen = true
                    remaining--
                }
            }
        }
    }

    private func PlaceLines(
        node Node,
        ref request FlexRequest,
        box FlexBox,
        main FlexAxis,
        cross FlexAxis,
        firstIndex int32,
        lines int32,
        baselineIndex int32,
        mainGap float32,
        crossGap float32,
        totalCross float32,
        arrange bool,
        baseline bool,
        frame uint64,
        ref result FlexSize
    ) {
        let horizontal = main.Horizontal
        let mainExtent = main.Select(result.Width, result.Height)
        let crossExtent = cross.Select(result.Width, result.Height)
        let innerMain = Inner(mainExtent, box.Decorations(horizontal))
        let innerCross = Inner(crossExtent, box.Decorations(!horizontal))
        let lineFree = innerCross - totalCross
        let nowrap = node.FlexWrap == FlexWrap.NoWrap
        let stretch = !nowrap &&
            node.AlignContent == AlignContent.Stretch &&
            lines > 0 &&
            lineFree > 0.0F ? lineFree / lines : 0.0F
        let distribution = switch node.AlignContent {
            case AlignContent.Center: JustifyContent.Center
            case AlignContent.FlexEnd: JustifyContent.FlexEnd
            case AlignContent.SpaceBetween: JustifyContent.SpaceBetween
            case AlignContent.SpaceAround: JustifyContent.SpaceAround
            case _: JustifyContent.FlexStart
        }
        var lineSpacing float32
        var lineStart = box.Padding.Start(cross) + box.Border.Start(cross)
        if !nowrap {
            lineStart += Distribute(distribution, lineFree, lines, out lineSpacing)
        }
        var index = firstIndex
        var line = 0
        while index < node.Children.Count {
            let first = node.Children[index]
            let end = first.FlexScratch.End
            let count = first.FlexScratch.Count
            let lineCross = nowrap ? innerCross : first.FlexScratch.LineCross + stretch
            var free = innerMain - mainGap * (count - 1)
            var autoCount = 0
            for childIndex in index ... end {
                let child = node.Children[childIndex]
                if child.FlexScratch.Frame != frame {
                    continue
                }
                free -= child.FlexScratch.Main + child.FlexScratch.Margin.Sum(horizontal)
                if main.AutoStart(child.FlexScratch.AutoMargins) {
                    autoCount++
                }
                if main.AutoEnd(child.FlexScratch.AutoMargins) {
                    autoCount++
                }
            }
            let autoSpace = autoCount > 0 && free > 0.0F ? free / autoCount : 0.0F
            var spacing float32
            var start = box.Padding.Start(main) + box.Border.Start(main)
            if autoSpace == 0.0F {
                start += Distribute(node.JustifyContent, free, count, out spacing)
            }
            for childIndex in index ... end {
                let child = node.Children[childIndex]
                if child.FlexScratch.Frame != frame {
                    continue
                }
                let margins = child.FlexScratch.Margin
                let mask = child.FlexScratch.AutoMargins
                let mainSize = child.FlexScratch.Main
                let isBaseline = childIndex == baselineIndex && baseline
                let crossAutoStart = cross.AutoStart(mask)
                let crossAutoEnd = cross.AutoEnd(mask)
                if arrange || isBaseline {
                    SetAxis(ref request, horizontal, FlexConstraint.Exact(mainSize))
                    SetAxis(
                        ref request,
                        !horizontal,
                        child.FlexScratch.Stretch
                        ? FlexConstraint.Exact(lineCross - margins.Sum(!horizontal)) : child.FlexScratch.CrossRequest
                    )
                    request.Baseline = isBaseline || child.FlexScratch.Align == AlignSelf.Baseline
                    let contentMain = arrange && child.FlexScratch.IntrinsicBasis && mainSize == child.FlexScratch.Base
                    ? (horizontal ? 1 : 2) : 0
                    let measured = Solve(child, ref request, arrange, frame, contentMain)
                    let crossSize = cross.Select(measured.Width, measured.Height)
                    let childBaseline = measured.Baseline
                    let freeCross = lineCross - crossSize - margins.Sum(!horizontal)
                    let crossMargin = margins.Start(cross)
                    let align = child.FlexScratch.Align
                    let offset = if crossAutoStart || crossAutoEnd {
                        crossAutoStart ? MathF.Max(0.0F, freeCross) / (crossAutoEnd ? 2.0F : 1.0F) : 0.0F
                    } else if align == AlignSelf.FlexEnd {
                        freeCross
                    } else if align == AlignSelf.Center {
                        freeCross * 0.5F
                    } else if align == AlignSelf.Baseline {
                        first
                            .FlexScratch
                            .Ascent - crossMargin - (cross.Reversed ? crossSize - childBaseline : childBaseline)
                    } else {
                        0.0F
                    }
                    let crossPosition = cross.Offset(crossExtent, lineStart + crossMargin + offset, crossSize)
                    let mainPosition = main.Offset(
                        mainExtent,
                        start + margins.Start(main) + (main.AutoStart(mask) ? autoSpace : 0.0F),
                        mainSize
                    )
                    let x = (horizontal ? mainPosition : crossPosition) +
                        RelativeOffset(child, true, request.OwnerWidth, direction: request.Direction)
                    let y = (horizontal ? crossPosition : mainPosition) +
                        RelativeOffset(child, false, request.OwnerHeight, direction: request.Direction)
                    if arrange {
                        child.LogicalLayout.Raw.X = x
                        child.LogicalLayout.Raw.Y = y
                        child.LogicalLayout.Line = line
                    }
                    if isBaseline {
                        result.Baseline = y + childBaseline
                        result.TextBaseline = measured.TextBaseline
                    }
                }
                start += mainSize + margins.Sum(horizontal) + mainGap + spacing
                + (main.AutoStart(mask) ? autoSpace : 0.0F) + (main.AutoEnd(mask) ? autoSpace : 0.0F)
            }
            if !arrange {
                return
            }
            lineStart += lineCross + crossGap + lineSpacing
            line++
            index = end
        }
    }
}
