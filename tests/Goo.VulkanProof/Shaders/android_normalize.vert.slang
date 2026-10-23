struct VertexOutput
{
    float4 position : SV_Position;
    [[vk::location(0)]] float2 uv : TEXCOORD0;
};

[shader("vertex")]
VertexOutput main(uint vertex : SV_VulkanVertexID)
{
    VertexOutput result;
    result.uv = float2((vertex << 1) & 2, vertex & 2);
    result.position = float4(result.uv * 2.0 - 1.0, 0.0, 1.0);
    return result;
}
