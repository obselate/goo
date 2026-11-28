package Goo

import System

internal struct VulkanSceneTraversalContext {
  internal var ParentTransformIndex int32
  internal var ParentRectClipIndex int32
  internal var ParentOpacity float32
  internal var ParentAxisAligned bool
  internal var ParentRectClipDepth int32
  internal var ParentPathClipChainId int32
  internal var ParentIsolation bool
  internal var RoundedOverflowOwner Node?
  internal var RoundedOverflowTransformIndex int32
  internal var RoundedOverflowLayerId int32
  internal var ExactCullContextSafe bool
  internal var ActiveClipBounds ConservativeBounds
}
