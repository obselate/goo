#include "primitive_record.slang"
struct BatchedUiVertexOutput
{
    float4 position : SV_Position;
    [[vk::location(0)]] float2 uv;
    [[vk::location(2)]] nointerpolation uint scissorChainId;
    [[vk::location(3)]] nointerpolation uint primitiveRecordOrdinal;
};
[shader("vertex")]
BatchedUiVertexOutput main(
    uint vertexIndex : SV_VulkanVertexID,
    uint instanceIndex : SV_VulkanInstanceID)
{
    static const float2 positions[4] =
    {
        float2(0.0, 0.0),
        float2(1.0, 0.0),
        float2(0.0, 1.0),
        float2(1.0, 1.0)
    };
    uint primitiveRecordOrdinal = (vertexIndex >> 2u) + instanceIndex;
    GooPrimitiveRecord primitive = gooPrimitiveBuffer[primitiveRecordOrdinal];
    uint quadVertex = vertexIndex & 3u;
    uint header = asuint(primitive.transform1.w);
    float expandQuad = float(header & 1u);
    float2 uvPadding = expandQuad / max(primitive.rect.zw, float2(0.0001));
    float2 expandedUv = positions[quadVertex] * (1.0 + uvPadding * 2.0) - uvPadding;
    float2 local = primitive.rect.xy + expandedUv * primitive.rect.zw;
    float3 homogeneous = float3(local, 1.0);
    float2 position = float2(
        dot(primitive.transform0.xyz, homogeneous),
        dot(primitive.transform1.xyz, homogeneous));
    BatchedUiVertexOutput output;
    output.position = float4(position, 0.0, 1.0);
    output.uv = expandedUv;
    output.scissorChainId = asuint(primitive.transform0.w);
    output.primitiveRecordOrdinal = primitiveRecordOrdinal;
    return output;
}
