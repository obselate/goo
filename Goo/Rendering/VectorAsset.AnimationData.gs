package Goo

import System

internal enum VectorPaintKind {
  Solid; LinearGradient; RadialGradient
}

internal enum VectorAnimationKind {
  Transform; Opacity; Color; Stroke; Morph
}

internal enum VectorEasingKind {
  Linear; Step; Cubic
}

internal class VectorAnimationFlags {
  shared {
    internal const MissingIndex uint32 = 0xffffffffu
    internal const Loop uint32 = 1u
    internal const PingPong uint32 = 2u
  }
}

internal sealed class VectorAnimationNode {
  internal let PaintIndex uint32
  internal let StrokeIndex uint32
  internal let TransformTrackIndex uint32
  internal let OpacityTrackIndex uint32
  internal let MorphTrackIndex uint32

  internal init(paintIndex uint32, strokeIndex uint32, transformTrackIndex uint32,
    opacityTrackIndex uint32, morphTrackIndex uint32) {
      PaintIndex = paintIndex
      StrokeIndex = strokeIndex
      TransformTrackIndex = transformTrackIndex
      OpacityTrackIndex = opacityTrackIndex
      MorphTrackIndex = morphTrackIndex
    }

  internal prop HasPaint bool{ get -> PaintIndex != VectorAnimationFlags.MissingIndex }
  internal prop HasStroke bool{ get -> StrokeIndex != VectorAnimationFlags.MissingIndex }
  internal prop HasTransformTrack bool{
    get -> TransformTrackIndex != VectorAnimationFlags.MissingIndex
  }
  internal prop HasOpacityTrack bool{
    get -> OpacityTrackIndex != VectorAnimationFlags.MissingIndex
  }
  internal prop HasMorphTrack bool{
    get -> MorphTrackIndex != VectorAnimationFlags.MissingIndex
  }
}

internal sealed class VectorAnimationPaint {
  internal let Kind VectorPaintKind
  internal let TrackIndex uint32

  internal init(kind VectorPaintKind, trackIndex uint32) {
    Kind = kind
    TrackIndex = trackIndex
  }

  internal prop HasTrack bool{ get -> TrackIndex != VectorAnimationFlags.MissingIndex }
}

internal sealed class VectorAnimationStroke {
  internal let Width float32
  internal let MiterLimit float32
  internal let Cap uint32
  internal let Join uint32
  internal let DashOffset float32
  internal let PaintIndex uint32
  internal let TrackIndex uint32
  internal let DashStart uint32
  internal let DashCount uint32

  internal init(width float32, miterLimit float32, cap uint32, join uint32,
    dashOffset float32, paintIndex uint32, trackIndex uint32,
    dashStart uint32, dashCount uint32) {
      Width = width
      MiterLimit = miterLimit
      Cap = cap
      Join = join
      DashOffset = dashOffset
      PaintIndex = paintIndex
      TrackIndex = trackIndex
      DashStart = dashStart
      DashCount = dashCount
    }

  internal prop HasTrack bool{ get -> TrackIndex != VectorAnimationFlags.MissingIndex }
  internal prop HasPaint bool{ get -> PaintIndex != VectorAnimationFlags.MissingIndex }
  internal prop HasDashes bool{ get -> DashCount != 0u }
}

internal sealed class VectorAnimationTrack {
  internal let Kind VectorAnimationKind
  internal let KeyframeStart uint32
  internal let KeyframeCount uint32
  internal let Duration float32
  internal let Flags uint32

  internal init(kind VectorAnimationKind, keyframeStart uint32,
    keyframeCount uint32, duration float32, flags uint32) {
      Kind = kind
      KeyframeStart = keyframeStart
      KeyframeCount = keyframeCount
      Duration = duration
      Flags = flags
    }
}

internal sealed class VectorAnimationKeyframe {
  internal let Time float32
  internal let A float32
  internal let B float32
  internal let C float32
  internal let D float32
  internal let E float32
  internal let F float32
  internal let Easing uint32
  internal let ControlA float32
  internal let ControlB float32
  internal let ControlC float32
  internal let ControlD float32
  internal let TargetCurveStart uint32
  internal let TargetCurveCount uint32

  internal init(time float32, a float32, b float32, c float32, d float32,
    e float32, f float32, easing uint32, controlA float32, controlB float32,
    controlC float32, controlD float32, targetCurveStart uint32,
    targetCurveCount uint32) {
      Time = time
      A = a
      B = b
      C = c
      D = d
      E = e
      F = f
      Easing = easing
      ControlA = controlA
      ControlB = controlB
      ControlC = controlC
      ControlD = controlD
      TargetCurveStart = targetCurveStart
      TargetCurveCount = targetCurveCount
    }
}

internal sealed class VectorAnimationCurve {
  internal let X0 float32
  internal let Y0 float32
  internal let CX float32
  internal let CY float32
  internal let X1 float32
  internal let Y1 float32

  internal init(x0 float32, y0 float32, cx float32, cy float32,
    x1 float32, y1 float32) {
      X0 = x0
      Y0 = y0
      CX = cx
      CY = cy
      X1 = x1
      Y1 = y1
    }
}

internal sealed class VectorAssetAnimation {
  internal let Nodes []VectorAnimationNode
  internal let Paints []VectorAnimationPaint
  internal let Strokes []VectorAnimationStroke
  internal let Tracks []VectorAnimationTrack
  internal let Keyframes []VectorAnimationKeyframe
  internal let MorphCurves []VectorAnimationCurve
  internal let DashValues []float32

  internal init(nodes []VectorAnimationNode, paints []VectorAnimationPaint,
    strokes []VectorAnimationStroke, tracks []VectorAnimationTrack,
    keyframes []VectorAnimationKeyframe, morphCurves []VectorAnimationCurve,
    dashValues []float32) {
      Nodes = nodes
      Paints = paints
      Strokes = strokes
      Tracks = tracks
      Keyframes = keyframes
      MorphCurves = morphCurves
      DashValues = dashValues
    }

  shared {
    internal func MatrixTransform(a float32, b float32, c float32, d float32,
      translateX float32, translateY float32) PanelTransform{
        let firstLength = MathF.Sqrt(a * a + c * c)
        let epsilon = 0.0000001F
        if firstLength <= epsilon {
          let secondLength = MathF.Sqrt(b * b + d * d)
          if secondLength > epsilon {
            let radians = MathF.Atan2(-b, d)
            return PanelTransform{
              TranslateX: float64(translateX),
              TranslateY: float64(translateY),
              Rotate: float64(radians * 180.0F / MathF.PI),
              ScaleX: 0.0,
              ScaleY: float64(secondLength),
            }
          }
          return PanelTransform{
            TranslateX: float64(translateX),
            TranslateY: float64(translateY),
            ScaleX: 0.0,
            ScaleY: 0.0,
          }
        }
        let radians = MathF.Atan2(c, a)
        let cosine = MathF.Cos(radians)
        let sine = MathF.Sin(radians)
        let secondScale = cosine * d - sine * b
        if MathF.Abs(secondScale) <= epsilon {
          let secondLength = MathF.Sqrt(b * b + d * d)
          if secondLength > epsilon {
            let alternateRadians = MathF.Atan2(-b, d)
            let alternateCosine = MathF.Cos(alternateRadians)
            let alternateSine = MathF.Sin(alternateRadians)
            let alternateScale = alternateCosine * a + alternateSine * c
            if MathF.Abs(alternateScale) > epsilon {
              let tangentY = (-alternateSine * a + alternateCosine * c) / alternateScale
              return PanelTransform{
                TranslateX: float64(translateX),
                TranslateY: float64(translateY),
                Rotate: float64(alternateRadians * 180.0F / MathF.PI),
                ScaleX: float64(alternateScale),
                ScaleY: float64(secondLength),
                SkewY: float64(MathF.Atan(tangentY) * 180.0F / MathF.PI),
              }
            }
          }
          return PanelTransform{
            TranslateX: float64(translateX),
            TranslateY: float64(translateY),
            Rotate: float64(radians * 180.0F / MathF.PI),
            ScaleX: float64(firstLength),
            ScaleY: 0.0,
          }
        }
        let tangentX = (cosine * b + sine * d) / secondScale
        return PanelTransform{
          TranslateX: float64(translateX),
          TranslateY: float64(translateY),
          Rotate: float64(radians * 180.0F / MathF.PI),
          ScaleX: float64(firstLength),
          ScaleY: float64(secondScale),
          SkewX: float64(MathF.Atan(tangentX) * 180.0F / MathF.PI),
        }
      }
  }
}
