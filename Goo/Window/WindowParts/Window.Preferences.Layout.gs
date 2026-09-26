package Goo

/// Applies host text scaling to the retained tree.
public partial class Window {
  private func textScaleChanged() {
    if let root = node { resolver.ApplyTextScaleTree(root) }
    resolver.ApplyTextScaleTree(portalRoot)
    enqueueRetainedInvalidation(ReconcileEffects.Layout | ReconcileEffects.Paint
      | ReconcileEffects.Input | ReconcileEffects.Accessibility)
  }
}
