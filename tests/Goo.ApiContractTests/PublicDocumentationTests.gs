import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Reflection
import System.Text.RegularExpressions
import System.Xml.Linq
import Goo
import Goo.Gestures
import Goo.Printing
import Goo.SpellCheck
import Xunit

class PublicDocumentationTests {
    @Fact
    func GeneratedXmlCoversThePublicApi() {
        AssertApprovedCallablesAreTracked()
        let members = LoadDocumentationMembers()
        let expected = ExpectedDocumentationIds().Order(StringComparer.Ordinal).ToArray()
        Assert.Equal(expected, members.Keys.Order(StringComparer.Ordinal))
        for type in SynthesizedPrimaryDataTypes {
            let summary = members["T:${type.FullName}"].Element(XName?("summary")!!)!!.Value
            for property in type.GetProperties(PublicDeclared) {
                Assert.Contains(property.Name, summary, StringComparison.Ordinal)
            }
        }
        for (id, member) in members {
            Assert.True(HasText(member.Element(XName?("summary")!!)), "$id needs a summary.")
            let shape = if Shapes.TryGetValue(id, out var expectedShape) {
                expectedShape
            } else {
                DocumentationShape.Empty
            }
            Assert.Equal(shape.Parameters, TagNames(member, "param"))
            Assert.Equal(shape.TypeParameters, TagNames(member, "typeparam"))
            Assert.Equal(shape.Returns, HasText(member.Element(XName?("returns")!!)))
        }
    }

    @Fact
    func EnumsInterfacesAndWindowPartialsRequireSourceDocumentation() {
        let supplemented = LoadSupplementMemberIds()
        let sources = []string{"Goo", "Goo.Audio"}
            .SelectMany(
            (directory string) -> Directory.EnumerateFiles(
                Path.Combine(FindRepositoryRoot().FullName, directory),
                "*.gs",
                SearchOption.AllDirectories
            )
        )
            .Select(File.ReadAllText)
            .ToArray()
        for type in ApiTypes().Where((type Type) -> type.IsEnum || type.IsInterface) {
            let kind = if type.IsEnum {
                "enum"
            } else {
                "(?:sealed\\s+)?interface"
            }
            Assert.Contains(
                sources,
                (source string) -> Regex.IsMatch(
                    source,
                    "(?m)^///\\s+.+\\r?\\n(?:@\\w+\\r?\\n)?public\\s+$kind\\s+${Regex.Escape(SourceName(type))}\\b"
                )
            )
            for property in type.GetProperties(PublicDeclared) {
                if supplemented.Contains("P:${type.FullName}.${property.Name}") {
                    continue
                }
                Assert.Contains(
                    sources,
                    (source string) -> Regex.IsMatch(
                        source,
                        "(?m)^\\s*///\\s+.+\\r?\\n\\s*prop\\s+${Regex.Escape(property.Name)}\\b"
                    )
                )
            }
            for method in type.GetMethods(PublicDeclared).Where((method MethodInfo) -> !method.IsSpecialName) {
                Assert.Contains(
                    sources,
                    (source string) -> Regex.IsMatch(
                        source,
                        "(?m)^\\s*///\\s+.+(?:\\r?\\n\\s*///\\s+.*)*\\r?\\n\\s*(?:public\\s+)?func\\s+${Regex.Escape(method.Name)}\\b"
                    )
                )
            }
        }
        let windowSources = sources.Where(
            (source string) -> source.Contains("public partial class Window", StringComparison.Ordinal)
        )
            .ToArray()
        Assert.NotEmpty(windowSources)
        Assert.All(
            windowSources,
            (source string) -> Assert.Matches("(?m)^///\\s+.+\\r?\\npublic partial class Window\\b", source)
        )
    }

    @Fact
    func ApiReferenceDocumentsUniformShapeStrokeContract() {
        let shapes = ReadApiPage("shapes.md")
        let style = ReadApiPage("style.md")
        Assert.Contains("Displays a vector path with fill and one uniform stroke.", shapes, StringComparison.Ordinal)
        Assert.Contains("A uniform value also sets the Shape stroke width.", style, StringComparison.Ordinal)
    }

    @Fact
    func ApiReferenceDocumentsStyleCompositionAndGradientClearing() {
        let style = ReadApiPage("style.md")
        Assert.Contains(
            "copies another style's ordered declarations at its exact declaration position",
            style,
            StringComparison.Ordinal
        )
        Assert.Contains("`BackgroundGradient: nil` is an explicit clear declaration", style, StringComparison.Ordinal)
    }

    @Fact
    func ApiReferenceDocumentsKeyboardAndFocusRouting() {
        let input = ReadApiPage("input.md")
        Assert.Contains("first bubble from the focused element through its parents", input, StringComparison.Ordinal)
        Assert.Contains("updates the old and new `Focused` states first", input, StringComparison.Ordinal)
        Assert.Contains("depth-first tree order and wrap at the ends", input, StringComparison.Ordinal)
    }

    @Fact
    func ApiReferenceDocumentsTextMaxLinesContract() {
        let style = ReadApiPage("style.md")
        Assert.Contains(
            "Zero keeps all lines; negative values throw ArgumentOutOfRangeException.",
            style,
            StringComparison.Ordinal
        )
        Assert.Contains(
            "It does not inherit, change TextEntry, or interpolate through transitions.",
            style,
            StringComparison.Ordinal
        )
    }

    @Fact
    func ApiReferenceDocumentsTextStrokeContract() {
        let style = ReadApiPage("style.md")
        Assert.Contains(
            "The stroke is paint-only, outlines glyphs only, and snaps during transitions.",
            style,
            StringComparison.Ordinal
        )
        Assert.Contains(
            "Sets the inherited glyph stroke color without changing text layout.",
            style,
            StringComparison.Ordinal
        )
    }

    @Fact
    func ApiReferenceDocumentsDirectionContract() {
        let style = ReadApiPage("style.md")
        let text = ReadApiPage("text.md")
        Assert.Contains(
            "Auto keeps flex layout left-to-right and detects each text paragraph's direction.",
            style,
            StringComparison.Ordinal
        )
        Assert.Contains("Start is the default and follows paragraph direction.", style, StringComparison.Ordinal)
        Assert.Contains(
            "MoveLeft and MoveRight use visual order while mounted and logical document order otherwise.",
            text,
            StringComparison.Ordinal
        )
    }

    private data struct DocumentationShape(Parameters[]string, TypeParameters[]string, Returns bool) : IEquatable[
        DocumentationShape
    ] {
        shared {
            let Empty DocumentationShape = DocumentationShape(
                System.Array.Empty[string](),
                System.Array.Empty[string](),
                false
            )
        }
    }

    shared {
        private const PublicDeclared BindingFlags = BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly
        private let ExpectedMethodIds[]string = []string{
            "M:Goo.RichText.RichTextClipboard.#ctor(Goo.Window,Goo.TextEditorController,Goo.TextPresentationLayer)",
            "M:Goo.RichText.RichTextClipboard.CopyAsync(System.Threading.CancellationToken)",
            "M:Goo.RichText.RichTextClipboard.CutAsync(System.Threading.CancellationToken)",
            "M:Goo.RichText.RichTextClipboard.Dispose",
            "M:Goo.RichText.RichTextClipboard.PasteAsync(System.Threading.CancellationToken)",
            "M:Goo.RichText.RichTextClipboard.PastePlainTextAsync(System.Threading.CancellationToken)",
            "M:Goo.RichText.RichTextCodec.Read(System.String,System.ReadOnlyMemory{System.Byte})",
            "M:Goo.RichText.RichTextCodec.Write(Goo.RichText.RichTextFragment)",
            "M:Goo.RichText.RichTextFragment.#ctor(System.String,System.Collections.Generic.IReadOnlyList{Goo.TextStyleSpan})",
            "M:Goo.TrayOptions.#ctor",
            "M:Goo.TrayIcon.Create(Goo.Window,Goo.TrayOptions)",
            "M:Goo.TrayIcon.Update(Goo.TrayOptions)",
            "M:Goo.TrayIcon.Dispose",
            "M:Goo.ActivationArguments.Read(System.Collections.Generic.IReadOnlyList{System.String},System.String)",
            "M:Goo.SingleInstance.AcquireAsync(System.String,Goo.ApplicationActivation,System.Int32)",
            "M:Goo.Placement.Restore(Goo.Window,Goo.WindowPlacement)",
            "M:Goo.NotificationOptions.#ctor",
            "M:Goo.NotificationMessage.#ctor",
            "M:Goo.NotificationService.GetPermissionAsync",
            "M:Goo.NotificationService.RequestPermissionAsync",
            "M:Goo.NotificationService.ShowAsync(Goo.NotificationMessage)",
            "M:Goo.NotificationService.GetStatusAsync(System.String)",
            "M:Goo.NotificationService.RemoveAsync(System.String)",
            "M:Goo.Notifications.Open(Goo.NotificationOptions)",
            "M:Goo.Gestures.DoubleTapGesture.#ctor(System.Action{Goo.Gestures.TapGestureEvent})",
            "M:Goo.Gestures.DoubleTapGesture.CreateSession",
            "M:Goo.Gestures.LongPressGesture.#ctor(System.Action{Goo.Gestures.PressGestureEvent},System.Double)",
            "M:Goo.Gestures.LongPressGesture.CreateSession",
            "M:Goo.Gestures.PanGesture.#ctor(System.Action{Goo.Gestures.PanGestureEvent},Goo.Gestures.PanAxis)",
            "M:Goo.Gestures.PanGesture.CreateSession",
            "M:Goo.Gestures.TransformGesture.#ctor(System.Action{Goo.Gestures.TransformGestureEvent})",
            "M:Goo.Gestures.TransformGesture.CreateSession",
            "M:Goo.MessageBoxButton.#ctor",
            "M:Goo.MessageBoxOptions.#ctor",
            "M:Goo.NativeDialogs.ShowMessageBoxAsync(Goo.Window,Goo.MessageBoxOptions)",
            "M:Goo.NativeMenuBar.#ctor(Goo.Window)",
            "M:Goo.NativeMenuBar.Dispose",
            "M:Goo.NativeMenuBar.SetItems(System.Collections.Generic.IReadOnlyList{Goo.NativeMenuItem})",
            "M:Goo.NativeMenuItem.#ctor",
            "M:Goo.NativeMenus.#ctor",
            "M:Goo.NativeMenus.ShowContextMenuAsync(Goo.Window,Goo.Point,System.Collections.Generic.IReadOnlyList{Goo.NativeMenuItem})",
            "M:Goo.Printing.IPrintDocument.CreatePage(System.Int32,Goo.Printing.PrintPageSettings)",
            "M:Goo.Printing.IPrintDocument.Paginate(Goo.Printing.PrintPageSettings)",
            "M:Goo.Printing.Printing.ExportPdfAsync(Goo.Window,Goo.Printing.IPrintDocument,Goo.Printing.PrintPageSettings,System.IO.Stream,System.Threading.CancellationToken)",
            "M:Goo.Printing.Printing.ShowDialogAsync(Goo.Window,Goo.Printing.IPrintDocument,System.String,System.Threading.CancellationToken)",
            "M:Goo.SpellCheck.HunspellSpellingService.#ctor(System.String,System.String,System.String)",
            "M:Goo.SpellCheck.HunspellSpellingService.CheckAsync(Goo.TextSnapshot,Goo.TextRange,System.String,System.Threading.CancellationToken)",
            "M:Goo.SpellCheck.HunspellSpellingService.Dispose",
            "M:Goo.SpellCheck.HunspellSpellingService.SuggestAsync(Goo.TextSnapshot,Goo.TextRange,System.String,System.Threading.CancellationToken)",
            "M:Goo.SpellCheck.ISpellingService.CheckAsync(Goo.TextSnapshot,Goo.TextRange,System.String,System.Threading.CancellationToken)",
            "M:Goo.SpellCheck.ISpellingService.SuggestAsync(Goo.TextSnapshot,Goo.TextRange,System.String,System.Threading.CancellationToken)",
            "M:Goo.SpellCheck.SpellCheckSession.#ctor(Goo.Window,Goo.TextEditorController,Goo.SpellCheck.ISpellingService,System.String)",
            "M:Goo.SpellCheck.SpellCheckSession.ApplySuggestion(Goo.SpellCheck.SpellingSuggestions,System.Int32)",
            "M:Goo.SpellCheck.SpellCheckSession.CheckAsync(Goo.TextRange,System.Threading.CancellationToken)",
            "M:Goo.SpellCheck.SpellCheckSession.Dispose",
            "M:Goo.SpellCheck.SpellCheckSession.SuggestAsync(Goo.TextPosition,System.Threading.CancellationToken)",
            "M:Goo.SpellCheck.SystemSpellingService.#ctor",
            "M:Goo.SpellCheck.SystemSpellingService.CheckAsync(Goo.TextSnapshot,Goo.TextRange,System.String,System.Threading.CancellationToken)",
            "M:Goo.SpellCheck.SystemSpellingService.SuggestAsync(Goo.TextSnapshot,Goo.TextRange,System.String,System.Threading.CancellationToken)",
            "M:Goo.ApplicationActivation.#ctor",
            "M:Goo.Window.InitializeApplicationActivation(Goo.ApplicationActivation)",
            "M:Goo.Window.PostApplicationActivation(Goo.ApplicationActivation)",
            "M:Goo.WindowPlacement.#ctor",
            "M:Goo.Window.CapturePlacement",
            "M:Goo.Window.ApplyPlacement(Goo.WindowPlacement)",
            "M:Goo.ElementHandle.CancelGestures",
            "M:Goo.GestureInput.PointerAt(System.Int32)",
            "M:Goo.GestureRecognizer.CreateSession",
            "M:Goo.GestureSession.Evaluate(Goo.GestureInput)",
            "M:Goo.GestureSession.NextDeadlineSeconds",
            "M:Goo.GestureSession.Notify(Goo.GesturePhase,Goo.GestureCancelReason)",
            "M:Goo.PlatformInput.SetSelection(Goo.TextSelection)",
            "M:Goo.Accessibility.#ctor",
            "M:Goo.Window.CreateOffscreenSession",
            "M:Goo.Window.RenderOffscreenAsync(Goo.Cell,Goo.OffscreenRenderOptions,System.Threading.CancellationToken,Goo.WindowCapture)",
            "M:Goo.OffscreenRenderSession.RenderAsync(Goo.Cell,Goo.OffscreenRenderOptions,System.Threading.CancellationToken,Goo.WindowCapture)",
            "M:Goo.OffscreenRenderSession.Service",
            "M:Goo.OffscreenRenderSession.Dispose",
            "M:Goo.NativeDialogOwnerLease.Dispose",
            "M:Goo.Style.TryGetTextStyle(Goo.TextStyleProperties@)",
            "M:Goo.TextPresentationLayer.GetStyles",
            "M:Goo.TextPresentationLayer.ApplyTransaction(Goo.TextChange[],System.Collections.Generic.IReadOnlyList{Goo.TextStyleSpan})",
            "M:Goo.TextEditorController.ReplaceSelection(Goo.TextPresentationLayer,System.String,System.Collections.Generic.IReadOnlyList{Goo.TextStyleSpan})",
            "M:Goo.Window.AcquireNativeDialogOwnerAsync(System.Threading.CancellationToken)",
            "M:Goo.TransferRepresentation.#ctor(System.String,System.ReadOnlyMemory{System.Byte})",
            "M:Goo.TransferData.#ctor(System.Collections.Generic.IReadOnlyList{Goo.TransferRepresentation},"
                + "System.Collections.Generic.IReadOnlyList{System.Uri})",
            "M:Goo.Window.ReadClipboardDataAsync(System.Collections.Generic.IReadOnlyList{System.String})",
            "M:Goo.Window.WriteClipboardAsync(Goo.TransferData,Goo.ClipboardIntent)",
            "M:Goo.Window.SetNativeDataDropFormats(System.Collections.Generic.IReadOnlyList{System.String})",
            "M:Goo.AccessibilityActionRequest.#ctor(Goo.AccessibilityAction)",
            "M:Goo.AccessibilityActionRequest.Scroll(System.Double,System.Double)",
            "M:Goo.AccessibilityActionRequest.SetSelection(System.Int32,System.Int32)",
            "M:Goo.AccessibilityActionRequest.SetSelection(System.Int32,System.Int32,System.Int32)",
            "M:Goo.NativeAccessibilityAdapter.#ctor",
            "M:Goo.NativeAccessibilityAdapter.Dispose",
            "M:Goo.NativeAccessibilityAdapter.Update(Goo.AccessibilityTree)",
            "M:Goo.AccessibilityActionRequest.SetValue(System.String)",
            "M:Goo.AccessibilityAdapter.Update(Goo.AccessibilityTree)",
            "M:Goo.AccessibilityRelationships.#ctor",
            "M:Goo.AccessibilityValue.#ctor",
            "M:Goo.Anim`1.Pause",
            "M:Goo.Anim`1.Resume",
            "M:Goo.Anim`1.Seek(System.Double)",
            "M:Goo.Anim`1.Set(`0)",
            "M:Goo.Anim`1.Snap(`0)",
            "M:Goo.Anim`1.To(`0)",
            "M:Goo.Anim`1.To(`0,System.Func{System.Double,System.Double,System.Double,Goo.Simulation},System.Func{System.Double,System.Double,System.Double,Goo.Simulation}[])",
            "M:Goo.Anim`1.To(`0,Goo.MotionVelocity)",
            "M:Goo.Anim`1.To(`0,Goo.MotionVelocity,System.Func{System.Double,System.Double,System.Double,Goo.Simulation},System.Func{System.Double,System.Double,System.Double,Goo.Simulation}[])",
            "M:Goo.FileDialogFilter.#ctor(System.String,System.String)",
            "M:Goo.FileDialogOptions.#ctor",
            "M:Goo.Window.ShowFileDialogAsync(Goo.FileDialogKind,Goo.FileDialogOptions)",
            "M:Goo.Window.Show(System.Boolean)",
            "M:Goo.Window.Hide",
            "M:Goo.WindowBackdropMask.#ctor(System.Int32,System.Int32,System.Byte[])",
            "M:Goo.Window.GetDisplays",
            "M:Goo.Window.GetCurrentDisplay",
            "M:Goo.Window.TrySetFullscreenDisplay(Goo.WindowDisplayId)",
            "M:Goo.Window.TrySetTopmost(System.Boolean)",
            "M:Goo.Window.RequestCapture",
            "M:Goo.Window.RequestCapture(Goo.WindowCapture)",
            "M:Goo.Window.PollCapture",
            "M:Goo.Window.CancelFileDialog",
            "M:Goo.Window.SetColors(Goo.Color,Goo.Color)",
            "M:Goo.LayoutAlgorithm.Measure(Goo.LayoutContext,Goo.LayoutSize)",
            "M:Goo.LayoutAlgorithm.Arrange(Goo.LayoutContext,Goo.LayoutSize)",
            "M:Goo.LayoutContext.MeasureChild(System.Int32,Goo.LayoutSize)",
            "M:Goo.LayoutContext.ArrangeChild(System.Int32,Goo.ElementRect)",
            "M:Goo.Virtual.#ctor(Goo.VirtualSource)",
            "M:Goo.VirtualSource.State(Goo.VirtualState)",
            "M:Goo.VirtualState.Realize(Goo.VirtualViewport,Goo.VirtualOutput)",
            "M:Goo.VirtualState.NeedsRealize(Goo.VirtualViewport)",
            "M:Goo.VirtualState.OffsetOf(Goo.VirtualViewport,System.String)",
            "M:Goo.VirtualState.Commit",
            "M:Goo.VirtualState.Cancel",
            "M:Goo.VirtualState.Dispose",
            "M:Goo.VirtualViewport.Child(System.Int32)",
            "M:Goo.VirtualOutput.Add(Goo.VirtualItem)",
            "M:Goo.Button.#ctor",
            "M:Goo.Button.Add(Goo.Blob)",
            "M:Goo.Context`1.#ctor",
            "M:Goo.Context`1.Read",
            "M:Goo.Context`1.Read(Goo.Window)",
            "M:Goo.Context`1.TryRead(Goo.Window,`0@)",
            "M:Goo.Context`1.Set(Goo.Window,`0)",
            "M:Goo.Context`1.Scope(`0,System.Func{Goo.Blob})",
            "M:Goo.Cell.#ctor",
            "M:Goo.Cell.Animate(Goo.Color)",
            "M:Goo.Cell.Animate(Goo.Color,System.Action{Goo.Color})",
            "M:Goo.Cell.Animate(Goo.Length)",
            "M:Goo.Cell.Animate(Goo.Length,System.Action{Goo.Length})",
            "M:Goo.Cell.Animate(Goo.Point)",
            "M:Goo.Cell.Animate(Goo.Point,System.Action{Goo.Point})",
            "M:Goo.Cell.Animate(System.Double)",
            "M:Goo.Cell.Animate(System.Double,System.Action{System.Double})",
            "M:Goo.Cell.Animate``1(``0,Goo.MotionConverter{``0})",
            "M:Goo.Cell.Animate``1(``0,Goo.MotionConverter{``0},System.Action{``0})",
            "M:Goo.Cell.Build",
            "M:Goo.Cell`1.Build(`0)",
            "M:Goo.Cell.MountSeeded``1(System.String,System.Action{``0},System.Action{``0})",
            "M:Goo.Cell.Mount``1",
            "M:Goo.Cell.Mount``1(System.Func{``0},System.String)",
            "M:Goo.Cell.Mount``1(System.String)",
            "M:Goo.Cell.Mount``1(System.String,System.Action{``0})",
            "M:Goo.Cell.Mount``2(System.String,``0)",
            "M:Goo.Cell.Rebuild",
            "M:Goo.Cell`1.ShouldRebuild(`0,`0)",
            "M:Goo.Color.FromNormalized(System.Single,System.Single,System.Single,System.Single)",
            "M:Goo.Color.Parse(System.String)",
            "M:Goo.Color.Rgb(System.Int32,System.Int32,System.Int32)",
            "M:Goo.Color.Rgba(System.Int32,System.Int32,System.Int32,System.Int32)",
            "M:Goo.Color.TryParse(System.String)",
            "M:Goo.Color.WithAlpha(System.Double)",
            "M:Goo.Color.op_Implicit(Goo.Color)~Goo.Edges{Goo.Color}",
            "M:Goo.Color.op_Implicit(System.String)~Goo.Color",
            "M:Goo.Command.#ctor(System.Action,System.Func{System.Boolean})",
            "M:Goo.Command.Execute",
            "M:Goo.VectorAsset.#ctor(System.Double,System.Double,System.Double,System.Double,Goo.VectorNode[])",
            "M:Goo.VectorAsset.NodeAt(System.Int32)",
            "M:Goo.VectorAsset.PathForNode(System.Int32)",
            "M:Goo.VectorAsset.Render",
            "M:Goo.VectorAsset.Render(System.String)",
            "M:Goo.VectorNode.#ctor(Goo.VectorNode[])",
            "M:Goo.VectorNode.#ctor(Goo.VectorPath)",
            "M:Goo.VectorNode.#ctor(Goo.VectorPath,Goo.VectorNodeStyle)",
            "M:Goo.VectorNode.#ctor(Goo.VectorPath,Goo.VectorNodeStyle,Goo.VectorNode[])",
            "M:Goo.VectorNodeStyle.#ctor",
            "M:Goo.VectorPaint.#ctor(Goo.Color)",
            "M:Goo.VectorPaint.#ctor(Goo.Gradient)",
            "M:Goo.VectorStroke.#ctor(System.Double,Goo.Color)",
            "M:Goo.VectorStroke.#ctor(System.Double,Goo.VectorPaint)",
            "M:Goo.VectorStroke.#ctor(System.Double,Goo.VectorPaint,Goo.StrokeCap,Goo.StrokeJoin,System.Double,Goo.DashPattern)",
            "M:Goo.DevTools.Attach(Goo.Window)",
            "M:Goo.DevTools.Attach(Goo.Window,System.Boolean)",
            "M:Goo.Container.#ctor",
            "M:Goo.Container.Add(Goo.Blob)",
            "M:Goo.DashPattern.#ctor(System.Double[],System.Double)",
            "M:Goo.DragData.#ctor(System.Object,Goo.DragEffect)",
            "M:Goo.DragData.#ctor(System.Object,Goo.DragEffect,Goo.NativeFileDrag)",
            "M:Goo.NativeFileDrag.#ctor(System.Collections.Generic.IReadOnlyList{System.String})",
            "M:Goo.NativeFileDrag.TryCreate(System.Collections.Generic.IReadOnlyList{System.String},Goo.NativeFileDrag@)",
            "M:Goo.DragSource.#ctor(System.Func{Goo.DragStartEvent,Goo.DragData},System.Action{Goo.DragEndEvent})",
            "M:Goo.DropTarget.#ctor(System.Func{Goo.DragEvent,Goo.DragEffect},System.Action{Goo.DragEvent})",
            "M:Goo.DropTarget.#ctor(System.Func{Goo.DragEvent,Goo.DragEffect},System.Action{Goo.DragEvent},System.Boolean)",
            "M:Goo.EmbeddedWindowHost.AttachPresentation",
            "M:Goo.EmbeddedWindowHost.DetachPresentation",
            "M:Goo.EmbeddedWindowHost.Dispose",
            "M:Goo.EmbeddedWindowHost.RenderFrame(System.Double)",
            "M:Goo.EmbeddedWindowHost.Resize(System.Int32,System.Int32,System.Int32,System.Int32)",
            "M:Goo.EmbeddedWindowHost.Resume",
            "M:Goo.EmbeddedWindowHost.ServicePendingSubmission",
            "M:Goo.EmbeddedWindowHost.SetFocused(System.Boolean)",
            "M:Goo.EmbeddedWindowHost.Suspend",
            "M:Goo.EmbeddedWindowHost.UpdatePreferences(Goo.PlatformPreferences)",
            "M:Goo.ElementHandle.#ctor",
            "M:Goo.ElementHandle.BeginFocusScope(Goo.FocusScopeOptions)",
            "M:Goo.ElementHandle.Blur",
            "M:Goo.ElementHandle.Activate",
            "M:Goo.ElementHandle.BeginPress",
            "M:Goo.ElementHandle.EndPress(System.Boolean)",
            "M:Goo.ElementHandle.Focus",
            "M:Goo.ElementHandle.JumpTo(System.Double,System.Double)",
            "M:Goo.ElementHandle.ScrollIntoView",
            "M:Goo.ElementHandle.ScrollToItem(System.String)",
            "M:Goo.ElementHandle.ScrollTo(System.Double,System.Double)",
            "M:Goo.ElementHandle.SetTextInputArea(Goo.ElementRect)",
            "M:Goo.ElementHandle.TryCopyTextRangeRects(Goo.TextRange,Goo.TextCoordinateSpace,System.Span{Goo.ElementRect},System.Int32@)",
            "M:Goo.ElementHandle.TryGetTextCaretRect(Goo.TextPosition,Goo.TextCoordinateSpace,Goo.ElementRect@)",
            "M:Goo.ElementHandle.TryGetTextPositionAt(Goo.Point,Goo.TextCoordinateSpace,Goo.TextPosition@)",
            "M:Goo.Edges`1.#ctor(`0)",
            "M:Goo.Edges`1.#ctor(`0,`0)",
            "M:Goo.Edges`1.#ctor(`0,`0,`0)",
            "M:Goo.Edges`1.#ctor(`0,`0,`0,`0)",
            "M:Goo.Edges.#ctor(Goo.Length)",
            "M:Goo.Edges.#ctor(Goo.Length,Goo.Length)",
            "M:Goo.Edges.#ctor(Goo.Length,Goo.Length,Goo.Length)",
            "M:Goo.Edges.#ctor(Goo.Length,Goo.Length,Goo.Length,Goo.Length)",
            "M:Goo.Edges.op_Implicit(System.Double)~Goo.Edges",
            "M:Goo.Edges.op_Implicit(System.Int32)~Goo.Edges",
            "M:Goo.FontSource.#ctor(System.String,System.Int32,System.Boolean,System.Byte[])",
            "M:Goo.FontSource.#ctor(System.String,System.Int32,System.Boolean,System.Byte[],System.UInt32,Goo.FontVariation[])",
            "M:Goo.FontSource.Dispose",
            "M:Goo.FontSource.FromPath(System.String,System.Int32,System.Boolean,System.String)",
            "M:Goo.FontSource.FromPath(System.String,System.Int32,System.Boolean,System.String,System.UInt32,Goo.FontVariation[])",
            "M:Goo.FontSource.Register",
            "M:Goo.FontVariation.#ctor(System.String,System.Single)",
            "M:Goo.Image.#ctor",
            "M:Goo.ImageDecodeLimits.#ctor",
            "M:Goo.ExternalImage.Dispose",
            "M:Goo.ExternalImageSession.Open(Goo.Window)",
            "M:Goo.ExternalImageSession.ImportVulkan(Goo.VulkanExternalImageDescription)",
            "M:Goo.ExternalImageSession.ImportAndroidHardwareBuffer(System.IntPtr)",
            "M:Goo.ExternalImageSession.ImportMetalTexture(System.IntPtr)",
            "M:Goo.ExternalImageSession.ImportMetalIoSurface(System.IntPtr,System.Int32)",
            "M:Goo.ExternalImageSession.CreateSource",
            "M:Goo.ExternalImageSession.Dispose",
            "M:Goo.ExternalImageSource.Acquire",
            "M:Goo.ExternalImageSource.Publish(Goo.ExternalImage,Goo.ExternalFrameDescription,Goo.ExternalImageSync,System.Action{Goo.ExternalFrameResult})",
            "M:Goo.ExternalImageSource.Dispose",
            "M:Goo.ExternalImageSync.#ctor",
            "M:Goo.VulkanExternalImageDescription.#ctor",
            "M:Goo.ImageSourceCache.#ctor(System.Int32,System.Int32,Goo.ImageDecodeLimits)",
            "M:Goo.ImageSourceCache.LoadAsync(System.String)",
            "M:Goo.ImageSourceCache.LoadAsync(System.String,System.Threading.CancellationToken)",
            "M:Goo.ImageSourceCache.Dispose",
            "M:Goo.Images.ImageVariant.#ctor(System.String,System.Single)",
            "M:Goo.Images.ImageVariants.#ctor(System.Collections.Generic.IReadOnlyList{Goo.Images.ImageVariant},Goo.ImageDecodeLimits)",
            "M:Goo.Images.ImageVariants.LoadAsync(Goo.WindowMetrics,System.Threading.CancellationToken)",
            "M:Goo.Images.ImageVariants.Dispose",
            "M:Goo.ImageSource.#ctor(System.Int32,System.Int32,System.Byte[])",
            "M:Goo.ImageSource.Acquire",
            "M:Goo.ImageSourceProvider.Acquire",
            "M:Goo.ImageSource.Dispose",
            "M:Goo.ImageSource.Transfer(System.Int32,System.Int32,System.Byte[],System.Action)",
            "M:Goo.ImageSource.Decode(System.ReadOnlyMemory{System.Byte})",
            "M:Goo.ImageSource.Decode(System.ReadOnlyMemory{System.Byte},System.Threading.CancellationToken)",
            "M:Goo.ImageSource.Decode(System.ReadOnlyMemory{System.Byte},Goo.ImageDecodeLimits,System.Threading.CancellationToken)",
            "M:Goo.ImageSource.Decode(System.IO.Stream)",
            "M:Goo.ImageSource.Decode(System.IO.Stream,System.Threading.CancellationToken)",
            "M:Goo.ImageSource.Decode(System.IO.Stream,Goo.ImageDecodeLimits,System.Threading.CancellationToken)",
            "M:Goo.ImageSource.DecodeColorManaged(System.ReadOnlyMemory{System.Byte},Goo.ImageDecodeLimits,System.Threading.CancellationToken)",
            "M:Goo.ImageColorProfile.ToSrgb(System.ReadOnlyMemory{System.Byte},System.Span{System.Byte},System.Boolean,System.Threading.CancellationToken)",
            "M:Goo.ImageSource.LoadThumbnail(System.String,System.Int32,System.Int32)",
            "M:Goo.ImageSource.LoadThumbnail(System.String,System.Int32,System.Int32,System.Threading.CancellationToken)",
            "M:Goo.ImageSource.LoadThumbnail(System.String,System.Int32,System.Int32,Goo.ImageDecodeLimits,System.Threading.CancellationToken)",
            "M:Goo.ImageSourceLease.#ctor",
            "M:Goo.ImageSourceLease.Complete(Goo.ImageSource)",
            "M:Goo.ImageSourceLease.Dispose",
            "M:Goo.ImageSourceLease.Fail",
            "M:Goo.Length.Percent(System.Double)",
            "M:Goo.Length.Pixels(System.Double)",
            "M:Goo.Length.op_Implicit(Goo.Length)~Goo.Edges",
            "M:Goo.Length.op_Implicit(System.Double)~Goo.Length",
            "M:Goo.Length.op_Implicit(System.Int32)~Goo.Length",
            "M:Goo.LinearGradient.#ctor(Goo.Color[])",
            "M:Goo.LinearGradient.#ctor(System.Double,Goo.Color[])",
            "M:Goo.LinearGradient.#ctor(System.Double,Goo.GradientStop[])",
            "M:Goo.PathBuilder.#ctor",
            "M:Goo.PathBuilder.#ctor(System.Double,System.Double,System.Double,System.Double)",
            "M:Goo.PathBuilder.ArcTo(System.Double,System.Double,System.Double,System.Boolean,System.Boolean,System.Double,System.Double)",
            "M:Goo.PathBuilder.Build",
            "M:Goo.PathBuilder.Close",
            "M:Goo.PathBuilder.CubicTo(System.Double,System.Double,System.Double,System.Double,System.Double,System.Double)",
            "M:Goo.PathBuilder.LineTo(System.Double,System.Double)",
            "M:Goo.PathBuilder.MoveTo(System.Double,System.Double)",
            "M:Goo.PathBuilder.Polyline(Goo.Point[],System.Boolean)",
            "M:Goo.PathBuilder.QuadraticTo(System.Double,System.Double,System.Double,System.Double)",
            "M:Goo.PlatformInput.CancelComposition",
            "M:Goo.PlatformInput.ClearFocus",
            "M:Goo.PlatformInput.CommitText(System.String)",
            "M:Goo.PlatformInput.DeleteSurroundingText(System.Int32,System.Int32)",
            "M:Goo.PlatformInput.Execute(Goo.TextCommand)",
            "M:Goo.PlatformInput.FinishComposition",
            "M:Goo.PlatformInput.FocusLost",
            "M:Goo.PlatformInput.CancelDrag",
            "M:Goo.PlatformInput.BeginDrag(Goo.ElementHandle,Goo.KeyModifiers)",
            "M:Goo.PlatformInput.UpdateDrag(Goo.ElementHandle,Goo.KeyModifiers)",
            "M:Goo.PlatformInput.DropDrag",
            "M:Goo.PlatformInput.KeyPress(Goo.Key,Goo.KeyModifiers)",
            "M:Goo.PlatformInput.KeyRelease(Goo.Key)",
            "M:Goo.PlatformInput.KeyRelease(Goo.Key,Goo.KeyModifiers)",
            "M:Goo.PlatformInput.MoveFocus(System.Boolean)",
            "M:Goo.PlatformInput.PointerCancel(System.Int64,Goo.PointerDevice)",
            "M:Goo.PlatformInput.PointerMove(System.Int64,Goo.PointerDevice,System.Single,System.Single,Goo.KeyModifiers,System.Single)",
            "M:Goo.PlatformInput.PointerPress(System.Int64,Goo.PointerDevice,System.Single,System.Single,Goo.PointerButton,Goo.KeyModifiers,System.Single)",
            "M:Goo.PlatformInput.PointerRelease(System.Int64,Goo.PointerDevice,System.Single,System.Single,Goo.PointerButton,Goo.KeyModifiers,System.Single)",
            "M:Goo.PlatformInput.PointerWheel(System.Single,System.Single,System.Single,System.Single,Goo.KeyModifiers)",
            "M:Goo.PlatformInput.SetComposition(System.String,System.Int32,System.Int32)",
            "M:Goo.PlatformInput.SetCompositionRange(System.Int32,System.Int32)",
            "M:Goo.PlatformInput.SetSelection(System.Int32,System.Int32)",
            "M:Goo.PointerEvent.Capture",
            "M:Goo.PointerEvent.PreventDefault",
            "M:Goo.PointerEvent.ReleaseCapture",
            "M:Goo.PointerEvent.StopPropagation",
            "M:Goo.Portal.#ctor",
            "M:Goo.Portal.Add(Goo.Blob)",
            "M:Goo.PopupWindow.#ctor(Goo.Window,Goo.Cell,Goo.PopupKind)",
            "M:Goo.PopupWindow.#ctor(Goo.PopupWindow,Goo.Cell,Goo.PopupKind)",
            "M:Goo.PopupWindow.Open(Goo.ElementRect,System.Int32,System.Int32,Goo.PortalPlacement)",
            "M:Goo.PopupWindow.UpdatePlacement(Goo.ElementRect,System.Int32,System.Int32,Goo.PortalPlacement)",
            "M:Goo.PopupWindow.Close",
            "M:Goo.PopupWindow.Dispose",
            "M:Goo.KeyEvent.PreventDefault",
            "M:Goo.KeyEvent.StopPropagation",
            "M:Goo.FocusEvent.StopPropagation",
            "M:Goo.FocusScope.Dispose",
            "M:Goo.FocusScope.Dispose(System.Boolean)",
            "M:Goo.FocusScopeOptions.#ctor",
            "M:Goo.WheelEvent.PreventDefault",
            "M:Goo.WheelEvent.StopPropagation",
            "M:Goo.RadialGradient.#ctor(Goo.Color[])",
            "M:Goo.RadialGradient.#ctor(System.Double,System.Double,System.Double,Goo.GradientStop[])",
            "M:Goo.Scrollbar.#ctor",
            "M:Goo.ShaderEffect.#ctor(Goo.ShaderEffectProgram,System.Boolean,System.Single,System.Single)",
            "M:Goo.ShaderEffect.SetParameter(System.Int32,System.Numerics.Vector4)",
            "M:Goo.ShaderEffect.SetData(System.Int32,Goo.ShaderEffectData)",
            "M:Goo.ShaderEffectProgram.#ctor(System.Byte[],System.Boolean)",
            "M:Goo.ShaderEffectProgram.Load(System.String)",
            "M:Goo.ShaderEffectData.#ctor(System.Byte[])",
            "M:Goo.ShaderEffectData.Dispose",
            "M:Goo.ShaderEffectData.Publish(System.Byte[])",
            "M:Goo.ShaderEffectData.PublishTransferred(System.Byte[],System.Action)",
            "M:Goo.ShaderEffectData.Transfer(System.Byte[],System.Action)",
            "M:Goo.Shape.#ctor",
            "M:Goo.Simulation.Done(System.Double)",
            "M:Goo.Simulation.Position(System.Double)",
            "M:Goo.Simulation.Velocity(System.Double)",
            "M:Goo.MotionConverter`1.#ctor(System.Int32,System.Action{`0,System.Double[]},System.Func{System.Double[],`0})",
            "M:Goo.Motion.Tween(System.Double,Goo.Easing)",
            "M:Goo.MotionVelocity.Add(Goo.MotionVelocity)",
            "M:Goo.MotionVelocity.Components(System.Double[])",
            "M:Goo.MotionVelocity.Uniform(System.Double)",
            "M:Goo.SoundPlayback.Dispose",
            "M:Goo.SoundPlayback.Stop",
            "M:Goo.SoundPlayer.Dispose",
            "M:Goo.SoundPlayer.TryPlay(Goo.SoundSource,System.Single)",
            "M:Goo.SoundPlayer.StopAll",
            "M:Goo.SoundPlayer.TryOpen",
            "M:Goo.SoundPlayer.TryOpen(Goo.SoundOutputDevice)",
            "M:Goo.SoundPlayer.EnumerateOutputDevices",
            "M:Goo.SoundOutputDevices.Dispose",
            "M:Goo.SoundPlayer.TryPlay(Goo.SoundStreamSource,System.Single)",
            "M:Goo.SoundPlayback.Pause",
            "M:Goo.SoundPlayback.Resume",
            "M:Goo.SoundStreamSource.#ctor(System.Int32,System.Int32,System.Func{System.Single[],System.Int32,System.Int32})",
            "M:Goo.SoundSource.#ctor(System.Int32,System.Int32,System.Single[])",
            "M:Goo.SoundSource.FromWav(System.Byte[])",
            "M:Goo.SoundSource.LoadWav(System.IO.Stream)",
            "M:Goo.SystemSounds.TryPlay(Goo.SystemSound)",
            "M:Goo.Style.#ctor",
            "M:Goo.Svg.SvgParseException.#ctor(System.String,System.Exception)",
            "M:Goo.Svg.Svg.Parse(System.String)",
            "M:Goo.Svg.Svg.Load(System.IO.Stream)",
            "M:Goo.Svg.Svg.Load(System.String)",
            "M:Goo.PathBuilder.Reset",
            "M:Goo.ShaderEffectData.Publish``1(System.ReadOnlySpan{``0})",
            "M:Goo.Text.#ctor",
            "M:Goo.Text.#ctor(System.String)",
            "M:Goo.TextDocument.#ctor",
            "M:Goo.TextDocument.#ctor(System.String)",
            "M:Goo.TextDocument.Apply(Goo.TextChange)",
            "M:Goo.TextDocument.ApplyTransaction(Goo.TextChange[])",
            "M:Goo.TextDocument.BeginUndoGroup",
            "M:Goo.TextDocument.BreakUndoGroup",
            "M:Goo.TextDocument.EndUndoGroup",
            "M:Goo.TextDocument.GetLineIndex(System.Int32)",
            "M:Goo.TextDocument.GetLineRange(System.Int32)",
            "M:Goo.TextDocument.GetLineText(System.Int32)",
            "M:Goo.TextDocument.GetText",
            "M:Goo.TextDocument.GetText(Goo.TextRange)",
            "M:Goo.TextDocument.Redo",
            "M:Goo.TextDocument.Snapshot",
            "M:Goo.TextDocument.Undo",
            "M:Goo.TextEditor.#ctor(Goo.TextEditorController)",
            "M:Goo.TextEditor.#ctor(Goo.TextEditorController,Goo.TextPresentationLayer[])",
            "M:Goo.TextEditorController.#ctor(Goo.TextDocument)",
            "M:Goo.TextEditorController.Blur",
            "M:Goo.TextEditorController.BreakUndoGroup",
            "M:Goo.TextEditorController.CommitComposition",
            "M:Goo.TextEditorController.CommitComposition(System.String)",
            "M:Goo.TextEditorController.Copy",
            "M:Goo.TextEditorController.Cut",
            "M:Goo.TextEditorController.Dispose",
            "M:Goo.TextEditorController.Execute(Goo.TextCommand)",
            "M:Goo.TextEditorController.Focus",
            "M:Goo.TextEditorController.ScrollTo(System.Double,System.Double)",
            "M:Goo.TextEditorController.UpdateComposition(System.String,System.Int32,System.Int32)",
            "M:Goo.TextEntry.#ctor",
            "M:Goo.TextInputOptions.#ctor",
            "M:Goo.TextPresentationLayer.#ctor(Goo.TextDocument)",
            "M:Goo.TextPresentationLayer.Clear",
            "M:Goo.TextPresentationLayer.Dispose",
            "M:Goo.TextPresentationLayer.Remove(System.String)",
            "M:Goo.TextPresentationLayer.RemoveProjection(System.String)",
            "M:Goo.TextPresentationLayer.RemoveStyle(System.String)",
            "M:Goo.TextPresentationLayer.ReplaceStyles(System.Collections.Generic.IReadOnlyList{Goo.TextStyleSpan})",
            "M:Goo.TextPresentationLayer.SetBlockSlot(System.String,Goo.TextRange,Goo.Blob)",
            "M:Goo.TextPresentationLayer.SetHiddenRange(System.String,Goo.TextRange)",
            "M:Goo.TextPresentationLayer.SetInlineSlot(System.String,Goo.TextRange,Goo.Blob)",
            "M:Goo.TextPresentationLayer.SetReplacement(System.String,Goo.TextRange,System.String)",
            "M:Goo.TextPresentationLayer.SetStyle(System.String,Goo.TextRange,Goo.Style)",
            "M:Goo.TextSnapshot.GetLineIndex(System.Int32)",
            "M:Goo.TextSnapshot.GetLineRange(System.Int32)",
            "M:Goo.TextSnapshot.GetLineText(System.Int32)",
            "M:Goo.TextSnapshot.GetText",
            "M:Goo.TextSnapshot.GetText(Goo.TextRange)",
            "M:Goo.Tokens.Get``1",
            "M:Goo.Tokens.Scope``2(``0,System.Func{``1})",
            "M:Goo.Window.#ctor",
            "M:Goo.Window.AccessibilityHitTest(System.Double,System.Double)",
            "M:Goo.Window.Attach(Goo.EmbeddedWindowHost)",
            "M:Goo.Window.ConfigureApplication(System.String,System.String,System.String)",
            "M:Goo.Window.DragRegion(Goo.Container)",
            "M:Goo.Window.GetClipboardText",
            "M:Goo.Window.GetClipboardFormats",
            "M:Goo.Window.ReadClipboardFiles",
            "M:Goo.Window.ReadClipboardImage",
            "M:Goo.Window.PerformAccessibilityAction(Goo.AccessibilityId,Goo.AccessibilityActionRequest)",
            "M:Goo.Window.Post(System.Action)",
            "M:Goo.Window.Open",
            "M:Goo.Window.Pump(System.Double)",
            "M:Goo.Window.RequestActivation",
            "M:Goo.Window.RequestClose",
            "M:Goo.Window.Run",
            "M:Goo.Window.SetClipboardText(System.String)",
            "M:Goo.Window.SetInterval(System.Action,System.Double)",
            "M:Goo.Window.SetTimeout(System.Action,System.Double)",
            "M:Goo.Window.TryPost(System.Action)",
            "M:Goo.WindowTimer.Dispose"
        }
        private let ExpectedProtectedMethodIds[]string = []string{
            "M:Goo.EmbeddedWindowHost.AllowInheritedCompositeAlpha",
            "M:Goo.EmbeddedWindowHost.CreateVulkanSurface(System.IntPtr,System.UInt64@)",
            "M:Goo.EmbeddedWindowHost.DestroyVulkanSurface(System.IntPtr,System.UInt64)",
            "M:Goo.EmbeddedWindowHost.GetClipboardText",
            "M:Goo.EmbeddedWindowHost.GetNativeHandle",
            "M:Goo.EmbeddedWindowHost.GetVulkanGetInstanceProcAddr",
            "M:Goo.EmbeddedWindowHost.GetVulkanInstanceExtensions",
            "M:Goo.EmbeddedWindowHost.LoadVulkanLibrary",
            "M:Goo.EmbeddedWindowHost.PreferRequestedFramebufferExtent",
            "M:Goo.EmbeddedWindowHost.RequestFrame",
            "M:Goo.EmbeddedWindowHost.SetClipboardText(System.String)",
            "M:Goo.EmbeddedWindowHost.SetCursor(Goo.Cursor)",
            "M:Goo.EmbeddedWindowHost.SetImeArea(System.Int32,System.Int32,System.Int32,System.Int32,System.Int32)",
            "M:Goo.EmbeddedWindowHost.StartTextInput",
            "M:Goo.EmbeddedWindowHost.StopTextInput",
            "M:Goo.EmbeddedWindowHost.UnloadVulkanLibrary"
        }
        private let ExpectedEqualityDocumentationIds[]string = []string{
            "M:Goo.VectorPath.Equals(Goo.VectorPath)",
            "M:Goo.VectorPath.Equals(System.Object)",
            "M:Goo.VectorPath.GetHashCode",
            "M:Goo.FontVariation.Deconstruct(System.String@,System.Single@)",
            "M:Goo.FontVariation.Equals(Goo.FontVariation)",
            "M:Goo.FontVariation.Equals(System.Object)",
            "M:Goo.FontVariation.GetHashCode",
            "M:Goo.FontVariation.ToString",
            "M:Goo.FontVariation.op_Equality(Goo.FontVariation,Goo.FontVariation)",
            "M:Goo.FontVariation.op_Inequality(Goo.FontVariation,Goo.FontVariation)",
            "M:Goo.PanelTransform.Equals(Goo.PanelTransform)",
            "M:Goo.PanelTransform.op_Equality(Goo.PanelTransform,Goo.PanelTransform)",
            "M:Goo.PanelTransform.op_Inequality(Goo.PanelTransform,Goo.PanelTransform)"
        }
        private let ExpectedEnumFieldIds[]string = []string{
            "F:Goo.RichText.RichTextStatus.Success",
            "F:Goo.RichText.RichTextStatus.PlainText",
            "F:Goo.RichText.RichTextStatus.Unsupported",
            "F:Goo.RichText.RichTextStatus.UnsupportedContent",
            "F:Goo.RichText.RichTextStatus.Empty",
            "F:Goo.RichText.RichTextStatus.TooLarge",
            "F:Goo.RichText.RichTextStatus.ReadOnly",
            "F:Goo.RichText.RichTextStatus.Cancelled",
            "F:Goo.RichText.RichTextStatus.Stale",
            "F:Goo.RichText.RichTextStatus.Failed",
            "F:Goo.TrayStatus.Registered",
            "F:Goo.TrayStatus.NoHost",
            "F:Goo.TrayStatus.Unsupported",
            "F:Goo.TrayStatus.Closed",
            "F:Goo.TrayStatus.Failed",
            "F:Goo.NotificationPermission.NotDetermined",
            "F:Goo.NotificationPermission.Granted",
            "F:Goo.NotificationPermission.Denied",
            "F:Goo.NotificationPermission.Disabled",
            "F:Goo.NotificationPermission.Unknown",
            "F:Goo.NotificationPermission.Unsupported",
            "F:Goo.NotificationDelivery.Unknown",
            "F:Goo.NotificationDelivery.Accepted",
            "F:Goo.NotificationDelivery.PresentInCenter",
            "F:Goo.NotificationDelivery.Removed",
            "F:Goo.NotificationDelivery.Failed",
            "F:Goo.NotificationActivationSupport.None",
            "F:Goo.NotificationActivationSupport.WarmOnly",
            "F:Goo.NotificationActivationSupport.WarmAndCold",
            "F:Goo.NotificationStatus.Success",
            "F:Goo.NotificationStatus.Accepted",
            "F:Goo.NotificationStatus.PermissionRequired",
            "F:Goo.NotificationStatus.Denied",
            "F:Goo.NotificationStatus.Disabled",
            "F:Goo.NotificationStatus.MissingIdentity",
            "F:Goo.NotificationStatus.Unsupported",
            "F:Goo.NotificationStatus.Failed",
            "F:Goo.Gestures.GestureRotationStatus.Available",
            "F:Goo.Gestures.GestureRotationStatus.Unsupported",
            "F:Goo.Gestures.PanAxis.Both",
            "F:Goo.Gestures.PanAxis.Horizontal",
            "F:Goo.Gestures.PanAxis.Vertical",
            "F:Goo.Printing.PrintLayoutStatus.Cancelled",
            "F:Goo.Printing.PrintLayoutStatus.Failed",
            "F:Goo.Printing.PrintLayoutStatus.Ready",
            "F:Goo.Printing.PrintStatus.BudgetExceeded",
            "F:Goo.Printing.PrintStatus.Busy",
            "F:Goo.Printing.PrintStatus.Cancelled",
            "F:Goo.Printing.PrintStatus.DeviceLost",
            "F:Goo.Printing.PrintStatus.Exported",
            "F:Goo.Printing.PrintStatus.Failed",
            "F:Goo.Printing.PrintStatus.NotReady",
            "F:Goo.Printing.PrintStatus.Submitted",
            "F:Goo.Printing.PrintStatus.Unsupported",
            "F:Goo.SpellCheck.SpellingStatus.Cancelled",
            "F:Goo.SpellCheck.SpellingStatus.Disabled",
            "F:Goo.SpellCheck.SpellingStatus.Failed",
            "F:Goo.SpellCheck.SpellingStatus.LanguageUnavailable",
            "F:Goo.SpellCheck.SpellingStatus.Stale",
            "F:Goo.SpellCheck.SpellingStatus.Success",
            "F:Goo.SpellCheck.SpellingStatus.TooLarge",
            "F:Goo.SpellCheck.SpellingStatus.Unsupported",
            "F:Goo.GestureSource.Touch",
            "F:Goo.GestureSource.Trackpad",
            "F:Goo.GestureInputKind.Down",
            "F:Goo.GestureInputKind.Move",
            "F:Goo.GestureInputKind.Up",
            "F:Goo.GestureInputKind.Deadline",
            "F:Goo.WindowPlacementFields.None",
            "F:Goo.WindowPlacementFields.NormalSize",
            "F:Goo.WindowPlacementFields.Position",
            "F:Goo.WindowPlacementFields.State",
            "F:Goo.WindowPlacementFields.FullscreenDisplay",
            "F:Goo.GestureDecision.Pending",
            "F:Goo.GestureDecision.Accept",
            "F:Goo.GestureDecision.Recognize",
            "F:Goo.GestureDecision.Complete",
            "F:Goo.GestureDecision.Reject",
            "F:Goo.GesturePhase.Started",
            "F:Goo.GesturePhase.Changed",
            "F:Goo.GesturePhase.Completed",
            "F:Goo.GesturePhase.Canceled",
            "F:Goo.GestureCancelReason.None",
            "F:Goo.GestureCancelReason.LostArbitration",
            "F:Goo.GestureCancelReason.PointerCanceled",
            "F:Goo.GestureCancelReason.FocusLost",
            "F:Goo.GestureCancelReason.OwnerUnavailable",
            "F:Goo.GestureCancelReason.Replaced",
            "F:Goo.GestureCancelReason.Explicit",
            "F:Goo.GestureCancelReason.CallbackFailed",
            "F:Goo.InputPurpose.Text",
            "F:Goo.InputPurpose.Email",
            "F:Goo.InputPurpose.Url",
            "F:Goo.InputPurpose.Number",
            "F:Goo.InputPurpose.Decimal",
            "F:Goo.InputPurpose.Phone",
            "F:Goo.InputPurpose.Search",
            "F:Goo.InputPurpose.Password",
            "F:Goo.EnterAction.Done",
            "F:Goo.EnterAction.Go",
            "F:Goo.EnterAction.Next",
            "F:Goo.EnterAction.Search",
            "F:Goo.EnterAction.Send",
            "F:Goo.EnterAction.None",
            "F:Goo.MacOSBackdropMaterial.ContentBackground",
            "F:Goo.ClipboardIntent.Copy",
            "F:Goo.ClipboardIntent.Cut",
            "F:Goo.DataTransferStatus.Success",
            "F:Goo.DataTransferStatus.Cancelled",
            "F:Goo.DataTransferStatus.Unsupported",
            "F:Goo.DataTransferStatus.TooLarge",
            "F:Goo.DataTransferStatus.Denied",
            "F:Goo.DataTransferStatus.Failed",
            "F:Goo.MacOSBackdropMaterial.FullScreenUI",
            "F:Goo.MacOSBackdropMaterial.HeaderView",
            "F:Goo.MacOSBackdropMaterial.HudWindow",
            "F:Goo.MacOSBackdropMaterial.Menu",
            "F:Goo.MacOSBackdropMaterial.Popover",
            "F:Goo.MacOSBackdropMaterial.Selection",
            "F:Goo.MacOSBackdropMaterial.Sheet",
            "F:Goo.MacOSBackdropMaterial.Sidebar",
            "F:Goo.MacOSBackdropMaterial.Titlebar",
            "F:Goo.MacOSBackdropMaterial.ToolTip",
            "F:Goo.MacOSBackdropMaterial.UnderPageBackground",
            "F:Goo.MacOSBackdropMaterial.UnderWindowBackground",
            "F:Goo.MacOSBackdropMaterial.WindowBackground",
            "F:Goo.MacOSBackdropState.Active",
            "F:Goo.MacOSBackdropState.FollowWindow",
            "F:Goo.MacOSBackdropState.Inactive",
            "F:Goo.WindowsBackdropMaterial.Acrylic",
            "F:Goo.WindowsBackdropMaterial.Automatic",
            "F:Goo.WindowsBackdropMaterial.Mica",
            "F:Goo.WindowsBackdropMaterial.MicaAlt",
            "F:Goo.WindowBackdrop.None",
            "F:Goo.WindowBackdrop.Blur",
            "F:Goo.TextCommandKind.CancelEdit",
            "F:Goo.TextCommandKind.SelectWord",
            "F:Goo.TextCommandKind.SelectLine",
            "F:Goo.TextCommandKind.InsertTab",
            "F:Goo.ImageFit.Contain",
            "F:Goo.ImageFit.Cover",
            "F:Goo.ImageFit.Fill",
            "F:Goo.ImageFit.None",
            "F:Goo.NativeTransferCapabilities.None",
            "F:Goo.NativeTransferCapabilities.FileDrop",
            "F:Goo.NativeTransferCapabilities.DropPreview",
            "F:Goo.NativeTransferCapabilities.OutboundData",
            "F:Goo.NativeTransferCapabilities.EffectNegotiation",
            "F:Goo.NativeTransferCapabilities.DataDrop",
            "F:Goo.PortalPlacement.BottomStart",
            "F:Goo.PortalPlacement.Bottom",
            "F:Goo.PortalPlacement.BottomEnd",
            "F:Goo.PortalPlacement.TopStart",
            "F:Goo.PortalPlacement.Top",
            "F:Goo.PortalPlacement.TopEnd",
            "F:Goo.PortalPlacement.RightStart",
            "F:Goo.PortalPlacement.Right",
            "F:Goo.PortalPlacement.RightEnd",
            "F:Goo.PortalPlacement.LeftStart",
            "F:Goo.PortalPlacement.Left",
            "F:Goo.PortalPlacement.LeftEnd",
            "F:Goo.PopupKind.Menu",
            "F:Goo.PopupKind.Tooltip",
            "F:Goo.PopupStatus.Opened",
            "F:Goo.PopupStatus.Closed",
            "F:Goo.PopupStatus.Unsupported",
            "F:Goo.PopupStatus.RequiresUserAction",
            "F:Goo.PopupStatus.Failed",
            "F:Goo.PopupStatus.Busy",
            "F:Goo.PopupDismissReason.Programmatic",
            "F:Goo.PopupDismissReason.Escape",
            "F:Goo.PopupDismissReason.OutsideInteraction",
            "F:Goo.PopupDismissReason.FocusLost",
            "F:Goo.PopupDismissReason.OwnerHidden",
            "F:Goo.PopupDismissReason.OwnerClosed",
            "F:Goo.PopupDismissReason.PlatformDismissed"
        }
        private let SynthesizedPrimaryDataTypes HashSet[Type] = HashSet[Type]{
            typeof(Goo.RichText.RichTextResult),
            typeof(PanGestureEvent),
            typeof(GestureRotationResult),
            typeof(TransformGestureEvent),
            typeof(PressGestureEvent),
            typeof(TapGestureEvent),
            typeof(PrintResult),
            typeof(PrintPageSettings),
            typeof(PrintLayoutResult),
            typeof(Misspelling),
            typeof(SpellingResult),
            typeof(SpellingSuggestions),
            typeof(FocusedEditorSnapshot),
            typeof(GesturePointer),
            typeof(OffscreenRenderOptions),
            typeof(OffscreenRenderResult),
            typeof(OffscreenRenderSessionResult),
            typeof(NativeDialogOwnerResult),
            typeof(TextStyleProperties),
            typeof(TextChange),
            typeof(LayoutTransition),
            typeof(AccessibilityId),
            typeof(TextCommand),
            typeof(TextComposition),
            typeof(TextCompositionEvent),
            typeof(TextCandidateEvent),
            typeof(TextDocumentChange),
            typeof(TextPosition),
            typeof(TextRange),
            typeof(TextSelection),
            typeof(TextStyleRange),
            typeof(TextStyleSpan)
        }
        private let Shapes IReadOnlyDictionary[string, DocumentationShape] = Dictionary[string, DocumentationShape](
            StringComparer.Ordinal
        ){
            ["M:Goo.TrayIcon.Create(Goo.Window,Goo.TrayOptions)"] = DocumentationShape(
                []string{"owner", "options"}, System.Array.Empty[string](), true),
            ["M:Goo.TrayIcon.Update(Goo.TrayOptions)"] = DocumentationShape(
                []string{"options"}, System.Array.Empty[string](), true),
            ["M:Goo.ActivationArguments.Read(System.Collections.Generic.IReadOnlyList{System.String},System.String)"] = DocumentationShape(
                []string{"arguments", "workingDirectory"}, System.Array.Empty[string](), true),
            ["M:Goo.SingleInstance.AcquireAsync(System.String,Goo.ApplicationActivation,System.Int32)"] = DocumentationShape(
                []string{"applicationId", "activation", "timeoutMilliseconds"}, System.Array.Empty[string](), true),
            ["M:Goo.Placement.Restore(Goo.Window,Goo.WindowPlacement)"] = DocumentationShape(
                []string{"window", "saved"}, System.Array.Empty[string](), true),
            ["M:Goo.NotificationService.GetPermissionAsync"] = DocumentationShape(
                System.Array.Empty[string](), System.Array.Empty[string](), true),
            ["M:Goo.NotificationService.RequestPermissionAsync"] = DocumentationShape(
                System.Array.Empty[string](), System.Array.Empty[string](), true),
            ["M:Goo.NotificationService.ShowAsync(Goo.NotificationMessage)"] = DocumentationShape(
                []string{"message"}, System.Array.Empty[string](), true),
            ["M:Goo.NotificationService.GetStatusAsync(System.String)"] = DocumentationShape(
                []string{"id"}, System.Array.Empty[string](), true),
            ["M:Goo.NotificationService.RemoveAsync(System.String)"] = DocumentationShape(
                []string{"id"}, System.Array.Empty[string](), true),
            ["M:Goo.Notifications.Open(Goo.NotificationOptions)"] = DocumentationShape(
                []string{"options"}, System.Array.Empty[string](), true),
            ["M:Goo.Window.CapturePlacement"] = DocumentationShape(System.Array.Empty[string](), System.Array.Empty[string](), true),
            ["M:Goo.Window.ApplyPlacement(Goo.WindowPlacement)"] = DocumentationShape([]string{"value"}, System.Array.Empty[string](), true),
            ["M:Goo.NativeDialogs.ShowMessageBoxAsync(Goo.Window,Goo.MessageBoxOptions)"] = DocumentationShape(
                []string{"owner", "options"}, System.Array.Empty[string](), true),
            ["M:Goo.NativeMenuBar.#ctor(Goo.Window)"] = DocumentationShape(
                []string{"owner"}, System.Array.Empty[string](), false),
            ["M:Goo.NativeMenuBar.SetItems(System.Collections.Generic.IReadOnlyList{Goo.NativeMenuItem})"] = DocumentationShape(
                []string{"items"}, System.Array.Empty[string](), true),
            ["M:Goo.NativeMenus.ShowContextMenuAsync(Goo.Window,Goo.Point,System.Collections.Generic.IReadOnlyList{Goo.NativeMenuItem})"] = DocumentationShape(
                []string{"owner", "point", "items"}, System.Array.Empty[string](), true),
            ["M:Goo.Window.InitializeApplicationActivation(Goo.ApplicationActivation)"] = DocumentationShape(
                []string{"initial"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Window.CreateOffscreenSession"] = DocumentationShape(
                System.Array.Empty[string](),
                System.Array.Empty[string](),
                true
            ),
            [
                "M:Goo.Window.RenderOffscreenAsync(Goo.Cell,Goo.OffscreenRenderOptions,System.Threading.CancellationToken,Goo.WindowCapture)"
            ] = DocumentationShape(
                []string{"root", "options", "cancellation", "reusable"},
                System.Array.Empty[string](),
                true
            ),
            [
                "M:Goo.OffscreenRenderSession.RenderAsync(Goo.Cell,Goo.OffscreenRenderOptions,System.Threading.CancellationToken,Goo.WindowCapture)"
            ] = DocumentationShape(
                []string{"root", "options", "cancellation", "reusable"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Window.PostApplicationActivation(Goo.ApplicationActivation)"] = DocumentationShape(
                []string{"value"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.ElementHandle.CancelGestures"] = DocumentationShape(
                System.Array.Empty[string](),
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.WindowBackdropMask.#ctor(System.Int32,System.Int32,System.Byte[])"] = DocumentationShape(
                []string{"width", "height", "alpha"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.TextPresentationLayer.GetStyles"] = DocumentationShape(
                System.Array.Empty[string](), System.Array.Empty[string](), true
            ),
            ["M:Goo.TextPresentationLayer.ApplyTransaction(Goo.TextChange[],System.Collections.Generic.IReadOnlyList{Goo.TextStyleSpan})"] = DocumentationShape(
                []string{"changes", "styles"}, System.Array.Empty[string](), true
            ),
            ["M:Goo.TextEditorController.ReplaceSelection(Goo.TextPresentationLayer,System.String,System.Collections.Generic.IReadOnlyList{Goo.TextStyleSpan})"] = DocumentationShape(
                []string{"layer", "text", "fragmentRelativeStyles"}, System.Array.Empty[string](), true
            ),
            ["M:Goo.Style.TryGetTextStyle(Goo.TextStyleProperties@)"] = DocumentationShape(
                []string{"properties"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Window.AcquireNativeDialogOwnerAsync(System.Threading.CancellationToken)"] = DocumentationShape(
                []string{"cancellation"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.TransferRepresentation.#ctor(System.String,System.ReadOnlyMemory{System.Byte})"] =
                DocumentationShape([]string{"contentType", "bytes"}, Array.Empty[string](), false),
            ["M:Goo.TransferData.#ctor(System.Collections.Generic.IReadOnlyList{Goo.TransferRepresentation},"
                + "System.Collections.Generic.IReadOnlyList{System.Uri})"] =
                DocumentationShape([]string{"representations", "uris"}, Array.Empty[string](), false),
            ["M:Goo.Window.ReadClipboardDataAsync(System.Collections.Generic.IReadOnlyList{System.String})"] =
                DocumentationShape([]string{"contentTypes"}, Array.Empty[string](), true),
            ["M:Goo.Window.WriteClipboardAsync(Goo.TransferData,Goo.ClipboardIntent)"] =
                DocumentationShape([]string{"data", "intent"}, Array.Empty[string](), true),
            ["M:Goo.Window.SetNativeDataDropFormats(System.Collections.Generic.IReadOnlyList{System.String})"] =
                DocumentationShape([]string{"formats"}, Array.Empty[string](), true),
            ["M:Goo.AccessibilityActionRequest.Scroll(System.Double,System.Double)"] = DocumentationShape(
                []string{"x", "y"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.Window.AccessibilityHitTest(System.Double,System.Double)"] = DocumentationShape(
                []string{"x", "y"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.AccessibilityActionRequest.SetSelection(System.Int32,System.Int32)"] = DocumentationShape(
                []string{"start", "length"},
                System.Array.Empty[string](),
                false
            ),
            [
                "M:Goo.AccessibilityActionRequest.SetSelection(System.Int32,System.Int32,System.Int32)"
            ] = DocumentationShape([]string{"start", "length", "caret"}, System.Array.Empty[string](), false),
            ["M:Goo.NativeAccessibilityAdapter.Update(Goo.AccessibilityTree)"] = DocumentationShape(
                []string{"tree"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.AccessibilityActionRequest.SetValue(System.String)"] = DocumentationShape(
                []string{"value"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.AccessibilityActionRequest.#ctor(Goo.AccessibilityAction)"] = DocumentationShape(
                []string{"action"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.AccessibilityAdapter.Update(Goo.AccessibilityTree)"] = DocumentationShape(
                []string{"tree"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.DragData.#ctor(System.Object,Goo.DragEffect)"] = DocumentationShape(
                []string{"value", "allowedEffects"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.DragData.#ctor(System.Object,Goo.DragEffect,Goo.NativeFileDrag)"] = DocumentationShape(
                []string{"value", "allowedEffects", "nativeFiles"},
                System.Array.Empty[string](),
                false
            ),
            [
                "M:Goo.NativeFileDrag.#ctor(System.Collections.Generic.IReadOnlyList{System.String})"
            ] = DocumentationShape([]string{"values"}, System.Array.Empty[string](), false),
            [
                "M:Goo.NativeFileDrag.TryCreate(System.Collections.Generic.IReadOnlyList{System.String},Goo.NativeFileDrag@)"
            ] = DocumentationShape([]string{"values", "result"}, System.Array.Empty[string](), true),
            [
                "M:Goo.DragSource.#ctor(System.Func{Goo.DragStartEvent,Goo.DragData},System.Action{Goo.DragEndEvent})"
            ] = DocumentationShape([]string{"create", "end"}, System.Array.Empty[string](), false),
            [
                "M:Goo.DropTarget.#ctor(System.Func{Goo.DragEvent,Goo.DragEffect},System.Action{Goo.DragEvent})"
            ] = DocumentationShape([]string{"query", "changed"}, System.Array.Empty[string](), false),
            [
                "M:Goo.DropTarget.#ctor(System.Func{Goo.DragEvent,Goo.DragEffect},System.Action{Goo.DragEvent},System.Boolean)"
            ] = DocumentationShape(
                []string{"query", "changed", "stopAncestorRouting"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.PlatformInput.CancelDrag"] = DocumentationShape(
                System.Array.Empty[string](),
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.PlatformInput.UpdateDrag(Goo.ElementHandle,Goo.KeyModifiers)"] = DocumentationShape(
                System.Array.Empty[string](),
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.PlatformInput.DropDrag"] = DocumentationShape(
                System.Array.Empty[string](),
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.ElementHandle.EndPress(System.Boolean)"] = DocumentationShape(
                []string{"activate"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.ElementHandle.Activate"] = DocumentationShape(
                System.Array.Empty[string](),
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.ElementHandle.BeginPress"] = DocumentationShape(
                System.Array.Empty[string](),
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Anim`1.Seek(System.Double)"] = DocumentationShape(
                []string{"elapsedMs"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.Anim`1.Set(`0)"] = DocumentationShape([]string{"value"}, System.Array.Empty[string](), false),
            ["M:Goo.Anim`1.Snap(`0)"] = DocumentationShape([]string{"value"}, System.Array.Empty[string](), false),
            ["M:Goo.Anim`1.To(`0)"] = DocumentationShape([]string{"target"}, System.Array.Empty[string](), false),
            [
                "M:Goo.Anim`1.To(`0,System.Func{System.Double,System.Double,System.Double,Goo.Simulation},System.Func{System.Double,System.Double,System.Double,Goo.Simulation}[])"
            ] = DocumentationShape([]string{"target", "spec", "specs"}, System.Array.Empty[string](), false),
            ["M:Goo.Anim`1.To(`0,Goo.MotionVelocity)"] = DocumentationShape(
                []string{"target", "velocity"},
                System.Array.Empty[string](),
                false
            ),
            [
                "M:Goo.Anim`1.To(`0,Goo.MotionVelocity,System.Func{System.Double,System.Double,System.Double,Goo.Simulation},System.Func{System.Double,System.Double,System.Double,Goo.Simulation}[])"
            ] = DocumentationShape(
                []string{"target", "velocity", "spec", "specs"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.Button.Add(Goo.Blob)"] = DocumentationShape([]string{"child"}, System.Array.Empty[string](), false),
            ["M:Goo.Cell.Animate(Goo.Color)"] = DocumentationShape(
                []string{"initial"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Cell.Animate(Goo.Color,System.Action{Goo.Color})"] = DocumentationShape(
                []string{"initial", "onChange"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Cell.Animate(Goo.Length)"] = DocumentationShape(
                []string{"initial"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Cell.Animate(Goo.Length,System.Action{Goo.Length})"] = DocumentationShape(
                []string{"initial", "onChange"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Cell.Animate(Goo.Point)"] = DocumentationShape(
                []string{"initial"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Cell.Animate(Goo.Point,System.Action{Goo.Point})"] = DocumentationShape(
                []string{"initial", "onChange"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Cell.Animate(System.Double)"] = DocumentationShape(
                []string{"initial"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Cell.Animate(System.Double,System.Action{System.Double})"] = DocumentationShape(
                []string{"initial", "onChange"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Cell.Animate``1(``0,Goo.MotionConverter{``0})"] = DocumentationShape(
                []string{"initial", "converter"},
                []string{"T"},
                true
            ),
            ["M:Goo.Cell.Animate``1(``0,Goo.MotionConverter{``0},System.Action{``0})"] = DocumentationShape(
                []string{"initial", "converter", "onChange"},
                []string{"T"},
                true
            ),
            ["M:Goo.Cell.Build"] = DocumentationShape(System.Array.Empty[string](), System.Array.Empty[string](), true),
            ["M:Goo.Cell`1.Build(`0)"] = DocumentationShape([]string{"input"}, System.Array.Empty[string](), true),
            ["M:Goo.Cell.Mount``1"] = DocumentationShape(System.Array.Empty[string](), []string{"TCell"}, true),
            ["M:Goo.Cell.Mount``1(System.Func{``0},System.String)"] = DocumentationShape(
                []string{"factory", "key"},
                []string{"TCell"},
                true
            ),
            ["M:Goo.Cell.Mount``1(System.String)"] = DocumentationShape([]string{"key"}, []string{"TCell"}, true),
            ["M:Goo.Cell.Mount``1(System.String,System.Action{``0})"] = DocumentationShape(
                []string{"key", "configure"},
                []string{"TCell"},
                true
            ),
            ["M:Goo.Cell.Mount``2(System.String,``0)"] = DocumentationShape(
                []string{"key", "input"},
                []string{"TInput", "TCell"},
                true
            ),
            ["M:Goo.Cell.MountSeeded``1(System.String,System.Action{``0},System.Action{``0})"] = DocumentationShape(
                []string{"key", "seed", "configure"},
                []string{"TCell"},
                true
            ),
            [
                "M:Goo.Color.FromNormalized(System.Single,System.Single,System.Single,System.Single)"
            ] = DocumentationShape([]string{"r", "g", "b", "a"}, System.Array.Empty[string](), true),
            ["M:Goo.Color.Parse(System.String)"] = DocumentationShape(
                []string{"value"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Color.Rgb(System.Int32,System.Int32,System.Int32)"] = DocumentationShape(
                []string{"r", "g", "b"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Color.Rgba(System.Int32,System.Int32,System.Int32,System.Int32)"] = DocumentationShape(
                []string{"r", "g", "b", "a"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Color.TryParse(System.String)"] = DocumentationShape(
                []string{"value"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Color.WithAlpha(System.Double)"] = DocumentationShape(
                []string{"alpha"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Color.op_Implicit(Goo.Color)~Goo.Edges{Goo.Color}"] = DocumentationShape(
                []string{"value"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Color.op_Implicit(System.String)~Goo.Color"] = DocumentationShape(
                []string{"value"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Container.Add(Goo.Blob)"] = DocumentationShape(
                []string{"child"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.PathBuilder.Reset"] = DocumentationShape(
                System.Array.Empty[string](),
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.ShaderEffectData.Publish``1(System.ReadOnlySpan{``0})"] = DocumentationShape(
                []string{"values"},
                []string{"T"},
                false
            ),
            ["M:Goo.Window.TrySetTopmost(System.Boolean)"] = DocumentationShape(
                System.Array.Empty[string](),
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Window.GetCurrentDisplay"] = DocumentationShape(
                System.Array.Empty[string](),
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.DashPattern.#ctor(System.Double[],System.Double)"] = DocumentationShape(
                []string{"intervals", "offset"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.DevTools.Attach(Goo.Window)"] = DocumentationShape(
                []string{"window"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.DevTools.Attach(Goo.Window,System.Boolean)"] = DocumentationShape(
                []string{"window", "allowInput"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.ElementHandle.Blur"] = DocumentationShape(
                System.Array.Empty[string](),
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.ElementHandle.Focus"] = DocumentationShape(
                System.Array.Empty[string](),
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.ElementHandle.JumpTo(System.Double,System.Double)"] = DocumentationShape(
                []string{"x", "y"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.ElementHandle.ScrollIntoView"] = DocumentationShape(
                System.Array.Empty[string](),
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.ElementHandle.ScrollToItem(System.String)"] = DocumentationShape(
                []string{"key"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Virtual.#ctor(Goo.VirtualSource)"] = DocumentationShape(
                []string{"source"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.VirtualSource.State(Goo.VirtualState)"] = DocumentationShape(
                []string{"current"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.VirtualState.Realize(Goo.VirtualViewport,Goo.VirtualOutput)"] = DocumentationShape(
                []string{"viewport", "output"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.VirtualState.NeedsRealize(Goo.VirtualViewport)"] = DocumentationShape(
                []string{"viewport"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.VirtualState.OffsetOf(Goo.VirtualViewport,System.String)"] = DocumentationShape(
                []string{"viewport", "key"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.VirtualViewport.Child(System.Int32)"] = DocumentationShape(
                []string{"index"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.VirtualOutput.Add(Goo.VirtualItem)"] = DocumentationShape(
                []string{"item"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.ElementHandle.ScrollTo(System.Double,System.Double)"] = DocumentationShape(
                []string{"x", "y"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.ElementHandle.SetTextInputArea(Goo.ElementRect)"] = DocumentationShape(
                System.Array.Empty[string](),
                System.Array.Empty[string](),
                true
            ),
            [
                "M:Goo.ElementHandle.TryCopyTextRangeRects(Goo.TextRange,Goo.TextCoordinateSpace,System.Span{Goo.ElementRect},System.Int32@)"
            ] = DocumentationShape([]string{"required"}, System.Array.Empty[string](), true),
            [
                "M:Goo.ElementHandle.TryGetTextCaretRect(Goo.TextPosition,Goo.TextCoordinateSpace,Goo.ElementRect@)"
            ] = DocumentationShape(System.Array.Empty[string](), System.Array.Empty[string](), true),
            [
                "M:Goo.ElementHandle.TryGetTextPositionAt(Goo.Point,Goo.TextCoordinateSpace,Goo.TextPosition@)"
            ] = DocumentationShape(System.Array.Empty[string](), System.Array.Empty[string](), true),
            ["M:Goo.Edges`1.#ctor(`0)"] = DocumentationShape([]string{"all"}, System.Array.Empty[string](), false),
            ["M:Goo.Edges`1.#ctor(`0,`0)"] = DocumentationShape(
                []string{"vertical", "horizontal"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.Edges`1.#ctor(`0,`0,`0)"] = DocumentationShape(
                []string{"top", "horizontal", "bottom"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.Edges`1.#ctor(`0,`0,`0,`0)"] = DocumentationShape(
                []string{"top", "right", "bottom", "left"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.Edges.#ctor(Goo.Length)"] = DocumentationShape(
                []string{"all"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.Edges.#ctor(Goo.Length,Goo.Length)"] = DocumentationShape(
                []string{"vertical", "horizontal"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.Edges.#ctor(Goo.Length,Goo.Length,Goo.Length)"] = DocumentationShape(
                []string{"top", "horizontal", "bottom"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.Edges.#ctor(Goo.Length,Goo.Length,Goo.Length,Goo.Length)"] = DocumentationShape(
                []string{"top", "right", "bottom", "left"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.Edges.op_Implicit(System.Double)~Goo.Edges"] = DocumentationShape(
                []string{"value"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Edges.op_Implicit(System.Int32)~Goo.Edges"] = DocumentationShape(
                []string{"value"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.ImageSource.#ctor(System.Int32,System.Int32,System.Byte[])"] = DocumentationShape(
                []string{"width", "height", "pixels"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.ImageSource.Acquire"] = DocumentationShape(
                System.Array.Empty[string](),
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.ImageSource.Transfer(System.Int32,System.Int32,System.Byte[],System.Action)"] = DocumentationShape(
                []string{"width", "height", "pixels", "released"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.ImageSource.DecodeColorManaged(System.ReadOnlyMemory{System.Byte},Goo.ImageDecodeLimits,System.Threading.CancellationToken)"] = DocumentationShape(
                []string{"encoded", "limits", "cancellationToken"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.ImageColorProfile.ToSrgb(System.ReadOnlyMemory{System.Byte},System.Span{System.Byte},System.Boolean,System.Threading.CancellationToken)"] = DocumentationShape(
                []string{"profile", "straightRgba", "gray", "cancellationToken"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Images.ImageVariant.#ctor(System.String,System.Single)"] = DocumentationShape(
                []string{"path", "pixelsPerUnit"},
                System.Array.Empty[string](),
                false
            ),
            [
                "M:Goo.Images.ImageVariants.#ctor(System.Collections.Generic.IReadOnlyList{Goo.Images.ImageVariant},Goo.ImageDecodeLimits)"
            ] = DocumentationShape([]string{"variants", "limits"}, System.Array.Empty[string](), false),
            [
                "M:Goo.Images.ImageVariants.LoadAsync(Goo.WindowMetrics,System.Threading.CancellationToken)"
            ] = DocumentationShape([]string{"metrics", "cancellationToken"}, System.Array.Empty[string](), true),
            ["M:Goo.ImageSourceProvider.Acquire"] = DocumentationShape(
                System.Array.Empty[string](),
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.ExternalImageSession.Open(Goo.Window)"] = DocumentationShape(
                []string{"window"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.ExternalImageSession.ImportVulkan(Goo.VulkanExternalImageDescription)"] = DocumentationShape(
                []string{"description"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.ExternalImageSession.ImportAndroidHardwareBuffer(System.IntPtr)"] = DocumentationShape(
                []string{"buffer"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.ExternalImageSession.ImportMetalTexture(System.IntPtr)"] = DocumentationShape(
                []string{"texture"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.ExternalImageSession.ImportMetalIoSurface(System.IntPtr,System.Int32)"] = DocumentationShape(
                []string{"surface", "plane"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.ExternalImageSession.CreateSource"] = DocumentationShape(
                System.Array.Empty[string](),
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.ExternalImageSource.Acquire"] = DocumentationShape(
                System.Array.Empty[string](),
                System.Array.Empty[string](),
                true
            ),
            [
                "M:Goo.ExternalImageSource.Publish(Goo.ExternalImage,Goo.ExternalFrameDescription,Goo.ExternalImageSync,System.Action{Goo.ExternalFrameResult})"
            ] = DocumentationShape([]string{"image", "frame", "ready", "released"}, System.Array.Empty[string](), true),
            ["M:Goo.ImageSourceLease.Complete(Goo.ImageSource)"] = DocumentationShape(
                []string{"source"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.ImageSourceLease.Fail"] = DocumentationShape(
                System.Array.Empty[string](),
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Percent(System.Double)"] = DocumentationShape(
                []string{"value"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Length.Percent(System.Double)"] = DocumentationShape(
                []string{"value"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Length.Pixels(System.Double)"] = DocumentationShape(
                []string{"value"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Length.op_Implicit(Goo.Length)~Goo.Edges"] = DocumentationShape(
                []string{"value"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Length.op_Implicit(System.Double)~Goo.Length"] = DocumentationShape(
                []string{"value"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Length.op_Implicit(System.Int32)~Goo.Length"] = DocumentationShape(
                []string{"value"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.LinearGradient.#ctor(Goo.Color[])"] = DocumentationShape(
                []string{"colors"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.LinearGradient.#ctor(System.Double,Goo.Color[])"] = DocumentationShape(
                []string{"angle", "colors"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.LinearGradient.#ctor(System.Double,Goo.GradientStop[])"] = DocumentationShape(
                []string{"angle", "stops"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.PathBuilder.#ctor(System.Double,System.Double,System.Double,System.Double)"] = DocumentationShape(
                []string{"viewBoxX", "viewBoxY", "viewBoxWidth", "viewBoxHeight"},
                System.Array.Empty[string](),
                false
            ),
            [
                "M:Goo.PathBuilder.ArcTo(System.Double,System.Double,System.Double,System.Boolean,System.Boolean,System.Double,System.Double)"
            ] = DocumentationShape(
                []string{"radiusX", "radiusY", "rotationDegrees", "largeArc", "sweepClockwise", "x", "y"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.PathBuilder.Build"] = DocumentationShape(
                System.Array.Empty[string](),
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.PathBuilder.Close"] = DocumentationShape(
                System.Array.Empty[string](),
                System.Array.Empty[string](),
                true
            ),
            [
                "M:Goo.PathBuilder.CubicTo(System.Double,System.Double,System.Double,System.Double,System.Double,System.Double)"
            ] = DocumentationShape(
                []string{"controlX1", "controlY1", "controlX2", "controlY2", "x", "y"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.PathBuilder.LineTo(System.Double,System.Double)"] = DocumentationShape(
                []string{"x", "y"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.PathBuilder.MoveTo(System.Double,System.Double)"] = DocumentationShape(
                []string{"x", "y"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.PathBuilder.Polyline(Goo.Point[],System.Boolean)"] = DocumentationShape(
                []string{"points", "close"},
                System.Array.Empty[string](),
                true
            ),
            [
                "M:Goo.PathBuilder.QuadraticTo(System.Double,System.Double,System.Double,System.Double)"
            ] = DocumentationShape([]string{"controlX", "controlY", "x", "y"}, System.Array.Empty[string](), true),
            ["M:Goo.Portal.Add(Goo.Blob)"] = DocumentationShape([]string{"child"}, System.Array.Empty[string](), false),
            ["M:Goo.RadialGradient.#ctor(Goo.Color[])"] = DocumentationShape(
                []string{"colors"},
                System.Array.Empty[string](),
                false
            ),
            [
                "M:Goo.RadialGradient.#ctor(System.Double,System.Double,System.Double,Goo.GradientStop[])"
            ] = DocumentationShape(
                []string{"centerX", "centerY", "radius", "stops"},
                System.Array.Empty[string](),
                false
            ),
            [
                "M:Goo.ShaderEffect.#ctor(Goo.ShaderEffectProgram,System.Boolean,System.Single,System.Single)"
            ] = DocumentationShape(
                []string{"program", "samplesBackdrop", "backdropOutset", "backdropBlur"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.ShaderEffect.SetParameter(System.Int32,System.Numerics.Vector4)"] = DocumentationShape(
                []string{"slot", "value"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.ShaderEffect.SetData(System.Int32,Goo.ShaderEffectData)"] = DocumentationShape(
                []string{"slot", "value"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.ShaderEffectProgram.#ctor(System.Byte[],System.Boolean)"] = DocumentationShape(
                []string{"program", "replacesBackdrop"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.ShaderEffectProgram.Load(System.String)"] = DocumentationShape(
                []string{"path"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.ShaderEffectData.#ctor(System.Byte[])"] = DocumentationShape(
                []string{"bytes"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.ShaderEffectData.Dispose"] = DocumentationShape(
                System.Array.Empty[string](),
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.ShaderEffectData.Publish(System.Byte[])"] = DocumentationShape(
                []string{"bytes"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.ShaderEffectData.PublishTransferred(System.Byte[],System.Action)"] = DocumentationShape(
                []string{"bytes", "released"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.ShaderEffectData.Transfer(System.Byte[],System.Action)"] = DocumentationShape(
                []string{"bytes", "released"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Svg.SvgParseException.#ctor(System.String,System.Exception)"] = DocumentationShape(
                []string{"message", "innerException"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.Svg.Svg.Parse(System.String)"] = DocumentationShape(
                []string{"source"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Svg.Svg.Load(System.IO.Stream)"] = DocumentationShape(
                []string{"stream"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Svg.Svg.Load(System.String)"] = DocumentationShape(
                []string{"path"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Text.#ctor(System.String)"] = DocumentationShape(
                []string{"content"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.TextDocument.#ctor(System.String)"] = DocumentationShape(
                []string{"text"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.TextDocument.Apply(Goo.TextChange)"] = DocumentationShape(
                []string{"change"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.TextDocument.ApplyTransaction(Goo.TextChange[])"] = DocumentationShape(
                []string{"changes"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.TextDocument.GetLineIndex(System.Int32)"] = DocumentationShape(
                []string{"offset"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.TextDocument.GetLineRange(System.Int32)"] = DocumentationShape(
                []string{"line"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.TextDocument.GetLineText(System.Int32)"] = DocumentationShape(
                []string{"line"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.TextDocument.GetText"] = DocumentationShape(
                System.Array.Empty[string](),
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.TextDocument.GetText(Goo.TextRange)"] = DocumentationShape(
                []string{"textRange"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.TextDocument.Redo"] = DocumentationShape(
                System.Array.Empty[string](),
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.TextDocument.Snapshot"] = DocumentationShape(
                System.Array.Empty[string](),
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.TextDocument.Undo"] = DocumentationShape(
                System.Array.Empty[string](),
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.TextEditor.#ctor(Goo.TextEditorController)"] = DocumentationShape(
                []string{"controller"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.TextEditor.#ctor(Goo.TextEditorController,Goo.TextPresentationLayer[])"] = DocumentationShape(
                []string{"controller", "layers"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.TextEditorController.#ctor(Goo.TextDocument)"] = DocumentationShape(
                []string{"document"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.TextEditorController.CommitComposition"] = DocumentationShape(
                System.Array.Empty[string](),
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.TextEditorController.CommitComposition(System.String)"] = DocumentationShape(
                []string{"text"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.TextEditorController.Copy"] = DocumentationShape(
                System.Array.Empty[string](),
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.TextEditorController.Cut"] = DocumentationShape(
                System.Array.Empty[string](),
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.TextEditorController.Execute(Goo.TextCommand)"] = DocumentationShape(
                []string{"command"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.TextEditorController.ScrollTo(System.Double,System.Double)"] = DocumentationShape(
                []string{"x", "y"},
                System.Array.Empty[string](),
                false
            ),
            [
                "M:Goo.TextEditorController.UpdateComposition(System.String,System.Int32,System.Int32)"
            ] = DocumentationShape(
                []string{"text", "selectionStart", "selectionLength"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.TextPresentationLayer.#ctor(Goo.TextDocument)"] = DocumentationShape(
                []string{"document"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.TextPresentationLayer.Remove(System.String)"] = DocumentationShape(
                []string{"key"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.TextPresentationLayer.RemoveProjection(System.String)"] = DocumentationShape(
                []string{"key"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.TextPresentationLayer.RemoveStyle(System.String)"] = DocumentationShape(
                []string{"key"},
                System.Array.Empty[string](),
                true
            ),
            [
                "M:Goo.TextPresentationLayer.ReplaceStyles(System.Collections.Generic.IReadOnlyList{Goo.TextStyleSpan})"
            ] = DocumentationShape([]string{"spans"}, System.Array.Empty[string](), false),
            ["M:Goo.TextPresentationLayer.SetBlockSlot(System.String,Goo.TextRange,Goo.Blob)"] = DocumentationShape(
                []string{"key", "textRange", "content"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.TextPresentationLayer.SetHiddenRange(System.String,Goo.TextRange)"] = DocumentationShape(
                []string{"key", "textRange"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.TextPresentationLayer.SetInlineSlot(System.String,Goo.TextRange,Goo.Blob)"] = DocumentationShape(
                []string{"key", "textRange", "content"},
                System.Array.Empty[string](),
                false
            ),
            [
                "M:Goo.TextPresentationLayer.SetReplacement(System.String,Goo.TextRange,System.String)"
            ] = DocumentationShape([]string{"key", "textRange", "text"}, System.Array.Empty[string](), false),
            ["M:Goo.TextPresentationLayer.SetStyle(System.String,Goo.TextRange,Goo.Style)"] = DocumentationShape(
                []string{"key", "textRange", "style"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.TextSnapshot.#ctor(Goo.TextDocument)"] = DocumentationShape(
                []string{"document"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.TextSnapshot.GetLineIndex(System.Int32)"] = DocumentationShape(
                []string{"offset"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.TextSnapshot.GetLineRange(System.Int32)"] = DocumentationShape(
                []string{"line"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.TextSnapshot.GetLineText(System.Int32)"] = DocumentationShape(
                []string{"line"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.TextSnapshot.GetText"] = DocumentationShape(
                System.Array.Empty[string](),
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.TextSnapshot.GetText(Goo.TextRange)"] = DocumentationShape(
                []string{"textRange"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Simulation.Done(System.Double)"] = DocumentationShape(
                []string{"elapsed"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Simulation.Position(System.Double)"] = DocumentationShape(
                []string{"elapsed"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Simulation.Velocity(System.Double)"] = DocumentationShape(
                []string{"elapsed"},
                System.Array.Empty[string](),
                true
            ),
            [
                "M:Goo.MotionConverter`1.#ctor(System.Int32,System.Action{`0,System.Double[]},System.Func{System.Double[],`0})"
            ] = DocumentationShape([]string{"dimensions", "read", "write"}, System.Array.Empty[string](), false),
            ["M:Goo.Motion.Tween(System.Double,Goo.Easing)"] = DocumentationShape(
                []string{"durationMs", "easing"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.MotionVelocity.Add(Goo.MotionVelocity)"] = DocumentationShape(
                []string{"other"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.MotionVelocity.Components(System.Double[])"] = DocumentationShape(
                []string{"values"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.MotionVelocity.Uniform(System.Double)"] = DocumentationShape(
                []string{"value"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Tokens.Get``1"] = DocumentationShape(System.Array.Empty[string](), []string{"T"}, true),
            ["M:Goo.Tokens.Scope``2(``0,System.Func{``1})"] = DocumentationShape(
                []string{"tokens", "body"},
                []string{"T", "R"},
                true
            ),
            ["M:Goo.ElementHandle.BeginFocusScope(Goo.FocusScopeOptions)"] = DocumentationShape(
                []string{"options"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Window.ConfigureApplication(System.String,System.String,System.String)"] = DocumentationShape(
                []string{"name", "version", "identifier"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.Window.DragRegion(Goo.Container)"] = DocumentationShape(
                []string{"region"},
                System.Array.Empty[string](),
                true
            ),
            [
                "M:Goo.Window.PerformAccessibilityAction(Goo.AccessibilityId,Goo.AccessibilityActionRequest)"
            ] = DocumentationShape([]string{"id", "request"}, System.Array.Empty[string](), true),
            ["M:Goo.Window.Post(System.Action)"] = DocumentationShape(
                []string{"action"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.Window.Open"] = DocumentationShape(
                System.Array.Empty[string](),
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Window.GetClipboardFormats"] = DocumentationShape(
                System.Array.Empty[string](),
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.FileDialogFilter.#ctor(System.String,System.String)"] = DocumentationShape(
                []string{"name", "pattern"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.FileDialogOptions.#ctor"] = DocumentationShape(
                System.Array.Empty[string](),
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.Window.ShowFileDialogAsync(Goo.FileDialogKind,Goo.FileDialogOptions)"] = DocumentationShape(
                []string{"kind", "options"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Window.CancelFileDialog"] = DocumentationShape(
                System.Array.Empty[string](),
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.LayoutAlgorithm.Measure(Goo.LayoutContext,Goo.LayoutSize)"] = DocumentationShape(
                []string{"context", "available"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.LayoutAlgorithm.Arrange(Goo.LayoutContext,Goo.LayoutSize)"] = DocumentationShape(
                []string{"context", "finalSize"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.LayoutContext.MeasureChild(System.Int32,Goo.LayoutSize)"] = DocumentationShape(
                []string{"index", "available"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.LayoutContext.ArrangeChild(System.Int32,Goo.ElementRect)"] = DocumentationShape(
                []string{"index", "bounds"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.Window.ReadClipboardFiles"] = DocumentationShape(
                System.Array.Empty[string](),
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Window.ReadClipboardImage"] = DocumentationShape(
                System.Array.Empty[string](),
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Window.Pump(System.Double)"] = DocumentationShape(
                []string{"dt"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.Window.RequestClose"] = DocumentationShape(
                System.Array.Empty[string](),
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.Window.TryPost(System.Action)"] = DocumentationShape(
                []string{"action"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Window.SetColors(Goo.Color,Goo.Color)"] = DocumentationShape(
                []string{"background", "foreground"},
                System.Array.Empty[string](),
                false
            ),
            ["T:Goo.Context`1"] = DocumentationShape(System.Array.Empty[string](), []string{"T"}, false),
            ["M:Goo.Context`1.Read"] = DocumentationShape(
                System.Array.Empty[string](),
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Context`1.Read(Goo.Window)"] = DocumentationShape(
                []string{"window"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Context`1.TryRead(Goo.Window,`0@)"] = DocumentationShape(
                []string{"window", "value"},
                System.Array.Empty[string](),
                true
            ),
            ["M:Goo.Context`1.Set(Goo.Window,`0)"] = DocumentationShape(
                []string{"window", "value"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.Context`1.Scope(`0,System.Func{Goo.Blob})"] = DocumentationShape(
                []string{"value", "build"},
                System.Array.Empty[string](),
                true
            ),
            ["T:Goo.Anim`1"] = DocumentationShape(System.Array.Empty[string](), []string{"T"}, false),
            ["T:Goo.Cell`1"] = DocumentationShape(System.Array.Empty[string](), []string{"TInput"}, false),
            ["T:Goo.Edges`1"] = DocumentationShape(System.Array.Empty[string](), []string{"T"}, false),
            ["T:Goo.MotionConverter`1"] = DocumentationShape(System.Array.Empty[string](), []string{"T"}, false),
            ["M:Goo.PopupWindow.#ctor(Goo.Window,Goo.Cell,Goo.PopupKind)"] = DocumentationShape(
                []string{"owner", "root", "kind"},
                System.Array.Empty[string](),
                false
            ),
            ["M:Goo.PopupWindow.#ctor(Goo.PopupWindow,Goo.Cell,Goo.PopupKind)"] = DocumentationShape(
                []string{"owner", "root", "kind"},
                System.Array.Empty[string](),
                false
            ),
            [
                "M:Goo.PopupWindow.Open(Goo.ElementRect,System.Int32,System.Int32,Goo.PortalPlacement)"
            ] = DocumentationShape(
                []string{"anchor", "width", "height", "placement"},
                System.Array.Empty[string](),
                true
            ),
            [
                "M:Goo.PopupWindow.UpdatePlacement(Goo.ElementRect,System.Int32,System.Int32,Goo.PortalPlacement)"
            ] = DocumentationShape(
                []string{"anchor", "width", "height", "placement"},
                System.Array.Empty[string](),
                true
            )
        }
        private func ReadApiPage(name string) string -> File.ReadAllText(
            Path.Combine(FindRepositoryRoot().FullName, "docs", "api", name)
        )

        private func AssertApprovedCallablesAreTracked() {
            let path = Path.Combine(AppContext.BaseDirectory, "PublicApi.approved.txt")
            Assert.True(File.Exists(path), "Missing approved public API baseline at $path.")
            let apiTypes = ApiTypes().ToArray()
            let abstractTypes = apiTypes
                .Where((type Type) -> type.IsAbstract)
                .Select((type Type) -> type.FullName)
                .ToHashSet(StringComparer.Ordinal)
            let coreTypes = apiTypes.Select((type Type) -> type.FullName).ToHashSet(StringComparer.Ordinal)
            let generatedNames = HashSet[string](StringComparer.Ordinal){
                "<Clone>$",
                "Deconstruct",
                "Equals",
                "GetHashCode",
                "ToString",
                "op_Equality",
                "op_Inequality"
            }
            let count = File
                .ReadLines(path)
                .Select((line string) -> line.Split('|'))
                .Where((parts[]string) -> coreTypes.Contains(parts[1]))
                .Count(
                (parts[]string) -> parts[0] == "ctor" && parts[1] != "Goo.Cell`1" && !SynthesizedPrimaryDataTypes.Any(
                    (type Type) -> type.FullName == parts[1]
                ) &&
                    !abstractTypes.Contains(parts[1]) || parts[0] == "method" && !generatedNames.Contains(parts[2])
            )
            Assert.Equal(count, ExpectedMethodIds.Length)
        }

        private func ExpectedDocumentationIds() IEnumerable[string] {
            let types = ApiTypes().ToArray()
            let typeIds = types.Where((type Type) -> type != typeof(Window)).Select((type Type) -> "T:${type.FullName}")
            let propertyIds = types.Where((type Type) -> !SynthesizedPrimaryDataTypes.Contains(type)).SelectMany(
                (type Type) -> type.GetProperties(PublicDeclared).Select(
                    (property PropertyInfo) -> "P:${type.FullName}.${property.Name}"
                )
            )
            let eventIds = types.SelectMany(
                (type Type) -> type.GetEvents(PublicDeclared).Select(
                    (event EventInfo) -> "E:${type.FullName}.${event.Name}"
                )
            )
            return ExpectedMethodIds
                .Concat(ExpectedProtectedMethodIds)
                .Concat(ExpectedEqualityDocumentationIds)
                .Concat(ExpectedEnumFieldIds)
                .Concat(typeIds)
                .Concat(propertyIds)
                .Append("P:Goo.TextCommand.Position")
                .Concat(eventIds)
                .Append("P:Goo.LayoutTransition.SimulationFactory")
                .Append("P:Goo.Cell`1.Input")
                .Append("P:Goo.FocusedEditorSnapshot.InputOptions")
                .Append("M:Goo.Percent(System.Double)")
        }

        private func ApiTypes() IEnumerable[Type] -> []Assembly{
            typeof(Window).Assembly,
            typeof(SoundPlayer).Assembly
        }
            .SelectMany((assembly Assembly) -> assembly.GetExportedTypes())
            .Where((type Type) -> type.Name != "<Program>")
            .Where((type Type) -> type.FullName != "Goo.PerformanceFixtures")

        private func LoadDocumentationMembers() Dictionary[string, XElement] -> []Assembly{
            typeof(Window).Assembly,
            typeof(SoundPlayer).Assembly
        }
            .Select((assembly Assembly) -> Path.ChangeExtension(assembly.Location, ".xml"))
            .SelectMany((path string) -> XDocument.Load(path).Root!!.Element(XName?("members")!!)!!.Elements("member"))
            .ToDictionary((member XElement) -> member.Attribute(XName?("name")!!)!!.Value, StringComparer.Ordinal)

        private func LoadSupplementMemberIds() HashSet[string] {
            let path = Path.Combine(FindRepositoryRoot().FullName, "docs", "api", "Goo.xml.supplement.xml")
            return XDocument
                .Load(path)
                .Descendants("member")
                .Select((member XElement) -> member.Attribute(XName?("name")!!)?.Value)
                .Where((id string?) -> id != nil)
                .Select((id string?) -> id!!)
                .ToHashSet(StringComparer.Ordinal)
        }

        private func FindRepositoryRoot() DirectoryInfo {
            for start in[]string{Directory.GetCurrentDirectory(), AppContext.BaseDirectory} {
                for var directory DirectoryInfo? = DirectoryInfo(start);
                    directory != nil;
                    directory = directory!!.Parent {
                    if File.Exists(Path.Combine(directory.FullName, "Goo", "Goo.gsproj")) {
                        return directory
                    }
                }
            }
            throw DirectoryNotFoundException("Could not find the Goo repository root.")
        }

        private func SourceName(type Type) string {
            let name = type.Name
            let tick = name.IndexOf('`')
            return if tick < 0 {
                name
            } else {
                name[.. tick]
            }
        }

        private func TagNames(member XElement, tag string)[]string -> member
            .Elements(tag)
            .Select((element XElement) -> element.Attribute(XName?("name")!!)!!.Value)
            .ToArray()

        private func HasText(element XElement?) bool -> !string.IsNullOrWhiteSpace(element?.Value)
    }
}
