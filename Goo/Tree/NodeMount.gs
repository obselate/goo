package Goo

import System
import System.Runtime.CompilerServices

internal struct NodeMount : IEquatable[NodeMount] {
    private let node Node?
    private let generation uint64

    internal init(node Node?) {
        this.node = node
        generation = node?.MountGeneration ?? 0uL
    }

    internal prop Captured Node? {
        get -> if let value = node && value.MountGeneration == generation { value } else { nil }
    }

    internal prop Current Node? {
        get -> if let value = Captured && !value.Retired { value } else { nil }
    }

    public func Equals(other NodeMount) bool ->
        Object.ReferenceEquals(node, other.node) && generation == other.generation

    public override func Equals(other object?) bool -> other is NodeMount && Equals(other)

    public override func GetHashCode() int32 -> HashCode.Combine(RuntimeHelpers.GetHashCode(node), generation)
}
