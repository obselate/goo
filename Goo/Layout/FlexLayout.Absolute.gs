// Adapted from Sandbox.Layout (1e551e0), Layout/AbsoluteLayout.cs.
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

internal struct AbsoluteBlock {
  internal var X float64
  internal var Y float64
  internal var Width float32
  internal var Height float32
  internal var Direction Direction
}

internal partial class FlexLayoutEngine {
  private func PlaceAbsolute(node Node, child Node, parentX float64, parentY float64,
    in block AbsoluteBlock, density float32, frame uint64) {
    let direction = node.LogicalLayout.Direction
    var key = FlexRequest{OwnerWidth: block.Width, OwnerHeight: block.Height, Direction: direction, Density: density}
    let box = ResolveBox(child, in key)
    let entries = LengthDeclarations.Get(child)
    let left = ProjectedValue(child.Left, StyleField.Left, entries, block.Width)
    let right = ProjectedValue(child.Right, StyleField.Right, entries, block.Width)
    let top = ProjectedValue(child.Top, StyleField.Top, entries, block.Height)
    let bottom = ProjectedValue(child.Bottom, StyleField.Bottom, entries, block.Height)
    let availableWidth = block.Width - Zero(left) - Zero(right) - box.Margin.Sum(true)
    let availableHeight = block.Height - Zero(top) - Zero(bottom) - box.Margin.Sum(false)
    key.Width = !Known(box.Width) && Known(left) && Known(right) ? FlexConstraint.Exact(availableWidth) : FlexConstraint.Cap(availableWidth)
    key.Height = !Known(box.Height) && Known(top) && Known(bottom) ? FlexConstraint.Exact(availableHeight) : FlexConstraint{}
    let measured = Solve(child, ref key, true, frame)
    let main = MainAxis(node, direction)
    let cross = CrossAxis(node, main, direction)
    child.LogicalLayout.Raw.X = if Known(left) || Known(right) {
      float32(block.X - parentX + AbsoluteOffset(left, right, block.Width, measured.Width,
        box.Margin.Left, box.Margin.Right, (box.AutoMargins & 1) != 0, (box.AutoMargins & 4) != 0,
        block.Direction == Direction.RightToLeft))
    } else { StaticOffset(node, child, box.Margin, main, cross, true, node.LogicalLayout.Raw.W, measured.Width) }
    child.LogicalLayout.Raw.Y = if Known(top) || Known(bottom) {
      float32(block.Y - parentY + AbsoluteOffset(top, bottom, block.Height, measured.Height,
        box.Margin.Top, box.Margin.Bottom, (box.AutoMargins & 2) != 0, (box.AutoMargins & 8) != 0, false))
    } else { StaticOffset(node, child, box.Margin, main, cross, false, node.LogicalLayout.Raw.H, measured.Height) }
    child.LogicalLayout.Line = 0
  }

  private func AbsoluteOffset(start float32, end float32, extent float32, size float32,
    marginStart float32, marginEnd float32, autoStart bool, autoEnd bool, reversed bool) float32 {
    if Known(start) && Known(end) {
      let free = extent - start - end - size - marginStart - marginEnd
      if autoStart && autoEnd && free >= 0.0F { return start + marginStart + free * 0.5F }
      if autoStart && (!autoEnd || reversed) { return start + marginStart + free }
      if autoEnd || !reversed { return start + marginStart }
    } else if Known(start) {
      return start + marginStart
    }
    return extent - end - size - marginEnd
  }

  private func StaticOffset(node Node, child Node, margin FlexInsets,
    main FlexAxis, cross FlexAxis, horizontal bool, parentSize float32, childSize float32) float32 {
    let isMain = main.Horizontal == horizontal
    let axis = isMain ? main : cross
    let padding = node.LogicalLayout.Padding
    let border = node.LogicalLayout.Border
    let free = parentSize - padding.Sum(horizontal) - border.Sum(horizontal) - childSize - margin.Sum(horizontal)
    let offset = if isMain {
      let justify = node.JustifyContent
      if justify == JustifyContent.Center || justify == JustifyContent.SpaceAround || justify == JustifyContent.SpaceEvenly {
        free * 0.5F
      } else { justify == JustifyContent.FlexEnd ? free : 0.0F }
    } else {
      let align = Alignment(node, child, main)
      align == AlignSelf.Center ? free * 0.5F : (align == AlignSelf.FlexEnd ? free : 0.0F)
    }
    return axis.Offset(parentSize, padding.Start(axis) + border.Start(axis) + margin.Start(axis) + offset, childSize)
  }
}
