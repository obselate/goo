package Goo

import Goo.VulkanProof

internal unsafe class VulkanProofFixture {
  shared {
    internal func Run() int32 -> RunVulkanProof()

    internal func VerifyLayerEffectCoordinates(program ShaderEffectProgram) ->
    VerifyShaderEffectCaptureCoordinates(program)
  }
}
