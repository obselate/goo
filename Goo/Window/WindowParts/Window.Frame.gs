package Goo

import System
import System.Collections.Generic
import System.Diagnostics
import System.Numerics
import System.Threading

internal data struct DirtyCellSubmission {
  internal var Cell Cell
  internal var Generation int64
}

internal class WindowDefaultTitle {
  shared {
    private var value string?

    internal func Value() string {
      if let cached = value {
        return cached
      }
      using let process = Process.GetCurrentProcess()
      let title = process.ProcessName
      value = title
      return title
    }
  }
}

/// Hosts a Goo tree in a native window.
public partial class Window {
  private func prepare() {
    if Width == 0 {
      Width = 1280
    }
    if Height == 0 {
      Height = 720
    }
    if Title == "" {
      Title = WindowDefaultTitle.Value()
    }
    acceptImageCompletions()
    acceptRetainedInvalidations()
    if !hookInstalled {
      guard let cell = Root else {
        return
      }
      paintResourceHook = () -> {
        Interlocked.Exchange(&pendingPaintResourceInvalidation, 1)
        requestReconcile()
      }
      shaderEffectInvalidatedHook = () -> {
        enqueueRetainedInvalidation(ReconcileEffects.Paint)
      }
      imageCompletionHook = (n Node, token object) -> {
        enqueueImageCompletion(n, token)
      }
      retainedInvalidationHook = (e ReconcileEffects) -> {
        enqueueRetainedInvalidation(e)
      }
      resolver.PaintResourceInvalidated = paintResourceHook
      resolver.ShaderEffectInvalidated = shaderEffectInvalidatedHook
      cellHook = (cell Cell) -> {
        submitCell(cell)
      }
      cell.SetRebuildSubmission(cellHook)
      hookInstalled = true
    }
  }

  private func requestReconcile() {
    if !markReconcilePending() {
      return
    }
    host?.Wake()
  }

  private func markReconcilePending() bool -> Interlocked.Exchange(&pendingRebuild, 1) == 0

  private func submitCell(cell Cell) {
    let generation = cell.TryQueueCanonical(this, out var queueRoot)
    if generation != 0 {
      lock cellQueueGate {
        let submission = DirtyCellSubmission{ Cell: queueRoot, Generation: generation }
        if cellTransactionActive {
          deferredCells.Add(submission)
        } else {
          pendingCells.Add(submission)
        }
      }
    }
    requestReconcile()
  }

  private func beginCellTransaction() {
    cellBatch.Clear()
    lock cellQueueGate {
      cellTransactionActive = true
      cellBatch.AddRange(pendingCells)
      pendingCells.Clear()
    }
  }

  private func endCellTransaction() {
    lock cellQueueGate {
      cellTransactionActive = false
      pendingCells.AddRange(deferredCells)
      deferredCells.Clear()
    }
  }

  internal func UpdateTree() {
    UpdateTree(0.0)
  }

  internal func UpdateTree(dt float64) bool -> UpdateTreeCore(dt, dt)

  // wallDt/simDt split for Pump's post-idle-wait frame (Window.Host.gs):
  // wallDt is the real time since the last frame -- timeS and input
  // timestamps (double-click detection) must track it exactly, or a click
  // clock that ran slow while asleep misreads two far-apart clicks as one
  // double-click. simDt is the (possibly clamped) step actually applied to
  // MotionPump/Resolver/scroll/input.Step, so a stale idle gap cannot make a
  // just-started animation jump straight to its end. Every other caller
  // passes the same value for both, unchanged from before this split.
  internal func UpdateTree(wallDt float64, simDt float64) bool -> UpdateTreeCore(wallDt, simDt)

  private func UpdateTreeCore(wallDt float64, simDt float64) bool {
    validateDelta(wallDt, "wallDt")
    validateDelta(simDt, "simDt")
    timeS = timeS + wallDt
    prepare()
    let profiling = profiler.Active
    let motionProfile = profiling ? profiler.Start() : FrameProfilePoint{}
    motionPump.Sweep(simDt)
    if profiling {
      profiler.Record(FrameProfileStage.Motion, motionProfile)
    }
    let retainedEffects = drainRetainedInvalidations()
    if Interlocked.Exchange(&pendingRebuild, 0) != 0 {
      dirty = true
    }
    guard let cell = Root else {
      stopImageCompletions()
      if let semantics = accessibility {
        if semantics.Publish(nil) { requestRender() }
      }
      DiagnosticsSession?.OnTreeUpdated(nil, ReconcileEffects.None, false, false)
      MetricSubscriptions.Flush(this)
      return false
    }
    var changed = false
    var effects = combineEffects(pendingReconcileEffects, retainedEffects)
    if dirty {
      dirty = false
      let reconcileProfile = profiling ? profiler.Start() : FrameProfilePoint{}
      beginCellTransaction()
      ElementHandles.PushOwner(this)
      let paintResourceInvalidated = Interlocked.Exchange(&pendingPaintResourceInvalidation, 0) != 0
      let rec = Reconciler{
        CellInvalidated: cellHook,
        ImageCompleted: imageCompletionHook,
        RetainedInvalidated: retainedInvalidationHook,
        Res: resolver,
        ChildScratch: childDiffScratch,
        Profiler: profiling ? profiler : nil,
        DeferStyleFlush: true,
        Pump: motionPump,
      }
      if paintResourceInvalidated {
        rec.MarkEffects(ReconcileEffects.Paint)
      }
      var stylesFlushed = false
      try {
        if let existing = node {
          drain(rec)
        } else {
          node = rec.MountRoot(cell)
        }
        rec.FlushStyles()
        stylesFlushed = true
      } finally {
        try {
          if !stylesFlushed {
            pendingReconcileEffects = combineEffects(pendingReconcileEffects, rec.Effects)
            rec.DiscardStyles()
          }
        } finally {
          ElementHandles.PopOwner()
          endCellTransaction()
        }
      }
      effects = combineEffects(effects, rec.Effects)
      if profiling {
        profiler.RecordReconcileSplit(
          reconcileProfile,
          rec.ProfileBuildTicks,
          rec.ProfileBuildBytes,
          rec.ProfileBuildCalls,
          rec.ProfileResolveTicks,
          rec.ProfileResolveBytes,
          rec.ProfileResolveCalls,)
      }
      if hasEffect(effects, ReconcileEffects.Structure) {
        layout.MarkStructureDirty()
      }
    }
    try {
      effects = combineEffects(effects, drainImageCompletions())
    } catch (error Exception) {
      pendingReconcileEffects = combineEffects(pendingReconcileEffects, effects)
      throw error
    }
    pendingReconcileEffects = ReconcileEffects.None
    var accessibilityLayout bool
    var accessibilityScroll bool
    let resolveProfile = profiling ? profiler.Start() : FrameProfilePoint{}
    resolver.Advance(simDt)
    if profiling {
      profiler.Record(FrameProfileStage.Transitions, resolveProfile)
    }
    effects = combineEffects(effects, resolver.FlushEffects())
    var metricsChanged bool
    var layoutChanged bool
    if let n = node {
      let viewW = float32(Width)
      let viewH = float32(Height)
      let shouldLayout = hasEffect(effects, ReconcileEffects.Structure)
        || hasEffect(effects, ReconcileEffects.Layout)
        || layout.NeedsLayout(n, viewW, viewH)
      if shouldLayout {
        calculateLayout(n, viewW, viewH)
        layoutChanged = true
        accessibilityLayout = true
        metricsChanged = true
      }
      if hasEffect(effects, ReconcileEffects.Rect) {
        layout.RefreshRects(n)
        accessibilityLayout = true
        metricsChanged = true
      }
      var virtualPass int32
      while virtualPass < 3 {
        let virtualEffects = refreshVirtualization(n)
        if virtualEffects == ReconcileEffects.None { break }
        effects = combineEffects(effects, virtualEffects)
        if hasEffect(virtualEffects, ReconcileEffects.Structure) {
          layout.MarkStructureDirty()
        }
        if layout.NeedsLayout(n, viewW, viewH) {
          calculateLayout(n, viewW, viewH)
        } else {
          layout.RefreshRects(n)
        }
        layoutChanged = true
        accessibilityLayout = true
        metricsChanged = true
        virtualPass++
      }
      if hasEffect(effects, ReconcileEffects.Structure)
        || hasEffect(effects, ReconcileEffects.Input)
        || hasEffect(effects, ReconcileEffects.Content)
        || hasEffect(effects, ReconcileEffects.Layout)
        || hasEffect(effects, ReconcileEffects.Rect)
        || layoutChanged{
          let inputTreeProfile = profiling ? profiler.Start() : FrameProfilePoint{}
          input.AfterTreeUpdated(n, resolver, true)
          if profiling {
            profiler.Record(FrameProfileStage.InputTree, inputTreeProfile)
          }
          effects = combineEffects(effects, resolver.FlushEffects())
          if layout.NeedsLayout(n, viewW, viewH) {
            calculateLayout(n, viewW, viewH)
            layoutChanged = true
            accessibilityLayout = true
            metricsChanged = true
          }
        }
      if simDt > 0.0 {
        let dtf = float32(simDt)
        let scrollers = layout.ScrollNodes(n)
        if scrollers.Count > 0 {
          if fadeScrollBars(scrollers, dtf) {
            changed = true
          }
          let k = 1.0F - MathF.Exp(-dtf * 20.0F)
          if stepScroll(scrollers, k) {
            changed = true
            accessibilityScroll = true
            metricsChanged = true
            layout.RefreshRects(n)
            let inputTreeProfile = profiling ? profiler.Start() : FrameProfilePoint{}
            let virtualEffects = refreshVirtualization(n)
            if virtualEffects != ReconcileEffects.None {
              effects = combineEffects(effects, virtualEffects)
              if hasEffect(virtualEffects, ReconcileEffects.Structure) {
                layout.MarkStructureDirty()
              }
              if layout.NeedsLayout(n, viewW, viewH) {
                calculateLayout(n, viewW, viewH)
              } else {
                layout.RefreshRects(n)
              }
              layoutChanged = true
              accessibilityLayout = true
              input.AfterTreeUpdated(n, resolver, true)
              effects = combineEffects(effects, resolver.FlushEffects())
              if layout.NeedsLayout(n, viewW, viewH) {
                calculateLayout(n, viewW, viewH)
              }
            }
            if input.RefreshHover(n, resolver) {
              changed = true
              calculateLayout(n, viewW, viewH)
            }
            if profiling {
              profiler.Record(FrameProfileStage.InputTree, inputTreeProfile)
            }
          }
        }
      }
      // Native repeats use a monotonic dispatch deadline. Test drivers use dt.
      let inputTreeProfile = profiling ? profiler.Start() : FrameProfilePoint{}
      if input.Step(n, resolver, wallDt) {
        changed = true
        accessibility?.MarkDirty()
      }
      if profiling {
        profiler.Record(FrameProfileStage.InputTree, inputTreeProfile)
      }
      if ShaderEffectStyles.TreeHasPlaying(n) {
        changed = true
      }
    }
    if hasEffect(effects, ReconcileEffects.Paint) {
      changed = true
    }
    if let semantics = accessibility {
      if accessibilityLayout || accessibilityScroll || hasEffect(effects, ReconcileEffects.Structure)
        || hasEffect(effects, ReconcileEffects.Content) || hasEffect(effects, ReconcileEffects.Input)
        || hasEffect(effects, ReconcileEffects.Rect) || hasEffect(effects, ReconcileEffects.Accessibility) {
          semantics.MarkDirty()
        }
      if semantics.Publish(node) { requestRender() }
    }
    if changed {
      resolver.VisualDirty = true
    }
    if metricsChanged {
      MetricSubscriptions.MarkElementsDirty(this)
    }
    DiagnosticsSession?.OnTreeUpdated(node, effects, layoutChanged, changed)
    MetricSubscriptions.Flush(this)
    return changed
  }
  private func validateDelta(value float64, name string) {
    if !motionFinite(value) || value < 0.0 {
      throw ArgumentOutOfRangeException(name)
    }
  }

  private func combineEffects(left ReconcileEffects, right ReconcileEffects) ReconcileEffects -> ReconcileEffects(int32(left) | int32(right))

  private func hasEffect(effects ReconcileEffects, value ReconcileEffects) bool -> (int32(effects) & int32(value)) != 0

  private func calculateLayout(n Node, width float32, height float32) {
    if !profiler.Active {
      layout.Calculate(n, width, height)
      return
    }
    let point = profiler.Start()
    layout.Calculate(n, width, height)
    profiler.Record(FrameProfileStage.Layout, point)
  }

  private func drain(rec Reconciler) {
    fiberBatch.Clear()
    for i in 0 ... cellBatch.Count {
      let submission = cellBatch[i]
      submission.Cell.ClearQueue(this)
      guard let mounted = submission.Cell.MountedNodeFor(submission.Generation) else {
        continue
      }
      if mounted.Retired {
        continue
      }
      guard let fiber = mounted.Fiber else {
        continue
      }
      addFiber(fiber)
    }
    cellBatch.Clear()

    sortFibersParentFirst()
    var nextFiber int32 = 0
    try {
      for i in 0 ... fiberBatch.Count {
        nextFiber = i + 1
        let fiber = fiberBatch[i]
        guard let mounted = fiber.MountedNode() else {
          continue
        }
        if mounted.Retired || mounted.Fiber != fiber || !fiber.HasDirty() {
          continue
        }
        let replacement = rec.RebuildFiber(mounted, fiber)
        replaceFiberRoot(mounted, replacement)
      }
    } catch (error Exception) {
      try {
        while nextFiber < fiberBatch.Count {
          let fiber = fiberBatch[nextFiber]
          nextFiber = nextFiber + 1
          guard let mounted = fiber.MountedNode() else {
            continue
          }
          if mounted.Retired || mounted.Fiber != fiber || !fiber.HasDirty() {
            continue
          }
          fiber.RestoreDirtyAndSubmit()
        }
      } finally {
        throw error
      }
    } finally {
      fiberBatch.Clear()
    }
  }

  private func addFiber(fiber Cell) {
    fiberBatch.Add(fiber)
  }

  private func sortFibersParentFirst() {
    var i int32 = 1
    while i < fiberBatch.Count {
      let fiber = fiberBatch[i]
      let depth = fiberDepth(fiber)
      var j = i
      while j > 0 && fiberDepth(fiberBatch[j - 1]) > depth {
        fiberBatch[j] = fiberBatch[j - 1]
        j--
      }
      fiberBatch[j] = fiber
      i++
    }
  }

  private func fiberDepth(fiber Cell) int32 {
    guard let mounted = fiber.MountedNode() else {
      return Int32.MaxValue
    }
    var depth int32
    var current Node = mounted
    while current.Parent != nil {
      depth++
      current = current.Parent!!
    }
    return depth
  }

  private func replaceFiberRoot(previous Node, replacement Node) {
    if previous == replacement {
      return
    }
    if let parent = previous.Parent {
      let i = parent.Children.IndexOf(previous)
      if i >= 0 {
        replacement.Parent = parent
        parent.Children[i] = replacement
        Stacking.InvalidateStructure(parent)
        return
      }
    }
    if node == previous {
      node = replacement
    }
  }

  internal func HandleResize(w int32, h int32, invalidateRender bool = true) {
    if w <= 0 || h <= 0 {
      return
    }
    // OS events write backing fields to prevent a configure feedback loop.
    width = w
    height = h
    MetricSubscriptions.MarkWindowDirty(this)
    if invalidateRender {
      requestRender()
    }
  }

  private func stepScroll(scrollers List[Node], k float32) bool {
    var moved = false
    for i in 0 ... scrollers.Count {
      let n = scrollers[i]
      let nx = approach(n.ScrollX, n.ScrollTargetX, k)
      let ny = approach(n.ScrollY, n.ScrollTargetY, k)
      if nx != n.ScrollX {
        n.ScrollX = nx
        moved = true
      }
      if ny != n.ScrollY {
        n.ScrollY = ny
        moved = true
      }
    }
    return moved
  }

  private func refreshVirtualization(root Node) ReconcileEffects {
    let candidates = layout.ScrollNodes(root)
    var needed = false
    for i in 0 ... candidates.Count {
      if let state = Virtualization.State(candidates[i]) {
        if state.NeedsRefresh(candidates[i]) {
          needed = true
          break
        }
      }
    }
    if !needed { return ReconcileEffects.None }

    ElementHandles.PushOwner(this)
    let rec = Reconciler{
      CellInvalidated: cellHook,
      ImageCompleted: imageCompletionHook,
      RetainedInvalidated: retainedInvalidationHook,
      Res: resolver,
      ChildScratch: childDiffScratch,
      DeferStyleFlush: true,
      Pump: motionPump,
    }
    var stylesFlushed = false
    try {
      for i in 0 ... candidates.Count {
        Virtualization.Refresh(candidates[i], rec)
      }
      rec.FlushStyles()
      stylesFlushed = true
      return rec.Effects
    } finally {
      try {
        if !stylesFlushed {
          pendingReconcileEffects = combineEffects(pendingReconcileEffects, rec.Effects)
          rec.DiscardStyles()
        }
      } finally {
        ElementHandles.PopOwner()
      }
    }
  }

  private func approach(v float32, target float32, k float32) float32 {
    if v == target {
      return v
    }
    let next = v + (target - v) * k
    return MathF.Abs(target - next) < 0.5F ? target : next
  }

  private func fadeScrollBars(scrollers List[Node], dt float32) bool {
    var changed = false
    for i in 0 ... scrollers.Count {
      let n = scrollers[i]
      if n.ScrollbarVisibility != ScrollbarVisibility.Auto { continue }
      if n.ScrollBarAlpha > 0.0F {
        n.ScrollIdle = n.ScrollIdle + dt
      }
      if n.ScrollIdle > 1.0F && n.ScrollBarAlpha > 0.0F {
        let a = n.ScrollBarAlpha - dt * 4.0F
        let next = a < 0.0F ? 0.0F : a
        if next != n.ScrollBarAlpha {
          n.ScrollBarAlpha = next
          changed = true
        }
      }
    }
    return changed
  }

  internal func needsRenderFrame(changed bool) bool {
    if changed {
      requestRender()
    }
    if windowTarget?.NeedsRender == true && windowTarget?.QueueWorkPending != true {
      requestRender()
    }
    return renderDirty
  }

  internal func markFrameRendered() {
    renderDirty = false
    resolver.VisualDirty = false
  }

  internal func RenderPending() bool -> resolver.VisualDirty || renderDirty

  private func requestRender() {
    renderDirty = true
    embeddedHost?.Wake()
  }

}
