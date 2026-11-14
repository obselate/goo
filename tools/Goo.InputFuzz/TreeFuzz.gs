package Goo

import Goo
import System
import System.Collections.Generic

internal class TreeFuzz {
    private let input[]uint8
    private var position int32
    private var remaining int32
    private let cells List[TreeFuzzCell] = List[TreeFuzzCell]()

    internal init(input[]uint8) {
        this.input = input
    }

    shared {
        internal func Run(input[]uint8) {
            TreeFuzz(input).Execute()
        }
    }

    private func Execute() {
        let reconciler = Reconciler{Res: Resolver()}
        let root = reconciler.Mount(Container{})
        var previous = List[TreeFuzzEntry]()
        var operation = 0

        try {
            while operation == 0 || position < input.Length && operation < 32 {
                remaining = 64
                let next = Decode(1)
                reconciler.Diff(root, Container{Children: Build(next)})
                let live = HashSet[TreeFuzzCell]()
                Verify(root, previous, next, operation, live)
                VerifyLifetime(live, operation)
                previous = next
                operation++
            }

            reconciler.Diff(root, Container{})
            Verify(root, previous, List[TreeFuzzEntry](), operation, HashSet[TreeFuzzCell]())
            VerifyLifetime(HashSet[TreeFuzzCell](), operation)
        } finally {
            NodeLifecycle.DisposeTree(root)
        }
    }

    private func Decode(depth int32) List[TreeFuzzEntry] {
        let entries = List[TreeFuzzEntry]()
        if position == input.Length {
            return entries
        }
        let count = int32(input[position]) % 9
        position++
        var keys = 0

        for index in 0 ... count {
            if position == input.Length || remaining == 0 {
                break
            }
            let value = int32(input[position])
            position++
            remaining--
            let key = value >> 4 & 7
            let keyed = (value & 8) != 0 && (keys & (1 << key)) == 0
            if keyed {
                keys |= 1 << key
            }
            let entry = TreeFuzzEntry{Kind: value % 3, Key: keyed ? key.ToString(): nil}
            if depth < 3 && entry.Kind != 1 {
                entry.Children = Decode(depth + 1)
            }
            entries.Add(entry)
        }

        return entries
    }

    private func Build(entries List[TreeFuzzEntry]) List[Blob] {
        let blobs = List[Blob](entries.Count)
        for entry in entries {
            let children IList[Blob] = entry.Children.Count == 0 ? Array.Empty[Blob](): Build(entry.Children)
            let blob Blob = switch entry.Kind {
                case 0: Container{Key: entry.Key, Children: children}
                case 1: Text{Key: entry.Key, Content: "leaf"}
                case _: Cell.Mount[IList[Blob], TreeFuzzCell](entry.Key, children, () -> TreeFuzzCell(cells))
            }
            blobs.Add(blob)
        }

        return blobs
    }

    private func Verify(
        parent Node,
        previous List[TreeFuzzEntry],
        next List[TreeFuzzEntry],
        operation int32,
        live HashSet[TreeFuzzCell],
        verifyIdentity bool = true
    ) {
        if parent.Children.Count != next.Count {
            throw InvalidOperationException("tree operation $operation: child count")
        }

        for index in 0 ... next.Count {
            let entry = next[index]
            let node = parent.Children[index]
            var prior TreeFuzzEntry?
            if let key = entry.Key {
                for candidate in previous {
                    if candidate.Key == key && candidate.Kind == entry.Kind {
                        prior = candidate
                    }
                }
            } else if index < previous.Count && previous[index].Key == nil
            && previous[index].Kind == entry.Kind {
                prior = previous[index]
            }

            let kind = switch entry.Kind {
                case 0: NodeKind.Container
                case 1: NodeKind.Text
                case _: NodeKind.Button
            }
            if node.Kind != kind || node.Key != entry.Key || node.Parent != parent
            || entry.Kind == 1 && node.Content != "leaf" {
                throw InvalidOperationException("tree operation $operation: child order, key or kind")
            }
            if verifyIdentity {
                if let prior = prior {
                    if entry.Kind == 2 ? node.Fiber != prior.Cell: node != prior.Node {
                        throw InvalidOperationException("tree operation $operation: retained identity")
                    }
                } else {
                    for candidate in previous {
                        if entry.Kind == 2 ? node.Fiber == candidate.Cell: node == candidate.Node {
                            throw InvalidOperationException("tree operation $operation: unmatched identity reused")
                        }
                    }
                }
            }

            entry.Node = node
            if entry.Kind == 2 {
                guard let cell = node.Fiber as TreeFuzzCell? else {
                    throw InvalidOperationException("tree operation $operation: missing Cell")
                }
                entry.Cell = cell
                if !live.Add(cell) {
                    throw InvalidOperationException("tree operation $operation: repeated Cell")
                }
            } else if node.Fiber != nil {
                throw InvalidOperationException("tree operation $operation: unexpected Cell")
            }
            // Reconciler.rebuildMounted (Reconciler.gs:1030-1034) can reuse output nodes for a fresh Cell.
            Verify(
                node,
                prior?.Children ?? List[TreeFuzzEntry](),
                entry.Children,
                operation,
                live,
                verifyIdentity && (entry.Kind != 2 || prior != nil)
            )
        }
    }

    private func VerifyLifetime(live HashSet[TreeFuzzCell], operation int32) {
        var disposals = 0
        for cell in cells {
            let expected = live.Contains(cell) ? 0: 1
            if cell.Disposals != expected {
                throw InvalidOperationException("tree operation $operation: Cell disposal count")
            }
            disposals += cell.Disposals
        }
        if cells.Count - disposals != live.Count {
            throw InvalidOperationException("tree operation $operation: mounts minus disposals")
        }
    }
}

internal class TreeFuzzEntry {
    internal var Kind int32
    internal var Key string?
    internal var Children List[TreeFuzzEntry] = List[TreeFuzzEntry]()
    internal var Node Node?
    internal var Cell TreeFuzzCell?
}

internal class TreeFuzzCell : Cell[IList[Blob]], IDisposable {
    internal var Disposals int32

    internal init(cells List[TreeFuzzCell]) {
        cells.Add(this)
    }

    protected override func Build(children IList[Blob]) Blob -> Button{Children: children}

    public func Dispose() {
        Disposals++
    }
}
