package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices

/// Specifies the preferred side and alignment of an anchored Portal before
/// automatic edge flipping and viewport containment.
public enum PortalPlacement {
  /// Places the Portal below its anchor and aligns their inline-start edges.
  BottomStart;
  /// Places the Portal below its anchor and centers it horizontally.
  Bottom;
  /// Places the Portal below its anchor and aligns their inline-end edges.
  BottomEnd;
  /// Places the Portal above its anchor and aligns their inline-start edges.
  TopStart;
  /// Places the Portal above its anchor and centers it horizontally.
  Top;
  /// Places the Portal above its anchor and aligns their inline-end edges.
  TopEnd;
  /// Places the Portal to the right of its anchor and aligns their top edges.
  RightStart;
  /// Places the Portal to the right of its anchor and centers it vertically.
  Right;
  /// Places the Portal to the right of its anchor and aligns their bottom edges.
  RightEnd;
  /// Places the Portal to the left of its anchor and aligns their top edges.
  LeftStart;
  /// Places the Portal to the left of its anchor and centers it vertically.
  Left;
  /// Places the Portal to the left of its anchor and aligns their bottom edges.
  LeftEnd
}

internal func validPortalPlacement(value PortalPlacement) bool {
  let ordinal = int32(value)
  return ordinal >= 0 && ordinal <= int32(PortalPlacement.LeftEnd)
}

/// Presents a logical child subtree in the window overlay while retaining declaration-site ownership.
public class Portal : Blob {
  shared {
    private let emptyChildren IList[Blob] = FrozenChildren(typeof(Portal), nil)
  }

  private var declarationAnchor ElementHandle?
  private var declarationPlacement PortalPlacement
  private var declarationAnchorRect ElementRect?
  private var declarationCollisionBounds ElementRect?
  private var declarationHideWhenAnchorClipped bool
  private var children IList[Blob] = List[Blob]()
  private var declarationFocusScope FocusScopeOptions?
  private var declarationScrim Color?
  private var declarationOnDismiss ((PopupDismissReason) -> void)?

  internal override func coreBlob() {
  }

  internal func FreezeChildren() IList[Blob] {
    children = (children?.Count ?? 0) == 0 ? Portal.emptyChildren : FrozenChildren(GetType(), children)
    return children
  }

  internal prop Children IList[Blob]{ get -> children }

  /// Gets the mounted anchor handle. Invalid anchor relationships suppress presentation.
  public prop Anchor ElementHandle? {
    get -> declarationAnchor
    set {
      CheckMutable()
      declarationAnchor = value
    }
  }

  /// Gets the preferred side and alignment. Defaults to BottomStart. Placement flips and clamps to collision bounds.
  public prop Placement PortalPlacement {
    get -> declarationPlacement
    set {
      CheckMutable()
      declarationPlacement = value
    }
  }

  /// Gets a rectangle within Anchor's local border-box coordinates.
  /// Nil uses the whole border box. Values must be finite and dimensions nonnegative.
  public prop AnchorRect ElementRect? {
    get -> declarationAnchorRect
    set {
      CheckMutable()
      declarationAnchorRect = value
    }
  }

  /// Gets collision bounds in window logical coordinates. Nil uses the viewport. Values are finite and sizes nonnegative.
  public prop CollisionBounds ElementRect? {
    get -> declarationCollisionBounds
    set {
      CheckMutable()
      declarationCollisionBounds = value
    }
  }

  /// Hides presentation when AnchorRect is fully clipped by the anchor's ancestors. Content stays mounted. Defaults to false.
  public prop HideWhenAnchorClipped bool {
    get -> declarationHideWhenAnchorClipped
    set {
      CheckMutable()
      declarationHideWhenAnchorClipped = value
    }
  }

  /// Gets the focus scope options. OnDismiss alone opens a nonmodal scope with default options.
  public prop FocusScope FocusScopeOptions? {
    get -> declarationFocusScope
    set {
      CheckMutable()
      declarationFocusScope = value
    }
  }

  /// Gets the full-window scrim color. Modal scopes use a transparent scrim when nil.
  public prop Scrim Color? {
    get -> declarationScrim
    set {
      CheckMutable()
      declarationScrim = value
    }
  }

  /// Handles Escape outside composition and presses outside the content. Remove the Portal to close it.
  public prop OnDismiss ((PopupDismissReason) -> void)? {
    get -> declarationOnDismiss
    set {
      CheckMutable()
      declarationOnDismiss = value
    }
  }

  /// Initializes an empty child collection.
  public init() { }

  /// Adds a child for mixed composite initialization. Siblings can mix keyed and unkeyed entries.
  /// Keyed children match by key; unkeyed children match only at the same absolute sibling index.
  /// @param child The child to add.
  public func Add(child Blob) {
    Children.Add(child)
  }
}

internal class PortalPlacementBounds {
  internal var AnchorRect ElementRect?
  internal var CollisionBounds ElementRect?
  internal var HideWhenAnchorClipped bool
}

internal class Portals {
  shared {
    private let roots ConditionalWeakTable[Node, Node] = ConditionalWeakTable[Node, Node]()
    private let overlays ConditionalWeakTable[Node, Node] = ConditionalWeakTable[Node, Node]()
    private let states ConditionalWeakTable[Node, PortalState] = ConditionalWeakTable[Node, PortalState]()
    internal let DefaultScopeOptions FocusScopeOptions = FocusScopeOptions()

    internal func State(n Node) PortalState? -> states.TryGetValue(n, out var state) ? state : nil

    internal func Configure(n Node, options FocusScopeOptions?, dismiss ((PopupDismissReason) -> void)?,
      scrim Node?) {
      if options == nil && dismiss == nil && scrim == nil && State(n) == nil { return }
      let state = states.GetValue(n, _ -> PortalState())
      if let value = options {
        state.Scope?.Update(value)
      } else {
        state.Scope?.Dispose()
        state.Scope = nil
      }
      state.Options = options
      state.Dismiss = dismiss
      if state.Scrim != scrim {
        if let old = state.Scrim { NodeLifecycle.DisposeTree(old) }
        state.Scrim = scrim
      }
    }

    internal func Dismiss(root Node?, reason PopupDismissReason, x float32 = 0.0F, y float32 = 0.0F) bool {
      guard let tree = root, let overlay = Overlay(tree) else { return false }
      let target = reason == PopupDismissReason.OutsideInteraction ? hitTopmost(tree, x, y) : nil
      let children = Stacking.Children(overlay)
      for var i = children.Count - 1; i >= 0; i-- {
        let portal = children[i]
        guard let state = State(portal) else { continue }
        if !Presented(portal, true) || !FocusScopes.Allows(tree, portal) { continue }
        if reason == PopupDismissReason.OutsideInteraction && target != state.Scrim
          && FocusScopes.Contains(portal, target) { return false }
        guard let callback = state.Dismiss else {
          if state.Options?.Modal == true { return false }
          continue
        }
        let owner = CellOwnership.ForCallback(portal)
        let previous = owner?.BeginCallback()
        try { callback(reason) }
        finally { owner?.EndCallback(previous) }
        return true
      }
      return false
    }
    private let sources ConditionalWeakTable[Node, PortalSource] = ConditionalWeakTable[Node, PortalSource]()

    internal func Remove(n Node) {
      roots.Remove(n)
      overlays.Remove(n)
      sources.Remove(n)
      if let state = State(n) {
        state.Scope?.Dispose()
        if let scrim = state.Scrim { NodeLifecycle.DisposeTree(scrim) }
        states.Remove(n)
      }
    }

    internal func Sync(root Node?, overlayRoot Node) {
      if sources.TryGetValue(overlayRoot, out var prior) {
        if let source = prior.Root { overlays.Remove(source) }
        sources.Remove(overlayRoot)
      }
      for portal in overlayRoot.Children {
        roots.Remove(portal)
      }
      overlayRoot.Children.Clear()
      if let current = root {
        overlays.Remove(current)
        overlays.Add(current, overlayRoot)
        sources.Add(overlayRoot, PortalSource{ Root: current })
        Collect(current, overlayRoot)
      }
      Stacking.InvalidateStructure(overlayRoot)
    }

    private func Collect(node Node, overlayRoot Node) {
      if node.IsPortal {
        if let scrim = State(node)?.Scrim {
          scrim.Parent = node
          scrim.ZIndex = node.ZIndex
          overlayRoot.Children.Add(scrim)
        }
        overlayRoot.Children.Add(node)
        roots.Add(node, overlayRoot)
      }
      for i in 0 ... node.Children.Count {
        Collect(node.Children[i], overlayRoot)
      }
    }

    internal func InvalidateStacking(node Node) {
      if roots.TryGetValue(node, out var root) {
        Stacking.InvalidateStructure(root)
      }
    }

    internal func Overlay(root Node) Node? -> overlays.TryGetValue(root, out var overlay) ? overlay : nil

    internal func Presented(node Node, requireEnabled bool = false) bool {
      var current = node
      while true {
        if current.Retired || current.PaintInputHidden || requireEnabled && current.Disabled { return false }
        guard let parent = current.Parent else { return true }
        current = parent
      }
    }

    internal func SourceChildCount(node Node) int32 {
      let children = node.Children
      var count int32
      for index in 0 ... children.Count {
        if !children[index].IsPortal { count++ }
      }
      return count
    }

  }
}

internal class PortalSource {
  internal var Root Node?
}

internal class PortalState {
  internal var Options FocusScopeOptions?
  internal var Scope FocusScope?
  internal var Dismiss ((PopupDismissReason) -> void)?
  internal var Scrim Node?
}
