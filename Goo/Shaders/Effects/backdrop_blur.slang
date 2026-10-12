#define GOO_REPLACES_BACKDROP
#include "goo_effect.slang"

static const int GooBlurMaximumPairs = 96;

float4 gooEffect(float2 uv, float4 source, float4 backdrop)
{
    float4 control = gooParameter(0);
    bool vertical = control.z > 0.5;
    GooPrimitiveRecord primitive = gooPrimitive();
    uint textureWidth;
    uint textureHeight;
    gooBackdropTexture.GetDimensions(textureWidth, textureHeight);
    float2 textureSize = float2(max(textureWidth, 1u), max(textureHeight, 1u));
    float2 texel = 1.0 / textureSize;
    float2 minUv = 1.5 * texel;
    float2 maxUv = 1.0 - minUv;
    float2 center = primitive.params.xy + uv * primitive.params.zw;
    float sigma = max((vertical ? control.y * textureSize.y : control.x * textureSize.x), 0.001);
    float2 axis = vertical ? float2(0.0, texel.y) : float2(texel.x, 0.0);
    float spread = max(1.0, sigma * 3.0 / (2.0 * float(GooBlurMaximumPairs)));
    float4 total = vertical ? source : backdrop;
    float weight = 1.0;
    for (int pair = 1; pair <= GooBlurMaximumPairs; pair++)
    {
        float near = (2.0 * float(pair) - 1.0) * spread;
        if (near > sigma * 3.0)
        {
            break;
        }
        float far = near + spread;
        float nearWeight = exp(-0.5 * near * near / (sigma * sigma));
        float farWeight = exp(-0.5 * far * far / (sigma * sigma));
        float pairWeight = nearWeight + farWeight;
        float2 offset = axis * ((near * nearWeight + far * farWeight) / pairWeight);
        float2 upper = clamp(center + offset, minUv, maxUv);
        float2 lower = clamp(center - offset, minUv, maxUv);
        if (vertical)
        {
            total += (gooSourceTexture.Sample(upper) + gooSourceTexture.Sample(lower)) * pairWeight;
        }
        else
        {
            total += (gooBackdropTexture.Sample(upper) + gooBackdropTexture.Sample(lower)) * pairWeight;
        }
        weight += 2.0 * pairWeight;
    }
    return total / weight;
}
