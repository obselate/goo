package Goo.Android

import Android.App
import Android.Content
import Android.Content.PM
import Android.OS
import Android.Views
import Android.Widget
import Goo
import Java.Lang
import System
import System.Collections.Generic

/// Hosts a Goo window and forwards Android activity lifecycle and activation events.
abstract class GooActivity : Activity {
    internal var PermissionsResultReceived Action[int32, []string, []Permission]?
    internal var Destroyed Action?
    private var view GooView?
    private var insets InsetsListener?
    private var content FrameLayout?

    /// Gets the saved activity state passed to CreateWindow, or null for a fresh activity.
    protected prop SavedInstanceState Bundle? {
        get;
        private set;
    }

    /// <summary>Gets the Activity-owned system document picker and content URI stream service.</summary>
    public prop Documents AndroidDocuments {
        get;
        private set;
    }

    protected open func CreateWindow() Goo.Window;
    protected prop GooView GooView -> view ??
        throw InvalidOperationException("The activity has not created its Goo view.")

    /// Gets the result of forwarding the most recent Android activation.
    private var _lastActivationStatus ActivationPostStatus = ActivationPostStatus.NotInitialized

    prop LastActivationStatus ActivationPostStatus {
        get {
            return _lastActivationStatus
        }
        private set {
            _lastActivationStatus = value
        }
    }

    internal func OwnsNativeContextMenu(candidate GooView) bool -> object.ReferenceEquals(view, candidate)

    /// Completes the active native context menu after Android closes it.
    open override func OnContextMenuClosed(menu IMenu) {
        view?.NativeContextMenu?.Closed()
        base.OnContextMenuClosed(menu)
    }

    protected open override func OnCreate(savedInstanceState Bundle?) {
        base.OnCreate(savedInstanceState)
        SavedInstanceState = savedInstanceState
        Documents = AndroidDocuments(this)
        if !OperatingSystem.IsAndroidVersionAtLeast(35) {
            Window!!.SetDecorFitsSystemWindows(false)
        }
        Window!!.SetSoftInputMode(SoftInput.AdjustResize)
        content = FrameLayout(this)
        view = GooView(this, CreateWindow())
        content!!.AddView(
            view,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MatchParent, ViewGroup.LayoutParams.MatchParent)
        )
        insets = InsetsListener()
        content!!.SetOnApplyWindowInsetsListener(insets)
        SetContentView(content)
        content!!.RequestApplyInsets()
        if !processLaunched || savedInstanceState == nil {
            ForwardActivation(Intent, !processLaunched)
        }
        processLaunched = true
    }

    protected open override func OnNewIntent(intent Intent?) {
        base.OnNewIntent(intent)
        Intent = intent
        ForwardActivation(intent, Goo.Window.IsInitialApplicationActivation)
    }

    /// Receives native permission results and forwards pending Goo requests.
    /// @param requestCode The native permission request code.
    /// @param permissions The requested Android permission names.
    /// @param grantResults The native result for each permission.
    public open override func OnRequestPermissionsResult(requestCode int32, permissions[]string, grantResults[]Permission) {
        base.OnRequestPermissionsResult(requestCode, permissions, grantResults)
        PermissionsResultReceived?.Invoke(requestCode, permissions, grantResults)
    }

    private func ForwardActivation(intent Intent?, initial bool) {
        var documents List[Uri]? = nil
        var target Uri? = nil
        let notification = intent?.Action == "Goo.Android.Notification"
        if !notification && Uri.TryCreate(intent?.DataString, UriKind.Absolute, out var data) {
            if (data.Scheme is "content" or "file") {
                (
                    (
                        if documents == nil {
                            (documents = List[Uri]())
                        } else {
                            documents
                        }
                    )!!
                ).Add(data)
            } else {
                target = data
            }
        }
        if !notification && intent?.ClipData is {} clips {
            for var i = 0; i < clips.ItemCount; i++ {
                if Uri.TryCreate(clips.GetItemAt(i)?.Uri?.ToString(), UriKind.Absolute, out var document) &&
                    documents?.Contains(document) != true {
                    (
                        (
                            if documents == nil {
                                (documents = List[Uri]())
                            } else {
                                documents
                            }
                        )!!
                    ).Add(document)
                }
            }
        }
        let activation = ApplicationActivation{
            Kind: if notification {
                ApplicationActivationKind.Notification
            } else {
                (
                    if documents != nil {
                        ApplicationActivationKind.OpenDocuments
                    } else {
                        (
                            if target != nil {
                                ApplicationActivationKind.OpenUri
                            } else {
                                ApplicationActivationKind.Launch
                            }
                        )
                    }
                )
            },
            IsInitial: initial,
            Target: if documents == nil {
                target
            } else {
                default(Uri?)
            },
            Documents: if documents == nil {
                cast[IReadOnlyList[Uri]](Array.Empty[Uri]())
            } else {
                cast[IReadOnlyList[Uri]](documents)
            },
            NotificationId: if notification {
                intent?.GetStringExtra("Goo.NotificationId") ?? ""
            } else {
                ""
            },
            ActionId: if notification {
                intent?.GetStringExtra("Goo.ActionId") ?? ""
            } else {
                ""
            },
            Payload: if notification {
                intent?.GetStringExtra("Goo.Payload") ?? ""
            } else {
                ""
            }
        }
        LastActivationStatus = Goo.Window.PostApplicationActivation(activation)
        if (LastActivationStatus is ActivationPostStatus.NotInitialized or ActivationPostStatus.Closed) {
            LastActivationStatus = if Goo.Window.InitializeApplicationActivation(
                activation
            ) == WindowOperationResult.Accepted {
                ActivationPostStatus.Accepted
            } else {
                ActivationPostStatus.TooLarge
            }
        }
    }

    protected open override func OnResume() {
        base.OnResume()
        view?.Resume()
    }

    protected open override func OnPause() {
        view?.Pause()
        base.OnPause()
    }

    protected open override func OnActivityResult(requestCode int32, resultCode Result, data Intent?) {
        if Documents.HandleResult(requestCode, resultCode, data) { return }
        base.OnActivityResult(requestCode, resultCode, data)
    }

    protected open override func OnDestroy() {
        Documents?.Dispose()
        Destroyed?.Invoke()
        Destroyed = nil
        PermissionsResultReceived = nil
        content?.SetOnApplyWindowInsetsListener(nil)
        if view is {} current && current.Parent is ViewGroup parent {
            parent.RemoveView(current)
        }
        if let current = view {
            IDisposable(current).Dispose()
        }
        view = nil
        content = nil
        insets?.Dispose()
        insets = nil
        base.OnDestroy()
    }

    private class InsetsListener : Java.Lang.Object, View.IOnApplyWindowInsetsListener {
        func OnApplyWindowInsets(target View?, value WindowInsets?) WindowInsets {
            ArgumentNullException.ThrowIfNull(value, paramName: "value")
            let safe = value!!.GetInsets(
                WindowInsets.Type.SystemBars() | WindowInsets.Type.DisplayCutout() | WindowInsets.Type.Ime()
            )
            target?.SetPadding(safe.Left, safe.Top, safe.Right, safe.Bottom)
            return value!!
        }
    }

    shared {
        private var processLaunched bool
    }
}
