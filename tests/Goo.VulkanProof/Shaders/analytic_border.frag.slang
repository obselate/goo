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

float ellipseArc(float2 radii, float angle)
{
    if (radii.x == radii.y)
    {
        return radii.x * angle;
    }
    float sum = 0.0;
    for (int sample = 0; sample <= 8; sample++)
    {
        float t = angle * float(sample) / 8.0;
        float speed = length(radii * float2(sin(t), cos(t)));
        sum += speed * (sample == 0 || sample == 8 ? 1.0 : (sample % 2 == 0 ? 2.0 : 4.0));
    }
    return sum * angle / 24.0;
}

float3 roundedContour(float2 point, float2 size, float4 radii, float4 widths, out float2 normal)
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
        if (min(r[i].x, r[i].y) <= 0.0)
        {
            r[i] = float2(0.0);
        }
    }
    float4 sides = max(float4(extent.x, extent.y, extent.x, extent.y)
        - float4(r[0].x + r[1].x, r[1].y + r[2].y, r[2].x + r[3].x, r[3].y + r[0].y), 0.0);
    float4 arcs = float4(ellipseArc(r[0], 1.57079632679), ellipseArc(r[1].yx, 1.57079632679),
        ellipseArc(r[2], 1.57079632679), ellipseArc(r[3].yx, 1.57079632679));
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
        along = starts[previousSide] + sides[previousSide] + ellipseArc(arcRadii, turn);
    }
    return float3(along, perimeter, across);
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

    float2 footprint = abs(ddx(point)) + abs(ddy(point));
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
    // The border is the outer shape minus the nested inner shape. Subtracting coverage keeps sides
    // without a border empty where the two edges coincide; multiplying would paint about a quarter there.
    float coverage = max(outerCoverage - (1.0 - innerCoverage), 0.0);
    uint edge = roundedEdge(point, size);
    if (edge == 4u)
    {
        outColor = float4(0.0);
        outColor *= gooClipCoverage();
        return;
    }
    float patternCoverage = 1.0;
    if (pc.packedColorsExtra.w == 1u || pc.packedColorsExtra.w == 2u)
    {
        float2 normal;
        float3 contour = roundedContour(point, size, outerRadii, float4(top, right, bottom, left), normal);
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
