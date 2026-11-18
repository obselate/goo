#define vec2 float2
#define vec3 float3
#define vec4 float4
#define ivec2 int2
#define ivec4 int4
#define floatBitsToUint asuint
#define mix lerp
#define uniform [[vk::binding(0, 1)]]
#define isamplerBuffer Texture2D<int4>
#define HB_GPU_NO_MSAA
int4 texelFetch(Texture2D<int4> atlas, int offset)
{
    return atlas.Load(int3(offset % 1024, offset / 1024, 0));
}
#include "../../../../tools/Goo.ShaderGen/Vendored/HarfBuzz-14.3.1/src/hb-gpu-fragment.glsl"
[shader("fragment")]
float4 main(
    [[vk::location(0)]] float2 texcoord,
    [[vk::location(1)]] nointerpolation uint glyphLoc,
    [[vk::location(4)]] nointerpolation float4 foreground) : SV_Target
{
    float2 pixelsPerEm = 1.0 / fwidth(texcoord);
    float2 dx = ddx(texcoord) * 0.25;
    float2 dy = ddy(texcoord) * 0.25;
    float2 scale = pixelsPerEm * 2.0;
    float coverage = 0.25 * (
        _hb_gpu_slug_single(texcoord - dx - dy, scale, glyphLoc) +
        _hb_gpu_slug_single(texcoord + dx - dy, scale, glyphLoc) +
        _hb_gpu_slug_single(texcoord - dx + dy, scale, glyphLoc) +
        _hb_gpu_slug_single(texcoord + dx + dy, scale, glyphLoc));
    float brightness = dot(foreground.rgb / max(foreground.a, 0.0001), float3(0.30, 0.59, 0.11));
    float contrast = clamp(4.0 * (0.75 - brightness), 0.0, 1.0);
    float alpha = coverage * (contrast + 1.0) / (coverage * contrast + 1.0);
    float correction = (0.14805442 * brightness - 0.89459451) * alpha + 1.47590801 * brightness - 0.32466824;
    coverage = alpha + alpha * (1.0 - alpha) * correction;
    return foreground * coverage;
}
