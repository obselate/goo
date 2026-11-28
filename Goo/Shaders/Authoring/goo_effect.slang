#ifndef GOO_EFFECT_SLANG
#define GOO_EFFECT_SLANG

struct GooPrimitiveRecord
{
    float4 rect;
    float4 transform0;
    float4 transform1;
    float4 radii;
    float4 params;
    float4 stopPositions;
    uint4 packedColors;
    uint4 packedColorsExtra;
};

#ifndef GOO_SOURCE_INDEPENDENT
[[vk::binding(0, 0)]] Sampler2D gooSourceTexture;
[[vk::binding(0, 1)]] Sampler2D gooBackdropTexture;
#endif
[[vk::binding(0, 2)]] StructuredBuffer<GooPrimitiveRecord> gooPrimitiveBuffer;
[[vk::binding(0, 3)]] StructuredBuffer<uint> gooScissorBuffer;
[[vk::binding(1, 3)]] StructuredBuffer<uint> gooClipPathBuffer;
[[vk::binding(0, 4)]] StructuredBuffer<uint> gooEffectDataBuffer;

[[vk::push_constant]] cbuffer GooEffectParameters
{
    float4 gooParameter0;
    float4 gooParameter1;
    float4 gooParameter2;
    float4 gooParameter3;
    float4 gooParameter4;
    float4 gooParameter5;
    float4 gooParameter6;
    float4 gooParameter7;
};

static GooPrimitiveRecord gooActivePrimitive;

GooPrimitiveRecord gooPrimitive()
{
    return gooActivePrimitive;
}

float4 gooParameter(uint slot)
{
    switch (slot)
    {
        case 0: return gooParameter0;
        case 1: return gooParameter1;
        case 2: return gooParameter2;
        case 3: return gooParameter3;
        case 4: return gooParameter4;
        case 5: return gooParameter5;
        case 6: return gooParameter6;
        default: return gooParameter7;
    }
}

float gooElapsedSeconds()
{
    return gooActivePrimitive.stopPositions.x;
}

struct GooEffectInput
{
    [[vk::location(0)]] float2 uv;
    [[vk::location(2)]] nointerpolation uint clipDrawOrdinal;
    [[vk::location(3)]] nointerpolation uint primitiveRecordOrdinal;
    float4 position : SV_Position;
};

struct GooEffectOutput
{
    [[vk::location(0)]] float4 color : SV_Target0;
};

static const uint GooScissorMaxDepth = 10u;
static const uint GooScissorChainWords = 16u;
static const uint GooScissorRecordWords = 24u;
static const uint GooScissorKindZero = 0u;
static const uint GooScissorKindRoundedBox = 1u;
static const uint GooEffectDataSlotCount = 4u;

uint gooDataByteLength(uint slot)
{
    if (slot >= GooEffectDataSlotCount)
    {
        return 0;
    }
    uint baseWord = gooActivePrimitive.packedColorsExtra.w;
    return gooEffectDataBuffer[baseWord + slot * 2 + 1];
}

uint gooDataWord(uint slot, uint wordIndex)
{
    uint byteLength = gooDataByteLength(slot);
    if (wordIndex >= (byteLength + 3) / 4)
    {
        return 0;
    }
    uint baseWord = gooActivePrimitive.packedColorsExtra.w;
    uint relativeWord = gooEffectDataBuffer[baseWord + slot * 2];
    return gooEffectDataBuffer[baseWord + relativeWord + wordIndex];
}

float4 gooEffectNormalizeRadii(float2 size, float4 source)
{
    float4 result = max(source, float4(0.0));
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

float gooEffectCornerCut(float2 offset, float radius, float2 extent)
{
    float2 low = clamp(offset + radius - extent, 0.0, radius);
    float2 high = clamp(offset + radius + extent, 0.0, radius);
    if (any(high <= low)) return 0.0;
    float first = clamp(sqrt((radius - high.y) * (radius + high.y)), low.x, high.x);
    float second = clamp(sqrt((radius - low.y) * (radius + low.y)), low.x, high.x);
    float firstHeight = sqrt((radius - first) * (radius + first));
    float secondHeight = sqrt((radius - second) * (radius + second));
    float angle = 2.0 * asin(min(length(float2(second - first, firstHeight - secondHeight)) / max(2.0 * radius, 0.000001), 1.0));
    float angleSquared = angle * angle;
    float segment = radius * radius * angle * angleSquared / 12.0 * (1.0 - angleSquared / 20.0 + angleSquared * angleSquared / 840.0);
    float inside = (high.y - low.y) * (first - low.x) + (second - first) * ((firstHeight + secondHeight) * 0.5 - low.y) + segment;
    return (high.x - low.x) * (high.y - low.y) - inside;
}

float gooEffectTransformedEdgeCoverage(float2 point, float2 size, float4 cornerRadii, float2 pointDx, float2 pointDy)
{
    float2 centered = point - size * 0.5;
    float radius = centered.x < 0.0
        ? (centered.y < 0.0 ? cornerRadii.x : cornerRadii.w)
        : (centered.y < 0.0 ? cornerRadii.y : cornerRadii.z);
    float2 q = abs(centered) - size * 0.5 + radius;
    float2 normal = max(q, 0.0);
    normal = dot(normal, normal) > 0.0
        ? normalize(normal)
        : (q.x > q.y ? float2(1.0, 0.0) : float2(0.0, 1.0));
    normal *= float2(centered.x < 0.0 ? -1.0 : 1.0, centered.y < 0.0 ? -1.0 : 1.0);
    float2 gradient = abs(float2(dot(normal, pointDx), dot(normal, pointDy)));
    float width = length(gradient);
    float distance = radius - length(max(q, 0.0)) - min(max(q.x, q.y), 0.0);
    if (width < 0.0001) return distance >= 0.0 ? 1.0 : 0.0;
    float2 span = float2(max(gradient.x, gradient.y), max(min(gradient.x, gradient.y), 0.000001 * width)) / width;
    float offset = distance / width;
    float tail = max((span.x + span.y) * 0.5 - abs(offset), 0.0);
    tail = tail * tail / (2.0 * span.x * span.y);
    return abs(offset) <= (span.x - span.y) * 0.5 ? 0.5 + offset / span.x : (offset > 0.0 ? 1.0 - tail : tail);
}

float gooEffectRoundedRectCoverage(float2 point, float2 size, float4 cornerRadii, float2 pointDx, float2 pointDy)
{
    if (abs(pointDx.y) + abs(pointDy.x) > 0.0001 * (abs(pointDx.x) + abs(pointDy.y)))
    {
        return gooEffectTransformedEdgeCoverage(point, size, cornerRadii, pointDx, pointDy);
    }
    float2 extent = max(0.5 * float2(length(float2(pointDx.x, pointDy.x)), length(float2(pointDx.y, pointDy.y))), float2(0.0001));
    float2 centered = point - size * 0.5;
    float2 overlap = min(saturate(0.5 + (size * 0.5 - abs(centered)) / (2.0 * extent)), size / (2.0 * extent));
    float cut = gooEffectCornerCut(-centered - size * 0.5, cornerRadii.x, extent)
        + gooEffectCornerCut(float2(centered.x, -centered.y) - size * 0.5, cornerRadii.y, extent)
        + gooEffectCornerCut(centered - size * 0.5, cornerRadii.z, extent)
        + gooEffectCornerCut(float2(-centered.x, centered.y) - size * 0.5, cornerRadii.w, extent);
    return saturate(overlap.x * overlap.y - cut / (4.0 * extent.x * extent.y));
}

uint gooClipPathWord(uint baseWord, uint relativeWord) { return gooClipPathBuffer[baseWord + relativeWord]; }
float gooClipPathFloat(uint baseWord, uint index) { return asfloat(gooClipPathWord(baseWord, index)); }

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
    float2 start;
    float2 control;
    float2 finish;
};

GooClipBand gooClipReadBand(uint baseWord, uint bandBase, float2 origin, bool vertical)
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

GooClipCurve gooClipReadCurve(uint baseWord, uint curveBase, uint index, float2 origin)
{
    uint b = curveBase + index * 8u;
    GooClipCurve c;
    c.start = float2(gooClipPathFloat(baseWord, b), gooClipPathFloat(baseWord, b + 1u)) - origin;
    c.control = float2(gooClipPathFloat(baseWord, b + 2u), gooClipPathFloat(baseWord, b + 3u)) - origin;
    c.finish = float2(gooClipPathFloat(baseWord, b + 4u), gooClipPathFloat(baseWord, b + 5u)) - origin;
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
    uint s0 = asuint(first) >> 31u;
    uint s1 = asuint(second) >> 30u;
    uint s2 = asuint(third) >> 29u;
    uint sh = (s1 & 2u) | (s0 & ~2u);
    sh = (s2 & 4u) | (sh & ~4u);
    return (0x2e74u >> sh) & 0x0101u;
}

float gooClipEvaluatePath(uint baseWord, uint fillRule, float2 pathPos, float2 pixelsPerPath)
{
    uint reqRule = fillRule == 1u ? 2u : 1u;
    if (gooClipPathWord(baseWord, 0u) != 1u || (gooClipPathWord(baseWord, 1u) & reqRule) == 0u) return 0.0;
    uint hBands = gooClipPathWord(baseWord, 2u);
    uint vBands = gooClipPathWord(baseWord, 3u);
    uint hIdxs = gooClipPathWord(baseWord, 4u);
    uint vIdxs = gooClipPathWord(baseWord, 5u);
    uint totalCurves = gooClipPathWord(baseWord, 6u);
    if (hBands == 0u || vBands == 0u || totalCurves == 0u) return 0.0;

    float2 origin = float2(gooClipPathFloat(baseWord, 8u), gooClipPathFloat(baseWord, 9u));
    float2 extent = float2(gooClipPathFloat(baseWord, 10u), gooClipPathFloat(baseWord, 11u)) - origin;
    float2 pt = pathPos - origin;
    float2 pix = max(pixelsPerPath, float2(0.0000152587890625));
    float2 margin = 1.0 / pix;
    if (pt.x < -margin.x || pt.y < -margin.y
        || pt.x > extent.x + margin.x || pt.y > extent.y + margin.y) return 0.0;
    uint hBandBase = 12u;
    uint vBandBase = hBandBase + hBands * 8u;
    uint hIdxBase = vBandBase + vBands * 8u;
    uint vIdxBase = hIdxBase + hIdxs;
    uint curveBase = vIdxBase + vIdxs;

    float axisVal[2];
    float axisWeight[2];
    [loop]
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
            float2 pri = float2(forward ? val : -val, wt);
            float2 opp = float2(forward ? -oppVal : oppVal, oppWt);
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
            uint parity[2] = { 0u, 0u };
            uint nearCount[2] = { 0u, 0u };
            float sideWt[2] = { 0.0, 0.0 };
            float nearDist[64] = {};
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
            float sideVal[2] = { 0.0, 0.0 };
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
            float2 pri = float2(forward ? sideVal[0] : sideVal[1], forward ? sideWt[0] : sideWt[1]);
            float2 opp = float2(forward ? sideVal[1] : sideVal[0], forward ? sideWt[1] : sideWt[0]);
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

float gooClipCoverage(GooEffectInput input)
{
    uint recordCount = gooScissorBuffer[2u];
    if (recordCount == 0u || input.clipDrawOrdinal == 0u)
    {
        return 1.0;
    }
    uint chainCount = gooScissorBuffer[0u];
    uint chainTableBase = gooScissorBuffer[1u];
    uint recordTableBase = gooScissorBuffer[3u];
    if (input.clipDrawOrdinal >= chainCount)
    {
        return 0.0;
    }
    uint chainBase = chainTableBase + input.clipDrawOrdinal * GooScissorChainWords;
    if (gooScissorBuffer[chainBase + 11u] == 2u)
    {
        return 0.0;
    }
    uint depth = min(gooScissorBuffer[chainBase], GooScissorMaxDepth);
    if (depth == 0u)
    {
        return 1.0;
    }
    float2 layerScale = float2(
        asfloat(gooScissorBuffer[chainBase + 12u]),
        asfloat(gooScissorBuffer[chainBase + 13u]));
    float2 layerOrigin = float2(
        asfloat(gooScissorBuffer[chainBase + 14u]),
        asfloat(gooScissorBuffer[chainBase + 15u]));
    float2 screen = input.position.xy * layerScale + layerOrigin;
    float3 screenH = float3(screen, 1.0);
    float coverage = 1.0;
    [loop]
    for (uint index = 0u; index < depth; index++)
    {
        uint recordIndex = gooScissorBuffer[chainBase + 1u + index];
        if (recordIndex >= recordCount) return 0.0;
        uint entryBase = recordTableBase + recordIndex * GooScissorRecordWords;
        uint kind = gooScissorBuffer[entryBase + 20u];
        if (kind == GooScissorKindZero) return 0.0;
        float4 screenBounds = float4(
            asfloat(gooScissorBuffer[entryBase + 0u]),
            asfloat(gooScissorBuffer[entryBase + 1u]),
            asfloat(gooScissorBuffer[entryBase + 2u]),
            asfloat(gooScissorBuffer[entryBase + 3u]));
        if (screen.x < screenBounds.x || screen.y < screenBounds.y
            || screen.x >= screenBounds.z || screen.y >= screenBounds.w)
        {
            return 0.0;
        }
        float4 local0 = float4(
            asfloat(gooScissorBuffer[entryBase + 4u]),
            asfloat(gooScissorBuffer[entryBase + 5u]),
            asfloat(gooScissorBuffer[entryBase + 6u]),
            asfloat(gooScissorBuffer[entryBase + 7u]));
        float4 local1 = float4(
            asfloat(gooScissorBuffer[entryBase + 8u]),
            asfloat(gooScissorBuffer[entryBase + 9u]),
            asfloat(gooScissorBuffer[entryBase + 10u]),
            asfloat(gooScissorBuffer[entryBase + 11u]));
        if (kind == GooScissorKindRoundedBox)
        {
            float4 radii = float4(
                asfloat(gooScissorBuffer[entryBase + 12u]),
                asfloat(gooScissorBuffer[entryBase + 13u]),
                asfloat(gooScissorBuffer[entryBase + 14u]),
                asfloat(gooScissorBuffer[entryBase + 15u]));
            float2 pt = float2(dot(local0.xyz, screenH), dot(local1.xyz, screenH));
            float2 sz = vec2OrFloat2(local0.w, local1.w);
            coverage *= gooEffectRoundedRectCoverage(pt, sz, gooEffectNormalizeRadii(sz, radii),
                float2(local0.x, local1.x), float2(local0.y, local1.y));
        }
        else
        {
            float4 border0 = float4(
                asfloat(gooScissorBuffer[entryBase + 12u]),
                asfloat(gooScissorBuffer[entryBase + 13u]),
                asfloat(gooScissorBuffer[entryBase + 14u]),
                asfloat(gooScissorBuffer[entryBase + 15u]));
            float4 border1 = float4(
                asfloat(gooScissorBuffer[entryBase + 16u]),
                asfloat(gooScissorBuffer[entryBase + 17u]),
                asfloat(gooScissorBuffer[entryBase + 18u]),
                asfloat(gooScissorBuffer[entryBase + 19u]));
            if (border0.w > 0.0 && border1.w > 0.0)
            {
                float2 bp = float2(dot(border0.xyz, screenH), dot(border1.xyz, screenH));
                coverage *= gooEffectRoundedRectCoverage(bp, float2(border0.w, border1.w), float4(0.0),
                    float2(border0.x, border1.x), float2(border0.y, border1.y));
            }
            if (coverage > 0.0)
            {
                uint pathWordOffset = gooScissorBuffer[entryBase + 21u];
                uint fillRule = gooScissorBuffer[entryBase + 22u];
                float2 pathPos = float2(dot(local0.xyz, screenH), dot(local1.xyz, screenH));
                coverage *= gooClipEvaluatePath(pathWordOffset, fillRule, pathPos, float2(local0.w, local1.w));
            }
        }
        if (coverage <= 0.0) return 0.0;
    }
    return coverage;
}

float2 vec2OrFloat2(float a, float b) { return float2(a, b); }

float4 gooEffect(float2 uv, float4 source, float4 backdrop);

[shader("fragment")]
GooEffectOutput main(GooEffectInput input)
{
    gooActivePrimitive = gooPrimitiveBuffer[input.primitiveRecordOrdinal];
#ifdef GOO_SOURCE_INDEPENDENT
    float4 source = float4(0.0, 0.0, 0.0, 0.0);
    float4 backdrop = source;
#else
    float2 sourceUv = gooActivePrimitive.params.xy + input.uv * gooActivePrimitive.params.zw;
    float4 source = gooSourceTexture.Sample(sourceUv);
    float4 backdrop = gooBackdropTexture.Sample(sourceUv);
#endif
    float4 color = gooEffect(input.uv, source, backdrop);
#ifdef GOO_UNCLIPPED
    float coverage = clamp(gooActivePrimitive.radii.x, 0.0, 1.0);
#else
    float coverage = gooClipCoverage(input) * clamp(gooActivePrimitive.radii.x, 0.0, 1.0);
#endif
    GooEffectOutput output;
#ifdef GOO_REPLACES_BACKDROP
    if (coverage <= 0.0)
    {
        discard;
    }
    output.color = lerp(backdrop, color, coverage);
#else
    output.color = color * coverage;
#endif
    return output;
}

#endif
