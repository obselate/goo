package GooAndroidSmokeApp

import Android.OS
import Android.Text
import Android.Util
import Android.Views
import Android.Views.Autofill
import Android.Views.InputMethods
import Goo
import Goo.Android
import JavaString = Java.Lang.String
import System
import System.Linq

internal shared class AndroidInputSmoke {
    internal func TryRun(view GooView) bool {
        let input = view.Window.PlatformInput
        if !Focus(input, (editor FocusedEditorSnapshot) -> !editor.IsPassword && !editor.IsMultiline) {
            return false
        }
        using let entryInfo = EditorInfo()
        using let entry = view.OnCreateInputConnection(entryInfo) ??
            throw InvalidOperationException("Entry input connection is missing.")
        Require(
            (entryInfo.InputType & InputTypes.MaskVariation) == InputTypes.TextVariationEmailAddress &&
                (entryInfo.ImeOptions & ImeFlags(ImeAction.ImeMaskAction)) == ImeFlags(ImeAction.Next),
            "Entry input metadata did not reach EditorInfo."
        )
        Require(
            view.GetAutofillHints() is {} hints && Enumerable.SequenceEqual(hints, []string{"emailAddress"}),
            "Entry autofill hints did not reach the view."
        )
        {
            using let fill = AutofillValue.ForText("filled@example.com")
            view.Autofill(fill)
        }
        AssertEditor(input, "filled@example.com", 18, 18, -1, -1)
        Log.Info("GooInputSmoke", "PASS edit_metadata autofill_hints autofill_value")
        SetText(input, entry, "")
        {
            using let key = Android.Views.KeyEvent(
                0,
                0,
                KeyEventActions.Down,
                Keycode.Numpad1,
                0,
                MetaKeyStates.NumLockOn
            )
            Require(key.UnicodeChar == int32('1'), "Virtual numpad key has no printable character.")
            Require(view.OnKeyDown(key.KeyCode, key), "Unmapped printable key was not handled.")
            AssertEditor(input, "1", 1, 1, -1, -1)
        }
        SetText(input, entry, "abcd")
        Require(entry.SetSelection(1, 2), "Entry selection failed.")
        {
            using let replacement = JavaString("x\ny")
            Require(entry.CommitText(replacement, 1), "Sanitized entry commit failed.")
        }
        AssertEditor(input, "axycd", 3, 3, -1, -1)
        SetText(input, entry, "abcd")
        Require(entry.SetSelection(1, 2), "Entry composing selection failed.")
        {
            using let replacement = JavaString("x\ny")
            Require(entry.SetComposingText(replacement, 1), "Sanitized preedit failed.")
        }
        AssertEditor(input, "axycd", 3, 3, 1, 3)
        Require(entry.FinishComposingText(), "Preedit finish failed.")
        SetText(input, entry, "abcdef")
        Require(entry.SetSelection(5, 5), "Composing-region cursor setup failed.")
        Require(entry.SetComposingRegion(4, 1), "Reversed composing region failed.")
        AssertEditor(input, "abcdef", 5, 5, 1, 4)
        Require(entry.SetComposingRegion(-20, int32.MaxValue), "Clamped composing region failed.")
        AssertEditor(input, "abcdef", 5, 5, 0, 6)
        Require(entry.FinishComposingText(), "Region finish failed.")
        VerifyComposingDeletion(input, entry)
        SetText(input, entry, "a😀b")
        Require(entry.SetSelection(3, 3), "Code point selection failed.")
        Require(entry.DeleteSurroundingTextInCodePoints(1, 0), "Code point deletion failed.")
        AssertEditor(input, "ab", 1, 1, -1, -1)
        Require(
            entry.GetTextBeforeCursorFormatted(50, GetTextFlags(0))?.ToString() == "a",
            "Before-cursor context is stale."
        )
        Require(
            entry.GetTextAfterCursorFormatted(50, GetTextFlags(0))?.ToString() == "b",
            "After-cursor context is stale."
        )
        {
            using let surrounding = entry.GetSurroundingText(50, 50, 0)
            Require(
                surrounding != nil &&
                    surrounding.Text == "ab" &&
                    surrounding.SelectionStart == 1 &&
                    surrounding.SelectionEnd == 1 &&
                    surrounding.Offset == 0,
                "Surrounding text did not use the focused editor."
            )
        }
        Require(
            entry.GetCursorCapsMode(CapitalizationMode.Words | CapitalizationMode.Sentences) == 0,
            "Cursor capitalization used an empty platform buffer."
        )
        Require(entry.BeginBatchEdit() && entry.BeginBatchEdit(), "Nested IME batch failed.")
        {
            using let replacement = JavaString("XY")
            Require(entry.CommitText(replacement, 1), "Batched commit failed.")
        }
        entry.EndBatchEdit()
        entry.EndBatchEdit()
        AssertEditor(input, "aXYb", 3, 3, -1, -1)
        Require(Focus(input, (editor FocusedEditorSnapshot) -> editor.IsPassword), "Password editor did not focus.")
        using let passwordInfo = EditorInfo()
        using let password = view.OnCreateInputConnection(passwordInfo) ??
            throw InvalidOperationException("Password input connection is missing.")
        Require(
            (passwordInfo.InputType & InputTypes.MaskVariation) == InputTypes.TextVariationPassword,
            "Password EditorInfo does not request password input."
        )
        Require(
            (passwordInfo.ImeOptions & ImeFlags.NoPersonalizedLearning) != 0,
            "Password EditorInfo allows personalized learning."
        )
        {
            using let stale = JavaString("stale")
            Require(!entry.CommitText(stale, 1), "Stale connection edited a different focused field.")
        }
        Require(password.SetSelection(0, input.Editor!!.Text.Length), "Password selection failed.")
        Require(
            password.GetTextBeforeCursorFormatted(100, GetTextFlags(0))?.ToString() == "" &&
                password
                .GetTextAfterCursorFormatted(100, GetTextFlags(0))?.ToString() == "" &&
                password
                .GetSelectedTextFormatted(GetTextFlags(0))?.ToString() == "",
            "Password text was exposed through IME context."
        )
        using let request = ExtractedTextRequest()
        Require(password.GetExtractedText(request, GetTextFlags(0)) == nil, "Password extracted text was exposed.")
        Require(password.GetSurroundingText(100, 100, 0) == nil, "Password surrounding text was exposed.")
        Require(
            password.GetCursorCapsMode(CapitalizationMode.Characters) == 0,
            "Password capitalization context was exposed."
        )
        Require(Focus(input, (editor FocusedEditorSnapshot) -> editor.IsMultiline), "Multiline editor did not focus.")
        using let multilineInfo = EditorInfo()
        using let multiline = view.OnCreateInputConnection(multilineInfo) ??
            throw InvalidOperationException("Multiline input connection is missing.")
        Require(
            (multilineInfo.InputType & InputTypes.TextFlagMultiLine) != 0,
            "Multiline EditorInfo is missing multiline input."
        )
        VerifyComposingDeletion(input, multiline)
        SetText(input, multiline, "a\nb")
        Require(multiline.SetSelection(2, 2), "Multiline composing selection failed.")
        {
            using let composition = JavaString("X\nY")
            Require(multiline.SetComposingText(composition, 1), "Multiline preedit failed.")
        }
        AssertEditor(input, `a
X
Yb`, 5, 5, 2, 5)
        Require(multiline.FinishComposingText(), "Multiline preedit finish failed.")
        AssertEditor(input, `a
X
Yb`, 5, 5, -1, -1)
        VerifyIncompleteKeySequence(view)
        return true
    }

    private func VerifyIncompleteKeySequence(view GooView) {
        let input = view.Window.PlatformInput
        Require(
            Focus(input, (editor FocusedEditorSnapshot) -> !editor.IsPassword && !editor.IsMultiline),
            "Key-repeat editor did not focus."
        )
        using let info = EditorInfo()
        using let connection = view.OnCreateInputConnection(info) ??
            throw InvalidOperationException("Key-repeat input connection is missing.")
        SetText(input, connection, "abcdef")
        let downTime = SystemClock.UptimeMillis()
        SendBackspaceDown(view, downTime, 0)
        AssertEditor(input, "abcde", 5, 5, -1, -1)
        Require(
            view.PostDelayed(
                () -> {
                    AssertEditor(input, "abcde", 5, 5, -1, -1)
                    SendBackspaceDown(view, downTime, 1)
                    AssertEditor(input, "abcd", 4, 4, -1, -1)
                    SendBackspaceDown(view, downTime, 2)
                    AssertEditor(input, "abc", 3, 3, -1, -1)
                    Require(
                        view.PostDelayed(
                            () -> {
                                AssertEditor(input, "abc", 3, 3, -1, -1)
                                input.ClearFocus()
                                Log.Info(
                                    "GooInputSmoke",
                                    "PASS physical_printable sanitized_cursor region_bounds composition_deletion code_points context batches password stale_focus multiline incomplete_key_sequence native_key_repeat"
                                )
                            },
                            650
                        ),
                        "Final key-repeat check was not scheduled."
                    )
                },
                650
            ),
            "Missing-key-up check was not scheduled."
        )
    }

    private func SendBackspaceDown(view GooView, downTime int64, repeat int32) {
        using let key = Android.Views.KeyEvent(
            downTime,
            SystemClock.UptimeMillis(),
            KeyEventActions.Down,
            Keycode.Del,
            repeat
        )
        Require(view.OnKeyDown(key.KeyCode, key), "Backspace down was not handled.")
    }

    private func VerifyComposingDeletion(input PlatformInput, connection IInputConnection) {
        SetText(input, connection, "abcdef")
        Require(connection.SetSelection(2, 4), "Composition deletion selection failed.")
        {
            using let composition = JavaString("XY")
            Require(connection.SetComposingText(composition, 1), "Composition deletion preedit failed.")
        }
        Require(connection.DeleteSurroundingText(0, 0), "No-op surrounding deletion failed.")
        AssertEditor(input, "abXYef", 4, 4, 2, 4)
        Require(connection.DeleteSurroundingText(1, 1), "Surrounding deletion failed.")
        AssertEditor(input, "aXYf", 3, 3, 1, 3)
        Require(connection.FinishComposingText(), "Deleted preedit finish failed.")
        AssertEditor(input, "aXYf", 3, 3, -1, -1)
        SetText(input, connection, "a😀bc😀d")
        Require(connection.SetSelection(3, 5), "Code point composition selection failed.")
        {
            using let composition = JavaString("XY")
            Require(connection.SetComposingText(composition, 1), "Code point preedit failed.")
        }
        Require(connection.DeleteSurroundingTextInCodePoints(1, 1), "Code point composing deletion failed.")
        AssertEditor(input, "aXYd", 3, 3, 1, 3)
        Require(connection.FinishComposingText(), "Code point preedit finish failed.")
    }

    private func SetText(input PlatformInput, connection IInputConnection, text string) {
        Require(connection.FinishComposingText(), "Reset preedit failed.")
        Require(connection.SetSelection(0, input.Editor!!.Text.Length), "Reset selection failed.")
        using let value = JavaString(text)
        Require(connection.CommitText(value, 1), "Reset text failed.")
    }

    private func Focus(input PlatformInput, accepts(FocusedEditorSnapshot) -> bool) bool {
        for var attempt = 0; attempt < 10; attempt++ {
            if input.Editor is {} editor && accepts(editor) {
                return true
            }
            if !input.MoveFocus(true) {
                return false
            }
        }
        return false
    }

    private func AssertEditor(
        input PlatformInput,
        text string,
        start int32,
        end int32,
        composingStart int32,
        composingEnd int32
    ) {
        let editor = input.Editor ?? throw InvalidOperationException("Editor focus was lost.")
        Require(
            editor.Text == text &&
                editor.SelectionStart == start &&
                editor.SelectionEnd == end &&
                editor.CompositionStart == composingStart &&
                editor.CompositionEnd == composingEnd,
            "Editor mismatch: text=${editor.Text}, selection=${editor.SelectionStart}:${editor.SelectionEnd}, composition=${editor.CompositionStart}:${editor.CompositionEnd}."
        )
    }

    private func Require(condition bool, message string) {
        if !condition {
            throw InvalidOperationException(message)
        }
    }
}
