// Adapted from Sandbox.Layout (1e551e0), Flex/FlexAxis.cs.
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

internal struct FlexAxis {
    internal var Horizontal bool
    internal var Reversed bool

    internal func Offset(
        extent float32,
        start float32,
        size float32
    ) float32 -> Reversed ? extent - start - size : start

    internal func Select(width float32, height float32) float32 -> Horizontal ? width : height

    internal func AutoStart(mask int32) bool -> (mask & (Horizontal ? (Reversed ? 4 : 1) : (Reversed ? 8 : 2))) != 0

    internal func AutoEnd(mask int32) bool -> (mask & (Horizontal ? (Reversed ? 1 : 4) : (Reversed ? 2 : 8))) != 0
}

internal struct FlexBox {
    internal var Width float32
    internal var Height float32
    internal var MinWidth float32
    internal var MinHeight float32
    internal var MaxWidth float32
    internal var MaxHeight float32
    internal var Ratio float32
    internal var Margin FlexInsets
    internal var Padding FlexInsets
    internal var Border FlexInsets
    internal var AutoMargins int32

    internal func Decorations(horizontal bool) float32 -> horizontal
    ? Padding.Left + Padding.Right + Border.Left + Border.Right
    : Padding.Top + Padding.Bottom + Border.Top + Border.Bottom

    internal func Clamp(value float32, horizontal bool) float32 -> MathF.Max(
        Decorations(horizontal),
        MathF.Max(horizontal ? MinWidth : MinHeight, MathF.Min(value, horizontal ? MaxWidth : MaxHeight))
    )
}

internal partial class FlexLayoutEngine {
    internal func MainAxis(node Node, direction Direction) FlexAxis {
        let horizontal = node.FlexDirection == FlexDirection.Row || node.FlexDirection == FlexDirection.RowReverse
        let reversed = node.FlexDirection == FlexDirection.RowReverse ||
            node.FlexDirection == FlexDirection.ColumnReverse
        return FlexAxis{
            Horizontal: horizontal,
            Reversed: reversed != (horizontal && direction == Direction.RightToLeft)
        }
    }

    internal func CrossAxis(node Node, main FlexAxis, direction Direction) FlexAxis -> FlexAxis{
        Horizontal: !main.Horizontal,
        Reversed: (node.FlexWrap == FlexWrap.WrapReverse) != (!main.Horizontal && direction == Direction.RightToLeft)
    }

    private func Alignment(parent Node, child Node, axis FlexAxis) AlignSelf {
        let align = child.AlignSelf == AlignSelf.Auto ? AlignSelf(int32(parent.AlignItems) + 1) : child.AlignSelf
        return !axis.Horizontal && align == AlignSelf.Baseline ? AlignSelf.FlexStart : align
    }

    private func EffectiveDirection(node Node, inherited Direction) Direction -> node.Direction != Direction.Auto
    ? node.Direction : (inherited == Direction.Auto ? Direction.LeftToRight : inherited)

    private func Known(value float32) bool -> Single.IsFinite(value)

    private func Zero(value float32) float32 -> Known(value) ? value : 0.0F

    private func Inner(value float32, decorations float32) float32 -> Known(value)
    ? MathF.Max(0.0F, value - decorations) : Single.NaN

    private func LengthValue(length NodeLength, basis float32) float32 -> switch length.Unit {
        case LengthUnit.Px: length.Value
        case LengthUnit.Percent: Known(basis) ? length.Value * basis * 0.01F : Single.NaN
        case _: Single.NaN
    }

    internal func ProjectedValue(
        length NodeLength,
        field StyleField,
        entries LengthNode?,
        basis float32,
        cyclicZero bool = false
    ) float32 {
        if let state = entries {
            for index in 0 ... state.Values.Count {
                let entry = state.Values[index]
                if entry.Field == field &&
                    !entry
                    .Value
                    .IsIntrinsic &&
                    Known(entry.Pixels) &&
                    entry
                    .Value
                    .PercentPart != 0.0F {
                    return Known(basis) ? entry.Pixels + entry.Value.PercentPart * basis * 0.01F
                    : (cyclicZero ? entry.Pixels : Single.NaN)
                }
            }
        }
        return LengthValue(length, basis)
    }

    private func BorderValue(length NodeLength, density float32) float32 {
        let width = MathF.Max(0.0F, length.Px)
        return density > 0.0F && width > 0.0F
        ? float32(Math.Max(1.0, Math.Round(float64(width) * density, MidpointRounding.AwayFromZero)) / density) : width
    }

    private func EdgeLength(
        edge NodeLength,
        shorthand NodeLength
    ) NodeLength -> edge.Unit == LengthUnit.Unset ? shorthand : edge

    internal func ResolveBox(node Node, in request FlexRequest) FlexBox {
        let ownerWidth = request.OwnerWidth
        let ownerHeight = request.OwnerHeight
        let entries = LengthDeclarations.Get(node)
        let width = ProjectedValue(node.Width, StyleField.Width, entries, ownerWidth)
        let height = ProjectedValue(node.Height, StyleField.Height, entries, ownerHeight)
        let marginLeft = EdgeLength(node.MarginLeft, node.Margin)
        let marginTop = EdgeLength(node.MarginTop, node.Margin)
        let marginRight = EdgeLength(node.MarginRight, node.Margin)
        let marginBottom = EdgeLength(node.MarginBottom, node.Margin)
        let borderLeft = BorderValue(node.BorderLeftWidth, request.Density)
        let shape = node.Kind == NodeKind.Shape
        var ratio = float32(node.AspectRatio)
        if ratio <= 0.0F && shape && !request.Root && (!Known(width) || !Known(height)) {
            ratio = float32(node.ShapePath.ViewBoxWidth / node.ShapePath.ViewBoxHeight)
        }
        if ratio <= 0.0F && node.Kind == NodeKind.Image && node.ImageIntrinsicHeight > 0.0F {
            ratio = node.ImageIntrinsicWidth / node.ImageIntrinsicHeight
        }
        let ignoreWidth = request.Override == FlexOverride.WidthIntrinsic ||
            request.Override == FlexOverride.AssignedBox
        let ignoreHeight = request.Override == FlexOverride.HeightIntrinsic ||
            request.Override == FlexOverride.AssignedBox
        var maxWidth = ignoreWidth ? Single.NaN : ProjectedValue(
            node.MaxWidth,
            StyleField.MaxWidth,
            entries,
            ownerWidth
        )
        var maxHeight = ignoreHeight ? Single.NaN : ProjectedValue(
            node.MaxHeight,
            StyleField.MaxHeight,
            entries,
            ownerHeight
        )
        var minWidth = ignoreWidth ? 0.0F : Zero(
            ProjectedValue(node.MinWidth, StyleField.MinWidth, entries, ownerWidth)
        )
        var minHeight = ignoreHeight ? 0.0F : Zero(
            ProjectedValue(node.MinHeight, StyleField.MinHeight, entries, ownerHeight)
        )
        if request.Override == FlexOverride.Capped {
            if request.Width.Mode == FlexMeasureMode.AtMost {
                maxWidth = Known(maxWidth) ? MathF.Min(maxWidth, request.Width.Size) : request.Width.Size
                minWidth = MathF.Min(minWidth, maxWidth)
            }
            if request.Height.Mode == FlexMeasureMode.AtMost {
                maxHeight = Known(maxHeight) ? MathF.Min(maxHeight, request.Height.Size) : request.Height.Size
                minHeight = MathF.Min(minHeight, maxHeight)
            }
        }
        return FlexBox{
            Width: ignoreWidth ? Single.NaN : width,
            Height: ignoreHeight ? Single.NaN : height,
            MinWidth: minWidth,
            MinHeight: minHeight,
            MaxWidth: Known(maxWidth) ? maxWidth : Single.PositiveInfinity,
            MaxHeight: Known(maxHeight) ? maxHeight : Single.PositiveInfinity,
            Ratio: Known(ratio) ? ratio : 0.0F,
            Margin: FlexInsets{
                Left: Zero(ProjectedValue(marginLeft, StyleField.MarginLeft, entries, ownerWidth, true)),
                Top: Zero(ProjectedValue(marginTop, StyleField.MarginTop, entries, ownerWidth, true)),
                Right: Zero(ProjectedValue(marginRight, StyleField.MarginRight, entries, ownerWidth, true)),
                Bottom: Zero(ProjectedValue(marginBottom, StyleField.MarginBottom, entries, ownerWidth, true))
            },
            Padding: FlexInsets{
                Left: MathF.Max(
                    0.0F,
                    Zero(
                        ProjectedValue(
                            EdgeLength(node.PaddingLeft, node.Padding),
                            StyleField.PaddingLeft,
                            entries,
                            ownerWidth,
                            true
                        )
                    )
                ),
                Top: MathF.Max(
                    0.0F,
                    Zero(
                        ProjectedValue(
                            EdgeLength(node.PaddingTop, node.Padding),
                            StyleField.PaddingTop,
                            entries,
                            ownerWidth,
                            true
                        )
                    )
                ),
                Right: MathF.Max(
                    0.0F,
                    Zero(
                        ProjectedValue(
                            EdgeLength(node.PaddingRight, node.Padding),
                            StyleField.PaddingRight,
                            entries,
                            ownerWidth,
                            true
                        )
                    )
                ),
                Bottom: MathF.Max(
                    0.0F,
                    Zero(
                        ProjectedValue(
                            EdgeLength(node.PaddingBottom, node.Padding),
                            StyleField.PaddingBottom,
                            entries,
                            ownerWidth,
                            true
                        )
                    )
                )
            },
            Border: FlexInsets{
                Left: borderLeft,
                Top: shape ? borderLeft : BorderValue(node.BorderTopWidth, request.Density),
                Right: shape ? borderLeft : BorderValue(node.BorderRightWidth, request.Density),
                Bottom: shape ? borderLeft : BorderValue(node.BorderBottomWidth, request.Density)
            },
            AutoMargins: (marginLeft.Unit == LengthUnit.Auto ? 1 : 0) | (marginTop.Unit == LengthUnit.Auto ? 2 : 0)
            | (marginRight.Unit == LengthUnit.Auto ? 4 : 0) | (marginBottom.Unit == LengthUnit.Auto ? 8 : 0)
        }
    }

    internal func Gap(node Node, horizontal bool, basis float32) float32 {
        let entries = LengthDeclarations.Get(node)
        let length = horizontal ? node.ColumnGap : node.RowGap
        let value = ProjectedValue(length, horizontal ? StyleField.ColumnGap : StyleField.RowGap, entries, basis, true)
        return MathF.Max(
            0.0F,
            Zero(
                length.Unit == LengthUnit.Unset && !Known(value)
                ? ProjectedValue(node.Gap, StyleField.Gap, entries, basis, true) : value
            )
        )
    }

    internal func RelativeOffset(node Node, horizontal bool, owner float32, direction Direction) float32 {
        if node.Position == PositionType.Static {
            return 0.0F
        }
        let startLength = horizontal ? node.Left : node.Top
        let endLength = horizontal ? node.Right : node.Bottom
        if startLength.Unit == LengthUnit.Unset && endLength.Unit == LengthUnit.Unset {
            return 0.0F
        }
        let entries = LengthDeclarations.Get(node)
        let start = ProjectedValue(startLength, horizontal ? StyleField.Left : StyleField.Top, entries, owner)
        let end = ProjectedValue(endLength, horizontal ? StyleField.Right : StyleField.Bottom, entries, owner)
        return Known(start) && !(horizontal && direction == Direction.RightToLeft && Known(end)) ? start : -Zero(end)
    }

    internal func Distribute(kind JustifyContent, free float32, count int32, out spacing float32) float32 {
        spacing = 0.0F
        switch kind {
            case JustifyContent.Center {
                return free * 0.5F
            }
            case JustifyContent.FlexEnd {
                return free
            }
            case JustifyContent.SpaceBetween {
                if free > 0.0F && count > 1 {
                    spacing = free / (count - 1)
                }
            }
            case JustifyContent.SpaceAround {
                if free > 0.0F && count > 0 {
                    spacing = free / count
                    return spacing * 0.5F
                }
            }
            case JustifyContent.SpaceEvenly {
                if free > 0.0F {
                    spacing = free / (count + 1)
                    return spacing
                }
            }
            case _ { }
        }
        return 0.0F
    }

    shared {
        internal func PixelRound(value float64, density float32, ceil bool = false, floor bool = false) float64 {
            if density == 0.0F {
                return value
            }
            let scaled = value * density
            let whole = Math.Floor(scaled)
            let fraction = scaled - whole
            if fraction < 0.0001 {
                return whole / density
            }
            return (whole + (fraction > 0.9999 || ceil || (!floor && fraction >= 0.4999) ? 1.0 : 0.0)) / density
        }
    }

    private func SnappedLength(
        start float64,
        length float32,
        snappedStart float64,
        density float32,
        measured bool
    ) float32 {
        let width = measured ? PixelRound(length, density, ceil: true)
        : PixelRound(start + length, density) - snappedStart
        return float32(width == 0.0 && length > 0.0F ? 1.0 / density : width)
    }

    private func FinalizeGeometry(
        node Node,
        x float64,
        y float64,
        snappedX float64,
        snappedY float64,
        density float32,
        frame uint64,
        in inherited AbsoluteBlock,
        root bool = false
    ) {
        if !node.LogicalLayout.Valid {
            return
        }
        let raw = node.LogicalLayout.Raw
        let absoluteX = x + raw.X
        let absoluteY = y + raw.Y
        let measured = !node.HasCustomLayout && IsMeasured(node)
        let left = PixelRound(absoluteX, density, floor: measured)
        let top = PixelRound(absoluteY, density, floor: measured)
        node
            .LogicalLayout
            .Snapped = density == 0.0F ? raw : Rect{
            X: float32(left - snappedX),
            Y: float32(top - snappedY),
            W: SnappedLength(absoluteX, raw.W, left, density, measured),
            H: SnappedLength(absoluteY, raw.H, top, density, measured)
        }
        if node.Children.Count == 0 || IsMeasured(node) {
            return
        }
        let direction = node.LogicalLayout.Direction
        let border = node.LogicalLayout.Border
        let block = if root || node.Position != PositionType.Static {
            AbsoluteBlock{
                X: absoluteX + border.Left,
                Y: absoluteY + border.Top,
                Width: Inner(raw.W, border.Sum(true)),
                Height: Inner(raw.H, border.Sum(false)),
                Direction: direction
            }
        } else {
            inherited
        }
        for index in 0 ... node.Children.Count {
            let child = node.Children[index]
            if child.IsPortal {
                continue
            }
            if child.Display == Display.None {
                Hide(child, frame)
                continue
            }
            if child.Position == PositionType.Absolute {
                PlaceAbsolute(node, child, absoluteX, absoluteY, in block, density, frame)
            }
            FinalizeGeometry(child, absoluteX, absoluteY, left, top, density, frame, in block)
        }
        if density != 0.0F && !node.HasCustomLayout && node.Kind != NodeKind.Editor
        && node.OverflowX != Overflow.Scroll && node.OverflowY != Overflow.Scroll {
            let axes = node.LogicalLayout.ContentAxes
            let horizontal = (axes & 1) != 0 && node.OverflowX == Overflow.Hidden
            let vertical = (axes & 2) != 0 && node.OverflowY == Overflow.Hidden
            if horizontal || vertical {
                ExpandContentClip(node, left, top, snappedX, snappedY, density, horizontal, vertical)
            }
        }
    }

    private func ExpandContentClip(
        node Node, x float64, y float64, parentX float64, parentY float64, density float32,
        horizontal bool, vertical bool
    ) {
        let snapped = node.LogicalLayout.Snapped
        let border = node.LogicalLayout.Border
        var left = float64(border.Left)
        var top = float64(border.Top)
        var right = float64(snapped.W) - float64(border.Right)
        var bottom = float64(snapped.H) - float64(border.Bottom)
        let raw = node.LogicalLayout.Raw
        let rawClip = FlexInsets{
            Left: border.Left - 0.0001F, Top: border.Top - 0.0001F,
            Right: raw.W - border.Right + 0.0001F, Bottom: raw.H - border.Bottom + 0.0001F
        }
        CollectContentBounds(node, 0.0, 0.0, 0.0, 0.0, in rawClip, horizontal, vertical,
            ref left, ref top, ref right, ref bottom)
        left -= border.Left
        top -= border.Top
        right += border.Right
        bottom += border.Bottom
        if left >= 0.0 && top >= 0.0 && right <= snapped.W && bottom <= snapped.H {
            return
        }
        let dx = left < 0.0 ? PixelRound(x + left, density, floor: true) - x : 0.0
        let dy = top < 0.0 ? PixelRound(y + top, density, floor: true) - y : 0.0
        let endX = right > snapped.W ? PixelRound(x + right, density, ceil: true) - x : float64(snapped.W)
        let endY = bottom > snapped.H ? PixelRound(y + bottom, density, ceil: true) - y : float64(snapped.H)
        let shiftedX = x + dx
        let shiftedY = y + dy
        node.LogicalLayout.Snapped = Rect{
            X: dx == 0.0 ? snapped.X : float32(shiftedX - parentX),
            Y: dy == 0.0 ? snapped.Y : float32(shiftedY - parentY),
            W: float32(endX - dx),
            H: float32(endY - dy)
        }
        if dx != 0.0 || dy != 0.0 {
            for index in 0 ... node.Children.Count {
                let child = node.Children[index]
                if !child.IsPortal && child.LogicalLayout.Valid {
                    // Rebase from placed coordinates so the clip's new start does not move glyphs.
                    if dx != 0.0 {
                        child.LogicalLayout.Snapped.X = (float32(x) + child.LogicalLayout.Snapped.X) - float32(shiftedX)
                    }
                    if dy != 0.0 {
                        child.LogicalLayout.Snapped.Y = (float32(y) + child.LogicalLayout.Snapped.Y) - float32(shiftedY)
                    }
                }
            }
        }
    }

    private func CollectContentBounds(
        node Node, x float64, y float64, rawX float64, rawY float64, in rawClip FlexInsets,
        horizontal bool, vertical bool,
        ref left float64, ref top float64, ref right float64, ref bottom float64
    ) {
        for index in 0 ... node.Children.Count {
            let child = node.Children[index]
            if child.IsPortal || !child.LogicalLayout.Valid || child.Position == PositionType.Absolute {
                continue
            }
            let box = child.LogicalLayout.Snapped
            let raw = child.LogicalLayout.Raw
            let rawChildX = rawX + raw.X
            let rawChildY = rawY + raw.Y
            let childX = x + box.X
            let childY = y + box.Y
            if horizontal {
                if rawChildX >= rawClip.Left && rawChildX <= rawClip.Right { left = Math.Min(left, childX) }
                let end = rawChildX + raw.W
                if end >= rawClip.Left && end <= rawClip.Right { right = Math.Max(right, childX + box.W) }
            }
            if vertical {
                if rawChildY >= rawClip.Top && rawChildY <= rawClip.Bottom { top = Math.Min(top, childY) }
                let end = rawChildY + raw.H
                if end >= rawClip.Top && end <= rawClip.Bottom { bottom = Math.Max(bottom, childY + box.H) }
            }
            let visibleX = horizontal && child.OverflowX == Overflow.Visible
            let visibleY = vertical && child.OverflowY == Overflow.Visible
            if (visibleX || visibleY) && child.Children.Count != 0 && !IsMeasured(child) && !child.HasCustomLayout {
                CollectContentBounds(child, childX, childY, rawChildX, rawChildY, in rawClip,
                    visibleX, visibleY, ref left, ref top, ref right, ref bottom)
            }
        }
    }
}
