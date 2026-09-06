#include "primitive_record.slang"
static float2 uv;
static uint gooClipDrawOrdinal;
static uint gooPrimitiveRecordOrdinal;
static float4 gooFragmentPosition;
static float4 outColor;
#include "clip_chain.slang"

#define pc gooPrimitiveBuffer[gooPrimitiveRecordOrdinal]

float4 unpackColor(uint packedRgb, uint packedAlpha, uint alphaIndex)
{
    return float4(
        float(packedRgb & 0x7ffu) / 2047.0,
        float((packedRgb >> 11u) & 0x7ffu) / 2047.0,
        float((packedRgb >> 22u) & 0x3ffu) / 1023.0,
        float((packedAlpha >> (alphaIndex * 10u)) & 0x3ffu) / 1023.0);
}

float4 stopColor(uint index)
{
    if (index == 0u)
    {
        return unpackColor(pc.packedColors.x, pc.packedColors.w, 0u);
    }
    if (index == 1u)
    {
        return unpackColor(pc.packedColors.y, pc.packedColors.w, 1u);
    }
    if (index == 2u)
    {
        return unpackColor(pc.packedColors.z, pc.packedColors.w, 2u);
    }
    return unpackColor(pc.packedColorsExtra.x, pc.packedColorsExtra.y, 0u);
}

float stopPosition(uint index)
{
    if (index == 0u)
    {
        return pc.stopPositions.x;
    }
    if (index == 1u)
    {
        return pc.stopPositions.y;
    }
    if (index == 2u)
    {
        return pc.stopPositions.z;
    }
    return pc.stopPositions.w;
}

float4 interpolateStops(float value)
{
    uint count = clamp(pc.packedColorsExtra.z, 2u, 4u);
    if (value < stopPosition(0u))
    {
        return stopColor(0u);
    }
    for (uint index = 1u; index < 4u; index++)
    {
        if (index >= count)
        {
            break;
        }
        float left = stopPosition(index - 1u);
        float right = stopPosition(index);
        if (right <= left)
        {
            continue;
        }
        if (value < right)
        {
            float amount = clamp((value - left) / (right - left), 0.0, 1.0);
            return lerp(stopColor(index - 1u), stopColor(index), amount);
        }
    }
    return stopColor(count - 1u);
}

float roundedDistance(float2 point, float2 size, float4 cornerRadii)
{
    float2 centered = point - size * 0.5;
    bool left = centered.x < 0.0;
    bool top = centered.y < 0.0;
    float radius = top ? (left ? cornerRadii.x : cornerRadii.y) : (left ? cornerRadii.w : cornerRadii.z);
    radius = clamp(radius, 0.0, min(size.x, size.y) * 0.5);
    float2 q = abs(centered) - size * 0.5 + float2(radius);
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

float roundedCoverage()
{
    float2 point = uv * pc.rect.zw;
    float distance = roundedDistance(point, pc.rect.zw, pc.radii);
    float aa = max(length(float2(ddx(distance), ddy(distance))), 0.0001);
    return 1.0 - smoothstep(-0.5 * aa, 0.5 * aa, distance);
}

void shade()
{
    float2 direction = pc.params.zw - pc.params.xy;
    float amount = dot(uv - pc.params.xy, direction) / max(dot(direction, direction), 0.0001);
    outColor = interpolateStops(clamp(amount, 0.0, 1.0)) * roundedCoverage() * gooClipCoverage();
}

#include "analytic_fragment_entry.slang"
