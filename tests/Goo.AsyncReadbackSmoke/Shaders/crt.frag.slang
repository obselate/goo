#include "goo_effect.slang"

float crtHash(float2 value)
{
    float3 p = frac(float3(value.xyx) * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return frac((p.x + p.y) * p.z);
}

float4 crtSample(float2 uv)
{
    GooPrimitiveRecord primitive = gooPrimitive();
    float2 sourceUv = primitive.params.xy + uv * primitive.params.zw;
    return gooSourceTexture.Sample(clamp(sourceUv, 0.0, 1.0));
}

float4 gooEffect(float2 uv, float4 source, float4 backdrop)
{
    float4 frame = gooParameter(0);
    float4 controls = gooParameter(2);
    float curvature = lerp(0.015, 0.115, clamp(controls.x, 0.0, 1.0));
    float scanlineAmount = lerp(0.04, 0.26, clamp(controls.y, 0.0, 1.0));
    float bloomAmount = lerp(0.0, 0.42, clamp(controls.z, 0.0, 1.0));
    const float2 resolution = float2(640.0, 360.0);
    float2 p = uv * 2.0 - 1.0;
    float radiusSquared = dot(p, p);
    float2 warped = p * (1.0 + radiusSquared * curvature);
    float2 sampleUv = warped * 0.5 + 0.5;
    float inside = step(0.0, sampleUv.x) * step(sampleUv.x, 1.0)
        * step(0.0, sampleUv.y) * step(sampleUv.y, 1.0);
    float2 texel = 1.0 / resolution;
    float separation = 0.55 + curvature * 8.0;
    float4 center = crtSample(sampleUv);
    float4 left = crtSample(sampleUv - float2(texel.x * separation, 0.0));
    float4 right = crtSample(sampleUv + float2(texel.x * separation, 0.0));
    float3 color = float3(right.r, center.g, left.b);

    float bloomWeight = bloomAmount * 0.25;
    float4 bloom = crtSample(sampleUv + float2(texel.x * 2.0, 0.0));
    bloom += crtSample(sampleUv - float2(texel.x * 2.0, 0.0));
    bloom += crtSample(sampleUv + float2(0.0, texel.y * 2.0));
    bloom += crtSample(sampleUv - float2(0.0, texel.y * 2.0));
    color += bloom.rgb * bloomWeight;
    float sampledAlpha = max(center.a, max(left.a, right.a));
    float alpha = clamp(max(sampledAlpha, bloom.a * bloomWeight)
        + source.a * 0.0 + backdrop.a * 0.0, 0.0, 1.0) * inside;

    float scanline = 0.5 + 0.5 * sin(sampleUv.y * resolution.y * 3.14159265);
    color *= 1.0 - scanlineAmount * scanline;
    float pixelColumn = floor(sampleUv.x * resolution.x);
    float maskPhase = frac(pixelColumn / 3.0) * 3.0;
    float3 mask = maskPhase < 1.0
        ? float3(1.0, 0.88, 0.88)
        : (maskPhase < 2.0 ? float3(0.88, 1.0, 0.88) : float3(0.88, 0.88, 1.0));
    color *= mask;
    float vignette = 1.0 - smoothstep(0.24, 1.34, radiusSquared);
    color *= 0.72 + 0.28 * vignette;
    float noise = crtHash(floor(sampleUv * resolution) + floor(frame.x * 24.0)) - 0.5;
    color += noise * 0.0045 * alpha;
    return float4(clamp(color, 0.0, alpha), alpha);
}
