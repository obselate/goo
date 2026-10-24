#include "primitive_record.slang"
[[vk::binding(0, 0)]] Sampler2D sourceTexture;
[[vk::binding(0, 1)]] Sampler2D backdropTexture;
static float2 uv;
static uint gooClipDrawOrdinal;
static uint gooPrimitiveRecordOrdinal;
static float4 gooFragmentPosition;
static float4 outColor;
#include "clip_chain_blend.slang"

#define pc gooPrimitiveBuffer[gooPrimitiveRecordOrdinal]

float channelMin(float3 value)
{
    return min(value.r, min(value.g, value.b));
}

float channelMax(float3 value)
{
    return max(value.r, max(value.g, value.b));
}

float luminance(float3 value)
{
    return dot(value, float3(0.3, 0.59, 0.11));
}

float3 clipColor(float3 value)
{
    float low = channelMin(value);
    float high = channelMax(value);
    float lum = luminance(value);
    if (low < 0.0)
    {
        value = lum + (value - lum) * lum / (lum - low);
    }
    high = channelMax(value);
    if (high > 1.0)
    {
        value = lum + (value - lum) * (1.0 - lum) / (high - lum);
    }
    return value;
}

float3 setLuminance(float3 value, float lum)
{
    return clipColor(value + (lum - luminance(value)));
}

float3 setSaturation(float3 value, float saturation)
{
    float low = channelMin(value);
    float high = channelMax(value);
    float delta = high - low;
    if (delta <= 0.0)
    {
        return float3(0.0);
    }
    float3 result = float3(0.0);
    if (value.r == high)
    {
        result.r = saturation;
        result.g = (value.g - low) * saturation / delta;
        result.b = (value.b - low) * saturation / delta;
    }
    else if (value.g == high)
    {
        result.g = saturation;
        result.r = (value.r - low) * saturation / delta;
        result.b = (value.b - low) * saturation / delta;
    }
    else
    {
        result.b = saturation;
        result.r = (value.r - low) * saturation / delta;
        result.g = (value.g - low) * saturation / delta;
    }
    return result;
}

float3 blendColor(float3 backdrop, float3 source, uint mode)
{
    if (mode == 1u)
    {
        return backdrop * source;
    }
    if (mode == 2u)
    {
        return backdrop + source - backdrop * source;
    }
    if (mode == 3u)
    {
        return lerp(2.0 * backdrop * source,
            1.0 - 2.0 * (1.0 - backdrop) * (1.0 - source),
            step(float3(0.5), backdrop));
    }
    if (mode == 4u)
    {
        return min(backdrop, source);
    }
    if (mode == 5u)
    {
        return max(backdrop, source);
    }
    if (mode == 6u)
    {
        return lerp(min(float3(1.0), backdrop / max(float3(1e-6), 1.0 - source)),
            float3(1.0), step(float3(1.0), source));
    }
    if (mode == 7u)
    {
        return lerp(float3(0.0), 1.0 - min(float3(1.0), (1.0 - backdrop) / max(float3(1e-6), source)),
            step(float3(1e-6), source));
    }
    if (mode == 8u)
    {
        return lerp(2.0 * backdrop * source,
            1.0 - 2.0 * (1.0 - backdrop) * (1.0 - source),
            step(float3(0.5), source));
    }
    if (mode == 9u)
    {
        float3 low = backdrop - (1.0 - 2.0 * source) * backdrop * (1.0 - backdrop);
        float3 d = lerp(float3(0.0),
            lerp(((16.0 * backdrop - 12.0) * backdrop + 4.0) * backdrop, sqrt(backdrop),
                step(float3(0.25), backdrop)),
            step(float3(0.5), source));
        return lerp(low, (2.0 * source - 1.0) * (d - backdrop) + backdrop,
            step(float3(0.5), source));
    }
    if (mode == 10u)
    {
        return abs(backdrop - source);
    }
    if (mode == 11u)
    {
        return backdrop + source - 2.0 * backdrop * source;
    }
    if (mode == 12u)
    {
        return setLuminance(setSaturation(source, channelMax(backdrop) - channelMin(backdrop)),
            luminance(backdrop));
    }
    if (mode == 13u)
    {
        return setLuminance(setSaturation(backdrop, channelMax(source) - channelMin(source)),
            luminance(backdrop));
    }
    if (mode == 14u)
    {
        return setLuminance(source, luminance(backdrop));
    }
    return setLuminance(backdrop, luminance(source));
}

void shade()
{
    float2 sourceUv = pc.params.xy + uv * pc.params.zw;
    float4 source = sourceTexture.Sample(sourceUv);
    float4 backdrop = backdropTexture.Sample(sourceUv);
    float sourceAlpha = clamp(source.a * clamp(pc.radii.x, 0.0, 1.0), 0.0, 1.0);
    float backdropAlpha = clamp(backdrop.a, 0.0, 1.0);
    float3 sourceColor = sourceAlpha > 1e-6 ? source.rgb / max(source.a, 1e-6) : float3(0.0);
    float3 backdropColor = backdropAlpha > 1e-6 ? backdrop.rgb / backdropAlpha : float3(0.0);
    float3 blended = blendColor(clamp(backdropColor, 0.0, 1.0),
        clamp(sourceColor, 0.0, 1.0), pc.packedColorsExtra.w);
    float3 contribution = (1.0 - backdropAlpha) * source.rgb * clamp(pc.radii.x, 0.0, 1.0)
        + sourceAlpha * backdropAlpha * blended;
    float coverage = gooClipCoverage();
    outColor = float4(contribution * coverage, sourceAlpha * coverage);
}

#include "analytic_fragment_entry.slang"
