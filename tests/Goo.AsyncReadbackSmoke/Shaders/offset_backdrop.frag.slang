#include "goo_effect.slang"

float4 gooEffect(float2 uv, float4 source, float4 backdrop)
{
    uint width;
    uint height;
    gooBackdropTexture.GetDimensions(width, height);
    GooPrimitiveRecord primitive = gooPrimitive();
    float2 coordinate = primitive.params.xy + uv * primitive.params.zw;
    return gooBackdropTexture.Sample(coordinate + gooParameter(0).xy / float2(width, height));
}
