# Native G# authoring

Goo builds with G# SDK 0.5.26 from NuGet. Apps use the SDK compiler directly.
Source contributors run the [source setup](../CONTRIBUTING.md#source-setup).

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
`BasedOn` must precede its overrides. Siblings can mix keyed and unkeyed entries.
Keys retain identity across moves. Unkeyed entries retain identity only at the
same absolute sibling index, and never match a keyed entry.

Start with a member when combining properties and children. For styled text,
use `Text{Content: "Hello", FontSize: 24}`; plain text can use `Text("Hello")`.
A leading spread in `Container{...source}` is structural projection, while
`Container(){...rows,}` enumerates children. Keep the parentheses for that
content-only form. In an initializer after a constructor or factory call,
unmarked `key: value` calls `Add(key, value)` and never sets a member.

`Children: { ... }` remains valid for collection members and older Goo packages.
`Children: existingList` assigns that list and is not interchangeable with a
spread that copies its contents.

## Repository rules

See [code conventions](https://github.com/obselate/goo/blob/71ce57a838efac7ecf5f5b87b7a501c7b33166cd/CONVENTIONS.md) for G# idioms, layout and verification.
