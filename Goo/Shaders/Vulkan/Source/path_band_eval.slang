#ifndef GOO_PATH_BAND_EVAL_SLANG
#define GOO_PATH_BAND_EVAL_SLANG

static const uint PathHeaderWordCount = 12u;
static const uint PathBandWordCount = 8u;
static const uint PathCurveWordCount = 8u;
static const uint PathFormatVersion = 1u;
static const float PathCoordMinTolerance = 0.0000001;
static const float PathCoordRelTolerance = 0.000001;
static const float PathMinPixelsPerUnit = 0.0000152587890625;
static const float PathEndpointStep = 0.0001;
static const uint PathMaxFractionalRoots = 32u;

struct GooPathContext
{
    uint baseWord;
    uint fillRule;
    float2 origin;
    float2 extent;
};

struct GooAnalyticBand
{
    float minimum;
    float maximum;
    float split;
    uint forwardStart;
    uint forwardCount;
    uint reverseStart;
    uint reverseCount;
    uint flags;
};

struct GooQuadraticCurve
{
    float2 start;
    float2 control;
    float2 finish;
};

struct GooAxisRoots
{
    float first;
    float second;
    uint code;
};

struct GooRayAccumulator
{
    float value;
    float weight;
    uint count;
    uint parity;
    bool overflow;
};

uint gooPathWord(StructuredBuffer<uint> pathBuffer, uint baseWord, uint relativeWord)
{
    return pathBuffer[baseWord + relativeWord];
}

float gooPathFloat(StructuredBuffer<uint> pathBuffer, uint baseWord, uint index)
{
    return asfloat(gooPathWord(pathBuffer, baseWord, index));
}

uint gooPathHBandCount(StructuredBuffer<uint> pathBuffer, uint baseWord) { return gooPathWord(pathBuffer, baseWord, 2u); }
uint gooPathVBandCount(StructuredBuffer<uint> pathBuffer, uint baseWord) { return gooPathWord(pathBuffer, baseWord, 3u); }
uint gooPathHIndexCount(StructuredBuffer<uint> pathBuffer, uint baseWord) { return gooPathWord(pathBuffer, baseWord, 4u); }
uint gooPathVIndexCount(StructuredBuffer<uint> pathBuffer, uint baseWord) { return gooPathWord(pathBuffer, baseWord, 5u); }
uint gooPathCurveCount(StructuredBuffer<uint> pathBuffer, uint baseWord) { return gooPathWord(pathBuffer, baseWord, 6u); }
uint gooPathHBandBase() { return PathHeaderWordCount; }
uint gooPathVBandBase(StructuredBuffer<uint> pathBuffer, uint baseWord) { return gooPathHBandBase() + gooPathHBandCount(pathBuffer, baseWord) * PathBandWordCount; }
uint gooPathHIndexBase(StructuredBuffer<uint> pathBuffer, uint baseWord) { return gooPathVBandBase(pathBuffer, baseWord) + gooPathVBandCount(pathBuffer, baseWord) * PathBandWordCount; }
uint gooPathVIndexBase(StructuredBuffer<uint> pathBuffer, uint baseWord) { return gooPathHIndexBase(pathBuffer, baseWord) + gooPathHIndexCount(pathBuffer, baseWord); }
uint gooPathCurveBase(StructuredBuffer<uint> pathBuffer, uint baseWord) { return gooPathVIndexBase(pathBuffer, baseWord) + gooPathVIndexCount(pathBuffer, baseWord); }

uint gooPathBandCount(StructuredBuffer<uint> pathBuffer, uint baseWord, bool vertical)
{
    return vertical ? gooPathVBandCount(pathBuffer, baseWord) : gooPathHBandCount(pathBuffer, baseWord);
}

uint gooPathBandBase(StructuredBuffer<uint> pathBuffer, uint baseWord, bool vertical)
{
    return vertical ? gooPathVBandBase(pathBuffer, baseWord) : gooPathHBandBase();
}

uint gooPathIndexBase(StructuredBuffer<uint> pathBuffer, uint baseWord, bool vertical)
{
    return vertical ? gooPathVIndexBase(pathBuffer, baseWord) : gooPathHIndexBase(pathBuffer, baseWord);
}

float gooSolveCoord(float2 value, bool vertical) { return vertical ? value.x : value.y; }
float gooRayCoord(float2 value, bool vertical) { return vertical ? value.y : value.x; }

GooAnalyticBand gooReadBand(StructuredBuffer<uint> pathBuffer, GooPathContext ctx, uint base)
{
    GooAnalyticBand result;
    bool vertical = base >= gooPathVBandBase(pathBuffer, ctx.baseWord);
    float origin = gooSolveCoord(ctx.origin, vertical);
    result.minimum = gooPathFloat(pathBuffer, ctx.baseWord, base) - origin;
    result.maximum = gooPathFloat(pathBuffer, ctx.baseWord, base + 1u) - origin;
    result.split = gooPathFloat(pathBuffer, ctx.baseWord, base + 2u) - gooRayCoord(ctx.origin, vertical);
    result.forwardStart = gooPathWord(pathBuffer, ctx.baseWord, base + 3u);
    result.forwardCount = gooPathWord(pathBuffer, ctx.baseWord, base + 4u);
    result.reverseStart = gooPathWord(pathBuffer, ctx.baseWord, base + 5u);
    result.reverseCount = gooPathWord(pathBuffer, ctx.baseWord, base + 6u);
    result.flags = gooPathWord(pathBuffer, ctx.baseWord, base + 7u);
    return result;
}

GooQuadraticCurve gooCurveAt(StructuredBuffer<uint> pathBuffer, GooPathContext ctx, uint index)
{
    uint base = gooPathCurveBase(pathBuffer, ctx.baseWord) + index * PathCurveWordCount;
    GooQuadraticCurve result;
    result.start = float2(gooPathFloat(pathBuffer, ctx.baseWord, base), gooPathFloat(pathBuffer, ctx.baseWord, base + 1u)) - ctx.origin;
    result.control = float2(gooPathFloat(pathBuffer, ctx.baseWord, base + 2u), gooPathFloat(pathBuffer, ctx.baseWord, base + 3u)) - ctx.origin;
    result.finish = float2(gooPathFloat(pathBuffer, ctx.baseWord, base + 4u), gooPathFloat(pathBuffer, ctx.baseWord, base + 5u)) - ctx.origin;
    return result;
}

float gooCurveCoord(GooQuadraticCurve curve, float t, bool vertical)
{
    float inverseT = 1.0 - t;
    return inverseT * inverseT * gooRayCoord(curve.start, vertical)
        + 2.0 * inverseT * t * gooRayCoord(curve.control, vertical)
        + t * t * gooRayCoord(curve.finish, vertical);
}

float gooCurveDeriv(GooQuadraticCurve curve, float t, bool vertical)
{
    return 2.0 * ((1.0 - t) * (gooSolveCoord(curve.control, vertical) - gooSolveCoord(curve.start, vertical))
        + t * (gooSolveCoord(curve.finish, vertical) - gooSolveCoord(curve.control, vertical)));
}

float gooCoeffTolerance(float first, float second, float quadratic)
{
    float scale = max(max(abs(first), abs(2.0 * second)), abs(quadratic));
    return max(PathCoordMinTolerance, scale * PathCoordRelTolerance);
}

float gooDirTolerance(GooQuadraticCurve curve, bool vertical)
{
    float first = vertical ? abs(curve.control.x - curve.start.x) : abs(curve.control.y - curve.start.y);
    float second = vertical ? abs(curve.finish.x - curve.control.x) : abs(curve.finish.y - curve.control.y);
    return max(PathCoordMinTolerance, max(first, second) * PathCoordRelTolerance);
}

uint gooRootCode(float first, float second, float third)
{
    uint firstSign = asuint(first) >> 31u;
    uint secondSign = asuint(second) >> 30u;
    uint thirdSign = asuint(third) >> 29u;
    uint shift = (secondSign & 2u) | (firstSign & ~2u);
    shift = (thirdSign & 4u) | (shift & ~4u);
    return (0x2e74u >> shift) & 0x0101u;
}

GooAxisRoots gooSolveRoots(GooQuadraticCurve curve, float2 point, bool vertical, float offset)
{
    float first = gooSolveCoord(curve.start - point, vertical) - offset;
    float second = gooSolveCoord(curve.control - point, vertical) - offset;
    float third = gooSolveCoord(curve.finish - point, vertical) - offset;
    GooAxisRoots result;
    result.code = gooRootCode(first, second, third);
    result.first = result.second = -1.0;
    if (result.code == 0u) return result;
    float a = first - second * 2.0 + third;
    float b = first - second;
    float tolerance = gooCoeffTolerance(first, b, a);
    if (abs(a) > tolerance)
    {
        float discriminant = b * b - a * first;
        if (discriminant < 0.0)
        {
            result.code = 0u;
            return result;
        }
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
        result.code = 0u;
    }
    return result;
}

float gooEndpointDirection(GooQuadraticCurve curve, float root, bool vertical)
{
    float parameter = clamp(root, 0.0, 1.0);
    float direction = gooCurveDeriv(curve, parameter, vertical);
    float tolerance = gooDirTolerance(curve, vertical);
    if (abs(direction) <= tolerance && parameter >= 1.0)
    {
        float previous = max(0.0, 1.0 - PathEndpointStep);
        direction = gooCurveDeriv(curve, previous, vertical);
    }
    return direction;
}

float gooRayDistance(GooQuadraticCurve curve, float2 point, float root, bool forward, bool vertical)
{
    curve.start -= point;
    curve.control -= point;
    curve.finish -= point;
    float distance = gooCurveCoord(curve, clamp(root, 0.0, 1.0), vertical);
    return forward ? distance : -distance;
}

bool gooRootAt(GooAxisRoots roots, uint slot, out float root)
{
    root = 0.0;
    if (roots.code == 0u) return false;
    if (slot == 0u)
    {
        if ((roots.code & 1u) == 0u) return false;
        root = roots.first;
        return true;
    }
    if (roots.code <= 1u) return false;
    root = roots.second;
    return true;
}

bool gooRootHit(
    float2 point,
    GooQuadraticCurve curve,
    float root,
    bool forward,
    float2 pixelsPerPath,
    bool vertical,
    out float distancePixels,
    out float direction)
{
    distancePixels = 0.0;
    direction = 0.0;
    if (!isfinite(root)) return false;
    direction = gooEndpointDirection(curve, root, vertical);
    if (abs(direction) <= gooDirTolerance(curve, vertical)) return false;
    distancePixels = gooRayDistance(curve, point, root, forward, vertical) * gooRayCoord(pixelsPerPath, vertical);
    if (distancePixels < -0.5 || isnan(distancePixels) || isinf(distancePixels)) return false;
    return true;
}

uint gooBandIndexAt(StructuredBuffer<uint> pathBuffer, GooPathContext ctx, float coordinate, bool vertical, float offset)
{
    uint count = gooPathBandCount(pathBuffer, ctx.baseWord, vertical);
    uint base = gooPathBandBase(pathBuffer, ctx.baseWord, vertical);
    if (count == 0u) return 0u;
    uint low = 0u;
    uint high = count;
    while (low < high)
    {
        uint middle = low + (high - low) / 2u;
        GooAnalyticBand candidate = gooReadBand(pathBuffer, ctx, base + middle * PathBandWordCount);
        if (candidate.maximum - coordinate >= offset) high = middle;
        else low = middle + 1u;
    }
    return low < count ? low : count - 1u;
}

GooAnalyticBand gooBandAt(StructuredBuffer<uint> pathBuffer, GooPathContext ctx, float coordinate, bool vertical, float offset)
{
    return gooReadBand(pathBuffer, ctx, gooPathBandBase(pathBuffer, ctx.baseWord, vertical)
        + gooBandIndexAt(pathBuffer, ctx, coordinate, vertical, offset) * PathBandWordCount);
}

bool gooRootPrecedes(float distance, uint curveIndex, uint slot, bool found,
    float bestDistance, uint bestCurve, uint bestSlot)
{
    if (!found || distance < bestDistance) return true;
    if (distance > bestDistance) return false;
    if (curveIndex < bestCurve) return true;
    if (curveIndex > bestCurve) return false;
    return slot < bestSlot;
}

bool gooRootFollows(float distance, uint curveIndex, uint slot, bool hasLast,
    float lastDistance, uint lastCurve, uint lastSlot)
{
    if (!hasLast || distance > lastDistance) return true;
    if (distance < lastDistance) return false;
    if (curveIndex > lastCurve) return true;
    if (curveIndex < lastCurve) return false;
    return slot > lastSlot;
}

void gooAccumulateRootDirections(
    float distancePixels, float rootSign, bool includeWeight,
    inout float value, inout float weight, inout float oppositeValue, inout float oppositeWeight)
{
    if (isnan(distancePixels) || isinf(distancePixels)) return;
    float rootWeight = includeWeight ? clamp(1.0 - abs(distancePixels) * 2.0, 0.0, 1.0) : 0.0;
    if (distancePixels >= -0.5)
    {
        value += rootSign * clamp(distancePixels + 0.5, 0.0, 1.0);
        weight = max(weight, rootWeight);
    }
    float oppositeDistance = -distancePixels;
    if (oppositeDistance >= -0.5)
    {
        oppositeValue += rootSign * clamp(oppositeDistance + 0.5, 0.0, 1.0);
        oppositeWeight = max(oppositeWeight, rootWeight);
    }
}

float gooEndpointTolerance(GooPathContext ctx, float2 point, float2 pixelsPerPath, bool vertical)
{
    float tolerance = max(PathCoordMinTolerance,
        max(abs(gooSolveCoord(point, vertical)), gooSolveCoord(ctx.extent, vertical)) * PathCoordRelTolerance);
    return min(tolerance, 1.0 / (2048.0 * gooSolveCoord(pixelsPerPath, vertical)));
}

bool gooNearContourEndpoint(
    GooQuadraticCurve curve, float2 point, float2 pixelsPerPath, bool vertical,
    float tolerance, out bool tangent)
{
    float2 first = curve.start - point;
    float2 last = curve.finish - point;
    float pixels = gooRayCoord(pixelsPerPath, vertical);
    bool firstNear = abs(gooSolveCoord(first, vertical)) <= tolerance
        && abs(gooRayCoord(first, vertical)) * pixels <= 0.5;
    bool lastNear = abs(gooSolveCoord(last, vertical)) <= tolerance
        && abs(gooRayCoord(last, vertical)) * pixels <= 0.5;
    float direction = gooDirTolerance(curve, vertical);
    bool firstTangent = abs(gooCurveDeriv(curve, 0.0, vertical)) <= direction;
    bool lastTangent = abs(gooCurveDeriv(curve, 1.0, vertical)) <= direction;
    tangent = (firstNear && firstTangent) || (lastNear && lastTangent);
    return (firstNear && !firstTangent) || (lastNear && !lastTangent);
}

void gooAccumulateEvenOddOrdered(
    StructuredBuffer<uint> pathBuffer, GooPathContext ctx, float2 point, uint indices, uint start, uint count, bool forward,
    float2 pixelsPerPath, bool vertical, float solveOffset, uint totalParity,
    inout float value, inout float weight)
{
    bool hasLast = false;
    float lastDistance = 0.0;
    uint lastCurve = 0u;
    uint lastSlot = 0u;
    uint fractionalCount = 0u;
    uint maximumRoots = count * 2u;
    uint totalCurves = gooPathCurveCount(pathBuffer, ctx.baseWord);
    for (uint iteration = 0u; iteration < maximumRoots; ++iteration)
    {
        bool found = false;
        float bestDistance = 0.0;
        bool bestTangent = false;
        uint bestCurve = 0u;
        uint bestSlot = 0u;
        for (uint index = 0u; index < count; ++index)
        {
            uint curveIndex = gooPathWord(pathBuffer, ctx.baseWord, indices + start + index);
            if (curveIndex >= totalCurves) continue;
            GooQuadraticCurve curve = gooCurveAt(pathBuffer, ctx, curveIndex);
            bool tangent;
            gooNearContourEndpoint(curve, point, pixelsPerPath, vertical,
                gooEndpointTolerance(ctx, point, pixelsPerPath, vertical), tangent);
            GooAxisRoots roots = gooSolveRoots(curve, point, vertical, solveOffset);
            [loop]
            for (uint slot = 0u; slot < 2u; ++slot)
            {
                float root;
                if (!gooRootAt(roots, slot, root)) continue;
                float distancePixels;
                float direction;
                if (!gooRootHit(point, curve, root, forward, pixelsPerPath, vertical,
                    distancePixels, direction)
                    || distancePixels >= 0.5
                    || !gooRootFollows(distancePixels, curveIndex, slot, hasLast,
                        lastDistance, lastCurve, lastSlot))
                {
                    continue;
                }
                if (gooRootPrecedes(distancePixels, curveIndex, slot, found,
                    bestDistance, bestCurve, bestSlot))
                {
                    found = true;
                    bestDistance = distancePixels;
                    bestTangent = tangent;
                    bestCurve = curveIndex;
                    bestSlot = slot;
                }
            }
        }
        if (!found) break;
        float amount = clamp(bestDistance + 0.5, 0.0, 1.0);
        float rootSign = (fractionalCount & 1u) == 0u ? 1.0 : -1.0;
        value += rootSign * amount;
        weight = max(weight, bestTangent ? 0.0 : clamp(1.0 - abs(bestDistance) * 2.0, 0.0, 1.0));
        fractionalCount++;
        hasLast = true;
        lastDistance = bestDistance;
        lastCurve = bestCurve;
        lastSlot = bestSlot;
    }
    uint tailParity = totalParity ^ (fractionalCount & 1u);
    if (tailParity != 0u) value += (fractionalCount & 1u) == 0u ? 1.0 : -1.0;
}

float2 gooNonZeroAxisCoverage(
    StructuredBuffer<uint> pathBuffer, GooPathContext ctx, float2 point, float2 pixelsPerPath, GooAnalyticBand band, bool vertical,
    float solveOffset, float tolerance, out bool nearEndpoint)
{
    nearEndpoint = false;
    bool forward = gooRayCoord(point, vertical) < band.split;
    uint indices = gooPathIndexBase(pathBuffer, ctx.baseWord, vertical);
    uint start = forward ? band.forwardStart : band.reverseStart;
    uint count = forward ? band.forwardCount : band.reverseCount;
    uint totalCurves = gooPathCurveCount(pathBuffer, ctx.baseWord);
    float value = 0.0;
    float weight = 0.0;
    float oppositeValue = 0.0;
    float oppositeWeight = 0.0;
    for (uint index = 0u; index < count; ++index)
    {
        uint curveIndex = gooPathWord(pathBuffer, ctx.baseWord, indices + start + index);
        if (curveIndex >= totalCurves) continue;
        GooQuadraticCurve curve = gooCurveAt(pathBuffer, ctx, curveIndex);
        bool tangent;
        bool endpoint = gooNearContourEndpoint(curve, point, pixelsPerPath, vertical, tolerance, tangent);
        nearEndpoint = nearEndpoint || (solveOffset == 0.0 && endpoint);
        GooAxisRoots roots = gooSolveRoots(curve, point, vertical, solveOffset);
        [loop]
        for (uint slot = 0u; slot < 2u; ++slot)
        {
            float root;
            if (gooRootAt(roots, slot, root) && isfinite(root))
            {
                float direction = gooEndpointDirection(curve, root, vertical);
                if (!(abs(direction) <= gooDirTolerance(curve, vertical)))
                {
                    gooAccumulateRootDirections(
                        gooRayDistance(curve, point, root, forward, vertical) * gooRayCoord(pixelsPerPath, vertical),
                        (vertical ? direction < 0.0 : direction > 0.0) ? 1.0 : -1.0,
                        !tangent,
                        value, weight, oppositeValue, oppositeWeight);
                }
            }
        }
    }
    float2 primary = float2(forward ? value : -value, weight);
    float2 opposite = float2(forward ? -oppositeValue : oppositeValue, oppositeWeight);
    if (opposite.y > primary.y || (opposite.y == primary.y && abs(opposite.x) > abs(primary.x)))
    {
        return float2(opposite.x, max(primary.y, opposite.y));
    }
    return float2(primary.x, max(primary.y, opposite.y));
}

float2 gooAxisCoverageAt(
    StructuredBuffer<uint> pathBuffer, GooPathContext ctx, float2 point, float2 pixelsPerPath, GooAnalyticBand band, bool vertical,
    float solveOffset, out bool nearEndpoint)
{
    nearEndpoint = false;
    float tolerance = gooEndpointTolerance(ctx, point, pixelsPerPath, vertical);
    if (ctx.fillRule != 1u)
    {
        return gooNonZeroAxisCoverage(pathBuffer, ctx, point, pixelsPerPath, band, vertical,
            solveOffset, tolerance, nearEndpoint);
    }
    bool forward = gooRayCoord(point, vertical) < band.split;
    uint indices = gooPathIndexBase(pathBuffer, ctx.baseWord, vertical);
    uint totalCurves = gooPathCurveCount(pathBuffer, ctx.baseWord);
    float distances[64] = {};
    GooRayAccumulator forwardRay = { 0.0, 0.0, 0u, 0u, false };
    GooRayAccumulator reverseRay = { 0.0, 0.0, 0u, 0u, false };
    uint start = band.forwardStart;
    uint count = band.forwardCount;
    for (uint index = 0u; index < count; ++index)
    {
        uint curveIndex = gooPathWord(pathBuffer, ctx.baseWord, indices + start + index);
        if (curveIndex >= totalCurves) continue;
        GooQuadraticCurve curve = gooCurveAt(pathBuffer, ctx, curveIndex);
        bool tangent;
        bool endpoint = gooNearContourEndpoint(curve, point, pixelsPerPath, vertical, tolerance, tangent);
        nearEndpoint = nearEndpoint || (solveOffset == 0.0 && endpoint);
        GooAxisRoots roots = gooSolveRoots(curve, point, vertical, solveOffset);
        [loop]
        for (uint slot = 0u; slot < 2u; ++slot)
        {
            float root;
            if (!gooRootAt(roots, slot, root)) continue;
            [loop]
            for (uint side = 0u; side < 2u; ++side)
            {
                bool forwardSide = side == 0u;
                float distancePixels;
                float direction;
                if (!gooRootHit(point, curve, root, forwardSide, pixelsPerPath, vertical,
                    distancePixels, direction))
                {
                    continue;
                }
                GooRayAccumulator ray = forwardSide ? forwardRay : reverseRay;
                ray.weight = max(ray.weight, tangent ? 0.0 : clamp(1.0 - abs(distancePixels) * 2.0, 0.0, 1.0));
                ray.parity ^= 1u;
                if (distancePixels < 0.5)
                {
                    if (ray.count == PathMaxFractionalRoots)
                    {
                        ray.overflow = true;
                    }
                    else
                    {
                        uint base = forwardSide ? 0u : PathMaxFractionalRoots;
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
                if (forwardSide) forwardRay = ray;
                else reverseRay = ray;
            }
        }
    }

    [loop]
    for (uint side = 0u; side < 2u; ++side)
    {
        bool forwardSide = side == 0u;
        GooRayAccumulator ray = forwardSide ? forwardRay : reverseRay;
        if (ray.overflow)
        {
            ray.weight = 0.0;
            gooAccumulateEvenOddOrdered(pathBuffer, ctx, point, indices,
                forwardSide ? band.forwardStart : band.reverseStart,
                forwardSide ? band.forwardCount : band.reverseCount,
                forwardSide, pixelsPerPath, vertical, solveOffset, ray.parity,
                ray.value, ray.weight);
        }
        else
        {
            uint base = forwardSide ? 0u : PathMaxFractionalRoots;
            for (uint index = 0u; index < ray.count; ++index)
            {
                float amount = clamp(distances[base + index] + 0.5, 0.0, 1.0);
                ray.value += (index & 1u) == 0u ? amount : -amount;
            }
            uint tailParity = ray.parity ^ (ray.count & 1u);
            if (tailParity != 0u) ray.value += (ray.count & 1u) == 0u ? 1.0 : -1.0;
        }
        if (forwardSide) forwardRay = ray;
        else reverseRay = ray;
    }

    float2 forwardCoverage = float2(forwardRay.value, forwardRay.weight);
    float2 reverseCoverage = float2(-reverseRay.value, reverseRay.weight);
    float2 primary = forward ? forwardCoverage : reverseCoverage;
    float2 opposite = forward ? reverseCoverage : forwardCoverage;
    if (opposite.y > primary.y || (opposite.y == primary.y && abs(opposite.x) > abs(primary.x)))
    {
        return float2(opposite.x, max(primary.y, opposite.y));
    }
    return float2(primary.x, max(primary.y, opposite.y));
}

float2 gooAxisCoverage(StructuredBuffer<uint> pathBuffer, GooPathContext ctx, float2 point, float2 pixelsPerPath, GooAnalyticBand band, bool vertical)
{
    float margin = gooEndpointTolerance(ctx, point, pixelsPerPath, vertical) * 2.0;
    float value = 0.0;
    float weight = 0.0;
    [loop] for (uint sample = 0u; sample < 3u; ++sample)
    {
        float offset = sample == 0u ? 0.0 : (sample == 1u ? -margin : margin);
        GooAnalyticBand sampleBand = sample == 0u ? band
            : gooBandAt(pathBuffer, ctx, gooSolveCoord(point, vertical), vertical, offset);
        bool nearEndpoint;
        float2 coverage = gooAxisCoverageAt(pathBuffer, ctx, point, pixelsPerPath, sampleBand, vertical, offset, nearEndpoint);
        if (sample == 0u)
        {
            if (!nearEndpoint) return coverage;
        }
        else
        {
            value += coverage.x * 0.5;
            weight = max(weight, coverage.y);
        }
    }
    return float2(value, weight);
}

bool gooOutsideBand(StructuredBuffer<uint> pathBuffer, GooPathContext ctx, float coordinate, float margin, GooAnalyticBand band, bool vertical)
{
    if (band.forwardCount == 0u) return true;
    uint indices = vertical ? gooPathVIndexBase(pathBuffer, ctx.baseWord) : gooPathHIndexBase(pathBuffer, ctx.baseWord);
    GooQuadraticCurve first = gooCurveAt(pathBuffer, ctx, gooPathWord(pathBuffer, ctx.baseWord, indices + band.forwardStart));
    GooQuadraticCurve last = gooCurveAt(pathBuffer, ctx, gooPathWord(pathBuffer, ctx.baseWord, indices + band.reverseStart));
    float3 near = vertical ? float3(first.start.y, first.control.y, first.finish.y)
        : float3(first.start.x, first.control.x, first.finish.x);
    float3 far = vertical ? float3(last.start.y, last.control.y, last.finish.y)
        : float3(last.start.x, last.control.x, last.finish.x);
    return coordinate < min(min(near.x, near.y), near.z) - margin
        || coordinate > max(max(far.x, far.y), far.z) + margin;
}

bool gooValidPathHeader(StructuredBuffer<uint> pathBuffer, uint baseWord, uint fillRule)
{
    uint requiredRule = fillRule == 1u ? 2u : 1u;
    return gooPathWord(pathBuffer, baseWord, 0u) == PathFormatVersion
        && (gooPathWord(pathBuffer, baseWord, 1u) & requiredRule) != 0u
        && gooPathHBandCount(pathBuffer, baseWord) != 0u
        && gooPathVBandCount(pathBuffer, baseWord) != 0u
        && gooPathCurveCount(pathBuffer, baseWord) != 0u;
}

float gooEvaluatePathCoverage(StructuredBuffer<uint> pathBuffer, uint baseWord, uint fillRule, float2 pathPos, float2 pixelsPerPath,
    bool subtractHeaderOrigin)
{
    if (!gooValidPathHeader(pathBuffer, baseWord, fillRule)) return 0.0;
    float2 headerOrigin = float2(gooPathFloat(pathBuffer, baseWord, 8u), gooPathFloat(pathBuffer, baseWord, 9u));
    GooPathContext ctx;
    ctx.baseWord = baseWord;
    ctx.fillRule = fillRule;
    ctx.origin = headerOrigin;
    ctx.extent = float2(gooPathFloat(pathBuffer, baseWord, 10u), gooPathFloat(pathBuffer, baseWord, 11u)) - headerOrigin;
    float2 point = subtractHeaderOrigin ? (pathPos - headerOrigin) : pathPos;
    float2 pixels = max(pixelsPerPath, float2(PathMinPixelsPerUnit));
    float2 margin = 1.0 / pixels;
    if (point.x < -margin.x || point.y < -margin.y
        || point.x > ctx.extent.x + margin.x || point.y > ctx.extent.y + margin.y)
    {
        return 0.0;
    }
    GooAnalyticBand horizontalBand = gooBandAt(pathBuffer, ctx, point.y, false, 0.0);
    GooAnalyticBand verticalBand = gooBandAt(pathBuffer, ctx, point.x, true, 0.0);
    if (gooOutsideBand(pathBuffer, ctx, point.x, 1.0 / pixels.x, horizontalBand, false)
        && gooOutsideBand(pathBuffer, ctx, point.y, 1.0 / pixels.y, verticalBand, true))
    {
        return 0.0;
    }
    float2 axes[2];
    [loop]
    for (uint axis = 0u; axis < 2u; ++axis)
    {
        bool vertical = axis == 1u;
        GooAnalyticBand band = vertical ? verticalBand : horizontalBand;
        axes[axis] = gooAxisCoverage(pathBuffer, ctx, point, pixels, band, vertical);
    }
    float2 horizontal = axes[0];
    float2 vertical = axes[1];
    float weighted = abs(horizontal.x * horizontal.y + vertical.x * vertical.y)
        / max(horizontal.y + vertical.y, 1.0 / 65536.0);
    return clamp(max(weighted, min(abs(horizontal.x), abs(vertical.x))), 0.0, 1.0);
}

#endif
