#ifdef GOO_WEBGPU
float gooClipCoverage() { return 1.0; }
#else
#include "batched_scissor.slang"

float2 gooClipScreenPosition()
{
    return gooScissorScreenPosition(gooClipDrawOrdinal, gooFragmentPosition.xy);
}

float gooClipCoverage()
{
    return gooScissorChainCoverage(gooClipDrawOrdinal, gooFragmentPosition.xy);
}
#endif
