#ifndef GOO_ROUNDED_RECT_SLANG
#define GOO_ROUNDED_RECT_SLANG
float4 gooNormalizeRadii(float2 size, float4 source)
{
    float4 result = max(source, float4(0.0));
    float scale = 1.0;
    float sum = result.x + result.y;
    if (sum > size.x && sum > 0.0)
    {
        scale = min(scale, size.x / sum);
    }
    sum = result.w + result.z;
    if (sum > size.x && sum > 0.0)
    {
        scale = min(scale, size.x / sum);
    }
    sum = result.x + result.w;
    if (sum > size.y && sum > 0.0)
    {
        scale = min(scale, size.y / sum);
    }
    sum = result.y + result.z;
    if (sum > size.y && sum > 0.0)
    {
        scale = min(scale, size.y / sum);
    }
    return result * scale;
}

float gooRoundedRectDistance(float2 point, float2 size, float4 cornerRadii)
{
    if (size.x <= 0.0 || size.y <= 0.0)
    {
        return 1000000.0;
    }
    float2 centered = point - size * 0.5;
    float radius;
    if (centered.x < 0.0)
    {
        radius = centered.y < 0.0 ? cornerRadii.x : cornerRadii.w;
    }
    else
    {
        radius = centered.y < 0.0 ? cornerRadii.y : cornerRadii.z;
    }
    float2 q = abs(centered) - size * 0.5 + float2(radius);
    return length(max(q, float2(0.0))) + min(max(q.x, q.y), 0.0) - radius;
}
#endif
