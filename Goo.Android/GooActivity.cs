using Android.App;
using Android.Content;
using Android.OS;
using Android.Views;
using Android.Widget;

namespace Goo.Android;

public abstract class GooActivity : Activity
{
    private static bool processLaunched;
    private GooView? view;
    private InsetsListener? insets;
    private FrameLayout? content;

    /// <summary>Gets the saved activity state passed to CreateWindow, or null for a fresh activity.</summary>
    protected Bundle? SavedInstanceState { get; private set; }

    protected abstract global::Goo.Window CreateWindow();
    protected GooView GooView => view ?? throw new InvalidOperationException("The activity has not created its Goo view.");

    /// <summary>Gets the result of forwarding the most recent Android activation.</summary>
    public ActivationPostStatus LastActivationStatus { get; private set; } = ActivationPostStatus.NotInitialized;

    protected override void OnCreate(Bundle? savedInstanceState)
    {
        base.OnCreate(savedInstanceState);
        SavedInstanceState = savedInstanceState;
        if (!OperatingSystem.IsAndroidVersionAtLeast(35))
            Window!.SetDecorFitsSystemWindows(false);
        Window!.SetSoftInputMode(SoftInput.AdjustResize);
        content = new FrameLayout(this);
        view = new GooView(this, CreateWindow());
        content.AddView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MatchParent, ViewGroup.LayoutParams.MatchParent));
        insets = new InsetsListener();
        content.SetOnApplyWindowInsetsListener(insets);
        SetContentView(content);
        content.RequestApplyInsets();
        if (!processLaunched || savedInstanceState is null)
            ForwardActivation(Intent, !processLaunched);
        processLaunched = true;
    }

    protected override void OnNewIntent(Intent? intent)
    {
        base.OnNewIntent(intent);
        Intent = intent;
        ForwardActivation(intent, false);
    }

    private void ForwardActivation(Intent? intent, bool initial)
    {
        List<Uri>? documents = null;
        Uri? target = null;
        var notification = intent?.Action == "Goo.Android.Notification";
        if (!notification && Uri.TryCreate(intent?.DataString, UriKind.Absolute, out var data))
        {
            if (data.Scheme is "content" or "file")
                (documents ??= []).Add(data);
            else
                target = data;
        }
        if (!notification && intent?.ClipData is { } clips)
        {
            for (var i = 0; i < clips.ItemCount; i++)
            {
                if (Uri.TryCreate(clips.GetItemAt(i)?.Uri?.ToString(), UriKind.Absolute, out var document)
                    && documents?.Contains(document) != true)
                    (documents ??= []).Add(document);
            }
        }
        var activation = new ApplicationActivation
        {
            Kind = notification ? ApplicationActivationKind.Notification
                : documents is not null ? ApplicationActivationKind.OpenDocuments
                : target is not null ? ApplicationActivationKind.OpenUri : ApplicationActivationKind.Launch,
            IsInitial = initial,
            Target = documents is null ? target : null,
            Documents = documents is null ? Array.Empty<Uri>() : documents,
            NotificationId = notification ? intent?.GetStringExtra("Goo.NotificationId") ?? "" : "",
            ActionId = notification ? intent?.GetStringExtra("Goo.ActionId") ?? "" : "",
            Payload = notification ? intent?.GetStringExtra("Goo.Payload") ?? "" : ""
        };
        LastActivationStatus = global::Goo.Window.PostApplicationActivation(activation);
        if (LastActivationStatus is ActivationPostStatus.NotInitialized or ActivationPostStatus.Closed)
            LastActivationStatus = global::Goo.Window.InitializeApplicationActivation(activation)
                == WindowOperationResult.Accepted
                ? ActivationPostStatus.Accepted : ActivationPostStatus.TooLarge;
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
        content?.SetOnApplyWindowInsetsListener(null);
        if (view is { } current && current.Parent is ViewGroup parent) parent.RemoveView(current);
        view?.Dispose();
        view = null;
        content = null;
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
