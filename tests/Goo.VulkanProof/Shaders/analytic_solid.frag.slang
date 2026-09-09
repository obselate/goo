#include "primitive_record.slang"
static float2 uv;
static uint gooClipDrawOrdinal;
static uint gooPrimitiveRecordOrdinal;
static float4 gooFragmentPosition;
static float4 outColor;
#include "clip_chain.slang"
#include "rounded_rect.slang"

#define pc gooPrimitiveBuffer[gooPrimitiveRecordOrdinal]

float4 unpackColor(uint packedRgb, uint packedAlpha, uint alphaIndex)
{
    return float4(
        float(packedRgb & 0x7ffu) / 2047.0,
        float((packedRgb >> 11u) & 0x7ffu) / 2047.0,
        float((packedRgb >> 22u) & 0x3ffu) / 1023.0,
        float((packedAlpha >> (alphaIndex * 10u)) & 0x3ffu) / 1023.0);
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

void shade()
{
    float2 point = uv * pc.rect.zw;
    float distance = pc.params.x > 0.0 && pc.params.y > 0.0
        ? gooRoundedRectDistance(point, pc.rect.zw, gooNormalizeRadii(pc.rect.zw, pc.radii))
        : roundedDistance(point, pc.rect.zw, pc.radii);
    float aa = max(length(float2(ddx(distance), ddy(distance))), 0.0001);
    float coverage = 1.0 - smoothstep(-0.5 * aa, 0.5 * aa, distance);
    float backgroundCoverage = coverage;
    if (pc.params.x > 0.0 && pc.params.y > 0.0)
    {
        float2 inset = pc.params.xy;
        float2 innerSize = max(pc.rect.zw - inset * 2.0, float2(0.0));
        float innerCoverage = 1.0;
        if (innerSize.x > 0.0 && innerSize.y > 0.0)
        {
            float4 outerRadii = gooNormalizeRadii(pc.rect.zw, pc.radii);
            float4 innerRadii = gooNormalizeRadii(innerSize,
                max(outerRadii - float4(max(inset.x, inset.y)), float4(0.0)));
            float innerDistance = gooRoundedRectDistance(
                point - inset, innerSize, innerRadii);
            float innerAa = max(length(float2(ddx(innerDistance), ddy(innerDistance))), 0.0001);
            innerCoverage = smoothstep(-0.5 * innerAa, 0.5 * innerAa, innerDistance);
        }
        float borderCoverage = coverage * innerCoverage;
        float remaining = 1.0 - borderCoverage;
        backgroundCoverage = remaining > 0.00001
            ? coverage * (1.0 - innerCoverage) / remaining
            : 1.0;
    }
    outColor = unpackColor(pc.packedColors.x, pc.packedColors.w, 0u)
        * backgroundCoverage * gooClipCoverage();
}

#include "analytic_fragment_entry.slang"
