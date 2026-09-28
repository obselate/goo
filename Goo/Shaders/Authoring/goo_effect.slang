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
[[vk::binding(0, 3)]] Sampler2DArray gooClipMaskAtlas;
[[vk::binding(1, 3)]] StructuredBuffer<uint> gooClipChainBuffer;
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

static const uint GooClipMaxDepth = 8;
static const uint GooClipHeaderWords = 4;
static const uint GooClipDrawRefWords = 12;
static const uint GooClipMaskRecordWords = 12;
static const uint GooEffectDataSlotCount = 4;

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


float gooClipCoverage(GooEffectInput input)
{
    uint drawCount = gooClipChainBuffer[0];
    uint maskRecordBase = gooClipChainBuffer[1];
    uint maskRecordCount = gooClipChainBuffer[2];
    if (input.clipDrawOrdinal >= drawCount)
    {
        return 0.0;
    }
    uint drawBase = GooClipHeaderWords + input.clipDrawOrdinal * GooClipDrawRefWords;
    uint depth = min(gooClipChainBuffer[drawBase], GooClipMaxDepth);
    if (gooClipChainBuffer[drawBase + 9] == 2)
    {
        return 0.0;
    }
    float coverage = 1.0;
    for (uint index = 0; index < GooClipMaxDepth; index++)
    {
        if (index >= depth)
        {
            break;
        }
        uint maskIndex = gooClipChainBuffer[drawBase + 1 + index];
        if (maskIndex >= maskRecordCount)
        {
            return 0.0;
        }
        uint entryBase = maskRecordBase + maskIndex * GooClipMaskRecordWords;
        float4 screenBounds = float4(
            asfloat(gooClipChainBuffer[entryBase + 0]),
            asfloat(gooClipChainBuffer[entryBase + 1]),
            asfloat(gooClipChainBuffer[entryBase + 2]),
            asfloat(gooClipChainBuffer[entryBase + 3]));
        float2 screen = input.position.xy + float2(
            asfloat(gooClipChainBuffer[drawBase + 10]),
            asfloat(gooClipChainBuffer[drawBase + 11]));
        if (screen.x < screenBounds.x || screen.y < screenBounds.y
            || screen.x >= screenBounds.z || screen.y >= screenBounds.w)
        {
            return 0.0;
        }
        float4 uvTransform = float4(
            asfloat(gooClipChainBuffer[entryBase + 4]),
            asfloat(gooClipChainBuffer[entryBase + 5]),
            asfloat(gooClipChainBuffer[entryBase + 6]),
            asfloat(gooClipChainBuffer[entryBase + 7]));
        if (gooClipChainBuffer[entryBase + 9] == 2)
        {
            return 0.0;
        }
        float2 atlasUv = screen * uvTransform.xy + uvTransform.zw;
        uint layer = gooClipChainBuffer[entryBase + 8];
        coverage *= clamp(gooClipMaskAtlas.Sample(float3(atlasUv, float(layer))).r,
            0.0, 1.0);
    }
    return coverage;
}

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
    float coverage = gooClipCoverage(input) * clamp(gooActivePrimitive.radii.x, 0.0, 1.0);
    GooEffectOutput output;
    output.color = color * coverage;
    return output;
}

#endif
