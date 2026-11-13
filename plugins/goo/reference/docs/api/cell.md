# Cell API

Source: [`Goo/Cell`](https://github.com/obselate/goo/tree/main/Goo/Cell)

## Build input cells

Derive packaged components as `open class X : Cell<TInput>` and override `protected Build(input TInput) Blob`. Goo passes the stored immutable input snapshot. Same-assembly components can still override parameterless `Build()`. If both overloads are overridden, the typed overload wins. Override `ShouldRebuild(previous, next)` only when default structural equality does not match the rebuild policy.

## Forward input callbacks

```gsharp
private func Changed(value string) {
    InvokeInputCallback(current.OnChange, value)
}
```

Use protected `Cell<TInput>.InvokeInputCallback` for input-time callbacks. It rebuilds only the Cell that supplied the input, even if the callback throws.
A child-created Blob must forward supplied callbacks through this helper. Parent-built Blob content keeps its original author automatically.
Guard costly arguments when the callback can be nil. Call Build-time queries directly. They must not change host state.

## Mount parameterless cells

```gsharp
Cell.Mount[Counter]()
```

Pass a key when siblings can be inserted, removed or reordered.

```gsharp
Cell.Mount[Counter]("counter")
```

## Mount with a factory

`Cell.Mount[TCell](https://github.com/obselate/goo/blob/main/docs/api/key%2C factory)` mounts a Cell with constructor dependencies without a parameterless constructor.

```gsharp
Cell.Mount[Counter]("counter", () -> Counter(store))
```

A mounted Cell is retained by declared `TCell` and sibling key. The factory runs only for a new mount. Rebuilding the parent, replacing the delegate, or changing captured values does not recreate the Cell. Change the key for a new instance. Factories returning the base `Cell` type need distinct stable keys for distinct components.

Goo owns and disposes the Cell on removal. Each invocation must return a fresh, unmounted, undisposed instance. Do not share an instance across mounts or return a disposed instance. A null factory or result is rejected.

Constructor arguments initialize the Cell. Update it through typed inputs, configuration, or an external store read by `Build()`. Call its `Rebuild()` after changes outside Goo input callbacks. Read changing values from a store or getter, not a captured scalar copy. Calling `Build()` directly returns a Blob tree without mounting the Cell.

See [language interop](../interop.md) for other languages.

Capturing factories inside parent builds can allocate delegates and closures even when the Cell is reused. Cache factories with stable dependencies. Goo never invokes a factory to discover its result's runtime type.

With constructor dependencies and typed input, use `Cell.Mount[Input, Page]("page", input, () -> Page(service))`. The input is stored on every parent diff. The factory still runs only for a new mount.

## Own work for the mounted Cell

`Host` is the owning window. It is valid from window binding, before the first `InputChanged` or `Build`, until `Unmounting` returns. Reading it in a constructor or after unmount throws with the Cell type name.

Override `Mounted()` for work that needs mounted handles and the first layout. It runs once before paint. Override `Unmounting()` for cleanup before elements are removed. `Lifetime` is cancelled after that hook returns, then Goo calls `IDisposable.Dispose` when implemented.

Use `Post(action)` from any thread to update the Cell on its UI thread. It returns false when the Cell is not mounted or the window rejects posts. Use `After(delayMs, action)` or `Every(intervalMs, action)` on the UI thread for owned timers. Pending actions and timers stop at unmount or close. Goo applies the normal callback rebuild rule after each action, including one that throws. Use `Host.Every` for work that does not change the Cell.
Scheduling with `Post`, `After` or `Every` during `Build` throws. Schedule from `InputChanged`, `Mounted`, callbacks or continuations. `Host` and `Lifetime` can be read during `Build`.

Pass `Lifetime` to cancellable work. For replaceable requests, call `Latest("load")` on the UI thread. It cancels the previous token for that name and returns a new token linked to `Lifetime`. Before applying a result, check `token.IsCancellationRequested` on the UI thread.

## `Cell`


Defines a stateful Goo component.

### `new`

Creates a component.

### `After(float64,System.Action)`

Runs an action once on the UI thread after a delay. Call on the UI thread. Unmounting cancels the timer. Goo applies the normal callback rebuild rule after the action.

- `delayMs`: finite, nonnegative delay in milliseconds
- `action`: callback to run once

Returns: a timer to cancel on the UI thread, or an inactive timer before window binding, after unmount, or when the window rejects work

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

### `AnimateValue(Color)`

Creates a Cell-owned color animation without rebuilding this component.

### `AnimateValue(Length)`

Creates a Cell-owned fixed-unit length animation without rebuilding this component.

### `AnimateValue(Point)`

Creates a Cell-owned point animation without rebuilding this component.

### `AnimateValue(float64)`

Creates a Cell-owned number animation without rebuilding this component.

### `AnimateValue``1(``0,MotionConverter{``0})`

Creates a Cell-owned custom-coordinate animation without rebuilding this component.

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

### `Every(float64,System.Action)`

Runs an action repeatedly on the UI thread. Call on the UI thread. Missed ticks are skipped. Unmounting cancels the timer. Goo applies the normal callback rebuild rule after each action.

- `intervalMs`: finite, positive interval in milliseconds
- `action`: callback to run at each interval

Returns: a timer to cancel on the UI thread, or an inactive timer before window binding, after unmount, or when the window rejects work

### `Latest(string)`

Cancels the previous request with this name and links a new token to Lifetime. Call on the UI thread.

- `name`: case-sensitive request name

Returns: a new request token, or a cancelled token after unmount

### `Mount``1(string)`

Describes a child component mount.

- `TCell`: child component type
- `key`: stable sibling key, or nil for positional identity

Returns: a blob that mounts the child component

### `Mount``1(string,System.Func{TCell})`

Describes a child component mount created by a factory.

- `TCell`: declared child component type
- `key`: stable sibling key, or nil for positional identity
- `factory`: creates a fresh child component when the mount has no retained instance

Returns: a blob that mounts the child component

### `Mount``2(string,TInput)`

Describes a child component mount with an immutable input snapshot.

- `TInput`: component input type
- `TCell`: child component type
- `key`: stable sibling key, or nil for positional identity
- `input`: immutable input snapshot

Returns: a blob that mounts the child component

### `Mount``2(string,TInput,System.Func{TCell})`

Describes a child mount with input and constructor dependencies.

- `TInput`: component input type
- `TCell`: declared child component type
- `key`: stable sibling key, or nil for positional identity
- `input`: input snapshot stored on every parent diff
- `factory`: creates a fresh component only for a new mount

Returns: a blob that mounts the child component

### `Mounted`

Runs once on the UI thread after the first layout and before paint. Handles have geometry. Goo applies the normal callback rebuild rule after this hook, including when it throws.

### `Post(System.Action)`

Posts an action from any thread. Unmounting discards pending actions. Goo applies the normal callback rebuild rule after the action, even if it throws.

- `action`: callback to run on the UI thread

Returns: true when accepted, or false before window binding, after unmount, or when the window rejects posts

### `Rebuild`

Requests a rebuild of this component. Mounted cells must use their window's UI thread. Post background results with Window.Post.

### `Unmounting`

Runs once on the UI thread before elements are removed and Lifetime is cancelled, parent before child. May run without Mounted when mounting fails. Does not request a rebuild.

### `Host`

Gets the owning window on its UI thread from binding until Unmounting returns.

### `Lifetime`

Gets a token on the UI thread, valid from window binding and cancelled after Unmounting returns.

Returns: the Cell lifetime token, or a cancelled token after unmount

## `Cell<TInput>`


Defines a stateful Goo component with an immutable input snapshot.

### `Build(TInput)`

Builds the component tree from the current immutable input snapshot.

- `input`: current input snapshot

Returns: the root blob for this component

### `InvokeInputCallback(System.Action)`

Invokes an input-time callback and rebuilds the Cell that supplied this input. A supplying Cell already in Build needs no extra rebuild. Call Build-time queries directly. They must not change the supplying Cell's state.

- `callback`: callback from the current input

### `InvokeInputCallback``1(System.Action{T},T)`

- `T`: callback argument type
- `callback`: callback from the current input
- `value`: callback argument

### `InvokeInputCallback``2(System.Action{T1,T2},T1,T2)`

- `T1`: first callback argument type
- `T2`: second callback argument type
- `callback`: callback from the current input
- `first`: first callback argument
- `second`: second callback argument

### `InvokeInputCallback``2(System.Func{T,TResult},T,TResult)`

- `T`: callback argument type
- `TResult`: callback result type
- `callback`: callback from the current input
- `value`: callback argument
- `fallback`: result when callback is nil

Returns: the callback result or fallback

### `ShouldRebuild(TInput,TInput)`

Decides whether a later post-mount snapshot needs a rebuild after Input stores next; default uses EqualityComparer[TInput].Default.

### `Input`

Gets the current immutable input snapshot.

## `Context<T>`


Identifies one retained value independently of other keys of the same type.

### `new`

Creates a key without a default value.

### `Read`

Reads the nearest retained provider and records the current owner as a dependent.

Returns: The nearest provided value.

### `Read(Window)`

Reads only the window value without subscribing or looking up subtree providers.

- `window`: The owner-thread window.

Returns: The window value.

### `Scope(T,System.Func{Blob})`

Describes a retained, layout-transparent provider whose builder runs under its value.

- `value`: The subtree value.
- `build`: The deferred subtree builder. Its input callbacks rebuild the declaring Cell. An already-built Blob is not accepted.

Returns: A normal positional Cell mount declaration.

### `Set(Window,T)`

Sets the window value and queues affected owners without synchronously building them. Equal values are suppressed with EqualityComparer[T].Default.

- `window`: The owner-thread window.
- `value`: The new window value.

### `TryRead(Window,T@)`

Tries to read only the window value without registering a dependency.

- `window`: The owner-thread window.
- `value`: Receives the value, or the default value of T when absent.

Returns: True when the window has a value for this key.

### `Window`

Gets the owner window during a Cell build or retained virtual callback. Access outside an owned build or callback throws InvalidOperationException.

## `State<T>`


Holds a value that rebuilds the Cells that read it in Build when it changes.

### `new(T)`

Creates state with an initial value.

### `ToString`

Returns the text of the current value.

### `op_Implicit(State{T})~T`

Converts state to its current value.

### `Value`

Gets or sets the value. A read in Build subscribes the Cell. A write of a different value rebuilds its readers.

## `StateDependency`


Base type of tracked Cell state.
