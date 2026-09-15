# Native G# authoring

Current-source builds use the upstream compiler and formatter at
[`947be9cb`](https://github.com/DavidObando/gsharp/tree/947be9cb5f4467947ecb95dba06b461f9984d659).
Run the [authoring setup](../CONTRIBUTING.md#g-authoring-tools) first.
The published SDK 0.4.591 predates mixed initializers.

## Direct children

The current Goo API exposes `Container.Add(Blob)` and `Button.Add(Blob)`.
Use the call-headed form with explicit member designators:

```gsharp
let rows = []Blob{Text("Second")}
let content = Container(){.Gap: 12.0, Text("First"), ...rows, Button(){.OnClick: () -> Save(), Text("Save"),},}
```

`.Member: value` sets a receiver member. Bare values call `Add`, and `...rows`
evaluates and enumerates the source once. Keep trailing commas in multiline
initializers. All member values, children, and spreads execute in source order.
`BasedOn` must precede its overrides. Siblings must be all keyed or all unkeyed.

The member-first form `Container{Gap: 12.0, Text("First"), ...rows}` is also valid.
A leading spread in `Container{...source}` is structural projection.
`Container(){...rows,}` is content enumeration. In a call-headed initializer,
unmarked `key: value` calls `Add(key, value)` and never sets a member.

`Children: { ... }` remains valid for collection members and older Goo packages.
`Children: existingList` assigns that list and is not interchangeable with a
spread that copies its contents. The published starter keeps the collection-member
form because Goo 0.5.3 does not expose `Container.Add` or `Button.Add`.

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
