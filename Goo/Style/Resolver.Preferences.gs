package Goo

internal partial class Resolver {
  internal func ApplyTextScaleTree(n Node) {
    ApplyTextScale(n)
    for child in n.Children { ApplyTextScaleTree(child) }
    for child in ScrollbarParts.Children(n) { ApplyTextScaleTree(child) }
  }

  private func ApplyTextScale(n Node) {
    let scale = Owner?.Preferences.TextScaleFactor ?? 1.0F
    if n.TextScaleFactor == scale { return }
    n.TextScaleFactor = scale
    if n.Kind == NodeKind.Editor { TextEditorLayouts.Invalidate(n) }
    else if n.Kind == NodeKind.Text || n.Kind == NodeKind.Entry { TextLayouts.Invalidate(n) }
    n.BumpScenePaintVersion()
  }
}
