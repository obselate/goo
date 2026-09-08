#include "primitive_record.slang"
static float2 uv;
static uint gooClipDrawOrdinal;
static uint gooPrimitiveRecordOrdinal;
static float4 gooFragmentPosition;
static float4 outColor;
#include "clip_chain.slang"

#define pc gooPrimitiveBuffer[gooPrimitiveRecordOrdinal]

#include "gradient_stops.slang"

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
