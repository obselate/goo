package Goo

import System.Runtime.InteropServices

@StructLayout(LayoutKind.Explicit, Size: 80)
internal unsafe struct PathBandPushConstants {
    @FieldOffset(0) var transform0_x float32
    @FieldOffset(4) var transform0_y float32
    @FieldOffset(8) var transform0_z float32
    @FieldOffset(12) var transform0_w float32
    @FieldOffset(16) var transform1_x float32
    @FieldOffset(20) var transform1_y float32
    @FieldOffset(24) var transform1_z float32
    @FieldOffset(28) var transform1_w float32
    @FieldOffset(32) var sampleStep_x float32
    @FieldOffset(36) var sampleStep_y float32
    @FieldOffset(40) var sampleStep_z float32
    @FieldOffset(44) var sampleStep_w float32
    @FieldOffset(48) var color_x float32
    @FieldOffset(52) var color_y float32
    @FieldOffset(56) var color_z float32
    @FieldOffset(60) var color_w float32
    @FieldOffset(64) var params_x uint32
    @FieldOffset(68) var params_y uint32
    @FieldOffset(72) var params_z uint32
    @FieldOffset(76) var params_w uint32
}

@StructLayout(LayoutKind.Explicit, Size: 4)
internal struct StrokeMetricPushConstants {
    @FieldOffset(0) var request uint32
}
