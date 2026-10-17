package Goo

import System
import System.Threading.Tasks

internal class ContextFixtures {
    func WindowPairDependencyContract() bool {
        let key = Context[int32]()
        let root = ContextWindowPairCell(key)
        let window = Window{Root: root, Width: 100, Height: 100}
        key.Set(window, 0)
        try {
            window.UpdateTree()
            if window.Background != Color.White || window.Tree!!.Children[0].Color != Color.Black {
                return false
            }
            key.Set(window, 1)
            window.UpdateTree()
            let tree = window.Tree!!
            if window.Background != Color.Black || window.Foreground != Color.White
            || tree.Children[0].Color != Color.White || tree.Children[1].Children[0].Color != Color.White {
                return false
            }
            root.Replace = true
            root.Rebuild()
            window.UpdateTree()
            return window.Tree!!.Kind == NodeKind.Text && window.Tree!!.Color == Color.White
        } finally {
            window.Close()
        }
    }

    func WindowIdentityMissingAndEqualityContract() bool {
        let key = Context[int32]()
        let other = Context[int32]()
        let firstCell = ContextTestRoot(key, other)
        let secondCell = ContextTestRoot(key, other)
        let first = Window{Root: firstCell, Width: 100, Height: 100}
        let second = Window{Root: secondCell, Width: 100, Height: 100}
        try {
            if key.TryRead(first, out var missing) || missing != 0 {
                return false
            }
            var threw = false
            try {
                key.Read(first)
            } catch (error InvalidOperationException) {
                threw = true
            }
            if !threw || !outsideBuildThrows(key) {
                return false
            }
            key.Set(first, 10)
            key.Set(second, 30)
            other.Set(first, 50)
            other.Set(second, 70)
            first.UpdateTree()
            second.UpdateTree()
            let reader = windowReader(first)
            let otherReader = windowReader(first, 2)
            let secondReader = windowReader(second)
            if reader.Value != 10 || otherReader.Value != 50 || secondReader.Value != 30 {
                return false
            }
            let builds = reader.Builds
            key.Set(first, 10)
            first.UpdateTree()
            if reader.Builds != builds {
                return false
            }
            key.Set(first, 20)
            if reader.Builds != builds {
                return false
            }
            first.UpdateTree()
            return reader.Value == 20 && reader.Builds == builds + 1
            && otherReader.Value == 50 && secondReader.Value == 30
            && key.Read(first) == 20 && key.Read(second) == 30
            && key.TryRead(first, out var present) && present == 20
        } finally {
            first.Close()
            second.Close()
        }
    }

    func RetainedDirectCleanPortalAndShadowingContract() bool {
        let key = Context[int32]()
        let other = Context[int32]()
        let cell = ContextTestRoot(key, other)
        let window = Window{Root: cell, Width: 100, Height: 100}
        key.Set(window, 10)
        other.Set(window, 50)
        try {
            window.UpdateTree()
            let direct = scopedReader(window)
            let portal = portalReader(window)
            let ordinary = windowReader(window)
            let sibling = siblingReader(window)
            let parts = ScrollbarParts.Children(scopeNode(window).Children[2])
            let part = (parts[0].Children[0].Fiber as ContextReadCell)!!
            if part.Value != 20 || part.contextWindow != window {
                return false
            }
            let parentBuilds = cell.Builds
            let directBuilds = direct.Builds
            let portalBuilds = portal.Builds
            direct.LocalState = 42
            direct.Rebuild()
            window.UpdateTree()
            if direct.Value != 20 || direct.Builds != directBuilds + 1 || cell.Builds != parentBuilds {
                throw InvalidOperationException(
                    "Later child build: value=${direct.Value}, child=${direct.Builds}, parent=${cell.Builds}"
                )
            }
            key.Set(window, 11)
            window.UpdateTree()
            if ordinary.Value != 11 || direct.Value != 20 || portal.Builds != portalBuilds
            || sibling.Value != 90 || cell.Builds != parentBuilds {
                throw InvalidOperationException(
                    "Window shadowing: ordinary=${ordinary.Value}, direct=${direct.Value}, portal=${portal.Builds}, sibling=${sibling.Value}, parent=${cell.Builds}"
                )
            }
            let ordinaryBuilds = ordinary.Builds
            cell.Value = 21
            cell.Rebuild()
            window.UpdateTree()
            if part.Value != 21 {
                throw InvalidOperationException("Deferred scrollbar part lost its context")
            }
            if scopedReader(window) != direct || portalReader(window) != portal
            || direct.LocalState != 42 || direct.Value != 21 || portal.Value != 21
            || ordinary.Builds != ordinaryBuilds || sibling.Value != 90 {
                throw InvalidOperationException(
                    "Scope update: direct=${direct.Value}, portal=${portal.Value}, ordinary=${ordinary.Builds}/$ordinaryBuilds, sibling=${sibling.Value}"
                )
            }
            let frame = direct.incomingContext!!
            let generation = frame.Generation
            cell.Caption = "changed"
            cell.Rebuild()
            window.UpdateTree()
            if direct.incomingContext != frame || frame.Generation != generation
            || direct.MountedNode()!!.Children[0].Content != "scopedchanged:21" {
                throw InvalidOperationException("A stable scope builder did not refresh its captured content")
            }
            direct.ReadOther = true
            direct.Rebuild()
            window.UpdateTree()
            let readsOther = direct.Builds
            other.Set(window, 51)
            window.UpdateTree()
            if direct.Builds != readsOther + 1 {
                throw InvalidOperationException("Additional dependency: ${direct.Builds}/$readsOther")
            }
            direct.ReadOther = false
            direct.Rebuild()
            window.UpdateTree()
            let detached = direct.Builds
            other.Set(window, 52)
            window.UpdateTree()
            if direct.Builds != detached {
                throw InvalidOperationException("Obsolete dependency: ${direct.Builds}/$detached")
            }
            cell.Reverse = true
            cell.Rebuild()
            window.UpdateTree()
            if scopedReader(window) != direct || direct.Value != 21 {
                throw InvalidOperationException("Keyed reorder lost context or identity")
            }
            cell.Scoped = false
            cell.Rebuild()
            window.UpdateTree()
            let unscoped = scopedReader(window)
            if !direct.disposed || unscoped.Value != 11 || portalReader(window).Value != 11 {
                throw InvalidOperationException(
                    "Scope removal: disposed=${direct.disposed}, direct=${unscoped.Value}, portal=${portalReader(window).Value}"
                )
            }
            cell.Scoped = true
            cell.Value = 22
            cell.Rebuild()
            window.UpdateTree()
            return scopedReader(window).Value == 22 && portalReader(window).Value == 22
            && cell.AsyncIsolated && outsideBuildThrows(key)
        } finally {
            window.Close()
        }
    }

    func FailedBuildRetryAndDisposalContract() bool {
        let key = Context[int32]()
        let other = Context[int32]()
        let cell = ContextTestRoot(key, other)
        let window = Window{Root: cell, Width: 100, Height: 100}
        key.Set(window, 10)
        other.Set(window, 50)
        try {
            window.UpdateTree()
            let reader = scopedReader(window)
            reader.FailNext = true
            reader.Rebuild()
            cell.Value = 25
            cell.Rebuild()
            var threw = false
            try {
                window.UpdateTree()
            } catch (error InvalidOperationException) {
                threw = true
            }
            if !threw || !outsideBuildThrows(key) {
                return false
            }
            let next = ContextTestRoot(key, other)
            let second = Window{Root: next, Width: 100, Height: 100}
            key.Set(second, 60)
            other.Set(second, 70)
            try {
                second.UpdateTree()
                if windowReader(second).Value != 60 {
                    return false
                }
            } finally {
                second.Close()
            }
            window.UpdateTree()
            if scopedReader(window) != reader || reader.Value != 25 {
                return false
            }
            let builds = reader.Builds
            window.Close()
            key.Set(window, 80)
            other.Set(window, 90)
            if !reader.disposed || reader.Disposals != 1 || reader.Builds != builds
            || reader.contextWindow != nil || reader.contextReader != nil {
                return false
            }
            let weak = disposedWindow(key, other)
            for i in 0 ... 3 {
                GC.Collect()
                GC.WaitForPendingFinalizers()
            }
            return !weak.IsAlive && outsideBuildThrows(key)
        } finally {
            window.Close()
        }
    }

    func VirtualRetentionVersionAndFailureContract() bool {
        for portal in[]bool{false, true} {
            let key = Context[int32]()
            let other = Context[int32]()
            let cell = ContextVirtualRoot(key, other, portal)
            cell.State.StateOnlyRead = portal
            let window = Window{Root: cell, Width: 100, Height: 60}
            window.SmoothScrolling = false
            key.Set(window, 10)
            other.Set(window, 50)
            try {
                window.UpdateTree()
                guard let node = cell.Handle.AttachedNode() else {
                    return false
                }
                let row = (node.Children[0].Children[0].Fiber as ContextReadCell)!!
                row.LocalState = 42
                if !row.Handle.Focus() {
                    return false
                }
                let version = cell.State.Version
                let calls = cell.State.Realizations
                key.Set(window, 11)
                window.UpdateTree()
                if cell.State.Version != version || cell.State.Realizations != calls {
                    return false
                }
                cell.Value = 21
                cell.Rebuild()
                window.UpdateTree()
                if node.Children[0].Children[0].Fiber != row || row.LocalState != 42
                || !row.Handle.AttachedNode()!!.Focused || row.Value != 21 || row.Snapshot != 21
                || cell.State.Version <= version || cell.Handle.ScrollOffset.Y != 0.0 {
                    return false
                }
                if !cell.Handle.ScrollToItem("row-8") {
                    return false
                }
                window.UpdateTree()
                guard let scrolled = cell.Handle.AttachedNode() else {
                    return false
                }
                let later = (scrolled.Children[0].Children[0].Fiber as ContextReadCell)!!
                if later.Value != 21 || later.Snapshot != 21 || cell.Handle.ScrollOffset.Y != 160.0 {
                    return false
                }
                cell.State.FailNext = true
                cell.Value = 22
                cell.Rebuild()
                var threw = false
                try {
                    window.UpdateTree()
                } catch (error InvalidOperationException) {
                    threw = true
                }
                if !threw || !outsideBuildThrows(key) {
                    return false
                }
                window.UpdateTree()
                let retried = (scrolled.Children[0].Children[0].Fiber as ContextReadCell)!!
                if retried.Value != 22 || retried.Snapshot != 22 || cell.State.WindowsWrong != 0
                || cell.State.StateReads == 0 || cell.State.NeedsReads == 0 || cell.State.OffsetReads == 0 {
                    return false
                }
                cell.State.RetainContent = true
                cell.ProviderKey = other
                cell.Rebuild()
                window.UpdateTree()
                if scrolled.Children[0].Children[0].Fiber != retried || retried.Value != 11 {
                    return false
                }
                key.Set(window, 12)
                window.UpdateTree()
                if retried.Value != 12 {
                    return false
                }
                window.Close()
                if cell.State.Disposals != 1 {
                    return false
                }
            } finally {
                window.Close()
            }
        }
        return true
    }

    private func windowReader(window Window, index int32 = 0) ContextReadCell ->
    (window.Tree!!.Children[index].Fiber as ContextReadCell)!!

    private func scopeNode(window Window) Node {
        for child in window.Tree!!.Children {
            if child.Key == "scope" {
                return child.Children[0]
            }
        }
        throw InvalidOperationException("Scope was not mounted")
    }

    private func scopedReader(window Window) ContextReadCell -> (
        scopeNode(window).Children[0].Fiber!!.directChild as ContextReadCell
    )!!

    private func portalReader(window Window) ContextReadCell -> (
        scopeNode(window).Children[1].Children[0].Fiber as ContextReadCell
    )!!

    private func siblingReader(window Window) ContextReadCell {
        for child in window.Tree!!.Children {
            if child.Key == "sibling" {
                return (child.Children[0].Fiber!!.directChild!!.directChild as ContextReadCell)!!
            }
        }
        throw InvalidOperationException("Sibling scope was not mounted")
    }

    private func outsideBuildThrows(key Context[int32]) bool {
        var read bool
        var window bool
        try {
            key.Read()
        } catch (error InvalidOperationException) {
            read = true
        }
        try {
            let ignored = key.Window
        } catch (error InvalidOperationException) {
            window = true
        }
        return read && window
    }

    private func disposedWindow(key Context[int32], other Context[int32]) WeakReference {
        let window = Window{Root: ContextTestRoot(key, other), Width: 100, Height: 100}
        key.Set(window, 1)
        other.Set(window, 2)
        window.UpdateTree()
        window.Close()
        return WeakReference(window)
    }
}

internal data struct ContextReadInput {
    internal var Key Context[int32]
    internal var Other Context[int32]
    internal var Label string
    internal var Snapshot int32
}

internal class ContextReadCell : Cell[ContextReadInput], IDisposable {
    internal let Handle ElementHandle = ElementHandle{}
    internal var Value int32
    internal var Snapshot int32
    internal var Builds int32
    internal var Disposals int32
    internal var LocalState int32
    internal var FailNext bool
    internal var ReadOther bool

    protected override func Build(input ContextReadInput) Blob {
        Builds++
        Value = input.Key.Read()
        Snapshot = input.Snapshot
        if ReadOther {
            input.Other.Read()
        }
        if FailNext {
            FailNext = false
            throw InvalidOperationException("Context build failure")
        }
        return Container(){
            .Handle: Handle,
            .Focusable: true,
            .Height: 20,
            .Width: 100,
            .BackgroundColor: Color.Rgb(Snapshot, 0, 0),
            Text{Content: "${input.Label}:$Value"},
        }
    }

    public func Dispose() {
        Disposals++
    }
}

internal class ContextDirectCell : Cell[ContextReadInput] {
    protected override func Build(input ContextReadInput) Blob ->
    Cell.Mount[ContextReadInput, ContextReadCell](nil, input)
}

internal class ContextTestRoot : Cell {
    private let key Context[int32]
    private let other Context[int32]
    private let buildScope Func[Blob]
    private let buildSibling Func[Blob]
    internal var Value int32 = 20
    internal var Builds int32
    internal var Scoped bool = true
    internal var Reverse bool
    internal var Caption string = ""
    internal var AsyncIsolated bool

    internal init(key Context[int32], other Context[int32]) {
        this.key = key
        this.other = other
        buildScope = scopedContent
        buildSibling = () -> Cell.Mount[ContextReadInput, ContextDirectCell](nil, input("sibling"))
    }

    override func Build() Blob {
        Builds++
        let scoped = Container(){.Key: "scope", Scoped ? key.Scope(Value, buildScope): scopedContent()}
        let sibling = Container(){.Key: "sibling", key.Scope(90, buildSibling)}
        return Container(){
            .Width: 100,
            .Height: 100,
            Cell.Mount[ContextReadInput, ContextReadCell]("window", input("window")),
            Reverse ? sibling: scoped,
            Cell.Mount[ContextReadInput, ContextReadCell](
                "other",
                ContextReadInput{Key: other, Other: key, Label: "other"}
            ),
            Reverse ? scoped: sibling,
        }
    }

    private func input(label string) ContextReadInput ->
    ContextReadInput{Key: key, Other: other, Label: label + Caption}

    private func scopedContent() Blob {
        let task = Task[bool](
            () -> {
                let nested = Window{Root: ContextWindowPairCell(key), Width: 20, Height: 20}
                key.Set(nested, 99)
                try {
                    nested.UpdateTree()
                } finally {
                    nested.Close()
                }
                try {
                    key.Read()
                    return false
                } catch (error InvalidOperationException) {
                    return true
                }
            }
        )
        task.RunSynchronously(TaskScheduler.Default)
        AsyncIsolated = task.GetAwaiter().GetResult()
        let expected = Scoped ? Value: key.Read(key.Window)
        if key.Read() != expected {
            throw InvalidOperationException("A nested task build changed its parent's context")
        }
        return Container(){
            Cell.Mount[ContextReadInput, ContextDirectCell]("direct", input("scoped")),
            Portal{Key: "portal", Cell.Mount[ContextReadInput, ContextReadCell](nil, input("portal"))},
            Container(){
                .Key: "parts",
                .Width: 50,
                .Height: 20,
                .OverflowY: Overflow.Scroll,
                .ScrollbarVisibilityY: ScrollbarVisibility.Always,
                .ScrollbarY: Scrollbar{
                    Thumb: Container(){Cell.Mount[ContextReadInput, ContextReadCell](nil, input("part")),}
                },
                Container{Height: 200, FlexShrink: 0},
            },
        }
    }
}

internal class ContextVirtualRoot : Cell {
    internal let Key Context[int32]
    internal let Other Context[int32]
    internal var ProviderKey Context[int32]
    internal let Handle ElementHandle = ElementHandle{}
    internal let State ContextVirtualState
    internal var Value int32 = 20
    private let portal bool
    private let build Func[Blob]

    internal init(key Context[int32], other Context[int32], portal bool) {
        Key = key
        ProviderKey = key
        Other = other
        this.portal = portal
        State = ContextVirtualState(this)
        build = content
    }

    override func Build() Blob -> ProviderKey.Scope(Value, build)

    private func content() Blob {
        let viewport = Virtual(ContextVirtualSource(this)){Handle = Handle, Width = 100, Height = 60}
        return portal ? Portal(){viewport}: viewport
    }
}

internal class ContextVirtualSource : VirtualSource {
    private let owner ContextVirtualRoot
    internal init(owner ContextVirtualRoot) {
        this.owner = owner
    }

    public func State(current VirtualState?) VirtualState {
        owner.State.PendingValue = owner.Key.Read()
        owner.State.StateReads++
        return owner.State
    }
}

internal class ContextVirtualState : VirtualState {
    private let owner ContextVirtualRoot
    private var first int32 = -1
    private var pendingFirst int32
    private var committedVersion int64 = -1L
    private var pendingVersion int64
    internal var Version int64
    internal var Realizations int32
    internal var StateReads int32
    internal var NeedsReads int32
    internal var OffsetReads int32
    internal var WindowsWrong int32
    internal var Disposals int32
    internal var FailNext bool
    internal var RetainContent bool
    internal var StateOnlyRead bool
    internal var PendingValue int32
    private var committedValue int32

    internal init(owner ContextVirtualRoot) {
        this.owner = owner
    }

    public override func Realize(viewport VirtualViewport, output VirtualOutput) {
        let value = PendingValue
        if !StateOnlyRead && owner.Key.Read() != value {
            throw InvalidOperationException("The virtual source inputs did not refresh with their context")
        }
        observeWindow()
        Realizations++
        Version = viewport.ContextVersion
        if FailNext {
            FailNext = false
            throw InvalidOperationException("Context realize failure")
        }
        pendingFirst = int32(viewport.ScrollOffset.Y / 20.0)
        pendingVersion = viewport.ContextVersion
        for index in pendingFirst ... pendingFirst + 3 {
            let key = "row-$index"
            let content Blob? = if (RetainContent || pendingVersion == committedVersion) && pendingFirst == first {
                nil
            } else {
                Cell.Mount[ContextReadInput, ContextReadCell](
                    key,
                    ContextReadInput{Key: owner.Key, Other: owner.Other, Label: key, Snapshot: value}
                )
            }
            output.Add(
                VirtualItem{Key: key, Index: index, Y: float64(index) * 20.0, Width: 100, Height: 20, Content: content}
            )
        }
        output.ContentSize = LayoutSize{Width: 100, Height: 20000}
        output.ItemCount = 1000
    }

    public override func NeedsRealize(viewport VirtualViewport) bool {
        if !StateOnlyRead {
            owner.Key.Read()
        }
        observeWindow()
        NeedsReads++
        return int32(viewport.ScrollOffset.Y / 20.0) != first
    }

    public override func OffsetOf(viewport VirtualViewport, key string) Point? {
        if !StateOnlyRead {
            owner.Key.Read()
        }
        observeWindow()
        OffsetReads++
        return key == "row-8" ? Point{X: 0, Y: 160}: nil
    }

    public override func Commit() {
        first = pendingFirst
        committedVersion = pendingVersion
        committedValue = PendingValue
    }

    public override func Cancel() {
        PendingValue = committedValue
    }

    public override func Dispose() {
        Disposals++
    }

    private func observeWindow() {
        if owner.Key.Window != owner.contextWindow {
            WindowsWrong++
        }
    }
}

internal class ContextWindowPairCell : Cell {
    private let key Context[int32]
    internal var Replace bool

    internal init(key Context[int32]) {
        this.key = key
    }

    override func Build() Blob {
        let dark = key.Read() != 0
        key.Window.SetColors(dark ? Color.Black: Color.White, dark ? Color.White: Color.Black)
        if Replace {
            return Text{Content: "replacement"}
        }
        return Container(){Text{Content: "plain"}, Portal(){Text{Content: "portal"}},}
    }
}
