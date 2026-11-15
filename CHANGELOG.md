# Changelog


## 0.31.0 - 2026-11-14

### Added

- Read process identity with `Application.Configure(assembly)`. Set the MSBuild `Product`, `InformationalVersion` and `GooPackageId` properties.
- Set `Application.VerifyState` to enable or disable tracked-state verification. Its default follows debugger and DevTools sessions.
- `Window.SizeToContent` measures selected root axes once before the first map. Set `SizeToContent.Width`, `Height` or `Both`, with optional `MinSize` and `MaxSize` bounds.
- `SizeToContent` keeps the declared `Size` on root axes with percentage, viewport-relative or mixed container-dependent sizes. Descendant `Vw` and `Vh` resolve against that declared size during measurement. Remove container-dependent root sizes to measure those axes from content.
- Add `NativeDialogs.ShowError(title, message)` for a synchronous ownerless error box before any window or after the last window closes. It returns `MessageBoxResult`. Check `Status` and native failure detail in `Error`.
- Add `Platform.OpenAsync(target, cancellationToken)` to start the system handler for an absolute path or URI. Check `PlatformOpenResult.Status` and `Error`.
- Use `Cell.Mount<TInput, TCell>(key, input, factory)` to combine typed input with constructor dependencies. Goo stores new input on each parent diff and calls the factory only for a new mount.
- Consume window-owned `WindowFocus` and `WindowClipboard` services. `ClipboardTextResult` has a public constructor for embedded host overrides. `Platform` is a static service.
- Use protected `Cell.Host`, `Mounted()` and `Unmounting()` instead of passing the window into each Cell or scheduling mount-time work with a timer. `Mounted()` runs after the first layout and before paint. Its overrides apply the normal callback rebuild rule unless they call `base.Mounted()`. The default hook does not request a rebuild. `Unmounting()` runs before handles detach and does not request a rebuild.
- Use protected `Cell.Post(action)`, `After(delayMs, action)` and `Every(intervalMs, action)` for Cell-owned callbacks. Goo drops pending work at unmount and applies its callback rebuild rule after each action.
- `Cell.Post`, `After` and `Every` throw during `Build`. Schedule from `InputChanged`, `Mounted`, callbacks or continuations instead.
- Pass `Cell.Lifetime` to cancellable work and use `Cell.Latest(name)` for replaceable requests. Read them after window binding, not in constructors, where they throw `InvalidOperationException`. Goo cancels these tokens after `Unmounting()` returns and before `IDisposable.Dispose`.
- Before window binding, `Cell.Post` returns false and `Cell.After` and `Cell.Every` return inactive timers. Start owned work after binding, from `InputChanged`, `Mounted`, callbacks or continuations.
- Use `ElementHandle.SelectText(start, end)` to focus and select UTF-16 offsets, including one request made before mount.
- Use `IsAtEndX` and `IsAtEndY` on handles or metrics snapshots instead of an application epsilon. Use `ScrollToEnd()` to animate to the range end.
- Add `AsyncImageSource` with a Task-returning loader. Keep the source in a field or model. Loads share their result. Releasing the last pending lease cancels its token. Failed loads retry on the next acquire. Goo updates the image on its UI thread without an app rebuild call.
- Add `Image.Placeholder` and `Image.Fallback`. Their content fills and clips to the image box without changing its measured size.
- Add `Assets.Open(assembly, name)` and `Assets.ReadAllBytes(assembly, name)`. Exact manifest resource names take priority over files beside the application.
- Add `GooAsset` build items. Files copy to output for normal builds and embed for single-file or NativeAOT builds. Add `Embed="true"` to `GooShaderEffect` to embed its compiled program. Load it with `ShaderEffectProgram.Load(assembly, name)` without the `.goo-effect` extension.
- `LayoutSize` has a positional constructor. Use `LayoutSize(width, height)` to create a layout size.
- Add `Each(items, itemKey, itemBuilder)` and `Blob.Each` to build keyed children from data. Explicit child keys take precedence. Spread the result into a container.
- `Length` supports `Em`, `Rem`, `Vw`, `Vh`, mixed arithmetic, intrinsic sizes, and `LayoutContext.ResolveLength`. Use `Length.MinContent`, `Length.MaxContent`, or `Length.FitContent(limit)` on size declarations, and keep animations in one unit.
- `LayoutContext.ResolveLength` returns `nil` when a nonzero percentage has no finite basis. `Em` uses the custom-layout container's font size.
- `Length.Em`, `Length.Rem`, `Length.Vw` and `Length.Vh` factories for other .NET languages.
- Use `Row` and `Column` for fixed-axis flex containers and `Spacer()` for free space. Set their axis through the Blob type, not `FlexDirection` in declarations or state styles.
- Use `Flex: n` for grow n, shrink 1 and basis 0. `Inset` accepts `Edges` in top, right, bottom, left order. Uniform lengths also work. Later declarations override individual parts.
- `AccessibilityName` and `AccessibilityRole` use non-null `string` and `AccessibilityRole` values. Use `""` or `AccessibilityRole.Auto` for defaults and coalesce optional inputs. A later `Accessibility` declaration replaces all fields.
- `Row.HitTestSelf` and `Column.HitTestSelf` override automatic pointer hit testing, like `Container.HitTestSelf`.
- Use `Anim.Play(from, to)` with `Motion.Default`, or `Anim.Play(from, to, spec, specs ...)`, instead of `Snap(from)` followed by `To(to, ...)`. Each call restarts the animation without invalidating the owner. Call from an event, `Mounted` or a callback, not unconditionally in `Build`.
- Use `Motion.Delay(delayMs, spec)` to hold an animation's start value before running its simulation, with the delay in milliseconds and no delay when motion is reduced or disabled.
- `OnPointerDrag` captures primary-pointer drags without hover callbacks. Events provide local position, translation, per-sample delta and lifecycle phases. Threshold and axis properties control when a drag starts.
- Replace drag-only press, move, release and cancel handlers with `OnPointerDrag`. Remove pointer-id and dragging fields, manual capture and manual rebuild calls.
- Use `GesturePhase.Started`, `Changed`, `Completed` and `Canceled` for drag phases. Read `Reason` for cancellation. `Delta` on `Started` excludes pre-threshold movement. Goo supplies drag events and their init accessors are internal.
- Set `PointerDragAxis` to `LayoutAxis.Horizontal` or `Vertical`. Use nil for both axes. Thresholds and coordinates use layout units. After a drag starts, the press does not produce `OnClick`.
- Drags wait for nonzero movement past `PointerDragThreshold` in `PointerDragAxis`. Child clicks remain available until the drag starts. An enclosing scroller claims touch movement along its scroll axis first. Keep horizontal drag handles inside vertical scrollers on `LayoutAxis.Horizontal`.
- Add `AccessibilityAttachment` to attach field relationships and validation state without changing supplied elements or layout.
- Add `Sized(build)` and `Blob.Sized(build)` for content that depends on its allotted size. Replace size listeners and whole-Cell rebuilds with a builder that reads `LayoutSize` in layout units. Give the element space through layout. Its content has no effect on its own size. State and context reads refresh only the retained content.
- `State[T]` tracks reads in Cell builds and retained builders. Changed values invalidate their readers. Equal writes do nothing.
- `Window.State`, `IsFocused`, `Size`, `NativeWidth`, `NativeHeight`, `UiScale`, `PixelScale`, `Preferences`, `Modifiers`, `Focus.EditsText`, `Focus.Editor` and `Focus.Selection` track their Cell and retained-builder readers. Changes rebuild only readers of the changed value.
- Compose inline text with `Text("plain", TextSpan("styled", style))`. Plain strings convert to unstyled spans. Use `Selectable: true` for text selection and copy without editing. Set `Text.SelectionColor` to change the highlight color.
- Parse SVG path data with `VectorPath.Parse(data, viewBox)` and append closed contours with `PathBuilder.Ellipse`, `Rectangle`, and `RoundedRectangle`.

### Changed

- Breaking: Move process startup and activation to static `Application`. Replace `Window.ConfigureApplication` with `Application.Configure`, `Window.ApplicationActivated` with `Application.Activated`, `Window.PostApplicationActivation` with `Application.PostActivation`, and `window.Run()` with `Application.Run(window)`.
- Breaking: Replace `Window.InitializeApplicationActivation` and `SingleInstance.AcquireAsync` with synchronous `Application.AcquireSingleInstance(arguments, timeoutMs)` before opening a window. Configure the identity first and retain the primary lease until shutdown.
- Breaking: `Window.Open()` throws `GraphicsUnavailableException` when no usable Vulkan device, surface or required feature exists. Catch this type for graphics startup failures. Other startup errors keep their exception types.
- Breaking: Replace `Window.Width` and `Height` with `Size`, `MinWidth` and `MinHeight` with `MinSize`, and `MaxWidth` and `MaxHeight` with `MaxSize`. Each pair uses `LayoutSize(width, height)` in layout units. Read `NativeWidth` or `NativeHeight` for native logical units.
- Breaking: `SetTopmost` and `SetFullscreenDisplay` replace `TrySetTopmost` and `TrySetFullscreenDisplay`. Rename calls and keep handling `WindowOperationResult`.
- Breaking: Initialize `Topmost` before `Open`. Replace runtime property assignments with `SetTopmost(value)` and handle the result.
- Breaking: Window scalar settings and `WindowMetrics.UiScale` now use `float64`. Remove casts to `float64` when reading `UiScale`, `PixelScale`, `DragStartDistance`, `WheelScrollScale`, or `ResizeBand`.
- Breaking: Replace `WindowMetrics.LogicalWidth` and `LogicalHeight` with `NativeWidth` and `NativeHeight`. Replace the first two `OffscreenRenderOptions` constructor arguments with `LayoutSize(width, height)` in layout units. Read `Size.Width` and `Size.Height` instead of `LogicalWidth` and `LogicalHeight`. Its deconstruction now returns one `Size` output instead of two scalar size outputs.
- Breaking: `DragStartDistance` now uses Euclidean distance in layout units, matching `PointerDragThreshold`. Diagonal movement can start a drag sooner than the old per-axis test. The defaults remain 8 for mouse and pen and 4 for touch.
- Breaking: Platform input coordinates and wheel deltas, `WindowDisplay.ContentScale`, and `PlatformPreferences.TextScaleFactor` now use `float64`. Remove `float32` coordinate casts before calling `PlatformInput`. Pointer pressure remains `float32`.
- Breaking: Move window clipboard calls to `window.Clipboard`: `GetClipboardText()` -> `ReadText()` (`string` -> `ClipboardTextResult`), `SetClipboardText(value)` -> `WriteText(value)` (`void` -> `ClipboardWriteResult`), `GetClipboardFormats()` -> `GetFormats()`, `ReadClipboardFiles()` -> `ReadFiles()`, `ReadClipboardImage()` -> `ReadImage()`, `ReadClipboardDataAsync(types)` -> `ReadDataAsync(types)`, and `WriteClipboardAsync(data, intent)` -> `WriteAsync(data, intent)`. Check result status before reading text or assuming a write succeeded.
- Breaking: Replace protected `EmbeddedWindowHost.GetClipboardText() string` and `SetClipboardText(value)` overrides with `ReadClipboardText() ClipboardTextResult` and `WriteClipboardText(value) ClipboardWriteResult`. Construct results with explicit status, text and optional error. The defaults return `Unsupported`.
- `WindowClipboard.ReadDataAsync` and `WriteAsync` accept a trailing optional `CancellationToken`. Pass a token to cancel the wait and discard a late native result.
- Breaking: Replace `Cell.Mount<TCell>(factory, key)` with `Cell.Mount<TCell>(key, factory)`. The parameterless mount now uses one optional key parameter.
- Breaking: Replace `Window.SetTimeout(action, delayMs)` with `Window.After(delayMs, action)` and `Window.SetInterval(action, intervalMs)` with `Window.Every(intervalMs, action)`. These window timers do not rebuild a Cell.
- Breaking: Replace `Cell.Mount<TCell>(key, configure)` with typed input through `Cell.Mount<TInput, TCell>(key, input, factory)`. Put one-time setup in the constructor or factory.
- The getting-started guide and tutorials use `Row`, `Column`, `Application.Run`, `Window.Size`, and `Cell.Host`. Use `Name(){children}` for a child-only container. Put changing child values in a typed input, not a mount configuration callback.
- Reduce text-paint shader compilation cost and skip clip pipeline creation when no clip region is dirty.
- Breaking: `Rebuild` on a mounted Cell throws when called off its window's UI thread. Use `Cell.Post` to apply background results. Goo handles callback rebuilds.
- Reduce pointer callback work when reconciling unchanged elements.
- Breaking: `ElementHandle.ScrollToItem(key, alignment = ScrollAlignment.Start, settle = true)` replaces both overloads and holds one unknown-key request for up to three frames. Remove delayed reveal timers and call it directly. Use `ScrollAlignment.Nearest` for minimal movement.
- Breaking: `ElementHandle.ScrollTo` and `JumpTo` accept optional axes. Use `ScrollTo(y: value)` or `JumpTo(y: value)` to keep the horizontal offset.
- Breaking: `ElementMetrics` positional deconstruction adds `IsAtEndX` and `IsAtEndY` after `RawBorderBox`. Add both outputs or read the named properties instead.
- Reduce scene compilation work for transparent leaf containers and buttons.
- Reuse exact plain-text width measurements after the wrap width changes.
- Breaking: Blob and Style declarations can be changed while you build them. Once Goo receives a Blob, property assignments, `Add`, and child-list mutations throw `InvalidOperationException`. State styles and retained declaration objects freeze with their Blob. Shared child lists are copied at hand-off.
- Breaking: Return a new Blob when its declaration changes. Returning the same Blob does not refresh it. Virtual items no longer write keys into authored content. `Each` rejects a previously handed-off Blob that has no key. Set its key before hand-off or return a new Blob.
- Breaking: `TextInputOptions.AutofillHints` remains `[]string`. Assignment and reads copy the values. Changing a returned array does not change the stored hints.
- Breaking: `WindowMetrics.Deconstruct` uses `width` and `height` out parameters instead of `logicalWidth` and `logicalHeight`. The `LongPressGesture` duration parameter is now `durationMs` instead of `durationMilliseconds`. Update named arguments.
- Breaking: These 56 public classes are now sealed in CLR metadata: `Goo.ClipboardDataResult`, `Goo.ClipboardWriteResult`, `Goo.DashPattern`, `Goo.DragData`, `Goo.DragSource`, `Goo.DropTarget`, `Goo.ExternalFrameResult`, `Goo.ExternalImageResult`, `Goo.ExternalImageSessionResult`, `Goo.ExternalImageSession`, `Goo.ExternalImageSource`, `Goo.ExternalImageSync`, `Goo.ExternalImageWindowsDevice`, `Goo.ExternalImage`, `Goo.FontSource`, `Goo.GestureInput`, `Goo.Gestures.DoubleTapGesture`, `Goo.Gestures.LongPressGesture`, `Goo.Gestures.PanGesture`, `Goo.Gestures.TransformGesture`, `Goo.ImageColorProfile`, `Goo.ImageDecodeResult`, `Goo.Images.ImageAssetResult`, `Goo.Images.ImageVariants`, `Goo.Images.ImageVariant`, `Goo.LayerWindowOptions`, `Goo.MessageBoxButton`, `Goo.MessageBoxOptions`, `Goo.MessageBoxResult`, `Goo.NativeAccessibilityAdapter`, `Goo.NativeDataDrop`, `Goo.NativeDialogOwnerLease`, `Goo.NativeDialogs`, `Goo.NativeFileDrag`, `Goo.NativeFileDrop`, `Goo.NativeMenuBar`, `Goo.NativeMenuItem`, `Goo.NativeMenuResult`, `Goo.NativeMenus`, `Goo.OffscreenRenderSession`, `Goo.PopupResult`, `Goo.PopupWindow`, `Goo.Scrollbar`, `Goo.ShaderEffectData`, `Goo.ShaderEffectProgram`, `Goo.ShaderEffect`, `Goo.TransferData`, `Goo.TransferRepresentation`, `Goo.VectorAsset`, `Goo.VectorNode`, `Goo.VectorPaint`, `Goo.VectorStroke`, `Goo.VulkanExternalImageDescription`, `Goo.WindowCapture`, `Goo.WindowDisplay`, `Goo.WindowTimer`. Compose these types instead of subclassing them. For custom gestures, derive from `GestureRecognizer` instead of `DoubleTapGesture`, `LongPressGesture`, `PanGesture` or `TransformGesture`.
- Breaking: `AccessibilityRelationships` changes these declaration properties from `init` to guarded `set`: `ActiveDescendant`, `Controls`, `DescribedBy`, `ErrorMessage`, `FlowTo`, `LabelledBy`, `Owns`. Rebuild binary consumers and finish declarations before handing them to Goo.
- Breaking: `AccessibilityValue` changes these declaration properties from `init` to guarded `set`: `Maximum`, `Minimum`, `Now`, `Text`. Rebuild binary consumers and finish declarations before handing them to Goo.
- Breaking: `Accessibility` changes these declaration properties from `init` to guarded `set`: `Actions`, `Atomic`, `Busy`, `Checked`, `ColumnCount`, `ColumnIndex`, `CustomRole`, `Description`, `Expanded`, `HasPopup`, `Hidden`, `Invalid`, `Level`, `Live`, `Modal`, `MultiSelectable`, `Multiline`, `Name`, `OnAction`, `Orientation`, `PositionInSet`, `Range`, `ReadOnly`, `Relationships`, `Required`, `Role`, `RowCount`, `RowIndex`, `Selected`, `SizeOfSet`, `Value`. Rebuild binary consumers and finish declarations before handing them to Goo.
- Breaking: `Blob` changes these declaration properties from `init` to guarded `set`: `Accessibility`, `AutoFocus`, `DisabledStyle`, `Disabled`, `DragSource`, `DropTarget`, `FocusTarget`, `Focusable`, `Gestures`, `Handle`, `KeyBindings`, `Key`, `LayoutTransition`, `OnBlur`, `OnClick`, `OnFocus`, `OnKeyDown`, `OnKeyUp`, `OnPointerCancel`, `OnPointerDown`, `OnPointerEnter`, `OnPointerLeave`, `OnPointerMove`, `OnPointerUp`, `OnTextCandidates`, `OnTextCompositionCancel`, `OnTextComposition`, `OnTextInput`, `OnWheel`, `TabStop`, `TransitionDelayMs`, `TransitionEasing`, `TransitionMs`, `TransitionProperties`. Rebuild binary consumers and finish declarations before handing them to Goo.
- Breaking: `Button` changes these declaration properties from `init` to guarded `set`: `Children`. Rebuild binary consumers and finish declarations before handing them to Goo.
- Breaking: `Container` changes these declaration properties from `init` to guarded `set`: `Children`, `HitTestSelf`, `Layout`. Rebuild binary consumers and finish declarations before handing them to Goo.
- Breaking: `FocusScopeOptions` changes these declaration properties from `init` to guarded `set`: `InitialFocus`, `Modal`, `RestoreFocus`. Rebuild binary consumers and finish declarations before handing them to Goo.
- Breaking: `Image` changes these declaration properties from `init` to guarded `set`: `Fit`, `PixelsPerUnit`, `Source`. Rebuild binary consumers and finish declarations before handing them to Goo.
- Breaking: `Portal` changes these declaration properties from `init` to guarded `set`: `AnchorRect`, `Anchor`, `CollisionBounds`, `HideWhenAnchorClipped`, `Placement`. Rebuild binary consumers and finish declarations before handing them to Goo.
- Breaking: `Scrollbar` changes these declaration properties from `init` to guarded `set`: `FadeMs`, `HideDelayMs`, `HitThickness`, `Inset`, `MinThumbLength`, `ReserveSpace`, `Thickness`, `Thumb`, `Track`. Rebuild binary consumers and finish declarations before handing them to Goo.
- Breaking: `Shape` changes these declaration properties from `init` to guarded `set`: `CornerRadius`, `FillRule`, `Fit`, `Path`, `StrokeEnd`, `StrokeStart`, `UseCurrentColor`. Rebuild binary consumers and finish declarations before handing them to Goo.
- Breaking: `Style` changes these declaration properties from `init` to guarded `set`: `AlignContent`, `AlignItems`, `AlignSelf`, `AspectRatio`, `BackdropBlur`, `BackgroundColorAnim`, `BackgroundColor`, `BackgroundGradient`, `BackgroundImageFit`, `BackgroundImageSource`, `BasedOn`, `BlendMode`, `BorderBottomLeftRadius`, `BorderBottomRightRadius`, `BorderColorAnim`, `BorderColor`, `BorderEndColorAnim`, `BorderEndColor`, `BorderEndWidth`, `BorderRadius`, `BorderStartColorAnim`, `BorderStartColor`, `BorderStartWidth`, `BorderStyle`, `BorderTopLeftRadius`, `BorderTopRightRadius`, `BorderWidth`, `Bottom`, `BoxShadows`, `BoxShadow`, `ClipPathFillRule`, `ClipPathFit`, `ClipPath`, `ColorAnim`, `Color`, `ColumnGap`, `Cursor`, `Direction`, `Display`, `End`, `FlexBasis`, `FlexDirection`, `FlexGrow`, `FlexShrink`, `FlexWrap`, `FontFamily`, `FontSize`, `FontStyle`, `FontWeight`, `Gap`, `Height`, `JustifyContent`, `Language`, `Left`, `LetterSpacing`, `LineHeight`, `MarginEnd`, `MarginStart`, `Margin`, `MaxHeight`, `MaxWidth`, `MinHeight`, `MinWidth`, `OpacityAnim`, `Opacity`, `OutlineColorAnim`, `OutlineColor`, `OutlineOffset`, `OutlineWidth`, `OverflowX`, `OverflowY`, `Overflow`, `PaddingEnd`, `PaddingStart`, `Padding`, `Position`, `Right`, `RowGap`, `ScaleAnim`, `ScrollbarVisibilityX`, `ScrollbarVisibilityY`, `ScrollbarVisibility`, `ScrollbarX`, `ScrollbarY`, `Scrollbar`, `ShaderEffect`, `Start`, `TextAlign`, `TextDecoration`, `TextMaxLines`, `TextShadows`, `TextShadow`, `TextStrokeColorAnim`, `TextStrokeColor`, `TextStrokeWidth`, `TextTransform`, `TextTrimming`, `TextWrap`, `Top`, `TransformOriginX`, `TransformOriginY`, `Transform`, `TranslateAnim`, `Visibility`, `Width`, `ZIndex`. Rebuild binary consumers and finish declarations before handing them to Goo.
- Breaking: `TextEditor` changes these declaration properties from `init` to guarded `set`: `CaretColor`, `CurrentLineColor`, `InputOptions`, `Layers`, `LineNumberColor`, `OnChange`, `OnSubmit`, `OverscanLines`, `PlaceholderColor`, `Placeholder`, `ReadOnly`, `SelectionColor`, `ShowLineNumbers`. Rebuild binary consumers and finish declarations before handing them to Goo.
- Breaking: `TextEntry` changes these declaration properties from `init` to guarded `set`: `Controlled`, `InputOptions`, `OnChange`, `OnSubmit`, `Password`, `PlaceholderColor`, `Placeholder`, `ReadOnly`, `SelectionColor`, `Value`. Rebuild binary consumers and finish declarations before handing them to Goo.
- Breaking: `TextInputOptions` changes these declaration properties from `init` to guarded `set`: `AutofillHints`, `EnterAction`, `Purpose`. Rebuild binary consumers and finish declarations before handing them to Goo.
- Breaking: `Text` changes these declaration properties from `init` to guarded `set`: `Content`, `StyleRanges`. Rebuild binary consumers and finish declarations before handing them to Goo.
- Breaking: `VectorStroke` changes these declaration properties from `init` to guarded `set`: `VectorEffect`. Rebuild binary consumers and finish declarations before handing them to Goo.
- `VectorStroke` adds guarded setters for the formerly get-only `Cap`, `Join`, `MiterLimit` and `Dashes` properties.
- Breaking: Remove `Image.Path` and `Style.BackgroundImage`. Use `Image.Source` and `Style.BackgroundImageSource` with an `ImageSource` or provider.
- Breaking: Change `Image.PixelsPerUnit`, `ImageVariant.PixelsPerUnit`, its constructor density, and `ImageAssetResult.PixelsPerUnit` to `float64`.
- Breaking: Construct shortcuts with `KeyBinding(key, modifiers, onPress)` or rename literal `Action` to `OnPress`. Use `KeyModifiers.None`, `Primary`, and `PrimaryShift` for common exact modifier combinations.
- Read click and input modifiers from `Window.Modifiers`. Use `KeyEvent.TargetEditsText` or `Window.Focus.EditsText` to keep navigation shortcuts out of text editing.
- Breaking: Move `PlatformInput.Editor`, `Selection`, `SetSelection`, and `Execute` calls to `Window.Focus`. Replace `PlatformInput.MoveFocus` with `Window.Focus.Move` and `PlatformInput.ClearFocus` with `Window.Focus.Clear`. Keep host injection and composition on `PlatformInput`.
- Breaking: Move `PlatformInput.EditorChanged` subscriptions to `Window.Focus.EditorChanged`.
- Use `KeyModifiers.HasPrimary` when other modifiers may also be held. It tests Super on macOS and Ctrl elsewhere.
- Breaking: `LayoutSize.Deconstruct` names its out parameters `Width` and `Height` instead of `width` and `height`. Update named `Deconstruct` calls and named positional patterns to use the capitalized names.
- `HasMagnitude` is false for font-relative, viewport-relative and mixed lengths. Do not derive pixels from `Magnitude` for these values. Use `LayoutContext.ResolveLength` in custom layout callbacks.
- Breaking: Replace `Hover`, `Active` and `Focus` Blob declarations with `HoverStyle`, `ActiveStyle` and `FocusStyle`.
- Breaking: Replace implicit string-to-Color conversion with `Color.Parse(value)`.
- Breaking: `Portal.FocusScope` owns the overlay focus scope. Set `FocusScopeOptions{Modal: true}` for a modal dialog. `InitialFocus` selects the first target and `RestoreFocus` controls focus restoration. Remove matching manual `BeginFocusScope` registrations. `OnDismiss` receives `PopupDismissReason.Escape` or `OutsideInteraction`. Remove the Portal to close it. `OnDismiss` alone opens a nonmodal scope. `Scrim` paints behind the content, and modal scopes set the accessibility modal flag.
- Breaking: `PopupWindow.Open` and `UpdatePlacement` take `size: LayoutSize(width, height)` instead of integer width and height arguments. Pass `placement` by name when omitting `maximum`. Omit `size` to measure the root once within `maximum` and the display work area. `UpdatePlacement` measures the current root again when `size` is omitted.
- Reduce reconciliation cost for empty children and stable keyed order, and keep scroll, layout transition and virtual state on each node.
- Document the migration paths from 0.30.0, supported relative Style lengths, pointer-drag deltas and Cell-owned background callbacks.
- Cells with safe tracked State fields can skip unchanged callbacks, including inherited Cells. Virtual rows track State through their retained element and refresh all realized rows when a dependency changes.
- `Application.VerifyState` rebuilds eligible Cells and reports untracked tree changes. It defaults to enabled under a debugger or DevTools. Mutable instance or static fields and observed mutable ElementHandle values retain automatic callback rebuilding.
- Breaking: removed `Cell[TInput].ShouldRebuild`. Input equality now decides child rebuilds. Remove those overrides and derive input-dependent state in `InputChanged(input)` before `Build`.
- Breaking: Replace `TextEditor(controller)` and `TextEditor(controller, layers)` with `TextEditor{Controller: controller, Layers: layers}`. Omit `Layers` when unused. Replace `Virtual(source)` with `Virtual{Source: source}`. The controller and source are required at mount.
- Breaking: `Window.MeasureText` now returns `float64` layout units. Update variables and delegates that require `float32`.
- Ellipsis text now has automatic minimum width zero. Set `MinWidth` when a nonzero minimum is needed.
- Selectable text leaves unsupported keys to ancestor handlers and bindings. Selection clears on blur and content replacement. Appending content preserves selection.
- Goo callbacks now resume after `await` on their window's UI thread, including embedded host dispatchers, and rebuild their owning Cell through tracked-state rules. Use `async func Handler() void` and pass `Lifetime` to cancellable work.
- Window close now cancels Cell lifetimes and pending window tasks before a bounded continuation drain. Set `CloseDrainMs` to change the 2000 ms bound. Continuations after the bound run on a serialized background queue and must not access UI state.
- `EmbeddedWindowHost.Dispose` now pumps pending window continuations on the calling thread until the same close drain completes or expires.
- Use `Window.InvokeAsync` for awaitable dispatch of synchronous or Task-returning work and `Window.NextPresentationAsync` for the next accepted presentation receipt.
- Breaking: Shape path paint uses `Fill: VectorPaint(...)` and `Stroke: VectorStroke(...)` instead of background and border declarations. Legacy paint without either new member throws at mount.
- Breaking: `VectorAsset.Render` accepts `fit` and `key`, with `ShapeFit.Contain` as the default. Replace `asset.Render("key")` with `asset.Render(key: "key")`.
- Breaking: Shape state-style background and border paint, including `BackgroundColorAnim` and `BorderColorAnim`, no longer apply. For fill, use `UseCurrentColor: true` with state-style `Color` or `ColorAnim`.
- Out-of-range path numbers report their scanner position instead of the end of the string.
- Breaking: `VectorAsset.ViewBoxX`, `ViewBoxY`, `ViewBoxWidth`, `ViewBoxHeight`, and the `ShaderEffect` constructor's `backdropOutset` and `backdropBlur` use `float64`. Update `float32` variables and delegates to `float64`. Backdrop distances are in layout units.

### Fixed

- Linux NativeAOT apps without static SDL now load bundled SDL or report a missing library instead of silently loading system SDL.
- Ship a pinned AppImage runtime with exact dependency sources, license texts and libfuse relink material.
- Run the shader effect and XML docs build tools on newer .NET runtimes, so apps build on machines with only .NET 11 installed.
- Keep vector path coverage stable at contour joins across Vulkan drivers.
- Reject contained hit-test subtrees early and reuse the committed hover route for scrollbar hover.
- Check known input targets through their parent links instead of scanning the whole tree.
- Compute dirty fiber depths once and keep parent-first rebuild order with a stable tie order.
- Allow a nested posted-action drain to consume the remaining queue without a dequeue error.
- Preserve application stack frames when cleanup, native callbacks and deferred rendering errors are delivered.
- Coalesce pending SDL wake events and avoid faulting GPU completion when the event queue is full.
- Evict least-recently-used image cache entries that no returned source or mounted lease owns.
- Drain native modal completion during close and bound event-serviced cleanup when Window.Run fails.
- Report repeated alternating element metrics once per episode when window diagnostics are enabled.
- Skip source-child counts when an opaque scene node does not need opacity isolation.
- Reuse child reconciliation scratch for sibling lists up to 32,768 elements to avoid repeated collection allocation.
- Keep shape-shadow spread the same distance along axis and diagonal directions.
- Complete window-created offscreen render sessions in the window loop without polling `Service`, and cancel pending pages before the window closes.
- Restore small-path GPU performance while retaining lower first-draw path shader compile cost.
- `goo render` preserves the app window's theme, context values and registered font selection.
- Shader effect output names use forward slashes on every platform and cannot escape the application output directory.
- `TextEditorController` keeps the caret on a grapheme boundary after text changes and rich-text replacement.
- Fit clipped focus outlines inside controls and follow their visible rounded corner contours.

### Removed

- Breaking: Removed `Window.TryPost`. Use `Window.Post` and check its Boolean result.
- Breaking: Replace `Shape.StrokeCap`, `StrokeJoin`, `MiterLimit`, `Dashes`, and `VectorEffect` with the matching guarded `VectorStroke` properties. Replace the six-argument constructor with `VectorStroke(width, paint){.Cap: cap, .Join: join, .MiterLimit: limit, .Dashes: dashes}`. Keep trim bounds on `Shape.StrokeStart` and `StrokeEnd`.

## 0.30.0 - 2026-11-11

### Added

- Capture responses report `layerResolutionShift` and `degraded` when GPU memory pressure reduces layer resolution. Diagnostics report `layerPoolResolutionShift`. `goo capture` reports the shift on stderr and in JSON.
- Add a PowerShell 7 section and counter sample to the interop guide.
- Add `ElementHandle.RawBorderBox`, `ElementMetrics.RawBorderBox` and `Window.PixelScale` for pixel-aligned popup placement.
- The Goo plugin supports Claude Code. Run `claude plugin marketplace add obselate/goo`, then `claude plugin install goo@obselate-goo`.
- Add `Window.MeasureText(text, style)` to measure the laid-out width of single-line text without mounting it.

### Changed

- The F# interop guide and sample use modules, closure state and object-expression Cells with reusable callbacks.
- Breaking: `ElementMetrics` deconstruction now has six outputs, with `RawBorderBox` last. Update positional deconstruction.
- Breaking: `FlexShrink` now defaults to 1. Set `FlexShrink: 0` to keep the previous behavior.
- Automatic minimum sizes are 0 for `Scroll` or `Hidden` overflow. Otherwise, they follow the declared size or content size. Set `MinWidth: 0` or `MinHeight: 0` to allow further shrinking.
- GPU caches follow the driver memory budget. Without budget support, Goo uses half of each heap for cache growth.
- Goo evicts unused GPU resources and retries failed allocations once. Images that do not fit are skipped. Repeated frame allocation failures wait for new work instead of keeping the render loop busy.
- GPU diagnostics add `heapHeadroom`, `memoryEvictionCount`, `memoryAllocationRetryCount`, `memoryPressureCount` and `textAtlasPressureFailureCount`. They remove `imageByteBudget`, `textAtlasByteBudget`, `textAtlasPeakByteBudget` and `layerPoolByteBudget`.
- AI plugin search ranks task and symbol matches and returns bounded query-matched excerpts. Reads return the selected section or API member with a byte cap and continuation.
- Breaking: AI plugin `goo_search` returns its JSON in text content only, without `structuredContent`, `source` or `queryTerms`, and reports package versions instead of package paths.
- AI plugin search and reads include Widgets and Animations APIs from the project's restored packages, or the newest cached packages when no project is selected. Package reads include declaration types and XML documentation.
- AI plugin context and starter responses use one bundle hash instead of a full bundled-file hash map. Starter files keep their source and generated hashes.
- AI plugin checkout mode lists the same documents as the bundled reference.
- Path, stroke and clip-mask shaders share coverage code to reduce first-draw shader compilation work.
- Rounded shapes, gradients and borders have smoother, more accurate edge coverage. Rotated and skewed rectangles also smooth their square edges.
- Text edges have more even coverage. Light text on dark backgrounds has stronger edge contrast.
- On Windows, `PlatformPreferences.AccentColor` is the system accent palette base. `AccentLight1`, `AccentLight2`, `AccentLight3`, `AccentDark1`, `AccentDark2` and `AccentDark3` expose its shades and are nil on other platforms.
- Breaking: `PlatformPreferences` deconstruction now has 13 outputs, with the six accent shades inserted before `PreferredLocales`. Update positional deconstruction.

### Fixed

- Layout and paint use the same device-pixel widths for borders and outlines. Content and clips align with painted borders at fractional display scales.
- Positive layout sizes and border widths stay at least one device pixel wide.
- Window capture errors retain the failed allocation stage and Vulkan result, including through DevTools.
- `TextEditor` no longer sends `CancelComposition` to command interceptors when no composition is active.
- Custom layouts and anchored portals snap child and popup positions to device pixels. Custom layouts also update when display scale changes.
- Translation-only transforms snap their combined movement to device pixels. Drawing, hit testing and element bounds use the same position.
- Text, text-input and image boxes round their size up to the device pixel grid, regardless of their position.
- The DevTools profiler timeline scrolls separately from its summary table. Frame and scope tooltips stay visible.
- DevTools plots and the details pane fit the window when app zoom changes.
- Layout-only embedded windows retain keyboard focus and focus styles without a presentation surface, while hidden desktop windows reject focus gains.
- Rounded clips keep the correct coverage when a cached mask shrinks. Rounded clips and shape shadows stay stable when their mask moves in the atlas.
- Goo MCP input stays usable after a rejected key press and preserves ownership of active or uncertain gestures.
- The DevTools CLI and protocol client report the installed package version.
- Newly uploaded glyphs appear in the same frame. Text waits for pending glyph uploads instead of presenting with missing glyphs.
- Repaint keyed children in their new order when the first child is unkeyed. Accessibility order now follows the same order.
- Gallery captures render without opening its window. Offscreen rendering rejects attached Cells and includes the cause in failure results.
- Keep the source Vulkan loader alive until shared renderer teardown so window offscreen sessions can be disposed during or after window close.
- Backdrop blur updates when content behind it is removed.
- Apps can keep more than 4,096 image sources alive without an image-identity capacity failure.
- Custom-layout scroll ranges no longer count padding and borders twice.
- Scrollbars receive pointer input inside an undecorated window resize edge. Corners still resize the window.
- Scrollbar tracks and thumbs share hover state. A vertical thumb `Width` or horizontal thumb `Height` can make it thinner than its track, with hover and transition changes applied.
- `VirtualViewport.Child(i).Size` returns the layout size before device-pixel rounding, so measured virtual rows keep stable offsets.
- Growing the shared path atlas no longer invalidates another window's queued frame.
- Hidden layer-shell windows finish pending frames and close without waiting for an unavailable presentation.
- Device recovery preserves windows that are still starting. Windows with a zero-size surface resume presenting when the surface becomes available.
- New windows stay inside the display usable area when their minimum size fits. On Windows, this includes the title bar and borders.
- Windows report their native size when shown and keep the latest size when the display or display scale changes.
- Images drawn below their source size use mipmaps to reduce aliasing. Premultiplied sampling prevents dark transparent edges. Goo uses mipmaps only when GPU memory permits.
- Apply Linux color scheme preferences when the desktop portal starts after the app and when its settings change.
- Reduce single-line text measurement and layout cost for ASCII labels without changing shaping or measured widths.
- Hosts without an application dependency manifest load Goo's bundled patched SDL, so native behavior matches normal .NET applications.
- Managed single-file applications load bundled SDL from the host's native extraction directory.
- Hiding a Wayland window no longer blocks queued presentation or other windows from closing. Visibility, input and accessibility update immediately. Showing the window cancels a pending native hide.
- Allocation profiling keeps aggregate sample counts and sampled bytes when the runtime omits type names. DevTools marks the type breakdown as unavailable instead of showing a `NULL` type.
- Offscreen rendering and `goo render --scale` snap layout to the requested render scale, matching window layout.
- AI plugin search prefers matching API member names to sibling references and guide prose.
- Attach the NuGet packages and symbol package to each GitHub release.
- Scroll containers and `TextEditor` show the full end of their content. The maximum offset rounds up to a device pixel, adding less than one device pixel of space.
- Box shadows have more even corner blur and less banding. Sharp shadow edges stay stable while scrolling.
- Outer box shadows no longer darken the inside of transparent or translucent panels.
- Inherited style changes update descendants in the same pass, so theme colors do not stay stale.
- Text has more accurate spacing and sharper horizontal edges at fractional display scales. Fitted round glyphs keep their natural stroke thickness.
- Text uses unfitted outlines during repeated size changes to limit glyph-cache growth.
- `TextEditor` keeps its content height and visible text position when cached lines are released or measured.
- `TextEditorController.ScrollTo` and caret reveal reach their target after wrapped lines are measured.
- Caret reveal no longer hangs when the caret is larger than the editor viewport.
- `TextEditor` line height uses `FontSize * LineHeight`, matching `Text`. It reserves space for first and last line glyphs and for inline slots.
- Wrapping `Text` shrinks to its widest unbreakable segment. Set `MinWidth: 0` to let it shrink further and break inside words.
- Flex items share space correctly when siblings reach their minimum or maximum size. Overflowing rows no longer grow flex items.
- Virtual lists keep recycled row storage when their owning Cell rebuilds without changing the list state.
- On Wayland, clipboard and primary-selection text copied before the first key, button or touch event can reach other applications.

## 0.29.1 - 2026-11-08

### Changed

- Tutorials and interop samples use Goo 0.29.0 and Goo.Widgets 0.20.0 and drop redundant `Rebuild()` calls in input callbacks.

### Fixed

- Retry the frame when a growing path waits for atlas space during a pending upload. Do not present a frame without that path.
- Input callbacks created in deferred context Scope content and Cell mount factories or configuration rebuild the Cell that declared the content.

## 0.29.0 - 2026-11-08

### Breaking changes

- `Window.Post` now returns `bool` to report queue acceptance. Use `Post` for queued UI work and check its result when acceptance matters. An accepted action can still be discarded during teardown. `TryPost` remains available for now.
- Remove `Goo.Tokens`. Pass token values directly to component functions and Cell inputs.
- Remove `Cell.MountSeeded` and `CellElement.Seed`. Use `Cell.Mount` and put one-time initialization in the Cell constructor or `CellElement.Factory`. Keep per-diff updates in `Configure`.
- Remove `Goo.Command`, `Button.Command` and `KeyBinding.Command`. Use `Button.OnClick` and `KeyBinding.Action`. Keep shared actions and availability checks in application code.

### Added

- Add `goo render` for display-free app PNGs, named root Cell scenes and theme and scale selection.
- Add `goo diff` with channel tolerance, changed pixel bounds and an optional difference image.
- Save the current frame to `.goo/reload.png` after each successful `goo dev` hot reload.
- Add `OffscreenRenderSession.Create()` for rendering without a native window.
- Compare fixed-seed retained frames and partial damage against fresh renders in the offscreen CI lane. Check state changes, integer translation and axis swaps.

### Changed

- Build trace duration records now include the Cell type name in the `name` field.
- Name duplicate keys, parent Cells, child types and virtual callbacks in tree errors, with a fix in each message.
- Add type names and fixes to Cell mount, rebuild, Context, UI-thread, dispatcher and custom layout errors. Name the related Goo best practices rules.
- Teach a function returning Blob before child Cells in getting started. Add a core terms glossary to the README.
- Clarify contributor and Goo app-authoring rules from the approved rule review.
- Accept changelog-only fragment joins before tagging an already prepared release.

### Fixed

- Run deterministic preflight checks before platform jobs, report all CI gates through verify, and reuse pinned tool downloads.
- Avoid a redundant callback-owner rebuild while that Cell is already building, so controlled text editor values can synchronize during Build.
- Rebuild the Cell that authored an input callback when another Cell renders its Blob content.
- Add protected `Cell<TInput>.InvokeInputCallback` overloads for forwarding input-time callbacks to the Cell that supplied the input.
- Fit the whole profiler trace after Stop. The view showed the last 2 s, which was usually empty.
- Explain how to record in the empty profiler and Types views, and disable profiler view tools until a trace exists.
- Show element keys in the DevTools tree and highlight the inspected root on first open.
- Start the style override field empty with an example placeholder, and apply overrides to the inspected element.
- Disable Pick element and Capture while disconnected, and show an empty state for captures.
- Show scroll offset and content size as numbers instead of raw JSON.
- Remove the console entry for every received snapshot, and match the profiler toolbar to the Elements toolbar.
- Show the inspected element as a box diagram plus the values the app set, grouped into Layout, Style and Interaction, with defaults on request.
- Replace the profiler frame chart with a timing view: frame times against a 60 Hz budget line, nested scope tracks for the UI thread, GPU and present and DevTools, and per-frame work and allocation strips. Open the Timers table by default. Scope nesting runs off the UI thread. Build scopes show their Cell type in bar labels, tooltips and details.
- Update Goo.Widgets to 0.19.8 and use the default SplitPane pointer target, so the details divider is a 1 px line with an 8 px grab area.
- Keep native close requests for owned windows local instead of also requesting application exit.
- Keep hidden windows running after the last visible window closes only while a tray icon is active.
- Allocate extra text atlas pages when active glyphs exceed the cache budget. After cache pressure, release pages unused for two frames once their GPU work is complete. Text batches keep each page's resource identity.
- Check shader source and include hashes without a shader compiler in CI.
- Compare SVG corpus frames with committed pixel baselines in Linux CI.
- Upload new glyphs and rebuild the acquired frame before presenting a text edit. Do not present a frame with missing text while its glyphs are pending.
- Reset timestamp queries before use when profiling starts during a pending upload replay.

## 0.28.7 - 2026-11-07

### Added

- Add nine runnable Goo tutorials with captured application images.

### Changed

- Reduce the README to setup, a complete counter, source checks, AI plugin installation and documentation links.
- Keep package, platform and shader details in the docs and update links to the new sections.
- Show an application-style Widgets view in the README without a separate capture caption.
- Restore the original Goo README banner and remove the Widgets Gallery image.

### Fixed

- Fit focus outlines inside non-scrolling clipping ancestors, so rounded `Overflow.Hidden` parents no longer cut focus rings. A clipped outset ring moves onto its control and keeps the control's corner radius. A ring corner takes the parent's corner radius only where that parent corner clips more than the control's own corner rounding.
- Keep install commands current and place SDK, Vulkan and platform requirements beside them.
- Link G# learning and editor tools, fix widget composition, and add task-based API links.
- Use named theme values in starter templates, update interop widget packages, and collect GPU and SDK details in bug reports.
- Show the current Goo Widgets Gallery in the README.
- Report missing Vulkan drivers with driver override values and the platform preflight link.
- Name missing Vulkan device features and explain how to recover from an X11 session.
- Avoid repeated scrollbar ownership checks during style and scene invalidation.
- Keep thin horizontal strokes visible in small text, including 12 px caption text.
- Use the framework build command in the README source build instructions.

## 0.28.6 - 2026-11-07

### Fixed

- Realize deferred virtual rows before the next render when queue work completes during a window pump.

## 0.28.5 - 2026-11-07

### Fixed

- Size offscreen layer targets from their placed scroll bounds so rounded images remain visible after scrolling and image uploads.
- Apply vertical scroll placement with the framebuffer's vertical scale, including text placement.
- Use placed offscreen layer origins and scales for nested clip masks.
- Test placed layer bounds during partial redraw so late image content is not omitted.
- Report the clamped logical scroll state through element handles and metric subscriptions.

## 0.28.4 - 2026-11-07

### Added

- `VulkanDrivers.Exclusive` selects only the configured direct Vulkan drivers on Windows.

### Changed

- Scroll content moves in whole physical pixels without relayout or recompilation for offset-only updates.
- Retained scene ranges preserve nested clips, text, effects and interaction placement while dirty content is compiled separately.
- Reuse effect-closed damage bounds during scene classification.
- Update DevTools and all CLR interop samples to Goo.Widgets 0.19.3, which requires Goo 0.28.3.

### Fixed

- Keep initial desktop window bounds inside the display's usable area unless the declared minimum size exceeds it.
- Honor VSync on software Vulkan devices by selecting FIFO presentation.

## 0.28.3 - 2026-11-06

### Added

- Add opt-in internal Vulkan GPU experiments for matched rendering measurements with one Android APK.

### Changed

- Reject Android NativeAOT publishes that report a Goo method will always throw.
- Preserve runtime type forwarders required by G# helpers in Android NativeAOT publishes.
- Exclude the Android template's shared project sources from its host project.
- Include consumer resource designer metadata in Android NativeAOT compilation.
- Reject NativeAOT methods that will always throw in the Android adapter.
- Run Android accessibility checks against NativeAOT package consumers.
- Keep Vulkan and SDL pointer views as plain structs without generated equality or hashing.
- Retain full layer paint coverage separately from current capture bounds.
- Keep shader effect coordinates stable when a layer capture is cropped.
- Keep gradient dithering fixed to canonical capture coordinates when targets are cropped.
- Track subtree paint changes and keep Vulkan cache identity within each logical Node mount.
- Retain clean subtree drawing ranges in a bounded per-window cache and rebind their clip references.
- Reuse validated subtree content proofs during damage tracking.
- Report retained owner counts and transform capacity in profiling traces.
- Use the Widgets control icon trimming and composite focus fixes.
- Update DevTools and all interop samples to Goo.Widgets 0.19.2, which requires Goo 0.28.2.
- Read resolved nullable theme radii before converting them to Goo lengths.
- Adopt the Widgets density, property section and dialog open-state APIs.
- Reset profiler table state when switching tabs.
- Update every test project to xunit.runner.visualstudio 4.0.1.
- Reuse retired virtual row Node and Yoga storage without retaining item state.

### Fixed

- Fix NativeAOT selection of Vulkan GPU diagnostic experiments. Verify all experiment modes and file overrides in a published native executable.
- Share root direction and distance calculations between opposite NonZero coverage rays in Vulkan.
- Skip path coverage outside conservative curve band bounds.
- Reuse curve reads and root solutions for opposite nonzero path coverage rays in Vulkan.
- Fix RTF byte decoding after assembly trimming.
- Native CI fixtures wait for permission input focus and Activity replacement, and allow the first liquid-glass software frame to finish.
- Keep virtual viewports at scroll offset zero when retained descendants move during layout.

## 0.28.2 - 2026-11-05

### Changed

- Allow changelog-only corrections without a new fragment when they do not add an Unreleased section.
- Keep logical mount identities separate from reusable Node storage.

### Fixed

- Keep centered text and nested content stationary across repeated fractional-scale resizes by snapping unrounded Yoga positions and dimensions instead of previously snapped layout results.
- Keep input routes, focus restoration, accessibility IDs and DevTools targets bound to their original node mount when storage is reused.
- Ignore outgoing style queue and transition entries after node storage is rebound.

## 0.28.1 - 2026-11-05

0.28.0 was not published.

### Fixed

- Skip fully clipped infinite animations without losing their clock phase. Keep finite animation ticks and completion unchanged.
- Prevent false horizontal scrollbars at fractional display scales.
- Isolate the zero-allocation path equality fixture from background GC accounting and report each equality or allocation failure separately.

## 0.28.0 - 2026-11-05

### Added

- Add `Portal.HideWhenAnchorClipped` to hide clipped anchored overlays without unmounting their content or losing focus and text composition.
- Add `Blob.FocusTarget`, `ElementHandle.SetFocusTarget` and `IsFocusVisible` for composite focus visuals without moving keyboard or accessibility focus.

### Changed

- Allocate Vulkan scene-owner text and box cache storage only when used.
- Build all Goo packages, templates and generated consumers with G# SDK 0.5.212.
- Update the linter syntax node and remove redundant nullable operations for the new compiler.
- Update Microsoft.NET.Test.Sdk to 18.11.0, Unicode.Bidi to 0.4.0, Tmds.DBus.Protocol to 0.95.2 and ModelContextProtocol to 2.3.1.
- Reduce default node storage by allocating editing, shape, pointer and portal data only when used.
- Allocate Yoga grid track lists only when grid state is accessed.
- Allocate Yoga style value buffers only when an indexed value is stored.
- Avoid allocating a default child list when Container or Button receives a child list during initialization.
- Draw large opaque solid interiors without distance coverage or blending. Keep the existing antialiasing at the edges.
- Precompute embedded shader digests during the build so basic applications do not initialize cryptographic libraries just to name the pipeline cache or prepare built-in effects. Existing shader and cache identities are unchanged.
- Reuse bounded offscreen layers in extent buckets during window resize without changing settled image quality.
- Collect pending release notes in per-PR changelog fragments and join them during release preparation.

### Fixed

- Keep the application running when a clipboard read or write fails in built-in text editing. Report the failure to stderr and keep the selection. Window.SetClipboardText still throws.
- Keep the DevTools pipe listener alive while clients disconnect so queued input and snapshot connections are not reset. (#583)
- Size anchored Portals to the available space on their selected side instead of shifting them over the anchor. Keep cross-axis containment.
- Prevent false horizontal scrollbars at fractional display scales.
## 0.27.11 - 2026-11-05

- Map system and file-source fonts read-only. Share mappings by native file identity and reuse live leased typefaces. Keep defensive copies for public byte-array inputs. (#553, #562)
- Reduce initial Vulkan image memory blocks, image resource slots and descriptor capacity. Grow them on demand without changing byte limits or rendered pixels. (#555, #556)
- Create the color glyph workspace only when needed. (#557)
- Release obsolete text segment references and disposed scrollbar layout roots so retired content can be collected. (#554, #558)
- Return free glibc heap pages once after background Vulkan pipeline preparation and cache persistence on Linux. (#559)
- Add accessibility Separator, TabPanel, Toolbar and Tooltip roles, logical grid metadata and correct virtual set counts and heading levels. (#560, #568)
- Resolve GPU profiling stages with up to 64 scopes. Include virtual row realization in Build, Reconcile, StyleResolve and Diff totals while scrolling. (#561, #563)
- Route vertical-only Shift wheel input through the horizontal scroll chain. (#569)
- Add `TextEntry.ReadOnly`. Keep focus, selection, navigation and copy, and report read-only accessibility and platform input state. (#565)
- Limit retained child-diff, path-band and path-ownership scratch storage after exceptional peaks. (#570)
- Keep held key repeat active when keyboard callbacks prevent the default action. (#571)
- Add Portal `AnchorRect` in anchor-local coordinates and `CollisionBounds` in window logical coordinates. Preserve default placement. (#567)
- Drain embedded Android presentation work before surface detach. (#572)
- Skip the viewport background draw when a plain opaque root covers it exactly. (#573)
- Add `VirtualViewport.PixelScale` for device-pixel row rounding. Scale changes invalidate cached virtual content through `ContextVersion`. (#564)

## 0.27.10 - 2026-11-04

- Save the Vulkan pipeline cache after background preparation completes and on process exit, including `Environment.Exit`. Stop and join preparation before exit. A second SWARM NativeAOT launch with a fresh driver cache reaches first presentation in about 440 ms instead of 1.4 s. (#551)

## 0.27.9 - 2026-11-04

- Reuse text layouts during paint when the rounded width gives provably identical NoWrap or ellipsis output. SWARM By Rule median frame time improved from 18.9 ms to 10.8 ms and paint time from 8.8 ms to 2.3 ms. (#544)
- Limit resumed root rendering after offscreen layers to the damage area instead of the full attachment. This reduces GPU work on tile-based GPUs. (#543)
- Include attachment load and store operations in offscreen layer GPU timing. (#548)

## 0.27.8 - 2026-11-03

- Create only the Vulkan pipelines used by the first frame before presentation. Prepare the remaining standard pipelines on a background thread after the first presentation. NativeAOT cold starts with an empty driver cache improved from 2.6 s to 0.71 s for the starter and from 2.6 s to 1.44 s for SWARM, with no first-use pipeline creation during interaction. (#540)
- Use .NET SDK 10.0.403 with ILCompiler 10.0.14 in the repository and generated application templates. (#546)
- Add Vulkan GPU stage output for atlas uploads, primitive uploads and clip masks. Include scope counts in profiler traces and `GOO_FRAME_PROFILE` output. (#542)

## 0.27.7 - 2026-11-03

- Restart embedded animations after idle with a zero simulation delta for the first frame, instead of advancing by up to 33.3 ms. This includes Android `GooView`. (#535)
- Add complete-frame Vulkan GPU timing as `gpu.frame` in profiler traces and `elapsed_ns` in `[goo.profile.gpu]` output. Report timing as unavailable when timestamps are unsupported. (#536)

## 0.27.6 - 2026-11-03

- Reduce ellipsis layout shaping with glyph position prediction and exact prefix checks. Keep the same cut and glyph output. (#533)

## 0.27.5 - 2026-11-03

- Let the vector text cache grow to 32 pages on demand. The first page remains 256 KiB. This fixes atlas exhaustion that could throw and close a window with many mixed font sizes since 0.25. (#531)

## 0.27.4 - 2026-11-03

- Report only live DevTools endpoints when a snapshot target has no match. (#528)
- Add aligned `ScrollToItem` with measurement settlement, `ScrollOffsetOf`, `VisibleAnchor`, `RestoreAnchor` and `IsScrollSettling`. (#529)
- Add `VirtualState.BoundsOf` and `VirtualOutput.AnchorKey` so virtual policies can align measured items and retain descendant positions after layout. (#529)

## 0.27.3 - 2026-11-02

- Include the Android resource archive in Goo.Android packages so accessibility can resolve the mixed-state label. (#526)
- Encode non-finite diagnostic geometry as JSON null so snapshot requests complete. (#524)
- Resolve an absolute DevTools pipe path through its adjacent descriptor, including private runtime directories. (#525)

## 0.27.2 - 2026-11-02

- Register macOS URL schemes from `GooPackageUrlScheme` items and document types from `GooPackageDocumentType` items before ad-hoc signing. URL registrations use `GooPackageId` as the name and `Viewer` as the role. Projects without these items keep the same `Info.plist`. (#522)

## 0.27.1 - 2026-11-02

- Show nested CPU phases `NativeResize`, `Swapchain`, `DeviceIdle`, `ClipAtlas`, `LayerCollect` and `LayerCreate` in frame traces and the DevTools profiler. (#517)
- Set snapshot `hasPointerHandlers` for nodes with only `OnPointerEnter` or `OnPointerLeave` handlers. (#520)

## 0.27.0 - 2026-11-01

- Breaking: rename MCP `goo_targets` to `goo_list`. All runtime tools now use `project`, `pid`, `pipe`, `app`, `window`, `latest` and `wait` in seconds. Unknown arguments are rejected. (#516)
- Breaking: rename snapshot `wait` to `until` and `timeout_ms` to `timeout` in seconds. (#516)
- Breaking: rename CLI `--node` to `--node-id`. Remove `--watch` and `--focus`. (#514)
- Breaking: remove `Goo.DevTools.App`. The inspector is bundled in `Goo.DevTools` and opens with `goo inspector`. (#514)
- Breaking: replace `bootstrap.sh` and `bootstrap.bat` with `dotnet run --project tools/Goo.Repo -- doctor|build|check <lane>|docs|pack`. (#513)
- Breaking: replace Gslint `--reduce` with `--fix`. Add `--help`. (#516)
- Use `goo dev` as the single start path. Pin the template SDK in `global.json`, include the Watch item, and make `dotnet new goo` and `goo_starter` produce the same files. Add publish-first shipping and Linux runtime package examples. (#512)
- Use one G# SDK version in root `global.json` and serialize contributor builds with `GOO_BUILD_LOCK`. Desktop docs do not need Android tooling. Docs checks do not change tracked files. (#513)
- Add `goo snapshot`, per-command help, `goo help <command>`, `-h` and repeatable `--env`. Validate arguments before discovery. Ambiguous targets report their candidates. Generate `docs/devtools/cli.md`. (#514)
- Shorten DevTools endpoint names to fit Unix socket paths. Skip invalid endpoint paths in the CLI and report them in doctor. (#515)
- Update the Goo agent plugin to 0.3.0. (#516)

## 0.26.1 - 2026-11-01

- DevTools input no longer builds a full tree snapshot after each injected event. The input response returns a sequence marker, and the next snapshot captures the settled tree. With 639 nodes and 240 events, allocation dropped 94% and GC pause 98%. (#510)
- Frame recordings show posted DevTools work as a `diagnostics` phase, not as app work. (#510)

## 0.26.0 - 2026-11-01

### Added

- `Window.InputActivity` reports each pointer down, wheel and key down before routing, also for consumed and modal input. It does not rebuild any Cell. Use it for idle detection such as auto-lock. (#506)

## 0.25.2 - 2026-11-01

- DevTools endpoints use a per-process random token and the per-user runtime directory, so apps in separate PID namespaces no longer share an endpoint. (#504)
- Idle DevTools connections stay open until the client closes them or the app exits. Before, they closed after 30 s idle. (#504)

## 0.25.1 - 2026-10-31

- Square controls (radius 0) now get a square focus outline. (#499)
- Adding, removing, reordering or moving elements now redraws only the changed area instead of the whole window. (#500)
- Single-line text inputs now replace each run of line breaks and tabs inside pasted or typed text with one space, and drop them at the start and end. Before, the parts were joined (`1.5` newline `2` became `1.52`). (#501)
- goo agent plugin 0.2.0: the goo-authoring skill applies to review, audit, refactor and planning work, and requires references/best-practices.md. (#502)

## 0.25.0 - 2026-10-31

- Blend colors in encoded sRGB, as browsers and native toolkits do. This changes the colors of translucent content and the apparent weight of text.
- Shader effects use encoded sRGB colors. Rebuild effect sources with the current Goo build adapter.
- Use UNORM color views for sRGB-only surfaces when mutable swapchain formats are supported. Reject surfaces that cannot preserve encoded blending.
- Snap text stems and x-height to the device pixel grid vertically at display scale 1 for text up to 16 px. Text shapes change slightly.

## 0.24.2 - 2026-10-30

- Preserve logical child measurements in custom layouts before snapping the final geometry to physical pixels.
- Keep small virtual item sizes accurate when pixel snapping uses distant content coordinates.

## 0.24.1 - 2026-10-30

- Keep Wayland clipboard text valid when an empty set is followed by replacement text in the same handler.

## 0.24.0 - 2026-10-30

- Compress embedded Vulkan shader resources to reduce NativeAOT executable size.
- Keep backdrop layers rendering after live display-scale changes reduce layer resolution.
- Default NativeAOT apps to identical method-body folding. Explicit app settings take precedence.
- Add keyboard and text input rules to the Goo authoring skill: standard text controls, built-in editing, focus traversal and a keyboard test list.
- Snap window layout and border widths to physical pixels at fractional display scales.
- Handle text editing keys and Tab focus traversal in core without application bindings.

## 0.23.4 - 2026-10-30

- Rebuild DevTools on Goo.Widgets with one stacked phase bar per profiler frame.
- Keep Vulkan native handle outputs stable during garbage collection and retry failed swapchain recreation without closing the window.
- Avoid redundant path-upload repaints and retry deferred path frames without draining acquired images on the UI thread.
- Keep arc subdivision counts independent of path translation.
- Keep frames running under Vulkan clip-mask and layer budget pressure after display-scale changes. Evict idle resources and reduce clip and layer resolution when needed. Include request dimensions in pressure diagnostics.
- Stop Windows from drawing native minimize, maximize and close buttons under a replaced title bar on undecorated windows.
- Request rounded corners for undecorated windows on Windows 11. Windows still keeps them square in virtual machines and when maximized or snapped.
- Add Goo app best practices to the plugin authoring skill: UI-thread rules, `go` and `scope` background work, model, view and service structure, component reuse, theme tokens, rebuild scope, virtualization and frame-time checks.

## 0.23.3 - 2026-10-29

- Render a visible missing-glyph box for bitmap-only emoji such as Noto Color Emoji instead of failing the Vulkan frame. COLR color glyphs keep their color rendering.

## 0.23.2 - 2026-10-29

- Keep backdrop blur unchanged when only foreground children change, and limit their redraw damage to their bounds.
- Retry transient Windows CI downloads.

## 0.23.1 - 2026-10-28

- Skip fully overwritten backdrop clears and synchronize resumed color attachment loads.
- Include text decorations in partial-redraw damage bounds.

## 0.23.0 - 2026-10-28

- Expose the selected rendering device and observed window occlusion with UI-thread notifications.
- Recover the shared Vulkan device when opening a window while all existing windows are hidden.
- Keep damage clipping inside offscreen opacity and rounded-overflow layers.
- Reuse retained text geometry when vertical scrolling changes only its baseline.
- Avoid repainting platform wheel input when the scroll offset and visual state do not change.

## 0.22.3 - 2026-10-28

- Read configured fallback fonts in the background before their first layout.
- Avoid duplicate font reads when preloading a large primary family.
- Reduce GPU work for large rounded borders without changing their pixels.

## 0.22.2 - 2026-10-28

- Reduce large backdrop blur work with a two-axis downsample pyramid.
- Wait for pending images before the first presentation and after showing a layer window, with a 500 ms image-wait budget.
- Keep layer-shell roles across Hide/Show and restore their requested layer. Layer-shell windows now require protocol version 2 or newer.

## 0.22.1 - 2026-10-27

- Release cached GPU images before reclaiming dead image-provider identities.
- Cancel `Window.Closed` after native teardown finishes or fails, not when closing starts.

## 0.22.0 - 2026-10-27

- Add `Window.LayerShell` for Wayland panels and overlays with output anchors, reserved space and keyboard focus.

## 0.21.0 - 2026-10-27

- Add ImageSource.EncodePng for PNG export from premultiplied RGBA images.
- Prevent stale generated-doc pushes and retry hdiutil verification only for the exact EAGAIN error.
- Fix Weston 13 popup crashes with the initial SDL popup commit.
- Keep hover active in unfocused windows while keyboard and press input stay blocked.

## 0.20.0 - 2026-10-26

- Add Shape.UseCurrentColor to fill solid shapes with inherited Color.

## 0.19.1 - 2026-10-26

- Hover callbacks on retired virtual rows no longer rebuild the parent Cell

## 0.19.0 - 2026-10-26

- Window.FrameTheme, ContentUnderTitlebar and TitlebarControlsRect for native dark frames and macOS full-size content

## 0.18.1 - 2026-10-26

- Enable the SDL tray API on Linux.

## 0.18.0 - 2026-10-25

- Add `PlaceholderColor` to `TextEntry` and `TextEditor`.

## 0.17.0 - 2026-10-25

- Fix the native transfer check when its peer exits before the close request.
- Keep the original stack for failures in reconciler mount and factory-build paths.
- Fix documentation commands, navigation, sibling-key guidance and plugin reference links.
- Add Android API reference generation and public-type documentation checks.
- Trim readmes, authoring guidance and public summaries.
- Trim guides and consolidate shared checklists.
- Add declarative paint animation slots and non-rebuilding Cell.AnimateValue factories.

## 0.16.1 - 2026-10-24

- Apply requested font weights to system variable fonts, so variable system fonts no longer render at their default weight.
- Omitted print DPI settings default to 300 for consumers instead of 0.
- Keep the original Build stack trace when a cell build throws during a frame.
- Remove Python from notification, data-transfer and input-build host checks, and merge activation checks into one G# host-check tool.

## 0.16.0 - 2026-10-24

- BREAKING: Remove PinToBottom and Pinned from core and move log tail-following policy to consumer state and Widgets.
- BREAKING: Gestures, Images, NativeDialogs, NativeMenus, Printing, SpellCheck and Notifications are now part of Goo and Goo.Android. Remove those package references. Namespaces are unchanged.
- BREAKING: Desktop activation, placement and single-instance hosting are included in Goo. Remove the Goo.AppHost package reference.
- Add MIME clipboard data, native data drag and Android document streams.
- Add optional native notifications with explicit permission, delivery and activation results.
- Path encoding allocates about 18% less by passing encoder scratch lists directly instead of copying them to arrays.
- Reduce Yoga style allocation during virtual grid scrolling with inline style buffers and constant edge names (SWARM B/render down 4 to 6%, GC pause totals down).
- Unify bounded external input reads, including Android clipboard MIME and document streams.
- Add native tray icons and platform lifecycle checks to core Goo.
- Add Android notifications with explicit permission and warm and cold activation.
- Add managed ICC conversion for RGB matrix/TRC and gray image profiles.
- Share managed ICC conversion with consumer image decoders.
- Remove Python and uv from the Goo plugin runtime by shipping its MCP tools in Goo.DevTools.
- Move production shader authoring inputs into Goo and remove the unused solid-quad pipeline.
- Add HTML and RTF clipboard editing in Goo.
- Make repeated registration of identical font sources a no-op.
- Publish release packages to GitHub Packages as well as NuGet.org.
- Remove Python from managed-host repository tools, CI qualification and investigation runners.

## 0.15.0 - 2026-10-24

- Goo 0.14.0 was tagged but never published to NuGet. Its changes ship in this release.
- Fix NuGet publishing after GitHub release assets were removed.
- Add optional desktop instance hosting and supported window placement capture and restore.
- Fix the generated documentation sync for the optional package API pages.
- Remove unused qualification files and execute the Android detached-page proof.
- Remove the stale docs baseline and forthcoming-SVG claim.
- Fix Android accessibility smoke event synchronization.
- An ElementHandle can move to another element within one tree update (branch switch, nested keyed reorder, parent replacement) without throwing. Two live elements sharing a handle still throw.

## 0.14.0 - 2026-10-24

- Fall back to the primary macOS spelling dictionary when the full tag is unavailable.
- GitHub releases now contain notes only. Packages stay on NuGet.
- Add SVG-aligned non-scaling vector strokes with retained local geometry.
- Keep dashed and dotted border patterns evenly spaced through rounded corners.
- Remove the unused bundled G# compiler and formatter from the Goo package, cutting it from 16.1 MB to 12.8 MB.
- Remove unused internal helpers without changing the public API.
- Smooth large analytic gradients with static output-space dithering.
- Use ordinary style entries for Button centering defaults and remove the special reconciler path.
- Fix API documentation mapping for root G# package declarations.
- Cut backdrop blur GPU cost with an alpha-preserving Gaussian mip chain (3x faster at sigma 16, 6-7x at sigma 64-128 on an RTX 3080), shared by both blur paths.
- Add GC pause attribution, bounded tail summaries, cap-wait timing and opt-in allocation type samples to the profiler.
- Fix border antialiasing across fragment quad lanes and make coverage derivatives safe on RDNA2 and MoltenVK.
- Fix path-filtered CI jobs running repository commands without checkout.
- Reuse one test-enabled Goo assembly across Linux fixture lanes.
- Remove Gallery dependencies from shader and profiler UI qualification.
- Share one Vend Sans source font and license across demos and benchmarks.
- Match ordinary node hit regions to painted rounded corners.
- Port first-party Android code to G#.
- Reveal keyboard focus targets through nested scroll regions.
- A contour with only a MoveTo no longer makes the rest of the path's stroke disappear.
- Building unchanged decorated text no longer allocates per frame (160 B to 0 B), and changed text allocates less (2,768 B to 2,184 B).

## 0.13.0 - 2026-10-23

- Port the repository build tools, linter and package projects to G#.
- Stop queued application actions from running during deferred owner close.
- Port the goo CLI and its packaging commands to G#.
- Add a consumable window key preview for overlay dismissal.
- Port the core, API, image, gesture, Vulkan ABI and native menu test projects to G#.
- Port the optional printing and spelling packages and tests to G#, fixing macOS available spelling languages.
- Remove managed allocations from vector path comparison and hot color comparisons. Comparing two equal 128-rectangle paths drops from 179 us and 502 KB to 18 us and 0 B.

## 0.12.1 - 2026-10-23

- Publish Goo.Audio without an empty symbol package, so every package publishes. The DevTools packages, Goo.Templates, Goo.SpellCheck and Goo.Printing missed 0.12.0.

## 0.12.0 - 2026-10-23

- Fix an early Wayland popup presentation that could close the display connection.
- Breaking: sound moves into the optional Goo.Audio package. Add a Goo.Audio reference if your app plays sounds. It has explicit statuses, bounded streaming, live gain, pause/resume and extended WAV decoding.
- Add Android playback to Goo.Audio.
- Add optional platform click and alert sounds.
- Add output-device selection to Goo.Audio.
- Reduce paint cost for large paths 4x to 14x without changing encoded band output.
- Keep retained paths resident when fresh paths need cache space mid-frame, reclaiming only what is needed, least recently used first.
- Cut GPU paint cost for large retained paths with density-aware band counts (a 10,000-point path: 75 to 28 ms GPU per frame).

## 0.11.0 - 2026-10-23

- Drain Vulkan work before process exit, fixing intermittent crashes when an app returns from Main with a window open.
- Release unmounted window roots when their host closes.
- Add optional owned native message boxes for Windows, macOS and Android.
- Add native popup surfaces with platform grabs, dismissal and typed results.
- Android now supports native Goo popup surfaces with owner-bound rendering and dismissal.
- Bound Android accessibility harness teardown after its checks finish.
- Retain shared vector identities across transform-only draws and sweep dead identities once per frame.

## 0.10.0 - 2026-10-23

- Add external Vulkan image import and retained frame release ownership.
- Import DMA-BUF images with explicit modifiers and fence readiness.
- Add retained Metal texture and IOSurface import with shared-event readiness.
- Add geometry and focus operations for external accessibility hosts.
- Expose Goo controls as Android virtual accessibility nodes.
- Preserve Android accessibility identity and geometry across Surface recreation.
- Android accessibility now sends incremental updates and live-region events.
- Android accessibility now has native API 36 emulator checks in CI.
- Bound Android native menu harness startup and cleanup.
- Fix offscreen and embedded virtual scrolling that stopped realizing rows in Goo 0.8.1.
- Add bounded offscreen page rendering and retained renderer sessions for native OS services.
- Add optional spell checking, editor suggestions, raster PDF export and system printing.

## 0.9.0 - 2026-10-23

- Breaking: FontFamily no longer loads font files from paths. Load them explicitly with the size-bounded FontSource.FromPath factories.
- Keep scrollbar thumb drags active when virtual rows retire.
- Add shared edit hints and Android keyboard and focused-field autofill mapping.
- Add optional macOS native menu bars and context menus.
- Add Windows native menu bars, context menus and accelerators.
- Add Android native context menus to Goo.NativeMenus.
- Keep DevTools pipe cleanup from masking capture results after a peer disconnect.
- Add raster density metadata and scale-change snapshots for HiDPI image assets.
- Add optional scale-aware image asset families.

## 0.8.2 - 2026-10-23

- Shipped in 0.8.1 without a note: clip atlas samplers clamp to edges with transparent UV bounds, so Metal through MoltenVK can create them (#311).
- Update HarfBuzz to 15.0.0 to include COLR correctness fixes and bounded paint work.
- Build text and image natives with bounds, stack and branch protection, and fix a stb_image empty-IDAT pointer edge case.
- Check Windows native build reproducibility and disabled optional HarfBuzz components in CI.
- Expose the saved activity Bundle during Android window creation.
- Add consumer Linux AppImage packaging through goo package.
- Add unsigned Windows consumer installer packaging.
- Add macOS consumer app and DMG packaging.
- Add signed Android AAB packaging and upload-key guidance.
- Sync generated documentation on main after merge instead of requiring it in PRs.
- Add C#, F# and VB interop guides and package-backed samples.
- Apply EXIF orientation to PNG and JPEG images and thumbnails, ignoring malformed metadata.
- Detect nullable reference annotation changes in the public API gate.
- Deliver coherent Android contact frames to shared gesture recognizers.
- Publish Goo.Gestures with embedded symbols only, so the release job publishes every package (the DevTools packages and Goo.Templates missed 0.8.1).
- Expose OS UI and event sound preferences through PlatformPreferences.EventSoundsEnabled.
- Report system accent colors and available Linux and Android contrast preferences.
- Expose ordered preferred locale tags through platform preference snapshots and change events.
- Reduce grid scroll GC pauses by keeping scene owner IDs on nodes until a compiler handoff.

## 0.8.1 - 2026-10-23

- Coalesce scroll-only virtual row work while presentation is blocked, cutting grid thumb-drag p99 and max frame time.
- Remove revision-only conflicts from bundled docs manifests.
- Shipped in 0.8.0 without a note: core touch gesture arbitration and selection affinity access (#257), parallel Linux fixture CI jobs (#275).
- Add optional shared gesture recognizers in Goo.Gestures and SDL scale-only trackpad pinch.
- Add an Android starter template and shared launch, deep-link and document activation.
- Add nightly ten-minute generated-input quality checks for SVG, raster images, WAV audio, and fonts.
- Deliver cold and warm macOS links and document opens through Window.ApplicationActivated.
- Skip unrelated CI builds for narrow PR changes while keeping affected checks and status names.
- Correct sibling identity documentation for mixed keyed and unkeyed children.

## 0.8.0 - 2026-10-23

- Bound text entry undo history to 1,000 groups and 64 MiB of retained text while preserving undo and redo within those limits.
- Reduce DevTools snapshot costs for large interactive trees without changing snapshot output.
- Clamp accessibility text selections to complete graphemes before editing or clipboard operations.
- Do not dispatch pointer-cancel callbacks to retired nodes.
- Attribute virtualized Cell builds and report per-pump row mount, reuse, discard and uncached shaping counts.
- Bound all font file reads to 64 MiB before allocation and skip oversized system font candidates.
- Change Motion.Tween to take milliseconds instead of seconds (breaking: multiply existing second values by 1000). The default tween stays 180 ms.
- Start Linux validation in parallel with macOS native builds without removing checks.
- Correct the plugin verifier count for a Button without explicit keyboard bindings.
- Reject UI trees deeper than 64 nodes with a clear exception before recursive processing can exhaust the stack.
- Add process-wide application activation delivery with bounded owner-thread routing.
- Add per-animation Pause, Resume, IsPaused and millisecond Seek for active tween animations.
- Add named Length.Pixels and Length.Percent factories for C#, F# and VB callers.
- Start platform consumer checks as soon as packages are ready.
- Reuse apt package archives between Linux CI jobs without changing installed dependencies.

## 0.7.54 - 2026-10-22

- Pin CI actions and verify the pinned AccessKit Rust installer download.
- Reject deeply nested SVG before building the XML tree.
- Restrict DevTools named pipes to the current user.
- Bound SVG definitions, gradient references, normalized and inherited dash arrays, and animation value materialization.
- Store and discover DevTools descriptors in a per-user directory when XDG runtime storage is unavailable.
- Remove unused path-based capture responses from the DevTools CLI.
- Restrict VS Code executable settings to machine scope and keep project paths inside the workspace.
- Prevent gslint --fix and --reduce from rewriting symlink targets discovered inside linted directories.
- Restrict starter lint and local compiler suggestions to the bundled or user-configured Goo root.
- Fix the vendored stb_image multi-frame GIF history pointer without changing shipped native binaries.
- Fix VS Code Goo launch on PowerShell by starting the CLI directly with literal terminal arguments.
- Reject clipboard text above 16 MiB of UTF-8 before managed SDL conversion and runtime paste processing.
- Skip relative gslint inputs that traverse symlinks or reparse points and print a warning.

## 0.7.53 - 2026-10-22

- Avoid boxed collection enumerators in hot grid layout, portal, scrollbar, focus and shaped-text traversals.

## 0.7.52 - 2026-10-22

- Record virtual row realization separately from input-tree updates and add a reusable headless DataGrid CPU benchmark.
- Measure wrapped line widths without allocating discarded glyph layouts, reducing wrapped thumb-scroll allocation by 60 percent.

## 0.7.51 - 2026-10-22

- Keep secondary Wayland window startup responsive while Vulkan swapchains are prepared.
- Refresh scroll rectangles set by metrics listeners before painting the current frame, so synchronized scroll viewports have no one-frame visual delay.

## 0.7.50 - 2026-10-22

- Bound text document undo history to the newest 1,000 edit groups while preserving typing groups and redo.
- Add current-display queries and display-change events, and clamp scaled window minimum sizes to the current display usable bounds.
- Reduce DevTools capture and snapshot allocations while preserving decoded capture pixels and snapshot protocol output.

0.7.49 was tagged but never published. Its change ships in 0.7.50.

## 0.7.48 - 2026-10-22

- Preserve original stack traces for exceptions rethrown from frame, embedding and virtualization handlers.

## 0.7.47 - 2026-10-22

- Add Window.UiScale for whole-window layout, device-resolution rendering and consistent input coordinates.
- Snap text run origins in device space before projection so UI-scaled text matches text rendered at the final device size.

## 0.7.46 - 2026-10-22

- Improve text crispness by aligning run origins to device pixels without rounding glyph advances.

## 0.7.45 - 2026-10-22

- Fix custom title bar dragging when a drag region sits inside a focusable ancestor.

## 0.7.44 - 2026-10-21

- Keep DevTools clients alive while a response is being written so slow readers receive complete snapshots.
- Update the goo plugin's certifi to 2026.10.19 and mcp to 1.30.0 for security fixes.
- Fix requester windows remaining dimmed after closing a foreign-parent Wayland file chooser.
- Fix lost SDL idle wakeups on Linux so Window.Post, UI continuations and timers run without waiting for the next event.
- Add Window.RequestCapture(previousCapture) to reuse the caller-owned pixel buffer for repeated captures.

## 0.7.40 - 2026-10-20

- Reuse bounded plain-text layouts and right-size retained glyph storage, defer hidden custom arrangement, and preserve target bounds through nested scroll containers.
- Include the SDL error text when the SDL Vulkan loader fails to initialize.
- Add VulkanDrivers.Direct for app-local Windows Vulkan drivers, including elevated no-GPU startup without registry changes.
- Keep the DevTools pipe host running when a client write is canceled on Windows.
- Capture DevTools diagnostic trees only while a client observes them.

## 0.7.39 - 2026-10-19

- Build Goo with G# SDK 0.5.26 and refresh generated API metadata and SDK documentation.

## 0.7.38 - 2026-10-18

- Add the DevTools Profiler tab with live timelines, memory and resource lanes, and selected-range analysis.
- Release retired swapchain generations during idle once their present fences complete.
- Release swapchain, clip atlas and renderer layer-cache resources on explicit Window.Hide, and recreate them before rendering after Show.
- Release completed cached offscreen layer targets when recreating a window swapchain.
- Add Chrome trace import and export to the DevTools Profiler tab, with lossless Goo round trips and offline inspection.
- Expose per-window live and retired Vulkan swapchain/image counts and estimated current payload bytes with GOO_VK_DIAGNOSTICS=1.
- Restore 0.7.35 style spill allocation costs with linear traversal and recognize possible receiver mutation in GL0004.

## 0.7.37 - 2026-10-17

- Add memory, resource and GPU timing records to DevTools profiler captures.
- Handle changing Vulkan enumeration counts by re-querying after VK_INCOMPLETE.
- Remove stable Context read and commit-queue allocations from queued Cell rebuilds.
- Fix zero-size scrollbar thumbs after changing a mounted scrollbar descriptor.
- Preserve new Context dependencies when a later sibling causes a transaction to fail.

## 0.7.36 - 2026-10-17

- SVG is now part of Goo, and the Goo.Svg package is discontinued. Remove its PackageReference. `import Goo.Svg` is unchanged.
- The default window clear is now white, with a black default foreground that Text inherits. Add `Window.Foreground` and atomic `Window.SetColors`.
- Add retained typed `Context` values and scopes with dependency invalidation and virtual context generations.
- Prefer hardware Vulkan devices and fall back to the next compatible device when startup fails.
- Add opt-in bounded DevTools frame and queue tracing over the existing diagnostics pipe, with `GOO_PROFILE_START=1` to record from startup.
- Fix path morph animation for runtime-loaded SVG assets.
- Fix window resize while an offscreen capture has an unreconciled clip-mask submission.
- Add shipping, platform preflight, learning-path, edit-and-inspect and documentation index guides.
- Add root code conventions for Goo contributors.
- Define subsystem ownership and permitted references for Goo contributors.
- Keep style transitions progressing when a layer repeats or overrides a declaration.
- Layout transitions respect the motion time scale and settle when motion is disabled.
- Refresh held key modifiers so key repeat uses the current shortcut without restarting its delay.
- Stop IME selection and composition follow-up when commit callbacks change focus.
- Remove fully deleted text projections when the same transaction inserts text before them.
- Resolve font families in list order across registered and system fonts.
- Move PageUp and PageDown by the mounted text editor viewport height.
- Virtual state disposal failures preserve committed replacements and do not interrupt descendant cleanup.
- Synchronize backdrop clears before overlapping image copies.
- Preserve returning quadratic excursions when flattening stroke outlines and trim geometry.
- Retain SVG strokes with zero initial width when their animation produces a visible width.
- Preserve SVG matrix coefficient order when publishing static and animated transforms.
- Resolve long SVG gradient inheritance chains without overflowing the stack.
- Enforce the SVG file size limit while reading instead of loading the entire file first.
- Reserve aggregate SVG animation keyframe and morph budgets before parsing or expanding animation values.
- Let inline SVG opacity override presentation opacity before composing ancestor opacity.
- Approximate rounded SVG rectangle corners with the same ellipse conversion and tolerance as circles.
- Preserve clipPath, group and child transforms and inherited clip rules in runtime SVG clips.
- Disconnect DevTools and dispose its pipe when the target closes the connection.
- Clear DevTools target selection and hover when the runtime reports cleared IDs.
- Show runtime RGBA capture size, format, origin and stride in DevTools.
- Remove temporary fling log writes from Gallery pointer handlers.
- Keep locally handled Gallery keys from paging the showcase.
- Reconcile mixed keyed and positional siblings while retaining keyed moves and absolute-index positional identity.
- Allow PathBuilder to publish immutable snapshots and continue building without Reset.
- Animate logical edge state changes when direction mapping stays fixed and preserve snapping when direction reverses.
- Align word navigation and deletion with word selection for underscores and combining marks.
- Keep SVG clip paths on their owning root, group or shape node instead of inheriting them into child shapes.
- Preserve fill and stroke opacity when publishing SVG color animation keyframes.
- Reject stroke cache matches when normalized dash interval counts differ.
- Keep reused dash scratch capacity out of stroke interval traversal.
- Preserve allocated layer bytes in eviction and over-budget failure diagnostics.
- Clear stale DevTools rows when a full snapshot has no root and show an empty inspector.
- Keep four inline style entries and use indexable geometric-capacity storage for larger styles.
- Sort and deduplicate logical clusters once and use binary searches for geometry endpoints.
- Use binary search for grapheme boundary membership without changing letter spacing behavior.
- Validate presentation ranges against the document tree without materializing range text.

## 0.7.35 - 2026-10-16

- Allow `FocusScope.Dispose(false)` to close a scope without restoring prior focus, including when nested scopes close later.

## 0.7.34 - 2026-10-15

- Add undo and redo for single-line `TextEntry` edits, including selection restoration, grouped typing, and controlled-value history reset.
- Focus style follows focus-visible semantics. Keyboard navigation shows focus styles. Pointer presses hide them except on text entries and editors.
- Wait for text glyph uploads before retaining the frame used by window capture, so the first capture includes every label and line.

## 0.7.33 - 2026-10-14

- Add an optional `ShaderEffect.backdropBlur` that prefilters the backdrop with a quarter-resolution separable Gaussian blur. Support backdrop-only effects and preserve the exterior of replacement effects' clips.
- Add `ShaderEffectProgram.replacesBackdrop` for transparent backdrop replacement with clip coverage preserved.
- Compile ShaderEffect shaders when the compiler optimizes out the source or backdrop resource.
- Embed the precompiled filtered backdrop shader so source builds do not require Slang.
- Include native library licenses when packaging with an external `GooNativeRuntimeRoot`.

## 0.7.32 - 2026-10-12

- Size the Vulkan clip mask atlas from its byte budget and device array-layer limit, not the eight-mask clip-chain depth. Split panes and dialog changes could exhaust the false layer limit and close the application. The byte budget is unchanged.
- Reclaim completed clip mask cache regions under pressure without waiting for the cache age limit.

## 0.7.31 - 2026-10-12

- Return native image decode memory to the system when the decode frees it on Linux with glibc. This applies to encoded bytes, source pixels and decoder buffers of 128 KiB or more. Freed blocks stayed resident in the allocator arenas of the decode threads.

## 0.7.30 - 2026-10-12

- Release the GPU texture and the renderer identity of a disposed `ImageSource` when no element draws it. The release also occurs while the window is idle.
- Add `ImageDecodeLimits`. `ImageSource.Decode`, `ImageSource.LoadThumbnail` and `ImageSourceCache` accept it. `MaxDecodedBytes` applies to the pixels that the decode keeps. A thumbnail of a large image is limited by its reduced size and by `MaxPixelsPerSide`.
- Add `ImageLimitException` with `Width` and `Height`. An image that exceeds a limit now throws it. It threw `InvalidDataException`. `ImageLimitException` does not derive from `InvalidDataException`, so code that catches `InvalidDataException` for an oversize image must change.
- Decode images with `stb_image` in the `goo-harfbuzz-gpu` native library. Encoded bytes and source pixels are native memory that the decode frees before it returns. Only the returned pixels are managed memory.
- Remove the `StbImageSharp` package dependency.
- Accept `Window.TrySetFullscreenDisplay` on Wayland when the fullscreen window is already on the requested display. The call returned `Failed`.

## 0.7.29 - 2026-10-11

- Start drag and drop when a pressed mouse or pen pointer moves 8 logical pixels on either axis. The distance was 4. A double click with a small pointer slip no longer starts a drag. Touch contacts still start at 4.
- Add `Window.DragStartDistance`. It sets the drag start distance for mouse and pen pointers.

## 0.7.28 - 2026-10-11

- Add `Style.BackdropBlur`. It applies a Gaussian blur, from 0 through 64 pixels, to the window content behind the border box of an element. `BorderRadius`, clips and `Opacity` apply to the blur.
- Keep partial redraw active under rectangular clips, clip masks, path clips, transforms, layers and effects, and for all draw kinds. A small change in such a scene no longer redraws the full window.
- Stop damage for unchanged chunks of every draw kind. Text that draws outside its box is now included in the damage area.
- Validate cached text segment content once per segment version. A frame with unchanged text no longer validates each glyph again.

## 0.7.27 - 2026-10-11

- Advance the frame deadline when a due frame draws nothing. An animation that does not change the window no longer runs the event loop without a wait.
- Complete a window capture before the next frame changes the scene. `Window.RequestCapture` and `goo capture` now finish while an animation runs.
- Return `Accepted` from `Window.RequestCapture` when the renderer is busy. The window starts the capture when the renderer is free.
- Limit image table scans to the entries in use. A drawn image no longer scans the full image table on each frame.

## 0.7.26 - 2026-10-11

- Add `ElementMetrics.Pinned`. It reports whether `PinToBottom` is set and the reader has not scrolled away from the end, for `Container` and `Virtual`. `MetricsChanged` also fires when only this value changes.
- `ElementMetrics.Deconstruct` has a sixth `out` value for `Pinned`. Code that deconstructs `ElementMetrics` must add it.

## 0.7.24 - 2026-10-11

- Present straight sRGB color multiplied by alpha in transparent windows. Partly transparent pixels no longer show a bright fringe.
- Keep the previous image on screen until a new `Image.Source` or background image source can draw.
- Redraw `Text` when its style ranges change, and `TextEntry` when `Password` or `Placeholder` changes.
- Shape a lone surrogate as U+FFFD. Text layout no longer throws on invalid UTF-16.
- Place right-to-left glyphs in visual order.
- Scroll right for a positive horizontal wheel value, and pass wheel values through as the operating system delivers them. The `Flipped` direction no longer inverts the values.
- Keep the swapchain when a resize request has the same size, such as a window move.
- Accept suboptimal presents when the surface is rotated. A rotated Android surface no longer recreates the swapchain on each frame.
- Stop the posted action drain when an action closes the window.
- Clamp the `ImageFit.Cover` source rectangle to the image. Some size pairs no longer throw.
- Skip the clip chain read in blend and effect shaders when a frame has no clip masks. Compile shader effects again to get this change.
- Keep caret affinity when the custom layout state of a node changes.
- Compile a scene with portals without managed allocation.

## 0.7.23 - 2026-10-10

- Give virtual items the list item role only while the `Virtual` element has the list role. With another role, or with `Accessibility` set to nil, items have no role and the content of each item gets `PositionInSet`.

## 0.7.22 - 2026-10-10

- Add the `Virtual` element and its policy protocol: `VirtualSource`, `VirtualState`, `VirtualViewport`, `VirtualOutput`, `VirtualItem`, and `VirtualChild`.
- Remove the `Virtual(items, ...)` and `VirtualRows` functions. Goo.Widgets now supplies them as `VirtualItems` and `VirtualRows`.
- Place virtual items in content coordinates. Padding is no longer part of the scroll range of a virtual element.

## 0.7.21 - 2026-10-10

- Remove `VirtualLog`. `VirtualRows` now applies a change that only removes rows from the start and adds rows at the end in place.
- Add `pinToBottom` to `VirtualRows`: the end stays in view until the reader scrolls away.
- Show the oldest remaining row when such a change removes the row at the top of the view.
- Wrap long lines in time proportional to their length.
- Accept the Vulkan SDK `spirv-val` binary when compiling shader effects.

## 0.7.20 - 2026-10-09

- Add `VirtualLog` for streaming rows: updates take time proportional to the rows added and dropped.
- Update the scroll range and item count when virtual rows change out of view.
- Stop rounded borders from painting their color along sides without a border.

## 0.7.19 - 2026-10-09

- Build with G# SDK 0.4.1150 and update bitwise complement and native pointer syntax.

## 0.7.18 - 2026-10-09

- Exit on unrecoverable Wayland connection loss while retaining normal close and quit vetoes.

## 0.7.17 - 2026-10-08

- Fix text and border jitter when resizing windows at fractional display scale.

## 0.7.16 - 2026-10-07

- Add a per-window Wayland blur corner radius and keep blur regions bounded during resize.
- Align text inside inline editor slots with the surrounding prose baseline.
- Preserve path coverage at contour joins so small SVG icons do not lose edge pixels.

## 0.7.15 - 2026-10-06

- Add per-window `WindowsBackdrop`, `MacOSBackdrop`, and `WaylandBackdrop`
  options with live updates for native materials, AppKit state/emphasis/alpha
  masks, and Wayland blur regions. Defaults retain the existing appearance.
- Keep desktop-wide compositor settings outside the window API. Unsupported
  hosts retain the opaque fallback and ignore other platforms' options.

## 0.7.14 - 2026-10-06

- Add `Window.Backdrop = WindowBackdrop.Blur` for native desktop blur through
  Wayland's background-effect protocol, Windows 11 Desktop Acrylic, and macOS
  behind-window materials. Compositors control the final appearance.
- Expose `BackdropAvailable` and an opaque `BackdropFallbackColor`. Unsupported
  hosts use the fallback without changing foreground content or widget shaders.
- Add the Gallery's `--native-glass` sample and native lifecycle/fallback smoke
  checks for Linux, Windows, and macOS.

## 0.7.13 - 2026-10-01

- Pin descriptor layout and output arrays across Vulkan allocation calls,
  preventing collected or moved arrays from reaching the driver at startup.
- Keep validation messenger output, buffer copy ranges, and cached text records
  stable across native calls.
- Include Vulkan result codes in failed surface format and present mode queries.

## 0.7.12 - 2026-10-01

- Stream thumbnail area filtering through exact integer coverage weights and
  bounded row buffers, preserving premultiplied alpha and fractional coverage.
- Skip unchanged premultiplication for opaque raster pixels.
- Disable SDL dynamic API dispatch in the Linux static archive while retaining
  runtime dispatch in the shared payload.

## 0.7.11 - 2026-09-30

- Measure ordinary scroll content from the padded and bordered content origin,
  removing false scroll overflow when a child fits the content area.

## 0.7.10 - 2026-09-30

- Import portal Wayland parent handles before showing a window, with optional
  compositor modal hints and clean fallback for unavailable or expired parents.
- Keep the foreign-parent bridge in both shared and static Linux SDL payloads.

## 0.7.9 - 2026-09-29

- Reclaim detached Vulkan image records when the logical source budget fills,
  allowing repeated large images and evicted sources to render again.
- Offer local files to external Wayland targets as Copy drags while preserving
  in-window Move and Copy behavior. Native file offers can be skipped when path
  limits are exceeded without canceling an in-window drag.
- Let a rejecting drop target stop fallback to its ancestors when requested.
- Preserve each pointer event's keyboard modifiers so a fast Ctrl-drop keeps
  its Copy effect when Ctrl is released in the same event batch.

## 0.7.8 - 2026-09-29

- Add optional fixed line numbers to text editors, including wrapped text and
  independent line-number color.

## 0.7.7 - 2026-09-29

- Accept embedded PNG bytes for a native window icon before the first show.

## 0.7.6 - 2026-09-29

- Load aspect-preserved local image thumbnails with bounded retained pixels
  and alpha-safe area filtering.

## 0.7.5 - 2026-09-29

- Measure the destination editor layout before clamping a far caret jump so
  Ctrl+End reveals the final line after viewport changes.
- Clear stale pointer hover when window geometry changes and refresh it when
  the pointer enters the window.

## 0.7.4 - 2026-09-29

- Size text editor scroll extents from the rendered content and caret, preventing
  false cross-axis scrollbars while retaining end-caret visibility.

## 0.7.3 - 2026-09-29

- Replace a text presentation layer's keyed style spans in one validated batch,
  preserving projections and avoiding repeated index rebuilds for syntax highlighting.
- Reuse resolved editor style spans across viewport scrolling until the layer changes.

## 0.7.2 - 2026-09-29

- Let each window disable smooth scrolling while retaining its configured wheel
  scroll scale.
- Mark composing key events and prevent consumed shortcut keys from also
  dispatching committed text input.

## 0.7.1 - 2026-09-29

- Pack pinned Linux x64 static SDL3 and HarfBuzz archives and link them directly
  into NativeAOT consumers, allowing one-executable delivery without Goo native
  shared libraries.
- Use the bundled SDL3 library for audio-only NativeAOT source consumers that
  have no static SDL3 symbols in their executable.
- Wait briefly for a Vulkan swapchain image so live windows continue repainting
  when an image is not immediately available.
- Resolve generic monospace families and select the closest requested font
  weight, including light and black faces.
- Preserve percentage maximum width and height constraints in Yoga layout.

## 0.7.0 - 2026-09-28

### Added

- Added explicit display-paced and uncapped `Window.FramePacing`, native queue
  readiness, and UI-thread `PresentationAccepted` receipts. Receipts report
  queue handoff acceptance, not display scanout.
- Added asynchronous `Window.RequestCapture` and `PollCapture` with caller-owned
  RGBA pixels and exclusive request ownership shared with DevTools capture.
- Added `SourceIndependent` shader generators that draw without capturing the
  unused source subtree. Layout, input, clipping, opacity and required blend
  isolation remain intact.
- Added `ShaderEffectData.Publish<T unmanaged>(ReadOnlySpan<T>)` for one owned
  copy of typed shader data in native memory layout.
- Added `Shape.StrokeStart` and `StrokeEnd` to trim flattened path arc length
  before dashing, with matching stroke hit geometry.
- Added `PathBuilder.Reset` to reuse builder storage while preserving immutable
  paths already returned by `Build`.
- Added `LayoutTransition.SimulationFactory` for custom position simulations
  that preserve incoming velocity when interrupted.
- Added display inventory and explicit fullscreen display selection, including
  Wayland output targeting without enabling unsupported windowed movement.
- Added `Window.TrySetTopmost` with explicit operation results.

### Fixed

- Suppressed owner invalidation for unchanged running animation samples while
  preserving completion and reduced-motion behavior.
- Coalesced shader-data publication from layout metrics callbacks into the
  current paint instead of scheduling another paint.
- Reused flattened stroke contours across dash-phase and trim changes. CPU
  dashing and outline construction still run when their inputs change.
- Removed the intermediate list allocation from immutable `DashPattern` values.
- Kept unsupported topmost preferences from aborting window creation on Wayland.

## 0.6.7 - 2026-09-28

- Added `Anim<T>.Completed` with distinct natural, reduced-motion, and disabled-motion
  reasons. Completion runs after motion registry updates so libraries can safely
  chain animations without retaining a separate Window dispatcher.
- Cancelled stale completion when an animation is replaced, snapped, or disposed.
- Added `Anim<T>.IsDisposed` for library lifecycle checks and stopped frame work
  when a completion callback closes its owning window.
- Wheel input over a disabled child now reaches enabled scroll ancestors without
  invoking disabled handlers or crossing modal scope boundaries.
- Recorded production desktop and mobile extension priorities, ownership, and
  acceptance checks in [production readiness](https://github.com/obselate/goo/blob/v0.6.7/docs/production-readiness.md).

## 0.6.6 - 2026-09-27

### Added

- Added cancellable UI-thread callbacks through `Window.SetTimeout` and
  `Window.SetInterval`.
- Added reusable `Command` actions for buttons, key bindings, and menus, with
  availability checked on each execution.
- Added bounded synchronous `ImageSource.Decode` overloads for encoded memory
  and streams, with optional cancellation.
- Added window show, hide, initial visibility, topmost, focusability,
  capability, visibility event, and presentation preference APIs.
- Added virtual-collection accessibility metadata and visual text geometry.
- Added language-aware text shaping, package-level `Percent`, configurable
  wheel scaling, and platform key-release injection.

### Changed

- `ElementHandle.ScrollTo` and ordinary overflow scrolling now animate toward
  their targets. `JumpTo` remains immediate, and reduced-motion preferences
  disable scroll animation.
- `Padding`, `Margin`, `BorderWidth`, and `BorderColor` now use CSS-style
  `Edges` values. Uniform values remain supported.
- Window activation now returns the shared `WindowOperationResult` used by
  `Show`, `Hide`, and `RequestActivation`.
- Wheel scrolling now preserves fractional platform-scaled deltas, chains
  unused movement to eligible ancestors, and supports bounded touch momentum.
- Embedded runtime shaders ship only in `Goo.dll`. Release bundles retain
  runtime payloads and required licenses while omitting loose shaders,
  authoring tools, symbols, and native provenance.
- Vulkan diagnostics can record startup stages and live memory snapshots.
  Owned pipeline-cache files older than 30 days are removed when a cache is
  saved.
- Unchanged shader-tool and XML-merge builds are skipped unless an input or
  required output changes.

### Fixed

- Kept Vulkan present semaphore and fence pointers valid across garbage
  collection.
- Preserved input arrival order, cancellation, and callback settlement across
  queued keyboard, pointer, text, drag, and scrolling dispatch.
- Preserved a modal button press when its tree updates before release.
- Ignored inconsistent SDL resize metrics while a window is being maximized.
- Published asynchronous image replacements through the owning window and
  prevented retained tree, cell, scrollbar, and frame work from outliving its
  owner.

### Removed

- Removed `Length.Percent`, `WindowActivationResult`, and the individual
  padding, margin, border-width, and border-color side properties in favor of
  `Percent`, `WindowOperationResult`, and `Edges`.
- Moved Gituit to its own repository and removed the temporary bundled
  `apps/Goo.GitWorkbench` application.

## 0.6.5 - 2026-09-22

### Added

- Added native Codex marketplace installation and portable OMP support for the
  Goo agent plugin. `uv` manages its locked Python runtime, so installation no
  longer requires manual Python or MCP configuration, a working-directory
  change, or absolute paths.
- Added an internal package-consumer benchmark with isolated package inputs,
  provenance, separate runtime and symbol staging, and advisory size, startup,
  idle, and memory reports. CI reports measurements without numeric performance
  thresholds and uploads symbols separately.

### Changed

- Pinned source and CI builds to .NET SDK 10.0.401.
- Goo agent preflight now gives the published `Goo.DevTools` global update
  command as the normal CLI recovery path and reserves `GOO_CLI` for compatible
  source-build testing.

### Fixed

- Corrected the package-consumer benchmark to use the canonical
  `GooReleaseVersion` property.


## 0.6.4 - 2026-09-21

### Added

- Added configurable per-axis `Scrollbar` descriptors with optional ordinary
  `Track` and `Thumb` parts, `Auto`/`Always`/`Hidden` visibility, immediate
  dragging, one-viewport paging, and overlay or `ReserveSpace` gutters.
- Added explicit `KeyBinding` callbacks, primitive activation and press actions,
  focused text commands, and keyboard-operated drag-and-drop actions.
- Added configurable text-editor tab width, indentation width, tabs-or-spaces
  policy, and semantic word and line selection commands.

### Changed

- Primitives no longer install automatic editing, submit, button activation, or
  focus traversal key bindings. Applications must assign the desired bindings.
- Moved scrollbar visibility to ordered `Style` axis and shorthand entries.
  Removed the pre-1.0 `Blob.ScrollbarVisibility` authored-value getter.
  Applications that relied on the legacy built-in thumb appearance must author
  `Track` and `Thumb`.
- Double- and triple-click text selection now extends by whole words and logical
  lines while preserving grapheme clusters and the original selected unit.

### Fixed

- Preserved sharp text and offscreen layer placement at fractional display
  scales, and preserved premultiplied color when compositing offscreen layers.
- Fixed text-editor mouse selection, selection dragging, and explicit Tab and
  Shift+Tab indentation behavior.
- Preserved mouse-button release events during captured native window drags.


## 0.6.3 - 2026-09-19

### Added

- Added `Portal` overlays for popups, menus, tooltips, and other content that must render and receive input above the normal tree while preserving logical ownership, focus, accessibility, and lifecycle.
- Added optional `Portal.Anchor` and `Portal.Placement` APIs with automatic alignment, opposite-side flipping, viewport containment, and live geometry updates.

### Changed

- Container borders now render before descendants so child content can paint above them while retaining normal clipping behavior.
- Goo authoring tools now report source provenance and hashes, use focused coverage-aware API search, and return exact starter SDK, package, compiler, lint, and build metadata.

## 0.6.2 - 2026-09-18

### Fixed

- Padded multiline text editors now include content overflow in their scroll extent, keeping the caret fully visible at the first and last lines.

## 0.6.1 - 2026-09-18

### Fixed

- Multiline text editors now measure content before applying maximum height, so short prompts remain compact and grow as text is added. Explicit fixed heights remain unchanged.

## 0.6.0 - 2026-09-18

### Added

- Added stable DevTools target discovery, bounded snapshots and waits, opt-in input and gesture dispatch, runtime style inspection, and structured agent preflight diagnostics.
- Added parameterless `Cell.Mount[TCell]()` for unkeyed mounting of cells with parameterless constructors.
- Added cross-platform source bootstrap scripts for the pinned G# toolchain and released native runtime assets.

### Changed

- Removed the GCV1 binary vector format and the Goo.SvgCompiler tool. Goo.Svg now builds vector assets directly at runtime. Existing binary assets require migration to SVG sources.
- Consolidated Vulkan shader, readback, frame, motion, and diagnostic ownership while pruning disconnected generators, proof paths, harnesses, and duplicated test plumbing.
- Stored generated Unicode data as binary resources and reorganized text layout, Vulkan scene compilation, and SVG parsing by responsibility.

### Fixed

- Preserved diagnostic client isolation, complete snapshots, gesture ownership, plugin configuration, and safe agent launcher behavior.
- Preserved constructor resets in Gslint reductions, handled named-pipe connection resets in capture timeouts, and retried transient macOS artifact-download failures.

## 0.5.4 - 2026-09-15

- Added native G# mixed initializers: `Container` and `Button` accept direct children and ordered spreads through `Add`. Examples use dot-free, member-first syntax. The package automatically supplies the upstream compiler/formatter containing G# #3785 while the tagged SDK catches up.
- Preserved measured virtual-row heights while replacement content is remeasured, fixing scroll jumps when DataGrid selection rebuilds rows near the bottom.
- Added `EmbeddedWindowHost`, host-owned `PlatformInput`, and the `Goo.Android` adapter for shared retained applications.
- Added bounded local PNG loading and `ImageSourceCache`, plus shared desktop UI audio through `SoundSource` and `SoundPlayer`.
- Added `Window.RequestActivation` with platform-managed foreground activation.
- Consolidated focus, scroll, input metadata, text-editor binding, and Cell ownership under explicit core boundaries.
- Removed the internal Lava surface/shader and obsolete Workbench and WindowsDemo applications. Custom shader effects remain supported.
- Fixed native and in-window drag queries reaching targets outside modal focus scopes.
- Restored reproducible API guides and centralized native file-path validation across clipboard, choosers, and drops.
- Container and Button copy read-only child lists so factory output retains the documented mutable child collection.
- Added native titlebar double-click interception for custom chrome, with platform defaults preserved unless handled.
- Fixed inline slot positions after styled text changes its measured advance.
- Added custom layout algorithms, measured virtual rows and stable-key scrolling.
- Added native accessibility adapters, native file-drop ingress, file/image clipboard reads, and asynchronous native file dialogs.
- Added native window size constraints, window ownership/modal lifecycle, pointer click counts, and composite-widget Tab stops.
- Added mounted focus scopes with modal input/accessibility isolation, nested activation, and focus restoration. Interactive primitives now honor explicit `Focusable: false`.
- Added opt-in controlled TextEntry values with focused replacement, grapheme-safe selection, and IME cancellation.
- Included tall inline editor projections in line height and intrinsic measurement; slot-child size changes now invalidate cached paragraph geometry.
- Added bounded JPEG/static GIF decoding and opted-in DevTools input dispatch and inspection improvements.

## 0.5.3 - 2026-09-09

### Added

- Added a Cell factory overload for constructor dependencies and F# object expressions, with stable mounted identity and Goo-owned disposal.

### Fixed

- Recovered shared Vulkan device loss before resizing and stopped frame processing when recovery closes the window.
- Preserved accepted close requests during GPU teardown so `OnClosing` runs once while vetoed requests can still be retried.

## 0.5.2 - 2026-09-09

### Fixed

- Preserved rounded primitive edge coverage at fractional pixel positions.
- Removed bright fringes from opaque rounded fills beneath uniform opaque borders.

## 0.5.1 - 2026-09-09

### Changed

- Removed the four-stop limit for linear and radial gradients, preserving alpha, opacity, and hard color edges.
- Included the Goo authoring plugin with API lookup, runtime inspection, capture, and starter tools.
- Simplified the DevTools inspector and refreshed mounted cells after supported hot reload updates.
- Reused resident path identities across garbage collection and equivalent default button styles.
- Grew image staging buffers and clip atlas layers on demand, skipped empty image bookkeeping, and avoided unnecessary text layout scans for paint padding.
- Updated Gallery shader parameters without rebuilding the Gallery cell.

### Fixed

- Fixed custom titlebar double-click maximize/restore and live resizing of idle windows on Wayland in Goo's bundled SDL runtime.
- Fixed black resize frames by keeping submitted path uploads renderable and deferring frames whose path resources are incomplete.
- Fixed retained text record copy bounds, border clipping, and corner coverage.
- Fixed Gallery direction glyphs and removed redundant impulse scaling.

### Verification

- Replaced duplicated Vulkan proof implementations with checks against the production renderer.
- Added regression coverage for rounded content in the first resize frame and pending path upload visibility.
- Passed 325 core behavior tests, 12 API and documentation tests, 10 SVG tests, 9 CLI tests, strict source lint, Release builds, and local Vulkan regression checks. Rounded resize and image staging checks passed on NVIDIA and software Vulkan.

## 0.5.0 - 2026-09-05

### Added

- Added sparse in-app drag and drop through `Blob.DragSource` and `Blob.DropTarget`, with Copy/Move negotiation, transformed and clipped target discovery, cancellation, and deterministic payload cleanup.
- Added immutable `VectorAsset`, `VectorNode`, `VectorPaint`, and `VectorStroke` APIs shared by authored, runtime SVG, and compiled vector content.
- Added backend-neutral `ShaderEffectProgram` containers and `.goo-effect` build artifacts.
- Added generic `Cell.Animate` overloads and `Motion.Tween`.

### Changed

- Changed `ShaderEffect` construction from raw fragment SPIR-V bytes to a validated `ShaderEffectProgram`. Load build output with `ShaderEffectProgram.Load` and pass the program to `ShaderEffect`.
- Changed `TextEditor` construction to take only its `TextEditorController`; the controller now supplies the document. Consolidated editor operations under `TextEditorController.Execute(TextCommand)` and moved presentation-layer record types behind keyed layer methods.
- Sealed `Anim<T>` and reorganized platform hosting behind internal per-platform services without adding a public backend selector.
- Unified vector rendering around immutable document nodes while retaining `VectorPath` for individual paths.

### Fixed

- Fixed sampled-image premultiplied alpha, liquid-glass dispersed coverage, transformed and clipped input routing, queue wake and isolation, effect-only replacement, pending-readback close, and failure cleanup.
- Fixed clipped Lava blending, CRT coverage at transparent edges, undefined Gallery falloff math, and volumetric premultiplied output. Shader playback rejects values that overflow GPU time, and reentrant drag failures preserve the original callback stack.
- Fixed repeated shared-path identity lookup so the measured 1,000-Shape workload allocates 2,032 B/frame instead of 1,282,032 B/frame.
- Fixed deferred graphics submission so acquired frames retain their recorded work, and exceptional frame abandonment now consumes the acquire semaphore before reuse.

### Performance

- Shared identical shader programs by byte identity, centralized GPU timeline completion, and reused eligible offscreen layer targets. These changes reduce native-object pressure and preserve resource lifetime without a broad frame-time claim.
- Reduced the measured EvenOdd overflow fallback by 34.96% at 33 contours and 35.64% at 65 contours on the qualified RTX 3080 workload. The 65-contour case remains above a 16.67 ms frame budget.
- Reduced the measured 1,000-Container full-update host-frame P50 from 3.012 to 2.694 ms through retained style payload identity checks, with allocation unchanged.

### Verification

- Passed 317 core behavior tests, 12 public API and documentation tests, strict repository lint, generated shader consistency, Release builds, and focused native Vulkan lifecycle, input, image, vector, clip, effect, queue, and readback gates.
- Current evidence and hardware limits are recorded in [historical Linux qualification](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/linux-release-qualification.md).

## 0.4.2 - 2026-09-02

### Added

- Added an Apple Silicon Goo Gallery app bundle for macOS 15 or newer.
- Added a checksum-verified unsigned installer that installs Goo Gallery under the current user account, removes quarantine only from the installed app, and launches it.
- Added pinned macOS arm64 SDL, MoltenVK, and HarfBuzz native payload builds with NativeAOT runtime verification.

## 0.4.1 - 2026-09-01

### Added

- Added ordered reusable style composition through `Style.BasedOn`.
- Added multi-listener window state, focus, and key notification events.
- Added a repo-local strict G# linter and enforced it in CI.
- Added persistent Vulkan pipeline caching and compatible primitive draw batching.

### Changed

- Made typed cells build from their immutable input snapshot and exposed that snapshot to derived cells.
- Made virtualized collections use explicit fixed item extents for deterministic placement and scroll range.
- Centralized style field behavior and defaults in generated metadata.
- Reduced dirty-cell queue work, retained-scene allocations, Vulkan command recording, and primitive staging overhead.

### Fixed

- Fixed best-effort cleanup ownership across reconciliation and the complete window close sequence.
- Fixed routed keyboard and focus callback semantics and default-action cancellation.
- Fixed Vulkan pipeline cache validation and retirement behavior.
- Embedded Goo debug symbols in the assembly so NuGet no longer rejects the G# portable PDB checksum.

### Performance

- Reduced scheduling for 1,000 dirty sibling cells from 1,088.133 to 341.695 microseconds, a 68.6% reduction, with unchanged managed allocation and without the rejected HashSet candidate's approximately 22.2 KiB retained capacity.
- Reduced stable primitive scene compilation by approximately 20% while keeping the compiler at 0 B/op before and after.
- Reduced compatible analytic draw calls by 92.8% to 99.0% across the sparse-box, topology, and small-animation workloads. Main-pass GPU P50 improved by 25.0%, 6.5%, and 16.7% respectively. No stable allocation improvement was measured.
- Reduced 13-pipeline creation from 2.824 seconds uncached to 5.235 milliseconds warm with the NVIDIA implicit disk cache disabled, a 99.8% reduction and 539x speedup. The explicit cache used approximately 1.13 MiB.

## 0.4.0 - 2026-08-31

### Added

- Added Windows x64 package support, tested on Windows 11, with the pinned SDL 3
  runtime, shared Vulkan host, software-Vulkan regression coverage, and
  NativeAOT qualification tooling.
- Added the `Goo.Templates` application template, the `Goo.DevTools` CLI,
  graphical inspector, and VS Code and Rider integrations.
- Added renderer-driven ShaderEffect playback, computed layout transitions,
  non-throwing window dispatch, and window diagnostics.
- Added four bounded, retained `ShaderEffectData` inputs with copy or ownership-transfer publication and shader authoring helpers.
- Added ownership-transfer construction for immutable `ImageSource` pixels with final-retirement callbacks.

### Changed

- Migrated Goo-owned Vulkan shaders to the pinned Slang 2026.16 toolchain.
- Replaced the Showcase application with Goo Gallery.
- Added complete clean-machine setup, conditional tool, DevTools, publishing,
  NativeAOT, troubleshooting, contributor, and release documentation.

### Fixed

- Fixed transparent Vulkan swapchains, ShaderEffect playback demand,
  clip-mask atlas pressure, and Windows software-Vulkan presentation.

## 0.3.0 - 2026-08-28

Goo 0.3.0 moves production rendering to Vulkan, broadens the Linux native ABI
to glibc 2.27, and qualifies Linux 6.6 or newer.

### Changed

- Replaced the Skia renderer with a direct Vulkan 1.3 renderer for Linux Wayland.
- Moved production hosting, text, images, paths, effects, windowing, diagnostics, and recovery into Goo-owned G# code.
- Added retained scene compilation, bounded GPU resource caches, damage tracking, asynchronous readback, and multi-window scheduling.
- Added native HarfBuzz shaping and GPU text paint with registered fonts, fallback, color glyphs, text editing, and IME geometry.
- Added retained images, vector paths, rounded clipping, borders, gradients, shadows, blend modes, scrolling, and draggable scrollbars.
- Lowered the Linux native ABI floor to glibc 2.27 and qualified Linux 6.6 or newer.
- Made Vulkan surface and swapchain maintenance extensions optional with an idle-safe compatibility path.

### Added

- Build-time SVG compilation into retained GCV1 vector assets.
- Build-time Slang and GLSL ShaderEffect compilation with deterministic SPIR-V validation.
- Package and NativeAOT verification for the public API, native libraries, shaders, and clean consumers.

### Verification

- Linux x64 passes public API, framework behavior, package, Vulkan validation, lifecycle, and performance checks.
- Accepted Linux evidence is summarized in [historical Linux qualification](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/linux-release-qualification.md).

### Pending

- Windows x64 runtime qualification.
- Linux integrated-GPU qualification.
- A second real display-scale qualification.

## 0.2.0 - 2026-08-07

### Changed

- SkiaSharp and SkiaSharp.HarfBuzz upgraded from 3.116.0 to 4.151.1, moving
  Skia from m116 to m151.
- HarfBuzzSharp and HarfBuzzSharp.NativeAssets.Linux upgraded from 8.3.1.1 to
  14.2.1.2, moving HarfBuzz from 8.3.1 to 14.2.1.
- Removed the SkiaSharp 3.x duplicate Linux native alias cleanup from
  `Goo.targets`; SkiaSharp 4.x ships a single canonical `libSkiaSharp.so`.
- Internal path construction migrated from the deprecated mutable `SKPath`
  API to `SKPathBuilder`, ahead of SkiaSharp removing its compatibility
  shim. Uniform solid borders and inset box shadows now paint through
  `SKCanvas.DrawRoundRectDifference`, making rounded solid borders about
  3x faster and removing the shim's per-paint allocation overhead. Public
  API is unchanged.

## 0.1.0 - 2026-08-07

Goo 0.1.0 is the first public release of the retained, declarative UI framework
for G# and .NET 10.

### Included

- Declarative Blob trees with keyed Cell invalidation and retained reconciliation.
- Yoga layout, Skia rendering, shapes, images, text, and style transitions.
- Keyboard, pointer, focus, scroll, clipboard, and generic text or IME input.
- Stable element handles, accessibility semantics, and a UI-thread dispatcher.
- Passive styled text and a retained multiline text editor.
- XML documentation and generated per-area API reference pages.

### Release constraints

- The supported platform is `linux-x64` with glibc 2.35 or newer on a native
  Wayland session. X11 and XWayland are not supported.
- Windows, macOS, and Linux ARM64 are not supported by 0.1.0.
- Custom IME candidate presentation is application-owned in 0.1.0.

### Compatibility

- Target framework: .NET 10.
- G# SDK: 0.3.633.
- Package version: 0.1.0.
- License: MIT.
