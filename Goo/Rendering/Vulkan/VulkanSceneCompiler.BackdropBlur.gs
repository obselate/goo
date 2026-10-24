package Goo

import System
import System.IO
import System.Numerics

internal class BackdropBlurEffect {
  shared {
    internal let Shared ShaderEffect = load()

    private func load() ShaderEffect {
      using let stream = typeof(BackdropBlurEffect).Assembly.GetManifestResourceStream(
        "Goo.Effects.backdrop_blur.goo-effect")
      if stream == nil { throw FileNotFoundException("Goo backdrop blur effect is missing") }
      using let output = MemoryStream()
      stream.CopyTo(output)
      let program = ShaderEffectProgram(output.ToArray(), true)
      return ShaderEffect(program, true)
    }
  }
}

internal partial class VulkanSceneCompiler {
  private func EmitBackdropBlur(
    node Node,
    ownerId uint64,
    bounds ConservativeBounds,
    opacity float32,
    transformIndex int32,
    axisAligned bool,
    context VulkanSceneTraversalContext) {
      if node.BackdropBlur <= 0.0F {
        return
      }
      let transform = ResolveCompilerFrameTransform(transformIndex)
      let visible = IntersectBounds(TransformCompilerBounds(bounds, transform), context.ActiveClipBounds)
      if visible.IsEmpty {
        return
      }
      var clipChainId = context.ParentPathClipChainId
      if HasRadius(node, bounds) || !axisAligned {
        let clip = ResolveRoundedOverflowClip(node, bounds, bounds, transformIndex, clipChainId, true)
        if !clip.Emitted {
          return
        }
        clipChainId = clip.ChainIndex
      }
      let sigma = node.BackdropBlur * MathF.Sqrt(MathF.Abs(transform.A * transform.D - transform.B * transform.C))
      let capture = IntersectBounds(visible.Inflate(sigma * 3.0F), context.ActiveClipBounds)
      let originX = MathF.Floor(capture.X)
      let originY = MathF.Floor(capture.Y)
      let extentWidth = MathF.Max(1.0F, MathF.Ceiling(capture.Right) - originX)
      let extentHeight = MathF.Max(1.0F, MathF.Ceiling(capture.Bottom) - originY)
      let layer = BackdropBlurLayer(ownerId | BackdropBlurMaskBit, visible, opacity, sigma,
        originX, originY, extentWidth, extentHeight)
      frame.SetActiveClipChain(0)
      frame.AddLayerBegin(layer)
      frame.SetActiveClipChain(clipChainId)
      frame.AddLayerEnd(layer)
      frame.SetActiveClipChain(context.ParentPathClipChainId)
    }

  private func BackdropBlurLayer(
    targetId uint64,
    bounds ConservativeBounds,
    opacity float32,
    sigma float32,
    originX float32,
    originY float32,
    extentWidth float32,
    extentHeight float32) LayerRecord{
      let effect = BackdropBlurEffect.Shared
      return LayerRecord{
        Bounds: bounds,
        Opacity: opacity,
        OffscreenTargetId: ResourceId{
          Kind: SceneResourceKind.OffscreenTarget,
          LogicalId: targetId,
          Version: 1uL,
        },
        EffectProgramId: effect.ProgramId,
        EffectVersion: 1uL,
        EffectIndex: frame.AddShaderEffect(ShaderEffectSnapshot{
            Program: effect,
            ProgramId: effect.ProgramId,
            Version: 1uL,
            SamplesBackdrop: true,
            BackdropBlur: sigma,
            Parameter0: Vector4(1.0F, 0.0F, 0.0F, 0.0F),
          }),
        Flags: uint32(LayerRecordFlags.SamplesBackdrop),
        TransformIndex: -1,
        OriginX: originX,
        OriginY: originY,
        ExtentWidth: uint32(extentWidth),
        ExtentHeight: uint32(extentHeight),
      }
    }
}
