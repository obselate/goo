layout(location = 0) in vec2 v_texcoord;
layout(location = 1) flat in uint v_glyphLoc;
layout(location = 4) flat in vec4 v_foreground;
layout(location = 0) out vec4 outColor;

void main()
{
    vec2 pixelsPerEm = 1.0 / fwidth(v_texcoord);
    float coverage = _hb_gpu_slug(v_texcoord, pixelsPerEm, v_glyphLoc);
    uint effectMode = floatBitsToUint(v_effectAndOrigin.y);
    if (effectMode == 2u && v_effectAndOrigin.x > 0.0)
    {
        const vec2 directions[8] = vec2[8](
            vec2(1.0, 0.0),
            vec2(-1.0, 0.0),
            vec2(0.0, 1.0),
            vec2(0.0, -1.0),
            vec2(0.70710678, 0.70710678),
            vec2(-0.70710678, 0.70710678),
            vec2(0.70710678, -0.70710678),
            vec2(-0.70710678, -0.70710678));
        for (int index = 0; index < 8; index++)
        {
            coverage = max(coverage, _hb_gpu_slug(
                v_texcoord + directions[index] * v_effectAndOrigin.x,
                pixelsPerEm,
                v_glyphLoc));
        }
    }
    else if (effectMode == 3u && v_effectAndOrigin.x > 0.0)
    {
        float sigma = max(v_effectAndOrigin.x * 0.5, 0.0001);
        vec2 radius = sigma / max(pixelsPerEm, vec2(0.0001));
        const vec2 directions[8] = vec2[8](
            vec2(1.0, 0.0),
            vec2(-1.0, 0.0),
            vec2(0.0, 1.0),
            vec2(0.0, -1.0),
            vec2(1.0, 1.0),
            vec2(-1.0, 1.0),
            vec2(1.0, -1.0),
            vec2(-1.0, -1.0));
        const float weights[8] = float[8](
            0.1238414,
            0.1238414,
            0.1238414,
            0.1238414,
            0.07511361,
            0.07511361,
            0.07511361,
            0.07511361);
        float blurred = coverage * 0.20417996;
        for (int index = 0; index < 8; index++)
        {
            blurred += _hb_gpu_slug(
                v_texcoord + directions[index] * radius,
                pixelsPerEm,
                v_glyphLoc) * weights[index];
        }
        coverage = blurred;
    }
    outColor = vec4(
        v_foreground.rgb * coverage,
        v_foreground.a * coverage) * gooClipCoverage();
}
