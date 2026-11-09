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

float coverageDistance(float2 point, float2 size, float4 radii, bool normalized)
{
    return normalized ? gooRoundedRectDistance(point, size, radii)
        : roundedDistance(point, size, radii);
}

float canonicalAa(float2 point, float2 size, float4 radii, bool normalized, float distance)
{
    float2 gradient = float2(ddx(distance), ddy(distance));
    int2 phase = int2(pc.stopPositions.xy) & int2(1);
    float2 pointDx = ddx(point);
    float2 pointDy = ddy(point);
    if (any(phase != int2(0)))
    {
        int2 parity = int2(floor(gooFragmentPosition.xy + pc.stopPositions.xy)) & int2(1);
        float2 direction = 1.0 - 2.0 * float2(parity);
        gradient.x = (coverageDistance(point + pointDx * direction.x, size, radii, normalized) - distance) * direction.x;
        gradient.y = (coverageDistance(point + pointDy * direction.y, size, radii, normalized) - distance) * direction.y;
    }
    return max(length(gradient), 0.0001);
}

void shade()
{
    if (pc.params.z == 1.0)
    {
        outColor = unpackColor(pc.packedColors.x, pc.packedColors.w, 0u);
        return;
    }
    float2 point = uv * pc.rect.zw;
    bool normalized = pc.params.x > 0.0 && pc.params.y > 0.0;
    float4 radii = normalized ? gooNormalizeRadii(pc.rect.zw, pc.radii) : pc.radii;
    float distance = coverageDistance(point, pc.rect.zw, radii, normalized);
    float aa = canonicalAa(point, pc.rect.zw, radii, normalized, distance);
    float coverage = gooEdgeCoverage(distance, aa);
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
            float innerAa = canonicalAa(point - inset, innerSize, innerRadii, true, innerDistance);
            innerCoverage = 1.0 - gooEdgeCoverage(innerDistance, innerAa);
        }
        // Match the border shader: the border covers the outer shape minus the inner one, and the
        // background drawn beneath it is scaled so the border composites to exactly that coverage.
        float innerFill = min(1.0 - innerCoverage, coverage);
        float borderCoverage = max(coverage - innerFill, 0.0);
        float remaining = 1.0 - borderCoverage;
        backgroundCoverage = remaining > 0.00001
            ? innerFill / remaining
            : 1.0;
    }
    outColor = unpackColor(pc.packedColors.x, pc.packedColors.w, 0u)
        * backgroundCoverage * gooClipCoverage();
}

#include "analytic_fragment_entry.slang"
