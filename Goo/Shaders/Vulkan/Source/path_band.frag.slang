#include "slang_compat.slang"
[[vk::binding(0, 0)]] StructuredBuffer<uint> pathBandBuffer;
struct PathBandPushConstants
{
    float4 transform0;
    float4 transform1;
    float4 sampleStep;
    float4 color;
    uint4 params;
};
[[vk::push_constant]] ConstantBuffer<PathBandPushConstants> pc;
static float2 pathPosition;
static uint gooClipDrawOrdinal;
static float4 gooFragmentPosition;
static float4 outColor;
#include "clip_chain.slang"
#include "path_band_eval.slang"

float2 pathPixelsPerUnit()
{
    float inverseWidth = max(abs(pc.sampleStep.x), PathMinPixelsPerUnit);
    float inverseHeight = max(abs(pc.sampleStep.y), PathMinPixelsPerUnit);
    float width = 1.0 / inverseWidth;
    float height = 1.0 / inverseHeight;
    float2 pathXAxis = float2(pc.transform0.x * width * 0.5, pc.transform1.x * height * 0.5);
    float2 pathYAxis = float2(pc.transform0.y * width * 0.5, pc.transform1.y * height * 0.5);
    return max(float2(length(pathXAxis), length(pathYAxis)), float2(PathMinPixelsPerUnit));
}

#ifdef GOO_STROKE
[[vk::binding(0, 2)]] StructuredBuffer<uint> strokeDataBuffer;
#include "path_stroke_eval.slang"
#endif

struct PathBandFragmentInput
{
    [[vk::location(0)]] float2 pathPosition;
    [[vk::location(2)]] nointerpolation uint clipDrawOrdinal;
    float4 position : SV_Position;
};

struct PathBandFragmentOutput
{
    [[vk::location(0)]] float4 color : SV_Target0;
};

[shader("fragment")]
PathBandFragmentOutput main(PathBandFragmentInput input)
{
    PathBandFragmentOutput output;
    pathPosition = input.pathPosition;
    gooFragmentPosition = input.position;
    gooClipDrawOrdinal = input.clipDrawOrdinal;
#ifdef GOO_STROKE
    float2 stepX = ddx(input.pathPosition);
    float2 stepY = ddy(input.pathPosition);
    float alpha = pc.params.w == 0u
        ? gooEvaluatePathCoverage(pathBandBuffer, pc.params.x, pc.params.y, pathPosition, pathPixelsPerUnit(), false)
        : gooEvaluatePathStroke(pathBandBuffer, strokeDataBuffer, pc.params.x, pc.params.w, pc.params.y, pathPosition, stepX, stepY, abs(pc.sampleStep.zw));
#else
    float alpha = gooEvaluatePathCoverage(pathBandBuffer, pc.params.x, pc.params.y, pathPosition, pathPixelsPerUnit(), false);
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
    output.color = outColor;
    return output;
}
