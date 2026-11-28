#define GOO_SCISSOR_SET 3
#include "batched_scissor.slang"

float gooClipCoverage()
{
    return gooScissorChainCoverage(gooClipDrawOrdinal, gooFragmentPosition.xy);
}
