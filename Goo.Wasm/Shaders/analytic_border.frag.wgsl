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

fn selectedEdge_0( point_0 : vec2<f32>,  size_0 : vec2<f32>) -> u32
{
    var _S1 : f32 = size_0.y;
    var _S2 : f32 = min(max(gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].radii_0.x, 0.0f), _S1);
    var _S3 : f32 = size_0.x;
    var _S4 : f32 = min(max(gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].radii_0.y, 0.0f), _S3);
    var _S5 : f32 = min(max(gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].radii_0.z, 0.0f), max(_S1 - _S2, 0.0f));
    var _S6 : f32 = _S3 - _S4;
    var _S7 : f32 = min(max(gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].radii_0.w, 0.0f), max(_S6, 0.0f));
    var _S8 : bool;
    if(_S2 > 0.0f)
    {
        _S8 = (point_0.y) < _S2;
    }
    else
    {
        _S8 = false;
    }
    if(_S8)
    {
        return u32(0);
    }
    if(_S5 > 0.0f)
    {
        _S8 = (point_0.y) >= (_S1 - _S5);
    }
    else
    {
        _S8 = false;
    }
    if(_S8)
    {
        return u32(2);
    }
    if(_S4 > 0.0f)
    {
        _S8 = (point_0.x) >= _S6;
    }
    else
    {
        _S8 = false;
    }
    if(_S8)
    {
        return u32(1);
    }
    if(_S7 > 0.0f)
    {
        _S8 = (point_0.x) < _S7;
    }
    else
    {
        _S8 = false;
    }
    if(_S8)
    {
        return u32(3);
    }
    return u32(4);
}

var<private> outColor_0 : vec4<f32>;

fn edgeWidth_0( edge_0 : u32,  size_1 : vec2<f32>) -> f32
{
    var _S9 : f32 = size_1.y;
    var _S10 : f32 = min(max(gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].radii_0.x, 0.0f), _S9);
    var _S11 : f32 = size_1.x;
    var _S12 : f32 = min(max(gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].radii_0.y, 0.0f), _S11);
    var _S13 : f32 = min(max(gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].radii_0.z, 0.0f), max(_S9 - _S10, 0.0f));
    var _S14 : f32 = min(max(gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].radii_0.w, 0.0f), max(_S11 - _S12, 0.0f));
    if(edge_0 == u32(0))
    {
        return _S10;
    }
    if(edge_0 == u32(1))
    {
        return _S12;
    }
    if(edge_0 == u32(2))
    {
        return _S13;
    }
    return _S14;
}

fn edgeAlong_0( edge_1 : u32,  point_1 : vec2<f32>,  size_2 : vec2<f32>) -> f32
{
    if(edge_1 == u32(0))
    {
        return point_1.x;
    }
    if(edge_1 == u32(1))
    {
        return point_1.y;
    }
    if(edge_1 == u32(2))
    {
        return size_2.x - point_1.x;
    }
    return size_2.y - point_1.y;
}

fn edgeAcross_0( edge_2 : u32,  point_2 : vec2<f32>,  size_3 : vec2<f32>) -> f32
{
    if(edge_2 == u32(0))
    {
        return point_2.y;
    }
    if(edge_2 == u32(1))
    {
        return size_3.x - point_2.x;
    }
    if(edge_2 == u32(2))
    {
        return size_3.y - point_2.y;
    }
    return point_2.x;
}

fn edgePhase_0( edge_3 : u32) -> f32
{
    if(edge_3 == u32(1))
    {
        return gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].params_0.y;
    }
    if(edge_3 == u32(2))
    {
        return gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].params_0.z;
    }
    if(edge_3 == u32(3))
    {
        return gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].params_0.w;
    }
    return 0.0f;
}

fn gooEdgeCoverage_0( distance_0 : f32,  width_0 : f32) -> f32
{
    return saturate(0.5f - distance_0 / width_0);
}

fn unpackColor_0( packedRgb_0 : u32,  packedAlpha_0 : u32,  alphaIndex_0 : u32) -> vec4<f32>
{
    return vec4<f32>(f32((packedRgb_0 & (u32(2047)))) / 2047.0f, f32((((packedRgb_0 >> (u32(11)))) & (u32(2047)))) / 2047.0f, f32((((packedRgb_0 >> (u32(22)))) & (u32(1023)))) / 1023.0f, f32((((packedAlpha_0 >> ((alphaIndex_0 * u32(10))))) & (u32(1023)))) / 1023.0f);
}

fn edgeColor_0( edge_4 : u32) -> vec4<f32>
{
    if(edge_4 == u32(0))
    {
        return unpackColor_0(gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].packedColors_0.x, gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].packedColors_0.w, u32(0));
    }
    if(edge_4 == u32(1))
    {
        return unpackColor_0(gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].packedColors_0.y, gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].packedColors_0.w, u32(1));
    }
    if(edge_4 == u32(2))
    {
        return unpackColor_0(gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].packedColors_0.z, gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].packedColors_0.w, u32(2));
    }
    return unpackColor_0(gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].packedColorsExtra_0.x, gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].packedColorsExtra_0.y, u32(0));
}

fn renderRectangular_0( point_3 : vec2<f32>,  size_4 : vec2<f32>,  footprint_0 : vec2<f32>)
{
    var edge_5 : u32 = selectedEdge_0(point_3, size_4);
    if(edge_5 == u32(4))
    {
        outColor_0 = vec4<f32>(0.0f);
        return;
    }
    var width_1 : f32 = edgeWidth_0(edge_5, size_4);
    var _S15 : f32 = max(width_1, 0.00009999999747379f);
    var period_0 : f32;
    if((gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].packedColorsExtra_0.w) == u32(1))
    {
        period_0 = _S15 * 6.0f;
    }
    else
    {
        period_0 = _S15 * 3.0f;
    }
    var onLength_0 : f32;
    if((gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].packedColorsExtra_0.w) == u32(1))
    {
        onLength_0 = _S15 * 3.0f;
    }
    else
    {
        onLength_0 = _S15;
    }
    var along_0 : f32 = edgeAlong_0(edge_5, point_3, size_4);
    var across_0 : f32 = edgeAcross_0(edge_5, point_3, size_4);
    var phase_0 : f32 = edgePhase_0(edge_5);
    var _S16 : bool = ((edge_5 & (u32(1)))) == u32(0);
    var patternCoverage_0 : f32;
    if(_S16)
    {
        patternCoverage_0 = footprint_0.y;
    }
    else
    {
        patternCoverage_0 = footprint_0.x;
    }
    var edgeCoverage_0 : f32 = gooEdgeCoverage_0(across_0 - width_1, max(patternCoverage_0, 0.00009999999747379f));
    if((gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].packedColorsExtra_0.w) == u32(1))
    {
        var patternCoordinate_0 : f32 = ((((along_0 + phase_0)) % ((period_0))));
        if(_S16)
        {
            patternCoverage_0 = footprint_0.x;
        }
        else
        {
            patternCoverage_0 = footprint_0.y;
        }
        var _S17 : f32 = max(patternCoverage_0, 0.00009999999747379f);
        patternCoverage_0 = max(1.0f - smoothstep(onLength_0 - _S17, onLength_0 + _S17, patternCoordinate_0), smoothstep(period_0 - _S17, period_0, patternCoordinate_0));
    }
    else
    {
        if((gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].packedColorsExtra_0.w) == u32(2))
        {
            var _S18 : f32 = width_1 * 0.5f;
            var _S19 : f32 = max(_S18, 0.00009999999747379f);
            var axial_0 : f32 = abs(((((along_0 + phase_0)) % ((period_0)))) - _S19);
            var _S20 : f32 = max(max(footprint_0.x, footprint_0.y), 0.00009999999747379f);
            patternCoverage_0 = 1.0f - smoothstep(_S19 - _S20, _S19 + _S20, length(vec2<f32>(min(axial_0, period_0 - axial_0), abs(across_0 - _S18))));
        }
        else
        {
            patternCoverage_0 = 1.0f;
        }
    }
    outColor_0 = edgeColor_0(edge_5) * vec4<f32>(edgeCoverage_0) * vec4<f32>(patternCoverage_0);
    return;
}

fn gooClipCoverage_0() -> f32
{
    return 1.0f;
}

fn gooNormalizeRadii_0( size_5 : vec2<f32>,  source_0 : vec4<f32>) -> vec4<f32>
{
    var result_0 : vec4<f32> = max(source_0, vec4<f32>(0.0f));
    var _S21 : f32 = result_0.x;
    var _S22 : f32 = result_0.y;
    var sum_0 : f32 = _S21 + _S22;
    var _S23 : f32 = size_5.x;
    var _S24 : bool;
    if(sum_0 > _S23)
    {
        _S24 = sum_0 > 0.0f;
    }
    else
    {
        _S24 = false;
    }
    var scale_0 : f32;
    if(_S24)
    {
        scale_0 = min(1.0f, _S23 / sum_0);
    }
    else
    {
        scale_0 = 1.0f;
    }
    var _S25 : f32 = result_0.w;
    var _S26 : f32 = result_0.z;
    var sum_1 : f32 = _S25 + _S26;
    if(sum_1 > _S23)
    {
        _S24 = sum_1 > 0.0f;
    }
    else
    {
        _S24 = false;
    }
    if(_S24)
    {
        scale_0 = min(scale_0, _S23 / sum_1);
    }
    var sum_2 : f32 = _S21 + _S25;
    var _S27 : f32 = size_5.y;
    if(sum_2 > _S27)
    {
        _S24 = sum_2 > 0.0f;
    }
    else
    {
        _S24 = false;
    }
    if(_S24)
    {
        scale_0 = min(scale_0, _S27 / sum_2);
    }
    var sum_3 : f32 = _S22 + _S26;
    if(sum_3 > _S27)
    {
        _S24 = sum_3 > 0.0f;
    }
    else
    {
        _S24 = false;
    }
    if(_S24)
    {
        scale_0 = min(scale_0, _S27 / sum_3);
    }
    return result_0 * vec4<f32>(scale_0);
}

fn gooRoundedRectDistance_0( point_4 : vec2<f32>,  size_6 : vec2<f32>,  cornerRadii_0 : vec4<f32>) -> f32
{
    var _S28 : bool;
    if((size_6.x) <= 0.0f)
    {
        _S28 = true;
    }
    else
    {
        _S28 = (size_6.y) <= 0.0f;
    }
    if(_S28)
    {
        return 1.0e+06f;
    }
    var _S29 : vec2<f32> = size_6 * vec2<f32>(0.5f);
    var centered_0 : vec2<f32> = point_4 - _S29;
    var radius_0 : f32;
    if((centered_0.x) < 0.0f)
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
    var q_0 : vec2<f32> = abs(centered_0) - _S29 + vec2<f32>(radius_0);
    return length(max(q_0, vec2<f32>(0.0f))) + min(max(q_0.x, q_0.y), 0.0f) - radius_0;
}

fn gooTransformedEdgeCoverage_0( point_5 : vec2<f32>,  size_7 : vec2<f32>,  cornerRadii_1 : vec4<f32>,  pointDx_0 : vec2<f32>,  pointDy_0 : vec2<f32>) -> f32
{
    var _S30 : vec2<f32> = size_7 * vec2<f32>(0.5f);
    var centered_1 : vec2<f32> = point_5 - _S30;
    var _S31 : bool = (centered_1.x) < 0.0f;
    var radius_1 : f32;
    if(_S31)
    {
        if((centered_1.y) < 0.0f)
        {
            radius_1 = cornerRadii_1.x;
        }
        else
        {
            radius_1 = cornerRadii_1.w;
        }
    }
    else
    {
        if((centered_1.y) < 0.0f)
        {
            radius_1 = cornerRadii_1.y;
        }
        else
        {
            radius_1 = cornerRadii_1.z;
        }
    }
    var q_1 : vec2<f32> = abs(centered_1) - _S30 + vec2<f32>(radius_1);
    var normal_0 : vec2<f32> = max(q_1, vec2<f32>(0.0f));
    var normal_1 : vec2<f32>;
    if((dot(normal_0, normal_0)) > 0.0f)
    {
        normal_1 = normalize(normal_0);
    }
    else
    {
        if((q_1.x) > (q_1.y))
        {
            normal_1 = vec2<f32>(1.0f, 0.0f);
        }
        else
        {
            normal_1 = vec2<f32>(0.0f, 1.0f);
        }
    }
    var _S32 : f32;
    if(_S31)
    {
        _S32 = -1.0f;
    }
    else
    {
        _S32 = 1.0f;
    }
    var _S33 : f32;
    if((centered_1.y) < 0.0f)
    {
        _S33 = -1.0f;
    }
    else
    {
        _S33 = 1.0f;
    }
    var normal_2 : vec2<f32> = normal_1 * vec2<f32>(_S32, _S33);
    var gradient_0 : vec2<f32> = abs(vec2<f32>(dot(normal_2, pointDx_0), dot(normal_2, pointDy_0)));
    var width_2 : f32 = length(gradient_0);
    var distance_1 : f32 = radius_1 - length(normal_0) - min(max(q_1.x, q_1.y), 0.0f);
    if(width_2 < 0.00009999999747379f)
    {
        if(distance_1 >= 0.0f)
        {
            radius_1 = 1.0f;
        }
        else
        {
            radius_1 = 0.0f;
        }
        return radius_1;
    }
    var _S34 : f32 = gradient_0.x;
    var _S35 : f32 = gradient_0.y;
    var span_0 : vec2<f32> = vec2<f32>(max(_S34, _S35), max(min(_S34, _S35), 9.99999997475242708e-07f * width_2)) / vec2<f32>(width_2);
    var offset_0 : f32 = distance_1 / width_2;
    var _S36 : f32 = span_0.x;
    var _S37 : f32 = span_0.y;
    var _S38 : f32 = abs(offset_0);
    var _S39 : f32 = max((_S36 + _S37) * 0.5f - _S38, 0.0f);
    var tail_0 : f32 = _S39 * _S39 / (2.0f * _S36 * _S37);
    if(_S38 <= ((_S36 - _S37) * 0.5f))
    {
        radius_1 = 0.5f + offset_0 / _S36;
    }
    else
    {
        if(offset_0 > 0.0f)
        {
            radius_1 = 1.0f - tail_0;
        }
        else
        {
            radius_1 = tail_0;
        }
    }
    return radius_1;
}

fn gooCornerCut_0( offset_1 : vec2<f32>,  radius_2 : f32,  extent_0 : vec2<f32>) -> f32
{
    var _S40 : vec2<f32> = vec2<f32>(radius_2);
    var _S41 : vec2<f32> = offset_1 + _S40;
    var _S42 : vec2<f32> = vec2<f32>(0.0f);
    var low_0 : vec2<f32> = clamp(_S41 - extent_0, _S42, _S40);
    var high_0 : vec2<f32> = clamp(_S41 + extent_0, _S42, _S40);
    if((any((high_0 <= low_0))))
    {
        return 0.0f;
    }
    var _S43 : f32 = high_0.y;
    var _S44 : f32 = low_0.x;
    var _S45 : f32 = high_0.x;
    var first_0 : f32 = clamp(sqrt((radius_2 - _S43) * (radius_2 + _S43)), _S44, _S45);
    var _S46 : f32 = low_0.y;
    var second_0 : f32 = clamp(sqrt((radius_2 - _S46) * (radius_2 + _S46)), _S44, _S45);
    var firstHeight_0 : f32 = sqrt((radius_2 - first_0) * (radius_2 + first_0));
    var secondHeight_0 : f32 = sqrt((radius_2 - second_0) * (radius_2 + second_0));
    var _S47 : f32 = second_0 - first_0;
    var angle_0 : f32 = 2.0f * asin(min(length(vec2<f32>(_S47, firstHeight_0 - secondHeight_0)) / max(2.0f * radius_2, 9.99999997475242708e-07f), 1.0f));
    var angleSquared_0 : f32 = angle_0 * angle_0;
    var _S48 : f32 = _S43 - _S46;
    return (_S45 - _S44) * _S48 - (_S48 * (first_0 - _S44) + _S47 * ((firstHeight_0 + secondHeight_0) * 0.5f - _S46) + radius_2 * radius_2 * angle_0 * angleSquared_0 / 12.0f * (1.0f - angleSquared_0 / 20.0f + angleSquared_0 * angleSquared_0 / 840.0f));
}

fn gooRoundedRectCoverage_0( point_6 : vec2<f32>,  size_8 : vec2<f32>,  cornerRadii_2 : vec4<f32>,  pointDx_1 : vec2<f32>,  pointDy_1 : vec2<f32>) -> f32
{
    var _S49 : f32 = pointDx_1.y;
    var _S50 : f32 = pointDy_1.x;
    var _S51 : f32 = pointDx_1.x;
    var _S52 : f32 = pointDy_1.y;
    if((abs(_S49) + abs(_S50)) > (0.00009999999747379f * (abs(_S51) + abs(_S52))))
    {
        return gooTransformedEdgeCoverage_0(point_6, size_8, cornerRadii_2, pointDx_1, pointDy_1);
    }
    var _S53 : vec2<f32> = vec2<f32>(0.5f);
    var extent_1 : vec2<f32> = max(_S53 * vec2<f32>(length(vec2<f32>(_S51, _S50)), length(vec2<f32>(_S49, _S52))), vec2<f32>(0.00009999999747379f));
    var _S54 : vec2<f32> = size_8 * _S53;
    var centered_2 : vec2<f32> = point_6 - _S54;
    var _S55 : vec2<f32> = vec2<f32>(2.0f) * extent_1;
    var overlap_0 : vec2<f32> = min(saturate(_S53 + (_S54 - abs(centered_2)) / _S55), size_8 / _S55);
    var _S56 : f32 = centered_2.x;
    var _S57 : f32 = centered_2.y;
    return saturate(overlap_0.x * overlap_0.y - (gooCornerCut_0((vec2<f32>(0) - centered_2) - _S54, cornerRadii_2.x, extent_1) + gooCornerCut_0(vec2<f32>(_S56, - _S57) - _S54, cornerRadii_2.y, extent_1) + gooCornerCut_0(centered_2 - _S54, cornerRadii_2.z, extent_1) + gooCornerCut_0(vec2<f32>(- _S56, _S57) - _S54, cornerRadii_2.w, extent_1)) / (4.0f * extent_1.x * extent_1.y));
}

fn roundedEdge_0( point_7 : vec2<f32>,  size_9 : vec2<f32>) -> u32
{
    var _S58 : f32 = size_9.y;
    var _S59 : f32 = min(max(gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].radii_0.x, 0.0f), _S58);
    var _S60 : f32 = size_9.x;
    var _S61 : f32 = min(max(gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].radii_0.y, 0.0f), _S60);
    var _S62 : f32 = min(max(gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].radii_0.z, 0.0f), max(_S58 - _S59, 0.0f));
    var _S63 : f32 = min(max(gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].radii_0.w, 0.0f), max(_S60 - _S61, 0.0f));
    var distance_2 : f32 = point_7.y;
    var _S64 : bool;
    if(_S59 > 0.0f)
    {
        _S64 = distance_2 < 1.0e+06f;
    }
    else
    {
        _S64 = false;
    }
    var best_0 : f32;
    var edge_6 : u32;
    if(_S64)
    {
        best_0 = distance_2;
        edge_6 = u32(0);
    }
    else
    {
        best_0 = 1.0e+06f;
        edge_6 = u32(4);
    }
    var _S65 : f32 = point_7.x;
    var distance_3 : f32 = _S60 - _S65;
    if(_S61 > 0.0f)
    {
        _S64 = distance_3 < best_0;
    }
    else
    {
        _S64 = false;
    }
    if(_S64)
    {
        best_0 = distance_3;
        edge_6 = u32(1);
    }
    var distance_4 : f32 = _S58 - distance_2;
    if(_S62 > 0.0f)
    {
        _S64 = distance_4 < best_0;
    }
    else
    {
        _S64 = false;
    }
    if(_S64)
    {
        best_0 = distance_4;
        edge_6 = u32(2);
    }
    if(_S63 > 0.0f)
    {
        _S64 = _S65 < best_0;
    }
    else
    {
        _S64 = false;
    }
    if(_S64)
    {
        edge_6 = u32(3);
    }
    return edge_6;
}

fn ellipseArc_0( radii_1 : vec2<f32>,  angle_1 : f32) -> f32
{
    var _S66 : f32 = radii_1.x;
    if(_S66 == (radii_1.y))
    {
        return _S66 * angle_1;
    }
    var sample_0 : i32 = i32(0);
    var sum_4 : f32 = 0.0f;
    for(;;)
    {
        if(sample_0 <= i32(8))
        {
        }
        else
        {
            break;
        }
        var t_0 : f32 = angle_1 * f32(sample_0) / 8.0f;
        var speed_0 : f32 = length(radii_1 * vec2<f32>(sin(t_0), cos(t_0)));
        var _S67 : bool;
        if(sample_0 == i32(0))
        {
            _S67 = true;
        }
        else
        {
            _S67 = sample_0 == i32(8);
        }
        var _S68 : f32;
        if(_S67)
        {
            _S68 = 1.0f;
        }
        else
        {
            if((sample_0 % i32(2)) == i32(0))
            {
                _S68 = 2.0f;
            }
            else
            {
                _S68 = 4.0f;
            }
        }
        var sum_5 : f32 = sum_4 + speed_0 * _S68;
        sample_0 = sample_0 + i32(1);
        sum_4 = sum_5;
    }
    return sum_4 * angle_1 / 24.0f;
}

fn roundedContour_0( point_8 : vec2<f32>,  size_10 : vec2<f32>,  radii_2 : vec4<f32>,  widths_0 : vec4<f32>,  normal_3 : ptr<function, vec2<f32>>) -> vec3<f32>
{
    var _S69 : vec2<f32> = vec2<f32>(0.5f);
    var inset_0 : vec2<f32> = widths_0.wx * _S69;
    var _S70 : vec2<f32> = widths_0.yz * _S69;
    var _S71 : vec2<f32> = vec2<f32>(0.0f);
    var extent_2 : vec2<f32> = max(size_10 - inset_0 - _S70, _S71);
    var p_0 : vec2<f32> = point_8 - inset_0;
    var _S72 : vec2<f32> = max(vec2<f32>(radii_2.y) - widths_0.yx * _S69, _S71);
    var _S73 : vec2<f32> = max(vec2<f32>(radii_2.z) - _S70, _S71);
    var _S74 : vec2<f32> = max(vec2<f32>(radii_2.w) - widths_0.wz * _S69, _S71);
    var r_0 : array<vec2<f32>, i32(4)>;
    r_0[i32(0)] = max(vec2<f32>(radii_2.x) - inset_0, _S71);
    r_0[i32(1)] = _S72;
    r_0[i32(2)] = _S73;
    r_0[i32(3)] = _S74;
    var i_0 : i32 = i32(0);
    for(;;)
    {
        if(i_0 < i32(4))
        {
        }
        else
        {
            break;
        }
        if((min(r_0[i_0].x, r_0[i_0].y)) <= 0.0f)
        {
            r_0[i_0] = _S71;
        }
        i_0 = i_0 + i32(1);
    }
    var _S75 : f32 = extent_2.x;
    var _S76 : f32 = extent_2.y;
    var sides_0 : vec4<f32> = max(vec4<f32>(_S75, _S76, _S75, _S76) - vec4<f32>(r_0[i32(0)].x + r_0[i32(1)].x, r_0[i32(1)].y + r_0[i32(2)].y, r_0[i32(2)].x + r_0[i32(3)].x, r_0[i32(3)].y + r_0[i32(0)].y), vec4<f32>(0.0f));
    var _S77 : f32 = ellipseArc_0(r_0[i32(1)].yx, 1.57079637050628662f);
    var _S78 : f32 = ellipseArc_0(r_0[i32(2)], 1.57079637050628662f);
    var _S79 : f32 = ellipseArc_0(r_0[i32(3)].yx, 1.57079637050628662f);
    var perimeter_0 : f32 = dot(sides_0 + vec4<f32>(ellipseArc_0(r_0[i32(0)], 1.57079637050628662f), _S77, _S78, _S79), vec4<f32>(1.0f));
    var _S80 : f32 = sides_0.x + _S77;
    var _S81 : f32 = _S80 + sides_0.y + _S78;
    var starts_0 : vec4<f32> = vec4<f32>(0.0f, _S80, _S81, _S81 + sides_0.z + _S79);
    var _S82 : f32 = p_0.y;
    var _S83 : f32 = p_0.x;
    var _S84 : f32 = _S75 - _S83;
    var _S85 : f32 = _S76 - _S82;
    var distances_0 : vec4<f32> = vec4<f32>(_S82, _S84, _S85, _S83);
    var _S86 : bool;
    if(_S82 <= _S84)
    {
        _S86 = _S82 <= _S85;
    }
    else
    {
        _S86 = false;
    }
    if(_S86)
    {
        _S86 = _S82 <= _S83;
    }
    else
    {
        _S86 = false;
    }
    var side_0 : u32;
    if(_S86)
    {
        side_0 = u32(0);
    }
    else
    {
        if(_S84 <= _S85)
        {
            _S86 = _S84 <= _S83;
        }
        else
        {
            _S86 = false;
        }
        if(_S86)
        {
            side_0 = u32(1);
        }
        else
        {
            if(_S85 <= _S83)
            {
                side_0 = u32(2);
            }
            else
            {
                side_0 = u32(3);
            }
        }
    }
    var coordinates_0 : vec4<f32> = vec4<f32>(_S83 - r_0[i32(0)].x, _S82 - r_0[i32(1)].y, _S75 - r_0[i32(2)].x - _S83, _S76 - r_0[i32(3)].y - _S82);
    var normals_0 : array<vec2<f32>, i32(4)> = array<vec2<f32>, i32(4)>( vec2<f32>(0.0f, -1.0f), vec2<f32>(1.0f, 0.0f), vec2<f32>(0.0f, 1.0f), vec2<f32>(-1.0f, 0.0f) );
    (*normal_3) = normals_0[side_0];
    var _S87 : f32 = starts_0[side_0] + clamp(coordinates_0[side_0], 0.0f, sides_0[side_0]);
    var _S88 : f32 = - distances_0[side_0];
    var _S89 : vec2<f32> = r_0[i32(0)];
    var _S90 : f32 = _S75 - r_0[i32(1)].x;
    var _S91 : f32 = r_0[i32(1)].y;
    var _S92 : vec2<f32> = extent_2 - r_0[i32(2)];
    var _S93 : f32 = r_0[i32(3)].x;
    var _S94 : f32 = _S76 - r_0[i32(3)].y;
    var centers_0 : array<vec2<f32>, i32(4)> = array<vec2<f32>, i32(4)>( r_0[i32(0)], vec2<f32>(_S90, _S91), _S92, vec2<f32>(_S93, _S94) );
    if(_S83 < (r_0[i32(0)].x))
    {
        _S86 = _S82 < (_S89.y);
    }
    else
    {
        _S86 = false;
    }
    var corner_0 : i32;
    if(_S86)
    {
        corner_0 = i32(0);
    }
    else
    {
        if(_S83 > _S90)
        {
            _S86 = _S82 < _S91;
        }
        else
        {
            _S86 = false;
        }
        if(_S86)
        {
            i_0 = i32(1);
        }
        else
        {
            if(_S83 > (_S92.x))
            {
                _S86 = _S82 > (_S92.y);
            }
            else
            {
                _S86 = false;
            }
            if(_S86)
            {
                i_0 = i32(2);
            }
            else
            {
                if(_S83 < _S93)
                {
                    _S86 = _S82 > _S94;
                }
                else
                {
                    _S86 = false;
                }
                if(_S86)
                {
                    i_0 = i32(3);
                }
                else
                {
                    i_0 = i32(-1);
                }
            }
        }
        corner_0 = i_0;
    }
    if(corner_0 >= i32(0))
    {
        _S86 = (min(r_0[corner_0].x, r_0[corner_0].y)) > 0.0f;
    }
    else
    {
        _S86 = false;
    }
    var along_1 : f32;
    var across_1 : f32;
    if(_S86)
    {
        var q_2 : vec2<f32> = p_0 - centers_0[corner_0];
        var axes_0 : vec2<f32> = r_0[corner_0];
        var local_0 : vec2<f32> = abs(q_2);
        var _S95 : f32 = local_0.y;
        var _S96 : f32 = local_0.x;
        var _S97 : f32 = atan2(_S95, _S96);
        var _S98 : f32 = r_0[corner_0].x;
        var _S99 : f32 = r_0[corner_0].y;
        if(_S98 != _S99)
        {
            along_1 = atan2(_S95 / _S99, _S96 / _S98);
            var iteration_0 : i32 = i32(0);
            for(;;)
            {
                if(iteration_0 < i32(4))
                {
                }
                else
                {
                    break;
                }
                var _S100 : f32 = cos(along_1);
                var _S101 : f32 = sin(along_1);
                var tangent_0 : vec2<f32> = axes_0 * vec2<f32>(- _S101, _S100);
                var _S102 : vec2<f32> = axes_0 * vec2<f32>(_S100, _S101);
                var delta_0 : vec2<f32> = _S102 - local_0;
                var _S103 : f32 = clamp(along_1 - dot(delta_0, tangent_0) / max(dot(tangent_0, tangent_0) - dot(delta_0, _S102), 0.00009999999747379f), 0.0f, 1.57079637050628662f);
                var _S104 : i32 = iteration_0 + i32(1);
                along_1 = _S103;
                iteration_0 = _S104;
            }
            var radial_0 : vec2<f32> = vec2<f32>(cos(along_1), sin(along_1));
            var _S105 : vec2<f32> = normalize(radial_0 / axes_0) * vec2<f32>((vec2<i32>(sign((q_2)))));
            (*normal_3) = _S105;
            across_1 = dot(local_0 - axes_0 * radial_0, abs(_S105));
        }
        else
        {
            var distance_5 : f32 = length(q_2);
            (*normal_3) = q_2 / vec2<f32>(distance_5);
            var _S106 : f32 = distance_5 - _S98;
            along_1 = _S97;
            across_1 = _S106;
        }
        var previousSide_0 : u32 = ((u32(corner_0) + u32(3)) & (u32(3)));
        var _S107 : bool = ((corner_0 & (i32(1)))) == i32(0);
        var turn_0 : f32;
        if(_S107)
        {
            turn_0 = along_1;
        }
        else
        {
            turn_0 = 1.57079637050628662f - along_1;
        }
        var arcRadii_0 : vec2<f32>;
        if(_S107)
        {
            arcRadii_0 = axes_0;
        }
        else
        {
            arcRadii_0 = axes_0.yx;
        }
        along_1 = starts_0[previousSide_0] + sides_0[previousSide_0] + ellipseArc_0(arcRadii_0, turn_0);
    }
    else
    {
        along_1 = _S87;
        across_1 = _S88;
    }
    return vec3<f32>(along_1, perimeter_0, across_1);
}

fn shade_0()
{
    var size_11 : vec2<f32> = gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].rect_0.zw;
    var point_9 : vec2<f32> = uv_0 * size_11;
    var pointDx_2 : vec2<f32> = dpdx(point_9);
    var pointDy_2 : vec2<f32> = dpdy(point_9);
    var footprint_1 : vec2<f32> = abs(pointDx_2) + abs(pointDy_2);
    if((max(max(gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].stopPositions_0.x, gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].stopPositions_0.y), max(gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].stopPositions_0.z, gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].stopPositions_0.w))) <= 0.0f)
    {
        renderRectangular_0(point_9, size_11, footprint_1);
        outColor_0 = outColor_0 * vec4<f32>(gooClipCoverage_0());
        return;
    }
    var outerRadii_0 : vec4<f32> = gooNormalizeRadii_0(size_11, gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].stopPositions_0);
    var _S108 : f32 = size_11.y;
    var _S109 : f32 = min(max(gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].radii_0.x, 0.0f), _S108);
    var _S110 : f32 = size_11.x;
    var _S111 : f32 = min(max(gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].radii_0.y, 0.0f), _S110);
    var _S112 : f32 = min(max(gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].radii_0.z, 0.0f), max(_S108 - _S109, 0.0f));
    var _S113 : f32 = min(max(gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].radii_0.w, 0.0f), max(_S110 - _S111, 0.0f));
    var _S114 : f32 = max(_S109, _S111);
    var _S115 : f32 = max(_S112, _S113);
    var _S116 : f32 = max(_S114, _S115);
    var _S117 : vec2<f32> = vec2<f32>((max(max(max(outerRadii_0.x, outerRadii_0.y), max(outerRadii_0.z, outerRadii_0.w)), _S116) + length(footprint_1)));
    var _S118 : bool;
    if((all((point_9 > _S117))))
    {
        _S118 = (all((point_9 < (size_11 - _S117))));
    }
    else
    {
        _S118 = false;
    }
    if(_S118)
    {
        outColor_0 = vec4<f32>(0.0f);
        return;
    }
    var outerDistance_0 : f32 = gooRoundedRectDistance_0(point_9, size_11, outerRadii_0);
    var outerCoverage_0 : f32 = gooRoundedRectCoverage_0(point_9, size_11, outerRadii_0, pointDx_2, pointDy_2);
    var innerSize_0 : vec2<f32> = max(size_11 - vec2<f32>(_S113 + _S111, _S109 + _S112), vec2<f32>(0.0f));
    var _S119 : f32 = max(edgeWidth_0(roundedEdge_0(point_9, size_11), size_11), 0.00009999999747379f);
    if((innerSize_0.x) > 0.0f)
    {
        _S118 = (innerSize_0.y) > 0.0f;
    }
    else
    {
        _S118 = false;
    }
    var innerCoverage_0 : f32;
    var conditionalCoverage_0 : f32;
    if(_S118)
    {
        var innerRadii_0 : vec4<f32> = gooNormalizeRadii_0(innerSize_0, max(outerRadii_0 - vec4<f32>(max(_S109, _S113), _S114, max(_S112, _S111), _S115), vec4<f32>(0.0f)));
        var _S120 : vec2<f32> = point_9 - vec2<f32>(_S113, _S109);
        var innerCoverage_1 : f32 = 1.0f - gooRoundedRectCoverage_0(_S120, innerSize_0, innerRadii_0, pointDx_2, pointDy_2);
        if((gooRoundedRectDistance_0(_S120, innerSize_0, innerRadii_0)) > outerDistance_0)
        {
            innerCoverage_0 = innerCoverage_1;
        }
        else
        {
            innerCoverage_0 = 0.0f;
        }
        var _S121 : f32 = innerCoverage_0;
        innerCoverage_0 = innerCoverage_1;
        conditionalCoverage_0 = _S121;
    }
    else
    {
        innerCoverage_0 = 1.0f;
        conditionalCoverage_0 = 1.0f;
    }
    var _S122 : f32 = max(outerCoverage_0 - (1.0f - innerCoverage_0), 0.0f);
    var coverage_0 : f32;
    if((gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].packedColorsExtra_0.z) != u32(0))
    {
        if(outerCoverage_0 > 0.0f)
        {
            innerCoverage_0 = _S122 / outerCoverage_0;
        }
        else
        {
            innerCoverage_0 = conditionalCoverage_0;
        }
        coverage_0 = innerCoverage_0;
    }
    else
    {
        coverage_0 = _S122;
    }
    var edge_7 : u32 = roundedEdge_0(point_9, size_11);
    if(edge_7 == u32(4))
    {
        var _S123 : vec4<f32> = vec4<f32>(0.0f);
        outColor_0 = _S123;
        outColor_0 = _S123 * vec4<f32>(gooClipCoverage_0());
        return;
    }
    if((gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].packedColorsExtra_0.w) == u32(1))
    {
        _S118 = true;
    }
    else
    {
        _S118 = (gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].packedColorsExtra_0.w) == u32(2);
    }
    var patternCoverage_1 : f32;
    if(_S118)
    {
        var normal_4 : vec2<f32>;
        var contour_0 : vec3<f32> = roundedContour_0(point_9, size_11, outerRadii_0, vec4<f32>(_S109, _S111, _S112, _S113), &(normal_4));
        var _S124 : f32 = max(_S116, 0.00009999999747379f);
        if((gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].packedColorsExtra_0.w) == u32(1))
        {
            innerCoverage_0 = 6.0f;
        }
        else
        {
            innerCoverage_0 = 3.0f;
        }
        var _S125 : f32 = contour_0.y;
        var _S126 : f32 = max(_S125 / max(round(_S125 / (_S124 * innerCoverage_0)), 1.0f), 0.00009999999747379f);
        var coordinate_0 : f32 = fract(contour_0.x / _S126) * _S126;
        var _S127 : f32 = max(dot(abs(vec2<f32>(- normal_4.y, normal_4.x)), footprint_1), 0.00009999999747379f);
        if((gooPrimitiveBuffer_0[gooPrimitiveRecordOrdinal_0].packedColorsExtra_0.w) == u32(1))
        {
            var _S128 : f32 = _S126 * 0.5f;
            patternCoverage_1 = max(1.0f - smoothstep(_S128 - _S127, _S128 + _S127, coordinate_0), smoothstep(_S126 - _S127, _S126, coordinate_0));
        }
        else
        {
            var _S129 : f32 = max(max(_S127, dot(abs(normal_4), footprint_1)), 0.00009999999747379f);
            var dotRadius_0 : f32 = _S119 * 0.5f;
            patternCoverage_1 = 1.0f - smoothstep(dotRadius_0 - _S129, dotRadius_0 + _S129, length(vec2<f32>(min(coordinate_0, _S126 - coordinate_0), contour_0.z)));
        }
    }
    else
    {
        patternCoverage_1 = 1.0f;
    }
    outColor_0 = edgeColor_0(edge_7) * vec4<f32>(coverage_0) * vec4<f32>(patternCoverage_1) * vec4<f32>(gooClipCoverage_0());
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
fn main( _S130 : pixelInput_0, @builtin(position) position_0 : vec4<f32>) -> AnalyticFragmentOutput_0
{
    uv_0 = _S130.uv_1;
    gooClipDrawOrdinal_0 = _S130.clipDrawOrdinal_0;
    gooPrimitiveRecordOrdinal_0 = _S130.primitiveRecordOrdinal_0;
    gooFragmentPosition_0 = position_0;
    shade_0();
    var output_0 : AnalyticFragmentOutput_0;
    output_0.color_0 = outColor_0;
    return output_0;
}

