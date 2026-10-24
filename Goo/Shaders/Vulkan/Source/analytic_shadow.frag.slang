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

float normalizedRadiusScale(float2 size, float4 cornerRadii)
{
    float scale = 1.0;
    float width = max(size.x, 0.0);
    float height = max(size.y, 0.0);
    float top = cornerRadii.x + cornerRadii.y;
    float right = cornerRadii.y + cornerRadii.z;
    float bottom = cornerRadii.w + cornerRadii.z;
    float left = cornerRadii.x + cornerRadii.w;
    if (top > width) scale = min(scale, width / top);
    if (right > height) scale = min(scale, height / right);
    if (bottom > width) scale = min(scale, width / bottom);
    if (left > height) scale = min(scale, height / left);
    return clamp(scale, 0.0, 1.0);
}

float roundedDistance(float2 point, float2 size, float4 cornerRadii)
{
    float2 centered = point - size * 0.5;
    bool left = centered.x < 0.0;
    bool top = centered.y < 0.0;
    float4 normalizedRadii = cornerRadii * normalizedRadiusScale(size, cornerRadii);
    float radius = top ? (left ? normalizedRadii.x : normalizedRadii.y)
        : (left ? normalizedRadii.w : normalizedRadii.z);
    radius = clamp(radius, 0.0, min(size.x, size.y) * 0.5);
    float2 q = abs(centered) - size * 0.5 + float2(radius);
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

float gaussianCoverage(float distance, float blur)
{
    if (blur <= 0.0)
    {
        return distance <= 0.0 ? 1.0 : 0.0;
    }
    float x = distance / (blur * 0.707106781185);
    float absoluteX = abs(x);
    float t = 1.0 / (1.0 + 0.3275911 * absoluteX);
    float polynomial = t * (0.254829592 + t * (-0.284496736
        + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
    float erfAbsoluteX = 1.0 - polynomial * exp(-absoluteX * absoluteX);
    float erfX = x < 0.0 ? -erfAbsoluteX : erfAbsoluteX;
    return 0.5 * (1.0 - erfX);
}

float roundedCoverage(float distance, float blur)
{
    if (blur <= 0.0)
    {
        return 1.0 - smoothstep(0.0, max(fwidth(distance), 0.0001), distance);
    }
    return gaussianCoverage(distance, blur);
}

float shapeMaskSample(float2 screenPoint)
{
    uint packedMask = pc.packedColorsExtra.y;
    if ((packedMask & 1u) == 0u)
    {
        return 0.0;
    }
    float2 origin = float2(
        asfloat(pc.packedColorsExtra.z),
        asfloat(pc.packedColorsExtra.w));
    float2 size = float2(
        asfloat(pc.packedColors.y),
        asfloat(pc.packedColors.z));
    if (screenPoint.x < origin.x || screenPoint.y < origin.y
        || screenPoint.x >= origin.x + size.x
        || screenPoint.y >= origin.y + size.y)
    {
        return 0.0;
    }
    uint layer = packedMask >> 1u;
    float2 atlasUv = screenPoint * pc.stopPositions.xy + pc.stopPositions.zw;
    if (atlasUv.x < 0.0 || atlasUv.y < 0.0 || atlasUv.x >= 1.0 || atlasUv.y >= 1.0)
    {
        return 0.0;
    }
    return clamp(gooClipMaskAtlas.Sample(float3(atlasUv, float(layer))).r, 0.0, 1.0);
}

float shapeMaskSpread(float2 point, float spread)
{
    float center = shapeMaskSample(point);
    if (spread == 0.0)
    {
        return center;
    }
    float distance = abs(spread);
    float horizontal;
    float vertical;
    float diagonal;
    if (spread > 0.0)
    {
        horizontal = max(shapeMaskSample(point + float2(distance, 0.0)),
            shapeMaskSample(point - float2(distance, 0.0)));
        vertical = max(shapeMaskSample(point + float2(0.0, distance)),
            shapeMaskSample(point - float2(0.0, distance)));
        diagonal = max(shapeMaskSample(point + float2(distance, distance)),
            shapeMaskSample(point + float2(-distance, distance)));
        diagonal = max(diagonal, shapeMaskSample(point + float2(distance, -distance)));
        diagonal = max(diagonal, shapeMaskSample(point - float2(distance, distance)));
        return max(center, max(max(horizontal, vertical), diagonal));
    }
    horizontal = min(shapeMaskSample(point + float2(distance, 0.0)),
        shapeMaskSample(point - float2(distance, 0.0)));
    vertical = min(shapeMaskSample(point + float2(0.0, distance)),
        shapeMaskSample(point - float2(0.0, distance)));
    diagonal = min(shapeMaskSample(point + float2(distance, distance)),
        shapeMaskSample(point + float2(-distance, distance)));
    diagonal = min(diagonal, shapeMaskSample(point + float2(distance, -distance)));
    diagonal = min(diagonal, shapeMaskSample(point - float2(distance, distance)));
    return min(center, min(min(horizontal, vertical), diagonal));
}

float shapeShadowCoverage(float2 point, float spread, float blur)
{
    if (blur <= 0.0)
    {
        return shapeMaskSpread(point, spread);
    }
    float radius = max(blur * 0.75, 0.5);
    float result = shapeMaskSpread(point, spread) * 0.25;
    result += shapeMaskSpread(point + float2(radius, 0.0), spread) * 0.125;
    result += shapeMaskSpread(point + float2(-radius, 0.0), spread) * 0.125;
    result += shapeMaskSpread(point + float2(0.0, radius), spread) * 0.125;
    result += shapeMaskSpread(point + float2(0.0, -radius), spread) * 0.125;
    result += shapeMaskSpread(point + float2(radius, radius), spread) * 0.0625;
    result += shapeMaskSpread(point + float2(-radius, radius), spread) * 0.0625;
    result += shapeMaskSpread(point + float2(radius, -radius), spread) * 0.0625;
    result += shapeMaskSpread(point - float2(radius, radius), spread) * 0.0625;
    return clamp(result, 0.0, 1.0);
}

float shapeInsetCoverage(float2 point, float spread, float blur)
{
    float center = shapeMaskSpread(point, spread);
    if (center <= 0.0)
    {
        return 0.0;
    }
    float radius = max(max(abs(spread), blur), 1.0);
    float neighbor = shapeMaskSpread(point + float2(radius, 0.0), spread);
    neighbor = min(neighbor, shapeMaskSpread(point + float2(-radius, 0.0), spread));
    neighbor = min(neighbor, shapeMaskSpread(point + float2(0.0, radius), spread));
    neighbor = min(neighbor, shapeMaskSpread(point + float2(0.0, -radius), spread));
    neighbor = min(neighbor, shapeMaskSpread(point + float2(radius, radius), spread));
    neighbor = min(neighbor, shapeMaskSpread(point + float2(-radius, radius), spread));
    neighbor = min(neighbor, shapeMaskSpread(point + float2(radius, -radius), spread));
    neighbor = min(neighbor, shapeMaskSpread(point - float2(radius, radius), spread));
    return clamp(center - neighbor, 0.0, 1.0);
}

void shade()
{
    float spread = pc.params.x;
    float blur = pc.params.y;
    float offsetX = pc.params.z;
    float offsetY = pc.params.w;
    float blurExtent = blur > 0.0 ? blur * 2.0 + 2.0 : 0.0;
    float expansion = pc.packedColorsExtra.x == 1u
        ? max(blurExtent, max(abs(offsetX), abs(offsetY)))
        : blurExtent + max(spread, 0.0);
    float2 point = uv * pc.rect.zw;
    float coverage;
    if ((pc.packedColorsExtra.y & 1u) != 0u)
    {
        float2 screenPoint = gooClipScreenPosition();
        float2 sourcePoint = screenPoint - float2(offsetX, offsetY);
        coverage = pc.packedColorsExtra.x == 1u
            ? shapeInsetCoverage(sourcePoint, spread, blur)
            : shapeShadowCoverage(sourcePoint, spread, blur);
    }
    else if (pc.packedColorsExtra.x == 1u)
    {
        float2 baseOffset = float2(expansion - offsetX, expansion - offsetY);
        float2 baseSize = max(pc.rect.zw - float2(expansion * 2.0), float2(0.0001));
        float baseDistance = roundedDistance(point - baseOffset, baseSize, pc.radii);
        float baseEdge = max(fwidth(baseDistance), 0.0001);
        float inside = 1.0 - smoothstep(0.0, baseEdge, baseDistance);
        float2 holeOffset = float2(expansion + spread);
        float2 rawHoleSize = pc.rect.zw - holeOffset * 2.0;
        float outsideHole = 1.0;
        if (rawHoleSize.x > 0.0 && rawHoleSize.y > 0.0)
        {
            float2 holeSize = rawHoleSize;
            float4 holeRadii = max(pc.radii - float4(spread), float4(0.0));
            float holeDistance = roundedDistance(point - holeOffset, holeSize, holeRadii);
            float edge = max(fwidth(holeDistance), 0.0001);
            outsideHole = blur <= 0.0 ? smoothstep(0.0, edge, holeDistance)
                : 1.0 - gaussianCoverage(holeDistance, blur);
        }
        coverage = inside * outsideHole;
    }
    else
    {
        float2 shapeOffset = float2(expansion - spread);
        float2 shapeSize = pc.rect.zw - shapeOffset * 2.0;
        float4 shapeRadii = pc.radii;
        float shadowDistance = roundedDistance(point - shapeOffset, shapeSize, shapeRadii);
        coverage = roundedCoverage(shadowDistance, blur);
    }
    outColor = unpackColor(pc.packedColors.x, pc.packedColors.w, 0u) * coverage * gooClipCoverage();
}

#include "analytic_fragment_entry.slang"
