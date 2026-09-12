using Android.App;
using Android.OS;
using Android.Views;
using Android.Widget;

namespace Goo.Android;

public abstract class GooActivity : Activity
{
    private GooView? view;
    private InsetsListener? insets;

    protected abstract global::Goo.Window CreateWindow();
    protected GooView GooView => view ?? throw new InvalidOperationException("The activity has not created its Goo view.");

    protected override void OnCreate(Bundle? savedInstanceState)
    {
        base.OnCreate(savedInstanceState);
        if (!OperatingSystem.IsAndroidVersionAtLeast(35))
            Window!.SetDecorFitsSystemWindows(false);
        Window!.SetSoftInputMode(SoftInput.AdjustResize);
        var content = new FrameLayout(this);
        view = new GooView(this, CreateWindow());
        content.AddView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MatchParent, ViewGroup.LayoutParams.MatchParent));
        insets = new InsetsListener();
        content.SetOnApplyWindowInsetsListener(insets);
        SetContentView(content);
        content.RequestApplyInsets();
    }

    protected override void OnResume()
    {
        base.OnResume();
        view?.Resume();
    }

    protected override void OnPause()
    {
        view?.Pause();
        base.OnPause();
    }

    protected override void OnDestroy()
    {
        view?.Dispose();
        view = null;
        insets?.Dispose();
        insets = null;
        base.OnDestroy();
    }

    private sealed class InsetsListener : Java.Lang.Object, View.IOnApplyWindowInsetsListener
    {
        public WindowInsets OnApplyWindowInsets(View? target, WindowInsets? value)
        {
            ArgumentNullException.ThrowIfNull(value);
            var safe = value.GetInsets(WindowInsets.Type.SystemBars() | WindowInsets.Type.DisplayCutout() | WindowInsets.Type.Ime());
            target?.SetPadding(safe.Left, safe.Top, safe.Right, safe.Bottom);
            return value;
        }
    }
}
