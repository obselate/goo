package Goo

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

/// Defines a logical child subtree that is laid out against the window viewport and
/// presented in its Window's shared overlay after the normal tree. The subtree retains
/// its declaration-site ownership, event route, Cell lifecycle, focus, and accessibility
/// relationships. An optional Anchor changes only its border-box placement, not that
/// logical ownership.
public class Portal : Blob {
  private let children IList[Blob] = List[Blob]()

  internal override func coreBlob() {
  }

  internal prop Children IList[Blob]{ get -> children }

  /// Gets the optional mounted element whose transformed border box positions this Portal.
  /// When set, an unmounted, hidden, wrong-Window, descendant, or cyclic anchor suppresses
  /// the Portal. An unset Anchor keeps ordinary window-level Portal positioning.
  public prop Anchor ElementHandle? { get; init; }

  /// Gets the preferred side and alignment used when Anchor is mounted in this Window.
  /// Goo flips to the opposite side when that reduces overflow, then contains the Portal
  /// border box within the viewport. The default is BottomStart.
  public prop Placement PortalPlacement{ get; init; }

  /// Initializes an empty child collection.
  public init() { }

  /// Adds a child for mixed composite initialization. Give all siblings stable keys,
  /// or give no sibling a key.
  /// @param child The child to add.
  public func Add(child Blob) {
    Children.Add(child)
  }
}

internal class Portals {
  shared {
    private let roots ConditionalWeakTable[Node, Node] = ConditionalWeakTable[Node, Node]()
    private let overlays ConditionalWeakTable[Node, Node] = ConditionalWeakTable[Node, Node]()
    private let sources ConditionalWeakTable[Node, PortalSource] = ConditionalWeakTable[Node, PortalSource]()

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
        overlayRoot.Children.Add(node)
        roots.Add(node, overlayRoot)
      }
      for child in node.Children {
        Collect(child, overlayRoot)
      }
    }

    internal func InvalidateStacking(node Node) {
      if roots.TryGetValue(node, out var root) {
        Stacking.InvalidateStructure(root)
      }
    }

    internal func Overlay(root Node) Node? -> overlays.TryGetValue(root, out var overlay) ? overlay : nil

    internal func Presented(node Node) bool {
      var current = node
      while true {
        if current.Retired || current.PaintInputHidden { return false }
        guard let parent = current.Parent else { return true }
        current = parent
      }
    }

    internal func SourceChildCount(node Node) int32 {
      var count int32
      for child in node.Children {
        if !child.IsPortal { count++ }
      }
      return count
    }

  }
}

internal class PortalSource {
  internal var Root Node?
}
