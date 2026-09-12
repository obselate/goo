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

    protected override Goo.Window CreateWindow() => SmokeApplication.CreateWindow();

    protected override void OnResume()
    {
        base.OnResume();
        if (!inputSmokeStarted && Intent?.GetBooleanExtra("goo.input_smoke", false) == true)
        {
            inputSmokeStarted = true;
            GooView.PostDelayed(() => RunInputSmoke(0), 100);
        }
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
