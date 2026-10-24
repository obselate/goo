# App-author documentation

SVG loading is part of Goo core.

## Version baseline

Use the Goo version in the [template command](../README.md#quick-start).
Use .NET 10 and the G# SDK selected by the template.

## Learn in order

1. [Platform preflight](platform-preflight.md) checks the host requirements.
2. [Create and run the counter](../README.md#quick-start) uses NuGet, not a source build.
3. [After the counter](getting-started.md) adds a second Cell, typed fields,
   retained SVG, callbacks and disposal.
4. [Edit and inspect](edit-and-inspect.md) exercises watch, restart and DevTools.
5. [Widgets usage](https://github.com/obselate/goo-widgets/blob/main/docs/usage.md)
   covers packaged controls, controlled state and overlays.
6. [Shipping](shipping.md) publishes and checks a self-contained desktop app.

## Find a task or contract

| Task | Guide |
| --- | --- |
| Write Goo in another .NET language | [C#](interop/csharp.md), [F#](interop/fsharp.md), [any CLR language and VB](interop/dotnet.md) |
| Compose primitives and Cells | [Native authoring](native-authoring.md), [Cell state and identity](api/cell.md), [tree reconciliation](api/tree.md) |
| Layout, styling and input | [Layout](api/layout.md), [style](api/style.md), [text](api/text.md), [input](api/input.md), [accessibility](api/accessibility.md) |
| Load raster images, SVG and sound | [Images](images.md), [SVG](svg.md), [audio](audio.md), [audio API](api-audio/README.md) |
| Use controls, themes and icons | [Widgets](https://github.com/obselate/goo-widgets/blob/main/README.md), [usage](https://github.com/obselate/goo-widgets/blob/main/docs/usage.md), [complete quick start](https://github.com/obselate/goo-widgets/tree/main/samples/Goo.Widgets.QuickStart) |
| Animate content | [Core motion](api/motion.md), [optional animation library](https://github.com/obselate/goo-animations) |
| Inspect a running app | [DevTools](devtools/README.md), [diagnostics API](api/diagnostics.md) |
| Use the authoring plugin | [Plugin installation and tools](../plugins/goo/README.md), [authoring skill](../plugins/goo/skills/goo-authoring/SKILL.md) |
| Host Android | [Android integration](android.md) |
| Manage desktop app instances and placement | [App host](app-host.md) |
| Open native dialogs and menus | [Dialogs](native-dialogs.md), [menus](native-menus.md) |
| Send notifications and use the system tray | [Notifications](notifications.md), [tray](tray.md) |
| Print and export documents | [Printing](printing.md) |
| Check spelling and exchange rich text | [Spell checking](spellcheck.md), [rich text](richtext.md) |
| Find the complete core surface | [API index](api/README.md), [window](api/window.md), [platform](api/platform.md), [rendering and custom effects](api/rendering.md) |

## Other audiences and older material

- [Contributing](../CONTRIBUTING.md) and [DevTools development](devtools/development.md)
  describe source builds. They are not app prerequisites.
- [Production-readiness assessment](production-readiness.md) describes older
  0.6.6/0.7.0-era work, not a current release qualification report.
- [GCV1 migration](migrations/gcv1.md) is for older compiled vector assets.
