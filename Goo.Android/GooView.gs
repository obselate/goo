package Goo.Android

import Android.Content
import Android.Graphics
import Android.OS
import Android.Views
import Android.Views.InputMethods
import System.Runtime.CompilerServices
import System.Text
import AndroidKeyEvent = Android.Views.KeyEvent
import AndroidRect = Android.Graphics.Rect
import NativeAccessibilityEvent = Android.Views.Accessibility.AccessibilityEvent
import NativeEventTypes = Android.Views.Accessibility.EventTypes
import SystemMath = System.Math
import SystemObject = System.Object
import Android
import Android.Animation
import Android.Content.Res
import Android.Database
import Android.Provider
import Android.Text
import Android.Util
import Android.Views.Accessibility
import Android.Views.Autofill
import Goo
import Java.Lang
import System
import System.Threading

class GooView : SurfaceView, ISurfaceHolderCallback {
    private let host AndroidVulkanHost
    private let handler Handler = Handler(Looper.MainLooper!!)
    private let frameCallback FrameCallback
    private let preferenceObserver PreferenceObserver
    private let scheduleFrame Runnable
    private let choreographer Choreographer
    private let inputMethod InputMethodManager
    private let accessibility GooAccessibilityProvider
    private let wakeGate object = SystemObject()
    private var framePosted bool
    private var resumed bool = true
    private var surfaceReady bool
    private var disposed bool
    private var lastFrameTime int64
    private var editorFocus int64
    private var editorConfiguration int32
    private var editorOptions TextInputOptions?
    private var batchConnection GooInputConnection?
    private var batchDepth int32
    private var pendingEditor FocusedEditorSnapshot?
    private var editorPending bool
    private var wakePosted int32

    init(context Context, window Goo.Window) : base(context) {
        ArgumentNullException.ThrowIfNull(window, paramName: "window")
        if Looper.MyLooper() != Looper.MainLooper {
            throw InvalidOperationException("Create GooView on the Android main thread.")
        }
        if window.AccessibilityAdapter != nil {
            throw InvalidOperationException("GooView owns the window accessibility adapter.")
        }
        Window = window
        host = AndroidVulkanHost(this)
        frameCallback = FrameCallback(this)
        scheduleFrame = Runnable(ScheduleFrame)
        choreographer = Choreographer.Instance!!
        inputMethod = cast[InputMethodManager](context.GetSystemService(Context.InputMethodService)!!)
        Focusable = true
        FocusableInTouchMode = true
        Clickable = true
        if window.Transparent {
            SetZOrderOnTop(true)
            Holder!!.SetFormat(Format.Translucent)
        }
        Holder!!.AddCallback(this)
        accessibility = GooAccessibilityProvider(this)
        window.Attach(host)
        nativeOwners.Add(window, this)
        window.EmbeddedPopupFactory = (
            popup Goo.Window,
            kind PopupKind,
            dismissed(PopupDismissReason) -> void
        ) -> AndroidPopupSurface(this, popup, kind, dismissed)
        RefreshPreferences()
        preferenceObserver = PreferenceObserver(this, handler)
        context.ContentResolver!!.RegisterContentObserver(
            Settings.System.GetUriFor(Settings.System.SoundEffectsEnabled)!!,
            false,
            preferenceObserver
        )
        context.ContentResolver!!.RegisterContentObserver(
            Settings.Secure.GetUriFor("high_text_contrast_enabled")!!,
            false,
            preferenceObserver
        )
        window.PlatformInput.EditorChanged += OnEditorChanged
    }

    prop Window Goo.Window {
        get;
    }

    /// Reports changes in immediate frame demand on the Android UI thread.
    event FrameDemandChanged Action[bool]

    /// Gets whether a frame is pending or another immediate frame is needed.
    prop HasFrameDemand bool {
        get;
        private set;
    }

    /// Gets or sets whether the Done editor action hides the software keyboard.
    private var _dismissKeyboardOnSubmit bool = true

    prop DismissKeyboardOnSubmit bool {
        get {
            return _dismissKeyboardOnSubmit
        }
        set {
            _dismissKeyboardOnSubmit = value
        }
    }

    internal prop Density float32 -> SystemMath.Max(Resources?.DisplayMetrics?.Density ?? 1f, 0.1f)
    internal prop Input PlatformInput -> Window.PlatformInput
    internal prop NativeContextMenu NativeContextMenu?

    internal func PostPopupClose(close() -> void) -> handler.Post(close)
    override prop AccessibilityNodeProvider AccessibilityNodeProvider? -> accessibility

    func Resume() {
        if disposed || !Window.IsOpen {
            return
        }
        resumed = true
        RefreshPreferences()
        lastFrameTime = 0
        host.Resume()
        host.SetFocused(HasWindowFocus)
    }

    protected override func OnConfigurationChanged(newConfig Configuration?) {
        base.OnConfigurationChanged(newConfig)
        RefreshPreferences()
        accessibility.ConfigurationChanged()
    }

    private func RefreshPreferences() {
        let configuration = Resources?.Configuration
        let mode = configuration?.UiMode & UiMode.NightMask
        let sounds = Settings.System.GetInt(Context!!.ContentResolver!!, Settings.System.SoundEffectsEnabled, -1)
        var contrast = -1
        try {
            contrast = Settings.Secure.GetInt(Context!!.ContentResolver!!, "high_text_contrast_enabled", -1)
        } catch (SecurityException) { }
        using let accent = TypedValue()
        let accentColor = if Context!!.Theme?.ResolveAttribute(
            Android.Resource.Attribute.ColorAccent,
            accent,
            true
        ) == true &&
            accent.Type >= DataType.FirstColorInt &&
            accent.Type <= DataType
            .LastColorInt {
            Goo.Color.Rgba(
                (accent.Data >> 16) & 255,
                (accent.Data >> 8) & 255,
                accent.Data & 255,
                int32((uint32(accent.Data) >> 24))
            )
        } else {
            default(Goo.Color?)
        }
        let locales = configuration?.Locales
        let preferredLocales = if locales != nil && locales.IsEmpty == false {
            locales.ToLanguageTags()?.Split(',')
        } else {
            default([]?string)
        }
        host.UpdatePreferences(
            PlatformPreferences{
                Theme: if mode == UiMode.NightYes {
                    SystemTheme.Dark
                } else {
                    (
                        if mode == UiMode.NightNo {
                            SystemTheme.Light
                        } else {
                            SystemTheme.Unknown
                        }
                    )
                },
                TextScaleFactor: configuration?.FontScale,
                PreferredLocales: preferredLocales,
                ReducedMotion: !ValueAnimator.AreAnimatorsEnabled(),
                AccentColor: accentColor,
                HighContrast: switch contrast {
                    case 0: false
                    case 1: true
                    default: default(bool?)
                },
                EventSoundsEnabled: switch sounds {
                    case 0: false
                    case 1: true
                    default: default(bool?)
                }
            }
        )
    }

    func Pause() {
        if disposed {
            return
        }
        resumed = false
        NativeContextMenu?.OwnerClosed()
        accessibility.SetPresentationReady(false)
        Window.DismissChildPopups(PopupDismissReason.OwnerHidden)
        CancelFrames()
        host.Suspend()
    }

    func SurfaceCreated(holder ISurfaceHolder) {
        if disposed || !Window.IsOpen || holder.Surface is not{} surface {
            return
        }
        host.AcquireSurface(surface)
    }

    func SurfaceChanged(holder ISurfaceHolder, format Format, width int32, height int32) {
        if disposed || !Window.IsOpen {
            return
        }
        accessibility.SetPresentationReady(false)
        if holder.Surface is {} surface {
            host.RefreshSurface(surface)
        }
        host.Resize(
            SystemMath.Max(1, int32(SystemMath.Round(float32(width) / Density))),
            SystemMath.Max(1, int32(SystemMath.Round(float32(height) / Density))),
            width,
            height
        )
        if !host.IsPresentationAttached && width > 0 && height > 0 {
            host.AttachPresentation()
        }
        surfaceReady = host.IsPresentationAttached && width > 0 && height > 0
    }

    func SurfaceDestroyed(holder ISurfaceHolder) {
        if disposed {
            return
        }
        NativeContextMenu?.OwnerClosed()
        accessibility.SetPresentationReady(false)
        surfaceReady = false
        Window.DismissChildPopups(PopupDismissReason.OwnerHidden)
        CancelFrames()
        Input.FocusLost()
        host.DetachPresentation()
        host.ReleaseSurface()
    }

    override func OnWindowFocusChanged(hasWindowFocus bool) {
        base.OnWindowFocusChanged(hasWindowFocus)
        if !disposed && Window.IsOpen {
            host.SetFocused(hasWindowFocus && resumed)
        }
    }

    protected override func OnAttachedToWindow() {
        base.OnAttachedToWindow()
        if !disposed && !nativeOwners.TryGetValue(Window, out _) {
            nativeOwners.Add(Window, this)
        }
        if !disposed {
            accessibility.Attach()
        }
    }

    protected override func OnWindowVisibilityChanged(visibility ViewStates) {
        base.OnWindowVisibilityChanged(visibility)
        if !disposed {
            accessibility.RefreshNativeGeometry()
        }
    }

    protected override func DispatchHoverEvent(e MotionEvent?) bool -> !disposed &&
        (e != nil && accessibility.DispatchHover(e) || base.DispatchHoverEvent(e))

    protected override func OnDetachedFromWindow() {
        nativeOwners.Remove(Window)
        NativeContextMenu?.OwnerClosed()
        surfaceReady = false
        Window.DismissChildPopups(PopupDismissReason.OwnerHidden)
        CancelFrames()
        accessibility.Detach()
        base.OnDetachedFromWindow()
    }

    override func SendAccessibilityEventUnchecked(e NativeAccessibilityEvent?) {
        if (
            e?.EventType is NativeEventTypes.ViewClicked or
                NativeEventTypes.ViewFocused or
                NativeEventTypes.ViewHoverEnter or
                NativeEventTypes.ViewHoverExit
        ) {
            return
        }
        base.SendAccessibilityEventUnchecked(e)
    }

    internal func RequestFrame() {
        lock wakeGate {
            if disposed || Interlocked.Exchange(&wakePosted, 1) != 0 {
                return
            }
            handler.Post(
                () -> {
                    Interlocked.Exchange(&wakePosted, 0)
                    if disposed {
                        return
                    }
                    if resumed && host.IsPresentationAttached {
                        host.ServicePendingSubmission()
                    }
                    handler.RemoveCallbacks(scheduleFrame)
                    ScheduleFrame()
                }
            )
        }
    }

    private func ScheduleFrame() {
        if disposed || !resumed || !host.IsPresentationAttached || framePosted {
            return
        }
        framePosted = true
        SetFrameDemand(true)
        choreographer.PostFrameCallback(frameCallback)
    }

    private func DrawFrame(frameTime int64) {
        framePosted = false
        if disposed || !resumed || !host.IsPresentationAttached {
            return
        }
        let dt = if lastFrameTime == int64(0) {
            float64(0.0)
        } else {
            SystemMath.Max(0.0, float64((frameTime - lastFrameTime)) / 1_000_000_000d)
        }
        lastFrameTime = frameTime
        host.RenderFrame(dt)
        accessibility.SetPresentationReady(true)
        accessibility.RefreshNativeGeometry()
        let delay = host.NextFrameDelaySeconds
        SetFrameDemand(delay <= float64(0.0))
        if float64.IsPositiveInfinity(delay) {
            return
        }
        if delay <= float64(0.0) {
            ScheduleFrame()
        } else {
            handler.PostDelayed(scheduleFrame, SystemMath.Max(1, int64(SystemMath.Ceiling(delay * float64(1000.0)))))
        }
    }

    private func CancelFrames() {
        handler.RemoveCallbacks(scheduleFrame)
        choreographer.RemoveFrameCallback(frameCallback)
        framePosted = false
        lastFrameTime = 0
        SetFrameDemand(false)
    }

    private func SetFrameDemand(value bool) {
        if HasFrameDemand == value {
            return
        }
        HasFrameDemand = value
        FrameDemandChanged?(value)
    }

    override func OnTouchEvent(e MotionEvent?) bool {
        if disposed || e == nil || !resumed {
            return false
        }
        if e.ActionMasked == MotionEventActions.Down {
            RequestFocus()
            Parent?.RequestDisallowInterceptTouchEvent(true)
        }
        let modifiers = Modifiers(e.MetaState)
        if e.ActionMasked == MotionEventActions.Move {
            var samples = stackalloc[e.PointerCount]QueuedPointerEvent
            for var i = 0; i < samples.Length; i++ {
                samples[i] = QueuedPointerEvent{
                    PointerId: e.GetPointerId(i),
                    Device: Device(e.GetToolType(i)),
                    X: e.GetX(i) / Density,
                    Y: e.GetY(i) / Density,
                    Modifiers: modifiers,
                    Pressure: e.GetPressure(i),
                    HasPressure: true
                }
            }
            Input.PointerMotionFrame(samples)
        } else {
            let first = if e.ActionMasked == MotionEventActions.Cancel {
                0
            } else {
                e.ActionIndex
            }
            let count = if e.ActionMasked == MotionEventActions.Cancel {
                e.PointerCount
            } else {
                first + 1
            }
            for var i = first; i < count; i++ {
                let id = e.GetPointerId(i)
                let device = Device(e.GetToolType(i))
                let x = e.GetX(i) / Density
                let y = e.GetY(i) / Density
                switch e.ActionMasked {
                    case MotionEventActions.Down, MotionEventActions.PointerDown {
                        Input.PointerPress(id, device, x, y, PointerButton.Primary, modifiers, e.GetPressure(i))
                    }
                    case MotionEventActions.Up, MotionEventActions.PointerUp {
                        Input.PointerRelease(id, device, x, y, PointerButton.Primary, modifiers, e.GetPressure(i))
                    }
                    case MotionEventActions.Cancel {
                        Input.PointerCancel(id, device)
                    }
                    default {
                        Input.PointerMove(id, device, x, y, modifiers, e.GetPressure(i))
                    }
                }
            }
        }
        if e.ActionMasked == MotionEventActions.Up {
            PerformClick()
            if Input.Editor is {IsReadOnly: false} {
                inputMethod.ShowSoftInput(this, ShowFlags.Implicit)
            }
        }
        return true
    }

    override func PerformClick() bool {
        base.PerformClick()
        return true
    }

    override func OnGenericMotionEvent(e MotionEvent?) bool {
        if e == nil || disposed || !resumed {
            return false
        }
        if e.ActionMasked == MotionEventActions.Scroll {
            Input.PointerWheel(
                e.GetX() / Density,
                e.GetY() / Density,
                e.GetAxisValue(Axis.Hscroll),
                e.GetAxisValue(Axis.Vscroll),
                Modifiers(e.MetaState)
            )
        } else if (e.ActionMasked is MotionEventActions.HoverMove or MotionEventActions.HoverEnter) {
            Input.PointerMove(
                e.GetPointerId(0),
                Device(e.GetToolType(0)),
                e.GetX() / Density,
                e.GetY() / Density,
                Modifiers(e.MetaState),
                e.GetPressure(0)
            )
        } else {
            return base.OnGenericMotionEvent(e)
        }
        return true
    }

    override func OnKeyDown(keyCode Keycode, e AndroidKeyEvent?) bool {
        if disposed || !resumed || e == nil {
            return false
        }
        let key = AndroidKeys.Map(keyCode)
        var handled = key != Key.Unknown
        try {
            if handled {
                Input.KeyPress(key, Modifiers(e.MetaState))
            }
            let scalar = e.UnicodeChar
            if !e.IsCtrlPressed && !e.IsAltPressed && Rune.TryCreate(scalar, out var character) && !Rune.IsControl(
                character
            ) {
                Input.CommitText(character.ToString())
                handled = true
            }
            if !handled {
                return base.OnKeyDown(keyCode, e)
            }
            return true
        } finally {
            if key != Key.Unknown {
                Input.KeyRelease(key)
            }
        }
    }

    override func OnKeyUp(keyCode Keycode, e AndroidKeyEvent?) bool {
        if disposed || !resumed || e == nil {
            return false
        }
        let key = AndroidKeys.Map(keyCode)
        if key == Key.Unknown {
            return base.OnKeyUp(keyCode, e)
        }
        return true
    }

    override func OnCheckIsTextEditor() bool -> Input.Editor is {IsReadOnly: false}

    override func OnCreateInputConnection(outAttrs EditorInfo?) IInputConnection? {
        if disposed || outAttrs == nil {
            return nil
        }
        guard let editor = Input.Editor else {
            return nil
        }
        if editor.IsReadOnly {
            return nil
        }
        let purpose = if editor.IsPassword {
            InputPurpose.Password
        } else {
            editor.InputOptions?.Purpose ?? InputPurpose.Text
        }
        outAttrs.InputType = switch purpose {
            case InputPurpose.Email: InputTypes.ClassText | InputTypes.TextVariationEmailAddress
            case InputPurpose.Url: InputTypes.ClassText | InputTypes.TextVariationUri
            case InputPurpose.Number: InputTypes.ClassNumber
            case InputPurpose.Decimal: InputTypes.ClassNumber | InputTypes.NumberFlagDecimal
            case InputPurpose.Phone: InputTypes.ClassPhone
            case InputPurpose.Password: InputTypes.ClassText | InputTypes.TextVariationPassword
            default: InputTypes.ClassText
        }
        if editor.IsMultiline && (outAttrs.InputType & InputTypes.MaskClass) == InputTypes.ClassText {
            outAttrs.InputType |= InputTypes.TextFlagMultiLine
        }
        let action = editor
            .InputOptions
            ?.EnterAction ??
            (
            if editor.IsMultiline {
                EnterAction.None
            } else {
                (
                    if purpose == InputPurpose.Search {
                        EnterAction.Search
                    } else {
                        EnterAction.Done
                    }
                )
            }
        )
        outAttrs.ImeOptions = ImeFlags(
            (
                switch action {
                    case EnterAction.Go: ImeAction.Go
                    case EnterAction.Next: ImeAction.Next
                    case EnterAction.Search: ImeAction.Search
                    case EnterAction.Send: ImeAction.Send
                    case EnterAction.None: ImeAction.None
                    default: ImeAction.Done
                }
            )
        ) | ImeFlags.NoExtractUi | (
            if purpose == InputPurpose.Password {
                ImeFlags.NoPersonalizedLearning
            } else {
                ImeFlags(0)
            }
        )
        outAttrs.InitialSelStart = editor.SelectionStart
        outAttrs.InitialSelEnd = editor.SelectionEnd
        return GooInputConnection(this, editor.FocusId)
    }

    internal func BeginTextInput() bool {
        RequestFocus()
        inputMethod.RestartInput(this)
        ShowTextInput()
        return true
    }

    internal func ShowTextInput() -> inputMethod.ShowSoftInput(this, ShowFlags.Implicit)

    internal func EndTextInput() -> inputMethod.HideSoftInputFromWindow(WindowToken, HideSoftInputFlags.None)

    internal func SetImeArea(x int32, y int32, width int32, height int32) bool {
        if batchDepth > 0 {
            return true
        }
        let area = AndroidRect(
            int32((float32(x) * Density)),
            int32((float32(y) * Density)),
            int32((float32((x + width)) * Density)),
            int32((float32((y + height)) * Density))
        )
        RequestRectangleOnScreen(area)
        var editor FocusedEditorSnapshot? = Input.Editor
        if editor == nil {
            return false
        }
        let location = [2]int32
        GetLocationOnScreen(location)
        using let matrix = Matrix()
        matrix.SetTranslate(location[0], location[1])
        using let builder = CursorAnchorInfo.Builder()
        builder.SetMatrix(matrix)
        builder.SetSelectionRange(editor.SelectionStart, editor.SelectionEnd)
        builder.SetInsertionMarkerLocation(
            area.Left,
            area.Top,
            area.Bottom,
            area.Bottom,
            CursorAnchorFlags.HasVisibleRegion
        )
        using let anchor = builder.Build()
        inputMethod.UpdateCursorAnchorInfo(this, anchor)
        return true
    }

    private func OnEditorChanged(editor FocusedEditorSnapshot?) {
        let focus = editor?.FocusId ?? int64(0)
        let configuration = EditorConfiguration(editor)
        let optionsChanged = !SameEditorOptions(editor?.InputOptions, editorOptions)
        if batchDepth > 0 && focus == editorFocus && configuration == editorConfiguration && !optionsChanged {
            pendingEditor = editor
            editorPending = true
            RequestFrame()
            return
        }
        if focus != editorFocus || configuration != editorConfiguration || optionsChanged {
            let autofill = Context?.GetSystemService("autofill") as AutofillManager
            autofill?.NotifyViewExited(this)
            if focus != editorFocus {
                autofill?.Cancel()
            }
            batchConnection = nil
            batchDepth = 0
            editorPending = false
            pendingEditor = nil
            editorFocus = focus
            editorConfiguration = configuration
            editorOptions = editor?.InputOptions
            SetAutofillHints(editorOptions?.AutofillHints ?? System.Array.Empty[string]())
            ImportantForAutofill = if editor != nil &&
                editor!!.IsReadOnly == false &&
                editorOptions
                ?.AutofillHints
                .Length > 0 {
                ImportantForAutofill.Yes
            } else {
                ImportantForAutofill.No
            }
            if ImportantForAutofill == ImportantForAutofill.Yes {
                autofill?.NotifyViewEntered(this)
            }
            inputMethod.RestartInput(this)
            if editor != nil && editor!!.IsReadOnly == false {
                inputMethod.ShowSoftInput(this, ShowFlags.Implicit)
            } else {
                EndTextInput()
            }
        }
        var value FocusedEditorSnapshot
        if editor != nil && {
            value = editor!!
            true
        } {
            inputMethod.UpdateSelection(
                this,
                value.SelectionStart,
                value.SelectionEnd,
                value.CompositionStart,
                value.CompositionEnd
            )
        }
        RequestFrame()
    }

    internal func BeginInputBatch(connection GooInputConnection) bool {
        if disposed || batchConnection != nil && batchConnection != connection || batchDepth == int32.MaxValue {
            return false
        }
        batchConnection = connection
        batchDepth++
        return true
    }

    internal func EndInputBatch(connection GooInputConnection) bool {
        if disposed || batchConnection != connection || batchDepth == 0 {
            return false
        }
        batchDepth--
        if batchDepth != 0 {
            return true
        }
        EndInputBatches(connection)
        return false
    }

    internal func EndInputBatches(connection GooInputConnection) {
        if disposed || batchConnection != connection {
            return
        }
        batchConnection = nil
        batchDepth = 0
        if !editorPending {
            return
        }
        let editor = pendingEditor
        pendingEditor = nil
        editorPending = false
        OnEditorChanged(editor)
        var value FocusedEditorSnapshot
        if editor != nil && {
            value = editor!!
            true
        } {
            SetImeArea(
                int32(value.CaretArea.X),
                int32(value.CaretArea.Y),
                SystemMath.Max(1, int32(SystemMath.Ceiling(value.CaretArea.Width))),
                SystemMath.Max(1, int32(SystemMath.Ceiling(value.CaretArea.Height)))
            )
        }
    }

    override prop AutofillType AutofillType -> if Input.Editor is {IsReadOnly: false} {
        AutofillType.Text
    } else {
        AutofillType.None
    }

    override prop AutofillValue AutofillValue? {
        get {
            let __spill0 = Input.Editor
            var editor FocusedEditorSnapshot
            return if __spill0 != nil && {
                editor = __spill0!!
                true
            } {
                AutofillValue.ForText(editor.Text)
            } else {
                default(AutofillValue?)
            }
        }
    }

    override func Autofill(value AutofillValue?) {
        if !(value != nil && value.IsText == true) || Input.Editor is not{IsReadOnly: false} {
            return
        }
        Input.Execute(TextCommand(TextCommandKind.SelectAll, "", false))
        Input.CommitText(value.TextValue?.ToString() ?? "")
    }

    internal func GetClipboardText() string {
        let clipboard = cast[Android.Content.ClipboardManager](Context!!.GetSystemService(Context.ClipboardService)!!)
        using let text ICharSequence? = clipboard.PrimaryClip?.GetItemAt(0)?.CoerceToTextFormatted(Context)
        if text == nil || text.Length() > ClipboardTransfer.MaxTextBytes {
            return ""
        }
        let value = text.ToString()
        return if ClipboardTransfer.TextFits(value) {
            value
        } else {
            ""
        }
    }

    internal func SetClipboardText(value string) {
        let clipboard = cast[Android.Content.ClipboardManager](Context!!.GetSystemService(Context.ClipboardService)!!)
        clipboard.PrimaryClip = ClipData.NewPlainText("Goo", value)
    }

    protected override func Dispose(disposing bool) {
        if disposing && !disposed {
            lock wakeGate {
                disposed = true
                nativeOwners.Remove(Window)
                handler.RemoveCallbacksAndMessages(nil)
            }
            NativeContextMenu?.OwnerClosed()
            this.Window.EmbeddedPopupFactory = nil
            Window.DismissChildPopups(PopupDismissReason.OwnerClosed)
            CancelFrames()
            Window.PlatformInput.EditorChanged -= OnEditorChanged
            Context!!.ContentResolver!!.UnregisterContentObserver(preferenceObserver)
            preferenceObserver.Dispose()
            IDisposable(accessibility).Dispose()
            EndTextInput()
            host.Dispose()
            host.ReleaseSurface()
            Holder?.RemoveCallback(this)
            frameCallback.Dispose()
            scheduleFrame.Dispose()
            handler.Dispose()
        }
        base.Dispose(disposing)
    }

    private class PreferenceObserver(view GooView, handler Handler) : ContentObserver(handler) {
        override func OnChange(selfChange bool) {
            if !view.disposed {
                view.RefreshPreferences()
            }
        }
    }

    private class FrameCallback(view GooView) : Java.Lang.Object, Choreographer.IFrameCallback {
        func DoFrame(frameTimeNanos int64) -> view.DrawFrame(frameTimeNanos)
    }

    shared {
        private let nativeOwners ConditionalWeakTable[Goo.Window, GooView] = ConditionalWeakTable[Goo.Window, GooView]()
        internal func TryGetNativeOwner(window Goo.Window) GooView? -> if nativeOwners.TryGetValue(
            window,
            out var view
        ) &&
            !view.disposed &&
            view.resumed &&
            view.surfaceReady &&
            view.IsAttachedToWindow &&
            view
            .host
            .IsPresentationAttached {
            view
        } else {
            default(GooView?)
        }

        private func EditorConfiguration(editor FocusedEditorSnapshot?) int32 {
            var value FocusedEditorSnapshot
            return if editor != nil && {
                value = editor!!
                true
            } {
                (
                    if value.IsPassword {
                        1
                    } else {
                        0
                    }
                ) | (
                    if value.IsMultiline {
                        2
                    } else {
                        0
                    }
                ) | (
                    if value.IsReadOnly {
                        4
                    } else {
                        0
                    }
                )
            } else {
                0
            }
        }

        private func SameEditorOptions(left TextInputOptions?, right TextInputOptions?) bool -> object.ReferenceEquals(
            left,
            right
        ) ||
            left != nil &&
            right != nil &&
            left.Purpose == right.Purpose &&
            left.EnterAction == right.EnterAction &&
            left
            .AutofillHints
            .AsSpan()
            .SequenceEqual(right.AutofillHints)

        private func Device(tool MotionEventToolType) PointerDevice -> switch tool {
            case MotionEventToolType.Finger: PointerDevice.Touch
            case MotionEventToolType.Stylus or MotionEventToolType.Eraser: PointerDevice.Pen
            default: PointerDevice.Mouse
        }

        private func Modifiers(state MetaKeyStates) KeyModifiers -> KeyModifiers{
            Alt: (state & MetaKeyStates.AltOn) != 0,
            Shift: (state & MetaKeyStates.ShiftOn) != 0,
            Ctrl: (state & MetaKeyStates.CtrlOn) != 0,
            Super: (state & MetaKeyStates.MetaOn) != 0
        }
    }
}
