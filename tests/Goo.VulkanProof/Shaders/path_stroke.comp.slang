#include "slang_compat.slang"
#include "path_stroke_math.slang"

[[vk::binding(0, 0)]] StructuredBuffer<uint> pathBandBuffer;
[[vk::binding(0, 1)]] RWStructuredBuffer<uint> strokeDataBuffer;

struct PathStrokeMetricPushConstants
{
    uint request;
};
[[vk::push_constant]] ConstantBuffer<PathStrokeMetricPushConstants> pc;

float2 metricPoint(float2 point, float4 matrix)
{
    return float2(dot(matrix.xy, point), dot(matrix.zw, point));
}

[shader("compute")]
[numthreads(1, 1, 1)]
void main()
{
    uint source = strokeDataBuffer[pc.request];
    uint count = strokeDataBuffer[pc.request + 1u];
    uint destination = strokeDataBuffer[pc.request + 2u];
    float4 matrix = float4(asfloat(strokeDataBuffer[pc.request + 4u]), asfloat(strokeDataBuffer[pc.request + 5u]),
        asfloat(strokeDataBuffer[pc.request + 6u]), asfloat(strokeDataBuffer[pc.request + 7u]));
    uint curveBase = source + 12u + (pathBandBuffer[source + 2u] + pathBandBuffer[source + 3u]) * 8u
        + pathBandBuffer[source + 4u] + pathBandBuffer[source + 5u];
    float prefix = 0.0;
    for (uint index = 0u; index < count; ++index)
    {
        uint curve = curveBase + index * 8u;
        float2 first = float2(asfloat(pathBandBuffer[curve]), asfloat(pathBandBuffer[curve + 1u]));
        float2 control = float2(asfloat(pathBandBuffer[curve + 2u]), asfloat(pathBandBuffer[curve + 3u]));
        float2 last = float2(asfloat(pathBandBuffer[curve + 4u]), asfloat(pathBandBuffer[curve + 5u]));
        float distance = (pathBandBuffer[curve + 6u] & 8u) == 0u
            ? strokeLength(float2(0.0), metricPoint(control - first, matrix), metricPoint(last - first, matrix), 1.0)
            : 0.0;
        strokeDataBuffer[destination + index * 2u] = asuint(prefix);
        strokeDataBuffer[destination + index * 2u + 1u] = asuint(distance);
        prefix += distance;
    }
    strokeDataBuffer[destination + count * 2u] = asuint(prefix);
}
