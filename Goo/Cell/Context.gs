package Goo

import System
import System.Collections.Generic
import System.Threading.Tasks

/// Identifies one retained value independently of other keys of the same type.
/// @typeparam T The value type.
public sealed class Context[T any] {
    /// Creates a key without a default value.
    public init() { }

    /// Gets the owner window during a Cell build or retained virtual callback.
    /// Access outside an owned build or callback throws InvalidOperationException.
    public prop Window Window {
        get -> ContextEnvironment.OwnedWindow()
    }

    /// Reads the nearest retained provider and records the current owner as a dependent.
    /// @returns The nearest provided value.
    /// @exception InvalidOperationException when no owned build or value is active.
    public func Read() T {
        let environment = ContextEnvironment.Current
        let window = ContextEnvironment.OwnedWindow()
        let frame = Find(environment.Frame, window)
        guard let owner = environment.Reader ?? environment.Cell?.EnsureContextReader()
        ?? environment.Virtual?.EnsureContextReader() else {
            throw InvalidOperationException(
                "Context.Read requires a Cell build or virtual callback. Use Read(window) outside Build."
            )
        }
        let subscriptions = owner.Subscriptions()
        for dependency in subscriptions {
            if dependency.Key == this {
                let typed = (dependency as ContextDependency[T])!!
                typed.Observe(frame)
                return frame.Value
            }
        }
        let dependency = ContextDependency[T](this, owner)
        subscriptions.Add(dependency)
        dependency.Observe(frame)
        return frame.Value
    }

    /// Reads only the window value without subscribing or looking up subtree providers.
    /// @param window The owner-thread window.
    /// @returns The window value.
    /// @exception InvalidOperationException when the value is absent or the owner-thread rule is violated.
    public func Read(window Window) T {
        window.RequireContextThread()
        guard let frame = window.ContextValue(this) as ContextValue[T]? else {
            throw InvalidOperationException("No value is installed for this Context key in the window.")
        }
        return frame.Value
    }

    /// Tries to read only the window value without registering a dependency.
    /// @param window The owner-thread window.
    /// @param value Receives the value, or the default value of T when absent.
    /// @returns True when the window has a value for this key.
    public func TryRead(window Window, out value T) bool {
        window.RequireContextThread()
        if let frame = window.ContextValue(this) as ContextValue[T]? {
            value = frame.Value
            return true
        }
        value = default(T)
        return false
    }

    /// Sets the window value and queues affected owners without synchronously building them.
    /// Equal values are suppressed with EqualityComparer[T].Default.
    /// @param window The owner-thread window.
    /// @param value The new window value.
    public func Set(window Window, value T) {
        window.RequireContextThread()
        if let frame = window.ContextValue(this) as ContextValue[T]? {
            if frame.Set(value) {
                frame.Notify()
            }
        } else {
            window.AddContextValue(this, ContextValue[T](this, value))
        }
    }

    /// Describes a retained, layout-transparent provider whose builder runs under its value.
    /// @param value The subtree value.
    /// @param build The deferred subtree builder. An already-built Blob is not accepted.
    /// @returns A normal positional Cell mount declaration.
    public func Scope(value T, build Func[Blob]) Blob {
        if build == nil {
            throw ArgumentNullException("build")
        }
        return ContextScopeDeclaration[T]{
            CellType: typeof(ContextProvider),
            ContextKey: this,
            Value: value,
            Builder: build
        }
    }

    internal func Find(lineage ContextFrame?, window Window) ContextValue[T] {
        var current = lineage
        while let frame = current {
            if frame.Key == this {
                return (frame as ContextValue[T])!!
            }
            current = frame.Parent
        }
        guard let value = window.ContextValue(this) as ContextValue[T]? else {
            throw InvalidOperationException("No value is installed for this Context key in the active lineage.")
        }
        return value
    }
}

internal data struct ContextEnvironment {
    internal var Window Window?
    internal var Frame ContextFrame?
    internal var Reader ContextReader?
    internal var Cell Cell?
    internal var Virtual VirtualNodeState?
    private var taskId int32

    shared {
        @ThreadStatic
        private var current ContextEnvironment

        internal prop Current ContextEnvironment {
            get -> current
            set(v) {
                current = v
                current.taskId = Task.CurrentId ?? 0
            }
        }

        internal func OwnedWindow() Window {
            if current.taskId != (Task.CurrentId ?? 0) {
                throw InvalidOperationException("Async tasks do not inherit Context. Use Read(window) on the owner thread.")
            }
            guard let window = Current.Window else {
                throw InvalidOperationException(
                    "Context requires an owned build or virtual callback. Use Read(window) outside Build."
                )
            }
            return window
        }
    }
}

internal open class ContextFrame {
    internal let Key object
    internal var Parent ContextFrame?
    internal var Generation int64
    internal var Owner Window?
    private var dependents List[ContextDependency]?
    private var notifying bool

    internal init(key object) {
        Key = key
    }

    internal func Subscribe(dependency ContextDependency) {
        dependents ??= List[ContextDependency]()
        dependents!!.Add(dependency)
    }

    internal func Unsubscribe(dependency ContextDependency) {
        dependents?.Remove(dependency)
    }

    internal func Notify(lineageChanged bool = false) {
        if notifying {
            return
        }
        notifying = true
        try {
            let count = dependents?.Count ?? 0
            var index = count - 1
            while index >= 0 {
                if let list = dependents {
                    if index < list.Count {
                        list[index].Refresh()
                    }
                }
                index--
            }
        } finally {
            notifying = false
        }
        Owner?.InvalidateVirtualContexts(this, lineageChanged)
    }

    internal open func Commit() { }

    internal open func Cancel() { }

    internal func Clear() {
        dependents?.Clear()
        Owner = nil
        Parent = nil
    }
}

internal sealed class ContextValue[T any] : ContextFrame {
    internal var Value T
    private var previous T = default(T)
    private var previousParent ContextFrame?
    private var previousGeneration int64
    private var pending bool

    internal init(key object, value T) : base(key) {
        Value = value
    }

    internal func Set(value T) bool {
        if EqualityComparer[T].Default.Equals(Value, value) {
            return false
        }
        Value = value
        Generation++
        return true
    }

    internal func Stage(parent ContextFrame?, value T) {
        if !pending {
            previous = Value
            previousParent = Parent
            previousGeneration = Generation
            pending = true
        }
        let moved = Parent != parent
        Parent = parent
        if Set(value) || moved {
            Notify(moved)
        }
    }

    internal override func Commit() {
        pending = false
        previous = default(T)
        previousParent = nil
    }

    internal override func Cancel() {
        if !pending {
            return
        }
        Value = previous
        Parent = previousParent
        Generation = previousGeneration
        pending = false
        previous = default(T)
        previousParent = nil
        Notify()
    }
}

internal open class ContextDependency {
    internal let Key object
    internal let Owner ContextReader
    internal var Seen bool
    internal var Committed bool
    protected let watched List[ContextFrame] = List[ContextFrame]()

    internal init(key object, owner ContextReader) {
        Key = key
        Owner = owner
    }

    internal open func Commit() { }

    internal open func Refresh() { }

    internal func Detach() {
        for frame in watched {
            frame.Unsubscribe(this)
        }
        watched.Clear()
    }
}

internal sealed class ContextDependency[T any] : ContextDependency {
    private let key Context[T]
    private var value T = default(T)
    private var observed T = default(T)

    internal init(key Context[T], owner ContextReader) : base(key, owner) {
        this.key = key
    }

    internal func Observe(frame ContextValue[T]) {
        Seen = true
        observed = frame.Value
    }

    internal override func Commit() {
        value = observed
        Committed = true
        Refresh()
    }

    internal override func Refresh() {
        if !Committed {
            return
        }
        let window = Owner.Window
        Detach()
        var current = Owner.Frame
        var selected ContextValue[T]?
        while let frame = current {
            watched.Add(frame)
            frame.Subscribe(this)
            if frame.Key == key {
                selected = frame as ContextValue[T]
                break
            }
            current = frame.Parent
        }
        if selected == nil {
            if let ownerWindow = window {
                selected = ownerWindow.ContextValue(key) as ContextValue[T]?
                if let frame = selected {
                    watched.Add(frame)
                    frame.Subscribe(this)
                }
            }
        }
        if let frame = selected {
            if EqualityComparer[T].Default.Equals(value, frame.Value) {
                return
            }
        }
        Owner.Invalidate()
    }
}

internal sealed class ContextReader {
    internal var Window Window?
    internal var Frame ContextFrame?
    internal var Provider ContextFrame?
    internal var Cell Cell?
    internal var Virtual VirtualNodeState?
    internal var Preserve bool
    private var dependencies List[ContextDependency]?
    private var reading bool

    internal func Subscriptions() List[ContextDependency] {
        dependencies ??= List[ContextDependency]()
        return dependencies!!
    }

    internal func Begin() {
        if reading {
            return
        }
        reading = true
        Preserve = false
        if let list = dependencies {
            for dependency in list {
                dependency.Seen = false
            }
        }
    }

    internal func Refresh() {
        if let list = dependencies {
            for dependency in list {
                dependency.Refresh()
            }
        }
    }

    internal func Commit(preserve bool = false) {
        if let list = dependencies {
            var index = list.Count - 1
            while index >= 0 {
                let dependency = list[index]
                if dependency.Seen {
                    dependency.Commit()
                } else if !preserve {
                    dependency.Detach()
                    list.RemoveAt(index)
                }
                index--
            }
        }
        Provider?.Commit()
        reading = false
    }

    internal func Cancel() {
        Provider?.Cancel()
        if let list = dependencies {
            var index = list.Count - 1
            while index >= 0 {
                if !list[index].Committed {
                    list.RemoveAt(index)
                }
                index--
            }
        }
        reading = false
    }

    internal func Invalidate() {
        if let cell = Cell {
            if !cell.building {
                cell.RestoreDirtyAndSubmit()
            }
        }
        Virtual?.InvalidateContext()
    }

    internal func Dispose() {
        if let list = dependencies {
            for dependency in list {
                dependency.Detach()
            }
            list.Clear()
        }
        Provider?.Clear()
        Provider = nil
        Frame = nil
        Window = nil
        Cell = nil
        Virtual = nil
    }
}

internal open class ContextScopeDeclaration : CellElement {
    internal prop Builder Func[Blob] {
        get;
        init;
    }
    internal open func Prepare(provider ContextProvider) ContextFrame;

    internal open func Same(previous ContextScopeDeclaration) bool;

    internal override func CreateCell() Cell -> ContextProvider()

    internal override func ApplyInput(cell Cell) {
        if cell is ContextProvider {
            cell.SetDeclaration(this)
        }
    }
}

internal sealed class ContextScopeDeclaration[T any] : ContextScopeDeclaration {
    internal prop ContextKey Context[T] {
        get;
        init;
    }
    internal prop Value T {
        get;
        init;
    }

    internal override func Same(previous ContextScopeDeclaration) bool ->
    previous is ContextScopeDeclaration[T] && previous.ContextKey == ContextKey
    && previous.Builder == Builder && EqualityComparer[T].Default.Equals(previous.Value, Value)

    internal override func Prepare(provider ContextProvider) ContextFrame {
        let reader = provider.EnsureContextReader()
        var frame = reader.Provider as ContextValue[T]?
        if frame == nil || frame.Key != ContextKey {
            reader.Provider?.Clear()
            frame = ContextValue[T](ContextKey, Value)
            reader.Provider = frame
        }
        frame.Owner = provider.contextWindow
        frame.Stage(provider.incomingContext, Value)
        return frame
    }
}

internal sealed class ContextProvider : Cell {
    private var declaration ContextScopeDeclaration?

    internal func SetDeclaration(value ContextScopeDeclaration) {
        let changed = declaration == nil || !value.Same(declaration!!)
        declaration = value
        if changed {
            MarkDirtyFromInput()
        }
    }

    override func Build() Blob {
        let input = declaration!!
        let frame = input.Prepare(this)
        let reader = EnsureContextReader()
        outgoingContext = frame
        reader.Frame = frame
        let previous = ContextEnvironment.Current
        ContextEnvironment.Current = ContextEnvironment{Window: contextWindow, Frame: frame, Reader: reader}
        try {
            return input.Builder()
        } finally {
            ContextEnvironment.Current = previous
        }
    }
}
