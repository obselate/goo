#define GOO_UNCLIPPED
#include "goo_effect.slang"

float4 gooEffect(float2 uv, float4 source, float4 backdrop)
{
    float4 control = gooParameter(0);
    uint width;
    uint height;
    gooSourceTexture.GetDimensions(width, height);
    float2 texel = 1.0 / float2(width, height);
    float2 edge = 0.5 * texel;
    if (control.z > 1.5)
    {
        float4 total = float4(0.0);
        for (int y = -1; y <= 1; y += 2)
        {
            for (int x = -1; x <= 1; x += 2)
            {
                total += gooSourceTexture.Sample(clamp(uv + float2(x, y) * texel, edge, 1.0 - edge));
            }
        }
        return total * 0.25;
    }
    bool vertical = control.z > 0.5;
    float sigma = max(vertical ? control.y : control.x, 0.001);
    float2 axis = vertical ? float2(0.0, texel.y) : float2(texel.x, 0.0);
    float4 total = source;
    float weight = 1.0;
    for (int near = 1; float(near) <= sigma * 3.0; near += 2)
    {
        float far = float(near + 1);
        float nearWeight = exp(-0.5 * float(near * near) / (sigma * sigma));
        float farWeight = exp(-0.5 * far * far / (sigma * sigma));
        float pairWeight = nearWeight + farWeight;
        float2 offset = axis * ((float(near) * nearWeight + far * farWeight) / pairWeight);
        total += (gooSourceTexture.Sample(clamp(uv + offset, edge, 1.0 - edge))
            + gooSourceTexture.Sample(clamp(uv - offset, edge, 1.0 - edge))) * pairWeight;
        weight += 2.0 * pairWeight;
    }
    return total / weight;
}
