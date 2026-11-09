#include "primitive_record.slang"
static float2 uv;
static uint gooClipDrawOrdinal;
static uint gooPrimitiveRecordOrdinal;
static float4 gooFragmentPosition;
static float4 outColor;
#include "clip_chain.slang"
#include "rounded_rect.slang"

#define pc gooPrimitiveBuffer[gooPrimitiveRecordOrdinal]

#include "gradient_stops.slang"

float roundedCoverage()
{
    float2 point = uv * pc.rect.zw;
    return gooRoundedRectCoverage(point, pc.rect.zw, pc.radii, ddx(point), ddy(point));
}

void shade()
{
    float2 direction = pc.params.zw - pc.params.xy;
    float amount = dot(uv - pc.params.xy, direction) / max(dot(direction, direction), 0.0001);
    outColor = ditherGradient(interpolateStops(clamp(amount, 0.0, 1.0))) * roundedCoverage() * gooClipCoverage();
}

#include "analytic_fragment_entry.slang"
