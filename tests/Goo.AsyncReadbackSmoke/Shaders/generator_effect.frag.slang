#include "goo_effect.slang"

float4 gooEffect(float2 uv, float4 source, float4 backdrop)
{
    float red = asfloat(gooDataWord(0, 0)) * gooParameter(0).x;
    float green = asfloat(gooDataWord(0, 1));
    return float4(red, green, 0.0, 1.0);
}
