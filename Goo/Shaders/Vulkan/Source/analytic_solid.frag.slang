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

void shade()
{
    if (pc.params.z == 1.0)
    {
        outColor = unpackColor(pc.packedColors.x, pc.packedColors.w, 0u);
        return;
    }
    float2 point = uv * pc.rect.zw;
    float2 pointDx = ddx(point);
    float2 pointDy = ddy(point);
    float4 radii = gooNormalizeRadii(pc.rect.zw, pc.radii);
    float coverage = gooRoundedRectCoverage(point, pc.rect.zw, radii, pointDx, pointDy);
    float backgroundCoverage = coverage;
    if (pc.params.x > 0.0 && pc.params.y > 0.0)
    {
        float2 inset = pc.params.xy;
        float2 innerSize = max(pc.rect.zw - inset * 2.0, float2(0.0));
        float innerCoverage = 1.0;
        if (innerSize.x > 0.0 && innerSize.y > 0.0)
        {
            float4 innerRadii = gooNormalizeRadii(innerSize,
                max(radii - float4(max(inset.x, inset.y)), float4(0.0)));
            innerCoverage = 1.0 - gooRoundedRectCoverage(point - inset, innerSize, innerRadii, pointDx, pointDy);
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
