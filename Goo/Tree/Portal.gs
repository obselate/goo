package Goo

import System.Collections.Generic
import System.Runtime.CompilerServices

/// Defines a logical child subtree that is presented in the window overlay.
public class Portal : Blob {
  private var children IList[Blob] = List[Blob]()

  internal override func coreBlob() {
  }

  /// Gets the mutable child list. Read-only lists supplied during initialization are copied.
  /// Give all siblings stable keys, or give no sibling a key.
  public prop Children IList[Blob]{ get -> children
    init -> children = value.IsReadOnly ? List[Blob](value) : value
  }

  /// Initializes an empty child collection.
  public init() { }

  /// Adds a child to the end of the ordered child collection.
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
