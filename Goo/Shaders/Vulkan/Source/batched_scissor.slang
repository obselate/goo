#ifndef GOO_BATCHED_SCISSOR_SLANG
#define GOO_BATCHED_SCISSOR_SLANG

#ifdef GOO_WEBGPU
float2 gooScissorScreenPosition(uint chainId, float2 fragPos) { return fragPos; }
float gooScissorChainCoverage(uint chainId, float2 fragPos) { return 1.0; }
#else

#include "rounded_rect.slang"

#ifndef GOO_SCISSOR_SET
#define GOO_SCISSOR_SET 1
#endif

[[vk::binding(0, GOO_SCISSOR_SET)]] StructuredBuffer<uint> gooScissorBuffer;
[[vk::binding(1, GOO_SCISSOR_SET)]] StructuredBuffer<uint> gooClipPathBuffer;

#include "path_band_eval.slang"

static const uint GooScissorMaxDepth = 10u;
static const uint GooScissorHeaderWords = 4u;
static const uint GooScissorChainWords = 16u;
static const uint GooScissorRecordWords = 24u;
static const uint GooScissorKindZero = 0u;
static const uint GooScissorKindRoundedBox = 1u;
static const uint GooScissorKindPathBand = 2u;

float2 gooScissorScreenPosition(uint chainId, float2 fragPos)
{
    uint chainCount = gooScissorBuffer[0u];
    uint chainBase = gooScissorBuffer[1u];
    if (chainCount == 0u || chainId >= chainCount)
    {
        return fragPos;
    }
    uint entry = chainBase + chainId * GooScissorChainWords;
    float2 layerScale = float2(
        asfloat(gooScissorBuffer[entry + 12u]),
        asfloat(gooScissorBuffer[entry + 13u]));
    float2 layerOrigin = float2(
        asfloat(gooScissorBuffer[entry + 14u]),
        asfloat(gooScissorBuffer[entry + 15u]));
    return fragPos * layerScale + layerOrigin;
}

float gooEvaluateScissorPathRecord(uint recordBase, float2 screen)
{
    float4 local0 = float4(
        asfloat(gooScissorBuffer[recordBase + 4u]),
        asfloat(gooScissorBuffer[recordBase + 5u]),
        asfloat(gooScissorBuffer[recordBase + 6u]),
        asfloat(gooScissorBuffer[recordBase + 7u]));
    float4 local1 = float4(
        asfloat(gooScissorBuffer[recordBase + 8u]),
        asfloat(gooScissorBuffer[recordBase + 9u]),
        asfloat(gooScissorBuffer[recordBase + 10u]),
        asfloat(gooScissorBuffer[recordBase + 11u]));
    float4 border0 = float4(
        asfloat(gooScissorBuffer[recordBase + 12u]),
        asfloat(gooScissorBuffer[recordBase + 13u]),
        asfloat(gooScissorBuffer[recordBase + 14u]),
        asfloat(gooScissorBuffer[recordBase + 15u]));
    float4 border1 = float4(
        asfloat(gooScissorBuffer[recordBase + 16u]),
        asfloat(gooScissorBuffer[recordBase + 17u]),
        asfloat(gooScissorBuffer[recordBase + 18u]),
        asfloat(gooScissorBuffer[recordBase + 19u]));
    uint pathWordOffset = gooScissorBuffer[recordBase + 21u];
    uint fillRule = gooScissorBuffer[recordBase + 22u];

    float borderCoverage = 1.0;
    if (border0.w > 0.0 && border1.w > 0.0)
    {
        float3 borderH = float3(screen, 1.0);
        float2 borderPoint = float2(dot(border0.xyz, borderH), dot(border1.xyz, borderH));
        float2 borderSize = float2(border0.w, border1.w);
        float2 borderDx = float2(border0.x, border1.x);
        float2 borderDy = float2(border0.y, border1.y);
        borderCoverage = gooRoundedRectCoverage(borderPoint, borderSize, float4(0.0), borderDx, borderDy);
        if (borderCoverage <= 0.0)
        {
            return 0.0;
        }
    }

    float3 screenH = float3(screen, 1.0);
    float2 pathPos = float2(dot(local0.xyz, screenH), dot(local1.xyz, screenH));
    float2 pixelsPerPath = float2(local0.w, local1.w);
    float pathCoverage = gooEvaluatePathCoverage(gooClipPathBuffer, pathWordOffset, fillRule, pathPos, pixelsPerPath, true);
    return pathCoverage * borderCoverage;
}

float gooScissorRecordCoverage(uint recordIndex, float2 screen)
{
    uint recordCount = gooScissorBuffer[2u];
    uint recordTableBase = gooScissorBuffer[3u];
    if (recordIndex >= recordCount)
    {
        return 0.0;
    }
    uint entryBase = recordTableBase + recordIndex * GooScissorRecordWords;
    uint kind = gooScissorBuffer[entryBase + 20u];
    if (kind == GooScissorKindZero)
    {
        return 0.0;
    }
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
    if (kind == GooScissorKindRoundedBox)
    {
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
        float4 radii = float4(
            asfloat(gooScissorBuffer[entryBase + 12u]),
            asfloat(gooScissorBuffer[entryBase + 13u]),
            asfloat(gooScissorBuffer[entryBase + 14u]),
            asfloat(gooScissorBuffer[entryBase + 15u]));
        float3 screenH = float3(screen, 1.0);
        float2 point = float2(dot(local0.xyz, screenH), dot(local1.xyz, screenH));
        float2 size = float2(local0.w, local1.w);
        float2 pointDx = float2(local0.x, local1.x);
        float2 pointDy = float2(local0.y, local1.y);
        return gooRoundedRectCoverage(point, size, gooNormalizeRadii(size, radii), pointDx, pointDy);
    }
    return gooEvaluateScissorPathRecord(entryBase, screen);
}

float gooScissorChainCoverage(uint chainId, float2 fragPos)
{
    uint recordCount = gooScissorBuffer[2u];
    if (recordCount == 0u || chainId == 0u)
    {
        return 1.0;
    }
    uint chainCount = gooScissorBuffer[0u];
    uint chainTableBase = gooScissorBuffer[1u];
    if (chainId >= chainCount)
    {
        return 0.0;
    }
    uint chainBase = chainTableBase + chainId * GooScissorChainWords;
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
    float2 screen = fragPos * layerScale + layerOrigin;
    float coverage = 1.0;
    [loop]
    for (uint index = 0u; index < depth; index++)
    {
        uint recordIndex = gooScissorBuffer[chainBase + 1u + index];
        coverage *= gooScissorRecordCoverage(recordIndex, screen);
        if (coverage <= 0.0)
        {
            return 0.0;
        }
    }
    return coverage;
}

#endif
#endif
