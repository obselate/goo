package Goo.Android

import Android
import Android.Text
import Android.Views
import Android.Views.InputMethods
import AndroidKeyEvent = Android.Views.KeyEvent
import Goo
import Java.Lang
import Math = System.Math

internal class GooInputConnection(view GooView, focusId int64) : BaseInputConnection(view, true) {
    private var closed bool

    private prop Editor FocusedEditorSnapshot? {
        get {
            var __spill0 FocusedEditorSnapshot?
            var editor FocusedEditorSnapshot
            return if !closed && {
                __spill0 = view.Input.Editor
                __spill0 != nil && {
                    editor = __spill0!!
                    true
                }
            } && editor.FocusId == focusId {
                editor
            } else {
                nil
            }
        }
    }

    override func CommitText(text ICharSequence?, newCursorPosition int32) bool -> Replace(
        text,
        newCursorPosition,
        false
    )

    override func SetComposingText(text ICharSequence?, newCursorPosition int32) bool -> Replace(
        text,
        newCursorPosition,
        true
    )

    private func Replace(text ICharSequence?, newCursorPosition int32, composing bool) bool {
        guard let editor = Editor else {
            return false
        }
        if editor.IsReadOnly {
            return false
        }
        let value = text?.ToString() ?? ""
        let start = if editor.CompositionStart >= 0 {
            editor.CompositionStart
        } else {
            Math.Min(editor.SelectionStart, editor.SelectionEnd)
        }
        let changed = if composing {
            view.Input.SetComposition(value, value.Length, 0)
        } else {
            view.Input.CommitText(value)
        }
        if !changed {
            return false
        }
        guard let updated = Editor else {
            return false
        }
        let insertionEnd = if composing && updated.CompositionEnd >= 0 {
            updated.CompositionEnd
        } else {
            updated.SelectionEnd
        }
        let requested = if newCursorPosition > 0 {
            int64(insertionEnd) + int64(newCursorPosition) - int64(1)
        } else {
            int64(start) + int64(newCursorPosition)
        }
        let cursor = int32(Math.Clamp(requested, 0, updated.Text.Length))
        if updated.SelectionStart != cursor || updated.SelectionEnd != cursor {
            view.Input.SetSelection(cursor, cursor)
        }
        return true
    }

    override func SetComposingRegion(start int32, end int32) bool {
        let editor FocusedEditorSnapshot? = Editor
        if editor == nil {
            return false
        }
        let low = Math.Clamp(Math.Min(start, end), 0, editor.Text.Length)
        let high = Math.Clamp(Math.Max(start, end), 0, editor.Text.Length)
        return if low == high {
            view.Input.FinishComposition()
        } else {
            view.Input.SetCompositionRange(low, high)
        }
    }

    override func FinishComposingText() bool -> Editor != nil && view.Input.FinishComposition()

    override func SetSelection(start int32, end int32) bool -> Editor != nil && view.Input.SetSelection(start, end)

    override func DeleteSurroundingText(beforeLength int32, afterLength int32) bool -> Editor != nil &&
        beforeLength >= 0 &&
        afterLength >= 0 &&
        view
        .Input
        .DeleteSurroundingText(beforeLength, afterLength)

    override func DeleteSurroundingTextInCodePoints(beforeLength int32, afterLength int32) bool {
        let editor FocusedEditorSnapshot? = Editor
        if editor == nil || beforeLength < 0 || afterLength < 0 {
            return false
        }
        var low = Math.Min(editor.SelectionStart, editor.SelectionEnd)
        var high = Math.Max(editor.SelectionStart, editor.SelectionEnd)
        if editor.CompositionStart >= 0 && editor.CompositionEnd >= 0 {
            low = Math.Min(low, editor.CompositionStart)
            high = Math.Max(high, editor.CompositionEnd)
        }
        var start = low
        var end = high
        for var i = 0; i < beforeLength && start > 0; i++ {
            start--
            if char.IsLowSurrogate(editor.Text[start]) {
                if start == 0 || !char.IsHighSurrogate(editor.Text[start - 1]) {
                    return false
                }
                start--
            } else if char.IsHighSurrogate(editor.Text[start]) {
                return false
            }
        }
        for var i = 0; i < afterLength && end < editor.Text.Length; i++ {
            if char.IsHighSurrogate(editor.Text[end]) {
                if end + 1 >= editor.Text.Length || !char.IsLowSurrogate(editor.Text[end + 1]) {
                    return false
                }
                end++
            } else if char.IsLowSurrogate(editor.Text[end]) {
                return false
            }
            end++
        }
        return view.Input.DeleteSurroundingText(low - start, end - high)
    }

    override func GetTextBeforeCursorFormatted(length int32, flags GetTextFlags) ICharSequence? {
        guard let editor = Editor else {
            return Java.Lang.String("")
        }
        if editor.IsPassword || length < 0 {
            return Java.Lang.String("")
        }
        let end = Math.Min(editor.SelectionStart, editor.SelectionEnd)
        return Java.Lang.String(editor.Text[Math.Max(0, end - length) .. end])
    }

    override func GetTextAfterCursorFormatted(length int32, flags GetTextFlags) ICharSequence? {
        guard let editor = Editor else {
            return Java.Lang.String("")
        }
        if editor.IsPassword || length < 0 {
            return Java.Lang.String("")
        }
        let start = Math.Max(editor.SelectionStart, editor.SelectionEnd)
        return Java.Lang.String(editor.Text[start .. (start + Math.Min(editor.Text.Length - start, length))])
    }

    override func GetSelectedTextFormatted(flags GetTextFlags) ICharSequence? {
        guard let editor = Editor else {
            return Java.Lang.String("")
        }
        if editor.IsPassword {
            return Java.Lang.String("")
        }
        return Java.Lang.String(
            editor.Text[
                Math.Min(editor.SelectionStart, editor.SelectionEnd) .. Math.Max(
                    editor.SelectionStart,
                    editor.SelectionEnd
                )
            ]
        )
    }

    override func GetSurroundingText(beforeLength int32, afterLength int32, flags int32) SurroundingText? {
        guard let editor = Editor else {
            return nil
        }
        if editor.IsPassword || beforeLength < 0 || afterLength < 0 {
            return nil
        }
        let low = Math.Min(editor.SelectionStart, editor.SelectionEnd)
        let high = Math.Max(editor.SelectionStart, editor.SelectionEnd)
        let start = low - Math.Min(low, beforeLength)
        let end = high + Math.Min(editor.Text.Length - high, afterLength)
        return SurroundingText(
            editor.Text[start .. end],
            editor.SelectionStart - start,
            editor.SelectionEnd - start,
            start
        )
    }

    override func GetCursorCapsMode(reqModes CapitalizationMode) CapitalizationMode {
        guard let editor = Editor else {
            return CapitalizationMode(0)
        }
        if editor.IsPassword {
            return CapitalizationMode(0)
        }
        return TextUtils.GetCapsMode(editor.Text, Math.Min(editor.SelectionStart, editor.SelectionEnd), reqModes)
    }

    override func GetExtractedText(request ExtractedTextRequest?, flags GetTextFlags) ExtractedText? {
        guard let editor = Editor else {
            return nil
        }
        if editor.IsPassword {
            return nil
        }
        return ExtractedText{
            Text: Java.Lang.String(editor.Text),
            StartOffset: 0,
            PartialStartOffset: -1,
            PartialEndOffset: -1,
            SelectionStart: editor.SelectionStart,
            SelectionEnd: editor.SelectionEnd
        }
    }

    override func PerformEditorAction(actionCode ImeAction) bool {
        if Editor == nil {
            return false
        }
        if actionCode == ImeAction.Next {
            return view.Input.MoveFocus(true)
        }
        if actionCode == ImeAction.Previous {
            return view.Input.MoveFocus(false)
        }
        let result = view.Input.Execute(TextCommand(TextCommandKind.Submit, "", false))
        if actionCode == ImeAction.Done && view.DismissKeyboardOnSubmit {
            view.EndTextInput()
        }
        return result
    }

    override func PerformContextMenuAction(id int32) bool {
        let editor FocusedEditorSnapshot? = Editor
        if editor == nil {
            return false
        }
        let kind = switch id {
            case Android.Resource.Id.SelectAll: TextCommandKind.SelectAll
            case Android.Resource.Id.Copy: TextCommandKind.Copy
            case Android.Resource.Id.Cut: TextCommandKind.Cut
            case Android.Resource.Id.Paste: TextCommandKind.Paste
            default: default(TextCommandKind?)
        }
        if kind == nil || editor.IsPassword && (kind is TextCommandKind.Copy or TextCommandKind.Cut) {
            return false
        }
        return view.Input.Execute(
            TextCommand(
                kind,
                if kind == TextCommandKind.Paste {
                    view.GetClipboardText()
                } else {
                    ""
                },
                false
            )
        )
    }

    override func SendKeyEvent(e AndroidKeyEvent?) bool {
        if Editor == nil || e == nil {
            return false
        }
        return if e.Action == KeyEventActions.Down {
            view.OnKeyDown(e.KeyCode, e)
        } else {
            view.OnKeyUp(e.KeyCode, e)
        }
    }

    override func BeginBatchEdit() bool -> Editor != nil && view.BeginInputBatch(this)

    override func EndBatchEdit() bool -> view.EndInputBatch(this)

    override func CloseConnection() {
        if Editor != nil {
            view.Input.FinishComposition()
        }
        view.EndInputBatches(this)
        closed = true
        base.CloseConnection()
    }
}
