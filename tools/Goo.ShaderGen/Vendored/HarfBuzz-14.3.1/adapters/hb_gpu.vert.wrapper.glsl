struct HbGpuTextInstance
{
    mat4 transform;
    vec4 glyphBounds;
    uvec4 glyphInput;
    vec4 foreground;
    vec2 runOrigin;
};

layout(set = 2, binding = 0, std430) readonly buffer HbGpuTextInstanceBuffer
{
    HbGpuTextInstance records[];
} hbGpuTextInstances;

layout(push_constant) uniform HbGpuTextFramePushBlock
{
    vec4 viewport;
    vec4 origin;
} frameConstants;

layout(location = 0) out vec2 v_texcoord;
layout(location = 1) flat out uint v_glyphLoc;
layout(location = 2) flat out uint v_clipChainId;
layout(location = 3) flat out vec4 v_effectAndOrigin;
layout(location = 4) flat out vec4 v_foreground;

void main()
{
    const vec2 corners[6] = vec2[6](
        vec2(0.0, 0.0),
        vec2(1.0, 0.0),
        vec2(1.0, 1.0),
        vec2(0.0, 0.0),
        vec2(1.0, 1.0),
        vec2(0.0, 1.0));
    const vec2 normals[6] = vec2[6](
        vec2(-1.0, -1.0),
        vec2(1.0, -1.0),
        vec2(1.0, 1.0),
        vec2(-1.0, -1.0),
        vec2(1.0, 1.0),
        vec2(-1.0, 1.0));

    HbGpuTextInstance instance = hbGpuTextInstances.records[gl_InstanceIndex];
    mat4 transform = mat4(
        vec4(
            2.0 * frameConstants.viewport.z / frameConstants.viewport.x,
            0.0,
            0.0,
            0.0),
        vec4(
            0.0,
            2.0 * frameConstants.viewport.w / frameConstants.viewport.y,
            0.0,
            0.0),
        vec4(0.0, 0.0, 1.0, 0.0),
        vec4(
            -1.0 - 2.0 * frameConstants.origin.x / frameConstants.viewport.x,
            -1.0 - 2.0 * frameConstants.origin.y / frameConstants.viewport.y,
            0.0,
            1.0)) * instance.transform;
    if (instance.transform[0].y == 0.0 && instance.transform[1].x == 0.0)
    {
        vec2 origin = instance.runOrigin * frameConstants.viewport.zw - frameConstants.origin.xy;
        transform[3].xy += 2.0 * (round(origin) - origin) / frameConstants.viewport.xy;
    }
    vec2 position = mix(
        instance.glyphBounds.xy,
        instance.glyphBounds.zw,
        corners[gl_VertexIndex]);
    vec2 texcoord = position;
    vec4 jac = vec4(1.0, 0.0, 0.0, 1.0);
    hb_gpu_dilate(
        position,
        texcoord,
        normals[gl_VertexIndex],
        jac,
        transform,
        frameConstants.viewport.xy);

    gl_Position = transform * vec4(position, 0.0, 1.0);
    v_texcoord = texcoord;
    v_glyphLoc = instance.glyphInput.x;
    v_clipChainId = instance.glyphInput.z;
    v_effectAndOrigin = vec4(
        uintBitsToFloat(instance.glyphInput.w),
        uintBitsToFloat(instance.glyphInput.y),
        frameConstants.origin.xy);
    v_foreground = instance.foreground;
}
