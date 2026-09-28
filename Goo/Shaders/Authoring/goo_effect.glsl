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

layout(set = 3, binding = 0) uniform sampler2DArray gooClipMaskAtlas;

layout(set = 3, binding = 1, std430) readonly buffer GooClipChainBuffer
{
    uint words[];
} gooClipChainBuffer;
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

const uint GooClipMaxDepth = 8u;
const uint GooClipHeaderWords = 4u;
const uint GooClipDrawRefWords = 12u;
const uint GooClipMaskRecordWords = 12u;
const uint GooEffectDataSlotCount = 4u;
GooPrimitiveRecord gooActivePrimitive;

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


float gooClipCoverage()
{
    uint drawCount = gooClipChainBuffer.words[0u];
    uint maskRecordBase = gooClipChainBuffer.words[1u];
    uint maskRecordCount = gooClipChainBuffer.words[2u];
    if (gooClipDrawOrdinal >= drawCount)
    {
        return 0.0;
    }
    uint drawBase = GooClipHeaderWords + gooClipDrawOrdinal * GooClipDrawRefWords;
    uint depth = min(gooClipChainBuffer.words[drawBase], GooClipMaxDepth);
    if (gooClipChainBuffer.words[drawBase + 9u] == 2u)
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
        uint maskIndex = gooClipChainBuffer.words[drawBase + 1u + index];
        if (maskIndex >= maskRecordCount)
        {
            return 0.0;
        }
        uint entryBase = maskRecordBase + maskIndex * GooClipMaskRecordWords;
        vec4 screenBounds = vec4(
            uintBitsToFloat(gooClipChainBuffer.words[entryBase + 0u]),
            uintBitsToFloat(gooClipChainBuffer.words[entryBase + 1u]),
            uintBitsToFloat(gooClipChainBuffer.words[entryBase + 2u]),
            uintBitsToFloat(gooClipChainBuffer.words[entryBase + 3u]));
        vec2 screen = gl_FragCoord.xy + vec2(
            uintBitsToFloat(gooClipChainBuffer.words[drawBase + 10u]),
            uintBitsToFloat(gooClipChainBuffer.words[drawBase + 11u]));
        if (screen.x < screenBounds.x || screen.y < screenBounds.y
            || screen.x >= screenBounds.z || screen.y >= screenBounds.w)
        {
            return 0.0;
        }
        vec4 uvTransform = vec4(
            uintBitsToFloat(gooClipChainBuffer.words[entryBase + 4u]),
            uintBitsToFloat(gooClipChainBuffer.words[entryBase + 5u]),
            uintBitsToFloat(gooClipChainBuffer.words[entryBase + 6u]),
            uintBitsToFloat(gooClipChainBuffer.words[entryBase + 7u]));
        if (gooClipChainBuffer.words[entryBase + 9u] == 2u)
        {
            return 0.0;
        }
        vec2 atlasUv = screen * uvTransform.xy + uvTransform.zw;
        uint layer = gooClipChainBuffer.words[entryBase + 8u];
        coverage *= clamp(texture(gooClipMaskAtlas, vec3(atlasUv, float(layer))).r, 0.0, 1.0);
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
    float coverage = gooClipCoverage() * clamp(gooActivePrimitive.radii.x, 0.0, 1.0);
    gooOutputColor = color * coverage;
}

#endif
