using Android.App;
using Android.Content.PM;
using Goo.Android;
using GooAndroidSmoke;

namespace GooAndroidSmokeApp;

[Activity(Label = "Goo Vulkan smoke", MainLauncher = true, Exported = true,
    ConfigurationChanges = ConfigChanges.Orientation | ConfigChanges.ScreenSize | ConfigChanges.ScreenLayout
        | ConfigChanges.SmallestScreenSize | ConfigChanges.Density | ConfigChanges.KeyboardHidden)]
public sealed class MainActivity : GooActivity
{
    private bool inputSmokeStarted;
    private bool nativeDialogSmokeStarted;

    protected override Goo.Window CreateWindow() => SmokeApplication.CreateWindow();

    protected override void OnResume()
    {
        base.OnResume();
        if (!inputSmokeStarted && Intent?.GetBooleanExtra("goo.input_smoke", false) == true)
        {
            inputSmokeStarted = true;
            GooView.PostDelayed(() => RunInputSmoke(0), 100);
        }
        if (!nativeDialogSmokeStarted && Intent?.GetBooleanExtra("goo.native_dialogs_smoke", false) == true)
        {
            nativeDialogSmokeStarted = true;
            GooView.PostDelayed(() => RunNativeDialogSmoke(0), 100);
        }
    }

    private async void RunNativeDialogSmoke(int attempt)
    {
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
        if (AndroidInputSmoke.TryRun(GooView))
            return;
        if (attempt >= 100)
            throw new InvalidOperationException("Android input smoke did not receive a mounted editor.");
        GooView.PostDelayed(() => RunInputSmoke(attempt + 1), 100);
    }
}
