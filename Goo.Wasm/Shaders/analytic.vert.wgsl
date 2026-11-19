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

struct GooBrowserViewport_std140_0
{
    @align(16) size_0 : vec2<f32>,
    @align(8) dpi_0 : vec2<f32>,
};

@binding(0) @group(0) var<uniform> gooBrowserViewport_0 : GooBrowserViewport_std140_0;
var<private> positions_0 : array<vec2<f32>, i32(4)> = array<vec2<f32>, i32(4)>( vec2<f32>(0.0f, 0.0f), vec2<f32>(1.0f, 0.0f), vec2<f32>(0.0f, 1.0f), vec2<f32>(1.0f, 1.0f) );
@id(0) override gooEffectCoordinates_0 : bool = false;

struct AnalyticVertexOutput_0
{
    @builtin(position) position_0 : vec4<f32>,
    @location(0) uv_0 : vec2<f32>,
    @interpolate(flat) @location(2) clipDrawOrdinal_0 : u32,
    @interpolate(flat) @location(3) primitiveRecordOrdinal_0 : u32,
};

@vertex
fn main(@builtin(vertex_index) vertexIndex_0 : u32, @builtin(instance_index) instanceIndex_0 : u32) -> AnalyticVertexOutput_0
{
    var primitiveRecordOrdinal_1 : u32 = ((vertexIndex_0 >> (u32(2)))) + instanceIndex_0;
    var primitive_0 : GooPrimitiveRecord_std430_0 = gooPrimitiveBuffer_0[primitiveRecordOrdinal_1];
    var _S1 : vec2<f32> = primitive_0.rect_0.zw;
    var uvPadding_0 : vec2<f32> = vec2<f32>(primitive_0.transform1_0.w) / max(_S1, vec2<f32>(0.00009999999747379f));
    var expandedUv_0 : vec2<f32> = positions_0[(vertexIndex_0 & (u32(3)))] * (vec2<f32>(1.0f) + uvPadding_0 * vec2<f32>(2.0f)) - uvPadding_0;
    var homogeneous_0 : vec3<f32> = vec3<f32>(primitive_0.rect_0.xy + expandedUv_0 * _S1, 1.0f);
    var output_0 : AnalyticVertexOutput_0;
    output_0.position_0 = vec4<f32>(vec2<f32>(dot(primitive_0.transform0_0.xyz, homogeneous_0) * 2.0f / gooBrowserViewport_0.size_0.x - 1.0f, 1.0f - dot(primitive_0.transform1_0.xyz, homogeneous_0) * 2.0f / gooBrowserViewport_0.size_0.y), 0.0f, 1.0f);
    var effectUvOffset_0 : vec2<f32> = primitive_0.stopPositions_0.yz;
    var effectUvScale_0 : vec2<f32> = vec2<f32>(primitive_0.stopPositions_0.w, primitive_0.radii_0.y);
    var _S2 : vec2<f32>;
    if(gooEffectCoordinates_0)
    {
        _S2 = effectUvOffset_0 + expandedUv_0 * effectUvScale_0;
    }
    else
    {
        _S2 = expandedUv_0;
    }
    output_0.uv_0 = _S2;
    output_0.clipDrawOrdinal_0 = (bitcast<u32>((primitive_0.transform0_0.w)));
    output_0.primitiveRecordOrdinal_0 = primitiveRecordOrdinal_1;
    return output_0;
}

