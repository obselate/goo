package GooGallery

import System
import System.IO
import System.Numerics
import Goo

class GalleryShaderPrograms {
  private let lab[11]ShaderEffect
  private let studio[11]ShaderEffect
  /// Gets the radial light shader effect used by the hero header.
  public let Hero ShaderEffect
  /// Gets the ripple shader effect used by Motion & Dynamics.
  public let MotionRipple ShaderEffect
  /// Gets the radial light shader effect used by Motion & Dynamics.
  public let MotionRadial ShaderEffect

  public init() {
    let wolfenstein = ShaderEffectProgram.Load(
      Path.Combine(AppContext.BaseDirectory, "Shaders", "wolfenstein.goo-effect"))
    let chrome = ShaderEffectProgram.Load(
      Path.Combine(AppContext.BaseDirectory, "Shaders", "chrome_sdf.goo-effect"))
    let corridor = ShaderEffectProgram.Load(
      Path.Combine(AppContext.BaseDirectory, "Shaders", "corridor.goo-effect"))
    let radial = ShaderEffectProgram.Load(
      Path.Combine(AppContext.BaseDirectory, "Shaders", "radial_light.goo-effect"))
    let ripple = ShaderEffectProgram.Load(
      Path.Combine(AppContext.BaseDirectory, "Shaders", "ripple.goo-effect"))
    let glass = ShaderEffectProgram.Load(
      Path.Combine(AppContext.BaseDirectory, "Shaders", "terminal_glass.goo-effect"))
    let volumetric = ShaderEffectProgram.Load(
      Path.Combine(AppContext.BaseDirectory, "Shaders", "volumetric.goo-effect"))
    let dither = ShaderEffectProgram.Load(
      Path.Combine(AppContext.BaseDirectory, "Shaders", "dither.goo-effect"))
    let aurora = ShaderEffectProgram.Load(
      Path.Combine(AppContext.BaseDirectory, "Shaders", "aurora.goo-effect"))
    let silk = ShaderEffectProgram.Load(
      Path.Combine(AppContext.BaseDirectory, "Shaders", "iridescent_silk.goo-effect"))
    let crt = ShaderEffectProgram.Load(
      Path.Combine(AppContext.BaseDirectory, "Shaders", "crt.goo-effect"))

    lab = [11]ShaderEffect
    studio = [11]ShaderEffect
    lab[0] = ShaderEffect(wolfenstein, samplesBackdrop: false)
    lab[1] = ShaderEffect(chrome, samplesBackdrop: false)
    lab[2] = ShaderEffect(corridor, samplesBackdrop: false)
    lab[3] = ShaderEffect(radial, samplesBackdrop: false)
    lab[4] = ShaderEffect(ripple, samplesBackdrop: false)
    lab[5] = ShaderEffect(glass, samplesBackdrop: true, backdropOutset: 24.0F)
    lab[6] = ShaderEffect(volumetric, samplesBackdrop: false)
    lab[7] = ShaderEffect(dither, samplesBackdrop: false)
    lab[8] = ShaderEffect(aurora, samplesBackdrop: false)
    lab[9] = ShaderEffect(silk, samplesBackdrop: false)
    lab[10] = ShaderEffect(crt, samplesBackdrop: false)

    studio[0] = ShaderEffect(wolfenstein, samplesBackdrop: false)
    studio[1] = ShaderEffect(chrome, samplesBackdrop: false)
    studio[2] = ShaderEffect(corridor, samplesBackdrop: false)
    studio[3] = ShaderEffect(radial, samplesBackdrop: false)
    studio[4] = ShaderEffect(ripple, samplesBackdrop: false)
    studio[5] = ShaderEffect(glass, samplesBackdrop: true, backdropOutset: 24.0F)
    studio[6] = ShaderEffect(volumetric, samplesBackdrop: false)
    studio[7] = ShaderEffect(dither, samplesBackdrop: false)
    studio[8] = ShaderEffect(aurora, samplesBackdrop: false)
    studio[9] = ShaderEffect(silk, samplesBackdrop: false)
    studio[10] = ShaderEffect(crt, samplesBackdrop: false)

    Hero = ShaderEffect(radial, samplesBackdrop: false)
    MotionRipple = ShaderEffect(ripple, samplesBackdrop: false)
    MotionRadial = ShaderEffect(radial, samplesBackdrop: false)
    lab[7].SetParameter(2, Vector4(0.0F, 0.5F, 1.0F, 0.0F))
  }

  /// Gets the Shader Lab effect instance for the specified program index.
  public func Lab(index int32) ShaderEffect -> lab[index]

  /// Gets the Final Synthesis studio effect instance for the specified program index.
  public func Studio(index int32) ShaderEffect -> studio[index]
}
