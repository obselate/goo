using Android.Text;
using Android.Util;
using Android.Views.InputMethods;
using Goo;
using Goo.Android;
using JavaString = Java.Lang.String;

namespace GooAndroidSmokeApp;

internal static class AndroidInputSmoke
{
    internal static bool TryRun(GooView view)
    {
        var input = view.Window.PlatformInput;
        if (!Focus(input, editor => !editor.IsPassword && !editor.IsMultiline))
            return false;
        using var entryInfo = new EditorInfo();
        using var entry = view.OnCreateInputConnection(entryInfo)
            ?? throw new InvalidOperationException("Entry input connection is missing.");
        SetText(input, entry, "");
        using (var key = new Android.Views.KeyEvent(0, 0, Android.Views.KeyEventActions.Down,
            Android.Views.Keycode.Numpad1, 0, Android.Views.MetaKeyStates.NumLockOn))
        {
            Require(key.UnicodeChar == '1', "Virtual numpad key has no printable character.");
            Require(view.OnKeyDown(key.KeyCode, key), "Unmapped printable key was not handled.");
            AssertEditor(input, "1", 1, 1, -1, -1);
        }
        SetText(input, entry, "abcd");
        Require(entry.SetSelection(1, 2), "Entry selection failed.");
        using (var replacement = new JavaString("x\ny"))
            Require(entry.CommitText(replacement, 1), "Sanitized entry commit failed.");
        AssertEditor(input, "axycd", 3, 3, -1, -1);
        SetText(input, entry, "abcd");
        Require(entry.SetSelection(1, 2), "Entry composing selection failed.");
        using (var replacement = new JavaString("x\ny"))
            Require(entry.SetComposingText(replacement, 1), "Sanitized preedit failed.");
        AssertEditor(input, "axycd", 3, 3, 1, 3);
        Require(entry.FinishComposingText(), "Preedit finish failed.");

        SetText(input, entry, "abcdef");
        Require(entry.SetSelection(5, 5), "Composing-region cursor setup failed.");
        Require(entry.SetComposingRegion(4, 1), "Reversed composing region failed.");
        AssertEditor(input, "abcdef", 5, 5, 1, 4);
        Require(entry.SetComposingRegion(-20, int.MaxValue), "Clamped composing region failed.");
        AssertEditor(input, "abcdef", 5, 5, 0, 6);
        Require(entry.FinishComposingText(), "Region finish failed.");

        VerifyComposingDeletion(input, entry);
        SetText(input, entry, "a😀b");
        Require(entry.SetSelection(3, 3), "Code point selection failed.");
        Require(entry.DeleteSurroundingTextInCodePoints(1, 0), "Code point deletion failed.");
        AssertEditor(input, "ab", 1, 1, -1, -1);
        Require(entry.GetTextBeforeCursorFormatted(50, 0)?.ToString() == "a", "Before-cursor context is stale.");
        Require(entry.GetTextAfterCursorFormatted(50, 0)?.ToString() == "b", "After-cursor context is stale.");
        using (var surrounding = entry.GetSurroundingText(50, 50, 0))
            Require(surrounding is { Text: "ab", SelectionStart: 1, SelectionEnd: 1, Offset: 0 },
                "Surrounding text did not use the focused editor.");
        Require(entry.GetCursorCapsMode(CapitalizationMode.Words | CapitalizationMode.Sentences) == 0,
            "Cursor capitalization used an empty platform buffer.");
        Require(entry.BeginBatchEdit() && entry.BeginBatchEdit(), "Nested IME batch failed.");
        using (var replacement = new JavaString("XY"))
            Require(entry.CommitText(replacement, 1), "Batched commit failed.");
        entry.EndBatchEdit();
        entry.EndBatchEdit();
        AssertEditor(input, "aXYb", 3, 3, -1, -1);

        Require(Focus(input, editor => editor.IsPassword), "Password editor did not focus.");
        using var passwordInfo = new EditorInfo();
        using var password = view.OnCreateInputConnection(passwordInfo)
            ?? throw new InvalidOperationException("Password input connection is missing.");
        Require((passwordInfo.InputType & InputTypes.MaskVariation) == InputTypes.TextVariationPassword,
            "Password EditorInfo does not request password input.");
        Require((passwordInfo.ImeOptions & ImeFlags.NoPersonalizedLearning) != 0,
            "Password EditorInfo allows personalized learning.");
        using (var stale = new JavaString("stale"))
            Require(!entry.CommitText(stale, 1), "Stale connection edited a different focused field.");
        Require(password.SetSelection(0, input.Editor!.Value.Text.Length), "Password selection failed.");
        Require(password.GetTextBeforeCursorFormatted(100, 0)?.ToString() == ""
            && password.GetTextAfterCursorFormatted(100, 0)?.ToString() == ""
            && password.GetSelectedTextFormatted(0)?.ToString() == "",
            "Password text was exposed through IME context.");
        using var request = new ExtractedTextRequest();
        Require(password.GetExtractedText(request, 0) is null, "Password extracted text was exposed.");
        Require(password.GetSurroundingText(100, 100, 0) is null, "Password surrounding text was exposed.");
        Require(password.GetCursorCapsMode(CapitalizationMode.Characters) == 0,
            "Password capitalization context was exposed.");

        Require(Focus(input, editor => editor.IsMultiline), "Multiline editor did not focus.");
        using var multilineInfo = new EditorInfo();
        using var multiline = view.OnCreateInputConnection(multilineInfo)
            ?? throw new InvalidOperationException("Multiline input connection is missing.");
        Require((multilineInfo.InputType & InputTypes.TextFlagMultiLine) != 0,
            "Multiline EditorInfo is missing multiline input.");
        VerifyComposingDeletion(input, multiline);
        SetText(input, multiline, "a\nb");
        Require(multiline.SetSelection(2, 2), "Multiline composing selection failed.");
        using (var composition = new JavaString("X\nY"))
            Require(multiline.SetComposingText(composition, 1), "Multiline preedit failed.");
        AssertEditor(input, "a\nX\nYb", 5, 5, 2, 5);
        Require(multiline.FinishComposingText(), "Multiline preedit finish failed.");
        AssertEditor(input, "a\nX\nYb", 5, 5, -1, -1);
        input.ClearFocus();
        Log.Info("GooInputSmoke", "PASS physical_printable sanitized_cursor region_bounds composition_deletion code_points context batches password stale_focus multiline");
        return true;
    }

    private static void VerifyComposingDeletion(PlatformInput input, IInputConnection connection)
    {
        SetText(input, connection, "abcdef");
        Require(connection.SetSelection(2, 4), "Composition deletion selection failed.");
        using (var composition = new JavaString("XY"))
            Require(connection.SetComposingText(composition, 1), "Composition deletion preedit failed.");
        Require(connection.DeleteSurroundingText(0, 0), "No-op surrounding deletion failed.");
        AssertEditor(input, "abXYef", 4, 4, 2, 4);
        Require(connection.DeleteSurroundingText(1, 1), "Surrounding deletion failed.");
        AssertEditor(input, "aXYf", 3, 3, 1, 3);
        Require(connection.FinishComposingText(), "Deleted preedit finish failed.");
        AssertEditor(input, "aXYf", 3, 3, -1, -1);
        SetText(input, connection, "a😀bc😀d");
        Require(connection.SetSelection(3, 5), "Code point composition selection failed.");
        using (var composition = new JavaString("XY"))
            Require(connection.SetComposingText(composition, 1), "Code point preedit failed.");
        Require(connection.DeleteSurroundingTextInCodePoints(1, 1), "Code point composing deletion failed.");
        AssertEditor(input, "aXYd", 3, 3, 1, 3);
        Require(connection.FinishComposingText(), "Code point preedit finish failed.");
    }

    private static void SetText(PlatformInput input, IInputConnection connection, string text)
    {
        Require(connection.FinishComposingText(), "Reset preedit failed.");
        Require(connection.SetSelection(0, input.Editor!.Value.Text.Length), "Reset selection failed.");
        using var value = new JavaString(text);
        Require(connection.CommitText(value, 1), "Reset text failed.");
    }

    private static bool Focus(PlatformInput input, Func<FocusedEditorSnapshot, bool> accepts)
    {
        for (var attempt = 0; attempt < 10; attempt++)
        {
            if (input.Editor is { } editor && accepts(editor))
                return true;
            if (!input.MoveFocus(true))
                return false;
        }
        return false;
    }

    private static void AssertEditor(PlatformInput input, string text, int start, int end, int composingStart, int composingEnd)
    {
        var editor = input.Editor ?? throw new InvalidOperationException("Editor focus was lost.");
        Require(editor.Text == text && editor.SelectionStart == start && editor.SelectionEnd == end
            && editor.CompositionStart == composingStart && editor.CompositionEnd == composingEnd,
            $"Editor mismatch: text={editor.Text}, selection={editor.SelectionStart}:{editor.SelectionEnd}, composition={editor.CompositionStart}:{editor.CompositionEnd}.");
    }

    private static void Require(bool condition, string message)
    {
        if (!condition)
            throw new InvalidOperationException(message);
    }
}
