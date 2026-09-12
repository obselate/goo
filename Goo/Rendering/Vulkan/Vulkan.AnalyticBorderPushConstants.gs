package Goo

import System.Runtime.InteropServices

@StructLayout(LayoutKind.Explicit, Size: 128)
internal unsafe struct AnalyticBorderPushConstants {
  @FieldOffset(0) var Geometry VulkanPrimitiveGeometry
  @FieldOffset(48) var widths_x float32
  @FieldOffset(52) var widths_y float32
  @FieldOffset(56) var widths_z float32
  @FieldOffset(60) var widths_w float32
  @FieldOffset(64) var params_x float32
  @FieldOffset(68) var params_y float32
  @FieldOffset(72) var params_z float32
  @FieldOffset(76) var params_w float32
  @FieldOffset(80) var radii_x float32
  @FieldOffset(84) var radii_y float32
  @FieldOffset(88) var radii_z float32
  @FieldOffset(92) var radii_w float32
  @FieldOffset(96) var packedColors_x uint32
  @FieldOffset(100) var packedColors_y uint32
  @FieldOffset(104) var packedColors_z uint32
  @FieldOffset(108) var packedColors_w uint32
  @FieldOffset(112) var packedColorsExtra_x uint32
  @FieldOffset(116) var packedColorsExtra_y uint32
  @FieldOffset(120) var packedColorsExtra_z uint32
  @FieldOffset(124) var packedColorsExtra_w uint32
}
