#include "slang_compat.slang"
[[vk::binding(0, 0)]] StructuredBuffer<uint> pathBandBuffer;
#ifdef GOO_CLIP_MASK
struct ClipMaskPushConstants
{
    float4 transform0;
    float4 transform1;
    float4 sampleStep;
    float4 borderRect;
    float4 borderTransform0;
    float4 borderTransform1;
    uint4 params;
};
[[vk::push_constant]] ConstantBuffer<ClipMaskPushConstants> pc;
#else
struct PathBandPushConstants
{
    float4 transform0;
    float4 transform1;
    float4 sampleStep;
    float4 color;
    uint4 params;
};
[[vk::push_constant]] ConstantBuffer<PathBandPushConstants> pc;
#endif
static float2 pathPosition;
static float4 gooFragmentPosition;
static float4 outColor;
#ifndef GOO_CLIP_MASK
static uint gooClipDrawOrdinal;
#include "clip_chain.slang"
#endif

static const uint HeaderWordCount = 12u;
static const uint BandWordCount = 8u;
static const uint CurveWordCount = 8u;
static const uint FormatVersion = 1u;
static const float CoordinateMinimumTolerance = 0.0000001;
static const float CoordinateRelativeTolerance = 0.000001;
static const float MinimumPixelsPerPath = 0.0000152587890625;
static const float EndpointParameterStep = 0.0001;

struct AnalyticBand {
    float minimum;
    float maximum;
    float split;
    uint forwardStart;
    uint forwardCount;
    uint reverseStart;
    uint reverseCount;
    uint flags;
};

struct QuadraticCurve {
    float2 start;
    float2 control;
    float2 finish;
};

struct AxisRoots {
    float first;
    float second;
    uint code;
};

uint pathWord(uint relativeWord)
{
    return pathBandBuffer[pc.params.x + relativeWord];
}

float wordFloat(uint index)
{
    return asfloat(pathWord(index));
}

uint horizontalBandCount()
{
    return pathWord(2u);
}

uint verticalBandCount()
{
    return pathWord(3u);
}

uint horizontalIndexCount()
{
    return pathWord(4u);
}

uint verticalIndexCount()
{
    return pathWord(5u);
}

uint curveCount()
{
    return pathWord(6u);
}

uint horizontalBandBase()
{
    return HeaderWordCount;
}

uint verticalBandBase()
{
    return horizontalBandBase() + horizontalBandCount() * BandWordCount;
}

uint horizontalIndexBase()
{
    return verticalBandBase() + verticalBandCount() * BandWordCount;
}

uint verticalIndexBase()
{
    return horizontalIndexBase() + horizontalIndexCount();
}

uint curveBase()
{
    return verticalIndexBase() + verticalIndexCount();
}

uint bandCount(bool vertical)
{
    return vertical ? verticalBandCount() : horizontalBandCount();
}

uint bandBase(bool vertical)
{
    return vertical ? verticalBandBase() : horizontalBandBase();
}

uint indexBase(bool vertical)
{
    return vertical ? verticalIndexBase() : horizontalIndexBase();
}

float solveCoordinate(float2 value, bool vertical)
{
    return vertical ? value.x : value.y;
}

float rayCoordinate(float2 value, bool vertical)
{
    return vertical ? value.y : value.x;
}

AnalyticBand readBand(uint base)
{
    AnalyticBand result;
    result.minimum = wordFloat(base);
    result.maximum = wordFloat(base + 1u);
    result.split = wordFloat(base + 2u);
    result.forwardStart = pathWord(base + 3u);
    result.forwardCount = pathWord(base + 4u);
    result.reverseStart = pathWord(base + 5u);
    result.reverseCount = pathWord(base + 6u);
    result.flags = pathWord(base + 7u);
    return result;
}

QuadraticCurve curveAt(uint index)
{
    uint base = curveBase() + index * CurveWordCount;
    QuadraticCurve result;
    result.start = float2(wordFloat(base), wordFloat(base + 1u));
    result.control = float2(wordFloat(base + 2u), wordFloat(base + 3u));
    result.finish = float2(wordFloat(base + 4u), wordFloat(base + 5u));
    return result;
}

float curveCoordinate(QuadraticCurve curve, float t, bool vertical)
{
    float inverseT = 1.0 - t;
    return inverseT * inverseT * rayCoordinate(curve.start, vertical)
        + 2.0 * inverseT * t * rayCoordinate(curve.control, vertical)
        + t * t * rayCoordinate(curve.finish, vertical);
}

float curveDerivative(QuadraticCurve curve, float t, bool vertical)
{
    return 2.0 * ((1.0 - t) * (solveCoordinate(curve.control, vertical) - solveCoordinate(curve.start, vertical))
        + t * (solveCoordinate(curve.finish, vertical) - solveCoordinate(curve.control, vertical)));
}

float coefficientTolerance(float first, float second, float quadratic)
{
    float scale = max(max(abs(first), abs(2.0 * second)), abs(quadratic));
    return max(CoordinateMinimumTolerance, scale * CoordinateRelativeTolerance);
}

float directionTolerance(QuadraticCurve curve, bool vertical)
{
    float first = vertical ? abs(curve.control.x - curve.start.x)
        : abs(curve.control.y - curve.start.y);
    float second = vertical ? abs(curve.finish.x - curve.control.x)
        : abs(curve.finish.y - curve.control.y);
    return max(CoordinateMinimumTolerance,
        max(first, second) * CoordinateRelativeTolerance);
}

uint rootCode(float first, float second, float third)
{
    uint firstSign = asuint(first) >> 31u;
    uint secondSign = asuint(second) >> 30u;
    uint thirdSign = asuint(third) >> 29u;
    uint shift = (secondSign & 2u) | (firstSign & ~2u);
    shift = (thirdSign & 4u) | (shift & ~4u);
    return (0x2e74u >> shift) & 0x0101u;
}

AxisRoots solveRoots(QuadraticCurve curve, float2 point, bool vertical)
{
    float first = solveCoordinate(curve.start - point, vertical);
    float second = solveCoordinate(curve.control - point, vertical);
    float third = solveCoordinate(curve.finish - point, vertical);
    AxisRoots result;
    result.code = rootCode(first, second, third);
    result.first = result.second = -1.0;
    if (result.code == 0u)
    {
        return result;
    }
    float a = first - second * 2.0 + third;
    float b = first - second;
    float tolerance = coefficientTolerance(first, b, a);
    if (abs(a) > tolerance)
    {
        float discriminant = max(b * b - a * first, 0.0);
        float root = sqrt(discriminant);
        float q = b + (b < 0.0 ? -root : root);
        float nearRoot = q == 0.0 ? 0.0 : first / q;
        float farRoot = q / a;
        result.first = b < 0.0 ? farRoot : nearRoot;
        result.second = b < 0.0 ? nearRoot : farRoot;
    }
    else if (abs(b) > tolerance)
    {
        result.first = result.second = 0.5 * first / b;
    }
    else
    {
        result.first = result.second = -1.0;
    }
    return result;
}

bool rootInRange(float root)
{
    return root >= 0.0 && root <= 1.0;
}

float endpointDirection(QuadraticCurve curve, float root, bool vertical)
{
    float parameter = clamp(root, 0.0, 1.0);
    float direction = curveDerivative(curve, parameter, vertical);
    float tolerance = directionTolerance(curve, vertical);
    if (abs(direction) <= tolerance && parameter >= 1.0)
    {
        float previous = max(0.0, 1.0 - EndpointParameterStep);
        direction = curveDerivative(curve, previous, vertical);
    }
    return direction;
}

float rayDistance(QuadraticCurve curve, float2 point, float root, bool forward, bool vertical)
{
    float value = curveCoordinate(curve, clamp(root, 0.0, 1.0), vertical);
    float origin = rayCoordinate(point, vertical);
    return forward ? value - origin : origin - value;
}

bool rootAt(AxisRoots roots, uint slot, out float root)
{
    root = 0.0;
    if (roots.code == 0u)
    {
        return false;
    }
    if (slot == 0u)
    {
        if ((roots.code & 1u) == 0u)
        {
            return false;
        }
        root = roots.first;
        return true;
    }
    if (roots.code <= 1u)
    {
        return false;
    }
    root = roots.second;
    return true;
}

bool rootHit(
    float2 point,
    QuadraticCurve curve,
    float root,
    bool forward,
    float2 pixelsPerPath,
    bool vertical,
    out float distancePixels,
    out float direction)
{
    distancePixels = 0.0;
    direction = 0.0;
    if (!rootInRange(root))
    {
        return false;
    }
    direction = endpointDirection(curve, root, vertical);
    if (abs(direction) <= directionTolerance(curve, vertical))
    {
        return false;
    }
    distancePixels = rayDistance(curve, point, root, forward, vertical) * rayCoordinate(pixelsPerPath, vertical);
    if (distancePixels < -0.5 || isnan(distancePixels) || isinf(distancePixels))
    {
        return false;
    }
    return true;
}

uint bandIndexAt(float coordinate, bool vertical)
{
    uint count = bandCount(vertical);
    uint base = bandBase(vertical);
    if (count == 0u)
    {
        return 0u;
    }
    uint low = 0u;
    uint high = count;
    while (low < high)
    {
        uint middle = low + (high - low) / 2u;
        AnalyticBand candidate = readBand(base + middle * BandWordCount);
        if (candidate.maximum >= coordinate)
        {
            high = middle;
        }
        else
        {
            low = middle + 1u;
        }
    }
    return low < count ? low : count - 1u;
}

AnalyticBand bandAt(float coordinate, bool vertical)
{
    return readBand(bandBase(vertical) + bandIndexAt(coordinate, vertical) * BandWordCount);
}

bool rootPrecedes(
    float distance,
    uint curveIndex,
    uint slot,
    bool found,
    float bestDistance,
    uint bestCurve,
    uint bestSlot)
{
    if (!found || distance < bestDistance)
    {
        return true;
    }
    if (distance > bestDistance)
    {
        return false;
    }
    if (curveIndex < bestCurve)
    {
        return true;
    }
    if (curveIndex > bestCurve)
    {
        return false;
    }
    return slot < bestSlot;
}

bool rootFollows(
    float distance,
    uint curveIndex,
    uint slot,
    bool hasLast,
    float lastDistance,
    uint lastCurve,
    uint lastSlot)
{
    if (!hasLast || distance > lastDistance)
    {
        return true;
    }
    if (distance < lastDistance)
    {
        return false;
    }
    if (curveIndex > lastCurve)
    {
        return true;
    }
    if (curveIndex < lastCurve)
    {
        return false;
    }
    return slot > lastSlot;
}

void accumulateRootDirections(
    float distancePixels,
    float rootSign,
    inout float value,
    inout float weight,
    inout float oppositeValue,
    inout float oppositeWeight)
{
    if (isnan(distancePixels) || isinf(distancePixels))
    {
        return;
    }
    if (distancePixels >= -0.5)
    {
        value += rootSign * clamp(distancePixels + 0.5, 0.0, 1.0);
        weight = max(weight, clamp(1.0 - abs(distancePixels) * 2.0, 0.0, 1.0));
    }
    float oppositeDistance = -distancePixels;
    if (oppositeDistance >= -0.5)
    {
        oppositeValue += rootSign * clamp(oppositeDistance + 0.5, 0.0, 1.0);
        oppositeWeight = max(oppositeWeight,
            clamp(1.0 - abs(oppositeDistance) * 2.0, 0.0, 1.0));
    }
}

void accumulateEvenOddOrdered(
    float2 point,
    uint indices,
    uint start,
    uint count,
    bool forward,
    float2 pixelsPerPath,
    bool vertical,
    uint totalParity,
    inout float value,
    inout float weight)
{
    bool hasLast = false;
    float lastDistance = 0.0;
    uint lastCurve = 0u;
    uint lastSlot = 0u;
    uint fractionalCount = 0u;
    uint maximumRoots = count * 2u;
    for (uint iteration = 0u; iteration < maximumRoots; ++iteration)
    {
        bool found = false;
        float bestDistance = 0.0;
        uint bestCurve = 0u;
        uint bestSlot = 0u;
        for (uint index = 0u; index < count; ++index)
        {
            uint curveIndex = pathWord(indices + start + index);
            if (curveIndex >= curveCount())
            {
                continue;
            }
            QuadraticCurve curve = curveAt(curveIndex);
            AxisRoots roots = solveRoots(curve, point, vertical);
            for (uint slot = 0u; slot < 2u; ++slot)
            {
                float root;
                if (!rootAt(roots, slot, root))
                {
                    continue;
                }
                float distancePixels;
                float direction;
                if (!rootHit(point, curve, root, forward, pixelsPerPath, vertical,
                    distancePixels, direction)
                    || distancePixels >= 0.5
                    || !rootFollows(distancePixels, curveIndex, slot, hasLast,
                        lastDistance, lastCurve, lastSlot))
                {
                    continue;
                }
                if (rootPrecedes(distancePixels, curveIndex, slot, found,
                    bestDistance, bestCurve, bestSlot))
                {
                    found = true;
                    bestDistance = distancePixels;
                    bestCurve = curveIndex;
                    bestSlot = slot;
                }
            }
        }
        if (!found)
        {
            break;
        }
        float amount = clamp(bestDistance + 0.5, 0.0, 1.0);
        float rootSign = (fractionalCount & 1u) == 0u ? 1.0 : -1.0;
        value += rootSign * amount;
        weight = max(weight, clamp(1.0 - abs(bestDistance) * 2.0, 0.0, 1.0));
        fractionalCount++;
        hasLast = true;
        lastDistance = bestDistance;
        lastCurve = bestCurve;
        lastSlot = bestSlot;
    }
    uint tailParity = totalParity ^ (fractionalCount & 1u);
    if (tailParity != 0u)
    {
        value += (fractionalCount & 1u) == 0u ? 1.0 : -1.0;
    }
}

static const uint MaxFractionalRoots = 32u;

struct RayAccumulator {
    float value;
    float weight;
    uint count;
    uint parity;
    bool overflow;
};

float2 axisCoverage(float2 point, float2 pixelsPerPath, AnalyticBand band, bool vertical)
{
    bool forward = rayCoordinate(point, vertical) < band.split;
    bool evenOdd = pc.params.y == 1u;
    uint indices = indexBase(vertical);
    float distances[64] = {};
    RayAccumulator forwardRay = { 0.0, 0.0, 0u, 0u, false };
    RayAccumulator reverseRay = { 0.0, 0.0, 0u, 0u, false };
    bool traverseForward = evenOdd || forward;
    uint start = traverseForward ? band.forwardStart : band.reverseStart;
    uint count = traverseForward ? band.forwardCount : band.reverseCount;
    for (uint index = 0u; index < count; ++index)
    {
        uint curveIndex = pathWord(indices + start + index);
        if (curveIndex >= curveCount())
        {
            continue;
        }
        QuadraticCurve curve = curveAt(curveIndex);
        AxisRoots roots = solveRoots(curve, point, vertical);
        for (uint slot = 0u; slot < 2u; ++slot)
        {
            float root;
            if (!rootAt(roots, slot, root))
            {
                continue;
            }
            [loop] for (uint side = 0u; side < 2u; ++side)
            {
                bool forwardSide = side == 0u;
                float distancePixels;
                float direction;
                if (!rootHit(point, curve, root, forwardSide, pixelsPerPath, vertical,
                    distancePixels, direction))
                {
                    continue;
                }
                RayAccumulator ray = forwardSide ? forwardRay : reverseRay;
                ray.weight = max(ray.weight, clamp(1.0 - abs(distancePixels) * 2.0, 0.0, 1.0));
                if (!evenOdd)
                {
                    float rootSign = (vertical ? direction < 0.0 : direction > 0.0) ? 1.0 : -1.0;
                    ray.value += rootSign * clamp(distancePixels + 0.5, 0.0, 1.0);
                }
                else
                {
                    ray.parity ^= 1u;
                    if (distancePixels < 0.5)
                    {
                        if (ray.count == MaxFractionalRoots)
                        {
                            ray.overflow = true;
                        }
                        else
                        {
                            uint base = forwardSide ? 0u : MaxFractionalRoots;
                            uint insert = ray.count;
                            for (uint existing = 0u; existing < ray.count; ++existing)
                            {
                                if (distancePixels < distances[base + existing])
                                {
                                    insert = existing;
                                    break;
                                }
                            }
                            for (uint move = ray.count; move > insert; --move)
                            {
                                distances[base + move] = distances[base + move - 1u];
                            }
                            distances[base + insert] = distancePixels;
                            ray.count++;
                        }
                    }
                }
                if (forwardSide)
                {
                    forwardRay = ray;
                }
                else
                {
                    reverseRay = ray;
                }
            }
        }
    }

    [loop] for (uint side = 0u; side < 2u && evenOdd; ++side)
    {
        bool forwardSide = side == 0u;
        RayAccumulator ray = forwardSide ? forwardRay : reverseRay;
        if (ray.overflow)
        {
            ray.weight = 0.0;
            accumulateEvenOddOrdered(point, indices,
                forwardSide ? band.forwardStart : band.reverseStart,
                forwardSide ? band.forwardCount : band.reverseCount,
                forwardSide, pixelsPerPath, vertical, ray.parity,
                ray.value, ray.weight);
        }
        else
        {
            uint base = forwardSide ? 0u : MaxFractionalRoots;
            for (uint index = 0u; index < ray.count; ++index)
            {
                float amount = clamp(distances[base + index] + 0.5, 0.0, 1.0);
                ray.value += (index & 1u) == 0u ? amount : -amount;
            }
            uint tailParity = ray.parity ^ (ray.count & 1u);
            if (tailParity != 0u)
            {
                ray.value += (ray.count & 1u) == 0u ? 1.0 : -1.0;
            }
        }
        if (forwardSide)
        {
            forwardRay = ray;
        }
        else
        {
            reverseRay = ray;
        }
    }

    float2 forwardCoverage = float2(forwardRay.value, forwardRay.weight);
    float2 reverseCoverage = float2(-reverseRay.value, reverseRay.weight);
    float2 primary = forward ? forwardCoverage : reverseCoverage;
    float2 opposite = forward ? reverseCoverage : forwardCoverage;
    if (opposite.y > primary.y
        || (opposite.y == primary.y && abs(opposite.x) > abs(primary.x)))
    {
        return float2(opposite.x, max(primary.y, opposite.y));
    }
    return float2(primary.x, max(primary.y, opposite.y));
}

float2 pixelsPerPath()
{
    float inverseWidth = max(abs(pc.sampleStep.x), MinimumPixelsPerPath);
    float inverseHeight = max(abs(pc.sampleStep.y), MinimumPixelsPerPath);
    float width = 1.0 / inverseWidth;
    float height = 1.0 / inverseHeight;
    float2 pathXAxis = float2(
        pc.transform0.x * width * 0.5,
        pc.transform1.x * height * 0.5);
    float2 pathYAxis = float2(
        pc.transform0.y * width * 0.5,
        pc.transform1.y * height * 0.5);
    return max(float2(length(pathXAxis), length(pathYAxis)),
        float2(MinimumPixelsPerPath));
}

float combineCoverage(float horizontal, float vertical, float horizontalWeight, float verticalWeight)
{
    float weighted = abs(horizontal * horizontalWeight + vertical * verticalWeight)
        / max(horizontalWeight + verticalWeight, 1.0 / 65536.0);
    return clamp(max(weighted, min(abs(horizontal), abs(vertical))), 0.0, 1.0);
}

bool outsideBand(float coordinate, float margin, AnalyticBand band, bool vertical)
{
    if (band.forwardCount == 0u)
    {
        return true;
    }
    uint indices = vertical ? verticalIndexBase() : horizontalIndexBase();
    QuadraticCurve first = curveAt(pathWord(indices + band.forwardStart));
    QuadraticCurve last = curveAt(pathWord(indices + band.reverseStart));
    float3 near = vertical ? float3(first.start.y, first.control.y, first.finish.y)
        : float3(first.start.x, first.control.x, first.finish.x);
    float3 far = vertical ? float3(last.start.y, last.control.y, last.finish.y)
        : float3(last.start.x, last.control.x, last.finish.x);
    return coordinate < min(min(near.x, near.y), near.z) - margin
        || coordinate > max(max(far.x, far.y), far.z) + margin;
}

float analyticCoverage()
{
    float2 pixels = pixelsPerPath();
    AnalyticBand horizontalBand = bandAt(pathPosition.y, false);
    AnalyticBand verticalBand = bandAt(pathPosition.x, true);
    if (outsideBand(pathPosition.x, 1.0 / pixels.x, horizontalBand, false)
        && outsideBand(pathPosition.y, 1.0 / pixels.y, verticalBand, true))
    {
        return 0.0;
    }
    float2 horizontal = float2(0.0, 0.0);
    float2 vertical = float2(0.0, 0.0);
    [loop] for (uint axis = 0u; axis < 2u; ++axis)
    {
        bool isVertical = axis == 1u;
        float2 coverage = axisCoverage(pathPosition, pixels, isVertical ? verticalBand : horizontalBand, isVertical);
        if (isVertical)
        {
            vertical = coverage;
        }
        else
        {
            horizontal = coverage;
        }
    }
    return combineCoverage(horizontal.x, vertical.x, horizontal.y, vertical.y);
}

bool validHeader()
{
    uint requiredRule = pc.params.y == 1u ? 2u : 1u;
    return pathWord(0u) == FormatVersion
        && (pathWord(1u) & requiredRule) != 0u
        && horizontalBandCount() != 0u
        && verticalBandCount() != 0u
        && curveCount() != 0u;
}

#ifdef GOO_STROKE
#include "path_stroke.slang"
#endif

#ifdef GOO_CLIP_MASK
float clipBorderCoverage()
{
    float3 screenPoint = float3(gooFragmentPosition.xy, 1.0);
    float2 borderPoint = float2(
        dot(pc.borderTransform0.xyz, screenPoint),
        dot(pc.borderTransform1.xyz, screenPoint));
    float2 borderCenter = pc.borderRect.xy + pc.borderRect.zw * 0.5;
    float2 q = abs(borderPoint - borderCenter) - pc.borderRect.zw * 0.5;
    float distance = length(max(q, float2(0.0))) + min(max(q.x, q.y), 0.0);
    return 1.0 - smoothstep(0.0, max(fwidth(distance), 0.0001), distance);
}

void shade()
{
#ifdef GOO_STROKE
    float alpha = validHeader() ? (pc.params.w == 0u ? analyticCoverage() : strokeCoverage()) : 0.0;
#else
    float alpha = validHeader() ? analyticCoverage() : 0.0;
#endif
    outColor = float4(alpha * clipBorderCoverage(), 0.0, 0.0, 1.0);
}
#else
void shade()
{
#ifdef GOO_STROKE
    float alpha = validHeader() ? (pc.params.w == 0u ? analyticCoverage() : strokeCoverage()) : 0.0;
#else
    float alpha = validHeader() ? analyticCoverage() : 0.0;
#endif
    float clip = gooClipCoverage();
    if (pc.params.z == 0u)
    {
        outColor = float4(0.0, 0.0, 0.0, alpha) * clip;
    }
    else
    {
        outColor = pc.color * alpha * clip;
    }
}
#endif

struct PathBandFragmentInput
{
    [[vk::location(0)]] float2 pathPosition;
#ifndef GOO_CLIP_MASK
    [[vk::location(2)]] nointerpolation uint clipDrawOrdinal;
#endif
    float4 position : SV_Position;
};
struct PathBandFragmentOutput
{
    [[vk::location(0)]] float4 color : SV_Target0;
};
[shader("fragment")]
PathBandFragmentOutput main(PathBandFragmentInput input)
{
    pathPosition = input.pathPosition;
    gooFragmentPosition = input.position;
#ifndef GOO_CLIP_MASK
    gooClipDrawOrdinal = input.clipDrawOrdinal;
#endif
    shade();
    PathBandFragmentOutput output;
    output.color = outColor;
    return output;
}
