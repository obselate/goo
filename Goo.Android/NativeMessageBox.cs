using Android.App;
using Android.Content;
using Android.OS;
using Android.Views;

namespace Goo.Android;

internal sealed class NativeMessageBox : Java.Lang.Object, View.IOnAttachStateChangeListener,
    Application.IActivityLifecycleCallbacks
{
    private readonly GooView view;
    private readonly Activity activity;
    private readonly Action<int, int, string> completed;
    private AlertDialog? dialog;
    private bool finished;

    private NativeMessageBox(GooView view, Activity activity, Action<int, int, string> completed)
    {
        this.view = view;
        this.activity = activity;
        this.completed = completed;
    }

    internal static IDisposable? Show(global::Goo.Window owner, string title, string message, int icon,
        int[] ids, string[] labels, Action<int, int, string> completed)
    {
        var view = GooView.TryGetNativeOwner(owner);
        var context = view?.Context;
        while (context is ContextWrapper wrapper && context is not Activity)
            context = wrapper.BaseContext;
        if (view is null || context is not Activity activity || activity.IsFinishing || activity.IsDestroyed)
        {
            completed(2, -1, "The Android owner is no longer available");
            return null;
        }
        var session = new NativeMessageBox(view, activity, completed);
        try
        {
            view.AddOnAttachStateChangeListener(session);
            activity.Application!.RegisterActivityLifecycleCallbacks(session);
            using var builder = new AlertDialog.Builder(activity);
            builder.SetTitle(title);
            builder.SetMessage(message);
            builder.SetIcon(icon switch
            {
                1 => global::Android.Resource.Drawable.IcDialogAlert,
                2 => global::Android.Resource.Drawable.IcDialogAlert,
                _ => global::Android.Resource.Drawable.IcDialogInfo
            });
            builder.SetPositiveButton(labels[0], (_, _) => session.Complete(0, ids[0]));
            if (ids.Length > 1)
                builder.SetNegativeButton(labels[1], (_, _) => session.Complete(0, ids[1]));
            if (ids.Length > 2)
                builder.SetNeutralButton(labels[2], (_, _) => session.Complete(0, ids[2]));
            session.dialog = builder.Create();
            session.dialog.CancelEvent += (_, _) => session.Complete(1);
            session.dialog.DismissEvent += (_, _) => session.Complete(1);
            session.dialog.Show();
            return session;
        }
        catch (Exception error)
        {
            session.Complete(3, error: error.Message);
            session.Dispose();
            return null;
        }
    }

    private void Complete(int status, int id = -1, string error = "")
    {
        if (finished)
            return;
        finished = true;
        if (activity.IsFinishing || activity.IsDestroyed || !ReferenceEquals(GooView.TryGetNativeOwner(view.Window), view))
        {
            status = 2;
            id = -1;
        }
        view.RemoveOnAttachStateChangeListener(this);
        activity.Application!.UnregisterActivityLifecycleCallbacks(this);
        var current = dialog;
        dialog = null;
        current?.Dismiss();
        current?.Dispose();
        completed(status, id, error);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
            Complete(2);
        base.Dispose(disposing);
    }

    public void OnViewAttachedToWindow(View? attachedView) { }
    public void OnViewDetachedFromWindow(View? detachedView) => Complete(2);
    public void OnActivityDestroyed(Activity destroyed)
    {
        if (ReferenceEquals(destroyed, activity))
            Complete(2);
    }
    public void OnActivityCreated(Activity created, Bundle? state) { }
    public void OnActivityStarted(Activity started) { }
    public void OnActivityResumed(Activity resumed) { }
    public void OnActivityPaused(Activity paused) { }
    public void OnActivityStopped(Activity stopped) { }
    public void OnActivitySaveInstanceState(Activity saved, Bundle state) { }
}
