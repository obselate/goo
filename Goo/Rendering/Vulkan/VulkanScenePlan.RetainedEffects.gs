package Goo

import System

internal partial class SceneFrame {
    private func CaptureRetainedEffects(data VulkanRetainedSceneData,
        start VulkanSceneRangePosition, end VulkanSceneRangePosition) bool {
        for index in start.Layers ... end.Layers {
            let effect = data.Layers[index].EffectIndex
            if effect >= 0 && (effect < start.Effects || effect >= end.Effects) { return false }
        }
        for index in start.Effects ... end.Effects {
            guard let weak = data.EffectPrograms[index] else { return false }
            if !weak.TryGetTarget(out var program) || program.PlaybackActive { return false }
            var snapshot ShaderEffectSnapshot
            program.CopySnapshot(out snapshot)
            data.CapturedEffects[index] = snapshot
            let previous = data.Effects[index]
            if snapshot.ProgramId != previous.ProgramId || snapshot.Version != previous.Version
                || snapshot.ElapsedSeconds != previous.ElapsedSeconds { return false }
        }
        return true
    }

    private func RestoreRetainedEffects(data VulkanRetainedSceneData,
        binding VulkanSceneRangeBinding) {
        for index in binding.Start.Effects ... binding.End.Effects {
            let snapshot = data.CapturedEffects[index]
            data.CapturedEffects[index] = ShaderEffectSnapshot{}
            let packed = PackShaderEffectData(snapshot)
            var value = data.Effects[index]
            value.Program = snapshot.Program
            value.DataWordOffset = packed.WordOffset
            value.DataByteCount = packed.ByteCount
            shaderEffects[binding.Destination.Effects + index - binding.Start.Effects] = value
        }
    }

    private func ReleaseRetainedEffects(data VulkanRetainedSceneData,
        start VulkanSceneRangePosition, end VulkanSceneRangePosition) {
        for index in start.Effects ... end.Effects {
            ReleaseShaderEffectDataCaptures(data.CapturedEffects[index])
            data.CapturedEffects[index] = ShaderEffectSnapshot{}
        }
    }
}
