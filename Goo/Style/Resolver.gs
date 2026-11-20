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
  internal var FromLength Length
  internal var ToLength Length
  internal var WorkingLength LengthDeclaration?
  internal var Easing Easing
  internal var Elapsed float64
  internal var Duration float64
  internal var Payload object?
}

internal sealed class Float64TransitionValues {
  internal let From float64
  internal let To float64

  internal init(from float64, to float64) {
    From = from
    To = to
  }
}

internal data struct LayoutStyleCommit {
  internal var Mount NodeMount
  internal var Entry StyleEntry
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

internal partial class Resolver {
  shared {
    private var nextStylePass int64

    private func newStylePass() int64 -> Interlocked.Increment(&nextStylePass)

    private let marginEdges []StyleField = []StyleField{
      StyleField.MarginLeft, StyleField.MarginTop, StyleField.MarginRight, StyleField.MarginBottom }
    private let paddingEdges []StyleField = []StyleField{
      StyleField.PaddingLeft, StyleField.PaddingTop, StyleField.PaddingRight, StyleField.PaddingBottom }
  }

  internal prop Owner Window? {
    get;
    init;
  }

  internal prop Animating List[NodeMount]{ get; init; }
  internal prop DebugOverrides DiagnosticOverrideStore? {
    get -> ResolverDiagnostics.Get(this)
    set(v) -> ResolverDiagnostics.Set(this, v)
  }
  internal prop PaintResourceInvalidated Action? { get; set; }
  internal prop ShaderEffectInvalidated Action? { get; set; }
  private let pending List[NodeMount]
  internal let Scrollbars ScrollbarParts = ScrollbarParts()
  private let inheritedScratch []StyleEntry
  private let layerWinners []int32 = [StyleFields.Count]int32
  private var pendingCursor int32
  private var stylePass int64
  internal var VisualDirty bool
  private var pendingEffects ReconcileEffects
  private let layoutCommits List[LayoutStyleCommit] = List[LayoutStyleCommit]()
  private var applyingLayoutCommits bool
  internal var ResolvedLayoutCause LayoutCause

  internal prop HasLayoutCommits bool { get -> layoutCommits.Count != 0 }

  internal func CommitLayoutTargets() {
    applyingLayoutCommits = true
    try {
      for commit in layoutCommits {
        guard let node = commit.Mount.Current else { continue }
        writeField(node, commit.Entry, false)
        if inheritable(commit.Entry.Field) { propagateInherited(node, commit.Entry.Field) }
      }
    } finally {
      layoutCommits.Clear()
      applyingLayoutCommits = false
    }
  }

  private func deferLayoutTarget(n Node, entry StyleEntry) {
    recordResolvedChange(entry.Field)
    for i in 0 ... layoutCommits.Count {
      let pending = layoutCommits[i]
      if pending.Mount.Current == n && pending.Entry.Field == entry.Field {
        layoutCommits[i] = LayoutStyleCommit{Mount: pending.Mount, Entry: entry}
        return
      }
    }
    layoutCommits.Add(LayoutStyleCommit{Mount: NodeMount(n), Entry: entry})
  }
  internal init() {
    Animating = List[NodeMount]()
    pending = List[NodeMount]()
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
        if let node = pending[pendingCursor].Current { visits = visits + resolvePending(node) }
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
    Scrollbars.Discard()
    pendingCursor = 0
    pendingEffects = ReconcileEffects.None
    layoutCommits.Clear()
    ResolvedLayoutCause = LayoutCause.None
  }

  private func queue(n Node) {
    if pending.Count == 0 {
      stylePass = newStylePass()
    }
    if n.StyleQueuedPass == stylePass && n.StyleResolvedPass != stylePass {
      return
    }
    n.StyleQueuedPass = stylePass
    n.StyleResolvedPass = 0
    n.StylePendingSelf = false
    n.StylePendingInitial = false
    n.StylePendingInheritedMask = StyleMask{}
    pending.Add(NodeMount(n))
  }

  internal func InvalidateInherited(n Node, fields StyleMask) {
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
    if n.Children.Count == 0 && ScrollbarParts.Children(n).Count == 0 {
      resolveNode(n, initial)
    } else {
      changed = resolveNodeChanged(n, initial)
    }
    n.StyleResolvedPass = stylePass
    if !styleMaskEmpty(changed) {
      for i in 0 ... n.Children.Count {
        InvalidateInherited(n.Children[i], changed)
      }
      ScrollbarParts.InvalidateInherited(this, n, changed)
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

  private func changedField(mask StyleMask, before StyleEntry, n Node, field StyleField) StyleMask -> if sameStyleEntry(before, readField(n, field)) { mask } else { styleMaskWith(mask, field) }

  private func resolveNode(n Node, initial bool) {
    ApplyTextScale(n)
    let direction = effectiveDirection(n)
    let remap = (n.Direction == Direction.RightToLeft) != (direction == Direction.RightToLeft)
    writeField(n, StyleEntry{ Field: StyleField.Direction,
      A: float32(int32(direction)) }, initial)
    let paintMask = updatePaintBindings(n)
    var localMask = paintMask
    // Higher active layers shadow lower entries before transition retargeting.
    let hoverMask = !n.Disabled && n.Hovered ? fieldsMask(n, n.HoverStyle) : StyleMask{}
    let focusMask = !n.Disabled && n.FocusVisible ? fieldsMask(n, n.FocusStyle) : StyleMask{}
    let pressMask = !n.Disabled && n.Pressed ? fieldsMask(n, n.ActiveStyle) : StyleMask{}
    let disabledMask = n.Disabled ? fieldsMask(n, n.DisabledStyle) : StyleMask{}
    let allStateMasks = styleMaskUnion(styleMaskUnion(hoverMask, focusMask),
      styleMaskUnion(pressMask, disabledMask))
    n.LocalMask = allStateMasks
    localMask = applyList(n, n.BaseStyle, localMask, initial, allStateMasks, remap)
    if !n.Disabled && n.Hovered {
      localMask = applyList(n, n.HoverStyle, localMask, initial, styleMaskUnion(focusMask, pressMask), remap)
    }
    if !n.Disabled && n.FocusVisible {
      localMask = applyList(n, n.FocusStyle, localMask, initial, pressMask, remap)
    }
    if !n.Disabled && n.Pressed {
      localMask = applyList(n, n.ActiveStyle, localMask, initial, StyleMask{}, remap)
    }
    if n.Disabled {
      localMask = applyList(n, n.DisabledStyle, localMask, initial, StyleMask{}, remap)
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
    samplePaintBindings(n)
  }

  internal func applyInherited(n Node, localMask StyleMask, initial bool) StyleMask {
    guard let parent = n.Parent else {
      if let owner = Owner {
        if !styleMaskHas(localMask, StyleField.Color) {
          let color = owner.Foreground
          writeField(n, StyleEntry{Field: StyleField.Color,
            A: color.R, B: color.G, C: color.B, D: color.A}, initial)
          return styleMaskWith(StyleMask{}, StyleField.Color)
        }
      }
      return StyleMask{}
    }
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
    var cursor = list.Cursor()
    while cursor.MoveNext() {
      if cursor.Current.Payload is PaintBinding { continue }
      let field = cursor.Current.Field
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

  internal func applyList(n Node, entries StyleEntries?, mask StyleMask, initial bool,
    shadow StyleMask, remap bool) StyleMask {
    guard let list = entries else { return mask }
    var m = mask
    var cursor = list.Cursor()
    while cursor.MoveNext() {
      if cursor.Current.Payload is PaintBinding { continue }
      let i = cursor.Index
      let field = cursor.Current.Field
      if !styleFieldApplies(n, field) { continue }
      if field == StyleField.Margin || field == StyleField.Padding {
        let edges = field == StyleField.Margin ? marginEdges : paddingEdges
        for edge in edges {
          layerWinners[int32(edge)] = i
          m = styleMaskWith(m, edge)
        }
      } else {
        let resolved = styleFieldForNode(n, field)
        layerWinners[int32(resolved)] = i
        m = styleMaskWith(m, resolved)
      }
    }
    n.LocalMask = styleMaskUnion(n.LocalMask, m)
    cursor = list.Cursor()
    while cursor.MoveNext() {
      let i = cursor.Index
      var e = cursor.Current
      if e.Payload is PaintBinding { continue }
      let logical = isLogicalStyleField(e.Field)
      if !styleFieldApplies(n, e.Field) {
        continue
      }
      if e.Field == StyleField.Direction {
        continue
      }
      if e.Field == StyleField.Margin {
        applyCanonicalBoxEdges(n, e, initial, shadow, marginEdges, i)
        continue
      }
      if e.Field == StyleField.Padding {
        applyCanonicalBoxEdges(n, e, initial, shadow, paddingEdges, i)
        continue
      }
      e.Field = styleFieldForNode(n, e.Field)
      if layerWinners[int32(e.Field)] != i { continue }
      if !styleMaskHas(shadow, e.Field) {
        writeField(n, e, initial || (logical && remap))
      }
    }
    return m
  }

  private func applyCanonicalBoxEdges(n Node, source StyleEntry, initial bool,
    shadow StyleMask, edges []StyleField, index int32) {
    for f in edges {
      if layerWinners[int32(f)] != index || styleMaskHas(shadow, f) { continue }
      var e = source
      e.Field = f
      writeField(n, e, initial)
    }
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
    if !n.Disabled && n.FocusVisible { result = declaredDirection(n.FocusStyle, result) }
    if !n.Disabled && n.Pressed { result = declaredDirection(n.ActiveStyle, result) }
    if n.Disabled { result = declaredDirection(n.DisabledStyle, result) }
    return result
  }

  private func declaredDirection(entries StyleEntries?, fallback Direction) Direction {
    guard let list = entries else { return fallback }
    var result = fallback
    var cursor = list.Cursor()
    while cursor.MoveNext() {
      let entry = cursor.Current
      if entry.Field == StyleField.Direction {
        result = Direction(int32(entry.A))
      }
    }
    return result
  }

  // Direct write on initial resolve, non-animatable fields, or when transitions
  // are off; otherwise starts (or retargets) a lerp from the displayed value.
  internal func writeField(n Node, e StyleEntry, initial bool) {
    if !initial && !applyingLayoutCommits && Owner?.DeferLayoutTargets == true
      && LayoutOrigin.IsApplication(LayoutOrigin.Current)
      && (styleEffects(e.Field) & (ReconcileEffects.Layout | ReconcileEffects.Content)) != ReconcileEffects.None {
      deferLayoutTarget(n, e)
      return
    }
    if e.Payload is LengthDeclaration {
      if !initial && Owner?.Preferences.ReducedMotion != true && n.TransitionMs > 0.0
        && transitionSelected(n.TransitionSelection, e.Field)
        && (e.Field == StyleField.TransformTranslateX || e.Field == StyleField.TransformTranslateY
          || e.Field == StyleField.TransformOriginX || e.Field == StyleField.TransformOriginY) {
        if let state = LengthDeclarations.Get(n) {
          let target = (e.Payload as LengthDeclaration)!!.Value
          for current in state.Values {
            if current.Field != e.Field || current.Value.Unit != target.Unit { continue }
            if let transitions = n.Transitions {
              for transition in transitions {
                if transition.Field == e.Field && transition.WorkingLength != nil
                  && sameLength(transition.ToLength, target) { return }
              }
            }
            if sameLength(current.Value, target) {
              finishTransition(n, e.Field)
              return
            }
            finishTransition(n, e.Field)
            n.Transitions ??= List[Transition]()
            n.Transitions!!.Add(Transition{Field: e.Field, FromLength: current.Value, ToLength: target,
              WorkingLength: LengthDeclaration{Value: current.Value}, Easing: n.TransitionEasing,
              Elapsed: -n.TransitionDelayMs / 1000.0, Duration: n.TransitionMs / 1000.0})
            if !containsAnimating(n) { Animating.Add(NodeMount(n)) }
            return
          }
        }
      }
      if LengthDeclarations.Set(n, e, this) {
        recordResolvedChange(e.Field)
        pendingEffects = pendingEffects | ReconcileEffects.Layout
      }
      finishTransition(n, e.Field)
      return
    }
    if LengthDeclarations.Active && fieldKind(e.Field) == FieldKind.KLength {
      LengthDeclarations.Set(n, e, this)
    }
    if hasPaintBinding(n, e.Field) {
      finishTransition(n, e.Field)
      return
    }
    if !styleFieldApplies(n, e.Field) {
      finishTransition(n, e.Field)
      return
    }
    if e.Field == StyleField.BoxShadows || e.Field == StyleField.TextShadows {
      writeBoxShadows(n, e, initial)
      return
    }
    let cur = readField(n, e.Field)
    if sameStyleEntry(cur, e) {
      finishTransition(n, e.Field)
      return
    }
    if initial || Owner?.Preferences.ReducedMotion == true || n.TransitionMs <= 0.0 || !lerpable(e.Field)
      || !transitionSelected(n.TransitionSelection, e.Field)
      || (fieldKind(e.Field) == FieldKind.KLength && cur.B != e.B)
      || (e.Field == StyleField.BackgroundGradient && !compatibleGradients(entryGradient(cur), entryGradient(e)))
      || (e.Field == StyleField.DashIntervals && !compatibleDashIntervals(entryDashes(cur), entryDashes(e))) {
        finishTransition(n, e.Field)
        var direct = e
        if e.Field == StyleField.DashIntervals && !initial && Owner?.Preferences.ReducedMotion != true
          && n.TransitionMs > 0.0 && transitionSelected(n.TransitionSelection, StyleField.DashOffset) {
          if let target = entryDashes(e) {
            let offset = n.Dashes?.Offset ?? 0.0
            if target.Offset != offset {
              direct = StyleEntry{Field: e.Field, Payload: DashPattern(target, offset)}
            }
          }
        }
        if writeDirectWithInvalidation(n, direct, invalidationFor(e.Field), Owner) {
          if e.Field == StyleField.ScrollbarX || e.Field == StyleField.ScrollbarY {
            Scrollbars.Queue(n)
          }
          recordResolvedChange(e.Field)
        }
        return
      }
    startOrRetarget(n, e, cur)
  }

  internal func writeBoxShadows(n Node, e StyleEntry, initial bool) {
    let cur = readField(n, e.Field)
    if sameStyleEntry(cur, e) {
      finishTransition(n, e.Field)
      return
    }
    if initial || Owner?.Preferences.ReducedMotion == true || n.TransitionMs <= 0.0
      || !transitionSelected(n.TransitionSelection, e.Field)
      || !boxShadowListsCompatible(entryShadows(cur), entryShadows(e))
      || (e.Field == StyleField.TextShadows && boxShadowCount(entryShadows(cur)) != boxShadowCount(entryShadows(e))) {
        finishTransition(n, e.Field)
        if writeDirectWithInvalidation(n, e, PaintResourceInvalidated, Owner) {
          recordResolvedChange(e.Field)
        }
        return
      }
    startOrRetargetBoxShadows(n, e, cur)
  }

  internal func startOrRetarget(n Node, e StyleEntry, cur StyleEntry) {
    n.Transitions ??= List[Transition]()
    let list = n.Transitions!!
    var index = -1
    for i in 0 ... list.Count {
      let current = list[i]
      if current.Field != e.Field { continue }
      let sameTarget = if current.Payload is GradientTransitionValues values {
        sameGradient(values.To, entryGradient(e))
      } else if current.Payload is Float64TransitionValues values {
        values.To == entryFloat64(e)
      } else if current.Payload is DashTransitionValues values {
        sameDashIntervals(values.To, entryDashes(e))
      } else {
        current.ToA == e.A && current.ToB == e.B && current.ToC == e.C && current.ToD == e.D
      }
      if sameTarget { return }
      index = i
      break
    }
    if e.Field is StyleField.OutlineWidth or StyleField.OutlineColor or StyleField.OutlineOffset {
      Outlining.PrepareTransition(n)
    } else if e.Field is StyleField.TextStrokeWidth or StyleField.TextStrokeColor {
      TextStroking.PrepareTransition(n)
      propagateInherited(n, e.Field, prepareStroke: true)
    }
    var payload object? = nil
    if e.Field == StyleField.BackgroundGradient {
      payload = GradientTransitionValues(entryGradient(cur)!!, entryGradient(e)!!)
    } else if e.Field == StyleField.DashIntervals {
      let values = DashTransitionValues(entryDashes(cur)!!, entryDashes(e)!!)
      n.Dashes = values.Work
      payload = values
    } else if fieldKind(e.Field) == FieldKind.KFloat64 {
      payload = Float64TransitionValues(entryFloat64(cur), entryFloat64(e))
      if e.Field == StyleField.DashOffset {
        if let dashes = n.Dashes {
          if !dashes.TransitionOwned { n.Dashes = DashPattern(dashes, dashes.Offset) }
        } else {
          n.Dashes = DashPattern([]float64{}, 0.0){.TransitionOwned: true}
        }
      }
    }
    let next = Transition{Field: e.Field,
      FromA: cur.A, FromB: cur.B, FromC: cur.C, FromD: cur.D,
      ToA: e.A, ToB: e.B, ToC: e.C, ToD: e.D, Payload: payload,
      Easing: n.TransitionEasing,
      Elapsed: -n.TransitionDelayMs / 1000.0, Duration: n.TransitionMs / 1000.0}
    if index < 0 { list.Add(next) } else { list[index] = next }
    if !containsAnimating(n) { Animating.Add(NodeMount(n)) }
  }

  internal func startOrRetargetBoxShadows(n Node, e StyleEntry, cur StyleEntry) {
    n.Transitions ??= List[Transition]()
    let list = n.Transitions!!
    var index = -1
    for i in 0 ... list.Count {
      if list[i].Field != e.Field { continue }
      if sameBoxShadows(list[i].TargetShadows, entryShadows(e)) { return }
      index = i
      break
    }
    let next = makeBoxShadowTransition(e.Field, entryShadows(cur), entryShadows(e),
      n.TransitionEasing, n.TransitionMs / 1000.0, n.TransitionDelayMs / 1000.0)
    if index < 0 { list.Add(next) } else { list[index] = next }
    if e.Field == StyleField.TextShadows {
      Array.Copy(next.FromShadows!!.Items, next.WorkingShadows!!.Items, next.FromShadows!!.Count)
      n.TextShadows = next.WorkingShadows
      propagateInherited(n, e.Field)
    }
    if !containsAnimating(n) { Animating.Add(NodeMount(n)) }
  }

  internal func containsAnimating(n Node) bool {
    for i in 0 ... Animating.Count {
      if Animating[i].Current == n { return true }
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
    advancePaintBindings()
    for var ni = Animating.Count; ni > 0; ni-- {
      guard let n = Animating[ni - 1].Current else {
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
        tr.Elapsed = Owner?.Preferences.ReducedMotion == true ? Math.Max(tr.Duration, 1.0) : tr.Elapsed + dt
        if tr.Elapsed <= 0.0 {
          list[ti - 1] = tr
          continue
        }
        let t = tr.Duration <= 0.0 ? 1.0 : Math.Min(1.0, tr.Elapsed / tr.Duration)
        let progress = ease(tr.Easing, t)
        let ft = float32(progress)
        if let working = tr.WorkingLength {
          let from = tr.FromLength
          let to = tr.ToLength
          working.Value = Length{Unit: to.Unit,
            Value: from.Value + (to.Value - from.Value) * ft,
            PercentPart: from.PercentPart + (to.PercentPart - from.PercentPart) * ft,
            EmPart: from.EmPart + (to.EmPart - from.EmPart) * ft,
            RemPart: from.RemPart + (to.RemPart - from.RemPart) * ft,
            VwPart: from.VwPart + (to.VwPart - from.VwPart) * ft,
            VhPart: from.VhPart + (to.VhPart - from.VhPart) * ft}
          if LengthDeclarations.Set(n, StyleEntry{Field: tr.Field, Payload: working}, this) {
            recordResolvedChange(tr.Field)
            pendingEffects = pendingEffects | ReconcileEffects.Layout
          }
        } else if tr.Field == StyleField.BoxShadows || tr.Field == StyleField.TextShadows {
          guard let from = tr.FromShadows, let to = tr.ToShadows, let work = tr.WorkingShadows else {
            list.RemoveAt(ti - 1)
            continue
          }
          lerpBoxShadows(from, to, work, ft)
          let next = t >= 1.0 ? tr.TargetShadows : work
          if tr.Field == StyleField.BoxShadows { n.BoxShadows = next } else { n.TextShadows = next }
          n.BumpScenePaintVersion()
          recordResolvedChange(tr.Field)
        } else if tr.Payload is GradientTransitionValues values {
          values.Sample(progress)
          n.BackgroundGradient = t >= 1.0 ? values.To : values.Work
          n.BumpScenePaintVersion()
          recordResolvedChange(tr.Field)
        } else if tr.Payload is DashTransitionValues values {
          values.Sample(progress)
          n.BumpScenePaintVersion()
          recordResolvedChange(tr.Field)
        } else {
          if writeDirectWithInvalidation(n, interpolatedTransitionEntry(tr, progress), PaintResourceInvalidated,
            Owner) {
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

  private func interpolatedTransitionEntry(tr Transition, progress float64) StyleEntry {
    if tr.Payload is Float64TransitionValues values {
      let value = if progress >= 1.0 { values.To } else { values.From + (values.To - values.From) * progress }
      return float64StyleEntry(tr.Field, value)
    }
    let t = float32(progress)
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

  internal func propagateInherited(parent Node, f StyleField, prepareStroke bool = false) {
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
      if prepareStroke { TextStroking.PrepareTransition(child) }
      if f == StyleField.TextShadows {
        child.TextShadows = parent.TextShadows
        child.BumpScenePaintVersion()
        recordResolvedChange(f)
      } else if writeDirectWithInvalidation(child, readField(parent, f), PaintResourceInvalidated, Owner) {
        recordResolvedChange(f)
      }
      propagateInherited(child, f, prepareStroke)
    }
    for child in ScrollbarParts.Children(parent) {
      if styleMaskHas(child.LocalMask, f) {
        continue
      }
      if let store = DebugOverrides {
        if let state = store.State(child) {
          if state.Values.ContainsKey(f) { continue }
        }
      }
      finishTransition(child, f)
      if prepareStroke { TextStroking.PrepareTransition(child) }
      if f == StyleField.TextShadows {
        child.TextShadows = parent.TextShadows
        child.BumpScenePaintVersion()
        recordResolvedChange(f)
      } else if writeDirectWithInvalidation(child, readField(parent, f), PaintResourceInvalidated, Owner) {
        recordResolvedChange(f)
      }
      propagateInherited(child, f, prepareStroke)
    }
  }

  private func recordResolvedChange(f StyleField) {
    if (styleEffects(f) & (ReconcileEffects.Layout | ReconcileEffects.Content)) != ReconcileEffects.None {
      ResolvedLayoutCause = LayoutOrigin.Combine(ResolvedLayoutCause, LayoutOrigin.Current)
    }
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

internal func makeBoxShadowTransition(field StyleField, from BoxShadowStack?, target BoxShadowStack?,
  easing Easing, duration float64, delay float64) Transition{
    let count = Math.Max(boxShadowCount(from), boxShadowCount(target))
    return Transition{
      Field: field,
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
  return if e == Easing.EaseInOut { t < 0.5 ? 2.0 * t * t : 1.0 - (1.0 - t) * (1.0 - t) * 2.0 } else { t }
}

// Paint effects without public transition selectors stay discrete.
internal func lerpable(f StyleField) bool -> StyleFields.Has(f, StyleFieldFlags.Lerpable)

internal func inheritable(f StyleField) bool -> StyleFields.Has(f, StyleFieldFlags.Inheritable)

internal func writeDirect(n Node, e StyleEntry) bool -> writeDirectWithInvalidation(n, e, nil)

internal func writeDirectWithInvalidation(n Node, e StyleEntry, invalidated Action?, owner Window? = nil) bool {
  if !styleFieldApplies(n, e.Field) {
    return false
  }
  if sameStyleEntry(readField(n, e.Field), e) {
    return false
  }
  let tracksText = (n.Kind == NodeKind.Text || n.Kind == NodeKind.Entry || n.Kind == NodeKind.Editor)
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
    case StyleField.ScrollbarVisibilityX {
      n.ScrollbarVisibilityX = ScrollbarVisibility(int32(e.A))
      ScrollState.ResetActivity(n)
    }
    case StyleField.ScrollbarVisibilityY {
      n.ScrollbarVisibilityY = ScrollbarVisibility(int32(e.A))
      ScrollState.ResetActivity(n)
    }
    case StyleField.ScrollbarX {
      n.ScrollbarX = entryScrollbar(e)
      ScrollState.ResetActivity(n)
    }
    case StyleField.ScrollbarY {
      n.ScrollbarY = entryScrollbar(e)
      ScrollState.ResetActivity(n)
    }
    case StyleField.BorderStyle { n.BorderStyle = BorderStyle(int32(e.A)) }
    case StyleField.BlendMode { n.BlendMode = BlendMode(int32(e.A)) }
    case StyleField.OverflowX {
      let next = Overflow(int32(e.A))
      if next != n.OverflowX {
        n.OverflowX = next
        ScrollTopology.Invalidate(n)
      }
    }
    case StyleField.OverflowY {
      let next = Overflow(int32(e.A))
      if next != n.OverflowY {
        n.OverflowY = next
        ScrollTopology.Invalidate(n)
      }
    }
    case StyleField.BackgroundColor { n.BackgroundColor = Color.FromNormalized(e.A, e.B, e.C, e.D) }
    case StyleField.BackgroundGradient { n.BackgroundGradient = entryGradient(e) }
    case StyleField.BackgroundImageSource { BackgroundImageLayouts.SetSource(n, entryImageSource(e), invalidated, owner) }
    case StyleField.ShaderEffect { ShaderEffectStyles.Set(n, entryShaderEffect(e), invalidated) }
    case StyleField.BackgroundImageFit { n.BackgroundImageFit = ImageFit(int32(e.A)) }
    case StyleField.ClipPath { ClipPaths.SetPath(n, entryPath(e)) }
    case StyleField.ClipPathFit { ClipPaths.SetFit(n, ShapeFit(int32(e.A))) }
    case StyleField.ClipPathFillRule { ClipPaths.SetFillRule(n, FillRule(int32(e.A))) }
    case StyleField.BorderRadius {
      let radius = Length{Unit: LengthUnit(int32(e.B)), Value: e.A}
      n.BorderRadius = radius
      if !styleMaskHas(n.LocalMask, StyleField.BorderTopLeftRadius) { n.BorderTopLeftRadius = radius }
      if !styleMaskHas(n.LocalMask, StyleField.BorderTopRightRadius) { n.BorderTopRightRadius = radius }
      if !styleMaskHas(n.LocalMask, StyleField.BorderBottomLeftRadius) { n.BorderBottomLeftRadius = radius }
      if !styleMaskHas(n.LocalMask, StyleField.BorderBottomRightRadius) { n.BorderBottomRightRadius = radius }
    }
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
    case StyleField.BackdropBlur { n.BackdropBlur = e.A }
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
    case StyleField.Language { n.Language = entryText(e) ?? "" }
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
    case StyleField.ShapeCornerRadius { n.ShapeCornerRadius = entryFloat64(e) }
    case StyleField.StrokeStart { n.StrokeStart = entryFloat64(e) }
    case StyleField.StrokeEnd { n.StrokeEnd = entryFloat64(e) }
    case StyleField.MiterLimit { n.MiterLimit = entryFloat64(e) }
    case StyleField.DashOffset {
      if let dashes = n.Dashes {
        if dashes.TransitionOwned { dashes.SetOffset(entryFloat64(e)) }
        else { n.Dashes = DashPattern(dashes, entryFloat64(e)) }
      } else {
        n.Dashes = DashPattern([]float64{}, entryFloat64(e)){.TransitionOwned: true}
      }
    }
    case StyleField.DashIntervals {
      n.Dashes = entryDashes(e)
    }
    case StyleField.SelectionColor { n.SelectionColor = Color.FromNormalized(e.A, e.B, e.C, e.D) }
    case StyleField.CaretColor { n.EditorCaretColor = Color.FromNormalized(e.A, e.B, e.C, e.D) }
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
    case StyleField.ScrollbarVisibilityX {
      return StyleEntry{ Field: f, A: float32(int32(n.ScrollbarVisibilityX)) }
    }
    case StyleField.ScrollbarVisibilityY {
      return StyleEntry{ Field: f, A: float32(int32(n.ScrollbarVisibilityY)) }
    }
    case StyleField.ScrollbarX { return StyleEntry{ Field: f, Payload: n.ScrollbarX } }
    case StyleField.ScrollbarY { return StyleEntry{ Field: f, Payload: n.ScrollbarY } }
    case StyleField.BorderStyle { return StyleEntry{ Field: f, A: float32(int32(n.BorderStyle)) } }
    case StyleField.BlendMode { return StyleEntry{ Field: f, A: float32(int32(n.BlendMode)) } }
    case StyleField.OverflowX { return StyleEntry{ Field: f, A: float32(int32(n.OverflowX)) } }
    case StyleField.OverflowY { return StyleEntry{ Field: f, A: float32(int32(n.OverflowY)) } }
    case StyleField.BackgroundColor { return StyleEntry{ Field: f, A: n.BackgroundColor.R, B: n.BackgroundColor.G, C: n.BackgroundColor.B, D: n.BackgroundColor.A } }
    case StyleField.BackgroundGradient { return StyleEntry{ Field: f, Payload: n.BackgroundGradient } }
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
    case StyleField.OutlineWidth { return StyleEntry{ Field: f, A: n.OutlineWidth.Value, B: float32(int32(LengthUnit.Px)) } }
    case StyleField.OutlineColor { return StyleEntry{ Field: f, A: n.OutlineColor.R, B: n.OutlineColor.G, C: n.OutlineColor.B, D: n.OutlineColor.A } }
    case StyleField.OutlineOffset { return StyleEntry{ Field: f, A: n.OutlineOffset.Value, B: float32(int32(LengthUnit.Px)) } }
    case StyleField.Opacity { return StyleEntry{ Field: f, A: float32(n.Opacity) } }
    case StyleField.BackdropBlur { return StyleEntry{ Field: f, A: n.BackdropBlur } }
    case StyleField.BoxShadows { return StyleEntry{ Field: f, Payload: n.BoxShadows } }
    case StyleField.TextShadows { return StyleEntry{ Field: f, Payload: n.TextShadows } }
    case StyleField.TextStrokeWidth {
      return StyleEntry{ Field: f, A: n.TextStrokeWidth.Value, B: float32(int32(LengthUnit.Px)) }
    }
    case StyleField.TextStrokeColor {
      return StyleEntry{ Field: f, A: n.TextStrokeColor.R, B: n.TextStrokeColor.G,
        C: n.TextStrokeColor.B, D: n.TextStrokeColor.A }
    }
    case StyleField.FontSize { return StyleEntry{ Field: f, A: n.FontSize.Value, B: float32(int32(n.FontSize.Unit)) } }
    case StyleField.Color { return StyleEntry{ Field: f, A: n.Color.R, B: n.Color.G, C: n.Color.B, D: n.Color.A } }
    case StyleField.FontFamily { return StyleEntry{ Field: f, Payload: n.FontFamily } }
    case StyleField.Language { return StyleEntry{ Field: f, Payload: n.Language } }
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
    case StyleField.ShapeCornerRadius { return float64StyleEntry(f, n.ShapeCornerRadius) }
    case StyleField.StrokeStart { return float64StyleEntry(f, n.StrokeStart) }
    case StyleField.StrokeEnd { return float64StyleEntry(f, n.StrokeEnd) }
    case StyleField.MiterLimit { return float64StyleEntry(f, n.MiterLimit) }
    case StyleField.DashOffset { return float64StyleEntry(f, n.Dashes?.Offset ?? 0.0) }
    case StyleField.DashIntervals { return StyleEntry{Field: f, Payload: n.Dashes} }
    case StyleField.SelectionColor {
      return StyleEntry{Field: f, A: n.SelectionColor.R, B: n.SelectionColor.G,
        C: n.SelectionColor.B, D: n.SelectionColor.A}
    }
    case StyleField.CaretColor {
      return StyleEntry{Field: f, A: n.EditorCaretColor.R, B: n.EditorCaretColor.G,
        C: n.EditorCaretColor.B, D: n.EditorCaretColor.A}
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
