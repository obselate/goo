struct TextInstance
{
    float4 transform0;
    float4 transform1;
    float4 transform2;
    float4 transform3;
    float4 glyphBounds;
    uint4 glyphInput;
    float4 foreground;
    float2 runOrigin;
};
struct Viewport { float2 size; float2 scale; };
[[vk::binding(0, 0)]] ConstantBuffer<Viewport> viewport;
[[vk::binding(0, 2)]] StructuredBuffer<TextInstance> instances;
struct TextVertex
{
    float4 position : SV_Position;
    [[vk::location(0)]] float2 texcoord;
    [[vk::location(1)]] nointerpolation uint glyphLoc;
    [[vk::location(4)]] nointerpolation float4 foreground;
};
[shader("vertex")]
TextVertex main(uint vertexIndex : SV_VulkanVertexID, uint instanceIndex : SV_VulkanInstanceID)
{
    static const float2 corners[6] = {
        float2(0, 0), float2(1, 0), float2(1, 1),
        float2(0, 0), float2(1, 1), float2(0, 1)
    };
    TextInstance instance = instances[instanceIndex];
    float2 corner = corners[vertexIndex];
    float2 normal = corner * 2.0 - 1.0;
    float2 n = normalize(normal);
    float2 axis0 = instance.transform0.xy * viewport.scale;
    float2 axis1 = instance.transform1.xy * viewport.scale;
    float2 origin = instance.transform3.xy * viewport.scale;
    if (instance.transform0.y == 0.0 && instance.transform1.x == 0.0)
    {
        float2 runOrigin = instance.runOrigin * viewport.scale;
        origin = float2(round(runOrigin.x), floor(runOrigin.y + 0.5)) +
            (instance.transform3.xy - instance.runOrigin) * viewport.scale;
    }
    float2 position = lerp(instance.glyphBounds.xy, instance.glyphBounds.zw, corner);
    position += normal * (0.5 / length(axis0 * n.x + axis1 * n.y));
    float2 pixel = axis0 * position.x + axis1 * position.y + origin;
    TextVertex output;
    output.position = float4(pixel.x * 2.0 / (viewport.size.x * viewport.scale.x) - 1.0,
        1.0 - pixel.y * 2.0 / (viewport.size.y * viewport.scale.y), 0.0, 1.0);
    output.texcoord = position;
    output.glyphLoc = instance.glyphInput.x;
    output.foreground = instance.foreground;
    return output;
}
