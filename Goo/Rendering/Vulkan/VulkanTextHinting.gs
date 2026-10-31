package Goo

import System
import System.Collections.Generic
import System.Runtime.InteropServices

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate VulkanTextDrawPoint(funcs nint, data nint, state nint, x float32, y float32, userData nint);

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate VulkanTextDrawQuadratic(
    funcs nint,
    data nint,
    state nint,
    cx float32,
    cy float32,
    x float32,
    y float32,
    userData nint
);

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate VulkanTextDrawCubic(
    funcs nint,
    data nint,
    state nint,
    cx float32,
    cy float32,
    dx float32,
    dy float32,
    x float32,
    y float32,
    userData nint
);

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate VulkanTextDrawClose(funcs nint, data nint, state nint, userData nint);

@DllImport("goo-harfbuzz", CallingConvention: CallingConvention.Cdecl)
internal func hb_draw_funcs_create() nint;

@DllImport("goo-harfbuzz", CallingConvention: CallingConvention.Cdecl)
internal func hb_draw_funcs_destroy(funcs nint);

@DllImport("goo-harfbuzz", CallingConvention: CallingConvention.Cdecl)
internal func hb_draw_funcs_set_move_to_func(funcs nint, callback nint, data nint, destroy nint);

@DllImport("goo-harfbuzz", CallingConvention: CallingConvention.Cdecl)
internal func hb_draw_funcs_set_line_to_func(funcs nint, callback nint, data nint, destroy nint);

@DllImport("goo-harfbuzz", CallingConvention: CallingConvention.Cdecl)
internal func hb_draw_funcs_set_quadratic_to_func(funcs nint, callback nint, data nint, destroy nint);

@DllImport("goo-harfbuzz", CallingConvention: CallingConvention.Cdecl)
internal func hb_draw_funcs_set_cubic_to_func(funcs nint, callback nint, data nint, destroy nint);

@DllImport("goo-harfbuzz", CallingConvention: CallingConvention.Cdecl)
internal func hb_draw_funcs_set_close_path_func(funcs nint, callback nint, data nint, destroy nint);

@DllImport("goo-harfbuzz", CallingConvention: CallingConvention.Cdecl)
internal func hb_font_draw_glyph(font nint, glyph uint32, funcs nint, data nint);

@DllImport("goo-harfbuzz", CallingConvention: CallingConvention.Cdecl)
internal func hb_ot_metrics_get_position_with_fallback(font nint, tag uint32, ref position int32);

@DllImport("goo-harfbuzz", CallingConvention: CallingConvention.Cdecl)
internal func hb_draw_move_to(funcs nint, data nint, ref state VulkanHarfBuzzDrawState, x float32, y float32);

@DllImport("goo-harfbuzz", CallingConvention: CallingConvention.Cdecl)
internal func hb_draw_line_to(funcs nint, data nint, ref state VulkanHarfBuzzDrawState, x float32, y float32);

@DllImport("goo-harfbuzz", CallingConvention: CallingConvention.Cdecl)
internal func hb_draw_quadratic_to(
    funcs nint,
    data nint,
    ref state VulkanHarfBuzzDrawState,
    cx float32,
    cy float32,
    x float32,
    y float32
);

@DllImport("goo-harfbuzz", CallingConvention: CallingConvention.Cdecl)
internal func hb_draw_cubic_to(
    funcs nint,
    data nint,
    ref state VulkanHarfBuzzDrawState,
    cx float32,
    cy float32,
    dx float32,
    dy float32,
    x float32,
    y float32
);

@DllImport("goo-harfbuzz", CallingConvention: CallingConvention.Cdecl)
internal func hb_draw_close_path(funcs nint, data nint, ref state VulkanHarfBuzzDrawState);

internal data struct VulkanTextHintSegment {
    internal let Kind int32
    internal let X float32
    internal let Y float32
    internal let CX float32
    internal let CY float32
    internal let DX float32
    internal let DY float32
}

internal data struct VulkanTextHintHorizontalEdge {
    internal let Y float32
    internal let StartX float32
    internal let EndX float32
}

internal sealed class VulkanTextHinting : IDisposable {
    private let segments List[VulkanTextHintSegment] = List[VulkanTextHintSegment](128)
    private let edges List[float32] = List[float32](32)
    private let fitted List[int32] = List[int32](32)
    private let horizontalEdges List[VulkanTextHintHorizontalEdge] = List[VulkanTextHintHorizontalEdge](32)
    private let moveCallback VulkanTextDrawPoint
    private let lineCallback VulkanTextDrawPoint
    private let quadraticCallback VulkanTextDrawQuadratic
    private let cubicCallback VulkanTextDrawCubic
    private let closeCallback VulkanTextDrawClose
    private var funcs nint
    private var currentX float32
    private var currentY float32
    private var startX float32
    private var startY float32
    private var failed bool
    private var designUnitsPerPixel float32
    private let units float32
    private let xHeight float32
    private let xHeightOvershoot float32
    private let capHeight float32

    shared {
        private let HorizontalHeightOrder Comparison[VulkanTextHintHorizontalEdge] =
        (first VulkanTextHintHorizontalEdge, second VulkanTextHintHorizontalEdge) -> first.Y.CompareTo(second.Y)
    }

    internal init(font nint, designScale int32) {
        units = float32(designScale)
        var value int32 = 0
        hb_ot_metrics_get_position_with_fallback(font, VulkanTextTag("xhgt"), ref value)
        xHeight = float32(value)
        hb_ot_metrics_get_position_with_fallback(font, VulkanTextTag("cpht"), ref value)
        capHeight = float32(value)
        var glyph uint32 = 0u
        var extents = VulkanTextGlyphExtents{}
        if xHeight > 0.0F && hb_font_get_nominal_glyph(font, uint32('o'), ref glyph) != 0u
        && hb_font_get_glyph_extents(font, glyph, ref extents) != 0u
        && float32(extents.YBearing) >= xHeight && float32(extents.YBearing) <= xHeight + units * 0.025F {
            xHeightOvershoot = float32(extents.YBearing)
        }
        moveCallback = Move
        lineCallback = Line
        quadraticCallback = Quadratic
        cubicCallback = Cubic
        closeCallback = Close
        funcs = hb_draw_funcs_create()
        if funcs == nint(0) {
            throw InvalidOperationException("HarfBuzz outline callbacks are unavailable")
        }
        hb_draw_funcs_set_move_to_func(funcs, Marshal.GetFunctionPointerForDelegate(moveCallback), nint(0), nint(0))
        hb_draw_funcs_set_line_to_func(funcs, Marshal.GetFunctionPointerForDelegate(lineCallback), nint(0), nint(0))
        hb_draw_funcs_set_quadratic_to_func(
            funcs,
            Marshal.GetFunctionPointerForDelegate(quadraticCallback),
            nint(0),
            nint(0)
        )
        hb_draw_funcs_set_cubic_to_func(funcs, Marshal.GetFunctionPointerForDelegate(cubicCallback), nint(0), nint(0))
        hb_draw_funcs_set_close_path_func(funcs, Marshal.GetFunctionPointerForDelegate(closeCallback), nint(0), nint(0))
    }

    internal func Draw(font nint, glyph uint32, draw nint, ppem int32) bool {
        segments.Clear()
        edges.Clear()
        fitted.Clear()
        horizontalEdges.Clear()
        failed = false
        hb_font_draw_glyph(font, glyph, funcs, nint(0))
        if failed {
            return false
        }
        let scale = float32(ppem) / (64.0F * units)
        designUnitsPerPixel = 1.0F / scale
        if segments.Count > 0 {
            var minimum = segments[0].Y
            var maximum = minimum
            for segment in segments {
                minimum = MathF.Min(minimum, segment.Y)
                maximum = MathF.Max(maximum, segment.Y)
            }
            Edge(minimum)
            Edge(maximum)
        }
        Edge(0.0F)
        if xHeight > 0.0F {
            Edge(xHeight)
        }
        if capHeight > 0.0F {
            Edge(capHeight)
        }
        if failed {
            return false
        }
        edges.Sort()
        var uniqueCount = 0
        for i in 0 ... edges.Count {
            let value = edges[i]
            if uniqueCount == 0 || value != edges[uniqueCount - 1] {
                edges[uniqueCount] = value
                uniqueCount++
            }
        }
        edges.RemoveRange(uniqueCount, edges.Count - uniqueCount)
        let zone = MathF.Min(units * 0.025F, 0.5F / scale)
        let xHeightPixels = if xHeightOvershoot > 0.0F {
            int32(MathF.Floor(xHeightOvershoot * scale + 0.625F))
        } else { int32(MathF.Round(xHeight * scale, MidpointRounding.AwayFromZero)) }
        for edge in edges {
            let anchor = Anchor(edge, zone)
            let pixel = if anchor == xHeight { xHeightPixels }
                else { int32(MathF.Round(anchor * scale, MidpointRounding.AwayFromZero)) }
            fitted.Add(if fitted.Count == 0 { pixel } else { Math.Max(pixel, fitted[fitted.Count - 1]) })
        }
        horizontalEdges.Sort(HorizontalHeightOrder)
        for i in 0 ... horizontalEdges.Count {
            let first = horizontalEdges[i]
            for j in(i + 1) ... horizontalEdges.Count {
                let second = horizontalEdges[j]
                if second.Y <= first.Y
                || (first.EndX - first.StartX) * (second.EndX - second.StartX) >= 0.0F
                || MathF.Min(first.StartX, first.EndX) >= MathF.Max(second.StartX, second.EndX)
                || MathF.Min(second.StartX, second.EndX) >= MathF.Max(first.StartX, first.EndX) {
                    continue
                }
                let lower = edges.BinarySearch(first.Y)
                let upper = edges.BinarySearch(second.Y)
                if fitted[lower] == fitted[upper] && Anchor(first.Y, zone) != Anchor(second.Y, zone) {
                    let moveLower = !InZone(first.Y, zone) && (lower == 0 || fitted[lower] - 1 > fitted[lower - 1])
                    let moveUpper = !InZone(second.Y, zone) &&
                        (upper + 1 == edges.Count || fitted[upper] + 1 <= fitted[upper + 1])
                    if moveLower && (!moveUpper || (first.Y + second.Y) * 0.5F * scale <= float32(fitted[upper])) {
                        fitted[lower]--
                    } else if moveUpper {
                        fitted[upper]++
                    }
                }
                break
            }
        }
        hb_gpu_draw_clear(draw)
        let output = hb_gpu_draw_get_funcs(draw)
        var state = VulkanHarfBuzzDrawState{}
        for segment in segments {
            switch segment.Kind {
                case 0 {
                    hb_draw_move_to(output, draw, ref state, segment.X, Fit(segment.Y))
                }
                case 1 {
                    hb_draw_line_to(output, draw, ref state, segment.X, Fit(segment.Y))
                }
                case 2 {
                    hb_draw_quadratic_to(
                        output,
                        draw,
                        ref state,
                        segment.CX,
                        Fit(segment.CY),
                        segment.X,
                        Fit(segment.Y)
                    )
                }
                case 3 {
                    hb_draw_cubic_to(
                        output,
                        draw,
                        ref state,
                        segment.CX,
                        Fit(segment.CY),
                        segment.DX,
                        Fit(segment.DY),
                        segment.X,
                        Fit(segment.Y)
                    )
                }
                case 4 {
                    hb_draw_close_path(output, draw, ref state)
                }
            }
        }
        return true
    }

    private func InZone(y float32, zone float32) bool ->
    (y >= -zone && y <= 0.0F) || (xHeight > 0.0F && y >= xHeight && y <= xHeight + zone)
    || (capHeight > 0.0F && y >= capHeight && y <= capHeight + zone)

    private func Anchor(y float32, zone float32) float32 {
        if y >= -zone && y <= 0.0F {
            return 0.0F
        }
        if xHeight > 0.0F && y >= xHeight && y <= xHeight + zone {
            return xHeight
        }
        if capHeight > 0.0F && y >= capHeight && y <= capHeight + zone {
            return capHeight
        }
        return y
    }

    private func Horizontal(y float32, start float32, end float32) {
        Edge(y)
        if horizontalEdges.Count < 32768 {
            horizontalEdges.Add(VulkanTextHintHorizontalEdge{Y: y, StartX: start, EndX: end})
        } else {
            failed = true
        }
    }

    private func Fit(y float32) float32 {
        if edges.Count == 0 {
            return y
        }
        if y <= edges[0] {
            return y + float32(fitted[0]) * designUnitsPerPixel - edges[0]
        }
        let index = edges.BinarySearch(y)
        if index >= 0 {
            return float32(fitted[index]) * designUnitsPerPixel
        }
        let upper = ~index
        if upper < edges.Count {
            let weight = (y - edges[upper - 1]) / (edges[upper] - edges[upper - 1])
            return (
                float32(fitted[upper - 1]) + weight * float32(fitted[upper] - fitted[upper - 1])
            ) * designUnitsPerPixel
        }
        let last = edges.Count - 1
        return y + float32(fitted[last]) * designUnitsPerPixel - edges[last]
    }

    private func Add(
        kind int32,
        x float32,
        y float32,
        cx float32 = 0.0F,
        cy float32 = 0.0F,
        dx float32 = 0.0F,
        dy float32 = 0.0F
    ) {
        if segments.Count >= 16384 {
            failed = true
            return
        }
        segments.Add(VulkanTextHintSegment{Kind: kind, X: x, Y: y, CX: cx, CY: cy, DX: dx, DY: dy})
        currentX = x
        currentY = y
    }

    private func Edge(y float32) {
        if edges.Count < 32768 {
            edges.Add(y)
        } else {
            failed = true
        }
    }

    private func Move(callbacks nint, data nint, state nint, x float32, y float32, userData nint) {
        startX = x
        startY = y
        Add(0, x, y)
    }

    private func Line(callbacks nint, data nint, state nint, x float32, y float32, userData nint) {
        if y == currentY && x != currentX {
            Horizontal(y, currentX, x)
        }
        Add(1, x, y)
    }

    private func Quadratic(
        callbacks nint,
        data nint,
        state nint,
        cx float32,
        cy float32,
        x float32,
        y float32,
        userData nint
    ) {
        let denominator = currentY - 2.0F * cy + y
        let t = if denominator != 0.0F {
            (currentY - cy) / denominator
        } else {
            0.0F
        }
        if t > 0.0F && t < 1.0F {
            let ax = currentX + t * (cx - currentX)
            let ay = currentY + t * (cy - currentY)
            let bx = cx + t * (x - cx)
            let by = cy + t * (y - cy)
            let mx = ax + t * (bx - ax)
            let my = ay + t * (by - ay)
            AddQuadratic(ax, ay, mx, my)
            Horizontal(my, ax, bx)
            AddQuadratic(bx, by, x, y)
        } else {
            AddQuadratic(cx, cy, x, y)
        }
    }

    private func AddQuadratic(cx float32, cy float32, x float32, y float32) {
        if cy == currentY && cx != currentX {
            Horizontal(currentY, currentX, cx)
        }
        if cy == y && cx != x {
            Horizontal(y, cx, x)
        }
        Add(2, x, y, cx, cy)
    }

    private func Cubic(
        callbacks nint,
        data nint,
        state nint,
        cx float32,
        cy float32,
        dx float32,
        dy float32,
        x float32,
        y float32,
        userData nint
    ) {
        let a = -currentY + 3.0F * cy - 3.0F * dy + y
        let b = 2.0F * (currentY - 2.0F * cy + dy)
        let c = cy - currentY
        let discriminant = b * b - 4.0F * a * c
        var first = 0.0F
        var second = 0.0F
        if a == 0.0F {
            if b != 0.0F {
                first = -c / b
            }
        } else if discriminant >= 0.0F {
            let root = MathF.Sqrt(discriminant)
            first = (-b - root) / (2.0F * a)
            second = (-b + root) / (2.0F * a)
            if first > second {
                let temporary = first
                first = second
                second = temporary
            }
        }
        if first > 0.0F && first < 1.0F {
            SplitCubic(cx, cy, dx, dy, x, y, first, second)
        } else if second > 0.0F && second < 1.0F {
            SplitCubic(cx, cy, dx, dy, x, y, second, 0.0F)
        } else {
            AddCubic(cx, cy, dx, dy, x, y)
        }
    }

    private func SplitCubic(
        cx float32,
        cy float32,
        dx float32,
        dy float32,
        x float32,
        y float32,
        t float32,
        next float32
    ) {
        let ax = currentX + t * (cx - currentX)
        let ay = currentY + t * (cy - currentY)
        let bx = cx + t * (dx - cx)
        let by = cy + t * (dy - cy)
        let ex = dx + t * (x - dx)
        let ey = dy + t * (y - dy)
        let fx = ax + t * (bx - ax)
        let fy = ay + t * (by - ay)
        let gx = bx + t * (ex - bx)
        let gy = by + t * (ey - by)
        let mx = fx + t * (gx - fx)
        let my = fy + t * (gy - fy)
        AddCubic(ax, ay, fx, fy, mx, my)
        Horizontal(my, fx, gx)
        if next > t && next < 1.0F {
            SplitCubic(gx, gy, ex, ey, x, y, (next - t) / (1.0F - t), 0.0F)
        } else {
            AddCubic(gx, gy, ex, ey, x, y)
        }
    }

    private func AddCubic(cx float32, cy float32, dx float32, dy float32, x float32, y float32) {
        if cy == currentY && cx != currentX {
            Horizontal(currentY, currentX, cx)
        }
        if dy == y && dx != x {
            Horizontal(y, dx, x)
        }
        Add(3, x, y, cx, cy, dx, dy)
    }

    private func Close(callbacks nint, data nint, state nint, userData nint) {
        if currentY == startY && currentX != startX {
            Horizontal(startY, currentX, startX)
        }
        Add(4, startX, startY)
    }

    public func Dispose() {
        if funcs != nint(0) {
            hb_draw_funcs_destroy(funcs)
            funcs = nint(0)
        }
    }
}
