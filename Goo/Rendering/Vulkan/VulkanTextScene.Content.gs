package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices

internal unsafe sealed partial class VulkanTextScene {
  private func EmitText(
    frame SceneFrame,
    node Node,
    opacity float32,
    parentTransformIndex int32,
    ref complete bool) bool{
      if opacity <= 0.0F { return true }
      let layout = RequestTextLayout(node, BoxGeometry.ContentWidth(node))

      let contentX = BoxGeometry.ContentLeft(node)
      let contentY = BoxGeometry.ContentTop(node)
      let contentWidth = BoxGeometry.ContentWidth(node)
      if let rich = layout.Rich {
        var result = true
        var lineY = contentY
        var lineIndex int32 = 0
        while lineIndex < rich.Lines.Count {
          let line = rich.Lines[lineIndex]
          let rtl = if let shape = layout.Lines[lineIndex].Shape {
            shape.RightToLeft
          } else { false }
          let lineX = contentX + TextLayouts.lineOffset(node, line.Width, rtl, contentWidth)
          let natural = line.Descent - line.Ascent
          let baseline = lineY + (line.Height - natural) * 0.5F - line.Ascent
          for run in line.Runs {
            guard let shape = run.Shape else { continue }
            if !EmitShapeWithStyle(frame, shape,
              run.Style.FontSize, lineX + run.X, baseline,
              run.Style.Color, opacity, parentTransformIndex,
              run.Style.StrokeWidth, run.Style.StrokeColor, run.Style.Shadows,
              ref complete) {
                result = false
                break
              }
            if run.Style.Color.A > 0.0F {
              AddRichDecorations(frame, run, lineX + run.X, baseline,
                PackedColor(run.Style.Color, opacity), parentTransformIndex)
            }
          }
          if !result { break }
          lineY = lineY + line.Height
          lineIndex = lineIndex + 1
        }
        return result
      }
      let lineHeight = TextLayouts.resolvedLineHeight(node)
      let natural = layout.Descent - layout.Ascent
      let leading = (lineHeight - natural) * 0.5F
      let color = PackedColor(node.Color, opacity)
      var result = true
      var lineIndex int32 = 0
      while lineIndex < layout.Lines.Count {
        let line = layout.Lines[lineIndex]
        guard let shape = line.Shape else {
          lineIndex = lineIndex + 1
          continue
        }
        let baseline = contentY + float32(lineIndex) * lineHeight + leading - layout.Ascent
        let lineX = contentX + TextLayouts.lineOffset(node, line, contentWidth)
        if !EmitShapeWithStyle(frame, shape, layout.FontSize, lineX, baseline,
          node.Color, opacity, parentTransformIndex, node.TextStrokeWidth.Px,
          node.TextStrokeColor, node.TextShadows, ref complete) {
            result = false
            break
          }
        if node.Color.A > 0.0F {
          AddPlainDecorations(frame, shape, lineX, baseline, node.TextDecoration,
            color, parentTransformIndex)
        }
        lineIndex = lineIndex + 1
      }
      return result
    }

  private func AddPlainDecorations(
    frame SceneFrame,
    shape ShapedText,
    lineX float32,
    baseline float32,
    decoration TextDecoration,
    color uint32,
    transformIndex int32) {
      if decoration == TextDecoration.None { return }
      for run in shape.Runs {
        if !HasVisibleGlyph(run) { continue }
        let left = lineX + MathF.Min(run.VisualStart, run.VisualEnd)
        let right = lineX + MathF.Max(run.VisualStart, run.VisualEnd)
        AddDecorationRecords(frame, decoration, left, right, baseline,
          shape.Ascent, shape.Descent, color, transformIndex)
      }
    }

  private func AddRichDecorations(
    frame SceneFrame,
    run TextPaintRun,
    originX float32,
    baseline float32,
    color uint32,
    transformIndex int32) {
      let decoration = run.Style.Decoration
      if decoration == TextDecoration.None { return }
      guard let shape = run.Shape else { return }
      if !HasVisibleGlyphs(shape) { return }
      guard let segments = run.DecorationSegments else { return }
      var index int32 = 0
      while index + 1 < segments.Length {
        let left = originX + segments[index]
        let right = originX + segments[index + 1]
        AddDecorationRecords(frame, decoration, left, right, baseline,
          shape.Ascent, shape.Descent, color, transformIndex)
        index = index + 2
      }
    }

  private func AddDecorationRecords(
    frame SceneFrame,
    decoration TextDecoration,
    left float32,
    right float32,
    baseline float32,
    ascent float32,
    descent float32,
    color uint32,
    transformIndex int32) {
      if decoration == TextDecoration.None || !FiniteValue(left) || !FiniteValue(right)
        || !FiniteValue(baseline) || !FiniteValue(ascent) || !FiniteValue(descent) {
          return
        }
      let minX = MathF.Min(left, right)
      let maxX = MathF.Max(left, right)
      let width = maxX - minX
      if !FiniteValue(width) || width <= 0.0F { return }
      let metricsHeight = descent - ascent
      if !FiniteValue(metricsHeight) || metricsHeight <= 0.0F { return }
      var thickness = metricsHeight * 0.06F
      if !FiniteValue(thickness) { return }
      if thickness < 1.0F { thickness = 1.0F }
      if !FiniteValue(thickness) || thickness <= 0.0F { return }
      let bits = int32(decoration)
      if (bits & int32(TextDecoration.Underline)) != 0 {
        var offset = descent * 0.45F
        if !FiniteValue(offset) { return }
        if offset < thickness { offset = thickness }
        AddUnderlineRecord(frame, minX, baseline + offset, width, thickness,
          color, 0u, transformIndex)
      }
      if (bits & int32(TextDecoration.LineThrough)) != 0 {
        let center = baseline + (ascent + descent) * 0.5F
        AddUnderlineRecord(frame, minX, center - thickness * 0.5F, width, thickness,
          color, 1u, transformIndex)
      }
    }

  private func AddUnderlineRecord(
    frame SceneFrame,
    x float32,
    y float32,
    width float32,
    thickness float32,
    color uint32,
    mode uint32,
    transformIndex int32) {
      if !FiniteValue(x) || !FiniteValue(y) || !FiniteValue(width)
        || !FiniteValue(thickness) || width <= 0.0F || thickness <= 0.0F {
          return
        }
      frame.AddUnderline(UnderlineRecord{
        Bounds: ConservativeBounds{ X: x, Y: y, Width: width, Height: thickness },
        Thickness: thickness,
        Color: color,
        Mode: mode,
        TransformIndex: transformIndex,
      })
    }

  private func HasVisibleGlyph(run ShapedRun) bool {
    var index int32 = 0
    while index < run.Glyphs.Length {
      if run.Glyphs[index] != 0u { return true }
      index = index + 1
    }
    return false
  }

  private func HasVisibleGlyphs(shape ShapedText) bool {
    for run in shape.Runs {
      if HasVisibleGlyph(run) { return true }
    }
    return false
  }

  private func FiniteValue(value float32) bool -> !Single.IsNaN(value) && !Single.IsInfinity(value)

  private func EmitEntry(
    frame SceneFrame,
    node Node,
    opacity float32,
    parentTransformIndex int32) bool{
      if opacity <= 0.0F { return true }
      let bufferShape = entryMetrics.BufferShape(node)
      let shape = if node.Buffer == "" {
        entryMetrics.PlaceholderShape(node)
      } else {
        bufferShape
      }
      let contentX = BoxGeometry.ContentLeft(node)
      let contentY = BoxGeometry.ContentTop(node)
      let contentHeight = BoxGeometry.ContentHeight(node)
      let paintShape = shape ?? bufferShape
      let lineHeight = bufferShape.Descent - bufferShape.Ascent
      let lineTop = contentY + (contentHeight - lineHeight) * 0.5F
      let caretOriginX = entryMetrics.EntryOriginX(node, bufferShape)
      let originX = if node.Buffer == "" {
        contentX + entryMetrics.EntryOffset(node, paintShape)
      } else {
        caretOriginX
      }
      let baseline = lineTop - bufferShape.Ascent
      let clipped = BeginContentClip(frame, node, parentTransformIndex)
      if node.Focused && node.Buffer != "" && node.Caret != node.Anchor
        && node.SelectionColor.A > 0.0F {
          let selection = entryMetrics.SelectionRects(node)
          AddSelectionBoxes(frame, selection, originX, lineTop, lineHeight,
            node.SelectionColor, opacity, parentTransformIndex)
        }
      var result = true
      let textOpacity = if node.Buffer == "" { opacity * 0.45F } else { opacity }
      let color = PackedColor(node.Color, textOpacity)
      result = EmitShapeWithStyle(frame, paintShape, TextLayouts.fontSize(node),
        originX, baseline, node.Color, textOpacity, parentTransformIndex,
        node.TextStrokeWidth.Px, node.TextStrokeColor, node.TextShadows)
      if result && node.Color.A > 0.0F {
        AddPlainDecorations(frame, paintShape, originX, baseline,
          node.TextDecoration, color, parentTransformIndex)
      }
      if result && node.Focused && BlinkVisible(node.BlinkT) {
        let caretX = caretOriginX + entryMetrics.CaretX(node, node.Caret)
        AddSolid(frame, ConservativeBounds{
          X: caretX,
          Y: lineTop,
          Width: 1.5F,
          Height: lineHeight,
        }, node.Color, opacity, parentTransformIndex)
      }
      if clipped { EndContentClip(frame, node, parentTransformIndex) }
      return result
    }

  private func EmitEditorContent(
    frame SceneFrame,
    node Node,
    opacity float32,
    transformIndex int32) bool{
      guard let state = node.EditorState else { return false }
      if opacity <= 0.0F { return true }
      let width = BoxGeometry.ContentWidth(node)
      let height = BoxGeometry.ContentHeight(node)
      let layout = TextEditorLayouts.For(node, width, height)
      let controller = state.Controller.State()
      let contentX = BoxGeometry.ContentLeft(node)
      let contentY = BoxGeometry.ContentTop(node)
      let scrollX = float32(controller.ScrollTargetX)
      let scrollY = float32(controller.ScrollTargetY)
      let activeLine = TextEditorLayouts.LineForPosition(layout, controller.Selection.Active)
      let placeholder = if state.Document.Length == 0 && controller.Composition == nil {
        state.Placeholder(node)
      } else { nil }
      let selectionStart = controller.Selection.Anchor.Offset < controller.Selection.Active.Offset
      ? controller.Selection.Anchor.Offset : controller.Selection.Active.Offset
      let selectionEnd = controller.Selection.Anchor.Offset > controller.Selection.Active.Offset
      ? controller.Selection.Anchor.Offset : controller.Selection.Active.Offset
      var result = true
      for lineIndex in 0 ... layout.Lines.Count {
        let line = layout.Lines[lineIndex]
        let lineY = contentY + line.Top - scrollY
        let lineX = contentX + TextEditorLayouts.editorLineOffset(node, line, width) - scrollX
        if let current = activeLine {
          if controller.Focused && current == line && node.EditorCurrentLineColor.A > 0.0F {
            AddSolid(frame, ConservativeBounds{
              X: contentX,
              Y: lineY,
              Width: width,
              Height: line.Height,
            }, node.EditorCurrentLineColor, opacity, transformIndex)
          }
        }
        if controller.Focused && selectionStart != selectionEnd
          && line.SourceEnd >= selectionStart
          && line.SourceStart <= selectionEnd{
            let displayStart = TextEditorLayouts.DisplayOffsetForSource(line.Paragraph,
              selectionStart, TextAffinity.Downstream)
            let displayEnd = TextEditorLayouts.DisplayOffsetForSource(line.Paragraph,
              selectionEnd, TextAffinity.Upstream)
            var localStart = displayStart - line.DisplayStart
            var localEnd = displayEnd - line.DisplayStart
            if localStart < 0 { localStart = 0 }
            if localEnd > line.DisplayLength { localEnd = line.DisplayLength }
            if localEnd > localStart {
              let selection = TextEditorLayouts.SelectionRects(line, localStart, localEnd)
              AddSelectionBoxes(frame, selection, lineX, lineY, line.Height,
                node.SelectionColor, opacity, transformIndex)
            }
          }
        if controller.Focused {
          if let composition = controller.Composition {
            var compositionStart int32 = 0
            var compositionEnd int32 = 0
            if TextEditorLayouts.CompositionDisplayRange(line, composition,
              out compositionStart, out compositionEnd)
              && compositionEnd > compositionStart{
                let selection = TextEditorLayouts.SelectionRects(line,
                  compositionStart, compositionEnd)
                AddSelectionBoxes(frame, selection, lineX, lineY, line.Height,
                  node.SelectionColor, opacity, transformIndex)
              }
          }
        }
        guard let shape = line.Shape, let baseStyle = line.Paragraph.BaseStyle else {
          continue
        }
        let baseline = lineY + (line.Height - (line.Descent - line.Ascent)) * 0.5F
        -line.Ascent
        if line.Runs.Count != 0 {
          for runIndex in 0 ... line.Runs.Count {
            let run = line.Runs[runIndex]
            guard let runShape = run.Shape else { continue }
            let color = PackedColor(run.Style.Color, opacity)
            if !EmitShapeWithStyle(frame, runShape, run.Style.FontSize,
              lineX + run.X, baseline, run.Style.Color, opacity,
              transformIndex, run.Style.StrokeWidth,
              run.Style.StrokeColor, run.Style.Shadows) {
                result = false
                break
              }
            if run.Style.Color.A > 0.0F {
              AddRichDecorations(frame, run, lineX + run.X, baseline,
                color, transformIndex)
            }
          }
          if !result { break }
        } else {
          let color = PackedColor(baseStyle.Color, opacity)
          if !EmitShapeWithStyle(frame, shape, baseStyle.FontSize, lineX, baseline,
            baseStyle.Color, opacity, transformIndex, baseStyle.StrokeWidth,
            baseStyle.StrokeColor, baseStyle.Shadows) {
              result = false
              break
            }
          if baseStyle.Color.A > 0.0F {
            AddPlainDecorations(frame, shape, lineX, baseline,
              baseStyle.Decoration, color, transformIndex)
          }
        }
      }
      if result {
        if let value = placeholder {
          let line = layout.Lines[0]
          let lineX = contentX + TextLayouts.lineOffset(node, value.Width,
            value.RightToLeft, width) - scrollX
          let natural = value.Descent - value.Ascent
          let baseline = contentY + line.Top - scrollY
          +(line.Height - natural) * 0.5F - value.Ascent
          let color = PackedColor(node.Color, opacity * 0.45F)
          if !EmitShapeWithStyle(frame, value, TextLayouts.fontSize(node), lineX,
            baseline, node.Color, opacity * 0.45F, transformIndex,
            node.TextStrokeWidth.Px, node.TextStrokeColor, node.TextShadows) {
              result = false
            } else if node.Color.A > 0.0F {
              AddPlainDecorations(frame, value, lineX, baseline,
                node.TextDecoration, color, transformIndex)
            }
        }
      }
      if result && controller.Focused && BlinkVisible(node.BlinkT) {
        let caret = if let composition = controller.Composition {
          TextEditorLayouts.CompositionCaretRect(node, composition)
        } else {
          TextEditorLayouts.CaretRect(node, controller.Selection.Active)
        }
        AddSolid(frame, ConservativeBounds{
          X: node.Rect.X + caret.X,
          Y: node.Rect.Y + caret.Y,
          Width: caret.W,
          Height: caret.H,
        }, node.EditorCaretColor, opacity, transformIndex)
      }
      return result
    }

}
