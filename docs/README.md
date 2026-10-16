# App-author documentation

Baseline: Gsharp.NET.Sdk 0.4.1150, Goo/Goo.Svg/Goo.Templates/Goo.DevTools 0.7.35
and Goo.Widgets 0.2.19. Linked `main` branches can differ from these releases.

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

| Task | Guide | Version marker |
| --- | --- | --- |
| Compose primitives and Cells | [Native authoring](native-authoring.md), [Cell state and identity](api/cell.md), [tree reconciliation](api/tree.md) | SDK 0.4.1150, Goo 0.7.35 |
| Layout, styling and input | [Layout](api/layout.md), [style](api/style.md), [text](api/text.md), [input](api/input.md), [accessibility](api/accessibility.md) | Goo 0.7.35 |
| Load raster images, SVG and sound | [Images](images.md), [SVG](../Goo.Svg/README.md), [audio](audio.md) | Goo/Goo.Svg 0.7.35 |
| Use controls, themes and icons | [Widgets](https://github.com/obselate/goo-widgets/blob/main/README.md), [usage](https://github.com/obselate/goo-widgets/blob/main/docs/usage.md), [complete quick start](https://github.com/obselate/goo-widgets/tree/main/samples/Goo.Widgets.QuickStart) | Install README: 0.2.19 / SDK 0.4.1150. Usage header still labels 0.2.7 / SDK 0.4.591. Use the install README's package pins |
| Animate content | [Core motion](api/motion.md), [optional animation library](https://github.com/obselate/goo-animations) | Core: Goo 0.7.35. Animation README labels 0.2.5 / SDK 0.4.591. Check that package's own requirements |
| Inspect a running app | [DevTools](devtools/README.md), [diagnostics API](api/diagnostics.md) | Goo.DevTools/Goo.DevTools.App 0.7.35 |
| Use the authoring plugin | [Plugin installation and tools](../plugins/goo/README.md), [authoring skill](../plugins/goo/skills/goo-authoring/SKILL.md), [watch limits and historical evidence](../plugins/goo/skills/goo-authoring/references/watch.md) | Checkout plugin, CLI 0.7.35. Historical watch results are labeled separately |
| Host Android | [Android integration](android.md) | Goo 0.7.35. Manual host integration, not the desktop template |
| Find the complete core surface | [API index](api/README.md), [window](api/window.md), [platform](api/platform.md), [rendering and custom effects](api/rendering.md) | Generated from this checkout. Released package behavior can differ |

## Other audiences and older material

- [Contributing](../CONTRIBUTING.md) and [DevTools development](devtools/development.md)
  describe source builds. They are not app prerequisites.
- [Production-readiness assessment](production-readiness.md) describes older
  0.6.6/0.7.0-era work, not a current release qualification report.
- [GCV1 migration](migrations/gcv1.md) is for older compiled vector assets.
