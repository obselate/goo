#ifndef GOO_PATH_STROKE_EVAL_SLANG
#define GOO_PATH_STROKE_EVAL_SLANG

#include "path_stroke_math.slang"
#include "path_band_eval.slang"

struct GooStrokeState
{
    float4 matrix;
    uint metrics;
    uint localMetrics;
    float metricScale;
    uint dashes;
    uint dashCount;
    uint cap;
    uint join;
    float halfWidth;
    float miterLimit;
    float trimStart;
    float trimEnd;
    float dashOffset;
    float dashTotal;
    bool measured;
};

float gooStrokeFloat(StructuredBuffer<uint> strokeBuffer, uint offset) { return asfloat(strokeBuffer[offset]); }
float gooStrokeCross(float2 a, float2 b) { return a.x * b.y - a.y * b.x; }
float2 gooStrokeHost(float2 point, GooStrokeState state) { return float2(dot(state.matrix.xy, point), dot(state.matrix.zw, point)); }

float gooStrokePrefix(StructuredBuffer<uint> pathBuffer, StructuredBuffer<uint> strokeBuffer, uint baseWord, GooStrokeState state, uint index)
{
    return state.localMetrics != 0u
        ? gooPathFloat(pathBuffer, baseWord, state.localMetrics + index * 2u) * state.metricScale
        : gooStrokeFloat(strokeBuffer, state.metrics + index * 2u);
}

float gooStrokeCurveLength(StructuredBuffer<uint> pathBuffer, StructuredBuffer<uint> strokeBuffer, uint baseWord, GooStrokeState state, uint index)
{
    return state.localMetrics != 0u
        ? gooPathFloat(pathBuffer, baseWord, state.localMetrics + index * 2u + 1u) * state.metricScale
        : gooStrokeFloat(strokeBuffer, state.metrics + index * 2u + 1u);
}

bool gooStrokeDash(StructuredBuffer<uint> strokeBuffer, GooStrokeState state, float distance, bool before, out float previous, out float next,
    out bool previousDot, out bool nextDot)
{
    previous = 0.0;
    next = 0.0;
    previousDot = false;
    nextDot = false;
    if (state.dashCount == 0u || state.dashTotal <= 0.0) return true;
    float phase = distance + state.dashOffset;
    phase -= floor(phase / state.dashTotal) * state.dashTotal;
    if (before && phase == 0.0) phase = state.dashTotal;
    float cursor = 0.0;
    for (uint index = 0u; index < state.dashCount; ++index)
    {
        float end = cursor + gooStrokeFloat(strokeBuffer, state.dashes + index);
        if (before ? phase > cursor && phase <= end : phase >= cursor && phase < end)
        {
            previous = phase - cursor;
            next = end - phase;
            if ((index & 1u) == 0u) return true;
            previousDot = gooStrokeFloat(strokeBuffer, state.dashes + (index + state.dashCount - 1u) % state.dashCount) == 0.0;
            nextDot = gooStrokeFloat(strokeBuffer, state.dashes + (index + 1u) % state.dashCount) == 0.0;
            return false;
        }
        cursor = end;
    }
    return false;
}

bool gooStrokeDashOn(StructuredBuffer<uint> strokeBuffer, GooStrokeState state, float distance, bool before)
{
    float previous, next;
    bool previousDot, nextDot;
    return gooStrokeDash(strokeBuffer, state, distance, before, previous, next, previousDot, nextDot);
}

bool gooStrokeCap(float2 center, float2 outward, GooStrokeState state)
{
    float along = dot(-center, outward);
    if (along < 0.0) return false;
    if (state.cap == 1u) return dot(center, center) <= state.halfWidth * state.halfWidth;
    return state.cap == 2u && along <= state.halfWidth
        && abs(gooStrokeCross(outward, center)) <= state.halfWidth;
}

bool gooStrokeTriangle(float2 a, float2 b, float2 c)
{
    if (abs(gooStrokeCross(b - a, c - a)) < 1e-20) return false;
    float ab = gooStrokeCross(b - a, -a);
    float bc = gooStrokeCross(c - b, -b);
    float ca = gooStrokeCross(a - c, -c);
    return (ab >= 0.0 && bc >= 0.0 && ca >= 0.0) || (ab <= 0.0 && bc <= 0.0 && ca <= 0.0);
}

bool gooStrokeJoin(float2 center, float2 before, float2 after, GooStrokeState state)
{
    float turn = gooStrokeCross(before, after);
    if (abs(turn) < 1e-7)
        return dot(before, after) < 0.0 && state.join == 1u && dot(-center, before) >= 0.0
            && dot(center, center) <= state.halfWidth * state.halfWidth;
    float2 n0 = float2(before.y, -before.x) * sign(turn);
    float2 n1 = float2(after.y, -after.x) * sign(turn);
    if (state.join == 1u)
        return dot(center, center) <= state.halfWidth * state.halfWidth
            && gooStrokeCross(n0, -center) * turn >= 0.0 && gooStrokeCross(-center, n1) * turn >= 0.0;
    float2 p0 = center + n0 * state.halfWidth;
    float2 p1 = center + n1 * state.halfWidth;
    float denominator = 1.0 + dot(n0, n1);
    if (state.join == 0u && denominator > 1e-10)
    {
        float2 miter = (n0 + n1) * state.halfWidth / denominator;
        if (length(miter) <= state.halfWidth * state.miterLimit)
            return gooStrokeTriangle(center, p0, center + miter) || gooStrokeTriangle(center, center + miter, p1);
    }
    return gooStrokeTriangle(center, p0, p1);
}

bool gooStrokeDashCap(float2 a, float2 b, float2 c, float distance, float total, bool start, bool dot,
    float lowDistance, float highDistance, GooStrokeState state)
{
    if (distance < lowDistance || distance > highDistance) return false;
    float t = strokeParameter(a, b, c, distance, total);
    float2 point = strokePoint(a, b, c, t);
    float2 tangent = strokeTangent(a, b, c, t);
    if (gooStrokeCap(point, start ? -tangent : tangent, state)) return true;
    return dot && gooStrokeCap(point, start ? tangent : -tangent, state);
}

bool gooStrokeCurveHit(StructuredBuffer<uint> pathBuffer, StructuredBuffer<uint> strokeBuffer, GooPathContext ctx, uint index, GooQuadraticCurve curve, float2 point, GooStrokeState state)
{
    uint curveWords = gooPathCurveBase(pathBuffer, ctx.baseWord) + index * PathCurveWordCount;
    uint flags = gooPathWord(pathBuffer, ctx.baseWord, curveWords + 6u);
    if ((flags & 8u) != 0u) return false;
    uint totalCurves = gooPathCurveCount(pathBuffer, ctx.baseWord);
    uint first = min(gooPathWord(pathBuffer, ctx.baseWord, curveWords + 7u), totalCurves - 1u);
    uint last = min(flags >> 4u, totalCurves - 1u);
    float prefix = 0.0, total = 0.0, contourStart = 0.0, contourEnd = 0.0;
    if (state.measured)
    {
        prefix = gooStrokePrefix(pathBuffer, strokeBuffer, ctx.baseWord, state, index);
        total = gooStrokeCurveLength(pathBuffer, strokeBuffer, ctx.baseWord, state, index);
        contourStart = gooStrokePrefix(pathBuffer, strokeBuffer, ctx.baseWord, state, first);
        contourEnd = gooStrokePrefix(pathBuffer, strokeBuffer, ctx.baseWord, state, last) + gooStrokeCurveLength(pathBuffer, strokeBuffer, ctx.baseWord, state, last);
    }
    float dashStart = max(contourStart, state.trimStart);
    float lowDistance = max(state.trimStart - prefix, 0.0);
    float highDistance = min(state.trimEnd - prefix, total);
    if (highDistance < lowDistance || (highDistance == lowDistance && total > 0.0)) return false;
    bool closed = (flags & 4u) != 0u && state.trimStart <= contourStart && state.trimEnd >= contourEnd;
    if (closed && all(curve.start == curve.control) && all(curve.start == curve.finish))
    {
        uint local = gooPathWord(pathBuffer, ctx.baseWord, 7u) + 1u;
        closed = gooPathFloat(pathBuffer, ctx.baseWord, local + first * 2u) != gooPathFloat(pathBuffer, ctx.baseWord, local + (last + 1u) * 2u);
    }
    float2 a = gooStrokeHost(curve.start - point, state);
    float2 b = gooStrokeHost(curve.control - point, state);
    float2 c = gooStrokeHost(curve.finish - point, state);
    float low = state.measured ? strokeParameter(a, b, c, lowDistance, total) : 0.0;
    float high = state.measured ? strokeParameter(a, b, c, highDistance, total) : 1.0;
    float candidates[7];
    uint normals;
    uint count = strokeParameters(a, b, c, low, high, candidates, normals);
    for (uint slot = 0u; slot < count; ++slot)
    {
        float t = candidates[slot];
        float2 position = strokePoint(a, b, c, t);
        if (!state.measured)
        {
            if ((normals & (1u << slot)) != 0u && dot(position, position) <= state.halfWidth * state.halfWidth) return true;
            continue;
        }
        float distance = strokeLength(a, b, c, t);
        float along = prefix + distance - dashStart;
        float previous, next;
        bool previousDot, nextDot;
        bool on = gooStrokeDash(strokeBuffer, state, along, false, previous, next, previousDot, nextDot);
        if (on && (normals & (1u << slot)) != 0u
            && dot(position, position) <= state.halfWidth * state.halfWidth) return true;
        if ((!on && state.cap != 0u) || state.cap == 2u)
        {
            float endDistance = distance - previous;
            float startDistance = distance + next;
            if ((endDistance > 0.0 || index == first)
                && gooStrokeDashCap(a, b, c, endDistance, total, on, previousDot,
                    lowDistance, highDistance, state)) return true;
            if ((startDistance < total || index == last)
                && gooStrokeDashCap(a, b, c, startDistance, total, !on, nextDot,
                    lowDistance, highDistance, state)) return true;
        }
    }
    float lowAlong = prefix + lowDistance - dashStart;
    float highAlong = prefix + highDistance - dashStart;
    bool lowAfter = gooStrokeDashOn(strokeBuffer, state, lowAlong, false);
    bool highBefore = gooStrokeDashOn(strokeBuffer, state, highAlong, true);
    bool startCap = lowDistance > 0.0 || (index == first && !closed)
        || (state.measured && state.trimStart == prefix && !(closed && index == first))
        || (lowAfter && !gooStrokeDashOn(strokeBuffer, state, lowAlong, true));
    bool endCap = highDistance < total || (index == last && !closed)
        || (state.measured && state.trimEnd == prefix + total && !(closed && index == last))
        || (highBefore && !gooStrokeDashOn(strokeBuffer, state, highAlong, false));
    if (startCap && lowAfter && gooStrokeCap(strokePoint(a, b, c, low), -strokeTangent(a, b, c, low), state)) return true;
    if (endCap && highBefore && gooStrokeCap(strokePoint(a, b, c, high), strokeTangent(a, b, c, high), state)) return true;
    bool closing = index == last;
    if (high != 1.0 || (closing && !closed)
        || (state.measured && !closing && state.trimEnd <= prefix + total)) return false;
    uint nextIndex = closing ? first : index + 1u;
    if (!highBefore || !gooStrokeDashOn(strokeBuffer, state, closing ? 0.0 : highAlong, false)) return false;
    GooQuadraticCurve nextCurve = gooCurveAt(pathBuffer, ctx, nextIndex);
    return gooStrokeJoin(c, strokeTangent(a, b, c, 1.0),
        strokeTangent(gooStrokeHost(nextCurve.start - point, state), gooStrokeHost(nextCurve.control - point, state),
            gooStrokeHost(nextCurve.finish - point, state), 0.0), state);
}

float gooStrokeMinimumY(GooQuadraticCurve curve)
{
    float result = min(curve.start.y, curve.finish.y);
    float denominator = curve.start.y - 2.0 * curve.control.y + curve.finish.y;
    if (abs(denominator) > 1e-20)
    {
        float t = (curve.start.y - curve.control.y) / denominator;
        if (t > 0.0 && t < 1.0) result = min(result, strokePoint(curve.start, curve.control, curve.finish, t).y);
    }
    return result;
}

float gooEvaluatePathStroke(
    StructuredBuffer<uint> pathBuffer,
    StructuredBuffer<uint> strokeBuffer,
    uint baseWord,
    uint strokeOffset,
    uint fillRule,
    float2 pathPos,
    float2 stepX,
    float2 stepY,
    float2 sampleWindow)
{
    if (!gooValidPathHeader(pathBuffer, baseWord, fillRule) || strokeOffset == 0u) return 0.0;
    GooPathContext ctx;
    ctx.baseWord = baseWord;
    ctx.fillRule = fillRule;
    ctx.origin = float2(0.0);
    ctx.extent = float2(gooPathFloat(pathBuffer, baseWord, 10u), gooPathFloat(pathBuffer, baseWord, 11u))
        - float2(gooPathFloat(pathBuffer, baseWord, 8u), gooPathFloat(pathBuffer, baseWord, 9u));
    uint style = strokeOffset - 1u;
    uint request = strokeBuffer[style];
    GooStrokeState state;
    state.matrix = float4(gooStrokeFloat(strokeBuffer, request + 4u), gooStrokeFloat(strokeBuffer, request + 5u),
        gooStrokeFloat(strokeBuffer, request + 6u), gooStrokeFloat(strokeBuffer, request + 7u));
    state.metrics = strokeBuffer[request + 2u];
    state.localMetrics = 0u;
    state.metricScale = gooStrokeFloat(strokeBuffer, request + 3u);
    state.dashes = strokeBuffer[style + 1u];
    state.dashCount = strokeBuffer[style + 2u];
    state.cap = strokeBuffer[style + 3u];
    state.halfWidth = gooStrokeFloat(strokeBuffer, style + 4u) * 0.5;
    state.miterLimit = gooStrokeFloat(strokeBuffer, style + 5u);
    state.trimStart = gooStrokeFloat(strokeBuffer, style + 6u);
    state.trimEnd = gooStrokeFloat(strokeBuffer, style + 7u);
    state.measured = state.dashCount != 0u || state.trimStart != 0.0 || state.trimEnd != 1.0;
    uint totalCurves = gooPathCurveCount(pathBuffer, baseWord);
    if (state.measured)
    {
        if (state.metricScale > 0.0)
        {
            uint local = gooPathWord(pathBuffer, baseWord, 7u);
            state.localMetrics = local + 1u;
            state.metricScale *= gooPathFloat(pathBuffer, baseWord, local);
        }
        float total = gooStrokePrefix(pathBuffer, strokeBuffer, baseWord, state, totalCurves);
        state.trimStart *= total;
        state.trimEnd *= total;
    }
    else state.trimStart = state.trimEnd = 0.0;
    state.dashOffset = gooStrokeFloat(strokeBuffer, style + 8u);
    state.dashTotal = gooStrokeFloat(strokeBuffer, style + 9u);
    state.join = strokeBuffer[style + 10u];
    uint coverage = 0u;
    uint firstBand = gooBandIndexAt(pathBuffer, ctx, pathPos.y - abs(sampleWindow.y), false, 0.0);
    uint lastBand = gooBandIndexAt(pathBuffer, ctx, pathPos.y + abs(sampleWindow.y), false, 0.0);
    for (uint bandIndex = firstBand; bandIndex <= lastBand; ++bandIndex)
    {
        GooAnalyticBand band = gooReadBand(pathBuffer, ctx, gooPathBandBase(pathBuffer, baseWord, false) + bandIndex * PathBandWordCount);
        if (band.maximum < pathPos.y - abs(sampleWindow.y)
            || band.minimum > pathPos.y + abs(sampleWindow.y)) continue;
        for (uint candidate = 0u; candidate < band.forwardCount; ++candidate)
        {
            uint index = gooPathWord(pathBuffer, baseWord, gooPathIndexBase(pathBuffer, baseWord, false) + band.forwardStart + candidate);
            if (index >= totalCurves) continue;
            GooQuadraticCurve curve = gooCurveAt(pathBuffer, ctx, index);
            if (bandIndex > firstBand
                && gooStrokeMinimumY(curve) <= gooReadBand(pathBuffer, ctx, gooPathBandBase(pathBuffer, baseWord, false) + (bandIndex - 1u) * PathBandWordCount).maximum) continue;
            float minimumX = min(min(curve.start.x, curve.control.x), curve.finish.x);
            float maximumX = max(max(curve.start.x, curve.control.x), curve.finish.x);
            if (pathPos.x < minimumX - abs(sampleWindow.x)
                || pathPos.x > maximumX + abs(sampleWindow.x)) continue;
            [loop]
            for (uint sample = 0u; sample < 8u; ++sample)
            {
                if ((coverage & (1u << sample)) != 0u) continue;
                float x = (float(sample & 3u) + 0.5) * 0.25 - 0.5;
                float y = (float(sample >> 2u) + 0.5) * 0.5 - 0.5;
                if (gooStrokeCurveHit(pathBuffer, strokeBuffer, ctx, index, curve, pathPos + stepX * x + stepY * y, state)) coverage |= 1u << sample;
            }
            if (coverage == 255u) return 1.0;
        }
    }
    return float(countbits(coverage)) * 0.125;
}

#endif
