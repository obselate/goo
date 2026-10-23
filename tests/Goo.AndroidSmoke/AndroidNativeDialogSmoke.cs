using Android.Util;
using Goo;
using Goo.Android;

namespace GooAndroidSmokeApp;

internal static class AndroidNativeDialogSmoke
{
    internal static async Task Run(GooView view)
    {
        try
        {
            var owner = view.Window;
            MessageBoxOptions Options(params MessageBoxButton[] buttons) => new()
            {
                Title = "Goo native dialog smoke",
                Message = "Native AlertDialog verification",
                Buttons = buttons
            };
            var choose = new MessageBoxButton { Id = 17, Text = "CHOOSE17" };
            var cancel = new MessageBoxButton { Id = 29, Text = "CANCEL29" };
            var options = Options(choose, cancel);
            Log.Info("GooNativeDialogs", "stage:choose17");
            var result = await NativeDialogs.ShowMessageBoxAsync(owner, options);
            Require(result, MessageBoxStatus.Success, 17);
            Log.Info("GooNativeDialogs", "stage:cancel29");
            result = await NativeDialogs.ShowMessageBoxAsync(owner, options);
            Require(result, MessageBoxStatus.Success, 29);
            Log.Info("GooNativeDialogs", "stage:back");
            result = await NativeDialogs.ShowMessageBoxAsync(owner, options);
            Require(result, MessageBoxStatus.Cancelled);
            result = await NativeDialogs.ShowMessageBoxAsync(owner,
                Options(choose, cancel, new() { Id = 3, Text = "Three" }, new() { Id = 4, Text = "Four" }));
            Require(result, MessageBoxStatus.Unsupported);
            result = await NativeDialogs.ShowMessageBoxAsync(owner,
                Options(new MessageBoxButton { Id = 5, Text = "Default", Default = true }));
            Require(result, MessageBoxStatus.Unsupported);
            var pending = NativeDialogs.ShowMessageBoxAsync(owner, options);
            Require(await NativeDialogs.ShowMessageBoxAsync(owner, options), MessageBoxStatus.Busy);
            view.PostDelayed(owner.RequestClose, 200);
            Require(await pending, MessageBoxStatus.OwnerClosed);
            Log.Info("GooNativeDialogs", "PASS:selection,cancel-button,back,unsupported,busy,owner-close");
        }
        catch (Exception error)
        {
            Log.Error("GooNativeDialogs", "FAIL:" + error);
            throw;
        }
    }

    private static void Require(MessageBoxResult result, MessageBoxStatus status, int id = -1)
    {
        if (result.Status != status || result.ButtonId != id)
            throw new InvalidOperationException($"Expected {status}/{id}, received {result.Status}/{result.ButtonId}: {result.Error}");
    }
}
