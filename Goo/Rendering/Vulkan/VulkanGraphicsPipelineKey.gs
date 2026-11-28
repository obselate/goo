package Goo

internal enum VulkanGraphicsProgramKind {
    BatchedUi;
    Blend;
    PathBand;
    PathStroke;
    TextDraw;
    TextPaint;
    ShaderEffect;
}

internal data struct VulkanGraphicsPipelineKey(
    TargetFormat VkFormat,
    SampleCount uint32,
    Topology uint32,
    BlendEnabled bool,
    ColorWriteMask uint32,
    ProgramKind VulkanGraphicsProgramKind,
    ReplacesBackdrop bool
) {
}
