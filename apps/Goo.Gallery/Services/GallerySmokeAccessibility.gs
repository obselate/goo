package GooGallery

import Goo
import System

class GallerySmokeAccessibility : AccessibilityAdapter {
    private var tree AccessibilityTree?

    /// Retains the latest accessibility tree for smoke assertions.
    public func Update(next AccessibilityTree) {
        tree = next
    }

    internal func Contains(name string) bool {
        guard let current = tree else {
            return false
        }
        guard let root = current.Root else {
            return false
        }
        return contains(root, name)
    }

    internal func FindExact(name string) AccessibilityNode? {
        guard let current = tree else {
            return nil
        }
        guard let root = current.Root else {
            return nil
        }
        return findExact(root, name)
    }

    internal func FindContaining(name string) AccessibilityNode? {
        guard let current = tree else {
            return nil
        }
        guard let root = current.Root else {
            return nil
        }
        return findContaining(root, name)
    }

    private func contains(node AccessibilityNode, name string) bool {
        if node.Name.IndexOf(name, StringComparison.OrdinalIgnoreCase) >= 0 {
            return true
        }
        for child in node.Children {
            if contains(child, name) {
                return true
            }
        }
        return false
    }

    private func findExact(node AccessibilityNode, name string) AccessibilityNode? {
        if String.Equals(node.Name, name, StringComparison.OrdinalIgnoreCase) {
            return node
        }
        for child in node.Children {
            if let found = findExact(child, name) {
                return found
            }
        }
        return nil
    }

    private func findContaining(node AccessibilityNode, name string) AccessibilityNode? {
        if node.Name.IndexOf(name, StringComparison.OrdinalIgnoreCase) >= 0 {
            return node
        }
        for child in node.Children {
            if let found = findContaining(child, name) {
                return found
            }
        }
        return nil
    }
}
