using Android.Views;
using Android.Views.InputMethods;
using Java.Lang;
using Math = System.Math;
using AndroidKeyEvent = Android.Views.KeyEvent;

namespace Goo.Android;

internal sealed class GooInputConnection(GooView view, long focusId) : BaseInputConnection(view, true)
{
    private bool closed;
    private FocusedEditorSnapshot? Editor => !closed && view.Input.Editor is { } editor && editor.FocusId == focusId
        ? editor : null;

    public override bool CommitText(ICharSequence? text, int newCursorPosition) => Replace(text, newCursorPosition, false);

    public override bool SetComposingText(ICharSequence? text, int newCursorPosition) => Replace(text, newCursorPosition, true);

    private bool Replace(ICharSequence? text, int newCursorPosition, bool composing)
    {
        if (Editor is not { } editor || editor.IsReadOnly)
            return false;
        var value = text?.ToString() ?? "";
        var start = editor.CompositionStart >= 0 ? editor.CompositionStart : Math.Min(editor.SelectionStart, editor.SelectionEnd);
        var changed = composing
            ? view.Input.SetComposition(value, value.Length, 0)
            : view.Input.CommitText(value);
        if (!changed || Editor is not { } updated)
            return false;
        var insertionEnd = composing && updated.CompositionEnd >= 0 ? updated.CompositionEnd : updated.SelectionEnd;
        var requested = newCursorPosition > 0 ? (long)insertionEnd + newCursorPosition - 1 : (long)start + newCursorPosition;
        var cursor = (int)Math.Clamp(requested, 0, updated.Text.Length);
        if (updated.SelectionStart != cursor || updated.SelectionEnd != cursor)
            view.Input.SetSelection(cursor, cursor);
        return true;
    }

    public override bool SetComposingRegion(int start, int end)
    {
        if (Editor is not { } editor)
            return false;
        var low = Math.Clamp(Math.Min(start, end), 0, editor.Text.Length);
        var high = Math.Clamp(Math.Max(start, end), 0, editor.Text.Length);
        return low == high ? view.Input.FinishComposition() : view.Input.SetCompositionRange(low, high);
    }
    public override bool FinishComposingText() => Editor is not null && view.Input.FinishComposition();
    public override bool SetSelection(int start, int end) => Editor is not null && view.Input.SetSelection(start, end);
    public override bool DeleteSurroundingText(int beforeLength, int afterLength) => Editor is not null
        && beforeLength >= 0 && afterLength >= 0 && view.Input.DeleteSurroundingText(beforeLength, afterLength);

    public override bool DeleteSurroundingTextInCodePoints(int beforeLength, int afterLength)
    {
        if (Editor is not { } editor || beforeLength < 0 || afterLength < 0)
            return false;
        var low = Math.Min(editor.SelectionStart, editor.SelectionEnd);
        var high = Math.Max(editor.SelectionStart, editor.SelectionEnd);
        if (editor.CompositionStart >= 0 && editor.CompositionEnd >= 0)
        {
            low = Math.Min(low, editor.CompositionStart);
            high = Math.Max(high, editor.CompositionEnd);
        }
        var start = low;
        var end = high;
        for (var i = 0; i < beforeLength && start > 0; i++)
        {
            start--;
            if (char.IsLowSurrogate(editor.Text[start]))
            {
                if (start == 0 || !char.IsHighSurrogate(editor.Text[start - 1]))
                    return false;
                start--;
            }
            else if (char.IsHighSurrogate(editor.Text[start]))
                return false;
        }
        for (var i = 0; i < afterLength && end < editor.Text.Length; i++)
        {
            if (char.IsHighSurrogate(editor.Text[end]))
            {
                if (end + 1 >= editor.Text.Length || !char.IsLowSurrogate(editor.Text[end + 1]))
                    return false;
                end++;
            }
            else if (char.IsLowSurrogate(editor.Text[end]))
                return false;
            end++;
        }
        return view.Input.DeleteSurroundingText(low - start, end - high);
    }

    public override ICharSequence? GetTextBeforeCursorFormatted(int length, GetTextFlags flags)
    {
        if (Editor is not { IsPassword: false } editor || length < 0)
            return new Java.Lang.String("");
        var end = Math.Min(editor.SelectionStart, editor.SelectionEnd);
        return new Java.Lang.String(editor.Text[Math.Max(0, end - length)..end]);
    }

    public override ICharSequence? GetTextAfterCursorFormatted(int length, GetTextFlags flags)
    {
        if (Editor is not { IsPassword: false } editor || length < 0)
            return new Java.Lang.String("");
        var start = Math.Max(editor.SelectionStart, editor.SelectionEnd);
        return new Java.Lang.String(editor.Text[start..(start + Math.Min(editor.Text.Length - start, length))]);
    }

    public override ICharSequence? GetSelectedTextFormatted(GetTextFlags flags)
    {
        if (Editor is not { IsPassword: false } editor)
            return new Java.Lang.String("");
        return new Java.Lang.String(editor.Text[Math.Min(editor.SelectionStart, editor.SelectionEnd)..Math.Max(editor.SelectionStart, editor.SelectionEnd)]);
    }

    public override SurroundingText? GetSurroundingText(int beforeLength, int afterLength, int flags)
    {
        if (Editor is not { IsPassword: false } editor || beforeLength < 0 || afterLength < 0)
            return null;
        var low = Math.Min(editor.SelectionStart, editor.SelectionEnd);
        var high = Math.Max(editor.SelectionStart, editor.SelectionEnd);
        var start = low - Math.Min(low, beforeLength);
        var end = high + Math.Min(editor.Text.Length - high, afterLength);
        return new SurroundingText(editor.Text[start..end], editor.SelectionStart - start,
            editor.SelectionEnd - start, start);
    }

    public override global::Android.Text.CapitalizationMode GetCursorCapsMode(global::Android.Text.CapitalizationMode reqModes)
    {
        if (Editor is not { IsPassword: false } editor)
            return 0;
        return global::Android.Text.TextUtils.GetCapsMode(editor.Text,
            Math.Min(editor.SelectionStart, editor.SelectionEnd), reqModes);
    }

    public override ExtractedText? GetExtractedText(ExtractedTextRequest? request, GetTextFlags flags)
    {
        if (Editor is not { IsPassword: false } editor)
            return null;
        return new ExtractedText
        {
            Text = new Java.Lang.String(editor.Text),
            StartOffset = 0,
            PartialStartOffset = -1,
            PartialEndOffset = -1,
            SelectionStart = editor.SelectionStart,
            SelectionEnd = editor.SelectionEnd,
        };
    }

    public override bool PerformEditorAction(ImeAction actionCode)
    {
        if (Editor is null)
            return false;
        if (actionCode == ImeAction.Next)
            return view.Input.MoveFocus(true);
        if (actionCode == ImeAction.Previous)
            return view.Input.MoveFocus(false);
        var result = view.Input.Execute(new TextCommand(TextCommandKind.Submit, "", false));
        if (actionCode == ImeAction.Done)
            view.EndTextInput();
        return result;
    }

    public override bool PerformContextMenuAction(int id)
    {
        if (Editor is not { } editor)
            return false;
        var kind = id switch
        {
            global::Android.Resource.Id.SelectAll => TextCommandKind.SelectAll,
            global::Android.Resource.Id.Copy => TextCommandKind.Copy,
            global::Android.Resource.Id.Cut => TextCommandKind.Cut,
            global::Android.Resource.Id.Paste => TextCommandKind.Paste,
            _ => (TextCommandKind?)null,
        };
        if (kind is null || editor.IsPassword && kind is TextCommandKind.Copy or TextCommandKind.Cut)
            return false;
        return view.Input.Execute(new TextCommand(kind.Value,
            kind == TextCommandKind.Paste ? view.GetClipboardText() : "", false));
    }

    public override bool SendKeyEvent(AndroidKeyEvent? e)
    {
        if (Editor is null || e is null)
            return false;
        return e.Action == KeyEventActions.Down ? view.OnKeyDown(e.KeyCode, e) : view.OnKeyUp(e.KeyCode, e);
    }

    public override bool BeginBatchEdit() => Editor is not null && view.BeginInputBatch(this);
    public override bool EndBatchEdit() => view.EndInputBatch(this);

    public override void CloseConnection()
    {
        if (Editor is not null)
            view.Input.FinishComposition();
        view.EndInputBatches(this);
        closed = true;
        base.CloseConnection();
    }
}
