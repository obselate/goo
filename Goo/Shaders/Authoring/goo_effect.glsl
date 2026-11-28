#ifndef GOO_EFFECT_GLSL
#define GOO_EFFECT_GLSL

struct GooPrimitiveRecord
{
    vec4 rect;
    vec4 transform0;
    vec4 transform1;
    vec4 radii;
    vec4 params;
    vec4 stopPositions;
    uvec4 packedColors;
    uvec4 packedColorsExtra;
};

#ifndef GOO_SOURCE_INDEPENDENT
layout(set = 0, binding = 0) uniform sampler2D gooSourceTexture;
layout(set = 1, binding = 0) uniform sampler2D gooBackdropTexture;
#endif

layout(set = 2, binding = 0, std430) readonly buffer GooPrimitiveBuffer
{
    GooPrimitiveRecord records[];
} gooPrimitiveBuffer;

layout(set = 3, binding = 0, std430) readonly buffer GooScissorBuffer
{
    uint words[];
} gooScissorBuffer;

layout(set = 3, binding = 1, std430) readonly buffer GooClipPathBuffer
{
    uint words[];
} gooClipPathBuffer;

layout(set = 4, binding = 0, std430) readonly buffer GooEffectDataBuffer
{
    uint words[];
} gooEffectDataBuffer;

layout(push_constant) uniform GooEffectParameters
{
    vec4 values[8];
} gooParameters;

layout(location = 0) in vec2 gooUv;
layout(location = 2) flat in uint gooClipDrawOrdinal;
layout(location = 3) flat in uint gooPrimitiveRecordOrdinal;
layout(location = 0) out vec4 gooOutputColor;

const uint GooScissorMaxDepth = 10u;
const uint GooScissorChainWords = 16u;
const uint GooScissorRecordWords = 24u;
const uint GooScissorKindZero = 0u;
const uint GooScissorKindRoundedBox = 1u;
const uint GooEffectDataSlotCount = 4u;
GooPrimitiveRecord gooActivePrimitive;

GooPrimitiveRecord gooPrimitive()
{
    return gooActivePrimitive;
}

vec4 gooParameter(uint slot)
{
    return gooParameters.values[min(slot, 7u)];
}

float gooElapsedSeconds()
{
    return gooActivePrimitive.stopPositions.x;
}

uint gooDataByteLength(uint slot)
{
    if (slot >= GooEffectDataSlotCount)
    {
        return 0u;
    }
    uint baseWord = gooActivePrimitive.packedColorsExtra.w;
    return gooEffectDataBuffer.words[baseWord + slot * 2u + 1u];
}

uint gooDataWord(uint slot, uint wordIndex)
{
    uint byteLength = gooDataByteLength(slot);
    if (wordIndex >= (byteLength + 3u) / 4u)
    {
        return 0u;
    }
    uint baseWord = gooActivePrimitive.packedColorsExtra.w;
    uint relativeWord = gooEffectDataBuffer.words[baseWord + slot * 2u];
    return gooEffectDataBuffer.words[baseWord + relativeWord + wordIndex];
}

vec4 gooEffectNormalizeRadii(vec2 size, vec4 source)
{
    vec4 result = max(source, vec4(0.0));
    float scale = 1.0;
    float sum = result.x + result.y;
    if (sum > size.x && sum > 0.0) scale = min(scale, size.x / sum);
    sum = result.w + result.z;
    if (sum > size.x && sum > 0.0) scale = min(scale, size.x / sum);
    sum = result.x + result.w;
    if (sum > size.y && sum > 0.0) scale = min(scale, size.y / sum);
    sum = result.y + result.z;
    if (sum > size.y && sum > 0.0) scale = min(scale, size.y / sum);
    return result * scale;
}

float gooEffectCornerCut(vec2 offset, float radius, vec2 extent)
{
    vec2 low = clamp(offset + radius - extent, 0.0, radius);
    vec2 high = clamp(offset + radius + extent, 0.0, radius);
    if (any(lessThanEqual(high, low))) return 0.0;
    float first = clamp(sqrt((radius - high.y) * (radius + high.y)), low.x, high.x);
    float second = clamp(sqrt((radius - low.y) * (radius + low.y)), low.x, high.x);
    float firstHeight = sqrt((radius - first) * (radius + first));
    float secondHeight = sqrt((radius - second) * (radius + second));
    float angle = 2.0 * asin(min(length(vec2(second - first, firstHeight - secondHeight)) / max(2.0 * radius, 0.000001), 1.0));
    float angleSquared = angle * angle;
    float segment = radius * radius * angle * angleSquared / 12.0 * (1.0 - angleSquared / 20.0 + angleSquared * angleSquared / 840.0);
    float inside = (high.y - low.y) * (first - low.x) + (second - first) * ((firstHeight + secondHeight) * 0.5 - low.y) + segment;
    return (high.x - low.x) * (high.y - low.y) - inside;
}

float gooEffectTransformedEdgeCoverage(vec2 point, vec2 size, vec4 cornerRadii, vec2 pointDx, vec2 pointDy)
{
    vec2 centered = point - size * 0.5;
    float radius = centered.x < 0.0
        ? (centered.y < 0.0 ? cornerRadii.x : cornerRadii.w)
        : (centered.y < 0.0 ? cornerRadii.y : cornerRadii.z);
    vec2 q = abs(centered) - size * 0.5 + radius;
    vec2 normal = max(q, vec2(0.0));
    normal = dot(normal, normal) > 0.0
        ? normalize(normal)
        : (q.x > q.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
    normal *= vec2(centered.x < 0.0 ? -1.0 : 1.0, centered.y < 0.0 ? -1.0 : 1.0);
    vec2 gradient = abs(vec2(dot(normal, pointDx), dot(normal, pointDy)));
    float width = length(gradient);
    float distance = radius - length(max(q, vec2(0.0))) - min(max(q.x, q.y), 0.0);
    if (width < 0.0001) return distance >= 0.0 ? 1.0 : 0.0;
    vec2 span = vec2(max(gradient.x, gradient.y), max(min(gradient.x, gradient.y), 0.000001 * width)) / width;
    float offset = distance / width;
    float tail = max((span.x + span.y) * 0.5 - abs(offset), 0.0);
    tail = tail * tail / (2.0 * span.x * span.y);
    return abs(offset) <= (span.x - span.y) * 0.5 ? 0.5 + offset / span.x : (offset > 0.0 ? 1.0 - tail : tail);
}

float gooEffectRoundedRectCoverage(vec2 point, vec2 size, vec4 cornerRadii, vec2 pointDx, vec2 pointDy)
{
    if (abs(pointDx.y) + abs(pointDy.x) > 0.0001 * (abs(pointDx.x) + abs(pointDy.y)))
    {
        return gooEffectTransformedEdgeCoverage(point, size, cornerRadii, pointDx, pointDy);
    }
    vec2 extent = max(0.5 * vec2(length(vec2(pointDx.x, pointDy.x)), length(vec2(pointDx.y, pointDy.y))), vec2(0.0001));
    vec2 centered = point - size * 0.5;
    vec2 overlap = min(clamp(0.5 + (size * 0.5 - abs(centered)) / (2.0 * extent), 0.0, 1.0), size / (2.0 * extent));
    float cut = gooEffectCornerCut(-centered - size * 0.5, cornerRadii.x, extent)
        + gooEffectCornerCut(vec2(centered.x, -centered.y) - size * 0.5, cornerRadii.y, extent)
        + gooEffectCornerCut(centered - size * 0.5, cornerRadii.z, extent)
        + gooEffectCornerCut(vec2(-centered.x, centered.y) - size * 0.5, cornerRadii.w, extent);
    return clamp(overlap.x * overlap.y - cut / (4.0 * extent.x * extent.y), 0.0, 1.0);
}

uint gooClipPathWord(uint baseWord, uint relativeWord) { return gooClipPathBuffer.words[baseWord + relativeWord]; }
float gooClipPathFloat(uint baseWord, uint index) { return uintBitsToFloat(gooClipPathWord(baseWord, index)); }

struct GooClipBand
{
    float minimum;
    float maximum;
    float split;
    uint forwardStart;
    uint forwardCount;
    uint reverseStart;
    uint reverseCount;
};

struct GooClipCurve
{
    vec2 start;
    vec2 control;
    vec2 finish;
};

GooClipBand gooClipReadBand(uint baseWord, uint bandBase, vec2 origin, bool vertical)
{
    float o = vertical ? origin.x : origin.y;
    float ro = vertical ? origin.y : origin.x;
    GooClipBand r;
    r.minimum = gooClipPathFloat(baseWord, bandBase) - o;
    r.maximum = gooClipPathFloat(baseWord, bandBase + 1u) - o;
    r.split = gooClipPathFloat(baseWord, bandBase + 2u) - ro;
    r.forwardStart = gooClipPathWord(baseWord, bandBase + 3u);
    r.forwardCount = gooClipPathWord(baseWord, bandBase + 4u);
    r.reverseStart = gooClipPathWord(baseWord, bandBase + 5u);
    r.reverseCount = gooClipPathWord(baseWord, bandBase + 6u);
    return r;
}

GooClipCurve gooClipReadCurve(uint baseWord, uint curveBase, uint index, vec2 origin)
{
    uint b = curveBase + index * 8u;
    GooClipCurve c;
    c.start = vec2(gooClipPathFloat(baseWord, b), gooClipPathFloat(baseWord, b + 1u)) - origin;
    c.control = vec2(gooClipPathFloat(baseWord, b + 2u), gooClipPathFloat(baseWord, b + 3u)) - origin;
    c.finish = vec2(gooClipPathFloat(baseWord, b + 4u), gooClipPathFloat(baseWord, b + 5u)) - origin;
    return c;
}

float gooClipCurveCoord(GooClipCurve c, float t, bool vertical)
{
    float it = 1.0 - t;
    float s = vertical ? c.start.y : c.start.x;
    float m = vertical ? c.control.y : c.control.x;
    float f = vertical ? c.finish.y : c.finish.x;
    return it * it * s + 2.0 * it * t * m + t * t * f;
}

float gooClipCurveDeriv(GooClipCurve c, float t, bool vertical)
{
    float s = vertical ? c.start.x : c.start.y;
    float m = vertical ? c.control.x : c.control.y;
    float f = vertical ? c.finish.x : c.finish.y;
    return 2.0 * ((1.0 - t) * (m - s) + t * (f - m));
}

uint gooClipRootCode(float first, float second, float third)
{
    uint s0 = floatBitsToUint(first) >> 31u;
    uint s1 = floatBitsToUint(second) >> 30u;
    uint s2 = floatBitsToUint(third) >> 29u;
    uint sh = (s1 & 2u) | (s0 & ~2u);
    sh = (s2 & 4u) | (sh & ~4u);
    return (0x2e74u >> sh) & 0x0101u;
}

float gooClipEvaluatePath(uint baseWord, uint fillRule, vec2 pathPos, vec2 pixelsPerPath)
{
    uint reqRule = fillRule == 1u ? 2u : 1u;
    if (gooClipPathWord(baseWord, 0u) != 1u || (gooClipPathWord(baseWord, 1u) & reqRule) == 0u) return 0.0;
    uint hBands = gooClipPathWord(baseWord, 2u);
    uint vBands = gooClipPathWord(baseWord, 3u);
    uint hIdxs = gooClipPathWord(baseWord, 4u);
    uint vIdxs = gooClipPathWord(baseWord, 5u);
    uint totalCurves = gooClipPathWord(baseWord, 6u);
    if (hBands == 0u || vBands == 0u || totalCurves == 0u) return 0.0;

    vec2 origin = vec2(gooClipPathFloat(baseWord, 8u), gooClipPathFloat(baseWord, 9u));
    vec2 extent = vec2(gooClipPathFloat(baseWord, 10u), gooClipPathFloat(baseWord, 11u)) - origin;
    vec2 pt = pathPos - origin;
    vec2 pix = max(pixelsPerPath, vec2(0.0000152587890625));
    vec2 margin = 1.0 / pix;
    if (pt.x < -margin.x || pt.y < -margin.y
        || pt.x > extent.x + margin.x || pt.y > extent.y + margin.y) return 0.0;
    uint hBandBase = 12u;
    uint vBandBase = hBandBase + hBands * 8u;
    uint hIdxBase = vBandBase + vBands * 8u;
    uint vIdxBase = hIdxBase + hIdxs;
    uint curveBase = vIdxBase + vIdxs;

    float axisVal[2];
    float axisWeight[2];
    for (int axis = 0; axis < 2; axis++)
    {
        bool vertical = axis == 1;
        uint bCount = vertical ? vBands : hBands;
        uint bBase = vertical ? vBandBase : hBandBase;
        uint idxBase = vertical ? vIdxBase : hIdxBase;
        float solveCoord = vertical ? pt.x : pt.y;
        uint low = 0u, high = bCount;
        while (low < high)
        {
            uint mid = low + (high - low) / 2u;
            float mx = gooClipPathFloat(baseWord, bBase + mid * 8u + 1u) - (vertical ? origin.x : origin.y);
            if (mx >= solveCoord) high = mid;
            else low = mid + 1u;
        }
        uint bi = low < bCount ? low : bCount - 1u;
        GooClipBand band = gooClipReadBand(baseWord, bBase + bi * 8u, origin, vertical);
        float rayPix = vertical ? pix.y : pix.x;
        float rayCoord = vertical ? pt.y : pt.x;
        bool forward = rayCoord < band.split;
        uint start = fillRule == 1u ? band.forwardStart : (forward ? band.forwardStart : band.reverseStart);
        uint count = fillRule == 1u ? band.forwardCount : (forward ? band.forwardCount : band.reverseCount);
        float val = 0.0, wt = 0.0, oppVal = 0.0, oppWt = 0.0;
        if (fillRule != 1u)
        {
            for (uint i = 0u; i < count; i++)
            {
                uint ci = gooClipPathWord(baseWord, idxBase + start + i);
                if (ci >= totalCurves) continue;
                GooClipCurve c = gooClipReadCurve(baseWord, curveBase, ci, origin);
                float c0 = (vertical ? c.start.x : c.start.y) - solveCoord;
                float c1 = (vertical ? c.control.x : c.control.y) - solveCoord;
                float c2 = (vertical ? c.finish.x : c.finish.y) - solveCoord;
                uint rc = gooClipRootCode(c0, c1, c2);
                if (rc == 0u) continue;
                float a = c0 - c1 * 2.0 + c2;
                float b = c0 - c1;
                float ct = max(0.0000001, max(max(abs(c0), abs(2.0 * b)), abs(a)) * 0.000001);
                float roots[2];
                roots[0] = -1.0; roots[1] = -1.0;
                if (abs(a) > ct)
                {
                    float disc = b * b - a * c0;
                    if (disc < 0.0) { rc = 0u; }
                    else
                    {
                        float sq = sqrt(disc);
                        float q = b + (b < 0.0 ? -sq : sq);
                        float nr = q == 0.0 ? 0.0 : c0 / q;
                        float fr = q / a;
                        roots[0] = b < 0.0 ? fr : nr;
                        roots[1] = b < 0.0 ? nr : fr;
                    }
                }
                else if (abs(b) > ct) { roots[0] = roots[1] = 0.5 * c0 / b; }
                else rc = 0u;
                float dTol = max(0.0000001, max(
                    vertical ? abs(c.control.x - c.start.x) : abs(c.control.y - c.start.y),
                    vertical ? abs(c.finish.x - c.control.x) : abs(c.finish.y - c.control.y)) * 0.000001);
                for (uint s = 0u; s < 2u; s++)
                {
                    if ((rc & (1u << (s * 8u))) == 0u) continue;
                    float r = roots[s];
                    if (isnan(r) || isinf(r)) continue;
                    float param = clamp(r, 0.0, 1.0);
                    float dir = gooClipCurveDeriv(c, param, vertical);
                    if (abs(dir) <= dTol && param >= 1.0) dir = gooClipCurveDeriv(c, max(0.0, 0.9999), vertical);
                    if (abs(dir) <= dTol) continue;
                    float rcCurve = gooClipCurveCoord(c, param, vertical) - rayCoord;
                    float dist = (forward ? rcCurve : -rcCurve) * rayPix;
                    float rSign = (vertical ? dir < 0.0 : dir > 0.0) ? 1.0 : -1.0;
                    float rw = clamp(1.0 - abs(dist) * 2.0, 0.0, 1.0);
                    if (dist >= -0.5) { val += rSign * clamp(dist + 0.5, 0.0, 1.0); wt = max(wt, rw); }
                    if (-dist >= -0.5) { oppVal += rSign * clamp(-dist + 0.5, 0.0, 1.0); oppWt = max(oppWt, rw); }
                }
            }
            vec2 pri = vec2(forward ? val : -val, wt);
            vec2 opp = vec2(forward ? -oppVal : oppVal, oppWt);
            if (opp.y > pri.y || (opp.y == pri.y && abs(opp.x) > abs(pri.x)))
            {
                axisVal[axis] = opp.x; axisWeight[axis] = max(pri.y, opp.y);
            }
            else
            {
                axisVal[axis] = pri.x; axisWeight[axis] = max(pri.y, opp.y);
            }
        }
        else
        {
            uint parity[2] = uint[2](0u, 0u);
            uint nearCount[2] = uint[2](0u, 0u);
            float sideWt[2] = float[2](0.0, 0.0);
            float nearDist[64];
            for (uint z = 0u; z < 64u; z++) nearDist[z] = 0.0;
            for (uint i = 0u; i < count; i++)
            {
                uint ci = gooClipPathWord(baseWord, idxBase + start + i);
                if (ci >= totalCurves) continue;
                GooClipCurve c = gooClipReadCurve(baseWord, curveBase, ci, origin);
                float c0 = (vertical ? c.start.x : c.start.y) - solveCoord;
                float c1 = (vertical ? c.control.x : c.control.y) - solveCoord;
                float c2 = (vertical ? c.finish.x : c.finish.y) - solveCoord;
                uint rc = gooClipRootCode(c0, c1, c2);
                if (rc == 0u) continue;
                float a = c0 - c1 * 2.0 + c2;
                float b = c0 - c1;
                float ct = max(0.0000001, max(max(abs(c0), abs(2.0 * b)), abs(a)) * 0.000001);
                float roots[2];
                roots[0] = -1.0; roots[1] = -1.0;
                if (abs(a) > ct)
                {
                    float disc = b * b - a * c0;
                    if (disc < 0.0) { rc = 0u; }
                    else
                    {
                        float sq = sqrt(disc);
                        float q = b + (b < 0.0 ? -sq : sq);
                        float nr = q == 0.0 ? 0.0 : c0 / q;
                        float fr = q / a;
                        roots[0] = b < 0.0 ? fr : nr;
                        roots[1] = b < 0.0 ? nr : fr;
                    }
                }
                else if (abs(b) > ct) { roots[0] = roots[1] = 0.5 * c0 / b; }
                else rc = 0u;
                float dTol = max(0.0000001, max(
                    vertical ? abs(c.control.x - c.start.x) : abs(c.control.y - c.start.y),
                    vertical ? abs(c.finish.x - c.control.x) : abs(c.finish.y - c.control.y)) * 0.000001);
                for (uint s = 0u; s < 2u; s++)
                {
                    if ((rc & (1u << (s * 8u))) == 0u) continue;
                    float r = roots[s];
                    if (isnan(r) || isinf(r)) continue;
                    float param = clamp(r, 0.0, 1.0);
                    float dir = gooClipCurveDeriv(c, param, vertical);
                    if (abs(dir) <= dTol && param >= 1.0) dir = gooClipCurveDeriv(c, max(0.0, 0.9999), vertical);
                    if (abs(dir) <= dTol) continue;
                    float rcCurve = gooClipCurveCoord(c, param, vertical) - rayCoord;
                    for (uint side = 0u; side < 2u; side++)
                    {
                        float dist = (side == 0u ? rcCurve : -rcCurve) * rayPix;
                        if (dist < -0.5 || isnan(dist) || isinf(dist)) continue;
                        sideWt[side] = max(sideWt[side], clamp(1.0 - abs(dist) * 2.0, 0.0, 1.0));
                        parity[side] ^= 1u;
                        uint nc = nearCount[side];
                        if (dist < 0.5 && nc < 32u)
                        {
                            uint db = side * 32u;
                            uint ins = nc;
                            for (uint e = 0u; e < nc; e++) { if (dist < nearDist[db + e]) { ins = e; break; } }
                            for (uint mv = nc; mv > ins; mv--) nearDist[db + mv] = nearDist[db + mv - 1u];
                            nearDist[db + ins] = dist;
                            nearCount[side] = nc + 1u;
                        }
                    }
                }
            }
            float sideVal[2] = float[2](0.0, 0.0);
            for (uint side = 0u; side < 2u; side++)
            {
                uint db = side * 32u;
                uint nc = nearCount[side];
                float sv = 0.0;
                for (uint i = 0u; i < nc; i++)
                {
                    float amt = clamp(nearDist[db + i] + 0.5, 0.0, 1.0);
                    sv += (i & 1u) == 0u ? amt : -amt;
                }
                if ((parity[side] ^ (nc & 1u)) != 0u) sv += (nc & 1u) == 0u ? 1.0 : -1.0;
                sideVal[side] = side == 0u ? sv : -sv;
            }
            vec2 pri = vec2(forward ? sideVal[0] : sideVal[1], forward ? sideWt[0] : sideWt[1]);
            vec2 opp = vec2(forward ? sideVal[1] : sideVal[0], forward ? sideWt[1] : sideWt[0]);
            if (opp.y > pri.y || (opp.y == pri.y && abs(opp.x) > abs(pri.x)))
            {
                axisVal[axis] = opp.x; axisWeight[axis] = max(pri.y, opp.y);
            }
            else
            {
                axisVal[axis] = pri.x; axisWeight[axis] = max(pri.y, opp.y);
            }
        }
    }
    float weighted = abs(axisVal[0] * axisWeight[0] + axisVal[1] * axisWeight[1])
        / max(axisWeight[0] + axisWeight[1], 1.0 / 65536.0);
    return clamp(max(weighted, min(abs(axisVal[0]), abs(axisVal[1]))), 0.0, 1.0);
}

float gooClipCoverage()
{
    uint recordCount = gooScissorBuffer.words[2u];
    if (recordCount == 0u || gooClipDrawOrdinal == 0u)
    {
        return 1.0;
    }
    uint chainCount = gooScissorBuffer.words[0u];
    uint chainTableBase = gooScissorBuffer.words[1u];
    uint recordTableBase = gooScissorBuffer.words[3u];
    if (gooClipDrawOrdinal >= chainCount)
    {
        return 0.0;
    }
    uint chainBase = chainTableBase + gooClipDrawOrdinal * GooScissorChainWords;
    if (gooScissorBuffer.words[chainBase + 11u] == 2u)
    {
        return 0.0;
    }
    uint depth = min(gooScissorBuffer.words[chainBase], GooScissorMaxDepth);
    if (depth == 0u)
    {
        return 1.0;
    }
    vec2 layerScale = vec2(
        uintBitsToFloat(gooScissorBuffer.words[chainBase + 12u]),
        uintBitsToFloat(gooScissorBuffer.words[chainBase + 13u]));
    vec2 layerOrigin = vec2(
        uintBitsToFloat(gooScissorBuffer.words[chainBase + 14u]),
        uintBitsToFloat(gooScissorBuffer.words[chainBase + 15u]));
    vec2 screen = gl_FragCoord.xy * layerScale + layerOrigin;
    vec3 screenH = vec3(screen, 1.0);
    float coverage = 1.0;
    for (uint index = 0u; index < depth; index++)
    {
        uint recordIndex = gooScissorBuffer.words[chainBase + 1u + index];
        if (recordIndex >= recordCount) return 0.0;
        uint entryBase = recordTableBase + recordIndex * GooScissorRecordWords;
        uint kind = gooScissorBuffer.words[entryBase + 20u];
        if (kind == GooScissorKindZero) return 0.0;
        vec4 screenBounds = vec4(
            uintBitsToFloat(gooScissorBuffer.words[entryBase + 0u]),
            uintBitsToFloat(gooScissorBuffer.words[entryBase + 1u]),
            uintBitsToFloat(gooScissorBuffer.words[entryBase + 2u]),
            uintBitsToFloat(gooScissorBuffer.words[entryBase + 3u]));
        if (screen.x < screenBounds.x || screen.y < screenBounds.y
            || screen.x >= screenBounds.z || screen.y >= screenBounds.w)
        {
            return 0.0;
        }
        vec4 local0 = vec4(
            uintBitsToFloat(gooScissorBuffer.words[entryBase + 4u]),
            uintBitsToFloat(gooScissorBuffer.words[entryBase + 5u]),
            uintBitsToFloat(gooScissorBuffer.words[entryBase + 6u]),
            uintBitsToFloat(gooScissorBuffer.words[entryBase + 7u]));
        vec4 local1 = vec4(
            uintBitsToFloat(gooScissorBuffer.words[entryBase + 8u]),
            uintBitsToFloat(gooScissorBuffer.words[entryBase + 9u]),
            uintBitsToFloat(gooScissorBuffer.words[entryBase + 10u]),
            uintBitsToFloat(gooScissorBuffer.words[entryBase + 11u]));
        if (kind == GooScissorKindRoundedBox)
        {
            vec4 radii = vec4(
                uintBitsToFloat(gooScissorBuffer.words[entryBase + 12u]),
                uintBitsToFloat(gooScissorBuffer.words[entryBase + 13u]),
                uintBitsToFloat(gooScissorBuffer.words[entryBase + 14u]),
                uintBitsToFloat(gooScissorBuffer.words[entryBase + 15u]));
            vec2 pt = vec2(dot(local0.xyz, screenH), dot(local1.xyz, screenH));
            vec2 sz = vec2(local0.w, local1.w);
            coverage *= gooEffectRoundedRectCoverage(pt, sz, gooEffectNormalizeRadii(sz, radii),
                vec2(local0.x, local1.x), vec2(local0.y, local1.y));
        }
        else
        {
            vec4 border0 = vec4(
                uintBitsToFloat(gooScissorBuffer.words[entryBase + 12u]),
                uintBitsToFloat(gooScissorBuffer.words[entryBase + 13u]),
                uintBitsToFloat(gooScissorBuffer.words[entryBase + 14u]),
                uintBitsToFloat(gooScissorBuffer.words[entryBase + 15u]));
            vec4 border1 = vec4(
                uintBitsToFloat(gooScissorBuffer.words[entryBase + 16u]),
                uintBitsToFloat(gooScissorBuffer.words[entryBase + 17u]),
                uintBitsToFloat(gooScissorBuffer.words[entryBase + 18u]),
                uintBitsToFloat(gooScissorBuffer.words[entryBase + 19u]));
            if (border0.w > 0.0 && border1.w > 0.0)
            {
                vec2 bp = vec2(dot(border0.xyz, screenH), dot(border1.xyz, screenH));
                coverage *= gooEffectRoundedRectCoverage(bp, vec2(border0.w, border1.w), vec4(0.0),
                    vec2(border0.x, border1.x), vec2(border0.y, border1.y));
            }
            if (coverage > 0.0)
            {
                uint pathWordOffset = gooScissorBuffer.words[entryBase + 21u];
                uint fillRule = gooScissorBuffer.words[entryBase + 22u];
                vec2 pathPos = vec2(dot(local0.xyz, screenH), dot(local1.xyz, screenH));
                coverage *= gooClipEvaluatePath(pathWordOffset, fillRule, pathPos, vec2(local0.w, local1.w));
            }
        }
        if (coverage <= 0.0) return 0.0;
    }
    return coverage;
}

vec4 gooEffect(vec2 uv, vec4 source, vec4 backdrop);

void main()
{
    gooActivePrimitive = gooPrimitiveBuffer.records[gooPrimitiveRecordOrdinal];
#ifdef GOO_SOURCE_INDEPENDENT
    vec4 source = vec4(0.0);
    vec4 backdrop = source;
#else
    vec2 sourceUv = gooActivePrimitive.params.xy + gooUv * gooActivePrimitive.params.zw;
    vec4 source = texture(gooSourceTexture, sourceUv);
    vec4 backdrop = texture(gooBackdropTexture, sourceUv);
#endif
    vec4 color = gooEffect(gooUv, source, backdrop);
#ifdef GOO_UNCLIPPED
    float coverage = clamp(gooActivePrimitive.radii.x, 0.0, 1.0);
#else
    float coverage = gooClipCoverage() * clamp(gooActivePrimitive.radii.x, 0.0, 1.0);
#endif
#ifdef GOO_REPLACES_BACKDROP
    if (coverage <= 0.0)
    {
        discard;
    }
    gooOutputColor = mix(backdrop, color, coverage);
#else
    gooOutputColor = color * coverage;
#endif
}

#endif
