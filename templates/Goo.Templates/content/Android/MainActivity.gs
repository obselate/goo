package GooStarter

import Android.App
import Android.Content.PM
import Goo.Android

@Activity(
    MainLauncher: true,
    Exported: true,
    LaunchMode: LaunchMode.SingleTop,
    ConfigurationChanges: ConfigChanges.Orientation | ConfigChanges.ScreenSize
    | ConfigChanges.ScreenLayout | ConfigChanges.SmallestScreenSize
    | ConfigChanges.Density | ConfigChanges.KeyboardHidden
)
public sealed class MainActivity : GooActivity {
    protected override func CreateWindow() Goo.Window -> StarterApplication.CreateWindow()
}
