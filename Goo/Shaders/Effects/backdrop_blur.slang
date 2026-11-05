#define GOO_REPLACES_BACKDROP
#include "goo_effect.slang"

float4 gooEffect(float2 uv, float4 source, float4 backdrop)
{
    GooPrimitiveRecord primitive = gooPrimitive();
    return lerp(backdrop, gooSourceTexture.SampleLevel(primitive.params.xy + uv * primitive.params.zw, 0.0),
        gooParameter(0).x);
}
