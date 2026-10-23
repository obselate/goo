using Android.App;
using Android.Content.PM;
using Goo.Android;
using GooAndroidSmoke;

namespace GooAndroidSmokeApp;

[Activity(Name = "org.goo.androidsmoke.MainActivity", Label = "Goo Vulkan smoke", MainLauncher = true, Exported = true,
    ConfigurationChanges = ConfigChanges.Orientation | ConfigChanges.ScreenSize | ConfigChanges.ScreenLayout
        | ConfigChanges.SmallestScreenSize | ConfigChanges.Density | ConfigChanges.KeyboardHidden)]
public sealed class MainActivity : GooActivity
{
    private bool inputSmokeStarted;
    private bool menuSmokeStarted;
    private bool clipboardSmokeStarted;

    internal GooView NativeView => GooView;

    protected override Goo.Window CreateWindow() => Intent?.GetBooleanExtra("goo.gesture_smoke", false) == true
        ? new Goo.Window { Root = new GestureCheckScene(), Background = Goo.Color.Rgb(17, 24, 39) }
        : SmokeApplication.CreateWindow();

    protected override void OnResume()
    {
        base.OnResume();
        if (!inputSmokeStarted && Intent?.GetBooleanExtra("goo.input_smoke", false) == true)
        {
            inputSmokeStarted = true;
            GooView.PostDelayed(() => RunInputSmoke(0), 100);
        }
        if (!menuSmokeStarted && Intent?.GetBooleanExtra("goo.native_menu_smoke", false) == true)
        {
            menuSmokeStarted = true;
            GooView.PostDelayed(() => RunMenuSmoke(0), 100);
        }
    }

    protected override void OnDestroy()
    {
        base.OnDestroy();
        if (Intent?.GetBooleanExtra("goo.native_menu_destroy", false) == true)
            Android.Util.Log.Info("GooNativeMenus", "activity-destroyed");
    }

    private void RunInputSmoke(int attempt)
    {
        if (AndroidInputSmoke.TryRun(GooView))
            return;
        if (attempt >= 100)
            throw new InvalidOperationException("Android input smoke did not receive a mounted editor.");
        GooView.PostDelayed(() => RunInputSmoke(attempt + 1), 100);
    }

    private void RunMenuSmoke(int attempt)
    {
        if (AndroidNativeMenuSmoke.TryRun(GooView,
            Intent?.GetBooleanExtra("goo.native_menu_destroy", false) == true ? this : null)) return;
        if (attempt >= 100) throw new InvalidOperationException("Android native menu owner did not attach.");
        GooView.PostDelayed(() => RunMenuSmoke(attempt + 1), 100);
    }

    public override void OnWindowFocusChanged(bool hasFocus)
    {
        base.OnWindowFocusChanged(hasFocus);
        if (hasFocus && !clipboardSmokeStarted && Intent?.GetBooleanExtra("goo.clipboard_smoke", false) == true)
        {
            clipboardSmokeStarted = true;
            AndroidClipboardSmoke.Run(GooView);
        }
    }
}
