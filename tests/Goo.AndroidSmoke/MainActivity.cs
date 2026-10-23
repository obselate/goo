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
    private bool nativeDialogSmokeStarted;
    private bool popupSmokeStarted;
    internal GooView NativeView => GooView;

    protected override Goo.Window CreateWindow() => Intent?.GetBooleanExtra("goo.gesture_smoke", false) == true
        ? new Goo.Window { Root = new GestureCheckScene(), Background = Goo.Color.Rgb(17, 24, 39) }
        : SmokeApplication.CreateWindow();

    protected override void OnResume()
    {
        base.OnResume();
        if (!popupSmokeStarted && Intent?.GetBooleanExtra("goo.popup_smoke", false) == true)
        {
            popupSmokeStarted = true;
            GooView.PostDelayed(() => RunPopupSmoke(0), 100);
        }
        else if (!inputSmokeStarted && Intent?.GetBooleanExtra("goo.input_smoke", false) == true)
        {
            inputSmokeStarted = true;
            GooView.PostDelayed(() => RunInputSmoke(0), 100);
        }
        if (!nativeDialogSmokeStarted && Intent?.GetBooleanExtra("goo.native_dialogs_smoke", false) == true)
        {
            nativeDialogSmokeStarted = true;
            GooView.PostDelayed(() => RunNativeDialogSmoke(0), 100);
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

    private async void RunNativeDialogSmoke(int attempt)
    {
        if (IsFinishing || IsDestroyed) return;
        if (!GooView.Window.IsVisible)
        {
            if (attempt >= 100)
                throw new InvalidOperationException("Android native dialog smoke did not receive a visible owner.");
            GooView.PostDelayed(() => RunNativeDialogSmoke(attempt + 1), 100);
            return;
        }
        await AndroidNativeDialogSmoke.Run(GooView);
    }

    private void RunInputSmoke(int attempt)
    {
        if (IsFinishing || IsDestroyed) return;
        if (AndroidInputSmoke.TryRun(GooView))
            return;
        if (attempt >= 100)
            throw new InvalidOperationException("Android input smoke did not receive a mounted editor.");
        GooView.PostDelayed(() => RunInputSmoke(attempt + 1), 100);
    }

    private void RunMenuSmoke(int attempt)
    {
        if (IsFinishing || IsDestroyed) return;
        if (AndroidNativeMenuSmoke.TryRun(GooView,
            Intent?.GetBooleanExtra("goo.native_menu_destroy", false) == true ? this : null)) return;
        if (attempt >= 100) throw new InvalidOperationException("Android native menu owner did not attach.");
        GooView.PostDelayed(() => RunMenuSmoke(attempt + 1), 100);
    }

    private void RunPopupSmoke(int attempt)
    {
        if (IsFinishing || IsDestroyed) return;
        if (AndroidPopupSmoke.TryRun(GooView))
            return;
        if (attempt >= 100)
            throw new InvalidOperationException("Android popup smoke did not receive a presentation surface.");
        GooView.PostDelayed(() => RunPopupSmoke(attempt + 1), 100);
    }
}
