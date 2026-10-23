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
    private bool externalSmokeStarted;
    private ExternalImageSmokeCell? externalScene;

    protected override Goo.Window CreateWindow()
    {
        if (Intent?.GetBooleanExtra("goo.ahb_smoke", false) != true)
            return SmokeApplication.CreateWindow();
        externalScene = new ExternalImageSmokeCell();
        return new Goo.Window { Root = externalScene, Background = Goo.Color.Black };
    }

    protected override void OnResume()
    {
        base.OnResume();
        if (!inputSmokeStarted && Intent?.GetBooleanExtra("goo.input_smoke", false) == true)
        {
            inputSmokeStarted = true;
            GooView.PostDelayed(() => RunInputSmoke(0), 100);
        }
        if (!externalSmokeStarted && externalScene is { } scene)
        {
            externalSmokeStarted = true;
            _ = AndroidExternalImageSmoke.Run(GooView, scene);
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
