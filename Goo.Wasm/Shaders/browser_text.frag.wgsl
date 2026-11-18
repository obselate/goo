@binding(0) @group(1) var hb_gpu_atlas_0 : texture_2d<i32>;

fn texelFetch_0( atlas_0 : texture_2d<i32>,  offset_0 : i32) -> vec4<i32>
{
    var _S1 : vec3<i32> = vec3<i32>(offset_0 % i32(1024), offset_0 / i32(1024), i32(0));
    return (textureLoad((atlas_0), ((_S1)).xy, ((_S1)).z));
}

fn hb_gpu_fetch_0( offset_1 : i32) -> vec4<i32>
{
    return texelFetch_0(hb_gpu_atlas_0, offset_1);
}

struct _hb_gpu_glyph_info_0
{
     glyphLoc_0 : i32,
     bandBase_0 : i32,
     bandIndex_0 : vec2<i32>,
     numHBands_0 : i32,
     numVBands_0 : i32,
     scale_0 : vec2<f32>,
};

fn _hb_gpu_decode_glyph_0( renderCoord_0 : vec2<f32>,  glyphLoc_1 : u32) -> _hb_gpu_glyph_info_0
{
    var gi_0 : _hb_gpu_glyph_info_0;
    var _S2 : i32 = i32(glyphLoc_1);
    gi_0.glyphLoc_0 = _S2;
    var header1_0 : vec4<i32> = hb_gpu_fetch_0(_S2 + i32(1));
    var ext_0 : vec4<f32> = vec4<f32>(hb_gpu_fetch_0(_S2)) * vec4<f32>(0.25f);
    var _S3 : i32 = header1_0.x;
    gi_0.numHBands_0 = _S3;
    var _S4 : i32 = header1_0.y;
    gi_0.numVBands_0 = _S4;
    gi_0.scale_0 = vec2<f32>(f32(header1_0.z), f32(header1_0.w));
    var _S5 : vec2<f32> = ext_0.xy;
    var bandScale_0 : vec2<f32> = vec2<f32>(f32(_S4), f32(_S3)) / max(ext_0.zw - _S5, vec2<f32>(0.0000152587890625f));
    gi_0.bandIndex_0 = clamp(vec2<i32>(renderCoord_0 * bandScale_0 + (vec2<f32>(0) - _S5) * bandScale_0), vec2<i32>(i32(0), i32(0)), vec2<i32>(_S4 - i32(1), _S3 - i32(1)));
    gi_0.bandBase_0 = _S2 + i32(2);
    return gi_0;
}

fn _hb_gpu_calc_root_code_0( y1_0 : f32,  y2_0 : f32,  y3_0 : f32) -> u32
{
    return (((u32(11892) >> ((((((((bitcast<u32>((y3_0))) >> (u32(29)))) & (u32(4)))) | ((((((((((bitcast<u32>((y2_0))) >> (u32(30)))) & (u32(2)))) | ((((((bitcast<u32>((y1_0))) >> (u32(31)))) & (u32(4294967293))))))) & (u32(4294967291)))))))))) & (u32(257)));
}

fn _hb_gpu_solve_horiz_poly_0( a_0 : vec2<f32>,  b_0 : vec2<f32>,  p1_0 : vec2<f32>) -> vec2<f32>
{
    var _S6 : f32 = a_0.y;
    var ra_0 : f32 = 1.0f / _S6;
    var _S7 : f32 = b_0.y;
    var rb_0 : f32 = 0.5f / _S7;
    var _S8 : f32 = p1_0.y;
    var d_0 : f32 = sqrt(max(_S7 * _S7 - _S6 * _S8, 0.0f));
    var _S9 : f32 = (_S7 - d_0) * ra_0;
    var _S10 : f32 = (_S7 + d_0) * ra_0;
    var t1_0 : f32;
    var t2_0 : f32;
    if(_S6 == 0.0f)
    {
        var t2_1 : f32 = _S8 * rb_0;
        t1_0 = t2_1;
        t2_0 = t2_1;
    }
    else
    {
        t1_0 = _S9;
        t2_0 = _S10;
    }
    var _S11 : f32 = a_0.x;
    var _S12 : f32 = b_0.x * 2.0f;
    var _S13 : f32 = p1_0.x;
    return vec2<f32>((_S11 * t1_0 - _S12) * t1_0 + _S13, (_S11 * t2_0 - _S12) * t2_0 + _S13);
}

fn _hb_gpu_solve_vert_poly_0( a_1 : vec2<f32>,  b_1 : vec2<f32>,  p1_1 : vec2<f32>) -> vec2<f32>
{
    var _S14 : f32 = a_1.x;
    var ra_1 : f32 = 1.0f / _S14;
    var _S15 : f32 = b_1.x;
    var rb_1 : f32 = 0.5f / _S15;
    var _S16 : f32 = p1_1.x;
    var d_1 : f32 = sqrt(max(_S15 * _S15 - _S14 * _S16, 0.0f));
    var _S17 : f32 = (_S15 - d_1) * ra_1;
    var _S18 : f32 = (_S15 + d_1) * ra_1;
    var t1_1 : f32;
    var t2_2 : f32;
    if(_S14 == 0.0f)
    {
        var t2_3 : f32 = _S16 * rb_1;
        t1_1 = t2_3;
        t2_2 = t2_3;
    }
    else
    {
        t1_1 = _S17;
        t2_2 = _S18;
    }
    var _S19 : f32 = a_1.y;
    var _S20 : f32 = b_1.y * 2.0f;
    var _S21 : f32 = p1_1.y;
    return vec2<f32>((_S19 * t1_1 - _S20) * t1_1 + _S21, (_S19 * t2_2 - _S20) * t2_2 + _S21);
}

fn _hb_gpu_calc_coverage_0( xcov_0 : f32,  ycov_0 : f32,  xwgt_0 : f32,  ywgt_0 : f32) -> f32
{
    return clamp(max(abs(xcov_0 * xwgt_0 + ycov_0 * ywgt_0) / max(xwgt_0 + ywgt_0, 0.0000152587890625f), min(abs(xcov_0), abs(ycov_0))), 0.0f, 1.0f);
}

fn _hb_gpu_slug_single_0( renderCoord_1 : vec2<f32>,  pixelsPerEm_0 : vec2<f32>,  glyphLoc_2 : u32) -> f32
{
    var ywgt_1 : f32;
    var ycov_1 : f32;
    var ywgt_2 : f32;
    var ycov_2 : f32;
    var cov_0 : vec2<f32>;
    var gi_1 : _hb_gpu_glyph_info_0 = _hb_gpu_decode_glyph_0(renderCoord_1, glyphLoc_2);
    var hbandData_0 : vec4<i32> = hb_gpu_fetch_0(gi_1.bandBase_0 + gi_1.bandIndex_0.y);
    var _S22 : i32 = hbandData_0.x;
    var hLeftRay_0 : bool = (renderCoord_1.x) < (f32(hbandData_0.w) * 0.25f);
    var ci_0 : i32;
    if(hLeftRay_0)
    {
        ci_0 = hbandData_0.z;
    }
    else
    {
        ci_0 = hbandData_0.y;
    }
    var _S23 : i32 = ci_0 + i32(32768);
    var xwgt_1 : f32 = 0.0f;
    ci_0 = i32(0);
    var xcov_1 : f32 = 0.0f;
    for(;;)
    {
        if(ci_0 < _S22)
        {
        }
        else
        {
            break;
        }
        var _S24 : i32 = gi_1.glyphLoc_0 + (hb_gpu_fetch_0(gi_1.glyphLoc_0 + _S23 + ci_0).x + i32(32768));
        var q12_0 : vec4<f32> = vec4<f32>(hb_gpu_fetch_0(_S24)) * vec4<f32>(0.25f);
        var q3_0 : vec2<f32> = vec2<f32>(hb_gpu_fetch_0(_S24 + i32(1)).xy) * vec2<f32>(0.25f);
        var p12_0 : vec4<f32> = q12_0 - vec4<f32>(renderCoord_1, renderCoord_1);
        var p3_0 : vec2<f32> = q3_0 - renderCoord_1;
        if(hLeftRay_0)
        {
            if((min(min(p12_0.x, p12_0.z), p3_0.x) * pixelsPerEm_0.x) > 0.5f)
            {
                break;
            }
        }
        else
        {
            if((max(max(p12_0.x, p12_0.z), p3_0.x) * pixelsPerEm_0.x) < -0.5f)
            {
                break;
            }
        }
        var code_0 : u32 = _hb_gpu_calc_root_code_0(p12_0.y, p12_0.w, p3_0.y);
        if(code_0 != u32(0))
        {
            var _S25 : vec2<f32> = q12_0.xy;
            var _S26 : vec2<f32> = q12_0.zw;
            var r_0 : vec2<f32> = _hb_gpu_solve_horiz_poly_0(_S25 - _S26 * vec2<f32>(2.0f) + q3_0, _S25 - _S26, p12_0.xy) * vec2<f32>(pixelsPerEm_0.x);
            if(hLeftRay_0)
            {
                cov_0 = clamp(vec2<f32>(0.5f) - r_0, vec2<f32>(0.0f), vec2<f32>(1.0f));
            }
            else
            {
                cov_0 = clamp(r_0 + vec2<f32>(0.5f), vec2<f32>(0.0f), vec2<f32>(1.0f));
            }
            if(((code_0 & (u32(1)))) != u32(0))
            {
                var xcov_2 : f32 = xcov_1 + cov_0.x;
                ywgt_1 = max(xwgt_1, clamp(1.0f - abs(r_0.x) * 2.0f, 0.0f, 1.0f));
                ycov_1 = xcov_2;
            }
            else
            {
                ywgt_1 = xwgt_1;
                ycov_1 = xcov_1;
            }
            if(code_0 > u32(1))
            {
                var xcov_3 : f32 = ycov_1 - cov_0.y;
                ywgt_2 = max(ywgt_1, clamp(1.0f - abs(r_0.y) * 2.0f, 0.0f, 1.0f));
                ycov_2 = xcov_3;
            }
            else
            {
                ywgt_2 = ywgt_1;
                ycov_2 = ycov_1;
            }
            xwgt_1 = ywgt_2;
            xcov_1 = ycov_2;
        }
        ci_0 = ci_0 + i32(1);
    }
    if(hLeftRay_0)
    {
        xcov_1 = - xcov_1;
    }
    var vbandData_0 : vec4<i32> = hb_gpu_fetch_0(gi_1.bandBase_0 + gi_1.numHBands_0 + gi_1.bandIndex_0.x);
    var _S27 : i32 = vbandData_0.x;
    var vLeftRay_0 : bool = (renderCoord_1.y) < (f32(vbandData_0.w) * 0.25f);
    if(vLeftRay_0)
    {
        ci_0 = vbandData_0.z;
    }
    else
    {
        ci_0 = vbandData_0.y;
    }
    var _S28 : i32 = ci_0 + i32(32768);
    ywgt_1 = 0.0f;
    ci_0 = i32(0);
    ycov_1 = 0.0f;
    for(;;)
    {
        if(ci_0 < _S27)
        {
        }
        else
        {
            break;
        }
        var _S29 : i32 = gi_1.glyphLoc_0 + (hb_gpu_fetch_0(gi_1.glyphLoc_0 + _S28 + ci_0).x + i32(32768));
        var q12_1 : vec4<f32> = vec4<f32>(hb_gpu_fetch_0(_S29)) * vec4<f32>(0.25f);
        var q3_1 : vec2<f32> = vec2<f32>(hb_gpu_fetch_0(_S29 + i32(1)).xy) * vec2<f32>(0.25f);
        var p12_1 : vec4<f32> = q12_1 - vec4<f32>(renderCoord_1, renderCoord_1);
        var p3_1 : vec2<f32> = q3_1 - renderCoord_1;
        if(vLeftRay_0)
        {
            if((min(min(p12_1.y, p12_1.w), p3_1.y) * pixelsPerEm_0.y) > 0.5f)
            {
                break;
            }
        }
        else
        {
            if((max(max(p12_1.y, p12_1.w), p3_1.y) * pixelsPerEm_0.y) < -0.5f)
            {
                break;
            }
        }
        var code_1 : u32 = _hb_gpu_calc_root_code_0(p12_1.x, p12_1.z, p3_1.x);
        if(code_1 != u32(0))
        {
            var _S30 : vec2<f32> = q12_1.xy;
            var _S31 : vec2<f32> = q12_1.zw;
            var r_1 : vec2<f32> = _hb_gpu_solve_vert_poly_0(_S30 - _S31 * vec2<f32>(2.0f) + q3_1, _S30 - _S31, p12_1.xy) * vec2<f32>(pixelsPerEm_0.y);
            if(vLeftRay_0)
            {
                cov_0 = clamp(vec2<f32>(0.5f) - r_1, vec2<f32>(0.0f), vec2<f32>(1.0f));
            }
            else
            {
                cov_0 = clamp(r_1 + vec2<f32>(0.5f), vec2<f32>(0.0f), vec2<f32>(1.0f));
            }
            if(((code_1 & (u32(1)))) != u32(0))
            {
                var ycov_3 : f32 = ycov_1 - cov_0.x;
                ywgt_2 = max(ywgt_1, clamp(1.0f - abs(r_1.x) * 2.0f, 0.0f, 1.0f));
                ycov_2 = ycov_3;
            }
            else
            {
                ywgt_2 = ywgt_1;
                ycov_2 = ycov_1;
            }
            var ywgt_3 : f32;
            var ycov_4 : f32;
            if(code_1 > u32(1))
            {
                var ycov_5 : f32 = ycov_2 + cov_0.y;
                ywgt_3 = max(ywgt_2, clamp(1.0f - abs(r_1.y) * 2.0f, 0.0f, 1.0f));
                ycov_4 = ycov_5;
            }
            else
            {
                ywgt_3 = ywgt_2;
                ycov_4 = ycov_2;
            }
            ywgt_1 = ywgt_3;
            ycov_1 = ycov_4;
        }
        ci_0 = ci_0 + i32(1);
    }
    if(vLeftRay_0)
    {
        ycov_1 = - ycov_1;
    }
    return _hb_gpu_calc_coverage_0(xcov_1, ycov_1, xwgt_1, ywgt_1);
}

struct pixelOutput_0
{
    @location(0) output_0 : vec4<f32>,
};

struct pixelInput_0
{
    @location(0) texcoord_0 : vec2<f32>,
    @interpolate(flat) @location(1) glyphLoc_3 : u32,
    @interpolate(flat) @location(4) foreground_0 : vec4<f32>,
};

@fragment
fn main( _S32 : pixelInput_0) -> pixelOutput_0
{
    var _S33 : vec2<f32> = vec2<f32>(0.25f);
    var dx_0 : vec2<f32> = dpdx(_S32.texcoord_0) * _S33;
    var dy_0 : vec2<f32> = dpdy(_S32.texcoord_0) * _S33;
    var scale_1 : vec2<f32> = vec2<f32>(1.0f) / (fwidth((_S32.texcoord_0))) * vec2<f32>(2.0f);
    var _S34 : vec2<f32> = _S32.texcoord_0 - dx_0;
    var _S35 : vec2<f32> = _S32.texcoord_0 + dx_0;
    var coverage_0 : f32 = 0.25f * (_hb_gpu_slug_single_0(_S34 - dy_0, scale_1, _S32.glyphLoc_3) + _hb_gpu_slug_single_0(_S35 - dy_0, scale_1, _S32.glyphLoc_3) + _hb_gpu_slug_single_0(_S34 + dy_0, scale_1, _S32.glyphLoc_3) + _hb_gpu_slug_single_0(_S35 + dy_0, scale_1, _S32.glyphLoc_3));
    var brightness_0 : f32 = dot(_S32.foreground_0.xyz / vec3<f32>(max(_S32.foreground_0.w, 0.00009999999747379f)), vec3<f32>(0.30000001192092896f, 0.5899999737739563f, 0.10999999940395355f));
    var contrast_0 : f32 = clamp(4.0f * (0.75f - brightness_0), 0.0f, 1.0f);
    var alpha_0 : f32 = coverage_0 * (contrast_0 + 1.0f) / (coverage_0 * contrast_0 + 1.0f);
    var _S36 : pixelOutput_0 = pixelOutput_0( _S32.foreground_0 * vec4<f32>((alpha_0 + alpha_0 * (1.0f - alpha_0) * ((0.14805442094802856f * brightness_0 - 0.89459449052810669f) * alpha_0 + 1.47590804100036621f * brightness_0 - 0.32466822862625122f))) );
    return _S36;
}

