package Goo

import System
import System.Collections.Generic

internal data struct VectorAnimationValue {
  internal var A float32
  internal var B float32
  internal var C float32
  internal var D float32
  internal var E float32
  internal var F float32
}

internal data struct VectorAnimationState {
  internal var Value VectorAnimationValue
  internal var Initialized bool
}

private sealed class VectorMorphState {
  internal let Path VectorPath
  internal let Quadratics []PathQuadratic
  internal let Contours []PathContour
  internal let CurveCount int32
  internal let ContourCount int32

  internal init(path VectorPath) {
    guard let owner = path.NormalizedOwner else {
      throw InvalidOperationException("Morph path is not mutable")
    }
    Path = path
    CurveCount = owner.QuadraticCount
    ContourCount = owner.ContourCount
    Quadratics = [CurveCount]PathQuadratic
    Contours = [ContourCount]PathContour
    if CurveCount > 0 {
      Array.Copy(owner.Quadratics, Quadratics, CurveCount)
    }
    if ContourCount > 0 {
      Array.Copy(owner.Contours, Contours, ContourCount)
    }
  }
}

internal sealed class VectorAnimationPlayer : MotionParticle {
  private let owner Cell
  private let asset VectorAsset
  private let nodeHandles []ElementHandle?
  private let fillHandles []ElementHandle?
  private let strokeHandles []ElementHandle?
  private let nodes []Node?
  private let fills []Node?
  private let strokes []Node?
  private let transforms []VectorAnimationState
  private let opacities []VectorAnimationState
  private let paints []VectorAnimationState
  private let strokeValues []VectorAnimationState
  private let dynamicDashes []DashPattern?
  private let paintFillTargets []List[int32]?
  private let paintStrokeTargets []List[int32]?
  private let strokeTargets []List[int32]?
  private let morphStates []VectorMorphState?
  private let dynamicPaths []VectorPath?
  private let transformNodes List[int32]
  private let opacityNodes List[int32]
  private let morphNodes List[int32]
  private let activePaints List[int32]
  private let activeStrokes List[int32]
  private let activeTracks List[int32]
  private var boundRoot Node?
  private var started bool
  private var startTime float64
  private var disposed bool

  internal init(owner Cell, asset VectorAsset, tree Container) {
    this.owner = owner
    this.asset = asset
    nodeHandles = [asset.NodeCount]ElementHandle?
    fillHandles = [asset.NodeCount]ElementHandle?
    strokeHandles = [asset.NodeCount]ElementHandle?
    nodes = [asset.NodeCount]Node?
    fills = [asset.NodeCount]Node?
    strokes = [asset.NodeCount]Node?
    transforms = [asset.NodeCount]VectorAnimationState
    opacities = [asset.NodeCount]VectorAnimationState
    paints = [asset.PlaybackPaintCount]VectorAnimationState
    strokeValues = [asset.PlaybackStrokeCount]VectorAnimationState
    dynamicDashes = [asset.PlaybackStrokeCount]DashPattern?
    paintFillTargets = [asset.PlaybackPaintCount]List[int32]?
    paintStrokeTargets = [asset.PlaybackPaintCount]List[int32]?
    strokeTargets = [asset.PlaybackStrokeCount]List[int32]?
    morphStates = [asset.NodeCount]VectorMorphState?
    dynamicPaths = [asset.NodeCount]VectorPath?
    transformNodes = List[int32]()
    opacityNodes = List[int32]()
    morphNodes = List[int32]()
    activePaints = List[int32]()
    activeStrokes = List[int32]()
    activeTracks = List[int32]()
    attachHandles(tree)
    prepareReverseTargets()
    prepareDynamicDashes()
  }

  internal override func Tick(now float64) bool {
    if disposed {
      return false
    }
    guard let root = owner.MountedNode() else {
      return true
    }
    if boundRoot != root {
      if !bindMounted(root, now) {
        return true
      }
    }
    let elapsed = playbackTime(now)
    var changed = false
    var activeIndex int32 = 0
    while activeIndex < transformNodes.Count {
      if applyTransform(transformNodes[activeIndex], elapsed) { changed = true }
      activeIndex++
    }
    activeIndex = 0
    while activeIndex < opacityNodes.Count {
      if applyOpacity(opacityNodes[activeIndex], elapsed) { changed = true }
      activeIndex++
    }
    var morphIndex int32 = 0
    while morphIndex < morphNodes.Count {
      if applyMorph(morphNodes[morphIndex], elapsed) { changed = true }
      morphIndex++
    }
    activeIndex = 0
    while activeIndex < activePaints.Count {
      if applyPaint(activePaints[activeIndex], elapsed) { changed = true }
      activeIndex++
    }
    activeIndex = 0
    while activeIndex < activeStrokes.Count {
      if applyStroke(activeStrokes[activeIndex], elapsed) { changed = true }
      activeIndex++
    }
    if changed {
      owner.InvalidateRetainedMotion(ReconcileEffects.Paint | ReconcileEffects.Rect
        | ReconcileEffects.Input)
    }
    return hasActiveTrack(now)
  }

  internal override func Dispose() {
    disposed = true
    boundRoot = nil
    if let pump = registrationPump {
      pump.Deregister(this)
    }
  }

  internal override func Bind(pump MotionPump) {
    if disposed || registrationPump == pump {
      return
    }
    pump.Register(this)
  }

  private func attachHandles(blob Blob) {
    var nodeIndex int32 = -1
    var fillIndex int32 = -1
    var strokeIndex int32 = -1
    if let key = blob.Key {
      nodeIndex = parseKey(key, "node-")
      fillIndex = parseKey(key, "fill-")
      strokeIndex = parseKey(key, "stroke-")
    }
    if nodeIndex >= 0 || fillIndex >= 0 || strokeIndex >= 0 {
      let handle = ElementHandle()
      blob.AttachRetainedHandle(handle)
      if nodeIndex >= 0 && nodeIndex < asset.NodeCount {
        nodeHandles[nodeIndex] = handle
      }
      if fillIndex >= 0 && fillIndex < asset.NodeCount {
        fillHandles[fillIndex] = handle
      }
      if strokeIndex >= 0 && strokeIndex < asset.NodeCount {
        strokeHandles[strokeIndex] = handle
      }
    }
    if let container = blob as Container {
      for child in container.Children {
        attachHandles(child)
      }
    }
  }

  private func parseKey(value string, prefix string) int32 {
    if !value.StartsWith(prefix) || value.Length == prefix.Length {
      return -1
    }
    var parsed int32
    return if !Int32.TryParse(value.Substring(prefix.Length), out parsed) { -1 } else { parsed }
  }

  private func prepareReverseTargets() {
    var nodeIndex int32 = 0
    while nodeIndex < asset.NodeCount {
      let node = asset.PlayerNodeAt(nodeIndex)
      if node.HasTransformTrack {
        transformNodes.Add(nodeIndex)
        addActiveTrack(int32(node.TransformTrackIndex))
      }
      if node.HasOpacityTrack {
        opacityNodes.Add(nodeIndex)
        addActiveTrack(int32(node.OpacityTrackIndex))
      }
      if node.HasPaint {
        let paintIndex = int32(node.PaintIndex)
        if paintFillTargets[paintIndex] == nil {
          paintFillTargets[paintIndex] = List[int32]()
        }
        paintFillTargets[paintIndex]!!.Add(nodeIndex)
        let paint = asset.PlayerPaintAt(paintIndex)
        if paint.HasTrack && paint.Kind == VectorPaintKind.Solid {
          addActivePaint(paintIndex)
          addActiveTrack(int32(paint.TrackIndex))
        }
      }
      if node.HasStroke {
        let strokeIndex = int32(node.StrokeIndex)
        if strokeTargets[strokeIndex] == nil {
          strokeTargets[strokeIndex] = List[int32]()
        }
        strokeTargets[strokeIndex]!!.Add(nodeIndex)
        let stroke = asset.PlayerStrokeAt(strokeIndex)
        if stroke.HasPaint {
          let paintIndex = int32(stroke.PaintIndex)
          if paintStrokeTargets[paintIndex] == nil {
            paintStrokeTargets[paintIndex] = List[int32]()
          }
          paintStrokeTargets[paintIndex]!!.Add(nodeIndex)
          let paint = asset.PlayerPaintAt(paintIndex)
          if paint.HasTrack && paint.Kind == VectorPaintKind.Solid {
            addActivePaint(paintIndex)
            addActiveTrack(int32(paint.TrackIndex))
          }
        }
        if stroke.HasTrack {
          addActiveStroke(strokeIndex)
          addActiveTrack(int32(stroke.TrackIndex))
          if dynamicPaths[nodeIndex] == nil && !node.HasMorphTrack {
            dynamicPaths[nodeIndex] = asset.PlayerMutablePathForNode(nodeIndex)
          }
        }
      }
      if node.HasMorphTrack {
        morphStates[nodeIndex] = VectorMorphState(
          asset.PlayerMutablePathForNode(nodeIndex))
        dynamicPaths[nodeIndex] = morphStates[nodeIndex]!!.Path
        morphNodes.Add(nodeIndex)
        addActiveTrack(int32(node.MorphTrackIndex))
      }
      nodeIndex++
    }
  }

  private func addActivePaint(index int32) {
    if !containsIndex(activePaints, index) {
      activePaints.Add(index)
    }
  }

  private func addActiveStroke(index int32) {
    if !containsIndex(activeStrokes, index) {
      activeStrokes.Add(index)
    }
  }

  private func addActiveTrack(index int32) {
    if !containsIndex(activeTracks, index) {
      activeTracks.Add(index)
    }
  }

  private func containsIndex(values List[int32], value int32) bool {
    var index int32 = 0
    while index < values.Count {
      if values[index] == value { return true }
      index++
    }
    return false
  }

  private func prepareDynamicDashes() {
    var index int32 = 0
    while index < asset.PlaybackStrokeCount {
      let stroke = asset.PlayerStrokeAt(index)
      if stroke.HasDashes && stroke.HasTrack {
        let track = asset.PlayerTrackAt(int32(stroke.TrackIndex))
        if track.Kind == VectorAnimationKind.Stroke {
          let intervals = [int32(stroke.DashCount)]float64
          var dashIndex int32 = 0
          while dashIndex < intervals.Length {
            intervals[dashIndex] = float64(asset.PlayerDashValueAt(
              int32(stroke.DashStart) + dashIndex))
            dashIndex++
          }
          dynamicDashes[index] = DashPattern(intervals, float64(stroke.DashOffset))
        }
      }
      index++
    }
  }

  private func bindMounted(root Node, now float64) bool {
    var index int32 = 0
    while index < asset.NodeCount {
      if let handle = nodeHandles[index] {
        guard let node = handle.AttachedNode() else { return false }
        nodes[index] = node
      } else {
        nodes[index] = nil
      }
      if let handle = fillHandles[index] {
        guard let fill = handle.AttachedNode() else { return false }
        fills[index] = fill
      } else {
        fills[index] = nil
      }
      if let handle = strokeHandles[index] {
        guard let stroke = handle.AttachedNode() else { return false }
        strokes[index] = stroke
      } else {
        strokes[index] = nil
      }
      if let state = morphStates[index] {
        if let fill = fills[index] {
          fill.ShapePath = state.Path
        }
        if let stroke = strokes[index] {
          stroke.ShapePath = state.Path
        }
      } else if let path = dynamicPaths[index] {
        if let stroke = strokes[index] {
          stroke.ShapePath = path
        }
      }
      index++
    }
    clearStates()
    boundRoot = root
    startTime = now
    started = true
    index = 0
    while index < asset.PlaybackStrokeCount {
      if let pattern = dynamicDashes[index] {
        if let targets = strokeTargets[index] {
          var targetIndex int32 = 0
          while targetIndex < targets.Count {
            let nodeIndex = targets[targetIndex]
            if let node = strokes[nodeIndex] {
              node.Dashes = pattern
            }
            targetIndex++
          }
        }
      }
      index++
    }
    return true
  }

  private func clearStates() {
    var index int32 = 0
    while index < transforms.Length {
      transforms[index].Initialized = false
      opacities[index].Initialized = false
      index++
    }
    index = 0
    while index < paints.Length {
      paints[index].Initialized = false
      index++
    }
    index = 0
    while index < strokeValues.Length {
      strokeValues[index].Initialized = false
      index++
    }
  }

  private func playbackTime(now float64) float64 {
    if !started {
      startTime = now
      started = true
    }
    let elapsed = (now - startTime) * Motion.TimeScale
    return elapsed > 0.0 ? elapsed : 0.0
  }

  private func hasActiveTrack(now float64) bool {
    let elapsed = playbackTime(now)
    if Motion.TimeScale <= 0.0 {
      return false
    }
    var index int32 = 0
    while index < activeTracks.Count {
      let track = asset.PlayerTrackAt(activeTracks[index])
      if track.KeyframeCount != 0u
        && ((track.Flags & VectorAnimationFlags.Loop) != 0u
          || elapsed < float64(track.Duration)) {
        return true
      }
      index++
    }
    return false
  }

  private func applyTransform(index int32, elapsed float64) bool {
    guard let node = nodes[index] else { return false }
    let source = asset.PlayerNodeAt(index)
    if !source.HasTransformTrack { return false }
    let trackIndex = int32(source.TransformTrackIndex)
    var value VectorAnimationValue
    if !evaluate(trackIndex, elapsed, false, out value) { return false }
    if transforms[index].Initialized && samePlaybackValue(transforms[index].Value, value) {
      return false
    }
    transforms[index].Value = value
    transforms[index].Initialized = true
    applyMatrix(node, value)
    return true
  }

  private func applyOpacity(index int32, elapsed float64) bool {
    guard let node = nodes[index] else { return false }
    let source = asset.PlayerNodeAt(index)
    if !source.HasOpacityTrack { return false }
    let trackIndex = int32(source.OpacityTrackIndex)
    var value VectorAnimationValue
    if !evaluate(trackIndex, elapsed, false, out value) { return false }
    if opacities[index].Initialized && samePlaybackValue(opacities[index].Value, value) {
      return false
    }
    opacities[index].Value = value
    opacities[index].Initialized = true
    let opacity = clamp01(value.A)
    if node.Opacity == float64(opacity) { return false }
    node.Opacity = float64(opacity)
    return true
  }

  private func applyMorph(index int32, elapsed float64) bool {
    guard let state = morphStates[index] else { return false }
    let source = asset.PlayerNodeAt(index)
    if !source.HasMorphTrack { return false }
    let trackIndex = int32(source.MorphTrackIndex)
    let track = asset.PlayerTrackAt(trackIndex)
    if track.Kind != VectorAnimationKind.Morph || track.KeyframeCount == 0u {
      return false
    }
    let time = trackTime(track, elapsed, float64(track.Duration))
    let start = int32(track.KeyframeStart)
    let count = int32(track.KeyframeCount)
    var firstIndex = count - 1
    var secondIndex = count - 1
    var progress float32 = 0.0F
    var segment int32 = 0
    while segment + 1 < count {
      let first = asset.PlayerMorphKeyframeAt(start + segment)
      let second = asset.PlayerMorphKeyframeAt(start + segment + 1)
      if time < float64(second.Time) {
        firstIndex = segment
        secondIndex = segment + 1
        let span = float64(second.Time - first.Time)
        let rawProgress = span <= 0.0 ? 1.0 : (time - float64(first.Time)) / span
        progress = easeMorphProgress(asset.PlayerMorphKeyframeAt(start + segment),
          clamp01f(float32(rawProgress)))
        break
      }
      segment++
    }
    let first = asset.PlayerMorphKeyframeAt(start + firstIndex)
    let second = asset.PlayerMorphKeyframeAt(start + secondIndex)
    var curveIndex int32 = 0
    while curveIndex < state.CurveCount {
      let firstCurve = asset.PlayerMorphCurveAt(int32(first.TargetCurveStart) + curveIndex)
      let secondCurve = asset.PlayerMorphCurveAt(int32(second.TargetCurveStart) + curveIndex)
      state.Quadratics[curveIndex] = PathQuadratic{
        X0: firstCurve.X0 + (secondCurve.X0 - firstCurve.X0) * progress,
        Y0: firstCurve.Y0 + (secondCurve.Y0 - firstCurve.Y0) * progress,
        CX: firstCurve.CX + (secondCurve.CX - firstCurve.CX) * progress,
        CY: firstCurve.CY + (secondCurve.CY - firstCurve.CY) * progress,
        X1: firstCurve.X1 + (secondCurve.X1 - firstCurve.X1) * progress,
        Y1: firstCurve.Y1 + (secondCurve.Y1 - firstCurve.Y1) * progress,
      }
      curveIndex++
    }
    return state.Path.UpdateNormalized(state.Quadratics, state.CurveCount,
      state.Contours, state.ContourCount)
  }

  private func applyPaint(index int32, elapsed float64) bool {
    let paint = asset.PlayerPaintAt(index)
    if !paint.HasTrack || paint.Kind != VectorPaintKind.Solid {
      return false
    }
    let trackIndex = int32(paint.TrackIndex)
    var value VectorAnimationValue
    if !evaluate(trackIndex, elapsed, false, out value) { return false }
    if paints[index].Initialized && samePlaybackValue(paints[index].Value, value) {
      return false
    }
    paints[index].Value = value
    paints[index].Initialized = true
    let color = Color.FromNormalized(clamp01(value.A), clamp01(value.B),
      clamp01(value.C), clamp01(value.D))
    var changed = false
    if let targets = paintFillTargets[index] {
      var targetIndex int32 = 0
      while targetIndex < targets.Count {
        let nodeIndex = targets[targetIndex]
        if let fill = fills[nodeIndex] {
          if !fill.BackgroundColor.Equals(color) {
            fill.BackgroundColor = color
            changed = true
          }
        }
        targetIndex++
      }
    }
    if let targets = paintStrokeTargets[index] {
      var targetIndex int32 = 0
      while targetIndex < targets.Count {
        let nodeIndex = targets[targetIndex]
        if let outline = strokes[nodeIndex] {
          if !outline.BorderLeftColor.Equals(color) {
            outline.BorderLeftColor = color
            changed = true
          }
        }
        targetIndex++
      }
    }
    return changed
  }

  private func applyStroke(index int32, elapsed float64) bool {
    let stroke = asset.PlayerStrokeAt(index)
    if !stroke.HasTrack { return false }
    let trackIndex = int32(stroke.TrackIndex)
    var value VectorAnimationValue
    if !evaluate(trackIndex, elapsed, true, out value) { return false }
    if strokeValues[index].Initialized && samePlaybackValue(strokeValues[index].Value, value) {
      return false
    }
    strokeValues[index].Value = value
    strokeValues[index].Initialized = true
    var changed = false
    let width = clampNonNegative(value.A)
    let miter = clampNonNegative(value.B)
    let cap = StrokeCap(clampOrdinal(value.C, 0, 2))
    let join = StrokeJoin(clampOrdinal(value.D, 0, 2))
    if let dashes = dynamicDashes[index] {
      if dashes.Offset != float64(value.E) {
        dashes.SetOffset(float64(value.E))
        changed = true
      }
    }
    if let targets = strokeTargets[index] {
      var targetIndex int32 = 0
      while targetIndex < targets.Count {
        let nodeIndex = targets[targetIndex]
        if let node = strokes[nodeIndex] {
          if node.BorderLeftWidth.Value != width {
            node.BorderLeftWidth = Length{ Unit: LengthUnit.Px, Value: width }
            changed = true
          }
          if node.MiterLimit != float64(miter) {
            node.MiterLimit = float64(miter)
            changed = true
          }
          if node.ShapeStrokeCap != cap {
            node.ShapeStrokeCap = cap
            changed = true
          }
          if node.ShapeStrokeJoin != join {
            node.ShapeStrokeJoin = join
            changed = true
          }
        }
        targetIndex++
      }
    }
    return changed
  }

  private func evaluate(index int32, elapsed float64, discrete bool,
    out result VectorAnimationValue) bool{
      result = VectorAnimationValue{}
      if index < 0 || index >= asset.PlaybackTrackCount { return false }
      let track = asset.PlayerTrackAt(index)
      if track.KeyframeCount == 0u { return false }
      let duration = float64(track.Duration)
      let time = trackTime(track, elapsed, duration)
      let start = int32(track.KeyframeStart)
      let count = int32(track.KeyframeCount)
      var segment int32 = 0
      while segment + 1 < count {
        let first = asset.PlayerKeyframeAt(start + segment)
        let second = asset.PlayerKeyframeAt(start + segment + 1)
        if time < float64(second.Time) {
          let span = float64(second.Time - first.Time)
          let progress = span <= 0.0 ? 1.0 : (time - float64(first.Time)) / span
          let eased = easeProgress(first, clamp01f(float32(progress)))
          result = interpolate(first, second, eased, discrete)
          return true
        }
        segment++
      }
      let last = asset.PlayerKeyframeAt(start + count - 1)
      result = VectorAnimationValue{
        A: last.A,
        B: last.B,
        C: last.C,
        D: last.D,
        E: last.E,
        F: last.F,
      }
      return true
    }

  private func trackTime(track VectorAnimationTrack, elapsed float64,
    duration float64) float64{
      if Motion.TimeScale <= 0.0 {
        return duration
      }
      if duration <= 0.0 || elapsed <= duration {
        return elapsed <= 0.0 ? 0.0 : elapsed
      }
      if (track.Flags & VectorAnimationFlags.Loop) == 0u {
        return duration
      }
      let cycle = Math.Floor(elapsed / duration)
      var phase = elapsed - cycle * duration
      if phase < 0.0 { phase = 0.0 }
      if (track.Flags & VectorAnimationFlags.PingPong) != 0u
        && Math.Floor(cycle % 2.0) != 0.0 {
          phase = duration - phase
        }
      return phase
    }

  private func interpolate(first VectorAnimationKeyframe,
    second VectorAnimationKeyframe, progress float32,
    discrete bool) VectorAnimationValue{
      let value = VectorAnimationValue{
        A: first.A + (second.A - first.A) * progress,
        B: first.B + (second.B - first.B) * progress,
        C: discrete ? first.C : first.C + (second.C - first.C) * progress,
        D: discrete ? first.D : first.D + (second.D - first.D) * progress,
        E: first.E + (second.E - first.E) * progress,
        F: first.F + (second.F - first.F) * progress,
      }
      return value
    }

  private func easeProgress(keyframe VectorAnimationKeyframe, progress float32) float32 {
    switch VectorEasingKind(keyframe.Easing) {
      case VectorEasingKind.Step { return 0.0F }
      case VectorEasingKind.Cubic {
        return cubic(keyframe.ControlA, keyframe.ControlB, keyframe.ControlC,
          keyframe.ControlD, progress)
      }
      case _ { return progress }
    }
  }

  private func easeMorphProgress(keyframe VectorAnimationKeyframe,
    progress float32) float32{
      switch VectorEasingKind(keyframe.Easing) {
        case VectorEasingKind.Step { return 0.0F }
        case VectorEasingKind.Cubic {
          return cubic(keyframe.ControlA, keyframe.ControlB, keyframe.ControlC,
            keyframe.ControlD, progress)
        }
        case _ { return progress }
      }
    }

  private func cubic(x1 float32, y1 float32, x2 float32, y2 float32,
    x float32) float32{
      var t = x
      var iteration int32 = 0
      while iteration < 5 {
        let current = cubicValue(t, x1, x2) - x
        let derivative = cubicDerivative(t, x1, x2)
        if MathF.Abs(derivative) < 0.000001F { break }
        t = clamp01f(t - current / derivative)
        iteration++
      }
      var low float32 = 0.0F
      var high float32 = 1.0F
      var binary int32 = 0
      while binary < 8 {
        if cubicValue(t, x1, x2) < x { low = t } else { high = t }
        t = (low + high) * 0.5F
        binary++
      }
      return clamp01f(cubicValue(t, y1, y2))
    }

  private func cubicValue(t float32, p1 float32, p2 float32) float32 {
    let inverse = 1.0F - t
    return 3.0F * inverse * inverse * t * p1
    +3.0F * inverse * t * t * p2 + t * t * t
  }

  private func cubicDerivative(t float32, p1 float32, p2 float32) float32 {
    let inverse = 1.0F - t
    return 3.0F * inverse * inverse * p1
    +6.0F * inverse * t * (p2 - p1) + 3.0F * t * t * (1.0F - p2)
  }

  private func applyMatrix(node Node, value VectorAnimationValue) {
    let transform = VectorAssetAnimation.MatrixTransform(value.A, value.B,
      value.C, value.D, value.E, value.F)
    Transforming.SetTranslateX(node, transform.TranslateX)
    Transforming.SetTranslateY(node, transform.TranslateY)
    Transforming.SetRotate(node, float32(transform.Rotate))
    Transforming.SetScale(node, float32(transform.Scale))
    Transforming.SetScaleX(node, float32(transform.ScaleX))
    Transforming.SetScaleY(node, float32(transform.ScaleY))
    Transforming.SetSkewX(node, float32(transform.SkewX))
    Transforming.SetSkewY(node, float32(transform.SkewY))
  }

  private func samePlaybackValue(left VectorAnimationValue,
    right VectorAnimationValue) bool -> left.A == right.A && left.B == right.B && left.C == right.C
    && left.D == right.D && left.E == right.E && left.F == right.F

  private func clamp01(value float32) float32 {
    if value <= 0.0F { return 0.0F }
    return if value >= 1.0F { 1.0F } else { value }
  }

  private func clamp01f(value float32) float32 {
    if value <= 0.0F { return 0.0F }
    return if value >= 1.0F { 1.0F } else { value }
  }

  private func clampNonNegative(value float32) float32 -> value < 0.0F ? 0.0F : value

  private func clampOrdinal(value float32, minimum int32, maximum int32) int32 {
    let rounded = int32(value + 0.5F)
    if rounded < minimum { return minimum }
    return if rounded > maximum { maximum } else { rounded }
  }
}
