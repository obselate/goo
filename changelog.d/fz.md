### Breaking changes

- Blob and Style declarations can be changed while you build them. Once Goo receives a Blob, property assignments, `Add`, and child-list mutations throw `InvalidOperationException`. State styles and retained declaration objects freeze with their Blob. Shared child lists are copied at hand-off.
- Return a new Blob when its declaration changes. Returning the same Blob does not refresh it. Virtual items no longer write keys into authored content. `Each` rejects a previously handed-off Blob that has no key. Set its key before hand-off or return a new Blob.
- `TextInputOptions.AutofillHints` remains `[]string`. Assignment and reads copy the values. Changing a returned array does not change the stored hints.
- `WindowMetrics.Deconstruct` uses `width` and `height` out parameters. `Platform` is now static. The `LongPressGesture` duration parameter is now `durationMs`. Update named arguments.
- Public classes that are not designed for inheritance are now sealed.

The following properties change from `init` to guarded `set`:

- `Style`: `BasedOn`, `Width`, `Height`, `MinWidth`, `MinHeight`, `MaxWidth`, `MaxHeight`,
  `AspectRatio`, `Padding`, `PaddingStart`, `PaddingEnd`, `Margin`, `MarginStart`, `MarginEnd`,
  `Gap`, `RowGap`, `ColumnGap`, `FlexDirection`, `FlexWrap`, `JustifyContent`, `AlignItems`,
  `AlignSelf`, `AlignContent`, `Flex`, `FlexGrow`, `FlexShrink`, `FlexBasis`, `Position`, `Inset`,
  `Left`, `Start`, `Top`, `Right`, `End`, `Bottom`, `Display`, `Direction`, `Visibility`, `ZIndex`,
  `Overflow`, `OverflowX`, `OverflowY`, `ScrollbarVisibility`, `ScrollbarVisibilityX`,
  `ScrollbarVisibilityY`, `Scrollbar`, `ScrollbarX`, `ScrollbarY`, `Cursor`, `BackgroundColor`,
  `BackgroundColorAnim`, `BackgroundGradient`, `BackgroundImageSource`, `BackgroundImageFit`,
  `ClipPath`, `ClipPathFit`, `ClipPathFillRule`, `BorderRadius`, `BorderTopLeftRadius`,
  `BorderTopRightRadius`, `BorderBottomLeftRadius`, `BorderBottomRightRadius`, `BorderWidth`,
  `BorderStartWidth`, `BorderEndWidth`, `BorderColor`, `BorderColorAnim`, `BorderStartColor`,
  `BorderStartColorAnim`, `BorderEndColor`, `BorderEndColorAnim`, `BorderStyle`, `OutlineWidth`,
  `OutlineColor`, `OutlineColorAnim`, `OutlineOffset`, `Opacity`, `OpacityAnim`, `BackdropBlur`,
  `BlendMode`, `ShaderEffect`, `Transform`, `TranslateAnim`, `ScaleAnim`, `TransformOriginX`,
  `TransformOriginY`, `BoxShadow`, `BoxShadows`, `TextShadow`, `TextShadows`, `FontFamily`,
  `Language`, `FontSize`, `Color`, `ColorAnim`, `TextStrokeWidth`, `TextStrokeColor`,
  `TextStrokeColorAnim`, `FontWeight`, `FontStyle`, `LetterSpacing`, `LineHeight`, `TextAlign`,
  `TextDecoration`, `TextWrap`, `TextTrimming`, `TextMaxLines`, `TextTransform`.
- `Blob`: `Key`, `Handle`, `FocusTarget`, `Accessibility`, `AccessibilityName`,
  `AccessibilityRole`, `OnClick`, `OnPointerDown`, `OnPointerMove`, `OnPointerUp`,
  `OnPointerCancel`, `OnPointerDrag`, `PointerDragThreshold`, `PointerDragAxis`, `OnPointerEnter`,
  `OnPointerLeave`, `OnWheel`, `OnKeyDown`, `OnKeyUp`, `OnFocus`, `OnBlur`, `OnTextInput`,
  `OnTextComposition`, `OnTextCompositionCancel`, `OnTextCandidates`, `DragSource`, `DropTarget`,
  `Gestures`, `KeyBindings`, `HoverStyle`, `ActiveStyle`, `FocusStyle`, `DisabledStyle`,
  `TransitionMs`, `TransitionEasing`, `TransitionDelayMs`, `TransitionProperties`,
  `LayoutTransition`, `Focusable`, `TabStop`, `Disabled`, `AutoFocus`.
- `AccessibilityValue`: `Now`, `Minimum`, `Maximum`, `Text`.
- `AccessibilityRelationships`: `LabelledBy`, `DescribedBy`, `Controls`, `Owns`, `FlowTo`,
  `ErrorMessage`, `ActiveDescendant`.
- `Accessibility`: `Role`, `CustomRole`, `Name`, `Description`, `Value`, `Range`, `Checked`,
  `Selected`, `Expanded`, `ReadOnly`, `Required`, `Invalid`, `Busy`, `Level`, `PositionInSet`,
  `SizeOfSet`, `RowIndex`, `ColumnIndex`, `RowCount`, `ColumnCount`, `Orientation`, `Modal`,
  `Multiline`, `MultiSelectable`, `HasPopup`, `Live`, `Atomic`, `Relationships`, `Hidden`,
  `Actions`, `OnAction`.
- `Container`: `Children`, `Layout`, `HitTestSelf`.
- `Button`: `Children`.
- `Row`: `Children`, `HitTestSelf`.
- `Column`: `Children`, `HitTestSelf`.
- `Image`: `Source`, `Fit`, `Placeholder`, `Fallback`, `PixelsPerUnit`.
- `Text`: `Content`, `Selectable`, `SelectionColor`, `StyleRanges`.
- `TextEntry`: `Value`, `Controlled`, `ReadOnly`, `Placeholder`, `PlaceholderColor`, `Password`,
  `InputOptions`, `OnChange`, `OnSubmit`, `SelectionColor`.
- `TextEditor`: `Controller`, `Layers`, `ReadOnly`, `Placeholder`, `PlaceholderColor`,
  `InputOptions`, `SelectionColor`, `CaretColor`, `ShowLineNumbers`, `LineNumberColor`,
  `CurrentLineColor`, `OverscanLines`, `OnChange`, `OnSubmit`.
- `Shape`: `Path`, `Fit`, `Fill`, `Stroke`, `FillRule`, `UseCurrentColor`, `CornerRadius`,
  `StrokeStart`, `StrokeEnd`.
- `Portal`: `Anchor`, `Placement`, `AnchorRect`, `CollisionBounds`, `HideWhenAnchorClipped`,
  `FocusScope`, `Scrim`, `OnDismiss`.
- `Virtual`: `Source`.
- `FocusScopeOptions`: `Modal`, `RestoreFocus`, `InitialFocus`.
- `TextInputOptions`: `Purpose`, `EnterAction`, `AutofillHints`.
- `Scrollbar`: `Thickness`, `HitThickness`, `Inset`, `MinThumbLength`, `HideDelayMs`, `FadeMs`,
  `ReserveSpace`, `Track`, `Thumb`.
- `VectorStroke`: `Cap`, `Join`, `MiterLimit`, `Dashes`, `VectorEffect`.
