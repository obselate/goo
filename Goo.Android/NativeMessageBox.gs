package Goo.Android

import Android
import Android.App
import Android.Content
import Android.OS
import Android.Views
import Goo
import Java.Lang
import System
import SystemException_2 = System.Exception

internal class NativeMessageBox : Java
    .Lang
    .Object,
View.IOnAttachStateChangeListener,
Application
    .IActivityLifecycleCallbacks {
    private let view GooView
    private let activity Activity
    private let completed(int32, int32, string) -> void
    private var dialog AlertDialog?
    private var finished bool

    private init(view GooView, activity Activity, completed(int32, int32, string) -> void) {
        this.view = view
        this.activity = activity
        this.completed = completed
    }

    private func Complete(status int32, id int32 = -1, error string = "") {
        var status = status
        var id = id
        if finished {
            return
        }
        finished = true
        if activity.IsFinishing || activity.IsDestroyed || !object.ReferenceEquals(
            GooView.TryGetNativeOwner(view.Window),
            view
        ) {
            status = 2
            id = -1
        }
        view.RemoveOnAttachStateChangeListener(this)
        activity.Application!!.UnregisterActivityLifecycleCallbacks(this)
        let current = dialog
        dialog = nil
        current?.Dismiss()
        current?.Dispose()
        completed(status, id, error)
    }

    protected override func Dispose(disposing bool) {
        if disposing {
            Complete(2)
        }
        base.Dispose(disposing)
    }

    func OnViewAttachedToWindow(attachedView View?) { }

    func OnViewDetachedFromWindow(detachedView View?) -> Complete(2)

    func OnActivityDestroyed(destroyed Activity) {
        if object.ReferenceEquals(destroyed, activity) {
            Complete(2)
        }
    }

    func OnActivityCreated(created Activity, state Bundle?) { }

    func OnActivityStarted(started Activity) { }

    func OnActivityResumed(resumed Activity) { }

    func OnActivityPaused(paused Activity) { }

    func OnActivityStopped(stopped Activity) { }

    func OnActivitySaveInstanceState(saved Activity, state Bundle) { }

    shared {
        internal func Show(
            owner Goo.Window,
            title string,
            message string,
            icon int32,
            ids[]int32,
            labels[]string,
            completed(int32, int32, string) -> void
        ) IDisposable? {
            let view GooView? = GooView.TryGetNativeOwner(owner)
            var context = view?.Context
            while context is ContextWrapper wrapper && !(context is Activity) {
                context = wrapper.BaseContext
            }
            if view == nil || context is not Activity activity || activity.IsFinishing || activity.IsDestroyed {
                completed(2, -1, "The Android owner is no longer available")
                return nil
            }
            let session = NativeMessageBox(view, activity, completed)
            try {
                view.AddOnAttachStateChangeListener(session)
                activity.Application!!.RegisterActivityLifecycleCallbacks(session)
                using let builder = AlertDialog.Builder(activity)
                builder.SetTitle(title)
                builder.SetMessage(message)
                builder.SetIcon(
                    switch icon {
                        case 1: Android.Resource.Drawable.IcDialogAlert
                        case 2: Android.Resource.Drawable.IcDialogAlert
                        default: Android.Resource.Drawable.IcDialogInfo
                    }
                )
                builder.SetPositiveButton(labels[0], (_ object?, _ DialogClickEventArgs) -> session.Complete(0, ids[0]))
                if ids.Length > 1 {
                    builder.SetNegativeButton(
                        labels[1],
                        (_ object?, _ DialogClickEventArgs) -> session.Complete(0, ids[1])
                    )
                }
                if ids.Length > 2 {
                    builder.SetNeutralButton(
                        labels[2],
                        (_ object?, _ DialogClickEventArgs) -> session.Complete(0, ids[2])
                    )
                }
                session.dialog = builder.Create() ??
                    throw InvalidOperationException("Android did not create the message box")
                session.dialog!!.CancelEvent += (_ object?, _ EventArgs) -> session.Complete(1)
                session.dialog!!.DismissEvent += (_ object?, _ EventArgs) -> session.Complete(1)
                session.dialog!!.Show()
                return session
            } catch (error SystemException_2) {
                session.Complete(3, error: error.Message)
                IDisposable(session).Dispose()
                return nil
            }
        }
    }
}
