#include "primitive_record.slang"
[[vk::binding(0, 0)]] Sampler2D imageTexture;
static float2 uv;
static uint gooClipDrawOrdinal;
static uint gooPrimitiveRecordOrdinal;
static float4 gooFragmentPosition;
static float4 outColor;
#include "clip_chain.slang"

#define pc gooPrimitiveBuffer[gooPrimitiveRecordOrdinal]

float3 srgbEncode(float3 value)
{
    return lerp(value * 12.92, 1.055 * pow(value, float3(1.0 / 2.4)) - 0.055,
        step(float3(0.0031308), value));
}

float3 srgbDecode(float3 value)
{
    return lerp(value / 12.92, pow((value + 0.055) / 1.055, float3(2.4)),
        step(float3(0.04045), value));
}

void shade()
{
    float2 sourceUv = pc.params.xy + uv * pc.params.zw;
    float4 sampleColor = imageTexture.Sample(sourceUv);
    if (pc.radii.z > 0.5)
    {
        float3 straight = sampleColor.a > 0.0 ? sampleColor.rgb / sampleColor.a : float3(0.0);
        outColor = float4(srgbDecode(srgbEncode(straight) * sampleColor.a), sampleColor.a);
        return;
    }
    float opacity = clamp(pc.radii.x, 0.0, 1.0);
    float alpha = sampleColor.a * opacity;
    float colorScale = pc.radii.y > 0.5 ? opacity : alpha;
    outColor = float4(sampleColor.rgb * colorScale, alpha) * gooClipCoverage();
}

#include "analytic_fragment_entry.slang"
