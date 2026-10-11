[[vk::binding(0, 3)]] Sampler2DArray gooClipMaskAtlas;
[[vk::binding(1, 3)]] StructuredBuffer<uint> gooClipChainBuffer;

static const uint GooClipMaxDepth = 8u;
static const uint GooClipHeaderWords = 4u;
static const uint GooClipDrawRefWords = 12u;
static const uint GooClipMaskRecordWords = 12u;

float gooClipCoverage()
{
    uint maskRecordCount = gooClipChainBuffer[2u];
    if (maskRecordCount == 0u)
    {
        return 1.0;
    }
    uint drawCount = gooClipChainBuffer[0u];
    uint maskRecordBase = gooClipChainBuffer[1u];
    if (gooClipDrawOrdinal >= drawCount)
    {
        return 0.0;
    }
    uint drawBase = GooClipHeaderWords + gooClipDrawOrdinal * GooClipDrawRefWords;
    uint depth = min(gooClipChainBuffer[drawBase], GooClipMaxDepth);
    uint forceZero = gooClipChainBuffer[drawBase + 9u];
    if (forceZero == 2u)
    {
        return 0.0;
    }
    float coverage = 1.0;
    for (uint index = 0u; index < GooClipMaxDepth; index++)
    {
        if (index >= depth)
        {
            break;
        }
        uint maskIndex = gooClipChainBuffer[drawBase + 1u + index];
        if (maskIndex >= maskRecordCount)
        {
            return 0.0;
        }
        uint entryBase = maskRecordBase + maskIndex * GooClipMaskRecordWords;
        float4 screenBounds = float4(
            asfloat(gooClipChainBuffer[entryBase + 0u]),
            asfloat(gooClipChainBuffer[entryBase + 1u]),
            asfloat(gooClipChainBuffer[entryBase + 2u]),
            asfloat(gooClipChainBuffer[entryBase + 3u]));
        float2 screen = gooFragmentPosition.xy + float2(
            asfloat(gooClipChainBuffer[drawBase + 10u]),
            asfloat(gooClipChainBuffer[drawBase + 11u]));
        if (screen.x < screenBounds.x || screen.y < screenBounds.y
            || screen.x >= screenBounds.z || screen.y >= screenBounds.w)
        {
            return 0.0;
        }
        float4 uvTransform = float4(
            asfloat(gooClipChainBuffer[entryBase + 4u]),
            asfloat(gooClipChainBuffer[entryBase + 5u]),
            asfloat(gooClipChainBuffer[entryBase + 6u]),
            asfloat(gooClipChainBuffer[entryBase + 7u]));
        uint layer = gooClipChainBuffer[entryBase + 8u];
        uint mode = gooClipChainBuffer[entryBase + 9u];
        if (mode == 2u)
        {
            return 0.0;
        }
        float2 atlasUv = screen * uvTransform.xy + uvTransform.zw;
        coverage *= clamp(gooClipMaskAtlas.Sample(float3(atlasUv, float(layer))).r, 0.0, 1.0);
    }
    return coverage;
}
