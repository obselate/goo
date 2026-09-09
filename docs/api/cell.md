# Cell API

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/Cell`](../../Goo/Cell)

## Build input cells

Store local Cell state in ordinary fields. Goo rebuilds the owning Cell after its input callbacks. Call `Rebuild()` after mutations outside Goo input dispatch.

A packaged G# component derived from `Cell<TInput>` should be an `open class` and override `protected Build(input TInput) Blob`. G# requires the inheritable class declaration because the override is protected. Goo passes the stored immutable snapshot through this typed dispatch path. Existing same-assembly components that override parameterless `Build()` remain valid. If a component overrides both overloads, the typed overload takes precedence. Override `ShouldRebuild(previous, next)` only when default structural equality does not match the component's rebuild policy.

## Mount with a factory

`Cell.Mount<TCell>(factory, key)` accepts a `System.Func<TCell>` and does not require a parameterless constructor. The factory can supply constructor dependencies or create an F# object expression. The existing mounts with configuration, seeding, or typed inputs remain available.

```gsharp
Cell.Mount[Counter](() -> Counter(store), "counter")
```

```csharp
Cell.Mount(() => new Counter(store), "counter")
```

A mounted Cell is retained by its declared `TCell` and sibling key. The factory runs only when a new mount is needed. Rebuilding the parent, replacing its factory delegate, or changing values captured by the factory does not recreate the retained Cell. Use a different key when a different instance is required. When several factories return the base `Cell` type, give their distinct components distinct stable keys.

Goo owns the returned Cell and disposes it when removed. Each factory invocation must return a fresh, unmounted, undisposed instance. Do not return one instance for multiple mounts or return a disposed instance after removal. A null factory or result is rejected.

Constructor arguments are initialization, not changing input snapshots. For later updates, use typed inputs, configuration, or an external store read by `Build()`. Call the mounted Cell's `Rebuild()` after changes outside Goo input callbacks. Read changing values from the store or a getter instead of capturing a copied scalar. Calling a Cell's `Build()` directly only returns its Blob tree and does not mount that Cell.

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

let value = ref 0
let direct = Cell.Mount<Cell>(Func<Cell>(fun () -> counter value), "direct")
let throughHelper = mount "helper" (fun () -> counter value)
```

Creating a capturing factory inside every parent build can allocate a new delegate and closure even when the Cell is reused. Cache the factory when its dependencies are stable. Goo does not invoke a factory merely to discover the created Cell's runtime type.

## `Cell`

Source:

- [`Cell.gs`](../../Goo/Cell/Cell.gs)

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

### `Animate(Point,System.Action{Point})`

Creates a point animation that reports values without rebuilding this component.

- `initial`: initial value
- `onChange`: receives values from Set and each motion tick

Returns: an animation bridge owned by this component

### `Animate(float64)`

Creates a number animated by this component.

- `initial`: initial value

Returns: an animation bridge owned by this component

### `Animate(float64,System.Action{float64})`

Creates a number animation that reports values without rebuilding this component.

- `initial`: initial value
- `onChange`: receives values from Set and each motion tick

Returns: an animation bridge owned by this component

### `Animate``1(T,MotionConverter{T})`

Creates a value animated by this component with custom coordinates.

- `T`: animated value type
- `initial`: initial value
- `converter`: maps values to scalar simulation coordinates

Returns: an animation bridge owned by this component

### `Animate``1(T,MotionConverter{T},System.Action{T})`

Creates a custom-coordinate animation that reports values without rebuilding this component.

- `T`: animated value type
- `initial`: initial value
- `converter`: maps values to scalar simulation coordinates
- `onChange`: receives values from Set and each motion tick

Returns: an animation bridge owned by this component

### `Build`

Builds the component tree.

Returns: the root blob for this component

### `MountSeeded``1(string,System.Action{TCell},System.Action{TCell})`

Describes a child component mount with one-time initialization.

- `TCell`: child component type
- `key`: stable sibling key, or nil for positional identity
- `seed`: initialization applied only when the component mounts
- `configure`: configuration applied during each parent diff; prefer stable named or cached delegates

Returns: a blob that mounts the child component

### `Mount``1(System.Func{TCell},string)`

Describes a child component mount created by a factory.

- `TCell`: declared child component type
- `factory`: creates a fresh child component when the mount has no retained instance
- `key`: stable sibling key, or nil for positional identity

Returns: a blob that mounts the child component

### `Mount``1(string)`

Describes a child component mount.

- `TCell`: child component type
- `key`: stable sibling key, or nil for positional identity

Returns: a blob that mounts the child component

### `Mount``1(string,System.Action{TCell})`

Describes a child component mount.

- `TCell`: child component type
- `key`: stable sibling key, or nil for positional identity
- `configure`: configuration applied during each parent diff; prefer stable named or cached delegates

Returns: a blob that mounts the child component

### `Mount``2(string,TInput)`

Describes a child component mount with an immutable input snapshot.

- `TInput`: component input type
- `TCell`: child component type
- `key`: stable sibling key, or nil for positional identity
- `input`: immutable input snapshot

Returns: a blob that mounts the child component

### `Rebuild`

Requests a rebuild of this component.

## `Cell<TInput any>`

Source:

- [`InputCell.gs`](../../Goo/Cell/InputCell.gs)

Defines a stateful Goo component with an immutable input snapshot.

### `Build(TInput any)`

Builds the component tree from the current immutable input snapshot.

- `input`: current input snapshot

Returns: the root blob for this component

### `ShouldRebuild(TInput any,TInput any)`

Decides whether a later post-mount snapshot needs a rebuild after Input stores next; default uses EqualityComparer[TInput].Default.

### `Input`

Gets the current immutable input snapshot.
