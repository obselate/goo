#include "primitive_record.slang"
[[vk::binding(0, 0)]] Sampler2D imageTexture;
static float2 uv;
static uint gooClipDrawOrdinal;
static uint gooPrimitiveRecordOrdinal;
static float4 gooFragmentPosition;
static float4 outColor;
#include "clip_chain.slang"

#define pc gooPrimitiveBuffer[gooPrimitiveRecordOrdinal]

void shade()
{
    float2 sourceUv = pc.params.xy + uv * pc.params.zw;
    float4 sampleColor = imageTexture.Sample(sourceUv);
    float opacity = clamp(pc.radii.x, 0.0, 1.0);
    float alpha = sampleColor.a * opacity;
    float colorScale = pc.radii.y > 0.5 ? opacity : alpha;
    outColor = float4(sampleColor.rgb * colorScale, alpha) * gooClipCoverage();
}

#include "analytic_fragment_entry.slang"
