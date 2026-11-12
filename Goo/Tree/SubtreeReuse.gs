package Goo

import System

internal class SubtreeReuse {
  shared {
    internal let Mode int32 = Int32.Parse(Environment.GetEnvironmentVariable("GOO_SUBTREE_MODE") ?? "1")
    internal var SkippedNodes int64

    internal func Count(n Node) int32 {
      if n.Fiber != nil || n.ReferenceBlob == nil || n.ReferenceBlob!!.HasElementHandle || !(n.ReferenceBlob is Container || n.ReferenceBlob is Text || n.ReferenceBlob is Button) { return 0 }
      var count = 1
      for index in 0 ... n.Children.Count {
        let child = Count(n.Children[index])
        if child == 0 { return 0 }
        count += child
      }
      return count
    }

    internal func Freeze(b Blob) {
      if b.ReuseFrozen { return }
      b.ReuseFrozen = true
      if Mode != 3 { return }
      if !(b is Container || b is Text) || b.HasElementHandle || b.HasSparseInputState || b.HasAccessibility || b.HasPassiveTextRanges || b.LayoutTransition != nil { return }
      if let c = b as Container {
        if c.Layout != nil || c.VectorViewport != nil { return }
      }
      var hash = HashCode{}
      hash.Add(b.GetType())
      hash.Add(b.Key)
      hash.Add(b.CallbackOwner)
      hash.Add(b.OnClick)
      hash.Add(b.OnPointerDown)
      hash.Add(b.OnPointerMove)
      hash.Add(b.OnPointerUp)
      hash.Add(b.OnPointerCancel)
      hash.Add(b.OnWheel)
      hash.Add(b.Focusable)
      hash.Add(b.TabStop)
      hash.Add(b.Disabled)
      hash.Add(b.AutoFocus)
      hash.Add(b.TransitionMs)
      hash.Add(b.TransitionDelayMs)
      hash.Add(b.TransitionEasing)
      hash.Add(b.TransitionSelection.Low)
      hash.Add(b.TransitionSelection.High)
      if !StyleHash(b, ref hash) || !StyleHash(b.Hover, ref hash) || !StyleHash(b.Active, ref hash) || !StyleHash(b.Focus, ref hash) || !StyleHash(b.DisabledStyle, ref hash) { return }
      var count = 1
      if let text = b as Text { hash.Add(text.Content) }
      if let c = b as Container {
        hash.Add(c.HitTestSelf)
        hash.Add(c.HasAuthoredHitTestSelf)
        hash.Add(c.DragsWindow)
        let children = c.ReuseChildren
        hash.Add(children?.Count ?? 0)
        if children != nil {
          for index in 0 ... children!!.Count {
            let child = children!![index]
            Freeze(child)
            if child.ReuseNodes == 0 { return }
            hash.Add(child.ReuseHash)
            count += child.ReuseNodes
          }
        }
      }
      b.ReuseHash = hash.ToHashCode()
      b.ReuseNodes = count
    }

    private func StyleHash(style Style?, ref hash HashCode) bool {
      hash.Add(style != nil)
      if let entries = style?.Entries() {
        hash.Add(entries.Count)
        var cursor = entries.Cursor()
        while cursor.MoveNext() {
          let e = cursor.Current
          if e.Payload != nil && !(e.Payload is string) { return false }
          hash.Add(e.Field)
          hash.Add(e.A)
          hash.Add(e.B)
          hash.Add(e.C)
          hash.Add(e.D)
          hash.Add(e.Payload as string)
        }
      } else { hash.Add(0) }
      return true
    }

    private func StyleEqual(a Style?, b Style?) bool {
      if a == b { return true }
      if a == nil || b == nil { return false }
      let left = a.Entries()
      let right = b.Entries()
      if (left?.Count ?? 0) != (right?.Count ?? 0) { return false }
      if left != nil && right != nil {
        var lc = left!!.Cursor()
        var rc = right!!.Cursor()
        while lc.MoveNext() {
          rc.MoveNext()
          let x = lc.Current
          let y = rc.Current
          if x.Field != y.Field || x.A != y.A || x.B != y.B || x.C != y.C || x.D != y.D || !Object.Equals(x.Payload, y.Payload) { return false }
        }
      }
      return true
    }

    internal func Equal(a Blob, b Blob) bool {
      if a == b { return true }
      if a.ReuseNodes == 0 || b.ReuseNodes == 0 || a.ReuseHash != b.ReuseHash || a.GetType() != b.GetType() || a.Key != b.Key || a.CallbackOwner != b.CallbackOwner { return false }
      if a.OnClick != b.OnClick || a.OnPointerDown != b.OnPointerDown || a.OnPointerMove != b.OnPointerMove || a.OnPointerUp != b.OnPointerUp || a.OnPointerCancel != b.OnPointerCancel || a.OnWheel != b.OnWheel { return false }
      if a.Focusable != b.Focusable || a.TabStop != b.TabStop || a.Disabled != b.Disabled || a.AutoFocus != b.AutoFocus || a.TransitionMs != b.TransitionMs || a.TransitionDelayMs != b.TransitionDelayMs || a.TransitionEasing != b.TransitionEasing || !sameTransitionSelection(a.TransitionSelection, b.TransitionSelection) { return false }
      if !StyleEqual(a, b) || !StyleEqual(a.Hover, b.Hover) || !StyleEqual(a.Active, b.Active) || !StyleEqual(a.Focus, b.Focus) || !StyleEqual(a.DisabledStyle, b.DisabledStyle) { return false }
      if a is Text && b is Text { return a.Content == b.Content }
      if a is Container && b is Container {
        let x = a
        let y = b
        let left = x.ReuseChildren
        let right = y.ReuseChildren
        let count = left?.Count ?? 0
        if x.HitTestSelf != y.HitTestSelf || x.HasAuthoredHitTestSelf != y.HasAuthoredHitTestSelf || x.DragsWindow != y.DragsWindow || count != (right?.Count ?? 0) { return false }
        for index in 0 ... count {
          if !Equal(left!![index], right!![index]) { return false }
        }
        return true
      }
      return false
    }
  }
}
