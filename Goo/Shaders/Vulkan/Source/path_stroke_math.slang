float2 strokePoint(float2 a, float2 b, float2 c, float t)
{
    return lerp(lerp(a, b, t), lerp(b, c, t), t);
}

float2 strokeTangent(float2 a, float2 b, float2 c, float t)
{
    float2 tangent = lerp(b - a, c - b, t);
    if (dot(tangent, tangent) < 1e-20) tangent = c - a;
    if (dot(tangent, tangent) < 1e-20) return float2(1.0, 0.0);
    return tangent / max(length(tangent), 1e-20);
}

float strokeLengthPrimitive(float a, float b, float c, float t)
{
    float x = a * t + b;
    float q = sqrt(max(a * t * t + 2.0 * b * t + c, 0.0));
    float determinant = max(a * c - b * b, 0.0);
    float value = x * q / (2.0 * a);
    if (determinant > 1e-10)
    {
        float ratio = x / sqrt(determinant);
        float inverseHyperbolic = sign(ratio) * log(abs(ratio) + sqrt(ratio * ratio + 1.0));
        value += determinant * inverseHyperbolic / (2.0 * a * sqrt(a));
    }
    return value;
}

float strokeLength(float2 p0, float2 p1, float2 p2, float t)
{
    float2 linear = 2.0 * (p1 - p0);
    float2 quadratic = 2.0 * (p0 - 2.0 * p1 + p2);
    float scale = max(max(abs(linear.x), abs(linear.y)), max(abs(quadratic.x), abs(quadratic.y)));
    if (scale < 1e-20) return 0.0;
    linear /= scale;
    quadratic /= scale;
    float a = dot(quadratic, quadratic);
    float b = dot(quadratic, linear);
    float c = dot(linear, linear);
    if (a < 1e-10) return sqrt(c) * scale * t;
    return max(strokeLengthPrimitive(a, b, c, t) - strokeLengthPrimitive(a, b, c, 0.0), 0.0) * scale;
}

float strokeParameter(float2 a, float2 b, float2 c, float distance, float total)
{
    if (distance <= 0.0) return 0.0;
    if (distance >= total) return 1.0;
    float2 bend = a - 2.0 * b + c;
    if (dot(bend, bend) < 1e-10 * max(dot(c - a, c - a), 1e-20)) return distance / total;
    float low = 0.0;
    float high = 1.0;
    for (uint index = 0u; index < 24u; ++index)
    {
        float middle = (low + high) * 0.5;
        if (strokeLength(a, b, c, middle) < distance) low = middle;
        else high = middle;
    }
    return (low + high) * 0.5;
}

float strokePolynomial(float4 coefficients, float t)
{
    return ((coefficients.x * t + coefficients.y) * t + coefficients.z) * t + coefficients.w;
}

uint strokeParameters(float2 a, float2 b, float2 c, float low, float high,
    out float candidates[7], out uint normalMask)
{
    float scale = max(max(max(abs(a.x), abs(a.y)), max(abs(b.x), abs(b.y))), max(abs(c.x), abs(c.y)));
    scale = max(scale, 1e-20);
    a /= scale;
    b /= scale;
    c /= scale;
    float2 linear = 2.0 * (b - a);
    float2 quadratic = a - 2.0 * b + c;
    float4 coefficients = float4(2.0 * dot(quadratic, quadratic), 3.0 * dot(linear, quadratic),
        dot(linear, linear) + 2.0 * dot(a, quadratic), dot(a, linear));
    coefficients /= max(max(max(abs(coefficients.x), abs(coefficients.y)),
        max(abs(coefficients.z), abs(coefficients.w))), 1e-30);
    uint result = 2u;
    normalMask = 0u;
    candidates[0] = low;
    candidates[1] = high;
    if (abs(coefficients.x) < 1e-7)
    {
        if (abs(coefficients.y) < 1e-7)
        {
            if (abs(coefficients.z) > 1e-20)
            {
                float root = -coefficients.w / coefficients.z;
                if (root >= low && root <= high) { normalMask |= 1u << result; candidates[result++] = root; }
            }
        }
        else
        {
            float discriminant = coefficients.z * coefficients.z - 4.0 * coefficients.y * coefficients.w;
            if (discriminant >= 0.0)
            {
                float root = sqrt(discriminant);
                float q = -0.5 * (coefficients.z + (coefficients.z < 0.0 ? -root : root));
                float first = q / coefficients.y;
                float second = q == 0.0 ? 0.0 : coefficients.w / q;
                if (first >= low && first <= high) { normalMask |= 1u << result; candidates[result++] = first; }
                if (second >= low && second <= high) { normalMask |= 1u << result; candidates[result++] = second; }
            }
        }
        return result;
    }
    float partitions[4];
    uint count = 1u;
    partitions[0] = low;
    float discriminant = coefficients.y * coefficients.y - 3.0 * coefficients.x * coefficients.z;
    if (discriminant >= 0.0)
    {
        float root = sqrt(discriminant);
        float q = -coefficients.y - (coefficients.y < 0.0 ? -root : root);
        float farRoot = q / (3.0 * coefficients.x);
        float nearRoot = q == 0.0 ? 0.0 : coefficients.z / q;
        float first = min(farRoot, nearRoot);
        float second = max(farRoot, nearRoot);
        if (first > low && first < high) { partitions[count++] = first; candidates[result++] = first; }
        if (second > low && second < high) { partitions[count++] = second; candidates[result++] = second; }
    }
    partitions[count++] = high;
    for (uint index = 1u; index < count; ++index)
    {
        float left = partitions[index - 1u];
        float right = partitions[index];
        if (strokePolynomial(coefficients, left) * strokePolynomial(coefficients, right) > 0.0) continue;
        float leftValue = strokePolynomial(coefficients, left);
        for (uint step = 0u; step < 24u; ++step)
        {
            float middle = (left + right) * 0.5;
            if (leftValue * strokePolynomial(coefficients, middle) <= 0.0) right = middle;
            else { left = middle; leftValue = strokePolynomial(coefficients, left); }
        }
        normalMask |= 1u << result;
        candidates[result++] = (left + right) * 0.5;
    }
    return result;
}
