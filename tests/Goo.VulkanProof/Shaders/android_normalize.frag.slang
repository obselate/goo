[[vk::binding(0, 0)]] Sampler2D imageTexture;
struct Constants { uint encoding; uint opaque; };
[[vk::push_constant]] Constants pc;

[shader("fragment")]
float4 main([[vk::location(0)]] float2 uv : TEXCOORD0) : SV_Target0
{
    float4 sample = imageTexture.Sample(uv);
    float3 rgb = sample.rgb;
    if (pc.encoding == 1)
    {
        rgb = lerp(rgb / 12.92, pow(max((rgb + 0.055) / 1.055, 0.0), float3(2.4)),
            step(float3(0.04045), rgb));
    }
    else if (pc.encoding >= 2)
    {
        rgb = lerp(rgb / 4.5, pow(max((rgb + 0.099) / 1.099, 0.0), float3(1.0 / 0.45)),
            step(float3(0.081), rgb));
        if (pc.encoding == 4 || pc.encoding == 5)
        {
            rgb = mul(float3x3(1.044043, -0.044043, 0.0,
                0.0, 1.0, 0.0, 0.0, 0.011793, 0.988207), rgb);
        }
        else if (pc.encoding == 6 || pc.encoding == 7)
        {
            rgb = mul(float3x3(0.939542, 0.050181, 0.010277,
                0.017772, 0.965793, 0.016435, -0.001622, -0.004371, 1.005993), rgb);
        }
    }
    return float4(saturate(rgb), pc.opaque != 0 ? 1.0 : sample.a);
}
