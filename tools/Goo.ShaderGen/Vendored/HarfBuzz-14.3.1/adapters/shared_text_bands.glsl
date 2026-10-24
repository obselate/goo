#undef _hb_gpu_slug

bool gooTextAccumulate(vec4 q12, vec2 q3, vec2 point, float pixels,
                       bool leftRay, inout vec2 coverage)
{
    vec4 p12 = q12 - vec4(point, point);
    vec2 p3 = q3 - point;
    if (leftRay ? min(min(p12.x, p12.z), p3.x) * pixels > 0.5
                : max(max(p12.x, p12.z), p3.x) * pixels < -0.5)
        return false;
    uint code = _hb_gpu_calc_root_code(p12.y, p12.w, p3.y);
    if (code != 0U)
    {
        vec2 a = q12.xy - q12.zw * 2.0 + q3;
        vec2 b = q12.xy - q12.zw;
        vec2 r = _hb_gpu_solve_horiz_poly(a, b, p12.xy) * pixels;
        vec2 cov = leftRay ? clamp(vec2(0.5) - r, 0.0, 1.0)
                          : clamp(r + vec2(0.5), 0.0, 1.0);
        if ((code & 1U) != 0U)
        {
            coverage.x += cov.x;
            coverage.y = max(coverage.y, clamp(1.0 - abs(r.x) * 2.0, 0.0, 1.0));
        }
        if (code > 1U)
        {
            coverage.x -= cov.y;
            coverage.y = max(coverage.y, clamp(1.0 - abs(r.y) * 2.0, 0.0, 1.0));
        }
    }
    return true;
}

bool gooTextAccumulatePair(vec4 q12, vec2 q3, vec2 first, vec2 second,
                           float pixels, bool leftRay, inout vec4 coverage)
{
    float edge = leftRay ? min(min(q12.x, q12.z), q3.x)
                        : max(max(q12.x, q12.z), q3.x);
    vec2 distance = (vec2(edge) - vec2(first.x, second.x)) * pixels;
    bvec2 enabled = leftRay ? lessThanEqual(distance, vec2(0.5))
                          : greaterThanEqual(distance, vec2(-0.5));
    if (!any(enabled)) return false;
    vec4 p12 = q12 - vec4(first, first);
    vec2 p3 = q3 - first;
    uint code = _hb_gpu_calc_root_code(p12.y, p12.w, p3.y);
    if (code != 0U)
    {
        vec2 a = q12.xy - q12.zw * 2.0 + q3;
        vec2 b = q12.xy - q12.zw;
        float d = sqrt(max(b.y * b.y - a.y * p12.y, 0.0));
        float ra = 1.0 / a.y;
        vec2 t = vec2((b.y - d) * ra, (b.y + d) * ra);
        if (a.y == 0.0) t = vec2(p12.y * (0.5 / b.y));
        vec2 roots = (a.x * t - b.x * 2.0) * t;
        vec4 r = vec4(roots + vec2(p12.x), roots + vec2(q12.x - second.x)) * pixels;
        vec4 cov = leftRay ? clamp(vec4(0.5) - r, 0.0, 1.0)
                          : clamp(r + vec4(0.5), 0.0, 1.0);
        if ((code & 1U) != 0U)
        {
            coverage.xz += mix(vec2(0.0), cov.xz, enabled);
            coverage.yw = max(coverage.yw, mix(vec2(0.0),
                clamp(1.0 - abs(r.xz) * 2.0, 0.0, 1.0), enabled));
        }
        if (code > 1U)
        {
            coverage.xz -= mix(vec2(0.0), cov.yw, enabled);
            coverage.yw = max(coverage.yw, mix(vec2(0.0),
                clamp(1.0 - abs(r.yw) * 2.0, 0.0, 1.0), enabled));
        }
    }
    return true;
}

vec4 gooTextBandPair(vec2 first, vec2 second, vec2 pixelsPerEm,
                     uint glyphLoc, bool vertical)
{
    _hb_gpu_glyph_info gi = _hb_gpu_decode_glyph(first, glyphLoc);
    ivec4 band = hb_gpu_fetch(gi.bandBase + (vertical
        ? gi.numHBands + gi.bandIndex.x : gi.bandIndex.y));
    if (vertical)
    {
        first = first.yx;
        second = second.yx;
        pixelsPerEm = pixelsPerEm.yx;
    }
    float split = float(band.a) * HB_GPU_INV_UNITS;
    bool firstLeft = first.x < split;
    bool secondLeft = second.x < split;
    int firstOffset = (firstLeft ? band.b : band.g) + 32768;
    int secondOffset = (secondLeft ? band.b : band.g) + 32768;
    vec4 coverage = vec4(0.0);
    bool firstActive = true;
    bool secondActive = true;
    for (int ci = 0; ci < band.r && (firstActive || secondActive); ci++)
    {
        int dataOffset = firstActive ? firstOffset : secondOffset;
        int curveOffset = hb_gpu_fetch(gi.glyphLoc + dataOffset + ci).r + 32768;
        vec4 q12 = vec4(hb_gpu_fetch(gi.glyphLoc + curveOffset)) * HB_GPU_INV_UNITS;
        vec2 q3 = vec2(hb_gpu_fetch(gi.glyphLoc + curveOffset + 1).rg) * HB_GPU_INV_UNITS;
        if (vertical)
        {
            q12 = q12.yxwz;
            q3 = q3.yx;
        }
        if (firstLeft == secondLeft)
        {
            if (!gooTextAccumulatePair(q12, q3, first, second, pixelsPerEm.x,
                                       firstLeft, coverage)) break;
            continue;
        }
        if (firstActive)
            firstActive = gooTextAccumulate(q12, q3, first, pixelsPerEm.x,
                                            firstLeft, coverage.xy);
        if (secondActive)
        {
            if (dataOffset != secondOffset)
            {
                curveOffset = hb_gpu_fetch(gi.glyphLoc + secondOffset + ci).r + 32768;
                q12 = vec4(hb_gpu_fetch(gi.glyphLoc + curveOffset)) * HB_GPU_INV_UNITS;
                q3 = vec2(hb_gpu_fetch(gi.glyphLoc + curveOffset + 1).rg) * HB_GPU_INV_UNITS;
                if (vertical)
                {
                    q12 = q12.yxwz;
                    q3 = q3.yx;
                }
            }
            secondActive = gooTextAccumulate(q12, q3, second, pixelsPerEm.x,
                                             secondLeft, coverage.zw);
        }
    }
    if (firstLeft != vertical) coverage.x = -coverage.x;
    if (secondLeft != vertical) coverage.z = -coverage.z;
    return coverage;
}

float _hb_gpu_slug(vec2 renderCoord, vec2 pixelsPerEm, uint glyphLoc)
{
    float center = _hb_gpu_slug_single(renderCoord, pixelsPerEm, glyphLoc);
    float ppem = hb_gpu_ppem(renderCoord, glyphLoc);
    if (ppem >= 16.0) return center;
    vec2 d = (1.0 / pixelsPerEm) * (1.0 / 3.0);
    vec2 lowerLeft = renderCoord + vec2(-d.x, -d.y);
    vec2 lowerRight = renderCoord + vec2(d.x, -d.y);
    vec2 upperLeft = renderCoord + vec2(-d.x, d.y);
    vec2 upperRight = renderCoord + vec2(d.x, d.y);
    vec4 lower = gooTextBandPair(lowerLeft, lowerRight, pixelsPerEm, glyphLoc, false);
    vec4 upper = gooTextBandPair(upperLeft, upperRight, pixelsPerEm, glyphLoc, false);
    vec4 left = gooTextBandPair(lowerLeft, upperLeft, pixelsPerEm, glyphLoc, true);
    vec4 right = gooTextBandPair(lowerRight, upperRight, pixelsPerEm, glyphLoc, true);
    float msaa = 0.25 *
        (_hb_gpu_calc_coverage(lower.x, left.x, lower.y, left.y) +
         _hb_gpu_calc_coverage(lower.z, right.x, lower.w, right.y) +
         _hb_gpu_calc_coverage(upper.x, left.z, upper.y, left.w) +
         _hb_gpu_calc_coverage(upper.z, right.z, upper.w, right.w));
    return mix(center, msaa, smoothstep(16.0, 8.0, ppem));
}
