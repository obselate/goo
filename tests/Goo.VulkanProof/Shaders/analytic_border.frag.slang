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
    float red = float(packedRgb & 2047u) / 2047.0;
    float green = float((packedRgb >> 11u) & 2047u) / 2047.0;
    float blue = float((packedRgb >> 22u) & 1023u) / 1023.0;
    float alpha = float((packedAlpha >> (alphaIndex * 10u)) & 1023u) / 1023.0;
    return float4(red, green, blue, alpha);
}

float4 edgeColor(uint edge)
{
    if (edge == 0u)
    {
        return unpackColor(pc.packedColors.x, pc.packedColors.w, 0u);
    }
    if (edge == 1u)
    {
        return unpackColor(pc.packedColors.y, pc.packedColors.w, 1u);
    }
    if (edge == 2u)
    {
        return unpackColor(pc.packedColors.z, pc.packedColors.w, 2u);
    }
    return unpackColor(pc.packedColorsExtra.x, pc.packedColorsExtra.y, 0u);
}

float edgeWidth(uint edge, float2 size)
{
    float top = min(max(pc.radii.x, 0.0), size.y);
    float right = min(max(pc.radii.y, 0.0), size.x);
    float bottom = min(max(pc.radii.z, 0.0), max(size.y - top, 0.0));
    float left = min(max(pc.radii.w, 0.0), max(size.x - right, 0.0));
    if (edge == 0u)
    {
        return top;
    }
    if (edge == 1u)
    {
        return right;
    }
    if (edge == 2u)
    {
        return bottom;
    }
    return left;
}

uint selectedEdge(float2 point, float2 size)
{
    float top = min(max(pc.radii.x, 0.0), size.y);
    float right = min(max(pc.radii.y, 0.0), size.x);
    float bottom = min(max(pc.radii.z, 0.0), max(size.y - top, 0.0));
    float left = min(max(pc.radii.w, 0.0), max(size.x - right, 0.0));
    if (top > 0.0 && point.y < top)
    {
        return 0u;
    }
    if (bottom > 0.0 && point.y >= size.y - bottom)
    {
        return 2u;
    }
    if (right > 0.0 && point.x >= size.x - right)
    {
        return 1u;
    }
    if (left > 0.0 && point.x < left)
    {
        return 3u;
    }
    return 4u;
}

float edgeAlong(uint edge, float2 point, float2 size)
{
    if (edge == 0u)
    {
        return point.x;
    }
    if (edge == 1u)
    {
        return point.y;
    }
    if (edge == 2u)
    {
        return size.x - point.x;
    }
    return size.y - point.y;
}

float edgeAcross(uint edge, float2 point, float2 size)
{
    if (edge == 0u)
    {
        return point.y;
    }
    if (edge == 1u)
    {
        return size.x - point.x;
    }
    if (edge == 2u)
    {
        return size.y - point.y;
    }
    return point.x;
}

float edgePhase(uint edge)
{
    if (edge == 1u)
    {
        return pc.params.y;
    }
    if (edge == 2u)
    {
        return pc.params.z;
    }
    if (edge == 3u)
    {
        return pc.params.w;
    }
    return 0.0;
}

void renderRectangular(float2 point, float2 size)
{
    uint edge = selectedEdge(point, size);
    if (edge == 4u)
    {
        outColor = float4(0.0);
        return;
    }

    float width = edgeWidth(edge, size);
    float patternWidth = max(width, 0.0001);
    float period = pc.packedColorsExtra.w == 1u
        ? patternWidth * 6.0
        : patternWidth * 3.0;
    float onLength = pc.packedColorsExtra.w == 1u
        ? patternWidth * 3.0
        : patternWidth;
    float along = edgeAlong(edge, point, size);
    float across = edgeAcross(edge, point, size);
    float phase = edgePhase(edge);
    float edgeAa = max(fwidth(across), 0.0001);
    float edgeCoverage = 1.0 - smoothstep(width - edgeAa, width + edgeAa, across);
    float patternCoverage = 1.0;
    if (pc.packedColorsExtra.w == 1u)
    {
        float patternCoordinate = fmod(along + phase, period);
        float patternAa = max(fwidth(along), 0.0001);
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
        float dotAa = max(max(fwidth(axial), fwidth(transverse)), 0.0001);
        patternCoverage = 1.0 - smoothstep(dotRadius - dotAa, dotRadius + dotAa, dotDistance);
    }
    outColor = edgeColor(edge) * edgeCoverage * patternCoverage;
}

uint roundedEdge(float2 point, float2 size)
{
    float top = min(max(pc.radii.x, 0.0), size.y);
    float right = min(max(pc.radii.y, 0.0), size.x);
    float bottom = min(max(pc.radii.z, 0.0), max(size.y - top, 0.0));
    float left = min(max(pc.radii.w, 0.0), max(size.x - right, 0.0));
    float best = 1000000.0;
    uint edge = 4u;
    float distance = point.y;
    if (top > 0.0 && distance < best)
    {
        best = distance;
        edge = 0u;
    }
    distance = size.x - point.x;
    if (right > 0.0 && distance < best)
    {
        best = distance;
        edge = 1u;
    }
    distance = size.y - point.y;
    if (bottom > 0.0 && distance < best)
    {
        best = distance;
        edge = 2u;
    }
    distance = point.x;
    if (left > 0.0 && distance < best)
    {
        edge = 3u;
    }
    return edge;
}

void shade()
{
    float2 size = pc.rect.zw;
    float2 point = uv * size;
    if (max(max(pc.stopPositions.x, pc.stopPositions.y), max(pc.stopPositions.z, pc.stopPositions.w)) <= 0.0)
    {
        renderRectangular(point, size);
        outColor *= gooClipCoverage();
        return;
    }

    float4 outerRadii = gooNormalizeRadii(size, pc.stopPositions);
    float top = min(max(pc.radii.x, 0.0), size.y);
    float right = min(max(pc.radii.y, 0.0), size.x);
    float bottom = min(max(pc.radii.z, 0.0), max(size.y - top, 0.0));
    float left = min(max(pc.radii.w, 0.0), max(size.x - right, 0.0));
    float outerDistance = gooRoundedRectDistance(point, size, outerRadii);
    float outerAa = max(length(float2(ddx(outerDistance), ddy(outerDistance))), 0.0001);
    float outerCoverage = 1.0 - smoothstep(-0.5 * outerAa, 0.5 * outerAa, outerDistance);
    float2 innerSize = max(size - float2(left + right, top + bottom), float2(0.0));
    float innerCoverage = 1.0;
    float borderWidth = max(edgeWidth(roundedEdge(point, size), size), 0.0001);
    if (innerSize.x > 0.0 && innerSize.y > 0.0)
    {
        float4 innerRadii = max(outerRadii - float4(max(top, left), max(top, right),
            max(bottom, right), max(bottom, left)), float4(0.0));
        innerRadii = gooNormalizeRadii(innerSize, innerRadii);
        float innerDistance = gooRoundedRectDistance(point - float2(left, top), innerSize, innerRadii);
        float innerAa = max(length(float2(ddx(innerDistance), ddy(innerDistance))), 0.0001);
        innerCoverage = smoothstep(-0.5 * innerAa, 0.5 * innerAa, innerDistance);
    }
    float coverage = outerCoverage * innerCoverage;
    uint edge = roundedEdge(point, size);
    if (edge == 4u)
    {
        outColor = float4(0.0);
        outColor *= gooClipCoverage();
        return;
    }
    float patternCoverage = 1.0;
    if (pc.packedColorsExtra.w == 1u)
    {
        float patternWidth = max(borderWidth, 0.0001);
        float period = patternWidth * 6.0;
        float along = edgeAlong(edge, point, size);
        float patternCoordinate = fmod(along + edgePhase(edge), period);
        float patternAa = max(fwidth(along), 0.0001);
        float dash = 1.0 - smoothstep(patternWidth * 3.0 - patternAa,
            patternWidth * 3.0 + patternAa, patternCoordinate);
        float wrap = smoothstep(period - patternAa, period, patternCoordinate);
        patternCoverage = max(dash, wrap);
    }
    else if (pc.packedColorsExtra.w == 2u)
    {
        float patternWidth = max(borderWidth, 0.0001);
        float period = patternWidth * 3.0;
        float along = edgeAlong(edge, point, size);
        float patternCoordinate = fmod(along + edgePhase(edge), period);
        float dotRadius = patternWidth * 0.5;
        float axial = abs(patternCoordinate - dotRadius);
        axial = min(axial, period - axial);
        float transverse = abs(outerDistance + patternWidth * 0.5);
        float dotDistance = length(float2(axial, transverse));
        float dotAa = max(max(fwidth(axial), fwidth(transverse)), 0.0001);
        patternCoverage = 1.0 - smoothstep(dotRadius - dotAa, dotRadius + dotAa, dotDistance);
    }
    outColor = edgeColor(edge) * coverage * patternCoverage * gooClipCoverage();
}

struct AnalyticFragmentInput
{
    [[vk::location(0)]] float2 uv;
    [[vk::location(2)]] nointerpolation uint clipDrawOrdinal;
    [[vk::location(3)]] nointerpolation uint primitiveRecordOrdinal;
    float4 position : SV_Position;
};
struct AnalyticFragmentOutput
{
    [[vk::location(0)]] float4 color : SV_Target0;
};
[shader("fragment")]
AnalyticFragmentOutput main(AnalyticFragmentInput input)
{
    uv = input.uv;
    gooClipDrawOrdinal = input.clipDrawOrdinal;
    gooPrimitiveRecordOrdinal = input.primitiveRecordOrdinal;
    gooFragmentPosition = input.position;
    shade();
    AnalyticFragmentOutput output;
    output.color = outColor;
    return output;
}
