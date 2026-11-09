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

float canonicalEdge(float2 point, float2 size, float4 radii, float distance)
{
    float2 gradient = float2(ddx(distance), ddy(distance));
    int2 phase = int2(pc.stopPositions.xy) & int2(1);
    float2 pointDx = ddx(point);
    float2 pointDy = ddy(point);
    if (any(phase != int2(0)))
    {
        int2 parity = int2(floor(gooFragmentPosition.xy + pc.stopPositions.xy)) & int2(1);
        float2 direction = 1.0 - 2.0 * float2(parity);
        gradient.x = (roundedDistance(point + pointDx * direction.x, size, radii) - distance) * direction.x;
        gradient.y = (roundedDistance(point + pointDy * direction.y, size, radii) - distance) * direction.y;
    }
    return max(abs(gradient.x) + abs(gradient.y), min(length(pointDx), length(pointDy)));
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

float blurredRowCoverage(float2 centered, float2 halfSize, float4 radii, float blur)
{
    float2 corner = centered.y < 0.0 ? radii.xy : radii.wz;
    float2 delta = min(halfSize.y - corner - abs(centered.y), 0.0);
    float2 extent = halfSize.x - corner + sqrt(max(corner * corner - delta * delta, 0.0));
    return gaussianCoverage(centered.x - extent.y, blur) - gaussianCoverage(centered.x + extent.x, blur);
}

float blurredRoundedCoverage(float2 point, float2 size, float4 cornerRadii, float distance, float blur)
{
    float sigma = blur * 0.5;
    if (distance >= 2.9 * sigma)
    {
        return 0.0;
    }
    if (distance <= -3.6 * sigma)
    {
        return 1.0;
    }
    float2 halfSize = size * 0.5;
    float4 radii = min(cornerRadii * normalizedRadiusScale(size, cornerRadii), min(halfSize.x, halfSize.y));
    float2 centered = point - halfSize;
    float rectangleRow = gaussianCoverage(centered.x - halfSize.x, blur) - gaussianCoverage(centered.x + halfSize.x, blur);
    float coverage = rectangleRow
        * (gaussianCoverage(centered.y - halfSize.y, blur) - gaussianCoverage(centered.y + halfSize.y, blur));
    float2 bands = float2(max(radii.x, radii.y), max(radii.z, radii.w));
    if (abs(centered.x) + 3.0 * sigma < halfSize.x - max(bands.x, bands.y))
    {
        return coverage;
    }
    for (int band = 0; band < 2; band++)
    {
        float side = band == 0 ? -1.0 : 1.0;
        float pointDepth = halfSize.y - side * centered.y;
        float lowRoot = sqrt(clamp(pointDepth - 3.0 * sigma, 0.0, bands[band]));
        float highRoot = sqrt(clamp(pointDepth + 3.0 * sigma, 0.0, bands[band]));
        if (highRoot <= lowRoot)
        {
            continue;
        }
        int count = int(clamp(ceil((highRoot - lowRoot) * sqrt(2.0 * bands[band]) / sigma), 2.0, 8.0));
        float step = (highRoot - lowRoot) / float(count);
        float previous = gaussianCoverage(lowRoot * lowRoot - pointDepth, blur);
        for (int index = 0; index < count; index++)
        {
            float rowRoot = lowRoot + (float(index) + 0.5) * step;
            float boundaryRoot = lowRoot + float(index + 1) * step;
            float next = gaussianCoverage(boundaryRoot * boundaryRoot - pointDepth, blur);
            coverage += (blurredRowCoverage(float2(centered.x, side * (halfSize.y - rowRoot * rowRoot)), halfSize, radii, blur)
                - rectangleRow) * (previous - next);
            previous = next;
        }
    }
    return coverage;
}

float roundedCoverage(float2 point, float2 size, float4 radii, float distance, float blur)
{
    if (blur <= 0.0)
    {
        return gooEdgeCoverage(distance, canonicalEdge(point, size, radii, distance));
    }
    return blurredRoundedCoverage(point, size, radii, distance, blur);
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

static const float2 shadowOffsets[8] =
{
    float2(1.0, 0.0), float2(-1.0, 0.0),
    float2(0.0, 1.0), float2(0.0, -1.0),
    float2(1.0, 1.0), float2(-1.0, 1.0),
    float2(1.0, -1.0), float2(-1.0, -1.0)
};

float shapeMaskSpread(float2 point, float spread)
{
    float center = shapeMaskSample(point);
    if (spread == 0.0)
    {
        return center;
    }
    float distance = abs(spread);
    [loop]
    for (int index = 0; index < 8; index++)
    {
        float coverage = shapeMaskSample(point + shadowOffsets[index] * distance);
        center = spread > 0.0 ? max(center, coverage) : min(center, coverage);
    }
    return center;
}

float shapeShadowCoverage(float2 point, float spread, float blur)
{
    if (blur <= 0.0)
    {
        return shapeMaskSpread(point, spread);
    }
    float radius = max(blur * 0.75, 0.5);
    float result = shapeMaskSpread(point, spread) * 0.25;
    [loop]
    for (int index = 0; index < 8; index++)
    {
        float weight = index < 4 ? 0.125 : 0.0625;
        result += shapeMaskSpread(point + shadowOffsets[index] * radius, spread) * weight;
    }
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
    float neighbor = 1.0;
    [loop]
    for (int index = 0; index < 8; index++)
    {
        neighbor = min(neighbor, shapeMaskSpread(point + shadowOffsets[index] * radius, spread));
    }
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
    float exterior = 1.0;
    if ((pc.packedColorsExtra.y & 1u) != 0u)
    {
        float2 screenPoint = gooClipScreenPosition();
        float2 sourcePoint = screenPoint - float2(offsetX, offsetY);
        coverage = pc.packedColorsExtra.x == 1u
            ? shapeInsetCoverage(sourcePoint, spread, blur)
            : shapeShadowCoverage(sourcePoint, spread, blur);
    }
    else
    {
        bool inset = pc.packedColorsExtra.x == 1u;
        float2 shapeOffset = float2(inset ? expansion + spread : expansion - spread);
        float2 shapeSize = pc.rect.zw - shapeOffset * 2.0;
        float4 shapeRadii = inset ? max(pc.radii - float4(spread), float4(0.0)) : pc.radii;
        coverage = 0.0;
        if (!inset || (shapeSize.x > 0.0 && shapeSize.y > 0.0))
        {
            float shapeDistance = roundedDistance(point - shapeOffset, shapeSize, shapeRadii);
            coverage = roundedCoverage(point - shapeOffset, shapeSize, shapeRadii, shapeDistance, blur);
        }
        if (inset)
        {
            float2 baseOffset = float2(expansion - offsetX, expansion - offsetY);
            float2 baseSize = max(pc.rect.zw - float2(expansion * 2.0), float2(0.0001));
            float baseDistance = roundedDistance(point - baseOffset, baseSize, pc.radii);
            coverage = gooEdgeCoverage(baseDistance, canonicalEdge(point - baseOffset, baseSize, pc.radii, baseDistance))
                * (1.0 - coverage);
        }
        else
        {
            float2 boxOffset = float2(expansion - offsetX, expansion - offsetY);
            float2 boxSize = pc.rect.zw - float2(expansion * 2.0);
            float boxDistance = roundedDistance(point - boxOffset, boxSize, pc.radii);
            exterior = saturate(1.5 + boxDistance / canonicalEdge(point - boxOffset, boxSize, pc.radii, boxDistance));
        }
    }
    float4 color = unpackColor(pc.packedColors.x, pc.packedColors.w, 0u);
    if ((pc.packedColorsExtra.y & 1u) == 0u)
    {
        float noise = frac(52.9829189 * frac(dot(floor(gooFragmentPosition.xy + pc.stopPositions.xy), float2(0.06711056, 0.00583715))));
        coverage = saturate(coverage + (noise - 0.5) / (255.0 * max(color.a, 0.004)));
    }
    outColor = color * coverage * exterior * gooClipCoverage();
}

#include "analytic_fragment_entry.slang"
