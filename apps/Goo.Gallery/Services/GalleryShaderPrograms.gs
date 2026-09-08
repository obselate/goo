package GooGallery

import System
import System.IO
import System.Numerics
import Goo

class GalleryShaderPrograms {
  private let programs[11]ShaderEffectProgram?
  private let lab[11]ShaderEffect?
  private let studio[11]ShaderEffect?
  private var hero ShaderEffect?
  private var motionRipple ShaderEffect?
  private var motionRadial ShaderEffect?
  /// Gets the radial light shader effect used by the hero header.
  public prop Hero ShaderEffect{
    get {
      if let existing = hero { return existing }
      let created = createEffect(3)
      hero = created
      return created
    }
  }
  /// Gets the ripple shader effect used by Motion & Dynamics.
  public prop MotionRipple ShaderEffect{
    get {
      if let existing = motionRipple { return existing }
      let created = createEffect(4)
      motionRipple = created
      return created
    }
  }
  /// Gets the radial light shader effect used by Motion & Dynamics.
  public prop MotionRadial ShaderEffect{
    get {
      if let existing = motionRadial { return existing }
      let created = createEffect(3)
      motionRadial = created
      return created
    }
  }

  public init() {
    programs = [11]ShaderEffectProgram?
    lab = [11]ShaderEffect?
    studio = [11]ShaderEffect?
    hero = nil
    motionRipple = nil
    motionRadial = nil
  }

  /// Gets the Shader Lab effect instance for the specified program index.
  public func Lab(index int32) ShaderEffect {
    if let existing = lab[index] { return existing }
    let created = createEffect(index)
    if index == 7 {
      created.SetParameter(2, Vector4(0.0F, 0.5F, 1.0F, 0.0F))
    }
    lab[index] = created
    return created
  }

  /// Gets the Final Synthesis studio effect instance for the specified program index.
  public func Studio(index int32) ShaderEffect {
    if let existing = studio[index] { return existing }
    let created = createEffect(index)
    studio[index] = created
    return created
  }

  private func createEffect(index int32) ShaderEffect -> ShaderEffect(
    program(index),
    samplesBackdrop: index == 5,
    backdropOutset: if index == 5 { 24.0F } else { 0.0F })

  private func program(index int32) ShaderEffectProgram {
    if let existing = programs[index] { return existing }
    let name = switch index {
      case 0: "wolfenstein.goo-effect"
      case 1: "chrome_sdf.goo-effect"
      case 2: "corridor.goo-effect"
      case 3: "radial_light.goo-effect"
      case 4: "ripple.goo-effect"
      case 5: "terminal_glass.goo-effect"
      case 6: "volumetric.goo-effect"
      case 7: "dither.goo-effect"
      case 8: "aurora.goo-effect"
      case 9: "iridescent_silk.goo-effect"
      default: "crt.goo-effect"
    }
    let created = ShaderEffectProgram.Load(
      Path.Combine(AppContext.BaseDirectory, "Shaders", name))
    programs[index] = created
    return created
  }
}
