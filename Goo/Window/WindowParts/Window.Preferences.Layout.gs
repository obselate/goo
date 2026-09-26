package Goo

/// Applies host text scaling and motion preferences to the retained tree.
public partial class Window {
  private func PreferenceLayoutChanged() {
    motionPump.ReducedMotion = Preferences.ReducedMotion == true
    if let root = node { resolver.ApplyTextScaleTree(root) }
    resolver.ApplyTextScaleTree(portalRoot)
    enqueueRetainedInvalidation(ReconcileEffects.Layout | ReconcileEffects.Paint
      | ReconcileEffects.Input | ReconcileEffects.Accessibility)
    requestReconcile()
  }
}
