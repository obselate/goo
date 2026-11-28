#include "goo_effect.glsl"

vec4 gooEffect(vec2 uv, vec4 source, vec4 backdrop)
{
    float blend = clamp(gooParameter(0u).x, 0.0, 1.0);
    float dataScale = gooDataByteLength(0u) >= 4u ? uintBitsToFloat(gooDataWord(0u, 0u)) : 1.0;
    vec4 primRect = gooPrimitive().rect;
    float timeWave = 0.5 + 0.5 * sin(gooElapsedSeconds());
    return mix(source, backdrop, blend) * vec4(uv, timeWave, 1.0) * dataScale
        + primRect * 0.0;
}
