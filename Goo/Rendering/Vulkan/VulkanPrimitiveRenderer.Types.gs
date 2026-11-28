package Goo

import System
import System.IO
import System.Numerics
import System.Runtime.InteropServices

@StructLayout(LayoutKind.Explicit, Size: 128)
internal struct VulkanShaderEffectPushConstants {
  @FieldOffset(0) var Parameter0 Vector4
  @FieldOffset(16) var Parameter1 Vector4
  @FieldOffset(32) var Parameter2 Vector4
  @FieldOffset(48) var Parameter3 Vector4
  @FieldOffset(64) var Parameter4 Vector4
  @FieldOffset(80) var Parameter5 Vector4
  @FieldOffset(96) var Parameter6 Vector4
  @FieldOffset(112) var Parameter7 Vector4
}

internal unsafe struct PrimitiveTransform {
  var A float32
  var B float32
  var C float32
  var D float32
  var TX float32
  var TY float32
}

internal struct PrimitiveClip {
  var Left int32
  var Top int32
  var Right int32
  var Bottom int32
}

internal struct VulkanLayerRenderState {
  var Record LayerRecord
  var LayerIndex int32
  var ParentLayerIndex int32
  var Target VulkanOffscreenLayerTarget?
  var BackdropTarget VulkanOffscreenLayerTarget?
  var ParentTarget VulkanOffscreenLayerTarget?
  var ParentOriginX float32
  var ParentOriginY float32
  var ParentDitherOffsetX float32
  var ParentDitherOffsetY float32
  var ParentExtent VkExtent2D
  var ParentPhysicalExtent VkExtent2D
  var ParentClipDepth int32
  var ClipSnapshotOffset int32
  var TimestampHandle int32
}

internal data struct PendingGradientStops(
  OwnerRecordIndex int32,
  StopStart int32,
  StopCount int32,
  Opacity float32
) { }

internal struct PackedPrimitiveColor {
  var Rgb uint32
  var Alpha uint32
}
