# Native G# authoring

Goo includes the upstream compiler and formatter at
[`947be9cb`](https://github.com/DavidObando/gsharp/tree/947be9cb5f4467947ecb95dba06b461f9984d659).
The package automatically selects these build tools for SDK 0.4.591, which
predates mixed initializers. No separate installation is needed for apps.
Source contributors run the [authoring setup](../CONTRIBUTING.md#g-authoring-tools).
The temporary package bridge respects explicit compiler paths; set
`GooUseBundledGsharp=false` when testing another SDK compiler.

## Direct children

The current Goo API exposes `Container.Add(Blob)` and `Button.Add(Blob)`.
Prefer dot-free, member-first initializers:

```gsharp
let rows = []Blob{Text("Second")}
let content = Container{Gap: 12.0, Text("First"), ...rows, Button{OnClick: () -> Save(), Text("Save"),},}
```

`Member: value` sets a receiver member. Bare values call `Add`, and `...rows`
evaluates and enumerates the source once. Keep trailing commas in multiline
initializers. All member values, children, and spreads execute in source order.
`BasedOn` must precede its overrides. Siblings must be all keyed or all unkeyed.

Start with a member when combining properties and children. For styled text,
use `Text{Content: "Hello", FontSize: 24}`; plain text can use `Text("Hello")`.
A leading spread in `Container{...source}` is structural projection, while
`Container(){...rows,}` enumerates children. Keep the parentheses for that
content-only form. In an initializer after a constructor or factory call,
unmarked `key: value` calls `Add(key, value)` and never sets a member.

`Children: { ... }` remains valid for collection members and older Goo packages.
`Children: existingList` assigns that list and is not interchangeable with a
spread that copies its contents.

## Other authoring rules

Use `let` for bindings that are not reassigned or mutated by reference. Use `var`
for mutation. A function containing only `return expression` uses `-> expression`.
Keep owned methods in their type. Use width-bearing names in public numeric APIs.
Use `List[T].Add` for growth. The compiler rejects retired `len`, `cap`, `append`,
`delete`, and `close` built-ins with GS0566 and a member replacement.

Widgets, app samples, and code examples use formatting from upstream `GSharp.Formatting.GSharpFormatter`, with four-space
indentation and a 120-column layout budget. Core source keeps its existing layout. `operator implicit(value)` and
`operator explicit(value)` use the upstream word-operator spelling. Symbolic
operators retain the space before their parameter list.

The pinned compiler currently emits `internal event` accessors as public metadata.
Core observer hooks use internal delegate fields to retain their intended visibility.

The linter checks finite rules. Build the exact project and run its behavior
checks after rewriting code. Formatting alone does not establish behavior.
