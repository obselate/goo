#include "path_stroke_math.slang"
#ifdef GOO_CLIP_MASK
[[vk::binding(0, 1)]] StructuredBuffer<uint> strokeDataBuffer;
#else
[[vk::binding(0, 2)]] StructuredBuffer<uint> strokeDataBuffer;
#endif

struct StrokeState
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

float strokeFloat(uint offset) { return asfloat(strokeDataBuffer[offset]); }
float strokeCross(float2 a, float2 b) { return a.x * b.y - a.y * b.x; }
float2 strokeHost(float2 point, StrokeState state) { return float2(dot(state.matrix.xy, point), dot(state.matrix.zw, point)); }
float strokePrefix(StrokeState state, uint index)
{
    return state.localMetrics != 0u
        ? wordFloat(state.localMetrics + index * 2u) * state.metricScale
        : strokeFloat(state.metrics + index * 2u);
}

float strokeCurveLength(StrokeState state, uint index)
{
    return state.localMetrics != 0u
        ? wordFloat(state.localMetrics + index * 2u + 1u) * state.metricScale
        : strokeFloat(state.metrics + index * 2u + 1u);
}

bool strokeDash(StrokeState state, float distance, bool before, out float previous, out float next,
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
        float end = cursor + strokeFloat(state.dashes + index);
        if (before ? phase > cursor && phase <= end : phase >= cursor && phase < end)
        {
            previous = phase - cursor;
            next = end - phase;
            if ((index & 1u) == 0u) return true;
            previousDot = strokeFloat(state.dashes + (index + state.dashCount - 1u) % state.dashCount) == 0.0;
            nextDot = strokeFloat(state.dashes + (index + 1u) % state.dashCount) == 0.0;
            return false;
        }
        cursor = end;
    }
    return false;
}

bool strokeDashOn(StrokeState state, float distance, bool before)
{
    float previous, next;
    bool previousDot, nextDot;
    return strokeDash(state, distance, before, previous, next, previousDot, nextDot);
}

bool strokeCap(float2 center, float2 outward, StrokeState state)
{
    float along = dot(-center, outward);
    if (along < 0.0) return false;
    if (state.cap == 1u) return dot(center, center) <= state.halfWidth * state.halfWidth;
    return state.cap == 2u && along <= state.halfWidth
        && abs(strokeCross(outward, center)) <= state.halfWidth;
}

bool strokeTriangle(float2 a, float2 b, float2 c)
{
    if (abs(strokeCross(b - a, c - a)) < 1e-20) return false;
    float ab = strokeCross(b - a, -a);
    float bc = strokeCross(c - b, -b);
    float ca = strokeCross(a - c, -c);
    return (ab >= 0.0 && bc >= 0.0 && ca >= 0.0) || (ab <= 0.0 && bc <= 0.0 && ca <= 0.0);
}

bool strokeJoin(float2 center, float2 before, float2 after, StrokeState state)
{
    float turn = strokeCross(before, after);
    if (abs(turn) < 1e-7)
        return dot(before, after) < 0.0 && state.join == 1u && dot(-center, before) >= 0.0
            && dot(center, center) <= state.halfWidth * state.halfWidth;
    float2 n0 = float2(before.y, -before.x) * sign(turn);
    float2 n1 = float2(after.y, -after.x) * sign(turn);
    if (state.join == 1u)
        return dot(center, center) <= state.halfWidth * state.halfWidth
            && strokeCross(n0, -center) * turn >= 0.0 && strokeCross(-center, n1) * turn >= 0.0;
    float2 p0 = center + n0 * state.halfWidth;
    float2 p1 = center + n1 * state.halfWidth;
    float denominator = 1.0 + dot(n0, n1);
    if (state.join == 0u && denominator > 1e-10)
    {
        float2 miter = (n0 + n1) * state.halfWidth / denominator;
        if (length(miter) <= state.halfWidth * state.miterLimit)
            return strokeTriangle(center, p0, center + miter) || strokeTriangle(center, center + miter, p1);
    }
    return strokeTriangle(center, p0, p1);
}

bool strokeDashCap(float2 a, float2 b, float2 c, float distance, float total, bool start, bool dot,
    float lowDistance, float highDistance, StrokeState state)
{
    if (distance < lowDistance || distance > highDistance) return false;
    float t = strokeParameter(a, b, c, distance, total);
    float2 point = strokePoint(a, b, c, t);
    float2 tangent = strokeTangent(a, b, c, t);
    if (strokeCap(point, start ? -tangent : tangent, state)) return true;
    return dot && strokeCap(point, start ? tangent : -tangent, state);
}

bool strokeCurveHit(uint index, QuadraticCurve curve, float2 point, StrokeState state)
{
    uint flags = pathWord(curveBase() + index * CurveWordCount + 6u);
    if ((flags & 8u) != 0u) return false;
    uint first = min(pathWord(curveBase() + index * CurveWordCount + 7u), curveCount() - 1u);
    uint last = min(flags >> 4u, curveCount() - 1u);
    float prefix = 0.0, total = 0.0, contourStart = 0.0, contourEnd = 0.0;
    if (state.measured)
    {
        prefix = strokePrefix(state, index);
        total = strokeCurveLength(state, index);
        contourStart = strokePrefix(state, first);
        contourEnd = strokePrefix(state, last) + strokeCurveLength(state, last);
    }
    float dashStart = max(contourStart, state.trimStart);
    float lowDistance = max(state.trimStart - prefix, 0.0);
    float highDistance = min(state.trimEnd - prefix, total);
    if (highDistance < lowDistance || (highDistance == lowDistance && total > 0.0)) return false;
    bool closed = (flags & 4u) != 0u && state.trimStart <= contourStart && state.trimEnd >= contourEnd;
    if (closed && all(curve.start == curve.control) && all(curve.start == curve.finish))
    {
        uint local = pathWord(7u) + 1u;
        closed = wordFloat(local + first * 2u) != wordFloat(local + (last + 1u) * 2u);
    }
    float2 a = strokeHost(curve.start - point, state);
    float2 b = strokeHost(curve.control - point, state);
    float2 c = strokeHost(curve.finish - point, state);
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
        bool on = strokeDash(state, along, false, previous, next, previousDot, nextDot);
        if (on && (normals & (1u << slot)) != 0u
            && dot(position, position) <= state.halfWidth * state.halfWidth) return true;
        if ((!on && state.cap != 0u) || state.cap == 2u)
        {
            float endDistance = distance - previous;
            float startDistance = distance + next;
            if ((endDistance > 0.0 || index == first)
                && strokeDashCap(a, b, c, endDistance, total, on, previousDot,
                    lowDistance, highDistance, state)) return true;
            if ((startDistance < total || index == last)
                && strokeDashCap(a, b, c, startDistance, total, !on, nextDot,
                    lowDistance, highDistance, state)) return true;
        }
    }
    float lowAlong = prefix + lowDistance - dashStart;
    float highAlong = prefix + highDistance - dashStart;
    bool lowAfter = strokeDashOn(state, lowAlong, false);
    bool highBefore = strokeDashOn(state, highAlong, true);
    bool startCap = lowDistance > 0.0 || (index == first && !closed)
        || (state.measured && state.trimStart == prefix && !(closed && index == first))
        || (lowAfter && !strokeDashOn(state, lowAlong, true));
    bool endCap = highDistance < total || (index == last && !closed)
        || (state.measured && state.trimEnd == prefix + total && !(closed && index == last))
        || (highBefore && !strokeDashOn(state, highAlong, false));
    if (startCap && lowAfter && strokeCap(strokePoint(a, b, c, low), -strokeTangent(a, b, c, low), state)) return true;
    if (endCap && highBefore && strokeCap(strokePoint(a, b, c, high), strokeTangent(a, b, c, high), state)) return true;
    bool closing = index == last;
    if (high != 1.0 || (closing && !closed)
        || (state.measured && !closing && state.trimEnd <= prefix + total)) return false;
    uint nextIndex = closing ? first : index + 1u;
    if (!highBefore || !strokeDashOn(state, closing ? 0.0 : highAlong, false)) return false;
    QuadraticCurve nextCurve = curveAt(nextIndex);
    return strokeJoin(c, strokeTangent(a, b, c, 1.0),
        strokeTangent(strokeHost(nextCurve.start - point, state), strokeHost(nextCurve.control - point, state),
            strokeHost(nextCurve.finish - point, state), 0.0), state);
}

float strokeMinimumY(QuadraticCurve curve)
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

float strokeCoverage()
{
    uint style = pc.params.w - 1u;
    uint request = strokeDataBuffer[style];
    StrokeState state;
    state.matrix = float4(strokeFloat(request + 4u), strokeFloat(request + 5u),
        strokeFloat(request + 6u), strokeFloat(request + 7u));
    state.metrics = strokeDataBuffer[request + 2u];
    state.localMetrics = 0u;
    state.metricScale = strokeFloat(request + 3u);
    state.dashes = strokeDataBuffer[style + 1u];
    state.dashCount = strokeDataBuffer[style + 2u];
    state.cap = strokeDataBuffer[style + 3u];
    state.halfWidth = strokeFloat(style + 4u) * 0.5;
    state.miterLimit = strokeFloat(style + 5u);
    state.trimStart = strokeFloat(style + 6u);
    state.trimEnd = strokeFloat(style + 7u);
    state.measured = state.dashCount != 0u || state.trimStart != 0.0 || state.trimEnd != 1.0;
    if (state.measured)
    {
        if (state.metricScale > 0.0)
        {
            uint local = pathWord(7u);
            state.localMetrics = local + 1u;
            state.metricScale *= wordFloat(local);
        }
        float total = strokePrefix(state, curveCount());
        state.trimStart *= total;
        state.trimEnd *= total;
    }
    else state.trimStart = state.trimEnd = 0.0;
    state.dashOffset = strokeFloat(style + 8u);
    state.dashTotal = strokeFloat(style + 9u);
    state.join = strokeDataBuffer[style + 10u];
    float2 stepX = ddx(pathPosition);
    float2 stepY = ddy(pathPosition);
    uint coverage = 0u;
    uint firstBand = horizontalBandIndexAt(pathPosition.y - abs(pc.sampleStep.w));
    uint lastBand = horizontalBandIndexAt(pathPosition.y + abs(pc.sampleStep.w));
    for (uint bandIndex = firstBand; bandIndex <= lastBand; ++bandIndex)
    {
        AnalyticBand band = readBand(horizontalBandBase() + bandIndex * BandWordCount);
        if (band.maximum < pathPosition.y - abs(pc.sampleStep.w)
            || band.minimum > pathPosition.y + abs(pc.sampleStep.w)) continue;
        for (uint candidate = 0u; candidate < band.forwardCount; ++candidate)
        {
            uint index = pathWord(horizontalIndexBase() + band.forwardStart + candidate);
            if (index >= curveCount()) continue;
            QuadraticCurve curve = curveAt(index);
            if (bandIndex > firstBand
                && strokeMinimumY(curve) <= readBand(horizontalBandBase() + (bandIndex - 1u) * BandWordCount).maximum) continue;
            float minimumX = min(min(curve.start.x, curve.control.x), curve.finish.x);
            float maximumX = max(max(curve.start.x, curve.control.x), curve.finish.x);
            if (pathPosition.x < minimumX - abs(pc.sampleStep.z)
                || pathPosition.x > maximumX + abs(pc.sampleStep.z)) continue;
            for (uint sample = 0u; sample < 8u; ++sample)
            {
                if ((coverage & (1u << sample)) != 0u) continue;
                float x = (float(sample & 3u) + 0.5) * 0.25 - 0.5;
                float y = (float(sample >> 2u) + 0.5) * 0.5 - 0.5;
                if (strokeCurveHit(index, curve, pathPosition + stepX * x + stepY * y, state)) coverage |= 1u << sample;
            }
            if (coverage == 255u) return 1.0;
        }
    }
    return float(countbits(coverage)) * 0.125;
}
