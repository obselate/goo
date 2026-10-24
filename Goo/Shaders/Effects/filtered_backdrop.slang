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
    float4 mapping = gooParameter(1);
    uv = mapping.xy + uv * mapping.zw;
    if (control.z >= 4.0)
    {
        return gooSourceTexture.SampleLevel(clamp(uv, edge, 1.0 - edge), 0.0);
    }
    bool vertical = control.z == 1.0 || control.z == 3.0;
    float2 axis = vertical ? float2(0.0, texel.y) : float2(texel.x, 0.0);
    float4 total = gooSourceTexture.SampleLevel(uv, 0.0);
    if (control.z >= 2.0)
    {
        total *= 70.0 / 256.0;
        static const float weights[4] = {56.0 / 256.0, 28.0 / 256.0, 8.0 / 256.0, 1.0 / 256.0};
        for (int pair = 0; pair < 4; pair++)
        {
            float2 offset = axis * float(2 * (pair + 1));
            total += (gooSourceTexture.SampleLevel(clamp(uv + offset, edge, 1.0 - edge), 0.0)
                + gooSourceTexture.SampleLevel(clamp(uv - offset, edge, 1.0 - edge), 0.0)) * weights[pair];
        }
        return total;
    }
    float sigma = max(vertical ? control.y : control.x, 0.001);
    float weight = 1.0;
    float ratio = exp(-0.5 / (sigma * sigma));
    float ratioStep = ratio * ratio;
    float sampleWeight = 1.0;
    for (int near = 1; float(near) <= sigma * 3.0; near += 2)
    {
        float far = float(near + 1);
        sampleWeight *= ratio;
        ratio *= ratioStep;
        float nearWeight = sampleWeight;
        sampleWeight *= ratio;
        ratio *= ratioStep;
        float farWeight = sampleWeight;
        float pairWeight = nearWeight + farWeight;
        float2 offset = axis * ((float(near) * nearWeight + far * farWeight) / pairWeight);
        total += (gooSourceTexture.SampleLevel(clamp(uv + offset, edge, 1.0 - edge), 0.0)
            + gooSourceTexture.SampleLevel(clamp(uv - offset, edge, 1.0 - edge), 0.0)) * pairWeight;
        weight += 2.0 * pairWeight;
    }
    return total / weight;
}
