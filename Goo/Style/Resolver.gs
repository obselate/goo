package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices
import System.Threading

internal data struct Transition {
  internal var Field StyleField
  internal var FromA float32
  internal var FromB float32
  internal var FromC float32
  internal var FromD float32
  internal var ToA float32
  internal var ToB float32
  internal var ToC float32
  internal var ToD float32
  internal var FromShadows BoxShadowStack?
  internal var ToShadows BoxShadowStack?
  internal var TargetShadows BoxShadowStack?
  internal var WorkingShadows BoxShadowStack?
  internal var Easing Easing
  internal var Elapsed float64
  internal var Duration float64
}

internal class ResolverDiagnostics {
  shared {
    private var values ConditionalWeakTable[Resolver, DiagnosticOverrideStore]?

    internal func Get(resolver Resolver) DiagnosticOverrideStore? {
      if let existing = values {
        if existing.TryGetValue(resolver, out var value) { return value }
      }
      return nil
    }

    internal func Set(resolver Resolver, value DiagnosticOverrideStore?) {
      values?.Remove(resolver)
      if let next = value {
        if values == nil {
          values = ConditionalWeakTable[Resolver, DiagnosticOverrideStore]()
        }
        values?.Add(resolver, next)
      }
    }
  }
}

internal class Resolver {
  shared {
    private var nextStylePass int64

    private func newStylePass() int64 -> Interlocked.Increment(&nextStylePass)

    private let marginEdges []StyleField = []StyleField{
      StyleField.MarginLeft, StyleField.MarginTop, StyleField.MarginRight, StyleField.MarginBottom }
    private let paddingEdges []StyleField = []StyleField{
      StyleField.PaddingLeft, StyleField.PaddingTop, StyleField.PaddingRight, StyleField.PaddingBottom }
  }

  internal prop Animating List[Node]{ get; init; }
  internal prop DebugOverrides DiagnosticOverrideStore? {
    get -> ResolverDiagnostics.Get(this)
    set(v) -> ResolverDiagnostics.Set(this, v)
  }
  internal prop PaintResourceInvalidated Action? { get; set; }
  internal prop ShaderEffectInvalidated Action? { get; set; }
  private let pending List[Node]
  private let inheritedScratch []StyleEntry
  private var pendingCursor int32
  private var stylePass int64
  internal var VisualDirty bool
  private var pendingEffects ReconcileEffects
  internal init() {
    Animating = List[Node]()
    pending = List[Node]()
    inheritedScratch = [StyleFields.InheritableFields.Length]StyleEntry
  }

  internal func Invalidate(n Node, initial bool) {
    queue(n)
    n.StylePendingSelf = true
    if initial {
      n.StylePendingInitial = true
    }
  }

  internal func Flush() int64 {
    var visits int64 = 0
    try {
      while pendingCursor < pending.Count {
        visits = visits + resolvePending(pending[pendingCursor])
        pendingCursor++
      }
    } finally {
      pending.Clear()
      pendingCursor = 0
    }
    return visits
  }

  internal func FlushEffects() ReconcileEffects {
    let result = pendingEffects
    pendingEffects = ReconcileEffects.None
    return result
  }

  internal func DiscardPending() {
    pending.Clear()
    pendingCursor = 0
    pendingEffects = ReconcileEffects.None
  }

  private func queue(n Node) {
    if pending.Count == 0 {
      stylePass = newStylePass()
    }
    if n.StyleQueuedPass == stylePass {
      return
    }
    n.StyleQueuedPass = stylePass
    n.StylePendingSelf = false
    n.StylePendingInitial = false
    n.StylePendingInheritedMask = StyleMask{}
    pending.Add(n)
  }

  private func invalidateInherited(n Node, fields StyleMask) {
    if styleMaskEmpty(fields) {
      return
    }
    queue(n)
    n.StylePendingInheritedMask = styleMaskUnion(n.StylePendingInheritedMask, fields)
  }

  private func resolvePending(n Node) int64 {
    if n.StyleResolvedPass == stylePass {
      return 0
    }
    if n.Retired {
      n.StyleResolvedPass = stylePass
      return 0
    }
    var visits int64 = 0
    if let parent = n.Parent {
      if parent.StyleQueuedPass == stylePass && parent.StyleResolvedPass != stylePass {
        visits = visits + resolvePending(parent)
      }
    }
    let self = n.StylePendingSelf
    let initial = n.StylePendingInitial
    let inherited = n.StylePendingInheritedMask
    n.StylePendingSelf = false
    n.StylePendingInitial = false
    n.StylePendingInheritedMask = StyleMask{}
    if !self && styleMaskEmpty(styleMaskExcept(inherited, n.LocalMask)) {
      n.StyleResolvedPass = stylePass
      return visits
    }
    var changed = StyleMask{}
    if n.Children.Count == 0 {
      resolveNode(n, initial)
    } else {
      changed = resolveNodeChanged(n, initial)
    }
    n.StyleResolvedPass = stylePass
    if !styleMaskEmpty(changed) {
      for i in 0 ... n.Children.Count {
        invalidateInherited(n.Children[i], changed)
      }
    }
    return visits + 1
  }

  private func resolveNodeChanged(n Node, initial bool) StyleMask {
    for i in 0 ... StyleFields.InheritableFields.Length {
      inheritedScratch[i] = readField(n, StyleFields.InheritableFields[i])
    }
    resolveNode(n, initial)
    var changed = StyleMask{}
    for i in 0 ... StyleFields.InheritableFields.Length {
      changed = changedField(changed, inheritedScratch[i], n,
        StyleFields.InheritableFields[i])
    }
    return changed
  }

  private func changedField(mask StyleMask, before StyleEntry, n Node, field StyleField) StyleMask {
    if sameStyleEntry(before, readField(n, field)) {
      return mask
    }
    return styleMaskWith(mask, field)
  }

  private func resolveNode(n Node, initial bool) {
    writeField(n, StyleEntry{ Field: StyleField.Direction,
      A: float32(int32(effectiveDirection(n))) }, initial)
    var localMask = StyleMask{}
    // Higher active layers shadow lower entries before transition retargeting.
    let hoverMask = !n.Disabled && n.Hovered ? fieldsMask(n, n.HoverStyle) : StyleMask{}
    let focusMask = !n.Disabled && n.Focused ? fieldsMask(n, n.FocusStyle) : StyleMask{}
    let pressMask = !n.Disabled && n.Pressed ? fieldsMask(n, n.ActiveStyle) : StyleMask{}
    let disabledMask = n.Disabled ? fieldsMask(n, n.DisabledStyle) : StyleMask{}
    let allStateMasks = styleMaskUnion(styleMaskUnion(hoverMask, focusMask),
      styleMaskUnion(pressMask, disabledMask))
    localMask = applyList(n, n.BaseStyle, localMask, initial, allStateMasks)
    if !n.Disabled && n.Hovered {
      localMask = applyList(n, n.HoverStyle, localMask, initial, styleMaskUnion(focusMask, pressMask))
    }
    if !n.Disabled && n.Focused {
      localMask = applyList(n, n.FocusStyle, localMask, initial, pressMask)
    }
    if !n.Disabled && n.Pressed {
      localMask = applyList(n, n.ActiveStyle, localMask, initial, StyleMask{})
    }
    if n.Disabled {
      localMask = applyList(n, n.DisabledStyle, localMask, initial, StyleMask{})
    }
    n.LocalMask = localMask
    let inheritedMask = applyInherited(n, localMask, initial)
    let mask = styleMaskUnion(localMask, inheritedMask)
    let gone = styleMaskExcept(n.AppliedMask, mask)
    if !styleMaskEmpty(gone) {
      for i in 0 ... StyleFields.Count {
        let f = StyleField(int32(i))
        if styleMaskHas(gone, f) {
          writeField(n, defaultStyleEntry(f), initial)
        }
      }
    }
    n.AppliedMask = mask
    n.AppliedMask = styleMaskUnion(n.AppliedMask, applyDebugOverrides(this, n))
  }

  internal func applyInherited(n Node, localMask StyleMask, initial bool) StyleMask {
    guard let parent = n.Parent else { return StyleMask{} }
    var mask = StyleMask{}
    for f in StyleFields.InheritableFields {
      mask = inherit(n, parent, localMask, mask, f, initial)
    }
    return mask
  }

  internal func inherit(n Node, parent Node, localMask StyleMask, inheritedMask StyleMask, f StyleField, initial bool) StyleMask {
    if styleMaskHas(localMask, f) {
      return inheritedMask
    }
    writeField(n, readField(parent, f), initial)
    return styleMaskWith(inheritedMask, f)
  }

  internal func fieldsMask(n Node, entries StyleEntries?) StyleMask {
    guard let list = entries else { return StyleMask{} }
    var m = StyleMask{}
    for i in 0 ... list.Count {
      let field = list.At(i).Field
      if !styleFieldApplies(n, field) { continue }
      if field == StyleField.Margin {
        m = styleMaskWithBoxEdges(m, marginEdges)
      } else if field == StyleField.Padding {
        m = styleMaskWithBoxEdges(m, paddingEdges)
      } else {
        m = styleMaskWith(m, styleFieldForNode(n, field))
      }
    }
    return m
  }

  private func styleMaskWithBoxEdges(mask StyleMask, edges []StyleField) StyleMask {
    var m = mask
    for f in edges {
      m = styleMaskWith(m, f)
    }
    return m
  }

  internal func applyList(n Node, entries StyleEntries?, mask StyleMask, initial bool, shadow StyleMask) StyleMask {
    guard let list = entries else { return mask }
    var m = mask
    for i in 0 ... list.Count {
      var e = list.At(i)
      let logical = isLogicalStyleField(e.Field)
      if !styleFieldApplies(n, e.Field) {
        continue
      }
      if e.Field == StyleField.Direction {
        m = styleMaskWith(m, StyleField.Direction)
        continue
      }
      if e.Field == StyleField.Margin {
        m = applyCanonicalBoxEdges(n, e, m, initial, shadow, marginEdges)
        continue
      }
      if e.Field == StyleField.Padding {
        m = applyCanonicalBoxEdges(n, e, m, initial, shadow, paddingEdges)
        continue
      }
      e.Field = styleFieldForNode(n, e.Field)
      m = styleMaskWith(m, e.Field)
      if !styleMaskHas(shadow, e.Field) {
        writeField(n, e, initial || logical)
      }
    }
    return m
  }

  private func applyCanonicalBoxEdges(n Node, source StyleEntry, mask StyleMask,
    initial bool, shadow StyleMask, edges []StyleField) StyleMask{
      var m = mask
      for f in edges {
        m = applyCanonicalBoxEdge(n, source, m, initial, shadow, f)
      }
      return m
    }

  private func applyCanonicalBoxEdge(n Node, source StyleEntry, mask StyleMask,
    initial bool, shadow StyleMask, field StyleField) StyleMask{
      var e = source
      e.Field = field
      let m = styleMaskWith(mask, field)
      if !styleMaskHas(shadow, field) {
        writeField(n, e, initial)
      }
      return m
    }

  internal func styleFieldForNode(n Node, f StyleField) StyleField {
    if isLogicalStyleField(f) {
      let rtl = n.Direction == Direction.RightToLeft
      return switch f {
        case StyleField.MarginStart: rtl ? StyleField.MarginRight : StyleField.MarginLeft
        case StyleField.MarginEnd: rtl ? StyleField.MarginLeft : StyleField.MarginRight
        case StyleField.PaddingStart: rtl ? StyleField.PaddingRight : StyleField.PaddingLeft
        case StyleField.PaddingEnd: rtl ? StyleField.PaddingLeft : StyleField.PaddingRight
        case StyleField.Start: rtl ? StyleField.Right : StyleField.Left
        case StyleField.End: rtl ? StyleField.Left : StyleField.Right
        case StyleField.BorderStartWidth: rtl ? StyleField.BorderRightWidth : StyleField.BorderLeftWidth
        case StyleField.BorderEndWidth: rtl ? StyleField.BorderLeftWidth : StyleField.BorderRightWidth
        case StyleField.BorderStartColor: rtl ? StyleField.BorderRightColor : StyleField.BorderLeftColor
        case StyleField.BorderEndColor: rtl ? StyleField.BorderLeftColor : StyleField.BorderRightColor
        case _: throw NotSupportedException("styleFieldForNode: unhandled logical StyleField")
      }
    }
    if n.Kind != NodeKind.Shape {
      if f == StyleField.ShapeStrokeWidth { return StyleField.BorderLeftWidth }
      if f == StyleField.ShapeStrokeColor { return StyleField.BorderLeftColor }
    }
    return f
  }

  private func effectiveDirection(n Node) Direction {
    var result = if let parent = n.Parent { parent.Direction } else { Direction.Auto }
    result = declaredDirection(n.BaseStyle, result)
    if !n.Disabled && n.Hovered { result = declaredDirection(n.HoverStyle, result) }
    if !n.Disabled && n.Focused { result = declaredDirection(n.FocusStyle, result) }
    if !n.Disabled && n.Pressed { result = declaredDirection(n.ActiveStyle, result) }
    if n.Disabled { result = declaredDirection(n.DisabledStyle, result) }
    return result
  }

  private func declaredDirection(entries StyleEntries?, fallback Direction) Direction {
    guard let list = entries else { return fallback }
    var result = fallback
    for i in 0 ... list.Count {
      let entry = list.At(i)
      if entry.Field == StyleField.Direction {
        result = Direction(int32(entry.A))
      }
    }
    return result
  }

  // Direct write on initial resolve, non-animatable fields, or when transitions
  // are off; otherwise starts (or retargets) a lerp from the displayed value.
  internal func writeField(n Node, e StyleEntry, initial bool) {
    if !styleFieldApplies(n, e.Field) {
      finishTransition(n, e.Field)
      return
    }
    if e.Field == StyleField.BoxShadows {
      writeBoxShadows(n, e, initial)
      return
    }
    let cur = readField(n, e.Field)
    if sameStyleEntry(cur, e) {
      finishTransition(n, e.Field)
      return
    }
    if initial || n.TransitionMs <= 0.0 || !lerpable(e.Field)
      || !transitionSelected(n.TransitionSelection, e.Field)
      || (fieldKind(e.Field) == FieldKind.KLength && cur.B != e.B) {
        finishTransition(n, e.Field)
        if writeDirectWithInvalidation(n, e, invalidationFor(e.Field)) {
          recordResolvedChange(e.Field)
        }
        return
      }
    startOrRetarget(n, e, cur)
  }

  internal func writeBoxShadows(n Node, e StyleEntry, initial bool) {
    let cur = readField(n, StyleField.BoxShadows)
    if sameStyleEntry(cur, e) {
      finishTransition(n, StyleField.BoxShadows)
      return
    }
    if initial || n.TransitionMs <= 0.0
      || !transitionSelected(n.TransitionSelection, StyleField.BoxShadows)
      || !boxShadowListsCompatible(entryShadows(cur), entryShadows(e)) {
        finishTransition(n, StyleField.BoxShadows)
        if writeDirectWithInvalidation(n, e, PaintResourceInvalidated) {
          recordResolvedChange(StyleField.BoxShadows)
        }
        return
      }
    startOrRetargetBoxShadows(n, e, cur)
  }

  internal func startOrRetarget(n Node, e StyleEntry, cur StyleEntry) {
    if n.Transitions == nil {
      n.Transitions = List[Transition]()
    }
    guard let unwrapped = n.Transitions else {
      return
    }
    let list = unwrapped
    for i in 0 ... list.Count {
      if list[i].Field == e.Field {
        if list[i].ToA == e.A && list[i].ToB == e.B && list[i].ToC == e.C && list[i].ToD == e.D {
          return
        }
        list[i] = Transition{ Field: e.Field,
          FromA: cur.A, FromB: cur.B, FromC: cur.C, FromD: cur.D,
          ToA: e.A, ToB: e.B, ToC: e.C, ToD: e.D,
          Easing: n.TransitionEasing,
          Elapsed: -n.TransitionDelayMs / 1000.0, Duration: n.TransitionMs / 1000.0 }
        return
      }
    }
    list.Add(Transition{ Field: e.Field,
      FromA: cur.A, FromB: cur.B, FromC: cur.C, FromD: cur.D,
      ToA: e.A, ToB: e.B, ToC: e.C, ToD: e.D,
      Easing: n.TransitionEasing,
      Elapsed: -n.TransitionDelayMs / 1000.0, Duration: n.TransitionMs / 1000.0 })
    if !containsAnimating(n) { Animating.Add(n) }
  }

  internal func startOrRetargetBoxShadows(n Node, e StyleEntry, cur StyleEntry) {
    if n.Transitions == nil {
      n.Transitions = List[Transition]()
    }
    guard let unwrapped = n.Transitions else {
      return
    }
    let list = unwrapped
    for i in 0 ... list.Count {
      if list[i].Field == StyleField.BoxShadows {
        if sameBoxShadows(list[i].TargetShadows, entryShadows(e)) {
          return
        }
        list[i] = makeBoxShadowTransition(entryShadows(cur), entryShadows(e),
          n.TransitionEasing, n.TransitionMs / 1000.0, n.TransitionDelayMs / 1000.0)
        return
      }
    }
    list.Add(makeBoxShadowTransition(entryShadows(cur), entryShadows(e),
      n.TransitionEasing, n.TransitionMs / 1000.0, n.TransitionDelayMs / 1000.0))
    if !containsAnimating(n) { Animating.Add(n) }
  }

  internal func containsAnimating(n Node) bool {
    for i in 0 ... Animating.Count {
      if Animating[i] == n { return true }
    }
    return false
  }

  internal func finishTransition(n Node, f StyleField) bool {
    guard let list = n.Transitions else {
      return false
    }
    for i in 0 ... list.Count {
      if list[i].Field == f {
        list.RemoveAt(i)
        return true
      }
    }
    return false
  }

  internal func Advance(dt float64) {
    for var ni = Animating.Count; ni > 0; ni-- {
      let n = Animating[ni - 1]
      if n.Retired {
        Animating.RemoveAt(ni - 1)
        continue
      }
      guard let unwrapped = n.Transitions else {
        Animating.RemoveAt(ni - 1)
        continue
      }
      let list = unwrapped
      for var ti = list.Count; ti > 0; ti-- {
        var tr = list[ti - 1]
        tr.Elapsed = tr.Elapsed + dt
        if tr.Elapsed <= 0.0 {
          list[ti - 1] = tr
          continue
        }
        let t = tr.Duration <= 0.0 ? 1.0 : Math.Min(1.0, tr.Elapsed / tr.Duration)
        let ft = float32(ease(tr.Easing, t))
        if tr.Field == StyleField.BoxShadows {
          guard let from = tr.FromShadows, let to = tr.ToShadows, let work = tr.WorkingShadows else {
            list.RemoveAt(ti - 1)
            continue
          }
          lerpBoxShadows(from, to, work, ft)
          n.BoxShadows = t >= 1.0 ? tr.TargetShadows : work
          recordResolvedChange(StyleField.BoxShadows)
        } else {
          if writeDirectWithInvalidation(n, interpolatedTransitionEntry(tr, ft), PaintResourceInvalidated) {
            recordResolvedChange(tr.Field)
          }
        }
        if inheritable(tr.Field) {
          propagateInherited(n, tr.Field)
        }
        if t >= 1.0 {
          list.RemoveAt(ti - 1)
        } else {
          list[ti - 1] = tr
        }
      }
      if list.Count == 0 { Animating.RemoveAt(ni - 1) }
    }
  }

  private func interpolatedTransitionEntry(tr Transition, t float32) StyleEntry {
    if fieldKind(tr.Field) != FieldKind.KColor {
      return StyleEntry{ Field: tr.Field,
        A: tr.FromA + (tr.ToA - tr.FromA) * t,
        B: tr.FromB + (tr.ToB - tr.FromB) * t,
        C: tr.FromC + (tr.ToC - tr.FromC) * t,
        D: tr.FromD + (tr.ToD - tr.FromD) * t }
    }
    let fromWeight = tr.FromD * (1.0F - t)
    let toWeight = tr.ToD * t
    let alpha = fromWeight + toWeight
    if alpha <= 0.0F {
      return StyleEntry{ Field: tr.Field,
        A: tr.FromA + (tr.ToA - tr.FromA) * t,
        B: tr.FromB + (tr.ToB - tr.FromB) * t,
        C: tr.FromC + (tr.ToC - tr.FromC) * t,
        D: 0.0F }
    }
    return StyleEntry{ Field: tr.Field,
      A: (tr.FromA * fromWeight + tr.ToA * toWeight) / alpha,
      B: (tr.FromB * fromWeight + tr.ToB * toWeight) / alpha,
      C: (tr.FromC * fromWeight + tr.ToC * toWeight) / alpha,
      D: alpha }
  }

  internal func propagateInherited(parent Node, f StyleField) {
    for i in 0 ... parent.Children.Count {
      let child = parent.Children[i]
      if styleMaskHas(child.LocalMask, f) {
        continue
      }
      if let store = DebugOverrides {
        if let state = store.State(child) {
          if state.Values.ContainsKey(f) { continue }
        }
      }
      finishTransition(child, f)
      if writeDirectWithInvalidation(child, readField(parent, f), PaintResourceInvalidated) {
        recordResolvedChange(f)
      }
      propagateInherited(child, f)
    }
  }

  private func recordResolvedChange(f StyleField) {
    pendingEffects = ReconcileEffects(int32(pendingEffects) | int32(styleEffects(f)))
    VisualDirty = true
  }

  internal func FinishDebugTransition(n Node, f StyleField) {
    finishTransition(n, f)
  }

  internal func RecordDebugResolvedChange(f StyleField) {
    recordResolvedChange(f)
  }

  internal func PropagateDebugInheritance(n Node, f StyleField) {
    propagateInherited(n, f)
  }

  private func invalidationFor(f StyleField) Action ? -> if f == StyleField.ShaderEffect { ShaderEffectInvalidated }
  else { PaintResourceInvalidated }
}

internal func styleFieldApplies(n Node, f StyleField) bool ->
n.Kind != NodeKind.Shape || !StyleFields.Has(f, StyleFieldFlags.ShapeExcluded)

internal func isLogicalStyleField(f StyleField) bool -> StyleFields.Has(f, StyleFieldFlags.Logical)

internal func makeBoxShadowTransition(from BoxShadowStack?, target BoxShadowStack?,
  easing Easing, duration float64, delay float64) Transition{
    let count = Math.Max(boxShadowCount(from), boxShadowCount(target))
    return Transition{
      Field: StyleField.BoxShadows,
      FromShadows: paddedBoxShadows(from, target, count),
      ToShadows: paddedBoxShadows(target, from, count),
      TargetShadows: target,
      WorkingShadows: newBoxShadowWork(count),
      Easing: easing,
      Elapsed: -delay,
      Duration: duration,
    }
  }

// Quadratic curves: raw progress in, shaped progress out.
internal func ease(e Easing, t float64) float64 {
  if e == Easing.EaseIn { return t * t }
  if e == Easing.EaseOut { return 1.0 - (1.0 - t) * (1.0 - t) }
  if e == Easing.EaseInOut {
    return t < 0.5 ? 2.0 * t * t : 1.0 - (1.0 - t) * (1.0 - t) * 2.0
  }
  return t
}

// Paint effects without public transition selectors stay discrete.
internal func lerpable(f StyleField) bool -> StyleFields.Has(f, StyleFieldFlags.Lerpable)

internal func inheritable(f StyleField) bool -> StyleFields.Has(f, StyleFieldFlags.Inheritable)

internal func writeDirect(n Node, e StyleEntry) bool -> writeDirectWithInvalidation(n, e, nil)

internal func writeDirectWithInvalidation(n Node, e StyleEntry, invalidated Action?) bool {
  if !styleFieldApplies(n, e.Field) {
    return false
  }
  if sameStyleEntry(readField(n, e.Field), e) {
    return false
  }
  let tracksText = (n.Kind == NodeKind.Text || n.Kind == NodeKind.Editor)
    && TextLayouts.IsShapingField(e.Field)
  switch e.Field {
    case StyleField.Direction { n.Direction = Direction(int32(e.A)) }
    case StyleField.Width { n.Width = Length{ Unit: LengthUnit(int32(e.B)), Value: e.A } }
    case StyleField.Height { n.Height = Length{ Unit: LengthUnit(int32(e.B)), Value: e.A } }
    case StyleField.MinWidth { n.MinWidth = Length{ Unit: LengthUnit(int32(e.B)), Value: e.A } }
    case StyleField.MinHeight { n.MinHeight = Length{ Unit: LengthUnit(int32(e.B)), Value: e.A } }
    case StyleField.MaxWidth { n.MaxWidth = Length{ Unit: LengthUnit(int32(e.B)), Value: e.A } }
    case StyleField.MaxHeight { n.MaxHeight = Length{ Unit: LengthUnit(int32(e.B)), Value: e.A } }
    case StyleField.AspectRatio { n.AspectRatio = float64(e.A) }
    case StyleField.Padding { n.Padding = Length{ Unit: LengthUnit(int32(e.B)), Value: e.A } }
    case StyleField.PaddingLeft { n.PaddingLeft = Length{ Unit: LengthUnit(int32(e.B)), Value: e.A } }
    case StyleField.PaddingTop { n.PaddingTop = Length{ Unit: LengthUnit(int32(e.B)), Value: e.A } }
    case StyleField.PaddingRight { n.PaddingRight = Length{ Unit: LengthUnit(int32(e.B)), Value: e.A } }
    case StyleField.PaddingBottom { n.PaddingBottom = Length{ Unit: LengthUnit(int32(e.B)), Value: e.A } }
    case StyleField.Margin { n.Margin = Length{ Unit: LengthUnit(int32(e.B)), Value: e.A } }
    case StyleField.MarginLeft { n.MarginLeft = Length{ Unit: LengthUnit(int32(e.B)), Value: e.A } }
    case StyleField.MarginTop { n.MarginTop = Length{ Unit: LengthUnit(int32(e.B)), Value: e.A } }
    case StyleField.MarginRight { n.MarginRight = Length{ Unit: LengthUnit(int32(e.B)), Value: e.A } }
    case StyleField.MarginBottom { n.MarginBottom = Length{ Unit: LengthUnit(int32(e.B)), Value: e.A } }
    case StyleField.Gap { n.Gap = Length{ Unit: LengthUnit(int32(e.B)), Value: e.A } }
    case StyleField.RowGap { n.RowGap = Length{ Unit: LengthUnit(int32(e.B)), Value: e.A } }
    case StyleField.ColumnGap { n.ColumnGap = Length{ Unit: LengthUnit(int32(e.B)), Value: e.A } }
    case StyleField.FlexDirection { n.FlexDirection = FlexDirection(int32(e.A)) }
    case StyleField.FlexWrap { n.FlexWrap = FlexWrap(int32(e.A)) }
    case StyleField.JustifyContent { n.JustifyContent = JustifyContent(int32(e.A)) }
    case StyleField.AlignItems { n.AlignItems = AlignItems(int32(e.A)) }
    case StyleField.AlignSelf { n.AlignSelf = AlignSelf(int32(e.A)) }
    case StyleField.AlignContent { n.AlignContent = AlignContent(int32(e.A)) }
    case StyleField.FlexGrow { n.FlexGrow = float64(e.A) }
    case StyleField.FlexShrink { n.FlexShrink = float64(e.A) }
    case StyleField.FlexBasis { n.FlexBasis = Length{ Unit: LengthUnit(int32(e.B)), Value: e.A } }
    case StyleField.Position { n.Position = PositionType(int32(e.A)) }
    case StyleField.Left { n.Left = Length{ Unit: LengthUnit(int32(e.B)), Value: e.A } }
    case StyleField.Top { n.Top = Length{ Unit: LengthUnit(int32(e.B)), Value: e.A } }
    case StyleField.Right { n.Right = Length{ Unit: LengthUnit(int32(e.B)), Value: e.A } }
    case StyleField.Bottom { n.Bottom = Length{ Unit: LengthUnit(int32(e.B)), Value: e.A } }
    case StyleField.Display { n.Display = Display(int32(e.A)) }
    case StyleField.Visibility { n.Visibility = Visibility(int32(e.A)) }
    case StyleField.BorderStyle { n.BorderStyle = BorderStyle(int32(e.A)) }
    case StyleField.BlendMode { n.BlendMode = BlendMode(int32(e.A)) }
    case StyleField.OverflowX {
      let next = Overflow(int32(e.A))
      if next != n.OverflowX {
        n.OverflowX = next
        ScrollTopology.Version = ScrollTopology.Version + 1
      }
    }
    case StyleField.OverflowY {
      let next = Overflow(int32(e.A))
      if next != n.OverflowY {
        n.OverflowY = next
        ScrollTopology.Version = ScrollTopology.Version + 1
      }
    }
    case StyleField.BackgroundColor { n.BackgroundColor = Color.FromNormalized(e.A, e.B, e.C, e.D) }
    case StyleField.BackgroundGradient { n.BackgroundGradient = entryGradient(e) }
    case StyleField.BackgroundImage { BackgroundImageLayouts.SetPath(n, entryText(e) ?? "", invalidated) }
    case StyleField.BackgroundImageSource { BackgroundImageLayouts.SetSource(n, entryImageSource(e), invalidated) }
    case StyleField.ShaderEffect { ShaderEffectStyles.Set(n, entryShaderEffect(e), invalidated) }
    case StyleField.BackgroundImageFit { n.BackgroundImageFit = ImageFit(int32(e.A)) }
    case StyleField.ClipPath { ClipPaths.SetPath(n, entryPath(e)) }
    case StyleField.ClipPathFit { ClipPaths.SetFit(n, ShapeFit(int32(e.A))) }
    case StyleField.ClipPathFillRule { ClipPaths.SetFillRule(n, FillRule(int32(e.A))) }
    case StyleField.BorderRadius { n.BorderRadius = Length{ Unit: LengthUnit(int32(e.B)), Value: e.A } }
    case StyleField.BorderTopLeftRadius { n.BorderTopLeftRadius = Length{ Unit: LengthUnit(int32(e.B)), Value: e.A } }
    case StyleField.BorderTopRightRadius { n.BorderTopRightRadius = Length{ Unit: LengthUnit(int32(e.B)), Value: e.A } }
    case StyleField.BorderBottomLeftRadius { n.BorderBottomLeftRadius = Length{ Unit: LengthUnit(int32(e.B)), Value: e.A } }
    case StyleField.BorderBottomRightRadius { n.BorderBottomRightRadius = Length{ Unit: LengthUnit(int32(e.B)), Value: e.A } }
    case StyleField.BorderLeftWidth { n.BorderLeftWidth = Length{ Unit: LengthUnit(int32(e.B)), Value: e.A } }
    case StyleField.BorderTopWidth { n.BorderTopWidth = Length{ Unit: LengthUnit(int32(e.B)), Value: e.A } }
    case StyleField.BorderRightWidth { n.BorderRightWidth = Length{ Unit: LengthUnit(int32(e.B)), Value: e.A } }
    case StyleField.BorderBottomWidth { n.BorderBottomWidth = Length{ Unit: LengthUnit(int32(e.B)), Value: e.A } }
    case StyleField.BorderLeftColor { n.BorderLeftColor = Color.FromNormalized(e.A, e.B, e.C, e.D) }
    case StyleField.BorderTopColor { n.BorderTopColor = Color.FromNormalized(e.A, e.B, e.C, e.D) }
    case StyleField.BorderRightColor { n.BorderRightColor = Color.FromNormalized(e.A, e.B, e.C, e.D) }
    case StyleField.BorderBottomColor { n.BorderBottomColor = Color.FromNormalized(e.A, e.B, e.C, e.D) }
    case StyleField.ShapeStrokeWidth { n.BorderLeftWidth = Length{ Unit: LengthUnit(int32(e.B)), Value: e.A } }
    case StyleField.ShapeStrokeColor { n.BorderLeftColor = Color.FromNormalized(e.A, e.B, e.C, e.D) }
    case StyleField.OutlineWidth { n.OutlineWidth = Length{ Unit: LengthUnit(int32(e.B)), Value: e.A } }
    case StyleField.OutlineColor { n.OutlineColor = Color.FromNormalized(e.A, e.B, e.C, e.D) }
    case StyleField.OutlineOffset { n.OutlineOffset = Length{ Unit: LengthUnit(int32(e.B)), Value: e.A } }
    case StyleField.Opacity { n.Opacity = float64(e.A) }
    case StyleField.BoxShadows { n.BoxShadows = entryShadows(e) }
    case StyleField.TextShadows { n.TextShadows = entryShadows(e) }
    case StyleField.TextStrokeWidth {
      n.TextStrokeWidth = Length{ Unit: LengthUnit(int32(e.B)), Value: e.A }
    }
    case StyleField.TextStrokeColor {
      n.TextStrokeColor = Color.FromNormalized(e.A, e.B, e.C, e.D)
    }
    case StyleField.FontSize { n.FontSize = Length{ Unit: LengthUnit(int32(e.B)), Value: e.A } }
    case StyleField.Color { n.Color = Color.FromNormalized(e.A, e.B, e.C, e.D) }
    case StyleField.FontFamily { n.FontFamily = entryText(e) ?? "" }
    case StyleField.FontWeight { n.FontWeight = float64(e.A) }
    case StyleField.FontStyle { n.FontStyle = FontStyle(int32(e.A)) }
    case StyleField.LetterSpacing { n.LetterSpacing = Length{ Unit: LengthUnit(int32(e.B)), Value: e.A } }
    case StyleField.LineHeight { n.LineHeight = float64(e.A) }
    case StyleField.TextAlign { n.TextAlign = TextAlign(int32(e.A)) }
    case StyleField.TextDecoration { n.TextDecoration = TextDecoration(int32(e.A)) }
    case StyleField.TextWrap { n.TextWrap = TextWrap(int32(e.A)) }
    case StyleField.TextTrimming { n.TextTrimming = TextTrimming(int32(e.A)) }
    case StyleField.TextMaxLines { n.TextMaxLines = (int32(e.A) << 16) | int32(e.B) }
    case StyleField.TextTransform { n.TextTransform = TextTransform(int32(e.A)) }
    case StyleField.Cursor { n.Cursor = Cursor(int32(e.A)) }
    case StyleField.TransformTranslateX {
      Transforming.SetTranslateX(n, Length{ Unit: LengthUnit(int32(e.B)), Value: e.A })
    }
    case StyleField.TransformTranslateY {
      Transforming.SetTranslateY(n, Length{ Unit: LengthUnit(int32(e.B)), Value: e.A })
    }
    case StyleField.TransformRotate { Transforming.SetRotate(n, e.A) }
    case StyleField.TransformScale { Transforming.SetScale(n, e.A) }
    case StyleField.TransformScaleX { Transforming.SetScaleX(n, e.A) }
    case StyleField.TransformScaleY { Transforming.SetScaleY(n, e.A) }
    case StyleField.TransformSkewX { Transforming.SetSkewX(n, e.A) }
    case StyleField.TransformSkewY { Transforming.SetSkewY(n, e.A) }
    case StyleField.TransformOriginX {
      Transforming.SetOriginX(n, Length{ Unit: LengthUnit(int32(e.B)), Value: e.A })
    }
    case StyleField.TransformOriginY {
      Transforming.SetOriginY(n, Length{ Unit: LengthUnit(int32(e.B)), Value: e.A })
    }
    case StyleField.ZIndex {
      n.ZIndex = (int32(e.A) << 16) | int32(e.B)
    }
    default { throw NotSupportedException("writeDirect: unhandled StyleField") }
  }
  if tracksText {
    if n.Kind == NodeKind.Editor {
      TextEditorLayouts.Invalidate(n)
    } else {
      TextLayouts.Invalidate(n)
    }
  }
  n.BumpScenePaintVersion()
  syncYogaField(n, e.Field)
  return true
}

// The reverse of writeDirect: node field -> packed StyleEntry, same slot rules.
internal func readField(n Node, f StyleField) StyleEntry {
  switch f {
    case StyleField.Direction { return StyleEntry{ Field: f, A: float32(int32(n.Direction)) } }
    case StyleField.Width { return StyleEntry{ Field: f, A: n.Width.Value, B: float32(int32(n.Width.Unit)) } }
    case StyleField.Height { return StyleEntry{ Field: f, A: n.Height.Value, B: float32(int32(n.Height.Unit)) } }
    case StyleField.MinWidth { return StyleEntry{ Field: f, A: n.MinWidth.Value, B: float32(int32(n.MinWidth.Unit)) } }
    case StyleField.MinHeight { return StyleEntry{ Field: f, A: n.MinHeight.Value, B: float32(int32(n.MinHeight.Unit)) } }
    case StyleField.MaxWidth { return StyleEntry{ Field: f, A: n.MaxWidth.Value, B: float32(int32(n.MaxWidth.Unit)) } }
    case StyleField.MaxHeight { return StyleEntry{ Field: f, A: n.MaxHeight.Value, B: float32(int32(n.MaxHeight.Unit)) } }
    case StyleField.AspectRatio { return StyleEntry{ Field: f, A: float32(n.AspectRatio) } }
    case StyleField.Padding { return StyleEntry{ Field: f, A: n.Padding.Value, B: float32(int32(n.Padding.Unit)) } }
    case StyleField.PaddingLeft { return StyleEntry{ Field: f, A: n.PaddingLeft.Value, B: float32(int32(n.PaddingLeft.Unit)) } }
    case StyleField.PaddingTop { return StyleEntry{ Field: f, A: n.PaddingTop.Value, B: float32(int32(n.PaddingTop.Unit)) } }
    case StyleField.PaddingRight { return StyleEntry{ Field: f, A: n.PaddingRight.Value, B: float32(int32(n.PaddingRight.Unit)) } }
    case StyleField.PaddingBottom { return StyleEntry{ Field: f, A: n.PaddingBottom.Value, B: float32(int32(n.PaddingBottom.Unit)) } }
    case StyleField.Margin { return StyleEntry{ Field: f, A: n.Margin.Value, B: float32(int32(n.Margin.Unit)) } }
    case StyleField.MarginLeft { return StyleEntry{ Field: f, A: n.MarginLeft.Value, B: float32(int32(n.MarginLeft.Unit)) } }
    case StyleField.MarginTop { return StyleEntry{ Field: f, A: n.MarginTop.Value, B: float32(int32(n.MarginTop.Unit)) } }
    case StyleField.MarginRight { return StyleEntry{ Field: f, A: n.MarginRight.Value, B: float32(int32(n.MarginRight.Unit)) } }
    case StyleField.MarginBottom { return StyleEntry{ Field: f, A: n.MarginBottom.Value, B: float32(int32(n.MarginBottom.Unit)) } }
    case StyleField.Gap { return StyleEntry{ Field: f, A: n.Gap.Value, B: float32(int32(n.Gap.Unit)) } }
    case StyleField.RowGap { return StyleEntry{ Field: f, A: n.RowGap.Value, B: float32(int32(n.RowGap.Unit)) } }
    case StyleField.ColumnGap { return StyleEntry{ Field: f, A: n.ColumnGap.Value, B: float32(int32(n.ColumnGap.Unit)) } }
    case StyleField.FlexDirection { return StyleEntry{ Field: f, A: float32(int32(n.FlexDirection)) } }
    case StyleField.FlexWrap { return StyleEntry{ Field: f, A: float32(int32(n.FlexWrap)) } }
    case StyleField.JustifyContent { return StyleEntry{ Field: f, A: float32(int32(n.JustifyContent)) } }
    case StyleField.AlignItems { return StyleEntry{ Field: f, A: float32(int32(n.AlignItems)) } }
    case StyleField.AlignSelf { return StyleEntry{ Field: f, A: float32(int32(n.AlignSelf)) } }
    case StyleField.AlignContent { return StyleEntry{ Field: f, A: float32(int32(n.AlignContent)) } }
    case StyleField.FlexGrow { return StyleEntry{ Field: f, A: float32(n.FlexGrow) } }
    case StyleField.FlexShrink { return StyleEntry{ Field: f, A: float32(n.FlexShrink) } }
    case StyleField.FlexBasis { return StyleEntry{ Field: f, A: n.FlexBasis.Value, B: float32(int32(n.FlexBasis.Unit)) } }
    case StyleField.Position { return StyleEntry{ Field: f, A: float32(int32(n.Position)) } }
    case StyleField.Left { return StyleEntry{ Field: f, A: n.Left.Value, B: float32(int32(n.Left.Unit)) } }
    case StyleField.Top { return StyleEntry{ Field: f, A: n.Top.Value, B: float32(int32(n.Top.Unit)) } }
    case StyleField.Right { return StyleEntry{ Field: f, A: n.Right.Value, B: float32(int32(n.Right.Unit)) } }
    case StyleField.Bottom { return StyleEntry{ Field: f, A: n.Bottom.Value, B: float32(int32(n.Bottom.Unit)) } }
    case StyleField.Display { return StyleEntry{ Field: f, A: float32(int32(n.Display)) } }
    case StyleField.Visibility { return StyleEntry{ Field: f, A: float32(int32(n.Visibility)) } }
    case StyleField.BorderStyle { return StyleEntry{ Field: f, A: float32(int32(n.BorderStyle)) } }
    case StyleField.BlendMode { return StyleEntry{ Field: f, A: float32(int32(n.BlendMode)) } }
    case StyleField.OverflowX { return StyleEntry{ Field: f, A: float32(int32(n.OverflowX)) } }
    case StyleField.OverflowY { return StyleEntry{ Field: f, A: float32(int32(n.OverflowY)) } }
    case StyleField.BackgroundColor { return StyleEntry{ Field: f, A: n.BackgroundColor.R, B: n.BackgroundColor.G, C: n.BackgroundColor.B, D: n.BackgroundColor.A } }
    case StyleField.BackgroundGradient { return StyleEntry{ Field: f, Payload: n.BackgroundGradient } }
    case StyleField.BackgroundImage { return StyleEntry{ Field: f, Payload: BackgroundImageLayouts.Path(n) } }
    case StyleField.BackgroundImageSource { return StyleEntry{ Field: f, Payload: BackgroundImageLayouts.Source(n) } }
    case StyleField.ShaderEffect { return StyleEntry{ Field: f, Payload: n.ShaderEffect } }
    case StyleField.BackgroundImageFit { return StyleEntry{ Field: f, A: float32(int32(n.BackgroundImageFit)) } }
    case StyleField.ClipPath { return StyleEntry{ Field: f, Payload: ClipPaths.Path(n).payload } }
    case StyleField.ClipPathFit { return StyleEntry{ Field: f, A: float32(int32(ClipPaths.Fit(n))) } }
    case StyleField.ClipPathFillRule { return StyleEntry{ Field: f, A: float32(int32(ClipPaths.FillRule(n))) } }
    case StyleField.BorderRadius { return StyleEntry{ Field: f, A: n.BorderRadius.Value, B: float32(int32(n.BorderRadius.Unit)) } }
    case StyleField.BorderTopLeftRadius { return StyleEntry{ Field: f, A: n.BorderTopLeftRadius.Value, B: float32(int32(n.BorderTopLeftRadius.Unit)) } }
    case StyleField.BorderTopRightRadius { return StyleEntry{ Field: f, A: n.BorderTopRightRadius.Value, B: float32(int32(n.BorderTopRightRadius.Unit)) } }
    case StyleField.BorderBottomLeftRadius { return StyleEntry{ Field: f, A: n.BorderBottomLeftRadius.Value, B: float32(int32(n.BorderBottomLeftRadius.Unit)) } }
    case StyleField.BorderBottomRightRadius { return StyleEntry{ Field: f, A: n.BorderBottomRightRadius.Value, B: float32(int32(n.BorderBottomRightRadius.Unit)) } }
    case StyleField.BorderLeftWidth { return StyleEntry{ Field: f, A: n.BorderLeftWidth.Value, B: float32(int32(n.BorderLeftWidth.Unit)) } }
    case StyleField.BorderTopWidth { return StyleEntry{ Field: f, A: n.BorderTopWidth.Value, B: float32(int32(n.BorderTopWidth.Unit)) } }
    case StyleField.BorderRightWidth { return StyleEntry{ Field: f, A: n.BorderRightWidth.Value, B: float32(int32(n.BorderRightWidth.Unit)) } }
    case StyleField.BorderBottomWidth { return StyleEntry{ Field: f, A: n.BorderBottomWidth.Value, B: float32(int32(n.BorderBottomWidth.Unit)) } }
    case StyleField.BorderLeftColor { return StyleEntry{ Field: f, A: n.BorderLeftColor.R, B: n.BorderLeftColor.G, C: n.BorderLeftColor.B, D: n.BorderLeftColor.A } }
    case StyleField.BorderTopColor { return StyleEntry{ Field: f, A: n.BorderTopColor.R, B: n.BorderTopColor.G, C: n.BorderTopColor.B, D: n.BorderTopColor.A } }
    case StyleField.BorderRightColor { return StyleEntry{ Field: f, A: n.BorderRightColor.R, B: n.BorderRightColor.G, C: n.BorderRightColor.B, D: n.BorderRightColor.A } }
    case StyleField.BorderBottomColor { return StyleEntry{ Field: f, A: n.BorderBottomColor.R, B: n.BorderBottomColor.G, C: n.BorderBottomColor.B, D: n.BorderBottomColor.A } }
    case StyleField.ShapeStrokeWidth { return StyleEntry{ Field: f, A: n.BorderLeftWidth.Value, B: float32(int32(n.BorderLeftWidth.Unit)) } }
    case StyleField.ShapeStrokeColor { return StyleEntry{ Field: f, A: n.BorderLeftColor.R, B: n.BorderLeftColor.G, C: n.BorderLeftColor.B, D: n.BorderLeftColor.A } }
    case StyleField.OutlineWidth { return StyleEntry{ Field: f, A: n.OutlineWidth.Value, B: float32(int32(n.OutlineWidth.Unit)) } }
    case StyleField.OutlineColor { return StyleEntry{ Field: f, A: n.OutlineColor.R, B: n.OutlineColor.G, C: n.OutlineColor.B, D: n.OutlineColor.A } }
    case StyleField.OutlineOffset { return StyleEntry{ Field: f, A: n.OutlineOffset.Value, B: float32(int32(n.OutlineOffset.Unit)) } }
    case StyleField.Opacity { return StyleEntry{ Field: f, A: float32(n.Opacity) } }
    case StyleField.BoxShadows { return StyleEntry{ Field: f, Payload: n.BoxShadows } }
    case StyleField.TextShadows { return StyleEntry{ Field: f, Payload: n.TextShadows } }
    case StyleField.TextStrokeWidth {
      return StyleEntry{ Field: f, A: n.TextStrokeWidth.Value, B: float32(int32(n.TextStrokeWidth.Unit)) }
    }
    case StyleField.TextStrokeColor {
      return StyleEntry{ Field: f, A: n.TextStrokeColor.R, B: n.TextStrokeColor.G,
        C: n.TextStrokeColor.B, D: n.TextStrokeColor.A }
    }
    case StyleField.FontSize { return StyleEntry{ Field: f, A: n.FontSize.Value, B: float32(int32(n.FontSize.Unit)) } }
    case StyleField.Color { return StyleEntry{ Field: f, A: n.Color.R, B: n.Color.G, C: n.Color.B, D: n.Color.A } }
    case StyleField.FontFamily { return StyleEntry{ Field: f, Payload: n.FontFamily } }
    case StyleField.FontWeight { return StyleEntry{ Field: f, A: float32(n.FontWeight) } }
    case StyleField.FontStyle { return StyleEntry{ Field: f, A: float32(int32(n.FontStyle)) } }
    case StyleField.LetterSpacing { return StyleEntry{ Field: f, A: n.LetterSpacing.Value, B: float32(int32(n.LetterSpacing.Unit)) } }
    case StyleField.LineHeight { return StyleEntry{ Field: f, A: float32(n.LineHeight) } }
    case StyleField.TextAlign { return StyleEntry{ Field: f, A: float32(int32(n.TextAlign)) } }
    case StyleField.TextDecoration { return StyleEntry{ Field: f, A: float32(int32(n.TextDecoration)) } }
    case StyleField.TextWrap { return StyleEntry{ Field: f, A: float32(int32(n.TextWrap)) } }
    case StyleField.TextTrimming { return StyleEntry{ Field: f, A: float32(int32(n.TextTrimming)) } }
    case StyleField.TextMaxLines {
      return StyleEntry{ Field: f, A: float32(n.TextMaxLines >> 16), B: float32(n.TextMaxLines & int32(65535)) }
    }
    case StyleField.TextTransform { return StyleEntry{ Field: f, A: float32(int32(n.TextTransform)) } }
    case StyleField.Cursor { return StyleEntry{ Field: f, A: float32(int32(n.Cursor)) } }
    case StyleField.TransformTranslateX {
      let value = Transforming.TranslateX(n)
      return StyleEntry{ Field: f, A: value.Value, B: float32(int32(value.Unit)) }
    }
    case StyleField.TransformTranslateY {
      let value = Transforming.TranslateY(n)
      return StyleEntry{ Field: f, A: value.Value, B: float32(int32(value.Unit)) }
    }
    case StyleField.TransformRotate { return StyleEntry{ Field: f, A: Transforming.Rotate(n) } }
    case StyleField.TransformScale { return StyleEntry{ Field: f, A: Transforming.Scale(n) } }
    case StyleField.TransformScaleX { return StyleEntry{ Field: f, A: Transforming.ScaleX(n) } }
    case StyleField.TransformScaleY { return StyleEntry{ Field: f, A: Transforming.ScaleY(n) } }
    case StyleField.TransformSkewX { return StyleEntry{ Field: f, A: Transforming.SkewX(n) } }
    case StyleField.TransformSkewY { return StyleEntry{ Field: f, A: Transforming.SkewY(n) } }
    case StyleField.TransformOriginX {
      let value = Transforming.OriginX(n)
      return StyleEntry{ Field: f, A: value.Value, B: float32(int32(value.Unit)) }
    }
    case StyleField.TransformOriginY {
      let value = Transforming.OriginY(n)
      return StyleEntry{ Field: f, A: value.Value, B: float32(int32(value.Unit)) }
    }
    case StyleField.ZIndex {
      return StyleEntry{ Field: f, A: float32(n.ZIndex >> 16), B: float32(n.ZIndex & int32(65535)) }
    }
    default { throw NotSupportedException("readField: unhandled StyleField") }
  }
}

internal func ApplyAllDefaults(n Node) {
  for field in StyleFields.InitialFields {
    applyDefault(n, field)
  }
}

internal func defaultStyleEntry(f StyleField) StyleEntry -> StyleFields.Default(f)

internal func applyDefault(n Node, f StyleField) bool -> writeDirect(n, defaultStyleEntry(f))

internal func styleEffects(f StyleField) ReconcileEffects -> StyleFields.Effects(f)

internal func fieldKind(f StyleField) FieldKind -> StyleFields.Kind(f)
