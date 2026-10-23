using Android.App;
using Android.Content.PM;
using Goo.Android;

namespace GooStarter;

[Activity(MainLauncher = true, Exported = true, LaunchMode = LaunchMode.SingleTop,
    ConfigurationChanges = ConfigChanges.Orientation | ConfigChanges.ScreenSize
        | ConfigChanges.ScreenLayout | ConfigChanges.SmallestScreenSize
        | ConfigChanges.Density | ConfigChanges.KeyboardHidden)]
public sealed class MainActivity : GooActivity
{
    protected override Goo.Window CreateWindow() => StarterApplication.CreateWindow();
}
