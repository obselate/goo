#include "primitive_record.slang"

[[vk::binding(0, 0)]] Sampler2D imageTexture;
[[vk::binding(0, 3)]] StructuredBuffer<uint> gooStrokeBuffer;

static float2 uv;
static uint gooClipDrawOrdinal;
static uint gooPrimitiveRecordOrdinal;
static float4 gooFragmentPosition;
static float4 outColor;

#include "clip_chain.slang"
#include "path_stroke_eval.slang"

#define pc gooPrimitiveBuffer[gooPrimitiveRecordOrdinal]

static const uint GooUiKindSolid = 0u;
static const uint GooUiKindShadow = 1u;
static const uint GooUiKindBorder = 2u;
static const uint GooUiKindLinearGradient = 3u;
static const uint GooUiKindRadialGradient = 4u;
static const uint GooUiKindSampledImage = 5u;

float4 unpackColor(uint packedRgb, uint packedAlpha, uint alphaIndex)
{
    return float4(
        float(packedRgb & 0x7ffu) / 2047.0,
        float((packedRgb >> 11u) & 0x7ffu) / 2047.0,
        float((packedRgb >> 22u) & 0x3ffu) / 1023.0,
        float((packedAlpha >> (alphaIndex * 10u)) & 0x3ffu) / 1023.0);
}

// --- Solid ---
void shadeSolid(float2 point, float2 pointDx, float2 pointDy)
{
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
        float innerFill = min(1.0 - innerCoverage, coverage);
        float borderCoverage = max(coverage - innerFill, 0.0);
        float remaining = 1.0 - borderCoverage;
        backgroundCoverage = remaining > 0.00001 ? innerFill / remaining : 1.0;
    }
    outColor = unpackColor(pc.packedColors.x, pc.packedColors.w, 0u)
        * backgroundCoverage;
}

// --- Shadow (Box & Analytic Path/Stroke Shape) ---
float normalizedShadowRadiusScale(float2 size, float4 cornerRadii)
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

float shadowRoundedDistance(float2 point, float2 size, float4 cornerRadii)
{
    float2 centered = point - size * 0.5;
    bool left = centered.x < 0.0;
    bool top = centered.y < 0.0;
    float4 normalizedRadii = cornerRadii * normalizedShadowRadiusScale(size, cornerRadii);
    float radius = top ? (left ? normalizedRadii.x : normalizedRadii.y)
        : (left ? normalizedRadii.w : normalizedRadii.z);
    radius = clamp(radius, 0.0, min(size.x, size.y) * 0.5);
    float2 q = abs(centered) - size * 0.5 + float2(radius);
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

float shadowCanonicalEdge(float2 point, float2 size, float4 radii, float distance, float2 pointDx, float2 pointDy)
{
    int2 parity = int2(floor(gooFragmentPosition.xy + pc.stopPositions.xy)) & int2(1);
    float2 direction = 1.0 - 2.0 * float2(parity);
    float2 gradient = float2(
        (shadowRoundedDistance(point + pointDx * direction.x, size, radii) - distance) * direction.x,
        (shadowRoundedDistance(point + pointDy * direction.y, size, radii) - distance) * direction.y);
    return max(abs(gradient.x) + abs(gradient.y), min(length(pointDx), length(pointDy)));
}

float shadowGaussianCoverage(float distance, float blur)
{
    if (blur <= 0.0) return distance <= 0.0 ? 1.0 : 0.0;
    float x = distance / (blur * 0.707106781185);
    float absoluteX = abs(x);
    float t = 1.0 / (1.0 + 0.3275911 * absoluteX);
    float polynomial = t * (0.254829592 + t * (-0.284496736
        + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
    float erfAbsoluteX = 1.0 - polynomial * exp(-absoluteX * absoluteX);
    float erfX = x < 0.0 ? -erfAbsoluteX : erfAbsoluteX;
    return 0.5 * (1.0 - erfX);
}

float shadowBlurredRowCoverage(float2 centered, float2 halfSize, float4 radii, float blur)
{
    float2 corner = centered.y < 0.0 ? radii.xy : radii.wz;
    float2 delta = min(halfSize.y - corner - abs(centered.y), 0.0);
    float2 extent = halfSize.x - corner + sqrt(max(corner * corner - delta * delta, 0.0));
    return shadowGaussianCoverage(centered.x - extent.y, blur)
        - shadowGaussianCoverage(centered.x + extent.x, blur);
}

float shadowBlurredRoundedCoverage(float2 point, float2 size, float4 cornerRadii, float distance, float blur)
{
    float sigma = blur * 0.5;
    if (distance >= 2.9 * sigma) return 0.0;
    if (distance <= -3.6 * sigma) return 1.0;
    float2 halfSize = size * 0.5;
    float4 radii = min(cornerRadii * normalizedShadowRadiusScale(size, cornerRadii), min(halfSize.x, halfSize.y));
    float2 centered = point - halfSize;
    float rectangleRow = shadowGaussianCoverage(centered.x - halfSize.x, blur)
        - shadowGaussianCoverage(centered.x + halfSize.x, blur);
    float coverage = rectangleRow
        * (shadowGaussianCoverage(centered.y - halfSize.y, blur)
            - shadowGaussianCoverage(centered.y + halfSize.y, blur));
    float2 bands = float2(max(radii.x, radii.y), max(radii.z, radii.w));
    if (abs(centered.x) + 3.0 * sigma < halfSize.x - max(bands.x, bands.y)) return coverage;
    [loop]
    for (int band = 0; band < 2; band++)
    {
        float side = band == 0 ? -1.0 : 1.0;
        float pointDepth = halfSize.y - side * centered.y;
        float lowRoot = sqrt(clamp(pointDepth - 3.0 * sigma, 0.0, bands[band]));
        float highRoot = sqrt(clamp(pointDepth + 3.0 * sigma, 0.0, bands[band]));
        if (highRoot <= lowRoot) continue;
        int count = int(clamp(ceil((highRoot - lowRoot) * sqrt(2.0 * bands[band]) / sigma), 2.0, 8.0));
        float step = (highRoot - lowRoot) / float(count);
        float previous = shadowGaussianCoverage(lowRoot * lowRoot - pointDepth, blur);
        [loop]
        for (int index = 0; index < count; index++)
        {
            float rowRoot = lowRoot + (float(index) + 0.5) * step;
            float boundaryRoot = lowRoot + float(index + 1) * step;
            float next = shadowGaussianCoverage(boundaryRoot * boundaryRoot - pointDepth, blur);
            coverage += (shadowBlurredRowCoverage(float2(centered.x, side * (halfSize.y - rowRoot * rowRoot)),
                halfSize, radii, blur) - rectangleRow) * (previous - next);
            previous = next;
        }
    }
    return coverage;
}

float shadowRoundedCoverage(float2 point, float2 size, float4 radii, float distance, float blur,
    float2 pointDx, float2 pointDy)
{
    if (blur <= 0.0) return gooEdgeCoverage(distance, shadowCanonicalEdge(point, size, radii, distance, pointDx, pointDy));
    return shadowBlurredRoundedCoverage(point, size, radii, distance, blur);
}

float shapeMaskSample(float2 screenPoint)
{
    uint packedMask = pc.packedColorsExtra.y;
    if ((packedMask & 1u) == 0u) return 0.0;
    uint recordIndex = packedMask >> 1u;
    uint recordCount = gooScissorBuffer[2u];
    uint recordTableBase = gooScissorBuffer[3u];
    if (recordIndex >= recordCount) return 0.0;
    uint entryBase = recordTableBase + recordIndex * GooScissorRecordWords;
    uint kind = gooScissorBuffer[entryBase + 20u];
    if (kind == GooScissorKindZero) return 0.0;
    float4 screenBounds = float4(
        asfloat(gooScissorBuffer[entryBase + 0u]),
        asfloat(gooScissorBuffer[entryBase + 1u]),
        asfloat(gooScissorBuffer[entryBase + 2u]),
        asfloat(gooScissorBuffer[entryBase + 3u]));
    if (screenPoint.x < screenBounds.x || screenPoint.y < screenBounds.y
        || screenPoint.x >= screenBounds.z || screenPoint.y >= screenBounds.w)
    {
        return 0.0;
    }
    uint strokeEntryPlusOne = gooScissorBuffer[entryBase + 23u];
    if (strokeEntryPlusOne == 0u)
    {
        return gooScissorRecordCoverage(recordIndex, screenPoint);
    }
    float4 local0 = float4(
        asfloat(gooScissorBuffer[entryBase + 4u]),
        asfloat(gooScissorBuffer[entryBase + 5u]),
        asfloat(gooScissorBuffer[entryBase + 6u]),
        asfloat(gooScissorBuffer[entryBase + 7u]));
    float4 local1 = float4(
        asfloat(gooScissorBuffer[entryBase + 8u]),
        asfloat(gooScissorBuffer[entryBase + 9u]),
        asfloat(gooScissorBuffer[entryBase + 10u]),
        asfloat(gooScissorBuffer[entryBase + 11u]));
    float3 screenH = float3(screenPoint, 1.0);
    float2 pathPos = float2(dot(local0.xyz, screenH), dot(local1.xyz, screenH));
    float2 stepX = float2(local0.x, local1.x);
    float2 stepY = float2(local0.y, local1.y);
    float2 sampleWindow = pc.stopPositions.zw;
    uint pathWordOffset = gooScissorBuffer[entryBase + 21u];
    uint fillRule = gooScissorBuffer[entryBase + 22u];
    return gooEvaluatePathStroke(gooClipPathBuffer, gooStrokeBuffer, pathWordOffset, strokeEntryPlusOne, fillRule, pathPos, stepX, stepY, sampleWindow);
}

static const float2 shadowOffsets[8] =
{
    float2(1.0, 0.0), float2(-1.0, 0.0),
    float2(0.0, 1.0), float2(0.0, -1.0),
    float2(1.0, 1.0), float2(-1.0, 1.0),
    float2(1.0, -1.0), float2(-1.0, -1.0)
};

float evaluateShapeShadowCoverage(float2 point, float spread, float blur, bool inset)
{
    bool hasBlur = !inset && blur > 0.0;
    int outerCount = (inset || hasBlur) ? 9 : 1;
    int innerCount = spread != 0.0 ? 9 : 1;
    float spreadDist = abs(spread);
    float outerRadius = inset ? max(max(spreadDist, blur), 1.0) : max(blur * 0.75, 0.5);

    float centerSpread = 0.0;
    float accum = 0.0;
    float neighbor = 1.0;

    [loop]
    for (int outer = 0; outer < outerCount; outer++)
    {
        float2 outerPoint = outer == 0
            ? point
            : point + shadowOffsets[outer - 1] * outerRadius;
        float spreadVal = 0.0;
        [loop]
        for (int inner = 0; inner < innerCount; inner++)
        {
            float2 samplePoint = inner == 0
                ? outerPoint
                : outerPoint + shadowOffsets[inner - 1] * (inner <= 4 ? spreadDist : spreadDist * 0.707106781186);
            float s = shapeMaskSample(samplePoint);
            if (inner == 0)
            {
                spreadVal = s;
            }
            else
            {
                spreadVal = spread > 0.0 ? max(spreadVal, s) : min(spreadVal, s);
            }
        }

        if (outer == 0)
        {
            centerSpread = spreadVal;
            if (inset && centerSpread <= 0.0)
            {
                return 0.0;
            }
            if (!inset && !hasBlur)
            {
                return centerSpread;
            }
            accum = centerSpread * 0.25;
        }
        else if (inset)
        {
            neighbor = min(neighbor, spreadVal);
        }
        else
        {
            float weight = outer <= 4 ? 0.125 : 0.0625;
            accum += spreadVal * weight;
        }
    }

    return inset ? clamp(centerSpread - neighbor, 0.0, 1.0) : clamp(accum, 0.0, 1.0);
}

void shadeShadow(float2 point, float2 pointDx, float2 pointDy)
{
    float spread = pc.params.x;
    float blur = pc.params.y;
    float offsetX = pc.params.z;
    float offsetY = pc.params.w;
    float blurExtent = blur > 0.0 ? blur * 2.0 + 2.0 : 0.0;
    float expansion = pc.packedColorsExtra.x == 1u
        ? max(blurExtent, max(abs(offsetX), abs(offsetY)))
        : blurExtent + max(spread, 0.0);
    float coverage;
    float exterior = 1.0;
    if ((pc.packedColorsExtra.y & 1u) != 0u)
    {
        float2 screenPoint = gooClipScreenPosition();
        float2 sourcePoint = screenPoint - float2(offsetX, offsetY);
        coverage = evaluateShapeShadowCoverage(sourcePoint, spread, blur, pc.packedColorsExtra.x == 1u);
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
            float shapeDistance = shadowRoundedDistance(point - shapeOffset, shapeSize, shapeRadii);
            coverage = shadowRoundedCoverage(point - shapeOffset, shapeSize, shapeRadii, shapeDistance, blur,
                pointDx, pointDy);
        }
        if (inset)
        {
            float2 baseOffset = float2(expansion - offsetX, expansion - offsetY);
            float2 baseSize = max(pc.rect.zw - float2(expansion * 2.0), float2(0.0001));
            float baseDistance = shadowRoundedDistance(point - baseOffset, baseSize, pc.radii);
            coverage = gooEdgeCoverage(baseDistance,
                shadowCanonicalEdge(point - baseOffset, baseSize, pc.radii, baseDistance, pointDx, pointDy))
                * (1.0 - coverage);
        }
        else
        {
            float2 boxOffset = float2(expansion - offsetX, expansion - offsetY);
            float2 boxSize = pc.rect.zw - float2(expansion * 2.0);
            float boxDistance = shadowRoundedDistance(point - boxOffset, boxSize, pc.radii);
            exterior = saturate(1.5 + boxDistance
                / shadowCanonicalEdge(point - boxOffset, boxSize, pc.radii, boxDistance, pointDx, pointDy));
        }
    }
    float4 color = unpackColor(pc.packedColors.x, pc.packedColors.w, 0u);
    if ((pc.packedColorsExtra.y & 1u) == 0u)
    {
        float noise = frac(52.9829189 * frac(dot(floor(gooFragmentPosition.xy + pc.stopPositions.xy),
            float2(0.06711056, 0.00583715))));
        coverage = saturate(coverage + (noise - 0.5) / (255.0 * max(color.a, 0.004)));
    }
    outColor = color * coverage * exterior;
}

// --- Border ---
float4 borderEdgeColor(uint edge)
{
    if (edge == 0u) return unpackColor(pc.packedColors.x, pc.packedColors.w, 0u);
    if (edge == 1u) return unpackColor(pc.packedColors.y, pc.packedColors.w, 1u);
    if (edge == 2u) return unpackColor(pc.packedColors.z, pc.packedColors.w, 2u);
    return unpackColor(pc.packedColorsExtra.x, pc.packedColorsExtra.y, 0u);
}

float borderEdgeWidth(uint edge, float2 size)
{
    float top = min(max(pc.radii.x, 0.0), size.y);
    float right = min(max(pc.radii.y, 0.0), size.x);
    float bottom = min(max(pc.radii.z, 0.0), max(size.y - top, 0.0));
    float left = min(max(pc.radii.w, 0.0), max(size.x - right, 0.0));
    if (edge == 0u) return top;
    if (edge == 1u) return right;
    if (edge == 2u) return bottom;
    return left;
}

uint borderSelectedEdge(float2 point, float2 size)
{
    float top = min(max(pc.radii.x, 0.0), size.y);
    float right = min(max(pc.radii.y, 0.0), size.x);
    float bottom = min(max(pc.radii.z, 0.0), max(size.y - top, 0.0));
    float left = min(max(pc.radii.w, 0.0), max(size.x - right, 0.0));
    if (top > 0.0 && point.y < top) return 0u;
    if (bottom > 0.0 && point.y >= size.y - bottom) return 2u;
    if (right > 0.0 && point.x >= size.x - right) return 1u;
    if (left > 0.0 && point.x < left) return 3u;
    return 4u;
}

float borderEdgeAlong(uint edge, float2 point, float2 size)
{
    if (edge == 0u) return point.x;
    if (edge == 1u) return point.y;
    if (edge == 2u) return size.x - point.x;
    return size.y - point.y;
}

float borderEdgeAcross(uint edge, float2 point, float2 size)
{
    if (edge == 0u) return point.y;
    if (edge == 1u) return size.x - point.x;
    if (edge == 2u) return size.y - point.y;
    return point.x;
}

float borderEdgePhase(uint edge)
{
    if (edge == 1u) return pc.params.y;
    if (edge == 2u) return pc.params.z;
    if (edge == 3u) return pc.params.w;
    return 0.0;
}

void borderRenderRectangular(float2 point, float2 size, float2 footprint)
{
    uint edge = borderSelectedEdge(point, size);
    if (edge == 4u)
    {
        outColor = float4(0.0);
        return;
    }
    float width = borderEdgeWidth(edge, size);
    float patternWidth = max(width, 0.0001);
    float period = pc.packedColorsExtra.w == 1u ? patternWidth * 6.0 : patternWidth * 3.0;
    float onLength = pc.packedColorsExtra.w == 1u ? patternWidth * 3.0 : patternWidth;
    float along = borderEdgeAlong(edge, point, size);
    float across = borderEdgeAcross(edge, point, size);
    float phase = borderEdgePhase(edge);
    float edgeAa = max((edge & 1u) == 0u ? footprint.y : footprint.x, 0.0001);
    float edgeCoverage = gooEdgeCoverage(across - width, edgeAa);
    float patternCoverage = 1.0;
    if (pc.packedColorsExtra.w == 1u)
    {
        float patternCoordinate = fmod(along + phase, period);
        float patternAa = max((edge & 1u) == 0u ? footprint.x : footprint.y, 0.0001);
        float dash = 1.0 - smoothstep(onLength - patternAa, onLength + patternAa, patternCoordinate);
        float wrap = smoothstep(period - patternAa, period, patternCoordinate);
        patternCoverage = max(dash, wrap);
    }
    else if (pc.packedColorsExtra.w == 2u)
    {
        float patternCoordinate = fmod(along + phase, period);
        float dotDiameter = width;
        float dotRadius = max(dotDiameter * 0.5, 0.0001);
        float axial = abs(patternCoordinate - dotRadius);
        axial = min(axial, period - axial);
        float transverse = abs(across - width * 0.5);
        float dotDistance = length(float2(axial, transverse));
        float dotAa = max(max(footprint.x, footprint.y), 0.0001);
        patternCoverage = 1.0 - smoothstep(dotRadius - dotAa, dotRadius + dotAa, dotDistance);
    }
    outColor = borderEdgeColor(edge) * edgeCoverage * patternCoverage;
}

uint borderRoundedEdge(float2 point, float2 size)
{
    float top = min(max(pc.radii.x, 0.0), size.y);
    float right = min(max(pc.radii.y, 0.0), size.x);
    float bottom = min(max(pc.radii.z, 0.0), max(size.y - top, 0.0));
    float left = min(max(pc.radii.w, 0.0), max(size.x - right, 0.0));
    float best = 1000000.0;
    uint edge = 4u;
    float distance = point.y;
    if (top > 0.0 && distance < best) { best = distance; edge = 0u; }
    distance = size.x - point.x;
    if (right > 0.0 && distance < best) { best = distance; edge = 1u; }
    distance = size.y - point.y;
    if (bottom > 0.0 && distance < best) { best = distance; edge = 2u; }
    distance = point.x;
    if (left > 0.0 && distance < best) { edge = 3u; }
    return edge;
}

float borderEllipseArc(float2 radii, float angle)
{
    if (radii.x == radii.y) return radii.x * angle;
    float sum = 0.0;
    [loop]
    for (int sample = 0; sample <= 8; sample++)
    {
        float t = angle * float(sample) / 8.0;
        float speed = length(radii * float2(sin(t), cos(t)));
        sum += speed * (sample == 0 || sample == 8 ? 1.0 : (sample % 2 == 0 ? 2.0 : 4.0));
    }
    return sum * angle / 24.0;
}

float3 borderRoundedContour(float2 point, float2 size, float4 radii, float4 widths, out float2 normal)
{
    float2 inset = widths.wx * 0.5;
    float2 extent = max(size - inset - widths.yz * 0.5, 0.0);
    float2 p = point - inset;
    float2 r[4] = {
        max(radii.x - widths.wx * 0.5, 0.0),
        max(radii.y - widths.yx * 0.5, 0.0),
        max(radii.z - widths.yz * 0.5, 0.0),
        max(radii.w - widths.wz * 0.5, 0.0)
    };
    for (int i = 0; i < 4; i++)
    {
        if (min(r[i].x, r[i].y) <= 0.0) r[i] = float2(0.0);
    }
    float4 sides = max(float4(extent.x, extent.y, extent.x, extent.y)
        - float4(r[0].x + r[1].x, r[1].y + r[2].y, r[2].x + r[3].x, r[3].y + r[0].y), 0.0);
    float4 arcs = float4(borderEllipseArc(r[0], 1.57079632679), borderEllipseArc(r[1].yx, 1.57079632679),
        borderEllipseArc(r[2], 1.57079632679), borderEllipseArc(r[3].yx, 1.57079632679));
    float perimeter = dot(sides + arcs, float4(1.0));
    float4 starts = float4(0.0, sides.x + arcs.y, sides.x + arcs.y + sides.y + arcs.z,
        sides.x + arcs.y + sides.y + arcs.z + sides.z + arcs.w);
    float4 distances = float4(p.y, extent.x - p.x, extent.y - p.y, p.x);
    uint side = distances.x <= distances.y && distances.x <= distances.z && distances.x <= distances.w ? 0u
        : (distances.y <= distances.z && distances.y <= distances.w ? 1u : (distances.z <= distances.w ? 2u : 3u));
    float4 coordinates = float4(p.x - r[0].x, p.y - r[1].y, extent.x - r[2].x - p.x, extent.y - r[3].y - p.y);
    float2 normals[4] = { float2(0.0, -1.0), float2(1.0, 0.0), float2(0.0, 1.0), float2(-1.0, 0.0) };
    normal = normals[side];
    float along = starts[side] + clamp(coordinates[side], 0.0, sides[side]);
    float across = -distances[side];
    float2 centers[4] = { r[0], float2(extent.x - r[1].x, r[1].y), extent - r[2], float2(r[3].x, extent.y - r[3].y) };
    int corner = p.x < centers[0].x && p.y < centers[0].y ? 0
        : (p.x > centers[1].x && p.y < centers[1].y ? 1
        : (p.x > centers[2].x && p.y > centers[2].y ? 2
        : (p.x < centers[3].x && p.y > centers[3].y ? 3 : -1)));
    if (corner >= 0 && min(r[corner].x, r[corner].y) > 0.0)
    {
        float2 q = p - centers[corner];
        float2 axes = r[corner];
        float2 local = abs(q);
        float angle = atan2(local.y, local.x);
        if (axes.x != axes.y)
        {
            angle = atan2(local.y / axes.y, local.x / axes.x);
            [loop]
            for (int iteration = 0; iteration < 4; iteration++)
            {
                float2 radial = float2(cos(angle), sin(angle));
                float2 tangent = axes * float2(-radial.y, radial.x);
                float2 delta = axes * radial - local;
                float curvature = dot(tangent, tangent) - dot(delta, axes * radial);
                angle = clamp(angle - dot(delta, tangent) / max(curvature, 0.0001), 0.0, 1.57079632679);
            }
            float2 radial = float2(cos(angle), sin(angle));
            normal = normalize(radial / axes) * sign(q);
            across = dot(local - axes * radial, abs(normal));
        }
        else
        {
            float distance = length(q);
            normal = q / distance;
            across = distance - axes.x;
        }
        uint previousSide = (uint(corner) + 3u) & 3u;
        float turn = (corner & 1) == 0 ? angle : 1.57079632679 - angle;
        float2 arcRadii = (corner & 1) == 0 ? axes : axes.yx;
        along = starts[previousSide] + sides[previousSide] + borderEllipseArc(arcRadii, turn);
    }
    return float3(along, perimeter, across);
}

void shadeBorder(float2 point, float2 pointDx, float2 pointDy)
{
    float2 size = pc.rect.zw;
    float2 footprint = abs(pointDx) + abs(pointDy);
    if (max(max(pc.stopPositions.x, pc.stopPositions.y), max(pc.stopPositions.z, pc.stopPositions.w)) <= 0.0)
    {
        borderRenderRectangular(point, size, footprint);
        return;
    }

    float4 outerRadii = gooNormalizeRadii(size, pc.stopPositions);
    float top = min(max(pc.radii.x, 0.0), size.y);
    float right = min(max(pc.radii.y, 0.0), size.x);
    float bottom = min(max(pc.radii.z, 0.0), max(size.y - top, 0.0));
    float left = min(max(pc.radii.w, 0.0), max(size.x - right, 0.0));
    float radius = max(max(outerRadii.x, outerRadii.y), max(outerRadii.z, outerRadii.w));
    float inset = max(max(top, right), max(bottom, left));
    float interior = max(radius, inset) + length(footprint);
    if (all(point > interior) && all(point < size - interior))
    {
        outColor = float4(0.0);
        return;
    }
    float outerDistance = gooRoundedRectDistance(point, size, outerRadii);
    float outerCoverage = gooRoundedRectCoverage(point, size, outerRadii, pointDx, pointDy);
    float2 innerSize = max(size - float2(left + right, top + bottom), float2(0.0));
    float innerCoverage = 1.0;
    float conditionalCoverage = 1.0;
    float borderWidth = max(borderEdgeWidth(borderRoundedEdge(point, size), size), 0.0001);
    if (innerSize.x > 0.0 && innerSize.y > 0.0)
    {
        float4 innerRadii = max(outerRadii - float4(max(top, left), max(top, right),
            max(bottom, right), max(bottom, left)), float4(0.0));
        innerRadii = gooNormalizeRadii(innerSize, innerRadii);
        float innerDistance = gooRoundedRectDistance(point - float2(left, top), innerSize, innerRadii);
        innerCoverage = 1.0 - gooRoundedRectCoverage(point - float2(left, top), innerSize, innerRadii, pointDx, pointDy);
        conditionalCoverage = innerDistance > outerDistance ? innerCoverage : 0.0;
    }
    float coverage = max(outerCoverage - (1.0 - innerCoverage), 0.0);
    if (pc.packedColorsExtra.z != 0u)
    {
        coverage = outerCoverage > 0.0 ? coverage / outerCoverage : conditionalCoverage;
    }
    uint edge = borderRoundedEdge(point, size);
    if (edge == 4u)
    {
        outColor = float4(0.0);
        return;
    }
    float patternCoverage = 1.0;
    if (pc.packedColorsExtra.w == 1u || pc.packedColorsExtra.w == 2u)
    {
        float2 normal;
        float3 contour = borderRoundedContour(point, size, outerRadii, float4(top, right, bottom, left), normal);
        float patternWidth = max(max(max(top, right), max(bottom, left)), 0.0001);
        float targetPeriod = patternWidth * (pc.packedColorsExtra.w == 1u ? 6.0 : 3.0);
        float count = max(round(contour.y / targetPeriod), 1.0);
        float period = max(contour.y / count, 0.0001);
        float coordinate = frac(contour.x / period) * period;
        float2 tangent = float2(-normal.y, normal.x);
        float alongAa = max(dot(abs(tangent), footprint), 0.0001);
        if (pc.packedColorsExtra.w == 1u)
        {
            float dash = 1.0 - smoothstep(period * 0.5 - alongAa, period * 0.5 + alongAa, coordinate);
            float wrap = smoothstep(period - alongAa, period, coordinate);
            patternCoverage = max(dash, wrap);
        }
        else
        {
            float axial = min(coordinate, period - coordinate);
            float dotDistance = length(float2(axial, contour.z));
            float dotAa = max(max(alongAa, dot(abs(normal), footprint)), 0.0001);
            float dotRadius = borderWidth * 0.5;
            patternCoverage = 1.0 - smoothstep(dotRadius - dotAa, dotRadius + dotAa, dotDistance);
        }
    }
    outColor = borderEdgeColor(edge) * coverage * patternCoverage;
}

// --- Gradients ---
float4 gradientStopColor(uint index)
{
    GooPrimitiveRecord stops = pc;
    if (pc.packedColorsExtra.z > 4u)
    {
        stops = gooPrimitiveBuffer[pc.packedColorsExtra.w + index / 4u];
        index %= 4u;
    }
    if (index == 0u) return unpackColor(stops.packedColors.x, stops.packedColors.w, 0u);
    if (index == 1u) return unpackColor(stops.packedColors.y, stops.packedColors.w, 1u);
    if (index == 2u) return unpackColor(stops.packedColors.z, stops.packedColors.w, 2u);
    return unpackColor(stops.packedColorsExtra.x, stops.packedColorsExtra.y, 0u);
}

float gradientStopPosition(uint index)
{
    GooPrimitiveRecord stops = pc;
    if (pc.packedColorsExtra.z > 4u)
    {
        stops = gooPrimitiveBuffer[pc.packedColorsExtra.w + index / 4u];
        index %= 4u;
    }
    if (index == 0u) return stops.stopPositions.x;
    if (index == 1u) return stops.stopPositions.y;
    if (index == 2u) return stops.stopPositions.z;
    return stops.stopPositions.w;
}

float4 gradientInterpolateStops(float value)
{
    uint count = pc.packedColorsExtra.z;
    if (value < gradientStopPosition(0u)) return gradientStopColor(0u);
    uint low = 1u;
    uint high = count;
    while (low < high)
    {
        uint middle = low + (high - low) / 2u;
        if (gradientStopPosition(middle) <= value) low = middle + 1u;
        else high = middle;
    }
    if (low == count) return gradientStopColor(count - 1u);
    float left = gradientStopPosition(low - 1u);
    float right = gradientStopPosition(low);
    return lerp(gradientStopColor(low - 1u), gradientStopColor(low), clamp((value - left) / (right - left), 0.0, 1.0));
}

float4 ditherBatchedGradient(float4 color, uint header)
{
    if (color.a <= 0.0) return color;
    float2 ditherOffset = float2(
        float(int(header) >> 4) * 0.0625,
        float(int(pc.packedColorsExtra.y) >> 10) * 0.0625);
    float noise = frac(52.9829189 * frac(dot(floor(gooFragmentPosition.xy + ditherOffset),
        float2(0.06711056, 0.00583715))));
    float3 encoded = saturate(color.rgb / color.a);
    encoded = saturate(encoded + (noise - 0.5) / 255.0);
    return float4(encoded * color.a, color.a);
}

void shadeLinearGradient(float2 point, float2 pointDx, float2 pointDy, uint header)
{
    float2 direction = pc.params.zw - pc.params.xy;
    float amount = dot(uv - pc.params.xy, direction) / max(dot(direction, direction), 0.0001);
    float rounded = gooRoundedRectCoverage(point, pc.rect.zw, pc.radii, pointDx, pointDy);
    outColor = ditherBatchedGradient(gradientInterpolateStops(clamp(amount, 0.0, 1.0)), header)
        * rounded;
}

void shadeRadialGradient(float2 point, float2 pointDx, float2 pointDy, uint header)
{
    float2 radius = max(pc.params.zw, float2(0.0001));
    float amount = length((uv - pc.params.xy) / radius);
    float rounded = gooRoundedRectCoverage(point, pc.rect.zw, pc.radii, pointDx, pointDy);
    outColor = ditherBatchedGradient(gradientInterpolateStops(clamp(amount, 0.0, 1.0)), header)
        * rounded;
}

// --- Sampled Image ---
void shadeSampledImage()
{
    float2 sourceUv = pc.params.xy + uv * pc.params.zw;
    if (pc.radii.y > 0.5 && any(pc.stopPositions.xy != float2(1.0)))
    {
        float2 edge = asfloat(pc.packedColors.xy);
        sourceUv = clamp(sourceUv * pc.stopPositions.xy, edge, pc.stopPositions.xy - edge);
    }
    float4 sampleColor = imageTexture.Sample(sourceUv);
    float opacity = clamp(pc.radii.x, 0.0, 1.0);
    float alpha = sampleColor.a * opacity;
    float colorScale = pc.radii.y > 0.5 ? opacity : alpha;
    outColor = float4(sampleColor.rgb * colorScale, alpha);
}

struct BatchedUiFragmentInput
{
    [[vk::location(0)]] float2 uv;
    [[vk::location(2)]] nointerpolation uint scissorChainId;
    [[vk::location(3)]] nointerpolation uint primitiveRecordOrdinal;
    float4 position : SV_Position;
};

struct BatchedUiFragmentOutput
{
    [[vk::location(0)]] float4 color : SV_Target0;
};

[shader("fragment")]
BatchedUiFragmentOutput main(BatchedUiFragmentInput input)
{
    uv = input.uv;
    gooClipDrawOrdinal = input.scissorChainId;
    gooPrimitiveRecordOrdinal = input.primitiveRecordOrdinal;
    gooFragmentPosition = input.position;

    // Derivatives are evaluated unconditionally before branching on primitiveKind or clip early-out.
    float2 uvDx = ddx(input.uv);
    float2 uvDy = ddy(input.uv);
    float clipCoverage = gooClipCoverage();
    if (clipCoverage <= 0.0)
    {
        BatchedUiFragmentOutput clipped;
        clipped.color = float4(0.0);
        return clipped;
    }
    float2 point = input.uv * pc.rect.zw;
    float2 pointDx = uvDx * pc.rect.zw;
    float2 pointDy = uvDy * pc.rect.zw;

    uint header = asuint(pc.transform1.w);
    uint kind = (header >> 1u) & 7u;
    switch (kind)
    {
        case GooUiKindSolid:
            shadeSolid(point, pointDx, pointDy);
            break;
        case GooUiKindShadow:
            shadeShadow(point, pointDx, pointDy);
            break;
        case GooUiKindBorder:
            shadeBorder(point, pointDx, pointDy);
            break;
        case GooUiKindLinearGradient:
            shadeLinearGradient(point, pointDx, pointDy, header);
            break;
        case GooUiKindRadialGradient:
            shadeRadialGradient(point, pointDx, pointDy, header);
            break;
        default:
            shadeSampledImage();
            break;
    }
    BatchedUiFragmentOutput output;
    output.color = outColor * clipCoverage;
    return output;
}
