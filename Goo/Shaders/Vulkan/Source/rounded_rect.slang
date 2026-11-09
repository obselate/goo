#ifndef GOO_ROUNDED_RECT_SLANG
#define GOO_ROUNDED_RECT_SLANG
float4 gooNormalizeRadii(float2 size, float4 source)
{
    float4 result = max(source, float4(0.0));
    float scale = 1.0;
    float sum = result.x + result.y;
    if (sum > size.x && sum > 0.0)
    {
        scale = min(scale, size.x / sum);
    }
    sum = result.w + result.z;
    if (sum > size.x && sum > 0.0)
    {
        scale = min(scale, size.x / sum);
    }
    sum = result.x + result.w;
    if (sum > size.y && sum > 0.0)
    {
        scale = min(scale, size.y / sum);
    }
    sum = result.y + result.z;
    if (sum > size.y && sum > 0.0)
    {
        scale = min(scale, size.y / sum);
    }
    return result * scale;
}

float gooRoundedRectDistance(float2 point, float2 size, float4 cornerRadii)
{
    if (size.x <= 0.0 || size.y <= 0.0)
    {
        return 1000000.0;
    }
    float2 centered = point - size * 0.5;
    float radius;
    if (centered.x < 0.0)
    {
        radius = centered.y < 0.0 ? cornerRadii.x : cornerRadii.w;
    }
    else
    {
        radius = centered.y < 0.0 ? cornerRadii.y : cornerRadii.z;
    }
    float2 q = abs(centered) - size * 0.5 + float2(radius);
    return length(max(q, float2(0.0))) + min(max(q.x, q.y), 0.0) - radius;
}

float gooCornerCut(float2 offset, float radius, float2 extent)
{
    float2 low = clamp(offset + radius - extent, 0.0, radius);
    float2 high = clamp(offset + radius + extent, 0.0, radius);
    if (any(high <= low))
    {
        return 0.0;
    }
    float first = clamp(sqrt((radius - high.y) * (radius + high.y)), low.x, high.x);
    float second = clamp(sqrt((radius - low.y) * (radius + low.y)), low.x, high.x);
    float firstHeight = sqrt((radius - first) * (radius + first));
    float secondHeight = sqrt((radius - second) * (radius + second));
    float angle = 2.0 * asin(min(length(float2(second - first, firstHeight - secondHeight)) / max(2.0 * radius, 0.000001), 1.0));
    float angleSquared = angle * angle;
    float segment = radius * radius * angle * angleSquared / 12.0 * (1.0 - angleSquared / 20.0 + angleSquared * angleSquared / 840.0);
    float inside = (high.y - low.y) * (first - low.x) + (second - first) * ((firstHeight + secondHeight) * 0.5 - low.y) + segment;
    return (high.x - low.x) * (high.y - low.y) - inside;
}

float gooTransformedEdgeCoverage(float2 point, float2 size, float4 cornerRadii, float2 pointDx, float2 pointDy)
{
    float2 centered = point - size * 0.5;
    float radius = centered.x < 0.0
        ? (centered.y < 0.0 ? cornerRadii.x : cornerRadii.w)
        : (centered.y < 0.0 ? cornerRadii.y : cornerRadii.z);
    float2 q = abs(centered) - size * 0.5 + radius;
    float2 normal = max(q, 0.0);
    normal = dot(normal, normal) > 0.0
        ? normalize(normal)
        : (q.x > q.y ? float2(1.0, 0.0) : float2(0.0, 1.0));
    normal *= sign(centered);
    float2 gradient = abs(float2(dot(normal, pointDx), dot(normal, pointDy)));
    float width = max(length(gradient), 0.0001);
    float2 span = float2(max(gradient.x, gradient.y), max(min(gradient.x, gradient.y), 0.000001 * width)) / width;
    float offset = (radius - length(max(q, 0.0)) - min(max(q.x, q.y), 0.0)) / width;
    float tail = max((span.x + span.y) * 0.5 - abs(offset), 0.0);
    tail = tail * tail / (2.0 * span.x * span.y);
    return abs(offset) <= (span.x - span.y) * 0.5 ? 0.5 + offset / span.x : (offset > 0.0 ? 1.0 - tail : tail);
}

float gooRoundedRectCoverage(float2 point, float2 size, float4 cornerRadii, float2 pointDx, float2 pointDy)
{
    if (abs(pointDx.y) + abs(pointDy.x) > 0.0001 * (abs(pointDx.x) + abs(pointDy.y)))
    {
        return gooTransformedEdgeCoverage(point, size, cornerRadii, pointDx, pointDy);
    }
    float2 extent = max(0.5 * float2(length(float2(pointDx.x, pointDy.x)), length(float2(pointDx.y, pointDy.y))), float2(0.0001));
    float2 centered = point - size * 0.5;
    float2 overlap = min(saturate(0.5 + (size * 0.5 - abs(centered)) / (2.0 * extent)), size / (2.0 * extent));
    float cut = gooCornerCut(-centered - size * 0.5, cornerRadii.x, extent)
        + gooCornerCut(float2(centered.x, -centered.y) - size * 0.5, cornerRadii.y, extent)
        + gooCornerCut(centered - size * 0.5, cornerRadii.z, extent)
        + gooCornerCut(float2(-centered.x, centered.y) - size * 0.5, cornerRadii.w, extent);
    return saturate(overlap.x * overlap.y - cut / (4.0 * extent.x * extent.y));
}
#endif
