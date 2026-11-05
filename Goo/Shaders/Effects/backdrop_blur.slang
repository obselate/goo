#define GOO_REPLACES_BACKDROP
#include "goo_effect.slang"

float4 gooEffect(float2 uv, float4 source, float4 backdrop)
{
    GooPrimitiveRecord primitive = gooPrimitive();
    float2 coordinate = primitive.params.xy + uv * primitive.params.zw;
    float4 sourceMapping = gooParameter(1);
    float4 backdropMapping = gooParameter(2);
    float4 sampledSource = gooSourceTexture.SampleLevel(
        clamp(coordinate * sourceMapping.xy, sourceMapping.zw, sourceMapping.xy - sourceMapping.zw), 0.0);
    float4 sampledBackdrop = gooBackdropTexture.SampleLevel(
        clamp(coordinate * backdropMapping.xy, backdropMapping.zw, backdropMapping.xy - backdropMapping.zw), 0.0);
    return lerp(sampledBackdrop, sampledSource, gooParameter(0).x);
}
