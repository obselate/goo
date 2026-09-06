# Cell API

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/Cell`](../../Goo/Cell)

## Build input cells

Store local Cell state in ordinary fields. Goo rebuilds the owning Cell after its input callbacks. Call `Rebuild()` after mutations outside Goo input dispatch.

A packaged G# component derived from `Cell<TInput>` should be an `open class` and override `protected Build(input TInput) Blob`. G# requires the inheritable class declaration because the override is protected. Goo passes the stored immutable snapshot through this typed dispatch path. Existing same-assembly components that override parameterless `Build()` remain valid. If a component overrides both overloads, the typed overload takes precedence. Override `ShouldRebuild(previous, next)` only when default structural equality does not match the component's rebuild policy.

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
