#ifndef GOO_PRIMITIVE_RECORD_SLANG
#define GOO_PRIMITIVE_RECORD_SLANG
#include "slang_compat.slang"
struct GooPrimitiveRecord
{
    float4 rect;
    float4 transform0;
    float4 transform1;
    float4 radii;
    float4 params;
    float4 stopPositions;
    uint4 packedColors;
    uint4 packedColorsExtra;
};
[[vk::binding(0, 2)]] StructuredBuffer<GooPrimitiveRecord> gooPrimitiveBuffer;
#endif
