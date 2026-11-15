package Goo

import Facebook.Yoga
import System
import System.Collections.Generic

/// Builds content from the element's allotted border-box size in layout units.
/// The element has no intrinsic size. Content cannot change its size.
/// The builder runs before paint when the rounded device-pixel size, inputs, or observed state changes.
/// Zero-sized elements still build. An unbounded axis with no authored size, minimum, or padding resolves to zero.
/// The builder must not write State. Content keeps normal keyed and positional identity.
/// @param build Builds content. Input callbacks belong to the declaring Cell.
/// @returns A retained size-dependent element. Set its size through layout, not through its content.
public func Sized(build (LayoutSize) -> Blob) Blob -> SizedBlob(build)

internal sealed class SizedBlob : Blob {
  internal let Builder (LayoutSize) -> Blob

  internal init(build (LayoutSize) -> Blob) {
    if build == nil { throw ArgumentNullException("build") }
    Builder = build
  }

  internal override func coreBlob() { }
}

internal sealed class SizedNodeState : IDisposable {
  internal var Builder (LayoutSize) -> Blob
  internal var Context ContextFrame?
  internal let Owner Window?
  internal let CallbackOwner Cell?
  internal var Verifier Cell?
  internal let Reads StateReadScope
  internal let ContextReads ContextReader
  internal var Dirty bool = true
  internal var Width float32 = -1.0F
  internal var Height float32 = -1.0F
  internal var ContentWidth float32 = -1.0F
  internal var ContentHeight float32 = -1.0F
  internal var Scale float32
  internal var ContentX float32 = Single.NaN
  internal var ContentY float32 = Single.NaN
  internal var Hidden bool
  private let invalidated Action[ReconcileEffects]?

  internal init(blob SizedBlob, frame ContextFrame?, owner Window?, declaring Cell?, invalidated Action[ReconcileEffects]?) {
    Builder = blob.Builder
    Context = frame
    Owner = owner
    CallbackOwner = blob.CallbackOwner ?? declaring
    this.invalidated = invalidated
    Reads = StateReadScope(CallbackOwner, Invalidate)
    ContextReads = ContextReader{Window: owner, Frame: frame, Invalidated: Invalidate}
  }

  internal func Invalidate() {
    Dirty = true
    invalidated?.Invoke(ReconcileEffects.Content)
  }

  internal func Build(size LayoutSize) Blob {
    ContextReads.Begin()
    let previousReads = Reads.Enter()
    let previousContext = ContextEnvironment.Enter(ContextEnvironment{
      Window: Owner, Frame: Context, Reader: ContextReads, CallbackCell: CallbackOwner})
    var succeeded = false
    try {
      let content = Builder(size)
      if content == nil { throw InvalidOperationException("Sized builder returned nil.") }
      content.Freeze()
      succeeded = true
      return content
    } finally {
      Reads.Exit(previousReads, succeeded)
      ContextEnvironment.Current = previousContext
    }
  }

  public func Dispose() {
    Reads.Dispose()
    ContextReads.Dispose()
    Verifier = nil
  }

  shared {
    internal func Measure(node Facebook.Yoga.Node, width float32, widthMode MeasureMode,
      height float32, heightMode MeasureMode) YGSize -> YGSize{}
  }
}

internal partial class Reconciler {
  private func mountSized(blob SizedBlob) Node {
    let node = Node{Kind: NodeKind.Container, Key: blob.Key}
    applyStyle(node, blob, blob.Focusable, true)
    node.RetainedSizedState = SizedNodeState(blob, Context, Owner, expandingCell, RetainedInvalidated)
    return node
  }

  private func diffSized(node Node, blob SizedBlob) Node {
    if !canReuseNode(node, blob) { return replace(node, blob) }
    applyStyle(node, blob, blob.Focusable, false)
    var state = node.RetainedSizedState!!
    if state.Owner != Owner || state.CallbackOwner != (blob.CallbackOwner ?? expandingCell) {
      state.Dispose()
      state = SizedNodeState(blob, Context, Owner, expandingCell, RetainedInvalidated)
      node.RetainedSizedState = state
    }
    state.Dirty = true
    state.Builder = blob.Builder
    state.Context = Context
    state.ContextReads.Frame = Context
    state.ContextReads.Refresh()
    state.Verifier = verifyingCell
    return node
  }

  internal func BuildSized(node Node, size LayoutSize) {
    let state = node.RetainedSizedState!!
    let previousContext = Context
    let previousVerifier = verifyingCell
    Context = state.Context
    try {
      let content = state.Build(size)
      verifyingCell = state.Reads.StateChanged ? nil : state.Verifier
      diffChildren(node, []Blob{content})
      if let verifier = verifyingCell && verifier.verificationChanged {
        throw InvalidOperationException("${verifier.GetType().Name}.Build changed its tree without a tracked State write.")
      }
      state.ContextReads.Commit()
      state.Reads.StateChanged = false
      state.Dirty = false
      state.Verifier = nil
    } catch (_ Exception) {
      state.ContextReads.Cancel()
      state.Dirty = true
      rethrow
    } finally {
      Context = previousContext
      verifyingCell = previousVerifier
    }
  }
}

internal partial class Layout {
  private let sizedNodes List[Node] = List[Node]()
  private var sizedRoot Node?
  private var sizedListDirty bool = true

  private func collectSized(node Node) {
    if node.IsPortal {
      guard let yoga = node.Yoga else { return }
      if YGNodeAPI.YGNodeIsDirty(yoga) { return }
    }
    if node.RetainedSizedState != nil { sizedNodes.Add(node) }
    for child in node.Children { collectSized(child) }
  }

  internal func MarkPortalStructureDirty() { portalStructureDirty = true }

  internal func HasSized(root Node) bool {
    if sizedListDirty || sizedRoot != root {
      sizedNodes.Clear()
      collectSized(root)
      sizedRoot = root
      sizedListDirty = false
    }
    return sizedNodes.Count != 0
  }

  internal func NeedsSizedRefresh(root Node) bool {
    if !HasSized(root) { return false }
    let scale = YGConfigAPI.YGConfigGetPointScaleFactor(config)
    for node in sizedNodes {
      guard let state = node.RetainedSizedState else { continue }
      if node.Retired { continue }
      if state.Dirty || state.Width != node.Rect.W || state.Height != node.Rect.H || state.Scale != scale {
        return true
      }
      for child in node.Children {
        if let yoga = child.Yoga && !child.IsPortal && YGNodeAPI.YGNodeIsDirty(yoga) { return true }
      }
    }
    return false
  }

  internal func RefreshSized(root Node, rec Reconciler) {
    if !HasSized(root) { return }
    let scale = YGConfigAPI.YGConfigGetPointScaleFactor(config)
    var index = 0
    while index < sizedNodes.Count {
      let node = sizedNodes[index]
      index++
      if node.Retired { continue }
      guard let state = node.RetainedSizedState else { continue }
      let resized = state.Width != node.Rect.W || state.Height != node.Rect.H || state.Scale != scale
      if state.Dirty || resized {
        rec.BuildSized(node, LayoutSize(float64(node.Rect.W), float64(node.Rect.H)))
        rec.FlushStyles()
        for child in node.Children {
          if !child.IsPortal { syncNode(child, true) }
          collectSized(child)
        }
        lengthRoot = nil
        resolveLengths(root, CustomLayouts.ViewportWidth, CustomLayouts.ViewportHeight)
        state.Width = node.Rect.W
        state.Height = node.Rect.H
        state.Scale = scale
      }
      arrangeSized(node)
    }
    if (rec.Effects & ReconcileEffects.Structure) != ReconcileEffects.None {
      scrollListDirty = true
      sizedListDirty = true
      lengthRoot = nil
    }
  }

  private func arrangeSized(node Node, hidden bool = false) {
    guard let yoga = node.Yoga else { return }
    let width = BoxGeometry.ContentWidth(node)
    let height = BoxGeometry.ContentHeight(node)
    let x = node.Rect.X + CustomLayouts.Inset(yoga, YGEdge.Left)
    let y = node.Rect.Y + CustomLayouts.Inset(yoga, YGEdge.Top)
    let state = node.RetainedSizedState!!
    let resized = state.ContentWidth != width || state.ContentHeight != height
    let moved = state.ContentX != x || state.ContentY != y || state.Hidden != hidden
    for child in node.Children {
      if child.IsPortal { continue }
      guard let childYoga = child.Yoga else { continue }
      if resized || YGNodeAPI.YGNodeIsDirty(childYoga) {
        YGNodeAPI.YGNodeCalculateLayout(childYoga, width, height, yogaDirection(child.Direction))
        resolveFinalIntrinsic(child, width, height)
        readRect(child, x, y, hidden: hidden)
      } else if moved {
        readRect(child, x, y, hidden: hidden)
      }
    }
    state.ContentWidth = width
    state.ContentHeight = height
    state.ContentX = x
    state.ContentY = y
    state.Hidden = hidden
    if node.OverflowX == Overflow.Scroll || node.OverflowY == Overflow.Scroll {
      measureScrollExtent(node, yoga)
    }
  }
}
