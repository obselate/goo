struct GooPrimitiveRecord_std430_0
{
    @align(16) rect_0 : vec4<f32>,
    @align(16) transform0_0 : vec4<f32>,
    @align(16) transform1_0 : vec4<f32>,
    @align(16) radii_0 : vec4<f32>,
    @align(16) params_0 : vec4<f32>,
    @align(16) stopPositions_0 : vec4<f32>,
    @align(16) packedColors_0 : vec4<u32>,
    @align(16) packedColorsExtra_0 : vec4<u32>,
};

@binding(0) @group(2) var<storage, read> gooPrimitiveBuffer_0 : array<GooPrimitiveRecord_std430_0>;

var<private> uv_0 : vec2<f32>;

var<private> gooClipDrawOrdinal_0 : u32;

var<private> gooPrimitiveRecordOrdinal_0 : u32;

var<private> gooFragmentPosition_0 : vec4<f32>;

fn gooNormalizeRadii_0( size_0 : vec2<f32>,  source_0 : vec4<f32>) -> vec4<f32>
{
    var result_0 : vec4<f32> = max(source_0, vec4<f32>(0.0f));
    var _S1 : f32 = result_0.x;
    var _S2 : f32 = result_0.y;
    var sum_0 : f32 = _S1 + _S2;
    var _S3 : f32 = size_0.x;
    var _S4 : bool;
    if(sum_0 > _S3)
    {
        _S4 = sum_0 > 0.0f;
    }
    else
    {
        _S4 = false;
    }
    var scale_0 : f32;
    if(_S4)
    {
        scale_0 = min(1.0f, _S3 / sum_0);
    }
    else
    {
        scale_0 = 1.0f;
    }
    var _S5 : f32 = result_0.w;
    var _S6 : f32 = result_0.z;
    var sum_1 : f32 = _S5 + _S6;
    if(sum_1 > _S3)
    {
        _S4 = sum_1 > 0.0f;
    }
    else
    {
        _S4 = false;
    }
    if(_S4)
    {
        scale_0 = min(scale_0, _S3 / sum_1);
    }
    var sum_2 : f32 = _S1 + _S5;
    var _S7 : f32 = size_0.y;
    if(sum_2 > _S7)
    {
        _S4 = sum_2 > 0.0f;
    }
    else
    {
        _S4 = false;
    }
    if(_S4)
    {
        scale_0 = min(scale_0, _S7 / sum_2);
    }
    var sum_3 : f32 = _S2 + _S6;
    if(sum_3 > _S7)
    {
        _S4 = sum_3 > 0.0f;
    }
    else
    {
        _S4 = false;
    }
    if(_S4)
    {
        scale_0 = min(scale_0, _S7 / sum_3);
    }
    return result_0 * vec4<f32>(scale_0);
}

fn gooTransformedEdgeCoverage_0( point_0 : vec2<f32>,  size_1 : vec2<f32>,  cornerRadii_0 : vec4<f32>,  pointDx_0 : vec2<f32>,  pointDy_0 : vec2<f32>) -> f32
{
    var _S8 : vec2<f32> = size_1 * vec2<f32>(0.5f);
    var centered_0 : vec2<f32> = point_0 - _S8;
    var _S9 : bool = (centered_0.x) < 0.0f;
    var radius_0 : f32;
    if(_S9)
    {
        if((centered_0.y) < 0.0f)
        {
            radius_0 = cornerRadii_0.x;
        }
        else
        {
            radius_0 = cornerRadii_0.w;
        }
    }
    else
    {
        if((centered_0.y) < 0.0f)
        {
            radius_0 = cornerRadii_0.y;
        }
        else
        {
            radius_0 = cornerRadii_0.z;
        }
    }
    var q_0 : vec2<f32> = abs(centered_0) - _S8 + vec2<f32>(radius_0);
    var normal_0 : vec2<f32> = max(q_0, vec2<f32>(0.0f));
    var normal_1 : vec2<f32>;
    if((dot(normal_0, normal_0)) > 0.0f)
    {
        normal_1 = normalize(normal_0);
    }
    else
    {
        if((q_0.x) > (q_0.y))
        {
            normal_1 = vec2<f32>(1.0f, 0.0f);
        }
        else
        {
            normal_1 = vec2<f32>(0.0f, 1.0f);
        }
    }
    var _S10 : f32;
    if(_S9)
    {
        _S10 = -1.0f;
    }
    else
    {
        _S10 = 1.0f;
    }
    var _S11 : f32;
    if((centered_0.y) < 0.0f)
    {
        _S11 = -1.0f;
    }
    else
    {
        _S11 = 1.0f;
    }
    var normal_2 : vec2<f32> = normal_1 * vec2<f32>(_S10, _S11);
    var gradient_0 : vec2<f32> = abs(vec2<f32>(dot(normal_2, pointDx_0), dot(normal_2, pointDy_0)));
    var width_0 : f32 = length(gradient_0);
    var distance_0 : f32 = radius_0 - length(normal_0) - min(max(q_0.x, q_0.y), 0.0f);
    if(width_0 < 0.00009999999747379f)
    {
        if(distance_0 >= 0.0f)
        {
            radius_0 = 1.0f;
        }
        else
        {
            radius_0 = 0.0f;
        }
        return radius_0;
    }
    var _S12 : f32 = gradient_0.x;
    var _S13 : f32 = gradient_0.y;
    var span_0 : vec2<f32> = vec2<f32>(max(_S12, _S13), max(min(_S12, _S13), 9.99999997475242708e-07f * width_0)) / vec2<f32>(width_0);
    var offset_0 : f32 = distance_0 / width_0;
    var _S14 : f32 = span_0.x;
    var _S15 : f32 = span_0.y;
    var _S16 : f32 = abs(offset_0);
    var _S17 : f32 = max((_S14 + _S15) * 0.5f - _S16, 0.0f);
    var tail_0 : f32 = _S17 * _S17 / (2.0f * _S14 * _S15);
    if(_S16 <= ((_S14 - _S15) * 0.5f))
    {
        radius_0 = 0.5f + offset_0 / _S14;
    }
    else
    {
        if(offset_0 > 0.0f)
        {
            radius_0 = 1.0f - tail_0;
        }
        else
        {
            radius_0 = tail_0;
        }
    }
    return radius_0;
}

fn gooCornerCut_0( offset_1 : vec2<f32>,  radius_1 : f32,  extent_0 : vec2<f32>) -> f32
{
    var _S18 : vec2<f32> = vec2<f32>(radius_1);
    var _S19 : vec2<f32> = offset_1 + _S18;
    var _S20 : vec2<f32> = vec2<f32>(0.0f);
    var low_0 : vec2<f32> = clamp(_S19 - extent_0, _S20, _S18);
    var high_0 : vec2<f32> = clamp(_S19 + extent_0, _S20, _S18);
    if((any((high_0 <= low_0))))
    {
        return 0.0f;
    }
    var _S21 : f32 = high_0.y;
    var _S22 : f32 = low_0.x;
    var _S23 : f32 = high_0.x;
    var first_0 : f32 = clamp(sqrt((radius_1 - _S21) * (radius_1 + _S21)), _S22, _S23);
    var _S24 : f32 = low_0.y;
    var second_0 : f32 = clamp(sqrt((radius_1 - _S24) * (radius_1 + _S24)), _S22, _S23);
    var firstHeight_0 : f32 = sqrt((radius_1 - first_0) * (radius_1 + first_0));
    var secondHeight_0 : f32 = sqrt((radius_1 - second_0) * (radius_1 + second_0));
    var _S25 : f32 = second_0 - first_0;
    var angle_0 : f32 = 2.0f * asin(min(length(vec2<f32>(_S25, firstHeight_0 - secondHeight_0)) / max(2.0f * radius_1, 9.99999997475242708e-07f), 1.0f));
    var angleSquared_0 : f32 = angle_0 * angle_0;
    var _S26 : f32 = _S21 - _S24;
    return (_S23 - _S22) * _S26 - (_S26 * (first_0 - _S22) + _S25 * ((firstHeight_0 + secondHeight_0) * 0.5f - _S24) + radius_1 * radius_1 * angle_0 * angleSquared_0 / 12.0f * (1.0f - angleSquared_0 / 20.0f + angleSquared_0 * angleSquared_0 / 840.0f));
}

fn gooRoundedRectCoverage_0( point_1 : vec2<f32>,  size_2 : vec2<f32>,  cornerRadii_1 : vec4<f32>,  pointDx_1 : vec2<f32>,  pointDy_1 : vec2<f32>) -> f32
{
    var _S27 : f32 = pointDx_1.y;
    var _S28 : f32 = pointDy_1.x;
    var _S29 : f32 = pointDx_1.x;
    var _S30 : f32 = pointDy_1.y;
    if((abs(_S27) + abs(_S28)) > (0.00009999999747379f * (abs(_S29) + abs(_S30))))
    {
        return gooTransformedEdgeCoverage_0(point_1, size_2, cornerRadii_1, pointDx_1, pointDy_1);
    }
    var _S31 : vec2<f32> = vec2<f32>(0.5f);
    var extent_1 : vec2<f32> = max(_S31 * vec2<f32>(length(vec2<f32>(_S29, _S28)), length(vec2<f32>(_S27, _S30))), vec2<f32>(0.00009999999747379f));
    var _S32 : vec2<f32> = size_2 * _S31;
    var centered_1 : vec2<f32> = point_1 - _S32;
    var _S33 : vec2<f32> = vec2<f32>(2.0f) * extent_1;
    var overlap_0 : vec2<f32> = min(saturate(_S31 + (_S32 - abs(centered_1)) / _S33), size_2 / _S33);
    var _S34 : f32 = centered_1.x;
    var _S35 : f32 = centered_1.y;
    return saturate(overlap_0.x * overlap_0.y - (gooCornerCut_0((vec2<f32>(0) - centered_1) - _S32, cornerRadii_1.x, extent_1) + gooCornerCut_0(vec2<f32>(_S34, - _S35) - _S32, cornerRadii_1.y, extent_1) + gooCornerCut_0(centered_1 - _S32, cornerRadii_1.z, extent_1) + gooCornerCut_0(vec2<f32>(- _S34, _S35) - _S32, cornerRadii_1.w, extent_1)) / (4.0f * extent_1.x * extent_1.y));
}

fn unpackColor_0( packedRgb_0 : u32,  packedAlpha_0 : u32,  alphaIndex_0 : u32) -> vec4<f32>
{
    return vec4<f32>(f32((packedRgb_0 & (u32(2047)))) / 2047.0f, f32((((packedRgb_0 >> (u32(11)))) & (u32(2047)))) / 2047.0f, f32((((packedRgb_0 >> (u32(22)))) & (u32(1023)))) / 1023.0f, f32((((packedAlpha_0 >> ((alphaIndex_0 * u32(10))))) & (u32(1023)))) / 1023.0f);
}

fn gooClipCoverage_0() -> f32
{
    return 1.0f;
}

var<private> outColor_0 : vec4<f32>;

fn shade_0()
{
    var point_2 : vec2<f32> = uv_0 * gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].rect_0.zw;
    var pointDx_2 : vec2<f32> = dpdx(point_2);
    var pointDy_2 : vec2<f32> = dpdy(point_2);
    var radii_1 : vec4<f32> = gooNormalizeRadii_0(gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].rect_0.zw, gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].radii_0);
    var coverage_0 : f32 = gooRoundedRectCoverage_0(point_2, gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].rect_0.zw, radii_1, pointDx_2, pointDy_2);
    var _S36 : bool;
    if((gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].params_0.x) > 0.0f)
    {
        _S36 = (gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].params_0.y) > 0.0f;
    }
    else
    {
        _S36 = false;
    }
    var backgroundCoverage_0 : f32;
    if(_S36)
    {
        var inset_0 : vec2<f32> = gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].params_0.xy;
        var innerSize_0 : vec2<f32> = max(gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].rect_0.zw - inset_0 * vec2<f32>(2.0f), vec2<f32>(0.0f));
        if((innerSize_0.x) > 0.0f)
        {
            _S36 = (innerSize_0.y) > 0.0f;
        }
        else
        {
            _S36 = false;
        }
        if(_S36)
        {
            backgroundCoverage_0 = 1.0f - gooRoundedRectCoverage_0(point_2 - inset_0, innerSize_0, gooNormalizeRadii_0(innerSize_0, max(radii_1 - vec4<f32>(max(inset_0.x, inset_0.y)), vec4<f32>(0.0f))), pointDx_2, pointDy_2);
        }
        else
        {
            backgroundCoverage_0 = 1.0f;
        }
        var _S37 : f32 = min(1.0f - backgroundCoverage_0, coverage_0);
        var remaining_0 : f32 = 1.0f - max(coverage_0 - _S37, 0.0f);
        if(remaining_0 > 0.00000999999974738f)
        {
            backgroundCoverage_0 = _S37 / remaining_0;
        }
        else
        {
            backgroundCoverage_0 = 1.0f;
        }
    }
    else
    {
        backgroundCoverage_0 = coverage_0;
    }
    outColor_0 = unpackColor_0(gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].packedColors_0.x, gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].packedColors_0.w, u32(0)) * vec4<f32>(backgroundCoverage_0) * vec4<f32>(gooClipCoverage_0());
    return;
}

struct AnalyticFragmentOutput_0
{
    @location(0) color_0 : vec4<f32>,
};

struct pixelInput_0
{
    @location(0) uv_1 : vec2<f32>,
    @interpolate(flat) @location(2) clipDrawOrdinal_0 : u32,
    @interpolate(flat) @location(3) primitiveRecordOrdinal_0 : u32,
};

@fragment
fn main( _S38 : pixelInput_0, @builtin(position) position_0 : vec4<f32>) -> AnalyticFragmentOutput_0
{
    uv_0 = _S38.uv_1;
    gooClipDrawOrdinal_0 = _S38.clipDrawOrdinal_0;
    gooPrimitiveRecordOrdinal_0 = _S38.primitiveRecordOrdinal_0;
    gooFragmentPosition_0 = position_0;
    shade_0();
    var output_0 : AnalyticFragmentOutput_0;
    output_0.color_0 = outColor_0;
    return output_0;
}

