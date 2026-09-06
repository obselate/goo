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

float curveX(QuadraticCurve curve, float t)
{
    float inverseT = 1.0 - t;
    return inverseT * inverseT * curve.start.x
        + 2.0 * inverseT * t * curve.control.x
        + t * t * curve.finish.x;
}

float curveY(QuadraticCurve curve, float t)
{
    float inverseT = 1.0 - t;
    return inverseT * inverseT * curve.start.y
        + 2.0 * inverseT * t * curve.control.y
        + t * t * curve.finish.y;
}

float curveXDerivative(QuadraticCurve curve, float t)
{
    return 2.0 * ((1.0 - t) * (curve.control.x - curve.start.x)
        + t * (curve.finish.x - curve.control.x));
}

float curveYDerivative(QuadraticCurve curve, float t)
{
    return 2.0 * ((1.0 - t) * (curve.control.y - curve.start.y)
        + t * (curve.finish.y - curve.control.y));
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

AxisRoots solveHorizontalRoots(QuadraticCurve curve, float2 point)
{
    float2 first = curve.start - point;
    float2 second = curve.control - point;
    float2 third = curve.finish - point;
    AxisRoots result;
    result.code = rootCode(first.y, second.y, third.y);
    result.first = result.second = -1.0;
    if (result.code == 0u)
    {
        return result;
    }
    float2 a = first - second * 2.0 + third;
    float2 b = first - second;
    float tolerance = coefficientTolerance(first.y, b.y, a.y);
    if (abs(a.y) > tolerance)
    {
        float discriminant = max(b.y * b.y - a.y * first.y, 0.0);
        float root = sqrt(discriminant);
        float q = b.y + (b.y < 0.0 ? -root : root);
        float nearRoot = q == 0.0 ? 0.0 : first.y / q;
        float farRoot = q / a.y;
        result.first = b.y < 0.0 ? farRoot : nearRoot;
        result.second = b.y < 0.0 ? nearRoot : farRoot;
    }
    else if (abs(b.y) > tolerance)
    {
        result.first = result.second = 0.5 * first.y / b.y;
    }
    else
    {
        result.first = result.second = -1.0;
    }
    return result;
}

AxisRoots solveVerticalRoots(QuadraticCurve curve, float2 point)
{
    float2 first = curve.start - point;
    float2 second = curve.control - point;
    float2 third = curve.finish - point;
    AxisRoots result;
    result.code = rootCode(first.x, second.x, third.x);
    result.first = result.second = -1.0;
    if (result.code == 0u)
    {
        return result;
    }
    float2 a = first - second * 2.0 + third;
    float2 b = first - second;
    float tolerance = coefficientTolerance(first.x, b.x, a.x);
    if (abs(a.x) > tolerance)
    {
        float discriminant = max(b.x * b.x - a.x * first.x, 0.0);
        float root = sqrt(discriminant);
        float q = b.x + (b.x < 0.0 ? -root : root);
        float nearRoot = q == 0.0 ? 0.0 : first.x / q;
        float farRoot = q / a.x;
        result.first = b.x < 0.0 ? farRoot : nearRoot;
        result.second = b.x < 0.0 ? nearRoot : farRoot;
    }
    else if (abs(b.x) > tolerance)
    {
        result.first = result.second = 0.5 * first.x / b.x;
    }
    else
    {
        result.first = result.second = -1.0;
    }
    return result;
}

bool rootInRange(float root)
{
    return root > 0.0 && root <= 1.0;
}

float endpointDirection(QuadraticCurve curve, float root, bool vertical)
{
    float parameter = clamp(root, 0.0, 1.0);
    float direction = vertical ? curveXDerivative(curve, parameter)
        : curveYDerivative(curve, parameter);
    float tolerance = directionTolerance(curve, vertical);
    if (abs(direction) <= tolerance && parameter >= 1.0)
    {
        float previous = max(0.0, 1.0 - EndpointParameterStep);
        direction = vertical ? curveXDerivative(curve, previous)
            : curveYDerivative(curve, previous);
    }
    return direction;
}

float horizontalDistance(QuadraticCurve curve, float2 point, float root, bool rightRay)
{
    float value = curveX(curve, clamp(root, 0.0, 1.0));
    return rightRay ? value - point.x : point.x - value;
}

float verticalDistance(QuadraticCurve curve, float2 point, float root, bool downRay)
{
    float value = curveY(curve, clamp(root, 0.0, 1.0));
    return downRay ? value - point.y : point.y - value;
}

bool horizontalRootAt(AxisRoots roots, uint slot, out float root)
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

bool verticalRootAt(AxisRoots roots, uint slot, out float root)
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

bool horizontalRootHit(
    float2 point,
    QuadraticCurve curve,
    float root,
    bool rightRay,
    float2 pixelsPerPath,
    out float distancePixels,
    out float direction)
{
    distancePixels = 0.0;
    direction = 0.0;
    if (!rootInRange(root))
    {
        return false;
    }
    direction = endpointDirection(curve, root, false);
    if (abs(direction) <= directionTolerance(curve, false))
    {
        return false;
    }
    distancePixels = horizontalDistance(curve, point, root, rightRay) * pixelsPerPath.x;
    if (distancePixels < -0.5 || isnan(distancePixels) || isinf(distancePixels))
    {
        return false;
    }
    return true;
}

bool verticalRootHit(
    float2 point,
    QuadraticCurve curve,
    float root,
    bool downRay,
    float2 pixelsPerPath,
    out float distancePixels,
    out float direction)
{
    distancePixels = 0.0;
    direction = 0.0;
    if (!rootInRange(root))
    {
        return false;
    }
    direction = endpointDirection(curve, root, true);
    if (abs(direction) <= directionTolerance(curve, true))
    {
        return false;
    }
    distancePixels = verticalDistance(curve, point, root, downRay) * pixelsPerPath.y;
    if (distancePixels < -0.5 || isnan(distancePixels) || isinf(distancePixels))
    {
        return false;
    }
    return true;
}

void accumulateHorizontalRoot(
    float2 point,
    QuadraticCurve curve,
    float root,
    bool rightRay,
    float2 pixelsPerPath,
    inout float value,
    inout float weight)
{
    float distancePixels;
    float direction;
    if (!horizontalRootHit(point, curve, root, rightRay, pixelsPerPath,
        distancePixels, direction))
    {
        return;
    }
    float amount = clamp(distancePixels + 0.5, 0.0, 1.0);
    float rootSign = direction > 0.0 ? 1.0 : -1.0;
    value += rootSign * amount;
    weight = max(weight, clamp(1.0 - abs(distancePixels) * 2.0, 0.0, 1.0));
}

void accumulateVerticalRoot(
    float2 point,
    QuadraticCurve curve,
    float root,
    bool downRay,
    float2 pixelsPerPath,
    inout float value,
    inout float weight)
{
    float distancePixels;
    float direction;
    if (!verticalRootHit(point, curve, root, downRay, pixelsPerPath,
        distancePixels, direction))
    {
        return;
    }
    float amount = clamp(distancePixels + 0.5, 0.0, 1.0);
    float rootSign = direction < 0.0 ? 1.0 : -1.0;
    value += rootSign * amount;
    weight = max(weight, clamp(1.0 - abs(distancePixels) * 2.0, 0.0, 1.0));
}

AnalyticBand horizontalBandAt(float y)
{
    uint count = horizontalBandCount();
    uint base = horizontalBandBase();
    if (count == 0u)
    {
        return readBand(base);
    }
    uint low = 0u;
    uint high = count;
    while (low < high)
    {
        uint middle = low + (high - low) / 2u;
        AnalyticBand candidate = readBand(base + middle * BandWordCount);
        if (candidate.maximum >= y)
        {
            high = middle;
        }
        else
        {
            low = middle + 1u;
        }
    }
    uint index = low < count ? low : count - 1u;
    return readBand(base + index * BandWordCount);
}

AnalyticBand verticalBandAt(float x)
{
    uint count = verticalBandCount();
    uint base = verticalBandBase();
    if (count == 0u)
    {
        return readBand(base);
    }
    uint low = 0u;
    uint high = count;
    while (low < high)
    {
        uint middle = low + (high - low) / 2u;
        AnalyticBand candidate = readBand(base + middle * BandWordCount);
        if (candidate.maximum >= x)
        {
            high = middle;
        }
        else
        {
            low = middle + 1u;
        }
    }
    uint index = low < count ? low : count - 1u;
    return readBand(base + index * BandWordCount);
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

void accumulateHorizontalCurve(
    float2 point,
    QuadraticCurve curve,
    bool rightRay,
    float2 pixelsPerPath,
    inout float value,
    inout float weight)
{
    AxisRoots roots = solveHorizontalRoots(curve, point);
    for (uint slot = 0u; slot < 2u; ++slot)
    {
        float root;
        if (horizontalRootAt(roots, slot, root))
        {
            accumulateHorizontalRoot(point, curve, root, rightRay,
                pixelsPerPath, value, weight);
        }
    }
}

void accumulateVerticalCurve(
    float2 point,
    QuadraticCurve curve,
    bool downRay,
    float2 pixelsPerPath,
    inout float value,
    inout float weight)
{
    AxisRoots roots = solveVerticalRoots(curve, point);
    for (uint slot = 0u; slot < 2u; ++slot)
    {
        float root;
        if (verticalRootAt(roots, slot, root))
        {
            accumulateVerticalRoot(point, curve, root, downRay,
                pixelsPerPath, value, weight);
        }
    }
}

void accumulateHorizontalEvenOddOrdered(
    float2 point,
    uint indices,
    uint start,
    uint count,
    bool rightRay,
    float2 pixelsPerPath,
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
            AxisRoots roots = solveHorizontalRoots(curve, point);
            for (uint slot = 0u; slot < 2u; ++slot)
            {
                float root;
                if (!horizontalRootAt(roots, slot, root))
                {
                    continue;
                }
                float distancePixels;
                float direction;
                if (!horizontalRootHit(point, curve, root, rightRay, pixelsPerPath,
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

void accumulateVerticalEvenOddOrdered(
    float2 point,
    uint indices,
    uint start,
    uint count,
    bool downRay,
    float2 pixelsPerPath,
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
            AxisRoots roots = solveVerticalRoots(curve, point);
            for (uint slot = 0u; slot < 2u; ++slot)
            {
                float root;
                if (!verticalRootAt(roots, slot, root))
                {
                    continue;
                }
                float distancePixels;
                float direction;
                if (!verticalRootHit(point, curve, root, downRay, pixelsPerPath,
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

void accumulateHorizontalEvenOdd(
    float2 point,
    uint indices,
    AnalyticBand band,
    float2 pixelsPerPath,
    out float2 rightCoverage,
    out float2 leftCoverage)
{
    float rightDistances[32] = {};
    float leftDistances[32] = {};
    uint rightCount = 0u;
    uint leftCount = 0u;
    uint rightParity = 0u;
    uint leftParity = 0u;
    float rightWeight = 0.0;
    float leftWeight = 0.0;
    bool rightOverflow = false;
    bool leftOverflow = false;
    uint start = band.forwardStart;
    uint count = band.forwardCount;
    for (uint index = 0u; index < count; ++index)
    {
        uint curveIndex = pathWord(indices + start + index);
        if (curveIndex >= curveCount())
        {
            continue;
        }
        QuadraticCurve curve = curveAt(curveIndex);
        AxisRoots roots = solveHorizontalRoots(curve, point);
        for (uint slot = 0u; slot < 2u; ++slot)
        {
            float root;
            if (!horizontalRootAt(roots, slot, root))
            {
                continue;
            }
            float distancePixels;
            float direction;
            if (horizontalRootHit(point, curve, root, true, pixelsPerPath,
                distancePixels, direction))
            {
                rightParity ^= 1u;
                rightWeight = max(rightWeight,
                    clamp(1.0 - abs(distancePixels) * 2.0, 0.0, 1.0));
                if (distancePixels < 0.5)
                {
                    if (rightCount == MaxFractionalRoots)
                    {
                        rightOverflow = true;
                    }
                    else
                    {
                        uint insert = rightCount;
                        for (uint existing = 0u; existing < rightCount; ++existing)
                        {
                            if (distancePixels < rightDistances[existing])
                            {
                                insert = existing;
                                break;
                            }
                        }
                        for (uint move = rightCount; move > insert; --move)
                        {
                            rightDistances[move] = rightDistances[move - 1u];
                        }
                        rightDistances[insert] = distancePixels;
                        rightCount++;
                    }
                }
            }
            if (horizontalRootHit(point, curve, root, false, pixelsPerPath,
                distancePixels, direction))
            {
                leftParity ^= 1u;
                leftWeight = max(leftWeight,
                    clamp(1.0 - abs(distancePixels) * 2.0, 0.0, 1.0));
                if (distancePixels < 0.5)
                {
                    if (leftCount == MaxFractionalRoots)
                    {
                        leftOverflow = true;
                    }
                    else
                    {
                        uint insert = leftCount;
                        for (uint existing = 0u; existing < leftCount; ++existing)
                        {
                            if (distancePixels < leftDistances[existing])
                            {
                                insert = existing;
                                break;
                            }
                        }
                        for (uint move = leftCount; move > insert; --move)
                        {
                            leftDistances[move] = leftDistances[move - 1u];
                        }
                        leftDistances[insert] = distancePixels;
                        leftCount++;
                    }
                }
            }
        }
    }

    float rightValue = 0.0;
    if (rightOverflow)
    {
        rightWeight = 0.0;
        accumulateHorizontalEvenOddOrdered(point, indices,
            band.forwardStart, band.forwardCount, true, pixelsPerPath, rightParity,
            rightValue, rightWeight);
    }
    else
    {
        for (uint index = 0u; index < rightCount; ++index)
        {
            float amount = clamp(rightDistances[index] + 0.5, 0.0, 1.0);
            rightValue += (index & 1u) == 0u ? amount : -amount;
        }
        uint tailParity = rightParity ^ (rightCount & 1u);
        if (tailParity != 0u)
        {
            rightValue += (rightCount & 1u) == 0u ? 1.0 : -1.0;
        }
    }

    float leftValue = 0.0;
    if (leftOverflow)
    {
        leftWeight = 0.0;
        accumulateHorizontalEvenOddOrdered(point, indices,
            band.reverseStart, band.reverseCount, false, pixelsPerPath, leftParity,
            leftValue, leftWeight);
    }
    else
    {
        for (uint index = 0u; index < leftCount; ++index)
        {
            float amount = clamp(leftDistances[index] + 0.5, 0.0, 1.0);
            leftValue += (index & 1u) == 0u ? amount : -amount;
        }
        uint tailParity = leftParity ^ (leftCount & 1u);
        if (tailParity != 0u)
        {
            leftValue += (leftCount & 1u) == 0u ? 1.0 : -1.0;
        }
    }

    rightCoverage = float2(rightValue, rightWeight);
    leftCoverage = float2(leftValue, leftWeight);
}

void accumulateVerticalEvenOdd(
    float2 point,
    uint indices,
    AnalyticBand band,
    float2 pixelsPerPath,
    out float2 downCoverage,
    out float2 upCoverage)
{
    float downDistances[32] = {};
    float upDistances[32] = {};
    uint downCount = 0u;
    uint upCount = 0u;
    uint downParity = 0u;
    uint upParity = 0u;
    float downWeight = 0.0;
    float upWeight = 0.0;
    bool downOverflow = false;
    bool upOverflow = false;
    uint start = band.forwardStart;
    uint count = band.forwardCount;
    for (uint index = 0u; index < count; ++index)
    {
        uint curveIndex = pathWord(indices + start + index);
        if (curveIndex >= curveCount())
        {
            continue;
        }
        QuadraticCurve curve = curveAt(curveIndex);
        AxisRoots roots = solveVerticalRoots(curve, point);
        for (uint slot = 0u; slot < 2u; ++slot)
        {
            float root;
            if (!verticalRootAt(roots, slot, root))
            {
                continue;
            }
            float distancePixels;
            float direction;
            if (verticalRootHit(point, curve, root, true, pixelsPerPath,
                distancePixels, direction))
            {
                downParity ^= 1u;
                downWeight = max(downWeight,
                    clamp(1.0 - abs(distancePixels) * 2.0, 0.0, 1.0));
                if (distancePixels < 0.5)
                {
                    if (downCount == MaxFractionalRoots)
                    {
                        downOverflow = true;
                    }
                    else
                    {
                        uint insert = downCount;
                        for (uint existing = 0u; existing < downCount; ++existing)
                        {
                            if (distancePixels < downDistances[existing])
                            {
                                insert = existing;
                                break;
                            }
                        }
                        for (uint move = downCount; move > insert; --move)
                        {
                            downDistances[move] = downDistances[move - 1u];
                        }
                        downDistances[insert] = distancePixels;
                        downCount++;
                    }
                }
            }
            if (verticalRootHit(point, curve, root, false, pixelsPerPath,
                distancePixels, direction))
            {
                upParity ^= 1u;
                upWeight = max(upWeight,
                    clamp(1.0 - abs(distancePixels) * 2.0, 0.0, 1.0));
                if (distancePixels < 0.5)
                {
                    if (upCount == MaxFractionalRoots)
                    {
                        upOverflow = true;
                    }
                    else
                    {
                        uint insert = upCount;
                        for (uint existing = 0u; existing < upCount; ++existing)
                        {
                            if (distancePixels < upDistances[existing])
                            {
                                insert = existing;
                                break;
                            }
                        }
                        for (uint move = upCount; move > insert; --move)
                        {
                            upDistances[move] = upDistances[move - 1u];
                        }
                        upDistances[insert] = distancePixels;
                        upCount++;
                    }
                }
            }
        }
    }

    float downValue = 0.0;
    if (downOverflow)
    {
        downWeight = 0.0;
        accumulateVerticalEvenOddOrdered(point, indices,
            band.forwardStart, band.forwardCount, true, pixelsPerPath, downParity,
            downValue, downWeight);
    }
    else
    {
        for (uint index = 0u; index < downCount; ++index)
        {
            float amount = clamp(downDistances[index] + 0.5, 0.0, 1.0);
            downValue += (index & 1u) == 0u ? amount : -amount;
        }
        uint tailParity = downParity ^ (downCount & 1u);
        if (tailParity != 0u)
        {
            downValue += (downCount & 1u) == 0u ? 1.0 : -1.0;
        }
    }

    float upValue = 0.0;
    if (upOverflow)
    {
        upWeight = 0.0;
        accumulateVerticalEvenOddOrdered(point, indices,
            band.reverseStart, band.reverseCount, false, pixelsPerPath, upParity,
            upValue, upWeight);
    }
    else
    {
        for (uint index = 0u; index < upCount; ++index)
        {
            float amount = clamp(upDistances[index] + 0.5, 0.0, 1.0);
            upValue += (index & 1u) == 0u ? amount : -amount;
        }
        uint tailParity = upParity ^ (upCount & 1u);
        if (tailParity != 0u)
        {
            upValue += (upCount & 1u) == 0u ? 1.0 : -1.0;
        }
    }

    downCoverage = float2(downValue, downWeight);
    upCoverage = float2(upValue, upWeight);
}

float2 horizontalCoverageDirection(
    float2 point,
    float2 pixelsPerPath,
    bool rightRay,
    AnalyticBand band)
{
    uint start = rightRay ? band.forwardStart : band.reverseStart;
    uint count = rightRay ? band.forwardCount : band.reverseCount;
    uint indices = horizontalIndexBase();
    float value = 0.0;
    float weight = 0.0;
    for (uint index = 0u; index < count; ++index)
    {
        uint curveIndex = pathWord(indices + start + index);
        if (curveIndex >= curveCount())
        {
            continue;
        }
        QuadraticCurve curve = curveAt(curveIndex);
        accumulateHorizontalCurve(point, curve, rightRay, pixelsPerPath,
            value, weight);
    }
    if (!rightRay)
    {
        value = -value;
    }
    return float2(value, weight);
}

float2 verticalCoverageDirection(
    float2 point,
    float2 pixelsPerPath,
    bool downRay,
    AnalyticBand band)
{
    uint start = downRay ? band.forwardStart : band.reverseStart;
    uint count = downRay ? band.forwardCount : band.reverseCount;
    uint indices = verticalIndexBase();
    float value = 0.0;
    float weight = 0.0;
    for (uint index = 0u; index < count; ++index)
    {
        uint curveIndex = pathWord(indices + start + index);
        if (curveIndex >= curveCount())
        {
            continue;
        }
        QuadraticCurve curve = curveAt(curveIndex);
        accumulateVerticalCurve(point, curve, downRay, pixelsPerPath,
            value, weight);
    }
    if (!downRay)
    {
        value = -value;
    }
    return float2(value, weight);
}

float2 horizontalCoverage(float2 point, float2 pixelsPerPath)
{
    AnalyticBand band = horizontalBandAt(point.y);
    bool rightRay = point.x < band.split;
    float2 primary;
    float2 opposite;
    if (pc.params.y == 1u)
    {
        float2 rightCoverage;
        float2 leftCoverage;
        accumulateHorizontalEvenOdd(point, horizontalIndexBase(), band,
            pixelsPerPath, rightCoverage, leftCoverage);
        float2 signedRight = rightCoverage;
        float2 signedLeft = float2(-leftCoverage.x, leftCoverage.y);
        primary = rightRay ? signedRight : signedLeft;
        opposite = rightRay ? signedLeft : signedRight;
    }
    else
    {
        primary = horizontalCoverageDirection(point, pixelsPerPath,
            rightRay, band);
        opposite = horizontalCoverageDirection(point, pixelsPerPath,
            !rightRay, band);
    }
    if (opposite.y > primary.y
        || (opposite.y == primary.y && abs(opposite.x) > abs(primary.x)))
    {
        return float2(opposite.x, max(primary.y, opposite.y));
    }
    return float2(primary.x, max(primary.y, opposite.y));
}

float2 verticalCoverage(float2 point, float2 pixelsPerPath)
{
    AnalyticBand band = verticalBandAt(point.x);
    bool downRay = point.y < band.split;
    float2 primary;
    float2 opposite;
    if (pc.params.y == 1u)
    {
        float2 downCoverage;
        float2 upCoverage;
        accumulateVerticalEvenOdd(point, verticalIndexBase(), band,
            pixelsPerPath, downCoverage, upCoverage);
        float2 signedDown = downCoverage;
        float2 signedUp = float2(-upCoverage.x, upCoverage.y);
        primary = downRay ? signedDown : signedUp;
        opposite = downRay ? signedUp : signedDown;
    }
    else
    {
        primary = verticalCoverageDirection(point, pixelsPerPath,
            downRay, band);
        opposite = verticalCoverageDirection(point, pixelsPerPath,
            !downRay, band);
    }
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

float analyticCoverage()
{
    float2 pixels = pixelsPerPath();
    float2 horizontal = horizontalCoverage(pathPosition, pixels);
    float2 vertical = verticalCoverage(pathPosition, pixels);
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
    float alpha = validHeader() ? analyticCoverage() : 0.0;
    outColor = float4(alpha * clipBorderCoverage(), 0.0, 0.0, 1.0);
}
#else
void shade()
{
    float alpha = validHeader() ? analyticCoverage() : 0.0;
    if (pc.params.z == 0u)
    {
        outColor = float4(0.0, 0.0, 0.0, alpha) * gooClipCoverage();
    }
    else
    {
        outColor = pc.color * alpha * gooClipCoverage();
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
