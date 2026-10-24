struct AnalyticFragmentInput
{
    [[vk::location(0)]] float2 uv;
    [[vk::location(2)]] nointerpolation uint clipDrawOrdinal;
    [[vk::location(3)]] nointerpolation uint primitiveRecordOrdinal;
    float4 position : SV_Position;
};
struct AnalyticFragmentOutput
{
    [[vk::location(0)]] float4 color : SV_Target0;
};
[shader("fragment")]
AnalyticFragmentOutput main(AnalyticFragmentInput input)
{
    uv = input.uv;
    gooClipDrawOrdinal = input.clipDrawOrdinal;
    gooPrimitiveRecordOrdinal = input.primitiveRecordOrdinal;
    gooFragmentPosition = input.position;
    shade();
    AnalyticFragmentOutput output;
    output.color = outColor;
    return output;
}
