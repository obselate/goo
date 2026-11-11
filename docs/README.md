# App-author documentation

Create an app with the [template command](../README.md#use). Check [platform requirements](platform-preflight.md) first. The template selects the G# SDK.

## Tutorials

| Task | Guide |
| --- | --- |
| Compose functions and Cells | [After the counter](getting-started.md) |
| Add a reset action | [State](getting-started.md#state) |
| Edit a running app | [Hot reload exercise](devtools/README.md#edit-a-running-app) |
| Build a form | [Text input](tutorials/a-text-input-form.md) |
| Resize panes | [Split pane](tutorials/a-resizable-panel.md) |
| Build a large list | [Virtual list](tutorials/a-virtual-list.md) |
| Reorder a small list | [Drag and drop](tutorials/drag-and-drop-a-list.md) |
| Draw a gauge | [Shapes](tutorials/drawing-a-gauge.md) |
| Switch themes | [Styling and themes](tutorials/styling-and-themes.md) |
| Animate a panel | [Motion](api/motion.md) |

Learn G# with the [language tour](https://davidobando.github.io/gsharp/docs/tour/) and [editor support](https://github.com/DavidObando/gsharp#editor-support).

### Tutorial setup

Create the starter with the [template command](../README.md#use), then add:

```sh
dotnet add package Goo.Widgets --version 0.20.0
```

Each recipe replaces `Program.gs`. Restart `goo dev` after structural edits.

## Packages

| Package | Purpose |
| --- | --- |
| `Goo` | Core UI and native runtime assets. Included by the starter. |
| `Goo.Android` | Android host. |
| `Goo.Audio` | Audio playback. |
| `Goo.Accessibility` | Native accessibility adapters. |
| `Goo.DevTools` | CLI and inspector. |
| `Goo.Templates` | Starter projects. |
| [Goo.Widgets](https://github.com/obselate/goo-widgets) | Packaged controls. |
| [Goo.Animations](https://github.com/obselate/goo-animations) | Animation composition. |

Add libraries with `dotnet add package PACKAGE`.

## Find a task or contract

| Task | Guide |
| --- | --- |
| Use another .NET language | [C#, F#, Visual Basic and PowerShell](interop.md) |
| Compose primitives and Cells | [Cell](api/cell.md), [tree](api/tree.md) |
| Layout, styling and input | [Layout](api/layout.md), [style](api/style.md), [text](api/text.md), [input](api/input.md), [accessibility](api/accessibility.md) |
| Load images and sound | [Images](images.md), [SVG](svg.md), [audio](audio.md), [audio API](api-audio/README.md) |
| Use controls and themes | [Widgets usage](https://github.com/obselate/goo-widgets/blob/main/docs/usage.md) |
| Animate content | [Core motion](api/motion.md), [animation library](https://github.com/obselate/goo-animations) |
| Inspect an app | [DevTools](devtools/README.md), [diagnostics API](api/diagnostics.md) |
| Use the authoring plugin | [Installation](../plugins/goo/README.md), [skill](../plugins/goo/skills/goo-authoring/SKILL.md) |
| Host Android | [Android](android.md) |
| Integrate with the desktop | [Instances, activation and placement](desktop-integration.md), [dialogs](desktop-integration.md#native-dialogs), [menus](desktop-integration.md#native-menus), [notifications](desktop-integration.md#notifications), [tray](desktop-integration.md#tray-icons) |
| Print documents | [Printing](printing.md) |
| Check spelling and exchange rich text | [Spell checking](spellcheck.md), [rich text](richtext.md) |
| Find the core surface | [API index](api/README.md), [window](api/window.md), [platform](api/platform.md), [rendering](api/rendering.md) |
| Publish an app | [Shipping](shipping.md) |

For source builds and checks, use [Contributing](../CONTRIBUTING.md).
