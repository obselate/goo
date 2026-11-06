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
  /// Goo keeps this side when the popup fits, otherwise flips when the opposite side
  /// has more space. It caps the main-axis size without covering AnchorRect and shifts
  /// the cross axis into the collision bounds. The default is BottomStart.
  public prop Placement PortalPlacement{ get; init; }

  /// Gets a rectangle within Anchor's local border-box coordinates.
  /// Nil uses the whole border box. Values must be finite and dimensions nonnegative.
  public prop AnchorRect ElementRect? { get; init; }

  /// Gets the collision rectangle in window logical coordinates.
  /// Nil uses the whole viewport. After choosing a side, Goo caps the main-axis size
  /// to the space between AnchorRect and these bounds, then shifts the cross axis to fit.
  /// Values must be finite and dimensions nonnegative.
  public prop CollisionBounds ElementRect? { get; init; }

  /// Hides presentation when AnchorRect is fully outside the anchor's ancestor clips.
  /// The default is false. Hiding preserves the mounted subtree, focus and text composition.
  public prop HideWhenAnchorClipped bool { get; init; }

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
    internal func Sync(root Node?, overlayRoot Node) {
      if let metadata = overlayRoot.PortalState, let prior = metadata.PortalSource {
        if let source = prior.Root, let state = source.PortalState { state.PortalOverlay = nil }
        metadata.PortalSource = nil
      }
      for portal in overlayRoot.Children {
        if let state = portal.PortalState { state.PortalRoot = nil }
      }
      overlayRoot.Children.Clear()
      if let current = root {
        current.EnsurePortalState().PortalOverlay = overlayRoot
        overlayRoot.EnsurePortalState().PortalSource = PortalSource{ Root: current }
        Collect(current, overlayRoot)
      }
      Stacking.InvalidateStructure(overlayRoot)
    }

    private func Collect(node Node, overlayRoot Node) {
      if node.IsPortal {
        overlayRoot.Children.Add(node)
        node.EnsurePortalState().PortalRoot = overlayRoot
      }
      for i in 0 ... node.Children.Count {
        Collect(node.Children[i], overlayRoot)
      }
    }

    internal func InvalidateStacking(node Node) {
      if let root = node.PortalState?.PortalRoot {
        Stacking.InvalidateStructure(root)
      }
    }

    internal func Overlay(root Node) Node? -> root.PortalState?.PortalOverlay

    internal func Presented(node Node) bool {
      var current = node
      while true {
        if current.Retired || current.PaintInputHidden { return false }
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
