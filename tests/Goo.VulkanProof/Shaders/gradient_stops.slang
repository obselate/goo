float4 unpackColor(uint packedRgb, uint packedAlpha, uint alphaIndex)
{
    return float4(
        float(packedRgb & 0x7ffu) / 2047.0,
        float((packedRgb >> 11u) & 0x7ffu) / 2047.0,
        float((packedRgb >> 22u) & 0x3ffu) / 1023.0,
        float((packedAlpha >> (alphaIndex * 10u)) & 0x3ffu) / 1023.0);
}

float4 stopColor(uint index)
{
    GooPrimitiveRecord stops = pc;
    if (pc.packedColorsExtra.z > 4u)
    {
        stops = gooPrimitiveBuffer[pc.packedColorsExtra.w + index / 4u];
        index %= 4u;
    }
    if (index == 0u)
    {
        return unpackColor(stops.packedColors.x, stops.packedColors.w, 0u);
    }
    if (index == 1u)
    {
        return unpackColor(stops.packedColors.y, stops.packedColors.w, 1u);
    }
    if (index == 2u)
    {
        return unpackColor(stops.packedColors.z, stops.packedColors.w, 2u);
    }
    return unpackColor(stops.packedColorsExtra.x, stops.packedColorsExtra.y, 0u);
}

float stopPosition(uint index)
{
    GooPrimitiveRecord stops = pc;
    if (pc.packedColorsExtra.z > 4u)
    {
        stops = gooPrimitiveBuffer[pc.packedColorsExtra.w + index / 4u];
        index %= 4u;
    }
    if (index == 0u)
    {
        return stops.stopPositions.x;
    }
    if (index == 1u)
    {
        return stops.stopPositions.y;
    }
    if (index == 2u)
    {
        return stops.stopPositions.z;
    }
    return stops.stopPositions.w;
}

float4 interpolateStops(float value)
{
    uint count = pc.packedColorsExtra.z;
    if (value < stopPosition(0u)) return stopColor(0u);
    // Upper bound selects the last stop at a duplicate offset (a hard color edge).
    uint low = 1u;
    uint high = count;
    while (low < high)
    {
        uint middle = low + (high - low) / 2u;
        if (stopPosition(middle) <= value) low = middle + 1u;
        else high = middle;
    }
    if (low == count) return stopColor(count - 1u);
    float left = stopPosition(low - 1u);
    float right = stopPosition(low);
    return lerp(stopColor(low - 1u), stopColor(low), clamp((value - left) / (right - left), 0.0, 1.0));
}

