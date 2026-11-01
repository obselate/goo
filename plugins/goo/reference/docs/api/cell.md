# Cell API

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/Cell`](https://github.com/obselate/goo/tree/main/Goo/Cell)

## Build input cells

Store local Cell state in ordinary fields. Goo rebuilds the owning Cell after its input callbacks. Call `Rebuild()` after mutations outside Goo input dispatch.

Derive packaged components as `open class X : Cell<TInput>` and override `protected Build(input TInput) Blob`. Goo passes the stored immutable input snapshot. Same-assembly components can still override parameterless `Build()`. If both overloads are overridden, the typed overload wins. Override `ShouldRebuild(previous, next)` only when default structural equality does not match the rebuild policy.

## Mount parameterless cells

Use `Cell.Mount<TCell>()` for a fixed, unkeyed child with a parameterless constructor. Goo retains the mounted Cell by its declared type and sibling position.

```gsharp
Cell.Mount[Counter]()
```

Use `Cell.Mount<TCell>(key)` when the child needs stable identity across insertion, removal, or reordering.
Siblings can mix keyed and unkeyed entries. Unkeyed identity uses the absolute sibling index and never matches a keyed entry.

```gsharp
Cell.Mount[Counter]("counter")
```

## Mount with a factory

`Cell.Mount<TCell>(factory, key)` accepts a `System.Func<TCell>` without requiring a parameterless constructor. Use it for constructor dependencies or F# object expressions. Configuration, seeding, and typed-input mounts remain available.

```gsharp
Cell.Mount[Counter](() -> Counter(store), "counter")
```

```csharp
Cell.Mount(() => new Counter(store), "counter")
```

A mounted Cell is retained by declared `TCell` and sibling key. The factory runs only for a new mount. Rebuilding the parent, replacing the delegate, or changing captured values does not recreate the Cell. Change the key for a new instance. Factories returning the base `Cell` type need distinct stable keys for distinct components.

Goo owns and disposes the Cell on removal. Each invocation must return a fresh, unmounted, undisposed instance. Do not share an instance across mounts or return a disposed instance. A null factory or result is rejected.

Constructor arguments initialize the Cell. Update it through typed inputs, configuration, or an external store read by `Build()`. Call its `Rebuild()` after changes outside Goo input callbacks. Read changing values from a store or getter, not a captured scalar copy. Calling `Build()` directly returns a Blob tree without mounting the Cell.

F# can call the CLR overload directly or through a helper:

```fsharp
open System
open Goo

let mount key (create: unit -> Cell) =
    Cell.Mount<Cell>(Func<Cell>(create), key)

let counter (value: int ref) =
    { new Cell() with
        override _.Build() =
            Text(Content = $"Count: {value.Value}") :> Blob }

let value = ref 0let direct = Cell.Mount<Cell>(Func<Cell>(fun () -> counter value), "direct")
let throughHelper = mount "helper" (fun () -> counter value)
```

Capturing factories inside parent builds can allocate delegates and closures even when the Cell is reused. Cache factories with stable dependencies. Goo never invokes a factory to discover its result's runtime type.

## `Cell`

Source:

- [`Cell.gs`](https://github.com/obselate/goo/blob/main/Goo/Cell/Cell.gs)

Defines a stateful Goo component.

### `new`

Creates a component.

### `Animate(Color)`

Creates a color animated by this component.

- `initial`: initial value

Returns: an animation bridge owned by this component

### `Animate(Color,System.Action{Color})`

Creates a color animation that reports values without rebuilding this component.

- `initial`: initial value
- `onChange`: receives values from Set and each motion tick

Returns: an animation bridge owned by this component

### `Animate(Length)`

Creates a fixed-unit length animated by this component.

- `initial`: pixel or percentage initial value

Returns: an animation bridge owned by this component

### `Animate(Length,System.Action{Length})`

Creates a fixed-unit length animation that reports values without rebuilding this component.

- `initial`: pixel or percentage initial value
- `onChange`: receives values from Set and each motion tick

Returns: an animation bridge owned by this component

### `Animate(Point)`

Creates a point animated by this component.

- `initial`: initial value

Returns: an animation bridge owned by this component
