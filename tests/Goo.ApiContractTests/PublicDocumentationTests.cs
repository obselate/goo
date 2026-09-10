using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using Goo;
using Xunit;

public sealed class PublicDocumentationTests
{
    private const BindingFlags PublicDeclared =
        BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly;

    private static readonly string[] ExpectedMethodIds =
    {
        "M:Goo.Accessibility.#ctor",
        "M:Goo.AccessibilityActionRequest.#ctor(Goo.AccessibilityAction)",
        "M:Goo.AccessibilityActionRequest.Scroll(System.Double,System.Double)",
        "M:Goo.AccessibilityActionRequest.SetSelection(System.Int32,System.Int32)",
        "M:Goo.AccessibilityActionRequest.SetValue(System.String)",
        "M:Goo.AccessibilityAdapter.Update(Goo.AccessibilityTree)",
        "M:Goo.AccessibilityRelationships.#ctor",
        "M:Goo.AccessibilityValue.#ctor",
        "M:Goo.Anim`1.Set(`0)",
        "M:Goo.Anim`1.Snap(`0)",
        "M:Goo.Anim`1.To(`0)",
        "M:Goo.Anim`1.To(`0,System.Func{System.Double,System.Double,System.Double,Goo.Simulation},System.Func{System.Double,System.Double,System.Double,Goo.Simulation}[])",
        "M:Goo.Anim`1.To(`0,Goo.MotionVelocity)",
        "M:Goo.Anim`1.To(`0,Goo.MotionVelocity,System.Func{System.Double,System.Double,System.Double,Goo.Simulation},System.Func{System.Double,System.Double,System.Double,Goo.Simulation}[])",
        "M:Goo.Button.#ctor",
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
        "M:Goo.Color.op_Implicit(System.String)~Goo.Color",
        "M:Goo.CompiledVectorAsset.Load(System.Byte[])",
        "M:Goo.CompiledVectorAsset.PathForNode(System.Int32)",
        "M:Goo.CompiledVectorAsset.Render",
        "M:Goo.CompiledVectorAsset.Render(System.String)",
        "M:Goo.CompiledVectorAsset.TryLoad(System.Byte[])",
        "M:Goo.VectorAsset.#ctor(System.Double,System.Double,System.Double,System.Double,Goo.VectorNode[])",
        "M:Goo.VectorAsset.Load(System.Byte[])",
        "M:Goo.VectorAsset.TryLoad(System.Byte[])",
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
        "M:Goo.Container.#ctor",
        "M:Goo.DashPattern.#ctor(System.Double[],System.Double)",
        "M:Goo.DragData.#ctor(System.Object,Goo.DragEffect)",
        "M:Goo.DragSource.#ctor(System.Func{Goo.DragStartEvent,Goo.DragData},System.Action{Goo.DragEndEvent})",
        "M:Goo.DropTarget.#ctor(System.Func{Goo.DragEvent,Goo.DragEffect},System.Action{Goo.DragEvent})",
        "M:Goo.EmbeddedWindowHost.AttachPresentation",
        "M:Goo.EmbeddedWindowHost.DetachPresentation",
        "M:Goo.EmbeddedWindowHost.Dispose",
        "M:Goo.EmbeddedWindowHost.RenderFrame(System.Double)",
        "M:Goo.EmbeddedWindowHost.Resize(System.Int32,System.Int32,System.Int32,System.Int32)",
        "M:Goo.EmbeddedWindowHost.Resume",
        "M:Goo.EmbeddedWindowHost.SetFocused(System.Boolean)",
        "M:Goo.EmbeddedWindowHost.Suspend",
        "M:Goo.ElementHandle.#ctor",
        "M:Goo.ElementHandle.Blur",
        "M:Goo.ElementHandle.Focus",
        "M:Goo.ElementHandle.JumpTo(System.Double,System.Double)",
        "M:Goo.ElementHandle.ScrollIntoView",
        "M:Goo.ElementHandle.ScrollTo(System.Double,System.Double)",
        "M:Goo.ElementHandle.SetTextInputArea(Goo.ElementRect)",
        "M:Goo.ElementHandle.TryCopyTextRangeRects(Goo.TextRange,Goo.TextCoordinateSpace,System.Span{Goo.ElementRect},System.Int32@)",
        "M:Goo.ElementHandle.TryGetTextCaretRect(Goo.TextPosition,Goo.TextCoordinateSpace,Goo.ElementRect@)",
        "M:Goo.ElementHandle.TryGetTextPositionAt(Goo.Point,Goo.TextCoordinateSpace,Goo.TextPosition@)",
        "M:Goo.FontSource.#ctor(System.String,System.Int32,System.Boolean,System.Byte[])",
        "M:Goo.FontSource.#ctor(System.String,System.Int32,System.Boolean,System.Byte[],System.UInt32,Goo.FontVariation[])",
        "M:Goo.FontSource.Dispose",
        "M:Goo.FontSource.Register",
        "M:Goo.FontVariation.#ctor(System.String,System.Single)",
        "M:Goo.Image.#ctor",
        "M:Goo.ImageSource.#ctor(System.Int32,System.Int32,System.Byte[])",
        "M:Goo.ImageSource.Acquire",
        "M:Goo.ImageSourceProvider.Acquire",
        "M:Goo.ImageSource.Dispose",
        "M:Goo.ImageSource.Transfer(System.Int32,System.Int32,System.Byte[],System.Action)",
        "M:Goo.ImageSourceLease.#ctor",
        "M:Goo.ImageSourceLease.Complete(Goo.ImageSource)",
        "M:Goo.ImageSourceLease.Dispose",
        "M:Goo.ImageSourceLease.Fail",
        "M:Goo.Length.Percent(System.Double)",
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
        "M:Goo.PlatformInput.KeyPress(Goo.Key,Goo.KeyModifiers)",
        "M:Goo.PlatformInput.KeyRelease(Goo.Key)",
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
        "M:Goo.KeyEvent.PreventDefault",
        "M:Goo.KeyEvent.StopPropagation",
        "M:Goo.FocusEvent.StopPropagation",
        "M:Goo.WheelEvent.PreventDefault",
        "M:Goo.WheelEvent.StopPropagation",
        "M:Goo.RadialGradient.#ctor(Goo.Color[])",
        "M:Goo.RadialGradient.#ctor(System.Double,System.Double,System.Double,Goo.GradientStop[])",
        "M:Goo.ShaderEffect.#ctor(Goo.ShaderEffectProgram,System.Boolean,System.Single)",
        "M:Goo.ShaderEffect.SetParameter(System.Int32,System.Numerics.Vector4)",
        "M:Goo.ShaderEffect.SetData(System.Int32,Goo.ShaderEffectData)",
        "M:Goo.ShaderEffectProgram.#ctor(System.Byte[])",
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
        "M:Goo.Style.#ctor",
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
        "M:Goo.TextPresentationLayer.#ctor(Goo.TextDocument)",
        "M:Goo.TextPresentationLayer.Clear",
        "M:Goo.TextPresentationLayer.Dispose",
        "M:Goo.TextPresentationLayer.Remove(System.String)",
        "M:Goo.TextPresentationLayer.RemoveProjection(System.String)",
        "M:Goo.TextPresentationLayer.RemoveStyle(System.String)",
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
        "M:Goo.Window.Attach(Goo.EmbeddedWindowHost)",
        "M:Goo.Window.ConfigureApplication(System.String,System.String,System.String)",
        "M:Goo.Window.DragRegion(Goo.Container)",
        "M:Goo.Window.GetClipboardText",
        "M:Goo.Window.PerformAccessibilityAction(Goo.AccessibilityId,Goo.AccessibilityActionRequest)",
        "M:Goo.Window.Post(System.Action)",
        "M:Goo.Window.Open",
        "M:Goo.Window.Pump(System.Double)",
        "M:Goo.Window.RequestClose",
        "M:Goo.Window.Run",
        "M:Goo.Window.SetClipboardText(System.String)",
        "M:Goo.Window.TryPost(System.Action)",
    };

    private static readonly string[] ExpectedProtectedMethodIds =
    {
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
        "M:Goo.EmbeddedWindowHost.UnloadVulkanLibrary",
    };

    private static readonly string[] ExpectedEqualityDocumentationIds =
    {
        "M:Goo.FontVariation.Deconstruct(System.String@,System.Single@)",
        "M:Goo.FontVariation.Equals(Goo.FontVariation)",
        "M:Goo.FontVariation.Equals(System.Object)",
        "M:Goo.FontVariation.GetHashCode",
        "M:Goo.FontVariation.ToString",
        "M:Goo.FontVariation.op_Equality(Goo.FontVariation,Goo.FontVariation)",
        "M:Goo.FontVariation.op_Inequality(Goo.FontVariation,Goo.FontVariation)",
        "M:Goo.PanelTransform.Equals(Goo.PanelTransform)",
        "M:Goo.PanelTransform.op_Equality(Goo.PanelTransform,Goo.PanelTransform)",
        "M:Goo.PanelTransform.op_Inequality(Goo.PanelTransform,Goo.PanelTransform)",
    };

    private static readonly string[] ExpectedEnumFieldIds =
    {
        "F:Goo.ImageFit.Contain",
        "F:Goo.ImageFit.Cover",
        "F:Goo.ImageFit.Fill",
        "F:Goo.ImageFit.None",
    };

    private static readonly HashSet<Type> SynthesizedPrimaryDataTypes =
    [
        typeof(FocusedEditorSnapshot),
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
    ];

    private static readonly IReadOnlyDictionary<string, DocumentationShape> Shapes =
        new Dictionary<string, DocumentationShape>(StringComparer.Ordinal)
        {
            ["M:Goo.AccessibilityActionRequest.Scroll(System.Double,System.Double)"] = new(["x", "y"], [], false),
            ["M:Goo.AccessibilityActionRequest.SetSelection(System.Int32,System.Int32)"] = new(["start", "length"], [], false),
            ["M:Goo.AccessibilityActionRequest.SetValue(System.String)"] = new(["value"], [], false),
            ["M:Goo.AccessibilityActionRequest.#ctor(Goo.AccessibilityAction)"] = new(["action"], [], false),
            ["M:Goo.AccessibilityAdapter.Update(Goo.AccessibilityTree)"] = new(["tree"], [], false),
            ["M:Goo.DragData.#ctor(System.Object,Goo.DragEffect)"] = new(["value", "allowedEffects"], [], false),
            ["M:Goo.DragSource.#ctor(System.Func{Goo.DragStartEvent,Goo.DragData},System.Action{Goo.DragEndEvent})"] = new(["create", "end"], [], false),
            ["M:Goo.DropTarget.#ctor(System.Func{Goo.DragEvent,Goo.DragEffect},System.Action{Goo.DragEvent})"] = new(["query", "changed"], [], false),
            ["M:Goo.Anim`1.Set(`0)"] = new(["value"], [], false),
            ["M:Goo.Anim`1.Snap(`0)"] = new(["value"], [], false),
            ["M:Goo.Anim`1.To(`0)"] = new(["target"], [], false),
            ["M:Goo.Anim`1.To(`0,System.Func{System.Double,System.Double,System.Double,Goo.Simulation},System.Func{System.Double,System.Double,System.Double,Goo.Simulation}[])"] = new(["target", "spec", "specs"], [], false),
            ["M:Goo.Anim`1.To(`0,Goo.MotionVelocity)"] = new(["target", "velocity"], [], false),
            ["M:Goo.Anim`1.To(`0,Goo.MotionVelocity,System.Func{System.Double,System.Double,System.Double,Goo.Simulation},System.Func{System.Double,System.Double,System.Double,Goo.Simulation}[])"] = new(["target", "velocity", "spec", "specs"], [], false),
            ["M:Goo.Cell.Animate(Goo.Color)"] = new(["initial"], [], true),
            ["M:Goo.Cell.Animate(Goo.Color,System.Action{Goo.Color})"] = new(["initial", "onChange"], [], true),
            ["M:Goo.Cell.Animate(Goo.Length)"] = new(["initial"], [], true),
            ["M:Goo.Cell.Animate(Goo.Length,System.Action{Goo.Length})"] = new(["initial", "onChange"], [], true),
            ["M:Goo.Cell.Animate(Goo.Point)"] = new(["initial"], [], true),
            ["M:Goo.Cell.Animate(Goo.Point,System.Action{Goo.Point})"] = new(["initial", "onChange"], [], true),
            ["M:Goo.Cell.Animate(System.Double)"] = new(["initial"], [], true),
            ["M:Goo.Cell.Animate(System.Double,System.Action{System.Double})"] = new(["initial", "onChange"], [], true),
            ["M:Goo.Cell.Animate``1(``0,Goo.MotionConverter{``0})"] = new(["initial", "converter"], ["T"], true),
            ["M:Goo.Cell.Animate``1(``0,Goo.MotionConverter{``0},System.Action{``0})"] = new(["initial", "converter", "onChange"], ["T"], true),
            ["M:Goo.Cell.Build"] = new([], [], true),
            ["M:Goo.Cell`1.Build(`0)"] = new(["input"], [], true),
            ["M:Goo.Cell.Mount``1(System.Func{``0},System.String)"] = new(["factory", "key"], ["TCell"], true),
            ["M:Goo.Cell.Mount``1(System.String)"] = new(["key"], ["TCell"], true),
            ["M:Goo.Cell.Mount``1(System.String,System.Action{``0})"] = new(["key", "configure"], ["TCell"], true),
            ["M:Goo.Cell.Mount``2(System.String,``0)"] = new(["key", "input"], ["TInput", "TCell"], true),
            ["M:Goo.Cell.MountSeeded``1(System.String,System.Action{``0},System.Action{``0})"] = new(["key", "seed", "configure"], ["TCell"], true),
            ["M:Goo.Color.FromNormalized(System.Single,System.Single,System.Single,System.Single)"] = new(["r", "g", "b", "a"], [], true),
            ["M:Goo.Color.Parse(System.String)"] = new(["value"], [], true),
            ["M:Goo.Color.Rgb(System.Int32,System.Int32,System.Int32)"] = new(["r", "g", "b"], [], true),
            ["M:Goo.Color.Rgba(System.Int32,System.Int32,System.Int32,System.Int32)"] = new(["r", "g", "b", "a"], [], true),
            ["M:Goo.Color.TryParse(System.String)"] = new(["value"], [], true),
            ["M:Goo.Color.WithAlpha(System.Double)"] = new(["alpha"], [], true),
            ["M:Goo.Color.op_Implicit(System.String)~Goo.Color"] = new(["value"], [], true),
            ["M:Goo.DashPattern.#ctor(System.Double[],System.Double)"] = new(["intervals", "offset"], [], false),
            ["M:Goo.DevTools.Attach(Goo.Window)"] = new(["window"], [], true),
            ["M:Goo.ElementHandle.Blur"] = new([], [], true),
            ["M:Goo.ElementHandle.Focus"] = new([], [], true),
            ["M:Goo.ElementHandle.JumpTo(System.Double,System.Double)"] = new(["x", "y"], [], true),
            ["M:Goo.ElementHandle.ScrollIntoView"] = new([], [], true),
            ["M:Goo.ElementHandle.ScrollTo(System.Double,System.Double)"] = new(["x", "y"], [], true),
            ["M:Goo.ElementHandle.SetTextInputArea(Goo.ElementRect)"] = new([], [], true),
            ["M:Goo.ElementHandle.TryCopyTextRangeRects(Goo.TextRange,Goo.TextCoordinateSpace,System.Span{Goo.ElementRect},System.Int32@)"] = new(["required"], [], true),
            ["M:Goo.ElementHandle.TryGetTextCaretRect(Goo.TextPosition,Goo.TextCoordinateSpace,Goo.ElementRect@)"] = new([], [], true),
            ["M:Goo.ElementHandle.TryGetTextPositionAt(Goo.Point,Goo.TextCoordinateSpace,Goo.TextPosition@)"] = new([], [], true),
            ["M:Goo.ImageSource.#ctor(System.Int32,System.Int32,System.Byte[])"] = new(["width", "height", "pixels"], [], false),
            ["M:Goo.ImageSource.Acquire"] = new([], [], true),
            ["M:Goo.ImageSource.Transfer(System.Int32,System.Int32,System.Byte[],System.Action)"] = new(["width", "height", "pixels", "released"], [], true),
            ["M:Goo.ImageSourceProvider.Acquire"] = new([], [], false),
            ["M:Goo.ImageSourceLease.Complete(Goo.ImageSource)"] = new(["source"], [], true),
            ["M:Goo.ImageSourceLease.Fail"] = new([], [], true),
            ["M:Goo.Length.Percent(System.Double)"] = new(["value"], [], true),
            ["M:Goo.Length.op_Implicit(System.Double)~Goo.Length"] = new(["value"], [], true),
            ["M:Goo.Length.op_Implicit(System.Int32)~Goo.Length"] = new(["value"], [], true),
            ["M:Goo.LinearGradient.#ctor(Goo.Color[])"] = new(["colors"], [], false),
            ["M:Goo.LinearGradient.#ctor(System.Double,Goo.Color[])"] = new(["angle", "colors"], [], false),
            ["M:Goo.LinearGradient.#ctor(System.Double,Goo.GradientStop[])"] = new(["angle", "stops"], [], false),
            ["M:Goo.PathBuilder.#ctor(System.Double,System.Double,System.Double,System.Double)"] = new(["viewBoxX", "viewBoxY", "viewBoxWidth", "viewBoxHeight"], [], false),
            ["M:Goo.PathBuilder.ArcTo(System.Double,System.Double,System.Double,System.Boolean,System.Boolean,System.Double,System.Double)"] = new(["radiusX", "radiusY", "rotationDegrees", "largeArc", "sweepClockwise", "x", "y"], [], true),
            ["M:Goo.PathBuilder.Build"] = new([], [], true),
            ["M:Goo.PathBuilder.Close"] = new([], [], true),
            ["M:Goo.PathBuilder.CubicTo(System.Double,System.Double,System.Double,System.Double,System.Double,System.Double)"] = new(["controlX1", "controlY1", "controlX2", "controlY2", "x", "y"], [], true),
            ["M:Goo.PathBuilder.LineTo(System.Double,System.Double)"] = new(["x", "y"], [], true),
            ["M:Goo.PathBuilder.MoveTo(System.Double,System.Double)"] = new(["x", "y"], [], true),
            ["M:Goo.PathBuilder.Polyline(Goo.Point[],System.Boolean)"] = new(["points", "close"], [], true),
            ["M:Goo.PathBuilder.QuadraticTo(System.Double,System.Double,System.Double,System.Double)"] = new(["controlX", "controlY", "x", "y"], [], true),
            ["M:Goo.RadialGradient.#ctor(Goo.Color[])"] = new(["colors"], [], false),
            ["M:Goo.RadialGradient.#ctor(System.Double,System.Double,System.Double,Goo.GradientStop[])"] = new(["centerX", "centerY", "radius", "stops"], [], false),
            ["M:Goo.ShaderEffect.#ctor(Goo.ShaderEffectProgram,System.Boolean,System.Single)"] = new(["program", "samplesBackdrop", "backdropOutset"], [], false),
            ["M:Goo.ShaderEffect.SetParameter(System.Int32,System.Numerics.Vector4)"] = new(["slot", "value"], [], true),
            ["M:Goo.ShaderEffect.SetData(System.Int32,Goo.ShaderEffectData)"] = new(["slot", "value"], [], true),
            ["M:Goo.ShaderEffectProgram.#ctor(System.Byte[])"] = new(["program"], [], false),
            ["M:Goo.ShaderEffectProgram.Load(System.String)"] = new(["path"], [], true),
            ["M:Goo.ShaderEffectData.#ctor(System.Byte[])"] = new(["bytes"], [], false),
            ["M:Goo.ShaderEffectData.Dispose"] = new([], [], false),
            ["M:Goo.ShaderEffectData.Publish(System.Byte[])"] = new(["bytes"], [], false),
            ["M:Goo.ShaderEffectData.PublishTransferred(System.Byte[],System.Action)"] = new(["bytes", "released"], [], false),
            ["M:Goo.ShaderEffectData.Transfer(System.Byte[],System.Action)"] = new(["bytes", "released"], [], true),
            ["M:Goo.Text.#ctor(System.String)"] = new(["content"], [], false),
            ["M:Goo.TextDocument.#ctor(System.String)"] = new(["text"], [], false),
            ["M:Goo.TextDocument.Apply(Goo.TextChange)"] = new(["change"], [], true),
            ["M:Goo.TextDocument.ApplyTransaction(Goo.TextChange[])"] = new(["changes"], [], true),
            ["M:Goo.TextDocument.GetLineIndex(System.Int32)"] = new(["offset"], [], true),
            ["M:Goo.TextDocument.GetLineRange(System.Int32)"] = new(["line"], [], true),
            ["M:Goo.TextDocument.GetLineText(System.Int32)"] = new(["line"], [], true),
            ["M:Goo.TextDocument.GetText"] = new([], [], true),
            ["M:Goo.TextDocument.GetText(Goo.TextRange)"] = new(["textRange"], [], true),
            ["M:Goo.TextDocument.Redo"] = new([], [], true),
            ["M:Goo.TextDocument.Snapshot"] = new([], [], true),
            ["M:Goo.TextDocument.Undo"] = new([], [], true),
            ["M:Goo.TextEditor.#ctor(Goo.TextEditorController)"] = new(["controller"], [], false),
            ["M:Goo.TextEditor.#ctor(Goo.TextEditorController,Goo.TextPresentationLayer[])"] = new(["controller", "layers"], [], false),
            ["M:Goo.TextEditorController.#ctor(Goo.TextDocument)"] = new(["document"], [], false),
            ["M:Goo.TextEditorController.CommitComposition"] = new([], [], true),
            ["M:Goo.TextEditorController.CommitComposition(System.String)"] = new(["text"], [], true),
            ["M:Goo.TextEditorController.Copy"] = new([], [], true),
            ["M:Goo.TextEditorController.Cut"] = new([], [], true),
            ["M:Goo.TextEditorController.Execute(Goo.TextCommand)"] = new(["command"], [], true),
            ["M:Goo.TextEditorController.ScrollTo(System.Double,System.Double)"] = new(["x", "y"], [], false),
            ["M:Goo.TextEditorController.UpdateComposition(System.String,System.Int32,System.Int32)"] = new(["text", "selectionStart", "selectionLength"], [], true),
            ["M:Goo.TextPresentationLayer.#ctor(Goo.TextDocument)"] = new(["document"], [], false),
            ["M:Goo.TextPresentationLayer.Remove(System.String)"] = new(["key"], [], true),
            ["M:Goo.TextPresentationLayer.RemoveProjection(System.String)"] = new(["key"], [], true),
            ["M:Goo.TextPresentationLayer.RemoveStyle(System.String)"] = new(["key"], [], true),
            ["M:Goo.TextPresentationLayer.SetBlockSlot(System.String,Goo.TextRange,Goo.Blob)"] = new(["key", "textRange", "content"], [], false),
            ["M:Goo.TextPresentationLayer.SetHiddenRange(System.String,Goo.TextRange)"] = new(["key", "textRange"], [], false),
            ["M:Goo.TextPresentationLayer.SetInlineSlot(System.String,Goo.TextRange,Goo.Blob)"] = new(["key", "textRange", "content"], [], false),
            ["M:Goo.TextPresentationLayer.SetReplacement(System.String,Goo.TextRange,System.String)"] = new(["key", "textRange", "text"], [], false),
            ["M:Goo.TextPresentationLayer.SetStyle(System.String,Goo.TextRange,Goo.Style)"] = new(["key", "textRange", "style"], [], false),
            ["M:Goo.TextSnapshot.#ctor(Goo.TextDocument)"] = new(["document"], [], false),
            ["M:Goo.TextSnapshot.GetLineIndex(System.Int32)"] = new(["offset"], [], true),
            ["M:Goo.TextSnapshot.GetLineRange(System.Int32)"] = new(["line"], [], true),
            ["M:Goo.TextSnapshot.GetLineText(System.Int32)"] = new(["line"], [], true),
            ["M:Goo.TextSnapshot.GetText"] = new([], [], true),
            ["M:Goo.TextSnapshot.GetText(Goo.TextRange)"] = new(["textRange"], [], true),
            ["M:Goo.Simulation.Done(System.Double)"] = new(["elapsed"], [], true),
            ["M:Goo.Simulation.Position(System.Double)"] = new(["elapsed"], [], true),
            ["M:Goo.Simulation.Velocity(System.Double)"] = new(["elapsed"], [], true),
            ["M:Goo.MotionConverter`1.#ctor(System.Int32,System.Action{`0,System.Double[]},System.Func{System.Double[],`0})"] = new(["dimensions", "read", "write"], [], false),
            ["M:Goo.Motion.Tween(System.Double,Goo.Easing)"] = new(["duration", "easing"], [], true),
            ["M:Goo.MotionVelocity.Add(Goo.MotionVelocity)"] = new(["other"], [], true),
            ["M:Goo.MotionVelocity.Components(System.Double[])"] = new(["values"], [], true),
            ["M:Goo.MotionVelocity.Uniform(System.Double)"] = new(["value"], [], true),
            ["M:Goo.Tokens.Get``1"] = new([], ["T"], true),
            ["M:Goo.Tokens.Scope``2(``0,System.Func{``1})"] = new(["tokens", "body"], ["T", "R"], true),
            ["M:Goo.Window.ConfigureApplication(System.String,System.String,System.String)"] = new(["name", "version", "identifier"], [], false),
            ["M:Goo.Window.DragRegion(Goo.Container)"] = new(["region"], [], true),
            ["M:Goo.Window.PerformAccessibilityAction(Goo.AccessibilityId,Goo.AccessibilityActionRequest)"] = new(["id", "request"], [], true),
            ["M:Goo.Window.Post(System.Action)"] = new(["action"], [], false),
            ["M:Goo.Window.Open"] = new([], [], true),
            ["M:Goo.Window.Pump(System.Double)"] = new(["dt"], [], false),
            ["M:Goo.Window.RequestClose"] = new([], [], false),
            ["M:Goo.Window.TryPost(System.Action)"] = new(["action"], [], true),
            ["T:Goo.Anim`1"] = new([], ["T"], false),
            ["T:Goo.Cell`1"] = new([], ["TInput"], false),
            ["T:Goo.MotionConverter`1"] = new([], ["T"], false),
        };

    [Fact]
    public void GeneratedXmlCoversThePublicApi()
    {
        AssertApprovedCallablesAreTracked();
        var members = LoadDocumentationMembers();
        var expected = ExpectedDocumentationIds().Order(StringComparer.Ordinal).ToArray();

        Assert.Equal(expected, members.Keys.Order(StringComparer.Ordinal));
        foreach (var type in SynthesizedPrimaryDataTypes)
        {
            var summary = members[$"T:{type.FullName}"].Element("summary")!.Value;
            foreach (var property in type.GetProperties(PublicDeclared))
                Assert.Contains(property.Name, summary, StringComparison.Ordinal);
        }
        foreach (var (id, member) in members)
        {
            Assert.True(HasText(member.Element("summary")), $"{id} needs a summary.");
            var shape = Shapes.TryGetValue(id, out var expectedShape)
                ? expectedShape
                : DocumentationShape.Empty;
            Assert.Equal(shape.Parameters, TagNames(member, "param"));
            Assert.Equal(shape.TypeParameters, TagNames(member, "typeparam"));
            Assert.Equal(shape.Returns, HasText(member.Element("returns")));
        }
    }

    [Fact]
    public void EnumsInterfacesAndWindowPartialsRequireSourceDocumentation()
    {
        var supplemented = LoadSupplementMemberIds();
        var sources = Directory.EnumerateFiles(
                Path.Combine(FindRepositoryRoot().FullName, "Goo"), "*.gs", SearchOption.AllDirectories)
            .Select(File.ReadAllText)
            .ToArray();

        foreach (var type in ApiTypes().Where(type => type.IsEnum || type.IsInterface))
        {
            var kind = type.IsEnum ? "enum" : @"(?:sealed\s+)?interface";
            Assert.Contains(sources, source => Regex.IsMatch(
                source,
                $@"(?m)^///\s+.+\r?\n(?:@\w+\r?\n)?public\s+{kind}\s+{Regex.Escape(SourceName(type))}\b"));
            foreach (var property in type.GetProperties(PublicDeclared))
            {
                if (supplemented.Contains($"P:{type.FullName}.{property.Name}"))
                    continue;
                Assert.Contains(sources, source => Regex.IsMatch(
                    source,
                    $@"(?m)^\s*///\s+.+\r?\n\s*prop\s+{Regex.Escape(property.Name)}\b"));
            }
            foreach (var method in type.GetMethods(PublicDeclared).Where(method => !method.IsSpecialName))
            {
                Assert.Contains(sources, source => Regex.IsMatch(
                    source,
                    $@"(?m)^\s*///\s+.+(?:\r?\n\s*///\s+.*)*\r?\n\s*(?:public\s+)?func\s+{Regex.Escape(method.Name)}\b"));
            }
        }

        var windowSources = sources
            .Where(source => source.Contains("public partial class Window", StringComparison.Ordinal))
            .ToArray();
        Assert.NotEmpty(windowSources);
        Assert.All(windowSources, source => Assert.Matches(
            @"(?m)^///\s+.+\r?\npublic partial class Window\b",
            source));

    }

    [Fact]
    public void ApiReferenceDocumentsUniformShapeStrokeContract()
    {
        var shapes = ReadApiPage("shapes.md");
        var style = ReadApiPage("style.md");

        Assert.Contains("Displays a vector path with fill and one uniform stroke.",
            shapes, StringComparison.Ordinal);
        Assert.Contains("Sets every box border width or the uniform Shape stroke width.",
            style, StringComparison.Ordinal);
    }

    [Fact]
    public void ApiReferenceDocumentsStyleCompositionAndGradientClearing()
    {
        var style = ReadApiPage("style.md");

        Assert.Contains("copies another style's ordered declarations at its exact declaration position",
            style, StringComparison.Ordinal);
        Assert.Contains("`BackgroundGradient: nil` is an explicit clear declaration",
            style, StringComparison.Ordinal);
    }

    [Fact]
    public void ApiReferenceDocumentsKeyboardAndFocusRouting()
    {
        var input = ReadApiPage("input.md");

        Assert.Contains("start at the currently focused element and bubble through its parents",
            input, StringComparison.Ordinal);
        Assert.Contains("updates the old and new `Focused` states first",
            input, StringComparison.Ordinal);
        Assert.Contains("depth-first tree order and wrap at the ends",
            input, StringComparison.Ordinal);
    }

    [Fact]
    public void ApiReferenceDocumentsTextMaxLinesContract()
    {
        var style = ReadApiPage("style.md");

        Assert.Contains("Zero keeps all lines; negative values throw ArgumentOutOfRangeException.",
            style, StringComparison.Ordinal);
        Assert.Contains("It does not inherit, change TextEntry, or interpolate through transitions.",
            style, StringComparison.Ordinal);
    }

    [Fact]
    public void ApiReferenceDocumentsTextStrokeContract()
    {
        var style = ReadApiPage("style.md");

        Assert.Contains("The stroke is paint-only, outlines glyphs only, and snaps during transitions.",
            style, StringComparison.Ordinal);
        Assert.Contains("Sets the inherited glyph stroke color without changing text layout.",
            style, StringComparison.Ordinal);
    }

    [Fact]
    public void ApiReferenceDocumentsDirectionContract()
    {
        var style = ReadApiPage("style.md");
        var text = ReadApiPage("text.md");

        Assert.Contains("Auto keeps flex layout left-to-right and detects each text paragraph's direction.",
            style, StringComparison.Ordinal);
        Assert.Contains("Start is the default and follows paragraph direction.",
            style, StringComparison.Ordinal);
        Assert.Contains("MoveLeft and MoveRight use visual order while mounted and logical document order otherwise.",
            text, StringComparison.Ordinal);
    }

    private static string ReadApiPage(string name) => File.ReadAllText(
        Path.Combine(FindRepositoryRoot().FullName, "docs", "api", name));

    private static void AssertApprovedCallablesAreTracked()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "PublicApi.approved.txt");
        Assert.True(File.Exists(path), $"Missing approved public API baseline at {path}.");
        var abstractTypes = ApiTypes()
            .Where(type => type.IsAbstract)
            .Select(type => type.FullName)
            .ToHashSet(StringComparer.Ordinal);
        var generatedNames = new HashSet<string>(StringComparer.Ordinal)
        {
            "Deconstruct", "Equals", "GetHashCode", "ToString", "op_Equality", "op_Inequality",
        };
        var count = File.ReadLines(path)
            .Select(line => line.Split('|'))
            .Count(parts =>
                parts[0] == "ctor"
                    && parts[1] != "Goo.Cell`1"
                    && !SynthesizedPrimaryDataTypes.Any(type => type.FullName == parts[1])
                    && !abstractTypes.Contains(parts[1])
                || parts[0] == "method" && !generatedNames.Contains(parts[2]));
        Assert.Equal(count, ExpectedMethodIds.Length);
    }

    private static IEnumerable<string> ExpectedDocumentationIds()
    {
        var types = ApiTypes().ToArray();
        var typeIds = types
            .Where(type => type != typeof(Window))
            .Select(type => $"T:{type.FullName}");
        var propertyIds = types
            .Where(type => !SynthesizedPrimaryDataTypes.Contains(type))
            .SelectMany(type => type.GetProperties(PublicDeclared)
                .Select(property => $"P:{type.FullName}.{property.Name}"));
        var eventIds = types.SelectMany(type => type.GetEvents(PublicDeclared)
            .Select(@event => $"E:{type.FullName}.{@event.Name}"));
        return ExpectedMethodIds.Concat(ExpectedProtectedMethodIds).Concat(ExpectedEqualityDocumentationIds).Concat(ExpectedEnumFieldIds).Concat(typeIds).Concat(propertyIds).Concat(eventIds)
            .Append("P:Goo.Cell`1.Input");
    }

    private static IEnumerable<Type> ApiTypes()
    {
        return typeof(Window).Assembly.GetExportedTypes()
            .Where(type => type.Name != "<Program>")
            .Where(type => type.FullName != "Goo.PerformanceFixtures");
    }

    private static Dictionary<string, XElement> LoadDocumentationMembers()
    {
        var path = Path.ChangeExtension(typeof(Window).Assembly.Location, ".xml");
        Assert.True(File.Exists(path), $"Missing generated XML documentation at {path}.");
        return XDocument.Load(path).Root!.Element("members")!.Elements("member")
            .ToDictionary(member => member.Attribute("name")!.Value, StringComparer.Ordinal);
    }

    private static HashSet<string> LoadSupplementMemberIds()
    {
        var path = Path.Combine(FindRepositoryRoot().FullName, "docs", "api", "Goo.xml.supplement.xml");
        return XDocument.Load(path).Descendants("member")
            .Select(member => member.Attribute("name")?.Value)
            .Where(id => id != null)
            .Select(id => id!)
            .ToHashSet(StringComparer.Ordinal);
    }

    private static DirectoryInfo FindRepositoryRoot()
    {
        foreach (var start in new[] { Directory.GetCurrentDirectory(), AppContext.BaseDirectory })
        {
            for (var directory = new DirectoryInfo(start); directory != null; directory = directory.Parent)
            {
                if (File.Exists(Path.Combine(directory.FullName, "Goo", "Goo.gsproj")))
                {
                    return directory;
                }
            }
        }

        throw new DirectoryNotFoundException("Could not find the Goo repository root.");
    }

    private static string SourceName(Type type)
    {
        var name = type.Name;
        var tick = name.IndexOf('`');
        return tick < 0 ? name : name[..tick];
    }

    private static string[] TagNames(XElement member, string tag)
    {
        return member.Elements(tag)
            .Select(element => element.Attribute("name")!.Value)
            .ToArray();
    }

    private static bool HasText(XElement? element)
    {
        return !string.IsNullOrWhiteSpace(element?.Value);
    }

    private readonly record struct DocumentationShape(
        string[] Parameters, string[] TypeParameters, bool Returns)
    {
        public static readonly DocumentationShape Empty = new([], [], false);
    }
}
