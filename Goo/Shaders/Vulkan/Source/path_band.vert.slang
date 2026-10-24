#include "slang_compat.slang"
[[vk::binding(0, 0)]] StructuredBuffer<uint> pathBandBuffer;
#ifdef GOO_CLIP_MASK
struct ClipMaskPushConstants
{
    float4 transform0; float4 transform1; float4 sampleStep; float4 borderRect;
    float4 borderTransform0; float4 borderTransform1; uint4 params;
};
[[vk::push_constant]] ConstantBuffer<ClipMaskPushConstants> pc;
#else
struct PathBandPushConstants
{
    float4 transform0; float4 transform1; float4 sampleStep; float4 color; uint4 params;
};
[[vk::push_constant]] ConstantBuffer<PathBandPushConstants> pc;
#endif
uint pathWord(uint relativeWord)
{
    return pathBandBuffer[pc.params.x + relativeWord];
}
struct PathBandVertexOutput
{
    float4 position : SV_Position;
    [[vk::location(0)]] float2 pathPosition;
#ifndef GOO_CLIP_MASK
    [[vk::location(2)]] nointerpolation uint clipDrawOrdinal;
#endif
};
[shader("vertex")]
PathBandVertexOutput main(
    uint vertexIndex : SV_VulkanVertexID,
    uint instanceIndex : SV_VulkanInstanceID)
{
    static const float2 positions[6] =
    {
        float2(0.0, 0.0), float2(1.0, 0.0), float2(1.0, 1.0),
        float2(0.0, 0.0), float2(1.0, 1.0), float2(0.0, 1.0)
    };
    float2 minimum = float2(asfloat(pathWord(8u)), asfloat(pathWord(9u)));
    float2 maximum = float2(asfloat(pathWord(10u)), asfloat(pathWord(11u)));
    float2 inflation = abs(pc.sampleStep.zw);
    minimum -= inflation;
    maximum += inflation;
    float2 path = lerp(minimum, maximum, positions[vertexIndex]);
    float3 homogeneous = float3(path, 1.0);
    float2 clip = float2(dot(pc.transform0.xyz, homogeneous), dot(pc.transform1.xyz, homogeneous));
    PathBandVertexOutput output;
    output.position = float4(clip, 0.0, 1.0);
    output.pathPosition = path;
#ifndef GOO_CLIP_MASK
    output.clipDrawOrdinal = instanceIndex;
#endif
    return output;
}
