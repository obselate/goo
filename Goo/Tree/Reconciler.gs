package Goo

import System
import System.Collections.Generic

internal class Reconciler {
  internal prop CellInvalidated Action[Cell]? { get; init; }
  internal prop ImageCompleted((Node, object) -> void)? { get; init; }
  internal prop RetainedInvalidated Action[ReconcileEffects]? { get; init; }
  internal prop Res Resolver{ get; init; }
  internal prop ChildScratch ChildDiffScratch? { get; init; }
  internal prop Profiler FrameProfiler? { get; init; }
  internal prop DeferStyleFlush bool{ get; init; }
  internal prop Pump MotionPump? { get; init; }
  internal var Effects ReconcileEffects
  internal var ProfileBuildTicks int64
  internal var ProfileBuildBytes int64
  internal var ProfileBuildCalls int64
  internal var ProfileResolveTicks int64
  internal var ProfileResolveBytes int64
  internal var ProfileResolveCalls int64
  private var fallbackChildScratch ChildDiffScratch?
  private var styleRetryRoot Node?
  private var deferredRetirement Node?

  private func renderCell(cell Cell) Blob {
    guard let profiler = Profiler else {
      return cell.Render()
    }
    let start = profiler.Start()
    let result = cell.Render()
    let elapsed = profiler.Elapsed(start)
    ProfileBuildTicks = ProfileBuildTicks + elapsed.Ticks
    ProfileBuildBytes = ProfileBuildBytes + elapsed.Bytes
    ProfileBuildCalls++
    return result
  }

  private func invalidateStyle(n Node, initial bool) {
    Res.Invalidate(n, initial)
  }

  internal func MarkEffects(e ReconcileEffects) {
    Effects = ReconcileEffects(int32(Effects) | int32(e))
  }

  private func markMounted() {
    MarkEffects(ReconcileEffects.Structure | ReconcileEffects.Style | ReconcileEffects.Content
      | ReconcileEffects.Layout | ReconcileEffects.Paint | ReconcileEffects.Input)
  }

  private func markStructure() {
    MarkEffects(ReconcileEffects.Structure | ReconcileEffects.Layout
      | ReconcileEffects.Paint | ReconcileEffects.Input)
  }

  internal func FlushStyles() {
    guard let profiler = Profiler else {
      Res.Flush()
      MarkEffects(Res.FlushEffects())
      styleRetryRoot = nil
      return
    }
    let start = profiler.Start()
    let nodes = Res.Flush()
    let elapsed = profiler.Elapsed(start)
    ProfileResolveTicks = ProfileResolveTicks + elapsed.Ticks
    ProfileResolveBytes = ProfileResolveBytes + elapsed.Bytes
    if nodes > 0 {
      ProfileResolveCalls++
      profiler.RecordStyleResolveNodes(nodes)
    }
    MarkEffects(Res.FlushEffects())
    styleRetryRoot = nil
  }

  internal func DiscardStyles() {
    Res.DiscardPending()
    if let root = styleRetryRoot {
      retryStyles(root)
    }
  }

  internal func Mount(b Blob) Node {
    let outer = operationDepth == 0
    operationDepth++
    var completed = false
    try {
      let result = mountCore(b)
      if outer && !DeferStyleFlush {
        FlushStyles()
      }
      completed = true
      return result
    } finally {
      operationDepth--
      if outer && !completed {
        DiscardStyles()
      }
    }
  }

  private var operationDepth int32

  private func mountCore(b Blob) Node {
    let result = switch b {
      case v is VirtualBlobBase: mountVirtual(v)
      case retained is VirtualRetainedBlob: throw InvalidOperationException("Retained virtual item cannot be mounted")
      case lava is LavaSurface: mountLava(lava)
      case bt is Button: mountButton(bt)
      case c is Container: mountContainer(c)
      case t is Text: mountText(t)
      case t is TextEntry: mountEntry(t)
      case t is TextEditor: mountEditor(t)
      case s is Shape: mountShape(s)
      case i is Image: mountImage(i)
      case e is CellElement: expandCell(nil, e)
      case _: throw NotSupportedException("Reconciler.Mount: unhandled Blob kind " + b.GetType().Name)
    }
    try {
      if !(b is CellElement) {
        reconcileSparseState(result, b)
      }
    } catch (error Exception) {
      TextLayouts.DisposeTree(result)
      throw error
    }
    markMounted()
    return result
  }

  internal func MountRoot(cell Cell) Node {
    cell.ClaimMount(cell.GetType())
    try {
      if let pump = Pump {
        cell.BindPump(pump)
      }
      cell.SetRetainedMotionInvalidation(RetainedInvalidated)
      cell.SetRebuildSubmission(CellInvalidated)
      cell.mountKey = nil
      return rebuildMounted(nil, cell, nil)
    } catch (error Exception) {
      cell.ReleaseMountClaim()
      throw error
    }
  }

  internal func mountContainer(c Container) Node {
    let n = Node{ Kind: NodeKind.Container, Key: c.Key }
    applyContainer(n, c, true)
    mountChildren(n, c.Children)
    return n
  }

  internal func mountVirtual(b VirtualBlobBase) Node {
    let n = Node{ Kind: NodeKind.Container, Key: b.Key }
    let state = applyVirtual(n, b, true)
    try {
      let children = b.Prepare(state, n)
      mountChildren(n, children)
      state.Commit()
      return n
    } catch (error Exception) {
      state.Cancel()
      throw error
    }
  }

  internal func applyVirtual(n Node, b Blob, initial bool) VirtualNodeState {
    applyStyle(n, b, b.Focusable, initial)
    return Virtualization.Configure(n)
  }

  internal func diffVirtual(n Node, b VirtualBlobBase) Node {
    if n.Kind != NodeKind.Container || n.Key != b.Key || Virtualization.State(n) == nil {
      return replace(n, b)
    }
    let state = applyVirtual(n, b, false)
    try {
      let children = b.Prepare(state, n)
      diffChildren(n, children)
      state.Commit()
      return n
    } catch (error Exception) {
      state.Cancel()
      throw error
    }
  }

  internal func mountLava(l LavaSurface) Node {
    let n = Node{ Kind: NodeKind.Lava, Key: l.Key }
    applyLava(n, l, true)
    return n
  }

  internal func applyLava(n Node, l LavaSurface, initial bool) {
    applyStyle(n, l, l.Focusable, initial)
    let changed = initial
      || n.LavaFlow != l.Flow
      || n.LavaForm != l.Form
      || n.LavaBlend != l.Blend
      || n.LavaLight != l.Light
      || n.LavaHue != l.Hue
      || n.LavaRainbow != l.Rainbow
      || n.LavaRotation.X != l.Rotation.X
      || n.LavaRotation.Y != l.Rotation.Y
      || n.LavaSeed != l.Seed
    n.LavaFlow = l.Flow
    n.LavaForm = l.Form
    n.LavaBlend = l.Blend
    n.LavaLight = l.Light
    n.LavaHue = l.Hue
    n.LavaRainbow = l.Rainbow
    n.LavaRotation = l.Rotation
    n.LavaSeed = l.Seed
    if changed {
      MarkEffects(ReconcileEffects.Paint)
    }
  }

  internal func diffLava(n Node, l LavaSurface) Node {
    if n.Kind != NodeKind.Lava || n.Key != l.Key {
      return replace(n, l)
    }
    applyLava(n, l, false)
    return n
  }

  internal func mountButton(b Button) Node {
    let n = Node{ Kind: NodeKind.Button, Key: b.Key }
    applyButton(n, b, true)
    mountChildren(n, b.Children)
    return n
  }

  internal func mountChildren(n Node, children IList[Blob]) {
    let scratch = keyedScratch()
    let scratchScope = scratch.Rent()
    try {
      validateChildren(children, scratchScope)
      for child in children {
        let mounted = Mount(child)
        mounted.Parent = n
        n.Children.Add(mounted)
      }
    } catch (error Exception) {
      TextLayouts.DisposeTree(n)
      throw error
    } finally {
      scratch.Return(scratchScope)
    }
  }

  internal func mountText(t Text) Node {
    let n = Node{ Kind: NodeKind.Text, Key: t.Key }
    applyText(n, t, true)
    return n
  }

  internal func applyStyle(n Node, b Blob, focusable bool, initial bool) {
    applyStyleEntries(n, b, b.Entries(), focusable, initial)
  }

  internal func applyStyleEntries(n Node, b Blob, entries StyleEntries?, focusable bool, initial bool) {
    let hover = b.Hover?.Entries()
    let active = b.Active?.Entries()
    let focus = b.Focus?.Entries()
    let disabled = b.DisabledStyle?.Entries()
    let nextFocusable = focusable && !b.Disabled
    let baseChanged = !sameStyleEntries(n.BaseStyle, entries)
    let hoverChanged = !sameStyleEntries(n.HoverStyle, hover)
    let activeChanged = !sameStyleEntries(n.ActiveStyle, active)
    let focusChanged = !sameStyleEntries(n.FocusStyle, focus)
    let disabledStyleChanged = !sameStyleEntries(n.DisabledStyle, disabled)
    let transitionChanged = n.TransitionMs != b.TransitionMs
      || n.TransitionDelayMs != b.TransitionDelayMs
      || n.TransitionEasing != b.TransitionEasing
      || !sameTransitionSelection(n.TransitionSelection, b.TransitionSelection)
    let layoutTransitionChanged = !sameLayoutTransition(LayoutTransitions.Value(n), b.LayoutTransition)
    let disabledChanged = n.Disabled != b.Disabled
    let styleChanged = initial
      || baseChanged
      || hoverChanged
      || activeChanged
      || focusChanged
      || disabledStyleChanged
      || transitionChanged
      || layoutTransitionChanged
      || disabledChanged
    if styleChanged {
      if baseChanged { n.BaseStyle = entries }
      if hoverChanged { n.HoverStyle = hover }
      if activeChanged { n.ActiveStyle = active }
      if focusChanged { n.FocusStyle = focus }
      if disabledStyleChanged { n.DisabledStyle = disabled }
      if transitionChanged {
        n.TransitionMs = b.TransitionMs
        n.TransitionDelayMs = b.TransitionDelayMs
        n.TransitionEasing = b.TransitionEasing
        n.TransitionSelection = b.TransitionSelection
      }
      if layoutTransitionChanged {
        LayoutTransitions.Configure(n, b.LayoutTransition, Pump, RetainedInvalidated)
      }
      if disabledChanged { n.Disabled = b.Disabled }
      invalidateStyle(n, initial)
      MarkEffects(ReconcileEffects.Style)
    }
    let scrollbarVisibilityChanged = n.ScrollbarVisibility != b.ScrollbarVisibility
    if scrollbarVisibilityChanged {
      n.ScrollbarVisibility = b.ScrollbarVisibility
      n.ScrollBarAlpha = 0.0F
      n.ScrollIdle = 0.0F
      MarkEffects(ReconcileEffects.Paint)
    }

    var inputChanged = disabledChanged || scrollbarVisibilityChanged
    if n.Focusable != nextFocusable {
      n.Focusable = nextFocusable
      inputChanged = true
    }
    let nextAutoFocus = b.AutoFocus && nextFocusable
    if n.AutoFocus != nextAutoFocus {
      n.AutoFocus = nextAutoFocus
      inputChanged = true
    }
    if (n.OnClick != nil) != (b.OnClick != nil) { inputChanged = true }
    n.OnClick = b.OnClick
    if (n.OnPointerDown != nil) != (b.OnPointerDown != nil) { inputChanged = true }
    n.OnPointerDown = b.OnPointerDown
    if (n.OnPointerMove != nil) != (b.OnPointerMove != nil) { inputChanged = true }
    n.OnPointerMove = b.OnPointerMove
    if (n.OnPointerUp != nil) != (b.OnPointerUp != nil) { inputChanged = true }
    n.OnPointerUp = b.OnPointerUp
    if (n.OnPointerCancel != nil) != (b.OnPointerCancel != nil) { inputChanged = true }
    n.OnPointerCancel = b.OnPointerCancel
    if (n.OnWheel != nil) != (b.OnWheel != nil) { inputChanged = true }
    n.OnWheel = b.OnWheel
    let nextHitTestSelf = resolvedHitTestSelf(b, focusable, entries, hover, active)
    if n.HitTestSelf != nextHitTestSelf {
      n.HitTestSelf = nextHitTestSelf
      inputChanged = true
    }
    if inputChanged {
      MarkEffects(ReconcileEffects.Input)
    }
  }

  internal func applyContainer(n Node, c Container, initial bool) {
    applyStyle(n, c, c.Focusable, initial)
    if !Transforming.SameVectorViewport(Transforming.GetVectorViewport(n), c.VectorViewport) {
      Transforming.SetVectorViewport(n, c.VectorViewport)
      MarkEffects(ReconcileEffects.Paint | ReconcileEffects.Input)
    }
    if n.PinToBottom != c.PinToBottom {
      n.PinToBottom = c.PinToBottom
      MarkEffects(ReconcileEffects.Layout)
      MarkEffects(ReconcileEffects.Paint)
    }
    if n.DragsWindow != c.DragsWindow {
      n.DragsWindow = c.DragsWindow
      MarkEffects(ReconcileEffects.Input)
    }
  }

  internal func applyButton(n Node, b Button, initial bool) {
    let justify = StyleEntry{
      Field: StyleField.JustifyContent,
      A: float32(int32(JustifyContent.Center)),
    }
    let align = StyleEntry{
      Field: StyleField.AlignItems,
      A: float32(int32(AlignItems.Center)),
    }
    let author = b.Entries()
    var entries = n.BaseStyle
    if !sameButtonStyleEntries(entries, justify, align, author) {
      let changed = StyleEntries{}
      changed.Add(justify)
      changed.Add(align)
      if let authored = author {
        changed.AddRange(authored)
      }
      entries = changed
    }
    applyStyleEntries(n, b, entries, true, initial)
  }

  internal func applyText(n Node, t Text, initial bool) {
    applyStyle(n, t, t.Focusable, initial)
    let rangeChange = PassiveTextPresentations.Apply(n, t.Content, t.StyleRangeValues)
    if n.Content != t.Content {
      n.Content = t.Content
      TextLayouts.Invalidate(n)
      MarkEffects(ReconcileEffects.Content)
      MarkEffects(ReconcileEffects.Layout)
      MarkEffects(ReconcileEffects.Paint)
    } else if rangeChange.Changed {
      if rangeChange.FlowChanged {
        TextLayouts.Invalidate(n)
        MarkEffects(ReconcileEffects.Layout)
      } else {
        TextLayouts.RefreshRich(n)
      }
      MarkEffects(ReconcileEffects.Paint)
    }
  }

  internal func mountEntry(t TextEntry) Node {
    let n = Node{ Kind: NodeKind.Entry, Key: t.Key }
    applyEntry(n, t, true)
    return n
  }

  internal func diffEntry(n Node, t TextEntry) Node {
    if n.Kind != NodeKind.Entry || n.Key != t.Key {
      return replace(n, t)
    }
    applyEntry(n, t, false)
    return n
  }

  internal func mountEditor(t TextEditor) Node {
    let n = Node{ Kind: NodeKind.Editor, Key: t.Key }
    let layers = t.LayerValues
    applyEditor(n, t, layers, true)
    mountChildren(n, editorSlotBlobs(layers))
    applyEditorSlotMetadata(n, layers)
    return n
  }

  internal func diffEditor(n Node, t TextEditor) Node {
    if n.Kind != NodeKind.Editor || n.Key != t.Key || n.EditorController != t.Controller {
      return replace(n, t)
    }
    let layers = t.LayerValues
    applyEditor(n, t, layers, false)
    diffChildren(n, editorSlotBlobs(layers))
    applyEditorSlotMetadata(n, layers)
    return n
  }

  internal func applyEditor(n Node, t TextEditor, layers []TextPresentationLayer,
    initial bool) {
      applyStyle(n, t, true, initial)
      var contentChanged = false
      var paintChanged = false
      var inputChanged = false
      if n.EditorState == nil {
        validateEditorLayerOverlaps(layers)
        t.Controller.Attach(n)
        n.EditorController = t.Controller
        n.EditorState = TextEditorRenderState(n, t.Controller.Document, t.Controller, layers, t.ReadOnly,
          RetainedInvalidated)
        contentChanged = true
        paintChanged = true
        inputChanged = true
      } else if let state = n.EditorState {
        if !state.MatchesLayers(layers) { validateEditorLayerOverlaps(layers) }
        state.Apply(layers, t.ReadOnly)
      }
      if n.EditorReadOnly != t.ReadOnly {
        n.EditorReadOnly = t.ReadOnly
        inputChanged = true
      }
      if n.Placeholder != t.Placeholder {
        n.Placeholder = t.Placeholder
        paintChanged = true
      }
      if !n.SelectionColor.Equals(t.SelectionColor) {
        n.SelectionColor = t.SelectionColor
        paintChanged = true
      }
      if !n.EditorCaretColor.Equals(t.CaretColor) {
        n.EditorCaretColor = t.CaretColor
        paintChanged = true
      }
      if !n.EditorCurrentLineColor.Equals(t.CurrentLineColor) {
        n.EditorCurrentLineColor = t.CurrentLineColor
        paintChanged = true
      }
      if n.EditorOverscanLines != t.OverscanLines {
        n.EditorOverscanLines = t.OverscanLines
        TextEditorLayouts.Invalidate(n)
        contentChanged = true
        paintChanged = true
      }
      n.EditorOnChange = t.OnChange
      n.EditorOnSubmit = t.OnSubmit
      if contentChanged {
        TextEditorLayouts.Invalidate(n)
        MarkEffects(ReconcileEffects.Content)
        MarkEffects(ReconcileEffects.Layout)
      }
      if paintChanged { MarkEffects(ReconcileEffects.Paint) }
      if inputChanged { MarkEffects(ReconcileEffects.Input) }
    }

  private func editorSlotBlobs(layers []TextPresentationLayer) IList[Blob] {
    let result = List[Blob]()
    for layerIndex in 0 ... layers.Length {
      let layer = layers[layerIndex]
      for projection in layer.ReadProjections() {
        if projection.Kind != TextProjectionKind.InlineSlot
          && projection.Kind != TextProjectionKind.BlockSlot{
            continue
          }
        guard let content = projection.Content else { continue }
        result.Add(Container{
          Key: textEditorSlotKey(layer, projection),
          Position: PositionType.Absolute,
          Children: { content },
        })
      }
    }
    return result
  }

  private func applyEditorSlotMetadata(n Node, layers []TextPresentationLayer) {
    var childIndex int32 = 0
    for layer in layers {
      for projection in layer.ReadProjections() {
        if (projection.Kind != TextProjectionKind.InlineSlot
            && projection.Kind != TextProjectionKind.BlockSlot) || projection.Content == nil {
              continue
            }
        if childIndex >= n.Children.Count {
          return
        }
        let child = n.Children[childIndex]
        child.EditorSlotRange = projection.Range
        child.EditorSlotKey = textEditorSlotKey(layer, projection)
        child.EditorSlotBlock = projection.Kind == TextProjectionKind.BlockSlot
        childIndex++
      }
    }
  }

  // Focus-wins: while focused the node buffer is authoritative and Value is ignored.
  internal func applyEntry(n Node, t TextEntry, initial bool) {
    applyStyle(n, t, true, initial)
    var paintChanged = false
    if n.Password != t.Password {
      n.Password = t.Password
      MarkEffects(ReconcileEffects.Accessibility)
      paintChanged = true
    }
    if n.Placeholder != t.Placeholder {
      n.Placeholder = t.Placeholder
      paintChanged = true
    }
    if !n.SelectionColor.Equals(t.SelectionColor) {
      n.SelectionColor = t.SelectionColor
      paintChanged = true
    }
    n.OnChange = t.OnChange
    n.OnSubmit = t.OnSubmit
    if !n.Focused {
      if n.Buffer != t.Value {
        n.Buffer = t.Value
        if n.Caret > n.Buffer.Length { n.Caret = n.Buffer.Length }
        if n.Anchor > n.Buffer.Length { n.Anchor = n.Buffer.Length }
        MarkEffects(ReconcileEffects.Content)
        paintChanged = true
      }
    }
    if paintChanged {
      MarkEffects(ReconcileEffects.Paint)
    }
  }

  internal func Diff(n Node, b Blob) Node {
    let outer = operationDepth == 0
    if outer {
      rememberStyleRetryRoot(n)
    }
    operationDepth++
    var completed = false
    try {
      let result = diffCore(n, b)
      if outer && !DeferStyleFlush {
        FlushStyles()
      }
      completed = true
      return result
    } finally {
      operationDepth--
      if outer && !completed {
        DiscardStyles()
      }
    }
  }

  private func rememberStyleRetryRoot(n Node) {
    var root = n
    while let parent = root.Parent {
      root = parent
    }
    if let current = styleRetryRoot {
      if current == root {
        return
      }
    }
    styleRetryRoot = root
  }

  private func diffKeyedHit(n Node, b Blob) Node {
    let prior = deferredRetirement
    deferredRetirement = n
    try {
      return Diff(n, b)
    } finally {
      deferredRetirement = prior
    }
  }

  private func diffCore(n Node, b Blob) Node {
    if b is VirtualRetainedBlob {
      if n.Retired || n.Key != b.Key {
        throw InvalidOperationException("Retained virtual item does not match the mounted node")
      }
      return n
    }
    if n.Fiber != nil && !(b is CellElement) {
      let replacement = replace(n, b)
      TextLayouts.DisposeTree(n)
      markStructure()
      return replacement
    }
    let result = switch b {
      case v is VirtualBlobBase: diffVirtual(n, v)
      case lava is LavaSurface: diffLava(n, lava)
      case bt is Button: diffButton(n, bt)
      case c is Container: diffContainer(n, c)
      case t is Text: diffText(n, t)
      case t is TextEntry: diffEntry(n, t)
      case t is TextEditor: diffEditor(n, t)
      case s is Shape: diffShape(n, s)
      case i is Image: diffImage(n, i)
      case e is CellElement: expandCell(n, e)
      case _: throw NotSupportedException("Reconciler.Diff: unhandled Blob kind " + b.GetType().Name)
    }
    if !(b is CellElement) {
      reconcileSparseState(result, b)
    }
    if result != n {
      if deferredRetirement != n {
        TextLayouts.DisposeTree(n)
      }
      markStructure()
    }
    return result
  }

  private func reconcileSparseState(n Node, b Blob) {
    if b.HasSparseInputState || n.HasSparseInputState {
      if b.HasElementHandle {
        ElementHandles.Bind(n, b.Handle)
      } else if n.HasElementHandle {
        ElementHandles.Bind(n, nil)
      }
      let keyboardChanged = InputCallbacks.Sync(n, b)
      let textChanged = TextInputCallbacks.Sync(n, b)
      let dragDropChanged = DragDropMetadata.Sync(n, b)
      n.HasSparseInputState = b.HasSparseInputState || n.HasElementHandle
      if keyboardChanged || textChanged || dragDropChanged {
        MarkEffects(ReconcileEffects.Input)
      }
    }
    if b.HasAccessibility || n.HasAccessibilityDeclaration {
      if AccessibilityMetadata.Sync(n, b) {
        MarkEffects(ReconcileEffects.Accessibility)
      }
    }
  }

  private func replace(n Node, b Blob) Node {
    let previous = ElementHandles.Detach(n)
    try {
      return Mount(b)
    } catch (error Exception) {
      if let handle = previous {
        ElementHandles.Bind(n, handle)
      }
      throw error
    }
  }

  // Reuse-or-replace the fiber, seed once, configure every time; detach the
  // hook before recursing so an inner kind-change teardown can't touch it.
  internal func expandCell(existing Node?, e CellElement) Node ->
  expandCellAt(existing, e, existing?.Fiber, nil)

  internal func createCell(e CellElement) Cell {
    let cell = e.CreateCell()
    if Object.ReferenceEquals(cell, nil) {
      throw InvalidOperationException("Cell factory returned nil")
    }
    cell.ClaimMount(e.CellType)
    return cell
  }

  private func mountType(cell Cell) Type -> cell.mountType ?? cell.GetType()

  internal func expandCellAt(existing Node?, e CellElement, prior Cell?, owner Cell?) Node {
    let reused Cell? = if let old = prior && mountType(old) == e.CellType && old.mountKey == e.Key && !old.disposed { old } else { nil }

    if let cell = reused {
      if let pump = Pump {
        cell.BindPump(pump)
      }
      cell.SetRetainedMotionInvalidation(RetainedInvalidated)
      cell.SetRebuildSubmission(nil)
      e.ApplyInput(cell)
      if let cfg = e.Configure { cfg(cell) }
      cell.SetRebuildSubmission(CellInvalidated)

      if existing != nil && !cell.IsDirty() {
        if let child = cell.directChild {
          if child.HasDirty() {
            return rebuildMounted(existing, child, cell)
          }
        }
        if let parent = owner {
          parent.directChild = cell
        } else {
          existing.Fiber = cell
        }
        return existing
      }
      return rebuildMounted(existing, cell, owner)
    }

    let fresh = createCell(e)
    fresh.mountKey = e.Key
    if let pump = Pump {
      fresh.BindPump(pump)
    }
    fresh.SetRetainedMotionInvalidation(RetainedInvalidated)
    try {
      if let seed = e.Seed { seed(fresh) }
      fresh.SetRebuildSubmission(nil)
      e.ApplyInput(fresh)
      if let cfg = e.Configure { cfg(fresh) }
      fresh.SetRebuildSubmission(CellInvalidated)

      let result = rebuildMounted(existing, fresh, owner)
      if let old = prior {
        old.DisposeMounted()
      }
      return result
    } catch (error Exception) {
      fresh.DisposeMounted()
      throw error
    }
  }

  internal func rebuildMounted(existing Node?, cell Cell, owner Cell?) Node {
    let slotKey = existing?.Key
    let top = existing?.Fiber

    cell.ClearDirty()
    var completed = false
    var detached Node? = nil
    try {
      let inner = renderCell(cell)
      var result Node
      if inner is CellElement {
        result = expandCellAt(existing, inner, cell.directChild, cell)
      } else {
        if let direct = cell.directChild {
          cell.directChild = nil
          direct.DisposeMounted()
        }
        if let n = existing {
          n.Fiber = nil
          detached = n
          n.Key = cell.outputKey
          result = Diff(n, inner)
        } else {
          result = Mount(inner)
        }
        cell.outputKey = inner.Key
      }

      if let parent = owner {
        parent.directChild = cell
        result.Fiber = top
        result.Key = slotKey
      } else {
        result.Fiber = cell
        result.Key = cell.mountKey
      }
      cell.AttachMount(result, owner)
      if let retained = result.Fiber {
        retained.RefreshDirectMounts(result)
      }
      completed = true
      return result
    } finally {
      if !completed {
        if let prior = detached {
          if !prior.Retired {
            if prior.Fiber == nil {
              prior.Fiber = top
            }
            prior.Key = slotKey
          }
        }
        cell.RestoreDirtyAndSubmit()
      }
    }
  }

  private func retryStyles(n Node) {
    if n.Retired {
      return
    }
    Res.Invalidate(n, false)
    for child in n.Children {
      retryStyles(child)
    }
  }

  internal func RebuildFiber(n Node, cell Cell) Node {
    let outer = operationDepth == 0
    if outer {
      rememberStyleRetryRoot(n)
    }
    operationDepth++
    try {
      return rebuildDirty(n, cell, nil)
    } finally {
      operationDepth--
    }
  }

  internal func rebuildDirty(n Node, cell Cell, owner Cell?) Node {
    if cell.IsDirty() {
      return rebuildMounted(n, cell, owner)
    }
    if let child = cell.directChild {
      if child.HasDirty() {
        return rebuildDirty(n, child, cell)
      }
    }
    return n
  }

  internal func mountShape(s Shape) Node {
    let n = Node{ Kind: NodeKind.Shape, Key: s.Key }
    applyShape(n, s, true)
    return n
  }

  internal func applyShape(n Node, s Shape, initial bool) {
    applyStyle(n, s, s.Focusable, initial)
    var contentChanged = false
    var layoutChanged = false
    var paintChanged = false
    var hitGeometryChanged = false
    if !n.ShapePath.Equals(s.Path) {
      n.ShapePath = s.Path
      syncYogaField(n, StyleField.AspectRatio)
      contentChanged = true
      layoutChanged = true
      paintChanged = true
      hitGeometryChanged = true
    }
    if n.ShapeFit != s.Fit {
      n.ShapeFit = s.Fit
      paintChanged = true
      hitGeometryChanged = true
    }
    if n.ShapeFillRule != s.FillRule {
      n.ShapeFillRule = s.FillRule
      paintChanged = true
      hitGeometryChanged = true
    }
    if n.ShapeStrokeCap != s.StrokeCap {
      n.ShapeStrokeCap = s.StrokeCap
      paintChanged = true
      hitGeometryChanged = true
    }
    if n.ShapeStrokeJoin != s.StrokeJoin {
      n.ShapeStrokeJoin = s.StrokeJoin
      paintChanged = true
      hitGeometryChanged = true
    }
    if n.MiterLimit != s.MiterLimit {
      n.MiterLimit = s.MiterLimit
      paintChanged = true
      hitGeometryChanged = true
    }
    if n.ShapeCornerRadius != s.CornerRadius {
      n.ShapeCornerRadius = s.CornerRadius
      paintChanged = true
      hitGeometryChanged = true
    }
    if n.ShapeStrokeInset != s.StrokeInset {
      n.ShapeStrokeInset = s.StrokeInset
      paintChanged = true
      hitGeometryChanged = true
    }
    if !sameDashPattern(n.Dashes, s.Dashes) {
      n.Dashes = s.Dashes
      paintChanged = true
      hitGeometryChanged = true
    }
    if contentChanged {
      MarkEffects(ReconcileEffects.Content)
    }
    if layoutChanged {
      MarkEffects(ReconcileEffects.Layout)
    }
    if paintChanged {
      MarkEffects(ReconcileEffects.Paint)
    }
    if hitGeometryChanged {
      MarkEffects(ReconcileEffects.Input)
    }
  }

  internal func diffShape(n Node, s Shape) Node {
    if n.Kind != NodeKind.Shape || n.Key != s.Key {
      return replace(n, s)
    }
    applyShape(n, s, false)
    return n
  }

  internal func mountImage(i Image) Node {
    let n = Node{ Kind: NodeKind.Image, Key: i.Key }
    applyImage(n, i, true)
    return n
  }

  internal func applyImage(n Node, i Image, initial bool) {
    applyStyle(n, i, i.Focusable, initial)
    let sourceChanged = if let source = i.Source {
      initial || n.ImageSource != source
    } else {
      initial || ImageLayouts.Source(n) != nil || !ImageDecoding.MatchesPath(n.ImageRequest, i.Path)
    }
    let fitChanged = n.ImageFit != i.Fit
    if sourceChanged {
      if let source = i.Source {
        ImageLayouts.ApplySource(n, source, i.Fit, ImageCompleted)
      } else {
        ImageLayouts.ApplyPath(n, i.Path, i.Fit, ImageCompleted)
      }
      MarkEffects(ReconcileEffects.Content)
      MarkEffects(ReconcileEffects.Layout)
      MarkEffects(ReconcileEffects.Paint)
    } else if fitChanged {
      n.ImageFit = i.Fit
      MarkEffects(ReconcileEffects.Paint)
    } else if ImageLayouts.Refresh(n) {
      MarkEffects(ReconcileEffects.Content)
      MarkEffects(ReconcileEffects.Layout)
      MarkEffects(ReconcileEffects.Paint)
    }
  }

  internal func diffImage(n Node, i Image) Node {
    if n.Kind != NodeKind.Image || n.Key != i.Key {
      return replace(n, i)
    }
    applyImage(n, i, false)
    return n
  }

  internal func diffContainer(n Node, c Container) Node {
    if n.Kind != NodeKind.Container || n.Key != c.Key || Virtualization.State(n) != nil {
      return replace(n, c)
    }
    applyContainer(n, c, false)
    diffChildren(n, c.Children)
    return n
  }

  internal func diffButton(n Node, b Button) Node {
    if n.Kind != NodeKind.Button || n.Key != b.Key {
      return replace(n, b)
    }
    applyButton(n, b, false)
    diffChildren(n, b.Children)
    return n
  }

  internal func diffText(n Node, t Text) Node {
    if n.Kind != NodeKind.Text || n.Key != t.Key {
      return replace(n, t)
    }
    applyText(n, t, false)
    return n
  }

  internal func diffChildren(n Node, blobs IList[Blob]) {
    let scratch = keyedScratch()
    let scratchScope = scratch.Rent()
    try {
      validateChildren(blobs, scratchScope)
      if blobs.Count == 0 || blobs[0].Key == nil {
        diffUnkeyedChildren(n, blobs, scratchScope.Retire)
      } else {
        diffKeyedChildren(n, blobs, scratchScope)
      }
    } finally {
      scratch.Return(scratchScope)
    }
  }

  private func diffUnkeyedChildren(n Node, blobs IList[Blob], retire List[Node]) {
    let oldCount = n.Children.Count
    var childrenChanged = false
    var i int32
    while i < blobs.Count {
      let blob = blobs[i]
      if i < oldCount {
        let prior = n.Children[i]
        let child = Diff(prior, blob)
        if child != prior {
          markStructure()
          childrenChanged = true
        }
        child.Parent = n
        n.Children[i] = child
      } else {
        let child = Mount(blob)
        markStructure()
        childrenChanged = true
        child.Parent = n
        n.Children.Add(child)
      }
      i++
    }

    if blobs.Count < oldCount {
      childrenChanged = true
      i = blobs.Count
      while i < oldCount {
        retire.Add(n.Children[i])
        i++
      }
      i = oldCount
      while i > blobs.Count {
        n.Children.RemoveAt(n.Children.Count - 1)
        i--
      }
      markStructure()
    }
    if childrenChanged {
      Stacking.InvalidateStructure(n)
    }
    if let error = disposeTrees(retire) {
      throw error
    }
  }

  private func keyedHitCompatible(n Node, b Blob) bool {
    switch b {
      case retained is VirtualRetainedBlob {
        return !n.Retired && n.Key == b.Key
      }
      case virtual is VirtualBlobBase {
        return n.Fiber == nil && n.Kind == NodeKind.Container && n.Key == b.Key
          && Virtualization.State(n) != nil
      }
      case e is CellElement {
        if let cell = n.Fiber {
          return mountType(cell) == e.CellType && cell.mountKey == e.Key && !cell.disposed
        }
        return false
      }
      case lava is LavaSurface {
        return n.Fiber == nil && n.Kind == NodeKind.Lava && n.Key == b.Key
      }
      case button is Button {
        return n.Fiber == nil && n.Kind == NodeKind.Button && n.Key == b.Key
      }
      case container is Container {
        return n.Fiber == nil && n.Kind == NodeKind.Container && n.Key == b.Key
          && Virtualization.State(n) == nil
      }
      case text is Text {
        return n.Fiber == nil && n.Kind == NodeKind.Text && n.Key == b.Key
      }
      case entry is TextEntry {
        return n.Fiber == nil && n.Kind == NodeKind.Entry && n.Key == b.Key
      }
      case editor is TextEditor {
        return n.Fiber == nil && n.Kind == NodeKind.Editor && n.Key == b.Key
      }
      case shape is Shape {
        return n.Fiber == nil && n.Kind == NodeKind.Shape && n.Key == b.Key
      }
      case image is Image {
        return n.Fiber == nil && n.Kind == NodeKind.Image && n.Key == b.Key
      }
      case _ {
        return false
      }
    }
    return false
  }

  private func diffKeyedChildren(n Node, blobs IList[Blob], scratchScope ChildDiffScratchScope) {
    let next = scratchScope.Next
    let provisional = scratchScope.Provisional
    let retire = scratchScope.Retire
    var childrenChanged = false
    var committed = false
    var i int32
    try {
      while i < n.Children.Count {
        let child = n.Children[i]
        if let key = child.Key {
          scratchScope.Keyed.Add(key, child)
        }
        i++
      }
      if scratchScope.HasIncomingHandle {
        prepareHandleMoves(n, blobs, scratchScope)
      }
      if childOrderChanged(n.Children, blobs) {
        markStructure()
        childrenChanged = true
      }

      i = 0
      while i < blobs.Count {
        let blob = blobs[i]
        if let hit = takeMatch(scratchScope, blob) {
          if keyedHitCompatible(hit, blob) {
            var child Node
            if let cell = hit.Fiber {
              let oldKey = hit.Key
              let oldOutputKey = cell.outputKey
              let oldMountedNode = cell.mountedNode
              let oldMountedOwner = cell.mountedOwner
              let oldRetired = hit.Retired
              let oldHandle = ElementHandles.Current(hit)
              child = diffKeyedHit(hit, blob)
              if child != hit {
                scratchScope.Replacements.Add(ChildDiffReplacement{
                  Old: hit,
                  Replacement: child,
                  Cell: cell,
                  OldKey: oldKey,
                  OldOutputKey: oldOutputKey,
                  OldMountedNode: oldMountedNode,
                  OldMountedOwner: oldMountedOwner,
                  OldRetired: oldRetired,
                  OldHandle: oldHandle,
                })
                retire.Add(hit)
              }
            } else {
              child = Diff(hit, blob)
            }
            if child != hit {
              markStructure()
              childrenChanged = true
            }
            next.Add(child)
          } else {
            let oldHandle = ElementHandles.Current(hit)
            let child = replace(hit, blob)
            if let handle = oldHandle {
              scratchScope.HandleReplacements.Add(ChildDiffHandleReplacement{
                Old: hit,
                OldHandle: handle,
              })
            }
            provisional.Add(child)
            retire.Add(hit)
            markStructure()
            childrenChanged = true
            next.Add(child)
          }
        } else {
          let child = Mount(blob)
          provisional.Add(child)
          markStructure()
          childrenChanged = true
          next.Add(child)
        }
        i++
      }

      i = 0
      while i < n.Children.Count {
        let child = n.Children[i]
        if let key = child.Key {
          if scratchScope.Keyed.TryGetValue(key, out var unmatched) {
            retire.Add(child)
            markStructure()
            childrenChanged = true
          }
        } else {
          retire.Add(child)
          markStructure()
          childrenChanged = true
        }
        i++
      }

      n.Children.Clear()
      i = 0
      while i < next.Count {
        let child = next[i]
        n.Children.Add(child)
        child.Parent = n
        i++
      }
      committed = true
      if childrenChanged {
        Stacking.InvalidateStructure(n)
      }

      if let error = disposeTrees(retire) {
        throw error
      }
    } catch (error Exception) {
      if !committed {
        rollbackReplacements(scratchScope)
        disposeProvisional(scratchScope)
        rollbackHandleReplacements(scratchScope)
      }
      throw error
    }
  }

  private func disposeTrees(nodes List[Node]) Exception? {
    var firstError Exception?
    var i int32
    while i < nodes.Count {
      try {
        TextLayouts.DisposeTree(nodes[i])
      } catch (error Exception) {
        if firstError == nil {
          firstError = error
        }
      }
      i++
    }
    return firstError
  }

  private func rollbackReplacements(scratchScope ChildDiffScratchScope) {
    var i int32
    while i < scratchScope.Replacements.Count {
      let replacement = scratchScope.Replacements[i]
      replacement.Replacement.Fiber = nil
      replacement.Old.Fiber = replacement.Cell
      replacement.Old.Key = replacement.OldKey
      replacement.Old.Retired = replacement.OldRetired
      replacement.Cell.outputKey = replacement.OldOutputKey
      if let mounted = replacement.OldMountedNode {
        replacement.Cell.AttachMount(mounted, replacement.OldMountedOwner)
      } else {
        replacement.Cell.mountedNode = nil
        replacement.Cell.mountedOwner = replacement.OldMountedOwner
      }
      replacement.Cell.RefreshDirectMounts(replacement.Old)
      var child = replacement.Cell.directChild
      while let descendant = child {
        descendant.MarkDirtyFromInput()
        child = descendant.directChild
      }
      replacement.Cell.RestoreDirtyAndSubmit()
      TextLayouts.DisposeTree(replacement.Replacement)
      if let handle = replacement.OldHandle {
        ElementHandles.Bind(replacement.Old, handle)
      }
      i++
    }
  }

  private func disposeProvisional(scratchScope ChildDiffScratchScope) {
    var i int32
    while i < scratchScope.Provisional.Count {
      TextLayouts.DisposeTree(scratchScope.Provisional[i])
      i++
    }
  }

  private func rollbackHandleReplacements(scratchScope ChildDiffScratchScope) {
    var i int32
    while i < scratchScope.HandleReplacements.Count {
      let replacement = scratchScope.HandleReplacements[i]
      if let current = replacement.OldHandle.AttachedNode() {
        if current != replacement.Old {
          ElementHandles.Detach(current)
        }
      }
      ElementHandles.Bind(replacement.Old, replacement.OldHandle)
      i++
    }
  }

  private func prepareHandleMoves(n Node, blobs IList[Blob], scratchScope ChildDiffScratchScope) {
    var i int32
    while i < blobs.Count {
      let blob = blobs[i]
      if blob.HasElementHandle {
        guard let handle = blob.Handle else {
          throw InvalidOperationException("Blob has no ElementHandle")
        }
        var destination Node?
        if let key = blob.Key {
          if scratchScope.Keyed.TryGetValue(key, out var hit) {
            destination = hit
          }
        }
        if let source = handle.AttachedNode() {
          if source.Parent == n && source != destination {
            ElementHandles.Detach(source)
            scratchScope.HandleReplacements.Add(ChildDiffHandleReplacement{
              Old: source,
              OldHandle: handle,
            })
          }
        }
      }
      i++
    }
  }

  private func keyedScratch() ChildDiffScratch {
    if let shared = ChildScratch {
      return shared
    }
    if fallbackChildScratch == nil {
      fallbackChildScratch = ChildDiffScratch()
    }
    guard let scratch = fallbackChildScratch else {
      throw InvalidOperationException("Child diff scratch was not created")
    }
    return scratch
  }
}

internal func validateChildren(blobs IList[Blob], scratchScope ChildDiffScratchScope) {
  scratchScope.IncomingKeys.Clear()
  scratchScope.HasIncomingHandle = false
  var sawKeyed = false
  var sawUnkeyed = false
  var i int32
  while i < blobs.Count {
    if blobs[i].Key == nil {
      sawUnkeyed = true
    } else {
      sawKeyed = true
    }
    i++
  }
  if sawKeyed && sawUnkeyed {
    throw NotSupportedException("Goo child lists must contain either only keyed or only unkeyed siblings")
  }

  if sawKeyed {
    scratchScope.IncomingHandles.Clear()
    i = 0
    while i < blobs.Count {
      if let key = blobs[i].Key {
        if !scratchScope.IncomingKeys.Add(key) {
          throw NotSupportedException("Goo child lists must not contain duplicate keys")
        }
      }
      if blobs[i].HasElementHandle {
        scratchScope.HasIncomingHandle = true
        guard let handle = blobs[i].Handle else {
          throw InvalidOperationException("Blob has no ElementHandle")
        }
        if !scratchScope.IncomingHandles.Add(handle) {
          throw InvalidOperationException("A child list cannot assign one ElementHandle twice")
        }
      }
      i++
    }
  }
}

internal func takeMatch(scratchScope ChildDiffScratchScope, b Blob) Node? {
  if let key = b.Key {
    if scratchScope.Keyed.TryGetValue(key, out var hit) {
      scratchScope.Keyed.Remove(key)
      return hit
    }
  }
  return nil
}

internal func sameStyleEntries(a StyleEntries?, b StyleEntries?) bool {
  if a == b {
    return true
  }
  guard let left = a else {
    return b == nil
  }
  guard let right = b else {
    return false
  }
  if left.Count != right.Count {
    return false
  }
  for i in 0 ... left.Count {
    let leftEntry = left.At(i)
    let rightEntry = right.At(i)
    if leftEntry.Field != rightEntry.Field || !sameStyleEntry(leftEntry, rightEntry) {
      return false
    }
  }
  return true
}

internal func sameButtonStyleEntries(entries StyleEntries?, justify StyleEntry,
  align StyleEntry, author StyleEntries?) bool{
    guard let current = entries else {
      return false
    }
    let authorCount = if let authored = author { authored.Count } else { 0 }
    if current.Count != authorCount + 2 {
      return false
    }
    let currentJustify = current.At(0)
    if currentJustify.Field != justify.Field || !sameStyleEntry(currentJustify, justify) {
      return false
    }
    let currentAlign = current.At(1)
    if currentAlign.Field != align.Field || !sameStyleEntry(currentAlign, align) {
      return false
    }
    guard let authored = author else {
      return true
    }
    for i in 0 ... authored.Count {
      let currentEntry = current.At(i + 2)
      let authoredEntry = authored.At(i)
      if currentEntry.Field != authoredEntry.Field
        || !sameStyleEntry(currentEntry, authoredEntry) {
          return false
        }
    }
    return true
  }

internal func sameDashPattern(a DashPattern?, b DashPattern?) bool {
  if a == b {
    return true
  }
  guard let left = a else {
    return b == nil
  }
  guard let right = b else {
    return false
  }
  if left.Offset != right.Offset || left.Intervals.Count != right.Intervals.Count {
    return false
  }
  for i in 0 ... left.Intervals.Count {
    if left.Intervals[i] != right.Intervals[i] {
      return false
    }
  }
  return true
}

internal func childOrderChanged(old IList[Node], blobs IList[Blob]) bool {
  if old.Count != blobs.Count {
    return true
  }
  if blobs.Count == 0 || blobs[0].Key == nil {
    return false
  }
  var i int32
  while i < blobs.Count {
    if old[i].Key != blobs[i].Key {
      return true
    }
    i++
  }
  return false
}
