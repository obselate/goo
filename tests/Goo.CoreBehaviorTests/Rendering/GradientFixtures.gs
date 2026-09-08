package Goo

import System

internal class GradientFixtures {
  func LongGradientsCompileWithoutUnsupportedFallback() bool {
    let stops = [257]GradientStop
    for index in 0 ... stops.Length {
      stops[index] = GradientStop{ Offset: float64(index) / float64(stops.Length - 1),
        Color: if index % 2 == 0 { Color.Rgb(255, 0, 0) } else { Color.Rgb(0, 0, 255) } }
    }
    for radial in []bool { false, true } {
      let gradient Gradient = if radial { RadialGradient(0.5, 0.5, 0.5, stops) } else { LinearGradient(90.0, stops) }
      let root = Reconciler{ Res: Resolver{} }.Mount(Container{
        Width: 100, Height: 100, BackgroundGradient: gradient,
      })
      Layout().Calculate(root, 100.0F, 100.0F)
      let compiler = VulkanSceneCompiler(64)
      let result = compiler.Compile(root, Color.Transparent, 100.0F, 100.0F)
      let frame = compiler.Frame
      if result.UnsupportedPrimitiveCount != 0 || frame.GradientStopCount != stops.Length { return false }
      if radial {
        if frame.RadialGradientCount != 1 || frame.RadialGradients[0].StopCount != stops.Length { return false }
      } else {
        if frame.LinearGradientCount != 1 || frame.LinearGradients[0].StopCount != stops.Length { return false }
      }
    }
    return true
  }
}
