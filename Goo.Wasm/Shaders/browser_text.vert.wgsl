struct TextInstance_std430_0
{
    @align(16) transform0_0 : vec4<f32>,
    @align(16) transform1_0 : vec4<f32>,
    @align(16) transform2_0 : vec4<f32>,
    @align(16) transform3_0 : vec4<f32>,
    @align(16) glyphBounds_0 : vec4<f32>,
    @align(16) glyphInput_0 : vec4<u32>,
    @align(16) foreground_0 : vec4<f32>,
    @align(16) runOrigin_0 : vec2<f32>,
};

@binding(0) @group(2) var<storage, read> instances_0 : array<TextInstance_std430_0>;

struct Viewport_std140_0
{
    @align(16) size_0 : vec2<f32>,
    @align(8) scale_0 : vec2<f32>,
};

@binding(0) @group(0) var<uniform> viewport_0 : Viewport_std140_0;
var<private> corners_0 : array<vec2<f32>, i32(6)> = array<vec2<f32>, i32(6)>( vec2<f32>(0.0f, 0.0f), vec2<f32>(1.0f, 0.0f), vec2<f32>(1.0f, 1.0f), vec2<f32>(0.0f, 0.0f), vec2<f32>(1.0f, 1.0f), vec2<f32>(0.0f, 1.0f) );
struct TextVertex_0
{
    @builtin(position) position_0 : vec4<f32>,
    @location(0) texcoord_0 : vec2<f32>,
    @interpolate(flat) @location(1) glyphLoc_0 : u32,
    @interpolate(flat) @location(4) foreground_1 : vec4<f32>,
};

@vertex
fn main(@builtin(vertex_index) vertexIndex_0 : u32, @builtin(instance_index) instanceIndex_0 : u32) -> TextVertex_0
{
    var instance_0 : TextInstance_std430_0 = instances_0[instanceIndex_0];
    var normal_0 : vec2<f32> = corners_0[vertexIndex_0] * vec2<f32>(2.0f) - vec2<f32>(1.0f);
    var n_0 : vec2<f32> = normalize(normal_0);
    var axis0_0 : vec2<f32> = instance_0.transform0_0.xy * viewport_0.scale_0;
    var axis1_0 : vec2<f32> = instance_0.transform1_0.xy * viewport_0.scale_0;
    var _S1 : vec2<f32> = instance_0.transform3_0.xy;
    var _S2 : vec2<f32> = _S1 * viewport_0.scale_0;
    var _S3 : bool;
    if((instance_0.transform0_0.y) == 0.0f)
    {
        _S3 = (instance_0.transform1_0.x) == 0.0f;
    }
    else
    {
        _S3 = false;
    }
    var origin_0 : vec2<f32>;
    if(_S3)
    {
        var runOrigin_1 : vec2<f32> = instance_0.runOrigin_0 * viewport_0.scale_0;
        origin_0 = vec2<f32>(round(runOrigin_1.x), floor(runOrigin_1.y + 0.5f)) + (_S1 - instance_0.runOrigin_0) * viewport_0.scale_0;
    }
    else
    {
        origin_0 = _S2;
    }
    var position_1 : vec2<f32> = mix(instance_0.glyphBounds_0.xy, instance_0.glyphBounds_0.zw, corners_0[vertexIndex_0]) + normal_0 * vec2<f32>((0.5f / length(axis0_0 * vec2<f32>(n_0.x) + axis1_0 * vec2<f32>(n_0.y))));
    var pixel_0 : vec2<f32> = axis0_0 * vec2<f32>(position_1.x) + axis1_0 * vec2<f32>(position_1.y) + origin_0;
    var output_0 : TextVertex_0;
    output_0.position_0 = vec4<f32>(pixel_0.x * 2.0f / (viewport_0.size_0.x * viewport_0.scale_0.x) - 1.0f, 1.0f - pixel_0.y * 2.0f / (viewport_0.size_0.y * viewport_0.scale_0.y), 0.0f, 1.0f);
    output_0.texcoord_0 = position_1;
    output_0.glyphLoc_0 = instance_0.glyphInput_0.x;
    output_0.foreground_1 = instance_0.foreground_0;
    return output_0;
}

